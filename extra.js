/* Capodanno - funzioni del viaggio: playlist del gruppo, ristoranti con recensioni, scontrini letti con la foto,
   modalità «Siamo qui» con le posizioni dal vivo, documenti di viaggio, stanze e letti, e il riassunto finale.
   Usa le funzioni globali di app.js, sezioni.js, home2.js e mappa3d.js. */
"use strict";

Object.assign(ICONS, {
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/>',
  heartf: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z" fill="currentColor"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5Z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m14.8 9.2-1.9 4.7-4.7 1.9 1.9-4.7Z" fill="currentColor"/>',
  door: '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3.5 21h17"/><circle cx="14.5" cy="12.5" r=".9" fill="currentColor"/>',
  sparkle: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2Z"/>',
});

const xUrl = u => (typeof u === "string" && /^https:\/\//.test(u) ? u : "");
const xPlural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ───────────────────────── Playlist del gruppo ─────────────────────────
// Ricerca su iTunes (gratuita, con anteprime di 30 secondi e copertine); ogni canzone si apre su Spotify.

const plAudio = new Audio();
plAudio.preload = "none";
let plNow = "", plQueue = [], plResults = [];
plAudio.addEventListener("ended", () => { const next = plQueue.shift(); if (next) plPlay(next); else { plNow = ""; plPaint(); } });
plAudio.addEventListener("pause", () => plPaint());
plAudio.addEventListener("play", () => plPaint());
function plPlay(url) {
  if (!url) return;
  if (plNow === url && !plAudio.paused) { plAudio.pause(); plQueue = []; return; }
  plNow = url; plAudio.src = url; plAudio.play().catch(() => toast("Anteprima non disponibile", "alert"));
}
function plPaint() {
  for (const b of $$("[data-act=pl-play]")) {
    const on = b.dataset.url === plNow && !plAudio.paused;
    b.classList.toggle("on", on); b.innerHTML = ico(on ? "pause" : "play", 16);
  }
}
const plVotes = id => (S.song_votes || []).filter(v => v.song_id === id);
const plSorted = () => (S.songs || []).map(s => ({ ...s, votes: plVotes(s.id) })).sort((a, b) => b.votes.length - a.votes.length || String(a.created_at).localeCompare(String(b.created_at)));
const plSpotify = s => `https://open.spotify.com/search/${encodeURIComponent(`${s.title} ${s.artist || ""}`.trim())}`;

EXTRA_VIEWS.playlist = {
  title: "Playlist", sub: "La colonna sonora della notte, votata dal gruppo",
  view() {
    const list = plSorted(), votes = list.reduce((a, s) => a + s.votes.length, 0);
    const arts = list.filter(s => s.artwork).slice(0, 4);
    const mine = list.filter(s => s.added_by === ME).length;
    return `<section class="pl-hero">
        <div class="pl-cover">${arts.length ? arts.map(s => `<img src="${esc(s.artwork)}" alt="" loading="lazy" onerror="this.remove()">`).join("") : `<span>${ico("music", 44)}</span>`}</div>
        <div class="pl-hero-b"><div class="eyebrow">Playlist del gruppo</div><div class="pl-title">Capodanno ${countdownTarget()?.getFullYear?.() || ""}</div>
          <div class="small">${xPlural(list.length, "canzone", "canzoni")} · ${xPlural(votes, "voto", "voti")} · tu ne hai aggiunte ${mine}</div>
          <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
            ${list.some(s => s.preview) ? `<button class="btn sm pl-go" data-act="pl-all">${ico("play", 14)}Ascolta la top</button>` : ""}
            ${list.length ? `<button class="btn sm" data-act="pl-copy">${ico("copy", 14)}Copia la lista</button>` : ""}
          </div></div></section>
      <form class="card pl-search" id="pl-form"><span>${ico("music", 18)}</span><input name="q" placeholder="Cerca una canzone o un artista" autocomplete="off" enterkeyhint="search"><button class="btn sm primary">Cerca</button></form>
      <div id="pl-res"></div>
      <div class="label" style="margin:18px 4px 8px">La classifica</div>
      ${list.length ? `<section class="card pl-list">${list.map((s, i) => plRow(s, i)).join("")}</section>`
        : `<section class="card"><div class="small muted">Ancora vuota. Cerca la canzone che non può mancare a mezzanotte e aggiungila: poi tutti votano con il cuore.</div></section>`}
      <p class="tiny faint" style="text-align:center;margin:10px 0 18px">Anteprime di 30 secondi da iTunes. Ogni canzone si apre su Spotify con il tasto verde.</p>`;
  },
  mount() {
    plPaint();
    $("#pl-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const q = new FormData(e.target).get("q").trim(); if (!q) return;
      const box = $("#pl-res"); box.innerHTML = `<section class="card"><div class="small muted">Cerco «${esc(q)}»…</div></section>`;
      try {
        const r = await (await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: "music", entity: "song", limit: "12", country: "IT" })}`)).json();
        plResults = (r.results || []).map(x => ({ title: x.trackName, artist: x.artistName, artwork: (x.artworkUrl100 || "").replace("100x100", "300x300"), preview: x.previewUrl || null, ext_url: x.trackViewUrl || null })).filter(x => x.title);
      } catch { plResults = []; }
      if (!plResults.length) {
        const [t, a] = q.split(/\s+-\s+/);
        plResults = [{ title: t.trim(), artist: (a || "").trim() || null, artwork: null, preview: null, ext_url: null, manual: true }];
      }
      box.innerHTML = `<section class="card pl-list pl-found"><div class="row between" style="margin-bottom:4px"><div class="label">Risultati</div><button class="link small" data-act="pl-clear">Chiudi</button></div>
        ${plResults.map((x, j) => `<div class="pl-row">
          <span class="pl-art">${x.artwork ? `<img src="${esc(x.artwork)}" alt="" loading="lazy" onerror="this.remove()">` : ico("music", 20)}${x.preview ? `<button class="pl-play" data-act="pl-play" data-url="${esc(x.preview)}" aria-label="Ascolta">${ico("play", 16)}</button>` : ""}</span>
          <span class="grow pl-tt"><b class="ellipsis">${esc(x.title)}</b><span class="small muted ellipsis">${esc(x.artist || (x.manual ? "Aggiunta a mano" : ""))}</span></span>
          <button class="btn sm primary" data-act="pl-add" data-j="${j}">${ico("plus", 14)}Aggiungi</button></div>`).join("")}</section>`;
      plPaint();
    });
  },
};
function plRow(s, i) {
  const mine = s.votes.some(v => v.member_id === ME);
  const by = member(s.added_by);
  return `<div class="pl-row${i < 3 ? " top" : ""}">
    <span class="pl-rank">${i + 1}</span>
    <span class="pl-art">${s.artwork ? `<img src="${esc(s.artwork)}" alt="" loading="lazy" onerror="this.remove()">` : ico("music", 20)}${s.preview ? `<button class="pl-play" data-act="pl-play" data-url="${esc(s.preview)}" aria-label="Ascolta">${ico("play", 16)}</button>` : ""}</span>
    <span class="grow pl-tt"><b class="ellipsis">${esc(s.title)}</b><span class="small muted ellipsis">${esc(s.artist || "")}${by ? ` · da ${esc(by.id === ME ? "te" : by.name)}` : ""}</span></span>
    <a class="pl-sp" href="${esc(plSpotify(s))}" target="_blank" rel="noopener" aria-label="Apri su Spotify" data-stop><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1ed760"/><path d="M7 9.6c3.4-1 7.2-.7 10.1 1M7.6 12.6c2.8-.8 5.8-.5 8.2.9M8.2 15.4c2.2-.6 4.4-.4 6.3.7" stroke="#0a0a0c" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></a>
    <button class="pl-vote${mine ? " on" : ""}" data-act="pl-vote" data-id="${s.id}" aria-label="Vota">${ico(mine ? "heartf" : "heart", 18)}<b>${s.votes.length || ""}</b></button>
    ${s.added_by === ME || isAdmin() ? `<button class="pl-del" data-act="pl-del" data-id="${s.id}" aria-label="Togli">${ico("close", 14)}</button>` : ""}
  </div>`;
}
Object.assign(ACTIONS, {
  "pl-play": el => plPlay(el.dataset.url),
  "pl-all"() { const urls = plSorted().map(s => s.preview).filter(Boolean); plQueue = urls.slice(1); plNow = ""; plPlay(urls[0]); },
  "pl-clear"() { const b = $("#pl-res"); if (b) b.innerHTML = ""; },
  "pl-copy"() {
    const text = plSorted().map((s, i) => `${i + 1}. ${s.artist ? `${s.artist} - ` : ""}${s.title}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("Lista copiata", "copy"), () => toast("Non riesco a copiare", "alert"));
  },
  async "pl-add"(el) {
    const x = plResults[Number(el.dataset.j)]; if (!x) return;
    const dup = (S.songs || []).find(s => s.title.toLowerCase() === x.title.toLowerCase() && String(s.artist || "").toLowerCase() === String(x.artist || "").toLowerCase());
    el.disabled = true;
    try {
      if (dup) {
        if (!plVotes(dup.id).some(v => v.member_id === ME)) await api.insert("song_votes", { song_id: dup.id, member_id: ME });
        toast("Era già in playlist: ci hai messo il tuo voto", "heart");
      } else {
        const s = await api.insert("songs", { added_by: ME, title: x.title.slice(0, 160), artist: x.artist?.slice(0, 120) || null, artwork: xUrl(x.artwork) || null, preview: xUrl(x.preview) || null, ext_url: xUrl(x.ext_url) || null });
        await api.insert("song_votes", { song_id: s.id, member_id: ME });
        toast("Aggiunta alla playlist", "music");
      }
      el.innerHTML = `${ico("check", 14)}Fatto`;
      await reload();
    } catch (e) { el.disabled = false; toast(/songs/.test(e.message) ? "Serve l'aggiornamento 10 del database" : e.message, "alert"); }
  },
  async "pl-vote"(el) {
    const id = el.dataset.id, mine = plVotes(id).some(v => v.member_id === ME);
    try { if (mine) await api.remove("song_votes", { song_id: id, member_id: ME }); else await api.insert("song_votes", { song_id: id, member_id: ME }); await reload(); }
    catch (e) { toast(e.message, "alert"); }
  },
  async "pl-del"(el) {
    if (!confirm("Togliere la canzone dalla playlist?")) return;
    try { await api.remove("songs", { id: el.dataset.id }); await reload(); } catch (e) { toast(e.message, "alert"); }
  },
});

