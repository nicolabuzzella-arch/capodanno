/* Capodanno - giochi del gruppo e classifiche.
   - Sudoku del giorno 9×9, in due modalità: Normale e Killer (solo gabbie con le somme, nessun numero dato).
     Stessa griglia per tutti nello stesso giorno; conta il primo tentativo; ogni errore aggiunge 15 secondi.
     I Killer vengono da una libreria di griglie a soluzione unica (killer-lib.js).
   - Fuochi: 30 secondi per far esplodere più razzi possibile.
   - Tiro alla fune: sfida 1 contro 1 in tempo reale (o contro il computer).
   Usa le funzioni globali di app.js. */
"use strict";

const GAMES = {
  sudoku9: { label: "Sudoku", icon: "grid", kind: "time" },
  killer: { label: "Killer Sudoku", icon: "grid", kind: "time" },
  fuochi: { label: "Fuochi", icon: "burst", kind: "points" },
  fune: { label: "Tiro alla fune", icon: "swap", kind: "wins" },
};
const PENALTY = 15;
const mmss = s => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

// ───────────────────────── Classifiche (di sempre, una per gioco) ─────────────────────────

function leaderboard(game) {
  const rows = new Map();
  for (const s of S.scores) {
    if (s.game !== game || !member(s.member_id)) continue;
    const cur = rows.get(s.member_id);
    if (GAMES[game].kind === "sum") {
      const r = cur || { member_id: s.member_id, score: 0, played: 0 };
      r.score += s.score; r.played++;
      rows.set(s.member_id, r);
    } else if (GAMES[game].kind === "wins") {
      const r = cur || { member_id: s.member_id, score: 0, played: 0 };
      r.score += s.score > 0 ? 1 : 0; r.played++;
      rows.set(s.member_id, r);
    } else if (!cur || (GAMES[game].kind === "time" ? s.score < cur.score : s.score > cur.score)) rows.set(s.member_id, s);
  }
  const lower = GAMES[game].kind === "time";
  return [...rows.values()].sort((a, b) => (lower ? a.score - b.score : b.score - a.score) || (b.played || 0) - (a.played || 0));
}
const myRank = game => { const lb = leaderboard(game); const i = lb.findIndex(s => s.member_id === ME); return i < 0 ? null : { pos: i + 1, of: lb.length, s: lb[i] }; };
const playedToday = game => S.scores.some(s => s.game === game && s.member_id === ME && s.day === today());
const fmtScore = (game, s) => (GAMES[game].kind === "time" ? mmss(s.score) : GAMES[game].kind === "wins" ? `${s.score} ${s.score === 1 ? "vittoria" : "vittorie"}` : `${s.score} pt`);

function rankCard(game) {
  const lb = leaderboard(game).slice(0, 10);
  return `<section class="card">
    <div class="row" style="gap:10px;margin-bottom:${lb.length ? 12 : 0}px">${ico(GAMES[game].icon, 18)}<div class="t grow">${GAMES[game].label}</div>${lb.length ? "" : `<span class="small faint">ancora nessuno</span>`}</div>
    ${lb.map((s, i) => `
      <div class="li rank ${s.member_id === ME ? "me" : ""}">
        <span class="pos p${i + 1}">${i + 1}</span>
        ${avatar(member(s.member_id), "sm")}
        <span class="grow t ellipsis">${esc(mname(s.member_id))}${s.member_id === ME ? ` <span class="faint small">tu</span>` : ""}</span>
        ${s.played ? `<span class="tiny faint">${s.played} ${GAMES[game].kind === "sum" ? (s.played === 1 ? "giorno" : "giorni") : s.played === 1 ? "sfida" : "sfide"}</span>` : s.meta?.mistakes ? `<span class="tiny faint">${s.meta.mistakes} err.</span>` : ""}
        <b class="num">${fmtScore(game, s)}</b>
      </div>`).join("")}
  </section>`;
}

window.viewGiochi = function () {
  const rs = myRank("sudoku9"), rk = myRank("killer"), rf = myRank("fuochi"), rt = myRank("fune");
  const tile = (game, title, sub) => {
    const done = playedToday(game);
    return `<button class="tile" data-act="play-sudoku" data-mode="${game}">
      <div class="row between"><b>${title}</b>${done ? `<span class="pos">${ico("check", 15)}</span>` : ""}</div>
      <div class="tiny faint" style="margin-top:4px">${sub}</div>
      <div class="small ${done ? "pos" : "muted"}" style="margin-top:10px">${done ? "Risolto oggi" : "Da risolvere oggi"}</div>
    </button>`;
  };
  return `
  ${window.chessCard ? chessCard() : ""}
  ${window.scopaCard ? scopaCard() : ""}
  ${window.games2Cards ? games2Cards() : ""}
  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("grid", 30)}</div>
      <div class="grow"><div class="serif" style="font-size:28px;line-height:1">Sudoku del giorno</div>
        <div class="small muted" style="margin-top:6px">9×9, stessa griglia per tutti, nuova ogni mezzanotte. Conta il primo tentativo; ogni errore vale ${PENALTY} secondi.</div></div></div>
    <div class="grid2" style="margin-top:16px">
      ${tile("sudoku9", "Normale", "Il classico")}
      ${tile("killer", "Killer", "Solo somme, nessun numero")}
    </div>
  </section>

  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("swap", 30)}</div>
      <div class="grow"><div class="serif" style="font-size:28px;line-height:1">Tiro alla fune</div>
        <div class="small muted" style="margin-top:6px">Uno contro uno, in tempo reale: tocca più veloce che puoi e trascina il nodo dalla tua parte.</div></div></div>
    <div id="duel-online" style="margin-top:14px">${duelOnlineList()}</div>
    <button class="btn block" style="margin-top:12px" data-act="duel-cpu">${ico("device", 17)}Allenati contro il telefono</button>
  </section>

  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("burst", 30)}</div>
      <div class="grow"><div class="serif" style="font-size:28px;line-height:1">Fuochi</div>
        <div class="small muted" style="margin-top:6px">Trenta secondi: tocca i razzi prima che spariscano. Quelli azzurri valgono 3, attento a quelli rossi. Più colpi di fila, più punti.</div></div></div>
    <button class="btn pearl block" style="margin-top:16px" data-act="play-fuochi">${ico("burst", 18)}Gioca${rf ? ` · record ${rf.s.score} pt` : ""}</button>
  </section>

  <div class="section"><div class="label row" style="gap:8px">${ico("trophy", 15)}Classifiche di sempre</div></div>
  ${window.chessRankCard ? chessRankCard() : ""}${window.scopaRankCard ? scopaRankCard() : ""}${window.games2Ranks ? games2Ranks() : ""}${rankCard("sudoku9")}${rankCard("killer")}${rankCard("fune")}${rankCard("fuochi")}
  ${rs || rk || rt ? "" : ""}`;
};

