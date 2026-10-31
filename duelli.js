/* Capodanno - duelli 1 contro 1: Miniera e GeoScatto.
   - Miniera: ognuno scava il suo tunnel dal proprio lato verso il centro; i numeri sui blocchi scavati dicono quanto
     valgono i minerali intorno, il puntino rosso avvisa della TNT. 12 picconate a testa. Contro un amico o il telefono.
   - GeoScatto: cinque foto vere da qualche parte nel mondo (da Wikipedia), 45 secondi per piazzare il segnaposto
     sul mappamondo; più sei vicino più punti. Sfida a un amico sulle stesse foto, o allenamento.
   La partita online sta nella tabella «duels»: la mappa nasce da un seme, ogni telefono la ricostruisce dalle mosse. */
"use strict";

const DU = { games: [], view: null, shown: new Set(), waiting: null };
const DKIND = { miniera: "Miniera", geo: "GeoScatto", onorevoli: "Onorevoli" };
const DICO = { miniera: "pick", geo: "pin", onorevoli: "trophy" };
const DDESC = {
  miniera: ["Due tunnel, dodici picconate a testa: vince chi raccoglie di più.", "Ognuno scava il suo tunnel verso il centro, dove ci sono i tesori. I numeri dicono quanto vale ciò che c'è intorno, il puntino rosso avvisa della TNT."],
  geo: ["Cinque foto, stesso mondo: vince chi ci va più vicino.", "Una foto vera, un mappamondo, 45 secondi. Cinque round, vince chi sbaglia di meno."],
  onorevoli: ["Tre onorevoli a testa, a turno, a colpi di frasi celebri.", "Scegli tre politici e giornalisti e sfida un amico: si colpisce a turno con le loro frasi celebri. Satira, non cronaca."],
};
async function duRpc(fn, args) { const { data, error } = await api.sb.rpc(fn, args); if (error) throw new Error(error.message); return data; }
function duUpsert(row) { if (!row?.id) return; const i = DU.games.findIndex(g => g.id === row.id); if (i >= 0) DU.games[i] = row; else DU.games.unshift(row); }
async function duLoad() {
  if (!CLOUD) return;
  const { data, error } = await api.sb.from("duels").select("*").order("updated_at", { ascending: false }).limit(150);
  if (error) return;
  DU.games = data || []; DU.games.forEach(duPrompt);
}
window.onDuelChange = payload => {
  const row = payload.new && payload.new.id ? payload.new : null; if (!row) return;
  duUpsert(row);
  if (DU.view?.id === row.id) DU.view.update(row);
  if (DU.waiting === row.id && row.status !== "invited") {
    DU.waiting = null;
    if (row.status === "active") openDuel(row); else { closeGame(); toast(row.status === "declined" ? `${mname(row.players[1])} ha rifiutato` : "Sfida annullata"); }
  }
  duPrompt(row);
  // Verdetto di GeoScatto arrivato quando la partita è già chiusa sul telefono.
  if (row.kind === "geo" && row.status === "over" && row.players.includes(ME) && DU.view?.id !== row.id && !DU.told?.has(row.id) && Date.now() - new Date(row.updated_at || 0) < 600000) {
    (DU.told ||= new Set()).add(row.id);
    const s = row.players.indexOf(ME), w = row.result?.winner, sc = row.result?.score || [];
    toast(`GeoScatto con ${mname(row.players[1 - s])}: ${w == null ? "pareggio" : w === s ? "hai vinto" : "hai perso"} ${sc.length ? `(${(sc[s] || 0).toLocaleString("it-IT")} a ${(sc[1 - s] || 0).toLocaleString("it-IT")})` : ""}`, "pin");
  }
};
function duPrompt(g) {
  if (g.status !== "invited" || g.players[1] !== ME || DU.shown.has(g.id) || Date.now() - new Date(g.created_at) > 20 * 60000 || !$("#game").hidden) return;
  DU.shown.add(g.id);
  openSheet(`<div class="duel-invite"><div class="game-ico big">${ico(DICO[g.kind], 36)}</div>
    <div class="serif" style="font-size:28px">${esc(mname(g.created_by))} ti sfida a ${DKIND[g.kind]}</div>
    <div class="small muted" style="margin:6px 0 18px">${DDESC[g.kind][0]}</div>
    <div class="actions"><button class="btn" data-act="du-answer" data-id="${g.id}" data-ok="0">No grazie</button><button class="btn primary" data-act="du-answer" data-id="${g.id}" data-ok="1">Accetto</button></div></div>`);
  navigator.vibrate?.([30, 50, 30]);
}
function duCard(kind) {
  const mine = DU.games.filter(g => g.kind === kind && g.players.includes(ME));
  const fresh = g => Date.now() - new Date(g.created_at) < 20 * 60000;
  const row = (g, right) => `<div class="li"><div class="cb-vs">${g.players.map(id => avatar(member(id), "sm")).join("")}</div><div class="grow"><div class="t">contro ${esc(mname(g.players.find(p => p !== ME)))}</div><div class="tiny faint">${g.status === "invited" ? "in attesa" : "in corso"}</div></div>${right}</div>`;
  return `<section class="card game-card" id="du-card-${kind}">
    <div class="row top"><div class="game-ico">${ico(DICO[kind], 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">${DKIND[kind]}</div>
      <div class="small muted" style="margin-top:6px">${DDESC[kind][1]}</div></div></div>
    ${mine.filter(g => g.status === "invited" && fresh(g) && g.players[1] === ME).map(g => row(g, `<button class="btn sm" data-act="du-answer" data-id="${g.id}" data-ok="0">No</button><button class="btn sm primary" data-act="du-answer" data-id="${g.id}" data-ok="1">Gioca</button>`)).join("")}
    ${mine.filter(g => g.status === "invited" && fresh(g) && g.created_by === ME).map(g => row(g, `<button class="btn sm" data-act="du-cancel" data-id="${g.id}">Annulla</button>`)).join("")}
    ${mine.filter(g => g.status === "active").map(g => row(g, `<button class="btn sm primary" data-act="du-open" data-id="${g.id}">Riprendi</button>`)).join("")}
    <div class="grid2" style="margin-top:14px;gap:8px"><button class="btn pearl block" data-act="du-challenge" data-k="${kind}">${ico("swap", 17)}Sfida</button><button class="btn block" data-act="du-solo" data-k="${kind}">${ico("device", 17)}${kind === "geo" ? "Allenamento" : "Contro il telefono"}</button></div>
  </section>`;
}
window.mineCard = () => duCard("miniera");
window.geoCard = () => duCard("geo");
window.onoCard = () => { loadPolFaces(); return duCard("onorevoli"); };
function duRank(kind, label) {
  const W = new Map();
  for (const g of DU.games.filter(g => g.kind === kind && g.status === "over" && g.result)) g.players.forEach((id, s) => { const r = W.get(id) || { id, w: 0, p: 0 }; r.p++; if (g.result.winner === s) r.w++; W.set(id, r); });
  const lb = [...W.values()].filter(r => member(r.id)).sort((a, b) => b.w - a.w || a.p - b.p).slice(0, 10);
  const solo = kind === "geo" ? leaderboard("geo").slice(0, 5) : [];
  return `<section class="card"><div class="row" style="gap:10px;margin-bottom:${lb.length || solo.length ? 12 : 0}px">${ico(DICO[kind], 18)}<div class="t grow">${label}</div>${lb.length || solo.length ? "" : `<span class="small faint">ancora nessuno</span>`}</div>
    ${lb.map((r, i) => `<div class="li rank ${r.id === ME ? "me" : ""}"><span class="pos p${i + 1}">${i + 1}</span>${avatar(member(r.id), "sm")}<span class="grow t ellipsis">${esc(mname(r.id))}</span><span class="tiny faint">${r.p} sfide</span><b class="num">${r.w} vinte</b></div>`).join("")}
    ${solo.length ? `<div class="tiny faint" style="margin:8px 0 4px">Record in allenamento</div>${solo.map((s, i) => `<div class="li rank"><span class="pos">${i + 1}</span>${avatar(member(s.member_id), "sm")}<span class="grow t">${esc(mname(s.member_id))}</span><b class="num">${s.score}</b></div>`).join("")}` : ""}</section>`;
}
window.mineRankCard = () => duRank("miniera", "Miniera");
window.geoRankCard = () => duRank("geo", "GeoScatto");
window.onoRankCard = () => duRank("onorevoli", "Onorevoli · sfide");
GAMES.geo = { label: "GeoScatto", icon: "pin", kind: "points" };

