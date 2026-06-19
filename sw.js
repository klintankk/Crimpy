// sw.js
const CACHE = 'crimpd-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './css/main.css',
  './js/app.js',
  './js/router.js',
  './js/storage.js',
  './js/workouts.js',
  './js/timer.js',
  './js/calendar.js',
  './js/logger.js',
  './js/charts.js',
  './js/utils.js'
];

self.addEventListener('install', e => {
  // Cache assets but skip files that fail (e.g. missing manifest/favicon)
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      await Promise.all(ASSETS.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res || !res.ok) throw new Error('fetch failed: ' + url + ' ' + (res && res.status));
          await cache.put(url, res.clone());
        } catch (err) {
          console.warn('sw: failed to cache', url, err);
        }
      }));
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});

self.addEventListener('activate', e => {
  // Remove old caches not matching current CACHE
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => { if (k !== CACHE) return caches.delete(k); return Promise.resolve(); })
    ))
  );
});