window.homeGamesCard = function () {
  const leadK = leaderboard("killer")[0], leadF = leaderboard("fune")[0];
  const doneS = playedToday("sudoku9"), doneK = playedToday("killer");
  return `
  <section class="card tap" data-act="tab" data-tab="giochi">
    <div class="row between" style="margin-bottom:14px"><div class="label" style="margin:0">Giochi</div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="grid2">
      <div class="tile static"><div class="row" style="gap:8px">${ico("grid", 18)}<b class="small">Sudoku del giorno</b></div>
        <div class="tiny ${doneS && doneK ? "pos" : "muted"}" style="margin-top:8px">${doneS && doneK ? "Normale e Killer risolti" : doneS ? "Normale risolto, manca il Killer" : doneK ? "Killer risolto, manca il Normale" : "Due griglie nuove ti aspettano"}</div>
        ${leadK ? `<div class="tiny faint">Re del Killer: ${esc(mname(leadK.member_id))}</div>` : ""}</div>
      <div class="tile static"><div class="row" style="gap:8px">${ico("swap", 18)}<b class="small">Tiro alla fune</b></div>
        <div class="tiny muted" style="margin-top:8px">${leadF ? `In testa: ${esc(mname(leadF.member_id))}, ${leadF.score} vittorie` : "Sfida qualcuno del gruppo"}</div>
        <div class="tiny faint">${onlineIds().length ? `${onlineIds().length} online ora` : ""}</div></div>
    </div>
  </section>`;
};

async function saveScore(game, score, meta = {}) {
  try {
    await api.insert("scores", { member_id: ME, game, score: Math.round(score), day: today(), meta });
    await reload();
  } catch (e) { toast("Punteggio non salvato: " + e.message, "alert"); }
}

// ───────────────────────── Overlay di gioco ─────────────────────────

let gameCleanup = null;
let gameScroll = 0;
function openGame(html) {
  closeGame();
  const el = $("#game");
  el.innerHTML = html;
  el.hidden = false;
  // Durante il gioco l'app sotto non viene disegnata: niente vetri sfocati e aurora da ricalcolare,
  // così iPhone non esaurisce la memoria grafica quando si tocca a raffica.
  if (!document.body.classList.contains("gaming")) gameScroll = scrollY;
  document.body.classList.add("gaming");
  document.body.style.overflow = "hidden";
}
function closeGame() {
  gameCleanup && gameCleanup(); gameCleanup = null;
  const el = $("#game");
  el.hidden = true; el.innerHTML = "";
  document.body.style.overflow = "";
  if (document.body.classList.contains("gaming")) { document.body.classList.remove("gaming"); scrollTo(0, gameScroll); }
}

// ───────────────────────── Sudoku ─────────────────────────

// Generatore pseudo-casuale con seme: stessa data → stessa griglia per tutti.
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const BOXOF = i => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);

// Conta le soluzioni fino a "limit" (basta sapere se è unica).
function countSolutions(grid, limit = 2) {
  const g = grid.slice();
  let count = 0;
  const can = (i, v) => {
    const r = Math.floor(i / 9), c = i % 9;
    for (let k = 0; k < 9; k++) if (g[r * 9 + k] === v || g[k * 9 + c] === v) return false;
    const r0 = r - (r % 3), c0 = c - (c % 3);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (g[(r0 + y) * 9 + c0 + x] === v) return false;
    return true;
  };
  const solve = () => {
    let best = -1, bestOpts = null;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const opts = [];
      for (let v = 1; v <= 9; v++) if (can(i, v)) opts.push(v);
      if (!opts.length) return;
      if (!bestOpts || opts.length < bestOpts.length) { best = i; bestOpts = opts; if (opts.length === 1) break; }
    }
    if (best < 0) { count++; return; }
    for (const v of bestOpts) { g[best] = v; solve(); g[best] = 0; if (count >= limit) return; }
  };
  solve();
  return count;
}