// ───────────────────────── Ristoranti con recensioni ─────────────────────────
// Zampone li cerca sul web (voti e recensioni veri) e li mostra come schede; da qui si mettono ai voti.

const foodStars = f => {
  if (!f.rating) return "";
  const scale = f.scale || 5, v = Number(f.rating);
  const txt = scale === 10 ? `${String(v).replace(".", ",")}/10` : `${v.toFixed(1).replace(".", ",")}`;
  return `<span class="fd-rt">${scale === 5 ? "★ " : ""}${txt}${f.reviews ? `<em>${Number(f.reviews).toLocaleString("it-IT")}</em>` : ""}</span>`;
};
const foodInPoll = f => S.poll_options.some(o => o.label.trim().toLowerCase() === f.name.trim().toLowerCase());
function foodCard(f, ref) {
  return `<div class="fd">
    <a class="fd-img" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener" data-stop>${f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="fd-ph">${ico("fork", 34)}</span>`}
      ${foodStars(f)}${f.price ? `<span class="fd-pr">${esc(f.price)}</span>` : ""}</a>
    <div class="fd-b"><div class="t">${esc(f.name)}</div>
      <div class="fd-f">${[f.cuisine, f.zone].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div>
      ${f.says ? `<div class="fd-says">${esc(f.says)}</div>` : ""}
      ${f.groups ? `<div class="tiny faint" style="margin-top:4px">${ico("users", 12)} ${esc(f.groups)}</div>` : ""}
      ${f.source ? `<div class="tiny faint" style="margin-top:4px">Voto da ${esc(f.source)}</div>` : ""}
      <div class="fd-a"><a class="btn sm" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener" data-stop>${ico("link", 14)}Apri</a>
        ${f.book ? `<a class="btn sm" href="${esc(safeUrl(f.book))}" target="_blank" rel="noopener" data-stop>${ico("calendar", 14)}Prenota</a>` : ""}
        ${foodInPoll(f) ? `<span class="small pos row" style="gap:4px">${ico("check", 14)}Ai voti</span>` : `<button class="btn sm primary" data-act="food-vote" data-id="${ref.id}" data-i="${ref.i}" data-j="${ref.j}">${ico("vote", 14)}Ai voti</button>`}</div>
    </div></div>`;
}
window.foodCards = (m, a, i) => `<div class="stays fds" data-noswipe>${(a.items || []).map((f, j) => foodCard(f, { id: m.id, i, j })).join("")}</div>`;
function foodAll() {
  const seen = new Map();
  for (const m of S.messages) (m.meta?.actions || []).forEach((a, i) => { if (a?.type === "food") (a.items || []).forEach((f, j) => { if (f?.name) seen.set(f.name.trim().toLowerCase(), { f, ref: { id: m.id, i, j }, at: m.created_at }); }); });
  return [...seen.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
EXTRA_VIEWS.ristoranti = {
  title: "Ristoranti", sub: "Voti e recensioni veri, scelti da Zampone",
  view() {
    const dest = trip().destination || "la meta", n = going().length || S.members.length;
    const asks = [
      ["Cenone del 31", `Trovami 6 ristoranti per il cenone del 31 dicembre a ${dest} per ${n} persone: menù di Capodanno, prezzo a testa, se accettano gruppi, voti e recensioni. Mostrali con le schede dei ristoranti.`],
      ["Pranzo tipico", `Trovami 6 posti dove mangiare piatti tipici a pranzo a ${dest} per ${n} persone, con voti e recensioni. Mostrali con le schede dei ristoranti.`],
      ["Aperitivo e cocktail", `Trovami 6 cocktail bar o posti per l'aperitivo a ${dest} adatti a un gruppo di ${n}, con voti e recensioni. Mostrali con le schede.`],
      ["Colazione e brunch", `Trovami 5 posti per colazione o brunch a ${dest} con voti e recensioni. Mostrali con le schede.`],
      ["Spendendo poco", `Trovami 6 posti buoni e economici (sotto i 25 € a testa) a ${dest} per un gruppo di ${n}, con voti e recensioni. Mostrali con le schede.`],
      ["Dopo mezzanotte", `Trovami posti aperti dopo mezzanotte a ${dest} (cibo e locali) per la notte di Capodanno, con voti e recensioni. Mostrali con le schede.`],
    ];
    const all = foodAll();
    return `<section class="card fd-hero"><div class="row" style="gap:14px"><span class="fd-ic">${ico("fork", 26)}</span><div class="grow"><div class="t">Dove mangiamo?</div>
        <div class="small muted">Scegli cosa cerchi: ${AI()} legge voti e recensioni su Google, TripAdvisor e TheFork e ti porta le schede. Le migliori le metti ai voti.</div></div></div>
      <div class="chips scroll" style="margin-top:14px">${asks.map(([l, q]) => `<button class="chip" data-act="ask" data-q="${esc(q)}">${esc(l)}</button>`).join("")}</div>
      <form id="fd-form" class="row" style="gap:8px;margin-top:12px"><input name="q" placeholder="Es. pizzeria vicino all'alloggio" style="flex:1"><button class="btn primary">${ico("send", 16)}</button></form></section>
      ${all.length ? `<div class="label" style="margin:18px 4px 8px">Trovati finora</div><div class="fd-grid">${all.map(x => foodCard(x.f, x.ref)).join("")}</div>`
        : `<section class="card"><div class="small muted">Ancora nessun locale: tocca una delle ricerche qui sopra, ${AI()} risponde in chat con le schede e le trovi anche qui.</div></section>`}`;
  },
  mount() {
    $("#fd-form")?.addEventListener("submit", e => {
      e.preventDefault(); const q = new FormData(e.target).get("q").trim(); if (!q) return;
      ask(`Cercami: ${q}${trip().destination ? ` a ${trip().destination}` : ""}. Leggi voti e recensioni e mostrali con le schede dei ristoranti.`);
    });
  },
};
Object.assign(ACTIONS, {
  async "food-vote"(el) {
    const m = S.messages.find(x => x.id === el.dataset.id); const f = m?.meta?.actions?.[el.dataset.i]?.items?.[el.dataset.j];
    if (!f) return;
    el.disabled = true;
    try {
      let poll = S.polls.find(p => p.status === "open" && /mangi|ristor|cena|cenone|pranzo|locale|aperitiv|colazion|brunch/i.test(p.question));
      let created = false;
      if (!poll) { poll = await api.insert("polls", { question: "Dove mangiamo?", kind: "multi", allow_add: true, created_by: ME }); created = true; }
      const details = [f.cuisine, f.price, f.rating ? `voto ${f.rating}${f.reviews ? ` (${f.reviews} recensioni)` : ""}` : "", f.zone].filter(Boolean).join(" · ");
      await api.insert("poll_options", { poll_id: poll.id, label: f.name.slice(0, 120), details: details || null, url: f.url, added_by: ME });
      if (created) api.notify("poll", poll.id);
      toast(created ? "Creato il sondaggio «Dove mangiamo?»" : "Aggiunto al sondaggio", "check");
      await reload();
    } catch (e) { toast(e.message, "alert"); el.disabled = false; }
  },
});

// ───────────────────────── Scontrini con la foto ─────────────────────────
// La foto va a Zampone (Claude legge lo scontrino), la spesa si apre già compilata e lo scontrino resta allegato.

