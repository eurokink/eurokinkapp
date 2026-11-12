// EuroKink — carte simplifiée (France, Belgique, Suisse, Allemagne) (dessinée localement, aucun service de cartes tiers)
// Contours volontairement « grossiers », dans la DA de l'appli. Coordonnées [longitude, latitude].

const FRANCE = [[2.37, 51.05], [1.85, 50.95], [1.6, 50.73], [1.57, 50.4], [1.6, 50.2], [1.38, 50.06], [1.08, 49.93], [0.37, 49.76],
  [0.1, 49.49], [0.23, 49.42], [-0.25, 49.29], [-1.05, 49.39], [-1.26, 49.67], [-1.62, 49.65], [-1.94, 49.72], [-1.8, 49.37],
  [-1.6, 48.84], [-1.51, 48.64], [-2.02, 48.65], [-2.76, 48.53], [-3.05, 48.78], [-3.45, 48.83], [-3.98, 48.72], [-4.55, 48.6],
  [-4.77, 48.33], [-4.55, 48.2], [-4.73, 48.04], [-4.37, 47.8], [-3.92, 47.87], [-3.37, 47.73], [-3.12, 47.48], [-2.75, 47.55],
  [-2.52, 47.29], [-2.2, 47.27], [-2.1, 47.1], [-2.25, 46.95], [-1.94, 46.69], [-1.78, 46.5], [-1.3, 46.3], [-1.15, 46.15],
  [-1.0, 45.95], [-1.03, 45.62], [-1.07, 45.57], [-1.2, 45.0], [-1.25, 44.65], [-1.3, 44.2], [-1.45, 43.65], [-1.78, 43.37],
  [-1.4, 43.25], [-0.75, 42.95], [0.0, 42.7], [0.7, 42.85], [1.45, 42.6], [2.0, 42.4], [2.6, 42.35], [3.17, 42.44],
  [3.04, 42.75], [3.05, 42.9], [3.15, 43.13], [3.47, 43.28], [3.7, 43.4], [4.0, 43.55], [4.5, 43.45], [5.3, 43.3],
  [5.93, 43.1], [6.2, 43.1], [6.65, 43.25], [6.75, 43.42], [7.0, 43.55], [7.27, 43.69], [7.5, 43.78], [7.65, 44.15],
  [6.9, 44.4], [7.0, 44.85], [6.6, 45.1], [7.15, 45.5], [6.8, 45.85], [7.04, 45.92], [6.15, 46.15], [6.1, 46.4],
  [6.45, 46.95], [7.0, 47.35], [7.55, 47.58], [7.8, 48.55], [8.23, 48.97], [7.6, 49.08], [7.0, 49.15], [6.5, 49.45],
  [6.1, 49.47], [5.8, 49.55], [5.4, 49.6], [4.85, 50.15], [4.8, 50.15], [4.2, 49.95], [3.7, 50.3], [3.2, 50.7], [2.6, 50.8]];
const CORSICA = [[9.4, 42.98], [9.55, 42.6], [9.53, 42.1], [9.4, 41.7], [9.2, 41.37], [8.8, 41.6], [8.6, 41.95], [8.65, 42.35],
  [9.0, 42.6], [9.3, 42.7]];
const BELGIUM = [[2.55, 51.08], [3.37, 51.37], [4.25, 51.37], [4.8, 51.5], [5.2, 51.3], [5.8, 51.1], [5.7, 50.75], [6.1, 50.65],
  [6.4, 50.33], [6.1, 50.1], [5.8, 49.55], [5.4, 49.6], [4.85, 50.15], [4.2, 49.95], [3.7, 50.3], [3.2, 50.7], [2.6, 50.8]];
const SWITZERLAND = [[5.96, 46.2], [6.1, 46.14], [6.31, 46.26], [6.8, 46.4], [6.86, 46.12], [7.04, 45.93], [7.86, 45.92], [8.44, 46.24],
  [8.97, 45.96], [9.02, 45.82], [9.29, 46.5], [10.13, 46.23], [10.49, 46.55], [10.45, 46.87], [9.88, 46.98], [9.6, 47.05], [9.53, 47.27],
  [9.67, 47.53], [9.18, 47.66], [8.56, 47.81], [8.4, 47.58], [7.59, 47.59], [7.17, 47.49], [6.94, 47.29], [6.69, 47.07], [6.44, 46.92],
  [6.12, 46.59], [6.06, 46.41]];
const GERMANY = [[6.0, 50.75], [5.9, 51.05], [6.2, 51.4], [5.95, 51.8], [6.75, 51.9], [7.05, 52.25], [6.7, 52.5], [7.05, 52.65], [7.2, 53.25],
  [7.0, 53.35], [7.9, 53.75], [8.6, 53.55], [8.9, 53.9], [8.6, 54.4], [8.6, 54.9], [9.4, 54.83], [9.9, 54.82], [10.6, 54.45], [11.0, 54.0],
  [11.6, 54.15], [12.3, 54.4], [13.0, 54.45], [13.6, 54.6], [14.2, 53.95], [14.4, 53.3], [14.6, 52.6], [14.75, 52.05], [15.0, 51.3],
  [14.85, 50.85], [14.3, 51.05], [13.4, 50.65], [12.5, 50.4], [12.1, 50.3], [12.5, 49.9], [13.0, 49.55], [13.8, 48.8], [13.45, 48.55],
  [12.9, 48.2], [13.0, 47.65], [12.4, 47.7], [11.0, 47.4], [10.45, 47.55], [9.6, 47.55], [8.55, 47.8], [7.6, 47.6], [7.8, 48.55],
  [8.23, 48.97], [7.6, 49.08], [7.0, 49.15], [6.5, 49.45], [6.37, 49.47], [6.5, 49.8], [6.13, 50.13], [6.4, 50.32], [6.1, 50.65]];