function solvedGrid(r) {
  const pattern = (row, col) => (3 * (row % 3) + Math.floor(row / 3) + col) % 9;
  const rows = shuffle([0, 1, 2], r).flatMap(b => shuffle([0, 1, 2], r).map(x => b * 3 + x));
  const cols = shuffle([0, 1, 2], r).flatMap(s => shuffle([0, 1, 2], r).map(x => s * 3 + x));
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r);
  const out = [];
  for (const row of rows) for (const col of cols) out.push(digits[pattern(row, col)]);
  return out;
}

function makeSudoku(day) {
  const r = rng(`capodanno-${day}-9`);
  const solution = solvedGrid(r);
  const puzzle = solution.slice();
  let givens = 81;
  for (const i of shuffle([...Array(81).keys()], r)) {
    if (givens <= 28) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[i] = keep; else givens--;
  }
  return { puzzle, solution, cages: null };
}

// Killer del giorno dalla libreria: ogni griglia ha una sola soluzione e nessun numero dato.
function makeKiller(day) {
  const lib = window.KILLER_LIB || [];
  if (!lib.length) return null;
  const n = Math.floor(new Date(day + "T12:00:00Z").getTime() / 864e5);
  const k = lib[((n % lib.length) + lib.length) % lib.length];
  const solution = [...k.s].map(Number);
  const cageOf = [...k.c].map(ch => ch.charCodeAt(0) - 48);
  const sums = {};
  cageOf.forEach((c, i) => { sums[c] = (sums[c] || 0) + solution[i]; });
  // Il totale si scrive nella prima cella della gabbia (in alto a sinistra).
  const head = {};
  cageOf.forEach((c, i) => { if (head[c] === undefined) head[c] = i; });
  return { puzzle: new Array(81).fill(0), solution, cages: { cageOf, sums, head } };
}

