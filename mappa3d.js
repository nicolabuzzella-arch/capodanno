/* Capodanno - mappa 3D: un globo che si apre sull'Europa e vola fino alla meta, con palazzi in rilievo,
   percorsi luminosi da ogni città di partenza, auto in movimento e, solo con il consenso di ognuno,
   la posizione del gruppo. MapLibre (open source) con le mappe scure di CARTO. Sostituisce la mappa 2D di sezioni.js. */
"use strict";

const ML_VER = "5.24.0";
let mlReady = null, m3 = null, m3raf = 0, m3orbit = 0, m3watch = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  if (mlReady) return mlReady;
  mlReady = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`; js.onload = res; js.onerror = rej; document.head.appendChild(js);
  });
  return mlReady;
}
const LOC_KEY = "capodanno-posizione-";
const sharing = () => storage.get(LOC_KEY + ME) === "on";
const agoTxt = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "adesso" : m < 60 ? `${m} min fa` : `${Math.round(m / 60)} h fa`; };

function stopMap() { cancelAnimationFrame(m3raf); clearInterval(m3orbit); if (m3watch != null) navigator.geolocation?.clearWatch(m3watch); m3watch = null; if (m3) { m3.remove(); m3 = null; } }

EXTRA_VIEWS.mappa = {
  title: "Mappa", sub: "Il viaggio, in tre dimensioni",
  view() {
    stopMap();
    return `<div class="m3-wrap"><div id="m3"></div>
      <div class="m3-hud"><span class="m3-dot"></span><span id="m3-status">Inizializzo il globo…</span></div>
      <div class="m3-ctrl">
        <button data-m3="globo" aria-label="Globo">${ico("globe", 18)}</button>
        <button data-m3="viaggio" aria-label="Percorsi">${ico("car", 18)}</button>
        <button data-m3="meta" aria-label="Meta in 3D">${ico("star", 18)}</button>
      </div></div>
      <section class="card m3-loc">
        <div class="row" style="gap:12px">${ico("pin", 22)}<div class="grow"><div class="t">${sharing() ? "Stai condividendo la tua posizione" : "Condividi la tua posizione"}</div>
          <div class="small muted">${sharing() ? "Il gruppo ti vede sulla mappa finché la tieni aperta. Puoi smettere quando vuoi." : "Solo con il tuo permesso e solo con il gruppo: utile in viaggio e la notte del 31 per ritrovarsi."}</div></div></div>
        <button class="btn ${sharing() ? "" : "pearl"} block" style="margin-top:12px" data-act="m3-share">${sharing() ? "Smetti di condividere" : "Condividi dove sono"}</button>
      </section>
      <div id="m3-legend"></div>`;
  },
  async mount() {
    const status = t => { const el = $("#m3-status"); if (el) el.textContent = t; };
    try { await loadMapLibre(); } catch { status("Mappa non disponibile senza connessione"); return; }
    const el = $("#m3"); if (!el) return;
    const ML = window.maplibregl;
    const map = m3 = new ML.Map({
      container: el, style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [12, 46], zoom: 1.6, pitch: 0, bearing: 0, attributionControl: { compact: true }, maxPitch: 75, antialias: true,
    });
    map.on("style.load", () => {
      try { map.setProjection({ type: "globe" }); } catch { /* versioni senza globo */ }
      try { map.setSky({ "sky-color": "#0b0a2a", "horizon-color": "#2a1f6e", "fog-color": "#07061a", "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.4, 10, 0] }); } catch { /* opzionale */ }
      // Palazzi in rilievo, color perla, quando si scende sulla città.
      try {
        const src = Object.keys(map.getStyle().sources).find(k => map.getStyle().sources[k].type === "vector");
        if (src) map.addLayer({ id: "m3-buildings", type: "fill-extrusion", source: src, "source-layer": "building", minzoom: 13,
          paint: { "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10], 0, "#1b1a44", 40, "#3b2d8f", 120, "#9cc3ff"],
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.82 } });
      } catch { /* senza palazzi */ }
    });
    // Rotazione lenta del globo finché non si tocca.
    let spinning = true;
    const stopSpin = () => { spinning = false; };
    map.on("mousedown", stopSpin); map.on("touchstart", stopSpin); map.on("wheel", stopSpin);
    // Uscendo dalla mappa (la pagina cambia) si ferma tutto, GPS compreso.
    const spin = () => { if (m3 !== map) return; if (!el.isConnected) return stopMap(); if (spinning && map.getZoom() < 3) map.setCenter([map.getCenter().lng + 0.06, map.getCenter().lat]); m3raf = requestAnimationFrame(spin); };
    await new Promise(r => map.once("load", r));
    if (m3 !== map) return;
    m3raf = requestAnimationFrame(spin);
    status("Carico partenze e percorsi…");

    const pin = (cls, html) => { const d = document.createElement("div"); d.className = `m3k ${cls}`; d.innerHTML = html; return d; };
    const t = trip(), deps = departures(), rows = [], routes = [], bounds = new ML.LngLatBounds();
    const depGeo = [];
    for (const d of deps) {
      const g = await geocode(d.city); if (!g || m3 !== map) continue;
      depGeo.push({ ...d, g }); bounds.extend([g.lon, g.lat]);
      new ML.Marker({ element: pin("dep", `<div class="mk-avs">${d.people.slice(0, 3).map(p => avatar(p, "sm")).join("")}</div><span>${esc(d.city)}</span>`) }).setLngLat([g.lon, g.lat]).addTo(map);
    }
    const dest = t.destination ? await geocode(t.destination) : null;
    if (m3 !== map) return;
    if (dest) {
      bounds.extend([dest.lon, dest.lat]);
      new ML.Marker({ element: pin("dest", `<i></i><span>${esc(t.destination)}</span>`) }).setLngLat([dest.lon, dest.lat]).addTo(map);
      for (const d of depGeo) {
        const r = await drivingRoute(d.g, dest); if (m3 !== map) return;
        routes.push({ ...r, city: d.city, people: d.people.length });
        rows.push(`<div class="li"><div class="ib">${ico("car")}</div><div class="grow"><div class="t">${esc(d.city)} → ${esc(dest.name)}</div><div class="small muted">${Math.round(r.km)} km · ${r.real ? "" : "circa "}${fmtH(r.h)} · ${d.people.length} ${d.people.length === 1 ? "persona" : "persone"}</div></div>
          <a class="btn sm" target="_blank" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(d.city)}&destination=${encodeURIComponent(t.destination)}&travelmode=driving">Naviga</a></div>`);
      }
      // Percorsi luminosi: un alone largo e sfumato più una linea sottile.
      const fc = { type: "FeatureCollection", features: routes.map(r => ({ type: "Feature", geometry: { type: "LineString", coordinates: r.coords.map(([la, lo]) => [lo, la]) }, properties: {} })) };
      map.addSource("m3-routes", { type: "geojson", data: fc });
      map.addLayer({ id: "m3-glow", type: "line", source: "m3-routes", paint: { "line-color": "#9cc3ff", "line-width": 10, "line-blur": 8, "line-opacity": 0.45 }, layout: { "line-cap": "round", "line-join": "round" } });
      map.addLayer({ id: "m3-line", type: "line", source: "m3-routes", paint: { "line-color": "#e6d4ff", "line-width": 2.2 }, layout: { "line-cap": "round", "line-join": "round" } });
      // Le auto scorrono lungo i percorsi.
      const cars = routes.map(r => ({ coords: r.coords, off: Math.random(), mk: new ML.Marker({ element: pin("car", ico("car", 13)) }).setLngLat([r.coords[0][1], r.coords[0][0]]).addTo(map) }));
      const move = now => {
        if (m3 !== map || !el.isConnected) return;
        for (const c of cars) { const p = ((now / 12000) + c.off) % 1, n = c.coords.length - 1, f = p * n, i = Math.floor(f), k = f - i, a = c.coords[i], b = c.coords[Math.min(n, i + 1)]; c.mk.setLngLat([a[1] + (b[1] - a[1]) * k, a[0] + (b[0] - a[0]) * k]); }
        requestAnimationFrame(move);
      };
      if (cars.length) requestAnimationFrame(move);
    } else {
      // Nessuna meta: le città in gara nel sondaggio.
      const poll = S.polls.find(p => /dove|destinaz|meta|città/i.test(p.question) && p.status === "open");
      for (const o of poll ? pollData(poll).opts : []) {
        const g = await geocode(o.label.split(/[(-–]/)[0]); if (!g || m3 !== map) continue;
        bounds.extend([g.lon, g.lat]);
        new ML.Marker({ element: pin("cand", `<b>${o.voters.length}</b><span>${esc(g.name)}</span>`) }).setLngLat([g.lon, g.lat]).addTo(map);
        rows.push(`<div class="li"><div class="ib">${ico("vote")}</div><div class="grow"><div class="t">${esc(o.label)}</div><div class="small muted">${o.voters.length} voti${o.price ? ` · ~${eur(o.price)}` : ""}</div></div></div>`);
      }
    }
    // Chi condivide la posizione (ultime 12 ore).
    const people = S.members.filter(m => m.loc_lat != null && m.loc_at && Date.now() - new Date(m.loc_at) < 12 * 3600e3);
    for (const m of people) new ML.Marker({ element: pin("me", `${avatar(m, "sm")}<span>${esc(m.id === ME ? "Tu" : m.name)} · ${agoTxt(m.loc_at)}</span>`) }).setLngLat([m.loc_lon, m.loc_lat]).addTo(map);
    if (sharing() && navigator.geolocation) m3watch = navigator.geolocation.watchPosition(p => saveLoc(p, true), () => {}, { enableHighAccuracy: true, maximumAge: 60000 });

    const legend = $("#m3-legend");
    if (legend) legend.innerHTML = rows.length ? `<section class="card">${rows.join("")}</section>` : `<section class="card"><div class="small muted">Aggiungi la tua città di partenza nel profilo: qui comparirà il viaggio di tutti.</div></section>`;
    status(dest ? `${routes.length} ${routes.length === 1 ? "percorso" : "percorsi"} verso ${dest.name}` : "Le mete in gara nel sondaggio");

    const views = {
      globo: () => map.flyTo({ center: [12, 46], zoom: 1.6, pitch: 0, bearing: 0, duration: 2500 }),
      viaggio: () => { if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, pitch: 45, bearing: -12, duration: 2600, maxZoom: 8 }); },
      meta: () => dest && map.flyTo({ center: [dest.lon, dest.lat], zoom: 15.2, pitch: 64, bearing: -28, duration: 5200, essential: true }),
    };
    el.parentElement.querySelector(".m3-ctrl").addEventListener("click", e => { const b = e.target.closest("[data-m3]"); if (b) { spinning = false; views[b.dataset.m3](); } });
    // Il volo d'ingresso: dal globo ai percorsi, poi giù sulla meta in 3D.
    setTimeout(() => { if (m3 !== map) return; spinning = false; views.viaggio(); if (dest) setTimeout(() => m3 === map && views.meta(), 3600); }, 1400);
  },
};

async function saveLoc(p, quiet) {
  try {
    await api.update("members", { id: ME }, { loc_lat: p.coords.latitude, loc_lon: p.coords.longitude, loc_at: new Date().toISOString() });
    if (!quiet) { toast("Posizione condivisa con il gruppo", "pin"); await reload(); }
  } catch (e) { if (!quiet) toast(/loc_/.test(e.message) ? "Serve aggiornamento-4.sql su Supabase" : e.message, "alert"); }
}
Object.assign(ACTIONS, {
  async "m3-share"() {
    if (sharing()) {
      storage.del(LOC_KEY + ME);
      try { await api.update("members", { id: ME }, { loc_lat: null, loc_lon: null, loc_at: null }); } catch { /* già tolta */ }
      toast("Non condividi più la posizione"); return reload();
    }
    if (!navigator.geolocation) return toast("Questo telefono non dà la posizione all'app", "alert");
    navigator.geolocation.getCurrentPosition(p => { storage.set(LOC_KEY + ME, "on"); saveLoc(p); },
      () => toast("Permesso negato: lo puoi dare da Impostazioni → Privacy → Localizzazione", "alert"), { enableHighAccuracy: true, timeout: 15000 });
  },
});
