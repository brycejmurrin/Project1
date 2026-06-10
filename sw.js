/*
 * Neon Swarm — service worker (offline app shell for GitHub Pages subpath hosting).
 *
 * Registration (add to index.html, before </body>):
 *
 *   <script>
 *     if ('serviceWorker' in navigator) {
 *       window.addEventListener('load', function () {
 *         navigator.serviceWorker.register('sw.js');
 *       });
 *     }
 *   </script>
 *
 * NOTE: bump the version string in CACHE_NAME (e.g. neon-swarm-v2) whenever
 * any precached asset changes, so clients drop the old cache on activate.
 *
 * All URLs are relative because the site is served from a subpath
 * (https://brycejmurrin.github.io/Project1/).
 */

'use strict';

const CACHE_NAME = 'neon-swarm-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './js/renderer.js',
  './js/paths.js',
  './js/sprites.js',
  './js/audio.js',
  './js/difficulty.js',
  './js/menu.js',
  './js/leaderboard.js',
  './js/game.js',
  './js/fx.js' // added by a parallel change; may 404 on first deploy — install must not fail
];

// The single cache key used for the app shell, no matter how it is requested
// ('/', './', 'index.html', '?query', ...).
const INDEX_URL = './index.html';

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers && request.headers.get && request.headers.get('accept');
  return typeof accept === 'string' && accept.includes('text/html');
}

// Normalize app-shell requests to one cache key.
function cacheKeyFor(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (
    path.endsWith('/') ||
    path.endsWith('/index.html') ||
    isNavigationRequest(request)
  ) {
    return INDEX_URL;
  }
  return request;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const results = await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url))
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.warn('[sw] precache failed for', PRECACHE_URLS[i], result.reason);
        }
      });
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle same-origin GETs; let everything else pass through untouched.
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(staleWhileRevalidate(request));
});

async function staleWhileRevalidate(request) {
  const key = cacheKeyFor(request);
  let cache = null;
  let cached = null;

  try {
    cache = await caches.open(CACHE_NAME);
    cached = await cache.match(key);
  } catch (e) {
    // Cache unavailable — fall through to the network below.
  }

  const networkPromise = fetchAndCache(request, key, cache);

  if (cached) {
    // Refresh in the background; the promise never rejects.
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  // Both cache and network failed: offline fallback for navigations.
  if (isNavigationRequest(request)) {
    try {
      const shell = await caches.match(INDEX_URL);
      if (shell) return shell;
    } catch (e) {
      // ignore
    }
  }
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Fetch from the network and update the cache on success.
// Resolves with the response, or null on any failure — never rejects.
async function fetchAndCache(request, key, cache) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic' && cache) {
      try {
        await cache.put(key, response.clone());
      } catch (e) {
        // Quota or storage errors must not break the response.
      }
    }
    return response;
  } catch (e) {
    return null;
  }
}