function playSudoku(mode) {
  const day = today();
  const data = mode === "killer" ? makeKiller(day) : makeSudoku(day);
  if (!data) return toast("Griglie Killer non disponibili", "alert");
  const { puzzle, solution, cages } = data;
  const KEY = `capodanno-${mode}-${day}-${ME}`;
  const official = !playedToday(mode);
  let st;
  try { st = JSON.parse(storage.get(KEY)); } catch { st = null; }
  if (!st || st.sol !== solution.join("")) st = { sol: solution.join(""), grid: puzzle.slice(), notes: new Array(81).fill(0), elapsed: 0, mistakes: 0, done: false };
  st.notes ||= new Array(81).fill(0);
  let sel = -1, pencil = false, t0 = Date.now(), timer = null;
  const save = () => storage.set(KEY, JSON.stringify({ ...st, elapsed: elapsed() }));
  const elapsed = () => st.elapsed + (st.done ? 0 : (Date.now() - t0) / 1000);
  const label = mode === "killer" ? "Killer Sudoku" : "Sudoku";

  openGame(`
    <div class="game-top">
      <button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">${label} del giorno</div><div class="tiny faint">${official ? "Partita valida per la classifica" : "Allenamento: hai già giocato oggi"}</div></div>
      <span style="width:36px"></span>
    </div>
    <div class="sd-head">
      <span class="sd-chip time" id="sd-time">0:00</span>
      <span class="grow"></span>
      <span class="sd-chip" id="sd-err"></span>
    </div>
    <div class="sd-frame"><div class="sudoku ${cages ? "killer" : ""}" id="sd-grid"></div></div>
    <div class="pad-tools"><button id="sd-undo">${ico("undo", 17)}Annulla</button><button id="sd-pencil">${ico("edit", 17)}Matita</button><button data-v="0">${ico("close", 16)}Cancella</button></div>
    <div class="pad9" id="sd-pad">${[...Array(9).keys()].map(i => `<button data-v="${i + 1}"><b>${i + 1}</b><span class="rem"></span></button>`).join("")}</div>
    <div id="sd-win"></div>`);

  const gridEl = $("#sd-grid");
  // Colori delle gabbie: due gabbie che si toccano non hanno mai lo stesso colore.
  const cageColor = [];
  if (cages) {
    const n = Math.max(...cages.cageOf) + 1, near = Array.from({ length: n }, () => new Set());
    for (let i = 0; i < 81; i++) for (const j of [i % 9 < 8 ? i + 1 : -1, i < 72 ? i + 9 : -1]) {
      if (j >= 0 && cages.cageOf[i] !== cages.cageOf[j]) { near[cages.cageOf[i]].add(cages.cageOf[j]); near[cages.cageOf[j]].add(cages.cageOf[i]); }
    }
    for (let k = 0; k < n; k++) { let c = 0; while ([...near[k]].some(o => cageColor[o] === c)) c++; cageColor[k] = c % 5; }
  }
  const undo = [];
  let popAt = -1, flashCells = [];
  const draw = () => {
    const v = sel >= 0 ? st.grid[sel] : 0;
    const sr = Math.floor(sel / 9), sc = sel % 9;
    gridEl.innerHTML = st.grid.map((x, i) => {
      const r = Math.floor(i / 9), c = i % 9;
      const given = puzzle[i] !== 0;
      const wrong = x && x !== solution[i];
      const peer = sel >= 0 && (r === sr || c === sc || BOXOF(i) === BOXOF(sel));
      const cls = [given ? "given" : "", wrong ? "wrong" : "", i === sel ? "sel" : peer ? "peer" : "", v && x === v && i !== sel ? "same" : "",
        c % 3 === 2 && c < 8 ? "br" : "", r % 3 === 2 && r < 8 ? "bb" : "", cages ? `cg${cageColor[cages.cageOf[i]]}` : BOXOF(i) % 2 === 0 ? "bx" : "",
        flashCells.includes(i) ? "flash" : ""].join(" ");
      let extra = "";
      if (cages) {
        const k = cages.cageOf[i];
        const t = r === 0 || cages.cageOf[i - 9] !== k, b = r === 8 || cages.cageOf[i + 9] !== k;
        const l = c === 0 || cages.cageOf[i - 1] !== k, rr = c === 8 || cages.cageOf[i + 1] !== k;
        extra = `<span class="cage" style="top:${t ? 3 : -1}px;bottom:${b ? 3 : -1}px;left:${l ? 3 : -1}px;right:${rr ? 3 : -1}px;${t ? "" : "border-top:0;"}${b ? "" : "border-bottom:0;"}${l ? "" : "border-left:0;"}${rr ? "" : "border-right:0;"}"></span>`
          + (cages.head[k] === i ? `<span class="csum">${cages.sums[k]}</span>` : "");
      }
      const notes = !x && st.notes[i] ? `<span class="notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<i>${st.notes[i] & (1 << d) ? d : ""}</i>`).join("")}</span>` : "";
      return `<button class="cell ${cls}" data-i="${i}">${extra}${x ? `<span class="v${i === popAt ? " pop" : ""}">${x}</span>` : notes}</button>`;
    }).join("");
    popAt = -1; flashCells = [];
    $("#sd-err").textContent = st.mistakes ? `${st.mistakes} ${st.mistakes === 1 ? "errore" : "errori"} · +${st.mistakes * PENALTY}s` : "Nessun errore";
    $("#sd-err").classList.toggle("bad", !!st.mistakes);
    // Quante volte manca ogni cifra: quando sono tutte al loro posto il tasto si spegne.
    $$("#sd-pad button").forEach(b => {
      const d = Number(b.dataset.v), left = 9 - st.grid.filter((x, i) => x === d && x === solution[i]).length;
      b.querySelector(".rem").textContent = left || ""; b.classList.toggle("spent", !left);
      b.classList.toggle("cur", !!v && d === v);
    });
    $("#sd-pencil").classList.toggle("on", pencil);
    $("#sd-undo").disabled = !undo.length;
  };
  const tick = () => { const el = $("#sd-time"); if (el) el.textContent = mmss(elapsed() + st.mistakes * PENALTY); };
  const finishPanel = (title, html) => {
    $("#sd-pad").hidden = true; $(".pad-tools").hidden = true;
    $("#sd-win").innerHTML = `<div class="glass win"><div class="serif" style="font-size:34px">${title}</div>${html}
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" data-act="game-board">${ico("trophy", 17)}Classifiche</button></div></div>`;
  };
  const win = async () => {
    st.elapsed = elapsed(); st.done = true; save(); clearInterval(timer); tick();
    const total = Math.round(st.elapsed + st.mistakes * PENALTY);
    finishPanel("Risolto", `<div class="num" style="font-size:44px;margin:6px 0">${mmss(total)}</div>
      <div class="small muted">${st.mistakes ? `${mmss(st.elapsed)} più ${st.mistakes * PENALTY}s di errori` : "Senza errori"}</div><div id="sd-rank" class="small" style="margin-top:10px"></div>`);
    if (official) {
      await saveScore(mode, total, { mistakes: st.mistakes, seconds: Math.round(st.elapsed) });
      const r = myRank(mode);
      const el = $("#sd-rank"); if (el && r) el.innerHTML = r.s.score === total ? `Nuovo record personale: <b>${r.pos}°</b> su ${r.of} di sempre` : `In classifica sei <b>${r.pos}°</b> su ${r.of}`;
    }
  };
  const put = v => {
    if (sel < 0 || puzzle[sel] || st.done) return;
    // Annulla ripristina cifra e note di tutte le celle toccate (una cifra giusta pulisce le note dei vicini).
    undo.push({ sel, grid: st.grid[sel], notes: st.notes.slice() });
    if (undo.length > 200) undo.shift();
    if (pencil && v) {
      if (st.grid[sel]) { undo.pop(); return; }
      st.notes[sel] ^= 1 << v; save(); draw(); return;
    }
    if (v && v !== solution[sel] && st.grid[sel] !== v) { st.mistakes++; navigator.vibrate?.(30); }
    st.grid[sel] = v;
    if (v) popAt = sel;
    if (v && v === solution[sel]) {
      // La cifra giusta toglie le note uguali da riga, colonna e riquadro.
      st.notes[sel] = 0;
      for (let i = 0; i < 81; i++) if (Math.floor(i / 9) === Math.floor(sel / 9) || i % 9 === sel % 9 || BOXOF(i) === BOXOF(sel)) st.notes[i] &= ~(1 << v);
      // Riga, colonna o riquadro completati: un lampo.
      const units = [[...Array(9).keys()].map(k => Math.floor(sel / 9) * 9 + k), [...Array(9).keys()].map(k => k * 9 + sel % 9), [...Array(81).keys()].filter(k => BOXOF(k) === BOXOF(sel))];
      for (const u of units) if (u.every(k => st.grid[k] === solution[k])) flashCells.push(...u);
    }
    save(); draw();
    if (st.grid.every((x, i) => x === solution[i])) win();
  };
  gridEl.addEventListener("click", e => { const b = e.target.closest(".cell"); if (!b) return; sel = Number(b.dataset.i); draw(); });
  $("#sd-pad").addEventListener("click", e => { const b = e.target.closest("button"); if (b) put(Number(b.dataset.v)); });
  $(".pad-tools").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "sd-pencil") { pencil = !pencil; draw(); }
    else if (b.id === "sd-undo") {
      const u = undo.pop(); if (!u || st.done) return;
      st.grid[u.sel] = u.grid; st.notes = u.notes; sel = u.sel; save(); draw();
    } else put(0);
  });
  const onKey = e => { if (/^[1-9]$/.test(e.key)) put(Number(e.key)); if (e.key === "Backspace" || e.key === "0") put(0); if (e.key === "n") { pencil = !pencil; draw(); } };
  addEventListener("keydown", onKey);
  draw(); tick();
  if (st.done) finishPanel("Già risolto oggi", `<div class="small muted" style="margin-top:6px">Torna domani per una nuova griglia.</div>`);
  else timer = setInterval(tick, 500);
  gameCleanup = () => { if (!st.done) save(); clearInterval(timer); removeEventListener("keydown", onKey); };
}

