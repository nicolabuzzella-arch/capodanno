/* Capodanno - duelli 1 contro 1: Miniera e GeoScatto.
   - Miniera: blocchi in pixel art da scavare a turno. Carbone, ferro, oro e diamanti fanno punti; la TNT esplode
     e ne toglie; la lava ti fa saltare il turno. Una lanterna a testa per sbirciare. Contro un amico o contro il telefono.
   - GeoScatto: cinque foto vere da qualche parte nel mondo (da Wikipedia), 45 secondi per piazzare il segnaposto
     sul mappamondo; più sei vicino più punti. Sfida a un amico sulle stesse foto, o allenamento.
   La partita online sta nella tabella «duels»: la mappa nasce da un seme, ogni telefono la ricostruisce dalle mosse. */
"use strict";

const DU = { games: [], view: null, shown: new Set(), waiting: null };
const DKIND = { miniera: "Miniera", geo: "GeoScatto" };
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
};
function duPrompt(g) {
  if (g.status !== "invited" || g.players[1] !== ME || DU.shown.has(g.id) || Date.now() - new Date(g.created_at) > 20 * 60000 || !$("#game").hidden) return;
  DU.shown.add(g.id);
  openSheet(`<div class="duel-invite"><div class="game-ico big">${ico(g.kind === "miniera" ? "pick" : "pin", 36)}</div>
    <div class="serif" style="font-size:28px">${esc(mname(g.created_by))} ti sfida a ${DKIND[g.kind]}</div>
    <div class="small muted" style="margin:6px 0 18px">${g.kind === "miniera" ? "Si scava a turno: vince chi trova più tesori." : "Cinque foto, stesso mondo: vince chi ci va più vicino."}</div>
    <div class="actions"><button class="btn" data-act="du-answer" data-id="${g.id}" data-ok="0">No grazie</button><button class="btn primary" data-act="du-answer" data-id="${g.id}" data-ok="1">Accetto</button></div></div>`);
  navigator.vibrate?.([30, 50, 30]);
}
function duCard(kind) {
  const mine = DU.games.filter(g => g.kind === kind && g.players.includes(ME));
  const fresh = g => Date.now() - new Date(g.created_at) < 20 * 60000;
  const row = (g, right) => `<div class="li"><div class="cb-vs">${g.players.map(id => avatar(member(id), "sm")).join("")}</div><div class="grow"><div class="t">contro ${esc(mname(g.players.find(p => p !== ME)))}</div><div class="tiny faint">${g.status === "invited" ? "in attesa" : "in corso"}</div></div>${right}</div>`;
  return `<section class="card game-card" id="du-card-${kind}">
    <div class="row top"><div class="game-ico">${ico(kind === "miniera" ? "pick" : "pin", 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">${DKIND[kind]}</div>
      <div class="small muted" style="margin-top:6px">${kind === "miniera" ? "Blocchi da scavare a turno: carbone, ferro, oro, diamanti. Occhio a TNT e lava. Una lanterna a testa per sbirciare." : "Una foto vera, un mappamondo, 45 secondi. Cinque round, vince chi sbaglia di meno."}</div></div></div>
    ${mine.filter(g => g.status === "invited" && fresh(g) && g.players[1] === ME).map(g => row(g, `<button class="btn sm" data-act="du-answer" data-id="${g.id}" data-ok="0">No</button><button class="btn sm primary" data-act="du-answer" data-id="${g.id}" data-ok="1">Gioca</button>`)).join("")}
    ${mine.filter(g => g.status === "invited" && fresh(g) && g.created_by === ME).map(g => row(g, `<button class="btn sm" data-act="du-cancel" data-id="${g.id}">Annulla</button>`)).join("")}
    ${mine.filter(g => g.status === "active").map(g => row(g, `<button class="btn sm primary" data-act="du-open" data-id="${g.id}">Riprendi</button>`)).join("")}
    <div class="grid2" style="margin-top:14px;gap:8px"><button class="btn pearl block" data-act="du-challenge" data-k="${kind}">${ico("swap", 17)}Sfida</button><button class="btn block" data-act="du-solo" data-k="${kind}">${ico("device", 17)}${kind === "miniera" ? "Contro il telefono" : "Allenamento"}</button></div>
  </section>`;
}
window.mineCard = () => duCard("miniera");
window.geoCard = () => duCard("geo");
function duRank(kind, label) {
  const W = new Map();
  for (const g of DU.games.filter(g => g.kind === kind && g.status === "over" && g.result)) g.players.forEach((id, s) => { const r = W.get(id) || { id, w: 0, p: 0 }; r.p++; if (g.result.winner === s) r.w++; W.set(id, r); });
  const lb = [...W.values()].filter(r => member(r.id)).sort((a, b) => b.w - a.w || a.p - b.p).slice(0, 10);
  const solo = kind === "geo" ? leaderboard("geo").slice(0, 5) : [];
  return `<section class="card"><div class="row" style="gap:10px;margin-bottom:${lb.length || solo.length ? 12 : 0}px">${ico(kind === "miniera" ? "pick" : "pin", 18)}<div class="t grow">${label}</div>${lb.length || solo.length ? "" : `<span class="small faint">ancora nessuno</span>`}</div>
    ${lb.map((r, i) => `<div class="li rank ${r.id === ME ? "me" : ""}"><span class="pos p${i + 1}">${i + 1}</span>${avatar(member(r.id), "sm")}<span class="grow t ellipsis">${esc(mname(r.id))}</span><span class="tiny faint">${r.p} sfide</span><b class="num">${r.w} vinte</b></div>`).join("")}
    ${solo.length ? `<div class="tiny faint" style="margin:8px 0 4px">Record in allenamento</div>${solo.map((s, i) => `<div class="li rank"><span class="pos">${i + 1}</span>${avatar(member(s.member_id), "sm")}<span class="grow t">${esc(mname(s.member_id))}</span><b class="num">${s.score}</b></div>`).join("")}` : ""}</section>`;
}
window.mineRankCard = () => duRank("miniera", "Miniera");
window.geoRankCard = () => duRank("geo", "GeoScatto");
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
const openDuel = g => (g.kind === "miniera" ? playMine({ online: true, game: g }) : playGeo({ online: true, game: g }));

