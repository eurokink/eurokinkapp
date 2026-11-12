// EuroKink — application (étape 2 : soirées et comptes dans Supabase)
import { EVENT_TYPES, CITIES, BADGES } from './data.js';
import * as sb from './supabase.js';
import { PAGES, CONTACT_EMAIL, LEGAL_UPDATED } from './legal.js';
import { mountMap } from './map.js';

const VERSION = '0.18.2';
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
const imgSrc = (path) => (!path ? '' : /^https:\/\//i.test(path) ? path : sb.publicUrl('event-images', path));
const orgLogo = (o, cls = '') => (o && o.logo
  ? `<img class="org-logo ${cls}" src="${esc(imgSrc(o.logo))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : `<span class="org-logo org-initial ${cls}">${esc(((o && o.name) || '?').charAt(0).toUpperCase())}</span>`);
const salesEnded = (e) => !!(e.salesCloseAt && new Date(e.salesCloseAt) <= new Date());
const heroImg = (e, zoom = false) => (e.image ? `<img class="hero-img" src="${esc(imgSrc(e.image))}" style="object-position:${e.imageX}% ${e.imageY}%" alt="" loading="lazy" referrerpolicy="no-referrer"${zoom ? ` data-act="img-view" data-src="${esc(imgSrc(e.image))}"` : ''} onerror="this.parentNode.classList.remove('has-img');this.remove()">` : '');
const loggedIn = () => !!(sb.getSession() && profile);
const defaults = {
  adult: false, pseudo: '', city: 'Nantes', visibility: 'everyone', invisible: false, neutralNotifs: true, testMode: false,
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
const cityObj = () => (state.cityLat != null && state.cityLon != null
  ? { name: state.city, lat: state.cityLat, lon: state.cityLon }
  : CITIES.find((c) => c.name === state.city) || CITIES.find((c) => c.name === 'Nantes'));
// Ville choisie dans « Autour de » sur l'écran Explorer (vide = ma ville)
const aroundObj = () => (filters.around && CITIES.find((c) => c.name === filters.around)) || cityObj();

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
  expand: ic('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>'),
  image: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  pencil: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
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
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  lock: ic('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  doc: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>'),
  mail: ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>'),
  download: ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  trash: ic('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  map: ic('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><path d="M8 2v16M16 6v16"/>'),
  eye: ic('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
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
  if (salesEnded(e)) meta.push('Billetterie fermée');
  else if (e.booking === 'required') meta.push('Réservation');
  return `<a class="row-card" href="#/soiree/${e.id}">
    <div class="date-chip"><span>${shortDay(e.startsAt)}</span><strong>${dayNum(e.startsAt)}</strong></div>
    <div class="row-main"><div class="row-title">${esc(e.title)}</div><div class="row-meta">${esc(meta.join(' · '))}</div></div>
    <div class="price-pill">${e.soldOut ? 'Complet' : priceLabel(e.price)}</div>
  </a>`;
}

function featuredCard(e) {
  return `<a class="feature-card" href="#/soiree/${e.id}">
    <div class="feature-hero${e.image ? ' has-img' : ''}">${heroImg(e)}<svg class="hero-studs" viewBox="0 0 120 120" aria-hidden="true"><g fill="currentColor">${studs(50, 3)}</g></svg>
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
    ${inviteBanner()}
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
    <a class="card propose-cta" href="#/${isOrganizer() ? 'orga' : 'devenir-organisateur'}"><div><strong>Tu organises une soirée ?</strong><div class="muted tiny">Deviens organisateur : publie tes soirées et suis tes statistiques.</div></div>${I.chevron}</a>
  </section>`;
}

// Filtres de l'écran Explorer (gardés en mémoire pendant la session)
const freshFilters = () => ({ q: '', around: '', radius: state.defaultRadius, period: 'all', types: [], budget: 100, noBooking: false, cloakroom: false });
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
    if (!ignoreRadius && filters.radius) { const c = aroundObj(); if (distanceKm(c.lat, c.lon, e.venue.lat, e.venue.lon) > filters.radius) return false; }
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
  const cityOpts = `<option value="" ${filters.around ? '' : 'selected'}>${esc(state.city)} (ma ville)</option>`
    + CITIES.filter((c) => c.name !== state.city).map((c) => `<option ${c.name === filters.around ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
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
  const salesClosed = salesEnded(e);
  const km = Math.round(kmFromMe(e));
  const multiDay = new Date(e.endsAt).toDateString() !== new Date(e.startsAt).toDateString() && new Date(e.endsAt) - new Date(e.startsAt) > 24 * 3600000;
  const when = multiDay ? `Du ${fDate.format(new Date(e.startsAt))} au ${fDate.format(new Date(e.endsAt))}` : dayLabel(e.startsAt);
  const infos = [
    ['Type', e.types.map(typeName).join(', ')], ['Dress code', DRESS[e.dressCode]],
    ['Réservation', salesClosed ? 'Billetterie fermée' : e.salesCloseAt ? `${BOOKING[e.booking]}, jusqu’au ${fDate.format(new Date(e.salesCloseAt))}` : BOOKING[e.booking]], ['Vestiaire', e.hasCloakroom ? (e.cloakroomPaid ? 'Oui, payant' : 'Oui, gratuit') : 'Non'],
    ['Fréquence', FREQ[e.frequency]], ['Langues', e.languages.join(', ')]
  ];
  let cta;
  if (e.soldOut) cta = `<button class="btn btn-red btn-grow" data-act="alert">${al ? 'Alerte activée' : 'Complet : m’alerter'}</button>`;
  else if (salesClosed) cta = '<span class="btn btn-ghost btn-grow static">Billetterie fermée</span>';
  else if (salesLater) cta = `<button class="btn btn-red btn-grow" data-act="alert">${al ? 'Alerte activée' : `Billets le ${fDate.format(new Date(e.salesOpenAt))}`}</button>`;
  else if (e.booking === 'door_only' || !e.ticketUrl) cta = '<span class="btn btn-ghost btn-grow static">Entrée sur place</span>';
  else cta = `<a class="btn btn-red btn-grow" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Réserver ma place</a>`;
  const showCheckin = !checked && (isLive(e) || (state.testMode && !loggedIn()));
  return `<section class="screen screen-event">
    <div class="event-hero${e.image ? ' has-img' : ''}">${heroImg(e, true)}${e.image ? `<button class="icon-btn hero-btn hero-zoom" data-act="img-view" data-src="${esc(imgSrc(e.image))}" aria-label="Voir la photo en entier">${I.expand}</button>` : ''}${!e.image && e.organizer.logo ? `<img class="hero-logo" src="${esc(imgSrc(e.organizer.logo))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<svg class="hero-studs${!e.image && e.organizer.logo ? ' hidden' : ''}" viewBox="0 0 120 120" aria-hidden="true"><g fill="currentColor">${studs(50, 3)}</g></svg>
      <button class="icon-btn hero-btn hero-left" data-act="back" aria-label="Retour">${I.back}</button>
      <button class="icon-btn hero-btn hero-right" data-act="share" aria-label="Partager">${I.share}</button>
      <div class="hero-tags">${e.types.map((t) => `<span class="tag tag-red">${esc(typeName(t).toUpperCase())}</span>`).join('')}<span class="tag tag-dark">${FREQ[e.frequency]}</span>${e.soldOut ? '<span class="tag tag-light">Complet</span>' : ''}</div>
    </div>
    <div class="event-body">
      <h1 class="event-title">${esc(e.title)}</h1>
      <div class="org-line">${e.organizer.logo ? orgLogo(e.organizer, 'xs') : ''}par <a class="org-link" href="#/organisateur/${e.organizer.id}"><strong>${esc(e.organizer.name)}</strong></a>${e.organizer.verified ? I.verified : ''}<span class="muted">· ${esc(e.organizer.kind)}</span></div>
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
      ${whoCardHtml(e)}
      <h2 class="section-title">À propos</h2>
      <p class="about">${esc(e.description)}</p>
      <h2 class="section-title">Pratique</h2>
      <div class="practical">
        <a class="line-btn" href="${mapsUrl(e)}" target="_blank" rel="noopener">${I.route}<span>Itinéraire jusqu’au lieu</span>${I.chevron}</a>
        <button class="line-btn" data-act="ics">${I.calendar}<span>Ajouter à mon calendrier</span>${I.chevron}</button>
        <a class="line-btn" href="${bookingUrl(e)}" target="_blank" rel="noopener">${I.bed}<span>Trouver un hébergement à proximité</span>${I.chevron}</a>
        <button class="line-btn" data-act="report">${I.flag}<span>Signaler une erreur sur cette soirée</span>${I.chevron}</button>
        ${isAdmin() || myOrgs().some((o) => o.id === e.organizer.id) ? `<button class="line-btn" data-act="ev-edit" data-id="${e.id}">${I.pencil}<span>Modifier cette soirée</span>${I.chevron}</button>` : ''}
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

// Communauté : carte des membres, placés sur la ville indiquée dans leur profil
let members = null; let membersAt = 0; let membersError = '';
function memberListHtml() {
  const q = memberQ.trim().toLowerCase();
  const list = (members || []).filter((m) => !q || [m.pseudo, m.city, m.postal_code || '', ...(m.interests || []).map(typeName)].some((x) => String(x).toLowerCase().includes(q)))
    .map((m) => ({ m, km: memberKm(m) })).sort((a, b) => a.km - b.km || a.m.pseudo.localeCompare(b.m.pseudo));
  if (!list.length) return empty(q ? 'Aucun membre ne correspond à ta recherche.' : 'Aucun membre visible pour le moment.');
  return list.map(({ m, km }) => `<a class="member-row card" href="#/membre/${m.id}">${memberAv(m)}<div class="mr-main"><strong>${esc(m.pseudo)}</strong>${profile && m.id === profile.id ? ' <span class="muted tiny">(toi)</span>' : ''}
    <div class="muted tiny">${esc(m.city)}${profile && m.id === profile.id ? '' : ` · ${km} km`}</div>${(m.interests || []).length ? `<div class="chips mini">${interestChips(m.interests, 3)}</div>` : ''}</div>${I.chevron}</a>`).join('');
}
async function loadMembers(force) {
  if (!force && members && Date.now() - membersAt < 120000) return;
  try {
    members = await sb.select('profiles', 'select=id,pseudo,avatar_path,city,postal_code,latitude,longitude,interests&is_invisible=eq.false&latitude=not.is.null&longitude=not.is.null&order=created_at.desc&limit=5000');
    membersAt = Date.now(); membersError = '';
  } catch (e) { membersError = e.message || 'Impossible de charger les membres.'; }
}
const memberAv = (m, cls = '') => `<span class="mini-av ${cls}">${m.avatar_path ? `<img src="${esc(sb.publicUrl('avatars', m.avatar_path))}" alt="" loading="lazy">` : esc((m.pseudo || '?').charAt(0).toUpperCase())}</span>`;

const commSeg = (mode) => `<div class="seg" role="tablist" aria-label="Affichage">
  <a href="#/communaute/liste" role="tab" aria-selected="${mode === 'list'}" class="${mode === 'list' ? 'on' : ''}">${I.list}<span>Liste</span></a>
  <a href="#/communaute" role="tab" aria-selected="${mode === 'map'}" class="${mode === 'map' ? 'on' : ''}">${I.map}<span>Carte</span></a></div>`;
const memberKm = (m) => { const c = cityObj(); return Math.round(distanceKm(c.lat, c.lon, +m.latitude, +m.longitude)); };
const interestChips = (list, max = 8) => (list || []).slice(0, max).map((t) => `<span class="chip static">${esc(typeName(t))}</span>`).join('');
let memberQ = '';

function viewCommunity(mode) {
  const top = `<div class="explore-top"><h1 class="page-title">Communauté</h1>${commSeg(mode)}</div>`;
  if (!membersError && (!members || Date.now() - membersAt > 120000)) {
    members = null;
    loadMembers().then(() => { if ((location.hash || '').startsWith('#/communaute')) render(); });
    return `<section class="screen">${top}<div class="loading"><div class="spinner" aria-hidden="true"></div><p class="muted">Chargement des membres…</p></div></section>`;
  }
  const n = (members || []).length;
  const me = state.invisible ? 'Tu es masqué' : 'Tu es visible';
  if (mode === 'list' && !membersError) {
    return `<section class="screen">${top}
      <label class="search"><span>${I.search}</span><input id="mQ" type="search" placeholder="Pseudo, ville, centre d’intérêt…" value="${esc(memberQ)}" aria-label="Rechercher un membre"></label>
      <a class="map-summary" href="#/parametres">${I.users}<span>${n} membre${n > 1 ? 's' : ''} · ${me}</span><span class="accent">Réglages</span></a>
      <div id="memberList" class="member-list big">${memberListHtml()}</div></section>`;
  }
  return `<section class="screen screen-map">
    ${top}
    ${membersError ? `<div class="card center-card"><p class="muted">${esc(membersError)}</p><button class="btn btn-red" data-act="members-retry">Réessayer</button></div>` : `
    <a class="map-summary" href="#/parametres">${I.users}<span>${n} membre${n > 1 ? 's' : ''} sur la carte · ${me}</span><span class="accent">Réglages</span></a>
    <div class="map-wrap"><div id="map" class="map"></div><div id="mapSheet" class="map-sheet" hidden></div></div>
    <p class="tiny muted center">Chaque membre apparaît sur la ville de son profil, jamais à son adresse. Profils, « Qui y va ? » et buddies arrivent ensuite.</p>`}
  </section>`;
}

// « Qui y va ? » : participants visibles selon les réglages de chacun (filtré par la base)
const whoCache = new Map();
function whoCardHtml(e) {
  const list = whoCache.get(e.id);
  const n = Math.max(attendeesOf(e), list ? list.length : 0);
  let inner = '';
  if (!loggedIn()) inner = '<p class="muted tiny">Connecte-toi pour voir qui y va.</p>';
  else if (list === undefined) inner = n ? '<p class="muted tiny">Chargement…</p>' : '';
  else if (!list.length) inner = n ? '<p class="muted tiny">Les participants ont choisi de rester discrets.</p>' : '';
  else {
    const hidden = Math.max(0, n - list.length);
    inner = `<button class="who-faces" data-act="who-all" data-id="${e.id}" aria-label="Voir les participants">${list.slice(0, 7).map((m) => memberAv(m, 'who-av')).join('')}${list.length > 7 ? `<span class="who-more">+${list.length - 7}</span>` : ''}<span class="who-see">Voir</span></button>
      <p class="muted tiny">${list.map((m) => (profile && m.id === profile.id ? 'Toi' : esc(m.pseudo))).slice(0, 3).join(', ')}${list.length > 3 ? ` et ${list.length - 3} autre${list.length - 3 > 1 ? 's' : ''}` : ''}${hidden ? ` · ${hidden} discret${hidden > 1 ? 's' : ''}` : ''}</p>`;
  }
  return `<div class="card who" id="whoCard"><div><strong>Qui y va ?</strong> <span class="muted">${attendeesLabel(n)}</span></div>${inner}</div>`;
}
async function loadWho(id) {
  try {
    const rows = await sb.select('attendances', `event_id=eq.${id}&select=user_id,created_at,profile:profiles(id,pseudo,avatar_path,city)&order=created_at.asc&limit=500`);
    const list = rows.map((r) => r.profile).filter(Boolean);
    list.sort((a, b) => (profile && b.id === profile.id) - (profile && a.id === profile.id));
    whoCache.set(id, list);
  } catch (e) { whoCache.set(id, []); }
  const card = $('#whoCard'); const ev = eventById(id);
  if (card && ev && location.hash === `#/soiree/${id}`) card.outerHTML = whoCardHtml(ev);
}
function whoSheet(id) {
  const list = whoCache.get(id) || []; const e = eventById(id);
  const el = sheet(`<div class="sheet-head"><h2>Qui y va ?</h2><button class="icon-btn small" data-sheet-close aria-label="Fermer">${I.close}</button></div>
    <p class="muted tiny">${e ? esc(e.title) : ''}</p>
    <div class="member-list">${list.map((m) => `<a class="member-row" href="#/membre/${m.id}">${memberAv(m)}<div class="mr-main"><strong>${esc(m.pseudo)}</strong>${profile && m.id === profile.id ? ' <span class="muted tiny">(toi)</span>' : ''}<div class="muted tiny">${esc(m.city || '')}</div></div>${I.chevron}</a>`).join('')}</div>`);
  el.addEventListener('click', (ev) => {
    const a = ev.target.closest('a.member-row'); if (!a) return;
    ev.preventDefault(); const href = a.getAttribute('href');
    closeOverlay(); setTimeout(() => navigate(href), 120);
  });
}

// Membres suivis
let following = new Set();
async function toggleMemberFollow(id) {
  const on = !following.has(id);
  if (on) following.add(id); else following.delete(id);
  render();
  try {
    if (on) await sb.insert('member_follows', { follower_id: profile.id, followed_id: id }, { ignoreDuplicates: true, onConflict: 'follower_id,followed_id' });
    else await sb.remove('member_follows', `follower_id=eq.${profile.id}&followed_id=eq.${id}`);
    toast(on ? 'Tu suis ce membre' : 'Tu ne suis plus ce membre');
  } catch (err) { if (on) following.delete(id); else following.add(id); render(); toast(err.message); }
}

// Sorties à venir d'un membre (visibles selon ses réglages)
const outingsCache = new Map();
async function loadOutings(id) {
  try { outingsCache.set(id, (await sb.select('attendances', `user_id=eq.${id}&select=event_id`)).map((r) => r.event_id)); } catch (e) { outingsCache.set(id, []); }
  if (location.hash === `#/membre/${id}`) render();
}

// Invitations des organisateurs
const INVITE_KEY = 'ek.invite';
const pendingInvite = () => { try { return localStorage.getItem(INVITE_KEY) || ''; } catch (e) { return ''; } };
const setPendingInvite = (t) => { try { if (t) localStorage.setItem(INVITE_KEY, t); else localStorage.removeItem(INVITE_KEY); } catch (e) { /* stockage indisponible */ } };
const inviteCache = new Map();
const inviteUrl = (token) => `${location.origin}${location.pathname}#/invitation/${token}`;
function loadInvite(token) {
  if (inviteCache.has(token)) return inviteCache.get(token);
  inviteCache.set(token, undefined);
  sb.rpc('invite_info', { p_token: token }).catch(() => ({ status: 'unknown' }))
    .then((r) => { inviteCache.set(token, r || { status: 'unknown' }); render(); });
  return undefined;
}
function inviteBanner() {
  const t = pendingInvite();
  if (!t) return '';
  const i = loadInvite(t);
  if (!i || i.status !== 'valid') return '';
  return `<div class="card invite-banner">${orgLogo({ name: i.organizer.name, logo: i.organizer.logo_path }, 'lg')}<div><strong>Invitation : ${esc(i.organizer.name)}</strong>
    <p class="muted tiny">Crée ton compte (ou connecte-toi) pour gérer la page de ${esc(i.organizer.name)} et publier vos soirées.</p></div></div>`;
}
function viewInvitation(token) {
  const top = accountTopRaw('Invitation', '#/');
  if (!/^[0-9a-f]{32}$/.test(token || '')) return `<section class="screen">${top}${empty('Lien d’invitation invalide.')}</section>`;
  setPendingInvite('');
  const i = loadInvite(token);
  if (i === undefined) return `<section class="screen">${top}<div class="loading"><div class="spinner" aria-hidden="true"></div></div></section>`;
  if (i.status === 'unknown') return `<section class="screen">${top}${empty('Cette invitation n’existe pas ou a été supprimée.')}</section>`;
  const o = i.organizer;
  const msg = i.member ? `Tu gères déjà ${esc(o.name)}.` : i.status === 'used' ? 'Cette invitation a déjà été utilisée.' : i.status === 'expired' ? 'Cette invitation a expiré : demande un nouveau lien à la personne qui te l’a envoyé.' : '';
  return `<section class="screen">${top}
    <div class="card center-card invite-card">${orgLogo({ name: o.name, logo: o.logo_path }, 'xl')}
      <h2>${esc(o.name)} ${o.is_verified ? I.verified : ''}</h2>
      <p class="muted">${ORG_KIND[o.kind] || 'Organisateur'}${o.city ? ` · ${esc(o.city)}` : ''}</p>
      ${msg ? `<p>${msg}</p>${i.member ? `<a class="btn btn-red btn-block" href="#/orga/${o.id}">Ouvrir l’espace organisateur</a>` : ''}` : `
      <p>Tu es invité à rejoindre la gestion de <strong>${esc(o.name)}</strong> sur EuroKink.</p>
      <ul class="soon-list">${[o.is_verified || i.verify ? 'Publier vos soirées directement, sans validation' : 'Publier vos soirées (vérifiées par l’équipe avant mise en ligne)', 'Ajouter votre logo et votre présentation', 'Suivre vos statistiques : vues, «\u00a0J’y vais\u00a0», abonnés', 'Prévenir automatiquement vos abonnés à chaque nouvelle date'].map((x) => `<li>${I.check}<span>${x}</span></li>`).join('')}</ul>
      <button class="btn btn-red btn-block" data-act="invite-accept" data-token="${token}">Accepter l’invitation</button>
      <p class="tiny muted">Ton pseudo sera visible des autres gestionnaires de l’organisation.</p>`}
    </div></section>`;
}
async function acceptInvite(btn) {
  btn.disabled = true;
  try {
    const orgId = await sb.rpc('accept_organizer_invite', { p_token: btn.dataset.token });
    inviteCache.delete(btn.dataset.token); orgStatus = null; Object.keys(orgDash).forEach((k) => delete orgDash[k]);
    toast('Bienvenue dans ton espace organisateur !');
    await loadOrgStatus();
    navigate(`#/orga/${orgId}`);
    setTimeout(maybeOnboard, 1500);
  } catch (err) { toast(err.message); btn.disabled = false; }
}

// Équipe d'une organisation : gestionnaires et liens d'invitation
const orgTeam = {};
function loadTeam(id) {
  orgTeam[id] = orgTeam[id] || { loading: true };
  sb.rpc('org_invites', { p_org: id }).then((r) => { orgTeam[id] = r; }).catch((err) => { orgTeam[id] = { error: err.message }; })
    .then(() => { if ((location.hash || '').startsWith('#/orga')) render(); });
}
function teamBlock(o) {
  const t = orgTeam[o.id];
  if (!t) { loadTeam(o.id); return ''; }
  if (t.loading || t.error) return '';
  const open = t.invites.filter((i) => !i.used_at);
  return `<h2 class="group-title">Équipe</h2>
    <div class="card team">
      <div class="team-list">${t.managers.map((m) => `<a class="member-row" href="#/membre/${m.id}">${memberAv(m)}<div class="mr-main"><strong>${esc(m.pseudo)}</strong>${profile && m.id === profile.id ? ' <span class="muted tiny">(toi)</span>' : ''}<div class="muted tiny">Gestionnaire</div></div></a>`).join('') || '<p class="muted tiny">Aucun gestionnaire pour le moment.</p>'}</div>
      ${open.map((i) => `<div class="invite-row"><span class="mini-av inv">${I.mail}</span><div class="mr-main"><strong>${esc(i.note || 'Invitation')}</strong><div class="muted tiny">En attente · expire le ${fDate.format(new Date(i.expires_at))}</div></div>
        <button class="icon-btn small" data-act="invite-share" data-token="${i.token}" data-org="${o.id}" aria-label="Partager le lien">${I.share}</button>
        <button class="icon-btn small" data-act="invite-revoke" data-id="${i.id}" data-org="${o.id}" aria-label="Supprimer l’invitation">${I.trash}</button></div>`).join('')}
      <button class="btn btn-ghost btn-block" data-act="invite-new" data-org="${o.id}">${I.plus}<span>Inviter un gestionnaire</span></button>
      <p class="tiny muted">Chaque lien est personnel, utilisable une seule fois et valable 30 jours.${isAdmin() && !o.is_verified ? ' Envoyé par toi, il rend aussi l’organisation vérifiée.' : ''}</p>
    </div>`;
}
function inviteMessage(orgName, token) {
  return `Bonjour ! 👋\n\nNous avons ajouté ${orgName} sur EuroKink, l’appli gratuite qui rassemble les soirées fetish en France.\n\nAvec ce lien personnel, tu peux gérer votre page organisateur : publier vos soirées directement, ajouter votre logo et suivre vos statistiques (vues, participants, abonnés). Vos abonnés sont prévenus à chaque nouvelle date.\n\n${inviteUrl(token)}\n(lien valable 30 jours, utilisable une seule fois)\n\nÀ bientôt,\nL’équipe EuroKink`;
}
function inviteNew(orgId) {
  const name = (orgDash[orgId] && orgDash[orgId].organizer.name) || '';
  const el = sheet(`<h2>Inviter un gestionnaire</h2>
    <p class="muted">Crée un lien personnel à envoyer à la personne qui gérera ${esc(name)} : par e-mail, Instagram, WhatsApp…</p>
    <label class="field">Pour qui ? (facultatif, visible de ton équipe uniquement)<input id="invNote" maxlength="100" placeholder="Ex. Président de l’asso, Instagram @…"></label>
    <div class="adm-actions"><button class="btn btn-red" data-inv-create>Créer le lien</button><button class="btn btn-ghost" data-sheet-close>Annuler</button></div>`);
  el.querySelector('[data-inv-create]').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try {
      const r = await sb.rpc('create_organizer_invite', { p_org: orgId, p_note: el.querySelector('#invNote').value.trim() || null });
      closeOverlay();
      loadTeam(orgId);
      setTimeout(() => inviteShare(orgId, r.token), 150);
    } catch (err) { toast(err.message); ev.target.disabled = false; }
  });
}
function inviteShare(orgId, token) {
  const name = (orgDash[orgId] && orgDash[orgId].organizer.name) || 'votre organisation';
  const text = inviteMessage(name, token);
  const el = sheet(`<h2>Lien d’invitation</h2>
    <p class="muted">Envoie ce message à la personne invitée. Tu peux le modifier avant de le copier.</p>
    <label class="field">Message<textarea id="invMsg" rows="9">${esc(text)}</textarea></label>
    <div class="invite-link"><span>${esc(inviteUrl(token))}</span></div>
    <div class="adm-actions"><button class="btn btn-red" data-inv-copy>Copier le message</button>${navigator.share ? '<button class="btn btn-ghost" data-inv-send>Partager…</button>' : ''}</div>
    <button class="link center" data-inv-link>Copier seulement le lien</button>`);
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch (e) { toast('Copie impossible : sélectionne le texte à la main'); } };
  el.querySelector('[data-inv-copy]').addEventListener('click', () => copy(el.querySelector('#invMsg').value, 'Message copié'));
  el.querySelector('[data-inv-link]').addEventListener('click', () => copy(inviteUrl(token), 'Lien copié'));
  const send = el.querySelector('[data-inv-send]');
  if (send) send.addEventListener('click', () => navigator.share({ text: el.querySelector('#invMsg').value }).catch(() => {}));
}
async function inviteRevoke(btn) {
  if (!confirm('Supprimer cette invitation ? Le lien ne fonctionnera plus.')) return;
  try { await sb.rpc('revoke_organizer_invite', { p_id: btn.dataset.id }); toast('Invitation supprimée'); loadTeam(btn.dataset.org); } catch (err) { toast(err.message); }
}