// ───────────────────────── Fuochi ─────────────────────────

function playFuochi() {
  openGame(`
    <div class="game-top" style="position:absolute;left:0;right:0;top:0;z-index:2;padding:calc(var(--sat) + 12px) 16px 0">
      <button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><span class="num" id="fx-score" style="font-size:30px">0</span><div class="tiny faint" id="fx-combo">&nbsp;</div></div>
      <span class="num" id="fx-time" style="width:36px;text-align:right;font-size:18px">30</span>
    </div>
    <canvas id="fx" class="fx-canvas"></canvas>
    <div id="fx-panel" class="fx-panel"></div>`);
  const canvas = $("#fx"), ctx = canvas.getContext("2d");
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
  size(); addEventListener("resize", size);
  const W = () => canvas.width, H = () => canvas.height;
  const DUR = 30;
  let rockets = [], sparks = [], floats = [], score = 0, combo = 0, lastHit = 0, start = 0, spawnAt = 0, raf = 0, running = false;

  const panel = (html) => { const p = $("#fx-panel"); p.innerHTML = html; p.hidden = !html; };
  const intro = () => panel(`<div class="glass win">
      <div class="game-ico" style="margin:0 auto 12px">${ico("burst", 30)}</div>
      <div class="serif" style="font-size:34px">Fuochi</div>
      <div class="small muted" style="margin:8px 0 4px">Tocca i razzi prima che spariscano.</div>
      <div class="row" style="justify-content:center;gap:16px;margin:14px 0" ><span class="row tiny" style="gap:6px"><i class="dot" style="background:#f5f5f7"></i>+1</span><span class="row tiny" style="gap:6px"><i class="dot" style="background:#9cc3ff"></i>+3</span><span class="row tiny" style="gap:6px"><i class="dot" style="background:#ff6b6b"></i>−5</span></div>
      <button class="btn pearl block" data-act="fx-start">Via</button></div>`);

  const spawn = () => {
    const t = (performance.now() - start) / 1000;
    const roll = Math.random();
    const kind = roll < 0.14 ? "gold" : roll < 0.14 + Math.min(0.22, 0.06 + t * 0.006) ? "bad" : "std";
    const speed = (H() / 2.6) * (1 + t / 40) * (kind === "gold" ? 1.35 : 1) * (0.85 + Math.random() * 0.3);
    rockets.push({ x: W() * (0.1 + Math.random() * 0.8), y: H() + 20 * dpr, vy: -speed, vx: (Math.random() - 0.5) * 40 * dpr, kind, r: (kind === "gold" ? 13 : 16) * dpr, trail: [], wob: Math.random() * 6 });
  };
  const color = k => (k === "gold" ? "#9cc3ff" : k === "bad" ? "#ff6b6b" : "#f5f5f7");
  const explode = (x, y, c, n = 34) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (60 + Math.random() * 220) * dpr; sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c }); } };

  let last = 0;
  const frame = now => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const t = (now - start) / 1000;
    if (running) {
      if (now >= spawnAt) { spawn(); spawnAt = now + Math.max(260, 760 - t * 18) * (0.6 + Math.random() * 0.8); }
      if (t >= DUR) return end();
      $("#fx-time").textContent = Math.ceil(DUR - t);
    }
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(0, 0, W(), H());
    for (const r of rockets) {
      r.trail.push([r.x, r.y]); if (r.trail.length > 14) r.trail.shift();
      r.x += (r.vx + Math.sin(t * 6 + r.wob) * 30 * dpr) * dt; r.y += r.vy * dt;
      ctx.strokeStyle = color(r.kind); ctx.lineWidth = 2 * dpr; ctx.globalAlpha = .5;
      ctx.beginPath(); r.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = color(r.kind);
      ctx.shadowColor = color(r.kind); ctx.shadowBlur = 18 * dpr;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (r.kind === "bad" ? 0.8 + Math.sin(t * 20) * 0.15 : 0.55), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    rockets = rockets.filter(r => r.y > -40 * dpr && !r.hit);
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 140 * dpr * dt; s.vx *= 0.98; s.life -= dt * 1.1; ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y, 2.2 * dpr, 2.2 * dpr); }
    sparks = sparks.filter(s => s.life > 0);
    for (const f of floats) { f.y -= 40 * dpr * dt; f.life -= dt; ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.c; ctx.font = `600 ${18 * dpr}px Geist, system-ui`; ctx.textAlign = "center"; ctx.fillText(f.txt, f.x, f.y); }
    floats = floats.filter(f => f.life > 0);
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  const hit = (px, py) => {
    if (!running) return;
    const x = px * dpr, y = py * dpr;
    let best = null, bd = Infinity;
    for (const r of rockets) { const d = Math.hypot(r.x - x, r.y - y); if (d < r.r * 3.2 && d < bd) { best = r; bd = d; } }
    if (!best) { combo = 0; $("#fx-combo").innerHTML = "&nbsp;"; return; }
    best.hit = true;
    const now = performance.now();
    if (best.kind === "bad") { score = Math.max(0, score - 5); combo = 0; explode(best.x, best.y, "#ff6b6b", 20); floats.push({ x: best.x, y: best.y, txt: "−5", c: "#ff6b6b", life: 1 }); navigator.vibrate?.(60); }
    else {
      combo = now - lastHit < 900 ? combo + 1 : 1; lastHit = now;
      const bonus = combo >= 8 ? 2 : combo >= 4 ? 1 : 0;
      const pts = (best.kind === "gold" ? 3 : 1) + bonus;
      score += pts;
      explode(best.x, best.y, color(best.kind), best.kind === "gold" ? 50 : 34);
      floats.push({ x: best.x, y: best.y, txt: `+${pts}`, c: color(best.kind), life: 1 });
    }
    $("#fx-score").textContent = score;
    $("#fx-combo").textContent = combo >= 4 ? `Serie ×${combo}` : " ";
  };
  const onDown = e => { const t = e.touches ? e.touches[0] : e; hit(t.clientX, t.clientY); if (e.cancelable) e.preventDefault(); };
  canvas.addEventListener("pointerdown", onDown);

  const begin = () => {
    rockets = []; sparks = []; floats = []; score = 0; combo = 0;
    $("#fx-score").textContent = "0"; panel("");
    start = performance.now(); spawnAt = start + 300; running = true;
  };
  const end = async () => {
    running = false;
    for (const r of rockets) explode(r.x, r.y, color(r.kind), 16);
    rockets = [];
    raf = requestAnimationFrame(frame);
    const prev = myRank("fuochi");
    panel(`<div class="glass win"><div class="eyebrow">Tempo scaduto</div><div class="num" style="font-size:56px;margin:6px 0">${score}</div><div class="small muted">punti${prev && score > prev.s.score ? " · nuovo record personale" : ""}</div>
      <div id="fx-rank" class="small" style="margin-top:10px"></div>
      <div class="actions"><button class="btn" data-act="fx-start">Rigioca</button><button class="btn primary" data-act="game-board" data-g="fuochi">${ico("trophy", 17)}Classifica</button></div></div>`);
    if (score > 0) {
      await saveScore("fuochi", score);
      const r = myRank("fuochi"); const el = $("#fx-rank"); if (el && r) el.innerHTML = `In classifica sei <b>${r.pos}°</b> su ${r.of}`;
    }
  };
  ACTIONS["fx-start"] = begin;
  intro();
  raf = requestAnimationFrame(frame);
  gameCleanup = () => { running = false; cancelAnimationFrame(raf); removeEventListener("resize", size); };
}

