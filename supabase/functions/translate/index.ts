// EuroKink — traduction automatique des textes écrits par les membres et organisateurs
// (descriptions de soirées, dress code, présentations). Chaque texte n'est traduit qu'une fois par langue :
// le résultat est gardé dans la table « translations ».
// Service : DeepL si la clé DEEPL_API_KEY est enregistrée dans les secrets Supabase, sinon MyMemory (gratuit, sans clé).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const LANGS = ["fr", "en", "de"];
const DEEPL = Deno.env.get("DEEPL_API_KEY") || "";

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Langue d'origine devinée à partir des mots les plus courants (fr, en, de ; sinon « autre »)
const WORDS: Record<string, string[]> = {
  fr: ["le", "la", "les", "des", "et", "est", "une", "pour", "avec", "dans", "sur", "pas", "vous", "nous", "du", "au", "soirée", "ou"],
  en: ["the", "and", "is", "with", "for", "you", "your", "to", "of", "in", "on", "at", "night", "party", "our", "are", "be"],
  de: ["der", "die", "das", "und", "ist", "mit", "für", "ein", "eine", "nicht", "auf", "den", "dem", "wir", "ihr", "zu", "im", "bei"],
};
function detect(text: string): string {
  const w = text.toLowerCase().match(/[a-zäöüßàâçéèêëîïôûùœ]+/g) || [];
  let best = "other", score = 0;
  for (const [l, list] of Object.entries(WORDS)) {
    const s = w.filter((x) => list.includes(x)).length;
    if (s > score) { score = s; best = l; }
  }
  return score >= 1 ? best : "other";
}

// MyMemory accepte 500 octets par requête : découpage par phrases
function chunks(text: string, max = 450): string[] {
  const out: string[] = []; let cur = "";
  for (const part of text.split(/(?<=[.!?\n])\s+/)) {
    if (new TextEncoder().encode(cur + " " + part).length > max && cur) { out.push(cur); cur = part; }
    else cur = cur ? `${cur} ${part}` : part;
    while (new TextEncoder().encode(cur).length > max) { out.push(cur.slice(0, 200)); cur = cur.slice(200); }
  }
  if (cur) out.push(cur);
  return out;
}
async function myMemory(text: string, from: string, to: string): Promise<string | null> {
  const parts: string[] = [];
  for (const c of chunks(text)) {
    const src = from === "other" ? "autodetect" : from;
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(c)}&langpair=${src}|${to}&de=contact@eurokink.eu`);
    if (!r.ok) return null;
    const d = await r.json();
    const t = d?.responseData?.translatedText;
    if (!t || d.responseStatus !== 200 || /MYMEMORY WARNING|INVALID LANGUAGE/i.test(t)) return null;
    parts.push(t);
  }
  return parts.join(" ");
}
async function deepl(texts: string[], to: string): Promise<(string | null)[]> {
  const host = DEEPL.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const r = await fetch(`https://${host}/v2/translate`, {
    method: "POST", headers: { Authorization: `DeepL-Auth-Key ${DEEPL}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts, target_lang: to === "en" ? "EN-GB" : to.toUpperCase() }),
  });
  if (!r.ok) return texts.map(() => null);
  const d = await r.json();
  return (d.translations || []).map((x: any) => x.text ?? null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const to = String(body.target || "");
  const texts: string[] = Array.isArray(body.texts) ? body.texts.filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 30).map((x: string) => x.slice(0, 4000)) : [];
  if (!LANGS.includes(to) || !texts.length) return json({ translations: {} });

  const hashes = await Promise.all(texts.map(sha));
  const { data: cached } = await sb.from("translations").select("src_hash, text").eq("lang", to).in("src_hash", hashes);
  const known = new Map<string, string>((cached || []).map((r: any) => [r.src_hash, r.text]));
  const out: Record<string, string> = {};
  const todo: { text: string; hash: string; from: string }[] = [];
  texts.forEach((t, i) => {
    const h = hashes[i];
    if (known.has(h)) { out[t] = known.get(h)!; return; }
    const from = detect(t);
    if (from === to) { out[t] = t; todo.push({ text: t, hash: h, from: "same" }); return; }
    todo.push({ text: t, hash: h, from });
  });

  const rows: unknown[] = [];
  const need = todo.filter((x) => x.from !== "same");
  let results: (string | null)[] = [];
  if (DEEPL && need.length) results = await deepl(need.map((x) => x.text), to);
  for (let i = 0; i < need.length; i++) {
    const x = need[i];
    const r = results[i] ?? await myMemory(x.text, x.from, to);
    if (r) { out[x.text] = r; rows.push({ src_hash: x.hash, lang: to, src_lang: x.from, text: r }); }
  }
  todo.filter((x) => x.from === "same").forEach((x) => rows.push({ src_hash: x.hash, lang: to, src_lang: to, text: x.text }));
  if (rows.length) await sb.from("translations").upsert(rows, { onConflict: "src_hash,lang" });
  return json({ translations: out });
});
