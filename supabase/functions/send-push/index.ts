// EuroKink — envoi des notifications (toutes les 10 min + bouton « tester »)
// 1. prépare les notifications dues (rappels, billetteries, organisateurs suivis, admin)
// 2. les chiffre et les envoie à chaque téléphone abonné (Web Push, gratuit)
import { createClient } from "npm:@supabase/supabase-js@2";
import { b64u, sendPush } from "./webpush.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUBJECT = "mailto:contact@eurokink.eu";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Clés VAPID : créées une seule fois, gardées dans le coffre de la base
async function vapid(): Promise<JsonWebKey> {
  const { data } = await sb.from("app_secrets").select("value").eq("key", "vapid").maybeSingle();
  if (data) return data.value.jwk;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = b64u.enc(await crypto.subtle.exportKey("raw", kp.publicKey));
  await sb.from("app_secrets").upsert({ key: "vapid", value: { jwk, public: pub } }, { onConflict: "key", ignoreDuplicates: true });
  const { data: again } = await sb.from("app_secrets").select("value").eq("key", "vapid").single();
  return again!.value.jwk;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const jwk = await vapid();
  const { data: queued, error: qErr } = await sb.rpc("queue_notifications");
  if (qErr) return json({ error: qErr.message }, 500);

  // Réservation atomique : deux envois simultanés ne prennent jamais la même notification
  const { data: items } = await sb.rpc("claim_push_batch", { p_limit: 300 });
  if (!items?.length) return json({ queued, sent: 0 });
  const users = [...new Set(items.map((i) => i.user_id))];
  const { data: subs } = await sb.from("push_subscriptions").select("*").in("user_id", users);

  let sent = 0, gone = 0;
  for (const it of items) {
    const mine = (subs ?? []).filter((s) => s.user_id === it.user_id);
    let delivered = mine.length === 0; // personne à prévenir : on clôt
    let lastErr = "";
    for (const s of mine) {
      try {
        const r = await sendPush(s, { title: it.title, body: it.body, url: it.url, tag: it.tag }, jwk, SUBJECT);
        if (r.status === 404 || r.status === 410) { await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint); gone++; }
        else if (r.ok) { delivered = true; sent++; await sb.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("endpoint", s.endpoint); }
        else lastErr = `${r.status} ${(await r.text()).slice(0, 200)}`;
      } catch (e) { lastErr = (e as Error).message; }
    }
    await sb.from("push_outbox").update(delivered || !lastErr
      ? { sent_at: new Date().toISOString(), last_error: lastErr || null }
      : { attempts: it.attempts + 1, last_error: lastErr, claimed_at: null }).eq("id", it.id);
  }
  return json({ queued, sent, gone });
});