// Fiche d'un membre
const memberCache = new Map();
const fMonth = fmt({ month: 'long', year: 'numeric' });
function viewMember(id) {
  const back = `<div class="sub-top"><button class="icon-btn" data-act="back" aria-label="Retour">${I.back}</button><h1 class="page-title small">Membre</h1></div>`;
  if (!isUuid(id)) return `<section class="screen">${back}${empty('Profil introuvable.')}</section>`;
  const mine = profile && id === profile.id;
  const m = mine ? profile : memberCache.get(id);
  if (m === undefined) {
    sb.select('profiles', `id=eq.${id}&select=id,pseudo,avatar_path,city,postal_code,latitude,longitude,bio,interests,member_number,created_at`)
      .then((r) => { memberCache.set(id, r[0] || null); }).catch(() => memberCache.set(id, null))
      .then(() => { if (location.hash === `#/membre/${id}`) render(); });
    return `<section class="screen">${back}<div class="loading"><div class="spinner" aria-hidden="true"></div></div></section>`;
  }
  if (!m) return `<section class="screen">${back}${empty('Ce profil est introuvable ou masqué.')}</section>`;
  const av = m.avatar_path ? sb.publicUrl('avatars', m.avatar_path) : '';
  return `<section class="screen">${back}
    <div class="member-head">
      ${av ? `<button class="avatar member-av" data-act="img-view" data-src="${esc(av)}" aria-label="Agrandir la photo"><img src="${esc(av)}" alt=""></button>` : `<div class="avatar member-av">${esc(m.pseudo.charAt(0).toUpperCase())}</div>`}
      <div class="pseudo">${esc(m.pseudo)}</div>
      <div class="muted">${esc(cityLabel({ name: m.city, postal: m.postal_code }))}${!mine && m.latitude != null ? ` · à ${memberKm(m)} km` : ''}</div>
      <div class="pills"><span class="pill-grey">Membre n° ${String(m.member_number || 0).padStart(4, '0')}</span>${m.created_at ? `<span class="pill-grey">Depuis ${fMonth.format(new Date(m.created_at))}</span>` : ''}</div>
    </div>
    <div class="card"><h2 class="card-title">Présentation</h2>${m.bio ? `<p class="bio">${esc(m.bio)}</p>` : `<p class="muted">${mine ? 'Tu n’as pas encore écrit de présentation.' : 'Pas encore de présentation.'}</p>`}</div>
    <div class="card"><h2 class="card-title">Centres d’intérêt</h2>${(m.interests || []).length ? `<div class="chips wrap">${interestChips(m.interests)}</div>` : `<p class="muted">${mine ? 'Choisis les types de soirée qui te plaisent.' : 'Non renseignés.'}</p>`}</div>
    ${(() => {
      if (!outingsCache.has(m.id)) { loadOutings(m.id); return ''; }
      const evs = outingsCache.get(m.id).map(eventById).filter((x) => x && new Date(x.endsAt) > new Date()).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
      return `<h2 class="section-title">${mine ? 'Mes prochaines sorties' : 'Ses prochaines sorties'}</h2>${evs.length ? `<div class="list">${evs.map(eventRow).join('')}</div>` : `<p class="muted">${mine ? 'Touche « J’y vais » sur une soirée pour l’afficher ici.' : 'Aucune sortie visible pour le moment.'}</p>`}`;
    })()}
    ${mine ? `<a class="btn btn-red btn-block" href="#/ma-fiche">Modifier ma fiche</a>
      <p class="tiny muted center">${state.invisible ? 'Ton profil est invisible : personne d’autre ne voit cette fiche.' : 'Cette fiche est visible des membres connectés.'}</p>`
      : `<button class="btn ${following.has(m.id) ? 'btn-ghost' : 'btn-red'} btn-block" data-act="follow-member" data-id="${m.id}">${following.has(m.id) ? `${I.check}<span>Suivi</span>` : `${I.plus}<span>Suivre</span>`}</button>
        <p class="tiny muted center">${following.has(m.id) ? 'Si tu réserves tes sorties « aux membres que je suis », il pourra les voir.' : 'Les membres que tu suis peuvent voir tes sorties si tu les leur réserves (Paramètres).'}</p>
        <button class="btn btn-ghost btn-block" data-act="report-member" data-id="${m.id}">${I.flag}<span>Signaler ce profil</span></button>`}
  </section>`;
}

function viewEditMember() {
  if (!loggedIn()) return viewProfile();
  const sel = new Set(profile.interests || []);
  return `<section class="screen"><div class="sub-top"><a class="icon-btn" href="#/membre/${profile.id}" aria-label="Retour">${I.back}</a><h1 class="page-title small">Ma fiche membre</h1></div>
    <form id="memberForm" class="card settings">
      <label class="field">Présentation<textarea name="bio" maxlength="500" rows="5" placeholder="Quelques mots sur toi, tes soirées préférées, ce que tu recherches comme sorties…">${esc(profile.bio || '')}</textarea><span class="hint"><span id="bioCount">${(profile.bio || '').length}</span> / 500 · Pas de contenu explicite ni de coordonnées personnelles.</span></label>
      <div class="field"><span>Centres d’intérêt <span class="muted tiny">(8 maximum)</span></span>
        <div class="chips wrap" id="intChips">${EVENT_TYPES.map((t) => `<button type="button" class="chip ${sel.has(t.slug) ? 'on' : ''}" data-act="interest" data-type="${t.slug}" aria-pressed="${sel.has(t.slug)}">${esc(t.name)}</button>`).join('')}</div></div>
      <p class="form-error" id="formError" role="alert" hidden></p>
      <button class="btn btn-red btn-block" type="submit">Enregistrer</button>
    </form></section>`;
}

async function saveMemberForm(form) {
  const btn = form.querySelector('button[type=submit]');
  const bio = String(new FormData(form).get('bio') || '').trim().slice(0, 500) || null;
  const interests = [...form.querySelectorAll('[data-act=interest].on')].map((b) => b.dataset.type).slice(0, 8);
  btn.disabled = true;
  try {
    const rows = await sb.update('profiles', `id=eq.${profile.id}`, { bio, interests });
    profile = (rows && rows[0]) || { ...profile, bio, interests };
    membersAt = 0;
    toast('Fiche enregistrée');
    navigate(`#/membre/${profile.id}`);
  } catch (err) { formError(form, err.message); btn.disabled = false; }
}