// ───────────────────────── Tiro alla fune (1 contro 1 in tempo reale) ─────────────────────────
// Lobby con la presenza di chi ha l'app aperta; inviti via Realtime (e notifica push);
// ogni sfida ha il suo canale: entrambi mandano il proprio numero di tocchi, chi sfida fa da arbitro.

const FUNE_WIN = 24, FUNE_TIME = 20;
let lobby = null, ONLINE = new Set(), pendingInvite = null;
const onlineIds = () => [...ONLINE].filter(id => id !== ME && member(id));

function duelOnlineList() {
  if (!api.channel) return `<div class="small muted">Le sfide dal vivo funzionano con il database collegato. Intanto allenati contro il telefono.</div>`;
  const others = S.members.filter(m => m.id !== ME);
  if (!others.length) return `<div class="small muted">Quando entrano gli altri, li sfidi da qui.</div>`;
  const on = new Set(onlineIds());
  return `<div class="label" style="margin-bottom:8px">Sfida qualcuno</div>` + others.sort((a, b) => on.has(b.id) - on.has(a.id)).map(m => `
    <div class="li">${avatar(m, "sm")}<span class="grow t ellipsis">${esc(m.name)}</span>
      <span class="tiny ${on.has(m.id) ? "pos" : "faint"}">${on.has(m.id) ? "online" : "non in app"}</span>
      <button class="btn sm" data-act="duel-invite" data-id="${m.id}">Sfida</button></div>`).join("");
}
const refreshOnline = () => { const el = $("#duel-online"); if (el) el.innerHTML = duelOnlineList(); };

// Si entra nella lobby appena si è dentro l'app: così gli inviti arrivano ovunque ci si trovi.
window.startLobby = function () {
  if (lobby || !api.channel || !ME) return;
  lobby = api.channel("giochi-lobby", { config: { presence: { key: ME }, broadcast: { self: false } } });
  lobby.on("presence", { event: "sync" }, () => { ONLINE = new Set(Object.keys(lobby.presenceState())); refreshOnline(); })
    .on("broadcast", { event: "invite" }, ({ payload }) => { if (payload.to === ME) gotInvite(payload); })
    .on("broadcast", { event: "answer" }, ({ payload }) => { if (payload.to === ME) gotAnswer(payload); })
    .subscribe(status => { if (status === "SUBSCRIBED") lobby.track({ at: Date.now() }); });
};

