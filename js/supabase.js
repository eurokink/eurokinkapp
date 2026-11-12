// EuroKink — accès à Supabase (comptes et base de données), sans bibliothèque externe.
// La clé ci-dessous est la clé PUBLIQUE du projet : elle est faite pour être dans l'appli,
// les règles de sécurité de la base (RLS) protègent les données.

export const SUPABASE_URL = 'https://odaruyzivqmuvxosvqfd.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_iH127Whv4WmfpXthHRWkSw_27KT1DIn';
// Adresse de l'appli (eurokink.eu en production) : sert aux liens des e-mails de compte
export const SITE_URL = typeof location !== 'undefined' && /^https:/.test(location.origin) ? location.origin + location.pathname.replace(/[^/]*$/, '') : 'https://eurokink.eu/';
const SESSION_KEY = 'ek.session.v1';

let session = readSession();
function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
}
function setSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* stockage indisponible */ }
}
export const getSession = () => session;
export const currentUser = () => (session ? session.user : null);

const sessionFrom = (d) => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expires_at: d.expires_at || Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600),
  user: d.user || null
});

// Messages d'erreur Supabase traduits pour les membres
function translate(msg, code) {
  const m = `${code || ''} ${msg || ''}`.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) return 'Ton adresse e-mail n’est pas encore confirmée : clique sur le lien reçu par e-mail.';
  if (m.includes('already registered') || m.includes('user_already_exists')) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (m.includes('password should be') || m.includes('weak_password')) return 'Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.';
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit') || m.includes('429')) return 'Trop de tentatives : réessaie dans quelques minutes.';
  if (m.includes('profiles_pseudo_ci') || (m.includes('duplicate') && m.includes('pseudo'))) return 'Ce pseudo est déjà pris.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Pas de connexion internet.';
  return msg || 'Une erreur est survenue.';
}

async function request(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  if (auth && session) await refreshIfNeeded();
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
  if (auth && session) h.Authorization = `Bearer ${session.access_token}`;
  let res;
  try {
    const raw = typeof Blob !== 'undefined' && body instanceof Blob;
    res = await fetch(SUPABASE_URL + path, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  } catch (e) {
    const err = new Error(translate('failed to fetch'));
    err.network = true;
    throw err;
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const raw = (data && (data.msg || data.message || data.error_description || data.error)) || `Erreur ${res.status}`;
    const err = new Error(translate(raw, data && (data.error_code || data.code)));
    err.status = res.status;
    err.raw = raw;
    if (res.status === 401 && auth && session && !path.startsWith('/auth/')) setSession(null);
    throw err;
  }
  return data;
}

let refreshing = null;
async function refreshIfNeeded() {
  if (!session || !session.expires_at) return;
  if (session.expires_at - Math.floor(Date.now() / 1000) > 60) return;
  if (!refreshing) {
    refreshing = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })
      .then((d) => setSession(sessionFrom(d)))
      .catch((e) => { if (!e.network) setSession(null); })
      .finally(() => { refreshing = null; });
  }
  await refreshing;
}

// --- Comptes ---------------------------------------------------------------
const redirect = `redirect_to=${encodeURIComponent(SITE_URL)}`;

export async function signUp(email, password, data) {
  const d = await request(`/auth/v1/signup?${redirect}`, { method: 'POST', body: { email, password, data }, auth: false });
  if (d && d.access_token) { setSession(sessionFrom(d)); return { confirmed: true }; }
  return { confirmed: false };
}

export async function signIn(email, password) {
  const d = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false });
  setSession(sessionFrom(d));
  return session.user;
}

export async function signOut() {
  try { if (session) await request('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* déjà déconnecté */ }
  setSession(null);
}

export const sendPasswordReset = (email) => request(`/auth/v1/recover?${redirect}`, { method: 'POST', body: { email }, auth: false });
export const updatePassword = (password) => request('/auth/v1/user', { method: 'PUT', body: { password } });
export const forgetSession = () => setSession(null);

// Retour depuis un lien reçu par e-mail (confirmation d'inscription, mot de passe oublié)
export async function handleAuthRedirect() {
  const h = location.hash;
  if (!h || !(h.includes('access_token=') || h.includes('error_description='))) return null;
  const p = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  if (p.get('error_description')) {
    return { error: p.get('error_code') === 'otp_expired' ? 'Ce lien a expiré : demande-en un nouveau.' : p.get('error_description').replace(/\+/g, ' ') };
  }
  setSession(sessionFrom({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Number(p.get('expires_at')) || undefined, expires_in: p.get('expires_in') }));
  try { session.user = await request('/auth/v1/user'); setSession(session); } catch (e) { /* le profil sera chargé plus tard */ }
  return { type: p.get('type') || 'signup' };
}

// --- Base de données (API REST de Supabase) ---------------------------------
export const select = (table, query) => request(`/rest/v1/${table}?${query}`);
export const insert = (table, row, { ignoreDuplicates = false, onConflict = '', returnRow = false } = {}) => request(
  `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`,
  { method: 'POST', body: row, headers: { Prefer: [ignoreDuplicates ? 'resolution=ignore-duplicates' : '', returnRow ? 'return=representation' : 'return=minimal'].filter(Boolean).join(',') } }
);
export const update = (table, filter, patch) => request(`/rest/v1/${table}?${filter}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } });
export const remove = (table, filter) => request(`/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
export const uploadImage = (bucket, path, blob) => request(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' } });
export const deleteObject = (bucket, path) => request(`/storage/v1/object/${bucket}/${path}`, { method: 'DELETE' });
export const publicUrl = (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
export const invoke = (fn, body = {}) => request(`/functions/v1/${fn}`, { method: 'POST', body });
export const rpc = (fn, args = {}) => request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