function reportMember(id) {
  const el = sheet(`<h2>Signaler ce profil</h2>
    <p class="muted">Ton signalement est anonyme pour le membre concerné et sera examiné par l’équipe EuroKink.</p>
    <div class="chips wrap" id="repReasons">${['Photo inappropriée', 'Propos choquants', 'Sollicitation sexuelle', 'Faux profil', 'Mineur', 'Autre'].map((r) => `<button type="button" class="chip" data-r="${r}">${r}</button>`).join('')}</div>
    <label class="field">Précisions (facultatif)<textarea id="repDetails" maxlength="1000" rows="3"></textarea></label>
    <div class="adm-actions"><button class="btn btn-red" data-rep-send disabled>Envoyer</button><button class="btn btn-ghost" data-sheet-close>Annuler</button></div>`);
  let reason = '';
  el.querySelector('#repReasons').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-r]'); if (!b) return;
    el.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); reason = b.dataset.r;
    el.querySelector('[data-rep-send]').disabled = false;
  });
  el.querySelector('[data-rep-send]').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    const details = el.querySelector('#repDetails').value.trim();
    try {
      await sb.insert('reports', { reporter_id: profile.id, target_type: 'profile', target_id: id, reason, details: details || null });
      closeOverlay(); toast('Merci ! Ton signalement a été transmis.');
    } catch (err) { toast(err.message); ev.target.disabled = false; }
  });
}

function initMembersMap() {
  const groups = new Map();
  (members || []).forEach((m) => {
    const key = `${m.city}|${m.postal_code || ''}|${(+m.latitude).toFixed(3)}|${(+m.longitude).toFixed(3)}`;
    const g = groups.get(key) || { id: key, name: m.city, members: [], lat: +m.latitude, lon: +m.longitude };
    g.members.push(m); groups.set(key, g);
  });
  const markers = [...groups.values()].map((g) => {
    const face = g.members.find((m) => m.avatar_path) || g.members[0];
    return { id: g.id, name: g.name, lat: g.lat, lon: g.lon, count: g.members.length,
      label: `${g.name} : ${g.members.length} membre${g.members.length > 1 ? 's' : ''}`, svg: memberAv(face, 'mm mm-member') };
  });
  const sheet = $('#mapSheet');
  const open = (keys) => {
    const list = keys.flatMap((k) => groups.get(k).members);
    const names = [...new Set(keys.map((k) => groups.get(k).name))];
    sheet.innerHTML = `<div class="sheet-head"><div><strong>${esc(names.join(', '))}</strong> <span class="muted">· ${list.length} membre${list.length > 1 ? 's' : ''}</span></div>
      <button class="icon-btn small" data-close-sheet aria-label="Fermer">${I.close}</button></div>
      <div class="member-list">${list.map((m) => `<a class="member-row" href="#/membre/${m.id}">${memberAv(m)}<div class="mr-main"><strong>${esc(m.pseudo)}</strong>${profile && m.id === profile.id ? ' <span class="muted tiny">(toi)</span>' : ''}<div class="muted tiny">${esc(cityLabel({ name: m.city, postal: m.postal_code }))}</div></div>${I.chevron}</a>`).join('')}</div>`;
    sheet.hidden = false;
    openOverlay(() => { sheet.hidden = true; });
  };
  sheet.addEventListener('click', (ev) => { if (ev.target.closest('[data-close-sheet]')) closeOverlay(); });
  const c = cityObj();
  mapCleanup = mountMap($('#map'), { markers, home: { lat: c.lat, lon: c.lon }, onSelect: open, unit: 'membres',
    markerSvg: `<span class="mm mm-logo mm-group">${I.users}</span>` });
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
    isOrganizer() && !(orgStatus && orgStatus.all) ? '<span class="pill-red">ORGANISATEUR</span>' : '',
    `<span class="pill-grey">Membre n° ${String(profile.member_number).padStart(4, '0')}</span>`].join('') : '';
  const account = loggedIn() ? '' : `<div class="card account-cta"><h2>Crée ton compte EuroKink</h2>
      <p class="muted">Retrouve tes favoris, rappels et sorties sur tous tes appareils, et fais valider tes badges.</p>
      <div class="cta-row"><a class="btn btn-red" href="#/compte/inscription">Créer un compte</a><a class="btn btn-ghost" href="#/compte/connexion">Me connecter</a></div></div>`;
  return `<section class="screen"><div class="profile-top"><h1 class="page-title">Profil</h1><a class="icon-btn" href="#/parametres" aria-label="Paramètres">${I.gear}</a></div>
    ${account}<div class="profile-head">
      ${loggedIn() ? `<button class="avatar avatar-btn" data-act="avatar" aria-label="Changer ma photo de profil">${profile.avatar_path
        ? `<img src="${esc(sb.publicUrl('avatars', profile.avatar_path))}" alt="">` : esc(name.charAt(0).toUpperCase())}<span class="avatar-cam">${I.image}</span></button>`
        : `<div class="avatar">${esc(name.charAt(0).toUpperCase())}</div>`}
      <div><div class="pseudo">${esc(name)}</div><div class="muted">${esc(state.city)}</div>
      <div class="pills">${pills}</div></div></div>
    <div class="stats">${stats.map(([n, l]) => `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>
    <div class="section-head"><h2>Mon passeport</h2><span class="muted">${pass.filter((b) => b.earned).length} / ${pass.length} badges</span></div>
    <div class="badges">${pass.map((b) => `<button class="badge ${b.earned ? 'earned' : ''} ${b.code === sel.code ? 'sel' : ''}" data-badge="${b.code}" aria-pressed="${b.code === sel.code}">
        <svg viewBox="0 0 120 120" aria-hidden="true"><g class="b-studs">${studs()}</g><circle cx="60" cy="60" r="34" class="b-disc"/><g transform="translate(40 40) scale(1.6667)"><path d="${b.icon}" class="b-icon"/></g></svg>
        <span class="b-name">${esc(b.name)}</span><span class="b-bar"><span style="width:${Math.round((100 * b.progress) / b.goal)}%"></span></span></button>`).join('')}</div>
    <div class="card badge-detail"><strong>${esc(sel.name)}</strong> <span class="accent">${sel.earned ? '· obtenu' : `· ${sel.progress} / ${sel.goal}`}</span><p class="muted">${esc(sel.description)}</p></div>
    ${loggedIn() ? `<div class="practical flat">
      <a class="line-btn" href="#/membre/${profile.id}">${I.user}<span>Ma fiche membre<span class="muted tiny block">${profile.bio || (profile.interests || []).length ? 'Présentation et centres d’intérêt' : 'Ajoute une présentation et tes centres d’intérêt'}</span></span>${I.chevron}</a>
      ${isOrganizer() ? `<a class="line-btn" href="#/orga">${I.sliders}<span>Espace organisateur</span>${I.chevron}</a>`
        : orgStatus && orgStatus.request && orgStatus.request.status === 'pending' ? `<a class="line-btn" href="#/devenir-organisateur">${I.sliders}<span>Devenir organisateur<span class="muted tiny block">Demande en cours d’examen</span></span>${I.chevron}</a>`
        : `<a class="line-btn" href="#/devenir-organisateur">${I.sliders}<span>Devenir organisateur<span class="muted tiny block">Publie tes soirées et suis tes statistiques</span></span>${I.chevron}</a>`}
      ${isAdmin() ? `<a class="line-btn" href="#/proposer" data-act="admin-new">${I.calendar}<span>Ajouter une soirée<span class="muted tiny block">Pour un organisateur existant ou nouveau</span></span>${I.chevron}</a>`
        : `<a class="line-btn" href="#/proposer" data-act="new-signal">${I.flag}<span>Signaler une soirée manquante</span>${I.chevron}</a>
      <a class="line-btn" href="#/mes-propositions">${I.doc}<span>Mes signalements</span>${I.chevron}</a>`}
      ${isAdmin() ? `<a class="line-btn" href="#/admin">${I.lock}<span>Espace admin</span>${adminCount() ? `<span class="count-pill">${adminCount()}</span>` : ''}${I.chevron}</a>` : ''}
    </div>` : ''}
    <a class="line-btn rounded" href="#/parametres">${I.gear}<span>Paramètres, confidentialité et informations</span>${I.chevron}</a>
  </section>`;
}

function viewSettings() {
  const opt = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
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
        ${cityField('Ma ville', 'Pour les soirées proches de chez toi et la carte des membres. Seule la ville est utilisée, jamais ton adresse.')}
        <label class="field">Rayon de recherche par défaut<select name="defaultRadius">${opt([[25, '25 km'], [50, '50 km'], [100, '100 km'], [200, '200 km'], [0, 'Partout']], state.defaultRadius)}</select></label>
      </div>
      <h2 class="group-title">Confidentialité</h2>
      <div class="card settings">
        <label class="field">Qui peut voir mes sorties<select name="visibility">${opt([['everyone', 'Tout le monde'], ['followed', 'Les membres que je suis'], ['nobody', 'Personne']], state.visibility)}</select></label>
        ${sw('invisible', state.invisible, 'Profil invisible', 'Tu n’apparais plus sur la carte des membres ni dans la communauté')}
        <p class="tiny muted">Tes sorties (« J’y vais ») apparaissent dans « Qui y va ? » sur chaque soirée et sur ta fiche membre. « Les membres que je suis » : seuls ceux que tu suis les voient.</p>
      </div>
      <h2 class="group-title">Notifications</h2>
      <div class="card settings">
        ${sw('remindersOn', state.remindersOn, 'Rappels de soirée')}
        ${sw('calAsk', state.calAsk !== 'never', 'Proposer l’ajout au calendrier', 'Après « J’y vais », une question te propose d’ajouter la soirée à ton calendrier')}
        <label class="field">Moment du rappel<select name="reminderTiming">${opt(Object.entries(REMINDER_TIMINGS).map(([k, v]) => [k, cap(v)]), state.reminderTiming)}</select></label>
        ${sw('ticketAlertsOn', state.ticketAlertsOn, 'Alertes billetterie', 'Ouverture des ventes et places libérées')}
        ${sw('followsOn', state.followsOn !== false, 'Organisateurs suivis', 'Quand ils annoncent une nouvelle soirée')}
        ${isAdmin() ? sw('adminNotifs', state.adminNotifs !== false, 'Espace admin', 'Soirées, demandes et signalements à traiter') : ''}
        ${sw('neutralNotifs', state.neutralNotifs, 'Notifications discrètes', 'Titre « EuroKink » et texte neutre, sans le nom de la soirée')}
        ${pushBlock()}
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

// Ville du membre : code postal ou commune, choisie dans les propositions du géocodeur public (IGN)
const cityLabel = (c) => (c.postal ? `${c.name} (${c.postal})` : c.name);
const cityKey = () => `${state.city}|${state.postal || ''}|${state.cityLat}`;
function cityField(label, hint) {
  const cur = cityLabel({ name: state.city, postal: state.postal });
  return `<div class="field city-field"><span>${label}</span>
    <input class="city-input" data-city-input value="${esc(cur)}" data-picked="${esc(cur)}" placeholder="Code postal ou nom de ta ville" autocomplete="off" enterkeyhint="search" aria-label="${esc(label)}">
    <input type="hidden" name="city" value="${esc(state.city)}"><input type="hidden" name="postal_code" value="${esc(state.postal || '')}">
    <input type="hidden" name="city_lat" value="${state.cityLat ?? ''}"><input type="hidden" name="city_lon" value="${state.cityLon ?? ''}">
    <div class="addr-list city-list"></div>
    <span class="hint">${hint}</span></div>`;
}
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const readCity = (f) => ({ name: f.elements.city.value, postal: f.elements.postal_code.value || '', lat: num(f.elements.city_lat.value), lon: num(f.elements.city_lon.value) });
function setCity(c) {
  state.city = c.name; state.postal = c.postal || '';
  const known = CITIES.find((x) => x.name === c.name);
  state.cityLat = c.lat ?? (known ? known.lat : null); state.cityLon = c.lon ?? (known ? known.lon : null);
}
const cityPicked = (form) => { const i = form.querySelector('[data-city-input]'); return !i || i.value.trim() === i.dataset.picked; };

let cityTimer, citySeq = 0, cityResults = [];
function cityGeocode(input) {
  clearTimeout(cityTimer);
  const box = input.parentNode.querySelector('.city-list');
  const q = input.value.trim();
  if (q.length < 2 || q === input.dataset.picked) { box.innerHTML = ''; cityResults = []; return; }
  cityTimer = setTimeout(async () => {
    const seq = ++citySeq;
    let feats = [], failed = false;
    try {
      const pc = /^\d{5}$/.test(q) ? `&postcode=${q}` : '';
      const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&type=municipality&limit=6&autocomplete=1${pc}`);
      if (!r.ok) throw new Error(String(r.status));
      feats = (await r.json()).features || [];
    } catch (e) { failed = true; }
    if (seq !== citySeq || !box.isConnected) return;
    const seen = new Set();
    cityResults = feats.filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {};
      const [lon, lat] = f.geometry.coordinates;
      return { name: p.city || p.name, postal: p.postcode || '', lat, lon, dept: String(p.context || '').split(',')[1]?.trim() || '' };
    }).filter((c) => { const k = cityLabel(c); if (seen.has(k)) return false; seen.add(k); return true; });
    if (!cityResults.length) {
      const ql = q.toLowerCase();
      cityResults = CITIES.filter((c) => c.name.toLowerCase().startsWith(ql) || ql.includes(c.name.toLowerCase())).slice(0, 4)
        .map((c) => ({ name: c.name, postal: '', lat: c.lat, lon: c.lon, dept: c.country === 'BE' ? 'Belgique' : '' }));
    }
    box.innerHTML = cityResults.length
      ? cityResults.map((c, i) => `<button type="button" class="addr-opt" data-act="city-pick" data-i="${i}"><strong>${esc(cityLabel(c))}</strong>${c.dept ? `<span class="muted tiny block">${esc(c.dept)}</span>` : ''}</button>`).join('')
      : `<p class="hint">${failed ? 'Recherche indisponible pour le moment : tape le nom d’une grande ville.' : 'Aucune ville trouvée : vérifie l’orthographe ou le code postal.'}</p>`;
  }, 300);
}
function pickCity(btn) {
  const c = cityResults[Number(btn.dataset.i)];
  if (!c) return;
  const wrap = btn.closest('.city-field');
  const inp = wrap.querySelector('[data-city-input]');
  const set = (n, v) => { wrap.querySelector(`[name=${n}]`).value = v ?? ''; };
  set('postal_code', c.postal); set('city_lat', c.lat); set('city_lon', c.lon); set('city', c.name);
  inp.value = inp.dataset.picked = cityLabel(c);
  wrap.querySelector('.city-list').innerHTML = '';
  cityResults = [];
  wrap.querySelector('[name=city]').dispatchEvent(new Event('change', { bubbles: true }));
}
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
          ${cityField('Ma ville', 'Tape ton code postal ou ta commune, puis choisis-la dans la liste. Seule la ville est utilisée, jamais ton adresse.')}
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
          ${cityField('Ma ville', 'Tape ton code postal ou ta commune, puis choisis-la dans la liste. Seule la ville est utilisée, jamais ton adresse.')}
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
const adminCount = () => (adminData ? adminData.pending.length + adminData.reports.length + (adminData.requests || []).length : 0);
const loadingScreen = (title, back) => `<section class="screen">${accountTopRaw(title, back)}<div class="loading"><div class="spinner" aria-hidden="true"></div></div></section>`;
const ADDR_FIELDS = ['address', 'postal_code', 'city', 'latitude', 'longitude', 'addrLabel'];

