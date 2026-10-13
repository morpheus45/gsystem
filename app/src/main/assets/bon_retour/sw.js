// Bump version whenever files change to force PWA update
// (IMPORTANT: ne liste ici que des fichiers qui existent réellement, sinon l'installation du SW échoue.)
const CACHE_NAME = "inventaire-pwa-v19";
const ASSETS = [
  "./",
  "./index.html",
  "./bon_retour_stock_app.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: pre-cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for same-origin assets, network-first for navigation
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // HTML navigation: network-first so updates come through
    if (req.mode === "navigate") {
      event.respondWith(
        fetch(req).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return resp;
        }).catch(() => caches.match("./index.html"))
      );
      return;
    }

    // Other same-origin assets: cache-first
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return resp;
      }))
    );
    return;
  }

  // Cross-origin: just go to network
  event.respondWith(fetch(req));
});
