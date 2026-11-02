/* Capodanno - Home e dintorni: tab Giochi, foto obbligatoria, domanda del giorno, indovinello, a che punto siamo,
   notizie dal mondo, novità personali, foto in chat e sezione Foto, notifiche che si chiudono da sole. */
"use strict";

Object.assign(ICONS, {
  camera: '<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10.5H4Z"/><circle cx="12" cy="13.5" r="3.6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  news: '<rect x="3.5" y="4.5" width="14" height="15" rx="2.5"/><path d="M17.5 8.5h3v8.5a2.5 2.5 0 0 1-2.5 2.5M7 8.5h7M7 12h7M7 15.5h4"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  pick: '<path d="M4 20 14 10M12.5 4.5c3.5-.8 6.3.5 7 3-2.4-.7-4.6-.4-6.6.8M9.5 7.5c.8-3.5-.5-6.3-3-7 .7 2.4.4 4.6-.8 6.6"/><path d="m11 6 7 7"/>',
});
const hashStr = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;

// ───────────────────────── Foto profilo obbligatoria ─────────────────────────

window.gateView = () => {
  const m = me();
  if (!m || m.avatar_url) return null;
  return `<div class="gate">
    <div class="gate-ring"><span>${esc((m.name || "?").slice(0, 1).toUpperCase())}</span></div>
    <div class="eyebrow" style="margin-top:26px">Un'ultima cosa</div>
    <div class="serif gate-t">Prima, la tua faccia</div>
    <p class="muted">Nel gruppo ci si riconosce: in chat, nei giochi, sulla mappa. Metti una foto e si entra.</p>
    <label class="btn pearl block tap gate-btn">${ico("camera", 19)}Scegli o scatta una foto<input type="file" accept="image/*" hidden data-gate-photo></label>
    <div class="tiny faint" style="margin-top:12px">La puoi cambiare quando vuoi dal tuo profilo.</div>
  </div>`;
};
window.gateMount = () => {
  $("[data-gate-photo]")?.addEventListener("change", async e => {
    const f = e.target.files?.[0]; if (!f) return;
    const btn = e.target.closest("label"); btn.classList.add("loading");
    try { const url = await api.uploadAvatar(await squareImage(f, 320)); await api.update("members", { id: ME }, { avatar_url: url }); toast("Benvenuto dentro"); await reload(); }
    catch (err) { btn.classList.remove("loading"); toast(err.message, "alert"); }
  });
};

// ───────────────────────── Notifiche: via dalla tendina quando apri l'app ─────────────────────────