let shownInvites = new Set();
function gotInvite(p) {
  if (shownInvites.has(p.duel) || $("#game:not([hidden])")) return;
  shownInvites.add(p.duel);
  navigator.vibrate?.([30, 40, 30]);
  openSheet(`<div class="row" style="gap:14px;margin-bottom:12px">${avatar(member(p.from), "lg")}<div><div class="eyebrow">Sfida</div><h2 style="margin:0">${esc(mname(p.from))} ti sfida a Tiro alla fune</h2></div></div>
    <p class="small muted" style="margin:0 0 16px">Venti secondi, tocca più veloce che puoi.</p>
    <div class="actions"><button class="btn" data-act="duel-answer" data-duel="${p.duel}" data-from="${p.from}" data-ok="0">No grazie</button>
    <button class="btn primary" data-act="duel-answer" data-duel="${p.duel}" data-from="${p.from}" data-ok="1">Accetto</button></div>`);
}
function gotAnswer(p) {
  if (!pendingInvite || pendingInvite.duel !== p.duel) return;
  clearInterval(pendingInvite.timer); clearTimeout(pendingInvite.timeout);
  const opp = pendingInvite.to; pendingInvite = null;
  if (p.ok) playFune({ duel: p.duel, opp, host: true });
  else { closeGame(); toast(`${mname(opp)} non può adesso`); }
}

function invite(to) {
  if (!lobby) return toast("Sfide dal vivo non disponibili ora", "alert");
  const duel = uuid().slice(0, 8);
  const send = () => lobby.send({ type: "broadcast", event: "invite", payload: { from: ME, to, duel } });
  pendingInvite = { duel, to, timer: setInterval(send, 3000), timeout: null };
  send();
  api.notify("duel", to);
  openGame(`<div class="duel-wait">${avatar(member(to), "lg")}<div class="serif" style="font-size:30px;margin-top:16px">Aspetto ${esc(mname(to))}…</div>
    <div class="small muted" style="margin:8px 0 20px">Gli è arrivata la sfida: se ha l'app aperta la vede subito.</div>
    <div class="typing"><span></span><span></span><span></span></div>
    <button class="btn" style="margin-top:28px" data-act="duel-cancel">Annulla</button></div>`);
  pendingInvite.timeout = setTimeout(() => { if (pendingInvite?.duel === duel) { clearInterval(pendingInvite.timer); pendingInvite = null; closeGame(); toast(`${mname(to)} non ha risposto`); } }, 45000);
  gameCleanup = () => { if (pendingInvite?.duel === duel) { clearInterval(pendingInvite.timer); clearTimeout(pendingInvite.timeout); pendingInvite = null; } };
}

