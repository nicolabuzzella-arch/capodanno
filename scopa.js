/* Capodanno - Scopa d'assi in quattro (due contro due), con carte francesi (quadri valgono come i denari).
   Regole: 40 carte, 9 a testa e 4 in tavola. Si prende la carta di pari valore o, se non c'è, una somma.
   L'asso piglia tutto quello che c'è in tavola. Scopa quando si svuota la tavola (non all'ultima giocata della mano;
   con l'asso solo se chi crea la partita lo decide). A fine mano: carte, denari, settebello, primiera, scope, napola facoltativa.
   Online: chi invita sceglie compagno, avversari, punti per vincere e varianti. Il mazzo nasce da un seme casuale scelto
   dal server; ogni telefono ricostruisce la partita dalla lista delle giocate. Allenamento: tu e un bot contro due bot. */
"use strict";

const SC = { games: [], view: null, shown: new Set(), waiting: null };
// Carte francesi: quadri (vale come i denari: settebello = 7 di quadri), cuori, picche, fiori. J = 8, Q = 9, K = 10.
const SUITS = ["Quadri", "Cuori", "Picche", "Fiori"];
const RANK_NAME = { 1: "Asso", 8: "Jack", 9: "Donna", 10: "Re" };
const cardS = id => Math.floor(id / 10), cardR = id => (id % 10) + 1;
const cardName = id => `${RANK_NAME[cardR(id)] || cardR(id)} di ${SUITS[cardS(id)]}`;
const PRIM = { 1: 16, 2: 12, 3: 13, 4: 14, 5: 15, 6: 18, 7: 21, 8: 10, 9: 10, 10: 10 };
const SC_DEFAULT = { target: 21, assoScopa: false, napola: true };
const teamOf = seat => seat % 2;

// ───────────────────────── Carte (SVG, disegnate una volta e messe in cache) ─────────────────────────

const RED = "#c8102e", BLACK = "#16161d";
const suitColor = s => (s <= 1 ? RED : BLACK);
const SUIT_PATH = [
  "M0 -10 L7 0 L0 10 L-7 0Z",
  "M0 7 C-9 -1 -10 -7 -5.5 -9.5 C-2.5 -11 0 -8.5 0 -6.5 C0 -8.5 2.5 -11 5.5 -9.5 C10 -7 9 -1 0 7Z",
  "M0 -10 C-5 -4 -10 -1 -7 3.5 C-4.5 6.5 -1.5 5 -0.8 3.6 L-2.8 9.5 H2.8 L0.8 3.6 C1.5 5 4.5 6.5 7 3.5 C10 -1 5 -4 0 -10Z",
  "M0 -10 C3.6 -10 5 -6 3 -3.4 C6.5 -5.2 10 -2.6 9 1.2 C8 4.6 3.5 4.8 1.2 2.2 L2.8 9.5 H-2.8 L-1.2 2.2 C-3.5 4.8 -8 4.6 -9 1.2 C-10 -2.6 -6.5 -5.2 -3 -3.4 C-5 -6 -3.6 -10 0 -10Z",
];
const suitGlyph = (s, x, y, k = 1, rot = 0) => `<path d="${SUIT_PATH[s]}" fill="${suitColor(s)}" transform="translate(${x} ${y}) scale(${k}) rotate(${rot})"/>`;
// Disposizione classica dei semi sulle carte francesi (quelli in basso capovolti).
const PIP_POS = {
  1: [[50, 75]], 2: [[50, 38], [50, 112, 1]], 3: [[50, 34], [50, 75], [50, 116, 1]], 4: [[32, 40], [68, 40], [32, 110, 1], [68, 110, 1]],
  5: [[32, 40], [68, 40], [50, 75], [32, 110, 1], [68, 110, 1]], 6: [[32, 38], [68, 38], [32, 75], [68, 75], [32, 112, 1], [68, 112, 1]],
  7: [[32, 36], [68, 36], [50, 56], [32, 76], [68, 76], [32, 114, 1], [68, 114, 1]],
};
function face(r, s) {
  // Figure eleganti: cornice, lettera grande e il seme; niente ritratti finti.
  const L = { 8: "J", 9: "Q", 10: "K" }[r], c = suitColor(s);
  const crown = r === 10 ? `<path d="M36 50 l5 -12 l6 7 l3 -11 l3 11 l6 -7 l5 12z" fill="#d4a62a" stroke="#8a6a12" stroke-width="1"/>` : r === 9 ? `<circle cx="50" cy="42" r="6" fill="none" stroke="#d4a62a" stroke-width="2.4"/><circle cx="50" cy="42" r="2" fill="#d4a62a"/>` : `<path d="M40 46 h20 l-3 -8 h-14z" fill="#d4a62a" stroke="#8a6a12" stroke-width="1"/>`;
  return `<rect x="20" y="24" width="60" height="102" rx="6" fill="none" stroke="${c}" stroke-width="1.4" opacity=".55"/>
    <rect x="24" y="28" width="52" height="94" rx="4" fill="${c}" opacity=".06"/>
    ${crown}<text x="50" y="94" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="46" font-weight="700" fill="${c}">${L}</text>
    ${suitGlyph(s, 50, 110, 0.85)}`;
}
const CARD_CACHE = new Map();
// Carte francesi classiche (disegni di Adrian Kennard, dominio pubblico CC0): file SVG nella cartella «carte».
function cardSrc(id) { return `carte/${"DHSC"[cardS(id)]}${cardR(id)}.svg`; }
const BACK_SRC = "carte/retro.svg";