let receiptFile = null;
async function receiptJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
}
const blobB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
Object.assign(ACTIONS, {
  scontrino() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return;
      let blob;
      try { blob = await receiptJpeg(file); } catch { return toast("Non riesco ad aprire la foto", "alert"); }
      const prev = URL.createObjectURL(blob);
      openSheet(`<div class="rc-scan"><img src="${prev}" alt=""><i></i></div><h2 style="text-align:center">Leggo lo scontrino…</h2><p class="small muted" style="text-align:center">${AI()} cerca totale, negozio e data.</p>`);
      receiptFile = new File([blob], `scontrino-${today()}.jpg`, { type: "image/jpeg" });
      let r = null;
      if (CLOUD) {
        try {
          const { data, error } = await api.sb.functions.invoke("assistente", { body: { mode: "scontrino", image: await blobB64(blob), media_type: "image/jpeg" } });
          if (error) throw error; r = data;
        } catch { r = null; }
      }
      URL.revokeObjectURL(prev);
      if (!$("#sheet.open .rc-scan")) return; // chiuso nel frattempo
      const ok = r && r.leggibile !== false && Number(r.totale) > 0;
      const lines = Array.isArray(r?.righe) ? r.righe.filter(x => x?.voce).slice(0, 12).map(x => `${x.voce}${x.importo != null ? ` ${eur(Number(x.importo))}` : ""}`).join(" · ") : "";
      const cat = EXP_CATS[r?.categoria] ? r.categoria : "altro";
      const foreign = r?.valuta && r.valuta !== "EUR" ? ` (importo in ${r.valuta}: controlla il cambio)` : "";
      sheetEditExpense(null, ok ? {
        title: String(r.titolo || r.negozio || "Spesa").slice(0, 120), amount: Math.round(Number(r.totale) * 100) / 100, category: cat,
        spent_on: /^\d{4}-\d{2}-\d{2}$/.test(r.data || "") ? r.data : undefined, note: [r.negozio, lines].filter(Boolean).join(" · ").slice(0, 400),
      } : {});
      const f = $("#exp-form"); if (f) f.dataset.receipt = "1";
      toast(ok ? `Letto: ${eur(Number(r.totale))}${foreign}. Controlla e salva` : CLOUD ? "Non riesco a leggerlo bene: completa tu, lo scontrino resta allegato" : "Lettura disponibile col database collegato", ok ? "receipt" : "alert");
    };
    inp.click();
  },
});
window.onExpenseSaved = async (row, form) => {
  if (!receiptFile || !form?.dataset.receipt || !row?.id) return;
  const file = receiptFile; receiptFile = null;
  try { if (api.filesEnabled) { await api.uploadFile({ expense_id: row.id }, file); await reload(); } } catch { toast("Spesa salvata, ma lo scontrino non si è caricato", "alert"); }
};

// ───────────────────────── Posizioni dal vivo ─────────────────────────
// Chi condivide la posizione la manda al gruppo ogni pochi secondi (canale in tempo reale, senza database);
// nel database finisce solo ogni due minuti, così chi apre l'app dopo vede comunque l'ultima posizione.

