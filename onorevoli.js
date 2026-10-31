/* Capodanno - Onorevoli: lotta a turni tra politici e giornalisti italiani, con le loro frasi celebri come mosse.
   Satira, non cronaca. Un solo motore per la sfida online (tabella «duels») e per la campagna contro il telefono:
   lo stato nasce dalle mosse e dal seme della partita, così i due telefoni vedono esattamente la stessa cosa.
   Novità: mossa speciale di ogni personaggio (si carica con il «Favore popolare»), panchina chiara, scheda di ogni
   onorevole, vantaggi di tipo in vista, cronaca della seduta più lenta e resoconto finale. */
"use strict";

// Mossa speciale di ognuno: [nome, potenza]. Si sblocca quando il Favore popolare arriva al 100%.
const SPECIAL = {
  berlusconi: ["La discesa in campo", 88], meloni: ["Sono una donna, sono una madre", 86], salvini: ["La citofonata", 86],
  renzi: ["Il 40 per cento", 86], conte: ["Reti unificate", 84], schlein: ["Il cambio di passo", 84], grillo: ["Il Vaffa Day", 90],
  dimaio: ["Dallo stadio alla Farnesina", 84], bersani: ["La mucca nel corridoio", 86], andreotti: ["Belzebù", 88],
  sgarbi: ["La rissa in studio", 88], draghi: ["Il bazooka", 90], mentana: ["La maratona elettorale", 86], vespa: ["Il plastico definitivo", 84],
  travaglio: ["L'intercettazione", 88], dipietro: ["Il tintinnar di manette", 86], prodi: ["La Commissione Europea", 84], fornero: ["Lacrime e sangue", 86],
};
const EFF_TXT = { heal: "Recupera consenso", "atk+": "Aumenta la forza", "def+": "Aumenta la difesa", "def-": "Abbassa la difesa avversaria", "atk-": "Abbassa la forza avversaria" };
const LOSES = Object.fromEntries(Object.entries(BEATS).map(([a, b]) => [b, a])); // chi batte me
const typeMult = (a, d) => (BEATS[a] === d ? 1.5 : BEATS[d] === a ? 0.67 : 1);
const onoF = (p, lv = 1) => ({ id: p.id, n: p.n, t: p.t, atk: p.atk, def: p.def, spd: p.spd, m: p.m, max: Math.round(p.hp * lv), cur: Math.round(p.hp * lv), atkB: 0, defB: 0, stun: false, lv, meter: 0, dealt: 0, kos: 0 });
const ONO_SPEED_KEY = "capodanno-ono-veloce";

