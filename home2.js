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
  const enOk = (S.scores || []).find(s => s.game === "enigma" && s.member_id === ME && s.day === today());
  return [
    { sec: "Ogni giorno", rows: [
      { id: "indovinello", ico: "key", t: "Indovinello del giorno", s: enOk ? (enOk.meta?.ok ? "Indovinato" : "Sbagliato, domani va meglio") : "Una risposta sola: o la sai o no", hot: !enOk },
      { id: "sudoku", ico: "grid", t: "Sudoku del giorno", s: done("sudoku9") && done("killer") ? "Normale e Killer fatti" : "Normale e Killer, uguali per tutti", hot: !done("sudoku9") },
      { id: "trivia", ico: "chart", t: "Ordine di grandezza", s: done("trivia") ? `Fatta · ${rk("trivia")}` : "Sei domande, risposte con un numero", hot: !done("trivia") },
      { id: "ruota", ico: "star", t: "Ruota della fortuna", s: typeof canSpin === "function" && canSpin() ? "Il giro di oggi ti aspetta" : "Girata, torna domani", hot: typeof canSpin === "function" && canSpin() },
    ] },
    { sec: "Uno contro uno", rows: [
      { id: "scacchi", ico: "chess", t: "Scacchi", s: "Dal vivo con l'orologio, Elo del gruppo" },
      { id: "miniera", ico: "pick", t: "Miniera", s: "Scava prima dell'altro: diamanti, oro, TNT" },
      { id: "geo", ico: "pin", t: "GeoScatto", s: "Una foto, un mappamondo: dov'è?" },
      { id: "fune", ico: "swap", t: "Tiro alla fune", s: "Chi tocca più veloce vince" },
    ] },
    { sec: "In quattro", rows: [{ id: "scopa", ico: "users", t: "Scopa d'assi", s: "Due contro due, l'asso piglia tutto" }] },
    { sec: "Da soli", rows: [
      { id: "onorevoli", ico: "trophy", t: "Onorevoli", s: "Politici a duello con le loro frasi celebri" },
      { id: "fuochi", ico: "burst", t: "Fuochi", s: "Trenta secondi di razzi" },
      { id: "archivio", ico: "key", t: "Archivio enigmi", s: "Per chi non si arrende" },
    ] },
  ];
};
window.viewGiochi = function () {
  return `${GL().map(g => `<div class="label gl-sec">${g.sec}</div><section class="card gl-list">${g.rows.map(r => `
    <button class="gl-row" data-act="gl-open" data-id="${r.id}"><span class="gl-ico">${ico(r.ico, 20)}</span>
      <span class="grow"><b>${r.t}</b><span class="small muted">${r.s}</span></span>${r.hot ? `<i class="gl-dot"></i>` : ""}<span class="chev">${ico("chev", 18)}</span></button>`).join("")}</section>`).join("")}
    <button class="btn block" style="margin:6px 0 18px" data-act="gl-ranks">${ico("trophy", 17)}Classifiche di sempre</button>`;
};
function glOpen(id) {
  const html = {
    scacchi: () => window.chessCard?.(), scopa: () => window.scopaCard?.(), ruota: () => typeof wheelCard === "function" && wheelCard(),
    miniera: () => window.mineCard?.(), geo: () => window.geoCard?.(),
  }[id];
  if (html) return openSheet(html().replace('class="card', 'class="card in-sheet'));
  if (id === "indovinello") return playEnigma();
  if (id === "archivio") return ACTIONS["enigma-next"]();
  if (id === "trivia") return playedToday("trivia") ? playTrivia(true) : playTrivia(false);
  if (id === "onorevoli") return playOnorevoli();
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
  if (!CLOUD || newsAsked) return;
  const at = S.news?.[0]?.updated_at;
  if (at && Date.now() - new Date(at) < 4 * 3600e3 && S.news[0].items?.length) return;
  newsAsked = true;
  api.sb.functions.invoke("notizie", { body: {} }).then(() => reload()).catch(() => {});
}
window.home2Mount = () => { mountDaily(); refreshNews(); setTimeout(maybeNovita, 700); };

Object.assign(ACTIONS, {
  "gl-open": el => glOpen(el.dataset.id),
  "gl-ranks": () => openSheet(`<h2>Classifiche di sempre</h2>${[window.chessRankCard?.(), window.scopaRankCard?.(), window.mineRankCard?.(), window.geoRankCard?.(), window.games2Ranks?.(), rankCard("sudoku9"), rankCard("killer"), rankCard("fune"), rankCard("fuochi")].filter(Boolean).join("")}`),
  "news-open": el => sheetNews(Number(el.dataset.i)),
  "photo-open": el => { const list = (S.messages || []).filter(m => m.meta?.photo).map(m => ({ ...m.meta.photo, member_id: m.member_id, caption: m.content !== "Foto" ? m.content : "", created_at: m.created_at })); lightbox(list, Math.max(0, list.findIndex(p => p.path === el.dataset.path))); },
  "foto-open": el => { const list = (S.photos || []).slice().sort((a, b) => (b.created_at > a.created_at ? 1 : -1)); lightbox(list, Number(el.dataset.i)); },
  "photo-pick": () => $("#composer-photo-input")?.click(),
});
$("#composer-photo-input")?.addEventListener("change", e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) sendChatPhoto(f); });
