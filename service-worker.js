const CACHE_PREFIX = "kamgar-compass-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.js",
  "/money.js",
  "/styles.css",
  "/service-worker.js",
  "/src/constants.js",
  "/src/freshness.js",
  "/src/validation.js",
  "/src/engine.js",
  "/src/state.js",
  "/src/ui.js",
  "/src/rulePacks.js",
  "/src/charts.js",
  "/src/funderPack.js",
  "/src/welcome.js",
  "/locales/en.json",
  "/locales/hi.json",
  "/locales/mr.json",
  "/data/rules.json",
  "/data/sample.json",
  "/data/sample-rural-offline.json",
  "/data/rules-pack-old.json",
  "/data/rules-pack-new.json",
  "/assets/fonts/noto-sans-devanagari-400-devanagari.woff2",
  "/assets/fonts/noto-sans-devanagari-400-latin.woff2",
  "/assets/fonts/noto-sans-devanagari-500-devanagari.woff2",
  "/assets/fonts/noto-sans-devanagari-500-latin.woff2",
  "/assets/fonts/noto-sans-devanagari-600-devanagari.woff2",
  "/assets/fonts/noto-sans-devanagari-600-latin.woff2",
  "/assets/fonts/noto-sans-devanagari-700-devanagari.woff2",
  "/assets/fonts/noto-sans-devanagari-700-latin.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();
            return caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseCopy))
              .then(() => response);
          }
          return response;
        })
        .catch(() =>
          event.request.mode === "navigate"
            ? caches.match("/index.html")
            : new Response("This resource is not available offline.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
              })
        );
    })
  );
});
