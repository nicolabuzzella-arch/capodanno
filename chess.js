/* Capodanno - scacchi.
   - Online 1 contro 1 con orologio (3+2, 5+5, 10 minuti): inviti, mosse in tempo reale, patta, abbandono,
     bandierina controllata dal server, partite da guardare dal vivo e classifica Elo del gruppo.
   - Contro il telefono (tre livelli, il computer pensa in un Web Worker) e due giocatori sullo stesso telefono.
   Le regole stanno in chess-engine.js (window.Chess); qui ci sono grafica, orologi e collegamento al database. */
"use strict";

const C = window.Chess;
const CH = { games: [], view: null, offset: 0, worker: null, wid: 0, wcb: new Map(), shown: new Set(), waiting: null, loaded: false, actx: null };
const TCS = [{ id: "3+2", label: "3 + 2", sub: "Blitz" }, { id: "5+5", label: "5 + 5", sub: "Blitz" }, { id: "10+0", label: "10 min", sub: "Rapid" }];
const LEVELS = [{ id: 1, label: "Facile" }, { id: 2, label: "Medio" }, { id: 3, label: "Difficile" }];
const CPU_KEY = "capodanno-scacchi-cpu";
const REASONS = { matto: "per scacco matto", tempo: "per tempo", abbandono: "per abbandono", stallo: "per stallo", materiale: "per materiale insufficiente", ripetizione: "per ripetizione", "50 mosse": "per la regola delle 50 mosse", accordo: "d'accordo", annullata: "partita annullata", "prima mossa": "nessuno ha mosso in tempo" };
const pieceUrl = p => `pezzi/${C.isW(p) ? "w" : "b"}${p.toUpperCase()}.svg`;
const serverNow = () => Date.now() + CH.offset;
const tcLabel = tc => TCS.find(t => t.id === tc)?.label || tc;

Object.assign(ICONS, {
  chess: '<path d="M9 21h6M8 18h8l-1-6h-6z"/><path d="M9.5 12V9.5H8V7h2V5h1.5V3.5h1V5H14v2h2v2.5h-1.5V12"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  half: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
});

// ───────────────────────── Dati e tempo reale ─────────────────────────

