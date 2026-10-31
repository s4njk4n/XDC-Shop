/* XDC POS – offline support. Keep this file in the SAME folder as the page. */
const CACHE = "xdcpos-v27";
const LIBS = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|cdn\.ethers\.io)\//;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// The page asks us to save itself and its libraries right after it loads.
self.addEventListener("message", e => {
  if (!e.data || e.data.type !== "precache") return;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all((e.data.urls || []).map(async u => {
      try {
        const same = new URL(u).origin === self.location.origin;
        const r = await fetch(new Request(u, { mode: same ? "same-origin" : "no-cors" }));
        if (r.ok || r.type === "opaque") await c.put(u, r);
      } catch (_) { /* offline or blocked – try again next visit */ }
    }));
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;               // never touch RPC / webhook POSTs
  const url = new URL(req.url);

  // The page itself: network first (so updates arrive), cache when offline or slow.
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), key = url.origin + url.pathname + url.search;
      try {
        const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(rej, 5000))]);
        if (r && r.ok) c.put(key, r.clone());
        return r;
      } catch (_) {
        return (await c.match(key)) || fetch(req);
      }
    })());
    return;
  }

  // Script libraries: cache first.
  if (LIBS.test(req.url)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(req.url);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === "opaque") c.put(req.url, r.clone());
      return r;
    })());
  }
});
