// Webhook Stripe : enregistre les dons faits via les liens de paiement EuroKink.
// Le secret de signature (STRIPE_WEBHOOK_SECRET) est saisi par l'administrateur dans Supabase : il ne figure pas ici.
const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const enc = new TextEncoder();
async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function verify(body: string, header: string | null) {
  if (!SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const all = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const expected = await hmacHex(SECRET, `${t}.${body}`);
  return all.some((s) => safeEq(s, expected));
}
async function record(args: Record<string, unknown>) {
  const r = await fetch(`${URL_}/rest/v1/rpc/record_donation`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return r.ok ? await r.json() : `erreur ${r.status} : ${await r.text()}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const body = await req.text();
  if (!(await verify(body, req.headers.get('stripe-signature')))) return new Response('signature invalide', { status: 400 });
  const ev = JSON.parse(body);
  const o = ev.data?.object ?? {};
  let res: unknown = 'ignoré';
  if (ev.type === 'checkout.session.completed' && (o.payment_status === 'paid' || o.payment_status === 'no_payment_required')) {
    const ref = typeof o.client_reference_id === 'string' && UUID.test(o.client_reference_id) ? o.client_reference_id : null;
    res = await record({
      p_stripe_id: o.id, p_user: ref, p_amount: (o.amount_total ?? 0) / 100, p_currency: o.currency ?? 'eur',
      p_kind: o.mode === 'subscription' ? 'monthly' : 'once', p_subscription: typeof o.subscription === 'string' ? o.subscription : null,
    });
  } else if (ev.type === 'invoice.paid' && o.billing_reason === 'subscription_cycle') {
    const sub = typeof o.subscription === 'string' ? o.subscription : o.parent?.subscription_details?.subscription ?? null;
    if (sub) res = await record({ p_stripe_id: o.id, p_user: null, p_amount: (o.amount_paid ?? 0) / 100, p_currency: o.currency ?? 'eur', p_kind: 'monthly', p_subscription: sub });
  }
  return new Response(JSON.stringify({ received: true, result: res }), { headers: { 'Content-Type': 'application/json' } });
});