function viewSubmit() {
  const types = draft.types || [];
  const chosen = draft.latitude != null;
  const orgMode = !!(draft.id || draft.organizer_id);
  if (orgMode && orgStatus === null) { loadOrgStatus(); return loadingScreen('Soirée', '#/orga'); }
  const org = myOrgs().find((o) => o.id === draft.organizer_id);
  if (orgMode && !org && !isAdmin()) { draft = {}; saveDraft(); return viewSubmit(); }
  const title = draft.id ? 'Modifier la soirée' : orgMode ? 'Nouvelle soirée' : 'Signaler une soirée';
  const intro = orgMode
    ? (isAdmin() ? (draft.id ? 'Mode admin : tu peux corriger toutes les informations.' : 'Mode admin : ta soirée est publiée tout de suite.')
      : org && org.is_verified ? 'Organisateur vérifié : ta soirée est publiée tout de suite.' : 'Ta soirée est vérifiée par l’équipe EuroKink avant d’être publiée.')
    : 'Une soirée manque dans l’appli ? Indique-la : l’équipe EuroKink la vérifie avant de la publier. Tu l’organises ? <a class="accent" href="#/devenir-organisateur">Deviens organisateur</a>.';
  const canUpload = isAdmin() || !!org;
  const newOrg = draft.organizer_id === '__new';
  const orgChoices = [...(isAdmin() ? [['__new', '+ Nouvel organisateur (pas encore dans l’appli)']] : []), ...myOrgs().map((o) => [o.id, esc(o.name)])];
  const orgSection = orgMode
    ? `<h2 class="group-title">L’organisateur</h2><div class="card settings">${orgChoices.length > 1 && !draft.id && !draft.lockOrg
        ? `<label class="field">Organisation${selectField('organizer_id', orgChoices, draft.organizer_id)}</label>`
        : `<div class="line-btn static">${I.users}<span>${esc(org ? org.name : 'Ton organisation')}</span></div>`}
      ${newOrg ? `<p class="hint">L’organisateur sera créé avec la soirée. Tu pourras ensuite ajouter son logo dans Espace organisateur.</p><label class="field">Nom de l’organisateur *<input name="organizer_name" maxlength="80" value="${dv('organizer_name')}" autocomplete="off"></label>
        <label class="field">C’est…${selectField('organizer_kind', Object.entries(ORG_KIND).map(([k, v]) => [k, k === 'other' ? 'Autre' : v]), draft.organizer_kind || 'association')}</label>
        <label class="field">Site internet<input name="organizer_website" type="url" inputmode="url" value="${dv('organizer_website')}" placeholder="https://" autocomplete="off"></label>` : ''}</div>`
    : null;
  return `<section class="screen">${accountTopRaw(title, draft.returnTo || (orgMode ? '#/orga' : '#/profil'))}
    <p class="muted">${intro} Les champs marqués * sont obligatoires.</p>
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
      <h2 class="group-title">Visuel</h2>
      <div class="card settings">
        ${draft.image_path ? `<div class="img-preview"><div class="crop-frame" id="cropFrame"><img id="cropImg" src="${esc(imgSrc(draft.image_path))}" style="object-position:${draft.image_x ?? 50}% ${draft.image_y ?? 50}%" alt="" draggable="false" referrerpolicy="no-referrer" onerror="this.closest('.img-preview').classList.add('broken')"></div>
          <span class="hint crop-hint">Fais glisser la photo pour choisir la partie visible en haut de la fiche.</span><p class="form-error img-error">Ce lien ne mène pas à une image : il faut l’adresse de l’image elle-même (souvent terminée par .jpg ou .png), pas celle de la page. Le plus simple : enregistre l’image sur ton téléphone puis « Choisir une photo ».</p><button type="button" class="link" data-act="img-clear">Retirer l’image</button></div>` : ''}
        ${canUpload ? `<label class="btn btn-ghost btn-block file-btn">${I.image}<span>${draft.image_path ? 'Changer de photo' : 'Choisir une photo'}</span><input type="file" id="imgFile" accept="image/jpeg,image/png,image/webp"></label>` : ''}
        ${draft.image_path && !/^https:/i.test(draft.image_path) ? '' : `<label class="field">${canUpload ? 'Ou colle le lien d’une image' : 'Lien vers une image (affiche, photo)'}<input name="image_path" type="url" inputmode="url" value="${dv('image_path')}" placeholder="https://…" autocomplete="off"></label>`}
        <span class="hint">L’affiche ou une photo de la soirée, de préférence au format paysage.</span>
      </div>
      <h2 class="group-title">Le lieu</h2>
      <div class="card settings">
        <label class="field">Nom du lieu *<input name="venue_name" maxlength="120" value="${dv('venue_name')}" placeholder="Ex. Le Dépôt" autocomplete="off"></label>
        <label class="checkline"><input type="checkbox" name="secret" ${draft.secret ? 'checked' : ''}><span>L’adresse n’est donnée qu’aux inscrits : seule la ville apparaîtra sur la carte</span></label>
        ${chosen ? `<div class="addr-chosen">${I.pin}<span>${esc(draft.addrLabel)}</span><button type="button" class="link" data-act="addr-clear">Modifier</button></div>`
          : `<label class="field">${draft.secret ? 'Ville *' : 'Adresse *'}<input id="addrInput" name="addr_q" autocomplete="off" value="${dv('addr_q')}" placeholder="${draft.secret ? 'Ex. Nantes' : 'Ex. 12 rue de la Paix, Nantes'}"><span class="hint">Tape au moins 3 lettres puis choisis dans la liste.</span></label><div id="addrList" class="addr-list"></div>`}
      </div>
      ${orgSection || `<h2 class="group-title">L’organisateur</h2>
      <div class="card settings">
        <label class="field">Nom de l’organisateur *<input name="organizer_name" maxlength="80" value="${dv('organizer_name')}" placeholder="Ex. Rubber Ouest" autocomplete="off"></label>
        <label class="field">C’est…${selectField('organizer_kind', Object.entries(ORG_KIND).map(([k, v]) => [k, k === 'other' ? 'Autre' : v]), draft.organizer_kind || 'association')}</label>
        <label class="field">Site internet<input name="organizer_website" type="url" inputmode="url" value="${dv('organizer_website')}" placeholder="https://" autocomplete="off"></label>
      </div>`}
      <h2 class="group-title">Entrée et dress code</h2>
      <div class="card settings">
        <label class="field">Prix d’entrée (€) *<input name="price" inputmode="decimal" value="${dv('price')}" placeholder="0 si gratuit"></label>
        <label class="field">Prix en prévente (€)<input name="presale_price" inputmode="decimal" value="${dv('presale_price')}"></label>
        <label class="field">Réservation${selectField('booking', Object.entries({ door_only: 'Sur place, sans réservation', recommended: 'Conseillée', required: 'Obligatoire' }), draft.booking || 'door_only')}</label>
        <label class="field">Lien de la billetterie<input name="ticket_url" type="url" inputmode="url" value="${dv('ticket_url')}" placeholder="https://" autocomplete="off"></label>
        <label class="field">Ouverture de la billetterie<input name="sales_open_at" type="datetime-local" value="${dv('sales_open_at')}"><span class="hint">Si les places ne sont pas encore en vente : les membres seront alertés.</span></label>
        <label class="field">Fin de la billetterie<input name="sales_close_at" type="datetime-local" value="${dv('sales_close_at')}"><span class="hint">Après cette date, la fiche affichera « Billetterie fermée ».</span></label>
        <label class="field">Dress code${selectField('dress_code', Object.entries(DRESS), draft.dress_code || 'recommended')}</label>
        <label class="field">Précisions sur le dress code<input name="dress_code_details" maxlength="200" value="${dv('dress_code_details')}" placeholder="Ex. Cuir ou rubber, pas de jean" autocomplete="off"></label>
        <label class="field">Vestiaire${selectField('cloak', [['', 'Je ne sais pas'], ['no', 'Non'], ['free', 'Oui, gratuit'], ['paid', 'Oui, payant']], draft.cloak || '')}</label>
      </div>
      <div class="card settings">
        <label class="checkline"><input type="checkbox" name="certify" ${draft.certify ? 'checked' : ''}><span>Je certifie que cette soirée existe, qu’elle est réservée aux adultes et qu’elle respecte la <a href="#/infos/charte">charte</a>.</span></label>
        <p class="form-error" id="formError" role="alert" hidden></p>
        <button class="btn btn-red btn-block" type="submit">${submitLabel()}</button>
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

const submitLabel = () => (draft.id ? 'Enregistrer les modifications' : draft.organizer_id ? 'Publier ma soirée' : 'Envoyer');
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
  if (!d.id && new Date(d.starts_at) < new Date()) return fail('La soirée doit être à venir.');
  if (new Date(d.ends_at) <= new Date(d.starts_at)) return fail('La fin doit être après le début.');
  if (String(d.venue_name || '').trim().length < 2) return fail('Indique le nom du lieu.');
  if (d.latitude == null) return fail(d.secret ? 'Choisis la ville dans la liste proposée.' : 'Choisis l’adresse dans la liste proposée.');
  if (!d.id && !isUuid(d.organizer_id) && String(d.organizer_name || '').trim().length < 2) return fail('Indique le nom de l’organisateur.');
  if (d.image_path && !/^https:\/\/\S+$/i.test(d.image_path) && !/^[0-9a-f-]{36}\/[\w.-]+$/i.test(d.image_path)) return fail('Le lien de l’image doit commencer par https://');
  const price = numOrNull(d.price), presale = numOrNull(d.presale_price);
  if (price === null || Number.isNaN(price) || price < 0) return fail('Indique le prix d’entrée (0 si gratuit).');
  if (presale !== null && (Number.isNaN(presale) || presale < 0)) return fail('Prix en prévente invalide.');
  for (const [k, label] of [['ticket_url', 'Le lien de la billetterie'], ['organizer_website', 'Le site de l’organisateur']]) {
    if (d[k] && !/^https?:\/\/\S+$/i.test(String(d[k]).trim())) return fail(`${label} doit commencer par https://`);
  }
  if (d.sales_close_at && new Date(d.sales_close_at) > new Date(d.ends_at)) return fail('La fin de la billetterie doit être avant la fin de la soirée.');
  if (d.sales_close_at && d.sales_open_at && new Date(d.sales_close_at) <= new Date(d.sales_open_at)) return fail('La fin de la billetterie doit être après son ouverture.');
  if (!d.certify) return fail('Coche la case de confirmation en bas du formulaire.');
  const p = {
    id: d.id || null, organizer_id: d.id || !isUuid(d.organizer_id) ? null : d.organizer_id,
    title, types: d.types, starts_at: isoOrNull(d.starts_at), ends_at: isoOrNull(d.ends_at), frequency: d.frequency || 'once',
    description: d.description || '', venue_name: String(d.venue_name).trim(), address: d.secret ? '' : (d.address || ''),
    postal_code: d.postal_code || '', city: d.city, latitude: d.latitude, longitude: d.longitude,
    organizer_name: String(d.organizer_name || '').trim(), organizer_kind: d.organizer_kind || 'association', organizer_website: (d.organizer_website || '').trim(),
    price, presale_price: presale, booking: d.booking || 'door_only', ticket_url: (d.ticket_url || '').trim(), sales_open_at: isoOrNull(d.sales_open_at),
    dress_code: d.dress_code || 'recommended', dress_code_details: d.dress_code_details || '',
    has_cloakroom: d.cloak ? d.cloak !== 'no' : null, cloakroom_paid: d.cloak === 'paid' ? true : d.cloak === 'free' ? false : null
  };
  const btn = form.querySelector('button[type=submit]');
  submitting = true; btn.disabled = true; btn.textContent = 'Envoi…'; formError(form, '');
  try {
    const r = await sb.rpc('submit_event', { p });
    const imgKey = d.image_path ? `${d.image_path}|${d.image_x ?? 50}|${d.image_y ?? 50}` : '';
    if (r && r.id && imgKey !== ((d._img || '').startsWith('|') ? '' : d._img || '')) {
      try { await sb.rpc('set_event_image', { p_event: r.id, p_image: d.image_path || null, p_x: Math.round(d.image_x ?? 50), p_y: Math.round(d.image_y ?? 50) }); } catch (err) { toast(`Soirée enregistrée, mais image refusée : ${err.message}`); }
    }
    if (r && r.id && (d.sales_close_at || '') !== (d._close || '')) {
      try { await sb.rpc('set_event_sales_close', { p_event: r.id, p_close: isoOrNull(d.sales_close_at) }); } catch (err) { toast(`Soirée enregistrée, mais fin de billetterie refusée : ${err.message}`); }
    }
    const orgMode = !!(d.id || d.organizer_id);
    draft = {}; saveDraft(); mySubs = null; adminData = null;
    Object.keys(orgDash).forEach((k) => delete orgDash[k]);
    const pub = r && r.status === 'published';
    toast(d.id ? (pub ? 'Modifications enregistrées' : 'Modifications enregistrées : elles seront vérifiées avant publication')
      : pub ? 'Soirée publiée !' : 'Merci ! La soirée sera vérifiée avant publication.');
    refreshEvents();
    navigate(d.returnTo || (orgMode ? '#/orga' : '#/mes-propositions'));
  } catch (err) {
    fail(err.message);
  } finally {
    submitting = false;
    if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = submitLabel(); }
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
  if (mySubs === null) { loadMySubs(); return loadingScreen('Mes signalements', '#/profil'); }
  const cards = mySubs.map((s) => {
    const [cls, label] = SUB_STATUS[s.status] || ['pill-grey', s.status];
    return `<div class="card sub-card"><div class="sub-head"><strong>${esc(s.title)}</strong><span class="${cls}">${label}</span></div>
      <div class="muted tiny">${dayLabel(s.starts_at)} · ${timeLabel(s.starts_at)} · ${esc(s.city)}</div>
      ${s.status === 'pending' ? '<p class="tiny muted">L’équipe EuroKink la vérifie avant publication.</p>' : ''}
      ${s.status === 'rejected' && s.rejection_reason ? `<p class="tiny">Motif : ${esc(s.rejection_reason)}</p>` : ''}
      ${s.status === 'published' && eventById(s.id) ? `<a class="link" href="#/soiree/${s.id}">Voir la fiche</a>` : ''}</div>`;
  }).join('');
  return `<section class="screen">${accountTopRaw('Mes signalements', '#/profil')}
    <a class="btn btn-red btn-block" href="#/proposer" data-act="new-signal">Signaler une soirée manquante</a>
    ${cards || empty('Tu n’as encore signalé aucune soirée.')}</section>`;
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
    <div class="sub-head"><strong>${esc(p.title)}</strong><span class="pill-grey">${p.source === 'import' ? 'Import' : p.by_manager ? 'Organisateur' : 'Signalée'}</span></div>
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
    ${p.image_path ? `<img class="adm-img" src="${esc(imgSrc(p.image_path))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="adm-actions"><button class="btn btn-red" data-act="adm-publish" data-id="${p.id}">Publier</button><button class="btn btn-ghost" data-act="adm-edit" data-id="${p.id}">Modifier</button><button class="btn btn-ghost" data-act="adm-reject" data-id="${p.id}">Refuser</button></div>
    ${o.is_verified ? '' : `<button class="link" data-act="adm-trust" data-id="${p.id}" data-org="${o.id}">Publier et faire confiance à « ${esc(o.name)} »</button>`}
  </article>`;
}

function adminReportCard(r) {
  return `<article class="card adm-card">
    <div class="sub-head"><strong>${esc(r.reason)}</strong><span class="pill-grey">${r.target_type === 'event' ? 'Soirée' : r.target_type === 'profile' ? 'Profil' : 'Organisateur'}</span></div>
    <div class="muted tiny">par ${esc(r.reporter || 'membre supprimé')} · le ${fDate.format(new Date(r.created_at))}</div>
    ${r.details && r.details !== r.reason ? `<p class="adm-desc">${esc(r.details)}</p>` : ''}
    ${r.target_type === 'profile' ? `<div class="adm-facts"><div>${I.user}<span>Profil signalé</span><a class="link" href="#/membre/${r.target_id}">Voir</a></div></div>` : ''}
    ${r.event_title ? `<div class="adm-facts"><div>${I.calendar}<span>${esc(r.event_title)}</span>${eventById(r.target_id) ? `<a class="link" href="#/soiree/${r.target_id}">Voir</a>` : ''}</div></div>` : ''}
    <div class="adm-actions"><button class="btn btn-red" data-act="adm-report" data-id="${r.id}">Traité</button><button class="btn btn-ghost" data-act="adm-report" data-id="${r.id}" data-dismiss="1">Ignorer</button></div>
  </article>`;
}