function clearNotifications() {
  navigator.serviceWorker?.ready.then(reg => reg.getNotifications?.()).then(list => (list || []).forEach(n => n.close())).catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") clearNotifications(); });
clearNotifications();

// ───────────────────────── Domanda del giorno (diversa per ognuno) ─────────────────────────

const DAILY_Q = [
  { q: "Dove vorresti essere allo scoccare della mezzanotte?", o: ["In piazza col concerto", "In un locale", "Su una terrazza", "In casa tra noi"] },
  { q: "Cenone: cosa ti farebbe felice?", o: ["Pesce", "Carne", "Pizza e via", "Menu tipico del posto"] },
  { q: "Quanto vorresti spendere per la serata del 31, tutto compreso?", o: ["Fino a 50 €", "50–100 €", "100–200 €", "Quello che serve"] },
  { q: "Il 1° gennaio, tu come sei messo?", o: ["Sveglio per pranzo", "Vivo solo dopo le 15", "Passeggiata e brunch", "Non contate su di me"] },
  { q: "Che musica vuoi la notte del 31?", o: ["Commerciale", "Techno", "Reggaeton", "Anni 2000", "Italiana a squarciagola"] },
  { q: "Ti va di vestirci a tema la sera del 31?", o: ["Sì, elegantissimi", "Sì, qualcosa di assurdo", "Basta un dettaglio comune", "No grazie"] },
  { q: "Ora ideale per partire il primo giorno?", o: ["All'alba", "In mattinata", "Dopo pranzo", "La sera prima"] },
  { q: "Colazione in vacanza?", o: ["Dolce", "Salata", "Solo caffè", "Brunch alle 12"] },
  { q: "Quante ore dormirai la notte di Capodanno?", o: ["Zero", "Tre, da eroe", "Sei, sono un adulto", "Me ne vado a mezzanotte e mezza"] },
  { q: "Una cosa che vuoi assolutamente fare in questa vacanza?", o: [] },
  { q: "Camere: come le vedi?", o: ["Coppie insieme, gli altri mischiati", "Tutti in una casa grande", "Per me va bene tutto", "Mi serve dormire tranquillo"] },
  { q: "Cosa porti che non può mancare?", o: ["Casse bluetooth", "Giochi da tavolo", "Un liquore di casa", "La mia ansia organizzativa"] },
  { q: "Visite e musei: quanto spazio gli diamo?", o: ["Una mattina basta", "Mezza giornata", "Il meno possibile", "Ci tengo davvero"] },
  { q: "Come preferisci viaggiare?", o: ["Auto, con playlist", "Treno, comodo", "Aereo low cost", "Come costa meno"] },
  { q: "Brindisi di mezzanotte con?", o: ["Prosecco", "Champagne", "Spritz a oltranza", "Analcolico, guido io"] },
  { q: "Fuochi d'artificio: ci tieni a vederli bene?", o: ["Moltissimo", "Se capita", "Preferisco il locale", "Mi spaventano i botti"] },
  { q: "Che tipo di locale ti fa divertire davvero?", o: ["Discoteca grande", "Bar affollato", "Club piccolo e figo", "Festa privata"] },
  { q: "Quanto camminare ti va di fare al giorno?", o: ["Poco, sono in vacanza", "Il giusto", "Tanto, voglio vedere tutto"] },
  { q: "Un ristorante tipico per una sera?", o: ["Sì, assolutamente", "Una volta basta", "Meglio street food", "Decidete voi"] },
  { q: "Ti serve qualcosa di particolare per stare bene?", o: [] },
  { q: "Foto di gruppo ufficiale: quando?", o: ["Allo scoccare della mezzanotte", "Al cenone", "Il primo giorno, ancora presentabili", "Mai, odio le foto"] },
  { q: "Sei favorevole a un piccolo fondo cassa comune?", o: ["Sì, comodissimo", "Solo per le cose di gruppo", "Preferisco Splitwise", "Indifferente"] },
  { q: "Un gioco da fare tutti insieme la sera?", o: ["Carte", "Lupus/Mafia", "Quiz", "Karaoke", "Niente, si esce"] },
  { q: "Cosa ti stressa di più dell'organizzare viaggi in gruppo?", o: ["Decidere", "I soldi", "Gli orari", "Niente, ci pensa Zampone"] },
];
function myDailyQ() {
  const done = new Set((S.daily_answers || []).filter(a => a.member_id === ME).map(a => a.question));
  const pool = DAILY_Q.filter(x => !done.has(x.q));
  if (!pool.length) return null;
  return pool[hashStr(today() + ME) % pool.length];
}
function dailyCard() {
  const answered = (S.daily_answers || []).find(a => a.member_id === ME && a.day === today());
  if (answered) {
    const others = (S.daily_answers || []).filter(a => a.question === answered.question && a.member_id !== ME).slice(-3);
    return `<section class="card dq done"><div class="eyebrow">La tua domanda di oggi</div>
      <div class="dq-q serif">${esc(answered.question)}</div><div class="dq-a">${ico("check", 15)}${esc(answered.answer)}</div>
      ${others.length ? `<div class="tiny faint" style="margin-top:10px">${others.map(o => `${esc(mname(o.member_id))}: «${esc(o.answer)}»`).join(" · ")}</div>` : `<div class="tiny faint" style="margin-top:10px">Domani te ne arriva un'altra. ${AI()} prende nota.</div>`}</section>`;
  }
  const d = myDailyQ(); if (!d) return "";
  return `<section class="card dq"><div class="eyebrow">Una domanda solo per te · oggi</div>
    <div class="dq-q serif">${esc(d.q)}</div>
    <form id="dq-form" data-q="${esc(d.q)}">
      ${d.o.length ? `<div class="pf-chips">${d.o.map(o => `<button type="button" class="dq-opt" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>` : ""}
      <div class="row" style="gap:8px;margin-top:10px"><input name="free" placeholder="${d.o.length ? "Oppure scrivi tu…" : "Scrivi pure…"}" style="flex:1"><button class="btn">${ico("send", 16)}</button></div>
    </form></section>`;
}
async function saveDaily(q, answer) {
  if (!answer) return;
  try { await api.insert("daily_answers", { member_id: ME, day: today(), question: q, answer: answer.slice(0, 300) }); navigator.vibrate?.(10); await reload(); }
  catch (e) { toast(/daily_answers/.test(e.message) ? "Serve aggiornamento-4.sql su Supabase" : e.message, "alert"); }
}
function mountDaily() {
  const f = $("#dq-form"); if (!f) return;
  f.addEventListener("click", e => { const b = e.target.closest(".dq-opt"); if (b) saveDaily(f.dataset.q, b.dataset.v); });
  f.addEventListener("submit", e => { e.preventDefault(); saveDaily(f.dataset.q, new FormData(f).get("free").trim()); });
}

// ───────────────────────── A che punto siamo ─────────────────────────

function readiness() {
  const t = trip();
  const conf = cat => S.bookings.some(b => b.category === cat && ["prenotato", "pagato"].includes(b.status));
  const complete = S.members.filter(m => m.phone && m.diet && m.departure_city).length;
  const drivers = S.members.filter(m => m.car_seats > 0), seats = drivers.reduce((a, d) => a + d.car_seats, 0);
  const travelOk = conf("viaggio") || (drivers.length && seats >= S.members.length - drivers.length);
  const unpaid = S.payment_requests.some(r => requestStatus(r).unpaid.length);
  return [
    { k: "Meta", ok: !!t.destination, go: "vota" },
    { k: "Date", ok: !!t.start_date, go: "vota" },
    { k: "Dormire", ok: conf("alloggio"), go: "piano" },
    { k: "Viaggio", ok: !!travelOk, go: "passaggi" },
    { k: "Cenone", ok: conf("cenone"), go: "piano" },
    { k: "Serata", ok: conf("serata"), go: "piano" },
    { k: "Profili", ok: complete === S.members.length && S.members.length > 1, go: "profilo" },
    { k: "Quote", ok: !unpaid && S.payment_requests.length > 0, go: "spese" },
  ];
}
function readinessCard() {
  const r = readiness(), done = r.filter(x => x.ok).length, pct = Math.round(100 * done / r.length);
  const next = r.find(x => !x.ok);
  const line = done === r.length ? "Tutto pronto. Resta solo da divertirsi." : done >= 5 ? "Ci siamo quasi: gli ultimi dettagli e si parte." : done >= 2 ? "Si procede bene. Un passo alla volta, niente stress." : "Si parte da zero, ed è il bello: ci pensiamo insieme.";
  return `<section class="card ready">
    <div class="row between"><div class="eyebrow">A che punto siamo</div><b class="num ready-pct">${pct}%</b></div>
    <div class="ready-bar"><i style="width:${pct}%"></i></div>
    <div class="ready-steps">${r.map(x => `<button class="${x.ok ? "ok" : ""}" data-act="tab" data-tab="${x.go}">${x.ok ? ico("check", 13) : ""}${x.k}</button>`).join("")}</div>
    <div class="small muted" style="margin-top:12px">${line}${next ? ` Prossimo passo: <b>${next.k.toLowerCase()}</b>.` : ""}</div>
    ${next ? `<button class="link small" style="margin-top:8px" data-act="ask" data-q="A che punto siamo con l'organizzazione? Dimmi in poche righe cosa manca, in che ordine farlo e chi deve muoversi.">${ico("spark", 15)}Chiedi a ${AI()} cosa manca</button>` : ""}
  </section>`;
}

// ───────────────────────── Stato: ultima cosa fatta e prossima da fare ─────────────────────────
// Di base si calcola da sondaggi, prenotazioni e cose da fare; l'organizzatore può scriverlo a mano.
const NEXT_STEP = { Meta: "Scegliere la meta", Date: "Fissare le date", Dormire: "Prenotare dove dormire", Viaggio: "Organizzare il viaggio", Cenone: "Prenotare il cenone", Serata: "Scegliere la serata di Capodanno", Profili: "Completare i profili", Quote: "Pagare le quote" };
function statoAuto() {
  const done = [
    ...S.polls.filter(p => p.status === "closed").map(p => { const d = pollData(p); const w = d.max ? d.opts.find(o => o.voters.length === d.max) : null; return { at: p.created_at, t: w ? `Deciso: ${p.question} → ${w.label || ""}`.replace(/ → $/, "") : `Chiuso il sondaggio «${p.question}»`, go: "vota" }; }),
    ...S.bookings.filter(b => ["prenotato", "pagato"].includes(b.status)).map(b => ({ at: b.created_at, t: `${b.status === "pagato" ? "Pagato" : "Prenotato"}: ${b.title}`, go: "piano" })),
    ...S.checklist.filter(c => c.done).map(c => ({ at: c.created_at, t: `Fatto: ${c.text}`, go: "piano" })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const vote = openPollsToVote()[0];
  const miss = readiness().find(x => !x.ok);
  const task = S.checklist.find(c => !c.done);
  const next = vote ? { t: `Votare: ${vote.question}`, go: "vota" } : miss ? { t: NEXT_STEP[miss.k] || miss.k, go: miss.go } : task ? { t: task.text, go: "piano" } : { t: "Niente: si parte e si festeggia", go: "home" };
  return { last: done[0] || null, next };
}
window.statoCard = function () {
  const man = S.trip?.[0]?.flags?.stato;
  const auto = statoAuto();
  const last = man?.last ? { t: man.last } : auto.last;
  const next = man?.next ? { t: man.next } : auto.next;
  const by = man?.at ? `${esc(mname(man.by) || "organizzatore")} · ${esc(fmtDate(man.at, { day: "numeric", month: "short" }))}` : "automatico";
  const r = readiness(), pct = Math.round(100 * r.filter(x => x.ok).length / r.length);
  const go = x => (x?.go ? `data-act="tab" data-tab="${x.go}"` : `data-act="noop"`);
  return `<section class="stato">
    <span class="st-pct" title="A che punto siamo"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="3.5"/><circle cx="18" cy="18" r="15" fill="none" stroke="#2ee59d" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${(94.2 * pct / 100).toFixed(1)} 94.2" transform="rotate(-90 18 18)"/></svg><b>${pct}%</b></span>
    <div class="st-body">
      <div class="st-top"><span class="st-lab">Stato</span><span class="st-by">${by}</span>${isAdmin() ? `<button class="st-edit" data-act="stato-edit" aria-label="Modifica lo stato">${ico("edit", 13)}</button>` : ""}</div>
      <button class="st-l done" ${go(last)}>${ico("check", 13)}<span class="ellipsis">${last ? esc(last.t) : "Ancora niente di fatto"}</span></button>
      <button class="st-l next" ${go(next)}>${ico("arrow", 13)}<b class="ellipsis">${esc(next.t)}</b>${next.go && next.go !== "home" ? ico("chev", 15) : ""}</button>
    </div></section>`;
};
Object.assign(ACTIONS, {
  noop: () => {},
  "stato-edit"() {
    if (!isAdmin()) return;
    const man = S.trip?.[0]?.flags?.stato || {}, auto = statoAuto();
    openSheet(`<h2>Stato</h2><p class="small muted">Lascia vuoto un campo per farlo calcolare all'app.</p>
      <form id="stato-f"><div class="field"><label>Ultima cosa fatta</label><input name="last" value="${esc(man.last || "")}" placeholder="${esc(auto.last?.t || "Es. Prenotato l'appartamento")}"></div>
      <div class="field"><label>Prossima da fare</label><input name="next" value="${esc(man.next || "")}" placeholder="${esc(auto.next.t)}"></div>
      <div class="actions"><button type="button" class="btn" data-act="stato-auto">Torna automatico</button><button class="btn primary">Salva</button></div></form>`);
    $("#stato-f").addEventListener("submit", e => { e.preventDefault(); const fd = new FormData(e.target); statoSave({ last: fd.get("last").trim(), next: fd.get("next").trim() }); });
  },
  "stato-auto": () => statoSave(null),
});
async function statoSave(v) {
  const flags = { ...(S.trip?.[0]?.flags || {}) };
  if (v && (v.last || v.next)) flags.stato = { ...v, at: new Date().toISOString(), by: ME }; else delete flags.stato;
  try { await api.update("trip", { id: 1 }, { flags }); }
  catch (e) { return toast("Serve l'aggiornamento 9 del database", "alert"); }
  if (S.trip?.[0]) S.trip[0].flags = flags;
  closeSheet(); toast("Stato aggiornato", "check"); render();
}

// ───────────────────────── Notizie ─────────────────────────

function newsCard() {
  const items = (S.news?.[0]?.items || []).slice(0, 8);
  if (!items.length) return "";
  const when = S.news[0].updated_at;
  return `<section class="news">
    <div class="row between" style="padding:0 4px"><div class="label" style="margin:0">Il mondo, in breve</div><span class="tiny faint">${esc(fmtTime(when))} · ${items.reduce((a, n) => a + (n.fonti?.length || 0), 0)} fonti</span></div>
    <div class="news-row">${items.map((n, i) => `<button class="news-card" data-act="news-open" data-i="${i}">
      ${n.immagine ? `<div class="news-img" style="background-image:url('${esc(n.immagine)}')"></div>` : `<div class="news-img none">${ico("news", 26)}</div>`}
      <div class="news-body"><div class="tiny news-cat">${esc(n.categoria || "Mondo")}</div><div class="news-t">${esc(n.titolo)}</div>
      <div class="tiny faint">${(n.fonti || []).slice(0, 3).map(f => esc(f.nome)).join(" · ")}</div></div></button>`).join("")}</div>
  </section>`;
}
function sheetNews(i) {
  const n = S.news?.[0]?.items?.[i]; if (!n) return;
  openSheet(`${n.immagine ? `<div class="news-hero" style="background-image:url('${esc(n.immagine)}')"></div>` : ""}
    <div class="tiny news-cat">${esc(n.categoria || "Mondo")}</div>
    <h2 style="margin-top:6px">${esc(n.titolo)}</h2>
    <p style="line-height:1.55">${esc(n.sintesi || "")}</p>
    <div class="label">Lo raccontano</div>
    <div class="stack" style="gap:6px">${(n.fonti || []).map(f => `<a class="li tap" href="${esc(f.url)}" target="_blank" rel="noopener"><div class="ib">${ico("news")}</div><div class="grow"><div class="t">${esc(f.nome)}</div><div class="tiny faint ellipsis">${esc(f.titolo || "")}</div></div><span class="chev">${ico("chev", 18)}</span></a>`).join("")}</div>
    <p class="tiny faint" style="margin-top:14px">Sintesi neutrale scritta da ${AI()} confrontando le testate qui sopra. Per i dettagli vale sempre l'articolo originale.</p>`);
}

// ───────────────────────── Novità (una volta, diverse per ognuno) ─────────────────────────

const NOVITA_KEY = "capodanno-novita-4-";
function novitaSlides() {
  const m = me(), name = esc(m.name);
  const missing = typeof missingQ === "function" ? missingQ().length : 0;
  const q = myDailyQ();
  const rival = S.members.filter(x => x.id !== ME)[hashStr(ME) % Math.max(1, S.members.length - 1)];
  const slides = [
    { i: "globe", t: "Il viaggio, in 3D", d: m.departure_city ? `La tua partenza da <b>${esc(m.departure_city)}</b> è già sul globo, con il percorso fino alla meta. Puoi anche condividere dove sei, quando vuoi tu.` : "Un globo da ruotare con le dita: partenze, meta, percorsi. E se vuoi, la posizione di tutti durante il viaggio." },
    { i: "game", t: "Giochi, ora con la loro scheda", d: rival ? `Scacchi, scopa d'assi in quattro, Miniera e GeoScatto 1 contro 1. ${esc(rival.name)} non aspetta altro.` : "Scacchi, scopa d'assi in quattro, Miniera e GeoScatto 1 contro 1." },
    { i: "image", t: "Le foto, tutte in un posto", d: "Mandale in chat o caricale nella sezione Foto: il rullino del viaggio lo fa il gruppo." },
    { i: "key", t: "Un indovinello al giorno", d: "Uno solo, una sola risposta. Poi vedi chi ci ha preso e chi no." },
    q ? { i: "spark", t: "Una domanda tutta tua", d: `Ogni giorno, in Home, una domanda diversa per ognuno. Oggi la tua è: <i>«${esc(q.q)}»</i>` } : null,
    { i: "news", t: "Il mondo, in breve", d: "Le notizie serie del giorno, messe in fila confrontando i grandi giornali italiani e internazionali." },
    missing ? { i: "user", t: "Ti mancano " + missing + " cose", d: "Una domanda alla volta, due minuti. Così prenotare costa zero fatica a tutti." } : null,
  ].filter(Boolean);
  // Ognuno le vede in un ordine diverso, tranne la prima.
  const rest = slides.slice(1).sort((a, b) => hashStr(ME + a.t) - hashStr(ME + b.t));
  return [{ i: "star", t: `${name}, guarda qui`, d: "Mentre dormivi l'app è cambiata parecchio. Stessa sostanza: organizzare Capodanno senza stress. Più modi per divertirsi." }, ...rest.slice(0, 4), { i: "check", t: "Tutto sotto controllo", d: `${AI()} legge ogni sezione e vi tiene sulla strada giusta. Voi pensate a divertirvi.`, end: true }];
}
function maybeNovita() {
  if (!ME || !me()?.avatar_url || storage.get(NOVITA_KEY + ME) || $("#sheet").classList.contains("open") || !$("#game").hidden) return;
  storage.set(NOVITA_KEY + ME, "1");
  const slides = novitaSlides();
  let i = 0;
  const el = document.createElement("div"); el.className = "novita"; document.body.appendChild(el);
  const show = () => {
    const s = slides[i];
    el.innerHTML = `<div class="nv-bars">${slides.map((_, k) => `<i class="${k < i ? "done" : k === i ? "on" : ""}"></i>`).join("")}</div>
      <button class="nv-x" aria-label="Chiudi">${ico("close", 20)}</button>
      <div class="nv-body" key="${i}"><div class="nv-ico">${ico(s.i, 34)}</div><div class="serif nv-t">${s.t}</div><p class="nv-d">${s.d}</p></div>
      <button class="btn pearl block nv-next">${s.end ? "Entra" : "Avanti"}</button>`;
  };
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 300); };
  el.addEventListener("click", e => {
    if (e.target.closest(".nv-x")) return close();
    if (e.target.closest(".nv-next") || e.clientX > innerWidth / 3) { if (++i >= slides.length) return close(); show(); }
    else if (i > 0) { i--; show(); }
  });
  show();
}