async function rpc(fn, args = {}) {
  const { data, error } = await api.sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
function upsertGame(row) {
  if (!row?.id) return;
  const i = CH.games.findIndex(g => g.id === row.id);
  if (i >= 0) CH.games[i] = row; else CH.games.unshift(row);
}
async function syncOffset() {
  try {
    const t0 = Date.now(), ms = await rpc("server_ms"), t1 = Date.now();
    CH.offset = Number(ms) - (t0 + t1) / 2;
  } catch { /* si resta con l'ora del telefono */ }
}
async function chessLoad() {
  if (!CLOUD) return;
  const { data, error } = await api.sb.from("chess_games").select("*").order("updated_at", { ascending: false }).limit(300);
  if (error) return;
  CH.games = data || []; CH.loaded = true;
  syncOffset();
  for (const g of CH.games) maybePrompt(g);
  refreshChessCard();
}
async function fetchGame(id) {
  const { data } = await api.sb.from("chess_games").select("*").eq("id", id).maybeSingle();
  if (data) { upsertGame(data); CH.view?.id === id && CH.view.update(data); }
  return data;
}

// Il canale «tutto» dell'app passa qui le modifiche alla tabella degli scacchi, senza ricaricare il resto.
window.onChessChange = payload => {
  const row = payload.new && payload.new.id ? payload.new : null;
  if (!row) return;
  upsertGame(row);
  if (CH.view?.id === row.id) CH.view.update(row);
  if (CH.waiting === row.id) {
    if (row.status === "active") { CH.waiting = null; openOnline(row); }
    else if (["declined", "cancelled"].includes(row.status)) { CH.waiting = null; closeGame(); toast(row.status === "declined" ? `${mname(opponentOf(row))} ha rifiutato` : "Invito annullato"); }
  }
  maybePrompt(row);
  refreshChessCard();
};

const mineGame = g => g.white === ME || g.black === ME;
const opponentOf = g => (g.white === ME ? g.black : g.white);
const myColorIn = g => (g.white === ME ? "w" : g.black === ME ? "b" : null);

function maybePrompt(g) {
  if (g.status !== "invited" || g.created_by === ME || !mineGame(g) || CH.shown.has(g.id)) return;
  if (Date.now() - new Date(g.created_at).getTime() > 15 * 60000) return;
  if (!$("#game").hidden && !CH.view) return; // un altro gioco è aperto: l'invito resta nella scheda Giochi
  CH.shown.add(g.id);
  const color = myColorIn(g) === "w" ? "con il bianco" : "con il nero";
  openSheet(`<div class="duel-invite">${avatar(member(g.created_by), "lg")}
    <div class="serif" style="font-size:28px;margin-top:12px">${esc(mname(g.created_by))} ti sfida a scacchi</div>
    <div class="small muted" style="margin:6px 0 18px">${tcLabel(g.tc)} · giochi ${color}</div>
    <div class="actions"><button class="btn" data-act="chess-answer" data-id="${g.id}" data-ok="0">No grazie</button>
    <button class="btn primary" data-act="chess-answer" data-id="${g.id}" data-ok="1">Gioca</button></div></div>`);
  navigator.vibrate?.([30, 50, 30]);
}

// ───────────────────────── Classifica Elo ─────────────────────────

function chessRatings() {
  const R = new Map();
  const get = id => { if (!R.has(id)) R.set(id, { member_id: id, score: 1200, w: 0, d: 0, l: 0, played: 0 }); return R.get(id); };
  const done = CH.games.filter(g => g.status === "over" && g.result && g.result !== "aborted" && member(g.white) && member(g.black))
    .sort((a, b) => new Date(a.ended_at) - new Date(b.ended_at));
  for (const g of done) {
    const w = get(g.white), b = get(g.black);
    const sw = g.result === "1-0" ? 1 : g.result === "0-1" ? 0 : 0.5;
    const ew = 1 / (1 + 10 ** ((b.score - w.score) / 400));
    const k = 32;
    w.score += k * (sw - ew); b.score += k * ((1 - sw) - (1 - ew));
    w.played++; b.played++;
    if (sw === 1) { w.w++; b.l++; } else if (sw === 0) { w.l++; b.w++; } else { w.d++; b.d++; }
  }
  return [...R.values()].map(r => ({ ...r, score: Math.round(r.score) })).sort((a, b) => b.score - a.score);
}

window.chessRankCard = function () {
  const lb = chessRatings().slice(0, 10);
  return `<section class="card">
    <div class="row" style="gap:10px;margin-bottom:${lb.length ? 12 : 0}px">${ico("chess", 18)}<div class="t grow">Scacchi</div>${lb.length ? `<span class="tiny faint">punteggio Elo</span>` : `<span class="small faint">ancora nessuno</span>`}</div>
    ${lb.map((s, i) => `
      <div class="li rank ${s.member_id === ME ? "me" : ""}">
        <span class="pos p${i + 1}">${i + 1}</span>
        ${avatar(member(s.member_id), "sm")}
        <span class="grow t ellipsis">${esc(mname(s.member_id))}${s.member_id === ME ? ` <span class="faint small">tu</span>` : ""}</span>
        <span class="tiny faint">${s.w}V ${s.d}P ${s.l}S</span>
        <b class="num">${s.score}</b>
      </div>`).join("")}
  </section>`;
};

// ───────────────────────── Scheda nei Giochi ─────────────────────────

window.chessCard = function () {
  const mine = CH.games.filter(mineGame);
  const incoming = mine.filter(g => g.status === "invited" && g.created_by !== ME && Date.now() - new Date(g.created_at) < 15 * 60000);
  const outgoing = mine.filter(g => g.status === "invited" && g.created_by === ME && Date.now() - new Date(g.created_at) < 15 * 60000);
  const playing = mine.filter(g => g.status === "active");
  const live = CH.games.filter(g => g.status === "active" && !mineGame(g) && member(g.white) && member(g.black));
  const me = chessRatings().find(r => r.member_id === ME);
  const saved = cpuSaved();
  const row = (g, right) => `<div class="li"><div class="cb-vs">${avatar(member(g.white), "sm")}${avatar(member(g.black), "sm")}</div>
    <div class="grow"><div class="t ellipsis">${esc(mname(g.white))} – ${esc(mname(g.black))}</div><div class="tiny faint">${tcLabel(g.tc)} · ${g.moves.length ? `${Math.ceil(g.moves.length / 2)}ª mossa` : "inizio"}</div></div>${right}</div>`;
  return `<section class="card game-card chess-card" id="chess-card">
    <div class="row top"><div class="game-ico chess-ico">${ico("chess", 30)}</div>
      <div class="grow"><div class="serif" style="font-size:28px;line-height:1">Scacchi</div>
        <div class="small muted" style="margin-top:6px">Sfide dal vivo con l'orologio: 3+2, 5+5 o 10 minuti. ${me ? `Il tuo Elo: <b>${me.score}</b>.` : "Classifica Elo del gruppo."}</div></div></div>
    ${incoming.map(g => `<div class="li cb-inv"><div class="cb-vs">${avatar(member(g.created_by), "sm")}</div><div class="grow"><div class="t">${esc(mname(g.created_by))} ti sfida</div><div class="tiny faint">${tcLabel(g.tc)} · giochi ${myColorIn(g) === "w" ? "con il bianco" : "con il nero"}</div></div>
      <button class="btn sm" data-act="chess-answer" data-id="${g.id}" data-ok="0">No</button><button class="btn sm primary" data-act="chess-answer" data-id="${g.id}" data-ok="1">Gioca</button></div>`).join("")}
    ${outgoing.map(g => row(g, `<button class="btn sm" data-act="chess-cancel" data-id="${g.id}">Annulla</button>`)).join("")}
    ${playing.map(g => row(g, `<button class="btn sm primary" data-act="chess-open" data-id="${g.id}">Riprendi</button>`)).join("")}
    <div class="cb-btns">
      <button class="btn pearl block" data-act="chess-challenge">${ico("swap", 18)}Sfida qualcuno</button>
      <div class="grid2" style="gap:8px">
        <button class="btn block" data-act="chess-cpu-sheet">${ico("device", 17)}${saved ? "Riprendi" : "Allenamento"}</button>
        <button class="btn block" data-act="chess-local">${ico("users", 17)}In due qui</button>
      </div>
    </div>
    ${live.length ? `<div class="label" style="margin:16px 0 6px">In corso adesso</div>${live.map(g => row(g, `<button class="btn sm" data-act="chess-open" data-id="${g.id}">Guarda</button>`)).join("")}` : ""}
  </section>`;
};
function refreshChessCard() {
  const el = $("#chess-card");
  if (el) el.outerHTML = chessCard();
}

// ───────────────────────── Sfide ─────────────────────────

const pick = { tc: "5+5", color: "r", level: 2, cpuColor: "w" };
function chips(name, items, cur) {
  return `<div class="cb-chips">${items.map(it => `<button class="cb-chip ${String(cur) === String(it.id) ? "on" : ""}" data-act="chess-pick" data-k="${name}" data-v="${it.id}"><b>${it.label}</b>${it.sub ? `<span>${it.sub}</span>` : ""}</button>`).join("")}</div>`;
}
const COLORS_PICK = [{ id: "r", label: "Casuale" }, { id: "w", label: "Bianco" }, { id: "b", label: "Nero" }];
function sheetChallenge() {
  if (!CLOUD) return toast("Le sfide online funzionano quando l'app è collegata al database");
  const others = S.members.filter(m => m.id !== ME);
  const online = new Set(typeof onlineIds === "function" ? onlineIds() : []);
  openSheet(`<h2>Sfida a scacchi</h2>
    <div class="label">Cadenza</div>${chips("tc", TCS, pick.tc)}
    <div class="label">Colore</div>${chips("color", COLORS_PICK, pick.color)}
    <div class="label">Avversario</div>
    <div class="stack" style="gap:6px">${others.map(m => `<div class="li">${avatar(m, "sm")}<div class="grow"><div class="t">${esc(m.name)}</div>${online.has(m.id) ? `<div class="tiny pos">online ora</div>` : ""}</div>
      <button class="btn sm primary" data-act="chess-invite" data-id="${m.id}">Sfida</button></div>`).join("") || `<div class="small muted">Nessun altro nel gruppo, per ora.</div>`}</div>`);
}
function sheetCpu() {
  const saved = cpuSaved();
  openSheet(`<h2>Contro il telefono</h2>
    ${saved ? `<button class="btn pearl block" style="margin-bottom:14px" data-act="chess-cpu-resume">${ico("play", 17)}Riprendi la partita (${saved.moves.length} mosse)</button>` : ""}
    <div class="label">Livello</div>${chips("level", LEVELS, pick.level)}
    <div class="label">Colore</div>${chips("cpuColor", COLORS_PICK, pick.cpuColor)}
    <button class="btn ${saved ? "" : "pearl"} block" style="margin-top:18px" data-act="chess-cpu-start">${saved ? "Nuova partita" : "Inizia"}</button>
    <div class="tiny faint" style="margin-top:10px;text-align:center">Allenamento: non conta per la classifica.</div>`);
}
async function invite(opp) {
  closeSheet();
  try {
    const g = await rpc("chess_invite", { p_opp: opp, p_tc: pick.tc, p_color: pick.color });
    upsertGame(g); CH.waiting = g.id;
    api.notify("chess", g.id);
    openGame(`<div class="duel-wait">${avatar(member(opp), "lg")}<div class="serif" style="font-size:30px;margin-top:16px">Aspetto ${esc(mname(opp))}…</div>
      <div class="small muted" style="margin-top:8px">Scacchi ${tcLabel(g.tc)}. Gli è arrivata una notifica: l'invito vale 15 minuti.</div>
      <div class="cb-wait-board">${miniBoard()}</div>
      <button class="btn" style="margin-top:22px" data-act="chess-cancel" data-id="${g.id}">Annulla</button></div>`);
    gameCleanup = () => { if (CH.waiting === g.id) CH.waiting = null; };
  } catch (e) { toast(e.message, "alert"); }
}
function miniBoard() {
  return `<div class="cb-mini">${[...Array(64).keys()].map(i => `<i class="${(Math.floor(i / 8) + i % 8) % 2 ? "d" : "l"}"></i>`).join("")}</div>`;
}

// ───────────────────────── Suoni ─────────────────────────

function sound(kind) {
  try {
    CH.actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const a = CH.actx, t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = kind === "check" ? 2400 : 1500;
    o.type = kind === "check" ? "triangle" : "sine";
    o.frequency.setValueAtTime(kind === "capture" ? 180 : kind === "check" ? 620 : 260, t);
    o.frequency.exponentialRampToValueAtTime(kind === "capture" ? 70 : kind === "check" ? 440 : 120, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "capture" ? 0.5 : 0.35, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(f); f.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.18);
  } catch { /* niente audio */ }
}

// ───────────────────────── Computer ─────────────────────────

function cpuSaved() { try { const s = JSON.parse(storage.get(CPU_KEY)); return s && !s.over ? s : null; } catch { return null; } }
function cpuMove(fen, level, keys) {
  return new Promise(res => {
    if (!CH.worker && window.Worker) { try { CH.worker = new Worker("chess-engine.js"); CH.worker.onmessage = e => { CH.wcb.get(e.data.id)?.(e.data.uci); CH.wcb.delete(e.data.id); }; } catch { CH.worker = null; } }
    if (CH.worker) { const id = ++CH.wid; CH.wcb.set(id, res); CH.worker.postMessage({ id, fen, level, keys }); }
    else setTimeout(() => res(C.think(fen, { level, keys })), 30);
  });
}

// ───────────────────────── Scacchiera ─────────────────────────
// opts.kind: "online" (opts.game), "cpu" (opts.level, opts.color, opts.moves) o "local".

function openBoard(opts) {
  const online = opts.kind === "online", cpu = opts.kind === "cpu";
  let game = online ? opts.game : null;
  const myColor = online ? myColorIn(game) : cpu ? opts.color : null;
  const flip = myColor === "b";
  let moves = online ? game.moves.map(m => m.u) : (opts.moves || []).slice();
  let R = C.replay(moves);
  let review = -1;            // indice della posizione che si sta rivedendo (-1 = dal vivo)
  let sel = -1, targets = [], drag = null, thinking = false, pending = false, over = null, flagAt = 0, raf = 0, lastLabel = {};
  const title = online ? `Scacchi ${tcLabel(game.tc)}` : cpu ? `Contro il telefono · ${LEVELS.find(l => l.id === opts.level).label}` : "Partita a due";

  openGame(`
    <div class="game-top">
      <button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">${esc(title)}</div><div class="tiny faint" id="cb-sub">${online && !myColor ? "Stai guardando dal vivo" : online ? (game.tc === "10+0" ? "Rapid" : "Blitz") : cpu ? "Allenamento" : "Passatevi il telefono"}</div></div>
      <span style="width:36px"></span>
    </div>
    <div class="cb-wrap">
      <div class="cb-player" id="cb-top"></div>
      <div class="cb-frame"><div class="cb-board" id="cb-board">
        <div class="cb-squares">${[...Array(64).keys()].map(v => `<div class="sq ${(Math.floor(v / 8) + v % 8) % 2 ? "d" : "l"}" data-v="${v}">${v % 8 === 0 ? `<span class="rk">${flip ? Math.floor(v / 8) + 1 : 8 - Math.floor(v / 8)}</span>` : ""}${v >= 56 ? `<span class="fl">${"abcdefgh"[flip ? 7 - v % 8 : v % 8]}</span>` : ""}</div>`).join("")}</div>
        <div class="cb-pieces" id="cb-pieces"></div>
        <div class="cb-promo" id="cb-promo" hidden></div>
      </div></div>
      <div class="cb-player" id="cb-bot"></div>
      <div class="cb-moves" id="cb-moves"></div>
      <div class="cb-banner" id="cb-banner" hidden></div>
      <div class="cb-actions" id="cb-actions"></div>
      <div id="cb-end"></div>
    </div>`);

  const boardEl = $("#cb-board"), piecesEl = $("#cb-pieces"), squares = $$(".cb-squares .sq");
  const vis = sq => (flip ? 63 - sq : sq);
  const place = (el, sq) => { const v = vis(sq); el.style.transform = `translate(${(v % 8) * 100}%,${Math.floor(v / 8) * 100}%)`; };
  let at = new Map(); // casa → elemento del pezzo

  const shownState = () => (review >= 0 ? R.states[review] : R.s);
  const live = () => review < 0;
  const sideToMove = () => R.s.t;
  const myTurn = () => !over && live() && !pending && !thinking && (online ? game.status === "active" && myColor === sideToMove() : cpu ? myColor === sideToMove() : true);

  function rebuild() {
    piecesEl.innerHTML = ""; at = new Map();
    const s = shownState();
    s.b.forEach((p, sq) => {
      if (!p) return;
      const el = document.createElement("div");
      el.className = "pc"; el.dataset.p = p; el.style.backgroundImage = `url(${pieceUrl(p)})`;
      place(el, sq); piecesEl.appendChild(el); at.set(sq, el);
    });
  }
  // Sposta solo i pezzi coinvolti (transizione CSS su transform: fluida anche su iPhone).
  function animate(m, before) {
    const white = C.isW(before.b[m.f]);
    const el = at.get(m.f);
    const capSq = m.k === "e" ? m.t + (white ? 8 : -8) : m.t;
    const cap = at.get(capSq);
    if (cap && cap !== el) { cap.classList.add("gone"); setTimeout(() => cap.remove(), 220); at.delete(capSq); }
    if (el) { at.delete(m.f); place(el, m.t); at.set(m.t, el); el.classList.add("moving"); setTimeout(() => el.classList.remove("moving"), 220); }
    if (m.k === "c") {
      const [rf, rt] = m.t > m.f ? [m.f + 3, m.f + 1] : [m.f - 4, m.f - 1];
      const rook = at.get(rf); if (rook) { at.delete(rf); place(rook, rt); at.set(rt, rook); }
    }
    if (m.p && el) { const np = white ? m.p.toUpperCase() : m.p; setTimeout(() => { el.dataset.p = np; el.style.backgroundImage = `url(${pieceUrl(np)})`; }, 160); }
  }
  function verify() {
    const s = shownState();
    for (let sq = 0; sq < 64; sq++) {
      const p = s.b[sq], el = at.get(sq);
      if ((p || "") !== (el ? el.dataset.p : "") && !(el && s.b[sq] && el.dataset.p.toLowerCase() === "p")) return rebuild();
    }
  }

  function paintSquares() {
    const s = shownState();
    const idx = review >= 0 ? review : R.states.length - 1;
    const lastUci = idx > 0 ? moves[idx - 1] : null;
    const last = lastUci ? [C.sqIdx(lastUci.slice(0, 2)), C.sqIdx(lastUci.slice(2, 4))] : [];
    const checkSq = C.inCheck(s) ? s.b.indexOf(s.t === "w" ? "K" : "k") : -1;
    squares.forEach((el, v) => {
      const sq = flip ? 63 - v : v;
      const cls = ["sq", (Math.floor(v / 8) + v % 8) % 2 ? "d" : "l"];
      if (last.includes(sq)) cls.push("last");
      if (sq === sel) cls.push("sel");
      if (sq === checkSq) cls.push("check");
      const tg = targets.find(m => m.t === sq);
      if (tg) cls.push(s.b[sq] || tg.k === "e" ? "cap" : "dot");
      el.className = cls.join(" ");
    });
  }

  function playerRow(color) {
    const id = online ? (color === "w" ? game.white : game.black) : null;
    const name = online ? mname(id) : cpu ? (color === myColor ? "Tu" : "Telefono") : color === "w" ? "Bianco" : "Nero";
    const av = online ? avatar(member(id), "sm") : cpu && color === myColor ? avatar(me(), "sm") : `<span class="cb-dot ${color}"></span>`;
    // Pezzi mangiati e vantaggio di materiale.
    const s = shownState(), val = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const count = {}; for (const p of s.b) if (p) count[p] = (count[p] || 0) + 1;
    const full = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    let mat = 0; const taken = [];
    for (const k of "qrbnp") {
      const foe = color === "w" ? k : k.toUpperCase(), mine = color === "w" ? k.toUpperCase() : k;
      const lost = Math.max(0, full[k] - (count[foe] || 0));
      for (let i = 0; i < lost; i++) taken.push(foe);
      mat += ((count[mine] || 0) - (count[foe] || 0)) * val[k];
    }
    const extra = cpu && color !== myColor && thinking ? `<span class="tiny faint cb-think">pensa…</span>` : "";
    return `${av}<div class="grow" style="min-width:0"><div class="t ellipsis">${esc(name)}${extra}</div>
      <div class="cb-taken">${taken.map(p => `<i style="background-image:url(${pieceUrl(p)})"></i>`).join("")}${mat > 0 ? `<b>+${mat}</b>` : ""}</div></div>
      ${online ? `<span class="cb-clock num" data-clock="${color}">--:--</span>` : ""}`;
  }
  function paintPlayers() {
    const top = flip ? "w" : "b", bot = flip ? "b" : "w";
    $("#cb-top").innerHTML = playerRow(top); $("#cb-top").dataset.color = top;
    $("#cb-bot").innerHTML = playerRow(bot); $("#cb-bot").dataset.color = bot;
    lastLabel = {};
  }
  function paintMoves() {
    const el = $("#cb-moves");
    const cur = review >= 0 ? review : R.sans.length;
    el.innerHTML = R.sans.length ? R.sans.map((s, i) => `${i % 2 === 0 ? `<span class="n">${i / 2 + 1}.</span>` : ""}<button class="mv ${i + 1 === cur ? "on" : ""}" data-i="${i + 1}">${s}</button>`).join("")
      : `<span class="tiny faint">${online && game.status === "active" && game.moves.length < 2 ? "Il primo tratto non consuma tempo, ma va giocato entro 30 secondi." : "Muove il bianco."}</span>`;
    const on = el.querySelector(".on"); if (on) on.scrollIntoView({ block: "nearest", inline: "center" }); else el.scrollLeft = el.scrollWidth;
  }
  function paintActions() {
    const el = $("#cb-actions");
    if (over) { el.innerHTML = ""; return; }
    if (online && !myColor) { el.innerHTML = ""; return; }
    if (online) {
      const offered = game.draw_offer === ME;
      el.innerHTML = `<button class="btn" data-cb="draw" ${offered ? "disabled" : ""}>${ico("half", 16)}${offered ? "Patta offerta" : "Patta"}</button>
        <button class="btn" data-cb="resign">${ico("flag", 16)}${game.moves.length < 2 ? "Annulla" : "Abbandona"}</button>`;
    } else {
      el.innerHTML = `<button class="btn" data-cb="undo" ${moves.length ? "" : "disabled"}>${ico("undo", 16)}Indietro</button>
        <button class="btn" data-cb="resign">${ico("flag", 16)}${cpu ? "Abbandona" : "Fine"}</button>`;
    }
  }
  function paintBanner() {
    const el = $("#cb-banner");
    let html = "";
    if (!live()) html = `<span class="grow">Stai rivedendo la posizione</span><button class="btn sm primary" data-cb="live">Torna alla partita</button>`;
    else if (online && game.status === "active" && game.draw_offer && game.draw_offer !== ME && myColor) html = `<span class="grow">${esc(mname(game.draw_offer))} propone la patta</span><button class="btn sm" data-cb="draw-no">No</button><button class="btn sm primary" data-cb="draw-yes">Accetta</button>`;
    el.hidden = !html; el.innerHTML = html;
  }
  function paintAll(full) {
    if (full) rebuild(); else verify();
    paintSquares(); paintPlayers(); paintMoves(); paintActions(); paintBanner();
  }

  // ── Orologi (solo online): calcolati dagli istanti del server, come fa il database ──
  function clocks() {
    const g = game, n = g.moves.length;
    let w = g.base_ms, b = g.base_ms, prev = Number(g.started_ms);
    g.moves.forEach((m, i) => {
      const t = Number(m.t);
      if (i >= 2) { if (i % 2 === 0) w -= t - prev - g.inc_ms; else b -= t - prev - g.inc_ms; }
      prev = t;
    });
    if (g.status === "active" && n >= 2) { if (n % 2 === 0) w -= serverNow() - prev; else b -= serverNow() - prev; }
    // Persa per tempo: l'orologio di chi è rimasto senza si ferma a zero.
    if (g.status === "over" && g.reason === "tempo") { if (g.result === "0-1") w = 0; else b = 0; }
    return { w, b, n, prev };
  }
  const fmtClock = ms => {
    ms = Math.max(0, ms);
    if (ms < 10000) return (ms / 1000).toFixed(1);
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  function tick() {
    if (online) {
      const c = clocks(), active = game.status === "active";
      for (const color of ["w", "b"]) {
        const el = document.querySelector(`[data-clock="${color}"]`); if (!el) continue;
        const ms = c[color], running = active && sideToMove() === color && c.n >= 2;
        const label = fmtClock(ms);
        const key = `${label}|${running}|${ms < 20000}`;
        if (lastLabel[color] !== key) { lastLabel[color] = key; el.textContent = label; el.classList.toggle("on", running); el.classList.toggle("low", ms < 20000 && active); }
      }
      // Bandierina o prima mossa non giocata: chiede al server di controllare (al massimo ogni 2 secondi).
      if (active && Date.now() - flagAt > 2000) {
        const firstLate = c.n < 2 && serverNow() - (c.n === 0 ? Number(game.started_ms) : Number(game.moves[0].t)) > 30500;
        if ((c.n >= 2 && c[sideToMove()] <= 0) || firstLate) { flagAt = Date.now(); rpc("chess_flag", { p_id: game.id }).then(row => { upsertGame(row); update(row); }).catch(() => {}); }
      }
    }
    raf = requestAnimationFrame(tick);
  }

  // ── Mosse ──
  function select(sq) {
    const s = R.s;
    sel = sq; targets = sq >= 0 ? C.legal(s).filter(m => m.f === sq) : [];
    paintSquares();
  }
  function tryMove(from, to) {
    const cands = C.legal(R.s).filter(m => m.f === from && m.t === to);
    if (!cands.length) return false;
    if (cands.length > 1) { askPromotion(cands); return true; }
    play(cands[0], true);
    return true;
  }
  function askPromotion(cands) {
    const box = $("#cb-promo"), white = R.s.t === "w", to = cands[0].t, v = vis(to);
    box.style.left = `${(v % 8) * 12.5}%`; box.style.top = Math.floor(v / 8) === 0 ? "0" : "50%";
    box.innerHTML = "qrbn".split("").map(p => `<button data-promo="${p}" style="background-image:url(${pieceUrl(white ? p.toUpperCase() : p)})"></button>`).join("");
    box.hidden = false;
    box.onclick = e => { const b = e.target.closest("[data-promo]"); box.hidden = true; if (b) play(cands.find(m => m.p === b.dataset.promo), true); else select(-1); };
  }
  function applyMove(m) {
    const before = R.s;
    const sanTxt = C.san(before, m);
    const after = C.make(before, m);
    moves.push(C.toUci(m));
    R.s = after; R.states.push(after); R.sans.push(sanTxt); R.keys.push(C.fen(after, false));
    animate(m, before);
    sound(sanTxt.includes("+") || sanTxt.includes("#") ? "check" : m.x ? "capture" : "move");
    return C.outcome(after, R.keys);
  }
  async function play(m, mine) {
    if (!live()) { review = -1; paintAll(true); }
    sel = -1; targets = [];
    const out = applyMove(m);
    navigator.vibrate?.(8);
    if (online && mine) {
      // Mossa subito sulla scacchiera; il server conferma l'istante e passa l'orologio all'altro.
      game = { ...game, moves: [...game.moves, { u: C.toUci(m), t: serverNow() }], draw_offer: null };
      pending = true; paintAll(false);
      try {
        const row = await rpc("chess_move", { p_id: game.id, p_ply: moves.length - 1, p_uci: C.toUci(m), p_result: out?.result ?? null, p_reason: out?.reason ?? null });
        pending = false; upsertGame(row); update(row);
      } catch (e) {
        pending = false; toast(e.message, "alert");
        await fetchGame(game.id);
      }
      return;
    }
    if (out) { finish(out); return; }
    paintAll(false);
    if (cpu) { saveCpu(); if (sideToMove() !== myColor) cpuTurn(); }
  }
  async function cpuTurn() {
    thinking = true; paintPlayers();
    const started = Date.now();
    const uci = await cpuMove(C.fen(R.s), opts.level, R.keys);
    await new Promise(r => setTimeout(r, Math.max(0, 380 - (Date.now() - started))));
    if (!CH.view || CH.view !== view) return;
    thinking = false;
    const m = uci && C.fromUci(R.s, uci);
    if (m) play(m, false); else paintPlayers();
  }
  function saveCpu() { storage.set(CPU_KEY, JSON.stringify({ moves, level: opts.level, color: myColor, over: !!over })); }

  // Aggiornamento dal server (mossa dell'avversario, patta, fine partita).
  function update(row) {
    if (!online || row.id !== game.id) return;
    const prevStatus = game.status;
    const serverMoves = row.moves.map(m => m.u);
    if (pending && serverMoves.length < moves.length) return; // la nostra mossa non è ancora arrivata al server
    game = row;
    const same = serverMoves.length >= moves.length && moves.every((u, i) => u === serverMoves[i]);
    if (same && serverMoves.length === moves.length + 1 && live()) {
      const m = C.fromUci(R.s, serverMoves.at(-1));
      if (m) { applyMove(m); navigator.vibrate?.(15); }
    } else if (!same || serverMoves.length !== moves.length) {
      moves = serverMoves; R = C.replay(moves); if (review >= moves.length) review = -1;
      sel = -1; targets = [];
      paintAll(true);
    }
    if (row.status === "over" && prevStatus !== "over") { finish({ result: row.result, reason: row.reason }); return; }
    paintAll(false);
  }

  function finish(out) {
    over = out; sel = -1; targets = [];
    paintAll(false);
    if (cpu) { saveCpu(); storage.del(CPU_KEY); }
    const r = out.result;
    const mine = myColor ? (r === "1/2-1/2" ? "draw" : (r === "1-0") === (myColor === "w") ? "win" : "loss") : null;
    const title = r === "aborted" ? "Partita annullata" : r === "1/2-1/2" ? "Patta" : !myColor ? (r === "1-0" ? "Vince il bianco" : "Vince il nero") : mine === "win" ? "Hai vinto" : "Hai perso";
    let elo = "";
    if (online && myColor && r !== "aborted") {
      const rt = chessRatings().find(x => x.member_id === ME);
      if (rt) elo = `<div class="small muted" style="margin-top:6px">Il tuo Elo ora: <b>${rt.score}</b></div>`;
    }
    $("#cb-end").innerHTML = `<div class="glass win cb-win ${mine || ""}">
      <div class="serif" style="font-size:34px">${title}</div>
      <div class="small muted">${REASONS[out.reason] || out.reason || ""}</div>${elo}
      <div class="actions">
        <button class="btn" data-act="close-game">Chiudi</button>
        ${online && myColor && r !== "aborted" ? `<button class="btn primary" data-cb="rematch">Rivincita</button>` : cpu ? `<button class="btn primary" data-cb="again">Un'altra</button>` : !online ? `<button class="btn primary" data-cb="again">Un'altra</button>` : ""}
      </div></div>`;
    navigator.vibrate?.(mine === "win" ? [40, 60, 40] : 80);
    setTimeout(() => $("#cb-end")?.scrollIntoView({ behavior: "smooth", block: "end" }), 250);
    refreshChessCard();
  }

  // ── Tocco e trascinamento ──
  const sqAt = e => {
    const r = boardEl.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / (r.width / 8)), rw = Math.floor((e.clientY - r.top) / (r.height / 8));
    if (c < 0 || c > 7 || rw < 0 || rw > 7) return -1;
    const v = rw * 8 + c; return flip ? 63 - v : v;
  };
  const ownPiece = sq => { const p = R.s.b[sq]; return p && (C.isW(p) ? "w" : "b") === R.s.t; };
  boardEl.addEventListener("pointerdown", e => {
    if (e.target.closest("#cb-promo")) return;
    if (!myTurn()) { if (!live()) { review = -1; paintAll(true); } return; }
    const sq = sqAt(e); if (sq < 0) return;
    if (sel >= 0 && targets.some(m => m.t === sq)) { tryMove(sel, sq); return; }
    if (ownPiece(sq)) {
      select(sq);
      const el = at.get(sq), r = boardEl.getBoundingClientRect();
      drag = { sq, el, x: e.clientX, y: e.clientY, r, moved: false };
      boardEl.setPointerCapture(e.pointerId);
    } else select(-1);
  });
  boardEl.addEventListener("pointermove", e => {
    if (!drag?.el) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.moved = true;
    const size = drag.r.width / 8;
    drag.el.classList.add("drag");
    drag.el.style.transform = `translate(${e.clientX - drag.r.left - size / 2}px,${e.clientY - drag.r.top - size * 0.75}px) scale(1.18)`;
  });
  const endDrag = e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    d.el?.classList.remove("drag");
    const sq = sqAt(e);
    if (sq >= 0 && sq !== d.sq && targets.some(m => m.t === sq) && tryMove(d.sq, sq)) return;
    if (d.el) place(d.el, d.sq);
  };
  boardEl.addEventListener("pointerup", endDrag);
  boardEl.addEventListener("pointercancel", endDrag);

  $("#cb-moves").addEventListener("click", e => {
    const b = e.target.closest(".mv"); if (!b) return;
    const i = Number(b.dataset.i);
    review = i === R.sans.length ? -1 : i; sel = -1; targets = [];
    paintAll(true);
  });
  const onAction = async e => {
    const b = e.target.closest("[data-cb]"); if (!b) return;
    const a = b.dataset.cb;
    if (a === "live") { review = -1; paintAll(true); }
    else if (a === "undo") {
      // Indietro: contro il telefono si torna alla tua ultima mossa.
      if (thinking) return;
      const back = cpu ? (sideToMove() === myColor ? 2 : 1) : 1;
      moves = moves.slice(0, Math.max(0, moves.length - back)); R = C.replay(moves); review = -1; sel = -1; targets = [];
      paintAll(true); if (cpu) saveCpu();
    } else if (a === "resign") {
      if (online) {
        const abort = game.moves.length < 2;
        if (!confirm(abort ? "Annullare la partita?" : "Vuoi davvero abbandonare?")) return;
        try { const row = await rpc("chess_resign", { p_id: game.id }); upsertGame(row); update(row); } catch (err) { toast(err.message, "alert"); }
      } else if (cpu) { if (confirm("Abbandonare la partita?")) finish({ result: myColor === "w" ? "0-1" : "1-0", reason: "abbandono" }); }
      else closeGame();
    } else if (a === "draw" || a === "draw-yes" || a === "draw-no") {
      try { const row = await rpc("chess_draw", { p_id: game.id, p_action: a === "draw" ? "offer" : a === "draw-yes" ? "accept" : "decline" }); upsertGame(row); update(row); if (a === "draw") toast("Patta proposta"); } catch (err) { toast(err.message, "alert"); }
    } else if (a === "rematch") {
      pick.tc = game.tc; pick.color = myColor === "w" ? "b" : "w";
      invite(opponentOf(game));
    } else if (a === "again") {
      if (cpu) startCpu(opts.level, myColor === "w" ? "b" : "w"); else openBoard({ kind: "local" });
    }
  };
  $(".cb-wrap").addEventListener("click", onAction);

  const onVisible = () => { if (document.visibilityState === "visible" && online) { syncOffset(); fetchGame(game.id); } };
  document.addEventListener("visibilitychange", onVisible);

  const view = { id: online ? game.id : null, update };
  CH.view = view;
  gameCleanup = () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisible); if (CH.view === view) CH.view = null; if (cpu && !over) saveCpu(); };

  paintAll(true);
  raf = requestAnimationFrame(tick);
  if (online && game.status === "over") finish({ result: game.result, reason: game.reason });
  else if (cpu && sideToMove() !== myColor) cpuTurn();
}

