/* Capodanno - Poker Texas Hold'em.
   Regole complete: bui che crescono, quattro giri di puntate, rilanci minimi, all-in con piatti secondari,
   showdown con la mano migliore da 5 carte su 7, pareggi divisi. Contro i bot sul telefono o al tavolo con gli amici
   (tabella «tavoli»: ogni telefono ricostruisce la partita dal seme e dalle mosse; i bot li muove chi ha aperto il tavolo). */
"use strict";

// ───────── Carte ─────────
// Carta = 0..51: valore = c % 13 (0 = 2 … 12 = Asso), seme = floor(c / 13) (picche, cuori, quadri, fiori).
const PK_SUIT = "SHDC", PK_RANK = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const pkSrc = c => `carte/52/${PK_SUIT[Math.floor(c / 13)]}${PK_RANK[c % 13]}.svg`;
const pkName = c => `${["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"][c % 13]}${["♠", "♥", "♦", "♣"][Math.floor(c / 13)]}`;
const PK_HANDS = ["Carta alta", "Coppia", "Doppia coppia", "Tris", "Scala", "Colore", "Full", "Poker", "Scala colore"];

// Valuta la migliore mano di 5 carte tra 5-7: restituisce [categoria, ...spareggi] (si confronta in ordine).
function pkEval(cards) {
  const rs = cards.map(c => c % 13), ss = cards.map(c => Math.floor(c / 13));
  const cnt = Array(13).fill(0); rs.forEach(r => cnt[r]++);
  const bySuit = [[], [], [], []]; cards.forEach((c, i) => bySuit[ss[i]].push(rs[i]));
  const straightHigh = ranks => {
    const has = new Set(ranks); if (has.has(12)) has.add(-1);
    for (let h = 12; h >= 3; h--) { let ok = true; for (let k = 0; k < 5; k++) if (!has.has(h - k)) { ok = false; break; } if (ok) return h; }
    return -1;
  };
  for (const suit of bySuit) if (suit.length >= 5) { const h = straightHigh(suit); if (h >= 0) return [8, h]; }
  const groups = [...cnt.keys()].filter(r => cnt[r]).sort((a, b) => cnt[b] - cnt[a] || b - a);
  if (cnt[groups[0]] === 4) return [7, groups[0], Math.max(...rs.filter(r => r !== groups[0]))];
  const trips = groups.filter(r => cnt[r] >= 3), pairs = groups.filter(r => cnt[r] >= 2);
  if (trips.length && pairs.filter(r => r !== trips[0]).length) return [6, trips[0], Math.max(...pairs.filter(r => r !== trips[0]))];
  for (const suit of bySuit) if (suit.length >= 5) return [5, ...suit.sort((a, b) => b - a).slice(0, 5)];
  const sh = straightHigh(rs); if (sh >= 0) return [4, sh];
  const desc = [...new Set(rs)].sort((a, b) => b - a);
  if (trips.length) return [3, trips[0], ...desc.filter(r => r !== trips[0]).slice(0, 2)];
  if (pairs.length >= 2) return [2, pairs[0], pairs[1], desc.filter(r => r !== pairs[0] && r !== pairs[1])[0]];
  if (pairs.length) return [1, pairs[0], ...desc.filter(r => r !== pairs[0]).slice(0, 3)];
  return [0, ...desc.slice(0, 5)];
}
const pkCmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -1) - (b[i] ?? -1); if (d) return d; } return 0; };
function pkHandName(v) {
  const r = i => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Donna", "Re", "Asso"][i];
  const pl = i => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Donne", "Re", "Assi"][i];
  switch (v[0]) {
    case 8: return v[1] === 12 ? "Scala reale" : `Scala colore al ${r(v[1])}`;
    case 7: return `Poker di ${pl(v[1])}`;
    case 6: return `Full di ${pl(v[1])} con ${pl(v[2])}`;
    case 5: return `Colore all'${r(v[1]) === "Asso" ? "Asso" : r(v[1])}`.replace("all'2", "al 2");
    case 4: return `Scala al ${r(v[1])}`;
    case 3: return `Tris di ${pl(v[1])}`;
    case 2: return `Doppia coppia, ${pl(v[1])} e ${pl(v[2])}`;
    case 1: return `Coppia di ${pl(v[1])}`;
    default: return `Carta alta, ${r(v[1])}`;
  }
}

