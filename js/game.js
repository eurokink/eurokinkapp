// EuroKink — mini-jeu « Bouche bée » (dessin animé, réservé aux adultes comme toute l'appli).
// Tout est dessiné localement sur un canvas : aucune image, aucun service externe.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SKINS = [
  { body: '#E8B796', tip: '#D98E86' }, { body: '#C68B5F', tip: '#B56B5C' }, { body: '#8A5A3C', tip: '#7A4438' },
  { body: '#D0142C', tip: '#FF5A6A' }, { body: '#2B2B2B', tip: '#4A4A4A' }, { body: '#7B3FE4', tip: '#A77BFF' }
];
const BEST_KEY = 'ek.game.best';
const localBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } };
const saveLocalBest = (n) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* rien */ } };

// Monte le jeu dans `root`. loadBoard() et submit(score) renvoient { best, rank, players, top: [{ pseudo, best, me }] }.
export function mountGame(root, { loadBoard, submit }) {
  root.innerHTML = `<canvas class="game-canvas" aria-label="Zone de jeu"></canvas>
    <div class="game-score" data-no-i18n hidden>0</div>
    <div class="game-over"></div>`;
  const cv = root.querySelector('canvas');
  const ctx = cv.getContext('2d');
  if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };   // anciens navigateurs
  const scoreEl = root.querySelector('.game-score');
  const over = root.querySelector('.game-over');
  let W = 0, H = 0, dpr = 1, raf = 0, alive = true;
  let playing = false, score = 0, items = [], px = 0, target = 0, last = 0, spawnIn = 0, gulp = 0, missFx = null, board = null;

  function resize() {
    const r = root.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = Math.max(200, r.width); H = Math.max(260, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!playing) { px = target = W / 2; draw(0); }
  }
  // Tailles proportionnelles à l'écran (petits et grands téléphones)
  const unit = () => Math.max(0.8, Math.min(1.25, W / 390));
  const headR = () => 34 * unit();
  const mouthY = () => H - 118 * unit();          // hauteur de la bouche
  const speed = () => (170 + Math.min(score, 120) * 5.2) * (H / 700);   // px/s, accélère avec le score
  const gap = () => Math.max(0.42, 1.25 - score * 0.016);                // s entre deux objets

  function spawn() {
    const m = 30 * unit();
    const prev = items[items.length - 1];
    let x = m + Math.random() * (W - 2 * m);
    // Toujours rattrapable : pas trop loin du précédent quand ça va vite
    if (prev) { const reach = W * Math.min(0.9, 0.45 + gap() * 0.4); x = Math.max(m, Math.min(W - m, prev.x + (Math.random() * 2 - 1) * reach)); }
    items.push({ x, y: -50 * unit(), skin: SKINS[Math.floor(Math.random() * SKINS.length)], wob: Math.random() * 6.28, size: 0.9 + Math.random() * 0.25 });
  }

  function drawItem(it) {
    const u = unit() * it.size;
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(Math.sin(it.wob) * 0.12);
    ctx.fillStyle = it.skin.body;
    ctx.beginPath(); ctx.arc(-9 * u, -34 * u, 10 * u, 0, 6.2832); ctx.arc(9 * u, -34 * u, 10 * u, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-8.5 * u, -36 * u, 17 * u, 30 * u, 7 * u); ctx.fill();
    ctx.fillStyle = it.skin.tip;
    ctx.beginPath(); ctx.ellipse(0, -3 * u, 10.5 * u, 9 * u, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.ellipse(-3.5 * u, -20 * u, 2.2 * u, 9 * u, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawGuy() {
    const u = unit(), r = headR(), my = mouthY(), cy = my + r * 0.62, open = 1 + Math.max(0, gulp) * 0.35;
    // Épaules et harnais
    ctx.fillStyle = '#C99673';
    ctx.beginPath(); ctx.roundRect(px - 46 * u, cy + r * 0.75, 92 * u, 70 * u, 26 * u); ctx.fill();
    ctx.strokeStyle = '#101010'; ctx.lineWidth = 9 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px - 34 * u, cy + r * 0.95); ctx.lineTo(px, cy + r * 1.75); ctx.lineTo(px + 34 * u, cy + r * 0.95); ctx.stroke();
    ctx.fillStyle = '#D0142C'; ctx.beginPath(); ctx.arc(px, cy + r * 1.75, 7 * u, 0, 6.2832); ctx.fill();
    // Tête renversée en arrière
    ctx.fillStyle = '#E3B08C'; ctx.beginPath(); ctx.arc(px, cy, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#C99673';
    ctx.beginPath(); ctx.arc(px - r * 0.98, cy + 2 * u, 7 * u, 0, 6.2832); ctx.arc(px + r * 0.98, cy + 2 * u, 7 * u, 0, 6.2832); ctx.fill();
    // Bouche grande ouverte vers le haut
    ctx.fillStyle = '#3A0A10'; ctx.beginPath(); ctx.ellipse(px, my + 6 * u, 19 * u * open, 13 * u * open, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#FF5A6A'; ctx.beginPath(); ctx.ellipse(px, my + 13 * u, 10 * u, 5 * u, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#F4F4F4'; ctx.beginPath(); ctx.roundRect(px - 11 * u, my - 6 * u * open, 22 * u, 5 * u, 2 * u); ctx.fill();
    // Yeux fermés de plaisir, barbe de trois jours
    ctx.strokeStyle = '#2A1A12'; ctx.lineWidth = 2.6 * u;
    [-1, 1].forEach((s) => { ctx.beginPath(); ctx.arc(px + s * r * 0.45, cy + r * 0.32, 6 * u, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); });
    ctx.fillStyle = 'rgba(60,35,22,.28)'; ctx.beginPath(); ctx.arc(px, cy, r, 0.2 * Math.PI, 0.8 * Math.PI); ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // Sol
    ctx.fillStyle = '#161616'; ctx.fillRect(0, H - 34 * unit(), W, 34 * unit());
    ctx.fillStyle = '#D0142C'; ctx.fillRect(0, H - 34 * unit(), W, 2);
    items.forEach(drawItem);
    drawGuy();
    if (missFx) { ctx.fillStyle = `rgba(208,20,44,${missFx.a})`; ctx.fillRect(0, 0, W, H); }
  }

  function tick(t) {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (!playing) return;
    px += (target - px) * Math.min(1, dt * 22);
    gulp = Math.max(0, gulp - dt * 4);
    spawnIn -= dt; if (spawnIn <= 0) { spawn(); spawnIn = gap(); }
    const v = speed(), my = mouthY(), tol = 26 * unit();
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i]; const before = it.y; it.y += v * dt; it.wob += dt * 5;
      if (before < my + 8 * unit() && it.y >= my - 2 * unit() && Math.abs(it.x - px) <= tol) {
        items.splice(i, 1); score += 1; gulp = 1; scoreEl.textContent = String(score);
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* rien */ } }
      } else if (it.y > my + 30 * unit()) { end(); break; }
    }
    draw();
  }

  function boardHtml(b) {
    if (!b) return '';
    if (!b.top || !b.top.length) return '<p class="muted tiny">Aucun score pour l’instant : sois le premier du classement !</p>';
    return `<h3 class="game-h3">Classement</h3><ol class="game-top">${b.top.slice(0, 10).map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="ps" data-no-i18n>${esc(r.pseudo)}</span><span class="sc" data-no-i18n>${r.best}</span></li>`).join('')}</ol>
      ${b.rank && b.rank > 10 ? `<p class="muted tiny">Ta place : <span data-no-i18n>${b.rank}</span> sur <span data-no-i18n>${b.players}</span></p>` : ''}`;
  }
  function showMenu(endScore) {
    const best = Math.max(localBest(), board ? board.best : 0);
    over.hidden = false; scoreEl.hidden = true;
    over.innerHTML = `<div class="game-card">
      ${endScore == null ? `<h2 class="game-title">Bouche bée</h2><p class="muted">Glisse ton doigt pour déplacer le bonhomme et attrape tout ce qui tombe. Un seul raté et c’est fini !</p>`
    : `<p class="game-end">Raté !</p><p class="game-big" data-no-i18n>${endScore}</p><p class="muted">${endScore > 0 && endScore >= best ? 'Nouveau record personnel !' : `Ton record : <span data-no-i18n>${best}</span>`}</p>`}
      <button class="btn btn-red game-play">${endScore == null ? 'Jouer' : 'Rejouer'}</button>
      <div class="game-board">${boardHtml(board)}</div></div>`;
  }
  function refreshBoard(p) {
    p.then((b) => { if (alive && b) { board = b; if (b.best > localBest()) saveLocalBest(b.best); const el = over.querySelector('.game-board'); if (el && !playing) el.innerHTML = boardHtml(b); } }).catch(() => {});
  }
  function start() {
    score = 0; items = []; spawnIn = 0.5; gulp = 0; missFx = null; px = target = W / 2;
    scoreEl.textContent = '0'; scoreEl.hidden = false; over.hidden = true; playing = true;
  }
  function end() {
    playing = false; missFx = { a: 0.35 };
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 80]); } catch (e) { /* rien */ } }
    draw(); missFx = null;
    const s = score;
    if (s > localBest()) saveLocalBest(s);
    setTimeout(() => { if (alive) { showMenu(s); draw(); if (s > 0) refreshBoard(submit(s)); } }, 450);
  }

  const setTarget = (ev) => { const r = cv.getBoundingClientRect(); const m = 26 * unit(); target = Math.max(m, Math.min(W - m, ev.clientX - r.left)); };
  const onDown = (ev) => { if (playing) { setTarget(ev); ev.preventDefault(); } };
  const onMove = (ev) => { if (playing) { setTarget(ev); ev.preventDefault(); } };
  const onKey = (ev) => { if (!playing) return; if (ev.key === 'ArrowLeft') target = Math.max(26, target - 40); if (ev.key === 'ArrowRight') target = Math.min(W - 26, target + 40); };
  const onClick = (ev) => { if (ev.target.closest('.game-play')) start(); };
  const onHide = () => { if (document.visibilityState !== 'visible' && playing) end(); };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
  over.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey); window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onHide);

  resize(); showMenu(null); refreshBoard(loadBoard());
  raf = requestAnimationFrame(tick);
  return () => {
    alive = false; playing = false; cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onHide);
  };
}
