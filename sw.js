/* Capodanno - cache offline.
   Prima la rete (così un aggiornamento si vede subito); la cache serve solo senza connessione.
   I dati del gruppo restano anche offline perché l'app ne tiene una copia sul telefono. */
const V = "capodanno-v3";
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./config.js", "./games.js", "./icon.svg"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  const cacheable = e.request.method === "GET" &&
    (url.origin === location.origin || url.hostname === "cdn.jsdelivr.net" || url.hostname.endsWith("gstatic.com") || url.hostname === "fonts.googleapis.com");
  if (!cacheable) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
