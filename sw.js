/* Frago Vanguard Group — minimal service worker
 *
 * Strategy:
 *   - Pre-cache the app shell on install (HTML, CSS, JS, fonts, OG)
 *   - Stale-while-revalidate for everything in scope (instant nav from
 *     cache, fresh copy fetched in background for the next visit).
 *   - Network-first for HTML so deploys propagate quickly.
 *
 * Scope: served from the site root.
 */
const VERSION = "fvg-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles/main.css",
  "/scripts/main.js",
  "/assets/favicon.svg",
  "/assets/og.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // skip third-party (esm.sh, fontshare, etc.)

  // HTML → network-first (fresh deploys), fall back to cache
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/")))
    );
    return;
  }

  // Static assets → stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
