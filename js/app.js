// EuroKink — application (étape 1 : soirées de démonstration, données stockées sur l'appareil)
import { EVENTS, EVENT_TYPES, CITIES, BADGES } from './data.js';
import { PAGES, CONTACT_EMAIL, LEGAL_UPDATED } from './legal.js';
import { mountMap } from './map.js';

const VERSION = '0.3.1';
const STORE_KEY = 'ek.state.v1';
const CHECKIN_RADIUS_M = 300;
const CHECKIN_EARLY_MIN = 60;

// ---------------------------------------------------------------------------
// État local (sera remplacé par Supabase à l'étape 2)
// ---------------------------------------------------------------------------
const defaults = {
  adult: false, pseudo: '', city: 'Nantes', visibility: 'followed', invisible: false, neutralNotifs: true, testMode: false,
  remindersOn: true, reminderTiming: 'eve18', ticketAlertsOn: true, defaultRadius: 100,
  favorites: [], reminders: [], alerts: [], attending: [], checkins: []
};
let state = load();

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch (e) {
    return { ...defaults };
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
}
function toggleIn(list, id) {
  const has = state[list].includes(id);
  state[list] = has ? state[list].filter((x) => x !== id) : [...state[list], id];
  save();
  return !has;
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const typeName = (slug) => (EVENT_TYPES.find((t) => t.slug === slug) || {}).name || slug;
const eventById = (id) => EVENTS.find((e) => e.id === id);
const cityObj = () => CITIES.find((c) => c.name === state.city) || CITIES.find((c) => c.name === 'Nantes');

function distanceKm(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
const kmFromMe = (e) => { const c = cityObj(); return distanceKm(c.lat, c.lon, e.venue.lat, e.venue.lon); };

const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', opts);
const fDayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fDayShort = fmt({ weekday: 'short' });
const fTime = fmt({ hour: '2-digit', minute: '2-digit' });
const fDate = fmt({ day: 'numeric', month: 'long' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLabel = (iso) => cap(fDayLong.format(new Date(iso)));
const shortDay = (iso) => fDayShort.format(new Date(iso)).replace('.', '').toUpperCase();
const dayNum = (iso) => new Date(iso).getDate();
const timeLabel = (iso) => fTime.format(new Date(iso));
const priceLabel = (p) => (p === 0 ? 'Gratuit' : `${Number(p).toLocaleString('fr-FR')} €`);
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const REMINDER_TIMINGS = { eve18: 'la veille à 18 h', day14: 'le jour même à 14 h', h2: '2 heures avant' };
const reminderLabel = () => REMINDER_TIMINGS[state.reminderTiming] || REMINDER_TIMINGS.eve18;
const DRESS = { required: 'Obligatoire', recommended: 'Conseillé', free: 'Libre' };
const BOOKING = { required: 'Obligatoire', recommended: 'Conseillée', door_only: 'Sur place' };
const FREQ = { once: 'Unique', weekly: 'Hebdomadaire', monthly: 'Mensuelle', yearly: 'Annuelle' };

function weekendWindow() {
  const now = new Date();
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const start = new Date(d);
  if (dow >= 1 && dow <= 4) start.setDate(d.getDate() + (5 - dow));          // lun–jeu : vendredi prochain
  else if (dow === 6) start.setDate(d.getDate() - 1);                           // samedi : depuis vendredi
  else if (dow === 0) start.setDate(d.getDate() - 2);                           // dimanche : depuis vendredi
  const end = new Date(start); end.setDate(start.getDate() + 3);               // jusqu'à lundi 0 h
  return { start, end };
}
const upcoming = () => EVENTS.filter((e) => new Date(e.endsAt) > new Date()).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
const isLive = (e) => {
  const now = Date.now();
  return now >= new Date(e.startsAt).getTime() - CHECKIN_EARLY_MIN * 60000 && now <= new Date(e.endsAt).getTime();
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------------------------------------------------------------------------
// Icônes (trait, style Feather)
// ---------------------------------------------------------------------------
const ic = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  home: ic('<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>'),
  compass: ic('<circle cx="12" cy="12" r="10"/><polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9"/>'),
  heart: ic('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  users: ic('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
  user: ic('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  bell: ic('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  ticket: ic('<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2"/>'),
  check: ic('<path d="M20 6 9 17l-5-5"/>'),
  search: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  sliders: ic('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  back: ic('<path d="M15 18l-6-6 6-6"/>'),
  chevron: ic('<path d="M9 18l6-6-6-6"/>'),
  calendar: ic('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  pin: ic('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  bed: ic('<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M2 16h20M6 10V7a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3"/>'),
  share: ic('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>'),
  flag: ic('<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>'),
  lock: ic('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  doc: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>'),
  mail: ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>'),
  download: ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  trash: ic('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  map: ic('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><path d="M8 2v16M16 6v16"/>'),
  close: ic('<path d="M18 6 6 18M6 6l12 12"/>'),
  list: ic('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  route: ic('<path d="M3 11l19-9-9 19-2-8-8-2z"/>'),
  locate: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>'),
  verified: '<svg class="verified" viewBox="0 0 24 24" role="img" aria-label="Organisateur vérifié"><circle cx="12" cy="12" r="11" fill="#D0142C"/><path d="M7 12.5l3.2 3L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function studs(r = 50, dotR = 5.5) {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const a = ((i * 30 - 90) * Math.PI) / 180;
    s += `<circle cx="${(60 + r * Math.cos(a)).toFixed(1)}" cy="${(60 + r * Math.sin(a)).toFixed(1)}" r="${dotR}"/>`;
  }
  return s;
}
const LOGO_MARK = `<svg class="mark" viewBox="0 0 120 120" aria-hidden="true"><g fill="#BDBDBD">${studs()}</g><g fill="#D0142C"><rect x="38" y="32" width="15" height="56"/><polygon points="53,54 72,32 89,32 62,65"/><polygon points="58,60 68,50 90,88 73,88"/></g></svg>`;
const MAP_MARKER = `<svg class="mm" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="58" fill="#0E0E0E" stroke="#D0142C" stroke-width="5"/><g fill="#BDBDBD">${studs(42, 5.5)}</g><g fill="#D0142C" transform="translate(12 12) scale(0.8)"><rect x="38" y="32" width="15" height="56"/><polygon points="53,54 72,32 89,32 62,65"/><polygon points="58,60 68,50 90,88 73,88"/></g></svg>`;
const WORDMARK = '<span class="wordmark"><span class="wm-euro">EURO</span>KINK</span>';

// ---------------------------------------------------------------------------
// Fragments réutilisables
// ---------------------------------------------------------------------------
function eventRow(e) {
  const meta = [e.venue.city, e.types.map(typeName).join(', ')];
  if (e.booking === 'required') meta.push('Réservation');
  return `<a class="row-card" href="#/soiree/${e.id}">
    <div class="date-chip"><span>${shortDay(e.startsAt)}</span><strong>${dayNum(e.startsAt)}</strong></div>
    <div class="row-main"><div class="row-title">${esc(e.title)}</div><div class="row-meta">${esc(meta.join(' · '))}</div></div>
    <div class="price-pill">${e.soldOut ? 'Complet' : priceLabel(e.price)}</div>
  </a>`;
}

function featuredCard(e) {
  return `<a class="feature-card" href="#/soiree/${e.id}">
    <div class="feature-hero"><svg class="hero-studs" viewBox="0 0 120 120" aria-hidden="true"><g fill="currentColor">${studs(50, 3)}</g></svg>
      <span class="tag tag-red">${esc(typeName(e.types[0]).toUpperCase())}</span>
      ${e.organizer.verified ? '<span class="tag tag-dark tag-right">Vérifié</span>' : ''}
      <div class="feature-title">${esc(e.title)}</div></div>
    <div class="feature-body">
      <div class="feature-line"><span>${dayLabel(e.startsAt)} · ${timeLabel(e.startsAt)}</span><span>${esc(e.venue.city)}</span></div>
      <div class="feature-line muted"><span>${priceLabel(e.price)} · Réservation ${BOOKING[e.booking].toLowerCase()}</span><span class="accent">${e.attendees + (state.attending.includes(e.id) ? 1 : 0)} participants</span></div>
    </div></a>`;
}

const empty = (msg) => `<div class="empty">${msg}</div>`;

// ---------------------------------------------------------------------------
// Écrans
// ---------------------------------------------------------------------------
function viewGate() {
  const options = CITIES.map((c) => `<option ${c.name === state.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<section class="gate">
    <div class="gate-logo">${LOGO_MARK}${WORDMARK}</div>
    <p class="gate-tag">Toutes les soirées fetish, en France puis en Europe.</p>
    <form id="gateForm" class="card gate-card">
      <h1>Réservé aux adultes</h1>
      <p class="muted">EuroKink référence des soirées fetish destinées à un public majeur.</p>
      <p class="demo-note">Version de démonstration : pas encore de compte à créer. Ton pseudo et ta ville servent juste à personnaliser l’accueil et restent sur ce téléphone.</p>
      <label class="field">Ton pseudo (facultatif)<input name="pseudo" maxlength="30" autocomplete="off" placeholder="Ex. BlackRider" value="${esc(state.pseudo)}"></label>
      <label class="field">Ta ville de référence<select name="city">${options}</select></label>
      <label class="checkline"><input type="checkbox" name="adult" required> J’ai 18 ans ou plus.</label>
      <label class="checkline"><input type="checkbox" name="consent" required> J’accepte qu’EuroKink conserve mes favoris et réglages sur cet appareil.</label>
      <button class="btn btn-red btn-block" type="submit">Entrer</button>
      <p class="tiny muted">Les soirées affichées sont fictives. La création de compte arrivera prochainement.</p>
    </form>
  </section>`;
}

function viewHome() {
  const { start, end } = weekendWindow();
  const list = upcoming();
  const weekend = list.filter((e) => new Date(e.startsAt) < end && new Date(e.endsAt) > start && kmFromMe(e) <= 150);
  const featured = list.find((e) => e.featured) || list[0];
  const later = list.filter((e) => !weekend.includes(e) && e !== featured).slice(0, 6);
  const chips = [['weekend', 'Ce week-end'], ['free', 'Gratuit'], ...EVENT_TYPES.slice(0, 6).map((t) => [`type:${t.slug}`, t.name])];
  return `<section class="screen">
    <header class="topbar"><div class="brand">${LOGO_MARK}${WORDMARK}</div>
      <div class="top-actions"><a class="icon-btn" href="#/carte" aria-label="Carte des soirées">${I.map}</a><a class="icon-btn" href="#/favoris" aria-label="Mes favoris et alertes">${I.bell}${state.alerts.length ? '<span class="dot"></span>' : ''}</a></div></header>
    <div class="hello"><h1>${state.pseudo ? `Salut ${esc(state.pseudo)}` : 'Salut'}</h1>
      <p class="muted">${weekend.length} soirée${weekend.length > 1 ? 's' : ''} ce week-end autour de ${esc(state.city)}</p></div>
    <form class="search-row" id="homeSearch">
      <label class="search"><span>${I.search}</span><input name="q" type="search" placeholder="Ville, soirée, organisateur…" aria-label="Rechercher"></label>
      <a class="filter-btn" href="#/explorer" aria-label="Filtres">${I.sliders}</a>
    </form>
    <div class="chips scroll-x">${chips.map(([k, l]) => `<button class="chip" data-quick="${k}">${esc(l)}</button>`).join('')}</div>
    ${featured ? `<div class="section-head"><h2>À la une</h2><a href="#/explorer" class="link">Tout voir</a></div>${featuredCard(featured)}` : ''}
    <h2 class="section-title">Ce week-end près de toi</h2>
    <div class="list">${weekend.length ? weekend.map(eventRow).join('') : empty('Rien ce week-end dans ton coin. Regarde les prochaines dates ci-dessous.')}</div>
    <h2 class="section-title">Prochainement</h2>
    <div class="list">${later.map(eventRow).join('')}</div>
  </section>`;
}

// Filtres de l'écran Explorer (gardés en mémoire pendant la session)
const freshFilters = () => ({ q: '', radius: state.defaultRadius, period: 'all', types: [], budget: 100, noBooking: false, cloakroom: false });
const filters = freshFilters();

function filtered({ ignoreRadius = false } = {}) {
  const now = new Date();
  const { start, end } = weekendWindow();
  const horizon = { week: 7, month: 31 }[filters.period];
  const q = filters.q.trim().toLowerCase();
  return upcoming().filter((e) => {
    const s = new Date(e.startsAt);
    if (filters.period === 'weekend' && !(s < end && new Date(e.endsAt) > start)) return false;
    if (horizon && s - now > horizon * 86400000) return false;
    if (!ignoreRadius && filters.radius && kmFromMe(e) > filters.radius) return false;
    if (filters.types.length && !e.types.some((t) => filters.types.includes(t))) return false;
    if (filters.budget < 100 && e.price > filters.budget) return false;
    if (filters.noBooking && e.booking !== 'door_only') return false;
    if (filters.cloakroom && !e.hasCloakroom) return false;
    if (q && ![e.title, e.organizer.name, e.venue.city, e.venue.name].some((x) => x.toLowerCase().includes(q))) return false;
    return true;
  });
}
const budgetLabel = () => (filters.budget >= 100 ? 'Tous budgets' : filters.budget === 0 ? 'Gratuit uniquement' : `Jusqu’à ${filters.budget} €`);

function viewExplorer() {
  const cityOpts = CITIES.map((c) => `<option ${c.name === state.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const radii = [[25, '25 km'], [50, '50 km'], [100, '100 km'], [200, '200 km'], [0, 'Partout']];
  const periods = [['weekend', 'Ce week-end'], ['week', '7 jours'], ['month', '30 jours'], ['all', 'Toutes les dates']];
  return `<section class="screen">
    <div class="explore-top"><h1 class="page-title">Explorer</h1>${segmented('list')}</div>
    <label class="search"><span>${I.search}</span><input id="fQ" type="search" placeholder="Ville, soirée, organisateur…" value="${esc(filters.q)}" aria-label="Rechercher"></label>
    <div class="grid2">
      <label class="select-card"><span class="sc-label">${I.pin} Autour de</span><select id="fCity">${cityOpts}</select></label>
      <label class="select-card"><span class="sc-label">${I.compass} Rayon</span><select id="fRadius">${radii.map(([v, l]) => `<option value="${v}" ${v === filters.radius ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="select-card"><span class="sc-label">${I.calendar} Quand</span><select id="fPeriod">${periods.map(([v, l]) => `<option value="${v}" ${v === filters.period ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="label-up">Type de soirée</div>
    <div class="chips wrap" id="fTypes">${EVENT_TYPES.map((t) => `<button class="chip ${filters.types.includes(t.slug) ? 'on' : ''}" data-type="${t.slug}" aria-pressed="${filters.types.includes(t.slug)}">${esc(t.name)}</button>`).join('')}</div>
    <div class="budget-head"><label for="fBudget" class="label-up">Budget max</label><strong id="budgetLabel" class="accent">${budgetLabel()}</strong></div>
    <div class="card budget-card"><input id="fBudget" type="range" min="0" max="100" step="5" value="${filters.budget}">
      <div class="ticks"><span>Gratuit</span><span>25 €</span><span>50 €</span><span>75 €</span><span>100 €+</span></div></div>
    <div class="card toggles">
      <label class="toggle-line"><span>Sans réservation</span><input type="checkbox" class="switch" id="fNoBooking" ${filters.noBooking ? 'checked' : ''}></label>
      <label class="toggle-line"><span>Vestiaire sur place</span><input type="checkbox" class="switch" id="fCloak" ${filters.cloakroom ? 'checked' : ''}></label>
    </div>
    <div class="section-head"><h2 id="resultCount"></h2><button class="link" id="fReset">Réinitialiser</button></div>
    <div class="list" id="results"></div>
  </section>`;
}

function renderResults() {
  const list = filtered();
  $('#resultCount').textContent = `${list.length} soirée${list.length > 1 ? 's' : ''} trouvée${list.length > 1 ? 's' : ''}`;
  $('#results').innerHTML = list.length ? list.map(eventRow).join('') : empty('Aucune soirée avec ces filtres. Élargis le rayon, les dates ou le budget.');
}

function viewEvent(id) {
  const e = eventById(id);
  if (!e) return `<section class="screen">${empty('Cette soirée n’existe plus.')}<a class="btn btn-ghost" href="#/">Retour à l’accueil</a></section>`;
  const fav = state.favorites.includes(id), rem = state.reminders.includes(id), al = state.alerts.includes(id), att = state.attending.includes(id);
  const checked = state.checkins.some((c) => c.id === id);
  const salesLater = e.salesOpenAt && new Date(e.salesOpenAt) > new Date();
  const km = Math.round(kmFromMe(e));
  const multiDay = new Date(e.endsAt).toDateString() !== new Date(e.startsAt).toDateString() && new Date(e.endsAt) - new Date(e.startsAt) > 24 * 3600000;
  const when = multiDay ? `Du ${fDate.format(new Date(e.startsAt))} au ${fDate.format(new Date(e.endsAt))}` : dayLabel(e.startsAt);
  const infos = [
    ['Type', e.types.map(typeName).join(', ')], ['Dress code', DRESS[e.dressCode]],
    ['Réservation', BOOKING[e.booking]], ['Vestiaire', e.hasCloakroom ? (e.cloakroomPaid ? 'Oui, payant' : 'Oui, gratuit') : 'Non'],
    ['Fréquence', FREQ[e.frequency]], ['Langues', e.languages.join(', ')]
  ];
  let cta;
  if (e.soldOut) cta = `<button class="btn btn-red btn-grow" data-act="alert">${al ? 'Alerte activée' : 'Complet : m’alerter'}</button>`;
  else if (salesLater) cta = `<button class="btn btn-red btn-grow" data-act="alert">${al ? 'Alerte activée' : `Billets le ${fDate.format(new Date(e.salesOpenAt))}`}</button>`;
  else if (e.booking === 'door_only' || !e.ticketUrl) cta = '<span class="btn btn-ghost btn-grow static">Entrée sur place</span>';
  else cta = `<a class="btn btn-red btn-grow" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Réserver ma place</a>`;
  const showCheckin = !checked && (isLive(e) || state.testMode);
  return `<section class="screen screen-event">
    <div class="event-hero"><svg class="hero-studs" viewBox="0 0 120 120" aria-hidden="true"><g fill="currentColor">${studs(50, 3)}</g></svg>
      <button class="icon-btn hero-btn hero-left" data-act="back" aria-label="Retour">${I.back}</button>
      <button class="icon-btn hero-btn hero-right" data-act="share" aria-label="Partager">${I.share}</button>
      <div class="hero-tags">${e.types.map((t) => `<span class="tag tag-red">${esc(typeName(t).toUpperCase())}</span>`).join('')}<span class="tag tag-dark">${FREQ[e.frequency]}</span>${e.soldOut ? '<span class="tag tag-light">Complet</span>' : ''}</div>
    </div>
    <div class="event-body">
      <h1 class="event-title">${esc(e.title)}</h1>
      <div class="org-line">par <strong>${esc(e.organizer.name)}</strong>${e.organizer.verified ? I.verified : ''}<span class="muted">· ${esc(e.organizer.kind)}</span></div>
      <div class="facts">
        <div class="fact"><span class="fact-ic">${I.calendar}</span><div><strong>${when}</strong><div class="muted">${timeLabel(e.startsAt)} – ${timeLabel(e.endsAt)}</div></div></div>
        <div class="fact"><span class="fact-ic">${I.pin}</span><div class="fact-main"><strong>${esc(e.venue.name)}</strong><div class="muted">${esc(e.venue.city)} · à ${km} km de ${esc(state.city)}</div></div>
          <a class="route-btn" href="${mapsUrl(e)}" target="_blank" rel="noopener">${I.route}<span>Itinéraire</span></a></div>
      </div>
      ${showCheckin ? `<div class="checkin card"><div><strong>Tu es à la soirée ?</strong><div class="muted">Valide ta présence pour ton passeport.${state.testMode ? ' (mode test : sans GPS)' : ''}</div></div><button class="btn btn-red" data-act="checkin">${I.locate} Je suis sur place</button></div>` : ''}
      ${checked ? `<div class="checkin card done">${I.check}<div><strong>Présence validée</strong><div class="muted">Elle compte dans ton passeport.</div></div></div>` : ''}
      <div class="info-grid">${infos.map(([l, v]) => `<div class="info"><span>${l}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
      ${e.dressCodeDetails ? `<p class="dress muted">Dress code : ${esc(e.dressCodeDetails)}</p>` : ''}
      <div class="actions">
        ${actionBtn('fav', fav, I.heart, 'Favori')}
        ${actionBtn('reminder', rem, I.bell, 'Rappel')}
        ${actionBtn('alert', al, I.ticket, 'Alerte billets')}
        ${actionBtn('attend', att, I.check, 'J’y vais')}
      </div>
      <div class="card who"><div><strong>Qui y va ?</strong> <span class="muted">${e.attendees + (att ? 1 : 0)} membres</span></div><span class="muted tiny">Liste visible avec la communauté (V2)</span></div>
      <h2 class="section-title">À propos</h2>
      <p class="about">${esc(e.description)}</p>
      <h2 class="section-title">Pratique</h2>
      <div class="practical">
        <a class="line-btn" href="${mapsUrl(e)}" target="_blank" rel="noopener">${I.route}<span>Itinéraire jusqu’au lieu</span>${I.chevron}</a>
        <button class="line-btn" data-act="ics">${I.calendar}<span>Ajouter à mon calendrier</span>${I.chevron}</button>
        <a class="line-btn" href="${bookingUrl(e)}" target="_blank" rel="noopener">${I.bed}<span>Trouver un hébergement à proximité</span>${I.chevron}</a>
        <button class="line-btn" data-act="report">${I.flag}<span>Signaler une erreur sur cette soirée</span>${I.chevron}</button>
      </div>
    </div>
    <div class="event-bar">
      <div><div class="bar-price">${priceLabel(e.price)}</div>${e.presalePrice ? `<div class="muted tiny">${priceLabel(e.presalePrice)} en prévente</div>` : ''}</div>
      ${cta}
    </div>
  </section>`;
}
const actionBtn = (act, on, icon, label) => `<button class="action ${on ? 'on' : ''}" data-act="${act}" aria-pressed="${on}">${icon}<span>${label}</span></button>`;

function mapsUrl(e) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return ios ? `https://maps.apple.com/?daddr=${e.venue.lat},${e.venue.lon}` : `https://www.google.com/maps/dir/?api=1&destination=${e.venue.lat},${e.venue.lon}`;
}
function bookingUrl(e) {
  const s = new Date(e.startsAt);
  if (s.getHours() < 6) s.setDate(s.getDate() - 1);   // soirée qui démarre après minuit : nuit de la veille
  const out = new Date(e.endsAt);
  if (isoDate(out) <= isoDate(s)) out.setDate(s.getDate() + 1);
  const p = new URLSearchParams({ ss: `${e.venue.city}`, checkin: isoDate(s), checkout: isoDate(out), group_adults: '1', no_rooms: '1' });
  return `https://www.booking.com/searchresults.fr.html?${p}`;
}

function viewFavorites() {
  const block = (title, ids, msg) => {
    const list = ids.map(eventById).filter(Boolean).filter((e) => new Date(e.endsAt) > new Date()).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    return `<h2 class="section-title">${title}</h2><div class="list">${list.length ? list.map(eventRow).join('') : empty(msg)}</div>`;
  };
  return `<section class="screen"><h1 class="page-title">Mes soirées</h1>
    ${block('Où je vais', state.attending, 'Touche « J’y vais » sur une soirée pour la retrouver ici.')}
    ${block('Favoris', state.favorites, 'Touche le cœur d’une soirée pour la mettre de côté.')}
    ${block('Alertes billetterie', state.alerts, 'Active une alerte sur une soirée complète ou dont la billetterie n’est pas encore ouverte.')}
    ${block('Rappels', state.reminders, `Les rappels te préviennent ${reminderLabel()}.`)}
  </section>`;
}

function viewCommunity() {
  const items = ['Profils avec pseudo, photos et description', 'Annuaire par pays et par ville', '« Qui y va ? » pour chaque soirée', 'Trouver un buddy pour y aller ensemble', 'Avis après la soirée', 'Messagerie (V3)'];
  return `<section class="screen"><h1 class="page-title">Communauté</h1>
    <div class="card soon"><span class="tag tag-red">BIENTÔT</span><h2>L’espace communauté arrive en V2</h2>
      <p class="muted">Une fois le catalogue de soirées bien rempli, tu pourras retrouver les membres qui partagent tes sorties.</p>
      <ul class="soon-list">${items.map((i) => `<li>${I.check}<span>${esc(i)}</span></li>`).join('')}</ul></div>
    <div class="card note">${I.lock}<p class="muted">Pas de photo explicite, pas de sollicitation sexuelle : EuroKink est une appli de sorties fetish, pas une appli de plans.</p></div>
  </section>`;
}

// Passeport : progression calculée à partir des présences validées
function passport() {
  const evs = state.checkins.map((c) => eventById(c.id)).filter(Boolean);
  const perOrg = {};
  evs.forEach((e) => { perOrg[e.org] = (perOrg[e.org] || 0) + 1; });
  const progress = {
    first_steps: evs.length,
    tour_de_france: new Set(evs.filter((e) => e.country === 'FR').map((e) => e.venue.city)).size,
    globetrotter: new Set(evs.map((e) => e.country)).size,
    loyal: Math.max(0, ...Object.values(perOrg)),
    explorer: new Set(evs.flatMap((e) => e.types)).size,
    pioneer: 1
  };
  return BADGES.map((b) => ({ ...b, progress: Math.min(b.goal, progress[b.code] || 0), earned: (progress[b.code] || 0) >= b.goal }));
}
let selectedBadge = 'first_steps';

function viewProfile() {
  const pass = passport();
  const evs = state.checkins.map((c) => eventById(c.id)).filter(Boolean);
  const stats = [[evs.length, 'soirées'], [new Set(evs.map((e) => e.venue.city)).size, 'villes'], [new Set(evs.map((e) => e.country)).size, 'pays']];
  const sel = pass.find((b) => b.code === selectedBadge) || pass[0];
  return `<section class="screen"><div class="profile-top"><h1 class="page-title">Profil</h1><a class="icon-btn" href="#/parametres" aria-label="Paramètres">${I.gear}</a></div><div class="profile-head">
      <div class="avatar">${esc((state.pseudo || 'E').charAt(0).toUpperCase())}</div>
      <div><div class="pseudo">${esc(state.pseudo || 'Membre EuroKink')}</div><div class="muted">${esc(state.city)}</div>
      <span class="pill-red">PIONNIER</span></div></div>
    <div class="stats">${stats.map(([n, l]) => `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>
    <div class="section-head"><h2>Mon passeport</h2><span class="muted">${pass.filter((b) => b.earned).length} / ${pass.length} badges</span></div>
    <div class="badges">${pass.map((b) => `<button class="badge ${b.earned ? 'earned' : ''} ${b.code === sel.code ? 'sel' : ''}" data-badge="${b.code}" aria-pressed="${b.code === sel.code}">
        <svg viewBox="0 0 120 120" aria-hidden="true"><g class="b-studs">${studs()}</g><circle cx="60" cy="60" r="34" class="b-disc"/><g transform="translate(40 40) scale(1.6667)"><path d="${b.icon}" class="b-icon"/></g></svg>
        <span class="b-name">${esc(b.name)}</span><span class="b-bar"><span style="width:${Math.round((100 * b.progress) / b.goal)}%"></span></span></button>`).join('')}</div>
    <div class="card badge-detail"><strong>${esc(sel.name)}</strong> <span class="accent">${sel.earned ? '· obtenu' : `· ${sel.progress} / ${sel.goal}`}</span><p class="muted">${esc(sel.description)}</p></div>
    <a class="line-btn rounded" href="#/parametres">${I.gear}<span>Paramètres, confidentialité et informations</span>${I.chevron}</a>
  </section>`;
}

function viewSettings() {
  const opt = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
  const cityOpts = CITIES.map((c) => `<option ${c.name === state.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const sw = (name, on, label, help) => `<label class="toggle-line"><span>${label}${help ? `<span class="muted tiny block">${help}</span>` : ''}</span><input type="checkbox" class="switch" name="${name}" ${on ? 'checked' : ''}></label>`;
  const info = (slug, label) => `<a class="line-btn" href="#/infos/${slug}">${I.doc}<span>${label}</span>${I.chevron}</a>`;
  return `<section class="screen"><div class="sub-top"><a class="icon-btn" href="#/profil" aria-label="Retour au profil">${I.back}</a><h1 class="page-title">Paramètres</h1></div>
    <form id="settingsForm" class="settings-groups">
      <h2 class="group-title">Mon profil</h2>
      <div class="card settings">
        <label class="field">Pseudo<input name="pseudo" maxlength="30" value="${esc(state.pseudo)}" autocomplete="off"></label>
        <label class="field">Ville de référence<select name="city">${cityOpts}</select></label>
        <label class="field">Rayon de recherche par défaut<select name="defaultRadius">${opt([[25, '25 km'], [50, '50 km'], [100, '100 km'], [200, '200 km'], [0, 'Partout']], state.defaultRadius)}</select></label>
      </div>
      <h2 class="group-title">Confidentialité</h2>
      <div class="card settings">
        <label class="field">Qui peut voir mes sorties<select name="visibility">${opt([['everyone', 'Tout le monde'], ['followed', 'Les membres que je suis'], ['nobody', 'Personne']], state.visibility)}</select></label>
        ${sw('invisible', state.invisible, 'Profil invisible', 'Personne ne te trouve dans la communauté')}
        <p class="tiny muted">Ces choix s’appliqueront dès l’ouverture de la communauté.</p>
      </div>
      <h2 class="group-title">Notifications</h2>
      <div class="card settings">
        ${sw('remindersOn', state.remindersOn, 'Rappels de soirée')}
        <label class="field">Moment du rappel<select name="reminderTiming">${opt(Object.entries(REMINDER_TIMINGS).map(([k, v]) => [k, cap(v)]), state.reminderTiming)}</select></label>
        ${sw('ticketAlertsOn', state.ticketAlertsOn, 'Alertes billetterie', 'Ouverture des ventes et places libérées')}
        ${sw('neutralNotifs', state.neutralNotifs, 'Notifications discrètes', 'Texte neutre, sans le mot « fetish »')}
        <p class="tiny muted">L’envoi des notifications arrivera avec les comptes : tes choix sont déjà enregistrés.</p>
      </div>
      <h2 class="group-title">Passeport</h2>
      <div class="card settings">${sw('testMode', state.testMode, 'Mode test', 'Valider une présence sans GPS, pour essayer les badges')}</div>
    </form>
    <h2 class="group-title">Informations</h2>
    <div class="practical">
      ${info('charte', 'Charte de la communauté')}
      ${info('cgu', 'Conditions générales d’utilisation')}
      ${info('confidentialite', 'Confidentialité')}
      ${info('mentions', 'Mentions légales')}
      ${CONTACT_EMAIL ? `<a class="line-btn" href="mailto:${CONTACT_EMAIL}">${I.mail}<span>Nous contacter</span>${I.chevron}</a>` : `<div class="line-btn static">${I.mail}<span>Nous contacter<span class="muted tiny block">Adresse bientôt disponible</span></span></div>`}
    </div>
    <h2 class="group-title">Mes données</h2>
    <div class="practical">
      <button class="line-btn" data-act="export">${I.download}<span>Exporter mes données</span>${I.chevron}</button>
      <button class="line-btn danger" data-act="reset">${I.trash}<span>Effacer mes données sur cet appareil</span>${I.chevron}</button>
    </div>
    <p class="tiny muted center">EuroKink ${VERSION} · version de démonstration · soirées fictives</p>
  </section>`;
}

function viewInfo(slug) {
  const page = PAGES[slug];
  if (!page) return `<section class="screen">${empty('Page introuvable.')}</section>`;
  return `<section class="screen"><div class="sub-top"><a class="icon-btn" href="#/parametres" aria-label="Retour aux paramètres">${I.back}</a><h1 class="page-title small">${esc(page.title)}</h1></div>
    <article class="legal card">${page.html()}<p class="tiny muted">Dernière mise à jour : ${LEGAL_UPDATED}</p></article></section>`;
}

const segmented = (mode) => `<div class="seg" role="tablist" aria-label="Affichage">
  <a href="#/explorer" role="tab" aria-selected="${mode === 'list'}" class="${mode === 'list' ? 'on' : ''}">${I.list}<span>Liste</span></a>
  <a href="#/carte" role="tab" aria-selected="${mode === 'map'}" class="${mode === 'map' ? 'on' : ''}">${I.map}<span>Carte</span></a></div>`;

function viewMap() {
  const n = filtered({ ignoreRadius: true }).length;
  const active = filters.types.length + (filters.budget < 100 ? 1 : 0) + (filters.period !== 'all' ? 1 : 0) + (filters.noBooking ? 1 : 0) + (filters.cloakroom ? 1 : 0) + (filters.q ? 1 : 0);
  return `<section class="screen screen-map">
    <div class="explore-top"><h1 class="page-title">Explorer</h1>${segmented('map')}</div>
    <a class="map-summary" href="#/explorer">${I.sliders}<span>${n} soirée${n > 1 ? 's' : ''} sur la carte${active ? ` · ${active} filtre${active > 1 ? 's' : ''} actif${active > 1 ? 's' : ''}` : ''}</span><span class="accent">Filtres</span></a>
    <div class="map-wrap"><div id="map" class="map"></div>
      <div id="mapSheet" class="map-sheet" hidden></div></div>
  </section>`;
}

let mapCleanup = null;
function initMap() {
  const groups = new Map();
  filtered({ ignoreRadius: true }).forEach((e) => {
    const g = groups.get(e.venue.city) || { id: e.venue.city, events: [], lat: 0, lon: 0 };
    g.events.push(e); g.lat += e.venue.lat; g.lon += e.venue.lon;
    groups.set(e.venue.city, g);
  });
  const markers = [...groups.values()].map((g) => ({
    id: g.id, lat: g.lat / g.events.length, lon: g.lon / g.events.length, count: g.events.length,
    label: `${g.id} : ${g.events.length} soirée${g.events.length > 1 ? 's' : ''}`
  }));
  const c = cityObj();
  const sheet = $('#mapSheet');
  const open = (cities) => {
    const evs = cities.flatMap((city) => groups.get(city).events).sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt));
    sheet.innerHTML = `<div class="sheet-head"><div><strong>${esc(cities.join(', '))}</strong> <span class="muted">· ${evs.length} soirée${evs.length > 1 ? 's' : ''}</span></div>
      <button class="icon-btn small" data-close-sheet aria-label="Fermer">${I.close}</button></div>
      <div class="list">${evs.map(eventRow).join('')}</div>`;
    sheet.hidden = false;
  };
  sheet.addEventListener('click', (ev) => { if (ev.target.closest('[data-close-sheet]')) sheet.hidden = true; });
  mapCleanup = mountMap($('#map'), { markers, home: { lat: c.lat, lon: c.lon }, onSelect: open, markerSvg: MAP_MARKER });
}

// ---------------------------------------------------------------------------
// Routeur
// ---------------------------------------------------------------------------
const NAV = [['#/', 'Accueil', I.home], ['#/explorer', 'Explorer', I.compass], ['#/favoris', 'Mes soirées', I.heart], ['#/communaute', 'Communauté', I.users], ['#/profil', 'Profil', I.user]];

function render() {
  const view = $('#view');
  const nav = $('#nav');
  if (!state.adult) {
    view.innerHTML = viewGate();
    nav.hidden = true;
    return;
  }
  const hash = location.hash || '#/';
  const [, route, param] = hash.split('/');
  let html;
  let active = '#/';
  switch (route) {
    case 'explorer': html = viewExplorer(); active = '#/explorer'; break;
    case 'carte': html = viewMap(); active = '#/explorer'; break;
    case 'soiree': html = viewEvent(decodeURIComponent(param || '')); active = null; break;
    case 'favoris': html = viewFavorites(); active = '#/favoris'; break;
    case 'communaute': html = viewCommunity(); active = '#/communaute'; break;
    case 'profil': html = viewProfile(); active = '#/profil'; break;
    case 'parametres': html = viewSettings(); active = '#/profil'; break;
    case 'infos': html = viewInfo(param); active = '#/profil'; break;
    default: html = viewHome();
  }
  if (mapCleanup) { mapCleanup(); mapCleanup = null; }
  view.innerHTML = html;
  nav.hidden = active === null;
  nav.innerHTML = NAV.map(([href, label, icon]) => `<a href="${href}" class="${href === active ? 'active' : ''}" ${href === active ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`).join('');
  if (route === 'explorer') renderResults();
  if (route === 'carte') initMap();
}

function navigate(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

let navDepth = 0;   // nombre de navigations dans l'appli (pour le bouton Retour)
window.addEventListener('hashchange', () => { navDepth += 1; render(); window.scrollTo(0, 0); });

// ---------------------------------------------------------------------------
// Interactions (délégation d'événements)
// ---------------------------------------------------------------------------
document.addEventListener('submit', (ev) => {
  const form = ev.target;
  if (form.id === 'gateForm') {
    ev.preventDefault();
    const data = new FormData(form);
    state.adult = true;
    state.pseudo = String(data.get('pseudo') || '').trim().slice(0, 30);
    state.city = data.get('city');
    save();
    navigate('#/');
  } else if (form.id === 'homeSearch') {
    ev.preventDefault();
    filters.q = String(new FormData(form).get('q') || '');
    filters.period = 'all';
    navigate('#/explorer');
  } else if (form.id === 'settingsForm') {
    ev.preventDefault();
  }
});

document.addEventListener('click', (ev) => {
  const quick = ev.target.closest('[data-quick]');
  if (quick) {
    const k = quick.dataset.quick;
    Object.assign(filters, freshFilters());
    if (k === 'weekend') filters.period = 'weekend';
    else if (k === 'free') filters.budget = 0;
    else if (k.startsWith('type:')) { filters.types = [k.slice(5)]; filters.radius = 0; }
    navigate('#/explorer');
    return;
  }
  const typeChip = ev.target.closest('[data-type]');
  if (typeChip) {
    const t = typeChip.dataset.type;
    filters.types = filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t];
    typeChip.classList.toggle('on');
    typeChip.setAttribute('aria-pressed', filters.types.includes(t));
    renderResults();
    return;
  }
  const badge = ev.target.closest('[data-badge]');
  if (badge) { selectedBadge = badge.dataset.badge; render(); return; }
  if (ev.target.closest('#fReset')) {
    Object.assign(filters, freshFilters());
    render();
    return;
  }
  const act = ev.target.closest('[data-act]');
  if (!act) return;
  const id = decodeURIComponent((location.hash.split('/')[2]) || '');
  const e = eventById(id);
  switch (act.dataset.act) {
    case 'back':
      if (navDepth > 0) history.back(); else navigate('#/');
      break;
    case 'share': shareEvent(e); break;
    case 'fav': toast(toggleIn('favorites', id) ? 'Ajoutée à tes favoris' : 'Retirée de tes favoris'); render(); break;
    case 'reminder': toast(toggleIn('reminders', id) ? `Rappel programmé ${reminderLabel()}` : 'Rappel supprimé'); render(); break;
    case 'alert': toast(toggleIn('alerts', id) ? 'Alerte activée : tu seras prévenu à l’ouverture des places' : 'Alerte désactivée'); render(); break;
    case 'attend': toast(toggleIn('attending', id) ? 'Bonne soirée ! Elle est dans « Mes soirées »' : 'Participation retirée'); render(); break;
    case 'checkin': checkIn(e); break;
    case 'ics': downloadIcs(e); break;
    case 'export': exportData(); break;
    case 'report': toast('Merci ! Le signalement sera transmis à l’équipe (actif à l’étape 2).'); break;
    case 'reset':
      if (confirm('Effacer tes favoris, rappels, sorties et réglages sur cet appareil ?')) {
        localStorage.removeItem(STORE_KEY);
        state = load();
        navigate('#/');
      }
      break;
    default: break;
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'fBudget') { filters.budget = Number(t.value); $('#budgetLabel').textContent = budgetLabel(); renderResults(); }
  if (t.id === 'fQ') { filters.q = t.value; renderResults(); }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'fCity') { state.city = t.value; save(); renderResults(); }
  if (t.id === 'fRadius') { filters.radius = Number(t.value); renderResults(); }
  if (t.id === 'fPeriod') { filters.period = t.value; renderResults(); }
  if (t.id === 'fNoBooking') { filters.noBooking = t.checked; renderResults(); }
  if (t.id === 'fCloak') { filters.cloakroom = t.checked; renderResults(); }
  if (t.form && t.form.id === 'settingsForm') {
    const f = t.form;
    state.pseudo = f.pseudo.value.trim().slice(0, 30);
    state.city = f.city.value;
    state.defaultRadius = Number(f.defaultRadius.value);
    filters.radius = state.defaultRadius;
    state.visibility = f.visibility.value;
    state.invisible = f.invisible.checked;
    state.remindersOn = f.remindersOn.checked;
    state.reminderTiming = f.reminderTiming.value;
    state.ticketAlertsOn = f.ticketAlertsOn.checked;
    state.neutralNotifs = f.neutralNotifs.checked;
    state.testMode = f.testMode.checked;
    save();
    toast('Réglages enregistrés');
  }
});

// ---------------------------------------------------------------------------
// Fonctions de la fiche soirée
// ---------------------------------------------------------------------------
function validatePresence(e) {
  const before = passport().filter((b) => b.earned).map((b) => b.code);
  state.checkins = [...state.checkins.filter((c) => c.id !== e.id), { id: e.id, at: new Date().toISOString() }];
  if (!state.attending.includes(e.id)) state.attending.push(e.id);
  save();
  const fresh = passport().filter((b) => b.earned && !before.includes(b.code)).map((b) => b.name);
  toast(fresh.length ? `Présence validée ! Nouveau badge : ${fresh.join(', ')}` : 'Présence validée !');
  render();
}

function checkIn(e) {
  if (state.testMode) { validatePresence(e); return; }
  if (!('geolocation' in navigator)) { toast('La localisation n’est pas disponible sur cet appareil.'); return; }
  toast('Vérification de ta position…');
  navigator.geolocation.getCurrentPosition((pos) => {
    // La position sert uniquement à ce calcul : elle n'est ni enregistrée ni envoyée.
    const d = distanceKm(pos.coords.latitude, pos.coords.longitude, e.venue.lat, e.venue.lon) * 1000;
    if (d <= CHECKIN_RADIUS_M) validatePresence(e);
    else toast(`Tu es à ${d < 10000 ? `${Math.round(d)} m` : `${Math.round(d / 1000)} km`} du lieu : rapproche-toi pour valider.`);
  }, () => toast('Position refusée ou introuvable. Autorise la localisation pour EuroKink dans les réglages.'),
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

async function shareEvent(e) {
  const url = `${location.origin}${location.pathname}#/soiree/${e.id}`;
  const text = `${e.title} · ${dayLabel(e.startsAt)} · ${e.venue.city}`;
  try {
    if (navigator.share) await navigator.share({ title: e.title, text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Lien copié'); }
  } catch (err) { /* partage annulé */ }
}

function exportData() {
  const data = { application: 'EuroKink', version: VERSION, exportedAt: new Date().toISOString(), ...state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eurokink-mes-donnees.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Tes données ont été exportées');
}

function downloadIcs(e) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = (s) => String(s).replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const title = state.neutralNotifs ? 'Sortie' : e.title;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EuroKink//FR', 'BEGIN:VEVENT',
    `UID:${e.id}@eurokink`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${clean(title)}`, `LOCATION:${clean(`${e.venue.name}, ${e.venue.city}`)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${e.id}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(state.neutralNotifs ? 'Ajouté au calendrier sous le titre discret « Sortie »' : 'Fichier calendrier téléchargé');
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
