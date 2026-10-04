// One service worker for all of LifeCalc (calculator + /budget).
// Network-first so updates pushed to GitHub Pages show up straight away; the cache is the offline fallback.
const CACHE_NAME = "lifecalc-v46";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon-64.png",
  "./favicon-32.png",
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
  "./budget/js/sync.js",
  "./budget/js/files.js",
  "./theme.js",
  "./nav-swipe.js"
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

// Network-first, but on a weak signal don't wait forever: after a few seconds use the saved copy (if there is one),
// and keep the network answer for next time.
const NETWORK_WAIT_MS = 3500;
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;

  // "no-cache" revalidates with GitHub Pages instead of using its 10-minute browser cache.
  const network = fetch(event.request, { cache: "no-cache" }).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  });
  const cached = () => caches.match(event.request, { ignoreSearch: true });
  const fallback = () => cached().then((hit) => {
    if (hit) return hit;
    const inBudget = new URL(event.request.url).pathname.includes("/budget/");
    return caches.match(inBudget ? "./budget/index.html" : "./index.html");
  });
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS)).then(cached).then((hit) => hit || network);

  event.respondWith(Promise.race([network, slow]).catch(fallback));
  event.waitUntil(network.catch(() => {}));
});