// ───────────────────────── Foto: chat e sezione dedicata ─────────────────────────

async function compressPhoto(file, max = 1600) {
  const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.84));
  return { blob, w: c.width, h: c.height };
}
const photoUrl = path => (path.startsWith("blob:") || path.startsWith("data:") ? path : api.sb ? api.sb.storage.from("foto").getPublicUrl(path).data.publicUrl : path);
async function uploadPhoto(file) {
  const { blob, w, h } = await compressPhoto(file);
  let path;
  if (CLOUD) { path = `${uuid()}.jpg`; api.ok(await api.sb.storage.from("foto").upload(path, blob, { contentType: "image/jpeg" })); }
  else path = URL.createObjectURL(blob);
  return { path, w, h };
}
window.photoBubble = m => {
  const p = m.meta.photo, cap = m.content && m.content !== "Foto" ? `<div class="photo-cap">${linkify(m.content)}</div>` : "";
  return `<button class="chat-photo" data-act="photo-open" data-path="${esc(p.path)}" style="aspect-ratio:${p.w || 4}/${p.h || 3}"><img src="${esc(photoUrl(p.path))}" loading="lazy" alt=""></button>${cap}`;
};
async function sendChatPhoto(file) {
  if (typeof mutedNotice === "function" && mutedNotice()) return;
  const caption = $("#composer-input").value.trim();
  toast("Carico la foto…", "image");
  try {
    const p = await uploadPhoto(file);
    const reply = UI.replyTo; UI.replyTo = null; renderReplyBar();
    const row = await api.insert("messages", { member_id: ME, role: "user", channel: "gruppo", content: caption || "Foto", reply_to: reply || null, meta: { photo: p } });
    $("#composer-input").value = ""; syncComposerButtons?.();
    api.insert("photos", { member_id: ME, path: p.path, caption: caption || null, w: p.w, h: p.h, message_id: row.id }).catch(() => {});
    api.notify("chat", row.id);
    await reload();
  } catch (e) { toast("Foto non inviata: " + (/foto/.test(e.message) ? "serve aggiornamento-4.sql" : e.message), "alert"); }
}
function lightbox(list, start) {
  let i = start;
  const el = document.createElement("div"); el.className = "lightbox";
  document.body.appendChild(el);
  const show = () => {
    const p = list[i];
    el.innerHTML = `<button class="lb-x" aria-label="Chiudi">${ico("close", 20)}</button>
      <img src="${esc(photoUrl(p.path))}" alt="">
      <div class="lb-info">${p.member_id ? `${avatar(member(p.member_id), "sm")}<span><b>${esc(mname(p.member_id))}</b>${p.caption ? ` · ${esc(p.caption)}` : ""}<br><span class="tiny faint">${p.created_at ? esc(fmtDate(p.created_at, { day: "numeric", month: "long" })) + " " + esc(fmtTime(p.created_at)) : ""}</span></span>` : ""}
        <a class="btn sm" href="${esc(photoUrl(p.path))}" download target="_blank">Salva</a>
        ${p.id && (p.member_id === ME || isAdmin()) ? `<button class="btn sm danger" data-del="${p.id}">Elimina</button>` : ""}</div>
      ${list.length > 1 ? `<div class="lb-n tiny">${i + 1} / ${list.length}</div>` : ""}`;
  };
  let x0 = null;
  el.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) { i = (i + (dx < 0 ? 1 : -1) + list.length) % list.length; show(); } });
  el.addEventListener("click", async e => {
    if (e.target.closest(".lb-x") || e.target === el) return el.remove();
    const d = e.target.closest("[data-del]");
    if (d && confirm("Eliminare la foto per tutti?")) { try { await api.remove("photos", { id: d.dataset.del }); if (CLOUD) api.sb.storage.from("foto").remove([list[i].path]); el.remove(); await reload(); } catch (err) { toast(err.message, "alert"); } }
  });
  show();
}
EXTRA_VIEWS.foto = {
  title: "Foto", sub: "Il rullino del viaggio, fatto da tutti",
  view() {
    const list = (S.photos || []).slice().sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    return `<label class="card tap foto-up">${ico("camera", 24)}<div class="grow"><div class="t">Carica foto</div><div class="small muted">Anche più di una: le vedono tutti, in alta qualità.</div></div><input type="file" accept="image/*" multiple hidden data-foto-up></label>
      ${list.length ? `<div class="foto-grid">${list.map((p, i) => `<button data-act="foto-open" data-i="${i}" style="background-image:url('${esc(photoUrl(p.path))}')"></button>`).join("")}</div>`
        : emptyState("image", "Ancora nessuna foto", "La prima la scatta chi arriva per primo. O chi si sveglia per primo il 1° gennaio, cioè nessuno.")}`;
  },
  mount() {
    $("[data-foto-up]")?.addEventListener("change", async e => {
      const files = [...e.target.files]; if (!files.length) return;
      toast(`Carico ${files.length} ${files.length === 1 ? "foto" : "foto"}…`, "image");
      let ok = 0;
      for (const f of files) { try { const p = await uploadPhoto(f); await api.insert("photos", { member_id: ME, path: p.path, w: p.w, h: p.h }); ok++; } catch (err) { toast(err.message, "alert"); } }
      if (ok) { toast(`${ok} ${ok === 1 ? "foto caricata" : "foto caricate"}`, "image"); await reload(); }
    });
  },
};