// opts: { duel, opp, host } per la sfida dal vivo, oppure { cpu: true }.
function playFune(opts) {
  const cpu = !!opts.cpu;
  const oppName = cpu ? "Telefono" : mname(opts.opp);
  openGame(`
    <div class="game-top">
      <button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Tiro alla fune</div><div class="tiny faint">${cpu ? "Allenamento" : "Sfida dal vivo"}</div></div>
      <span class="num" id="fu-time" style="width:36px;text-align:right;font-size:18px">${FUNE_TIME}</span>
    </div>
    <div class="fune-players"><div>${avatar(me(), "lg")}<div class="t" style="margin-top:6px">Tu</div><div class="num small muted" id="fu-me">0</div></div>
      <div class="serif" style="font-size:22px;color:var(--t3)">contro</div>
      <div>${cpu ? avatar(null, "lg") : avatar(member(opts.opp), "lg")}<div class="t" style="margin-top:6px">${esc(oppName)}</div><div class="num small muted" id="fu-opp">0</div></div></div>
    <div class="rope"><div class="rope-line"></div><div class="rope-mid"></div><div class="knot" id="fu-knot"></div>
      <span class="rope-goal l"></span><span class="rope-goal r"></span></div>
    <div class="fune-msg serif" id="fu-msg">${cpu ? "Pronto?" : "Aspetto l'avversario…"}</div>
    <button class="tapzone" id="fu-tap" disabled>TIRA</button>
    <div id="fu-end"></div>`);

  let mine = 0, opp = 0, startAt = 0, ended = false, raf = 0, sendT = 0, cpuT = 0, ch = null, endTimer = null;
  const knot = $("#fu-knot"), meEl = $("#fu-me"), oppEl = $("#fu-opp"), timeEl = $("#fu-time");
  const ropeW = $(".rope").clientWidth;
  const diff = () => mine - opp;
  let shown = "";
  const paint = () => {
    // Si ridisegna solo se qualcosa è cambiato; il nodo si sposta con transform (niente ricalcolo del layout).
    const key = `${mine}:${opp}`;
    if (key === shown) return; shown = key;
    // Il nodo va verso chi tira di più: a sinistra ci sei tu.
    const pct = Math.max(-1, Math.min(1, diff() / FUNE_WIN));
    knot.style.transform = `translate3d(${(-pct * 0.42 * ropeW).toFixed(1)}px,0,0)`;
    meEl.textContent = mine; oppEl.textContent = opp;
  };
  const finish = async (winner) => {
    if (ended) return; ended = true;
    cancelAnimationFrame(raf); clearInterval(sendT); clearInterval(cpuT); clearTimeout(endTimer);
    $("#fu-tap").disabled = true;
    const won = winner === "me";
    $("#fu-msg").textContent = won ? "Hai vinto" : winner === "draw" ? "Pareggio" : `Vince ${oppName}`;
    navigator.vibrate?.(won ? [40, 60, 40] : 120);
    $("#fu-end").innerHTML = `<div class="actions" style="max-width:420px;margin:16px auto 0">
      <button class="btn" data-act="close-game">Chiudi</button>
      ${cpu ? `<button class="btn primary" data-act="duel-cpu">Rivincita</button>` : `<button class="btn primary" data-act="duel-invite" data-id="${opts.opp}">Rivincita</button>`}</div>`;
    if (!cpu && winner !== "draw") await saveScore("fune", won ? 1 : 0, { vs: opts.opp });
  };
  const loop = () => {
    const t = (Date.now() - startAt) / 1000;
    const secs = String(Math.max(0, Math.ceil(FUNE_TIME - t)));
    if (timeEl.textContent !== secs) timeEl.textContent = secs;
    paint();
    // Arbitro: chi ha lanciato la sfida (o il telefono contro il computer).
    if (cpu || opts.host) {
      if (Math.abs(diff()) >= FUNE_WIN || t >= FUNE_TIME) {
        const w = diff() > 0 ? "me" : diff() < 0 ? "opp" : "draw";
        if (!cpu) ch.send({ type: "broadcast", event: "end", payload: { winner: w === "me" ? ME : w === "opp" ? opts.opp : "draw" } });
        return finish(w);
      }
    }
    raf = requestAnimationFrame(loop);
  };
  const go = at => {
    const count = () => {
      const left = Math.ceil((at - Date.now()) / 1000);
      if (left > 0) { $("#fu-msg").textContent = left; setTimeout(count, 120); return; }
      $("#fu-msg").textContent = "Tira!"; $("#fu-tap").disabled = false;
      startAt = Date.now(); raf = requestAnimationFrame(loop);
      let sent = -1;
      if (!cpu) sendT = setInterval(() => { if (mine !== sent) { sent = mine; ch.send({ type: "broadcast", event: "taps", payload: { id: ME, n: mine } }); } }, 90);
      else cpuT = setInterval(() => { const t = (Date.now() - startAt) / 1000; if (Math.random() < 0.55 + Math.min(0.3, t / 40)) opp++; }, 110);
      if (!cpu && !opts.host) endTimer = setTimeout(() => finish(diff() > 0 ? "me" : diff() < 0 ? "opp" : "draw"), (FUNE_TIME + 3) * 1000);
    };
    count();
  };
  $("#fu-tap").addEventListener("pointerdown", e => { e.preventDefault(); if (ended || !startAt) return; mine++; });

  if (cpu) { setTimeout(() => go(Date.now() + 3000), 600); }
  else {
    ch = api.channel(`fune-${opts.duel}`, { config: { broadcast: { self: false } } });
    let started = false;
    ch.on("broadcast", { event: "taps" }, ({ payload }) => { if (payload.id !== ME) opp = Math.max(opp, payload.n); })
      .on("broadcast", { event: "ready" }, () => {
        if (opts.host && !started) { started = true; const at = Date.now() + 3200; ch.send({ type: "broadcast", event: "start", payload: { at } }); go(at); }
      })
      .on("broadcast", { event: "start" }, ({ payload }) => { if (!opts.host && !started) { started = true; go(payload.at); } })
      .on("broadcast", { event: "end" }, ({ payload }) => { if (!opts.host) finish(payload.winner === ME ? "me" : payload.winner === "draw" ? "draw" : "opp"); })
      .subscribe(status => {
        if (status !== "SUBSCRIBED") return;
        // L'ospite annuncia di essere pronto finché la partita non parte.
        if (!opts.host) { const ping = setInterval(() => { if (started || ended) clearInterval(ping); else ch.send({ type: "broadcast", event: "ready", payload: {} }); }, 500); }
      });
    // Se l'altro non arriva entro 20 secondi, si chiude.
    setTimeout(() => { if (!started && !ended) { closeGame(); toast("L'avversario non si è collegato"); } }, 20000);
  }
  gameCleanup = () => { ended = true; cancelAnimationFrame(raf); clearInterval(sendT); clearInterval(cpuT); clearTimeout(endTimer); if (ch) api.removeChannel(ch); };
}

// ───────────────────────── Azioni ─────────────────────────

Object.assign(ACTIONS, {
  "play-sudoku": el => playSudoku(el.dataset.mode),
  "play-fuochi": () => playFuochi(),
  "close-game": () => { closeGame(); render(); },
  "game-board": () => { closeGame(); UI.tab = "giochi"; render(); setTimeout(() => $(".section .label")?.scrollIntoView({ behavior: "smooth" }), 50); },
  "duel-cpu": () => playFune({ cpu: true }),
  "duel-invite": el => invite(el.dataset.id),
  "duel-cancel": () => { closeGame(); },
  "duel-answer": el => {
    closeSheet();
    const ok = el.dataset.ok === "1";
    lobby?.send({ type: "broadcast", event: "answer", payload: { to: el.dataset.from, from: ME, duel: el.dataset.duel, ok } });
    if (ok) playFune({ duel: el.dataset.duel, opp: el.dataset.from, host: false });
  },
});