function openOnline(g) {
  if (!g) return;
  syncOffset();
  openBoard({ kind: "online", game: g });
}
function startCpu(level, color) {
  storage.del(CPU_KEY);
  const c = color === "r" ? (Math.random() < 0.5 ? "w" : "b") : color;
  openBoard({ kind: "cpu", level: Number(level), color: c, moves: [] });
}

// Notifica toccata o link: apre l'invito o la partita.
window.chessDeepLink = q => {
  const id = q.get("chess"); if (!id) return;
  const go = async () => {
    const g = CH.games.find(x => x.id === id) || (CLOUD ? await fetchGame(id) : null);
    if (!g) return;
    if (g.status === "invited") { CH.shown.delete(g.id); maybePrompt(g); }
    else if (g.status === "active" || g.status === "over") openOnline(g);
  };
  CH.loaded ? go() : setTimeout(go, 1500);
};

Object.assign(ACTIONS, {
  "chess-challenge": () => sheetChallenge(),
  "chess-cpu-sheet": () => sheetCpu(),
  "chess-local": () => openBoard({ kind: "local" }),
  "chess-pick": el => { pick[el.dataset.k] = el.dataset.k === "level" ? Number(el.dataset.v) : el.dataset.v; el.parentElement.querySelectorAll(".cb-chip").forEach(c => c.classList.toggle("on", c === el)); },
  "chess-invite": el => invite(el.dataset.id),
  "chess-cpu-start": () => { closeSheet(); startCpu(pick.level, pick.cpuColor); },
  "chess-cpu-resume": () => { closeSheet(); const s = cpuSaved(); if (s) openBoard({ kind: "cpu", level: s.level, color: s.color, moves: s.moves }); },
  "chess-open": el => openOnline(CH.games.find(g => g.id === el.dataset.id)),
  async "chess-answer"(el) {
    closeSheet();
    try {
      const g = await rpc("chess_answer", { p_id: el.dataset.id, p_ok: el.dataset.ok === "1" });
      upsertGame(g); refreshChessCard();
      if (g.status === "active") openOnline(g);
    } catch (e) { toast(e.message, "alert"); refreshChessCard(); }
  },
  async "chess-cancel"(el) {
    try { await rpc("chess_cancel", { p_id: el.dataset.id }); } catch { /* già scaduto */ }
    CH.waiting = null;
    const g = CH.games.find(x => x.id === el.dataset.id); if (g) g.status = "cancelled";
    if (!$("#game").hidden && !CH.view) closeGame();
    refreshChessCard();
  },
});

// Avvio: carica le partite quando l'app è pronta e collegata.
(function waitReady() {
  if (typeof ME !== "undefined" && ME && (!CLOUD || api.sb)) { chessLoad(); return; }
  setTimeout(waitReady, 400);
})();