// --- Robot d'import (onglet admin) ---
let robotSources = null, robotForm = false, robotBusy = false, srcTypes = ['multi'];
const KIND_LABEL = { ical: 'Agenda iCal', jsonld: 'Page web (données structurées)', tribe: 'WordPress (The Events Calendar)' };
async function loadRobot() {
  try { robotSources = await sb.select('import_sources', 'select=*,organizer:organizers(name)&order=name.asc'); } catch (err) { robotSources = []; toast(err.message); }
  if (location.hash.startsWith('#/admin')) render();
}
function robotCard(s) {
  const when = s.last_read_at ? `${fDate.format(new Date(s.last_read_at))} à ${timeLabel(s.last_read_at)}` : 'jamais';
  const status = s.last_error ? `<p class="tiny form-error robot-err">${esc(s.last_error)}</p>`
    : s.last_read_at ? `<p class="tiny muted">${s.last_found ?? 0} soirée(s) à venir trouvée(s), ${s.last_added ?? 0} ajoutée(s) à la file</p>` : '';
  return `<article class="card adm-card${s.is_active ? '' : ' off'}">
    <div class="sub-head"><strong>${esc(s.name)}</strong><span class="pill-grey">${s.is_active ? 'Active' : 'En pause'}</span></div>
    <div class="adm-facts">
      <div>${I.doc}<span class="break">${esc(s.url)}</span><a class="link" href="${esc(s.url)}" target="_blank" rel="noopener">Ouvrir</a></div>
      <div>${I.users}<span>${esc(s.organizer ? s.organizer.name : 'Organisateur lu sur la page')} · ${KIND_LABEL[s.kind] || s.kind}</span></div>
      <div>${I.calendar}<span>Dernier passage : ${when} · types ${esc((s.default_types || []).map(typeName).join(', '))}</span></div>
    </div>
    ${status}
    <div class="org-actions"><button class="mini-btn" data-act="src-run" data-id="${s.id}">Lancer</button>
      <button class="mini-btn" data-act="src-toggle" data-id="${s.id}" data-on="${s.is_active ? '' : '1'}">${s.is_active ? 'Mettre en pause' : 'Réactiver'}</button>
      <button class="mini-btn danger" data-act="src-del" data-id="${s.id}">Supprimer</button></div>
  </article>`;
}
function viewRobot() {
  if (robotSources === null) { loadRobot(); return '<div class="loading"><div class="spinner" aria-hidden="true"></div></div>'; }
  const form = robotForm ? `<form id="sourceForm" class="card settings">
      <label class="field">Nom de la source *<input name="name" maxlength="80" placeholder="Ex. Ouest Fetish (agenda)" autocomplete="off"></label>
      <label class="field">Adresse (lien) *<input name="url" type="url" inputmode="url" placeholder="https://…" autocomplete="off"></label>
      <label class="field">Format${selectField('kind', Object.entries(KIND_LABEL), 'ical')}<span class="hint">Agenda iCal : lien qui finit souvent par .ics ou ?ical=1. Page web : page d’événement ou de billetterie (Shotgun, Billetweb…).</span></label>
      <label class="field">Organisateur${selectField('organizer_id', [['', 'Lu sur la page (ou nom de la source)'], ...myOrgs().map((o) => [o.id, esc(o.name)])], '')}</label>
      <div class="field">Types par défaut<div class="chips wrap">${EVENT_TYPES.map((t) => `<button type="button" class="chip ${srcTypes.includes(t.slug) ? 'on' : ''}" data-act="src-type" data-slug="${t.slug}">${esc(t.name)}</button>`).join('')}</div></div>
      <p class="form-error" id="formError" role="alert" hidden></p>
      <div class="adm-actions"><button class="btn btn-red" type="submit">Ajouter</button><button class="btn btn-ghost" type="button" data-act="src-form">Annuler</button></div>
    </form>` : '<button class="btn btn-ghost btn-block" data-act="src-form">+ Ajouter une source</button>';
  return `<div class="card robot-head"><p class="tiny muted">Le robot lit ces sources chaque matin vers 6 h et envoie les nouvelles soirées dans l’onglet « Soirées » pour que tu les valides. Il ne publie jamais rien seul.</p>
      <button class="btn btn-red btn-block" data-act="src-run" ${robotBusy ? 'disabled' : ''}>${robotBusy ? 'Le robot travaille…' : 'Lancer le robot maintenant'}</button></div>
    ${form}
    ${robotSources.map(robotCard).join('') || empty('Aucune source pour le moment.')}`;
}
async function robotAct(act) {
  const id = act.dataset.id;
  switch (act.dataset.act) {
    case 'src-form': robotForm = !robotForm; srcTypes = ['multi']; render(); break;
    case 'src-type': {
      const t = act.dataset.slug;
      srcTypes = srcTypes.includes(t) ? srcTypes.filter((x) => x !== t) : [...srcTypes, t];
      if (!srcTypes.length) srcTypes = ['multi'];
      act.classList.toggle('on', srcTypes.includes(t));
      break;
    }
    case 'src-run': {
      if (robotBusy) return;
      robotBusy = true; render();
      try {
        const r = await sb.invoke('import-events', id ? { source_id: id } : {});
        const added = (r.report || []).reduce((n, x) => n + (x.added || 0), 0);
        toast(added ? `${added} nouvelle(s) soirée(s) à valider` : 'Aucune nouvelle soirée');
      } catch (err) { toast(err.message); }
      robotBusy = false; robotSources = null; adminData = null; render();
      break;
    }
    case 'src-toggle':
      try { await sb.update('import_sources', `id=eq.${id}`, { is_active: !!act.dataset.on }); robotSources = null; render(); } catch (err) { toast(err.message); }
      break;
    case 'src-del':
      if (!confirm('Supprimer cette source ? Les soirées déjà importées restent.')) return;
      try { await sb.remove('import_sources', `id=eq.${id}`); robotSources = null; render(); } catch (err) { toast(err.message); }
      break;
    default: break;
  }
}
async function saveSource(form) {
  const f = new FormData(form);
  const row = { name: String(f.get('name') || '').trim(), url: String(f.get('url') || '').trim(), kind: f.get('kind'),
    organizer_id: f.get('organizer_id') || null, default_types: srcTypes };
  if (row.name.length < 2) return formError(form, 'Donne un nom à la source.');
  if (!/^https:\/\/\S+$/i.test(row.url)) return formError(form, 'Le lien doit commencer par https://');
  try { await sb.insert('import_sources', row); robotForm = false; robotSources = null; toast('Source ajoutée : appuie sur « Lancer » pour l’essayer'); render(); }
  catch (err) { formError(form, /duplicate|unique/i.test(err.message) ? 'Cette adresse est déjà dans la liste.' : err.message); }
}

// --- Notifications sur le téléphone (Web Push) ---
let pushState = 'unknown';   // unsupported | ios-install | denied | off | on | busy
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function checkPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    pushState = isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  } else if (Notification.permission === 'denied') pushState = 'denied';
  else {
    try {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sw')), 4000))]);
      const sub = await reg.pushManager.getSubscription();
      pushState = sub ? 'on' : 'off';
      if (sub && loggedIn()) saveSubscription(sub).catch(() => {});
    } catch (err) { pushState = 'off'; }
  }
  if (location.hash.startsWith('#/parametres')) render();
}
function saveSubscription(sub) {
  const j = sub.toJSON();
  return sb.insert('push_subscriptions', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) },
    { onConflict: 'endpoint' });
}
function pushBlock() {
  if (!loggedIn()) return '';
  const msg = {
    unknown: '', busy: '<p class="tiny muted">Un instant…</p>',
    'ios-install': '<p class="tiny push-hint">Sur iPhone, les notifications ne marchent que dans l’appli installée : dans Safari, touche Partager puis « Sur l’écran d’accueil », et ouvre EuroKink depuis son icône (iOS 16.4 ou plus récent).</p>',
    unsupported: '<p class="tiny muted">Ce navigateur ne permet pas les notifications.</p>',
    denied: '<p class="tiny push-hint">Les notifications sont bloquées pour EuroKink dans les réglages du téléphone. Autorise-les puis reviens ici.</p>',
    off: '<button type="button" class="btn btn-red btn-block" data-act="push-on">Activer les notifications sur ce téléphone</button>',
    on: `<div class="push-on">${I.check}<span>Notifications activées sur ce téléphone</span></div>
      <div class="adm-actions"><button type="button" class="btn btn-ghost" data-act="push-test">Envoyer un test</button><button type="button" class="btn btn-ghost" data-act="push-off">Désactiver</button></div>`
  };
  return msg[pushState] || '';
}
function urlB64ToBytes(s) { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
async function pushAct(act) {
  const kind = act.dataset.act;
  try {
    // Sur iPhone, la demande d'autorisation doit partir directement du toucher : avant toute attente
    const permAsk = kind === 'push-on' ? Notification.requestPermission() : null;
    const reg = await navigator.serviceWorker.ready;
    if (kind === 'push-on') {
      pushState = 'busy'; render();
      const perm = await permAsk;
      if (perm !== 'granted') { pushState = perm === 'denied' ? 'denied' : 'off'; render(); return; }
      const key = await sb.rpc('push_public_key');
      if (!key) throw new Error('Service de notifications indisponible, réessaie dans quelques minutes');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) });
      await saveSubscription(sub);
      pushState = 'on'; toast('Notifications activées'); render();
    } else if (kind === 'push-off') {
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await sb.remove('push_subscriptions', `endpoint=eq.${encodeURIComponent(sub.endpoint)}`).catch(() => {}); await sub.unsubscribe(); }
      pushState = 'off'; toast('Notifications désactivées sur ce téléphone'); render();
    } else if (kind === 'push-test') {
      act.disabled = true;
      await sb.rpc('push_test');
      await sb.invoke('send-push', {});
      toast('Notification de test envoyée');
      act.disabled = false;
    }
  } catch (err) { toast(err.message || 'Impossible d’activer les notifications'); checkPush(); }
}

function viewAdmin() {
  if (!isAdmin()) return `<section class="screen">${accountTopRaw('Espace admin', '#/profil')}${empty('Réservé à l’administrateur.')}</section>`;
  if (adminData === null) { loadAdmin(); return loadingScreen('Espace admin', '#/profil'); }
  const { pending, reports } = adminData;
  const requests = adminData.requests || [];
  const tab = (k, label, n) => `<button class="${adminTab === k ? 'on' : ''}" data-act="adm-tab" data-tab="${k}" aria-pressed="${adminTab === k}">${label}${n ? ` <span class="count-pill">${n}</span>` : ''}</button>`;
  const body = adminTab === 'pending'
    ? (pending.map(adminPendingCard).join('') || empty('Aucune soirée à valider. Tout est à jour !'))
    : adminTab === 'requests' ? (requests.map(adminRequestCard).join('') || empty('Aucune demande d’organisateur.'))
    : adminTab === 'robot' ? viewRobot()
    : (reports.map(adminReportCard).join('') || empty('Aucun signalement en cours.'));
  return `<section class="screen">${accountTopRaw('Espace admin', '#/profil')}
    <div class="seg seg-btn">${tab('pending', 'Soirées', pending.length)}${tab('requests', 'Organisateurs', requests.length)}${tab('reports', 'Signalements', reports.length)}${tab('robot', 'Robot', 0)}</div>
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
    case 'adm-req-ok': case 'adm-req-trust':
      adminRun(act, () => sb.rpc('handle_organizer_request', { p_request: id, p_approve: true, p_trust: act.dataset.act === 'adm-req-trust' }), 'Demande acceptée : le membre a son espace organisateur');
      break;
    case 'adm-req-no': {
      const reason = prompt('Motif du refus (visible par le membre) :', 'Impossible de vérifier que tu représentes cette organisation');
      if (reason === null) return;
      adminRun(act, () => sb.rpc('handle_organizer_request', { p_request: id, p_approve: false, p_reason: reason.trim().slice(0, 300) }), 'Demande refusée');
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

// ---------------------------------------------------------------------------
// Organisateurs : demande, espace organisateur, page publique
// ---------------------------------------------------------------------------
let orgStatus = null;        // { organizations, request } (null = à charger)
const orgDash = {};          // tableau de bord par organisation
const orgPublic = {};        // pages publiques déjà chargées
let orgEditing = false;
let loadingOrg = false;
const viewed = new Set();
const myOrgs = () => (orgStatus && orgStatus.organizations) || [];
const isOrganizer = () => myOrgs().length > 0;
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const numStr = (n) => (n == null ? '' : String(n).replace('.', ','));

async function loadOrgStatus() {
  if (loadingOrg || !loggedIn()) return;
  loadingOrg = true;
  try { orgStatus = await sb.rpc('my_organizer_status'); } catch (err) { orgStatus = { organizations: [], request: null }; }
  loadingOrg = false;
  if (/^#\/(profil|orga|devenir-organisateur|proposer)/.test(location.hash)) render();
}

function eventToDraft(ev, orgId, copy) {
  const v = ev.venue;
  return {
    image_path: ev.image_path || '', image_x: ev.image_x ?? 50, image_y: ev.image_y ?? 50,
    _img: copy ? '' : `${ev.image_path || ''}|${ev.image_x ?? 50}|${ev.image_y ?? 50}`,
    id: copy ? undefined : ev.id, organizer_id: orgId, title: ev.title, types: [...(ev.types || [])],
    starts_at: copy ? '' : toLocalInput(ev.starts_at), ends_at: copy ? '' : toLocalInput(ev.ends_at),
    frequency: ev.frequency, description: ev.description || '', venue_name: v.name, secret: !v.address,
    address: v.address || '', postal_code: v.postal_code || '', city: v.city, latitude: v.latitude, longitude: v.longitude,
    addrLabel: [v.address, v.postal_code, v.city].filter(Boolean).join(' '),
    price: numStr(ev.price), presale_price: numStr(ev.presale_price), booking: ev.booking, ticket_url: ev.ticket_url || '',
    sales_open_at: copy ? '' : toLocalInput(ev.sales_open_at), sales_close_at: copy ? '' : toLocalInput(ev.sales_close_at),
    _close: copy ? '' : toLocalInput(ev.sales_close_at), dress_code: ev.dress_code, dress_code_details: ev.dress_code_details || '',
    cloak: ev.has_cloakroom == null ? '' : !ev.has_cloakroom ? 'no' : ev.cloakroom_paid ? 'paid' : 'free'
  };
}

function viewBecomeOrganizer() {
  if (orgStatus === null) { loadOrgStatus(); return loadingScreen('Devenir organisateur', '#/profil'); }
  if (isOrganizer()) return viewOrga();
  const req = orgStatus.request;
  if (req && req.status === 'pending') {
    return `<section class="screen">${accountTopRaw('Devenir organisateur', '#/profil')}
      <div class="card center-card"><h2>Demande en cours d’examen</h2><p class="muted">Ta demande pour « ${esc(req.name)} » a bien été reçue le ${fDate.format(new Date(req.created_at))}. L’équipe EuroKink la vérifie et te répond rapidement.</p></div></section>`;
  }
  return `<section class="screen">${accountTopRaw('Devenir organisateur', '#/profil')}
    <div class="card perks"><strong>Ton espace organisateur, c’est :</strong>
      <ul><li>Publier et modifier tes soirées en quelques minutes</li><li>Des statistiques : vues, favoris, « J’y vais », alertes billetterie</li>
      <li>Ta page publique, que les membres peuvent suivre</li><li>Une fois vérifié, tes soirées sont publiées sans attente</li></ul>
      <p class="tiny muted">C’est gratuit. Sur l’appli, seul le nom de ton organisation apparaît, jamais ton pseudo.</p></div>
    ${req && req.status === 'rejected' ? `<div class="card"><strong>Ta demande précédente a été refusée</strong>${req.rejection_reason ? `<p class="tiny muted">Motif : ${esc(req.rejection_reason)}</p>` : ''}</div>` : ''}
    <form id="orgRequestForm" class="card settings" novalidate>
      <label class="field">Nom de l’organisation *<input name="name" maxlength="80" required placeholder="Ex. Rubber Ouest" autocomplete="off"></label>
      <label class="field">C’est…${selectField('kind', Object.entries(ORG_KIND).map(([k, v]) => [k, k === 'other' ? 'Autre' : v]), 'association')}</label>
      <label class="field">Ville<input name="city" maxlength="80" autocomplete="off"></label>
      <label class="field">Site ou page officielle *<input name="website" type="url" inputmode="url" placeholder="https://" autocomplete="off"><span class="hint">Permet de vérifier que tu représentes bien l’organisation.</span></label>
      <label class="field">E-mail de contact *<input name="contact_email" type="email" inputmode="email" autocomplete="email"><span class="hint">Vu uniquement par l’équipe EuroKink.</span></label>
      <label class="field">Message pour l’équipe<textarea name="message" rows="3" maxlength="1000" placeholder="Ton rôle dans l’organisation, tes soirées…"></textarea></label>
      <p class="form-error" id="formError" role="alert" hidden></p>
      <button class="btn btn-red btn-block" type="submit">Envoyer ma demande</button>
    </form></section>`;
}

async function openEditor(id, { copy = false, returnTo = '#/orga' } = {}) {
  try {
    const ev = await sb.rpc('event_for_edit', { p_event: id });
    draft = eventToDraft(ev, ev.organizer_id, copy);
    draft.returnTo = returnTo;
    saveDraft();
    if (copy) toast('Copie prête : indique les nouvelles dates');
    navigate('#/proposer');
  } catch (err) { toast(err.message); }
}

function shrinkImage(file, max = 1600, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), type, 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible : essaie un JPEG ou un PNG')); };
    img.src = url;
  });
}

let uploading = false;
async function handleImageFile(input) {
  const file = input.files && input.files[0];
  if (!file || uploading) return;
  if (!/^image\//.test(file.type)) { toast('Choisis une image'); return; }
  uploading = true; toast('Envoi de l’image…');
  try {
    const blob = await shrinkImage(file);
    const folder = isUuid(draft.organizer_id) ? draft.organizer_id : profile.id;
    const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await sb.uploadImage('event-images', path, blob);
    draft.image_path = path; draft.image_x = 50; draft.image_y = 50; saveDraft(); render(); toast('Image ajoutée');
  } catch (err) { toast(err.message); }
  uploading = false;
}

// Fenêtres par-dessus l'écran (photo en grand, panneau de la carte) : le geste retour
// ou le bouton retour d'Android les ferme au lieu de quitter la page
let overlayClose = null;
function openOverlay(close) {
  if (overlayClose) { overlayClose = close; return; }
  overlayClose = close;
  history.pushState({ ekOverlay: true }, '');
}
function closeOverlay() { if (overlayClose) history.back(); }
window.addEventListener('popstate', () => {
  if (!overlayClose) return;
  const f = overlayClose; overlayClose = null; f();
});

function openViewer(src) {
  if (!src) return;
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer"><button class="icon-btn viewer-close" aria-label="Fermer">${I.close}</button>`;
  const onKey = (ev) => { if (ev.key === 'Escape') closeOverlay(); };
  v.addEventListener('click', closeOverlay);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(v);
  openOverlay(() => { v.remove(); document.removeEventListener('keydown', onKey); });
}

