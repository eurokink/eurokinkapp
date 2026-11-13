// EuroKink — mini-jeu « Gear Up! » : attrape les pièces du dress code annoncé, évite les autres.
// Tout est dessiné localement sur un canvas : aucune image, aucun service externe.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LANG = (document.documentElement.lang || 'fr').slice(0, 2);
const CODES = [
  { id: 'cuir', name: { fr: 'Cuir', en: 'Leather', de: 'Leder' }, color: '#B5713C', icons: ['cap', 'boot'] },
  { id: 'rubber', name: { fr: 'Rubber', en: 'Rubber', de: 'Rubber' }, color: '#D0142C', icons: ['hood', 'glove'] },
  { id: 'sport', name: { fr: 'Sportswear', en: 'Sportswear', de: 'Sportswear' }, color: '#2E9BFF', icons: ['sock', 'sneaker'] },
  { id: 'puppy', name: { fr: 'Puppy', en: 'Puppy', de: 'Puppy' }, color: '#F5A623', icons: ['bone', 'pup'] }
];
const codeName = (c) => c.name[LANG] || c.name.fr;
const BEST_KEY = 'ek.gearup.best';
const localBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } };
const saveLocalBest = (n) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* rien */ } };

// Pictogrammes dessinés dans un carré de -10..10
const ICONS = {
  cap(c) { c.beginPath(); c.moveTo(-8, 1); c.quadraticCurveTo(-8, -9, 0, -9); c.quadraticCurveTo(8, -9, 8, 1); c.closePath(); c.fill(); c.fillRect(-9, 1, 18, 2.6); c.beginPath(); c.ellipse(1, 6, 9.5, 2.6, 0, 0, 6.2832); c.fill(); },
  boot(c) { c.beginPath(); c.roundRect(-5, -10, 8, 15, 1.5); c.fill(); c.beginPath(); c.roundRect(-5, 2, 15, 6, 2.5); c.fill(); c.fillRect(-5, 8, 15, 1.8); },
  hood(c) { c.beginPath(); c.ellipse(0, -1, 7.5, 9.5, 0, 0, 6.2832); c.fill(); c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.ellipse(-3, -3, 1.9, 1.3, 0, 0, 6.2832); c.ellipse(3, -3, 1.9, 1.3, 0, 0, 6.2832); c.fill(); c.beginPath(); c.ellipse(0, 3.5, 2.6, 1.2, 0, 0, 6.2832); c.fill(); c.restore(); },
  glove(c) { c.beginPath(); c.roundRect(-5, -2, 10, 11, 2.5); c.fill(); [-4.2, -1.4, 1.4, 4.2].forEach((x, i) => { c.beginPath(); c.roundRect(x - 1.1, -9 + (i === 0 || i === 3 ? 1.5 : 0), 2.2, 9, 1.1); c.fill(); }); c.beginPath(); c.roundRect(-8.5, 0, 4.5, 2.6, 1.2); c.fill(); },
  sock(c) { c.beginPath(); c.roundRect(-4, -10, 7.5, 14, 1.5); c.fill(); c.beginPath(); c.roundRect(-4, 1, 13, 7.5, 3.5); c.fill(); c.save(); c.globalCompositeOperation = 'destination-out'; c.fillRect(-4, -7.5, 7.5, 1.5); c.fillRect(-4, -4.5, 7.5, 1.5); c.restore(); },
  sneaker(c) { c.beginPath(); c.moveTo(-9, 4); c.lineTo(-9, -5); c.lineTo(-4, -5); c.quadraticCurveTo(-1, 0, 6, 0); c.quadraticCurveTo(10, 0.5, 10, 4); c.closePath(); c.fill(); c.fillRect(-9.5, 5, 20, 2.4); },
  bone(c) { c.save(); c.rotate(-0.6); c.fillRect(-6, -1.8, 12, 3.6); [[-6.5, -2.4], [-6.5, 2.4], [6.5, -2.4], [6.5, 2.4]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 2.9, 0, 6.2832); c.fill(); }); c.restore(); },
  pup(c) { c.beginPath(); c.moveTo(-8, -3); c.lineTo(-6.5, -10); c.lineTo(-2, -5.5); c.closePath(); c.fill(); c.beginPath(); c.moveTo(8, -3); c.lineTo(6.5, -10); c.lineTo(2, -5.5); c.closePath(); c.fill(); c.beginPath(); c.ellipse(0, 0, 7.5, 7, 0, 0, 6.2832); c.fill(); c.beginPath(); c.ellipse(0, 5, 4.6, 3.8, 0, 0, 6.2832); c.fill(); c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(-3, -1.5, 1.3, 0, 6.2832); c.arc(3, -1.5, 1.3, 0, 6.2832); c.fill(); c.beginPath(); c.ellipse(0, 3.6, 1.7, 1.1, 0, 0, 6.2832); c.fill(); c.restore(); }
};
// Jetons pré-dessinés (pour que les découpes « destination-out » ne trouent pas le décor)
const tokenCache = new Map();
function token(code, icon, px) {
  const key = `${code.id}/${icon}/${px}`;
  if (tokenCache.has(key)) return tokenCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const c = cv.getContext('2d'); if (!c.roundRect) c.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  const ic = document.createElement('canvas'); ic.width = ic.height = px;
  const k = ic.getContext('2d'); if (!k.roundRect) k.roundRect = c.roundRect;
  k.translate(px / 2, px / 2); k.scale(px / 34, px / 34); k.fillStyle = '#fff'; ICONS[icon](k);
  c.fillStyle = '#151515'; c.beginPath(); c.arc(px / 2, px / 2, px / 2 - px * 0.05, 0, 6.2832); c.fill();
  c.lineWidth = px * 0.075; c.strokeStyle = code.color; c.stroke();
  c.globalAlpha = 0.18; c.fillStyle = code.color; c.fill(); c.globalAlpha = 1;
  c.drawImage(ic, 0, 0);
  tokenCache.set(key, cv); return cv;
}

