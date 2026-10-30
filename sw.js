const PRAEFIX = "candor|" + self.registration.scope + "|";
const CACHE = PRAEFIX + "20261030135453";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PRAEFIX) && k !== CACHE) || /^candor-[0-9]+$/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || c.match("./")))));
});
