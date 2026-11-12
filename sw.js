// EuroKink — service worker : appli disponible hors ligne, mises à jour récupérées en priorité
const CACHE = 'eurokink-v0.9.2';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/styles.css', './js/app.js', './js/data.js', './js/legal.js', './js/map.js', './js/supabase.js',
  './fonts/Inter-Regular.woff', './fonts/Inter-SemiBold.woff', './fonts/Inter-Bold.woff', './fonts/InterDisplay-Black.woff',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.svg'
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('eurokink-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Réseau d'abord (pour recevoir les mises à jour), cache en secours hors ligne
  // Toujours revérifier auprès du serveur (GitHub Pages garde sinon les fichiers 10 min en cache)
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
