/* Capodanno - giochi del gruppo e classifica.
   - Sudoku del giorno: stessa griglia per tutti nello stesso giorno (6×6 facile o 9×9 classico).
     Conta solo il primo tentativo del giorno; ogni errore aggiunge 15 secondi.
   - Fuochi: 30 secondi per far esplodere più razzi possibile con un tocco.
   Usa le funzioni globali di app.js. */
"use strict";

const GAMES = {
  sudoku6: { label: "Sudoku 6×6", short: "6×6", lower: true },
  sudoku9: { label: "Sudoku 9×9", short: "9×9", lower: true },
  fuochi: { label: "Fuochi", short: "Fuochi", lower: false },
};
const PENALTY = 15;
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const fmtScore = (game, v) => (GAMES[game].lower ? mmss(v) : `${v} pt`);
UI.lbPeriod = UI.lbPeriod || "today";
UI.gameSeg = "sudoku6";

// ───────────────────────── Classifica ─────────────────────────

function leaderboard(game, period) {
  const lower = GAMES[game].lower;
  const best = new Map();
  for (const s of S.scores) {
    if (s.game !== game || !member(s.member_id)) continue;
    if (period === "today" && s.day !== today()) continue;
    // Il Sudoku del giorno vale solo il primo tentativo: per «oggi» teniamo il primo, per «sempre» il migliore.
    const cur = best.get(s.member_id);
    if (!cur || (lower ? s.score < cur.score : s.score > cur.score)) best.set(s.member_id, s);
  }
  return [...best.values()].sort((a, b) => (lower ? a.score - b.score : b.score - a.score) || byCreated(a, b));
}
const myRank = (game, period) => { const lb = leaderboard(game, period); const i = lb.findIndex(s => s.member_id === ME); return i < 0 ? null : { pos: i + 1, of: lb.length, s: lb[i] }; };
const playedSudokuToday = size => S.scores.some(s => s.game === "sudoku" + size && s.member_id === ME && s.day === today());

function rankRows(game, period) {
  const lb = leaderboard(game, period);
  if (!lb.length) return `<div class="small muted" style="padding:6px 0">${period === "today" ? "Nessun punteggio oggi: inizia tu." : "Ancora nessun punteggio."}</div>`;
  return lb.map((s, i) => `
    <div class="li rank ${s.member_id === ME ? "me" : ""}">
      <span class="pos p${i + 1}">${i + 1}</span>
      ${avatar(member(s.member_id), "sm")}
      <span class="grow t ellipsis">${esc(mname(s.member_id))}${s.member_id === ME ? ` <span class="faint small">tu</span>` : ""}</span>
      ${s.meta?.mistakes ? `<span class="tiny faint">${s.meta.mistakes} err.</span>` : ""}
      <b class="num">${fmtScore(game, s.score)}</b>
    </div>`).join("");
}

window.viewGiochi = function () {
  const g = UI.gameSeg;
  const r6 = myRank("sudoku6", "today"), r9 = myRank("sudoku9", "today"), rf = myRank("fuochi", "all");
  return `
  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("grid", 30)}</div>
      <div class="grow"><div class="serif" style="font-size:28px;line-height:1">Sudoku del giorno</div>
        <div class="small muted" style="margin-top:6px">Stessa griglia per tutti, cambia ogni mezzanotte. Conta il primo tentativo; ogni errore vale ${PENALTY} secondi.</div></div></div>
    <div class="grid2" style="margin-top:16px">
      ${[["6", r6, "Facile"], ["9", r9, "Classico"]].map(([n, r, lb]) => `
        <button class="tile" data-act="play-sudoku" data-n="${n}">
          <div class="row between"><b>${n}×${n}</b><span class="tiny faint">${lb}</span></div>
          <div class="small ${r ? "pos" : "muted"}" style="margin-top:10px">${r ? `${mmss(r.s.score)} · ${r.pos}° su ${r.of}` : playedSudokuToday(n) ? "Giocato" : "Da risolvere"}</div>
        </button>`).join("")}
    </div>
  </section>

  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("burst", 30)}</div>
      <div class="grow"><div class="serif" style="font-size:28px;line-height:1">Fuochi</div>
        <div class="small muted" style="margin-top:6px">Trenta secondi: tocca i razzi prima che spariscano. Quelli dorati valgono 3, attento a quelli rossi. Più colpi di fila, più punti.</div></div></div>
    <button class="btn pearl block" style="margin-top:16px" data-act="play-fuochi">${ico("burst", 18)}Gioca${rf ? ` · record ${rf.s.score} pt` : ""}</button>
  </section>

  <div class="section"><div class="label row" style="gap:8px">${ico("trophy", 15)}Classifica</div>
    <div class="seg mini-seg">${[["today", "Oggi"], ["all", "Sempre"]].map(([k, l]) => `<button class="${UI.lbPeriod === k ? "on" : ""}" data-act="lb-period" data-v="${k}">${l}</button>`).join("")}</div></div>
  <div style="margin-bottom:12px">${segmented("gameSeg", Object.entries(GAMES).map(([k, v]) => [k, v.short]), "game-seg")}</div>
  <section class="card">${rankRows(g, UI.lbPeriod)}</section>`;
};