// ───────────────────────── Tab Giochi ─────────────────────────

const GL = () => {
  const done = g => playedToday(g);
  const rk = g => { const r = myRank(g); return r ? `${r.pos}° su ${r.of}` : ""; };
  const enOk = (S.scores || []).find(s => s.game === "enigma" && s.member_id === ME && s.day === today() && s.meta?.rid === hashStr(riddleOfDay().q));
  return [
    { sec: "In primo piano", feat: true, rows: [
      { id: "onorevoli", ico: "trophy", t: "Onorevoli", s: `${POLS.length} personaggi, mosse speciali e ultim'ora in aula. Sfida un amico`, hot: true },
    ] },
    { sec: "Ogni giorno", rows: [
      { id: "indovinello", ico: "key", t: "Indovinello del giorno", s: enOk ? (enOk.meta?.ok ? "Indovinato" : "Sbagliato, domani va meglio") : "Una parola sola: o la sai o no", hot: !enOk },
      { id: "sudoku", ico: "grid", t: "Sudoku del giorno", s: done("sudoku9") && done("killer") ? "Normale e Killer fatti" : "Normale e Killer, uguali per tutti", hot: !done("sudoku9") },
      { id: "trivia", ico: "chart", t: "Ordine di grandezza", s: done("trivia") ? `Fatta · ${rk("trivia")}` : "Sei domande, risposte con un numero", hot: !done("trivia") },
      { id: "ruota", ico: "star", t: "Ruota della fortuna", s: typeof canSpin === "function" && canSpin() ? "Il giro di oggi ti aspetta" : "Girata, torna domani", hot: typeof canSpin === "function" && canSpin() },
    ] },
    { sec: "Uno contro uno", rows: [
      { id: "poker", ico: "card", t: "Texas Hold'em", s: "Poker vero, contro i bot o al tavolo con gli amici" },
      { id: "scacchi", ico: "chess", t: "Scacchi", s: "Dal vivo con l'orologio, Elo del gruppo" },
      { id: "miniera", ico: "pick", t: "Miniera", s: "Scava prima dell'altro: diamanti, oro, TNT" },
      { id: "geo", ico: "pin", t: "GeoScatto", s: "Una foto, un mappamondo: dov'è?" },
      { id: "fune", ico: "swap", t: "Tiro alla fune", s: "Chi tocca più veloce vince" },
    ] },
    { sec: "In quattro", rows: [{ id: "scopa", ico: "users", t: "Scopa d'assi", s: "Due contro due, l'asso piglia tutto" }] },
    { sec: "Da soli", rows: [
      { id: "fuochi", ico: "burst", t: "Fuochi", s: "Trenta secondi di razzi" },
      { id: "archivio", ico: "key", t: "Archivio enigmi", s: "Per chi non si arrende" },
    ] },
  ];
};
const sqOff = () => !!S.trip?.[0]?.flags?.sq_off;
window.sqOff = sqOff;
const tzOff = () => !!S.trip?.[0]?.flags?.tease_off;
Object.assign(ACTIONS, {
  "sq-soon": () => toast("Chiavenna Express è in arrivo", "clock"),
  "tz-soon": () => toast("Nuovo gioco in arrivo: ancora top secret", "lock"),
  async "tz-toggle"() {
    if (!isAdmin()) return;
    const flags = { ...(S.trip?.[0]?.flags || {}), tease_off: !tzOff() };
    try { await api.update("trip", { id: 1 }, { flags }); }
    catch (e) { return toast("Serve l'aggiornamento 9 del database", "alert"); }
    if (S.trip?.[0]) S.trip[0].flags = flags;
    toast(flags.tease_off ? "Gioco misterioso nascosto" : "Gioco misterioso visibile come «In arrivo»", "check");
    render();
  },
  async "sq-toggle"() {
    if (!isAdmin()) return;
    const flags = { ...(S.trip?.[0]?.flags || {}), sq_off: !sqOff() };
    try { await api.update("trip", { id: 1 }, { flags }); }
    catch (e) { return toast("Serve l'aggiornamento 9 del database", "alert"); }
    if (S.trip?.[0]) S.trip[0].flags = flags;
    toast(flags.sq_off ? "Chiavenna Express nascosto: gli altri vedono «In arrivo»" : "Chiavenna Express attivo per tutti", "check");
    render();
  },
});
window.viewGiochi = function () {
  const off = sqOff(), adm = isAdmin();
  const grp = g => g.feat ? `<div class="label gl-sec">${g.sec}</div><button class="card gl-feat" data-act="gl-open" data-id="onorevoli">
      <div class="glf-faces">${["meloni", "berlusconi", "stalin", "che", "trump", "pertini"].map(id => POLS.find(p => p.id === id)).filter(Boolean).map(p => polFace(p)).join("")}</div>
      <div class="glf-t">Onorevoli</div><div class="small muted">${g.rows[0].s}</div><span class="glf-go">Gioca ${ico("chev", 16)}</span></button>` : `<div class="label gl-sec">${g.sec}</div><section class="card gl-list">${g.rows.map(r => `
    <button class="gl-row" data-act="gl-open" data-id="${r.id}"><span class="gl-ico">${ico(r.ico, 20)}</span>
      <span class="grow"><b>${r.t}</b><span class="small muted">${r.s}</span></span>${r.hot ? `<i class="gl-dot"></i>` : ""}<span class="chev">${ico("chev", 18)}</span></button>`).join("")}</section>`;
  const gl = GL();
  return `${gl.filter(g => g.feat).map(grp).join("")}
    ${adm ? `<div class="gl-admin"><span class="grow"><b>Chiavenna Express</b><span class="tiny faint">${off ? "Nascosto: gli altri vedono «In arrivo»" : "Attivo per tutti"}</span></span>
      <button class="gl-sw${off ? "" : " on"}" data-act="sq-toggle" role="switch" aria-checked="${!off}" aria-label="Attiva Chiavenna Express"><i></i></button></div>` : ""}
    <button class="card gl-new${off ? " gl-soon" : ""}" data-act="${off && !adm ? "sq-soon" : "sq-play"}">${off ? `<div class="gls-veil"><span class="gls-ico">${ico("clock", 22)}</span><b>In arrivo</b><span>${adm ? "Solo tu puoi provarlo" : "Il nuovo gioco a squadre si sblocca presto"}</span></div>` : ""}
      <div class="gln-badge">${off ? "PRESTO" : "NEW!"}</div>
      <div class="gln-art"><svg viewBox="0 0 220 70" aria-hidden="true"><path d="M8 52 Q60 20 110 40 T212 26" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="4 6"/>${[8, 60, 110, 160, 212].map((x, i) => `<circle cx="${x}" cy="${[52, 31, 40, 33, 26][i]}" r="4" fill="#eafff6"/>`).join("")}<g transform="translate(70 18)"><rect x="0" y="6" width="34" height="16" rx="5" fill="#eafff6"/><rect x="32" y="10" width="9" height="12" rx="2" fill="#eafff6"/><rect x="5" y="9" width="7" height="6" rx="1" fill="#0b4a35"/><rect x="16" y="9" width="7" height="6" rx="1" fill="#0b4a35"/><circle cx="9" cy="24" r="3.5" fill="#0b4a35"/><circle cx="26" cy="24" r="3.5" fill="#0b4a35"/></g></svg></div>
      <div class="gln-t">Chiavenna Express</div>
      <div class="gln-s">Il gioco a squadre per la serata: 2 contro 2 o 3 contro 3, disegni, parole, stime di valle e messaggi veri del gruppo. Un telefono solo, da passarsi.</div>
      <span class="gln-go">Gioca ${ico("chev", 16)}</span></button>
    ${adm ? `<div class="gl-admin gl-admin-y"><span class="grow"><b>Gioco misterioso</b><span class="tiny faint">${tzOff() ? "Nascosto a tutti" : "Visibile a tutti come «In arrivo»"}</span></span>
      <button class="gl-sw${tzOff() ? "" : " on"}" data-act="tz-toggle" role="switch" aria-checked="${!tzOff()}" aria-label="Mostra il gioco misterioso"><i></i></button></div>` : ""}
    ${tzOff() ? "" : `<button class="card gl-new gl-tease gl-soon" data-act="tz-soon">
      <div class="gls-veil"><span class="gls-ico">${ico("lock", 22)}</span><b>In arrivo</b><span>Un altro gioco per la notte di Capodanno. Per ora è top secret.</span></div>
      <div class="gln-badge">PRESTO</div>
      <div class="gln-art"><svg viewBox="0 0 220 70" aria-hidden="true">${[20, 60, 100, 140, 180].map((x, i) => `<circle cx="${x}" cy="${[40, 22, 46, 18, 36][i]}" r="${[10, 6, 12, 7, 9][i]}" fill="#3a2a00" opacity=".5"/>`).join("")}</svg></div>
      <div class="gln-t">Notte dei Botti</div>
      <div class="gln-s">Squadre, bicchieri, mezzanotte e una sfida che dura fino all'alba. Più di questo non si può dire.</div>
      <span class="gln-go">Gioca ${ico("chev", 16)}</span></button>`}
    ${gl.filter(g => !g.feat).map(grp).join("")}
    <button class="btn block" style="margin:6px 0 18px" data-act="gl-ranks">${ico("trophy", 17)}Classifiche di sempre</button>`;
};
function glOpen(id) {
  const html = {
    scacchi: () => window.chessCard?.(), scopa: () => window.scopaCard?.(), ruota: () => typeof wheelCard === "function" && wheelCard(),
    miniera: () => window.mineCard?.(), geo: () => window.geoCard?.(), onorevoli: () => window.onoCard?.(), poker: () => window.pokerCard?.(),
  }[id];
  if (html) return openSheet(html().replace('class="card', 'class="card in-sheet'));
  if (id === "indovinello") return playEnigma();
  if (id === "archivio") return ACTIONS["enigma-next"]();
  if (id === "trivia") return playedToday("trivia") ? playTrivia(true) : playTrivia(false);
  if (id === "fuochi") return playFuochi();
  if (id === "fune") return openSheet(`<h2>Tiro alla fune</h2><div id="duel-online">${duelOnlineList()}</div><button class="btn block" style="margin-top:12px" data-act="duel-cpu">${ico("device", 17)}Allenati contro il telefono</button>`);
  if (id === "sudoku") return openSheet(`<h2>Sudoku del giorno</h2><p class="small muted" style="margin-top:-6px">Stessa griglia per tutti; conta il primo tentativo, ogni errore vale 15 secondi.</p>
    <div class="grid2"><button class="tile" data-act="play-sudoku" data-mode="sudoku9"><b>Normale</b><div class="tiny faint">${playedToday("sudoku9") ? "Fatto oggi" : "Da fare"}</div></button><button class="tile" data-act="play-sudoku" data-mode="killer"><b>Killer</b><div class="tiny faint">${playedToday("killer") ? "Fatto oggi" : "Da fare"}</div></button></div>`);
}