// ───────────────────────── Motore ─────────────────────────

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Mazzo della mano h: se in tavola finiscono assi o tre re si rimescola (stesso risultato su tutti i telefoni).
function dealHand(seed, h) {
  for (let salt = 0; ; salt++) {
    const rnd = mulberry(seed * 31 + h * 7919 + salt * 104729);
    const d = [...Array(40).keys()];
    for (let i = 39; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    const table = d.slice(0, 4);
    if (table.some(c => cardR(c) === 1) || table.filter(c => cardR(c) === 10).length >= 3) continue;
    const dealer = h % 4;
    const hands = [[], [], [], []];
    for (let i = 0; i < 4; i++) hands[(dealer + 1 + i) % 4] = d.slice(4 + 9 * i, 13 + 9 * i).sort((a, b) => cardR(a) - cardR(b) || a - b);
    return { table, hands };
  }
}
function captureOptions(card, table) {
  const r = cardR(card);
  if (r === 1) return table.length ? [table.slice()] : [];
  const same = table.filter(c => cardR(c) === r);
  if (same.length) return same.map(c => [c]);
  const out = [];
  const rec = (i, sum, pick) => {
    if (sum === r && pick.length >= 2) { out.push(pick.slice()); return; }
    if (sum >= r || i >= table.length) return;
    for (let k = i; k < table.length; k++) { pick.push(table[k]); rec(k + 1, sum + cardR(table[k]), pick); pick.pop(); }
  };
  rec(0, 0, []);
  return out;
}
const turnSeat = ply => (Math.floor(ply / 36) + 1 + (ply % 36)) % 4;
function scoreHand(piles, scope, settings) {
  const row = piles.map(p => {
    const den = p.filter(c => cardS(c) === 0);
    const best = [0, 1, 2, 3].map(s => Math.max(0, ...p.filter(c => cardS(c) === s).map(c => PRIM[cardR(c)])));
    const prim = best.every(v => v > 0) ? best.reduce((a, b) => a + b, 0) : 0;
    let nap = 0;
    if (settings.napola && [1, 2, 3].every(r => den.some(c => cardR(c) === r))) { nap = 3; while (den.some(c => cardR(c) === nap + 1)) nap++; }
    return { cards: p.length, den: den.length, sette: p.includes(6), prim, nap };
  });
  const pts = [0, 0], det = [[], []];
  const give = (t, label) => { pts[t]++; det[t].push(label); };
  if (row[0].cards !== row[1].cards) give(row[0].cards > row[1].cards ? 0 : 1, "Carte");
  if (row[0].den !== row[1].den) give(row[0].den > row[1].den ? 0 : 1, "Quadri");
  give(row[0].sette ? 0 : 1, "Settebello");
  if (row[0].prim !== row[1].prim) give(row[0].prim > row[1].prim ? 0 : 1, "Primiera");
  for (const t of [0, 1]) {
    if (scope[t]) { pts[t] += scope[t]; det[t].push(`${scope[t]} ${scope[t] === 1 ? "scopa" : "scope"}`); }
    if (row[t].nap) { pts[t] += row[t].nap; det[t].push(`Napola ${row[t].nap}`); }
  }
  return { pts, det, row };
}
// Ricostruisce tutta la partita dalla lista delle giocate.
function scopaReplay(seed, actions, settings) {
  settings = { ...SC_DEFAULT, ...settings };
  const st = { totals: [0, 0], hands: [], hand: 0, ply: 0, over: null, history: [] };
  let cur = null;
  const startHand = h => {
    const d = dealHand(seed, h);
    cur = { h, table: d.table, hands: d.hands, piles: [[], []], scope: [0, 0], lastTaker: null, plays: 0, last: null };
  };
  const endHand = () => {
    if (cur.table.length && cur.lastTaker != null) { cur.piles[cur.lastTaker].push(...cur.table); cur.table = []; }
    const res = scoreHand(cur.piles, cur.scope, settings);
    st.totals = [st.totals[0] + res.pts[0], st.totals[1] + res.pts[1]];
    st.hands.push({ ...res, totals: st.totals.slice() });
    const [a, b] = st.totals, T = settings.target;
    if ((a >= T || b >= T) && a !== b) st.over = { winner: a > b ? 0 : 1, totals: st.totals.slice() };
  };
  startHand(0);
  for (const act of actions) {
    if (st.over) break;
    const seat = turnSeat(st.ply);
    const hand = cur.hands[seat];
    const card = hand.includes(act.c) ? act.c : hand[0];
    const opts = captureOptions(card, cur.table);
    let take = [];
    if (opts.length) {
      const want = (act.x || []).slice().sort((x, y) => x - y).join(",");
      take = opts.find(o => o.slice().sort((x, y) => x - y).join(",") === want) || opts[0];
    }
    cur.hands[seat] = hand.filter(c => c !== card);
    const lastOfHand = cur.plays === 35;
    let scopa = false;
    if (take.length) {
      cur.table = cur.table.filter(c => !take.includes(c));
      cur.piles[teamOf(seat)].push(card, ...take);
      cur.lastTaker = teamOf(seat);
      if (!cur.table.length && !lastOfHand && (cardR(card) !== 1 || settings.assoScopa)) { cur.scope[teamOf(seat)]++; scopa = true; }
    } else cur.table.push(card);
    cur.last = { seat, card, take, scopa };
    st.history.push(cur.last);
    cur.plays++; st.ply++;
    if (cur.plays === 36) { endHand(); if (!st.over) { st.hand++; startHand(st.hand); } }
  }
  st.cur = cur;
  return st;
}
// Bot: prende molto e bene, pensa al settebello e alle scope, evita di lasciare la tavola facile.
function botChoose(cur, seat) {
  const hand = cur.hands[seat];
  let best = null;
  for (const c of hand) {
    const opts = captureOptions(c, cur.table);
    const tries = opts.length ? opts : [[]];
    for (const o of tries) {
      let v = 0;
      if (o.length) {
        const got = [c, ...o];
        v += got.length * 2 + got.filter(x => cardS(x) === 0).length * 2.5 + (got.includes(6) ? 25 : 0) + got.filter(x => cardR(x) === 7).length * 4;
        if (o.length === cur.table.length && cardR(c) !== 1) v += 30;
        if (cardR(c) === 1) v -= 6;
        const left = cur.table.filter(x => !o.includes(x));
        const sum = left.reduce((t, x) => t + cardR(x), 0);
        if (left.length && sum <= 10) v -= 8;
      } else {
        const sum = cur.table.reduce((t, x) => t + cardR(x), 0) + cardR(c);
        v -= sum <= 10 ? 14 : 2;
        v -= cardS(c) === 0 ? 3 : 0; v -= c === 6 ? 30 : 0; v -= cardR(c) === 7 ? 4 : 0; v -= cardR(c) === 1 ? 12 : 0;
        v += cardR(c) >= 8 ? 2 : 0;
      }
      v += Math.random() * 1.5;
      if (!best || v > best.v) best = { v, c, x: o };
    }
  }
  return { c: best.c, x: best.x };
}

// ───────────────────────── Dati e tempo reale (online) ─────────────────────────

async function scRpc(fn, args) { const { data, error } = await api.sb.rpc(fn, args); if (error) throw new Error(error.message); return data; }
function scUpsert(row) { if (!row?.id) return; const i = SC.games.findIndex(g => g.id === row.id); if (i >= 0) SC.games[i] = row; else SC.games.unshift(row); }
async function scopaLoad() {
  if (!CLOUD) return;
  const { data, error } = await api.sb.from("card_games").select("*").order("updated_at", { ascending: false }).limit(100);
  if (error) return;
  SC.games = data || [];
  SC.games.forEach(scPrompt);
  refreshScopaCard();
}
window.onScopaChange = payload => {
  const row = payload.new && payload.new.id ? payload.new : null; if (!row) return;
  scUpsert(row);
  if (SC.view?.id === row.id) SC.view.update(row);
  if (SC.waiting === row.id && row.status !== "invited") {
    SC.waiting = null;
    if (row.status === "active") openScopa({ online: true, game: row });
    else { closeGame(); toast(row.result?.declined ? `${mname(row.result.declined)} non può giocare` : "Partita annullata"); }
  } else if (SC.waiting === row.id) refreshWaiting(row);
  scPrompt(row);
  refreshScopaCard();
};
function scPrompt(g) {
  if (g.status !== "invited" || g.created_by === ME || !g.players.includes(ME) || SC.shown.has(g.id)) return;
  if (g.accepted[g.players.indexOf(ME)]) return;
  if (Date.now() - new Date(g.created_at).getTime() > 20 * 60000) return;
  if (!$("#game").hidden) return;
  SC.shown.add(g.id);
  const me_ = g.players.indexOf(ME), partner = g.players[(me_ + 2) % 4];
  openSheet(`<div class="duel-invite"><div class="game-ico big">${ico("star", 36)}</div>
    <div class="serif" style="font-size:28px">${esc(mname(g.created_by))} ti chiama a scopa d'assi</div>
    <div class="small muted" style="margin:6px 0 18px">In coppia con <b>${esc(mname(partner))}</b> · si arriva a ${g.settings?.target || 21}</div>
    <div class="actions"><button class="btn" data-act="sc-answer" data-id="${g.id}" data-ok="0">Non posso</button><button class="btn primary" data-act="sc-answer" data-id="${g.id}" data-ok="1">Ci sono</button></div></div>`);
  navigator.vibrate?.([30, 50, 30]);
}

// ───────────────────────── Scheda nei Giochi ─────────────────────────

window.scopaCard = function () {
  const mine = SC.games.filter(g => g.players.includes(ME));
  const fresh = g => Date.now() - new Date(g.created_at) < 20 * 60000;
  const invites = mine.filter(g => g.status === "invited" && fresh(g) && g.created_by !== ME && !g.accepted[g.players.indexOf(ME)]);
  const waiting = mine.filter(g => g.status === "invited" && fresh(g) && (g.created_by === ME || g.accepted[g.players.indexOf(ME)]));
  const playing = mine.filter(g => g.status === "active");
  const row = (g, right) => `<div class="li"><div class="cb-vs">${g.players.map(id => avatar(member(id), "sm")).join("")}</div><div class="grow"><div class="t ellipsis">${esc(mname(g.players[0]))} e ${esc(mname(g.players[2]))} contro ${esc(mname(g.players[1]))} e ${esc(mname(g.players[3]))}</div><div class="tiny faint">a ${g.settings?.target || 21} punti${g.status === "invited" ? ` · ${g.accepted.filter(Boolean).length}/4 pronti` : ""}</div></div>${right}</div>`;
  return `<section class="card game-card" id="scopa-card">
    <div class="row top"><div class="game-ico">${ico("star", 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">Scopa d'assi</div>
      <div class="small muted" style="margin-top:6px">In quattro, due contro due, con le carte francesi. L'asso piglia tutto. Chi invita sceglie coppie, punti e varianti.</div></div></div>
    ${invites.map(g => row(g, `<button class="btn sm" data-act="sc-answer" data-id="${g.id}" data-ok="0">No</button><button class="btn sm primary" data-act="sc-answer" data-id="${g.id}" data-ok="1">Ci sono</button>`)).join("")}
    ${waiting.map(g => row(g, g.created_by === ME ? `<button class="btn sm" data-act="sc-cancel" data-id="${g.id}">Annulla</button>` : `<span class="tiny faint">attesa</span>`)).join("")}
    ${playing.map(g => row(g, `<button class="btn sm primary" data-act="sc-open" data-id="${g.id}">Gioca</button>`)).join("")}
    <div class="grid2" style="margin-top:14px;gap:8px">
      <button class="btn pearl block" data-act="sc-new">${ico("users", 17)}Organizza</button>
      <button class="btn block" data-act="sc-bots">${ico("device", 17)}Contro i bot</button></div>
  </section>`;
};
function refreshScopaCard() { const el = $("#scopa-card"); if (el) el.outerHTML = scopaCard(); }
window.scopaRankCard = function () {
  const W = new Map();
  for (const g of SC.games.filter(g => g.status === "over" && g.result?.winner != null)) {
    g.players.forEach((id, seat) => { const r = W.get(id) || { member_id: id, score: 0, played: 0 }; r.played++; if (teamOf(seat) === g.result.winner) r.score++; W.set(id, r); });
  }
  const lb = [...W.values()].filter(r => member(r.member_id)).sort((a, b) => b.score - a.score || a.played - b.played).slice(0, 10);
  return `<section class="card"><div class="row" style="gap:10px;margin-bottom:${lb.length ? 12 : 0}px">${ico("star", 18)}<div class="t grow">Scopa d'assi</div>${lb.length ? "" : `<span class="small faint">ancora nessuno</span>`}</div>
    ${lb.map((s, i) => `<div class="li rank ${s.member_id === ME ? "me" : ""}"><span class="pos p${i + 1}">${i + 1}</span>${avatar(member(s.member_id), "sm")}<span class="grow t ellipsis">${esc(mname(s.member_id))}</span><span class="tiny faint">${s.played} partite</span><b class="num">${s.score} vinte</b></div>`).join("")}</section>`;
};

const SCN = { partner: null, opp: [], target: 21, assoScopa: false, napola: true };
function sheetNewScopa() {
  if (!CLOUD) return toast("Le partite a quattro funzionano con il database collegato: intanto prova contro i bot");
  const others = S.members.filter(m => m.id !== ME);
  if (others.length < 3) return toast("Servono almeno quattro persone nel gruppo");
  const pickRow = (role, m) => {
    const on = role === "partner" ? SCN.partner === m.id : SCN.opp.includes(m.id);
    const taken = role === "partner" ? SCN.opp.includes(m.id) : SCN.partner === m.id;
    return `<button class="sc-pick ${on ? "on" : ""}" data-act="sc-pick" data-role="${role}" data-id="${m.id}" ${taken ? "disabled" : ""}>${avatar(m, "sm")}<span>${esc(m.name)}</span></button>`;
  };
  openSheet(`<h2>Scopa d'assi</h2>
    <div class="label">Il tuo compagno</div><div class="sc-picks">${others.map(m => pickRow("partner", m)).join("")}</div>
    <div class="label">Gli avversari (due)</div><div class="sc-picks">${others.map(m => pickRow("opp", m)).join("")}</div>
    <div class="label">Si vince a</div>${["11", "16", "21", "31"].map(t => `<button class="cb-chip sc-t ${String(SCN.target) === t ? "on" : ""}" data-act="sc-target" data-v="${t}"><b>${t}</b></button>`).join("")}
    <div class="label">Varianti</div>
    <label class="toggle"><span>La presa con l'asso vale scopa</span><span class="switch"><input type="checkbox" id="sc-ace" ${SCN.assoScopa ? "checked" : ""}><span></span></span></label>
    <label class="toggle"><span>Napola (asso, 2 e 3 di quadri)</span><span class="switch"><input type="checkbox" id="sc-nap" ${SCN.napola ? "checked" : ""}><span></span></span></label>
    <button class="btn pearl block" style="margin-top:16px" data-act="sc-create" ${SCN.partner && SCN.opp.length === 2 ? "" : "disabled"}>Manda l'invito</button>`);
}
async function createScopa() {
  SCN.assoScopa = !!$("#sc-ace")?.checked; SCN.napola = !!$("#sc-nap")?.checked;
  closeSheet();
  try {
    const g = await scRpc("card_create", { p_players: [ME, SCN.opp[0], SCN.partner, SCN.opp[1]], p_settings: { target: Number(SCN.target), assoScopa: SCN.assoScopa, napola: SCN.napola } });
    scUpsert(g); SC.waiting = g.id;
    api.notify("scopa", g.id);
    openGame(`<div class="duel-wait"><div class="game-ico big">${ico("star", 36)}</div><div class="serif" style="font-size:30px">Aspetto il tavolo…</div>
      <div id="sc-wait" class="sc-wait"></div>
      <button class="btn" style="margin-top:22px" data-act="sc-cancel" data-id="${g.id}">Annulla</button></div>`);
    refreshWaiting(g);
    gameCleanup = () => { if (SC.waiting === g.id) SC.waiting = null; };
  } catch (e) { toast(e.message.includes("card_create") ? "Esegui aggiornamento-3.sql su Supabase per giocare online" : e.message, "alert"); }
}
function refreshWaiting(g) {
  const el = $("#sc-wait"); if (!el) return;
  el.innerHTML = g.players.map((id, i) => `<div class="sc-seat ${g.accepted[i] ? "ok" : ""}">${avatar(member(id), "sm")}<span>${esc(mname(id))}</span><b>${g.accepted[i] ? "pronto" : "…"}</b></div>`).join("");
}

// ───────────────────────── Tavolo ─────────────────────────
// opts: { online: true, game } oppure { bots: true }.
function openScopa(opts) {
  const online = !!opts.online;
  let game = online ? opts.game : { id: null, players: [ME, "bot1", "bot2", "bot3"], settings: { ...SC_DEFAULT }, seed: Math.floor(Math.random() * 2147483647), actions: [] };
  if (!online) { try { const s = JSON.parse(storage.get("capodanno-scopa-bot")); if (s && !s.over) game = { ...game, seed: s.seed, actions: s.actions }; } catch { /* nuova */ } }
  const mySeat = game.players.indexOf(ME);
  const settings = { ...SC_DEFAULT, ...(game.settings || {}) };
  let st = scopaReplay(game.seed, game.actions, settings);
  let sel = null, choice = 0, pending = false, shownHands = st.hands.length, botTimer = null;
  const nameOf = seat => (online ? mname(game.players[seat]) : seat === mySeat ? "Tu" : ["", "Bot destra", "Bot compagno", "Bot sinistra"][seat]);
  const avOf = seat => (online || seat === mySeat ? avatar(member(game.players[seat]) || me(), "sm") : `<span class="sc-bot">${["", "D", "C", "S"][seat]}</span>`);
  const rel = s => (s - mySeat + 4) % 4; // 0 io, 1 destra, 2 compagno, 3 sinistra

  openGame(`
    <div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Scopa d'assi · a ${settings.target}</div><div class="tiny faint" id="sc-sub">${online ? "Partita a quattro" : "Allenamento con i bot"}</div></div>
      <button class="btn icon sm" id="sc-rules" aria-label="Regole">${ico("list", 17)}</button></div>
    <div class="sc-score" id="sc-score"></div>
    <div class="sc-table">
      <div class="sc-opp top" id="sc-p2"></div>
      <div class="sc-opp left" id="sc-p3"></div>
      <div class="sc-opp right" id="sc-p1"></div>
      <div class="sc-felt" id="sc-felt"><div class="sc-cards" id="sc-tablecards"></div><div class="sc-splash" id="sc-splash"></div></div>
    </div>
    <div class="sc-turn" id="sc-turn"></div>
    <div class="sc-opts" id="sc-opts"></div>
    <div class="sc-hand" id="sc-hand"></div>
    <div id="sc-end"></div>`);

  const opp = (seat) => {
    const cur = st.cur, n = cur.hands[seat].length, turn = !st.over && turnSeat(st.ply) === seat;
    return `<div class="sc-who ${turn ? "turn" : ""} ${teamOf(seat) === teamOf(mySeat) ? "mate" : ""}">${avOf(seat)}<span>${esc(nameOf(seat))}</span></div>
      <div class="sc-backs">${Array.from({ length: Math.min(n, 9) }, () => `<img src="${BACK_SRC}" alt="">`).join("")}</div>`;
  };
  function paint(animateLast) {
    const cur = st.cur;
    const myTeam = teamOf(mySeat);
    $("#sc-score").innerHTML = `<div class="${myTeam === 0 ? "us" : ""}"><span>${online ? `${esc(mname(game.players[0]))} e ${esc(mname(game.players[2]))}` : "Noi"}</span><b>${st.totals[0]}</b><i>${cur.scope[0] ? `${cur.scope[0]} sc.` : ""}</i></div>
      <div class="vs">a ${settings.target}</div>
      <div class="${myTeam === 1 ? "us" : ""}"><span>${online ? `${esc(mname(game.players[1]))} e ${esc(mname(game.players[3]))}` : "Loro"}</span><b>${st.totals[1]}</b><i>${cur.scope[1] ? `${cur.scope[1]} sc.` : ""}</i></div>`;
    for (const seat of [0, 1, 2, 3]) { if (seat === mySeat) continue; const el = $(`#sc-p${rel(seat)}`); if (el) el.innerHTML = opp(seat); }
    const opts = sel != null ? captureOptions(sel, cur.table) : [];
    const take = opts[choice] || [];
    $("#sc-tablecards").innerHTML = cur.table.map(c => `<img class="sc-card ${take.includes(c) ? "take" : ""} ${animateLast && cur.last?.card === c ? "landed" : ""}" src="${cardSrc(c)}" alt="${cardName(c)}" data-t="${c}">`).join("") || `<div class="sc-empty"></div>`;
    const myTurn = !st.over && turnSeat(st.ply) === mySeat && !pending;
    const mine = cur.hands[mySeat] || [];
    $("#sc-hand").innerHTML = mine.map((c, i) => `<button class="sc-hc ${sel === c ? "sel" : ""}" data-c="${c}" style="--i:${i};--n:${mine.length}" ${myTurn ? "" : "data-wait"}><img src="${cardSrc(c)}" alt="${cardName(c)}"></button>`).join("");
    const t = turnSeat(st.ply);
    $("#sc-turn").innerHTML = st.over ? "" : myTurn ? (sel != null ? `<b>${cardName(sel)}</b>: ${opts.length ? (cardR(sel) === 1 ? "piglia tutto" : opts.length > 1 ? "scegli cosa prendere" : `prendi ${opts[0].map(cardName).join(" + ")}`) : "la lasci in tavola"}` : "Tocca a te: scegli una carta")
      : `${cur.last ? `<span class="sc-last">${esc(nameOf(cur.last.seat))}: ${cardName(cur.last.card)}${cur.last.take.length ? ` prende ${cur.last.take.map(c => cardR(c)).join(" + ")}` : ""}</span>` : ""}Tocca a ${esc(nameOf(t))}${online ? "" : "…"}`;
    $("#sc-opts").innerHTML = myTurn && sel != null ? `${opts.length > 1 ? opts.map((o, i) => `<button class="sc-opt ${i === choice ? "on" : ""}" data-o="${i}">${o.map(c => cardR(c)).join(" + ")}</button>`).join("") : ""}<button class="btn pearl" id="sc-play">Gioca</button>` : "";
  }
  function splash(text) { const el = $("#sc-splash"); if (!el) return; el.textContent = text; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); }
  function afterChange(prevHands) {
    const last = st.cur.last;
    if (st.hands.length > prevHands) {
      // Mano finita: resoconto dei punti.
      const h = st.hands.at(-1), myTeam = teamOf(mySeat);
      const lines = ["Carte", "Quadri", "Settebello", "Primiera"];
      $("#sc-end").innerHTML = `<div class="glass win sc-report"><div class="serif" style="font-size:30px">${st.over ? (st.over.winner === myTeam ? "Avete vinto" : "Hanno vinto loro") : `Mano ${st.hands.length}`}</div>
        <table><tr><th></th><th>${online ? "Squadra 1" : "Noi"}</th><th>${online ? "Squadra 2" : "Loro"}</th></tr>
        ${lines.map(l => `<tr><td>${l}</td><td>${h.det[0].includes(l) ? "1" : ""}</td><td>${h.det[1].includes(l) ? "1" : ""}</td></tr>`).join("")}
        <tr><td>Scope e napola</td><td>${h.det[0].filter(x => !lines.includes(x)).join(", ")}</td><td>${h.det[1].filter(x => !lines.includes(x)).join(", ")}</td></tr>
        <tr class="tot"><td>Totale</td><td>${h.totals[0]}</td><td>${h.totals[1]}</td></tr></table>
        <div class="tiny faint">Carte ${h.row[0].cards}–${h.row[1].cards} · quadri ${h.row[0].den}–${h.row[1].den} · primiera ${h.row[0].prim}–${h.row[1].prim}</div>
        <div class="actions">${st.over ? `<button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" id="sc-again">${online ? "Rivincita" : "Un'altra"}</button>` : `<button class="btn primary" id="sc-next">Prossima mano</button>`}</div></div>`;
      $("#sc-next")?.addEventListener("click", () => { $("#sc-end").innerHTML = ""; paint(); loop(); });
      $("#sc-again")?.addEventListener("click", () => { if (online) { SCN.partner = game.players[(mySeat + 2) % 4]; SCN.opp = [game.players[(mySeat + 1) % 4], game.players[(mySeat + 3) % 4]]; SCN.target = settings.target; sheetNewScopa(); } else { storage.del("capodanno-scopa-bot"); openScopa({ bots: true }); } });
      if (st.over) { if (st.over.winner === myTeam) confettiBurst?.(); if (online) scRpc("card_finish", { p_id: game.id, p_result: { winner: st.over.winner, totals: st.over.totals } }).catch(() => {}); else storage.set("capodanno-scopa-bot", JSON.stringify({ seed: game.seed, actions: game.actions, over: true })); }
      navigator.vibrate?.([20, 40, 20]);
      return true;
    }
    if (last?.scopa) { splash("Scopa!"); navigator.vibrate?.([30, 40, 60]); }
    else if (last && cardR(last.card) === 1 && last.take.length) splash("Asso piglia tutto");
    return false;
  }
  function apply(action) {
    const prev = st.hands.length;
    game = { ...game, actions: [...game.actions, action] };
    st = scopaReplay(game.seed, game.actions, settings);
    sel = null; choice = 0;
    if (!online) storage.set("capodanno-scopa-bot", JSON.stringify({ seed: game.seed, actions: game.actions }));
    paint(true);
    return afterChange(prev);
  }
  // Turni dei bot (allenamento) con un piccolo ritmo umano.
  function loop() {
    clearTimeout(botTimer);
    if (online || st.over || $("#sc-end").innerHTML) return;
    const t = turnSeat(st.ply);
    if (t === mySeat) return;
    botTimer = setTimeout(() => { const a = botChoose(st.cur, t); if (!apply(a)) loop(); }, 1700);
  }
  async function playMine() {
    if (sel == null || pending) return;
    const opts = captureOptions(sel, st.cur.table);
    const action = { c: sel, x: opts[choice] || [] };
    if (online) {
      pending = true;
      const ply = game.actions.length;
      const handEnded = apply(action);
      try { const row = await scRpc("card_play", { p_id: game.id, p_ply: ply, p_action: action }); scUpsert(row); pending = false; update(row, true); }
      catch (e) { pending = false; toast(e.message, "alert"); const { data } = await api.sb.from("card_games").select("*").eq("id", game.id).maybeSingle(); if (data) update(data, true); }
      if (!handEnded) paint();
    } else if (!apply(action)) loop();
  }
  function update(row, quiet) {
    if (!online || row.id !== game.id) return;
    if (pending && row.actions.length < game.actions.length) return;
    const prev = st.hands.length, n = game.actions.length;
    game = row;
    if (row.actions.length !== n || !quiet) {
      st = scopaReplay(game.seed, game.actions, settings);
      if (row.actions.length > n) { sel = null; paint(true); if (!afterChange(prev) && turnSeat(st.ply) === mySeat) navigator.vibrate?.(15); }
      else paint();
    }
  }

  $("#sc-hand").addEventListener("click", e => {
    const b = e.target.closest(".sc-hc"); if (!b || b.hasAttribute("data-wait")) return;
    const c = Number(b.dataset.c);
    if (sel === c) { playMine(); return; }
    sel = c; choice = 0; paint();
  });
  $("#sc-opts").addEventListener("click", e => {
    const o = e.target.closest("[data-o]"); if (o) { choice = Number(o.dataset.o); paint(); return; }
    if (e.target.closest("#sc-play")) playMine();
  });
  $("#sc-rules").addEventListener("click", () => openSheet(`<h2>Regole</h2><div class="small" style="line-height:1.6">
    <p>Quattro giocatori, due coppie. Nove carte a testa, quattro in tavola.</p>
    <p>Giochi una carta: se in tavola c'è una carta dello stesso valore la prendi (se sono più d'una scegli tu); altrimenti puoi prendere più carte la cui somma fa il suo valore. Fante 8, cavallo 9, re 10.</p>
    <p><b>L'asso piglia tutto</b> quello che c'è in tavola${settings.assoScopa ? " e vale scopa" : ", ma non vale scopa"}.</p>
    <p>Se svuoti la tavola fai <b>scopa</b> (non all'ultima giocata della mano). A fine mano le carte rimaste vanno a chi ha preso per ultimo.</p>
    <p>Le carte: dall'asso al 7, poi jack (vale 8), donna (9) e re (10). I quadri fanno da denari.</p><p>Punti di ogni mano: carte (più di 20), quadri (più di 5), settebello (il 7 di quadri), primiera, una per ogni scopa${settings.napola ? ", napola (asso, 2 e 3 di quadri: 3 punti più uno per ogni quadri successivo)" : ""}.</p>
    <p>Vince la coppia che arriva per prima a <b>${settings.target}</b>.</p></div>`));

  const view = { id: online ? game.id : null, update };
  SC.view = view;
  gameCleanup = () => { clearTimeout(botTimer); if (SC.view === view) SC.view = null; };
  paint();
  if (st.over) afterChange(st.hands.length - 1);
  else loop();
}

