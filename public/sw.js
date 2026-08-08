// @ts-nocheck
const CACHE_NAME = "exif-editor-v1";
const SHELL_ASSETS = ["./index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache map tile or geocoding requests
  if (
    url.hostname.includes("openstreetmap.org") ||
    url.hostname.includes("tile.openstreetmap.org")
  ) {
    return;
  }

  // For navigation and same-origin requests: network-first, fall back to cache
  if (request.mode === "navigate" || url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("./index.html"))),
    );
    return;
  }
});