const NETHERLANDS = [[3.4, 51.4], [3.6, 51.6], [4.0, 51.95], [4.6, 52.45], [4.75, 52.95], [5.2, 53.3], [6.1, 53.45], [7.2, 53.25], [7.05, 52.65],
  [6.7, 52.5], [7.05, 52.25], [6.75, 51.9], [5.95, 51.8], [6.2, 51.4], [5.9, 51.05], [5.8, 51.1], [5.2, 51.3], [4.8, 51.5], [4.25, 51.37]];
const LUXEMBOURG = [[5.8, 49.55], [5.9, 50.0], [6.0, 50.15], [6.13, 50.13], [6.5, 49.8], [6.37, 49.47], [6.1, 49.47]];
const LABELS = [['Paris', 2.35, 48.86], ['Lyon', 4.84, 45.76], ['Marseille', 5.37, 43.3], ['Bordeaux', -0.58, 44.84],
  ['Toulouse', 1.44, 43.6], ['Nantes', -1.55, 47.22], ['Lille', 3.06, 50.63], ['Strasbourg', 7.75, 48.57],
  ['Rennes', -1.68, 48.12], ['Nice', 7.26, 43.71], ['Bruxelles', 4.35, 50.85], ['Anvers', 4.4, 51.22], ['Liège', 5.58, 50.63], ['Genève', 6.14, 46.2], ['Lausanne', 6.63, 46.52], ['Zurich', 8.54, 47.38], ['Berne', 7.45, 46.95],
  ['Berlin', 13.4, 52.52], ['Hambourg', 9.99, 53.55], ['Munich', 11.58, 48.14], ['Cologne', 6.96, 50.94], ['Francfort', 8.68, 50.11], ['Stuttgart', 9.18, 48.78], ['Leipzig', 12.37, 51.34]];

const LAT0 = 46.5;
const K = 100;
const COS = Math.cos((LAT0 * Math.PI) / 180);
export const project = (lon, lat) => [lon * COS * K, -(lat - LAT0) * K];
const path = (pts) => `M${pts.map(([lon, lat]) => project(lon, lat).map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;
const BOUNDS = (() => {
  const xs = []; const ys = [];
  [...FRANCE, ...CORSICA, ...BELGIUM, ...SWITZERLAND, ...GERMANY].forEach(([lon, lat]) => { const [x, y] = project(lon, lat); xs.push(x); ys.push(y); });
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
})();

let view = null;   // { s, tx, ty } conservé entre deux affichages de la carte

// Monte la carte dans `root`. markers = [{ id, lon, lat, count, label }], home = { lon, lat }.
// onSelect reçoit la liste des villes du repère touché.
export function mountMap(root, { markers, home, onSelect, markerSvg, unit = 'soirées' }) {
  root.innerHTML = `<svg class="map-svg" aria-hidden="true"><g class="map-world">
      <path class="land land-near" d="${path(NETHERLANDS)}"/><path class="land land-near" d="${path(LUXEMBOURG)}"/><path class="land" d="${path(BELGIUM)}"/><path class="land" d="${path(GERMANY)}"/><path class="land" d="${path(FRANCE)}"/><path class="land" d="${path(CORSICA)}"/><path class="land" d="${path(SWITZERLAND)}"/>
    </g></svg><div class="map-layer"></div>
    <div class="map-ctrl"><button class="icon-btn" data-zoom="1" aria-label="Zoomer">+</button><button class="icon-btn" data-zoom="-1" aria-label="Dézoomer">−</button><button class="icon-btn" data-zoom="0" aria-label="Recentrer">⤢</button></div>`;
  const svg = root.querySelector('.map-svg');
  const world = root.querySelector('.map-world');
  const layer = root.querySelector('.map-layer');

  const size = () => root.getBoundingClientRect();
  const fit = () => {
    const { width, height } = size();
    const pad = 24;
    const s = Math.min((width - pad * 2) / (BOUNDS.maxX - BOUNDS.minX), (height - pad * 2) / (BOUNDS.maxY - BOUNDS.minY));
    return { s, tx: width / 2 - ((BOUNDS.minX + BOUNDS.maxX) / 2) * s, ty: height / 2 - ((BOUNDS.minY + BOUNDS.maxY) / 2) * s };
  };
  const base = fit();
  if (!view) view = { ...base };
  const minS = base.s * 0.8; const maxS = base.s * 14;

  // Éléments superposés (taille constante quel que soit le zoom)
  const labelEls = LABELS.map(([name, lon, lat]) => {
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