const LIVE = {};
let liveCh = null, liveWatch = null, liveSent = 0, liveDb = 0, livePrev = null;
const liveFresh = p => p && Date.now() - new Date(p.at) < 15 * 60e3;
function posOf(m) {
  const l = LIVE[m.id];
  if (liveFresh(l)) return { ...l, live: Date.now() - new Date(l.at) < 90e3 };
  if (m.loc_lat != null && m.loc_at && Date.now() - new Date(m.loc_at) < 12 * 3600e3) return { lat: m.loc_lat, lon: m.loc_lon, at: m.loc_at, acc: null, live: false };
  return null;
}
function liveInit() {
  if (liveCh || !CLOUD || !api.sb || !ME) return;
  liveCh = api.channel("posizioni")
    .on("broadcast", { event: "pos" }, ({ payload: p }) => { if (p?.id && p.id !== ME && Number.isFinite(p.lat)) { LIVE[p.id] = p; liveChanged(p.id); } })
    .on("broadcast", { event: "stop" }, ({ payload: p }) => { if (p?.id) { delete LIVE[p.id]; liveChanged(p.id); } })
    .on("broadcast", { event: "ping" }, () => { if (LIVE[ME] && sharing()) liveSend(true); })
    .subscribe(st => { if (st === "SUBSCRIBED") { try { liveCh.send({ type: "broadcast", event: "ping", payload: {} }); } catch { /* rete */ } } });
  liveSync();
}
function liveSync() {
  const want = !!(navigator.geolocation && ME && sharing() && !document.hidden);
  if (want && liveWatch == null) liveWatch = navigator.geolocation.watchPosition(liveFix, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  if (!want && liveWatch != null) { navigator.geolocation.clearWatch(liveWatch); liveWatch = null; }
}
function liveSend(force) {
  const p = LIVE[ME]; if (!p || !liveCh) return;
  if (!force && Date.now() - liveSent < 3000) return;
  liveSent = Date.now();
  try { liveCh.send({ type: "broadcast", event: "pos", payload: p }); } catch { /* rete */ }
}
function liveFix(g) {
  const c = g.coords, now = Date.now();
  const p = { id: ME, lat: c.latitude, lon: c.longitude, acc: Math.round(c.accuracy || 0), hd: Number.isFinite(c.heading) ? Math.round(c.heading) : null, sp: Number.isFinite(c.speed) ? c.speed : null, at: new Date().toISOString() };
  const moved = livePrev ? kmBetween(livePrev, p) * 1000 : Infinity;
  LIVE[ME] = p; liveChanged(ME);
  if (moved > 5 || now - liveSent > 8000) { livePrev = p; liveSend(); }
  if (now - liveDb > 120e3 || (moved > 150 && now - liveDb > 20e3)) {
    liveDb = now; api.update("members", { id: ME }, { loc_lat: p.lat, loc_lon: p.lon, loc_at: p.at }).catch(() => {});
  }
}
// Da fermi il telefono non manda nuove posizioni: ogni 10 secondi si ripete l'ultima.
setInterval(() => { if (sharing() && LIVE[ME] && !document.hidden) liveSend(true); liveSync(); }, 10000);
document.addEventListener("visibilitychange", () => liveSync());
(function liveBoot() { if (ME && api.sb) liveInit(); else setTimeout(liveBoot, 1500); })();
{
  const share = ACTIONS["m3-share"];
  ACTIONS["m3-share"] = async (...a) => {
    const was = sharing();
    await share(...a);
    const check = () => {
      liveSync();
      if (was && !sharing()) { delete LIVE[ME]; try { liveCh?.send({ type: "broadcast", event: "stop", payload: { id: ME } }); } catch { /* rete */ } liveChanged(ME); }
    };
    setTimeout(check, 600); setTimeout(check, 4000);
  };
}
function liveChanged(id) { if (lvState) lvMark(lvState, id); }

// ───────────────────────── Mappa «Dove siamo» ─────────────────────────

const LV_STYLES = [
  { k: "strade", n: "Strade", s: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json" },
  { k: "satellite", n: "Satellite", s: { version: 8, sources: {
    sat: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" },
    lab: { type: "raster", tiles: ["https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png"], tileSize: 256, attribution: "© CARTO © OpenStreetMap" } },
    layers: [{ id: "sat", type: "raster", source: "sat" }, { id: "lab", type: "raster", source: "lab" }] } },
  { k: "notte", n: "Notte", s: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
];
const LV_STYLE_KEY = "capodanno-lv-stile";
let lvState = null;
const lvAgo = iso => { const s = Math.round((Date.now() - new Date(iso)) / 1000); return s < 20 ? "adesso" : s < 60 ? `${s} s fa` : s < 3600 ? `${Math.round(s / 60)} min fa` : `${Math.round(s / 3600)} h fa`; };
const lvDist = m => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",")} km`);
const lvDir = (a, b) => { const y = Math.sin((b.lon - a.lon) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180), x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) - Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lon - a.lon) * Math.PI / 180); return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(((Math.atan2(y, x) * 180 / Math.PI + 360) % 360) / 45) % 8]; };
function lvCircle(p) {
  const r = Math.max(3, p.acc || 0), pts = [], R = 6378137;
  for (let i = 0; i <= 40; i++) { const t = i / 40 * 2 * Math.PI; pts.push([p.lon + (r * Math.sin(t)) / (R * Math.cos(p.lat * Math.PI / 180)) * 180 / Math.PI, p.lat + (r * Math.cos(t)) / R * 180 / Math.PI]); }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}
function lvStop() {
  const st = lvState; lvState = null;
  if (!st) return;
  clearInterval(st.timer);
  try { st.map.remove(); } catch { /* già chiusa */ }
}
EXTRA_VIEWS.live = {
  title: "Dove siamo", sub: "Il gruppo sulla mappa, dal vivo",
  view() {
    lvStop();
    const k = storage.get(LV_STYLE_KEY) || "strade";
    return `<div class="lv-wrap"><div id="lv-map"></div>
        <div class="lv-hud"><span class="lv-dot"></span><span id="lv-status">Carico la mappa…</span></div>
        <div class="lv-ctrl">
          <button data-lv="me" aria-label="Dove sono io">${ico("target", 19)}</button>
          <button data-lv="all" aria-label="Tutto il gruppo">${ico("users", 19)}</button>
          <button data-lv="north" aria-label="Nord in alto">${ico("compass", 19)}</button>
        </div>
        <div class="lv-styles">${LV_STYLES.map(s => `<button data-lvs="${s.k}" class="${s.k === k ? "on" : ""}">${s.n}</button>`).join("")}</div></div>
      <section class="card m3-loc" id="lv-share">${locCard()}</section>
      <div id="lv-list"></div>`;
  },
  async mount() {
    liveSync();
    const status = t => { const e = $("#lv-status"); if (e) e.textContent = t; };
    try { await loadMapLibre(); } catch { status("Mappa non disponibile senza connessione"); lvList(null); return; }
    const el = $("#lv-map"); if (!el?.isConnected) return;
    const ML = window.maplibregl;
    const k = storage.get(LV_STYLE_KEY) || "strade";
    const map = new ML.Map({ container: el, style: (LV_STYLES.find(s => s.k === k) || LV_STYLES[0]).s, center: [11, 46], zoom: 4, maxZoom: 20, attributionControl: { compact: true },
      antialias: false, fadeDuration: 0, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), dragRotate: true });
    const st = lvState = { map, ML, el, mk: new Map(), follow: null, home: null, homeMk: null, fitted: false, timer: 0 };
    const addLayers = () => {
      if (map.getSource("lv-acc")) return;
      map.addSource("lv-acc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "lv-acc", type: "fill", source: "lv-acc", paint: { "fill-color": "#4fb3ff", "fill-opacity": 0.14 } });
      map.addLayer({ id: "lv-acc-l", type: "line", source: "lv-acc", paint: { "line-color": "#4fb3ff", "line-width": 1.2, "line-opacity": 0.6 } });
      lvAcc(st);
    };
    map.on("style.load", addLayers);
    for (const ev of ["dragstart", "pitchstart"]) map.on(ev, e => { if (e.originalEvent) st.follow = null; });
    await new Promise(r => map.once("load", r));
    if (lvState !== st) return;
    addLayers();
    el.parentElement.querySelector(".lv-ctrl").addEventListener("click", e => {
      const b = e.target.closest("[data-lv]"); if (!b) return;
      if (b.dataset.lv === "me") { const p = LIVE[ME] || posOf(me()); if (!p) return toast(sharing() ? "Sto cercando la tua posizione…" : "Prima condividi la tua posizione qui sotto", "pin"); st.follow = ME; map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 17.5), duration: 900 }); }
      if (b.dataset.lv === "all") { st.follow = null; lvFit(st, true); }
      if (b.dataset.lv === "north") map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
    });
    el.parentElement.querySelector(".lv-styles").addEventListener("click", e => {
      const b = e.target.closest("[data-lvs]"); if (!b) return;
      storage.set(LV_STYLE_KEY, b.dataset.lvs);
      for (const x of el.parentElement.querySelectorAll("[data-lvs]")) x.classList.toggle("on", x === b);
      map.setStyle((LV_STYLES.find(s => s.k === b.dataset.lvs) || LV_STYLES[0]).s);
    });
    // L'alloggio come punto di riferimento.
    const stay = S.bookings.find(b => b.category === "alloggio" && ["prenotato", "pagato"].includes(b.status));
    const where = stay?.address || (stay ? `${stay.title}, ${trip().destination || ""}` : null);
    if (where) geocode(where).then(g => {
      if (!g || lvState !== st) return;
      st.home = g;
      const d = document.createElement("div"); d.className = "lv-home"; d.innerHTML = `${ico("bed", 16)}<span>${esc(stay.title)}</span>`;
      st.homeMk = new ML.Marker({ element: d }).setLngLat([g.lon, g.lat]).addTo(map);
      lvList(st);
    });
    for (const m of S.members) lvMark(st, m.id);
    lvFit(st, false);
    lvList(st);
    st.timer = setInterval(() => {
      if (!el.isConnected) return lvStop();
      for (const m of S.members) lvMark(st, m.id, true);
      lvList(st);
    }, 5000);
  },
};
function lvFit(st, anim) {
  const pts = S.members.map(posOf).filter(Boolean);
  if (st.home) pts.push(st.home);
  if (!pts.length) {
    const t = trip().destination;
    if (t) geocode(t).then(g => { if (g && lvState === st) st.map.jumpTo({ center: [g.lon, g.lat], zoom: 12 }); });
    return;
  }
  const b = new st.ML.LngLatBounds();
  pts.forEach(p => b.extend([p.lon, p.lat]));
  st.map.fitBounds(b, { padding: 70, maxZoom: 17, duration: anim ? 900 : 0 });
  st.fitted = true;
}
function lvAcc(st) {
  const f = S.members.map(posOf).filter(p => p && p.acc && liveFresh(p)).map(lvCircle);
  st.map.getSource("lv-acc")?.setData({ type: "FeatureCollection", features: f });
}
// Un marker per persona: si sposta con un'animazione morbida verso la nuova posizione.
function lvMark(st, id, labelsOnly) {
  const m = member(id); if (!m || lvState !== st) return;
  const p = posOf(m), old = st.mk.get(id);
  if (!p) { if (old) { old.mk.remove(); st.mk.delete(id); } return; }
  const label = `${esc(id === ME ? "Tu" : m.name)}<em>${p.live ? "dal vivo" : lvAgo(p.at)}</em>`;
  if (old) {
    old.el.classList.toggle("live", !!p.live); old.el.classList.toggle("old", !p.live && Date.now() - new Date(p.at) > 10 * 60e3);
    const lab = old.el.querySelector(".lv-lab"); if (lab && lab.innerHTML !== label) lab.innerHTML = label;
    const arr = old.el.querySelector(".lv-hd"); if (arr) { arr.style.display = p.hd != null && p.sp > 0.6 ? "" : "none"; arr.style.transform = `rotate(${p.hd || 0}deg)`; }
    if (labelsOnly) return;
    const from = old.mk.getLngLat(), to = { lng: p.lon, lat: p.lat }, t0 = performance.now();
    cancelAnimationFrame(old.raf);
    const step = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); old.mk.setLngLat([from.lng + (to.lng - from.lng) * e, from.lat + (to.lat - from.lat) * e]); if (k < 1) old.raf = requestAnimationFrame(step); };
    old.raf = requestAnimationFrame(step);
  } else {
    const d = document.createElement("div");
    d.className = `lv-pin${p.live ? " live" : ""}${id === ME ? " me" : ""}`;
    d.style.setProperty("--c", m.color || "#e6d4ff");
    d.innerHTML = `<span class="lv-hd" style="${p.hd != null && p.sp > 0.6 ? "" : "display:none"};transform:rotate(${p.hd || 0}deg)"></span><span class="lv-av">${avatar(m, "sm")}</span><span class="lv-lab">${label}</span>`;
    d.addEventListener("click", ev => { ev.stopPropagation(); lvFollow(id); });
    st.mk.set(id, { el: d, raf: 0, mk: new st.ML.Marker({ element: d, anchor: "center" }).setLngLat([p.lon, p.lat]).addTo(st.map) });
  }
  if (!labelsOnly) {
    lvAcc(st);
    if (st.follow === id && !st.map.isMoving()) st.map.easeTo({ center: [p.lon, p.lat], duration: 800 });
    if (!st.fitted) lvFit(st, true);
    const s = $("#lv-status"); if (s) s.textContent = lvStatusTxt();
  }
}
const lvStatusTxt = () => { const ps = S.members.map(posOf).filter(Boolean), live = ps.filter(p => p.live).length; return ps.length ? `${xPlural(live, "persona", "persone")} dal vivo · ${ps.length} sulla mappa` : "Nessuno condivide la posizione"; };
function lvFollow(id) {
  const st = lvState, m = member(id), p = m && posOf(m); if (!st || !p) return;
  st.follow = id;
  st.map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(st.map.getZoom(), 17), duration: 900 });
  toast(`Segui ${id === ME ? "te stesso" : m.name}: tocca la mappa per smettere`, "target");
  $(".lv-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function lvList(st) {
  const box = $("#lv-list"); if (!box) return;
  const meP = LIVE[ME] || posOf(me() || {});
  const rows = S.members.map(m => ({ m, p: posOf(m) })).sort((a, b) => (b.p ? 1 : 0) - (a.p ? 1 : 0) || (b.p?.live ? 1 : 0) - (a.p?.live ? 1 : 0) || a.m.name.localeCompare(b.m.name));
  const on = rows.filter(r => r.p), off = rows.filter(r => !r.p);
  const s = $("#lv-status"); if (s && st) s.textContent = lvStatusTxt();
  box.innerHTML = `${on.length ? `<section class="card lv-people">${on.map(({ m, p }) => {
      const d = meP && m.id !== ME ? kmBetween(meP, p) * 1000 : null;
      const home = st?.home ? kmBetween(st.home, p) * 1000 : null;
      return `<div class="li"><span class="lv-li-av${p.live ? " live" : ""}">${avatar(m, "sm")}</span>
        <div class="grow"><div class="t">${esc(m.id === ME ? "Tu" : m.name)}</div>
          <div class="tiny faint">${p.live ? `<b class="lv-on">dal vivo</b>` : lvAgo(p.at)}${p.acc ? ` · precisione ±${p.acc} m` : ""}${d != null ? ` · a ${lvDist(d)} ${lvDir(meP, p)}` : ""}${home != null && home < 300 ? " · all'alloggio" : ""}</div></div>
        <button class="btn sm" data-act="lv-follow" data-id="${m.id}">${ico("target", 14)}</button>
        ${m.id !== ME ? `<a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking" target="_blank" rel="noopener">${ico("nav", 14)}Raggiungi</a>` : ""}</div>`;
    }).join("")}</section>` : ""}
    ${off.length ? `<section class="card"><div class="label" style="margin-bottom:6px">Non condividono</div><div class="lv-off">${off.map(({ m }) => `<span>${avatar(m, "sm")}${esc(m.id === ME ? "Tu" : m.name)}</span>`).join("")}</div></section>` : ""}`;
}
window.liveRefresh = () => {
  const st = lvState; if (!st || !st.el.isConnected) return false;
  const sh = $("#lv-share"); if (sh) sh.innerHTML = locCard();
  for (const m of S.members) lvMark(st, m.id);
  lvList(st);
  return true;
};
Object.assign(ACTIONS, { "lv-follow": el => lvFollow(el.dataset.id) });

// ───────────────────────── Modalità «Siamo qui» ─────────────────────────
// Durante il viaggio (o quando l'organizzatore la accende) in cima alla Home: oggi, alloggio, chi è arrivato.

const quiMode = () => S.trip?.[0]?.flags?.qui || "auto";
function quiActive() {
  const mode = quiMode(); if (mode === "on") return true; if (mode === "off") return false;
  const t = trip(); if (!t.start_date) return false;
  const d = today(), start = new Date(`${t.start_date}T00:00`); start.setDate(start.getDate() - 1);
  return d >= start.toISOString().slice(0, 10) && d <= (t.end_date || t.start_date);
}
let quiWx = null;
window.quiCard = function () {
  if (!quiActive()) return "";
  const t = trip(), d = today();
  const n = t.start_date && t.end_date ? Math.round((new Date(t.end_date) - new Date(t.start_date)) / 864e5) + 1 : null;
  const k = t.start_date ? Math.round((new Date(d) - new Date(t.start_date)) / 864e5) + 1 : null;
  const dayTxt = k == null ? "In viaggio" : k < 1 ? "Si parte domani" : n && k > n ? "Viaggio finito" : `Giorno ${k}${n ? ` di ${n}` : ""}`;
  const stay = S.bookings.find(b => b.category === "alloggio" && ["prenotato", "pagato"].includes(b.status));
  const stayQ = stay ? (stay.address || `${stay.title}, ${t.destination || ""}`) : t.destination;
  const items = [
    ...S.itinerary.filter(i => i.day === d).map(i => ({ time: i.time || "", t: i.title, sub: i.place })),
    ...S.bookings.filter(b => b.start_at && b.start_at.slice(0, 10) === d && b.status !== "annullato" && b.category !== "alloggio").map(b => ({ time: b.start_at.slice(11, 16), t: b.title, sub: b.address })),
  ].sort((a, b) => String(a.time).localeCompare(String(b.time))).slice(0, 4);
  const ppl = S.members.map(m => ({ m, p: posOf(m) })).filter(x => x.p);
  setTimeout(quiFill, 0);
  return `<section class="qui">
    <div class="qui-top"><span class="qui-pill"><i></i>Siamo qui</span><span class="qui-day">${dayTxt}</span></div>
    <div class="qui-main"><div class="grow"><div class="qui-dest">${esc(t.destination || "In viaggio")}</div><div class="small" id="qui-wx-t">${quiWx ? quiWx.txt : "&nbsp;"}</div></div><div class="qui-wx" id="qui-wx">${quiWx ? quiWx.art : ""}</div></div>
    ${stay ? `<div class="qui-stay"><span class="qui-ic">${ico("bed", 18)}</span><div class="grow"><b class="ellipsis">${esc(stay.title)}</b><span class="tiny ellipsis">${esc(stay.address || "Indirizzo non inserito")}</span></div>
      <a class="btn sm pearl" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stayQ)}&travelmode=walking" target="_blank" rel="noopener">${ico("nav", 14)}Portami lì</a>
      ${stay.phone ? `<a class="btn sm icon" href="tel:${esc(stay.phone)}" aria-label="Chiama">${ico("phone", 15)}</a>` : ""}</div>` : ""}
    <div class="qui-today"><div class="qui-k">Oggi</div>${items.length ? items.map(i => `<div class="qui-it"><b>${esc(i.time || "·")}</b><span class="ellipsis">${esc(i.t)}${i.sub ? ` <em>${esc(i.sub)}</em>` : ""}</span></div>`).join("") : `<div class="tiny">Niente in programma: giornata libera.</div>`}</div>
    <div class="qui-btns">
      <button class="qui-live" data-act="tab" data-tab="live"><span class="qui-avs">${ppl.slice(0, 5).map(x => avatar(x.m, "sm")).join("") || ico("pin", 18)}</span><span class="grow"><b>Dove siamo</b><span class="tiny">${ppl.length ? `${xPlural(ppl.length, "persona", "persone")} sulla mappa` : "Mappa dal vivo"}</span></span>${ico("chev", 16)}</button>
      <button data-act="tab" data-tab="documenti">${ico("file", 18)}<span>Documenti</span></button>
      <button data-act="tab" data-tab="stanze">${ico("door", 18)}<span>Stanze</span></button>
    </div></section>`;
};
async function quiFill() {
  if (!$("#qui-wx") || (quiWx && Date.now() - quiWx.at < 15 * 60e3)) return;
  const dest = trip().destination; if (!dest) return;
  try {
    const g = await geocode(dest); if (!g) return;
    const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`)).json();
    const c = r.current; if (!c) return;
    quiWx = { at: Date.now(), art: wxArt(c.weather_code, 64, c.is_day !== 0), txt: `${Math.round(c.temperature_2m)}° · ${WMO(c.weather_code)} · max ${Math.round(r.daily.temperature_2m_max[0])}° min ${Math.round(r.daily.temperature_2m_min[0])}°` };
    const a = $("#qui-wx"), b = $("#qui-wx-t"); if (a) a.innerHTML = quiWx.art; if (b) b.textContent = quiWx.txt;
  } catch { /* offline */ }
}
Object.assign(ACTIONS, {
  async "qui-mode"(el) {
    if (!isAdmin()) return;
    const flags = { ...(S.trip?.[0]?.flags || {}) };
    if (el.dataset.v === "auto") delete flags.qui; else flags.qui = el.dataset.v;
    try { await api.update("trip", { id: 1 }, { flags }); } catch { return toast("Serve l'aggiornamento 9 del database", "alert"); }
    if (S.trip?.[0]) S.trip[0].flags = flags;
    closeSheet(); toast(el.dataset.v === "on" ? "Modalità «Siamo qui» accesa" : el.dataset.v === "off" ? "Modalità «Siamo qui» spenta" : "«Siamo qui» si accende da sola durante il viaggio", "check"); render();
  },
});

