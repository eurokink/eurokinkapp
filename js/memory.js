// EuroKink — mini-jeu « Memory Fetish » : retrouve les paires le plus vite possible, en un minimum de coups.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Illustrations des cartes (viewBox 0 0 64 64). Noir cuir, acier, rouge EuroKink.
const K = '#161616', S = '#9AA3AD', SL = '#D5DBE1', R = '#D0142C', W = '#FFFFFF', G = '#3A3A3A';
const ART = {
  harness: `<path d="M14 8 L32 34 L50 8" fill="none" stroke="${K}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40 H56" stroke="${K}" stroke-width="8" stroke-linecap="round"/><path d="M32 40 V58" stroke="${K}" stroke-width="8" stroke-linecap="round"/><circle cx="32" cy="38" r="8" fill="none" stroke="${S}" stroke-width="4"/><circle cx="19" cy="15" r="1.8" fill="${SL}"/><circle cx="45" cy="15" r="1.8" fill="${SL}"/><circle cx="14" cy="40" r="1.8" fill="${SL}"/><circle cx="50" cy="40" r="1.8" fill="${SL}"/><circle cx="32" cy="53" r="1.8" fill="${SL}"/>`,
  cap: `<path d="M10 32 C8 14 22 8 32 8 C42 8 56 14 54 32 Z" fill="${K}"/><path d="M14 20 C22 13 42 13 50 20" fill="none" stroke="${G}" stroke-width="2"/><rect x="9" y="30" width="46" height="8" rx="2" fill="${G}"/><path d="M12 38 H52 C56 44 52 52 32 52 C12 52 8 44 12 38 Z" fill="${K}"/><path d="M17 43 C24 47 40 47 47 43" fill="none" stroke="${SL}" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M32 19 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1 Z" fill="${S}"/><path d="M11 34 H53" stroke="${S}" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round"/>`,
  pup: `<path d="M10 26 L14 4 L28 16 Z" fill="${K}"/><path d="M54 26 L50 4 L36 16 Z" fill="${K}"/><path d="M15 21 L16 10 L23 17 Z" fill="${R}"/><path d="M49 21 L48 10 L41 17 Z" fill="${R}"/><ellipse cx="32" cy="32" rx="22" ry="20" fill="${K}"/><ellipse cx="32" cy="43" rx="13" ry="12" fill="${G}"/><ellipse cx="22" cy="27" rx="4.5" ry="3.5" fill="${W}"/><ellipse cx="42" cy="27" rx="4.5" ry="3.5" fill="${W}"/><circle cx="22" cy="27" r="1.8" fill="${K}"/><circle cx="42" cy="27" r="1.8" fill="${K}"/><ellipse cx="32" cy="37" rx="5" ry="3.5" fill="${R}"/><path d="M32 41 V46 M25 47 C28 51 36 51 39 47" fill="none" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`,
  gasmask: `<path d="M12 26 C12 10 52 10 52 26 C52 40 44 50 32 50 C20 50 12 40 12 26 Z" fill="${K}"/><circle cx="22" cy="26" r="8" fill="${S}"/><circle cx="42" cy="26" r="8" fill="${S}"/><circle cx="22" cy="26" r="5" fill="#2A3340"/><circle cx="42" cy="26" r="5" fill="#2A3340"/><path d="M19 24 l3 -2 M39 24 l3 -2" stroke="${W}" stroke-width="1.6" stroke-linecap="round"/><rect x="23" y="40" width="18" height="18" rx="5" fill="${G}"/><rect x="23" y="44" width="18" height="3" fill="${R}"/><path d="M27 51 H37 M27 54.5 H37" stroke="${S}" stroke-width="1.6" stroke-linecap="round"/><path d="M12 22 H4 M52 22 H60" stroke="${K}" stroke-width="5" stroke-linecap="round"/>`,
  boot: `<path d="M22 4 H42 V36 C52 37 58 42 58 52 H22 Z" fill="${K}"/><rect x="18" y="52" width="42" height="7" rx="2" fill="${G}"/><rect x="18" y="55" width="10" height="5" fill="${K}"/><path d="M22 10 H42" stroke="${G}" stroke-width="3"/><path d="M36 14 L44 18 M36 20 L44 24 M36 26 L44 30 M38 33 L46 38" stroke="${R}" stroke-width="2.4" stroke-linecap="round"/><path d="M27 10 V44" stroke="${SL}" stroke-width="2.2" stroke-linecap="round" opacity=".45"/><path d="M48 46 C52 46 54 48 55 50" fill="none" stroke="${SL}" stroke-width="2" stroke-linecap="round" opacity=".45"/>`,
  cuffs: `<circle cx="17" cy="38" r="12" fill="none" stroke="${S}" stroke-width="6"/><circle cx="47" cy="38" r="12" fill="none" stroke="${S}" stroke-width="6"/><path d="M9 30 A12 12 0 0 1 22 27" fill="none" stroke="${SL}" stroke-width="2.4" stroke-linecap="round"/><path d="M39 30 A12 12 0 0 1 52 27" fill="none" stroke="${SL}" stroke-width="2.4" stroke-linecap="round"/><rect x="13" y="20" width="8" height="9" rx="2" fill="${K}"/><rect x="43" y="20" width="8" height="9" rx="2" fill="${K}"/><ellipse cx="24" cy="15" rx="5" ry="3.4" fill="none" stroke="${K}" stroke-width="2.6" transform="rotate(-25 24 15)"/><ellipse cx="32" cy="11" rx="5" ry="3.4" fill="none" stroke="${K}" stroke-width="2.6"/><ellipse cx="40" cy="15" rx="5" ry="3.4" fill="none" stroke="${K}" stroke-width="2.6" transform="rotate(25 40 15)"/>`,
  collar: `<path d="M6 18 C6 36 58 36 58 18" fill="none" stroke="${K}" stroke-width="11" stroke-linecap="round"/><path d="M6 15 C6 32 58 32 58 15" fill="none" stroke="${G}" stroke-width="1.6" stroke-linecap="round"/><g fill="${SL}"><path d="M14 23 l2.5 4 -2.5 4 -2.5 -4 Z"/><path d="M22.500 27 l2.500 4 -2.500 4 -2.500 -4 Z"/><path d="M41.500 27 l2.500 4 -2.500 4 -2.500 -4 Z"/><path d="M50 23 l2.500 4 -2.500 4 -2.500 -4 Z"/></g><rect x="28" y="26" width="8" height="9" rx="2" fill="${S}"/><circle cx="32" cy="45" r="9" fill="none" stroke="${S}" stroke-width="4.5"/><path d="M26 41 A9 9 0 0 1 34 36.500" fill="none" stroke="${W}" stroke-width="1.6" stroke-linecap="round"/>`,
  jock: `<path d="M6 12 H58 V22 H6 Z" fill="${R}"/><path d="M6 15 H58 M6 19 H58" stroke="${W}" stroke-width="1.6"/><path d="M20 22 H44 C44 40 38 52 32 54 C26 52 20 40 20 22 Z" fill="${W}" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 24 V52" stroke="${S}" stroke-width="1.6" stroke-dasharray="2 3"/><path d="M27 52 C16 48 10 36 8 22 M37 52 C48 48 54 36 56 22" fill="none" stroke="${K}" stroke-width="5" stroke-linecap="round"/><rect x="27" y="13.500" width="10" height="7" rx="1.500" fill="${K}"/>`,
  flogger: `<rect x="27" y="2" width="10" height="24" rx="5" fill="${K}"/><path d="M27 8 H37 M27 13 H37 M27 18 H37" stroke="${R}" stroke-width="2"/><circle cx="32" cy="3.500" r="3.500" fill="${S}"/><rect x="26" y="24" width="12" height="5" rx="2" fill="${S}"/><g fill="none" stroke="${K}" stroke-width="3.400" stroke-linecap="round"><path d="M28 29 C22 40 10 44 8 58"/><path d="M30 29 C27 42 20 48 20 61"/><path d="M32 29 C32 42 31 50 32 62"/><path d="M34 29 C37 42 44 48 44 61"/><path d="M36 29 C42 40 54 44 56 58"/></g>`,
  padlock: `<path d="M19 30 V20 C19 4 45 4 45 20 V30" fill="none" stroke="${S}" stroke-width="7" stroke-linecap="round"/><path d="M22 20 C22 12 30 10 34 11" fill="none" stroke="${W}" stroke-width="1.800" stroke-linecap="round"/><rect x="10" y="28" width="44" height="32" rx="7" fill="${R}"/><rect x="10" y="28" width="44" height="7" rx="3.500" fill="#E8394E"/><circle cx="32" cy="42" r="5" fill="${K}"/><path d="M32 42 L29 53 H35 Z" fill="${K}"/>`,
  sock: `<path d="M22 3 H42 V34 C42 38 44 40 48 42 C60 47 58 60 46 60 H30 C24 60 22 56 22 50 Z" fill="${W}" stroke="${K}" stroke-width="2.600" stroke-linejoin="round"/><rect x="22" y="9" width="20" height="4.500" fill="${R}"/><rect x="22" y="16.500" width="20" height="4.500" fill="#1F4FD8"/><rect x="22" y="24" width="20" height="4.500" fill="${R}"/><path d="M46 60 C54 60 57 54 55 49" fill="none" stroke="${S}" stroke-width="2.400" stroke-linecap="round"/><path d="M23 44 C28 46 28 54 24 57" fill="none" stroke="${S}" stroke-width="2.400" stroke-linecap="round"/>`,
  paddle: `<rect x="27" y="40" width="10" height="22" rx="4" fill="${G}"/><path d="M27 46 H37 M27 51 H37 M27 56 H37" stroke="${S}" stroke-width="1.600"/><rect x="14" y="2" width="36" height="42" rx="13" fill="${K}"/><rect x="18" y="6" width="28" height="34" rx="10" fill="none" stroke="${G}" stroke-width="1.600" stroke-dasharray="2 3"/><path d="M32 33 C22 26 21 16 27 15 C30 14.500 32 17 32 19 C32 17 34 14.500 37 15 C43 16 42 26 32 33 Z" fill="${R}"/>`,
  glove: `<path d="M18 62 V40 C12 34 8 28 11 25 C14 23 17 27 20 30 V10 C20 5 27 5 27 10 V6 C27 1 34 1 34 6 V8 C34 3 41 3 41 8 V13 C41 9 47 9 47 13 V40 C47 46 45 50 43 54 V62 Z" fill="${K}"/><rect x="17" y="54" width="27" height="8" rx="2" fill="${R}"/><path d="M24 12 V28 M31 9 V28 M38 11 V28" stroke="${G}" stroke-width="1.600" stroke-linecap="round"/><path d="M43.500 16 V36" stroke="${SL}" stroke-width="2.200" stroke-linecap="round" opacity=".6"/><path d="M14 27 l3 4" stroke="${SL}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
  bone: `<g transform="rotate(-35 32 32)"><rect x="14" y="26" width="36" height="12" fill="${R}"/><circle cx="13" cy="24" r="9" fill="${R}"/><circle cx="13" cy="40" r="9" fill="${R}"/><circle cx="51" cy="24" r="9" fill="${R}"/><circle cx="51" cy="40" r="9" fill="${R}"/><path d="M10 19 A7 7 0 0 1 17 18 M20 29 H40" fill="none" stroke="${W}" stroke-width="2.400" stroke-linecap="round" opacity=".75"/></g>`
};
const SYMBOLS = Object.keys(ART);
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
    grid.innerHTML = cards.map((s, i) => `<button class="mem-card" data-i="${i}" aria-label="Carte"><span class="mem-in"><span class="mem-back" aria-hidden="true">K</span><span class="mem-face" data-no-i18n aria-hidden="true"><svg viewBox="0 0 64 64">${ART[s]}</svg></span></span></button>`).join('');
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