// ───────── Motore (deterministico) ─────────
function onoHit(st, s, mv, rnd, ev) {
  const o = 1 - s, att = st.team[s][st.act[s]], def = st.team[o][st.act[o]];
  const [name, pow, acc, eff] = mv;
  ev.push({ say: name, by: att.n, side: s, special: eff === "special" });
  if (att.stun) { att.stun = false; ev.push({ log: `${att.n} è stato zittito: non riesce a parlare.` }); return; }
  if (rnd() * 100 > acc) { ev.push({ log: "Nessuno se n'è accorto. Mossa a vuoto." }); return; }
  if (eff === "heal") { const h = Math.round(att.max * 0.3); const was = att.cur; att.cur = Math.min(att.max, att.cur + h); ev.push({ heal: att.cur - was, side: s, log: `${att.n} recupera ${att.cur - was} di consenso.` }); return; }
  if (eff === "atk+" || eff === "def+") { att[eff === "atk+" ? "atkB" : "defB"] = Math.min(3, att[eff === "atk+" ? "atkB" : "defB"] + 1); ev.push({ log: `${att.n} ${eff === "atk+" ? "si carica: più forza" : "si blinda: più difesa"}.` }); return; }
  if (eff === "def-" || eff === "atk-") { def[eff === "def-" ? "defB" : "atkB"] = Math.max(-3, def[eff === "def-" ? "defB" : "atkB"] - 1); ev.push({ log: `${def.n} ${eff === "def-" ? "abbassa la guardia" : "perde mordente"}.` }); return; }
  let mult = typeMult(att.t, def.t); if (eff === "special") mult = Math.max(1, mult);
  let tot = 0;
  for (let k = 0; k < (eff === "multi" ? 3 : 1); k++) {
    const a = att.atk * att.lv * (1 + 0.25 * att.atkB), d = def.def * def.lv * (1 + 0.25 * def.defB);
    const crit = eff !== "special" && rnd() < 0.08;
    const dmg = Math.max(1, Math.round(pow * a / d * mult * (0.85 + rnd() * 0.3) * 0.55 * (crit ? 1.5 : 1)));
    def.cur -= dmg; tot += dmg; att.dealt += dmg;
    ev.push({ dmg, side: o, crit, mult });
  }
  // Il Favore popolare sale a chi colpisce e, un po', a chi incassa.
  if (eff !== "special") att.meter = Math.min(100, att.meter + Math.round(tot / def.max * 100 * 0.9) + 6);
  def.meter = Math.min(100, def.meter + Math.round(tot / def.max * 100 * 0.45));
  if (eff === "stun" && def.cur > 0 && rnd() < 0.35) def.stun = true;
  ev.push({ log: `${mult > 1 ? "Colpo superefficace! " : mult < 1 ? "Poco efficace. " : ""}${def.n} perde ${tot} di consenso${def.stun ? " ed è zittito per un turno" : ""}.` });
}
function onoApply(st, a, rnd, names) {
  const ev = [];
  if (a.pick) { if (!st.team[a.s]) st.team[a.s] = a.pick.map(id => POLS.find(p => p.id === id)).filter(Boolean).map(p => onoF(p, a.lv || 1)); return ev; }
  if (st.over || !st.team[0] || !st.team[1]) return ev;
  const s = a.s, o = 1 - s;
  if (a.quit) { st.over = true; st.winner = o; ev.push({ log: `${names[s]} abbandona l'aula.` }); return ev; }
  const att = st.team[s][st.act[s]];
  if (a.sw != null) {
    const f = st.team[s][a.sw];
    if (f && f.cur > 0 && a.sw !== st.act[s]) { st.act[s] = a.sw; att.stun = false; ev.push({ enter: s, log: `${names[s]} richiama ${att.n} e manda in aula ${f.n}.` }); }
  } else if (a.sp) {
    if (att.meter >= 100) { att.meter = 0; onoHit(st, s, [SPECIAL[att.id][0], SPECIAL[att.id][1], 100, "special"], rnd, ev); }
  } else if (att.m[a.mv]) onoHit(st, s, att.m[a.mv], rnd, ev);
  const def = st.team[o][st.act[o]];
  if (def.cur <= 0) {
    def.cur = 0; att.kos++;
    ev.push({ ko: o, log: `${def.n} lascia l'aula.` });
    const nb = st.team[o].findIndex(f => f.cur > 0);
    if (nb < 0) { st.over = true; st.winner = s; }
    else { st.act[o] = nb; ev.push({ enter: o, log: `Entra in aula ${st.team[o][nb].n}.` }); }
  }
  return ev;
}
function onoReplay(game, names, upto = game.actions.length) {
  const st = { team: [null, null], act: [0, 0], over: false, winner: null, ev: [], n: 0 };
  game.actions.slice(0, upto).forEach((a, k) => { st.ev = onoApply(st, a, seededRand(((Number(game.seed) || 1) + k * 7919) >>> 0), names); st.n = k + 1; });
  st.ready = !!(st.team[0] && st.team[1]);
  st.turn = st.n % 2;
  if (!st.over && game.status === "over" && game.result?.winner != null) { st.over = true; st.winner = game.result.winner; if (game.result.quit) st.ev = [{ log: `${names[1 - game.result.winner]} ha lasciato l'aula.` }]; }
  return st;
}
// Il telefono sceglie: speciale se pronta, cambio se svantaggiato, altrimenti la mossa migliore.
function onoCpu(st, s, smart) {
  const f = st.team[s][st.act[s]], foe = st.team[1 - s][st.act[1 - s]];
  if (f.meter >= 100) return { sp: 1 };
  if (smart && typeMult(f.t, foe.t) < 1 && f.cur / f.max > 0.25 && Math.random() < 0.55) {
    const i = st.team[s].findIndex((x, j) => j !== st.act[s] && x.cur > x.max * 0.35 && typeMult(x.t, foe.t) > 1);
    if (i >= 0) return { sw: i };
  }
  const opts = f.m.map((m, i) => {
    let v = m[1] * typeMult(f.t, foe.t) * (m[2] / 100) * (m[3] === "multi" ? 3 : 1);
    if (m[3] === "heal") v = f.cur / f.max < 0.4 ? 75 : 4;
    if (["atk+", "def+"].includes(m[3])) v = f.cur / f.max > 0.7 && f[m[3] === "atk+" ? "atkB" : "defB"] < 2 ? 34 : 6;
    if (["atk-", "def-"].includes(m[3])) v = 26;
    if (m[3] === "stun") v += foe.stun ? -10 : 12;
    if (m[1] && foe.cur <= m[1] * 0.4) v += 30; // può chiuderla
    return { i, v: v * (smart ? 0.9 + Math.random() * 0.2 : 0.6 + Math.random() * 0.8) };
  });
  return { mv: opts.sort((x, y) => y.v - x.v)[0].i };
}