// ───────────────────────── Documenti di viaggio ─────────────────────────
// Conferme, biglietti e scontrini in un posto solo, salvabili sul telefono per quando manca la rete,
// e il controllo che nessuno parta con il documento scaduto.

const DOC_CACHE = "capodanno-documenti";
const DOC_OFF_KEY = "capodanno-doc-offline";
const docOffline = () => { try { return new Set(JSON.parse(storage.get(DOC_OFF_KEY)) || []); } catch { return new Set(); } };
const docKey = path => `./__doc__/${encodeURIComponent(path)}`;
function docCheck(p) {
  const end = trip().end_date || trip().start_date;
  if (!p?.doc_expiry) return { s: "manca", t: "Scadenza non inserita" };
  const exp = p.doc_expiry;
  if (exp < today()) return { s: "no", t: `Scaduto il ${fmtDate(exp, { day: "numeric", month: "short", year: "numeric" })}` };
  if (end && exp < end) return { s: "no", t: `Scade prima del rientro (${fmtDate(exp, { day: "numeric", month: "short" })})` };
  const months = (new Date(exp) - new Date(end || today())) / (30.4 * 864e5);
  if (months < 3) return { s: "warn", t: `Scade il ${fmtDate(exp, { day: "numeric", month: "short", year: "numeric" })}: alcuni paesi chiedono 3 mesi di validità` };
  return { s: "ok", t: `Valido fino al ${fmtDate(exp, { day: "numeric", month: "short", year: "numeric" })}` };
}
EXTRA_VIEWS.documenti = {
  title: "Documenti", sub: "Conferme, biglietti e documenti, anche offline",
  view() {
    const myP = S.member_private.find(r => r.member_id === ME), mine = docCheck(myP);
    const off = docOffline();
    const conf = S.bookings.filter(b => ["prenotato", "pagato"].includes(b.status)).sort((a, b) => String(a.start_at || "z").localeCompare(String(b.start_at || "z")));
    const groups = conf.map(b => ({ b, files: S.files.filter(f => f.booking_id === b.id) }));
    const receipts = S.files.filter(f => f.expense_id);
    const fileRow = f => `<div class="li"><div class="ib">${ico(/\.pdf$/i.test(f.name) ? "file" : "image")}</div><div class="grow"><div class="t ellipsis">${esc(f.name)}</div>
      <div class="tiny faint">${f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : ""}${off.has(f.path) ? ` · <b class="pos">sul telefono</b>` : ""}</div></div>
      <button class="btn sm" data-act="doc-open" data-id="${f.id}">${ico("arrow", 14)}Apri</button></div>`;
    const all = S.files.length, saved = S.files.filter(f => off.has(f.path)).length;
    return `<section class="card doc-me doc-${mine.s}"><div class="row" style="gap:12px"><span class="doc-ic">${ico(mine.s === "ok" ? "check" : mine.s === "manca" ? "lock" : "alert", 20)}</span>
        <div class="grow"><div class="t">${esc(myP?.doc_type || "Il tuo documento")}${myP?.doc_number ? ` <span class="tiny faint">…${esc(String(myP.doc_number).slice(-4))}</span>` : ""}</div><div class="small">${esc(mine.t)}</div></div>
        <button class="btn sm" data-act="edit-private">${mine.s === "manca" ? "Inserisci" : "Modifica"}</button></div></section>
      ${isAdmin() ? `<section class="card"><div class="label" style="margin-bottom:6px">Controllo del gruppo</div>${going().map(m => { const c = docCheck(S.member_private.find(r => r.member_id === m.id));
        return `<div class="li">${avatar(m, "sm")}<div class="grow"><div class="t">${esc(m.name)}</div><div class="tiny faint">${esc(c.t)}</div></div><span class="doc-dot doc-${c.s}"></span></div>`; }).join("")}
        <div class="tiny faint" style="margin-top:6px">Vedi solo lo stato, i numeri restano nei profili.</div></section>` : ""}
      <section class="card doc-off"><div class="row" style="gap:12px">${ico("upload", 20)}<div class="grow"><div class="t">Sul telefono: ${saved} di ${all}</div><div class="small muted">Salvali ora: in viaggio si aprono anche senza rete.</div></div>
        <button class="btn sm pearl" data-act="doc-save" ${all ? "" : "disabled"}>${saved === all && all ? "Aggiorna" : "Salva tutto"}</button></div></section>
      ${groups.length ? groups.map(({ b, files }) => { const cat = CATEGORIES[b.category] || CATEGORIES.altro; return `<section class="card doc-bk">
        <div class="row" style="gap:12px;margin-bottom:6px"><div class="ib">${ico(cat.icon || "box")}</div><div class="grow"><div class="t">${esc(b.title)}</div>
          <div class="tiny faint">${[b.start_at && fmtDate(b.start_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), b.provider].filter(Boolean).map(esc).join(" · ")}</div></div>
          <button class="btn sm" data-act="booking" data-id="${b.id}">${ico("more", 14)}</button></div>
        ${b.code ? `<div class="doc-code"><span>Codice</span><b>${esc(b.code)}</b><button class="btn sm icon" data-act="copy" data-text="${esc(b.code)}" aria-label="Copia">${ico("copy", 14)}</button></div>` : ""}
        ${b.address ? `<a class="doc-addr" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}" target="_blank" rel="noopener">${ico("pin", 14)}${esc(b.address)}</a>` : ""}
        ${files.map(fileRow).join("") || `<div class="tiny faint">Nessun file: aprilo e carica la conferma o il biglietto.</div>`}</section>`; }).join("")
        : `<section class="card"><div class="small muted">Qui compaiono le prenotazioni confermate, con codici, indirizzi e i file caricati.</div></section>`}
      ${receipts.length ? `<div class="label" style="margin:16px 4px 8px">Scontrini</div><section class="card">${receipts.map(fileRow).join("")}</section>` : ""}`;
  },
};
async function docBlob(f) {
  try { const c = await caches.open(DOC_CACHE); const r = await c.match(docKey(f.path)); if (r) return await r.blob(); } catch { /* niente cache */ }
  if (!api.filesEnabled) return null;
  const urls = await api.fileUrls([f.path]);
  const r = await fetch(urls[f.path]); if (!r.ok) throw new Error("File non raggiungibile");
  return await r.blob();
}
Object.assign(ACTIONS, {
  async "doc-open"(el) {
    const f = S.files.find(x => x.id === el.dataset.id); if (!f) return;
    el.disabled = true;
    try {
      const blob = await docBlob(f); if (!blob) throw new Error("File non disponibile");
      const url = URL.createObjectURL(blob), pdf = /pdf/.test(blob.type) || /\.pdf$/i.test(f.name);
      openSheet(`<h2 class="ellipsis">${esc(f.name)}</h2>${pdf ? `<iframe class="doc-view" src="${url}" title="Documento"></iframe>` : `<img class="doc-view img" src="${url}" alt="">`}
        <div class="actions"><button class="btn" data-act="close-sheet">Chiudi</button><a class="btn primary" href="${url}" download="${esc(f.name)}" target="_blank" rel="noopener">${ico("arrow", 16)}Apri a schermo intero</a></div>`);
    } catch (e) { toast(navigator.onLine ? e.message : "Senza rete: questo file non è ancora salvato sul telefono", "alert"); }
    el.disabled = false;
  },
  async "doc-save"(el) {
    if (!api.filesEnabled || !S.files.length) return;
    el.disabled = true; el.textContent = "Salvo…";
    let ok = 0;
    try {
      const c = await caches.open(DOC_CACHE);
      const urls = await api.fileUrls(S.files.map(f => f.path));
      const off = docOffline();
      for (const f of S.files) {
        try { const r = await fetch(urls[f.path]); if (r.ok) { await c.put(docKey(f.path), new Response(await r.blob(), { headers: { "Content-Type": r.headers.get("Content-Type") || "application/octet-stream" } })); off.add(f.path); ok++; } } catch { /* uno non scaricato */ }
      }
      storage.set(DOC_OFF_KEY, JSON.stringify([...off]));
      toast(`${ok} ${ok === 1 ? "file salvato" : "file salvati"} sul telefono`, "check");
    } catch (e) { toast(e.message, "alert"); }
    render();
  },
});