function duChallenge(kind) {
  if (!CLOUD) return toast("Le sfide online funzionano con il database collegato: intanto prova da solo");
  openSheet(`<h2>Sfida a ${DKIND[kind]}</h2><div class="stack" style="gap:6px">${S.members.filter(m => m.id !== ME).map(m => `<div class="li">${avatar(m, "sm")}<div class="grow t">${esc(m.name)}</div><button class="btn sm primary" data-act="du-invite" data-k="${kind}" data-id="${m.id}">Sfida</button></div>`).join("")}</div>`);
}
async function duInvite(kind, opp) {
  closeSheet();
  try {
    let data = {};
    if (kind === "geo") { toast("Cerco cinque foto nel mondo…", "pin"); data = { rounds: await geoRounds(5) }; }
    const g = await duRpc("duel_create", { p_opp: opp, p_kind: kind, p_data: data });
    duUpsert(g); DU.waiting = g.id; api.notify("sfida", g.id);
    openGame(`<div class="duel-wait">${avatar(member(opp), "lg")}<div class="serif" style="font-size:30px;margin-top:16px">Aspetto ${esc(mname(opp))}…</div>
      <div class="small muted" style="margin-top:8px">${DKIND[kind]} · gli è arrivata una notifica.</div><button class="btn" style="margin-top:22px" data-act="du-cancel" data-id="${g.id}">Annulla</button></div>`);
    gameCleanup = () => { if (DU.waiting === g.id) DU.waiting = null; };
  } catch (e) { toast(/duel_create/.test(e.message) ? "Serve aggiornamento-4.sql su Supabase" : e.message, "alert"); }
}
const openDuel = g => (g.kind === "miniera" ? playMine({ online: true, game: g }) : g.kind === "onorevoli" ? playOno({ online: g }) : playGeo({ online: true, game: g }));