Object.assign(ACTIONS, {
  "sc-new": () => sheetNewScopa(),
  "sc-bots": () => openScopa({ bots: true }),
  "sc-open": el => { const g = SC.games.find(x => x.id === el.dataset.id); if (g) openScopa({ online: true, game: g }); },
  "sc-pick": el => {
    const id = el.dataset.id;
    if (el.dataset.role === "partner") SCN.partner = SCN.partner === id ? null : id;
    else SCN.opp = SCN.opp.includes(id) ? SCN.opp.filter(x => x !== id) : [...SCN.opp, id].slice(-2);
    SCN.assoScopa = !!$("#sc-ace")?.checked; SCN.napola = !!$("#sc-nap")?.checked;
    sheetNewScopa();
  },
  "sc-target": el => { SCN.target = Number(el.dataset.v); SCN.assoScopa = !!$("#sc-ace")?.checked; SCN.napola = !!$("#sc-nap")?.checked; sheetNewScopa(); },
  "sc-create": () => createScopa(),
  async "sc-answer"(el) {
    closeSheet();
    try {
      const g = await scRpc("card_answer", { p_id: el.dataset.id, p_ok: el.dataset.ok === "1" });
      scUpsert(g); refreshScopaCard();
      if (g.status === "active") openScopa({ online: true, game: g });
      else if (el.dataset.ok === "1") { SC.waiting = g.id; openGame(`<div class="duel-wait"><div class="game-ico big">${ico("star", 36)}</div><div class="serif" style="font-size:30px">Aspetto gli altri…</div><div id="sc-wait" class="sc-wait"></div></div>`); refreshWaiting(g); gameCleanup = () => { if (SC.waiting === g.id) SC.waiting = null; }; }
    } catch (e) { toast(e.message, "alert"); }
  },
  async "sc-cancel"(el) {
    try { await scRpc("card_cancel", { p_id: el.dataset.id }); } catch { /* già annullata */ }
    SC.waiting = null; const g = SC.games.find(x => x.id === el.dataset.id); if (g) g.status = "cancelled";
    if (!$("#game").hidden && !SC.view) closeGame();
    refreshScopaCard();
  },
});

(function waitReady() {
  if (typeof ME !== "undefined" && ME && (!CLOUD || api.sb)) { scopaLoad(); return; }
  setTimeout(waitReady, 500);
})();
