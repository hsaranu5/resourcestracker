/* eslint-disable no-restricted-globals */

/**
 * App shell cache — the smallest thing that makes the offline copy usable.
 *
 * lib.js has saved a standby copy of the catalogue to localStorage since well
 * before this file existed, but loadOffline() can only run once the app's
 * JavaScript has run, and with no connection the page never loaded at all. So
 * the feature only helped if the tab was already open. Caching the shell fixes
 * exactly that: the app boots with no network, then reads the copy it already
 * had.
 *
 * Deliberately not a full PWA — no install prompt, no push, no precache
 * manifest. The API is never cached: stale hours and stale closures are worse
 * than none, and localStorage is already the honest, timestamped fallback that
 * tells the visitor how old the data is.
 */

const SHELL = 'kc-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/index.html', '/manifest.json'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve the API from cache: an out-of-date closure or set of hours can
  // send someone on a walk to a locked door. Let it fail, and let the app fall
  // back to the standby copy, which says how old it is.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first so a released change is picked up, shell second
  // so the app still boots with no connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache first, and fill the cache as they're fetched.
  event.respondWith(
    caches.match(request).then((hit) => (
      hit || fetch(request).then((response) => {
        if (response.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'font')) {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
        }
        return response;
      })
    ))
  );
});