// Cadrage : on fait glisser l'image dans le cadre (même proportions que le bandeau de la fiche)
let crop = null;
document.addEventListener('pointerdown', (ev) => {
  const frame = ev.target.closest && ev.target.closest('#cropFrame');
  const img = frame && frame.querySelector('img');
  if (!img || !img.naturalWidth) return;
  ev.preventDefault();
  const fw = frame.clientWidth, fh = frame.clientHeight;
  const k = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
  crop = { img, id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, x0: draft.image_x ?? 50, y0: draft.image_y ?? 50,
    ox: img.naturalWidth * k - fw, oy: img.naturalHeight * k - fh };
  frame.setPointerCapture(ev.pointerId);
  frame.classList.add('dragging');
});
document.addEventListener('pointermove', (ev) => {
  if (!crop || ev.pointerId !== crop.id) return;
  const clamp = (n) => Math.max(0, Math.min(100, n));
  if (crop.ox > 1) draft.image_x = clamp(crop.x0 - ((ev.clientX - crop.sx) / crop.ox) * 100);
  if (crop.oy > 1) draft.image_y = clamp(crop.y0 - ((ev.clientY - crop.sy) / crop.oy) * 100);
  crop.img.style.objectPosition = `${draft.image_x}% ${draft.image_y}%`;
});
const endCrop = (ev) => {
  if (!crop || ev.pointerId !== crop.id) return;
  const f = crop.img.parentNode; if (f) f.classList.remove('dragging');
  draft.image_x = Math.round(draft.image_x ?? 50); draft.image_y = Math.round(draft.image_y ?? 50);
  crop = null; saveDraft();
};
document.addEventListener('pointerup', endCrop);
document.addEventListener('pointercancel', endCrop);

async function setOrgLogo(value) {
  await sb.update('organizers', `id=eq.${currentOrgId}`, { logo_path: value });
  delete orgDash[currentOrgId]; delete orgPublic[currentOrgId];
  render(); refreshEvents();
}

async function handleLogoFile(input) {
  const file = input.files && input.files[0];
  if (!file || uploading || !isUuid(currentOrgId)) return;
  if (!/^image\//.test(file.type)) { toast('Choisis une image'); return; }
  uploading = true;
  try {
    const blob = await cropCircle(file, { size: 512, type: 'image/png', title: 'Cadrer le logo' });
    input.value = '';
    if (!blob) { uploading = false; return; }
    toast('Envoi du logo…');
    const path = `${currentOrgId}/logo-${Date.now().toString(36)}.png`;
    await sb.uploadImage('event-images', path, blob);
    await setOrgLogo(path);
    toast('Logo ajouté');
  } catch (err) { toast(err.message); }
  uploading = false;
}

async function submitOrgRequest(form) {
  const f = new FormData(form);
  const btn = form.querySelector('button[type=submit]');
  const p = Object.fromEntries(['name', 'kind', 'city', 'website', 'contact_email', 'message'].map((k) => [k, String(f.get(k) || '').trim()]));
  if (p.name.length < 2) return formError(form, 'Indique le nom de ton organisation.');
  if (!/^https?:\/\/\S+$/i.test(p.website)) return formError(form, 'Indique le site ou la page officielle (lien commençant par https://).');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.contact_email)) return formError(form, 'Adresse e-mail de contact invalide.');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    await sb.rpc('request_organizer', { p });
    orgStatus = null; adminData = null;
    toast('Demande envoyée ! Tu seras prévenu dès qu’elle sera validée.');
    render();
  } catch (err) { formError(form, err.message); btn.disabled = false; btn.textContent = 'Envoyer ma demande'; }
}

async function loadOrgDash(id) {
  try {
    const [d, rows] = await Promise.all([sb.rpc('org_dashboard', { p_org: id }), sb.select('organizers', `select=logo_path&id=eq.${id}`).catch(() => [])]);
    orgDash[id] = d ? d : { error: 'Organisation introuvable' };
    if (d) d.organizer.logo = rows && rows[0] ? rows[0].logo_path : null;
  } catch (err) { orgDash[id] = { error: err.message }; }
  if (location.hash.startsWith('#/orga')) render();
}

const statLine = (s, past) => [[I.eye, s.views, 'vues'], [I.heart, s.favorites, 'favoris'], [I.check, s.attending, 'j’y vais'],
  [I.bell, s.reminders, 'rappels'], [I.ticket, s.alerts, 'alertes'], ...(past ? [[I.locate, s.checkins, 'présents']] : [])]
  .map(([ic, n, l]) => `<span class="stat-chip" title="${l}">${ic}<b>${n}</b> ${l}</span>`).join('');

function orgEventCard(ev, past) {
  const st = ev.status === 'published' ? (ev.is_sold_out ? ['pill-red', 'Complet'] : ['pill-red', 'Publiée']) : SUB_STATUS[ev.status] || ['pill-grey', ev.status];
  const live = !past && ev.status !== 'cancelled';
  return `<article class="card sub-card">
    <div class="sub-head"><strong>${esc(ev.title)}</strong><span class="${st[0]}">${st[1]}</span></div>
    <div class="muted tiny">${dayLabel(ev.starts_at)} · ${timeLabel(ev.starts_at)} · ${esc(ev.venue.city)}</div>
    ${ev.status === 'pending' ? '<p class="tiny muted">En cours de vérification par l’équipe EuroKink.</p>' : ''}
    ${ev.status === 'rejected' ? `<p class="tiny">Refusée${ev.rejection_reason ? ` : ${esc(ev.rejection_reason)}` : ''}. Corrige-la pour la renvoyer en vérification.</p>` : ''}
    <div class="stat-row">${statLine(ev.stats, past)}</div>
    <div class="org-actions">
      ${live ? `<button class="mini-btn" data-act="org-edit" data-id="${ev.id}">Modifier</button>` : ''}
      <button class="mini-btn" data-act="org-copy" data-id="${ev.id}">Dupliquer</button>
      ${live && ev.status === 'published' ? `<button class="mini-btn" data-act="org-soldout" data-id="${ev.id}" data-on="${ev.is_sold_out ? '' : '1'}">${ev.is_sold_out ? 'Remettre en vente' : 'Complet'}</button>` : ''}
      ${live ? `<button class="mini-btn danger" data-act="org-cancel" data-id="${ev.id}">Annuler</button>` : ''}
      ${ev.status === 'published' && eventById(ev.id) ? `<a class="mini-btn" href="#/soiree/${ev.id}">Voir</a>` : ''}
    </div></article>`;
}

