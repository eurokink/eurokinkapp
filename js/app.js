// EuroKink — application (étape 2 : soirées et comptes dans Supabase)
import { EVENT_TYPES, CITIES, BADGES } from './data.js';
import * as sb from './supabase.js';
import { PAGES, CONTACT_EMAIL, LEGAL_UPDATED } from './legal.js';
import { mountMap } from './map.js';

const VERSION = '0.6.0';
const BRAND = 'EuroKink™';   // passer à ® une fois la marque déposée (INPI / EUIPO)
const COPYRIGHT_YEAR = 2026;
const STORE_KEY = 'ek.state.v1';
const CHECKIN_RADIUS_M = 300;
const CHECKIN_EARLY_MIN = 60;

// ---------------------------------------------------------------------------
// État : réglages sur l'appareil + données du compte (synchronisées avec Supabase)
// ---------------------------------------------------------------------------
let EVENTS = [];            // soirées publiées à venir, chargées depuis Supabase
let eventsReady = false;
let eventsError = '';
let profile = null;         // profil du membre connecté
let userChecked = false;    // le profil a-t-il été chargé au démarrage ?
let serverPassport = null;  // progression des badges calculée par le serveur
let checkinInfo = [];       // présences validées : { id, city, country }
const EVENTS_CACHE = 'ek.events.v1';
const isUuid = (x) => /^[0-9a-f-]{36}$/i.test(String(x));
const loggedIn = () => !!(sb.getSession() && profile);
const defaults = {
  adult: false, pseudo: '', city: 'Nantes', visibility: 'followed', invisible: false, neutralNotifs: true, testMode: false,
  remindersOn: true, reminderTiming: 'eve18', ticketAlertsOn: true, defaultRadius: 100,
  favorites: [], reminders: [], alerts: [], attending: [], checkins: []
};
let state = load();