// ───────── Motore ─────────
const PK_DEFAULT = { stack: 1000, sb: 10, bb: 20, every: 8 };
function pkBlinds(set, hand) {
  const lv = Math.floor(hand / (set.every || 8));
  const k = Math.pow(1.5, lv), rnd10 = x => Math.max(set.sb, Math.round(x / 10) * 10);
  return { sb: rnd10(set.sb * k), bb: rnd10(set.bb * k), level: lv + 1 };
}
function pkNew(game) {
  const set = { ...PK_DEFAULT, ...(game.settings || {}) };
  const st = { set, seats: game.seats.map(s => ({ ...s, stack: set.stack, out: false })), hand: -1, dealer: -1, over: false, winner: null, events: [], hands: [] };
  pkStartHand(st, game.seed);
  return st;
}
const pkNext = (st, from, ok) => { const n = st.seats.length; for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (ok(st.seats[i], i)) return i; } return -1; };
function pkStartHand(st, seed) {
  st.seats.forEach(s => { if (s.stack <= 0) s.out = true; });
  const alive = st.seats.filter(s => !s.out);
  if (alive.length < 2) { st.over = true; st.winner = st.seats.findIndex(s => !s.out); return; }
  st.hand++;
  const B = pkBlinds(st.set, st.hand); st.blinds = B;
  st.dealer = st.dealer < 0 ? Math.floor(seededRand((Number(seed) || 1) >>> 0)() * st.seats.length) : st.dealer;
  if (st.seats[st.dealer]?.out || st.hand > 0) st.dealer = pkNext(st, st.dealer, s => !s.out);
  // Mazzo mescolato dal seme della partita e dal numero della mano.
  const rnd = seededRand(((Number(seed) || 1) * 31 + st.hand * 7919 + 17) >>> 0);
  const deck = [...Array(52).keys()]; for (let i = 51; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  st.deck = deck; st.dp = 0; st.board = []; st.street = 0; st.result = null;
  st.seats.forEach(s => Object.assign(s, { folded: s.out, allin: false, bet: 0, contrib: 0, acted: false, locked: false, hole: s.out ? [] : null, last: null }));
  for (const i of [...Array(st.seats.length).keys()].map(k => (st.dealer + 1 + k) % st.seats.length)) if (!st.seats[i].out) st.seats[i].hole = [deck[st.dp++]];
  for (const i of [...Array(st.seats.length).keys()].map(k => (st.dealer + 1 + k) % st.seats.length)) if (!st.seats[i].out) st.seats[i].hole.push(deck[st.dp++]);
  const heads = alive.length === 2;
  st.sbSeat = heads ? st.dealer : pkNext(st, st.dealer, s => !s.out);
  st.bbSeat = pkNext(st, st.sbSeat, s => !s.out);
  const post = (i, amt) => { const s = st.seats[i]; const a = Math.min(amt, s.stack); s.stack -= a; s.bet += a; s.contrib += a; if (!s.stack) s.allin = true; };
  post(st.sbSeat, B.sb); post(st.bbSeat, B.bb);
  st.curBet = B.bb; st.minRaise = B.bb;
  st.toAct = pkNext(st, st.bbSeat, s => !s.folded && !s.allin);
  st.events.push({ t: "hand", hand: st.hand, dealer: st.dealer, blinds: B });
  pkMaybeAdvance(st);
}
const pkCanAct = s => !s.folded && !s.allin && !s.out;
function pkNeedsAct(st) { return st.seats.filter(pkCanAct).filter(s => !s.acted || s.bet < st.curBet); }
function pkLegal(st, i) {
  const s = st.seats[i]; if (!s || st.toAct !== i || st.result || st.over) return null;
  const toCall = Math.min(st.curBet - s.bet, s.stack);
  const minTo = Math.min(st.curBet + st.minRaise, s.bet + s.stack);
  const canRaise = !s.locked && s.stack > toCall && st.seats.some((o, j) => j !== i && pkCanAct(o));
  return { toCall, canCheck: toCall === 0, minTo, maxTo: s.bet + s.stack, canRaise };
}
function pkApply(st, a) {
  if (st.over || st.result) return;
  const i = st.toAct, s = st.seats[i];
  if (a.s !== i) return; // mossa fuori turno: ignorata
  const L = pkLegal(st, i); if (!L) return;
  const put = amt => { const x = Math.min(amt, s.stack); s.stack -= x; s.bet += x; s.contrib += x; if (!s.stack) s.allin = true; return x; };
  let kind = a.a;
  if (kind === "check" && !L.canCheck) kind = "call";
  if (kind === "call" && L.toCall === 0) kind = "check";
  if (kind === "fold" && L.canCheck) kind = "check";
  if (kind === "fold") { s.folded = true; s.last = "Passa"; }
  else if (kind === "check") { s.last = "Check"; }
  else if (kind === "call") { const x = put(L.toCall); s.last = s.allin ? "All-in" : `Vede ${x}`; }
  else {
    let to = kind === "allin" ? L.maxTo : Math.max(Math.min(Number(a.to) || L.minTo, L.maxTo), L.minTo);
    if (!L.canRaise) to = Math.min(st.curBet, L.maxTo);
    const prevBet = st.curBet;
    if (to <= st.curBet) { const x = put(Math.min(st.curBet - s.bet, s.stack)); s.last = s.allin ? "All-in" : x ? `Vede ${x}` : "Check"; }
    else {
      const raiseBy = to - st.curBet, full = raiseBy >= st.minRaise;
      put(to - s.bet);
      if (full) { st.minRaise = raiseBy; st.seats.forEach((o, j) => { if (j !== i) { o.acted = false; o.locked = false; } }); }
      else st.seats.forEach((o, j) => { if (j !== i && o.acted) { o.acted = false; o.locked = true; } });
      st.curBet = to;
      s.last = s.allin ? "All-in" : prevBet === 0 ? `Punta ${to}` : `Rilancia a ${to}`;
    }
  }
  s.acted = true;
  st.events.push({ t: "act", s: i, a: kind, last: s.last });
  const live = st.seats.filter(o => !o.folded && !o.out);
  if (live.length === 1) return pkAward(st, [{ amount: st.seats.reduce((t, o) => t + o.contrib, 0), winners: [st.seats.indexOf(live[0])], uncontested: true }]);
  st.toAct = pkNext(st, i, (o, j) => pkCanAct(o) && (!o.acted || o.bet < st.curBet));
  pkMaybeAdvance(st);
}
// Fine giro di puntate: si scoprono le carte (o si va allo showdown quando nessuno può più puntare).
function pkMaybeAdvance(st) {
  while (!st.result && !st.over) {
    if (st.toAct >= 0 && pkNeedsAct(st).length && st.seats[st.toAct] && pkCanAct(st.seats[st.toAct]) && (!st.seats[st.toAct].acted || st.seats[st.toAct].bet < st.curBet)) {
      // Se l'unico che può agire ha già pareggiato tutti e gli altri sono all-in, non serve chiedergli niente.
      const can = st.seats.filter(pkCanAct);
      if (!(can.length === 1 && can[0].bet >= st.curBet)) return;
    }
    st.seats.forEach(o => { o.bet = 0; o.acted = false; o.locked = false; });
    st.curBet = 0; st.minRaise = st.blinds.bb;
    if (st.street === 3) return pkShowdown(st);
    st.street++;
    const n = st.street === 1 ? 3 : 1;
    for (let k = 0; k < n; k++) st.board.push(st.deck[st.dp++]);
    st.events.push({ t: "street", street: st.street, board: [...st.board] });
    const can = st.seats.filter(pkCanAct);
    st.toAct = can.length >= 2 ? pkNext(st, st.dealer, pkCanAct) : -1;
  }
}
function pkShowdown(st) {
  const live = st.seats.map((s, i) => ({ s, i })).filter(x => !x.s.folded && !x.s.out);
  live.forEach(x => { x.v = pkEval([...x.s.hole, ...st.board]); });
  const levels = [...new Set(live.map(x => x.s.contrib))].sort((a, b) => a - b);
  const pots = []; let prev = 0;
  levels.forEach((L, k) => {
    let amount = st.seats.reduce((t, o) => t + Math.max(0, Math.min(o.contrib, L) - Math.min(o.contrib, prev)), 0);
    if (k === levels.length - 1) amount += st.seats.reduce((t, o) => t + Math.max(0, o.contrib - L), 0);
    const elig = live.filter(x => x.s.contrib >= L);
    let best = null; for (const x of elig) if (!best || pkCmp(x.v, best) > 0) best = x.v;
    pots.push({ amount, winners: elig.filter(x => pkCmp(x.v, best) === 0).map(x => x.i), hand: best });
    prev = L;
  });
  pkAward(st, pots.filter(p => p.amount > 0), live);
}
function pkAward(st, pots, live) {
  const n = st.seats.length;
  for (const p of pots) {
    const share = Math.floor(p.amount / p.winners.length); let rest = p.amount - share * p.winners.length;
    const order = [...p.winners].sort((a, b) => ((a - st.dealer + n) % n) - ((b - st.dealer + n) % n));
    order.forEach(w => { st.seats[w].stack += share + (rest > 0 ? 1 : 0); if (rest > 0) rest--; });
  }
  st.result = { pots, shown: live ? live.map(x => ({ i: x.i, hole: x.s.hole, v: x.v })) : [], board: [...st.board] };
  st.events.push({ t: "result", result: st.result });
  st.hands.push({ hand: st.hand, pots: pots.map(p => ({ amount: p.amount, winners: p.winners, hand: p.hand })) });
}
// Ricostruisce la partita: dopo ogni mano chiusa la mossa {a:"next"} fa partire la successiva.
function pkReplay(game, upto = (game.actions || []).length) {
  const st = pkNew(game);
  for (const a of (game.actions || []).slice(0, upto)) {
    if (a.a === "next") { if (st.result) pkStartHand(st, game.seed); continue; }
    if (a.a === "quit") { st.seats[a.s].out = true; st.seats[a.s].folded = true; if (!st.result && st.toAct === a.s) pkApply(st, { s: a.s, a: "fold" }); continue; }
    pkApply(st, a);
  }
  return st;
}

// ───────── Bot ─────────
// Forza della mano con simulazioni rapide (Monte Carlo) contro gli avversari ancora in gioco.
function pkEquity(hole, board, opp, sims = 260) {
  const used = new Set([...hole, ...board]);
  const rest = [...Array(52).keys()].filter(c => !used.has(c));
  let win = 0;
  for (let k = 0; k < sims; k++) {
    const d = [...rest]; const need = 5 - board.length + opp * 2;
    for (let i = 0; i < need; i++) { const j = i + Math.floor(Math.random() * (d.length - i)); [d[i], d[j]] = [d[j], d[i]]; }
    const b = [...board, ...d.slice(0, 5 - board.length)]; let p = 5 - board.length;
    const me = pkEval([...hole, ...b]); let best = 1, ties = 0;
    for (let o = 0; o < opp; o++) { const v = pkEval([d[p++], d[p++], ...b]); const c = pkCmp(me, v); if (c < 0) { best = 0; break; } if (c === 0) ties++; }
    if (best) win += ties ? 1 / (ties + 1) : 1;
  }
  return win / sims;
}
function pkBot(st, i, level = 2) {
  const s = st.seats[i], L = pkLegal(st, i); if (!L) return null;
  const opp = st.seats.filter((o, j) => j !== i && !o.folded && !o.out).length;
  const eq = pkEquity(s.hole, st.board, Math.max(1, opp), st.board.length ? 300 : 200);
  const pot = st.seats.reduce((t, o) => t + o.contrib, 0);
  const odds = L.toCall / Math.max(1, pot + L.toCall);
  const noise = (Math.random() - 0.5) * (level >= 3 ? 0.08 : 0.16);
  const strength = eq + noise, bluff = Math.random() < (level >= 2 ? 0.06 : 0.02);
  const fair = 1 / (opp + 1);
  const raiseTo = mult => Math.min(L.maxTo, Math.max(L.minTo, Math.round((st.curBet + pot * mult) / 10) * 10));
  if (L.canRaise && (strength > fair + 0.32 || (bluff && L.canCheck))) return { a: "raise", to: raiseTo(strength > fair + 0.45 ? 1 : 0.6) };
  if (L.canRaise && strength > fair + 0.18 && Math.random() < 0.45) return { a: "raise", to: raiseTo(0.5) };
  if (L.canCheck) return { a: "check" };
  if (strength >= odds + 0.04 || (L.toCall <= st.blinds.bb && strength > fair * 0.7)) return { a: "call" };
  return { a: "fold" };
}

// ───────── Interfaccia ─────────
const PK = { view: null };
function pkCard(c, cls = "") { return c == null ? `<img class="pk-c back ${cls}" src="carte/retro.svg" alt="">` : `<img class="pk-c ${cls}" src="${pkSrc(c)}" alt="${pkName(c)}">`; }
function playPoker(opts) {
  const online = !!opts.online;
  let game = online ? opts.online : {
    id: null, seed: Math.floor(Math.random() * 2147483647), actions: [], status: "active", created_by: ME,
    settings: { ...PK_DEFAULT, ...(opts.settings || {}) },
    seats: [{ id: ME, name: firstName(me()) || "Tu" }, ...Array.from({ length: opts.bots || 3 }, (_, k) => ({ bot: true, name: ["Lino", "Gina", "Franco", "Rosa", "Tano"][k] }))],
  };
  const mySeat = game.seats.findIndex(s => s.id === ME), host = game.created_by === ME;
  const level = opts.level || game.settings.level || 2;
  let shown = (game.actions || []).length, botT = null, nextT = null, pending = false, raiseOpen = false, raiseVal = 0, playing = false;
  openGame(`<div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Texas Hold'em</div><div class="tiny faint" id="pk-sub"></div></div>
      <button class="btn icon sm" id="pk-help" aria-label="Regole">?</button></div>
    <div class="pk-table" id="pk-table"></div>
    <div class="pk-msg" id="pk-msg"></div>
    <div class="pk-me" id="pk-me"></div>
    <div class="pk-act" id="pk-act"></div>
    <div id="pk-end"></div>`);
  const seatPos = n => { // posizioni intorno al tavolo ovale, io sempre in basso
    const P = { 2: [[50, 92], [50, 8]], 3: [[50, 92], [16, 26], [84, 26]], 4: [[50, 92], [13, 50], [50, 8], [87, 50]], 5: [[50, 92], [13, 64], [25, 12], [75, 12], [87, 64]], 6: [[50, 92], [13, 68], [16, 22], [50, 7], [84, 22], [87, 68]] }[n];
    return P;
  };
  const who = i => (i === mySeat ? "Tu" : game.seats[i].name || mname(game.seats[i].id));
  const paint = (st, opts2 = {}) => {
    const n = game.seats.length, pos = seatPos(n), rot = i => (i - Math.max(0, mySeat) + n) % n;
    const pot = st.seats.reduce((t, o) => t + o.contrib, 0) - st.seats.reduce((t, o) => t + o.bet, 0);
    const showAll = !!st.result && st.result.shown.length > 1;
    const winners = new Set(st.result ? st.result.pots.flatMap(p => p.winners) : []);
    $("#pk-sub").textContent = st.over ? "Partita finita" : `Mano ${st.hand + 1} · bui ${st.blinds.sb}/${st.blinds.bb} · livello ${st.blinds.level}`;
    $("#pk-table").innerHTML = `<div class="pk-felt"><div class="pk-logo">Capodanno</div>
        <div class="pk-board">${[0, 1, 2, 3, 4].map(k => st.board[k] != null ? pkCard(st.board[k], opts2.newBoard && k >= opts2.newBoard ? "deal" : "") : `<span class="pk-slot"></span>`).join("")}</div>
        <div class="pk-pot">${pot > 0 ? `Piatto <b>${pot}</b>` : ""}</div></div>
      ${st.seats.map((s, i) => { const [x, y] = pos[rot(i)]; const me1 = i === mySeat; const turn = st.toAct === i && !st.result && !st.over;
        const avatarHtml = s.bot ? `<span class="pk-bot">${esc((s.name || "B")[0])}</span>` : avatar(member(s.id) || me(), "sm");
        const cards = s.out ? "" : me1 ? "" : s.folded ? "" : (showAll && st.result.shown.some(x => x.i === i)) ? s.hole.map(c => pkCard(c, "sm")).join("") : `${pkCard(null, "sm")}${pkCard(null, "sm")}`;
        return `<div class="pk-seat ${turn ? "turn" : ""} ${s.folded ? "folded" : ""} ${s.out ? "out" : ""} ${winners.has(i) ? "win" : ""}" style="left:${x}%;top:${y}%">
          <div class="pk-cards">${cards}</div>
          <div class="pk-plate">${avatarHtml}<span class="pk-nm">${esc(who(i))}</span><b>${s.out ? "fuori" : s.stack}</b></div>
          ${s.last && !st.result ? `<div class="pk-last">${esc(s.last)}</div>` : ""}
          ${s.bet ? `<div class="pk-bet"><i></i>${s.bet}</div>` : ""}
          ${st.dealer === i ? `<span class="pk-dealer">D</span>` : ""}</div>`; }).join("")}`;
    const meS = st.seats[mySeat];
    if (meS && !meS.out) {
      const v = meS.hole && st.board.length >= 3 ? pkEval([...meS.hole, ...st.board]) : meS.hole?.[0] % 13 === meS.hole?.[1] % 13 ? [1, meS.hole[0] % 13] : null;
      $("#pk-me").innerHTML = `<div class="pk-hole ${meS.folded ? "folded" : ""}">${(meS.hole || []).map(c => pkCard(c, "big")).join("")}</div><div class="pk-hn">${v ? pkHandName(v) : ""}</div>`;
    } else $("#pk-me").innerHTML = "";
    const L = pkLegal(st, mySeat);
    const act = $("#pk-act");
    if (!L || pending || playing) { act.innerHTML = st.over || st.result ? "" : `<div class="pk-wait">${st.toAct >= 0 ? `Tocca a ${esc(who(st.toAct))}…` : ""}</div>`; }
    else {
      const pot2 = st.seats.reduce((t, o) => t + o.contrib, 0);
      if (!raiseVal || raiseVal < L.minTo || raiseVal > L.maxTo) raiseVal = L.minTo;
      const preset = m => Math.min(L.maxTo, Math.max(L.minTo, Math.round((st.curBet + (pot2 + L.toCall) * m) / 10) * 10));
      act.innerHTML = raiseOpen && L.canRaise ? `<div class="pk-raise">
          <div class="pk-presets">${[["Min", L.minTo], ["½ piatto", preset(0.5)], ["Piatto", preset(1)], ["All-in", L.maxTo]].map(([l, v]) => `<button data-to="${v}">${l}<b>${v}</b></button>`).join("")}</div>
          <input type="range" id="pk-range" min="${L.minTo}" max="${L.maxTo}" step="${st.blinds.sb}" value="${raiseVal}">
          <div class="pk-row"><button class="btn" data-pk="cancel">Indietro</button><button class="btn pearl grow" data-pk="raise">${raiseVal >= L.maxTo ? "All-in" : st.curBet ? "Rilancia a" : "Punta"} <b id="pk-rv">${raiseVal}</b></button></div></div>`
        : `<div class="pk-row">${L.canCheck ? "" : `<button class="btn pk-fold" data-pk="fold">Passa</button>`}
          <button class="btn grow" data-pk="${L.canCheck ? "check" : "call"}">${L.canCheck ? "Check" : L.toCall >= meS.stack ? `All-in ${L.toCall}` : `Vedi ${L.toCall}`}</button>
          ${L.canRaise ? `<button class="btn pearl grow" data-pk="open-raise">${st.curBet ? "Rilancia" : "Punta"}</button>` : ""}</div>`;
    }
    const last = [...st.events].reverse().find(e => e.t === "act" || e.t === "street" || e.t === "hand");
    $("#pk-msg").innerHTML = st.result ? pkResultText(st) : last?.t === "act" ? `${esc(who(last.s))}: ${esc(last.last)}` : last?.t === "street" ? ["", "Flop", "Turn", "River"][last.street] : st.hand >= 0 ? `Nuova mano · ${esc(who(st.dealer))} dà le carte` : "";
  };
  const pkResultText = st => {
    const r = st.result, main = r.pots[0];
    if (main?.uncontested) return `<b>${esc(who(main.winners[0]))}</b> vince ${main.amount}: gli altri hanno passato`;
    return r.pots.map((p, k) => `${r.pots.length > 1 ? (k ? "Piatto secondario: " : "Piatto principale: ") : ""}<b>${p.winners.map(w => esc(who(w))).join(" e ")}</b> ${p.winners.length > 1 ? "dividono" : "vince"} ${p.amount}${p.hand ? ` con ${esc(pkHandName(p.hand))}` : ""}`).join("<br>");
  };
  // Racconta una mossa alla volta, con il tempo di vedere cosa succede.
  const advance = async () => {
    if (playing) return; playing = true;
    try {
      while (shown < game.actions.length) {
        const before = pkReplay(game, shown);
        shown++;
        const after = pkReplay(game, shown);
        const newBoard = after.board.length > before.board.length ? before.board.length : 0;
        paint(after, { newBoard });
        if (after.result && !before.result) navigator.vibrate?.(after.result.pots.some(p => p.winners.includes(mySeat)) ? [30, 40, 30] : 10);
        await new Promise(r => setTimeout(r, after.result && !before.result ? 600 : newBoard ? 700 : 450));
      }
    } finally { playing = false; }
    tick();
  };
  const st0 = () => pkReplay(game);
  const send = async a => {
    if (!online) { game.actions.push(a); return advance(); }
    pending = true; paint(st0());
    try { const row = await tvRpc("tavolo_act", { p_id: game.id, p_ply: game.actions.length, p_action: a }); pending = false; update(row); }
    catch (e) { pending = false; toast(e.message, "alert"); const { data } = await api.sb.from("tavoli").select("*").eq("id", game.id).maybeSingle(); if (data) update(data); else paint(st0()); }
  };
  // Dopo ogni azione: muovono i bot (solo il telefono di chi ha aperto il tavolo) e si passa alla mano dopo.
  const tick = () => {
    clearTimeout(botT); clearTimeout(nextT);
    const st = st0(); paint(st);
    if (st.over) return finish(st);
    if (st.result) { if (!online || host) nextT = setTimeout(() => { if (pkReplay(game).result) send({ a: "next" }); }, 3600); return; }
    const seat = game.seats[st.toAct];
    if (seat?.bot && (!online || host)) botT = setTimeout(() => { const cur = st0(); if (cur.toAct === st.toAct && !cur.result) { const m = pkBot(cur, cur.toAct, level); if (m) send({ ...m, s: cur.toAct }); } }, 900 + Math.random() * 700);
  };
  $("#pk-act").addEventListener("click", e => {
    const b = e.target.closest("[data-pk],[data-to]"); if (!b) return;
    const st = st0(); const L = pkLegal(st, mySeat); if (!L || pending || playing) return;
    if (b.dataset.to) { raiseVal = Number(b.dataset.to); paint(st); return; }
    const k = b.dataset.pk;
    if (k === "open-raise") { raiseOpen = true; raiseVal = L.minTo; return paint(st); }
    if (k === "cancel") { raiseOpen = false; return paint(st); }
    raiseOpen = false;
    if (k === "raise") send({ s: mySeat, a: raiseVal >= L.maxTo ? "allin" : "raise", to: raiseVal });
    else send({ s: mySeat, a: k });
    navigator.vibrate?.(8);
  });
  $("#pk-act").addEventListener("input", e => { if (e.target.id === "pk-range") { raiseVal = Number(e.target.value); const el = $("#pk-rv"); if (el) el.textContent = raiseVal; } });
  $("#pk-help").addEventListener("click", () => openSheet(`<h2>Texas Hold'em</h2><div class="small muted" style="line-height:1.5">
    <p>Due carte coperte a testa e cinque in mezzo (flop, turn, river). Vince chi fa la combinazione migliore con 5 delle 7 carte, oppure chi resta solo perché gli altri hanno passato.</p>
    <p><b>Combinazioni, dalla più forte:</b> scala colore, poker, full, colore, scala, tris, doppia coppia, coppia, carta alta.</p>
    <p><b>Puntate:</b> passa (abbandoni la mano), check (se nessuno ha puntato), vedi (pareggi la puntata), punta o rilancia (almeno quanto l'ultimo rilancio). L'all-in crea un piatto secondario: chi è all-in vince solo quello a cui ha partecipato.</p>
    <p>I bui (piccolo e grande) salgono ogni ${game.settings.every || 8} mani. Chi resta senza gettoni esce; vince chi li prende tutti.</p></div>`));
  const finish = async st => {
    clearTimeout(botT); clearTimeout(nextT);
    const won = st.winner === mySeat;
    $("#pk-act").innerHTML = "";
    $("#pk-end").innerHTML = `<div class="glass win"><div class="serif" style="font-size:34px">${won ? "Hai vinto il tavolo" : `Vince ${esc(who(st.winner))}`}</div><div class="small muted">${st.hand + 1} mani giocate</div>
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button>${online ? "" : `<button class="btn primary" data-act="pk-solo">Un'altra</button>`}</div></div>`;
    if (won) confettiBurst();
    if (!online && won) saveScore("poker", 100 + Math.max(0, 40 - st.hand), { hands: st.hand + 1, bots: game.seats.length - 1 });
    if (online && game.status === "active") tvRpc("tavolo_finish", { p_id: game.id, p_result: { winner: st.winner, seat: game.seats[st.winner] } }).catch(() => {});
  };
  const update = row => {
    if (!online || row.id !== game.id || row.actions.length < game.actions.length) return;
    game = row;
    if (shown < game.actions.length) advance(); else tick();
  };
  TV.view = online ? { id: game.id, update } : null;
  gameCleanup = () => { clearTimeout(botT); clearTimeout(nextT); TV.view = null; };
  paint(st0()); tick();
}

// ───────── Tavoli online (condivisi con il gioco a squadre) ─────────
const TV = { list: [], view: null, waiting: null, shown: new Set() };
async function tvRpc(fn, args) { const { data, error } = await api.sb.rpc(fn, args); if (error) throw new Error(/function|tavol/i.test(error.message) && /not|exist|find/i.test(error.message) ? "Serve aggiornamento-8.sql su Supabase" : error.message); return data; }
function tvUpsert(row) { if (!row?.id) return; const i = TV.list.findIndex(g => g.id === row.id); if (i >= 0) TV.list[i] = row; else TV.list.unshift(row); }
async function tvLoad() { if (!CLOUD) return; const { data, error } = await api.sb.from("tavoli").select("*").order("updated_at", { ascending: false }).limit(60); if (!error) { TV.list = data || []; TV.list.forEach(tvPrompt); } }
window.onTavoloChange = payload => {
  const row = payload.new && payload.new.id ? payload.new : null; if (!row) return;
  tvUpsert(row);
  if (TV.view?.id === row.id) TV.view.update(row);
  if (TV.waiting === row.id) {
    if (row.status === "active") { TV.waiting = null; tvOpen(row); }
    else if (row.status === "cancelled") { TV.waiting = null; closeGame(); toast("Tavolo annullato"); }
    else tvWaitPaint(row);
  }
  tvPrompt(row);
};
const TV_NAME = { poker: "Texas Hold'em", squadre: "Chiavenna Express" };
function tvPrompt(g) {
  if (g.status !== "invited" || !g.players.includes(ME) || (g.accepted || []).includes(ME) || TV.shown.has(g.id) || Date.now() - new Date(g.created_at) > 30 * 60000 || !$("#game").hidden) return;
  TV.shown.add(g.id);
  openSheet(`<div class="duel-invite"><div class="game-ico big">${ico(g.kind === "poker" ? "card" : "users", 36)}</div>
    <div class="serif" style="font-size:28px">${esc(mname(g.created_by))} ti invita a ${TV_NAME[g.kind]}</div>
    <div class="small muted" style="margin:6px 0 18px">${g.seats.map(s => esc(s.bot ? `${s.name} (bot)` : mname(s.id))).join(", ")}</div>
    <div class="actions"><button class="btn" data-act="tv-answer" data-id="${g.id}" data-ok="0">No grazie</button><button class="btn primary" data-act="tv-answer" data-id="${g.id}" data-ok="1">Siediti</button></div></div>`);
  navigator.vibrate?.([30, 50, 30]);
}
function tvWaitPaint(g) {
  const el = $("#tv-wait"); if (!el) return;
  el.innerHTML = g.seats.map(s => `<div class="sc-seat ${s.bot || (g.accepted || []).includes(s.id) ? "ok" : ""}">${s.bot ? `<span class="pk-bot">${esc((s.name || "B")[0])}</span>` : avatar(member(s.id), "sm")}<span>${esc(s.bot ? `${s.name} (bot)` : mname(s.id))}</span><b>${s.bot || (g.accepted || []).includes(s.id) ? "pronto" : "…"}</b></div>`).join("");
}
function tvWaiting(g) {
  TV.waiting = g.id;
  openGame(`<div class="duel-wait"><div class="game-ico big">${ico(g.kind === "poker" ? "card" : "users", 36)}</div><div class="serif" style="font-size:30px">Aspetto il tavolo…</div>
    <div id="tv-wait" class="sc-wait"></div><button class="btn" style="margin-top:22px" data-act="tv-cancel" data-id="${g.id}">${g.created_by === ME ? "Annulla" : "Chiudi"}</button></div>`);
  tvWaitPaint(g);
  gameCleanup = () => { if (TV.waiting === g.id) TV.waiting = null; };
}
const tvOpen = g => (g.kind === "poker" ? playPoker({ online: g }) : window.playSquadre?.({ online: g }));
async function tvCreate(kind, seats, settings) {
  if (!CLOUD) return toast("Il tavolo con gli amici funziona con il database collegato");
  closeSheet();
  try {
    const g = await tvRpc("tavolo_create", { p_kind: kind, p_seats: seats, p_settings: settings });
    tvUpsert(g);
    seats.filter(s => !s.bot && s.id !== ME).forEach(s => api.notify("tavolo", g.id));
    if (g.status === "active") tvOpen(g); else tvWaiting(g);
  } catch (e) { toast(e.message, "alert"); }
}
function pokerSetup() {
  const others = S.members.filter(m => m.id !== ME);
  openSheet(`<h2>Texas Hold'em</h2>
    <div class="label">Contro i bot</div>
    <div class="pk-opts" data-noswipe><span>Avversari</span>${[1, 2, 3, 4, 5].map(n => `<button class="${n === 3 ? "on" : ""}" data-pkb="${n}">${n}</button>`).join("")}</div>
    <div class="pk-opts" data-noswipe><span>Livello</span>${[["Facile", 1], ["Normale", 2], ["Squalo", 3]].map(([l, v]) => `<button class="${v === 2 ? "on" : ""}" data-pkl="${v}">${l}</button>`).join("")}</div>
    <button class="btn pearl block" data-act="pk-solo" style="margin-top:8px">${ico("card", 16)}Siediti al tavolo</button>
    <div class="label" style="margin-top:18px">Con gli amici</div>
    <div class="small muted" style="margin:-4px 0 8px">Scegli fino a 5 amici: i posti vuoti li puoi riempire con i bot.</div>
    <div class="stack" style="gap:6px" id="pk-friends">${others.map(m => `<button type="button" class="pk-friend" data-pkf="${m.id}">${avatar(m, "sm")}<span class="grow t">${esc(m.name)}</span><span class="pk-tick">${ico("check", 16)}</span></button>`).join("")}</div>
    <div class="tiny faint" id="pk-fcount" style="margin-top:6px">Nessuno scelto</div>
    <div class="pk-opts" data-noswipe style="margin-top:10px"><span>Bot in più</span>${[0, 1, 2, 3].map(n => `<button class="${n === 0 ? "on" : ""}" data-pkx="${n}">${n}</button>`).join("")}</div>
    <button class="btn primary block" data-act="pk-table" style="margin-top:8px">${ico("users", 16)}Apri il tavolo</button>`);
  $("#sheet").addEventListener("click", e => {
    const f = e.target.closest("[data-pkf]");
    if (f) {
      const n = document.querySelectorAll("#sheet .pk-friend.on").length;
      if (!f.classList.contains("on") && n >= 5) return toast("Al massimo 5 amici al tavolo");
      f.classList.toggle("on"); navigator.vibrate?.(8);
      const k = document.querySelectorAll("#sheet .pk-friend.on").length;
      $("#pk-fcount").textContent = k ? `${k} ${k === 1 ? "amico scelto" : "amici scelti"}` : "Nessuno scelto";
      return;
    }
    const b = e.target.closest("[data-pkb],[data-pkl],[data-pkx]"); if (!b) return;
    const key = Object.keys(b.dataset)[0];
    b.parentElement.querySelectorAll(`[data-${key}]`).forEach(x => x.classList.toggle("on", x === b));
  });
}
const pkOpt = (k, d) => Number($(`#sheet [data-${k}].on`)?.dataset[k] ?? d);
Object.assign(ACTIONS, {
  "pk-setup": () => pokerSetup(),
  "pk-solo": () => { const bots = pkOpt("pkb", 3), level = pkOpt("pkl", 2); closeSheet(); closeGame(); playPoker({ bots, level }); },
  "pk-table": () => {
    const ids = [...document.querySelectorAll("#sheet .pk-friend.on")].map(x => x.dataset.pkf).slice(0, 5);
    if (!ids.length) return toast("Scegli almeno un amico");
    const extra = Math.min(pkOpt("pkx", 0), 6 - 1 - ids.length);
    const seats = [{ id: ME, name: firstName(me()) }, ...ids.map(id => ({ id, name: firstName(member(id)) })), ...Array.from({ length: extra }, (_, k) => ({ bot: true, name: ["Lino", "Gina", "Franco"][k] }))];
    tvCreate("poker", seats, { ...PK_DEFAULT, level: 2 });
  },
  async "tv-answer"(el) {
    closeSheet();
    try { const g = await tvRpc("tavolo_answer", { p_id: el.dataset.id, p_ok: el.dataset.ok === "1" }); tvUpsert(g); if (g.status === "active") tvOpen(g); else if (el.dataset.ok === "1") tvWaiting(g); }
    catch (e) { toast(e.message, "alert"); }
  },
  async "tv-cancel"(el) { try { await tvRpc("tavolo_cancel", { p_id: el.dataset.id }); } catch { /* già chiuso */ } TV.waiting = null; closeGame(); },
  "tv-open": el => { const g = TV.list.find(x => x.id === el.dataset.id); if (g) { closeSheet(); tvOpen(g); } },
});
window.pokerCard = () => {
  const mine = TV.list.filter(g => g.kind === "poker" && g.players.includes(ME) && g.status === "active");
  return `<section class="card game-card"><div class="row top"><div class="game-ico">${ico("card", 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">Texas Hold'em</div>
    <div class="small muted" style="margin-top:6px">Poker vero: bui che salgono, rilanci, all-in e piatti secondari. Contro i bot o al tavolo con gli amici.</div></div></div>
    ${mine.map(g => `<div class="li"><div class="grow t">Tavolo con ${esc(g.seats.filter(s => s.id !== ME).map(s => s.bot ? s.name : mname(s.id)).join(", "))}</div><button class="btn sm primary" data-act="tv-open" data-id="${g.id}">Riprendi</button></div>`).join("")}
    <button class="btn pearl block" style="margin-top:14px" data-act="pk-setup">${ico("card", 16)}Gioca</button></section>`;
};
GAMES.poker = { label: "Texas Hold'em", icon: "card", kind: "points" };
(function waitTv() { if (typeof ME !== "undefined" && ME && (!CLOUD || api.sb)) { tvLoad(); return; } setTimeout(waitTv, 600); })();
