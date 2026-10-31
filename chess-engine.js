/* Capodanno - motore degli scacchi: regole complete (arrocco, en passant, promozione, scacco matto,
   stallo, patta per materiale, ripetizione e 50 mosse), notazione algebrica e un avversario al computer.
   Funziona sia nella pagina (window.Chess) sia dentro un Web Worker, così il computer pensa senza bloccare la grafica. */
(function (root) {
  "use strict";
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FILES = "abcdefgh";
  const isW = p => p >= "A" && p <= "Z";
  const sqName = s => FILES[s % 8] + (8 - Math.floor(s / 8));
  const sqIdx = n => (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]);
  const N_OFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const K_OFF = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function parse(fen = START) {
    const [pos, t, c, ep, h, n] = fen.split(" ");
    const b = [];
    for (const ch of pos.replace(/\//g, "")) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) b.push("");
      else b.push(ch);
    }
    return { b, t: t || "w", c: c && c !== "-" ? c : "", ep: ep && ep !== "-" ? sqIdx(ep) : -1, h: Number(h) || 0, n: Number(n) || 1 };
  }
  function fen(s, counters = true) {
    let out = "";
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = s.b[r * 8 + f];
        if (!p) { e++; continue; }
        if (e) { out += e; e = 0; }
        out += p;
      }
      if (e) out += e;
      if (r < 7) out += "/";
    }
    out += ` ${s.t} ${s.c || "-"} ${s.ep >= 0 ? sqName(s.ep) : "-"}`;
    return counters ? `${out} ${s.h} ${s.n}` : out;
  }

  // La casa sq è attaccata dal colore white (true/false)?
  function attacked(b, sq, white) {
    const r = Math.floor(sq / 8), f = sq % 8;
    const at = (rr, ff) => (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 ? b[rr * 8 + ff] : null);
    // Pedoni: un pedone bianco attacca verso l'alto (riga minore).
    const pr = white ? r + 1 : r - 1, pawn = white ? "P" : "p";
    if (at(pr, f - 1) === pawn || at(pr, f + 1) === pawn) return true;
    const kn = white ? "N" : "n", kg = white ? "K" : "k";
    for (const [dr, df] of N_OFF) if (at(r + dr, f + df) === kn) return true;
    for (const [dr, df] of K_OFF) if (at(r + dr, f + df) === kg) return true;
    const bq = white ? ["B", "Q"] : ["b", "q"], rq = white ? ["R", "Q"] : ["r", "q"];
    for (const [dr, df] of DIAG) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = b[rr * 8 + ff]; if (p) { if (bq.includes(p)) return true; break; } rr += dr; ff += df; }
    }
    for (const [dr, df] of ORTH) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = b[rr * 8 + ff]; if (p) { if (rq.includes(p)) return true; break; } rr += dr; ff += df; }
    }
    return false;
  }
  const kingSq = (b, white) => b.indexOf(white ? "K" : "k");
  const inCheck = s => { const k = kingSq(s.b, s.t === "w"); return k >= 0 && attacked(s.b, k, s.t !== "w"); };

  function pseudo(s) {
    const b = s.b, white = s.t === "w", out = [];
    const own = p => p && isW(p) === white, foe = p => p && isW(p) !== white;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!own(p)) continue;
      const r = Math.floor(sq / 8), f = sq % 8, kind = p.toLowerCase();
      const add = (to, extra) => out.push({ f: sq, t: to, x: b[to] || "", ...extra });
      if (kind === "p") {
        const dir = white ? -1 : 1, start = white ? 6 : 1, last = white ? 0 : 7;
        const one = sq + dir * 8;
        const pushPromo = (to, x) => { for (const pr of "qrbn") out.push({ f: sq, t: to, x: x || "", p: pr }); };
        if (r + dir >= 0 && r + dir < 8 && !b[one]) {
          if (r + dir === last) pushPromo(one); else add(one);
          const two = sq + dir * 16;
          if (r === start && !b[two]) add(two, { k: "d" });
        }
        for (const df of [-1, 1]) {
          const ff = f + df, rr = r + dir;
          if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
          const to = rr * 8 + ff;
          if (foe(b[to])) { if (rr === last) pushPromo(to, b[to]); else add(to); }
          else if (to === s.ep) out.push({ f: sq, t: to, x: white ? "p" : "P", k: "e" });
        }
      } else if (kind === "n" || kind === "k") {
        for (const [dr, df] of kind === "n" ? N_OFF : K_OFF) {
          const rr = r + dr, ff = f + df;
          if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
          const to = rr * 8 + ff;
          if (!own(b[to])) add(to);
        }
        if (kind === "k") {
          // Arrocco: diritti, case libere, re non sotto scacco e case di passaggio non attaccate.
          const home = white ? 60 : 4, rights = white ? ["K", "Q"] : ["k", "q"];
          if (sq === home && !attacked(b, home, !white)) {
            if (s.c.includes(rights[0]) && !b[home + 1] && !b[home + 2] && b[home + 3] === (white ? "R" : "r") && !attacked(b, home + 1, !white) && !attacked(b, home + 2, !white)) add(home + 2, { k: "c" });
            if (s.c.includes(rights[1]) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (white ? "R" : "r") && !attacked(b, home - 1, !white) && !attacked(b, home - 2, !white)) add(home - 2, { k: "c" });
          }
        }
      } else {
        const dirs = kind === "b" ? DIAG : kind === "r" ? ORTH : DIAG.concat(ORTH);
        for (const [dr, df] of dirs) {
          let rr = r + dr, ff = f + df;
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const to = rr * 8 + ff;
            if (own(b[to])) break;
            add(to);
            if (b[to]) break;
            rr += dr; ff += df;
          }
        }
      }
    }
    return out;
  }

  function make(s, m) {
    const b = s.b.slice(), p = b[m.f], white = isW(p);
    b[m.t] = m.p ? (white ? m.p.toUpperCase() : m.p) : p;
    b[m.f] = "";
    if (m.k === "e") b[m.t + (white ? 8 : -8)] = "";
    if (m.k === "c") {
      if (m.t > m.f) { b[m.f + 1] = b[m.f + 3]; b[m.f + 3] = ""; }
      else { b[m.f - 1] = b[m.f - 4]; b[m.f - 4] = ""; }
    }
    let c = s.c;
    if (p === "K") c = c.replace(/[KQ]/g, ""); else if (p === "k") c = c.replace(/[kq]/g, "");
    for (const sq of [m.f, m.t]) {
      if (sq === 63) c = c.replace("K", ""); if (sq === 56) c = c.replace("Q", "");
      if (sq === 7) c = c.replace("k", ""); if (sq === 0) c = c.replace("q", "");
    }
    return {
      b, t: white ? "b" : "w", c,
      ep: m.k === "d" ? (m.f + m.t) / 2 : -1,
      h: p.toLowerCase() === "p" || m.x ? 0 : s.h + 1,
      n: white ? s.n : s.n + 1,
    };
  }

  function legal(s) {
    const white = s.t === "w";
    return pseudo(s).filter(m => { const n = make(s, m); return !attacked(n.b, kingSq(n.b, white), !white); });
  }

  const toUci = m => sqName(m.f) + sqName(m.t) + (m.p || "");
  function fromUci(s, u) {
    return legal(s).find(m => toUci(m) === u) || null;
  }

  function insufficient(b) {
    const ps = b.filter(p => p && p.toLowerCase() !== "k");
    if (!ps.length) return true;
    if (ps.length === 1 && "nNbB".includes(ps[0])) return true;
    // Solo alfieri, tutti sullo stesso colore di casa.
    if (ps.every(p => "bB".includes(p))) {
      const colors = new Set(b.map((p, i) => (p && "bB".includes(p) ? (Math.floor(i / 8) + i % 8) % 2 : -1)).filter(x => x >= 0));
      return colors.size === 1;
    }
    return false;
  }

  // Stato della partita dato l'elenco delle posizioni attraversate (per la ripetizione).
  function outcome(s, keys = []) {
    const moves = legal(s);
    if (!moves.length) return inCheck(s) ? { result: s.t === "w" ? "0-1" : "1-0", reason: "matto" } : { result: "1/2-1/2", reason: "stallo" };
    if (insufficient(s.b)) return { result: "1/2-1/2", reason: "materiale" };
    if (s.h >= 100) return { result: "1/2-1/2", reason: "50 mosse" };
    const k = fen(s, false);
    if (keys.filter(x => x === k).length >= 3) return { result: "1/2-1/2", reason: "ripetizione" };
    return null;
  }

  function san(s, m, all = legal(s)) {
    const p = s.b[m.f], kind = p.toUpperCase();
    let out;
    if (m.k === "c") out = m.t > m.f ? "O-O" : "O-O-O";
    else {
      const cap = m.x ? "x" : "";
      if (kind === "P") out = (cap ? FILES[m.f % 8] : "") + cap + sqName(m.t) + (m.p ? "=" + m.p.toUpperCase() : "");
      else {
        const rivals = all.filter(o => o.t === m.t && o.f !== m.f && s.b[o.f] === p);
        let dis = "";
        if (rivals.length) {
          const sameFile = rivals.some(o => o.f % 8 === m.f % 8), sameRank = rivals.some(o => Math.floor(o.f / 8) === Math.floor(m.f / 8));
          dis = !sameFile ? FILES[m.f % 8] : !sameRank ? String(8 - Math.floor(m.f / 8)) : sqName(m.f);
        }
        out = kind + dis + cap + sqName(m.t);
      }
    }
    const n = make(s, m);
    if (inCheck(n)) out += legal(n).length ? "+" : "#";
    return out;
  }

  // Ripercorre una lista di mosse UCI: posizioni, notazione e ultimo stato.
  function replay(uciList, startFen = START) {
    let s = parse(startFen);
    const keys = [fen(s, false)], sans = [], states = [s];
    for (const u of uciList) {
      const all = legal(s), m = all.find(x => toUci(x) === u);
      if (!m) break;
      sans.push(san(s, m, all));
      s = make(s, m);
      states.push(s); keys.push(fen(s, false));
    }
    return { s, keys, sans, states };
  }

  // ───────────────────────── Computer ─────────────────────────
  const VAL = { p: 100, n: 320, b: 335, r: 500, q: 950, k: 0 };
  // Tabelle posizionali dal punto di vista del bianco (riga 0 = ottava traversa).
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 60, 60, 60, 60, 60, 60, 60, 60, 12, 14, 22, 30, 30, 22, 14, 12, 6, 8, 12, 24, 24, 12, 8, 6, 2, 3, 6, 20, 20, 6, 3, 2, 4, 0, -4, 4, 4, -4, 0, 4, 4, 8, 8, -16, -16, 8, 8, 4, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -38, -30, -30, -30, -30, -38, -50, -38, -18, 0, 2, 2, 0, -18, -38, -30, 2, 12, 16, 16, 12, 2, -30, -30, 6, 16, 22, 22, 16, 6, -30, -30, 2, 16, 22, 22, 16, 2, -30, -30, 6, 12, 16, 16, 12, 6, -30, -38, -18, 0, 6, 6, 0, -18, -38, -50, -36, -30, -30, -30, -30, -36, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 6, 10, 10, 6, 0, -10, -10, 6, 6, 10, 10, 6, 6, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 6, 0, 0, 0, 0, 6, -10, -20, -10, -12, -10, -10, -12, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 6, 12, 12, 12, 12, 12, 12, 6, -4, 0, 0, 0, 0, 0, 0, -4, -4, 0, 0, 0, 0, 0, 0, -4, -4, 0, 0, 0, 0, 0, 0, -4, -4, 0, 0, 0, 0, 0, 0, -4, -4, 0, 0, 0, 0, 0, 0, -4, 0, 0, 2, 6, 6, 2, 0, 0],
    q: [-20, -10, -10, -4, -4, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 4, 4, 4, 4, 0, -10, -4, 0, 4, 4, 4, 4, 0, -4, 0, 0, 4, 4, 4, 4, 0, -4, -10, 4, 4, 4, 4, 4, 0, -10, -10, 0, 4, 0, 0, 0, 0, -10, -20, -10, -10, -4, -4, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 16, 16, 0, -4, -4, 0, 16, 16, 20, 30, 14, 0, 0, 10, 32, 20],
    ke: [-50, -36, -30, -20, -20, -30, -36, -50, -30, -16, -6, 0, 0, -6, -16, -30, -30, -6, 20, 30, 30, 20, -6, -30, -30, -6, 30, 40, 40, 30, -6, -30, -30, -6, 30, 40, 40, 30, -6, -30, -30, -6, 20, 30, 30, 20, -6, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  function evaluate(s) {
    let score = 0, heavy = 0;
    for (const p of s.b) if (p && "qQrRbBnN".includes(p)) heavy += VAL[p.toLowerCase()];
    const endgame = heavy <= 1600;
    for (let i = 0; i < 64; i++) {
      const p = s.b[i]; if (!p) continue;
      const k = p.toLowerCase(), w = isW(p);
      const idx = w ? i : (7 - Math.floor(i / 8)) * 8 + (i % 8);
      const v = VAL[k] + (k === "k" && endgame ? PST.ke : PST[k])[idx];
      score += w ? v : -v;
    }
    return s.t === "w" ? score : -score;
  }
  const MATE = 100000;
  function order(ms) {
    return ms.sort((a, b) => ((b.x ? VAL[b.x.toLowerCase()] * 10 : 0) + (b.p ? 800 : 0)) - ((a.x ? VAL[a.x.toLowerCase()] * 10 : 0) + (a.p ? 800 : 0)));
  }
  function think(fenStr, opts = {}) {
    const level = opts.level || 2, keys = opts.keys || [];
    const root = parse(fenStr);
    const deadline = Date.now() + (level === 1 ? 150 : level === 2 ? 600 : 1500);
    const maxDepth = level === 1 ? 1 : level === 2 ? 3 : 5;
    let nodes = 0, stop = false;
    const quiesce = (s, alpha, beta, qd) => {
      const stand = evaluate(s);
      if (stand >= beta) return beta;
      if (alpha < stand) alpha = stand;
      if (qd > 4) return alpha;
      const white = s.t === "w";
      for (const m of order(pseudo(s).filter(m => m.x))) {
        const n = make(s, m);
        if (attacked(n.b, kingSq(n.b, white), !white)) continue;
        const sc = -quiesce(n, -beta, -alpha, qd + 1);
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    };
    const search = (s, depth, alpha, beta, ply) => {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const ms = legal(s);
      if (!ms.length) return inCheck(s) ? -MATE + ply : 0;
      if (s.h >= 100 || insufficient(s.b)) return 0;
      if (depth <= 0) return quiesce(s, alpha, beta, 0);
      for (const m of order(ms)) {
        const sc = -search(make(s, m), depth - 1, -beta, -alpha, ply + 1);
        if (stop) return 0;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    };
    let rootMoves = order(legal(root));
    if (!rootMoves.length) return null;
    // Evita di ripetere la posizione quando è in vantaggio.
    const repeats = m => keys.includes(fen(make(root, m), false));
    let best = rootMoves[0], bestScores = [];
    for (let d = 1; d <= maxDepth; d++) {
      const scored = [];
      let alpha = -Infinity;
      for (const m of rootMoves) {
        let sc = -search(make(root, m), d - 1, -Infinity, -alpha, 1);
        if (stop) break;
        if (repeats(m) && evaluate(root) > 50) sc -= 30;
        scored.push({ m, sc });
        if (sc > alpha) alpha = sc;
      }
      if (stop && scored.length < rootMoves.length) break;
      scored.sort((a, b) => b.sc - a.sc);
      bestScores = scored; best = scored[0].m;
      rootMoves = scored.map(x => x.m);
      if (Math.abs(scored[0].sc) > MATE - 100) break;
    }
    // Livello facile: a volte sceglie una mossa decente ma non la migliore.
    if (level === 1 && bestScores.length > 2) {
      const pool = bestScores.filter(x => x.sc > bestScores[0].sc - 120).slice(0, 4);
      best = pool[Math.floor(Math.random() * pool.length)].m;
    }
    return toUci(best);
  }

  const api = { START, parse, fen, legal, make, inCheck, outcome, san, replay, toUci, fromUci, sqName, sqIdx, isW, think, attacked, pseudo };
  root.Chess = api;
  // Dentro un Web Worker: risponde con la mossa del computer.
  if (typeof window === "undefined" && typeof self !== "undefined" && typeof module === "undefined") {
    self.onmessage = e => { const { id, fen: f, level, keys } = e.data; self.postMessage({ id, uci: think(f, { level, keys }) }); };
  }
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