// ───────────────────────── Stanze e letti ─────────────────────────

const BED_TYPES = {
  doppio: { n: "Matrimoniale", slots: 2 }, singolo: { n: "Singolo", slots: 1 }, castello: { n: "A castello", slots: 2 },
  divanoletto: { n: "Divano letto", slots: 2 }, divano: { n: "Divano", slots: 1 }, materasso: { n: "Materasso", slots: 1 },
};
const bedSvg = (type, picks) => {
  const c = picks.map(p => p ? (member(p.member_id)?.color || "#e6d4ff") : null);
  const sheet = (x, y, w, h, col) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${col || "rgba(255,255,255,.08)"}" ${col ? "" : 'stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3"'}/>`;
  if (type === "doppio" || type === "divanoletto") return `<svg viewBox="0 0 80 64" aria-hidden="true"><rect x="2" y="2" width="76" height="60" rx="9" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)"/>
    <rect x="8" y="7" width="29" height="11" rx="4" fill="rgba(255,255,255,.55)"/><rect x="43" y="7" width="29" height="11" rx="4" fill="rgba(255,255,255,.55)"/>${sheet(6, 22, 33, 36, c[0] && `${c[0]}88`)}${sheet(41, 22, 33, 36, c[1] && `${c[1]}88`)}</svg>`;
  if (type === "castello") return `<svg viewBox="0 0 80 64" aria-hidden="true"><rect x="2" y="2" width="76" height="28" rx="7" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)"/><rect x="2" y="34" width="76" height="28" rx="7" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)"/>
    ${sheet(22, 6, 52, 20, c[0] && `${c[0]}88`)}${sheet(22, 38, 52, 20, c[1] && `${c[1]}88`)}<rect x="7" y="9" width="11" height="14" rx="3" fill="rgba(255,255,255,.55)"/><rect x="7" y="41" width="11" height="14" rx="3" fill="rgba(255,255,255,.55)"/></svg>`;
  return `<svg viewBox="0 0 44 64" aria-hidden="true"><rect x="2" y="2" width="40" height="60" rx="8" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)"/><rect x="8" y="7" width="28" height="11" rx="4" fill="rgba(255,255,255,.55)"/>${sheet(6, 22, 32, 36, c[0] && `${c[0]}88`)}</svg>`;
};
const roomsSorted = () => (S.rooms || []).slice().sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)));
EXTRA_VIEWS.stanze = {
  title: "Stanze e letti", sub: "Ognuno sceglie il suo, niente discussioni all'arrivo",
  view() {
    const rooms = roomsSorted(), picks = S.bed_picks || [];
    const slots = rooms.reduce((a, r) => a + (r.beds || []).reduce((x, b) => x + (BED_TYPES[b.type]?.slots || 1), 0), 0);
    const people = going(), without = people.filter(m => !picks.some(p => p.member_id === m.id));
    const myPick = picks.find(p => p.member_id === ME);
    return `<section class="card st2-sum"><div class="row" style="gap:14px"><div class="pf-ring sm" style="--p:${people.length ? Math.round(100 * (people.length - without.length) / people.length) : 0}"><b>${people.length - without.length}/${people.length}</b></div>
        <div class="grow"><div class="t">${myPick ? `Dormi in ${esc(rooms.find(r => r.id === myPick.room_id)?.name || "una stanza")}` : rooms.length ? "Scegli il tuo letto" : "Le stanze arrivano presto"}</div>
          <div class="small muted">${rooms.length ? `${xPlural(slots, "posto letto", "posti letto")} per ${xPlural(people.length, "persona", "persone")}${slots < people.length ? ` · <b class="neg">mancano ${people.length - slots} posti</b>` : ""}` : isAdmin() ? "Disegna le stanze dell'alloggio: poi ognuno sceglie dove dormire." : "L'organizzatore sta disegnando le stanze dell'alloggio."}</div></div></div>
        ${without.length && rooms.length ? `<div class="st2-wait">${without.map(m => `<span>${avatar(m, "sm")}${esc(m.id === ME ? "Tu" : m.name)}</span>`).join("")}</div>` : ""}</section>
      <div class="st2-plan">${rooms.map(r => `<section class="st2-room">
        <div class="st2-rh"><b>${esc(r.name)}</b>${isAdmin() ? `<button class="st2-edit" data-act="room-edit" data-id="${r.id}" aria-label="Modifica">${ico("edit", 13)}</button>` : ""}</div>
        <div class="st2-beds">${(r.beds || []).map(b => { const n = BED_TYPES[b.type]?.slots || 1, ps = Array.from({ length: n }, (_, s) => picks.find(p => p.room_id === r.id && p.bed === b.k && p.slot === s) || null);
          return `<div class="st2-bed"><div class="st2-art">${bedSvg(b.type, ps)}<div class="st2-slots s${n}${b.type === "castello" ? " v" : ""}">${ps.map((p, s) => p
            ? `<button class="st2-who${p.member_id === ME ? " me" : ""}" data-act="bed-pick" data-r="${r.id}" data-b="${esc(b.k)}" data-s="${s}">${avatar(member(p.member_id), "sm")}</button>`
            : `<button class="st2-free" data-act="bed-pick" data-r="${r.id}" data-b="${esc(b.k)}" data-s="${s}" aria-label="Scegli">${ico("plus", 14)}</button>`).join("")}</div></div>
            <div class="tiny faint">${esc(b.label || BED_TYPES[b.type]?.n || "Letto")}</div></div>`; }).join("")}</div></section>`).join("")}</div>
      ${isAdmin() ? `<button class="btn block" style="margin:12px 0 18px" data-act="room-edit">${ico("plus", 17)}Aggiungi una stanza</button>` : ""}`;
  },
};
function roomSheet(id) {
  const r = (S.rooms || []).find(x => x.id === id) || { name: "", beds: [] };
  let beds = (r.beds || []).map(b => ({ ...b }));
  const paint = () => {
    $("#rm-beds").innerHTML = beds.length ? beds.map((b, i) => `<div class="li"><div class="grow"><b>${esc(BED_TYPES[b.type]?.n || b.type)}</b><span class="tiny faint"> · ${xPlural(BED_TYPES[b.type]?.slots || 1, "posto", "posti")}</span></div><button type="button" class="btn sm icon" data-rm="${i}" aria-label="Togli">${ico("trash", 14)}</button></div>`).join("") : `<div class="small muted">Aggiungi i letti con i tasti qui sotto.</div>`;
  };
  openSheet(`<h2>${id ? "Modifica stanza" : "Nuova stanza"}</h2><form id="rm-form">
    <div class="field"><label>Nome</label><input name="name" required maxlength="40" value="${esc(r.name)}" placeholder="Es. Camera grande, Soggiorno"></div>
    <div class="label" style="margin:12px 4px 6px">Letti</div><section class="card" id="rm-beds" style="padding:6px 16px"></section>
    <div class="chips" style="margin-top:10px">${Object.entries(BED_TYPES).map(([k, t]) => `<button type="button" class="chip" data-add="${k}">${ico("plus", 13)}${t.n}</button>`).join("")}</div>
    <div class="actions">${id ? `<button type="button" class="btn danger" data-act="room-del" data-id="${id}">Elimina</button>` : `<button type="button" class="btn" data-act="close-sheet">Annulla</button>`}<button class="btn primary">Salva</button></div></form>`);
  paint();
  const f = $("#rm-form");
  f.addEventListener("click", e => {
    const a = e.target.closest("[data-add]"), d = e.target.closest("[data-rm]");
    if (a) { beds.push({ k: Math.random().toString(36).slice(2, 7), type: a.dataset.add }); paint(); }
    if (d) { beds.splice(Number(d.dataset.rm), 1); paint(); }
  });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const name = new FormData(f).get("name").trim(); if (!name) return;
    try {
      if (id) await api.update("rooms", { id }, { name, beds });
      else await api.insert("rooms", { name, beds, sort: (S.rooms || []).length, created_by: ME });
      closeSheet(); toast("Stanza salvata", "check"); await reload();
    } catch (err) { toast(/rooms/.test(err.message) ? "Serve l'aggiornamento 10 del database" : err.message, "alert"); }
  });
}
async function bedSet(memberId, r, b, s) {
  try {
    if (memberId) await api.upsert("bed_picks", { member_id: memberId, room_id: r, bed: b, slot: s });
    await reload();
  } catch (e) { toast(/duplicate|unique/i.test(e.message) ? "Qualcuno l'ha appena preso" : /bed_picks/.test(e.message) ? "Serve l'aggiornamento 10 del database" : e.message, "alert"); await reload(); }
}
Object.assign(ACTIONS, {
  "room-edit": el => roomSheet(el.dataset.id),
  async "room-del"(el) {
    if (!confirm("Eliminare la stanza? Chi ci dormiva dovrà scegliere di nuovo.")) return;
    try { await api.remove("rooms", { id: el.dataset.id }); closeSheet(); await reload(); } catch (e) { toast(e.message, "alert"); }
  },
  async "bed-pick"(el) {
    const { r, b } = el.dataset, s = Number(el.dataset.s);
    const taken = (S.bed_picks || []).find(p => p.room_id === r && p.bed === b && p.slot === s);
    if (taken) {
      if (taken.member_id === ME || isAdmin()) {
        if (!confirm(taken.member_id === ME ? "Lasci libero questo posto?" : `Togli ${mname(taken.member_id)} da questo posto?`)) return;
        try { await api.remove("bed_picks", { member_id: taken.member_id }); await reload(); } catch (e) { toast(e.message, "alert"); }
      } else toast(`Qui dorme ${mname(taken.member_id)}`, "bed");
      return;
    }
    if (!isAdmin()) return bedSet(ME, r, b, s);
    const free = going().filter(m => !(S.bed_picks || []).some(p => p.member_id === m.id));
    openSheet(`<h2>Chi dorme qui?</h2><section class="card" style="padding:6px 16px">${[me(), ...free.filter(m => m.id !== ME)].filter(Boolean).map(m => `<button class="li tap" style="width:100%;background:none;border:0;color:inherit;text-align:left" data-bed-who="${m.id}">${avatar(m, "sm")}<span class="grow">${esc(m.id === ME ? `${m.name} (tu)` : m.name)}</span></button>`).join("")}</section>`);
    $("#sheet .sheet-panel").addEventListener("click", e => { const w = e.target.closest("[data-bed-who]"); if (w) { closeSheet(); bedSet(w.dataset.bedWho, r, b, s); } });
  },
});