function load() {
  let st;
  try { st = { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch (e) { st = { ...defaults }; }
  // Les identifiants des anciennes soirées de démonstration (v0.1 à v0.3) ne sont plus valables
  ['favorites', 'reminders', 'alerts', 'attending'].forEach((k) => { st[k] = (st[k] || []).filter(isUuid); });
  st.checkins = (st.checkins || []).filter((c) => isUuid(c.id));
  return st;
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
      <div class="feature-line muted"><span>${priceLabel(e.price)} · Réservation ${BOOKING[e.booking].toLowerCase()}</span><span class="accent">${attendeesLabel(attendeesOf(e))}</span></div>
    </div></a>`;
}

const attendeesOf = (e) => e.attendees + (!loggedIn() && state.attending.includes(e.id) ? 1 : 0);
const attendeesLabel = (n) => (n === 0 ? 'Sois le premier à y aller' : `${n} participant${n > 1 ? 's' : ''}`);
const empty = (msg) => `<div class="empty">${msg}</div>`;

// ---------------------------------------------------------------------------
// Écrans
// ---------------------------------------------------------------------------
function viewWelcome() {
  return `<section class="gate">
    <div class="gate-logo">${LOGO_MARK}${WORDMARK}</div>
    <p class="gate-tag">Toutes les soirées fetish, en France puis en Europe.</p>
    <div class="card gate-card">
      <h1>Réservé aux adultes</h1>
      <p class="muted">EuroKink est réservée aux membres majeurs. Crée ton compte ou connecte-toi pour découvrir les soirées.</p>
      <a class="btn btn-red btn-block" href="#/compte/inscription">Créer un compte</a>
      <a class="btn btn-ghost btn-block" href="#/compte/connexion">Me connecter</a>
      <p class="tiny muted center"><a class="accent" href="#/infos/charte">Charte</a> · <a class="accent" href="#/infos/cgu">CGU</a> · <a class="accent" href="#/infos/confidentialite">Confidentialité</a></p>
    </div>
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
    <a class="card propose-cta" href="#/proposer"><div><strong>Tu organises une soirée ?</strong><div class="muted tiny">Propose-la gratuitement à la communauté.</div></div>${I.chevron}</a>
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
  const showCheckin = !checked && (isLive(e) || (state.testMode && !loggedIn()));
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
      ${showCheckin ? `<div class="checkin card"><div><strong>Tu es à la soirée ?</strong><div class="muted">Valide ta présence pour ton passeport.${state.testMode && !loggedIn() ? ' (mode test : sans GPS)' : ''}</div></div><button class="btn btn-red" data-act="checkin">${I.locate} Je suis sur place</button></div>` : ''}
      ${checked ? `<div class="checkin card done">${I.check}<div><strong>Présence validée</strong><div class="muted">Elle compte dans ton passeport.</div></div></div>` : ''}
      <div class="info-grid">${infos.map(([l, v]) => `<div class="info"><span>${l}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
      ${e.dressCodeDetails ? `<p class="dress muted">Dress code : ${esc(e.dressCodeDetails)}</p>` : ''}
      <div class="actions">
        ${actionBtn('fav', fav, I.heart, 'Favori')}
        ${actionBtn('reminder', rem, I.bell, 'Rappel')}
        ${actionBtn('alert', al, I.ticket, 'Alerte billets')}
        ${actionBtn('attend', att, I.check, 'J’y vais')}
      </div>
      <div class="card who"><div><strong>Qui y va ?</strong> <span class="muted">${attendeesLabel(attendeesOf(e))}</span></div><span class="muted tiny">Liste visible avec la communauté (V2)</span></div>
      <h2 class="section-title">À propos</h2>
      <p class="about">${esc(e.description)}</p>
      <h2 class="section-title">Pratique</h2>
      <div class="practical">
        <a class="line-btn" href="${mapsUrl(e)}" target="_blank" rel="noopener">${I.route}<span>Itinéraire jusqu’au lieu</span>${I.chevron}</a>
        <button class="line-btn" data-act="ics">${I.calendar}<span>Ajouter à mon calendrier</span>${I.chevron}</button>
        <a class="line-btn" href="${bookingUrl(e)}" target="_blank" rel="noopener">${I.bed}<span>Trouver un hébergement à proximité</span>${I.chevron}</a>
        <button class="line-btn" data-act="report">${I.flag}<span>Signaler une erreur sur cette soirée</span>${I.chevron}</button>
        ${isAdmin() ? `<button class="line-btn danger" data-act="adm-withdraw">${I.trash}<span>Retirer cette soirée (admin)</span>${I.chevron}</button>` : ''}
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
  if (loggedIn() && serverPassport) {
    return BADGES.map((b) => {
      const sp = serverPassport.find((x) => x.code === b.code) || { progress: 0 };
      return { ...b, progress: Math.min(b.goal, sp.progress || 0), earned: !!sp.earned_at };
    });
  }
  const evs = state.checkins.map((c) => eventById(c.id)).filter(Boolean);
  const perOrg = {};
  evs.forEach((e) => { perOrg[e.organizer.id] = (perOrg[e.organizer.id] || 0) + 1; });
  const progress = {
    first_steps: evs.length,
    tour_de_france: new Set(evs.filter((e) => e.country === 'FR').map((e) => e.venue.city)).size,
    globetrotter: new Set(evs.map((e) => e.country)).size,
    loyal: Math.max(0, ...Object.values(perOrg)),
    explorer: new Set(evs.flatMap((e) => e.types)).size,
    pioneer: 0
  };
  return BADGES.map((b) => ({ ...b, progress: Math.min(b.goal, progress[b.code] || 0), earned: (progress[b.code] || 0) >= b.goal }));
}
let selectedBadge = 'first_steps';

function viewProfile() {
  const pass = passport();
  const places = loggedIn() ? checkinInfo : state.checkins.map((c) => eventById(c.id)).filter(Boolean).map((e) => ({ city: e.venue.city, country: e.country }));
  const stats = [[places.length, 'soirées'], [new Set(places.map((x) => x.city)).size, 'villes'], [new Set(places.map((x) => x.country)).size, 'pays']];
  const sel = pass.find((b) => b.code === selectedBadge) || pass[0];
  const name = loggedIn() ? profile.pseudo : 'Invité';
  const pills = loggedIn() ? [profile.role === 'admin' ? '<span class="pill-red">ADMIN</span>' : '',
    pass.find((b) => b.code === 'pioneer' && b.earned) ? '<span class="pill-red">PIONNIER</span>' : '',
    `<span class="pill-grey">Membre n° ${String(profile.member_number).padStart(4, '0')}</span>`].join('') : '';
  const account = loggedIn() ? '' : `<div class="card account-cta"><h2>Crée ton compte EuroKink</h2>
      <p class="muted">Retrouve tes favoris, rappels et sorties sur tous tes appareils, et fais valider tes badges.</p>
      <div class="cta-row"><a class="btn btn-red" href="#/compte/inscription">Créer un compte</a><a class="btn btn-ghost" href="#/compte/connexion">Me connecter</a></div></div>`;
  return `<section class="screen"><div class="profile-top"><h1 class="page-title">Profil</h1><a class="icon-btn" href="#/parametres" aria-label="Paramètres">${I.gear}</a></div>
    ${account}<div class="profile-head">
      <div class="avatar">${esc(name.charAt(0).toUpperCase())}</div>
      <div><div class="pseudo">${esc(name)}</div><div class="muted">${esc(state.city)}</div>
      <div class="pills">${pills}</div></div></div>
    <div class="stats">${stats.map(([n, l]) => `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>
    <div class="section-head"><h2>Mon passeport</h2><span class="muted">${pass.filter((b) => b.earned).length} / ${pass.length} badges</span></div>
    <div class="badges">${pass.map((b) => `<button class="badge ${b.earned ? 'earned' : ''} ${b.code === sel.code ? 'sel' : ''}" data-badge="${b.code}" aria-pressed="${b.code === sel.code}">
        <svg viewBox="0 0 120 120" aria-hidden="true"><g class="b-studs">${studs()}</g><circle cx="60" cy="60" r="34" class="b-disc"/><g transform="translate(40 40) scale(1.6667)"><path d="${b.icon}" class="b-icon"/></g></svg>
        <span class="b-name">${esc(b.name)}</span><span class="b-bar"><span style="width:${Math.round((100 * b.progress) / b.goal)}%"></span></span></button>`).join('')}</div>
    <div class="card badge-detail"><strong>${esc(sel.name)}</strong> <span class="accent">${sel.earned ? '· obtenu' : `· ${sel.progress} / ${sel.goal}`}</span><p class="muted">${esc(sel.description)}</p></div>
    ${loggedIn() ? `<div class="practical flat">
      <a class="line-btn" href="#/proposer">${I.calendar}<span>Proposer une soirée</span>${I.chevron}</a>
      <a class="line-btn" href="#/mes-propositions">${I.doc}<span>Mes propositions</span>${I.chevron}</a>
      ${isAdmin() ? `<a class="line-btn" href="#/admin">${I.lock}<span>Espace admin</span>${adminCount() ? `<span class="count-pill">${adminCount()}</span>` : ''}${I.chevron}</a>` : ''}
    </div>` : ''}
    <a class="line-btn rounded" href="#/parametres">${I.gear}<span>Paramètres, confidentialité et informations</span>${I.chevron}</a>
  </section>`;
}

function viewSettings() {
  const opt = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
  const cityOpts = CITIES.map((c) => `<option ${c.name === state.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const sw = (name, on, label, help) => `<label class="toggle-line"><span>${label}${help ? `<span class="muted tiny block">${help}</span>` : ''}</span><input type="checkbox" class="switch" name="${name}" ${on ? 'checked' : ''}></label>`;
  const info = (slug, label) => `<a class="line-btn" href="#/infos/${slug}">${I.doc}<span>${label}</span>${I.chevron}</a>`;
  return `<section class="screen"><div class="sub-top"><a class="icon-btn" href="#/profil" aria-label="Retour au profil">${I.back}</a><h1 class="page-title">Paramètres</h1></div>
    ${loggedIn() ? `<h2 class="group-title">Mon compte</h2>
    <div class="practical">
      <div class="line-btn static">${I.mail}<span>${esc(sb.currentUser()?.email || '')}<span class="muted tiny block">Adresse de connexion</span></span></div>
      <button class="line-btn" data-act="logout">${I.user}<span>Me déconnecter</span>${I.chevron}</button>
      <button class="line-btn danger" data-act="delete-account">${I.trash}<span>Supprimer mon compte</span>${I.chevron}</button>
    </div>` : `<a class="line-btn rounded" href="#/compte/connexion">${I.user}<span>Me connecter ou créer un compte</span>${I.chevron}</a>`}
    <form id="settingsForm" class="settings-groups">
      <h2 class="group-title">Mon profil</h2>
      <div class="card settings">
        ${loggedIn() ? `<label class="field">Pseudo<input name="pseudo" maxlength="30" minlength="3" value="${esc(profile.pseudo)}" autocomplete="off"></label>` : ''}
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
        <p class="tiny muted">L’envoi des notifications arrive à la prochaine étape : tes choix sont déjà enregistrés.</p>
      </div>
      <h2 class="group-title">Passeport</h2>
      <div class="card settings">${loggedIn() ? '<p class="tiny muted">Connecté, ta présence est vérifiée par le serveur avec ta position : le mode test n’est disponible que sans compte.</p>' : sw('testMode', state.testMode, 'Mode test', 'Valider une présence sans GPS, pour essayer les badges')}</div>
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
    <div class="about-foot tiny muted center"><p>${BRAND} · version ${VERSION}</p><p>© ${COPYRIGHT_YEAR} ${BRAND} · Tous droits réservés</p><p>Phase de test · soirées fictives</p></div>
  </section>`;
}

function viewInfo(slug) {
  const page = PAGES[slug];
  if (!page) return `<section class="screen">${empty('Page introuvable.')}</section>`;
  return `<section class="screen"><div class="sub-top"><a class="icon-btn" href="${loggedIn() ? '#/parametres' : '#/'}" aria-label="Retour">${I.back}</a><h1 class="page-title small">${esc(page.title)}</h1></div>
    <article class="legal card">${page.html()}<p class="tiny muted">Dernière mise à jour : ${LEGAL_UPDATED}</p></article></section>`;
}

function viewLoading() {
  if (eventsError) {
    return `<section class="screen"><div class="card center-card"><h2>Impossible de charger les soirées</h2>
      <p class="muted">${esc(eventsError)}</p><button class="btn btn-red" data-act="retry">Réessayer</button></div></section>`;
  }
  return `<section class="screen"><div class="loading"><div class="spinner" aria-hidden="true"></div><p class="muted">Chargement des soirées…</p></div></section>`;
}

const cityOptions = () => CITIES.map((c) => `<option ${c.name === state.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const pwField = (name, label, auto) => `<label class="field">${label}<span class="pw"><input name="${name}" type="password" minlength="8" required autocomplete="${auto}"><button type="button" class="pw-toggle" data-act="pw" aria-label="Afficher le mot de passe">Afficher</button></span></label>`;
const accountTop = (title, back = '#/profil') => (!loggedIn() && back === '#/profil' ? accountTopRaw(title, '#/') : accountTopRaw(title, back));
const accountTopRaw = (title, back) => `<div class="sub-top"><a class="icon-btn" href="${back}" aria-label="Retour">${I.back}</a><h1 class="page-title small">${title}</h1></div>`;
let lastSignupEmail = '';

function viewAccount(mode) {
  if (loggedIn() && ['connexion', 'inscription'].includes(mode)) return viewProfile();
  switch (mode) {
    case 'inscription':
      return `<section class="screen">${accountTop('Créer mon compte')}
        <form id="signupForm" class="card settings" novalidate>
          <label class="field">Pseudo<input name="pseudo" required minlength="3" maxlength="30" autocomplete="off" placeholder="Ex. BlackRider"><span class="hint" id="pseudoHint">3 à 30 caractères, visible par la communauté.</span></label>
          <label class="field">Adresse e-mail<input name="email" type="email" required autocomplete="email" inputmode="email"><span class="hint">Jamais affichée, sert uniquement à te connecter.</span></label>
          ${pwField('password', 'Mot de passe (8 caractères minimum)', 'new-password')}
          <label class="field">Ville de référence<select name="city">${cityOptions()}</select></label>
          <label class="checkline"><input type="checkbox" name="adult" required><span>J’ai 18 ans ou plus.</span></label>
          <label class="checkline"><input type="checkbox" name="sensitive" required><span>J’accepte qu’EuroKink traite mes données, y compris celles pouvant révéler mon orientation sexuelle, pour me proposer des soirées et gérer mon compte (<a href="#/infos/confidentialite">Confidentialité</a>).</span></label>
          <label class="checkline"><input type="checkbox" name="terms" required><span>J’accepte les <a href="#/infos/cgu">CGU</a> et la <a href="#/infos/charte">charte de la communauté</a>.</span></label>
          <p class="form-error" id="formError" role="alert" hidden></p>
          <button class="btn btn-red btn-block" type="submit">Créer mon compte</button>
          <p class="tiny muted center">Déjà un compte ? <a class="accent" href="#/compte/connexion">Me connecter</a></p>
        </form></section>`;
    case 'verifier':
      return `<section class="screen">${accountTop('Vérifie tes e-mails')}
        <div class="card center-card">${I.mail}<h2>Plus qu’une étape !</h2>
          <p>Nous avons envoyé un lien de confirmation à <strong>${esc(lastSignupEmail || 'ton adresse')}</strong>. Clique dessus pour activer ton compte, puis reviens ici te connecter.</p>
          <p class="muted tiny">L’e-mail peut mettre quelques minutes à arriver et provient de « Supabase Auth ». Pense à regarder dans les indésirables.</p>
          <a class="btn btn-red" href="#/compte/connexion">Me connecter</a></div></section>`;
    case 'confirme':
      return `<section class="screen">${accountTop('Compte confirmé', '#/')}
        <div class="card center-card">${I.check}<h2>Ton adresse est confirmée</h2>
          <p>Bienvenue sur EuroKink ! Si tu utilises l’appli installée sur ton écran d’accueil, ouvre-la et connecte-toi avec ton e-mail et ton mot de passe.</p>
          <a class="btn btn-red" href="#/profil">Voir mon profil</a></div></section>`;
    case 'oubli':
      return `<section class="screen">${accountTop('Mot de passe oublié', '#/compte/connexion')}
        <form id="forgotForm" class="card settings">
          <p class="muted">Indique ton adresse e-mail : tu recevras un lien pour choisir un nouveau mot de passe.</p>
          <label class="field">Adresse e-mail<input name="email" type="email" required autocomplete="email" inputmode="email"></label>
          <p class="form-error" id="formError" role="alert" hidden></p>
          <button class="btn btn-red btn-block" type="submit">Recevoir le lien</button></form></section>`;
    case 'nouveau-mdp':
      return `<section class="screen">${accountTop('Nouveau mot de passe', '#/')}
        <form id="newPasswordForm" class="card settings">
          ${pwField('password', 'Nouveau mot de passe (8 caractères minimum)', 'new-password')}
          <p class="form-error" id="formError" role="alert" hidden></p>
          <button class="btn btn-red btn-block" type="submit">Enregistrer</button></form></section>`;
    case 'profil':
      return `<section class="screen">${accountTop('Finaliser mon profil')}
        <form id="completeForm" class="card settings">
          <p class="muted">Choisis ton pseudo pour terminer la création de ton compte.</p>
          <label class="field">Pseudo<input name="pseudo" required minlength="3" maxlength="30" autocomplete="off"></label>
          <label class="field">Ville de référence<select name="city">${cityOptions()}</select></label>
          <label class="checkline"><input type="checkbox" name="adult" required><span>J’ai 18 ans ou plus.</span></label>
          <label class="checkline"><input type="checkbox" name="sensitive" required><span>J’accepte qu’EuroKink traite mes données, y compris celles pouvant révéler mon orientation sexuelle (<a href="#/infos/confidentialite">Confidentialité</a>).</span></label>
          <p class="form-error" id="formError" role="alert" hidden></p>
          <button class="btn btn-red btn-block" type="submit">Terminer</button></form></section>`;
    default:
      return `<section class="screen">${accountTop('Connexion')}
        <form id="loginForm" class="card settings">
          <label class="field">Adresse e-mail<input name="email" type="email" required autocomplete="email" inputmode="email"></label>
          ${pwField('password', 'Mot de passe', 'current-password')}
          <p class="form-error" id="formError" role="alert" hidden></p>
          <button class="btn btn-red btn-block" type="submit">Me connecter</button>
          <a class="link center" href="#/compte/oubli">Mot de passe oublié ?</a>
          <p class="tiny muted center">Pas encore de compte ? <a class="accent" href="#/compte/inscription">Créer un compte</a></p>
        </form></section>`;
  }
}

// ---------------------------------------------------------------------------
// Proposer une soirée, mes propositions, espace admin
// ---------------------------------------------------------------------------
const DRAFT_KEY = 'ek.draft.v1';
let draft = (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {}; } catch (e) { return {}; } })();
const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* stockage plein */ } };
let addrResults = [];
let mySubs = null;          // mes propositions (null = à charger)
let adminData = null;       // { pending, reports } (null = à charger)
let adminTab = 'pending';
let loadingSubs = false, loadingAdmin = false, submitting = false;
const isAdmin = () => loggedIn() && profile.role === 'admin';
const dv = (k) => esc(draft[k] ?? '');
const selectField = (name, pairs, cur) => `<select name="${name}">${pairs.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const adminCount = () => (adminData ? adminData.pending.length + adminData.reports.length : 0);
const loadingScreen = (title, back) => `<section class="screen">${accountTopRaw(title, back)}<div class="loading"><div class="spinner" aria-hidden="true"></div></div></section>`;
const ADDR_FIELDS = ['address', 'postal_code', 'city', 'latitude', 'longitude', 'addrLabel'];

function viewSubmit() {
  const types = draft.types || [];
  const chosen = draft.latitude != null;
  return `<section class="screen">${accountTopRaw('Proposer une soirée', '#/profil')}
    <p class="muted">Ta soirée est vérifiée par l’équipe EuroKink avant d’être publiée. Les champs marqués * sont obligatoires.</p>
    <form id="submitForm" class="settings-groups" novalidate>
      <h2 class="group-title">La soirée</h2>
      <div class="card settings">
        <label class="field">Nom de la soirée *<input name="title" maxlength="120" value="${dv('title')}" placeholder="Ex. Black Rubber Night" autocomplete="off"></label>
        <div class="field">Types * <span class="hint">1 à 4 types</span>
          <div class="chips wrap">${EVENT_TYPES.map((t) => `<button type="button" class="chip ${types.includes(t.slug) ? 'on' : ''}" data-act="ptype" data-slug="${t.slug}" aria-pressed="${types.includes(t.slug)}">${esc(t.name)}</button>`).join('')}</div></div>
        <label class="field">Début *<input name="starts_at" type="datetime-local" value="${dv('starts_at')}"></label>
        <label class="field">Fin *<input name="ends_at" type="datetime-local" value="${dv('ends_at')}"></label>
        <label class="field">Fréquence${selectField('frequency', Object.entries(FREQ), draft.frequency || 'once')}</label>
        <label class="field">Description<textarea name="description" rows="5" maxlength="4000" placeholder="Ambiance, programme, infos utiles…">${dv('description')}</textarea></label>
      </div>
      <h2 class="group-title">Le lieu</h2>
      <div class="card settings">
        <label class="field">Nom du lieu *<input name="venue_name" maxlength="120" value="${dv('venue_name')}" placeholder="Ex. Le Dépôt" autocomplete="off"></label>
        <label class="checkline"><input type="checkbox" name="secret" ${draft.secret ? 'checked' : ''}><span>L’adresse n’est donnée qu’aux inscrits : seule la ville apparaîtra sur la carte</span></label>
        ${chosen ? `<div class="addr-chosen">${I.pin}<span>${esc(draft.addrLabel)}</span><button type="button" class="link" data-act="addr-clear">Modifier</button></div>`
          : `<label class="field">${draft.secret ? 'Ville *' : 'Adresse *'}<input id="addrInput" name="addr_q" autocomplete="off" value="${dv('addr_q')}" placeholder="${draft.secret ? 'Ex. Nantes' : 'Ex. 12 rue de la Paix, Nantes'}"><span class="hint">Tape au moins 3 lettres puis choisis dans la liste.</span></label><div id="addrList" class="addr-list"></div>`}
      </div>
      <h2 class="group-title">L’organisateur</h2>
      <div class="card settings">
        <label class="field">Nom de l’organisateur *<input name="organizer_name" maxlength="80" value="${dv('organizer_name')}" placeholder="Ex. Rubber Ouest" autocomplete="off"></label>
        <label class="field">C’est…${selectField('organizer_kind', Object.entries(ORG_KIND).map(([k, v]) => [k, k === 'other' ? 'Autre' : v]), draft.organizer_kind || 'association')}</label>
        <label class="field">Site internet<input name="organizer_website" type="url" inputmode="url" value="${dv('organizer_website')}" placeholder="https://" autocomplete="off"></label>
      </div>
      <h2 class="group-title">Entrée et dress code</h2>
      <div class="card settings">
        <label class="field">Prix d’entrée (€) *<input name="price" inputmode="decimal" value="${dv('price')}" placeholder="0 si gratuit"></label>
        <label class="field">Prix en prévente (€)<input name="presale_price" inputmode="decimal" value="${dv('presale_price')}"></label>
        <label class="field">Réservation${selectField('booking', Object.entries({ door_only: 'Sur place, sans réservation', recommended: 'Conseillée', required: 'Obligatoire' }), draft.booking || 'door_only')}</label>
        <label class="field">Lien de la billetterie<input name="ticket_url" type="url" inputmode="url" value="${dv('ticket_url')}" placeholder="https://" autocomplete="off"></label>
        <label class="field">Ouverture de la billetterie<input name="sales_open_at" type="datetime-local" value="${dv('sales_open_at')}"><span class="hint">Si les places ne sont pas encore en vente : les membres seront alertés.</span></label>
        <label class="field">Dress code${selectField('dress_code', Object.entries(DRESS), draft.dress_code || 'recommended')}</label>
        <label class="field">Précisions sur le dress code<input name="dress_code_details" maxlength="200" value="${dv('dress_code_details')}" placeholder="Ex. Cuir ou rubber, pas de jean" autocomplete="off"></label>
        <label class="field">Vestiaire${selectField('cloak', [['', 'Je ne sais pas'], ['no', 'Non'], ['free', 'Oui, gratuit'], ['paid', 'Oui, payant']], draft.cloak || '')}</label>
      </div>
      <div class="card settings">
        <label class="checkline"><input type="checkbox" name="certify" ${draft.certify ? 'checked' : ''}><span>Je certifie que cette soirée existe, qu’elle est réservée aux adultes et qu’elle respecte la <a href="#/infos/charte">charte</a>.</span></label>
        <p class="form-error" id="formError" role="alert" hidden></p>
        <button class="btn btn-red btn-block" type="submit">Envoyer ma proposition</button>
      </div>
    </form></section>`;
}

let geoTimer, geoSeq = 0;
function geocode(q) {
  clearTimeout(geoTimer);
  const list = $('#addrList');
  if (!list) return;
  if (q.trim().length < 3) { list.innerHTML = ''; addrResults = []; return; }
  geoTimer = setTimeout(async () => {
    const seq = ++geoSeq;
    let feats = [], failed = false;
    try {
      const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5&autocomplete=1${draft.secret ? '&type=municipality' : ''}`);
      if (!r.ok) throw new Error(String(r.status));
      feats = (await r.json()).features || [];
    } catch (e) { failed = true; }
    const box = $('#addrList');
    if (seq !== geoSeq || !box) return;
    addrResults = feats.filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {};
      const [lon, lat] = f.geometry.coordinates;
      const town = p.type === 'municipality';
      return { label: p.label || p.name, address: town ? '' : (p.name || ''), postal_code: p.postcode || '', city: p.city || p.name || '', lat, lon };
    });
    if (!addrResults.length) {
      // Secours : centre d'une grande ville connue
      const ql = q.trim().toLowerCase();
      addrResults = CITIES.filter((c) => ql.includes(c.name.toLowerCase()) || c.name.toLowerCase().startsWith(ql))
        .slice(0, 3).map((c) => ({ label: `${c.name} (centre-ville)`, address: '', postal_code: '', city: c.name, lat: c.lat, lon: c.lon }));
    }
    box.innerHTML = addrResults.length
      ? addrResults.map((a, i) => `<button type="button" class="addr-opt" data-act="addr-pick" data-i="${i}">${esc(a.label)}</button>`).join('')
      : `<p class="hint">${failed ? 'Recherche d’adresse indisponible : tape le nom d’une grande ville.' : 'Aucune adresse trouvée : vérifie l’orthographe.'}</p>`;
  }, 350);
}

