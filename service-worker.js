// Offline app-shell cache so the app opens at the gym with no signal.
// CACHE is auto-derived from the cached assets by scripts/bump-sw-cache.mjs
// (run server-side by the Sync service worker cache workflow, and optionally
// by the local pre-commit hook) — no need to bump it by hand.
const CACHE = 'bbrotation-dca17a3d';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/stats.js',
  './js/rules.js',
  './js/rotation.js',
  './js/positions.js',
];

self.addEventListener('install', (e) => {
  // Cache each asset individually (not caches.addAll, which aborts the whole
  // install if a single request fails) so one flaky fetch — e.g. patchy gym
  // wifi on first load — doesn't leave the app with no offline cache at all.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((url) => c.add(url).catch((err) => {
        console.warn('service-worker: failed to cache', url, err);
      }))))
      .then(() => self.skipWaiting())
  );
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