// ───────────────────────── Home ─────────────────────────

window.home2Top = () => `${readinessCard()}${dailyCard()}`;
window.home2Bottom = () => newsCard();
// Notizie: se sono vecchie di più di quattro ore (o mancano), chiede un aggiornamento al server.
let newsAsked = false;
function refreshNews() {
  if (!CLOUD || newsAsked || !api.sb || !ME) return;
  const at = S.news?.[0]?.updated_at;
  if (at && Date.now() - new Date(at) < 4 * 3600e3 && S.news[0].items?.length) return;
  newsAsked = true;
  api.sb.functions.invoke("notizie", { body: {} }).then(() => reload()).catch(() => {});
}
window.home2Mount = () => { mountDaily(); refreshNews(); setTimeout(maybeNovita, 700); };

Object.assign(ACTIONS, {
  "gl-open": el => glOpen(el.dataset.id),
  "gl-ranks": () => openSheet(`<h2>Classifiche di sempre</h2>${[window.chessRankCard?.(), window.scopaRankCard?.(), window.mineRankCard?.(), window.geoRankCard?.(), window.onoRankCard?.(), window.games2Ranks?.(), rankCard("sudoku9"), rankCard("killer"), rankCard("fune"), rankCard("fuochi")].filter(Boolean).join("")}`),
  "news-open": el => sheetNews(Number(el.dataset.i)),
  "photo-open": el => { const list = (S.messages || []).filter(m => m.meta?.photo).map(m => ({ ...m.meta.photo, member_id: m.member_id, caption: m.content !== "Foto" ? m.content : "", created_at: m.created_at })); lightbox(list, Math.max(0, list.findIndex(p => p.path === el.dataset.path))); },
  "foto-open": el => { const list = (S.photos || []).slice().sort((a, b) => (b.created_at > a.created_at ? 1 : -1)); lightbox(list, Number(el.dataset.i)); },
  "photo-pick": () => $("#composer-photo-input")?.click(),
});
$("#composer-photo-input")?.addEventListener("change", e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (f.type.startsWith("video/")) sendChatVideo(f); else sendChatPhoto(f); });