// ───────────────────────── Il riassunto finale ─────────────────────────
// Una storia a schede del viaggio: numeri, soldi, chat, foto, giochi, playlist e le frasi scelte da Zampone.

const RIC_KEY = "capodanno-ricordi";
const STOP = new Set("a ad al alla alle anche che chi ci con da dal dei del della di e è ed gli ha ho i il in io la le lo ma mi ne no non o per più poi se si sì sono su tu tra un una uno va vi è ok ah eh oh boh si'".split(" "));
function ricData() {
  const t = trip(), grp = S.messages.filter(m => m.channel === "gruppo" && m.member_id && m.content);
  const cnt = new Map(); grp.forEach(m => cnt.set(m.member_id, (cnt.get(m.member_id) || 0) + 1));
  const talkers = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ m: member(id), n })).filter(x => x.m);
  const late = new Map(); grp.forEach(m => { const h = new Date(m.created_at).getHours(); if (h >= 0 && h < 5) late.set(m.member_id, (late.get(m.member_id) || 0) + 1); });
  const owl = [...late.entries()].sort((a, b) => b[1] - a[1])[0];
  const hours = Array(24).fill(0); grp.forEach(m => hours[new Date(m.created_at).getHours()]++);
  const peak = hours.indexOf(Math.max(...hours));
  const words = new Map(); grp.forEach(m => String(m.content).toLowerCase().replace(/[^\p{L}\s']/gu, " ").split(/\s+/).forEach(w => { if (w.length > 3 && !STOP.has(w)) words.set(w, (words.get(w) || 0) + 1); }));
  const topWords = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  const exp = S.expenses.filter(e => !isPayment(e)), spent = exp.reduce((a, e) => a + Number(e.amount), 0);
  const byCat = {}; exp.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const biggest = exp.slice().sort((a, b) => b.amount - a.amount)[0];
  const going_ = going(), dest = t.destination;
  const days = t.start_date && t.end_date ? Math.round((new Date(t.end_date) - new Date(t.start_date)) / 864e5) + 1 : null;
  const games = {}; (S.scores || []).forEach(s => { (games[s.game] ||= []).push(s); });
  const champs = Object.entries(games).map(([g, rows]) => {
    const kind = (window.GAMES?.[g] || GAMES[g])?.kind, per = new Map();
    rows.forEach(r => { const v = per.get(r.member_id); per.set(r.member_id, kind === "time" ? Math.min(v ?? Infinity, r.score) : kind === "points" ? Math.max(v ?? -Infinity, r.score) : (v || 0) + 1); });
    const best = [...per.entries()].sort((a, b) => (kind === "time" ? a[1] - b[1] : b[1] - a[1]))[0];
    return { g: (GAMES[g]?.label) || g, m: member(best?.[0]), n: rows.length };
  }).filter(x => x.m).sort((a, b) => b.n - a.n).slice(0, 4);
  const played = new Map(); (S.scores || []).forEach(s => played.set(s.member_id, (played.get(s.member_id) || 0) + 1));
  const gamer = [...played.entries()].sort((a, b) => b[1] - a[1])[0];
  return { t, dest, days, people: going_.length || S.members.length, msgs: grp.length, talkers, owl: owl && { m: member(owl[0]), n: owl[1] }, peak, topWords,
    spent, perHead: spent / Math.max(1, going_.length || S.members.length), topCat, biggest, photos: (S.photos || []).slice(-9).reverse(), polls: S.polls.length, votes: S.votes.length,
    champs, gamer: gamer && { m: member(gamer[0]), n: gamer[1] }, songs: plSorted().slice(0, 3), year: countdownTarget()?.getFullYear?.() || new Date().getFullYear() };
}
const ricSaved = () => { const f = S.trip?.[0]?.flags?.ricordi; if (f) return f; try { return JSON.parse(storage.get(RIC_KEY)); } catch { return null; } };
EXTRA_VIEWS.ricordi = {
  title: "Ricordi", sub: "Il nostro Capodanno, in una storia",
  view() {
    const d = ricData(), z = ricSaved();
    const slide = (cls, html) => `<section class="rc-s ${cls}">${html}</section>`;
    const big = (n, l) => `<div class="rc-n"><b>${n}</b><span>${l}</span></div>`;
    const slides = [
      slide("c1", `<div class="rc-k">Capodanno ${d.year}</div><div class="rc-t">${esc(z?.titolo || d.dest || "Il nostro viaggio")}</div>
        <div class="rc-sub">${d.t.start_date ? esc(`${fmtDate(d.t.start_date, { day: "numeric", month: "long" })} – ${fmtDate(d.t.end_date || d.t.start_date, { day: "numeric", month: "long" })}`) : "Date da decidere"}</div>
        <div class="rc-avs">${going().concat(going().length ? [] : S.members).slice(0, 14).map(m => avatar(m, "sm")).join("")}</div>
        ${z?.racconto ? `<p class="rc-p">${esc(z.racconto)}</p>` : ""}`),
      slide("c2", `<div class="rc-k">I numeri</div><div class="rc-grid">${[d.days ? big(d.days, d.days === 1 ? "giorno" : "giorni") : "", big(d.people, "persone"), big(d.msgs.toLocaleString("it-IT"), "messaggi"), big((S.photos || []).length, "foto"), big(d.polls, "sondaggi"), big(d.votes, "voti")].join("")}</div>`),
      slide("c3", `<div class="rc-k">I soldi</div><div class="rc-t">${eur(d.spent)}</div><div class="rc-sub">spesi in tutto · ${eur(d.perHead)} a testa</div>
        ${d.topCat ? `<p class="rc-p">La voce più cara: <b>${esc((EXP_CATS[d.topCat[0]] || EXP_CATS.altro)[0].toLowerCase())}</b>, ${eur(d.topCat[1])}.</p>` : ""}
        ${d.biggest ? `<p class="rc-p">La spesa più grossa: <b>${esc(d.biggest.title)}</b> (${eur(Number(d.biggest.amount))}).</p>` : ""}`),
      slide("c4", `<div class="rc-k">La chat</div>${d.talkers.length ? `<div class="rc-podium">${d.talkers.map((x, i) => `<div class="p${i}">${avatar(x.m, "sm")}<b>${esc(x.m.name)}</b><span>${x.n.toLocaleString("it-IT")} msg</span></div>`).join("")}</div>` : `<p class="rc-p">Ancora silenzio in chat.</p>`}
        ${d.owl?.m ? `<p class="rc-p">Il gufo: <b>${esc(d.owl.m.name)}</b>, ${xPlural(d.owl.n, "messaggio", "messaggi")} tra mezzanotte e le cinque.</p>` : ""}
        ${d.msgs ? `<p class="rc-p">L'ora più chiacchierata: le <b>${d.peak}</b>.</p>` : ""}
        ${d.topWords.length ? `<div class="rc-words">${d.topWords.map(w => `<span>${esc(w)}</span>`).join("")}</div>` : ""}`),
      d.photos.length ? slide("c5", `<div class="rc-k">Le foto</div><div class="rc-photos">${d.photos.map(p => `<img src="${esc(photoUrl(p.path))}" alt="" loading="lazy">`).join("")}</div>`) : "",
      slide("c6", `<div class="rc-k">I giochi</div>${d.gamer?.m ? `<p class="rc-p">Il più accanito: <b>${esc(d.gamer.m.name)}</b>, ${xPlural(d.gamer.n, "partita", "partite")}.</p>` : ""}
        ${d.champs.length ? d.champs.map(c => `<div class="rc-row">${avatar(c.m, "sm")}<span class="grow"><b>${esc(c.m.name)}</b> re di ${esc(c.g)}</span></div>`).join("") : `<p class="rc-p">Nessuna partita ancora: c'è tempo.</p>`}
        ${d.songs.length ? `<div class="rc-k" style="margin-top:16px">La top della playlist</div>${d.songs.map((s, i) => `<div class="rc-row"><b class="rc-i">${i + 1}</b><span class="grow ellipsis">${esc(s.title)}<em> ${esc(s.artist || "")}</em></span></div>`).join("")}` : ""}`),
      slide("c7", `<div class="rc-k">Le frasi da ricordare</div>${z?.frasi?.length ? z.frasi.slice(0, 6).map(f => `<blockquote class="rc-q">«${esc(f.testo)}»<cite>${esc(f.chi)}</cite></blockquote>`).join("")
          : `<p class="rc-p">${AI()} rilegge la chat di gruppo e sceglie le frasi migliori, più qualche premio.</p>`}
        ${z?.premi?.length ? `<div class="rc-k" style="margin-top:14px">I premi</div>${z.premi.slice(0, 5).map(p => `<div class="rc-prize"><b>${esc(p.premio)}</b><span>${esc(p.chi)} · ${esc(p.perche || "")}</span></div>`).join("")}` : ""}
        <button class="btn pearl block" style="margin-top:14px" data-act="ric-ai">${ico("spark", 16)}${z ? "Rifallo" : `Chiedi a ${AI()}`}</button>`),
      slide("c8", `<div class="rc-t" style="margin-top:auto">Alla prossima.</div><div class="rc-sub">Stesso gruppo, nuovo anno.</div>
        <button class="btn block" style="margin-top:18px" data-act="ric-share">${ico("share", 16)}Condividi il riassunto</button>`),
    ].filter(Boolean);
    return `<div class="rc-dots" id="rc-dots">${slides.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>
      <div class="rc-track" id="rc-track" data-noswipe>${slides.join("")}</div>
      <p class="tiny faint" style="text-align:center;margin:8px 0 18px">Scorri di lato. Si aggiorna da solo fino alla fine del viaggio.</p>`;
  },
  mount() {
    const tr = $("#rc-track"); if (!tr) return;
    tr.addEventListener("scroll", () => { const i = Math.round(tr.scrollLeft / tr.clientWidth); $$("#rc-dots i").forEach((d, k) => d.classList.toggle("on", k === i)); }, { passive: true });
  },
};
Object.assign(ACTIONS, {
  async "ric-ai"(el) {
    if (!CLOUD) return toast("Disponibile col database collegato", "alert");
    el.disabled = true; el.innerHTML = `${ico("spark", 16)}${AI()} rilegge la chat…`;
    try {
      const { data, error } = await api.sb.functions.invoke("assistente", { body: { mode: "ricordi" } });
      if (error) throw error;
      if (!data?.frasi?.length) throw new Error("La chat è ancora troppo corta");
      storage.set(RIC_KEY, JSON.stringify(data));
      if (isAdmin()) { const flags = { ...(S.trip?.[0]?.flags || {}), ricordi: data }; try { await api.update("trip", { id: 1 }, { flags }); if (S.trip?.[0]) S.trip[0].flags = flags; } catch { /* resta sul telefono */ } }
      render();
    } catch (e) { toast(e.message || "Non ci sono riuscito", "alert"); el.disabled = false; el.innerHTML = `${ico("spark", 16)}Riprova`; }
  },
  "ric-share"() {
    const d = ricData(), z = ricSaved();
    const text = [`Capodanno ${d.year}${d.dest ? ` a ${d.dest}` : ""}`, z?.racconto, `${d.people} persone, ${d.msgs} messaggi, ${(S.photos || []).length} foto, ${eur(d.spent)} spesi (${eur(d.perHead)} a testa).`,
      ...(z?.frasi || []).slice(0, 3).map(f => `«${f.testo}» (${f.chi})`)].filter(Boolean).join("\n");
    if (navigator.share) navigator.share({ title: "Il nostro Capodanno", text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => toast("Riassunto copiato", "copy"));
  },
});
