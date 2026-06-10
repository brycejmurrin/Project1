// Minimal self-unregistering service worker (safe fallback)
// If an old worker was active and interfering, this file attempts to
// unregister itself immediately so visitors recover.
self.addEventListener('install', function (e) {
  // Try to unregister immediately and skip waiting so activate runs.
  e.waitUntil(
    (async function () {
      try {
        await self.registration.unregister();
      } catch (err) {
        // ignore
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      await self.registration.unregister();
    } catch (err) {}
    // Claim clients briefly so pages are controlled and can pick up the
    // fact that the worker unregistered, then release control.
    try { await self.clients.claim(); } catch (e) {}
  })());
});

// Provide a network-first fetch handler that falls back to network if needed.
self.addEventListener('fetch', function (e) {
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('', { status: 200, statusText: 'OK' });
  }));
});