const numOrNull = (v) => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? null : Number(s); };
const isoOrNull = (v) => (v ? new Date(v).toISOString() : null);

async function submitEvent(form) {
  if (submitting) return;
  const fail = (m) => { formError(form, m); const el = $('#formError'); if (el) el.scrollIntoView({ block: 'center' }); };
  const d = draft;
  const title = String(d.title || '').trim();
  if (title.length < 3) return fail('Indique le nom de la soirée (3 caractères minimum).');
  if (!(d.types || []).length) return fail('Choisis au moins un type de soirée.');
  if (!d.starts_at || !d.ends_at) return fail('Indique la date et l’heure de début et de fin.');
  if (new Date(d.starts_at) < new Date()) return fail('La soirée doit être à venir.');
  if (new Date(d.ends_at) <= new Date(d.starts_at)) return fail('La fin doit être après le début.');
  if (String(d.venue_name || '').trim().length < 2) return fail('Indique le nom du lieu.');
  if (d.latitude == null) return fail(d.secret ? 'Choisis la ville dans la liste proposée.' : 'Choisis l’adresse dans la liste proposée.');
  if (String(d.organizer_name || '').trim().length < 2) return fail('Indique le nom de l’organisateur.');
  const price = numOrNull(d.price), presale = numOrNull(d.presale_price);
  if (price === null || Number.isNaN(price) || price < 0) return fail('Indique le prix d’entrée (0 si gratuit).');
  if (presale !== null && (Number.isNaN(presale) || presale < 0)) return fail('Prix en prévente invalide.');
  for (const [k, label] of [['ticket_url', 'Le lien de la billetterie'], ['organizer_website', 'Le site de l’organisateur']]) {
    if (d[k] && !/^https?:\/\/\S+$/i.test(String(d[k]).trim())) return fail(`${label} doit commencer par https://`);
  }
  if (!d.certify) return fail('Coche la case de confirmation en bas du formulaire.');
  const p = {
    title, types: d.types, starts_at: isoOrNull(d.starts_at), ends_at: isoOrNull(d.ends_at), frequency: d.frequency || 'once',
    description: d.description || '', venue_name: String(d.venue_name).trim(), address: d.secret ? '' : (d.address || ''),
    postal_code: d.postal_code || '', city: d.city, latitude: d.latitude, longitude: d.longitude,
    organizer_name: String(d.organizer_name).trim(), organizer_kind: d.organizer_kind || 'association', organizer_website: (d.organizer_website || '').trim(),
    price, presale_price: presale, booking: d.booking || 'door_only', ticket_url: (d.ticket_url || '').trim(), sales_open_at: isoOrNull(d.sales_open_at),
    dress_code: d.dress_code || 'recommended', dress_code_details: d.dress_code_details || '',
    has_cloakroom: d.cloak ? d.cloak !== 'no' : null, cloakroom_paid: d.cloak === 'paid' ? true : d.cloak === 'free' ? false : null
  };
  const btn = form.querySelector('button[type=submit]');
  submitting = true; btn.disabled = true; btn.textContent = 'Envoi…'; formError(form, '');
  try {
    const r = await sb.rpc('submit_event', { p });
    draft = {}; saveDraft(); mySubs = null; adminData = null;
    toast(r && r.status === 'published' ? 'Soirée publiée !' : 'Merci ! Ta soirée sera vérifiée avant publication.');
    if (r && r.status === 'published') refreshEvents();
    navigate('#/mes-propositions');
  } catch (err) {
    fail(err.message);
  } finally {
    submitting = false;
    if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = 'Envoyer ma proposition'; }
  }
}

