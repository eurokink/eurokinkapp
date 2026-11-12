// EuroKink — robot d'import gratuit
// Lit chaque source active (agenda iCal, données structurées schema.org, WordPress « The Events Calendar »),
// géolocalise les lieux (service gratuit de l'IGN) et envoie les soirées trouvées dans la file de validation.
// Lancement : chaque jour (planification Postgres) ou par l'admin depuis l'appli.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const UA = "EuroKinkBot/1.0 (+https://eurokink.github.io/eurokinkapp/; contact@eurokink.eu)";
const COOLDOWN_H = 5;

type Ev = {
  external_id: string; title: string; description?: string; starts_at: string; ends_at?: string;
  venue_name?: string; address?: string; postal_code?: string; city?: string; latitude?: number; longitude?: number;
  location_text?: string; country?: string; price?: number | null; ticket_url?: string; image?: string; organizer_name?: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clean = (s: unknown) => String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "’").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

// Heure locale de Paris -> ISO UTC
function parisToIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(guess)).reduce((a: Record<string, string>, p) => { a[p.type] = p.value; return a; }, {});
  const asParis = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asParis - guess)).toISOString();
}
// Date ISO sans fuseau (« 2026-11-28T19:00 ») = heure de Paris
function normDate(v: unknown): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) { const t = new Date(s); return isNaN(+t) ? undefined : t.toISOString(); }
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?/);
  return m ? parisToIso(+m[1], +m[2], +m[3], +(m[4] ?? 20), +(m[5] ?? 0), +(m[6] ?? 0)) : undefined;
}

// ---- iCal -------------------------------------------------------------------
function parseIcal(text: string): Ev[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: Ev[] = []; let cur: Record<string, { v: string; p: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur) {
        const g = (k: string) => cur![k]?.v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1") ?? "";
        const dt = (k: string) => {
          const e = cur![k]; if (!e) return undefined;
          const m = e.v.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?/); if (!m) return undefined;
          if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toISOString();
          return parisToIso(+m[1], +m[2], +m[3], +(m[4] ?? 20), +(m[5] ?? 0), +(m[6] ?? 0));
        };
        const geo = g("GEO").split(/[;,]/).map(Number);
        const start = dt("DTSTART");
        if (start) out.push({
          external_id: g("UID") || `${g("SUMMARY")}|${start}`, title: clean(g("SUMMARY")), description: clean(g("DESCRIPTION")),
          starts_at: start, ends_at: dt("DTEND"), location_text: clean(g("LOCATION")), ticket_url: g("URL") || undefined,
          latitude: geo.length === 2 && !isNaN(geo[0]) ? geo[0] : undefined, longitude: geo.length === 2 && !isNaN(geo[1]) ? geo[1] : undefined,
          image: (cur["ATTACH"]?.v.match(/^https:\/\/\S+\.(jpe?g|png|webp)/i) || [])[0],
        });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(";");
    cur[name.toUpperCase()] = { v: line.slice(i + 1), p: params.join(";") };
  }
  return out;
}

// ---- Données structurées schema.org (JSON-LD) ---------------------------------
function parseJsonLd(html: string, pageUrl: string): Ev[] {
  const found: Record<string, unknown>[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const o = n as Record<string, unknown>;
    const t = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    if (t.some((x) => /Event$/.test(x))) found.push(o);
    ["@graph", "itemListElement", "item", "subEvent", "event", "events"].forEach((k) => walk(o[k]));
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* bloc illisible */ }
  }
  return found.map((o) => {
    const loc = ([] as any[]).concat(o.location ?? [])[0] ?? {};
    const addr = typeof loc.address === "string" ? { streetAddress: loc.address } : (loc.address ?? {});
    const offer = ([] as any[]).concat(o.offers ?? [])[0] ?? {};
    const img = ([] as any[]).concat(o.image ?? [])[0];
    const org = ([] as any[]).concat(o.organizer ?? [])[0];
    const start = normDate(o.startDate);
    return {
      external_id: String(o.url || o["@id"] || `${o.name}|${o.startDate}`), title: clean(o.name), description: clean(o.description),
      starts_at: start!, ends_at: normDate(o.endDate),
      venue_name: clean(loc.name), address: clean(addr.streetAddress), postal_code: clean(addr.postalCode), city: clean(addr.addressLocality),
      country: clean(typeof addr.addressCountry === "object" ? addr.addressCountry?.name : addr.addressCountry),
      latitude: loc.geo?.latitude != null ? Number(loc.geo.latitude) : undefined, longitude: loc.geo?.longitude != null ? Number(loc.geo.longitude) : undefined,
      price: offer.price != null && offer.price !== "" ? Number(String(offer.price).replace(",", ".")) : null,
      ticket_url: String(offer.url || o.url || pageUrl), image: typeof img === "string" ? img : img?.url,
      organizer_name: typeof org === "string" ? org : clean(org?.name),
    } as Ev;
  }).filter((e) => e.starts_at && e.title);
}