// ───────────────────────── Miniera ─────────────────────────

// Regole nuove: ognuno scava un tunnel partendo dal proprio lato (tu dal basso, l'avversario dall'alto) e può
// scavare solo blocchi attaccati al proprio tunnel. Ogni blocco scavato mostra un numero: quanto valgono i minerali
// nascosti nei blocchi intorno; il puntino rosso avvisa che lì vicino c'è TNT. 12 picconate a testa, vince chi
// raccoglie di più. La mappa è speculare: le due metà valgono uguale, al centro ci sono i tesori migliori.
const MW = 9, MH = 9, MPICKS = 12;
const MAT = {
  dirt: { v: 0, n: "Terra" }, stone: { v: 0, n: "Pietra" }, coal: { v: 1, n: "Carbone" }, iron: { v: 2, n: "Ferro" },
  gold: { v: 4, n: "Oro" }, diamond: { v: 7, n: "Diamante" }, tnt: { v: -4, n: "TNT" },
};
// Texture 16×16 in pixel art, generate una volta in un canvas.
const TEX = {};
function makeTex(name) {
  if (TEX[name]) return TEX[name];
  const c = document.createElement("canvas"); c.width = c.height = 16; const x = c.getContext("2d");
  const rnd = seededRand(hashStr(name));
  const px = (col, i, j) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
  const base = { grass: ["#6b4a2b", "#7a5532", "#5e4026"], dirt: ["#6b4a2b", "#7a5532", "#5e4026"], stone: ["#7d7d84", "#8c8c93", "#6e6e75"], lava: ["#e2581e", "#f07a1e", "#c43d12"], tnt: ["#c0392b", "#d84a3a", "#a83226"] }[["coal", "iron", "gold", "diamond"].includes(name) ? "stone" : name];
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) px(base[Math.floor(rnd() * 3)], i, j);
  if (name === "grass") for (let i = 0; i < 16; i++) for (let j = 0; j < 4 + Math.floor(rnd() * 2); j++) px(["#5fae3a", "#6cc045", "#4f9a30"][Math.floor(rnd() * 3)], i, j);
  const ore = { coal: ["#1d1d22", "#33333a"], iron: ["#d8b48f", "#c49a73"], gold: ["#f7d34a", "#e5b42a"], diamond: ["#6ff2e6", "#3ad6cb"] }[name];
  if (ore) for (let k = 0; k < 7; k++) { const i = 2 + Math.floor(rnd() * 11), j = 2 + Math.floor(rnd() * 11); px(ore[0], i, j); px(ore[1], i + 1, j); px(ore[0], i, j + 1); px(ore[1], i + 1, j + 1); }
  if (name === "tnt") { x.fillStyle = "#f1ece0"; x.fillRect(0, 6, 16, 4); x.fillStyle = "#1d1d22"; [[2, 7], [3, 7], [4, 7], [3, 8], [6, 7], [7, 8], [8, 7], [6, 8], [8, 8], [10, 7], [11, 7], [12, 7], [11, 8]].forEach(([i, j]) => x.fillRect(i, j, 1, 1)); }
  if (name === "lava") for (let k = 0; k < 10; k++) px("#ffd27a", Math.floor(rnd() * 16), Math.floor(rnd() * 16));
  return (TEX[name] = c.toDataURL());
}
function mineMap(seed) {
  const rnd = seededRand(seed >>> 0);
  const cells = Array(MW * MH).fill("dirt").map(() => (rnd() < 0.5 ? "stone" : "dirt"));
  const half = r => r <= 3; // metà alta: righe 0-3, la riga 4 è il centro condiviso
  const put = (m, n, rows) => {
    for (let k = 0; k < n; k++) for (let t = 0; t < 60; t++) {
      const r = rows[Math.floor(rnd() * rows.length)], c = Math.floor(rnd() * MW), i = r * MW + c;
      if (["dirt", "stone"].includes(cells[i])) { cells[i] = m; break; }
    }
  };
  put("coal", 3, [0, 1, 2]); put("iron", 3, [1, 2, 3]); put("gold", 2, [2, 3]); put("diamond", 1, [3]); put("tnt", 2, [1, 2, 3]);
  // Centro: un diamante in mezzo, oro ai lati, una TNT di guardia (simmetrico a destra e sinistra).
  const mid = 4 * MW;
  for (let c = 0; c < MW; c++) cells[mid + c] = rnd() < 0.5 ? "stone" : "dirt";
  cells[mid + 4] = "diamond";
  const g = 1 + Math.floor(rnd() * 2); cells[mid + g] = "gold"; cells[mid + MW - 1 - g] = "gold";
  const t = rnd() < 0.5 ? 3 : 5; cells[mid + t] = "tnt";
  // Metà bassa = specchio della metà alta: stessa fortuna per tutti e due.
  for (let r = 0; r < 4; r++) for (let c = 0; c < MW; c++) cells[(MH - 1 - r) * MW + c] = cells[r * MW + c];
  void half;
  return cells;
}
const mineHome = s => (s === 0 ? MH - 1 : 0);
const mineNb4 = i => { const r = Math.floor(i / MW), c = i % MW; return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < MH && b >= 0 && b < MW).map(([a, b]) => a * MW + b); };
const mineNb8 = i => { const r = Math.floor(i / MW), c = i % MW, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const a = r + dr, b = c + dc; if ((dr || dc) && a >= 0 && a < MH && b >= 0 && b < MW) out.push(a * MW + b); } return out; };
function mineCanDig(st, i, s) { return st.open[i] == null && (Math.floor(i / MW) === mineHome(s) || mineNb4(i).some(j => st.open[j] === s)); }
// Indizi di un blocco scavato: valore dei minerali ancora sepolti intorno e se c'è TNT vicina.
function mineClue(map, st, i) {
  let v = 0, tnt = false;
  for (const j of mineNb8(i)) if (st.open[j] == null) { if (map[j] === "tnt") tnt = true; else v += MAT[map[j]].v; }
  return { v, tnt };
}
function mineState(map, actions) {
  const st = { open: Array(map.length).fill(null), score: [0, 0], picks: [MPICKS, MPICKS], lan: [false, false], turn: 0, over: false, last: null, found: [[], []] };
  for (const a of actions) {
    const s = st.turn;
    if (a.lan) st.lan[s] = true;
    const i = a.i;
    st.picks[s]--;
    if (i != null && mineCanDig(st, i, s)) {
      const m = map[i];
      st.open[i] = s; st.score[s] += MAT[m].v; st.last = { i, s, m, blast: [] };
      if (MAT[m].v > 0) st.found[s].push(m);
      if (m === "tnt") for (const j of mineNb8(i)) if (st.open[j] == null) { st.open[j] = "x"; st.last.blast.push(j); }
    } else st.last = { i: null, s, m: null, blast: [] };
    const o = 1 - s;
    st.turn = st.picks[o] > 0 ? o : s;
  }
  const left = map.some((m, i) => st.open[i] == null && MAT[m].v > 0);
  st.over = (st.picks[0] <= 0 && st.picks[1] <= 0) || !left;
  return st;
}
// Il telefono ragiona sugli indizi come farebbe una persona: segue i numeri alti e sta lontano dai puntini rossi.
function mineCpu(map, st, s = 1) {
  const cand = map.map((_, i) => i).filter(i => mineCanDig(st, i, s));
  if (!cand.length) return null;
  const score = i => {
    let est = 0, danger = 0;
    for (const j of mineNb8(i)) if (st.open[j] != null && st.open[j] !== "x") {
      const hidden = mineNb8(j).filter(k => st.open[k] == null).length || 1, cl = mineClue(map, st, j);
      est += cl.v / hidden; if (cl.tnt) danger += 1 / hidden;
    }
    const toward = s === 1 ? Math.floor(i / MW) : MH - 1 - Math.floor(i / MW); // verso il centro ricco
    return est * 1.2 - danger * 6 + toward * 0.35 + Math.random() * 0.6;
  };
  return cand.sort((a, b) => score(b) - score(a))[0];
}
function playMine(opts) {
  const online = !!opts.online;
  let game = online ? opts.game : { id: null, players: [ME, "cpu"], seed: Math.floor(Math.random() * 2147483647), actions: [] };
  const mySeat = online ? game.players.indexOf(ME) : 0, oSeat = 1 - mySeat;
  const map = mineMap(game.seed);
  let st = mineState(map, game.actions), lanMode = false, pending = false, cpuT = null, peek = new Set(), finished = false;
  const name = s => (online ? mname(game.players[s]) : s === 0 ? "Tu" : "Telefono");
  ["grass", "dirt", "stone", "coal", "iron", "gold", "diamond", "tnt"].forEach(makeTex);
  // Le righe si girano così il tuo lato è sempre in basso.
  const order = [...Array(MH).keys()].map(dr => (mySeat === 0 ? dr : MH - 1 - dr)).flatMap(r => [...Array(MW).keys()].map(c => r * MW + c));
  openGame(`
    <div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Miniera</div><div class="tiny faint">${online ? `Sfida con ${esc(name(oSeat))}` : "Contro il telefono"}</div></div>
      <button class="btn icon sm" id="mn-help" aria-label="Regole">?</button></div>
    <div class="mn-score" id="mn-score"></div>
    <div class="mn-side top">${esc(online ? name(oSeat) : "Telefono")} scava da qui</div>
    <div class="mn-grid" id="mn-grid" style="--w:${MW}"></div>
    <div class="mn-side bottom">Il tuo ingresso</div>
    <div class="mn-msg" id="mn-msg"></div>
    <div class="row" style="gap:8px;max-width:440px;width:100%;margin:10px auto 0"><button class="btn grow" id="mn-lan">${ico("sun", 16)}Lanterna (una a partita)</button></div>
    <div class="mn-legend">${["coal", "iron", "gold", "diamond", "tnt"].map(m => `<span><img src="${TEX[m]}">${MAT[m].n} ${MAT[m].v > 0 ? "+" + MAT[m].v : MAT[m].v}</span>`).join("")}</div>
    <div class="mn-rules" id="mn-rules" ${storage.get("capodanno-miniera-regole") ? "hidden" : ""}><b>Come si gioca</b>
      <p>Scavi un blocco per turno, partendo dalla tua riga in basso e poi solo attaccato al tuo tunnel (i blocchi che puoi scavare brillano).</p>
      <p>Ogni blocco scavato mostra un <b>numero</b>: quanto valgono i minerali ancora sepolti intorno. Il <b>puntino rosso</b> vuol dire TNT lì vicino: se la prendi perdi 4 punti e salta tutto intorno.</p>
      <p>${MPICKS} picconate a testa, i tesori migliori sono al centro. Vince chi raccoglie di più.</p>
      <button class="btn sm" id="mn-rules-ok">Ho capito</button></div>
    <div id="mn-end"></div>`);
  const grid = $("#mn-grid");
  const paint = () => {
    $("#mn-score").innerHTML = [mySeat, oSeat].map(s => `<div class="${st.turn === s && !st.over ? "on" : ""} ${s === mySeat ? "me" : ""}">${online || s === 0 ? avatar(member(game.players[s]) || me(), "sm") : `<span class="sc-bot">T</span>`}<span>${esc(s === mySeat ? "Tu" : name(s))}<small>${Math.max(0, st.picks[s])} picconate</small></span><b>${st.score[s]}</b></div>`).join("");
    const myTurn = st.turn === mySeat && !st.over && !pending;
    grid.innerHTML = order.map(i => {
      const o = st.open[i], m = map[i];
      if (o == null) {
        const can = myTurn && mineCanDig(st, i, mySeat);
        const pk = peek.has(i);
        return `<button class="mn-b ${can ? "can" : ""} ${pk ? "peek" : ""}" data-i="${i}" style="background-image:url(${TEX[pk ? m : "grass"]})" ${can || lanMode ? "" : "tabindex=-1"}></button>`;
      }
      if (o === "x") return `<div class="mn-b gone"></div>`;
      const cl = mineClue(map, st, i);
      return `<div class="mn-b open ${st.last?.i === i ? "new" : ""} ${m === "tnt" && st.last?.i === i ? "boom" : ""}" style="background-image:url(${TEX[m]})"><i class="${o === mySeat ? "mine" : "their"}"></i>${cl.v ? `<em>${cl.v}</em>` : ""}${cl.tnt ? `<u></u>` : ""}</div>`;
    }).join("");
    $("#mn-msg").textContent = st.over ? "" : lanMode ? "Tocca un blocco: la lanterna illumina quello e i vicini per 3 secondi" : myTurn ? "Tocca a te: scava un blocco che brilla" : `Scava ${name(st.turn)}…`;
    $("#mn-lan").disabled = st.lan[mySeat] || !myTurn;
    $("#mn-lan").classList.toggle("on", lanMode);
  };
  const burst = (i, color) => {
    const b = grid.children[order.indexOf(i)]; if (!b) return;
    for (let k = 0; k < 10; k++) { const p = document.createElement("span"); p.className = "mn-p"; p.style.cssText = `--dx:${(Math.random() - 0.5) * 80}px;--dy:${-20 - Math.random() * 50}px;background:${color}`; b.appendChild(p); setTimeout(() => p.remove(), 600); }
  };
  const after = () => {
    const l = st.last;
    if (l && l.i != null) {
      const m = l.m; burst(l.i, { coal: "#33333a", iron: "#d8b48f", gold: "#f7d34a", diamond: "#6ff2e6", tnt: "#ff6b3d" }[m] || "#7a5532");
      if (m === "diamond") navigator.vibrate?.([20, 30, 20]); else if (m === "tnt") navigator.vibrate?.(120); else navigator.vibrate?.(6);
      $("#mn-msg").textContent = `${l.s === mySeat ? "Hai trovato" : `${name(l.s)} ha trovato`}: ${MAT[m].n}${MAT[m].v ? ` (${MAT[m].v > 0 ? "+" : ""}${MAT[m].v})` : ""}${m === "tnt" ? ". Boom: i blocchi intorno sono saltati" : ""}`;
    }
    if (st.over) finish();
  };
  const finish = () => {
    if (finished) return; finished = true;
    const w = st.score[0] === st.score[1] ? null : st.score[0] > st.score[1] ? 0 : 1;
    const bag = s => { const c = {}; st.found[s].forEach(m => { c[m] = (c[m] || 0) + 1; }); return Object.entries(c).map(([m, n]) => `<span><img src="${TEX[m]}">×${n}</span>`).join("") || `<span class="faint">niente</span>`; };
    $("#mn-end").innerHTML = `<div class="glass win"><div class="serif" style="font-size:36px">${w == null ? "Pareggio" : w === mySeat ? "Hai vinto" : `Vince ${esc(name(w))}`}</div><div class="small muted">${st.score[mySeat]} a ${st.score[oSeat]}</div>
      <div class="mn-bag"><div><b>Tu</b>${bag(mySeat)}</div><div><b>${esc(name(oSeat))}</b>${bag(oSeat)}</div></div>
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button>${online ? `<button class="btn primary" data-act="du-invite" data-k="miniera" data-id="${game.players[oSeat]}">Rivincita</button>` : `<button class="btn primary" data-act="du-solo" data-k="miniera">Un'altra</button>`}</div></div>`;
    $("#mn-end").scrollIntoView({ behavior: "smooth", block: "center" });
    if (w === mySeat) confettiBurst();
    if (online && game.status === "active") duRpc("duel_finish", { p_id: game.id, p_result: { winner: w, score: st.score } }).catch(() => {});
  };
  let lanUsed = false;
  const act = async a => {
    game = { ...game, actions: [...game.actions, a] };
    st = mineState(map, game.actions);
    paint(); after();
    if (online) {
      pending = true;
      try { const row = await duRpc("duel_act", { p_id: game.id, p_ply: game.actions.length - 1, p_action: a }); duUpsert(row); pending = false; update(row); }
      catch (e) { pending = false; toast(e.message, "alert"); const { data } = await api.sb.from("duels").select("*").eq("id", game.id).maybeSingle(); if (data) update(data, true); }
    } else cpuLoop();
  };
  const cpuLoop = () => { clearTimeout(cpuT); if (online || st.over || st.turn === mySeat) return paint(); cpuT = setTimeout(() => act({ i: mineCpu(map, st, oSeat) }), 1100); };
  const update = (row, force) => {
    if (!online || row.id !== game.id) return;
    if (pending && row.actions.length < game.actions.length) return;
    const grew = row.actions.length > game.actions.length;
    game = row;
    if (grew || force) { st = mineState(map, game.actions); paint(); if (grew) after(); }
  };
  grid.addEventListener("click", e => {
    const b = e.target.closest(".mn-b[data-i]"); if (!b || st.turn !== mySeat || st.over || pending) return;
    const i = Number(b.dataset.i);
    if (lanMode) {
      lanMode = false; lanUsed = true; st.lan[mySeat] = true;
      peek = new Set([i, ...mineNb8(i)].filter(j => st.open[j] == null));
      paint();
      setTimeout(() => { peek = new Set(); paint(); }, 3000);
      return;
    }
    if (!mineCanDig(st, i, mySeat)) { $("#mn-msg").textContent = "Puoi scavare solo dalla tua riga in basso o attaccato al tuo tunnel"; return; }
    act({ i, lan: lanUsed || undefined }); lanUsed = false;
  });
  $("#mn-lan").addEventListener("click", () => { lanMode = !lanMode; paint(); });
  const rulesOk = () => { storage.set("capodanno-miniera-regole", "1"); $("#mn-rules").hidden = true; };
  $("#mn-rules-ok").addEventListener("click", rulesOk);
  $("#mn-help").addEventListener("click", () => { const r = $("#mn-rules"); r.hidden = !r.hidden; if (!r.hidden) r.scrollIntoView({ behavior: "smooth" }); });
  DU.view = { id: online ? game.id : null, update };
  gameCleanup = () => { clearTimeout(cpuT); DU.view = null; };
  paint(); if (st.over) finish(); else cpuLoop();
}