const SUB_STATUS = { pending: ['pill-grey', 'En attente'], published: ['pill-red', 'Publiée'], rejected: ['pill-grey', 'Refusée'], cancelled: ['pill-grey', 'Annulée'] };

async function loadMySubs() {
  if (loadingSubs) return;
  loadingSubs = true;
  try { mySubs = await sb.rpc('my_submissions'); } catch (err) { mySubs = []; toast(err.message); }
  loadingSubs = false;
  if (location.hash.startsWith('#/mes-propositions')) render();
}

function viewMySubmissions() {
  if (mySubs === null) { loadMySubs(); return loadingScreen('Mes propositions', '#/profil'); }
  const cards = mySubs.map((s) => {
    const [cls, label] = SUB_STATUS[s.status] || ['pill-grey', s.status];
    return `<div class="card sub-card"><div class="sub-head"><strong>${esc(s.title)}</strong><span class="${cls}">${label}</span></div>
      <div class="muted tiny">${dayLabel(s.starts_at)} · ${timeLabel(s.starts_at)} · ${esc(s.city)}</div>
      ${s.status === 'pending' ? '<p class="tiny muted">L’équipe EuroKink la vérifie avant publication.</p>' : ''}
      ${s.status === 'rejected' && s.rejection_reason ? `<p class="tiny">Motif : ${esc(s.rejection_reason)}</p>` : ''}
      ${s.status === 'published' && eventById(s.id) ? `<a class="link" href="#/soiree/${s.id}">Voir la fiche</a>` : ''}</div>`;
  }).join('');
  return `<section class="screen">${accountTopRaw('Mes propositions', '#/profil')}
    <a class="btn btn-red btn-block" href="#/proposer">Proposer une soirée</a>
    ${cards || empty('Tu n’as encore proposé aucune soirée.')}</section>`;
}