// ---- WordPress « The Events Calendar » ---------------------------------------
async function readTribe(base: string): Promise<Ev[]> {
  const root = base.replace(/\/+$/, "").replace(/\/wp-json.*$/, "");
  const r = await fetch(`${root}/wp-json/tribe/events/v1/events?per_page=50&start_date=now`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`WordPress : erreur ${r.status}`);
  const data = await r.json();
  return (data.events ?? []).map((e: any) => {
    const v = Array.isArray(e.venue) ? e.venue[0] ?? {} : e.venue ?? {};
    const cost = String(e.cost ?? "").match(/\d+(?:[.,]\d+)?/);
    return {
      external_id: String(e.id ?? e.url), title: clean(e.title), description: clean(e.description),
      starts_at: e.utc_start_date ? new Date(e.utc_start_date.replace(" ", "T") + "Z").toISOString() : normDate(e.start_date)!,
      ends_at: e.utc_end_date ? new Date(e.utc_end_date.replace(" ", "T") + "Z").toISOString() : normDate(e.end_date),
      venue_name: clean(v.venue), address: clean(v.address), postal_code: clean(v.zip), city: clean(v.city), country: clean(v.country),
      latitude: v.geo_lat ? Number(v.geo_lat) : undefined, longitude: v.geo_lng ? Number(v.geo_lng) : undefined,
      price: e.cost === "" || e.cost == null ? null : /gratuit|free/i.test(String(e.cost)) ? 0 : cost ? Number(cost[0].replace(",", ".")) : null,
      ticket_url: e.website || e.url, image: e.image?.url,
    } as Ev;
  });
}

// ---- Géolocalisation gratuite (Géoplateforme IGN) -------------------------------
const geoCache = new Map<string, any>();
async function geocode(q: string) {
  const key = q.toLowerCase().trim();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  let res = null;
  try {
    const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=1`, { headers: { "User-Agent": UA } });
    if (r.ok) {
      const f = (await r.json()).features?.[0];
      if (f && (f.properties?.score ?? 0) > 0.4) {
        const p = f.properties; const [lon, lat] = f.geometry.coordinates;
        res = { lat, lon, city: p.city || p.name, postal_code: p.postcode, address: p.type === "municipality" ? "" : p.name };
      }
    }
  } catch { /* service indisponible */ }
  geoCache.set(key, res);
  return res;
}

async function reverse(lat: number, lon: number) {
  try {
    const r = await fetch(`https://data.geopf.fr/geocodage/reverse?lat=${lat}&lon=${lon}&limit=1`, { headers: { "User-Agent": UA } });
    const f = r.ok ? (await r.json()).features?.[0] : null;
    return f ? { city: f.properties.city, postal_code: f.properties.postcode } : null;
  } catch { return null; }
}

