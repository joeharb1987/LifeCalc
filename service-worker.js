// One service worker for all of LifeCalc (calculator + /budget).
// Network-first so updates pushed to GitHub Pages show up straight away; the cache is the offline fallback.
const CACHE_NAME = "lifecalc-v31";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./lifecalc-icon.svg",
  "./lifecalc-icon-180.png",
  "./lifecalc-icon-192.png",
  "./lifecalc-icon-512.png",
  "./budget/",
  "./budget/index.html",
  "./budget/styles.css",
  "./budget/js/core.js",
  "./budget/js/icons.js",
  "./budget/js/seed.js",
  "./budget/js/importer.js",
  "./budget/js/app.js",
  "./theme.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;

  event.respondWith(
    // "no-cache" revalidates with GitHub Pages instead of using its 10-minute browser cache.
    fetch(event.request, { cache: "no-cache" }).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() =>
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        const inBudget = new URL(event.request.url).pathname.includes("/budget/");
        return caches.match(inBudget ? "./budget/index.html" : "./index.html");
      })
    )
  );
});
