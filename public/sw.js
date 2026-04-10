const CACHE_NAME = 'dualis-system-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-icon-192.svg',
  '/pwa-icon-512.svg',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigation requests (SPA): network-first, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // External requests (APIs, Cloudinary, analytics, etc.): network-only, no cache
  if (url.origin !== self.location.origin) {
    return;
  }

  // Static assets with hash in filename (e.g. index-CFEpHv2y.js): cache-first
  // but ONLY cache successful responses with correct content-type
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful responses from our own origin
        if (response.ok && response.status === 200) {
          const contentType = response.headers.get('content-type') || '';
          // Don't cache HTML responses for non-navigation requests (sign of a 404/redirect)
          if (!contentType.includes('text/html')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
        }
        return response;
      }).catch(() => {
        // If both cache and network fail, return a basic offline response
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