// Titre du type « Soirée X - LIEU - 18 Mar 17 22:00 » -> « Soirée X »
function tidyTitle(title: string, venue?: string): string {
  let t = title.replace(/\s+-\s+\d{1,2}\s+\S+\s+\d{2,4}\s+\d{1,2}[:h]\d{2}\s*$/, "");
  if (venue) t = t.replace(new RegExp(`\\s+-\\s+${venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
  return t.replace(/(\s+-\s*)+$/, "").replace(/\s{2,}/g, " ").trim() || title;
}

async function locate(e: Ev, fallbackCity?: string): Promise<Ev | null> {
  if (e.country && !/^(fr|fra|france)$/i.test(e.country.trim())) return null;
  const parts = (e.location_text || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!e.venue_name && parts.length) e.venue_name = parts[0];
  if (!e.postal_code) { const m = (e.location_text || "").match(/\b\d{5}\b/); if (m) e.postal_code = m[0]; }
  if (parts.length && parts.some((x) => /^(belgi|belgium|deutschland|germany|espa|spain|nederland|netherlands|uk|united kingdom|suisse|switzerland)/i.test(x))) return null;
  e.title = tidyTitle(e.title, e.venue_name);
  if (e.latitude != null && e.longitude != null && !isNaN(e.latitude) && !isNaN(e.longitude)) {
    if (!e.city) { const g = await reverse(e.latitude, e.longitude); if (g) { e.city = g.city; e.postal_code ||= g.postal_code; } }
    if (!e.city) e.city = (parts.length > 2 ? parts[2] : "") || fallbackCity || "";
    if (!e.address && parts.length > 1) e.address = parts[1];
    return e.city ? e : null;
  }
  const q = [e.address, e.postal_code, e.city].filter(Boolean).join(" ") || e.location_text || "";
  const g = (q ? await geocode(q) : null) ?? (e.city ? await geocode(e.city) : null)
    ?? (fallbackCity ? await geocode(fallbackCity) : null);
  if (!g) return null;
  return { ...e, latitude: g.lat, longitude: g.lon, city: e.city || g.city, postal_code: e.postal_code || g.postal_code,
    address: e.address || g.address, venue_name: e.venue_name || (e.location_text ? e.location_text.split(",")[0] : g.city) };
}

async function readSource(src: any): Promise<Ev[]> {
  if (src.kind === "tribe") return readTribe(src.url);
  const r = await fetch(src.url, { headers: { "User-Agent": UA, Accept: src.kind === "ical" ? "text/calendar,*/*" : "text/html,*/*" } });
  if (!r.ok) throw new Error(`le site a répondu ${r.status}`);
  const text = await r.text();
  return src.kind === "ical" ? parseIcal(text) : parseJsonLd(text, src.url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  // L'admin peut lancer à tout moment ; sinon un passage toutes les 5 h au maximum
  let admin = false;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token && token.split(".").length === 3) {
    const { data } = await sb.auth.getUser(token);
    if (data?.user) {
      const { data: p } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      admin = p?.role === "admin";
    }
  }
  const { data: last } = await sb.from("app_settings").select("value").eq("key", "import_last_run").maybeSingle();
  if (!admin && last && Date.now() - new Date(last.value as string).getTime() < COOLDOWN_H * 3600e3) return json({ skipped: "trop tôt" }, 429);
  await sb.from("app_settings").upsert({ key: "import_last_run", value: new Date().toISOString() });

  const body = await req.json().catch(() => ({}));
  let q = sb.from("import_sources").select("*, organizer:organizers(city)").eq("is_active", true);
  if (body?.source_id) q = q.eq("id", body.source_id);
  const { data: sources } = await q;
  const report: unknown[] = [];
  for (const src of sources ?? []) {
    let found = 0, added = 0; const reasons: Record<string, number> = {}; let error = ""; const samples: unknown[] = [];
    try {
      const now = Date.now();
      const list = (await readSource(src)).filter((e) => new Date(e.starts_at).getTime() > now)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      found = list.length;
      for (const raw of list.slice(0, 60)) {
        const before = { title: raw.title, lieu: raw.location_text || [raw.venue_name, raw.address, raw.city].filter(Boolean).join(", "), lat: raw.latitude, lon: raw.longitude };
        const e = await locate({ ...raw }, src.organizer?.city || undefined);
        if (samples.length < 3) samples.push({ ...before, ville: e?.city ?? null });
        let r = "hors France ou lieu introuvable";
        if (e) {
          const { data, error: err } = await sb.rpc("import_event", { p_source: src.id, p: e });
          r = err ? `erreur : ${err.message}` : String(data);
        }
        reasons[r] = (reasons[r] ?? 0) + 1;
        if (r === "ajoutée") added++;
      }
      if (!found) error = "aucune soirée à venir trouvée sur cette page";
    } catch (err) { error = (err as Error).message || String(err); }
    await sb.rpc("import_finish", { p_source: src.id, p_found: found, p_added: added, p_error: error || null });
    report.push({ source: src.name, found, added, reasons, error: error || undefined, samples });
  }
  return json({ ok: true, report });
});