// ───────────────────────── GeoScatto ─────────────────────────

async function geoRounds(n) {
  const out = [], seen = new Set();
  for (let tries = 0; tries < 6 && out.length < n; tries++) {
    const lang = tries % 2 ? "it" : "en";
    try {
      const r = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=random&grnnamespace=0&grnlimit=50&prop=coordinates|pageimages&piprop=thumbnail|name&pithumbsize=1100&coprimary=primary`)).json();
      for (const p of Object.values(r.query?.pages || {})) {
        const c = p.coordinates?.[0], th = p.thumbnail?.source, f = (p.pageimage || "").toLowerCase();
        // Solo vere fotografie: niente mappe, stemmi, bandiere, loghi o schemi.
        if (!c || !th || !/\.(jpe?g)$/i.test(f) || /map|mappa|flag|bandiera|coat|stemma|logo|seal|locator|diagram|plan|scheme|svg|icon|signature|firma/.test(f) || seen.has(p.title)) continue;
        if ((p.thumbnail.width || 0) < 500) continue;
        seen.add(p.title);
        out.push({ img: th, lat: c.lat, lon: c.lon, title: p.title, lang });
        if (out.length >= n) break;
      }
    } catch { /* riprova */ }
  }
  if (out.length < n) throw new Error("Non riesco a trovare foto ora: riprova tra poco");
  return out;
}
const geoPts = km => Math.round(5000 * Math.exp(-km / 1800));
function playGeo(opts) {
  const online = !!opts.online;
  let game = online ? opts.game : null;
  const mySeat = online ? game.players.indexOf(ME) : 0;
  let rounds = online ? game.data.rounds : null;
  let r = 0, total = 0, guess = null, timer = 0, left = 45, map = null, gMarker = null, done = false;
  if (online) { const mine = game.actions.filter(a => a.s === mySeat); r = mine.length; total = mine.reduce((t, a) => t + (a.pts || 0), 0); }
  openGame(`
    <div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">GeoScatto</div><div class="tiny faint" id="geo-sub">${online ? `contro ${esc(mname(game.players[1 - mySeat]))}` : "Allenamento"}</div></div>
      <span class="num" id="geo-t" style="width:44px;text-align:right">45</span></div>
    <div class="geo-photo" id="geo-photo"><div class="small faint">Cerco una foto nel mondo…</div></div>
    <div class="geo-map" id="geo-map"></div>
    <div class="row" style="gap:8px;max-width:520px;width:100%;margin:10px auto 0"><span class="num grow" id="geo-tot">0 pt · round 1/5</span><button class="btn pearl" id="geo-ok" disabled>Conferma</button></div>
    <div id="geo-end"></div>`);
  const tick = () => { left--; const el = $("#geo-t"); if (el) { el.textContent = left; el.classList.toggle("neg", left <= 10); } if (left <= 0) confirm_(); };
  const startRound = () => {
    const q = rounds[r]; guess = null; left = 45; $("#geo-ok").disabled = true;
    $("#geo-photo").innerHTML = `<img src="${esc(q.img)}" alt="">`;
    $("#geo-tot").textContent = `${total} pt · round ${r + 1}/${rounds.length}`;
    if (gMarker) { gMarker.remove(); gMarker = null; }
    map.getSource("geo-line")?.setData({ type: "FeatureCollection", features: [] });
    map.flyTo({ center: [10, 30], zoom: 0.8, duration: 800 });
    clearInterval(timer); timer = setInterval(tick, 1000);
  };
  const confirm_ = async () => {
    if (done) return;
    clearInterval(timer);
    const q = rounds[r];
    const km = guess ? kmBetween({ lat: guess[1], lon: guess[0] }, q) : 20000;
    const pts = guess ? geoPts(km) : 0;
    total += pts;
    $("#geo-tot").textContent = `${total} pt · round ${r + 1}/${rounds.length}`;
    const ML = window.maplibregl;
    const el = document.createElement("div"); el.className = "geo-true"; new ML.Marker({ element: el }).setLngLat([q.lon, q.lat]).addTo(map);
    if (guess) map.getSource("geo-line").setData({ type: "Feature", geometry: { type: "LineString", coordinates: [guess, [q.lon, q.lat]] } });
    const b = new ML.LngLatBounds(); b.extend([q.lon, q.lat]); if (guess) b.extend(guess);
    map.fitBounds(b, { padding: 60, maxZoom: 6, duration: 1200 });
    $("#geo-photo").insertAdjacentHTML("beforeend", `<div class="geo-res"><b>${pts} pt</b><span>${guess ? `${Math.round(km).toLocaleString("it-IT")} km` : "tempo scaduto"} · ${esc(q.title)}</span></div>`);
    $("#geo-ok").disabled = false; $("#geo-ok").textContent = r + 1 < rounds.length ? "Prossima" : "Risultato";
    navigator.vibrate?.(pts > 4000 ? [20, 30, 20] : 10);
    if (online) duRpc("duel_act", { p_id: game.id, p_ply: null, p_action: { r, pts, km: Math.round(km) } }).then(duUpsert).catch(e => toast(e.message, "alert"));
    stage = "next";
  };
  let stage = "guess";
  const end = async () => {
    done = true;
    if (online) return geoVerdict();
    let html = `<div class="serif" style="font-size:40px">${total.toLocaleString("it-IT")} punti</div>`;
    await saveScore("geo", total, { rounds: rounds.length }); const rk = myRank("geo"); if (rk) html += `<div class="small muted">Record: ${rk.s.score} · ${rk.pos}° su ${rk.of}</div>`;
    $("#geo-end").innerHTML = `<div class="glass win">${html}<div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" data-act="du-solo" data-k="geo">Un'altra</button></div></div>`;
    $("#geo-end").scrollIntoView({ behavior: "smooth" });
  };
  // Sfida: si aspetta che anche l'altro finisca i suoi cinque round, poi il verdetto per tutti e due.
  let verdictShown = false;
  const geoVerdict = () => {
    const opp = game.players[1 - mySeat], oname = esc(mname(opp));
    const mineA = game.actions.filter(a => a.s === mySeat), other = game.actions.filter(a => a.s === 1 - mySeat);
    const myPts = Math.max(total, mineA.reduce((t, a) => t + (a.pts || 0), 0)), theirs = other.reduce((t, a) => t + (a.pts || 0), 0);
    const box = $("#geo-end"); if (!box) return;
    const rows = rounds.map((q, i) => { const m = mineA.find(a => a.r === i), o = other.find(a => a.r === i);
      return `<div class="geo-vs-row"><span class="ellipsis">${i + 1}. ${esc(q.title)}</span><b class="${m && o && m.pts > o.pts ? "w" : ""}">${m ? m.pts.toLocaleString("it-IT") : "–"}</b><b class="${m && o && o.pts > m.pts ? "w" : ""}">${o ? o.pts.toLocaleString("it-IT") : "…"}</b></div>`; }).join("");
    const table = `<div class="geo-vs"><div class="geo-vs-row head"><span></span><b>Tu</b><b>${oname}</b></div>${rows}<div class="geo-vs-row tot"><span>Totale</span><b>${myPts.toLocaleString("it-IT")}</b><b>${other.length ? theirs.toLocaleString("it-IT") : "…"}</b></div></div>`;
    if (other.length < rounds.length && game.status !== "over") {
      box.innerHTML = `<div class="glass win geo-wait"><div class="geo-spin"></div><div class="serif" style="font-size:30px">Aspettiamo ${oname}</div>
        <div class="small muted">È al round ${Math.min(rounds.length, other.length + 1)} di ${rounds.length}. Il verdetto arriva appena finisce: puoi anche chiudere, ti avviso io.</div>${table}
        <div class="actions"><button class="btn" data-act="close-game">Chiudi</button></div></div>`;
      box.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (verdictShown) return; verdictShown = true;
    const w = myPts === theirs ? null : myPts > theirs ? mySeat : 1 - mySeat;
    box.innerHTML = `<div class="glass win geo-verdict ${w === mySeat ? "won" : w == null ? "" : "lost"}"><div class="eyebrow">GeoScatto · verdetto</div>
      <div class="serif" style="font-size:46px;line-height:1">${w == null ? "Pareggio" : w === mySeat ? "Hai vinto" : "Hai perso"}</div>
      <div class="small muted" style="margin-top:4px">${myPts.toLocaleString("it-IT")} a ${theirs.toLocaleString("it-IT")}${w == null ? "" : ` · scarto di ${Math.abs(myPts - theirs).toLocaleString("it-IT")} punti`}</div>${table}
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" data-act="du-invite" data-k="geo" data-id="${opp}">Rivincita</button></div></div>`;
    box.scrollIntoView({ behavior: "smooth" });
    if (w === mySeat) { confettiBurst(); navigator.vibrate?.([30, 40, 30]); } else navigator.vibrate?.(60);
    if (game.status === "active") duRpc("duel_finish", { p_id: game.id, p_result: { winner: w, score: mySeat === 0 ? [myPts, theirs] : [theirs, myPts] } }).then(duUpsert).catch(() => {});
  };
  $("#geo-ok").addEventListener("click", () => {
    if (stage === "guess") return confirm_();
    r++; stage = "guess"; $("#geo-ok").textContent = "Conferma";
    if (r >= rounds.length) return end();
    startRound();
  });
  (async () => {
    try { await loadMapLibre(); } catch { $("#geo-photo").innerHTML = `<div class="small muted">Serve la connessione per giocare.</div>`; return; }
    try { if (!rounds) rounds = await geoRounds(5); } catch (e) { $("#geo-photo").innerHTML = `<div class="small muted">${esc(e.message)}</div>`; return; }
    if (r >= rounds.length) { $("#geo-photo").innerHTML = ""; return end(); }
    const ML = window.maplibregl;
    map = new ML.Map({ container: "geo-map", style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", center: [10, 30], zoom: 0.8, attributionControl: { compact: true }, dragRotate: false });
    map.touchZoomRotate.disableRotation();
    await new Promise(res => map.once("load", res));
    map.addSource("geo-line", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "geo-line", type: "line", source: "geo-line", paint: { "line-color": "#e6d4ff", "line-width": 2, "line-dasharray": [2, 2] } });
    map.on("click", e => {
      if (stage !== "guess") return;
      guess = [e.lngLat.lng, e.lngLat.lat];
      if (!gMarker) { const el = document.createElement("div"); el.className = "geo-guess"; el.innerHTML = avatar(me(), "sm"); gMarker = new ML.Marker({ element: el }).setLngLat(guess).addTo(map); } else gMarker.setLngLat(guess);
      $("#geo-ok").disabled = false;
    });
    startRound();
  })();
  DU.view = { id: online ? game.id : null, update: row => { if (online && row.id === game.id) { game = row; if (done) geoVerdict(); } } };
  gameCleanup = () => { clearInterval(timer); DU.view = null; if (map) map.remove(); };
}

Object.assign(ACTIONS, {
  "du-challenge": el => duChallenge(el.dataset.k),
  "du-invite": el => duInvite(el.dataset.k, el.dataset.id),
  "du-solo": el => { closeSheet(); return el.dataset.k === "miniera" ? playMine({}) : el.dataset.k === "onorevoli" ? playOnorevoli() : playGeo({}); },
  "du-open": el => { const g = DU.games.find(x => x.id === el.dataset.id); if (g) { closeSheet(); openDuel(g); } },
  async "du-answer"(el) {
    closeSheet();
    try { const g = await duRpc("duel_answer", { p_id: el.dataset.id, p_ok: el.dataset.ok === "1" }); duUpsert(g); if (g.status === "active") openDuel(g); }
    catch (e) { toast(e.message, "alert"); }
  },
  async "du-cancel"(el) {
    try { await duRpc("duel_cancel", { p_id: el.dataset.id }); } catch { /* già scaduta */ }
    DU.waiting = null; const g = DU.games.find(x => x.id === el.dataset.id); if (g) g.status = "cancelled";
    if (!$("#game").hidden) closeGame();
  },
});

(function waitReady() {
  if (typeof ME !== "undefined" && ME && (!CLOUD || api.sb)) { duLoad(); return; }
  setTimeout(waitReady, 500);
})();
