// Offline app-shell cache so the app opens at the gym with no signal.
// CACHE is auto-derived from the cached assets by scripts/bump-sw-cache.mjs
// (run server-side by the Sync service worker cache workflow, and optionally
// by the local pre-commit hook) — no need to bump it by hand.
const CACHE = 'bbrotation-43005f44';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/stats.js',
  './js/rules.js',
  './js/rotation.js',
  './js/positions.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for our own assets; network fallback for everything else.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
