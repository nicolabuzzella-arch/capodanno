/* Capodanno - sezioni dedicate: profilo da completare, vibe del gruppo (organizzatore), passaggi in auto,
   meteo da più modelli e mappa animata del viaggio. Usa le funzioni globali di app.js. */
"use strict";

window.EXTRA_VIEWS = window.EXTRA_VIEWS || {};

// ───────────────────────── Luoghi (geocoding con cache) ─────────────────────────

const GEO_KEY = "capodanno-geo-v1";
const geoCache = (() => { try { return JSON.parse(storage.get(GEO_KEY)) || {}; } catch { return {}; } })();
async function geocode(q) {
  q = String(q || "").trim();
  if (!q) return null;
  const k = q.toLowerCase();
  if (k in geoCache) return geoCache[k];
  let hit = null;
  try {
    // Prima le città (Open-Meteo, veloce e senza chiave), poi gli indirizzi (OpenStreetMap).
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.split(",")[0])}&count=1&language=it`)).json();
    const r = g.results?.[0];
    if (r && !/\d/.test(q)) hit = { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country_code };
    if (!hit) {
      const n = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=it&q=${encodeURIComponent(q)}`)).json();
      if (n[0]) hit = { lat: Number(n[0].lat), lon: Number(n[0].lon), name: n[0].display_name.split(",")[0] };
      else if (r) hit = { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country_code };
    }
  } catch { return null; }
  geoCache[k] = hit; storage.set(GEO_KEY, JSON.stringify(geoCache));
  return hit;
}
const kmBetween = (a, b) => {
  const R = 6371, d = x => x * Math.PI / 180;
  const h = Math.sin(d(b.lat - a.lat) / 2) ** 2 + Math.cos(d(a.lat)) * Math.cos(d(b.lat)) * Math.sin(d(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const routeCache = {};
// Percorso stradale vero (OSRM, gratuito); se non risponde, una stima in linea d'aria.
async function drivingRoute(a, b) {
  const k = `${a.lat},${a.lon};${b.lat},${b.lon}`;
  if (routeCache[k]) return routeCache[k];
  let out;
  try {
    const r = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=simplified&geometries=geojson`)).json();
    const rt = r.routes?.[0];
    if (rt) out = { km: rt.distance / 1000, h: rt.duration / 3600, coords: rt.geometry.coordinates.map(([lon, lat]) => [lat, lon]), real: true };
  } catch { /* fallback sotto */ }
  if (!out) { const km = kmBetween(a, b) * 1.3; out = { km, h: km / 85, coords: [[a.lat, a.lon], [b.lat, b.lon]], real: false }; }
  return (routeCache[k] = out);
}
const fmtH = h => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const departures = () => {
  const by = new Map();
  for (const m of S.members) { const c = (m.departure_city || "").trim(); if (!c) continue; const k = c.toLowerCase(); if (!by.has(k)) by.set(k, { city: c, people: [] }); by.get(k).people.push(m); }
  return [...by.values()].sort((a, b) => b.people.length - a.people.length);
};

// ───────────────────────── Completa il profilo ─────────────────────────

const PDONE = "capodanno-profilo-ok-";
const chipsSel = (name, opts, cur, multi) => `<div class="pf-chips" data-noswipe>${opts.map(o => `<label class="pf-chip"><input type="${multi ? "checkbox" : "radio"}" name="${name}" value="${esc(o)}" ${(multi ? String(cur || "").split(/,\s*/) : [cur]).includes(o) ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</div>`;
const PQ = [
  { k: "foto", need: m => !m.avatar_url, t: "Una faccia da mettere al nome", why: "Nella chat, nei giochi e sulla mappa si riconosce chi è chi.",
    html: m => `<div class="pf-photo"><span id="pf-av">${avatar(m, "xl")}</span><label class="btn pearl tap">${ico("upload", 17)}Scegli una foto<input type="file" accept="image/*" hidden data-pf-photo></label></div>`, read: () => null },
  { k: "tel", need: m => !m.phone, t: "Il tuo numero", why: "Per i passaggi, le emergenze e le prenotazioni che lo chiedono. Lo vede solo il gruppo.",
    html: m => `<input name="phone" inputmode="tel" placeholder="+39 333 …" value="${esc(m.phone || "")}" autofocus>`, read: f => ({ m: { phone: f.phone } }) },
  { k: "dieta", need: m => !m.diet, t: "Cosa mangi?", why: "Così cenone e ristoranti si scelgono una volta sola, senza sorprese al tavolo.",
    html: m => chipsSel("diet", ["Mangio tutto", "Vegetariana", "Vegana", "Senza glutine", "Senza lattosio", "Halal"], m.diet), read: f => ({ m: { diet: f.diet } }) },
  { k: "allergie", need: m => !m.allergies, t: "Allergie o intolleranze?", why: "Zampone le segnala da solo quando propone locali e menu.",
    html: m => `<input name="allergies" placeholder="Es. frutta a guscio, crostacei… oppure «nessuna»" value="${esc(m.allergies || "")}">`, read: f => ({ m: { allergies: f.allergies } }) },
  { k: "partenza", need: m => !m.departure_city, t: "Da dove parti?", why: "Serve per organizzare le auto e disegnare il viaggio sulla mappa.",
    html: m => `<input name="departure_city" placeholder="Es. Chiavenna" value="${esc(m.departure_city || "")}">${chipsSel("departure_quick", ["Chiavenna", "Milano", "Sondrio", "Como"], "")}`,
    read: f => ({ m: { departure_city: f.departure_city || f.departure_quick } }) },
  { k: "auto", need: m => !m.car_seats && !m.ride_with && !storage.get(PDONE + "auto"), t: "Porti la macchina?", why: "Con le auto giuste si spende meno e nessuno resta a piedi.",
    html: () => `${chipsSel("car", ["No, cerco un passaggio", "Sì, porto l'auto"], "")}<div class="field" style="margin-top:12px"><label>Posti liberi (oltre a te)</label><input name="seats" type="number" min="1" max="8" value="3"></div>`,
    read: f => (f.car?.startsWith("Sì") ? { m: { car_seats: Math.max(1, Number(f.seats) || 1) } } : { m: { car_seats: 0 }, local: "auto" }) },
  { k: "gusti", need: m => !m.preferences, t: "Cosa non vuoi perderti?", why: "Più ne scegli, più le proposte saranno su misura. Anche tutte.",
    html: m => chipsSel("preferences", ["Festa e ballare", "Cene buone", "Bere bene", "Musei e cultura", "Passeggiate", "Relax", "Locali", "Natura", "Shopping"], m.preferences, true), read: f => ({ m: { preferences: f.preferences } }) },
  { k: "paga", need: m => !m.paypal && !m.iban && !m.satispay, t: "Come ti mandiamo i soldi?", why: "Per le quote e i rimborsi di Splitwise: un tocco e il pagamento parte già compilato.",
    html: m => `<input name="paypal" placeholder="PayPal.me (es. nicolabuzzella)" value="${esc(m.paypal || "")}"><input name="satispay" placeholder="Satispay (numero)" inputmode="tel" value="${esc(m.satispay || "")}" style="margin-top:8px"><input name="iban" placeholder="IBAN" value="${esc(m.iban || "")}" style="margin-top:8px">`,
    read: f => ({ m: { paypal: f.paypal ? paypalUser(f.paypal) : null, satispay: f.satispay || null, iban: f.iban ? f.iban.toUpperCase().replace(/\s/g, "") : null } }) },
  { k: "emergenza", need: m => !m.emergency_phone, t: "Chi chiamiamo se serve?", why: "Speriamo di non usarlo mai. Lo vede solo l'organizzatore se succede qualcosa.",
    html: m => `<input name="emergency_name" placeholder="Nome (es. mamma)" value="${esc(m.emergency_name || "")}"><input name="emergency_phone" placeholder="Numero" inputmode="tel" value="${esc(m.emergency_phone || "")}" style="margin-top:8px">`,
    read: f => ({ m: { emergency_name: f.emergency_name, emergency_phone: f.emergency_phone } }) },
  { k: "documento", need: (m, p) => !p.doc_number, t: "Il documento per il check-in", why: "Hotel e appartamenti lo chiedono per legge: inserito ora, nessuno ti rincorre dopo. Lo vede solo l'organizzatore.",
    html: (m, p) => `<input name="legal_name" placeholder="Nome e cognome come sul documento" value="${esc(p.legal_name || "")}">
      <div class="two" style="margin-top:8px"><select name="doc_type"><option ${p.doc_type === "Carta d'identità" ? "selected" : ""}>Carta d'identità</option><option ${p.doc_type === "Passaporto" ? "selected" : ""}>Passaporto</option><option ${p.doc_type === "Patente" ? "selected" : ""}>Patente</option></select>
      <input name="doc_number" placeholder="Numero" value="${esc(p.doc_number || "")}"></div>
      <div class="two" style="margin-top:8px"><div><div class="tiny faint">Nato il</div><input name="birth_date" type="date" value="${esc(p.birth_date || "")}"></div><div><div class="tiny faint">Scadenza</div><input name="doc_expiry" type="date" value="${esc(p.doc_expiry || "")}"></div></div>`,
    read: f => ({ p: { legal_name: f.legal_name, doc_type: f.doc_type, doc_number: f.doc_number, birth_date: f.birth_date || null, doc_expiry: f.doc_expiry || null } }) },
  { k: "cf", need: (m, p) => !p.fiscal_code, t: "Codice fiscale e indirizzo", why: "A volte servono per prenotare a nome di tutti. Anche questi li vede solo l'organizzatore.",
    html: (m, p) => `<input name="fiscal_code" placeholder="Codice fiscale" value="${esc(p.fiscal_code || "")}" style="text-transform:uppercase"><input name="birth_place" placeholder="Luogo di nascita" value="${esc(p.birth_place || "")}" style="margin-top:8px"><input name="address" placeholder="Indirizzo di residenza" value="${esc(p.address || "")}" style="margin-top:8px">`,
    read: f => ({ p: { fiscal_code: (f.fiscal_code || "").toUpperCase(), birth_place: f.birth_place, address: f.address } }) },
];
const myPriv = () => S.member_private.find(r => r.member_id === ME) || {};
const missingQ = () => { const m = me(), p = myPriv(); return PQ.filter(q => q.need(m, p) && !storage.get(PDONE + "skip-" + q.k + "-" + today())); };
const profileScore = () => { const m = me(), p = myPriv(); const tot = PQ.length; return Math.round(100 * (tot - PQ.filter(q => q.need(m, p)).length) / tot); };

let pfIndex = 0;
EXTRA_VIEWS.profilo = {
  title: "Il tuo profilo", sub: "Una domanda alla volta, giuro",
  view() {
    const list = missingQ();
    const score = profileScore();
    if (!list.length) return `<section class="card pf-done"><div class="pf-ring" style="--p:${score}"><b>${score}%</b></div>
      <div class="serif" style="font-size:32px;margin-top:14px">${score === 100 ? "Profilo da manuale" : "Per oggi basta così"}</div>
      <p class="muted small">${score === 100 ? `Grazie: ${AI()} e l'organizzatore hanno tutto quello che serve. Il resto filerà liscio.` : "Le domande saltate tornano domani. Senza fretta, ma non dimenticartene."}</p>
      <button class="btn pearl block" data-act="tab" data-tab="home">Torna alla Home</button></section>`;
    pfIndex = Math.min(pfIndex, list.length - 1);
    const q = list[pfIndex];
    return `<section class="card pf-card">
      <div class="pf-top"><div class="pf-ring sm" style="--p:${score}"><b>${score}%</b></div><div class="tiny faint">Domanda ${pfIndex + 1} di ${list.length} · ti mancano ${list.length} cose</div></div>
      <div class="serif pf-q">${q.t}</div>
      <div class="small muted" style="margin:6px 0 18px">${q.why}</div>
      <form id="pf-form" data-k="${q.k}">${q.html(me(), myPriv())}
        <div class="actions" style="margin-top:20px"><button type="button" class="btn" data-act="pf-skip" data-k="${q.k}">Più tardi</button><button class="btn pearl">Salva${list.length > 1 ? " e avanti" : ""}</button></div>
      </form></section>
      <p class="tiny faint" style="text-align:center;margin-top:10px">Più è completo il profilo, più il resto va veloce: prenotazioni, auto e conti si fanno in un tocco.</p>`;
  },
  mount() {
    const f = $("#pf-form"); if (!f) return;
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const q = PQ.find(x => x.k === f.dataset.k);
      const fd = new FormData(f), data = {};
      for (const [k, v] of fd.entries()) data[k] = data[k] ? `${data[k]}, ${v}` : String(v).trim();
      const r = q.read(data);
      if (!r) { pfIndex++; return render(); }
      const mPatch = Object.fromEntries(Object.entries(r.m || {}).filter(([, v]) => v !== undefined && v !== ""));
      const pPatch = Object.fromEntries(Object.entries(r.p || {}).filter(([, v]) => v !== undefined && v !== ""));
      if (!Object.keys(mPatch).length && !Object.keys(pPatch).length && !r.local) return toast("Scrivi qualcosa, oppure tocca «Più tardi»");
      try {
        if (Object.keys(mPatch).length) await api.update("members", { id: ME }, mPatch);
        if (Object.keys(pPatch).length) await api.upsert("member_private", { member_id: ME, ...myPriv(), ...pPatch, updated_at: new Date().toISOString() });
        if (r.local) storage.set(PDONE + r.local, "1");
        navigator.vibrate?.(10);
        await reload();
      } catch (err) { toast(err.message, "alert"); }
    });
    f.querySelector("[data-pf-photo]")?.addEventListener("change", async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try { const url = await api.uploadAvatar(await squareImage(file, 320)); await api.update("members", { id: ME }, { avatar_url: url }); toast("Che bella foto"); await reload(); }
      catch (err) { toast(err.message, "alert"); }
    });
  },
};

// ───────────────────────── Vibe del gruppo (solo organizzatore) ─────────────────────────

const VIBE_PER = [
  { q: "Che tipo è in vacanza?", chips: ["Anima della festa", "Organizzatore", "Ritardatario cronico", "Brontolone simpatico", "Romantico", "Esploratore", "Dormiglione", "Fotografo", "Chef", "Diplomatico"] },
  { q: "Quanto spende volentieri per tre giorni?", chips: ["Meno di 250 €", "250–450 €", "450–700 €", "Più di 700 €", "Dipende dall'umore"] },
  { q: "Cosa lo rende felice a Capodanno?", chips: ["Ballare fino all'alba", "Una cena memorabile", "Stare tutti insieme", "Vedere posti nuovi", "Brindare a mezzanotte"] },
  { q: "Cosa non sopporta?", chips: ["Le code", "Il freddo", "Spendere troppo", "I programmi rigidi", "Le discoteche", "Svegliarsi presto"] },
  { q: "Con chi va più d'accordo?", members: true },
  { q: "Argomento da evitare, o battuta che lo fa ridere sempre?", chips: [] },
];
const VIBE_GROUP = [
  { q: "In una parola, il gruppo è…", chips: ["Caotico", "Affiatato", "Rumoroso", "Indeciso", "Leggendario"] },
  { q: "Chi decide di solito, alla fine?", members: true },
  { q: "Il tormentone o la battuta storica del gruppo?", chips: [] },
  { q: "Cosa fa litigare sempre?", chips: ["Dove andare", "Quanto spendere", "Gli orari", "La musica", "Chi guida"] },
  { q: "Il ricordo più bello di un viaggio insieme?", chips: [] },
];
function nextVibe() {
  const done = new Set((S.vibe_answers || []).map(v => `${v.member_id || "g"}|${v.question}`));
  const skipped = (() => { try { return JSON.parse(storage.get("capodanno-vibe-skip")) || []; } catch { return []; } })();
  const isOpen = (mid, q) => !done.has(`${mid || "g"}|${q}`) && !skipped.includes(`${mid || "g"}|${q}`);
  for (const g of VIBE_GROUP) if (isOpen(null, g.q)) return { member: null, ...g, total: done.size };
  for (const m of S.members) for (const v of VIBE_PER) if (isOpen(m.id, v.q)) return { member: m, ...v, total: done.size };
  return null;
}
EXTRA_VIEWS.vibe = {
  title: "La vibe del gruppo", sub: "Solo tu le vedi. Zampone le studia.",
  back: "gruppo",
  view() {
    if (!isAdmin()) return emptyState("lock", "Riservato", "Questa sezione è dell'organizzatore.");
    const n = nextVibe();
    const total = (S.vibe_answers || []).length;
    if (!n) return `<section class="card pf-done"><div class="serif" style="font-size:30px">Hai raccontato tutto</div><p class="muted small">${total} risposte: ${AI()} ora sa chi è chi. Puoi aggiungerne quando vuoi dalla chat con lui.</p></section>`;
    const who = n.member ? n.member.name : "il gruppo";
    const chips = n.members ? S.members.filter(m => m.id !== n.member?.id).map(m => m.name) : n.chips;
    return `<section class="card pf-card">
      <div class="pf-top">${n.member ? avatar(n.member, "lg") : `<div class="game-ico">${ico("users", 26)}</div>`}<div class="tiny faint">${total} risposte finora · su ${esc(who)}</div></div>
      <div class="serif pf-q">${esc(n.q.replace("lo ", n.member ? "" : "lo ").replace("?", ""))}${n.member ? `<br><em>${esc(n.member.name)}</em>` : ""}?</div>
      <form id="vibe-form" data-q="${esc(n.q)}" data-m="${n.member?.id || ""}">
        ${chips.length ? chipsSel("pick", chips, "", true) : ""}
        <textarea name="free" rows="2" placeholder="${chips.length ? "Oppure scrivilo con parole tue…" : "Scrivi pure liberamente…"}" style="margin-top:12px"></textarea>
        <div class="actions" style="margin-top:16px"><button type="button" class="btn" data-act="vibe-skip" data-key="${n.member?.id || "g"}|${esc(n.q)}">Salta</button><button class="btn pearl">Avanti</button></div>
      </form></section>
      <p class="tiny faint" style="text-align:center">Nessun altro le vede, nemmeno la persona di cui parli. ${AI()} le usa per capire il clima, non le cita mai.</p>`;
  },
  mount() {
    const f = $("#vibe-form"); if (!f) return;
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(f);
      const answer = [fd.getAll("pick").join(", "), String(fd.get("free") || "").trim()].filter(Boolean).join(" — ");
      if (!answer) return toast("Scegli o scrivi qualcosa, oppure salta");
      try { await api.insert("vibe_answers", { member_id: f.dataset.m || null, question: f.dataset.q, answer }); navigator.vibrate?.(8); await reload(); }
      catch (err) { toast(err.message.includes("vibe") ? "Esegui aggiornamento-3.sql su Supabase per attivare questa sezione" : err.message, "alert"); }
    });
  },
};

// ───────────────────────── Passaggi ─────────────────────────

const FUEL = { l100: 6.5, eurL: 1.8, tollKm: 0.075 };
EXTRA_VIEWS.passaggi = {
  title: "Passaggi", sub: "Chi guida, chi sale, quanto costa",
  view() {
    const drivers = S.members.filter(m => m.car_seats > 0);
    const riding = id => S.members.filter(m => m.ride_with === id);
    const walkers = S.members.filter(m => !(m.car_seats > 0) && !(m.ride_with && member(m.ride_with)));
    const mine = me();
    const t = trip();
    const totSeats = drivers.reduce((s, d) => s + d.car_seats, 0), totPeople = S.members.length - drivers.length;
    return `
    <section class="card">
      <div class="row top"><div class="game-ico">${ico("car", 28)}</div><div class="grow">
        <div class="serif" style="font-size:26px;line-height:1.05">${drivers.length ? `${drivers.length} ${drivers.length === 1 ? "auto" : "auto"}, ${totSeats} posti` : "Ancora nessuna auto"}</div>
        <div class="small muted" style="margin-top:6px">${totPeople - totSeats > 0 ? `Mancano <b>${totPeople - totSeats}</b> posti: serve un'altra auto o un treno.` : drivers.length ? "Posti sufficienti per tutti." : "Chi porta la macchina?"} ${t.destination ? `Destinazione: <b>${esc(t.destination)}</b>.` : ""}</div></div></div>
      <div class="actions" style="margin-top:14px">
        ${mine.car_seats > 0 ? `<button class="btn" data-act="ride-seats" data-d="-1">${ico("close", 15)}Un posto in meno</button><button class="btn" data-act="ride-seats" data-d="1">${ico("plus", 15)}Un posto in più</button>`
          : `<button class="btn pearl" data-act="ride-drive">${ico("car", 17)}Porto l'auto io</button>`}
      </div>
    </section>
    ${drivers.map(d => {
      const pax = riding(d.id), free = Math.max(0, d.car_seats - pax.length);
      return `<section class="card ride-car">
        <div class="row" style="gap:12px">${avatar(d, "lg")}<div class="grow"><div class="t">Auto di ${esc(d.name)}${d.id === ME ? " (tu)" : ""}</div>
          <div class="small muted">${d.departure_city ? `parte da ${esc(d.departure_city)}` : "partenza da decidere"} · ${pax.length}/${d.car_seats} occupati</div></div>
          ${d.phone && d.id !== ME ? `<a class="btn icon sm" href="https://wa.me/${d.phone.replace(/[^\d]/g, "")}" target="_blank" aria-label="Scrivi su WhatsApp">${ico("chat", 17)}</a>` : ""}</div>
        <div class="ride-seats">
          <div class="seat driver">${avatar(d, "sm")}<span>Guida</span></div>
          ${pax.map(p => `<div class="seat">${avatar(p, "sm")}<span>${esc(p.name)}</span>${p.id === ME ? `<button class="link tiny" data-act="ride-leave">scendi</button>` : ""}</div>`).join("")}
          ${Array.from({ length: free }, () => `<button class="seat empty" data-act="ride-join" data-id="${d.id}" ${d.id === ME || mine.car_seats > 0 ? "disabled" : ""}>${ico("plus", 16)}<span>Libero</span></button>`).join("")}
        </div>
        <div class="tiny faint ride-cost" data-ride-cost="${d.id}"></div>
      </section>`;
    }).join("")}
    ${walkers.length ? `<section class="card"><div class="label">Ancora senza passaggio</div>
      <div class="ride-walkers">${walkers.map(w => `<div class="chip-av">${avatar(w, "sm")}${esc(w.name)}</div>`).join("")}</div></section>` : ""}
    <section class="card tap" data-act="ask" data-q="Organizza i passaggi in auto: chi guida, chi sale con chi, orari di partenza e quanto spende ognuno tra benzina e pedaggi.">
      <div class="row">${ico("spark", 20)}<div class="grow"><div class="t">Fai organizzare a ${AI()}</div><div class="small muted">Incastra auto, partenze e costi, poi lo scrive in chat.</div></div><span class="chev">${ico("chev", 18)}</span></div>
    </section>`;
  },
  async mount() {
    // Stima dei costi per auto: percorso vero, benzina e pedaggi divisi tra chi viaggia.
    const t = trip(); if (!t.destination) { $$("[data-ride-cost]").forEach(el => { el.textContent = "Il costo a testa comparirà quando sarà decisa la destinazione."; }); return; }
    const dest = await geocode(t.destination); if (!dest) return;
    for (const el of $$("[data-ride-cost]")) {
      const d = member(el.dataset.rideCost); if (!d?.departure_city) { el.textContent = "Aggiungi la città di partenza per stimare il costo."; continue; }
      const from = await geocode(d.departure_city); if (!from) continue;
      const r = await drivingRoute(from, dest);
      const people = 1 + S.members.filter(m => m.ride_with === d.id).length;
      const cost = r.km * (FUEL.l100 / 100 * FUEL.eurL + FUEL.tollKm) * 2;
      if (el.isConnected) el.innerHTML = `${Math.round(r.km)} km, circa ${fmtH(r.h)} · andata e ritorno ~${eur(cost)} (benzina e pedaggi) · <b>${eur(cost / people)} a testa</b> in ${people}`;
    }
  },
};

// ───────────────────────── Meteo ─────────────────────────

const MODELS = [["ecmwf_ifs025", "ECMWF"], ["icon_seamless", "ICON (DWD)"], ["meteofrance_seamless", "Météo-France"], ["gfs_seamless", "GFS (NOAA)"]];
const WMO = c => (c === 0 ? "sereno" : c <= 2 ? "poco nuvoloso" : c === 3 ? "coperto" : c <= 48 ? "nebbia" : c <= 57 ? "pioviggine" : c <= 67 ? "pioggia" : c <= 77 ? "neve" : c <= 82 ? "rovesci" : c <= 86 ? "neve" : "temporale");
const WICON = c => (c === 0 ? "sun" : c <= 3 ? "cloud" : c <= 48 ? "fog" : c <= 67 || (c >= 80 && c <= 82) ? "rain" : c <= 77 || c <= 86 ? "snow" : "storm");
const WIT = {
  sereno: ["Cielo pulito come un bicchiere appena lucidato: la giornata non ha scuse.", "Sole che non chiede nulla in cambio, cosa rara a fine dicembre.", "Azzurro da cartolina: gli occhiali da sole stavolta servono davvero."],
  "poco nuvoloso": ["Qualche nuvola di passaggio, più comparsa che protagonista.", "Sole e nuvole si spartiscono il cielo con fair play.", "Un cielo indeciso ma educato: nessun dramma in vista."],
  coperto: ["Grigio elegante, tipo cappotto di cachemire: non entusiasma ma non tradisce.", "Cielo coperto, luce da film d'autore: ottimo per le foto in bianco e nero.", "Nuvole compatte e umore stabile: il classico tempo da vin brulé."],
  nebbia: ["Nebbia da pianura: si vede poco, si immagina molto.", "Visibilità ridotta e atmosfera da romanzo giallo: fari accesi e calma.", "La nebbia avvolge tutto con discrezione. Guidate come se vi guardasse vostra madre."],
  pioviggine: ["Pioviggine sottile, più fastidio che pioggia: un cappuccio basta.", "Gocce timide che non si decidono: non serve l'ombrello, serve pazienza."],
  pioggia: ["Pioverà con la discrezione di un cameriere insistente: ombrello in tasca e sorriso di circostanza.", "Pioggia in arrivo: perfetta scusa per un aperitivo lungo al coperto.", "Giornata umida: le scarpe di camoscio restano a casa, fidatevi."],
  rovesci: ["Rovesci a sorpresa, tipo colpi di scena: tenete un riparo sottomano.", "Acquazzoni intermittenti: tra uno e l'altro si esce, con tempismo da ninja."],
  neve: ["Neve in arrivo: romantica per le foto, meno per chi guida. Catene a bordo, poesia nel cuore.", "Fiocchi in vista: il Capodanno si veste di bianco, voi di strati.", "Neve: il paesaggio migliora, la viabilità no. Partite con anticipo."],
  temporale: ["Temporale in agenda: il cielo anticipa i fuochi d'artificio.", "Tuoni e lampi in programma: si festeggia al chiuso, con stile."],
};
const pickBy = (arr, seed) => arr[Math.abs([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % arr.length];
function witty(day, place) {
  let line = pickBy(WIT[day.kind] || WIT.coperto, day.date + place);
  if (day.tmin <= -4) line += " E fa un freddo serio: guanti, sciarpa e niente eroismi.";
  else if (day.tmax >= 16) line += " Temperature quasi primaverili, sospettosamente.";
  if (day.wind >= 45) line += " Vento forte: le acconciature sono avvisate.";
  return line;
}
const median = a => { const b = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); if (!b.length) return null; const m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const WX_KEY = "capodanno-meteo-luoghi";
async function forecast(place) {
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&timezone=auto&forecast_days=7`;
  const [multi, best] = await Promise.all([
    fetch(`${base}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&models=${MODELS.map(m => m[0]).join(",")}`).then(r => r.json()),
    fetch(`${base}&daily=precipitation_probability_max,sunrise,sunset&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=36`).then(r => r.json()),
  ]);
  const d = multi.daily;
  return d.time.map((date, i) => {
    const per = MODELS.map(([id, name]) => ({ name, tmax: d[`temperature_2m_max_${id}`]?.[i], tmin: d[`temperature_2m_min_${id}`]?.[i], rain: d[`precipitation_sum_${id}`]?.[i], code: d[`weather_code_${id}`]?.[i], wind: d[`wind_speed_10m_max_${id}`]?.[i] })).filter(x => x.tmax != null);
    const codes = per.map(x => x.code).filter(x => x != null);
    // Il cielo «di maggioranza» tra i modelli; a parità vince il più severo.
    const tally = {}; codes.forEach(c => { const k = WMO(c); tally[k] = (tally[k] || 0) + 1; });
    const kind = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || "coperto";
    const code = codes.find(c => WMO(c) === kind) ?? 3;
    const tmaxs = per.map(x => x.tmax);
    const spread = Math.max(...tmaxs) - Math.min(...tmaxs);
    const rainy = per.filter(x => (x.rain || 0) >= 1).length;
    return {
      date, kind, code, tmax: median(tmaxs), tmin: median(per.map(x => x.tmin)), rain: median(per.map(x => x.rain)), wind: median(per.map(x => x.wind)) || 0,
      prob: best.daily?.precipitation_probability_max?.[i], sunrise: best.daily?.sunrise?.[i], sunset: best.daily?.sunset?.[i],
      agree: spread <= 3 && (rainy === 0 || rainy === per.length) ? "d'accordo" : spread <= 6 ? "abbastanza d'accordo" : "in disaccordo", models: per,
    };
  }).concat([{ hourly: best.hourly }]);
}
EXTRA_VIEWS.meteo = {
  title: "Meteo", sub: "Quattro modelli a confronto, una frase onesta",
  view() {
    const extra = (() => { try { return JSON.parse(storage.get(WX_KEY)) || []; } catch { return []; } })();
    const places = [...new Set([trip().destination, ...departures().slice(0, 2).map(d => d.city), ...extra].filter(Boolean))];
    if (!places.length) places.push("Chiavenna");
    return `${places.map((p, i) => `<section class="card wx" data-wx="${esc(p)}"><div class="label">${i === 0 && trip().destination === p ? "A destinazione · " : ""}${esc(p)}</div><div class="wx-load">${ico("cloud", 22)}<span class="small faint">Chiedo a ECMWF, ICON, Météo-France e GFS…</span></div></section>`).join("")}
      <form class="card row" id="wx-add" style="gap:8px"><input name="q" placeholder="Aggiungi una città" style="flex:1"><button class="btn">${ico("plus", 16)}</button></form>
      <p class="tiny faint" style="text-align:center">Fonti: modelli ECMWF (centro europeo), ICON (servizio meteo tedesco), Météo-France e GFS (NOAA), tramite Open-Meteo. Le probabilità di pioggia sono del modello migliore per la zona.</p>`;
  },
  async mount() {
    $("#wx-add")?.addEventListener("submit", e => {
      e.preventDefault(); const q = new FormData(e.target).get("q").trim(); if (!q) return;
      let extra = []; try { extra = JSON.parse(storage.get(WX_KEY)) || []; } catch { /* vuoto */ }
      storage.set(WX_KEY, JSON.stringify([...new Set([...extra, q])].slice(-4))); render();
    });
    for (const card of $$("[data-wx]")) {
      const name = card.dataset.wx;
      try {
        const g = await geocode(name); if (!g) throw new Error("Località non trovata");
        const days = await forecast(g); const hourly = days.pop().hourly;
        if (!card.isConnected) continue;
        const [d0, d1] = days;
        const big = (d, label) => `<div class="wx-day">
          <div class="row" style="gap:14px"><div class="wx-ico">${ico(WICON(d.code), 34)}</div>
            <div class="grow"><div class="eyebrow">${label}</div><div class="wx-temp"><b>${Math.round(d.tmax)}°</b><span>${Math.round(d.tmin)}°</span></div>
            <div class="small muted">${d.kind}${d.prob != null ? ` · pioggia ${d.prob}%` : ""}${d.wind >= 25 ? ` · vento ${Math.round(d.wind)} km/h` : ""}</div></div></div>
          <p class="wx-wit">${witty(d, name)}</p>
          <div class="tiny faint">Modelli ${d.agree}: ${d.models.map(m => `${m.name} ${Math.round(m.tmax)}°`).join(" · ")}</div></div>`;
        // Prossime 24 ore: temperatura e pioggia ora per ora.
        const hrs = hourly.time.map((t, i) => ({ t, temp: hourly.temperature_2m[i], p: hourly.precipitation_probability[i], c: hourly.weather_code[i] })).filter((h, i) => i % 3 === 0).slice(0, 9);
        const lo = Math.min(...hrs.map(h => h.temp)), hi = Math.max(...hrs.map(h => h.temp));
        card.innerHTML = `<div class="label">${esc(g.name)}</div>${big(d0, "Oggi")}${big(d1, "Domani")}
          <div class="wx-hours">${hrs.map(h => `<div><span class="tiny faint">${h.t.slice(11, 13)}</span>${ico(WICON(h.c), 18)}<i style="height:${8 + 46 * (h.temp - lo) / Math.max(1, hi - lo)}px"></i><b>${Math.round(h.temp)}°</b><span class="tiny ${h.p >= 50 ? "neg" : "faint"}">${h.p ?? 0}%</span></div>`).join("")}</div>
          <div class="wx-week">${days.slice(2).map(d => `<div><span class="tiny faint">${fmtDate(d.date, { weekday: "short" })}</span>${ico(WICON(d.code), 18)}<b>${Math.round(d.tmax)}°</b><span class="tiny faint">${Math.round(d.tmin)}°</span></div>`).join("")}</div>`;
      } catch (e) { if (card.isConnected) card.querySelector(".wx-load").innerHTML = `<span class="small muted">Previsioni non disponibili ora (${esc(e.message)}).</span>`; }
    }
  },
};

// ───────────────────────── Mappa animata ─────────────────────────

let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; js.onload = res; js.onerror = rej; document.head.appendChild(js);
  });
  return leafletReady;
}
let mapObj = null, mapAnim = 0;
EXTRA_VIEWS.mappa = {
  title: "Mappa", sub: "Da dove partiamo, dove andiamo",
  view() {
    return `<div class="map-wrap"><div id="map"></div><div class="map-hint" id="map-hint">Carico la mappa…</div></div>
      <div id="map-legend"></div>`;
  },
  async mount() {
    cancelAnimationFrame(mapAnim);
    try { await loadLeaflet(); } catch { $("#map-hint").textContent = "Mappa non disponibile senza connessione."; return; }
    const el = $("#map"); if (!el) return;
    if (mapObj) { mapObj.remove(); mapObj = null; }
    const L = window.L;
    const map = mapObj = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([48, 11], 4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 18, attribution: "© OpenStreetMap · © CARTO" }).addTo(map);
    const hint = $("#map-hint"), legend = $("#map-legend");
    const t = trip(), pts = [], rows = [];
    const pin = (cls, html, size = 34) => L.divIcon({ className: "", html: `<div class="mk ${cls}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

    // Partenze: le facce di chi parte da ogni città.
    const deps = departures();
    const depGeo = [];
    for (const d of deps) {
      const g = await geocode(d.city); if (!g || !mapObj) continue;
      depGeo.push({ ...d, g }); pts.push([g.lat, g.lon]);
      L.marker([g.lat, g.lon], { icon: pin("dep", `<div class="mk-avs">${d.people.slice(0, 3).map(p => avatar(p, "sm")).join("")}</div><span>${esc(d.city)} · ${d.people.length}</span>`, 40) })
        .addTo(map).bindPopup(`<b>${esc(d.city)}</b><br>${d.people.map(p => esc(p.name)).join(", ")}`);
    }
    let dest = t.destination ? await geocode(t.destination) : null;
    if (!mapObj) return;
    if (dest) {
      pts.push([dest.lat, dest.lon]);
      L.marker([dest.lat, dest.lon], { icon: pin("dest", `${ico("star", 18)}<span>${esc(t.destination)}</span>`, 44) }).addTo(map).bindPopup(`<b>${esc(t.destination)}</b><br>La meta`);
      // Prenotazioni e programma con un indirizzo.
      for (const b of S.bookings.filter(b => b.address && b.status !== "annullato")) {
        const g = await geocode(b.address); if (!g || !mapObj || kmBetween(g, dest) > 80) continue;
        L.marker([g.lat, g.lon], { icon: pin("poi", ico(CATEGORIES[b.category]?.icon || "box", 16), 30) }).addTo(map).bindPopup(`<b>${esc(b.title)}</b><br>${esc(b.address)}${b.start_at ? `<br>${esc(fmtDate(b.start_at, { day: "numeric", month: "short" }))} ${esc(fmtTime(b.start_at))}` : ""}`);
      }
      for (const i of S.itinerary.filter(i => i.place)) {
        const g = await geocode(`${i.place}, ${t.destination}`); if (!g || !mapObj || kmBetween(g, dest) > 80) continue;
        L.marker([g.lat, g.lon], { icon: pin("poi it", ico("clock", 14), 26) }).addTo(map).bindPopup(`<b>${esc(i.title)}</b><br>${esc(i.place)}${i.day ? `<br>${esc(fmtDate(i.day, { weekday: "short", day: "numeric" }))} ${esc(i.time || "")}` : ""}`);
      }
      // Percorsi animati da ogni città di partenza.
      const movers = [];
      for (const d of depGeo) {
        const r = await drivingRoute(d.g, dest); if (!mapObj) return;
        L.polyline(r.coords, { color: "#e6d4ff", weight: 7, opacity: 0.18 }).addTo(map);
        const line = L.polyline(r.coords, { color: "#c9f3ee", weight: 3, opacity: 0.95, className: "route-dash" }).addTo(map);
        const car = L.marker(r.coords[0], { icon: pin("car", ico("car", 14), 26), interactive: false }).addTo(map);
        movers.push({ car, coords: r.coords, off: Math.random() });
        rows.push(`<div class="li"><div class="ib">${ico("car")}</div><div class="grow"><div class="t">${esc(d.city)} → ${esc(dest.name)}</div><div class="small muted">${Math.round(r.km)} km · ${r.real ? "" : "circa "}${fmtH(r.h)} · ${d.people.length} ${d.people.length === 1 ? "persona" : "persone"}</div></div>
          <a class="btn sm" target="_blank" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(d.city)}&destination=${encodeURIComponent(t.destination)}&travelmode=driving">Naviga</a></div>`);
        void line;
      }
      // Le auto scorrono lungo il percorso (un solo requestAnimationFrame per tutte).
      const step = now => {
        for (const m of movers) {
          const p = ((now / 9000) + m.off) % 1, n = m.coords.length - 1, f = p * n, i = Math.floor(f), k = f - i;
          const a = m.coords[i], b = m.coords[Math.min(n, i + 1)];
          m.car.setLatLng([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
        }
        if (mapObj) mapAnim = requestAnimationFrame(step);
      };
      if (movers.length) mapAnim = requestAnimationFrame(step);
    } else {
      // Nessuna meta ancora: le destinazioni in gara nel sondaggio, grandi quanto i voti.
      const poll = S.polls.find(p => /dove|destinaz|meta|città/i.test(p.question) && p.status === "open");
      if (poll) {
        const { opts } = pollData(poll);
        for (const o of opts) {
          const g = await geocode(o.label.split(/[(-–]/)[0]); if (!g || !mapObj) continue;
          pts.push([g.lat, g.lon]);
          const size = 30 + 8 * o.voters.length;
          L.marker([g.lat, g.lon], { icon: pin("cand", `<b>${o.voters.length}</b><span>${esc(g.name)}</span>`, size) }).addTo(map).bindPopup(`<b>${esc(o.label)}</b><br>${o.voters.length} voti${o.price ? ` · ~${eur(o.price)}` : ""}`);
          rows.push(`<div class="li"><div class="ib">${ico("vote")}</div><div class="grow"><div class="t">${esc(o.label)}</div><div class="small muted">${o.voters.length} voti${depGeo[0] ? ` · ${Math.round(kmBetween(depGeo[0].g, g) * 1.3)} km circa da ${esc(depGeo[0].city)}` : ""}</div></div></div>`);
        }
      }
    }
    if (!mapObj) return;
    hint.textContent = dest ? "Tocca i segnaposto per i dettagli" : "Le mete in gara nel sondaggio: più voti, più grande il cerchio";
    setTimeout(() => hint.classList.add("off"), 3500);
    legend.innerHTML = rows.length ? `<section class="card">${rows.join("")}</section>` : `<section class="card"><div class="small muted">Aggiungi la tua città di partenza nel profilo: qui comparirà il viaggio di tutti.</div></section>`;
    // L'animazione d'ingresso: dall'Europa fino ai punti del viaggio.
    if (pts.length) setTimeout(() => mapObj && mapObj.flyToBounds(pts, { padding: [50, 50], maxZoom: dest && pts.length === 1 ? 11 : 9, duration: 2.2 }), 400);
  },
};

// ───────────────────────── Home: scorciatoie e promemoria ─────────────────────────

window.homeExtras = function () {
  const miss = missingQ().length, score = profileScore();
  const vibeLeft = isAdmin() && nextVibe();
  return `
  <div class="quick">
    <button data-act="tab" data-tab="mappa"><span class="qi">${ico("globe", 22)}</span>Mappa</button>
    <button data-act="tab" data-tab="meteo"><span class="qi">${ico("sun", 22)}</span>Meteo</button>
    <button data-act="tab" data-tab="passaggi"><span class="qi">${ico("car", 22)}</span>Passaggi</button>
    <button data-act="tab" data-tab="giochi"><span class="qi">${ico("game", 22)}</span>Giochi</button>
  </div>
  ${miss ? `<section class="card tap pf-nudge" data-act="tab" data-tab="profilo">
    <div class="row" style="gap:14px"><div class="pf-ring sm" style="--p:${score}"><b>${score}%</b></div>
      <div class="grow"><div class="t">Ti mancano ${miss} ${miss === 1 ? "cosa" : "cose"} nel profilo</div><div class="small muted">Una domanda alla volta, meno di due minuti. Così prenotazioni, auto e conti vanno lisci.</div></div><span class="chev">${ico("chev", 18)}</span></div>
  </section>` : ""}
  ${vibeLeft ? `<section class="card tap" data-act="tab" data-tab="vibe">
    <div class="row">${ico("users", 20)}<div class="grow"><div class="t">Raccontami il gruppo</div><div class="small muted">Domande veloci su ognuno, solo per te: ${AI()} capisce chi è chi.</div></div><span class="chev">${ico("chev", 18)}</span></div>
  </section>` : ""}`;
};

Object.assign(ACTIONS, {
  "pf-skip": el => { storage.set(PDONE + "skip-" + el.dataset.k + "-" + today(), "1"); render(); },
  "vibe-skip": el => { let s = []; try { s = JSON.parse(storage.get("capodanno-vibe-skip")) || []; } catch { /* vuoto */ } s.push(el.dataset.key); storage.set("capodanno-vibe-skip", JSON.stringify(s)); render(); },
  async "ride-drive"() { try { await api.update("members", { id: ME }, { car_seats: 3, ride_with: null }); toast("Grande: tre posti liberi, cambiali quando vuoi"); await reload(); } catch (e) { toast(e.message, "alert"); } },
  async "ride-seats"(el) { const n = Math.max(0, (me().car_seats || 0) + Number(el.dataset.d)); try { await api.update("members", { id: ME }, { car_seats: n }); await reload(); } catch (e) { toast(e.message, "alert"); } },
  async "ride-join"(el) { try { await api.update("members", { id: ME }, { ride_with: el.dataset.id, car_seats: 0 }); toast(`Sali con ${mname(el.dataset.id)}`); await reload(); } catch (e) { toast(e.message, "alert"); } },
  async "ride-leave"() { try { await api.update("members", { id: ME }, { ride_with: null }); await reload(); } catch (e) { toast(e.message, "alert"); } },
});