// ───────────────────────── Chi è online ─────────────────────────
// Presenza in tempo reale (Supabase Realtime): quando qualcuno apre l'app compare un piccolo avviso in alto.
const PRESENT = new Set(), PINFO = new Map(), LASTSEEN = new Map();
// Dove si trova ognuno (solo la sezione, mai i contenuti). Lo Psicologo non viene mai indicato: risulta «Chat».
const WHERE = { home: "Home", vota: "Sondaggi", piano: "Piano", spese: "Splitwise", chat: "Chat", gruppo: "Il gruppo", giochi: "Giochi", mappa: "Mappa", meteo: "Meteo", passaggi: "Passaggi", foto: "Foto", profilo: "Profilo", vibe: "Vibe", attivita: "Attività" };
function whereNow() {
  if (document.body.classList.contains("gaming")) { const g = document.querySelector("#game .eyebrow")?.textContent?.trim(); return `In partita${g ? ` · ${g.split("·")[0].trim()}` : ""}`; }
  const base = WHERE[UI.tab] || "App";
  if (UI.tab === "chat") return UI.chatSeg === "gruppo" ? "Chat · Gruppo" : UI.chatSeg === "ai" ? `Chat · ${AI()}` : "Chat";
  return base;
}
let lastTrack = "", trackT = 0;
function presenceTrack(force) {
  if (!presenceCh || document.hidden) return;
  const w = whereNow(); if (!force && w === lastTrack) return;
  lastTrack = w; clearTimeout(trackT);
  trackT = setTimeout(() => { try { presenceCh.track({ at: Date.now(), where: w }); } catch { /* rete */ } }, 400);
}
window.presenceTrack = presenceTrack;
let presenceCh = null, presenceSince = 0;
const POP_SEEN = new Map();
window.onlineStrip = () => {
  const on = S.members.filter(m => PRESENT.has(m.id) && m.id !== ME);
  return on.length ? `<span class="h3-dot"></span>${on.slice(0, 4).map(m => avatar(m, "sm")).join("")}<span>${on.length === 1 ? `${esc(m1(on[0]))} è online` : `${on.length} online`}</span>` : "";
};
const m1 = m => (m.name || "").split(" ")[0];
function paintOnline() { const el = $("#h3-online"); if (el) el.innerHTML = window.onlineStrip(); }
function presencePop(id) {
  const m = member(id); if (!m || id === ME) return;
  if (Date.now() - presenceSince < 5000) return; // all'avvio non si annuncia chi c'era già
  if (Date.now() - (POP_SEEN.get(id) || 0) < 20 * 60000) return; // al massimo un avviso ogni 20 minuti a persona
  POP_SEEN.set(id, Date.now());
  if (!$("#game").hidden) return; // durante una partita niente distrazioni
  document.querySelector(".presence-pop")?.remove();
  const el = document.createElement("button");
  el.className = "presence-pop"; el.dataset.act = "chat-go"; el.dataset.v = "gruppo";
  el.innerHTML = `${avatar(m, "sm")}<span><b>${esc(m1(m))}</b> è online</span><i></i>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 3600);
}
function startPresence() {
  if (!CLOUD || presenceCh || !api.sb || !ME) return;
  try {
    presenceCh = api.channel("presenza", { config: { presence: { key: ME } } });
    if (typeof presenceCh?.on !== "function" || typeof presenceCh.track !== "function") { presenceCh = null; return; }
    const sync = () => { const st = presenceCh.presenceState?.() || {}; PRESENT.clear(); PINFO.clear(); Object.entries(st).forEach(([k, v]) => { PRESENT.add(k); const last = [...(v || [])].sort((a, b) => (b.at || 0) - (a.at || 0))[0]; if (last) PINFO.set(k, last); }); paintOnline(); window.onPresence?.(); };
    presenceCh.on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, ({ key }) => { const was = PRESENT.has(key); PRESENT.add(key); paintOnline(); if (!was) presencePop(key); })
      .on("presence", { event: "leave" }, ({ key }) => { PRESENT.delete(key); LASTSEEN.set(key, Date.now()); paintOnline(); window.onPresence?.(); })
      .subscribe(status => { if (status === "SUBSCRIBED") { presenceSince = Date.now(); if (!document.hidden) presenceTrack(true); } });
    document.addEventListener("visibilitychange", () => {
      try { if (document.hidden) presenceCh?.untrack(); else { presenceSince = Math.max(presenceSince, Date.now() - 4000); presenceTrack(true); } } catch { /* rete */ }
    });
  } catch (e) { console.warn(e); presenceCh = null; }
}
(function waitPresence() {
  if (typeof ME !== "undefined" && ME && (!CLOUD || api.sb)) { startPresence(); return; }
  setTimeout(waitPresence, 700);
})();

// ───────────────────────── Attività dal vivo (solo organizzatore) ─────────────────────────
// Chi è nell'app e in quale sezione, più il filo di quello che succede nel gruppo. Mai i contenuti dello Psicologo
// né le conversazioni private con Zampone: solo azioni già visibili a tutto il gruppo.
const agoShort = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 45 ? "adesso" : s < 3600 ? `${Math.round(s / 60)} min fa` : s < 86400 ? `${Math.round(s / 3600)} h fa` : `${Math.round(s / 86400)} g fa`; };
const GNAME = { sudoku9: "Sudoku", killer: "Sudoku Killer", fune: "Tiro alla fune", fuochi: "Fuochi", enigma: "Indovinello", trivia: "Ordine di grandezza", onorevoli: "Onorevoli", geo: "GeoScatto" };
function activityFeed() {
  const ev = [];
  const add = (at, who, icon, txt) => at && ev.push({ t: new Date(at).getTime(), who, icon, txt });
  for (const m of S.messages.filter(m => m.channel === "gruppo" && m.role !== "assistant").slice(-60)) add(m.created_at, m.member_id, "chat", m.meta?.photo ? "ha mandato una foto" : m.meta?.video ? "ha mandato un video" : m.meta?.nudge ? "ha mandato un trillo" : m.meta?.voice ? "ha mandato un vocale" : `ha scritto: «${String(m.content).slice(0, 70)}${m.content.length > 70 ? "…" : ""}»`);
  for (const v of S.votes) { const o = S.poll_options.find(x => x.id === v.option_id), p = S.polls.find(x => x.id === v.poll_id); add(v.created_at, v.member_id, "vote", `ha votato «${o?.label || "?"}»${p ? ` in «${p.question}»` : ""}`); }
  for (const p of S.polls) add(p.created_at, p.created_by, "vote", `ha creato il sondaggio «${p.question}»`);
  for (const s of S.scores || []) add(s.created_at, s.member_id, "trophy", `ha giocato a ${GNAME[s.game] || s.game}${s.score ? ` · ${s.score} punti` : ""}`);
  for (const e of S.expenses) add(e.created_at, e.created_by || Object.keys(e.payers || {})[0], "wallet", e.kind === "payment" ? `ha registrato un pagamento di ${eur(e.amount)}` : `ha aggiunto la spesa «${e.title || "spesa"}» (${eur(e.amount)})`);
  for (const p of S.photos || []) add(p.created_at, p.member_id, "image", "ha caricato una foto");
  for (const d of S.daily_answers || []) add(d.created_at, d.member_id, "spark", "ha risposto alla domanda del giorno");
  for (const w of S.wheel_spins || []) add(w.created_at, w.member_id, "star", "ha girato la ruota");
  for (const b of S.bookings) add(b.created_at, b.created_by, "calendar", `ha aggiunto «${b.title}» al piano`);
  for (const g of (typeof DU !== "undefined" ? DU.games : [])) add(g.created_at, g.created_by, "swap", `ha sfidato ${mname(g.players.find(x => x !== g.created_by))} a ${DKIND[g.kind] || g.kind}`);
  return ev.filter(e => member(e.who)).sort((a, b) => b.t - a.t).slice(0, 60);
}
EXTRA_VIEWS.attivita = {
  title: "Attività", sub: "Dal vivo, solo per l'organizzatore", back: "gruppo",
  view() {
    if (!isAdmin()) return `<section class="card"><div class="small muted">Questa sezione è solo per l'organizzatore.</div></section>`;
    return `<div id="act-live">${activityLive()}</div>
      <div class="label" style="margin:18px 4px 8px">Cosa succede nel gruppo</div>
      <section class="card act-feed" id="act-feed">${activityFeedHtml()}</section>
      <p class="tiny faint" style="margin:10px 6px 24px">Vedi la sezione aperta e le azioni già visibili al gruppo. I messaggi allo Psicologo e a ${AI()} restano privati.</p>`;
  },
  mount() {
    window.onPresence = () => { const el = $("#act-live"); if (el) el.innerHTML = activityLive(); };
    clearInterval(window.__actT); window.__actT = setInterval(() => { if (UI.tab !== "attivita") return clearInterval(window.__actT); window.onPresence(); }, 15000);
  },
};
function activityLive() {
  const on = S.members.filter(m => PRESENT.has(m.id)).map(m => ({ m, i: PINFO.get(m.id) || {} })).sort((a, b) => (b.i.at || 0) - (a.i.at || 0));
  const off = S.members.filter(m => !PRESENT.has(m.id));
  const lastAct = new Map(); for (const e of activityFeed()) if (!lastAct.has(e.who)) lastAct.set(e.who, e.t);
  return `<section class="card act-live"><div class="row between" style="margin-bottom:10px"><div class="label" style="margin:0">Nell'app adesso</div><span class="pill plain num"><span class="h3-dot"></span>${on.length}</span></div>
    ${on.length ? on.map(({ m, i }) => `<div class="li act-on">${avatar(m, "sm")}<div class="grow"><div class="t">${esc(m.id === ME ? "Tu" : m.name)}</div><div class="small muted">${esc(i.where || "Nell'app")}${i.at ? ` · da ${agoShort(i.at).replace(" fa", "")}` : ""}</div></div><span class="act-dot"></span></div>`).join("") : `<div class="small muted">Nessuno in questo momento.</div>`}
  </section>
  <section class="card"><div class="label">Non collegati</div>
    ${off.map(m => { const t = Math.max(LASTSEEN.get(m.id) || 0, lastAct.get(m.id) || 0); return `<div class="li">${avatar(m, "sm")}<div class="grow t">${esc(m.name)}</div><span class="tiny faint">${t ? `visto ${agoShort(t)}` : "nessuna attività"}</span></div>`; }).join("") || `<div class="small muted">Sono tutti dentro.</div>`}
  </section>`;
}
function activityFeedHtml() {
  const ev = activityFeed();
  return ev.length ? ev.map(e => `<div class="li act-ev">${avatar(member(e.who), "sm")}<div class="grow"><div class="small"><b>${esc(mname(e.who))}</b> ${esc(e.txt)}</div><div class="tiny faint">${agoShort(e.t)}</div></div><span class="act-ico">${ico(e.icon, 15)}</span></div>`).join("") : `<div class="small muted">Ancora niente.</div>`;
}