async function loadAdmin() {
  if (loadingAdmin || !isAdmin()) return;
  loadingAdmin = true;
  try { adminData = await sb.rpc('admin_dashboard'); } catch (err) { adminData = { pending: [], reports: [] }; toast(err.message); }
  loadingAdmin = false;
  if (/^#\/(admin|profil)/.test(location.hash)) render();
}

function adminPendingCard(p) {
  const o = p.organizer, v = p.venue;
  const multi = new Date(p.ends_at).toDateString() !== new Date(p.starts_at).toDateString();
  const when = `${dayLabel(p.starts_at)} · ${timeLabel(p.starts_at)} – ${multi ? `${fDate.format(new Date(p.ends_at))} ` : ''}${timeLabel(p.ends_at)}`;
  const osm = `https://www.openstreetmap.org/?mlat=${v.latitude}&mlon=${v.longitude}#map=16/${v.latitude}/${v.longitude}`;
  const cloak = p.has_cloakroom == null ? 'Vestiaire ?' : p.has_cloakroom ? `Vestiaire ${p.cloakroom_paid ? 'payant' : 'gratuit'}` : 'Sans vestiaire';
  return `<article class="card adm-card">
    <div class="sub-head"><strong>${esc(p.title)}</strong><span class="pill-grey">${p.source === 'import' ? 'Import' : 'Proposée'}</span></div>
    <div class="muted tiny">par ${esc(p.submitter || 'le robot d’import')} · reçue le ${fDate.format(new Date(p.created_at))}</div>
    <div class="pills">${(p.types || []).map((t) => `<span class="pill-red">${esc(typeName(t).toUpperCase())}</span>`).join('')}</div>
    <div class="adm-facts">
      <div>${I.calendar}<span>${when}${p.frequency !== 'once' ? ` · ${FREQ[p.frequency]}` : ''}</span></div>
      <div>${I.pin}<span>${esc(v.name)}<span class="muted block">${esc([v.address, v.postal_code, v.city].filter(Boolean).join(' '))}</span></span><a class="link" href="${osm}" target="_blank" rel="noopener">Carte</a></div>
      <div>${I.users}<span>${esc(o.name)} · ${ORG_KIND[o.kind] || ''} ${o.is_verified ? I.verified : '<span class="muted">(non vérifié)</span>'}</span>${o.website ? `<a class="link" href="${esc(o.website)}" target="_blank" rel="noopener">Site</a>` : ''}</div>
      <div>${I.ticket}<span>${priceLabel(Number(p.price))}${p.presale_price != null ? ` (${priceLabel(Number(p.presale_price))} en prévente)` : ''} · Réservation ${BOOKING[p.booking].toLowerCase()}${p.sales_open_at ? ` · billets le ${fDate.format(new Date(p.sales_open_at))}` : ''}</span>${p.ticket_url ? `<a class="link" href="${esc(p.ticket_url)}" target="_blank" rel="noopener">Billets</a>` : ''}</div>
      <div>${I.check}<span>Dress code ${DRESS[p.dress_code].toLowerCase()}${p.dress_code_details ? ` : ${esc(p.dress_code_details)}` : ''} · ${cloak}</span></div>
    </div>
    ${p.description ? `<p class="adm-desc">${esc(p.description)}</p>` : ''}
    <div class="adm-actions"><button class="btn btn-red" data-act="adm-publish" data-id="${p.id}">Publier</button><button class="btn btn-ghost" data-act="adm-reject" data-id="${p.id}">Refuser</button></div>
    ${o.is_verified ? '' : `<button class="link" data-act="adm-trust" data-id="${p.id}" data-org="${o.id}">Publier et faire confiance à « ${esc(o.name)} »</button>`}
  </article>`;
}

function adminReportCard(r) {
  return `<article class="card adm-card">
    <div class="sub-head"><strong>${esc(r.reason)}</strong><span class="pill-grey">${r.target_type === 'event' ? 'Soirée' : r.target_type === 'profile' ? 'Profil' : 'Organisateur'}</span></div>
    <div class="muted tiny">par ${esc(r.reporter || 'membre supprimé')} · le ${fDate.format(new Date(r.created_at))}</div>
    ${r.details && r.details !== r.reason ? `<p class="adm-desc">${esc(r.details)}</p>` : ''}
    ${r.event_title ? `<div class="adm-facts"><div>${I.calendar}<span>${esc(r.event_title)}</span>${eventById(r.target_id) ? `<a class="link" href="#/soiree/${r.target_id}">Voir</a>` : ''}</div></div>` : ''}
    <div class="adm-actions"><button class="btn btn-red" data-act="adm-report" data-id="${r.id}">Traité</button><button class="btn btn-ghost" data-act="adm-report" data-id="${r.id}" data-dismiss="1">Ignorer</button></div>
  </article>`;
}

function viewAdmin() {
  if (!isAdmin()) return `<section class="screen">${accountTopRaw('Espace admin', '#/profil')}${empty('Réservé à l’administrateur.')}</section>`;
  if (adminData === null) { loadAdmin(); return loadingScreen('Espace admin', '#/profil'); }
  const { pending, reports } = adminData;
  const tab = (k, label, n) => `<button class="${adminTab === k ? 'on' : ''}" data-act="adm-tab" data-tab="${k}" aria-pressed="${adminTab === k}">${label}${n ? ` <span class="count-pill">${n}</span>` : ''}</button>`;
  const body = adminTab === 'pending'
    ? (pending.map(adminPendingCard).join('') || empty('Aucune soirée à valider. Tout est à jour !'))
    : (reports.map(adminReportCard).join('') || empty('Aucun signalement en cours.'));
  return `<section class="screen">${accountTopRaw('Espace admin', '#/profil')}
    <div class="seg seg-btn">${tab('pending', 'À valider', pending.length)}${tab('reports', 'Signalements', reports.length)}</div>
    ${body}</section>`;
}

async function adminRun(btn, fn, msg) {
  const card = btn.closest('.adm-card');
  card && card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try { await fn(); toast(msg); adminData = null; mySubs = null; render(); refreshEvents(); } catch (err) {
    toast(err.message);
    card && card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
}

function adminAct(act) {
  const id = act.dataset.id;
  switch (act.dataset.act) {
    case 'adm-tab': adminTab = act.dataset.tab; render(); break;
    case 'adm-publish': adminRun(act, () => sb.rpc('moderate_event', { p_event: id, p_publish: true }), 'Soirée publiée'); break;
    case 'adm-trust':
      adminRun(act, async () => {
        await sb.update('organizers', `id=eq.${act.dataset.org}`, { is_verified: true });
        await sb.rpc('moderate_event', { p_event: id, p_publish: true });
      }, 'Soirée publiée, organisateur vérifié');
      break;
    case 'adm-reject': {
      const reason = prompt('Motif du refus (visible par la personne qui l’a proposée) :', 'Informations incomplètes ou invérifiables');
      if (reason === null) return;
      adminRun(act, () => sb.rpc('moderate_event', { p_event: id, p_publish: false, p_reason: reason.trim().slice(0, 300) || null }), 'Soirée refusée');
      break;
    }
    case 'adm-report': adminRun(act, () => sb.rpc('handle_report', { p_report: id, p_dismiss: !!act.dataset.dismiss }), act.dataset.dismiss ? 'Signalement ignoré' : 'Signalement traité'); break;
    default: break;
  }
}

async function adminWithdraw(e) {
  if (!e || !isAdmin()) return;
  const reason = prompt(`Retirer « ${e.title} » de l’appli ? Indique le motif :`, 'Soirée annulée ou informations erronées');
  if (reason === null) return;
  try {
    await sb.rpc('moderate_event', { p_event: e.id, p_publish: false, p_reason: reason.trim().slice(0, 300) || null });
    toast('Soirée retirée'); adminData = null;
    await refreshEvents();
    navigate('#/');
  } catch (err) { toast(err.message); }
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
  const hash = location.hash || '#/';
  const [, route, param] = hash.split('/');
  if (!loggedIn() && route !== 'compte' && route !== 'infos') {
    if (mapCleanup) { mapCleanup(); mapCleanup = null; }
    view.innerHTML = sb.getSession() && !userChecked ? viewLoading() : viewWelcome();
    nav.hidden = true;
    return;
  }
  let html;
  let active = '#/';
  const needsEvents = ['', undefined, 'explorer', 'carte', 'soiree', 'favoris'].includes(route);
  if (needsEvents && !eventsReady) {
    if (mapCleanup) { mapCleanup(); mapCleanup = null; }
    $('#view').innerHTML = viewLoading();
    nav.hidden = false;
    nav.innerHTML = NAV.map(([href, label, icon]) => `<a href="${href}">${icon}<span>${label}</span></a>`).join('');
    return;
  }
  switch (route) {
    case 'compte': html = viewAccount(param); active = '#/profil'; break;
    case 'explorer': html = viewExplorer(); active = '#/explorer'; break;
    case 'carte': html = viewMap(); active = '#/explorer'; break;
    case 'soiree': html = viewEvent(decodeURIComponent(param || '')); active = null; break;
    case 'favoris': html = viewFavorites(); active = '#/favoris'; break;
    case 'communaute': html = viewCommunity(); active = '#/communaute'; break;
    case 'profil': html = viewProfile(); active = '#/profil'; break;
    case 'parametres': html = viewSettings(); active = '#/profil'; break;
    case 'infos': html = viewInfo(param); active = '#/profil'; break;
    case 'proposer': html = viewSubmit(); active = '#/profil'; break;
    case 'mes-propositions': html = viewMySubmissions(); active = '#/profil'; break;
    case 'admin': html = viewAdmin(); active = '#/profil'; break;
    default: html = viewHome();
  }
  if (mapCleanup) { mapCleanup(); mapCleanup = null; }
  view.innerHTML = html;
  nav.hidden = active === null || !loggedIn();
  nav.innerHTML = NAV.map(([href, label, icon]) => `<a href="${href}" class="${href === active ? 'active' : ''}" ${href === active ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`).join('');
  if (route === 'explorer') renderResults();
  if (route === 'carte') initMap();
}

function navigate(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

// Bloque le zoom par pincement et double toucher (Safari iOS ignore l'interdiction du viewport)
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (ev) => ev.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (ev) => { if (ev.touches.length > 1 && !ev.target.closest('#map')) ev.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (ev) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && !ev.target.closest('#map, input, select, textarea, button, a, label')) ev.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

let navDepth = 0;   // nombre de navigations dans l'appli (pour le bouton Retour)
window.addEventListener('hashchange', () => {
  // Lien reçu par e-mail ouvert alors que l'appli est déjà affichée : on relance pour le traiter
  if (/access_token=|error_description=/.test(location.hash)) { location.reload(); return; }
  navDepth += 1; render(); window.scrollTo(0, 0);
});

// ---------------------------------------------------------------------------
// Interactions (délégation d'événements)
// ---------------------------------------------------------------------------
document.addEventListener('submit', (ev) => {
  const form = ev.target;
  if (form.id === 'gateForm') {
    ev.preventDefault();
    const data = new FormData(form);
    state.adult = true;
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
  } else if (form.id === 'submitForm') {
    ev.preventDefault();
    submitEvent(form);
  } else if (['signupForm', 'loginForm', 'forgotForm', 'newPasswordForm', 'completeForm'].includes(form.id)) {
    ev.preventDefault();
    submitAccountForm(form);
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
    case 'fav': toggleAction('favorites', id, 'Ajoutée à tes favoris', 'Retirée de tes favoris'); break;
    case 'reminder': toggleAction('reminders', id, `Rappel programmé ${reminderLabel()}`, 'Rappel supprimé'); break;
    case 'alert': toggleAction('alerts', id, 'Alerte activée : tu seras prévenu à l’ouverture des places', 'Alerte désactivée'); break;
    case 'attend': toggleAction('attending', id, 'Bonne soirée ! Elle est dans « Mes soirées »', 'Participation retirée'); break;
    case 'logout': logout(); break;
    case 'delete-account': deleteAccount(); break;
    case 'retry': eventsError = ''; render(); refreshEvents(); break;
    case 'pw': { const input = act.parentElement.querySelector('input'); const show = input.type === 'password'; input.type = show ? 'text' : 'password'; act.textContent = show ? 'Masquer' : 'Afficher'; break; }
    case 'checkin': checkIn(e); break;
    case 'ics': downloadIcs(e); break;
    case 'export': exportData(); break;
    case 'report': reportEvent(e); break;
    case 'adm-withdraw': adminWithdraw(e); break;
    case 'adm-tab': case 'adm-publish': case 'adm-trust': case 'adm-reject': case 'adm-report': adminAct(act); break;
    case 'ptype': {
      const t = act.dataset.slug;
      const list = draft.types || [];
      if (!list.includes(t) && list.length >= 4) { toast('4 types au maximum'); break; }
      draft.types = list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
      saveDraft();
      act.classList.toggle('on'); act.setAttribute('aria-pressed', draft.types.includes(t));
      break;
    }
    case 'addr-pick': {
      const a = addrResults[Number(act.dataset.i)];
      if (!a) break;
      Object.assign(draft, { address: a.address, postal_code: a.postal_code, city: a.city, latitude: a.lat, longitude: a.lon, addrLabel: a.label });
      saveDraft(); render();
      break;
    }
    case 'addr-clear': ADDR_FIELDS.forEach((k) => delete draft[k]); saveDraft(); render(); break;
    case 'reset':
      if (confirm(loggedIn() ? 'Effacer les réglages de cet appareil et te déconnecter ? Ton compte et tes données en ligne sont conservés.' : 'Effacer tes favoris, rappels, sorties et réglages sur cet appareil ?')) {
        sb.forgetSession();
        profile = null; serverPassport = null; checkinInfo = [];
        clearEvents();
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
  if (t.form && t.form.id === 'submitForm' && t.name && t.name !== 'secret') {
    draft[t.name] = t.type === 'checkbox' ? t.checked : t.value; saveDraft();
    if (t.id === 'addrInput') geocode(t.value);
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'fCity') { state.city = t.value; save(); renderResults(); }
  if (t.id === 'fRadius') { filters.radius = Number(t.value); renderResults(); }
  if (t.id === 'fPeriod') { filters.period = t.value; renderResults(); }
  if (t.id === 'fNoBooking') { filters.noBooking = t.checked; renderResults(); }
  if (t.id === 'fCloak') { filters.cloakroom = t.checked; renderResults(); }
  if (t.form && t.form.id === 'submitForm' && t.name) {
    if (t.name === 'secret') { draft.secret = t.checked; ADDR_FIELDS.forEach((k) => delete draft[k]); saveDraft(); render(); return; }
    draft[t.name] = t.type === 'checkbox' ? t.checked : t.value; saveDraft();
    return;
  }
  if (t.form && t.form.id === 'settingsForm') {
    const f = t.form;
    const before = { pseudo: profile && profile.pseudo, city: state.city, visibility: state.visibility, invisible: state.invisible };
    state.city = f.city.value;
    state.defaultRadius = Number(f.defaultRadius.value);
    filters.radius = state.defaultRadius;
    state.visibility = f.visibility.value;
    state.invisible = f.invisible.checked;
    state.remindersOn = f.remindersOn.checked;
    state.reminderTiming = f.reminderTiming.value;
    state.ticketAlertsOn = f.ticketAlertsOn.checked;
    state.neutralNotifs = f.neutralNotifs.checked;
    if (f.testMode) state.testMode = f.testMode.checked;
    save();
    if (loggedIn()) {
      const patch = {};
      const pseudo = f.pseudo ? f.pseudo.value.trim().slice(0, 30) : profile.pseudo;
      if (pseudo !== before.pseudo) patch.pseudo = pseudo;
      if (state.city !== before.city) patch.city = state.city;
      if (state.visibility !== before.visibility) patch.attendance_visibility = state.visibility;
      if (state.invisible !== before.invisible) patch.is_invisible = state.invisible;
      if (Object.keys(patch).length) {
        sb.update('profiles', `id=eq.${profile.id}`, patch)
          .then((rows) => { if (rows && rows[0]) { profile = rows[0]; state.pseudo = profile.pseudo; save(); } toast('Réglages enregistrés'); })
          .catch((err) => { toast(err.message); if (f.pseudo) f.pseudo.value = profile.pseudo; });
        return;
      }
    }
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
  if (state.testMode && !loggedIn()) { validatePresence(e); return; }
  if (!('geolocation' in navigator)) { toast('La localisation n’est pas disponible sur cet appareil.'); return; }
  toast('Vérification de ta position…');
  navigator.geolocation.getCurrentPosition((pos) => {
    // La position sert uniquement à ce calcul : elle n'est ni enregistrée ni envoyée.
    if (loggedIn()) { serverCheckIn(e, pos.coords.latitude, pos.coords.longitude); return; }
    const d = distanceKm(pos.coords.latitude, pos.coords.longitude, e.venue.lat, e.venue.lon) * 1000;
    if (d <= CHECKIN_RADIUS_M) validatePresence(e);
    else toast(tooFar(d));
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
  const data = { application: 'EuroKink', version: VERSION, exportedAt: new Date().toISOString(), ...state,
    compte: loggedIn() ? { email: sb.currentUser()?.email, profil: profile, presences: checkinInfo, passeport: serverPassport } : null };
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
// Données Supabase : soirées, compte, synchronisation
// ---------------------------------------------------------------------------
const ORG_KIND = { association: 'Association', group: 'Groupe', club: 'Club', bar: 'Bar', other: 'Organisateur' };
const EVENT_SELECT = ['id', 'title', 'description', 'starts_at', 'ends_at', 'dress_code', 'dress_code_details', 'price', 'presale_price',
  'booking', 'ticket_url', 'sales_open_at', 'is_sold_out', 'has_cloakroom', 'cloakroom_paid', 'frequency', 'languages',
  'organizer:organizers(id,name,kind,is_verified)', 'venue:venues(name,city,country,latitude,longitude)',
  'types:event_event_types(type:event_types(slug))'].join(',');

function mapEvent(r, counts) {
  return {
    id: r.id, title: r.title, description: r.description || '',
    startsAt: r.starts_at, endsAt: r.ends_at,
    organizer: { id: r.organizer.id, name: r.organizer.name, kind: ORG_KIND[r.organizer.kind] || 'Organisateur', verified: r.organizer.is_verified },
    venue: { name: r.venue.name, city: r.venue.city, lat: r.venue.latitude, lon: r.venue.longitude },
    country: r.venue.country,
    types: (r.types || []).map((t) => t.type && t.type.slug).filter(Boolean),
    dressCode: r.dress_code, dressCodeDetails: r.dress_code_details,
    price: Number(r.price), presalePrice: r.presale_price == null ? null : Number(r.presale_price),
    booking: r.booking, ticketUrl: r.ticket_url, salesOpenAt: r.sales_open_at, soldOut: r.is_sold_out,
    hasCloakroom: r.has_cloakroom, cloakroomPaid: r.cloakroom_paid, frequency: r.frequency,
    languages: r.languages || [], attendees: counts.get(r.id) || 0
  };
}

function setEvents(list) {
  EVENTS = list;
  const top = [...list].sort((a, b) => b.attendees - a.attendees || new Date(a.startsAt) - new Date(b.startsAt))[0];
  EVENTS.forEach((e) => { e.featured = e === top; });
  eventsReady = true;
}

async function loadEvents() {
  const now = encodeURIComponent(new Date().toISOString());
  const [rows, counts] = await Promise.all([
    sb.select('events', `select=${EVENT_SELECT}&status=eq.published&ends_at=gte.${now}&order=starts_at.asc`),
    sb.rpc('event_attendee_counts').catch(() => [])
  ]);
  const map = new Map((counts || []).map((c) => [c.event_id, Number(c.attendees)]));
  setEvents((rows || []).map((r) => mapEvent(r, map)));
  try { localStorage.setItem(EVENTS_CACHE, JSON.stringify({ at: Date.now(), events: EVENTS })); } catch (e) { /* stockage plein */ }
}

function clearEvents() {
  EVENTS = []; eventsReady = false; eventsError = '';
  try { localStorage.removeItem(EVENTS_CACHE); } catch (e) { /* rien */ }
}

async function refreshEvents() {
  if (!sb.getSession()) return;
  try { await loadEvents(); eventsError = ''; } catch (err) { if (!eventsReady) eventsError = err.message; }
  render();
}

function readEventsCache() {
  try {
    const c = JSON.parse(localStorage.getItem(EVENTS_CACHE) || 'null');
    if (c && Array.isArray(c.events)) setEvents(c.events.filter((e) => new Date(e.endsAt) > new Date()));
  } catch (e) { /* cache illisible */ }
}

const TABLE_OF = { favorites: 'favorites', reminders: 'reminders', alerts: 'ticket_alerts', attending: 'attendances' };

function reminderTime(e) {
  const s = new Date(e.startsAt);
  if (state.reminderTiming === 'h2') return new Date(s.getTime() - 2 * 3600000).toISOString();
  const d = new Date(s); d.setHours(0, 0, 0, 0);
  if (state.reminderTiming === 'day14') { d.setHours(14); return d.toISOString(); }
  d.setDate(d.getDate() - 1); d.setHours(18);
  return d.toISOString();
}

async function pushToggle(list, id, on) {
  const uid = profile.id;
  if (on) {
    const row = { user_id: uid, event_id: id };
    if (list === 'reminders') row.remind_at = reminderTime(eventById(id));
    await sb.insert(TABLE_OF[list], row, { ignoreDuplicates: true, onConflict: 'user_id,event_id' });
  } else {
    await sb.remove(TABLE_OF[list], `user_id=eq.${uid}&event_id=eq.${id}`);
  }
}

function toggleAction(list, id, onMsg, offMsg) {
  const on = toggleIn(list, id);
  const e = eventById(id);
  if (loggedIn() && list === 'attending' && e) e.attendees = Math.max(0, e.attendees + (on ? 1 : -1));
  toast(on ? onMsg : offMsg);
  render();
  if (!loggedIn()) return;
  pushToggle(list, id, on).catch((err) => {
    toggleIn(list, id);
    if (list === 'attending' && e) e.attendees = Math.max(0, e.attendees + (on ? -1 : 1));
    render();
    toast(`Non enregistré : ${err.message}`);
  });
}

// Charge le profil et les données du membre connecté
async function loadUser() {
  const s = sb.getSession();
  if (!s || !s.user) { profile = null; return; }
  const uid = s.user.id;
  let rows = await sb.select('profiles', `id=eq.${uid}&select=*`);
  if (!rows.length) {
    const md = s.user.user_metadata || {};
    if (!md.pseudo) { profile = null; return 'incomplete'; }
    rows = await sb.insert('profiles', {
      id: uid, pseudo: md.pseudo, city: md.city || state.city,
      adult_confirmed_at: md.adult_confirmed_at || new Date().toISOString(),
      sensitive_consent_at: md.sensitive_consent_at || new Date().toISOString()
    }, { returnRow: true });
  }
  profile = rows[0];
  state.adult = true;
  state.pseudo = profile.pseudo;
  if (profile.city) state.city = profile.city;
  state.visibility = profile.attendance_visibility;
  state.invisible = profile.is_invisible;

  // Ce que l'invité avait mis de côté sur ce téléphone rejoint son compte
  const pending = Object.keys(TABLE_OF).flatMap((list) => state[list].map((id) => [list, id]));
  await Promise.all(pending.map(([list, id]) => (eventById(id) ? pushToggle(list, id, true).catch(() => {}) : null)));

  const ids = (table) => sb.select(table, `user_id=eq.${uid}&select=event_id`).then((r) => r.map((x) => x.event_id));
  [state.favorites, state.reminders, state.alerts, state.attending] = await Promise.all(
    [ids('favorites'), ids('reminders'), ids('ticket_alerts'), ids('attendances')]);
  await loadPassport();
  save();
  if (profile.role === 'admin') loadAdmin();
  return 'ok';
}

async function loadPassport() {
  const ck = await sb.select('checkins', `user_id=eq.${profile.id}&select=event_id,validated_at,event:events(venue:venues(city,country))`);
  checkinInfo = ck.map((c) => ({ id: c.event_id, city: c.event && c.event.venue && c.event.venue.city, country: c.event && c.event.venue && c.event.venue.country }));
  state.checkins = ck.map((c) => ({ id: c.event_id, at: c.validated_at }));
  serverPassport = await sb.rpc('passport', {});
}

const tooFar = (d) => `Tu es à ${d < 10000 ? `${Math.round(d)} m` : `${Math.round(d / 1000)} km`} du lieu : rapproche-toi pour valider.`;

async function serverCheckIn(e, lat, lon) {
  try {
    const [r] = await sb.rpc('check_in', { p_event: e.id, p_lat: lat, p_lon: lon });
    if (r.result === 'validated') {
      await loadPassport();
      if (!state.attending.includes(e.id)) state.attending.push(e.id);
      save();
      const names = (r.new_badges || []).map((c) => (BADGES.find((b) => b.code === c) || {}).name).filter(Boolean);
      toast(names.length ? `Présence validée ! Nouveau badge : ${names.join(', ')}` : 'Présence validée !');
      render();
    } else if (r.result === 'too_far') toast(tooFar(r.distance_m));
    else if (r.result === 'outside_time_window') toast('La validation ouvre une heure avant le début de la soirée.');
    else if (r.result === 'already_validated') { toast('Ta présence est déjà validée.'); await loadPassport(); render(); }
  } catch (err) { toast(err.message); }
}

async function reportEvent(e) {
  if (!loggedIn()) { toast('Connecte-toi pour signaler une soirée.'); return; }
  const reason = prompt('Que faut-il corriger sur cette soirée ? (date, prix, lieu, contenu inapproprié…)');
  if (!reason || reason.trim().length < 3) return;
  try {
    await sb.insert('reports', { reporter_id: profile.id, target_type: 'event', target_id: e.id, reason: reason.trim().slice(0, 100), details: reason.trim().slice(0, 1000) });
    toast('Merci ! Ton signalement a été transmis.');
  } catch (err) { toast(err.message); }
}

async function logout() {
  await sb.signOut();
  profile = null; serverPassport = null; checkinInfo = [];
  mySubs = null; adminData = null; draft = {}; saveDraft();
  Object.assign(state, { pseudo: '', favorites: [], reminders: [], alerts: [], attending: [], checkins: [] });
  save();
  clearEvents();
  toast('Tu es déconnecté.');
  navigate('#/');
}

async function deleteAccount() {
  if (!confirm('Supprimer définitivement ton compte EuroKink ? Ton profil, tes favoris, tes sorties et tes badges seront effacés.')) return;
  if (!confirm('Dernière confirmation : cette action est irréversible.')) return;
  try {
    await sb.rpc('delete_my_account', {});
    sb.forgetSession();
    profile = null; serverPassport = null; checkinInfo = [];
    Object.assign(state, { pseudo: '', favorites: [], reminders: [], alerts: [], attending: [], checkins: [] });
    save();
    clearEvents();
    toast('Ton compte a été supprimé.');
    navigate('#/');
  } catch (err) { toast(err.message); }
}

function formError(form, msg) {
  const el = form.querySelector('#formError');
  if (el) { el.textContent = msg; el.hidden = !msg; }
}

async function submitAccountForm(form) {
  const f = new FormData(form);
  const btn = form.querySelector('button[type=submit]');
  const label = btn.textContent;
  formError(form, '');
  const busy = (on) => { btn.disabled = on; btn.textContent = on ? 'Patiente…' : label; };
  try {
    busy(true);
    if (form.id === 'signupForm' || form.id === 'completeForm') {
      const pseudo = String(f.get('pseudo') || '').trim();
      if (pseudo.length < 3) throw new Error('Choisis un pseudo de 3 caractères minimum.');
      if (!f.get('adult') || !f.get('sensitive') || (form.id === 'signupForm' && !f.get('terms'))) throw new Error('Coche les cases de confirmation pour continuer.');
      if (!(await sb.rpc('pseudo_available', { p_pseudo: pseudo }))) throw new Error('Ce pseudo est déjà pris, choisis-en un autre.');
      const now = new Date().toISOString();
      const meta = { pseudo, city: f.get('city'), adult_confirmed_at: now, sensitive_consent_at: now, terms_accepted_at: now };
      if (form.id === 'completeForm') {
        const rows = await sb.insert('profiles', { id: sb.currentUser().id, pseudo, city: meta.city, adult_confirmed_at: now, sensitive_consent_at: now }, { returnRow: true });
        profile = rows[0];
        await loadUser();
        await refreshEvents();
        navigate('#/');
        return;
      }
      const email = String(f.get('email') || '').trim();
      const password = String(f.get('password') || '');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Adresse e-mail invalide.');
      if (password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
      state.city = meta.city; state.adult = true; save();
      const res = await sb.signUp(email, password, meta);
      lastSignupEmail = email;
      if (res.confirmed) { await loadUser(); await refreshEvents(); toast(`Bienvenue ${pseudo} !`); navigate('#/'); } else navigate('#/compte/verifier');
    } else if (form.id === 'loginForm') {
      await sb.signIn(String(f.get('email') || '').trim(), String(f.get('password') || ''));
      const status = await loadUser();
      if (status === 'incomplete') { navigate('#/compte/profil'); return; }
      await refreshEvents();
      toast(`Content de te revoir, ${profile.pseudo} !`);
      navigate('#/');
    } else if (form.id === 'forgotForm') {
      await sb.sendPasswordReset(String(f.get('email') || '').trim());
      form.innerHTML = '<p>Si un compte existe avec cette adresse, tu vas recevoir un lien pour choisir un nouveau mot de passe. Pense à regarder dans les indésirables.</p>';
    } else if (form.id === 'newPasswordForm') {
      const password = String(f.get('password') || '');
      if (password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
      await sb.updatePassword(password);
      toast('Mot de passe modifié.');
      navigate('#/profil');
    }
  } catch (err) {
    formError(form, err.message);
  } finally {
    if (btn.isConnected) busy(false);
  }
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
(async () => {
  const redirect = await sb.handleAuthRedirect();
  if (sb.getSession()) readEventsCache();
  render();
  if (sb.getSession()) {
    try {
      const status = await loadUser();
      if (status === 'incomplete' && !redirect) navigate('#/compte/profil');
    } catch (err) {
      if (err.status === 401) { sb.forgetSession(); clearEvents(); }
      else if (err.network && state.pseudo) profile = profile || { id: sb.currentUser()?.id, pseudo: state.pseudo, city: state.city, member_number: 0 };
    }
    userChecked = true;
    render();
    await refreshEvents();
  }
  userChecked = true;
  render();
  if (redirect) {
    if (redirect.error) toast(redirect.error);
    else if (redirect.type === 'recovery') navigate('#/compte/nouveau-mdp');
    else navigate(profile ? '#/compte/confirme' : '#/compte/profil');
  }
})();
if (sessionStorage.getItem('ek.updated')) {
  sessionStorage.removeItem('ek.updated');
  setTimeout(() => toast(`Nouvelle version installée (${VERSION})`), 400);
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // Mise à jour automatique : on vérifie à chaque ouverture et à chaque retour dans l'appli,
  // puis on recharge une seule fois quand la nouvelle version a pris le relais.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    sessionStorage.setItem('ek.updated', '1');
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
