// EuroKink — carte de l’Europe simplifiée, dessinée localement (aucun service de cartes tiers).
// Les pays ouverts dans l’appli sont pleins, les autres en pointillés. Coordonnées [longitude, latitude].
import { SHAPES } from './europe.js';
import { CITIES } from './data.js';

let enabled = new Set(['FR', 'BE', 'CH', 'DE']);
export function setEnabledCountries(codes) { if (codes && codes.length) enabled = new Set(codes); }

const LAT0 = 46.5;
const K = 100;
const COS = Math.cos((LAT0 * Math.PI) / 180);
export const project = (lon, lat) => [lon * COS * K, -(lat - LAT0) * K];
const path = (pts) => `M${pts.map(([lon, lat]) => project(lon, lat).map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;
const box = (x0, y0, x1, y1) => { const [ax, ay] = project(x0, y1); const [bx, by] = project(x1, y0); return { minX: ax, minY: ay, maxX: bx, maxY: by }; };
const REGION = box(-5.2, 41.3, 15.1, 55.1);      // vue de départ : France et voisins
const EUROPE = box(-25, 34, 45, 71.5);            // dézoom maximal : toute l’Europe

let view = null;   // { s, tx, ty } conservé entre deux affichages de la carte

// Monte la carte dans `root`. markers = [{ id, lon, lat, count, label }], home = { lon, lat }.
// onSelect reçoit la liste des villes du repère touché.
export function mountMap(root, { markers, home, onSelect, markerSvg, unit = 'soirées' }) {
  root.innerHTML = `<svg class="map-svg" aria-hidden="true"><g class="map-world">
      ${SHAPES.map((c) => `<path class="land${enabled.has(c.c) ? '' : ' land-near'}" d="${c.r.map(path).join('')}"/>`).join('')}
    </g></svg><div class="map-layer"></div>
    <div class="map-ctrl"><button class="icon-btn" data-zoom="1" aria-label="Zoomer">+</button><button class="icon-btn" data-zoom="-1" aria-label="Dézoomer">−</button><button class="icon-btn" data-zoom="0" aria-label="Recentrer">⤢</button></div>`;
  const svg = root.querySelector('.map-svg');
  const world = root.querySelector('.map-world');
  const layer = root.querySelector('.map-layer');

  const size = () => root.getBoundingClientRect();
  const fit = () => {
    const { width, height } = size();
    const pad = 24;
    const s = Math.min((width - pad * 2) / (REGION.maxX - REGION.minX), (height - pad * 2) / (REGION.maxY - REGION.minY));
    // Membre hors de la région de départ : même échelle, centrée sur sa ville
    const [hx, hy] = home ? project(home.lon, home.lat) : [0, 0];
    const inside = !home || (hx >= REGION.minX && hx <= REGION.maxX && hy >= REGION.minY && hy <= REGION.maxY);
    const cx = inside ? (REGION.minX + REGION.maxX) / 2 : hx; const cy = inside ? (REGION.minY + REGION.maxY) / 2 : hy;
    return { s, tx: width / 2 - cx * s, ty: height / 2 - cy * s };
  };
  const base = fit();
  if (!view) view = { ...base };
  const { width: W0, height: H0 } = size();
  const minS = Math.min(base.s * 0.8, Math.min(W0 / (EUROPE.maxX - EUROPE.minX), H0 / (EUROPE.maxY - EUROPE.minY)));
  const maxS = base.s * 14;

  // Éléments superposés (taille constante quel que soit le zoom)
  const labelEls = CITIES.map(({ name, lon, lat }) => {
    const el = document.createElement('span');
    el.className = 'map-label'; el.textContent = name; el._p = project(lon, lat);
    layer.appendChild(el); return el;
  });
  let homeEl = null;
  if (home) {
    homeEl = document.createElement('span');
    homeEl.className = 'map-home'; homeEl.title = 'Ta ville'; homeEl._p = project(home.lon, home.lat);
    layer.appendChild(homeEl);
  }
  // Repères regroupés quand ils se chevauchent à l'écran
  const pts0 = markers.map((m) => ({ ...m, p: project(m.lon, m.lat) }));
  let markerEls = [];
  let clusterScale = 0;
  function buildClusters() {
    const radius = 40 / view.s;   // 40 px à l'écran
    const clusters = [];
    pts0.forEach((m) => {
      const c = clusters.find((k) => Math.hypot(k.p[0] - m.p[0], k.p[1] - m.p[1]) < radius);
      if (c) {
        c.items.push(m);
        c.p = [c.items.reduce((a, i) => a + i.p[0], 0) / c.items.length, c.items.reduce((a, i) => a + i.p[1], 0) / c.items.length];
      } else clusters.push({ items: [m], p: [...m.p] });
    });
    markerEls.forEach((el) => el.remove());
    markerEls = clusters.map((c) => {
      const count = c.items.reduce((a, i) => a + i.count, 0);
      const names = c.items.map((i) => i.id);
      const el = document.createElement('button');
      el.className = `map-marker${c.items.length > 1 ? ' cluster' : ''}`;
      el.setAttribute('aria-label', c.items.length > 1 ? `${c.items.map((i) => i.name || i.id).join(', ')} : ${count} ${unit}` : c.items[0].label);
      el.innerHTML = `${c.items.length === 1 && c.items[0].svg ? c.items[0].svg : markerSvg}${count > 1 ? `<span class="map-count">${count}</span>` : ''}`;
      el._p = c.p;
      el.addEventListener('click', (ev) => {
        if (moved) { ev.preventDefault(); return; }
        if (c.items.length > 1 && view.s < maxS * 0.95) {
          const { width, height } = size();
          const target = Math.min(maxS, view.s * 2.5);
          view = { s: target, tx: width / 2 - c.p[0] * target, ty: height / 2 - c.p[1] * target };
          draw();
        } else onSelect(names);
      });
      layer.appendChild(el);
      return el;
    });
    clusterScale = view.s;
  }

  function draw() {
    world.setAttribute('transform', `matrix(${view.s} 0 0 ${view.s} ${view.tx} ${view.ty})`);
    if (view.s !== clusterScale) buildClusters();
    const showLabels = view.s > base.s * 1.6;
    const place = (el) => { el.style.transform = `translate(${el._p[0] * view.s + view.tx}px, ${el._p[1] * view.s + view.ty}px)`; };
    labelEls.forEach((el) => { el.hidden = !showLabels; if (showLabels) place(el); });
    if (homeEl) place(homeEl);
    markerEls.forEach(place);
  }
  function zoomAt(factor, cx, cy) {
    const s = Math.min(maxS, Math.max(minS, view.s * factor));
    const f = s / view.s;
    view = { s, tx: cx - (cx - view.tx) * f, ty: cy - (cy - view.ty) * f };
    draw();
  }

  // Glisser et pincer (souris et écran tactile)
  const pts = new Map();
  let last = null; let moved = false; let startDist = 0; let startS = 0;
  const center = () => { const a = [...pts.values()]; return [(a[0].x + (a[1] || a[0]).x) / 2, (a[0].y + (a[1] || a[0]).y) / 2]; };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  root.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.map-ctrl')) return;
    const r = size();
    pts.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
    if (pts.size === 1) moved = false;
    last = center();
    if (pts.size === 2) { startDist = dist(); startS = view.s; }
  });
  window.addEventListener('pointermove', onMove);
  function onMove(ev) {
    if (!pts.has(ev.pointerId) || !root.isConnected) return;
    const r = size();
    pts.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
    const c = center();
    if (Math.hypot(c[0] - last[0], c[1] - last[1]) > 4) moved = true;
    if (pts.size === 2 && startDist) {
      const s = Math.min(maxS, Math.max(minS, (startS * dist()) / startDist));
      const f = s / view.s;
      view = { s, tx: c[0] - (last[0] - view.tx) * f, ty: c[1] - (last[1] - view.ty) * f };
    } else {
      view = { ...view, tx: view.tx + c[0] - last[0], ty: view.ty + c[1] - last[1] };
    }
    last = c;
    draw();
  }
  const up = (ev) => {
    pts.delete(ev.pointerId);
    if (pts.size) { last = center(); startDist = 0; }
    setTimeout(() => { if (!pts.size) moved = false; }, 0);
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  root.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = size();
    zoomAt(ev.deltaY < 0 ? 1.2 : 1 / 1.2, ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });
  root.querySelector('.map-ctrl').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-zoom]');
    if (!b) return;
    const { width, height } = size();
    const z = Number(b.dataset.zoom);
    if (z === 0) { view = { ...fit() }; draw(); } else zoomAt(z > 0 ? 1.5 : 1 / 1.5, width / 2, height / 2);
  });
  svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
  draw();

  // Nettoyage quand l'écran change
  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}

export function resetMapView() { view = null; }