let currentOrgId = null;
function viewOrga(param) {
  if (orgStatus === null) { loadOrgStatus(); return loadingScreen('Espace organisateur', '#/profil'); }
  const orgs = myOrgs();
  if (!orgs.length) return viewBecomeOrganizer();
  const id = orgs.some((o) => o.id === param) ? param : (orgs.some((o) => o.id === currentOrgId) ? currentOrgId : orgs[0].id);
  currentOrgId = id;
  const d = orgDash[id];
  if (!d) { loadOrgDash(id); return loadingScreen('Espace organisateur', '#/profil'); }
  if (d.error) return `<section class="screen">${accountTopRaw('Espace organisateur', '#/profil')}${empty(esc(d.error))}</section>`;
  const o = d.organizer;
  const now = new Date();
  const upcoming = d.events.filter((e) => new Date(e.ends_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = d.events.filter((e) => new Date(e.ends_at) < now);
  const sum = (k) => upcoming.reduce((n, e) => n + Number(e.stats[k] || 0), 0);
  const switcher = orgs.length > 3 ? `<label class="field">Organisation${`<select id="orgSwitch">${orgs.map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`}</label>`
    : orgs.length > 1 ? `<div class="chips wrap">${orgs.map((x) => `<a class="chip ${x.id === id ? 'on' : ''}" href="#/orga/${x.id}">${esc(x.name)}</a>`).join('')}</div>` : '';
  const edit = orgEditing ? `<form id="orgPageForm" class="card settings">
      <div class="field">Logo<div class="logo-edit">${orgLogo(o, 'lg')}<div class="logo-actions">
        <label class="btn btn-ghost file-btn">${I.image}<span>${o.logo ? 'Changer' : 'Choisir une image'}</span><input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp"></label>
        ${o.logo ? '<button type="button" class="link" data-act="logo-clear">Retirer le logo</button>' : ''}</div></div>
        <span class="hint">Carré de préférence, il s’affiche en rond sur la carte, ta page et tes soirées.</span></div>
      <label class="field">Ou lien vers le logo<input name="logo_path" type="url" inputmode="url" value="${o.logo && /^https:/i.test(o.logo) ? esc(o.logo) : ''}" placeholder="https://…"></label>
      <label class="field">Présentation<textarea name="description" rows="5" maxlength="2000" placeholder="Qui vous êtes, l’esprit de vos soirées…">${esc(o.description || '')}</textarea></label>
      <label class="field">Site internet<input name="website" type="url" inputmode="url" value="${esc(o.website || '')}" placeholder="https://"></label>
      <label class="field">Ville<input name="city" maxlength="80" value="${esc(o.city || '')}"></label>
      <p class="form-error" id="formError" role="alert" hidden></p>
      <div class="adm-actions"><button class="btn btn-red" type="submit">Enregistrer</button><button class="btn btn-ghost" type="button" data-act="org-page-cancel">Annuler</button></div>
      <p class="tiny muted">Pour changer le nom de l’organisation, écris-nous.</p></form>` : '';
  return `<section class="screen">${accountTopRaw('Espace organisateur', '#/profil')}
    ${switcher}
    <div class="card org-head"><div class="org-head-top">${orgLogo(o, 'lg')}<div><div class="org-name">${esc(o.name)} ${o.is_verified ? I.verified : ''}</div>
      <div class="muted tiny">${ORG_KIND[o.kind] || ''}${o.city ? ` · ${esc(o.city)}` : ''} · ${o.is_verified ? 'Organisateur vérifié : publication directe' : 'Tes soirées sont vérifiées avant publication'}</div></div></div>
      <div class="org-links"><a class="link" href="#/organisateur/${o.id}">Voir ma page</a>${orgEditing ? '' : '<button class="link" data-act="org-page-edit">Modifier ma page</button>'}</div></div>
    ${edit}
    <div class="stats four">${[[o.followers, 'abonnés'], [upcoming.length, 'à venir'], [sum('views'), 'vues'], [sum('attending'), 'j’y vais']].map(([n, l]) => `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>
    <button class="btn btn-red btn-block" data-act="org-new" data-id="${o.id}">Nouvelle soirée</button>
    <h2 class="group-title">À venir</h2>
    ${upcoming.map((e) => orgEventCard(e, false)).join('') || empty('Aucune soirée à venir. Ajoute ta prochaine soirée !')}
    ${past.length ? `<h2 class="group-title">Passées</h2>${past.map((e) => orgEventCard(e, true)).join('')}` : ''}
    <p class="tiny muted center">Vues : membres différents ayant ouvert la fiche. Les chiffres sont anonymes.</p>
    ${teamBlock(o)}
  </section>`;
}

async function orgAct(act) {
  const d = orgDash[currentOrgId];
  const ev = d && d.events && d.events.find((x) => x.id === act.dataset.id);
  switch (act.dataset.act) {
    case 'org-new': draft = { organizer_id: act.dataset.id, lockOrg: true, returnTo: '#/orga' }; saveDraft(); navigate('#/proposer'); break;
    case 'org-edit': openEditor(act.dataset.id, { returnTo: '#/orga' }); break;
    case 'org-copy': openEditor(act.dataset.id, { copy: true, returnTo: '#/orga' }); break;
    case 'org-page-edit': orgEditing = true; render(); break;
    case 'org-page-cancel': orgEditing = false; render(); break;
    case 'org-soldout': case 'org-cancel': {
      const action = act.dataset.act === 'org-cancel' ? 'cancel' : act.dataset.on ? 'soldout' : 'available';
      if (action === 'cancel' && !confirm(`Annuler « ${ev ? ev.title : 'cette soirée'} » ? Elle sera retirée de l’appli.`)) return;
      act.disabled = true;
      try {
        await sb.rpc('org_event_action', { p_event: act.dataset.id, p_action: action });
        toast(action === 'cancel' ? 'Soirée annulée' : action === 'soldout' ? 'Soirée marquée complète' : 'Soirée remise en vente');
        delete orgDash[currentOrgId]; render(); refreshEvents();
      } catch (err) { toast(err.message); act.disabled = false; }
      break;
    }
    default: break;
  }
}

async function saveOrgPage(form) {
  const f = new FormData(form);
  const patch = { description: String(f.get('description') || '').trim() || null, website: String(f.get('website') || '').trim() || null, city: String(f.get('city') || '').trim() || null };
  const logoLink = String(f.get('logo_path') || '').trim();
  if (logoLink) {
    if (!/^https:\/\/\S+$/i.test(logoLink)) return formError(form, 'Le lien du logo doit commencer par https://');
    patch.logo_path = logoLink;
  }
  if (patch.website && !/^https?:\/\/\S+$/i.test(patch.website)) return formError(form, 'Le site doit commencer par https://');
  try {
    await sb.update('organizers', `id=eq.${currentOrgId}`, patch);
    orgEditing = false; delete orgDash[currentOrgId]; delete orgPublic[currentOrgId];
    toast('Page mise à jour'); render(); refreshEvents();
  } catch (err) { formError(form, err.message); }
}

async function loadOrgPublic(id) {
  try {
    const [o, rows] = await Promise.all([sb.rpc('organizer_public', { p_org: id }), sb.select('organizers', `select=logo_path&id=eq.${id}`).catch(() => [])]);
    orgPublic[id] = o ? { ...o, logo: rows && rows[0] ? rows[0].logo_path : null } : { missing: true };
  } catch (err) { orgPublic[id] = { missing: true }; }
  if (location.hash.startsWith('#/organisateur/')) render();
}

function viewOrganizerPage(id) {
  const o = orgPublic[id];
  if (!o) { loadOrgPublic(id); return loadingScreen('Organisateur', '#/'); }
  if (o.missing) return `<section class="screen">${accountTopRaw('Organisateur', '#/')}${empty('Organisateur introuvable.')}</section>`;
  const list = EVENTS.filter((e) => e.organizer.id === id);
  return `<section class="screen"><div class="sub-top"><button class="icon-btn" data-act="back" aria-label="Retour">${I.back}</button><h1 class="page-title small">Organisateur</h1></div>
    <div class="card org-public">
      ${orgLogo(o, 'xl')}
      <div class="org-name">${esc(o.name)} ${o.is_verified ? I.verified : ''}</div>
      <div class="muted tiny">${ORG_KIND[o.kind] || ''}${o.city ? ` · ${esc(o.city)}` : ''} · ${o.followers} abonné${o.followers > 1 ? 's' : ''}</div>
      <button class="btn ${o.following ? 'btn-ghost' : 'btn-red'}" data-act="follow" data-id="${o.id}" data-on="${o.following ? '' : '1'}">${o.following ? 'Abonné ✓' : 'Suivre'}</button>
      ${o.website ? `<a class="link" href="${esc(o.website)}" target="_blank" rel="noopener">Site officiel</a>` : ''}
    </div>
    ${o.description ? `<p class="about">${esc(o.description)}</p>` : ''}
    ${o.manager ? `<a class="line-btn rounded" href="#/orga/${o.id}">${I.gear}<span>Gérer dans mon espace organisateur</span>${I.chevron}</a>` : ''}
    <h2 class="group-title">Prochaines soirées</h2>
    <div class="list">${list.map(eventRow).join('') || empty('Aucune soirée annoncée pour le moment.')}</div>
  </section>`;
}

async function toggleFollow(act) {
  const id = act.dataset.id, on = !!act.dataset.on;
  const o = orgPublic[id];
  act.disabled = true;
  try {
    if (on) await sb.insert('organizer_follows', { user_id: profile.id, organizer_id: id }, { ignoreDuplicates: true, onConflict: 'user_id,organizer_id' });
    else await sb.remove('organizer_follows', `user_id=eq.${profile.id}&organizer_id=eq.${id}`);
    if (o) { o.following = on; o.followers = Math.max(0, o.followers + (on ? 1 : -1)); }
    toast(on ? 'Tu suis cet organisateur' : 'Tu ne suis plus cet organisateur');
    render();
  } catch (err) { toast(err.message); act.disabled = false; }
}

function adminRequestCard(q) {
  const ex = q.existing;
  return `<article class="card adm-card">
    <div class="sub-head"><strong>${esc(q.name)}</strong><span class="pill-grey">${ORG_KIND[q.kind] || ''}</span></div>
    <div class="muted tiny">demandé par ${esc(q.requester || 'membre supprimé')} · le ${fDate.format(new Date(q.created_at))}</div>
    <div class="adm-facts">
      ${q.city ? `<div>${I.pin}<span>${esc(q.city)}</span></div>` : ''}
      <div>${I.doc}<span>${esc(q.website)}</span><a class="link" href="${esc(q.website)}" target="_blank" rel="noopener">Ouvrir</a></div>
      <div>${I.mail}<span>${esc(q.contact_email)}</span><a class="link" href="mailto:${esc(q.contact_email)}">Écrire</a></div>
      ${ex ? `<div>${I.users}<span>Existe déjà : ${esc(ex.name)}${ex.is_verified ? ' (vérifié)' : ''} · ${ex.managers} gestionnaire${ex.managers > 1 ? 's' : ''}. Accepter ajoute ce membre comme gestionnaire.</span></div>` : ''}
    </div>
    ${q.message ? `<p class="adm-desc">${esc(q.message)}</p>` : ''}
    <div class="adm-actions"><button class="btn btn-red" data-act="adm-req-ok" data-id="${q.id}">Accepter</button><button class="btn btn-ghost" data-act="adm-req-no" data-id="${q.id}">Refuser</button></div>
    <button class="link" data-act="adm-req-trust" data-id="${q.id}">Accepter et vérifier l’organisateur</button>
  </article>`;
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
    svg: (() => { const orgs = new Set(g.events.map((x) => x.organizer.id)); const o = g.events[0].organizer;
      return orgs.size === 1 && o.logo ? `<span class="mm mm-logo"><img src="${esc(imgSrc(o.logo))}" alt="" referrerpolicy="no-referrer"></span>` : null; })(),
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
    openOverlay(() => { sheet.hidden = true; });
  };
  sheet.addEventListener('click', (ev) => { if (ev.target.closest('[data-close-sheet]')) closeOverlay(); });
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
    if (route === 'soiree' && isUuid(param)) sessionStorage.setItem('ek.after', hash);
    if (route === 'invitation' && /^[0-9a-f]{32}$/.test(param || '')) setPendingInvite(param);
    if (mapCleanup) { mapCleanup(); mapCleanup = null; }
    view.innerHTML = sb.getSession() && !userChecked ? viewLoading() : viewWelcome();
    nav.hidden = true;
    return;
  }
  if (pendingInvite() && route !== 'invitation' && route !== 'compte' && route !== 'infos') { location.replace(`#/invitation/${pendingInvite()}`); return; }
  let html;
  let active = '#/';
  const needsEvents = ['', undefined, 'explorer', 'carte', 'soiree', 'favoris', 'organisateur'].includes(route);
  if (route === 'soiree' && param && eventsReady && loggedIn() && !viewed.has(param) && isUuid(param)) {
    viewed.add(param); sb.rpc('log_view', { p_event: param }).catch(() => {});
  }
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
    case 'communaute': html = viewCommunity(param === 'liste' ? 'list' : 'map'); active = '#/communaute'; break;
    case 'membre': html = viewMember(param); active = '#/communaute'; break;
    case 'invitation': html = viewInvitation(param); active = null; break;
    case 'ma-fiche': html = viewEditMember(); active = '#/profil'; break;
    case 'profil': html = viewProfile(); active = '#/profil'; break;
    case 'parametres': html = viewSettings(); active = '#/profil'; break;
    case 'infos': html = viewInfo(param); active = '#/profil'; break;
    case 'proposer': html = viewSubmit(); active = '#/profil'; break;
    case 'mes-propositions': html = viewMySubmissions(); active = '#/profil'; break;
    case 'admin': html = viewAdmin(); active = '#/profil'; break;
    case 'devenir-organisateur': html = viewBecomeOrganizer(); active = '#/profil'; break;
    case 'orga': html = viewOrga(param); active = '#/profil'; break;
    case 'organisateur': html = viewOrganizerPage(decodeURIComponent(param || '')); active = null; break;
    default: html = viewHome();
  }
  if (mapCleanup) { mapCleanup(); mapCleanup = null; }
  view.innerHTML = html;
  nav.hidden = active === null || !loggedIn();
  nav.innerHTML = NAV.map(([href, label, icon]) => `<a href="${href}" class="${href === active ? 'active' : ''}" ${href === active ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`).join('');
  if (route === 'explorer') renderResults();
  if (route === 'carte') initMap();
  if (route === 'soiree' && isUuid(param) && loggedIn()) loadWho(param);
  if (route === 'communaute' && param !== 'liste' && $('#map')) initMembersMap();
}

function navigate(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

// Bloque le zoom par pincement et double toucher (Safari iOS ignore l'interdiction du viewport)
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (ev) => ev.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (ev) => { if (ev.touches.length > 1 && !ev.target.closest('#map, .crop-stage')) ev.preventDefault(); }, { passive: false });
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
  if (overlayClose) { const f = overlayClose; overlayClose = null; f(); }
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
  } else if (form.id === 'orgRequestForm') {
    ev.preventDefault();
    submitOrgRequest(form);
  } else if (form.id === 'sourceForm') {
    ev.preventDefault();
    saveSource(form);
  } else if (form.id === 'orgPageForm') {
    ev.preventDefault();
    saveOrgPage(form);
  } else if (form.id === 'memberForm') {
    ev.preventDefault();
    saveMemberForm(form);
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
  const typeChip = ev.target.closest('#fTypes [data-type]');
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
      if (navDepth > 0) history.back(); else navigate((location.hash || '').startsWith('#/membre') ? '#/communaute' : '#/');
      break;
    case 'share': shareEvent(e); break;
    case 'fav': toggleAction('favorites', id, 'Ajoutée à tes favoris', 'Retirée de tes favoris'); break;
    case 'reminder': toggleAction('reminders', id, `Rappel programmé ${reminderLabel()}`, 'Rappel supprimé'); break;
    case 'alert': toggleAction('alerts', id, 'Alerte activée : tu seras prévenu à l’ouverture des places', 'Alerte désactivée'); break;
    case 'attend': if (toggleAction('attending', id, 'Bonne soirée ! Elle est dans « Mes soirées »', 'Participation retirée') && state.calAsk !== 'never') setTimeout(() => askCalendar(e), 350); break;
    case 'logout': logout(); break;
    case 'delete-account': deleteAccount(); break;
    case 'retry': eventsError = ''; render(); refreshEvents(); break;
    case 'pw': { const input = act.parentElement.querySelector('input'); const show = input.type === 'password'; input.type = show ? 'text' : 'password'; act.textContent = show ? 'Masquer' : 'Afficher'; break; }
    case 'checkin': checkIn(e); break;
    case 'ics': downloadIcs(e); break;
    case 'export': exportData(); break;
    case 'report': reportEvent(e); break;
    case 'adm-withdraw': adminWithdraw(e); break;
    case 'adm-tab': case 'adm-publish': case 'adm-trust': case 'adm-reject': case 'adm-report':
    case 'adm-req-ok': case 'adm-req-no': case 'adm-req-trust': adminAct(act); break;
    case 'org-new': case 'org-edit': case 'org-copy': case 'org-page-edit': case 'org-page-cancel': case 'org-soldout': case 'org-cancel': orgAct(act); break;
    case 'follow': toggleFollow(act); break;
    case 'push-on': case 'push-off': case 'push-test': pushAct(act); break;
    case 'src-form': case 'src-type': case 'src-run': case 'src-toggle': case 'src-del': robotAct(act); break;
    case 'new-signal': if (draft.id || draft.organizer_id) { draft = {}; saveDraft(); } break;
    case 'admin-new': if (draft.id || draft.lockOrg || !draft.organizer_id) { draft = { organizer_id: '__new' }; saveDraft(); } break;
    case 'adm-edit': openEditor(act.dataset.id, { returnTo: '#/admin' }); break;
    case 'ev-edit': openEditor(act.dataset.id, { returnTo: `#/soiree/${act.dataset.id}` }); break;
    case 'img-clear': draft.image_path = ''; saveDraft(); render(); break;
    case 'img-view': openViewer(act.dataset.src); break;
    case 'avatar': avatarMenu(); break;
    case 'logo-clear': setOrgLogo(null).then(() => toast('Logo retiré')).catch((err) => toast(err.message)); break;
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
    case 'city-pick': pickCity(act); break;
    case 'interest': {
      const on = !act.classList.contains('on');
      if (on && act.parentNode.querySelectorAll('.on').length >= 8) { toast('8 centres d’intérêt maximum'); break; }
      act.classList.toggle('on', on); act.setAttribute('aria-pressed', on); break;
    }
    case 'report-member': reportMember(act.dataset.id); break;
    case 'follow-member': toggleMemberFollow(act.dataset.id); break;
    case 'invite-accept': acceptInvite(act); break;
    case 'invite-new': inviteNew(act.dataset.org); break;
    case 'invite-share': inviteShare(act.dataset.org, act.dataset.token); break;
    case 'invite-revoke': inviteRevoke(act); break;
    case 'who-all': whoSheet(act.dataset.id); break;
    case 'members-retry': membersError = ''; members = null; render(); break;
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

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || !ev.target.matches || !ev.target.matches('[data-city-input]')) return;
  ev.preventDefault();
  const first = ev.target.parentNode.querySelector('[data-act=city-pick]');
  if (first) first.click();
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'fBudget') { filters.budget = Number(t.value); $('#budgetLabel').textContent = budgetLabel(); renderResults(); }
  if (t.id === 'fQ') { filters.q = t.value; renderResults(); }
  if (t.id === 'mQ') { memberQ = t.value; const box = $('#memberList'); if (box) box.innerHTML = memberListHtml(); }
  if (t.name === 'bio' && t.form && t.form.id === 'memberForm') { const c = $('#bioCount'); if (c) c.textContent = t.value.length; }
  if (t.matches && t.matches('[data-city-input]')) { cityGeocode(t); return; }
  if (t.form && t.form.id === 'submitForm' && t.name && t.name !== 'secret') {
    draft[t.name] = t.type === 'checkbox' ? t.checked : t.value; saveDraft();
    if (t.id === 'addrInput') geocode(t.value);
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'fCity') { filters.around = t.value; renderResults(); }
  if (t.id === 'fRadius') { filters.radius = Number(t.value); renderResults(); }
  if (t.id === 'fPeriod') { filters.period = t.value; renderResults(); }
  if (t.id === 'fNoBooking') { filters.noBooking = t.checked; renderResults(); }
  if (t.id === 'fCloak') { filters.cloakroom = t.checked; renderResults(); }
  if (t.id === 'imgFile') { handleImageFile(t); return; }
  if (t.id === 'logoFile') { handleLogoFile(t); return; }
  if (t.id === 'orgSwitch') { navigate(`#/orga/${t.value}`); return; }
  if (t.form && t.form.id === 'submitForm' && t.name === 'image_path') { draft.image_path = t.value.trim(); draft.image_x = 50; draft.image_y = 50; saveDraft(); render(); return; }
  if (t.form && t.form.id === 'submitForm' && t.name === 'organizer_id') { draft.organizer_id = t.value; saveDraft(); render(); return; }
  if (t.form && t.form.id === 'submitForm' && t.name) {
    if (t.name === 'secret') { draft.secret = t.checked; ADDR_FIELDS.forEach((k) => delete draft[k]); saveDraft(); render(); return; }
    draft[t.name] = t.type === 'checkbox' ? t.checked : t.value; saveDraft();
    return;
  }
  if (t.form && t.form.id === 'settingsForm') {
    const f = t.form;
    const before = { pseudo: profile && profile.pseudo, city: cityKey(), visibility: state.visibility, invisible: state.invisible };
    setCity(readCity(f));
    state.defaultRadius = Number(f.defaultRadius.value);
    filters.radius = state.defaultRadius;
    state.visibility = f.visibility.value;
    state.invisible = f.invisible.checked;
    state.remindersOn = f.remindersOn.checked;
    state.reminderTiming = f.reminderTiming.value;
    state.ticketAlertsOn = f.ticketAlertsOn.checked;
    state.neutralNotifs = f.neutralNotifs.checked;
    if (f.followsOn) state.followsOn = f.followsOn.checked;
    if (f.calAsk) state.calAsk = f.calAsk.checked ? 'ask' : 'never';
    if (f.adminNotifs) state.adminNotifs = f.adminNotifs.checked;
    if (f.testMode) state.testMode = f.testMode.checked;
    save();
    if (loggedIn()) {
      const patch = {};
      const pseudo = f.pseudo ? f.pseudo.value.trim().slice(0, 30) : profile.pseudo;
      if (pseudo !== before.pseudo) patch.pseudo = pseudo;
      if (cityKey() !== before.city) Object.assign(patch, { city: state.city, postal_code: state.postal || null, latitude: state.cityLat, longitude: state.cityLon });
      if (state.visibility !== before.visibility) patch.attendance_visibility = state.visibility;
      if (state.invisible !== before.invisible) patch.is_invisible = state.invisible;
      const np = { notif_reminders: state.remindersOn, notif_tickets: state.ticketAlertsOn, notif_follows: state.followsOn !== false,
        notif_neutral: state.neutralNotifs, notif_admin: state.adminNotifs !== false };
      Object.entries(np).forEach(([k, v]) => { if (profile[k] !== undefined && profile[k] !== v) patch[k] = v; });
      if (Object.keys(patch).length) {
        sb.update('profiles', `id=eq.${profile.id}`, patch)
          .then((rows) => { if (rows && rows[0]) { profile = rows[0]; state.pseudo = profile.pseudo; save(); } membersAt = 0; toast('Réglages enregistrés'); })
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
  const discreet = state.neutralNotifs;
  const text = discreet ? `Une sortie à voir sur EuroKink · ${dayLabel(e.startsAt)}` : `${e.title} · ${dayLabel(e.startsAt)} · ${e.venue.city}`;
  try {
    if (navigator.share) await navigator.share({ title: discreet ? 'EuroKink' : e.title, text, url });
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

function sheet(html, onClose) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true">${html}</div>`;
  el.addEventListener('click', (ev) => { if (ev.target === el || ev.target.closest('[data-sheet-close]')) closeOverlay(); });
  document.body.appendChild(el);
  openOverlay(() => { if (onClose) onClose(el); el.remove(); });
  return el;
}
function askCalendar(e) {
  if (!e) return;
  const el = sheet(`<h2>Ajouter au calendrier ?</h2>
    <p class="muted">${state.neutralNotifs ? 'Souhaites-tu ajouter cette soirée à ton calendrier personnel ? Elle y apparaîtra sous le titre discret « Sortie ».' : `Souhaites-tu ajouter « ${esc(e.title)} » à ton calendrier personnel ?`}</p>
    <label class="checkline"><input type="checkbox" id="calNever"><span>Ne plus me demander</span></label>
    <div class="adm-actions"><button class="btn btn-red" data-cal-yes>Ajouter</button><button class="btn btn-ghost" data-sheet-close>Non merci</button></div>`,
  (node) => { if (node.querySelector('#calNever').checked) { state.calAsk = 'never'; save(); toast('Tu peux le réactiver dans Paramètres'); } });
  el.querySelector('[data-cal-yes]').addEventListener('click', () => { downloadIcs(e); closeOverlay(); });
}

// Écran de bienvenue (une seule fois par compte et par téléphone)
const ONBOARD = [
  [I.map, 'Toutes les soirées au même endroit', 'Cuir, rubber, sportswear, pup… Explore par ville, date, type et budget, en liste ou sur la carte de France.'],
  [I.bell, 'Ne rate plus rien', 'Mets une soirée en favori, active un rappel ou une alerte billetterie, et suis tes organisateurs préférés pour être prévenu de leurs nouvelles dates.'],
  [I.check, 'Ton passeport fetish', 'Indique « J’y vais », valide ta présence sur place et collectionne les badges. Tu choisis qui voit tes sorties : tout le monde, tes contacts ou personne.']
];
// Proposition d'activer les notifications dès la première connexion (puis au plus 2 rappels, espacés de 3 jours)
async function maybeAskPush() {
  if (!loggedIn() || overlayClose || pendingInvite() || (location.hash || '').startsWith('#/invitation')) return;
  if (pushState === 'unknown') await checkPush();
  if (overlayClose || !['off', 'ios-install'].includes(pushState)) return;
  if (pushState === 'off' && Notification.permission !== 'default') return;
  const key = `ek.pushAsk.${profile.id}`;
  let seen = { n: 0, at: 0 };
  try { seen = JSON.parse(localStorage.getItem(key) || '{"n":0,"at":0}'); } catch (err) { return; }
  if (seen.n >= 3 || Date.now() - seen.at < 3 * 86400000) return;
  try { localStorage.setItem(key, JSON.stringify({ n: seen.n + 1, at: Date.now() })); } catch (err) { return; }
  const what = ['Rappels avant tes soirées', 'Ouverture des billetteries et places libérées', 'Nouvelles dates de tes organisateurs suivis'];
  const el = sheet(`<div class="onb-icon">${I.bell}</div><h2>Active les notifications</h2>
    <p class="muted">${pushState === 'ios-install' ? 'Sur iPhone, elles ne marchent que dans l’appli installée : dans Safari, touche Partager puis « Sur l’écran d’accueil », et ouvre EuroKink depuis son icône.' : 'Pour ne rien rater de tes sorties :'}</p>
    <ul class="soon-list">${what.map((x) => `<li>${I.check}<span>${x}</span></li>`).join('')}</ul>
    <p class="tiny muted">Discrètes par défaut : titre « EuroKink » et texte neutre. Tout se règle dans Paramètres.</p>
    ${pushState === 'off' ? '<button class="btn btn-red btn-block" data-ask-yes>Activer</button>' : ''}
    <button class="${pushState === 'off' ? 'link onb-skip' : 'btn btn-red btn-block'}" data-sheet-close>${pushState === 'off' ? 'Plus tard' : 'Compris'}</button>`);
  el.classList.add('onboard');
  const yes = el.querySelector('[data-ask-yes]');
  if (yes) yes.addEventListener('click', () => { pushAct({ dataset: { act: 'push-on' } }); closeOverlay(); });
}

function maybeOnboard() {
  if (!loggedIn() || overlayClose || pendingInvite() || (location.hash || '').startsWith('#/invitation')) return;
  const key = `ek.onboarded.${profile.id}`;
  try { if (localStorage.getItem(key)) { maybeAskPush(); return; } } catch (err) { return; }
  let i = 0;
  const done = () => { try { localStorage.setItem(key, '1'); } catch (err) { /* stockage indisponible */ } setTimeout(maybeAskPush, 450); };
  const el = sheet('', done);
  el.classList.add('onboard');
  const draw = () => {
    const [icon, title, text] = ONBOARD[i];
    const last = i === ONBOARD.length - 1;
    el.querySelector('.sheet-card').innerHTML = `
      <div class="onb-icon">${icon}</div><h2>${title}</h2><p class="muted">${text}</p>
      <div class="onb-dots">${ONBOARD.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      <button class="btn btn-red btn-block" data-onb-next>${last ? 'C’est parti !' : 'Suivant'}</button>
      ${last ? '' : '<button class="link onb-skip" data-sheet-close>Passer</button>'}`;
  };
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-onb-next]')) { if (i < ONBOARD.length - 1) { i += 1; draw(); } else closeOverlay(); }
  });
  draw();
}