// ───────── Interfaccia ─────────
const statBar = (label, v, max = 70) => `<div class="on-stat"><span>${label}</span><i><b style="width:${Math.min(100, Math.round(v / max * 100))}%"></b></i><em>${v}</em></div>`;
const typeChip = t => `<span class="on-type" style="--c:${TYPES[t].c}">${TYPES[t].n}</span>`;
function polSheetHtml(p, inTeam, canAdd) {
  return `<div class="on-card-big">
    <div class="row" style="gap:16px;align-items:center">${polFace(p, "xl")}<div class="grow"><div class="on-name big">${esc(p.n)}</div>${typeChip(p.t)}
      <div class="tiny faint" style="margin-top:6px">Forte contro ${TYPES[BEATS[p.t]].n} · debole contro ${TYPES[LOSES[p.t]].n}</div></div></div>
    <div class="on-stats">${statBar("Consenso", p.hp, 115)}${statBar("Forza", p.atk)}${statBar("Difesa", p.def)}${statBar("Rapidità", p.spd)}</div>
    <div class="on-mlist">${p.m.map(m => `<div><b>«${esc(m[0])}»</b><span>${m[1] ? `${m[3] === "multi" ? "3 colpi da " : "Attacco, potenza "}${m[1]}${m[3] === "stun" ? ", può zittire" : ""}` : EFF_TXT[m[3]]} · precisione ${m[2]}%</span></div>`).join("")}
      <div class="sp"><b>Speciale: «${esc(SPECIAL[p.id][0])}»</b><span>Potenza ${SPECIAL[p.id][1]}, non sbaglia mai. Si sblocca col Favore popolare al 100%.</span></div></div>
    <div class="actions"><button class="btn" data-on="sheet-close">Chiudi</button>${inTeam ? `<button class="btn" data-on="sheet-toggle" data-id="${p.id}">Togli dalla squadra</button>` : `<button class="btn primary" data-on="sheet-toggle" data-id="${p.id}" ${canAdd ? "" : "disabled"}>${canAdd ? "Prendi in squadra" : "Squadra piena"}</button>`}</div></div>`;
}
const ONO_RULES = `<div class="on-rules"><b>Come si gioca</b>
  <p>Tre onorevoli a testa. A turno scegli una frase celebre (la mossa) oppure cambi onorevole: anche il cambio usa il turno.</p>
  <p><b>Tipi.</b> La Satira batte il Carisma, il Carisma batte il Populismo, il Populismo batte la Tecnocrazia, la Tecnocrazia batte la Satira: colpi ×1,5 se sei in vantaggio, ×0,67 se sei in svantaggio.</p>
  <p><b>Favore popolare.</b> Sale quando colpisci e quando incassi. Al 100% sblocca la mossa speciale del personaggio: fortissima e infallibile.</p>
  <p><b>Zittito.</b> Alcune mosse possono zittire: chi è zittito salta la prossima frase. Ogni tanto arriva un colpo critico.</p>
  <p>Vince chi resta in aula. Tocca la cronaca per far scorrere più in fretta.</p></div>`;

function playOnorevoli() { playOno({ cpu: true, round: 1, score: 0 }); }

