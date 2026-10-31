/* Capodanno - mappa 3D: un globo che si apre sull'Europa e vola fino alla meta, con palazzi in rilievo,
   percorsi luminosi da ogni città di partenza, auto in movimento e, solo con il consenso di ognuno,
   la posizione del gruppo. MapLibre (open source) con le mappe scure di CARTO. Sostituisce la mappa 2D di sezioni.js. */
"use strict";

const ML_VER = "5.24.0";
let mlReady = null, m3 = null, m3watch = null;
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

let m3timer = 0, m3state = null;
function stopMap() {
  clearInterval(m3timer); m3timer = 0;
  if (m3watch != null) navigator.geolocation?.clearWatch(m3watch); m3watch = null;
  if (m3) { try { m3.remove(); } catch { /* già chiusa */ } m3 = null; }
  m3state = null;
}
const cleanCity = s => String(s || "").split(/[(\-–,/]/)[0].trim();
const destPolls = () => S.polls.filter(p => p.status === "open" && /dove|destinaz|meta|città|citta|andiamo/i.test(p.question));
const locCard = () => `<div class="row" style="gap:12px">${ico("pin", 22)}<div class="grow"><div class="t">${sharing() ? "Stai condividendo la tua posizione" : "Condividi la tua posizione"}</div>
  <div class="small muted">${sharing() ? "Il gruppo ti vede sulla mappa finché la tieni aperta. Puoi smettere quando vuoi." : "Solo con il tuo permesso e solo con il gruppo: utile in viaggio e la notte del 31 per ritrovarsi."}</div></div></div>
  <button class="btn ${sharing() ? "" : "pearl"} block" style="margin-top:12px" data-act="m3-share">${sharing() ? "Smetti di condividere" : "Condividi dove sono"}</button>`;

EXTRA_VIEWS.mappa = {
  title: "Mappa", sub: "Il viaggio e le mete in gara, dal vivo",
  view() {
    stopMap();
    return `<div class="m3-wrap"><div id="m3"></div>
      <div class="m3-hud"><span class="m3-dot"></span><span id="m3-status">Inizializzo il globo…</span></div>
      <div class="m3-ctrl">
        <button data-m3="globo" aria-label="Globo">${ico("globe", 18)}</button>
        <button data-m3="viaggio" aria-label="Percorsi e mete">${ico("car", 18)}</button>
        <button data-m3="meta" aria-label="Meta in 3D">${ico("star", 18)}</button>
      </div></div>
      <section class="card m3-loc" id="m3-loc">${locCard()}</section>
      <div id="m3-legend"></div>`;
  },
  async mount() {
    const status = t => { const el = $("#m3-status"); if (el) el.textContent = t; };
    try { await loadMapLibre(); } catch { status("Mappa non disponibile senza connessione"); return; }
    const el = $("#m3"); if (!el || !el.isConnected) return;
    const ML = window.maplibregl;
    // Impostazioni leggere per il telefono: niente antialias, densità limitata, niente dissolvenze.
    const map = m3 = new ML.Map({
      container: el, style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [11, 46], zoom: 3.2, pitch: 0, bearing: 0, attributionControl: { compact: true },
      maxPitch: 70, maxZoom: 17, minZoom: 1.2, antialias: false, fadeDuration: 0,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2), dragRotate: true, touchPitch: true,
    });
    const st = m3state = { map, el, ML, dep: new Map(), cand: new Map(), ppl: new Map(), destMk: null, dest: null, routeSig: "", routes: [], cars: [], touched: false, busy: false, again: false, bounds: null };
    // Appena l'utente tocca, ogni animazione automatica si ferma e non torna.
    const touch = () => { st.touched = true; };
    for (const ev of ["touchstart", "pointerdown", "wheel"]) el.addEventListener(ev, touch, { passive: true });
    map.on("style.load", () => {
      try { map.setProjection({ type: "globe" }); } catch { /* versioni senza globo */ }
      try { map.setSky({ "sky-color": "#0b0a2a", "horizon-color": "#2a1f6e", "fog-color": "#07061a", "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.4, 10, 0] }); } catch { /* opzionale */ }
      try {
        const srcs = map.getStyle().sources, src = Object.keys(srcs).find(k => srcs[k].type === "vector");
        if (src) map.addLayer({ id: "m3-buildings", type: "fill-extrusion", source: src, "source-layer": "building", minzoom: 14.5,
          paint: { "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10], 0, "#1b1a44", 40, "#3b2d8f", 120, "#9cc3ff"],
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.85 } });
      } catch { /* senza palazzi */ }
      map.addSource("m3-routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "m3-glow", type: "line", source: "m3-routes", paint: { "line-color": "#9cc3ff", "line-width": 8, "line-blur": 5, "line-opacity": 0.4 }, layout: { "line-cap": "round", "line-join": "round" } });
      map.addLayer({ id: "m3-line", type: "line", source: "m3-routes", paint: { "line-color": "#e6d4ff", "line-width": 2 }, layout: { "line-cap": "round", "line-join": "round" } });
      // Le auto sono punti disegnati dalla mappa stessa (non elementi della pagina): non pesano sullo zoom.
      map.addSource("m3-cars", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "m3-cars-halo", type: "circle", source: "m3-cars", paint: { "circle-radius": 9, "circle-color": "#c9f3ee", "circle-opacity": 0.25, "circle-blur": 0.8 } });
      map.addLayer({ id: "m3-cars", type: "circle", source: "m3-cars", paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-stroke-width": 1.5, "circle-stroke-color": "#c9f3ee" } });
    });
    await new Promise(r => map.once("load", r));
    if (m3 !== map) return;
    // Auto: aggiornate 6 volte al secondo e mai mentre la mappa si muove.
    m3timer = setInterval(() => {
      if (m3 !== map) return;
      if (!el.isConnected) return stopMap();
      if (!st.cars.length || map.isMoving() || document.hidden) return;
      const now = Date.now();
      const f = st.cars.map(c => { const p = ((now / 14000) + c.off) % 1, n = c.coords.length - 1, x = p * n, i = Math.floor(x), k = x - i, a = c.coords[i], b = c.coords[Math.min(n, i + 1)];
        return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [a[1] + (b[1] - a[1]) * k, a[0] + (b[0] - a[0]) * k] } }; });
      map.getSource("m3-cars")?.setData({ type: "FeatureCollection", features: f });
    }, 160);

    const views = {
      globo: () => map.flyTo({ center: [11, 46], zoom: 1.8, pitch: 0, bearing: 0, duration: 1800 }),
      viaggio: () => { if (st.bounds && !st.bounds.isEmpty()) map.fitBounds(st.bounds, { padding: 60, pitch: 40, bearing: -10, duration: 1800, maxZoom: 8 }); },
      meta: () => { if (st.dest) map.flyTo({ center: [st.dest.lon, st.dest.lat], zoom: 15.4, pitch: 62, bearing: -28, duration: 3000, essential: true });
        else { const top = [...st.cand.values()].sort((a, b) => b.votes - a.votes)[0]; if (top) map.flyTo({ center: top.mk.getLngLat(), zoom: 12, pitch: 50, duration: 2400 }); } },
    };
    el.parentElement.querySelector(".m3-ctrl").addEventListener("click", e => { const b = e.target.closest("[data-m3]"); if (b) { st.touched = true; map.stop(); views[b.dataset.m3](); } });
    status("Carico partenze, percorsi e mete…");
    await m3RefreshNow();
    // Un solo volo d'ingresso, e solo se nel frattempo nessuno ha toccato la mappa.
    if (m3 === map && !st.touched) views.viaggio();
  },
};

// Aggiorna la mappa senza ricostruirla: chiamata a ogni cambiamento dei dati (voti, partenze, posizioni).
async function m3RefreshNow() {
  const st = m3state; if (!st || m3 !== st.map) return false;
  if (!st.el.isConnected) { stopMap(); return false; }
  const loc = $("#m3-loc"); if (loc) loc.innerHTML = locCard();
  if (st.busy) { st.again = true; return true; }
  st.busy = true;
  try { do { st.again = false; await m3Update(st); } while (st.again && m3 === st.map); }
  catch (e) { console.error(e); }
  finally { st.busy = false; }
  return true;
}
window.m3Refresh = () => (m3state && m3 && m3state.el.isConnected ? (m3RefreshNow(), true) : false);

async function m3Update(st) {
  const { map, ML } = st, alive = () => m3 === map;
  const pin = (cls, html) => { const d = document.createElement("div"); d.className = `m3k ${cls}`; d.innerHTML = html; return d; };
  const bounds = new ML.LngLatBounds(), rows = [], candRows = [];
  const t = trip(), deps = departures();

  // Città di partenza.
  const depGeo = [], seenDep = new Set();
  for (const d of deps) {
    const g = await geocode(d.city); if (!alive()) return; if (!g) continue;
    depGeo.push({ ...d, g }); bounds.extend([g.lon, g.lat]);
    const k = d.city.toLowerCase(); seenDep.add(k);
    const html = `<div class="mk-avs">${d.people.slice(0, 3).map(p => avatar(p, "sm")).join("")}</div><span>${esc(d.city)}</span>`;
    const old = st.dep.get(k);
    if (old) { if (old.html !== html) { old.mk.getElement().innerHTML = html; old.html = html; } }
    else st.dep.set(k, { html, mk: new ML.Marker({ element: pin("dep", html) }).setLngLat([g.lon, g.lat]).addTo(map) });
  }
  for (const [k, v] of st.dep) if (!seenDep.has(k)) { v.mk.remove(); st.dep.delete(k); }

  // Meta scelta e percorsi (ricalcolati solo se cambiano partenze o meta).
  const dest = t.destination ? await geocode(t.destination) : null; if (!alive()) return;
  st.dest = dest;
  if (dest) bounds.extend([dest.lon, dest.lat]);
  const sig = JSON.stringify([dest && [dest.lat, dest.lon], depGeo.map(d => [d.g.lat, d.g.lon])]);
  if (sig !== st.routeSig) {
    st.routeSig = sig; st.routes = []; st.destMk?.remove(); st.destMk = null;
    if (dest) {
      st.destMk = new ML.Marker({ element: pin("dest", `<i></i><span>${esc(t.destination)}</span>`) }).setLngLat([dest.lon, dest.lat]).addTo(map);
      for (const d of depGeo) { const r = await drivingRoute(d.g, dest); if (!alive()) return; st.routes.push({ ...r, city: d.city, people: d.people.length }); }
    }
    map.getSource("m3-routes")?.setData({ type: "FeatureCollection", features: st.routes.map(r => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.coords.map(([la, lo]) => [lo, la]) } })) });
    st.cars = st.routes.filter(r => r.coords?.length > 1).map(r => ({ coords: r.coords, off: Math.random() }));
    if (!st.cars.length) map.getSource("m3-cars")?.setData({ type: "FeatureCollection", features: [] });
  }
  for (const r of st.routes) rows.push(`<div class="li"><div class="ib">${ico("car")}</div><div class="grow"><div class="t">${esc(r.city)} → ${esc(dest?.name || t.destination)}</div><div class="small muted">${Math.round(r.km)} km · ${r.real ? "" : "circa "}${fmtH(r.h)} · ${r.people} ${r.people === 1 ? "persona" : "persone"}</div></div>
    <a class="btn sm" target="_blank" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.city)}&destination=${encodeURIComponent(t.destination)}&travelmode=driving">Naviga</a></div>`);

  // Mete in gara nei sondaggi aperti, con i voti in tempo reale.
  const opts = destPolls().flatMap(p => pollData(p).opts.map(o => ({ ...o, poll: p })));
  const total = opts.reduce((a, o) => a + o.voters.length, 0);
  const maxV = Math.max(0, ...opts.map(o => o.voters.length));
  const seenCand = new Set();
  for (const o of opts.sort((a, b) => b.voters.length - a.voters.length)) {
    const g = await geocode(cleanCity(o.label)); if (!alive()) return; if (!g) continue;
    bounds.extend([g.lon, g.lat]); seenCand.add(o.id);
    const lead = o.voters.length > 0 && o.voters.length === maxV && opts.filter(x => x.voters.length === maxV).length === 1;
    const html = `<b>${o.voters.length}</b><span>${esc(cleanCity(o.label) || g.name)}</span>${o.voters.length ? `<em>${o.voters.slice(0, 4).map(id => member(id) ? avatar(member(id), "sm") : "").join("")}</em>` : ""}`;
    const old = st.cand.get(o.id);
    if (old) {
      if (old.html !== html) { const e = old.mk.getElement(); e.innerHTML = html; old.html = html; if (o.voters.length > old.votes) { e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump"); } }
      old.mk.getElement().classList.toggle("lead", lead); old.votes = o.voters.length;
    } else {
      const e = pin(`cand${lead ? " lead" : ""}`, html);
      e.addEventListener("click", ev => { ev.stopPropagation(); UI.tab = "vota"; render(); });
      st.cand.set(o.id, { html, votes: o.voters.length, mk: new ML.Marker({ element: e }).setLngLat([g.lon, g.lat]).addTo(map) });
    }
    const pct = total ? Math.round(o.voters.length / total * 100) : 0;
    candRows.push(`<div class="li" data-act="tab" data-tab="vota"><div class="ib">${ico("vote")}</div><div class="grow"><div class="t">${esc(o.label)}${lead ? ` <span class="m3-lead">in testa</span>` : ""}</div>
      <div class="m3-bar"><i style="width:${pct}%"></i></div><div class="small muted">${o.voters.length} ${o.voters.length === 1 ? "voto" : "voti"}${total ? ` · ${pct}%` : ""}${o.price ? ` · ~${eur(o.price)}` : ""}</div></div></div>`);
  }
  for (const [k, v] of st.cand) if (!seenCand.has(k)) { v.mk.remove(); st.cand.delete(k); }

  // Chi condivide la posizione (ultime 12 ore).
  const seenP = new Set();
  for (const m of S.members.filter(m => m.loc_lat != null && m.loc_at && Date.now() - new Date(m.loc_at) < 12 * 3600e3)) {
    seenP.add(m.id); bounds.extend([m.loc_lon, m.loc_lat]);
    const html = `${avatar(m, "sm")}<span>${esc(m.id === ME ? "Tu" : m.name)} · ${agoTxt(m.loc_at)}</span>`;
    const old = st.ppl.get(m.id);
    if (old) { old.mk.setLngLat([m.loc_lon, m.loc_lat]); if (old.html !== html) { old.mk.getElement().innerHTML = html; old.html = html; } }
    else st.ppl.set(m.id, { html, mk: new ML.Marker({ element: pin("me", html) }).setLngLat([m.loc_lon, m.loc_lat]).addTo(map) });
  }
  for (const [k, v] of st.ppl) if (!seenP.has(k)) { v.mk.remove(); st.ppl.delete(k); }
  if (sharing() && navigator.geolocation && m3watch == null) m3watch = navigator.geolocation.watchPosition(p => saveLoc(p, true), () => {}, { enableHighAccuracy: true, maximumAge: 60000 });
  if (!sharing() && m3watch != null) { navigator.geolocation?.clearWatch(m3watch); m3watch = null; }

  st.bounds = bounds;
  const legend = $("#m3-legend");
  if (legend) legend.innerHTML = (candRows.length ? `<section class="card"><div class="m3-h"><span class="m3-dot"></span>Mete in gara · dal vivo</div>${candRows.join("")}</section>` : "")
    + (rows.length ? `<section class="card">${rows.join("")}</section>` : "")
    + (!rows.length && !candRows.length ? `<section class="card"><div class="small muted">Aggiungi la tua città di partenza nel profilo: qui comparirà il viaggio di tutti.</div></section>` : "");
  const el = $("#m3-status");
  if (el) el.textContent = dest ? `${st.routes.length} ${st.routes.length === 1 ? "percorso" : "percorsi"} verso ${dest.name}${st.cand.size ? ` · ${st.cand.size} mete in gara` : ""}`
    : st.cand.size ? `${st.cand.size} mete in gara · ${total} ${total === 1 ? "voto" : "voti"}` : "Il gruppo sulla mappa";
}

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
