/*
 * Neon Swarm — self-destructing service worker.
 *
 * The previous caching worker could pin clients to a broken page after a
 * bad deploy. This replacement wipes every cache, unregisters itself, and
 * reloads open pages so all installed clients recover to network-served
 * content. Offline support can return later under a new cache version.
 */
'use strict';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      try {
        const names = await caches.keys();
        await Promise.all(names.map(function (n) { return caches.delete(n); }));
      } catch (e) { /* ignore */ }
      try {
        await self.registration.unregister();
      } catch (e) { /* ignore */ }
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(function (c) {
          try { c.navigate(c.url); } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }
    })()
  );
});
// No fetch handler: all requests go straight to the network.