window.homeGamesCard = function () {
  const r = myRank("sudoku6", "today") || myRank("sudoku9", "today");
  const leaderF = leaderboard("fuochi", "all")[0];
  const leaderS = leaderboard("sudoku6", "today")[0];
  return `
  <section class="card tap" data-act="tab" data-tab="giochi">
    <div class="row between" style="margin-bottom:14px"><div class="label" style="margin:0">Giochi</div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="grid2">
      <div class="tile static"><div class="row" style="gap:8px">${ico("grid", 18)}<b class="small">Sudoku del giorno</b></div>
        <div class="tiny ${r ? "pos" : "muted"}" style="margin-top:8px">${r ? `Risolto in ${mmss(r.s.score)}, ${r.pos}° posto` : "Ancora da risolvere"}</div>
        ${leaderS ? `<div class="tiny faint">In testa: ${esc(mname(leaderS.member_id))}</div>` : ""}</div>
      <div class="tile static"><div class="row" style="gap:8px">${ico("burst", 18)}<b class="small">Fuochi</b></div>
        <div class="tiny muted" style="margin-top:8px">${leaderF ? `Record: ${esc(mname(leaderF.member_id))}, ${leaderF.score} pt` : "Nessun record: fallo tu"}</div></div>
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
function openGame(html) {
  closeGame();
  const el = $("#game");
  el.innerHTML = html;
  el.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeGame() {
  gameCleanup && gameCleanup(); gameCleanup = null;
  const el = $("#game");
  el.hidden = true; el.innerHTML = "";
  document.body.style.overflow = "";
}

// ───────────────────────── Sudoku ─────────────────────────

// Generatore pseudo-casuale con seme: stessa data e dimensione → stessa griglia per tutti.
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const BOX = { 6: [2, 3], 9: [3, 3] };

// Conta le soluzioni fino a "limit" (basta sapere se è unica).
function countSolutions(grid, n, limit = 2) {
  const [br, bc] = BOX[n];
  const g = grid.slice();
  let count = 0;
  const can = (i, v) => {
    const r = Math.floor(i / n), c = i % n;
    for (let k = 0; k < n; k++) if (g[r * n + k] === v || g[k * n + c] === v) return false;
    const r0 = r - (r % br), c0 = c - (c % bc);
    for (let y = 0; y < br; y++) for (let x = 0; x < bc; x++) if (g[(r0 + y) * n + c0 + x] === v) return false;
    return true;
  };
  const solve = () => {
    let best = -1, bestOpts = null;
    for (let i = 0; i < g.length; i++) {
      if (g[i]) continue;
      const opts = [];
      for (let v = 1; v <= n; v++) if (can(i, v)) opts.push(v);
      if (!opts.length) return;
      if (!bestOpts || opts.length < bestOpts.length) { best = i; bestOpts = opts; if (opts.length === 1) break; }
    }
    if (best < 0) { count++; return; }
    for (const v of bestOpts) { g[best] = v; solve(); g[best] = 0; if (count >= limit) return; }
  };
  solve();
  return count;
}

function makeSudoku(n, day) {
  const r = rng(`capodanno-${day}-${n}`);
  const [br, bc] = BOX[n];
  const pattern = (row, col) => (bc * (row % br) + Math.floor(row / br) + col) % n;
  // Righe e colonne mescolate rispettando bande e blocchi, poi le cifre.
  const bands = shuffle([...Array(n / br).keys()], r);
  const rows = bands.flatMap(b => shuffle([...Array(br).keys()], r).map(x => b * br + x));
  const stacks = shuffle([...Array(n / bc).keys()], r);
  const cols = stacks.flatMap(s => shuffle([...Array(bc).keys()], r).map(x => s * bc + x));
  const digits = shuffle([...Array(n).keys()].map(x => x + 1), r);
  const solution = [];
  for (const row of rows) for (const col of cols) solution.push(digits[pattern(row, col)]);
  const puzzle = solution.slice();
  const target = n === 6 ? 14 : 30;
  let givens = n * n;
  for (const i of shuffle([...Array(n * n).keys()], r)) {
    if (givens <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, n) !== 1) puzzle[i] = keep; else givens--;
  }
  return { puzzle, solution };
}

function playSudoku(n) {
  n = Number(n);
  const day = today();
  const { puzzle, solution } = makeSudoku(n, day);
  const KEY = `capodanno-sudoku-${day}-${n}-${ME}`;
  const official = !playedSudokuToday(n);
  let st;
  try { st = JSON.parse(storage.get(KEY)); } catch { st = null; }
  if (!st || st.puzzle !== puzzle.join("")) st = { puzzle: puzzle.join(""), grid: puzzle.slice(), elapsed: 0, mistakes: 0, done: false };
  let sel = -1, t0 = Date.now(), timer = null;
  const [br, bc] = BOX[n];
  const save = () => storage.set(KEY, JSON.stringify({ ...st, elapsed: st.elapsed + (st.done ? 0 : (Date.now() - t0) / 1000) }));
  const elapsed = () => st.elapsed + (st.done ? 0 : (Date.now() - t0) / 1000);

  openGame(`
    <div class="game-top">
      <button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Sudoku del giorno · ${n}×${n}</div><div class="tiny faint">${official ? "Partita valida per la classifica" : "Allenamento: hai già giocato oggi"}</div></div>
      <span style="width:36px"></span>
    </div>
    <div class="row between" style="max-width:420px;margin:18px auto 12px;width:100%">
      <span class="num" id="sd-time" style="font-size:28px">0:00</span>
      <span class="small muted" id="sd-err"></span>
    </div>
    <div class="sudoku n${n}" id="sd-grid" style="--n:${n};--br:${br};--bc:${bc}"></div>
    <div class="pad" id="sd-pad" style="--n:${n}">${[...Array(n).keys()].map(i => `<button data-v="${i + 1}">${i + 1}</button>`).join("")}<button data-v="0" aria-label="Cancella">${ico("close", 18)}</button></div>
    <div id="sd-win"></div>`);

  const gridEl = $("#sd-grid");
  const draw = () => {
    const v = sel >= 0 ? st.grid[sel] : 0;
    const sr = Math.floor(sel / n), sc = sel % n;
    gridEl.innerHTML = st.grid.map((x, i) => {
      const r = Math.floor(i / n), c = i % n;
      const given = puzzle[i] !== 0;
      const wrong = x && x !== solution[i];
      const peer = sel >= 0 && (r === sr || c === sc || (Math.floor(r / br) === Math.floor(sr / br) && Math.floor(c / bc) === Math.floor(sc / bc)));
      const cls = [given ? "given" : "", wrong ? "wrong" : "", i === sel ? "sel" : peer ? "peer" : "", v && x === v && i !== sel ? "same" : "",
        c % bc === bc - 1 && c < n - 1 ? "br" : "", r % br === br - 1 && r < n - 1 ? "bb" : ""].join(" ");
      return `<button class="cell ${cls}" data-i="${i}">${x || ""}</button>`;
    }).join("");
    $("#sd-err").textContent = st.mistakes ? `${st.mistakes} ${st.mistakes === 1 ? "errore" : "errori"} · +${st.mistakes * PENALTY}s` : "Nessun errore";
  };
  const tick = () => { const el = $("#sd-time"); if (el) el.textContent = mmss(elapsed() + st.mistakes * PENALTY); };
  const win = async () => {
    st.elapsed = elapsed(); st.done = true; save(); clearInterval(timer); tick();
    const total = Math.round(st.elapsed + st.mistakes * PENALTY);
    $("#sd-pad").hidden = true;
    $("#sd-win").innerHTML = `<div class="glass win"><div class="serif" style="font-size:34px">Risolto</div>
      <div class="num" style="font-size:44px;margin:6px 0">${mmss(total)}</div>
      <div class="small muted">${st.mistakes ? `${mmss(st.elapsed)} più ${st.mistakes * PENALTY}s di errori` : "Senza errori"}</div>
      <div id="sd-rank" class="small" style="margin-top:10px"></div>
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" data-act="game-board" data-g="sudoku${n}">${ico("trophy", 17)}Classifica</button></div></div>`;
    if (official) {
      await saveScore("sudoku" + n, total, { mistakes: st.mistakes, seconds: Math.round(st.elapsed) });
      const r = myRank("sudoku" + n, "today");
      const el = $("#sd-rank"); if (el && r) el.innerHTML = `Sei <b>${r.pos}°</b> su ${r.of} oggi`;
    }
  };
  const put = v => {
    if (sel < 0 || puzzle[sel] || st.done) return;
    if (v && v !== solution[sel] && st.grid[sel] !== v) { st.mistakes++; navigator.vibrate?.(30); }
    st.grid[sel] = v;
    save(); draw();
    if (st.grid.every((x, i) => x === solution[i])) win();
  };
  gridEl.addEventListener("click", e => { const b = e.target.closest(".cell"); if (!b) return; sel = Number(b.dataset.i); draw(); });
  $("#sd-pad").addEventListener("click", e => { const b = e.target.closest("button"); if (b) put(Number(b.dataset.v)); });
  const onKey = e => { if (/^[0-9]$/.test(e.key) && Number(e.key) <= n) put(Number(e.key)); if (e.key === "Backspace") put(0); };
  addEventListener("keydown", onKey);
  draw(); tick();
  if (st.done) { $("#sd-pad").hidden = true; $("#sd-win").innerHTML = `<div class="glass win"><div class="serif" style="font-size:28px">Già risolto oggi</div><div class="small muted" style="margin-top:6px">Torna domani per una nuova griglia.</div><div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" data-act="game-board" data-g="sudoku${n}">Classifica</button></div></div>`; }
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
      <div class="row" style="justify-content:center;gap:16px;margin:14px 0" ><span class="row tiny" style="gap:6px"><i class="dot" style="background:#f5f5f7"></i>+1</span><span class="row tiny" style="gap:6px"><i class="dot" style="background:#e9cf9a"></i>+3</span><span class="row tiny" style="gap:6px"><i class="dot" style="background:#ff6b6b"></i>−5</span></div>
      <button class="btn pearl block" data-act="fx-start">Via</button></div>`);

  const spawn = () => {
    const t = (performance.now() - start) / 1000;
    const roll = Math.random();
    const kind = roll < 0.14 ? "gold" : roll < 0.14 + Math.min(0.22, 0.06 + t * 0.006) ? "bad" : "std";
    const speed = (H() / 2.6) * (1 + t / 40) * (kind === "gold" ? 1.35 : 1) * (0.85 + Math.random() * 0.3);
    rockets.push({ x: W() * (0.1 + Math.random() * 0.8), y: H() + 20 * dpr, vy: -speed, vx: (Math.random() - 0.5) * 40 * dpr, kind, r: (kind === "gold" ? 13 : 16) * dpr, trail: [], wob: Math.random() * 6 });
  };
  const color = k => (k === "gold" ? "#e9cf9a" : k === "bad" ? "#ff6b6b" : "#f5f5f7");
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
    const prev = myRank("fuochi", "all");
    panel(`<div class="glass win"><div class="eyebrow">Tempo scaduto</div><div class="num" style="font-size:56px;margin:6px 0">${score}</div><div class="small muted">punti${prev && score > prev.s.score ? " · nuovo record personale" : ""}</div>
      <div id="fx-rank" class="small" style="margin-top:10px"></div>
      <div class="actions"><button class="btn" data-act="fx-start">Rigioca</button><button class="btn primary" data-act="game-board" data-g="fuochi">${ico("trophy", 17)}Classifica</button></div></div>`);
    if (score > 0) {
      await saveScore("fuochi", score);
      const r = myRank("fuochi", "today"); const el = $("#fx-rank"); if (el && r) el.innerHTML = `Oggi sei <b>${r.pos}°</b> su ${r.of}`;
    }
  };
  ACTIONS["fx-start"] = begin;
  intro();
  raf = requestAnimationFrame(frame);
  gameCleanup = () => { running = false; cancelAnimationFrame(raf); removeEventListener("resize", size); };
}

// ───────────────────────── Azioni ─────────────────────────

Object.assign(ACTIONS, {
  "play-sudoku": el => playSudoku(el.dataset.n),
  "play-fuochi": () => playFuochi(),
  "close-game": () => { closeGame(); render(); },
  "game-seg": el => { UI.gameSeg = el.dataset.v; render(); },
  "lb-period": el => { UI.lbPeriod = el.dataset.v; render(); },
  "game-board": el => { closeGame(); UI.gameSeg = el.dataset.g; UI.lbPeriod = "today"; UI.tab = "giochi"; render(); window.scrollTo(0, document.body.scrollHeight); },
});