// Cadrage en rond, comme Instagram : on déplace au doigt, on zoome (pincement ou curseur), on valide.
// Renvoie une image carrée (affichée en rond) ; null si annulé.
function cropCircle(file, { size = 512, type = 'image/jpeg', title = 'Cadrer la photo', fill = '#141414' } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible : essaie un JPEG ou un PNG')); };
    img.onload = () => {
      let result = null;
      const el = sheet(`<h2>${title}</h2>
        <div class="crop-stage" id="cropStage"></div>
        <div class="crop-zoom"><span>−</span><input type="range" id="cropZoom" min="0" max="1000" value="0" aria-label="Zoom"><span>+</span></div>
        <p class="tiny muted">Déplace l’image avec le doigt, pince ou utilise le curseur pour zoomer.</p>
        <div class="adm-actions"><button class="btn btn-ghost" data-sheet-close>Annuler</button><button class="btn btn-red" data-crop-ok>Valider</button></div>`,
      () => { URL.revokeObjectURL(url); resolve(result); });
      el.classList.add('cropper');
      const stage = el.querySelector('#cropStage'), zoom = el.querySelector('#cropZoom');
      img.draggable = false; stage.appendChild(img);
      const D = stage.clientWidth, nw = img.naturalWidth, nh = img.naturalHeight;
      const cover = Math.max(D / nw, D / nh);
      const minS = Math.min(cover, D / Math.hypot(nw, nh)); // assez petit pour voir tout le logo dans le rond
      const maxS = cover * 4;
      let sc = cover, tx = (D - nw * sc) / 2, ty = (D - nh * sc) / 2;
      const toSlider = () => { zoom.value = Math.round(((Math.log(sc) - Math.log(minS)) / (Math.log(maxS) - Math.log(minS))) * 1000); };
      const clamp = () => {
        const w = nw * sc, h = nh * sc;
        tx = w >= D ? Math.min(0, Math.max(D - w, tx)) : Math.max(0, Math.min(D - w, tx));
        ty = h >= D ? Math.min(0, Math.max(D - h, ty)) : Math.max(0, Math.min(D - h, ty));
      };
      const draw = () => { clamp(); img.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`; img.style.width = `${nw}px`; img.style.height = `${nh}px`; };
      const zoomAt = (ns, cx, cy) => { ns = Math.max(minS, Math.min(maxS, ns)); tx = cx - ((cx - tx) * ns) / sc; ty = cy - ((cy - ty) * ns) / sc; sc = ns; draw(); };
      zoom.addEventListener('input', () => zoomAt(minS * Math.exp((zoom.value / 1000) * (Math.log(maxS) - Math.log(minS))), D / 2, D / 2));
      const pts = new Map(); let last = null;
      const rel = (ev) => { const r = stage.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
      const pinch = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
      stage.addEventListener('pointerdown', (ev) => { stage.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, rel(ev)); last = pts.size === 2 ? pinch() : rel(ev); });
      stage.addEventListener('pointermove', (ev) => {
        if (!pts.has(ev.pointerId)) return;
        pts.set(ev.pointerId, rel(ev));
        if (pts.size === 2) { const p = pinch(); if (last && last.d) { zoomAt(sc * (p.d / last.d), p.x, p.y); tx += p.x - last.x; ty += p.y - last.y; draw(); toSlider(); } last = p; }
        else { const p = rel(ev); tx += p.x - last.x; ty += p.y - last.y; last = p; draw(); }
      });
      const up = (ev) => { pts.delete(ev.pointerId); last = pts.size ? [...pts.values()][0] : null; };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      stage.addEventListener('wheel', (ev) => { ev.preventDefault(); const p = rel(ev); zoomAt(sc * (ev.deltaY < 0 ? 1.1 : 0.9), p.x, p.y); toSlider(); }, { passive: false });
      el.querySelector('[data-crop-ok]').addEventListener('click', () => {
        const c = document.createElement('canvas'); c.width = size; c.height = size;
        const ctx = c.getContext('2d'); const k = size / D;
        if (type === 'image/jpeg') { ctx.fillStyle = fill; ctx.fillRect(0, 0, size, size); }
        ctx.drawImage(img, tx * k, ty * k, nw * sc * k, nh * sc * k);
        c.toBlob((b) => { result = b; closeOverlay(); }, type, 0.88);
      });
      draw(); toSlider();
    };
    img.src = url;
  });
}
async function setAvatar(path) {
  const old = profile.avatar_path;
  const rows = await sb.update('profiles', `id=eq.${profile.id}`, { avatar_path: path });
  if (rows && rows[0]) profile = rows[0]; else profile.avatar_path = path;
  if (old && old !== path) sb.deleteObject('avatars', old).catch(() => {});
  membersAt = 0;
  render();
}
function avatarMenu() {
  const el = sheet(`<h2>Photo de profil</h2>
    <p class="muted tiny">Une photo qui respecte la charte : pas de nudité, et pas le visage de quelqu’un d’autre sans son accord.</p>
    <label class="btn btn-red btn-block file-btn">${I.image}<span>Choisir une photo</span><input type="file" id="avatarFile" accept="image/jpeg,image/png,image/webp,image/heic"></label>
    ${profile.avatar_path ? '<button class="btn btn-ghost btn-block" data-avatar-del>Retirer ma photo</button>' : ''}
    <button class="link onb-skip" data-sheet-close>Annuler</button>`);
  el.querySelector('#avatarFile').addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    closeOverlay();
    try {
      await new Promise((r) => setTimeout(r, 250));
      const blob = await cropCircle(file, { size: 480, type: 'image/jpeg', title: 'Cadrer ta photo' });
      if (!blob) return;
      toast('Envoi de la photo…');
      const path = `${profile.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await sb.uploadImage('avatars', path, blob);
      await setAvatar(path);
      toast('Photo de profil mise à jour');
    } catch (err) { toast(err.message); }
  });
  const del = el.querySelector('[data-avatar-del]');
  if (del) del.addEventListener('click', async () => { closeOverlay(); try { await setAvatar(null); toast('Photo retirée'); } catch (err) { toast(err.message); } });
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
const EVENT_SELECT = ['id', 'image_path', 'image_x', 'image_y', 'title', 'description', 'starts_at', 'ends_at', 'dress_code', 'dress_code_details', 'price', 'presale_price',
  'booking', 'ticket_url', 'sales_open_at', 'sales_close_at', 'is_sold_out', 'has_cloakroom', 'cloakroom_paid', 'frequency', 'languages',
  'organizer:organizers(id,name,kind,is_verified,logo_path)', 'venue:venues(name,city,country,latitude,longitude)',
  'types:event_event_types(type:event_types(slug))'].join(',');

function mapEvent(r, counts) {
  return {
    id: r.id, title: r.title, description: r.description || '', image: r.image_path || null, imageX: r.image_x ?? 50, imageY: r.image_y ?? 50,
    startsAt: r.starts_at, endsAt: r.ends_at,
    organizer: { id: r.organizer.id, name: r.organizer.name, kind: ORG_KIND[r.organizer.kind] || 'Organisateur', verified: r.organizer.is_verified, logo: r.organizer.logo_path || null },
    venue: { name: r.venue.name, city: r.venue.city, lat: r.venue.latitude, lon: r.venue.longitude },
    country: r.venue.country,
    types: (r.types || []).map((t) => t.type && t.type.slug).filter(Boolean),
    dressCode: r.dress_code, dressCodeDetails: r.dress_code_details,
    price: Number(r.price), presalePrice: r.presale_price == null ? null : Number(r.presale_price),
    booking: r.booking, ticketUrl: r.ticket_url, salesOpenAt: r.sales_open_at, salesCloseAt: r.sales_close_at, soldOut: r.is_sold_out,
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
  if (!loggedIn()) return on;
  pushToggle(list, id, on).then(() => {
    if (list === 'attending') { outingsCache.delete(profile.id); if (location.hash === `#/soiree/${id}`) loadWho(id); }
  }).catch((err) => {
    toggleIn(list, id);
    if (list === 'attending' && e) e.attendees = Math.max(0, e.attendees + (on ? -1 : 1));
    render();
    toast(`Non enregistré : ${err.message}`);
  });
  return on;
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
      postal_code: md.postal_code || null, latitude: md.latitude ?? state.cityLat ?? null, longitude: md.longitude ?? state.cityLon ?? null,
      adult_confirmed_at: md.adult_confirmed_at || new Date().toISOString(),
      sensitive_consent_at: md.sensitive_consent_at || new Date().toISOString()
    }, { returnRow: true });
  }
  profile = rows[0];
  state.adult = true;
  state.pseudo = profile.pseudo;
  if (profile.city) setCity({ name: profile.city, postal: profile.postal_code, lat: profile.latitude, lon: profile.longitude });
  state.visibility = profile.attendance_visibility;
  state.invisible = profile.is_invisible;
  if (profile.notif_reminders !== undefined) {
    state.remindersOn = profile.notif_reminders; state.ticketAlertsOn = profile.notif_tickets;
    state.followsOn = profile.notif_follows; state.neutralNotifs = profile.notif_neutral; state.adminNotifs = profile.notif_admin;
  }
  checkPush();

  // Ce que l'invité avait mis de côté sur ce téléphone rejoint son compte
  const pending = Object.keys(TABLE_OF).flatMap((list) => state[list].map((id) => [list, id]));
  await Promise.all(pending.map(([list, id]) => (eventById(id) ? pushToggle(list, id, true).catch(() => {}) : null)));

  const ids = (table) => sb.select(table, `user_id=eq.${uid}&select=event_id`).then((r) => r.map((x) => x.event_id));
  [state.favorites, state.reminders, state.alerts, state.attending] = await Promise.all(
    [ids('favorites'), ids('reminders'), ids('ticket_alerts'), ids('attendances')]);
  await loadPassport();
  following = new Set(await sb.select('member_follows', `follower_id=eq.${uid}&select=followed_id`).then((r) => r.map((x) => x.followed_id)).catch(() => []));
  save();
  if (profile.role === 'admin') loadAdmin();
  loadOrgStatus();
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
  mySubs = null; adminData = null; draft = {}; saveDraft(); orgStatus = null; currentOrgId = null;
  Object.keys(orgDash).forEach((k) => delete orgDash[k]); Object.keys(orgPublic).forEach((k) => delete orgPublic[k]);
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

// Après connexion : retour sur la soirée partagée qu'on voulait voir, puis bienvenue si première fois
function afterLogin() {
  const h = pendingInvite() ? `#/invitation/${pendingInvite()}` : sessionStorage.getItem('ek.after');
  sessionStorage.removeItem('ek.after');
  setTimeout(maybeOnboard, 400);
  return h || '#/';
}

// Mot de passe déjà paru dans une fuite de données ? (Have I Been Pwned, k-anonymat :
// seuls les 5 premiers caractères de l'empreinte SHA-1 quittent l'appareil). null si le service ne répond pas.
async function pwnedCount(password) {
  try {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const line = (await r.text()).split('\n').find((l) => l.startsWith(hex.slice(5) + ':'));
    return line ? Number(line.split(':')[1]) || 0 : 0;
  } catch (e) { return null; }
}
async function checkPassword(password) {
  if (password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
  const n = await pwnedCount(password);
  if (n > 0) throw new Error(`Ce mot de passe figure dans des fuites de données connues (vu ${n.toLocaleString('fr-FR')} fois) : il pourrait être deviné facilement. Choisis-en un autre.`);
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
      if (!cityPicked(form)) throw new Error('Choisis ta ville dans la liste proposée.');
      const city = readCity(form);
      if (!f.get('adult') || !f.get('sensitive') || (form.id === 'signupForm' && !f.get('terms'))) throw new Error('Coche les cases de confirmation pour continuer.');
      if (!(await sb.rpc('pseudo_available', { p_pseudo: pseudo }))) throw new Error('Ce pseudo est déjà pris, choisis-en un autre.');
      const now = new Date().toISOString();
      const meta = { pseudo, city: city.name, postal_code: city.postal || null, latitude: city.lat, longitude: city.lon, adult_confirmed_at: now, sensitive_consent_at: now, terms_accepted_at: now };
      if (form.id === 'completeForm') {
        const rows = await sb.insert('profiles', { id: sb.currentUser().id, pseudo, city: meta.city, postal_code: meta.postal_code, latitude: meta.latitude, longitude: meta.longitude, adult_confirmed_at: now, sensitive_consent_at: now }, { returnRow: true });
        profile = rows[0];
        await loadUser();
        await refreshEvents();
        navigate(afterLogin());
        return;
      }
      const email = String(f.get('email') || '').trim();
      const password = String(f.get('password') || '');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Adresse e-mail invalide.');
      await checkPassword(password);
      setCity(city); state.adult = true; save();
      const res = await sb.signUp(email, password, meta);
      lastSignupEmail = email;
      if (res.confirmed) { await loadUser(); await refreshEvents(); toast(`Bienvenue ${pseudo} !`); navigate(afterLogin()); } else navigate('#/compte/verifier');
    } else if (form.id === 'loginForm') {
      await sb.signIn(String(f.get('email') || '').trim(), String(f.get('password') || ''));
      const status = await loadUser();
      if (status === 'incomplete') { navigate('#/compte/profil'); return; }
      await refreshEvents();
      toast(`Content de te revoir, ${profile.pseudo} !`);
      navigate(afterLogin());
    } else if (form.id === 'forgotForm') {
      await sb.sendPasswordReset(String(f.get('email') || '').trim());
      form.innerHTML = '<p>Si un compte existe avec cette adresse, tu vas recevoir un lien pour choisir un nouveau mot de passe. Pense à regarder dans les indésirables.</p>';
    } else if (form.id === 'newPasswordForm') {
      const password = String(f.get('password') || '');
      await checkPassword(password);
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
    if (loggedIn() && !location.hash.startsWith('#/compte')) setTimeout(maybeOnboard, 600);
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
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
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
  navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.ekNavigate) navigate(ev.data.ekNavigate); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
