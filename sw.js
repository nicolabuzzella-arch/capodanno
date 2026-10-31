/* Capodanno - cache offline.
   Prima la rete (così un aggiornamento si vede subito); la cache serve solo senza connessione.
   I dati del gruppo restano anche offline perché l'app ne tiene una copia sul telefono. */
const V = "capodanno-v10";
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./config.js", "./voice.js", "./games.js", "./killer-lib.js", "./icon.svg"];

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
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.postMessage({ url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
