const C = "thermal-v4", FILES = ["./","index.html","app.js","docx.js","manifest.json","icon-192.png","icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))));
self.addEventListener("fetch", e => {
  if (new URL(e.request.url).origin !== location.origin) return; // never cache API calls
  e.respondWith(fetch(e.request).then(res => { const c2 = res.clone(); caches.open(C).then(c => c.put(e.request, c2)); return res; }).catch(() => caches.match(e.request)));
});