// ───────────────────────── Miniera ─────────────────────────

const MW = 7, MH = 7;
const MAT = {
  dirt: { v: 0, n: "Terra" }, stone: { v: 0, n: "Pietra" }, coal: { v: 1, n: "Carbone" }, iron: { v: 2, n: "Ferro" },
  gold: { v: 3, n: "Oro" }, diamond: { v: 5, n: "Diamante" }, tnt: { v: -2, n: "TNT" }, lava: { v: 0, n: "Lava" },
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
  const cells = Array(MW * MH).fill("dirt").map(() => (rnd() < 0.45 ? "stone" : "dirt"));
  const place = (m, n, vein) => {
    for (let k = 0; k < n; k++) {
      let i = Math.floor(rnd() * cells.length), tries = 0;
      while (["coal", "iron", "gold", "diamond", "tnt", "lava"].includes(cells[i]) && tries++ < 50) i = Math.floor(rnd() * cells.length);
      cells[i] = m;
      // Le vene: un minerale ha spesso un vicino uguale.
      if (vein && rnd() < 0.55) { const nb = [i - 1, i + 1, i - MW, i + MW].filter(j => j >= 0 && j < cells.length && Math.abs((j % MW) - (i % MW)) <= 1 && ["dirt", "stone"].includes(cells[j])); if (nb.length) cells[nb[Math.floor(rnd() * nb.length)]] = m; }
    }
  };
  place("coal", 5, true); place("iron", 4, true); place("gold", 3, true); place("diamond", 2, false); place("tnt", 3, false); place("lava", 2, false);
  return cells;
}
function mineState(map, actions) {
  const st = { open: Array(map.length).fill(null), score: [0, 0], skip: [false, false], turn: 0, lan: [false, false], log: [], over: false, last: null };
  for (const a of actions) {
    let s = st.turn;
    if (a.lan) st.lan[s] = true;
    const i = a.i;
    if (i == null || st.open[i] != null) { st.turn = 1 - s; continue; }
    const m = map[i];
    st.open[i] = s; st.score[s] += MAT[m].v; st.last = { i, s, m };
    if (m === "tnt") {
      // Esplode: i blocchi intorno saltano senza punti per nessuno.
      const r = Math.floor(i / MW), c = i % MW;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < MH && cc >= 0 && cc < MW && st.open[rr * MW + cc] == null) st.open[rr * MW + cc] = "x"; }
    }
    st.turn = 1 - s;
    if (m === "lava") st.skip[s] = true;
    if (st.skip[st.turn]) { st.skip[st.turn] = false; st.turn = 1 - st.turn; }
    st.log.push(a);
  }
  st.over = map.every((m, i) => MAT[m].v <= 0 || st.open[i] != null);
  return st;
}
function mineCpu(map, st) {
  const free = map.map((_, i) => i).filter(i => st.open[i] == null);
  // Cerca vicino ai minerali già trovati (le vene), altrimenti a caso.
  const near = free.filter(i => [i - 1, i + 1, i - MW, i + MW].some(j => j >= 0 && j < map.length && st.open[j] != null && st.open[j] !== "x" && MAT[map[j]].v > 0));
  const pool = near.length && Math.random() < 0.7 ? near : free;
  return pool[Math.floor(Math.random() * pool.length)];
}
function playMine(opts) {
  const online = !!opts.online;
  let game = online ? opts.game : { id: null, players: [ME, "cpu"], seed: Math.floor(Math.random() * 2147483647), actions: [] };
  const mySeat = online ? game.players.indexOf(ME) : 0;
  const map = mineMap(game.seed);
  let st = mineState(map, game.actions), lanMode = false, pending = false, cpuT = null;
  const name = s => (online ? mname(game.players[s]) : s === 0 ? "Tu" : "Telefono");
  ["grass", "dirt", "stone", "coal", "iron", "gold", "diamond", "tnt", "lava"].forEach(makeTex);
  openGame(`
    <div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Miniera</div><div class="tiny faint">${online ? "Sfida dal vivo" : "Contro il telefono"}</div></div><span style="width:36px"></span></div>
    <div class="mn-score" id="mn-score"></div>
    <div class="mn-grid" id="mn-grid" style="--w:${MW}"></div>
    <div class="mn-msg" id="mn-msg"></div>
    <div class="row" style="gap:8px;max-width:420px;width:100%;margin:10px auto 0"><button class="btn grow" id="mn-lan">${ico("sun", 16)}Lanterna</button></div>
    <div class="mn-legend">${["coal", "iron", "gold", "diamond", "tnt", "lava"].map(m => `<span><img src="${TEX[m]}">${MAT[m].n} ${MAT[m].v > 0 ? "+" + MAT[m].v : MAT[m].v < 0 ? MAT[m].v : "salta turno"}</span>`).join("")}</div>
    <div id="mn-end"></div>`);
  const grid = $("#mn-grid");
  const paint = (boom) => {
    $("#mn-score").innerHTML = [0, 1].map(s => `<div class="${st.turn === s && !st.over ? "on" : ""} ${s === mySeat ? "me" : ""}">${online || s === 0 ? avatar(member(game.players[s]) || me(), "sm") : `<span class="sc-bot">T</span>`}<span>${esc(name(s))}</span><b>${st.score[s]}</b></div>`).join("");
    grid.innerHTML = map.map((m, i) => {
      const o = st.open[i];
      if (o == null) return `<button class="mn-b" data-i="${i}" style="background-image:url(${TEX.grass})"></button>`;
      if (o === "x") return `<div class="mn-b gone"></div>`;
      return `<div class="mn-b open ${st.last?.i === i ? "new" : ""} ${m === "tnt" && boom === i ? "boom" : ""}" style="background-image:url(${TEX[m]})"><i class="${o === mySeat ? "mine" : "their"}"></i></div>`;
    }).join("");
    const myTurn = st.turn === mySeat && !st.over && !pending;
    $("#mn-msg").textContent = st.over ? "" : myTurn ? (lanMode ? "Tocca dove vuoi guardare con la lanterna" : "Tocca a te: scava un blocco") : `Scava ${name(st.turn)}…`;
    $("#mn-lan").disabled = st.lan[mySeat] || !myTurn;
    $("#mn-lan").classList.toggle("on", lanMode);
  };
  const burst = (i, color) => {
    const b = grid.children[i]; if (!b) return;
    for (let k = 0; k < 10; k++) { const p = document.createElement("span"); p.className = "mn-p"; p.style.cssText = `--dx:${(Math.random() - 0.5) * 80}px;--dy:${-20 - Math.random() * 50}px;background:${color}`; b.appendChild(p); setTimeout(() => p.remove(), 600); }
  };
  const after = () => {
    const l = st.last;
    if (l) {
      const m = l.m; burst(l.i, { coal: "#33333a", iron: "#d8b48f", gold: "#f7d34a", diamond: "#6ff2e6", tnt: "#ff6b3d", lava: "#f07a1e" }[m] || "#7a5532");
      if (m === "diamond") navigator.vibrate?.([20, 30, 20]); else if (m === "tnt") navigator.vibrate?.(120); else navigator.vibrate?.(6);
      $("#mn-msg").textContent = `${name(l.s)}: ${MAT[m].n}${MAT[m].v ? ` (${MAT[m].v > 0 ? "+" : ""}${MAT[m].v})` : m === "lava" ? ", salta il prossimo turno" : ""}`;
    }
    if (st.over) finish();
  };
  const finish = async () => {
    const w = st.score[0] === st.score[1] ? null : st.score[0] > st.score[1] ? 0 : 1;
    $("#mn-end").innerHTML = `<div class="glass win"><div class="serif" style="font-size:34px">${w == null ? "Pareggio" : w === mySeat ? "Hai vinto" : `Vince ${esc(name(w))}`}</div><div class="small muted">${st.score[0]} a ${st.score[1]}</div>
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button>${online ? `<button class="btn primary" data-act="du-invite" data-k="miniera" data-id="${game.players[1 - mySeat]}">Rivincita</button>` : `<button class="btn primary" data-act="du-solo" data-k="miniera">Un'altra</button>`}</div></div>`;
    if (w === mySeat) confettiBurst();
    if (online && w != null) duRpc("duel_finish", { p_id: game.id, p_result: { winner: w, score: st.score } }).catch(() => {});
  };
  const act = async (a) => {
    const prev = st;
    game = { ...game, actions: [...game.actions, a] };
    st = mineState(map, game.actions);
    paint(st.last?.m === "tnt" ? st.last.i : null); after();
    if (online) {
      pending = true;
      try { const row = await duRpc("duel_act", { p_id: game.id, p_ply: game.actions.length - 1, p_action: a }); duUpsert(row); pending = false; update(row); }
      catch (e) { pending = false; toast(e.message, "alert"); const { data } = await api.sb.from("duels").select("*").eq("id", game.id).maybeSingle(); if (data) update(data, true); }
    } else cpuLoop();
    void prev;
  };
  const cpuLoop = () => { clearTimeout(cpuT); if (online || st.over || st.turn === mySeat) return paint(); cpuT = setTimeout(() => act({ i: mineCpu(map, st) }), 900); };
  const update = (row, force) => {
    if (!online || row.id !== game.id) return;
    if (pending && row.actions.length < game.actions.length) return;
    const grew = row.actions.length > game.actions.length;
    game = row;
    if (grew || force) { st = mineState(map, game.actions); paint(st.last?.m === "tnt" ? st.last.i : null); if (grew) after(); }
  };
  grid.addEventListener("click", e => {
    const b = e.target.closest(".mn-b[data-i]"); if (!b || st.turn !== mySeat || st.over || pending) return;
    const i = Number(b.dataset.i);
    if (lanMode) {
      // Lanterna: per due secondi vedi i blocchi intorno (solo tu); poi scavi.
      lanMode = false; st.lan[mySeat] = true; lanUsed = true;
      const r = Math.floor(i / MW), c = i % MW;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc, j = rr * MW + cc; if (rr >= 0 && rr < MH && cc >= 0 && cc < MW && st.open[j] == null) { const el = grid.children[j]; el.style.backgroundImage = `url(${TEX[map[j]]})`; el.classList.add("peek"); } }
      setTimeout(() => paint(), 2000);
      $("#mn-lan").disabled = true;
      return;
    }
    act({ i, lan: lanUsed || undefined }); lanUsed = false;
  });
  let lanUsed = false;
  $("#mn-lan").addEventListener("click", () => { lanMode = !lanMode; paint(); });
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
    let html = `<div class="serif" style="font-size:40px">${total.toLocaleString("it-IT")} punti</div>`;
    if (online) {
      const other = game.actions.filter(a => a.s === 1 - mySeat), theirs = other.reduce((t, a) => t + (a.pts || 0), 0);
      html += other.length >= rounds.length ? `<div class="small muted">${esc(mname(game.players[1 - mySeat]))}: ${theirs.toLocaleString("it-IT")}. ${total === theirs ? "Pareggio." : total > theirs ? "Hai vinto." : "Ha vinto lui."}</div>` : `<div class="small muted">${esc(mname(game.players[1 - mySeat]))} sta ancora giocando: il risultato arriva appena finisce.</div>`;
      if (other.length >= rounds.length) duRpc("duel_finish", { p_id: game.id, p_result: { winner: total === theirs ? null : total > theirs ? mySeat : 1 - mySeat, score: mySeat === 0 ? [total, theirs] : [theirs, total] } }).catch(() => {});
    } else { await saveScore("geo", total, { rounds: rounds.length }); const rk = myRank("geo"); if (rk) html += `<div class="small muted">Record: ${rk.s.score} · ${rk.pos}° su ${rk.of}</div>`; }
    $("#geo-end").innerHTML = `<div class="glass win">${html}<div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" data-act="du-solo" data-k="geo">Un'altra</button></div></div>`;
    $("#geo-end").scrollIntoView({ behavior: "smooth" });
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
  DU.view = { id: online ? game.id : null, update: row => { if (online && row.id === game.id) game = row; } };
  gameCleanup = () => { clearInterval(timer); DU.view = null; if (map) map.remove(); };
}

Object.assign(ACTIONS, {
  "du-challenge": el => duChallenge(el.dataset.k),
  "du-invite": el => duInvite(el.dataset.k, el.dataset.id),
  "du-solo": el => (el.dataset.k === "miniera" ? playMine({}) : playGeo({})),
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
