// EuroKink — mini-jeu « Memory Fetish » : retrouve les paires le plus vite possible, en un minimum de coups.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SYMBOLS = ['🥾', '🧢', '🧤', '🧦', '👟', '🦴', '🐶', '⛓️', '🏍️', '🔒', '🔑', '🐻', '🩳', '🎭', '🕶️', '🔥'];
const PAIRS = 8;
const BEST_KEY = 'ek.memory.best';
const localBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } };
const saveLocalBest = (n) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* rien */ } };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Points : 1000 au départ, −6 par seconde, −12 par coup au-delà des 8 indispensables
export const memoryScore = (seconds, moves) => Math.max(10, Math.round(1000 - 6 * seconds - 12 * Math.max(0, moves - PAIRS)));

// Monte le jeu dans `root`. loadBoard() et submit(score) renvoient { best, week_best, rank, players, days_left, champion, top }.
export function mountMemory(root, { loadBoard, submit }) {
  root.classList.add('memory-root');
  root.innerHTML = `<div class="mem-hud" hidden><span><span class="lbl">Temps</span><b class="mem-time" data-no-i18n>0:00</b></span><span><span class="lbl">Coups</span><b class="mem-moves" data-no-i18n>0</b></span></div>
    <div class="mem-grid" hidden></div>
    <div class="game-over"></div>`;
  const hud = root.querySelector('.mem-hud'), grid = root.querySelector('.mem-grid'), over = root.querySelector('.game-over');
  const timeEl = root.querySelector('.mem-time'), movesEl = root.querySelector('.mem-moves');
  let alive = true, cards = [], open = [], lock = false, found = 0, moves = 0, t0 = 0, timer = 0, board = null, playing = false;

  const elapsed = () => (t0 ? (Date.now() - t0) / 1000 : 0);
  function boardHtml(b) {
    if (!b) return '';
    const champ = b.champion ? `<p class="game-champ"><span aria-hidden="true">🏆</span> <span>Champion en titre :</span> <b data-no-i18n>${esc(b.champion.pseudo)}</b></p>` : '';
    const left = b.days_left ? `<p class="muted tiny">Défi de la semaine : le meilleur score gagne le badge 🏆 lundi. <span>Jours restants :</span> <span data-no-i18n>${b.days_left}</span></p>` : '';
    if (!b.top || !b.top.length) return `${champ}${left}<p class="muted tiny">Aucun score cette semaine : sois le premier du classement !</p>`;
    return `${champ}<h3 class="game-h3">Classement de la semaine</h3><ol class="game-top">${b.top.slice(0, 10).map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="ps" data-no-i18n>${esc(r.pseudo)}</span><span class="sc" data-no-i18n>${r.best}</span></li>`).join('')}</ol>
      ${b.rank && b.rank > 10 ? `<p class="muted tiny">Ta place : <span data-no-i18n>${b.rank}</span> sur <span data-no-i18n>${b.players}</span></p>` : ''}${left}`;
  }
  function showMenu(res) {
    const best = Math.max(localBest(), board ? board.best : 0);
    over.hidden = false;
    over.innerHTML = `<div class="game-card">
      ${!res ? `<h2 class="game-title" data-no-i18n>Memory Fetish</h2><p class="muted">Retourne les cartes deux par deux et retrouve les 8 paires. Plus tu es rapide et moins tu fais de coups, plus tu marques de points !</p>`
    : `<p class="game-end">Bravo !</p><p class="game-big" data-no-i18n>${res.score}</p><p class="muted"><span data-no-i18n>${clock(res.seconds)}</span> · <span data-no-i18n>${res.moves}</span> coups</p><p class="muted">${res.score >= best ? 'Nouveau record personnel !' : `Ton record : <span data-no-i18n>${best}</span>`}</p>`}
      <button class="btn btn-red game-play">${!res ? 'Jouer' : 'Rejouer'}</button>
      <div class="game-board">${boardHtml(board)}</div></div>`;
  }
  function refreshBoard(p) {
    p.then((b) => { if (alive && b) { board = b; if (b.best > localBest()) saveLocalBest(b.best); const el = over.querySelector('.game-board'); if (el && !playing) el.innerHTML = boardHtml(b); } }).catch(() => {});
  }
  function start() {
    const set = shuffle([...SYMBOLS]).slice(0, PAIRS);
    cards = shuffle([...set, ...set]); open = []; lock = false; found = 0; moves = 0; t0 = 0; playing = true;
    grid.innerHTML = cards.map((s, i) => `<button class="mem-card" data-i="${i}" aria-label="Carte"><span class="mem-in"><span class="mem-back" aria-hidden="true">K</span><span class="mem-face" data-no-i18n aria-hidden="true">${s}</span></span></button>`).join('');
    timeEl.textContent = '0:00'; movesEl.textContent = '0';
    hud.hidden = false; grid.hidden = false; over.hidden = true;
    clearInterval(timer); timer = setInterval(() => { if (playing && t0) timeEl.textContent = clock(elapsed()); }, 250);
  }
  function finish() {
    playing = false; clearInterval(timer);
    const seconds = elapsed(); const score = memoryScore(seconds, moves);
    if (navigator.vibrate) { try { navigator.vibrate([30, 50, 30]); } catch (e) { /* rien */ } }
    if (score > localBest()) saveLocalBest(score);
    setTimeout(() => { if (alive) { showMenu({ score, seconds, moves }); refreshBoard(submit(score)); } }, 600);
  }
  function flip(btn) {
    const i = Number(btn.dataset.i);
    if (!playing || lock || open.includes(i) || btn.classList.contains('ok')) return;
    if (!t0) t0 = Date.now();
    btn.classList.add('on'); open.push(i);
    if (open.length < 2) return;
    moves += 1; movesEl.textContent = String(moves);
    const [a, b] = open; const ea = grid.children[a], eb = grid.children[b];
    if (cards[a] === cards[b]) {
      ea.classList.add('ok'); eb.classList.add('ok'); open = []; found += 1;
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* rien */ } }
      if (found === PAIRS) finish();
    } else {
      lock = true;
      setTimeout(() => { ea.classList.remove('on'); eb.classList.remove('on'); open = []; lock = false; }, 750);
    }
  }
  const onGrid = (ev) => { const b = ev.target.closest('.mem-card'); if (b) flip(b); };
  const onOver = (ev) => { if (ev.target.closest('.game-play')) start(); };
  grid.addEventListener('click', onGrid); over.addEventListener('click', onOver);

  showMenu(null); refreshBoard(loadBoard());
  return () => { alive = false; playing = false; clearInterval(timer); };
}