// ───────────────────────── Prima le cose importanti ─────────────────────────
// All'apertura (e quando arriva qualcosa di nuovo) un pannello mette in fila quello che blocca il gruppo:
// sondaggi da votare (bloccanti), quote da pagare, messaggi nuovi di Zampone. «Più tardi» lo rimanda di un'ora.
const PRIO_KEY = "capodanno-priorita-";
function priorityItems() {
  const out = [];
  const polls = typeof openPollsToVote === "function" ? openPollsToVote() : [];
  for (const p of polls.slice(0, 4)) {
    const d = pollData(p), tot = Math.max(1, going().length), done = d.voterIds.size;
    out.push({ k: "poll", block: true, ico: "vote", t: p.question, s: "È bloccante: vota!", act: `data-prio="vota"`, extra: { done, tot, avs: [...d.voterIds].slice(0, 5).map(id => member(id)).filter(Boolean) } });
  }
  const req = typeof myOpenRequests === "function" ? myOpenRequests() : [];
  for (const r of req.slice(0, 2)) out.push({ k: "pay", ico: "card", t: `${r.title}: ${eur(r.amount)}`, s: `Da versare a ${mname(r.pay_to)}`, act: `data-prio="spese"` });
  const newMail = (S.emails || []).filter(e => e.direction === "in" && !(e.read_by || []).includes(ME));
  if (newMail.length) out.push({ k: "mail", ico: "mail", t: newMail.length === 1 ? `Email da ${newMail[0].from_name || newMail[0].from_addr}` : `${newMail.length} email nuove nella casella del gruppo`, s: newMail[0].subject || "", act: `data-prio="mail"` });
  const drafts = isAdmin() ? (S.emails || []).filter(e => e.direction === "draft") : [];
  if (drafts.length) out.push({ k: "draft", ico: "mail", t: drafts.length === 1 ? `Un'email aspetta la tua approvazione` : `${drafts.length} email aspettano la tua approvazione`, s: drafts[0].subject || "", act: `data-prio="mail"` });
  const seenAi = storage.get(SEEN_KEY + "-ai-" + ME) || "";
  const ai = msgs("assistente").filter(m => m.role === "assistant" && m.created_at > seenAi);
  if (ai.length) out.push({ k: "ai", ico: "spark", t: `${AI()} ha scritto ${ai.length === 1 ? "un messaggio nuovo" : `${ai.length} messaggi nuovi`}`, s: String(ai.at(-1).content).replace(/[*_#>`\[\]]/g, "").slice(0, 90), act: `data-prio="ai"` });
  return out;
}
function priorityPop(force) {
  if (!ME || !S.members?.length) return;
  const items = priorityItems(); if (!items.length) return;
  if (!$("#game").hidden || $("#sheet")?.classList.contains("open") || document.querySelector(".prio")) return;
  const sig = items.map(i => i.k + i.t).join("|");
  const last = JSON.parse(storage.get(PRIO_KEY + ME) || "{}");
  if (!force && last.sig === sig && Date.now() - (last.at || 0) < 3600e3) return; // stesse cose, già viste da meno di un'ora
  if (!force && Date.now() - (last.snooze || 0) < 3600e3 && last.sig === sig) return;
  storage.set(PRIO_KEY + ME, JSON.stringify({ sig, at: Date.now(), snooze: last.snooze || 0 }));
  const block = items.filter(i => i.block).length;
  const el = document.createElement("div"); el.className = "prio";
  const hour = new Date().getHours(), hello = hour < 13 ? "Buongiorno" : hour < 18 ? "Ciao" : "Buonasera";
  const row = i => {
    const prog = i.extra ? `<div class="prio-prog">${i.extra.avs.length ? `<div class="prio-avs">${i.extra.avs.map(m => avatar(m, "sm")).join("")}</div>` : ""}<span>${i.extra.done ? `${i.extra.done} su ${i.extra.tot} hanno già votato` : "Puoi essere il primo a votare"}</span></div><div class="prio-bar"><i style="width:${Math.round(i.extra.done / i.extra.tot * 100)}%"></i></div>` : "";
    return `<button class="prio-row ${i.block ? "block" : ""}" ${i.act}>
      <span class="prio-ico">${ico(i.ico, 18)}</span>
      <span class="grow">${i.block ? `<span class="prio-tag"><i></i>Il gruppo aspetta te</span>` : ""}<b>${esc(i.t)}</b>${i.block ? "" : `<small>${esc(i.s)}</small>`}${prog}</span>
      ${i.block ? `<em>Vota</em>` : `<span class="prio-chev">${ico("chev", 16)}</span>`}</button>`;
  };
  el.innerHTML = `<div class="prio-card">
    <div class="prio-hero">
      <div class="prio-orb">${ico(block ? "vote" : "spark", 26)}</div>
      <div class="prio-kicker">${hello}, ${esc(firstName(me()))}</div>
      <div class="prio-title">${block ? (block === 1 ? "Manca solo il tuo voto" : `Mancano ${block} tuoi voti`) : "Un paio di cose per te"}</div>
      <div class="prio-sub">${block ? "Finché non voti il gruppo non può decidere. Ci vuole un attimo." : "Due minuti e sei in pari con il gruppo."}</div>
    </div>
    <div class="prio-list">${items.map(row).join("")}</div>
    <div class="prio-foot"><button class="btn ${block ? "pearl" : "primary"} block" data-prio="${block ? "vota" : items[0].act.match(/"(\w+)"/)[1]}">${block ? "Vota adesso" : "Vai"}</button>
    <button class="prio-later" data-prio="later">Più tardi</button></div></div>`;
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-prio]"); if (!b) return;
    const go_ = b.dataset.prio;
    el.classList.remove("show"); setTimeout(() => el.remove(), 300);
    if (go_ === "later") { const l = JSON.parse(storage.get(PRIO_KEY + ME) || "{}"); l.snooze = Date.now(); storage.set(PRIO_KEY + ME, JSON.stringify(l)); return; }
    if (go_ === "vota") { UI.tab = "vota"; render(); scrollTo(0, 0); }
    else if (go_ === "spese") { UI.tab = "spese"; render(); scrollTo(0, 0); }
    else if (go_ === "ai") { UI.chatSeg = "ai"; go("chat"); }
    else if (go_ === "mail") { UI.tab = "mail"; render(); scrollTo(0, 0); }
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  navigator.vibrate?.(block ? [30, 50, 30] : 15);
}
window.votePop = force => priorityPop(force);
window.priorityPop = priorityPop;
(function waitPrio() {
  if (typeof ME !== "undefined" && ME && S.polls && (!CLOUD || api.sb)) { setTimeout(() => priorityPop(false), 2500); return; }
  setTimeout(waitPrio, 800);
})();
document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(() => priorityPop(false), 1500); });

// ───────────────────────── Video in chat ─────────────────────────
// Si caricano così come sono (fino a 50 MB) nella cartella «video»; l'anteprima è un fotogramma salvato tra le foto.
const VIDEO_MAX = 50 * 1024 * 1024;
const videoUrl = path => (path.startsWith("blob:") ? path : api.sb ? api.sb.storage.from("video").getPublicUrl(path).data.publicUrl : path);
async function videoInfo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(res, 6000); });
  try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); await new Promise(r => { v.onseeked = r; setTimeout(r, 2500); }); } catch { /* primo fotogramma */ }
  const w = v.videoWidth || 720, h = v.videoHeight || 1280, k = Math.min(1, 720 / Math.max(w, h));
  let poster = null;
  try { const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); poster = await new Promise(r => c.toBlob(r, "image/jpeg", 0.8)); } catch { poster = null; }
  const info = { w, h, dur: isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : 0, poster };
  URL.revokeObjectURL(url);
  return info;
}
async function sendChatVideo(file) {
  if (typeof mutedNotice === "function" && mutedNotice()) return;
  if (file.size > VIDEO_MAX) return toast(`Video troppo pesante (${Math.round(file.size / 1048576)} MB): il massimo è 50 MB, prova a tagliarlo`, "alert");
  const caption = $("#composer-input").value.trim();
  toast("Carico il video…", "image");
  try {
    const info = await videoInfo(file);
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
    let path, poster = null;
    if (CLOUD) {
      path = `${uuid()}.${ext}`;
      api.ok(await api.sb.storage.from("video").upload(path, file, { contentType: file.type || "video/mp4" }));
      if (info.poster) { poster = `${uuid()}.jpg`; try { api.ok(await api.sb.storage.from("foto").upload(poster, info.poster, { contentType: "image/jpeg" })); } catch { poster = null; } }
    } else { path = URL.createObjectURL(file); poster = info.poster ? URL.createObjectURL(info.poster) : null; }
    const reply = UI.replyTo; UI.replyTo = null; renderReplyBar();
    const row = await api.insert("messages", { member_id: ME, role: "user", channel: "gruppo", content: caption || "Video", reply_to: reply || null, meta: { video: { path, poster, w: info.w, h: info.h, dur: info.dur, mime: file.type } } });
    $("#composer-input").value = ""; syncComposerButtons?.();
    api.notify("chat", row.id);
    await reload();
  } catch (e) { toast("Video non inviato: " + (/bucket|not found|video/i.test(e.message) ? "serve aggiornamento-6.sql su Supabase" : e.message), "alert"); }
}
window.videoBubble = m => {
  const v = m.meta.video, cap = m.content && m.content !== "Video" ? `<div class="photo-cap">${linkify(m.content)}</div>` : "";
  const ratio = v.w && v.h ? `${v.w}/${v.h}` : "9/16";
  return `<div class="chat-video" style="aspect-ratio:${ratio}" data-stop><video src="${esc(videoUrl(v.path))}#t=0.1" ${v.poster ? `poster="${esc(photoUrl(v.poster))}"` : ""} controls playsinline preload="metadata"></video>${v.dur ? `<span class="cv-dur">${fmtDur(v.dur)}</span>` : ""}</div>${cap}`;
};

