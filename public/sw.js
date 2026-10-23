/* No responses are cached: agency financial data and authenticated pages always stay live. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A live network pass-through provides the fetch handler Chrome needs for the
  // install prompt without caching sensitive agency screens or API responses.
  event.respondWith(fetch(request));
});