function playOno(opts) {
  loadPolFaces();
  const online = !!opts.online;
  let game = online ? opts.online : { id: null, players: [ME, "cpu"], seed: Math.floor(Math.random() * 2147483647), actions: [], status: "active" };
  const mySeat = online ? game.players.indexOf(ME) : 0, oSeat = 1 - mySeat;
  const names = online ? game.players.map(id => mname(id)) : ["Tu", "Il telefono"];
  names[mySeat] = "Tu";
  const round = opts.round || 1, lvFoe = 1 + (round - 1) * 0.12;
  let shown = 0, playing = false, pending = false, team = opts.team ? [...opts.team] : [], benchOpen = false, skip = null, cpuT = null, finished = false;
  if (!online && opts.team) game.actions.push({ pick: opts.team, s: 0 });

  openGame(`
    <div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Onorevoli</div><div class="tiny faint">${online ? `Sfida con ${esc(mname(game.players[oSeat]))}` : `Campagna · legislatura ${round}${opts.score ? ` · ${opts.score} punti` : ""}`}</div></div>
      <button class="btn icon sm" id="on-help" aria-label="Regole">?</button></div>
    <div id="on-body"></div><div id="on-sheet" class="on-sheet" hidden></div>`);
  const body = $("#on-body"), sheet = $("#on-sheet");
  const fast = () => storage.get(ONO_SPEED_KEY) === "1";
  const wait = ms => new Promise(r => { const t = setTimeout(r, fast() ? ms * 0.45 : ms); skip = () => { clearTimeout(t); r(); }; });
  const openSheetIn = html => { sheet.innerHTML = `<div class="on-sheet-in">${html}</div>`; sheet.hidden = false; };
  const closeSheetIn = () => { sheet.hidden = true; sheet.innerHTML = ""; };
  $("#on-help").addEventListener("click", () => openSheetIn(`${ONO_RULES}<label class="on-fast"><input type="checkbox" id="on-fast" ${fast() ? "checked" : ""}> Cronaca veloce</label><div class="actions">${online ? `<button class="btn" data-on="quit">Abbandona la sfida</button>` : ""}<button class="btn primary" data-on="sheet-close">Ho capito</button></div>`));
  sheet.addEventListener("change", e => { if (e.target.id === "on-fast") storage.set(ONO_SPEED_KEY, e.target.checked ? "1" : "0"); });
  sheet.addEventListener("click", e => {
    const b = e.target.closest("[data-on]"); if (!b) { if (e.target === sheet) closeSheetIn(); return; }
    if (b.dataset.on === "sheet-close") closeSheetIn();
    if (b.dataset.on === "quit") { closeSheetIn(); duRpc("duel_finish", { p_id: game.id, p_result: { winner: oSeat, quit: true } }).then(r => { duUpsert(r); update(r); }).catch(err => toast(err.message, "alert")); }
    if (b.dataset.on === "sheet-toggle") { const id = b.dataset.id; team = team.includes(id) ? team.filter(x => x !== id) : team.length < 3 ? [...team, id] : team; closeSheetIn(); paintPick(); }
  });

  // ── Scelta della squadra ──
  const paintPick = () => {
    body.innerHTML = `<div class="on-pick-head">
        <div class="on-slots">${[0, 1, 2].map(i => { const p = POLS.find(x => x.id === team[i]); return p ? `<button class="on-slot full" data-sheet="${p.id}">${polFace(p)}<span>${esc(p.n.split(" ").slice(-1)[0])}</span></button>` : `<div class="on-slot"><span>${i + 1}</span></div>`; }).join("")}</div>
        <div class="tiny faint" style="text-align:center;margin-top:8px">Tocca un onorevole per la sua scheda. Mischia i tipi: ognuno ne batte uno.</div></div>
      <div class="pol-grid" id="ono-pick">${POLS.map(p => `<button data-sheet="${p.id}" class="${team.includes(p.id) ? "on" : ""}">${polCard(p)}</button>`).join("")}</div>
      <div class="on-pick-bar"><button class="btn" id="on-rand">${ico("swap", 16)}A caso</button><button class="btn pearl grow" id="ono-go" ${team.length === 3 && !pending ? "" : "disabled"}>${team.length === 3 ? "In aula!" : `Scegli tre onorevoli (${team.length}/3)`}</button></div>`;
    body.querySelectorAll("[data-sheet]").forEach(b => b.addEventListener("click", () => { const p = POLS.find(x => x.id === b.dataset.sheet); openSheetIn(polSheetHtml(p, team.includes(p.id), team.length < 3)); }));
    $("#on-rand").addEventListener("click", () => { const pool = [...POLS].sort(() => Math.random() - 0.5); const out = []; for (const t of ["S", "C", "P", "T"].sort(() => Math.random() - 0.5)) { if (out.length < 3) out.push(pool.find(p => p.t === t).id); } team = out; paintPick(); });
    $("#ono-go").addEventListener("click", () => { if (team.length === 3 && !pending) commit({ pick: team }); });
  };

  // ── Arena ──
  const tags = f => `${f.stun ? `<span class="on-tag warn">zittito</span>` : ""}${f.atkB ? `<span class="on-tag">forza ${f.atkB > 0 ? "+" : ""}${f.atkB}</span>` : ""}${f.defB ? `<span class="on-tag">difesa ${f.defB > 0 ? "+" : ""}${f.defB}</span>` : ""}`;
  const side = (f, teamArr, isFoe, who) => {
    const pct = Math.max(0, f.cur / f.max);
    return `<div class="on-side ${isFoe ? "foe" : "me"}" id="on-${isFoe ? "foe" : "me"}">
      ${polFace(f, "big")}
      <div class="on-info"><div class="on-who">${esc(who)} <span class="on-dots">${teamArr.map(x => `<i class="${x.cur > 0 ? "" : "out"}"></i>`).join("")}</span></div>
        <div class="on-name">${esc(f.n)}</div><div class="on-tags">${typeChip(f.t)}${tags(f)}</div>
        <div class="hp"><i style="width:${pct * 100}%;background:${pct > 0.5 ? "#7ee2b8" : pct > 0.2 ? "#ffc978" : "#ff8f8f"}"></i></div>
        <div class="on-row"><span>Consenso <b>${Math.max(0, f.cur)}</b>/${f.max}</span><span class="on-fav ${f.meter >= 100 ? "full" : ""}">Favore ${f.meter}%</span></div>
        <div class="on-meter"><i style="width:${f.meter}%"></i></div></div></div>`;
  };
  const matchup = (me1, foe) => {
    const m = typeMult(me1.t, foe.t);
    return m > 1 ? `<div class="on-match good">Vantaggio: il tuo ${TYPES[me1.t].n} batte il suo ${TYPES[foe.t].n} · colpi ×1,5</div>`
      : m < 1 ? `<div class="on-match bad">Svantaggio: il suo ${TYPES[foe.t].n} batte il tuo ${TYPES[me1.t].n} · colpi ×0,67. Valuta un cambio.</div>`
      : `<div class="on-match">Nessun vantaggio di tipo</div>`;
  };
  let history = [];
  const pushLog = (txt, cls = "") => { history.unshift({ txt, cls }); history = history.slice(0, 5); const el = $("#on-log"); if (!el) return; el.innerHTML = `<div class="on-now ${cls}">${txt}</div>${history.slice(1, 4).map(h => `<div class="on-old">${h.txt}</div>`).join("")}`; const now = el.querySelector(".on-now"); now.classList.add("pop"); };
  const paintArena = st => {
    if (!body.querySelector("#on-arena")) {
      body.innerHTML = `<div id="on-arena"><div id="on-turn" class="on-turn"></div><div id="on-foe-w"></div><div id="on-log" class="on-log" title="Tocca per andare avanti"></div><div id="on-me-w"></div><div id="on-match-w"></div><div id="on-act"></div><div id="on-end"></div></div>`;
      $("#on-log").addEventListener("click", () => skip?.());
      $("#game").scrollTop = 0;
      if (history.length) pushLog(history[0].txt);
      else pushLog("Si apre la seduta.");
    }
    const me1 = st.team[mySeat][st.act[mySeat]], foe = st.team[oSeat][st.act[oSeat]];
    $("#on-foe-w").innerHTML = side(foe, st.team[oSeat], true, names[oSeat]);
    $("#on-me-w").innerHTML = side(me1, st.team[mySeat], false, "Tu");
    const myTurn = !st.over && st.turn === mySeat && !pending && !playing;
    const turnEl = $("#on-turn");
    turnEl.className = `on-turn ${st.over ? "" : myTurn ? "mine" : "theirs"}`;
    turnEl.innerHTML = st.over ? "Seduta chiusa" : playing ? "In aula si parla…" : myTurn ? "Tocca a te: scegli una frase o cambia onorevole" : online ? `Tocca a ${esc(names[oSeat])}…` : "Il telefono ci pensa…";
    $("#on-match-w").innerHTML = st.over ? "" : matchup(me1, foe);
    const act = $("#on-act");
    if (st.over) { act.innerHTML = ""; return; }
    if (benchOpen) {
      act.innerHTML = `<div class="on-bench"><div class="on-bench-h"><b>Cambia onorevole</b><span>Il cambio usa il turno: l'avversario poi colpisce chi entra.</span></div>
        ${st.team[mySeat].map((f, i) => { const here = i === st.act[mySeat], out = f.cur <= 0, m = typeMult(f.t, foe.t);
          return `<button class="on-bench-row" data-sw="${i}" ${here || out || !myTurn ? "disabled" : ""}>${polFace(f, "mid")}<div class="grow"><div class="t">${esc(f.n)} ${here ? `<span class="on-tag">in aula</span>` : out ? `<span class="on-tag warn">fuori</span>` : ""}</div>
            <div class="on-tags">${typeChip(f.t)}${!out && !here ? `<span class="on-tag ${m > 1 ? "good" : m < 1 ? "warn" : ""}">${m > 1 ? "in vantaggio" : m < 1 ? "in svantaggio" : "alla pari"}</span>` : ""}</div>
            <div class="hp sm"><i style="width:${f.cur / f.max * 100}%"></i></div></div><span class="on-in">${here || out ? "" : "Fai entrare"}</span></button>`; }).join("")}
        <button class="btn block" data-on-act="back">Torna alle frasi</button></div>`;
    } else {
      const m = typeMult(me1.t, foe.t), ready = me1.meter >= 100;
      act.innerHTML = `<div class="ar-moves">${me1.m.map((mv, i) => `<button data-mv="${i}" ${myTurn ? "" : "disabled"} style="--c:${TYPES[me1.t].c}"><b>«${esc(mv[0])}»</b>
          <span>${mv[1] ? `${mv[3] === "multi" ? "3 colpi · " : ""}potenza ${mv[1]}${mv[3] === "stun" ? " · può zittire" : ""}` : EFF_TXT[mv[3]]} · ${mv[2]}%</span>${mv[1] && m !== 1 ? `<em class="${m > 1 ? "good" : "bad"}">${m > 1 ? "superefficace" : "poco efficace"}</em>` : ""}</button>`).join("")}</div>
        <button class="on-sp ${ready ? "ready" : ""}" data-sp="1" ${ready && myTurn ? "" : "disabled"}><span>Mossa speciale</span><b>«${esc(SPECIAL[me1.id][0])}»</b><i>${ready ? "Pronta!" : `Favore popolare ${me1.meter}%`}</i></button>
        <button class="on-switch" data-on-act="bench" ${myTurn ? "" : "disabled"}>${ico("swap", 18)}<span><b>Cambia onorevole</b><small>${st.team[mySeat].filter((f, i) => i !== st.act[mySeat] && f.cur > 0).length} in panchina · usa il turno</small></span></button>`;
    }
  };
  body.addEventListener("click", e => {
    const st = onoReplay(game, names);
    if (e.target.closest("[data-on-act=bench]")) { benchOpen = true; return paintArena(st); }
    if (e.target.closest("[data-on-act=back]")) { benchOpen = false; return paintArena(st); }
    if (!st.ready || st.over || st.turn !== mySeat || pending || playing) return;
    const mv = e.target.closest("[data-mv]"), sw = e.target.closest("[data-sw]"), sp = e.target.closest("[data-sp]");
    if (mv) commit({ mv: Number(mv.dataset.mv) });
    else if (sp) commit({ sp: 1 });
    else if (sw) { benchOpen = false; commit({ sw: Number(sw.dataset.sw) }); }
  });

  // ── Racconto delle mosse, una alla volta, con il tempo di leggere ──
  const flash = (side_, cls) => { const el = $(side_ === mySeat ? "#on-me" : "#on-foe"); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const playEvents = async (ev, stBefore) => {
    for (const e of ev) {
      if (!$("#on-log")) return;
      if (e.say) {
        pushLog(`<span class="who">${esc(e.by)}</span>${e.special ? `<span class="spk">MOSSA SPECIALE</span>` : ""}«${esc(e.say)}»`, e.special ? "special" : "");
        if (e.special) flash(e.side, "charge");
        await wait(e.special ? 1900 : 1500);
      } else if (e.dmg) {
        const el = $(e.side === mySeat ? "#on-me" : "#on-foe");
        if (el) { flash(e.side, "hit"); const fl = document.createElement("div"); fl.className = `dmg ${e.crit ? "crit" : ""}`; fl.textContent = `−${e.dmg}${e.crit ? " critico" : ""}`; el.appendChild(fl); setTimeout(() => fl.remove(), 1200); }
        // la barra scende subito, così si vede il colpo
        const f = stBefore.team[e.side][stBefore.act[e.side]]; f.cur = Math.max(0, f.cur - e.dmg); paintSideOnly(stBefore);
        navigator.vibrate?.(e.crit ? 30 : 12); await wait(750);
      } else if (e.ko != null) { flash(e.ko, "ko"); pushLog(e.log, "ko"); await wait(1800); }
      else if (e.log) { pushLog(e.log); await wait(e.enter != null ? 1700 : 1700); }
    }
  };
  const paintSideOnly = st => {
    const me1 = st.team[mySeat][st.act[mySeat]], foe = st.team[oSeat][st.act[oSeat]];
    $("#on-foe-w").innerHTML = side(foe, st.team[oSeat], true, names[oSeat]);
    $("#on-me-w").innerHTML = side(me1, st.team[mySeat], false, "Tu");
  };
  const advance = async () => {
    if (playing) return; playing = true;
    try {
      while (shown < game.actions.length) {
        const before = onoReplay(game, names, shown);
        const after = onoReplay(game, names, shown + 1);
        shown++;
        if (!after.ready) continue;
        if (!before.ready) { paintArena(after); continue; } // le scelte delle squadre non si raccontano
        paintArena(before);
        await playEvents(after.ev, before);
      }
    } finally { playing = false; }
    paint();
  };
  const paint = () => {
    const st = onoReplay(game, names);
    if (!st.team[mySeat]) return paintPick();
    if (!st.ready) {
      body.innerHTML = `<div class="duel-wait">${online ? avatar(member(game.players[oSeat]), "lg") : ""}<div class="serif" style="font-size:28px;margin-top:16px">${online ? `${esc(names[oSeat])} sceglie la squadra…` : "Il telefono sceglie…"}</div>
        <div class="pol-grid" style="grid-template-columns:repeat(3,1fr)">${st.team[mySeat].map(f => polCard(f)).join("")}</div></div>`;
      return;
    }
    paintArena(st);
    if (st.over) finish(st); else if (!online && st.turn === oSeat && !playing) cpuPlay();
  };
  const cpuPlay = () => {
    clearTimeout(cpuT);
    cpuT = setTimeout(() => { const st = onoReplay(game, names); if (st.over || st.turn !== oSeat || playing) return; game.actions.push({ ...onoCpu(st, oSeat, round > 1 || Math.random() < 0.5), s: oSeat }); advance(); }, 900);
  };
  const commit = async a => {
    if (online) {
      pending = true; paint();
      try { const row = await duRpc("duel_act", { p_id: game.id, p_ply: a.pick ? null : game.actions.length, p_action: a }); duUpsert(row); pending = false; update(row); }
      catch (e) { pending = false; toast(e.message, "alert"); const { data } = await api.sb.from("duels").select("*").eq("id", game.id).maybeSingle(); if (data) update(data); else paint(); }
      return;
    }
    game.actions.push({ ...a, s: mySeat });
    if (a.pick) {
      const pool = POLS.filter(p => !a.pick.includes(p.id)).sort(() => Math.random() - 0.5);
      const foeTeam = []; for (const t of ["S", "C", "P", "T"].sort(() => Math.random() - 0.5)) { const p = pool.find(x => x.t === t && !foeTeam.includes(x.id)); if (p && foeTeam.length < 3) foeTeam.push(p.id); }
      game.actions.push({ pick: foeTeam, lv: lvFoe, s: oSeat });
      shown = game.actions.length; history = []; return paint();
    }
    advance();
  };
  const finish = async st => {
    if (finished) return; finished = true;
    const won = st.winner === mySeat;
    const all = [...st.team[mySeat].map(f => ({ ...f, mine: true })), ...st.team[oSeat].map(f => ({ ...f, mine: false }))];
    const mvp = [...all].sort((a, b) => b.dealt - a.dealt)[0];
    let pts = opts.score || 0;
    if (!online && won) { pts += 30 + Math.round(st.team[mySeat].reduce((t, f) => t + f.cur, 0) / 10) + (round - 1) * 5; }
    $("#on-end").innerHTML = `<div class="glass win on-res"><div class="serif" style="font-size:36px">${won ? (online ? "Hai vinto" : `Legislatura ${round} vinta`) : online ? `Vince ${esc(names[oSeat])}` : "Sfiduciato"}</div>
      <div class="small muted">${won ? "Il gruppo parlamentare è tuo." : "Si torna all'opposizione."}${!online ? ` · ${pts} punti` : ""}</div>
      <div class="on-mvp">${polFace(mvp, "mid")}<div><div class="tiny faint">Migliore in aula</div><b>${esc(mvp.n)}</b><div class="tiny faint">${mvp.dealt} di consenso tolto · ${mvp.kos} ${mvp.kos === 1 ? "eliminato" : "eliminati"}</div></div></div>
      <div class="on-tab">${all.map(f => `<div class="${f.mine ? "mine" : ""}"><span>${esc(f.n)}</span><em>${f.cur > 0 ? "in aula" : "fuori"}</em><b>${f.dealt}</b></div>`).join("")}</div>
      <div id="on-rank" class="small" style="margin-top:8px"></div>
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button>${online ? `<button class="btn primary" data-act="du-invite" data-k="onorevoli" data-id="${game.players[oSeat]}">Rivincita</button>`
        : won ? `<button class="btn" id="on-stop">Mi ritiro</button><button class="btn primary" id="on-next">Legislatura ${round + 1}</button>` : `<button class="btn primary" data-act="play-onorevoli">Rigioca</button>`}</div></div>`;
    $("#on-end").scrollIntoView({ behavior: "smooth", block: "center" });
    if (won) confettiBurst();
    if (online && game.status === "active") duRpc("duel_finish", { p_id: game.id, p_result: { winner: st.winner } }).then(duUpsert).catch(() => {});
    const save = async () => { if (pts > 0) { await saveScore("onorevoli", pts, { rounds: won ? round : round - 1 }); const r = myRank("onorevoli"); const el = $("#on-rank"); if (el && r) el.innerHTML = `Record: <b>${r.s.score}</b> · ${r.pos}° su ${r.of}`; } };
    if (!online) {
      if (!won) save();
      $("#on-next")?.addEventListener("click", () => playOno({ cpu: true, round: round + 1, score: pts, team: st.team[mySeat].map(f => f.id) }));
      $("#on-stop")?.addEventListener("click", async () => { $("#on-stop").disabled = true; await save(); toast(`Ti ritiri con ${pts} punti`); });
    }
  };
  const update = row => {
    if (!online || row.id !== game.id || row.actions.length < game.actions.length) return;
    const wasOver = game.status === "over";
    game = row;
    const st = onoReplay(game, names);
    if (!st.ready) { shown = game.actions.length; return paint(); }
    if (shown < game.actions.length) advance();
    else if (!wasOver && st.over) { if (game.result?.quit) pushLog(st.ev[0]?.log || ""); paint(); }
  };
  DU.view = online ? { id: game.id, update } : null;
  gameCleanup = () => { clearTimeout(cpuT); skip = null; DU.view = null; };
  shown = game.actions.length;
  paint();
}