// ───────────────────────── Trilli (come su MSN) ─────────────────────────
// Un trillo fa tremare l'app di chi lo riceve, con suono e vibrazione. Uno ogni 20 secondi, a una persona o a tutti.
let nudgeAC = null, lastNudge = 0;
const unlockNudge = () => { try { nudgeAC ||= new (window.AudioContext || window.webkitAudioContext)(); nudgeAC.resume?.(); } catch { /* niente audio */ } };
document.addEventListener("pointerdown", unlockNudge, { passive: true });
function nudgeSound() {
  // Un «dlin-dlon» morbido: tre note di campanella che salgono, con un tremolio leggero, niente ronzii.
  try {
    unlockNudge(); const ac = nudgeAC; if (!ac) return;
    const t0 = ac.currentTime + 0.03, out = ac.createGain(); out.gain.value = 0.42;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200; lp.connect(ac.destination); out.connect(lp);
    const note = (f, at, dur, vol) => {
      for (const [mult, v] of [[1, 1], [2, 0.18], [3.01, 0.06]]) {
        const o = ac.createOscillator(), g = ac.createGain(), vib = ac.createOscillator(), vg = ac.createGain();
        o.type = "sine"; o.frequency.value = f * mult;
        vib.frequency.value = 5.5; vg.gain.value = f * mult * 0.004; vib.connect(vg); vg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol * v, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g); g.connect(out); o.start(t0 + at); vib.start(t0 + at); o.stop(t0 + at + dur + 0.05); vib.stop(t0 + at + dur + 0.05);
      }
    };
    note(659.3, 0, 0.55, 0.32); note(830.6, 0.11, 0.55, 0.3); note(987.8, 0.22, 0.9, 0.34);
  } catch { /* niente audio */ }
}
function nudgeShake() {
  const el = $("#game:not([hidden])") || $("#app") || document.body;
  el.classList.remove("nudge-shake"); void el.offsetWidth; el.classList.add("nudge-shake");
  setTimeout(() => el.classList.remove("nudge-shake"), 900);
  navigator.vibrate?.([90, 40, 90, 40, 160]);
  nudgeSound();
}
window.onNudge = m => {
  const n = m.meta?.nudge; if (!n || m.member_id === ME) return;
  if (n.to && n.to !== ME) return;
  if (Date.now() - new Date(m.created_at).getTime() > 90000) return;
  nudgeShake();
  toast(`${mname(m.member_id)} ti ha mandato un trillo!`, "bell");
};
window.nudgeLine = m => {
  const to = m.meta.nudge.to, who = m.member_id === ME ? "Hai" : `${esc(mname(m.member_id))} ha`;
  return `<div class="nudge-line" data-mid="${m.id}"><span>${ico("bell", 14)}</span>${who} mandato un trillo ${to ? `a <b>${esc(to === ME ? "te" : mname(to))}</b>` : "a <b>tutti</b>"} · ${fmtTime(m.created_at)}</div>`;
};
async function sendNudge(to) {
  closeSheet();
  if (typeof mutedNotice === "function" && mutedNotice()) return;
  if (Date.now() - lastNudge < 20000) return toast("Un trillo ogni 20 secondi, non esagerare");
  lastNudge = Date.now();
  nudgeShake();
  try {
    const name = to ? firstName(member(to)) : "";
    const row = await api.insert("messages", { member_id: ME, role: "user", channel: "gruppo", content: to ? `Trillo per @${name}!` : "Trillo per tutti!", meta: { nudge: { to: to || null } } });
    api.notify("chat", row.id);
    await reload();
  } catch (e) { toast("Trillo non inviato: " + e.message, "alert"); }
}
Object.assign(ACTIONS, {
  "nudge-pick": () => openSheet(`<h2>Manda un trillo</h2><p class="small muted" style="margin:-6px 0 14px">Fa tremare l'app di chi lo riceve, con suono e vibrazione. Come su MSN.</p>
    <button class="btn pearl block" data-act="nudge-send" data-id="">${ico("users", 17)}A tutti</button>
    <div class="stack" style="gap:6px;margin-top:12px">${S.members.filter(m => m.id !== ME).map(m => `<button class="li tap nudge-row" data-act="nudge-send" data-id="${m.id}">${avatar(m, "sm")}<span class="grow t" style="text-align:left">${esc(m.name)}</span>${ico("bell", 16)}</button>`).join("")}</div>`),
  "nudge-send": el => sendNudge(el.dataset.id || null),
});
