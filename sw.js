/* Capodanno - cache offline.
   Prima la rete (così un aggiornamento si vede subito); la cache serve solo senza connessione.
   I dati del gruppo restano anche offline perché l'app ne tiene una copia sul telefono. */
const V = "capodanno-v30";
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./config.js", "./voice.js", "./games.js", "./killer-lib.js", "./chess-engine.js", "./chess.js", "./sezioni.js", "./giochi2.js", "./scopa.js", "./home2.js", "./mail.js", "./duelli.js", "./onorevoli.js", "./poker.js", "./squadre.js", "./mappa3d.js", "./extra.js",
  "./carte/retro.svg", ..."DHSC".split("").flatMap(x => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `./carte/${x}${n}.svg`)),
  ...["K", "Q", "R", "B", "N", "P"].flatMap(p => [`./pezzi/w${p}.svg`, `./pezzi/b${p}.svg`]), "./icon.svg"];

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
    // Stessa origine: si chiede sempre al server se il file è cambiato (aggiornamenti immediati per tutti).
    fetch(e.request, url.origin === location.origin ? { cache: "no-cache" } : undefined)
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

// Notifiche push: il server manda { title, body, url, tag }.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Capodanno", {
    body: d.body || "", tag: d.tag, icon: "icon-192.png", badge: "icon-192.png", data: { url: d.url || self.registration.scope },
  }));
});

// Tocco sulla notifica: se l'app è aperta la porta alla sezione giusta, altrimenti la apre.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  // Aperta una notifica, via anche le altre dalla tendina.
  e.waitUntil(self.registration.getNotifications().then(l => l.forEach(n => n.close())).catch(() => {}));
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.postMessage({ url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