// Monte le jeu dans `root`. loadBoard() et submit(score) renvoient { best, rank, players, top: [{ pseudo, best, me }] }.
export function mountGearUp(root, { loadBoard, submit }) {
  root.innerHTML = `<canvas class="game-canvas" aria-label="Zone de jeu"></canvas>
    <div class="game-hud" hidden><div class="game-code"><span class="lbl">Dress code</span><b data-no-i18n></b></div><div class="game-pts" data-no-i18n>0</div><div class="game-lives" data-no-i18n></div></div>
    <div class="game-flash" data-no-i18n hidden></div>
    <div class="game-over"></div>`;
  const cv = root.querySelector('canvas');
  const ctx = cv.getContext('2d');
  if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  const hud = root.querySelector('.game-hud'), codeEl = hud.querySelector('.game-code b'), codeBox = hud.querySelector('.game-code');
  const ptsEl = hud.querySelector('.game-pts'), livesEl = hud.querySelector('.game-lives');
  const flash = root.querySelector('.game-flash'), over = root.querySelector('.game-over');
  let W = 0, H = 0, dpr = 1, raf = 0, alive = true;
  let playing = false, score = 0, lives = 3, items = [], px = 0, target = 0, last = 0, spawnIn = 0, pause = 0, hit = 0, bad = 0, code = CODES[0], sinceChange = 0, board = null, flashT = 0;

  function resize() {
    const r = root.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = Math.max(200, r.width); H = Math.max(260, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!playing) { px = target = W / 2; draw(); }
  }
  const unit = () => Math.max(0.8, Math.min(1.25, W / 390));
  const tokR = () => 23 * unit();
  const bagY = () => H - 150 * unit();           // hauteur de l'ouverture du sac
  const speed = () => (165 + Math.min(score, 110) * 4.6) * (H / 700);
  const gap = () => Math.max(0.4, 1.05 - score * 0.012);

  function setCode(c, announce) {
    code = c; sinceChange = 0; codeEl.textContent = codeName(c); codeBox.style.setProperty('--code', c.color);
    if (announce) { items = []; pause = 1.1; flash.textContent = codeName(c); flash.style.setProperty('--code', c.color); flash.hidden = false; flashT = 1.1; }
  }
  function hudLives() { livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, 3 - lives)); }
  function spawn() {
    const m = tokR() + 6;
    const good = Math.random() < 0.58;
    const others = CODES.filter((c) => c !== code);
    const c = good ? code : others[Math.floor(Math.random() * others.length)];
    const prev = items[items.length - 1];
    let x = m + Math.random() * (W - 2 * m);
    if (prev) { const reach = W * Math.min(0.9, 0.45 + gap() * 0.4); x = Math.max(m, Math.min(W - m, prev.x + (Math.random() * 2 - 1) * reach)); }
    items.push({ x, y: -tokR(), code: c, icon: c.icons[Math.floor(Math.random() * c.icons.length)], rot: (Math.random() - 0.5) * 0.5 });
  }

  function drawGuy() {
    const u = unit(), by = bagY(), hy = by + 62 * u, r = 26 * u;
    // Bras levés qui tiennent le sac
    ctx.strokeStyle = '#E3B08C'; ctx.lineWidth = 11 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px - 30 * u, hy + 44 * u); ctx.lineTo(px - 36 * u, by + 22 * u); ctx.moveTo(px + 30 * u, hy + 44 * u); ctx.lineTo(px + 36 * u, by + 22 * u); ctx.stroke();
    // Torse et harnais
    ctx.fillStyle = '#C99673'; ctx.beginPath(); ctx.roundRect(px - 38 * u, hy + 22 * u, 76 * u, 70 * u, 22 * u); ctx.fill();
    ctx.strokeStyle = '#101010'; ctx.lineWidth = 8 * u;
    ctx.beginPath(); ctx.moveTo(px - 28 * u, hy + 32 * u); ctx.lineTo(px, hy + 58 * u); ctx.lineTo(px + 28 * u, hy + 32 * u); ctx.stroke();
    ctx.fillStyle = '#D0142C'; ctx.beginPath(); ctx.arc(px, hy + 58 * u, 6 * u, 0, 6.2832); ctx.fill();
    // Tête
    ctx.fillStyle = '#E3B08C'; ctx.beginPath(); ctx.arc(px, hy, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(60,35,22,.28)'; ctx.beginPath(); ctx.arc(px, hy, r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.fill();
    ctx.fillStyle = '#2A1A12'; ctx.beginPath(); ctx.arc(px - 9 * u, hy - 3 * u, 2.6 * u, 0, 6.2832); ctx.arc(px + 9 * u, hy - 3 * u, 2.6 * u, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#2A1A12'; ctx.lineWidth = 2.6 * u; ctx.beginPath();
    if (bad > 0) ctx.arc(px, hy + 14 * u, 7 * u, 1.15 * Math.PI, 1.85 * Math.PI); else ctx.arc(px, hy + 6 * u, 8 * u, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // Sac de sport ouvert
    const bw = 44 * u * (1 + hit * 0.12), bh = 36 * u;
    ctx.fillStyle = bad > 0 ? '#5A0A14' : '#1E1E1E'; ctx.beginPath(); ctx.roundRect(px - bw, by, bw * 2, bh, 9 * u); ctx.fill();
    ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.ellipse(px, by + 3 * u, bw - 4 * u, 7 * u, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#D0142C'; ctx.fillRect(px - bw, by + bh * 0.55, bw * 2, 4 * u);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#161616'; ctx.fillRect(0, H - 34 * unit(), W, 34 * unit());
    ctx.fillStyle = '#D0142C'; ctx.fillRect(0, H - 34 * unit(), W, 2);
    const d = Math.round(tokR() * 2 * dpr);
    items.forEach((it) => { ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot); ctx.drawImage(token(it.code, it.icon, d), -tokR(), -tokR(), tokR() * 2, tokR() * 2); ctx.restore(); });
    drawGuy();
  }

  function lose() {
    lives -= 1; bad = 1; hudLives();
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* rien */ } }
    if (lives <= 0) end();
  }
  function tick(t) {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (!playing) return;
    px += (target - px) * Math.min(1, dt * 22);
    hit = Math.max(0, hit - dt * 5); bad = Math.max(0, bad - dt * 2.5);
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.hidden = true; }
    if (pause > 0) { pause -= dt; draw(); return; }
    spawnIn -= dt; if (spawnIn <= 0) { spawn(); spawnIn = gap(); }
    const v = speed(), by = bagY(), tol = 44 * unit();
    for (let i = items.length - 1; i >= 0 && playing; i -= 1) {
      const it = items[i]; const before = it.y; it.y += v * dt;
      if (before < by + 6 * unit() && it.y >= by - 4 * unit() && Math.abs(it.x - px) <= tol) {
        items.splice(i, 1);
        if (it.code === code) {
          score += 1; hit = 1; sinceChange += 1; ptsEl.textContent = String(score);
          if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* rien */ } }
          if (sinceChange >= 8) { const o = CODES.filter((c) => c !== code); setCode(o[Math.floor(Math.random() * o.length)], true); break; }
        } else lose();
      } else if (it.y > H - 34 * unit() - tokR()) { items.splice(i, 1); if (it.code === code) lose(); }
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
    over.hidden = false; hud.hidden = true; flash.hidden = true;
    over.innerHTML = `<div class="game-card">
      ${endScore == null ? `<h2 class="game-title" data-no-i18n>Gear Up!</h2><p class="muted">Glisse ton doigt pour déplacer le sac. Attrape uniquement les pièces du dress code annoncé, laisse tomber les autres. Tu as 3 vies !</p>`
    : `<p class="game-end">Partie terminée</p><p class="game-big" data-no-i18n>${endScore}</p><p class="muted">${endScore > 0 && endScore >= best ? 'Nouveau record personnel !' : `Ton record : <span data-no-i18n>${best}</span>`}</p>`}
      <button class="btn btn-red game-play">${endScore == null ? 'Jouer' : 'Rejouer'}</button>
      <div class="game-board">${boardHtml(board)}</div></div>`;
  }
  function refreshBoard(p) {
    p.then((b) => { if (alive && b) { board = b; if (b.best > localBest()) saveLocalBest(b.best); const el = over.querySelector('.game-board'); if (el && !playing) el.innerHTML = boardHtml(b); } }).catch(() => {});
  }
  function start() {
    score = 0; lives = 3; items = []; spawnIn = 0.4; hit = 0; bad = 0; px = target = W / 2;
    ptsEl.textContent = '0'; hudLives(); hud.hidden = false; over.hidden = true; playing = true;
    setCode(CODES[Math.floor(Math.random() * CODES.length)], true);
  }
  function end() {
    playing = false; draw();
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 80]); } catch (e) { /* rien */ } }
    const s = score;
    if (s > localBest()) saveLocalBest(s);
    setTimeout(() => { if (alive) { showMenu(s); if (s > 0) refreshBoard(submit(s)); } }, 450);
  }

  const setTarget = (ev) => { const r = cv.getBoundingClientRect(); const m = 30 * unit(); target = Math.max(m, Math.min(W - m, ev.clientX - r.left)); };
  const onPtr = (ev) => { if (playing) { setTarget(ev); ev.preventDefault(); } };
  const onKey = (ev) => { if (!playing) return; if (ev.key === 'ArrowLeft') target = Math.max(30, target - 40); if (ev.key === 'ArrowRight') target = Math.min(W - 30, target + 40); };
  const onClick = (ev) => { if (ev.target.closest('.game-play')) start(); };
  const onHide = () => { if (document.visibilityState !== 'visible' && playing) end(); };
  cv.addEventListener('pointerdown', onPtr); cv.addEventListener('pointermove', onPtr);
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
