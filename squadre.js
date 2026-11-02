/* Capodanno - Chiavenna Express: il gioco a squadre (2 contro 2 o 3 contro 3) su un telefono solo, da passarsi.
   Due treni partono dalla stazione di Chiavenna e corrono verso la meta di Capodanno: ogni prova vinta li fa avanzare.
   Le prove cambiano a ogni turno:
   - Schizzo: uno disegna una parola segreta, la sua squadra indovina prima che scada il tempo (poi possono rubare gli altri).
   - Tre parole: si fa indovinare la parola con al massimo tre parole singole; meno ne servono, più si avanza.
   - Stima di valle: una domanda con risposta numerica su Chiavenna, la Valchiavenna o il gruppo; vince chi ci va più vicino.
   - Passaparola disegnato: la parola passa di mano in mano, disegno, parola, disegno… e alla fine si vede cosa è diventata.
   - Chi l'ha detto?: un messaggio vero della chat del gruppo, la squadra deve indovinare chi l'ha scritto.
   Ogni squadra ha tre carte: Nebbia (gli avversari perdono 20 secondi), Pizzoccheri (punti doppi), Crotto (20 secondi in più). */
"use strict";

const SQ_WORDS = [
  // Chiavenna e Valchiavenna
  "Crotto", "Pizzoccheri", "Bresaola", "Sciatt", "Violino di capra", "Biscotin di Prosto", "Torta di fichi", "Pietra ollare", "Cascate dell'Acquafraggia",
  "Madesimo", "Passo dello Spluga", "Lago di Mezzola", "Fiume Mera", "Parco Paradiso", "Campodolcino", "Piuro", "Savogno", "Val Bregaglia", "Pizzo Stella",
  "Statale 36", "Treno per Colico", "Collegiata di San Lorenzo", "Castello di Chiavenna", "Funivia", "Seggiovia", "Ciaspole", "Polenta taragna", "Stambecco",
  "Camoscio", "Nebbia sul lago", "Mercatino", "Sagra dei crotti", "Grappa", "Baita", "Rifugio", "Valanga", "Frontiera svizzera", "Dogana", "Cioccolato svizzero",
  // Capodanno e viaggio
  "Spumante", "Cenone", "Lenticchie", "Cotechino", "Zampone", "Fuochi d'artificio", "Conto alla rovescia", "Brindisi", "Mutande rosse", "Botti", "Karaoke",
  "Mal di testa", "Discoteca", "Valigia", "Treno in ritardo", "Autogrill", "Passaporto", "Selfie", "Coriandoli", "Stelle filanti", "Buoni propositi", "Tombola",
  "Panettone", "Pandoro", "Sciarpa", "Neve", "Pupazzo di neve", "Slittino", "Vin brulé", "Hangover", "Taxi alle cinque", "Ultimo bus", "Guardaroba",
  // il gruppo e l'app
  "Sondaggio", "Splitwise", "Bonifico", "Caparra", "Messaggio vocale", "Trillo", "Scacchi", "Scopa", "Poker", "Onorevole", "Comizio", "Psicologo",
  "Indovinello", "Mappa", "Meteo", "Passaggio in macchina", "Piatto doccia", "Pigiama party", "Gita fuori porta", "Foto di gruppo",
];
// Domande di stima: la risposta è un numero. Alcune sono calcolate dai dati veri del gruppo.
const SQ_EST = [
  { q: "A che altitudine è Chiavenna, in metri sul livello del mare?", a: 333, u: "m" },
  { q: "A che altitudine è il Passo dello Spluga, in metri?", a: 2113, u: "m" },
  { q: "A che altitudine è Madesimo, in metri?", a: 1550, u: "m" },
  { q: "In che anno una frana seppellì il borgo di Piuro?", a: 1618, u: "" },
  { q: "Quanti chilometri ci sono in auto da Chiavenna a Milano?", a: 115, u: "km" },
  { q: "Quanto è alto il Pizzo Stella, in metri?", a: 3163, u: "m" },
  { q: "Quanti abitanti ha Chiavenna, più o meno?", a: 7300, u: "" },
  { q: "Quanto è lungo il Lago di Como, in chilometri?", a: 46, u: "km" },
  { q: "Quanti gradi ha in media una grappa, in percentuale di alcol?", a: 40, u: "%" },
  { q: "Quanti chicchi di lenticchia ci sono in 100 grammi, più o meno?", a: 2500, u: "" },
  { q: "Quanti tappi di spumante si stappano in Italia la notte di Capodanno, in milioni?", a: 50, u: "milioni" },
  { q: "Quanti secondi dura il conto alla rovescia più il primo «Auguri!»… no: quanti minuti ci sono in un anno, in migliaia?", a: 526, u: "mila" },
  { q: "Quanti anni ha la Collegiata di San Lorenzo a Chiavenna, più o meno? (fu ricostruita nel 1538)", a: new Date().getFullYear() - 1538, u: "anni" },
  { q: "Quanti chilometri è lungo il fiume Mera, più o meno?", a: 50, u: "km" },
];
function sqLiveEst() {
  const out = [];
  const gm = (S.messages || []).filter(m => m.channel === "gruppo" && m.role !== "assistant");
  if (gm.length > 10) out.push({ q: "Quanti messaggi ci sono nella chat del gruppo dell'app?", a: gm.length, u: "messaggi" });
  if ((S.polls || []).length > 2) out.push({ q: "Quanti sondaggi sono stati creati nell'app finora?", a: S.polls.length, u: "sondaggi" });
  const tot = (S.expenses || []).filter(e => e.kind !== "payment").reduce((t, e) => t + Number(e.amount || 0), 0);
  if (tot > 50) out.push({ q: "Quanti euro di spese ha registrato il gruppo in Splitwise, in totale?", a: Math.round(tot), u: "€" });
  if ((S.votes || []).length > 5) out.push({ q: "Quanti voti sono stati dati in tutti i sondaggi?", a: S.votes.length, u: "voti" });
  return out;
}
const SQ_TYPES = {
  schizzo: { n: "Schizzo", d: "Disegna la parola segreta: la tua squadra indovina prima che finisca il tempo.", ico: "edit", time: 75 },
  tre: { n: "Tre parole", d: "Fai indovinare la parola con al massimo tre parole singole. Meno ne usi, più avanzi.", ico: "chat", time: 60 },
  stima: { n: "Stima di valle", d: "Una domanda con risposta numerica. Ogni squadra dice il suo numero: vince chi ci va più vicino.", ico: "chart", time: 0 },
  passa: { n: "Passaparola disegnato", d: "La parola passa di mano in mano: disegno, parola, disegno… Se arriva intatta alla fine, si vola.", ico: "swap", time: 30 },
  chi: { n: "Chi l'ha detto?", d: "Un messaggio vero della chat del gruppo: indovinate chi l'ha scritto.", ico: "users", time: 0 },
};
const SQ_STATIONS = ["Chiavenna", "Prata", "Samolaco", "Novate Mezzola", "Colico", "Bellano", "Lecco", "Monza", "Milano C.le", "Frontiera", "Ultimo tratto"];
const SQ_TEAMS = [["Crotto Express", "#2ee59d"], ["Pizzoccheri Rapido", "#ffb547"], ["Freccia della Mera", "#7cc4ff"], ["Sciatt Supersonico", "#ff7aa8"]];
const SQ_CARDS = { nebbia: { n: "Nebbia", d: "Gli avversari, al prossimo turno, hanno 20 secondi in meno" }, pizzoccheri: { n: "Pizzoccheri", d: "Il tuo prossimo turno vale doppio" }, crotto: { n: "Crotto", d: "20 secondi in più per il tuo prossimo turno" } };
let SQG = null, sqTimer = 0, sqAC = null;

function sqSfx(kind) {
  try {
    sqAC ||= new (window.AudioContext || window.webkitAudioContext)(); sqAC.resume?.();
    const ac = sqAC, t0 = ac.currentTime + 0.01, out = ac.createGain(); out.gain.value = 0.32; out.connect(ac.destination);
    const tone = (f, at, dur, type = "sine", vol = 0.4) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.connect(g); g.connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); };
    ({
      ok: () => [659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.3, "triangle")),
      no: () => [330, 262].forEach((f, i) => tone(f, i * 0.14, 0.3, "triangle")),
      tick: () => tone(1200, 0, 0.05, "square", 0.08),
      whistle: () => { tone(880, 0, 0.5, "sine", 0.3); tone(1108, 0.05, 0.45, "sine", 0.2); },
      card: () => [523, 784].forEach((f, i) => tone(f, i * 0.07, 0.2, "sine", 0.3)),
      win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.12, i === 4 ? 0.9 : 0.2, "triangle", 0.4)),
    })[kind]?.();
  } catch { /* niente audio */ }
}
const sqNorm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const sqSame = (a, b) => { const x = sqNorm(a), y = sqNorm(b); if (!x || !y) return false; if (x === y) return true; const st = w => w.replace(/(i|e|a|o)$/, ""); const xs = x.split(" ").map(st), ys = y.split(" ").map(st); return ys.filter(w => w.length > 2).every(w => xs.includes(w)) || xs.join("") === ys.join(""); };
const sqRand = arr => arr[Math.floor(Math.random() * arr.length)];

// ───────── Preparazione ─────────
function playSquadre() {
  SQG = null;
  const people = S.members.map(m => ({ id: m.id, name: firstName(m) || m.name }));
  const setup = { teams: [[], []], names: [0, 1], rounds: 8, guests: [] };
  const meP = people.find(p => p.id === ME); if (meP) setup.teams[0].push(meP.id);
  const paint = () => {
    const all = [...people, ...setup.guests];
    const where = id => (setup.teams[0].includes(id) ? 0 : setup.teams[1].includes(id) ? 1 : -1);
    $("#sq-body").innerHTML = `<div class="sq-hero"><div class="sq-new">NEW!</div><div class="sq-title">Chiavenna Express</div>
        <div class="sq-sub">Due squadre, due treni, una sola meta: Capodanno. Disegni, parole, stime e messaggi veri del gruppo.</div></div>
      <div class="sq-teams">${[0, 1].map(t => { const [nm, col] = SQ_TEAMS[setup.names[t]]; return `<div class="sq-team" style="--tc:${col}">
        <button class="sq-tname" data-sqname="${t}">${esc(nm)} ${ico("swap", 14)}</button>
        <div class="sq-tlist">${setup.teams[t].map(id => { const p = all.find(x => x.id === id); return p ? `<span class="sq-chip">${member(p.id) ? avatar(member(p.id), "sm") : `<i>${esc(p.name[0])}</i>`}${esc(p.name)}</span>` : ""; }).join("") || `<span class="tiny faint">Tocca i nomi qui sotto</span>`}</div></div>`; }).join("")}</div>
      <div class="label" style="margin:14px 0 8px">Chi gioca? Tocca per cambiare squadra</div>
      <div class="sq-people">${all.map(p => { const w = where(p.id); return `<button class="sq-p ${w === 0 ? "a" : w === 1 ? "b" : ""}" data-sqp="${p.id}" style="--ta:${SQ_TEAMS[setup.names[0]][1]};--tb:${SQ_TEAMS[setup.names[1]][1]}">${member(p.id) ? avatar(member(p.id), "sm") : `<span class="sq-gav">${esc(p.name[0])}</span>`}<span>${esc(p.name)}</span></button>`; }).join("")}</div>
      <form id="sq-guest" class="row" style="gap:8px;margin-top:10px"><input name="g" placeholder="Aggiungi un ospite" style="flex:1" maxlength="16"><button class="btn sm">Aggiungi</button></form>
      <div class="label" style="margin:16px 0 8px">Durata</div>
      <div class="pk-opts" data-noswipe>${[[6, "Corta"], [8, "Normale"], [12, "Lunga"]].map(([n, l]) => `<button class="${setup.rounds === n ? "on" : ""}" data-sqr="${n}">${l} · ${n} turni</button>`).join("")}</div>
      <button class="btn sq-go block" id="sq-start" ${setup.teams[0].length >= 2 && setup.teams[1].length >= 2 ? "" : "disabled"}>${setup.teams[0].length >= 2 && setup.teams[1].length >= 2 ? "Si parte!" : "Servono almeno 2 persone per squadra"}</button>
      <p class="tiny faint" style="text-align:center;margin:10px 0 20px">Si gioca tutti insieme con un telefono solo: quando lo dice lo schermo, passatelo.</p>`;
  };
  openGame(`<div class="game-top sq-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button><div class="grow"></div><button class="btn icon sm" id="sq-help" aria-label="Regole">?</button></div><div id="sq-body" class="sq-body"></div>`);
  document.getElementById("game").classList.add("sq-game");
  paint();
  const body = $("#sq-body");
  body.addEventListener("click", e => {
    if (SQG || !$("#sq-start")) return; // la partita è iniziata: questa schermata non c'è più
    const p = e.target.closest("[data-sqp]"), n = e.target.closest("[data-sqname]"), r = e.target.closest("[data-sqr]");
    if (p) { const id = p.dataset.sqp; const w = setup.teams[0].includes(id) ? 0 : setup.teams[1].includes(id) ? 1 : -1; setup.teams.forEach(t => { const i = t.indexOf(id); if (i >= 0) t.splice(i, 1); }); if (w === -1 && setup.teams[0].length < 3) setup.teams[0].push(id); else if (w === -1 || w === 0) { if (setup.teams[1].length < 3) setup.teams[1].push(id); } paint(); }
    if (n) { const t = Number(n.dataset.sqname); let k = setup.names[t]; do { k = (k + 1) % SQ_TEAMS.length; } while (k === setup.names[1 - t]); setup.names[t] = k; paint(); }
    if (r) { setup.rounds = Number(r.dataset.sqr); paint(); }
    if (e.target.closest("#sq-start")) sqStart(setup, [...people, ...setup.guests]);
  });
  body.addEventListener("submit", e => { if (e.target.id !== "sq-guest") return; e.preventDefault(); const v = String(new FormData(e.target).get("g") || "").trim(); if (!v) return; setup.guests.push({ id: "g" + Date.now(), name: v.slice(0, 16) }); paint(); });
  $("#sq-help").addEventListener("click", sqHelp);
  gameCleanup = () => { clearInterval(sqTimer); document.getElementById("game")?.classList.remove("sq-game"); };
}
function sqHelp() {
  openSheet(`<h2>Chiavenna Express</h2><div class="small muted" style="line-height:1.55">
    <p>Due squadre da 2 o 3. Ogni turno tocca a una squadra, con una prova diversa; le prove vinte fanno avanzare il treno di stazioni. Vince chi arriva per primo a Capodanno, oppure chi è più avanti alla fine dei turni.</p>
    ${Object.values(SQ_TYPES).map(t => `<p><b>${t.n}.</b> ${t.d}</p>`).join("")}
    <p><b>Carte.</b> Ogni squadra ha tre carte da giocare una volta sola prima di un turno: ${Object.values(SQ_CARDS).map(c => `<b>${c.n}</b> (${c.d.toLowerCase()})`).join(", ")}.</p></div>`);
}
function sqStart(setup, all) {
  const plan = [];
  const kinds = ["schizzo", "tre", "stima", "passa", "chi", "schizzo", "tre", "passa", "stima", "chi", "schizzo", "tre"];
  for (let i = 0; i < setup.rounds; i++) plan.push(kinds[i % kinds.length]);
  const hasChat = (S.messages || []).filter(m => m.channel === "gruppo" && m.role !== "assistant" && m.member_id && String(m.content || "").length > 12 && !m.meta).length >= 5;
  SQG = {
    teams: [0, 1].map(t => ({ name: SQ_TEAMS[setup.names[t]][0], color: SQ_TEAMS[setup.names[t]][1], players: setup.teams[t].map(id => all.find(p => p.id === id)), pos: 0, cards: { nebbia: 1, pizzoccheri: 1, crotto: 1 }, bonus: 0, double: false, next: 0, log: [] })),
    plan: plan.map(k => (k === "chi" && !hasChat ? "stima" : k)), turn: 0, used: new Set(), usedEst: new Set(), gallery: [], goal: SQ_STATIONS.length - 1 + 1,
  };
  sqSfx("whistle");
  sqBoard();
}
// ───────── Tabellone ─────────
const sqTeam = () => SQG.teams[SQG.turn % 2];
const sqKind = () => SQG.plan[SQG.turn];
const sqPlayer = (team, k = 0) => team.players[(Math.floor(SQG.turn / 2) + k) % team.players.length];
function sqTrack() {
  const dest = trip().destination || "Capodanno";
  const stops = [...SQ_STATIONS, dest];
  return `<div class="sq-track"><div class="sq-line"></div>${stops.map((s, i) => `<div class="sq-st ${i === stops.length - 1 ? "dest" : ""}" style="left:${i / (stops.length - 1) * 100}%"><i></i><span>${esc(s)}</span></div>`).join("")}
    ${SQG.teams.map((t, k) => `<div class="sq-train ${k ? "b" : "a"}" style="left:${Math.min(1, t.pos / (stops.length - 1)) * 100}%;--tc:${t.color}"><svg viewBox="0 0 40 22"><rect x="2" y="3" width="30" height="14" rx="4"/><rect x="30" y="7" width="8" height="10" rx="2"/><circle cx="10" cy="19" r="3"/><circle cx="24" cy="19" r="3"/><rect x="7" y="6" width="6" height="5" rx="1" fill="#0b1f18"/><rect x="17" y="6" width="6" height="5" rx="1" fill="#0b1f18"/></svg></div>`).join("")}</div>`;
}
function sqBoard(note) {
  clearInterval(sqTimer);
  const stopsN = SQ_STATIONS.length;
  const done = SQG.teams.find(t => t.pos >= stopsN) || SQG.turn >= SQG.plan.length;
  if (done) return sqFinale();
  const team = sqTeam(), other = SQG.teams[1 - SQG.turn % 2], kind = sqKind(), T = SQ_TYPES[kind];
  const pl = sqPlayer(team);
  $("#sq-body").innerHTML = `<div class="sq-score">${SQG.teams.map((t, k) => `<div class="sq-sc ${k === SQG.turn % 2 ? "on" : ""}" style="--tc:${t.color}"><b>${esc(t.name)}</b><span>${t.pos} ${t.pos === 1 ? "stazione" : "stazioni"}</span></div>`).join("")}</div>
    ${sqTrack()}
    ${note ? `<div class="sq-note">${note}</div>` : ""}
    <div class="sq-turn" style="--tc:${team.color}"><div class="eyebrow">Turno ${SQG.turn + 1} di ${SQG.plan.length}</div>
      <div class="sq-kind">${ico(T.ico, 22)}<span>${T.n}</span></div>
      <div class="small muted">${T.d}</div>
      <div class="sq-who">Tocca a <b>${esc(team.name)}</b>${kind === "stima" ? " (poi rispondono anche gli altri)" : kind === "chi" ? "" : `, ${kind === "passa" ? "inizia" : "gioca"} <b>${esc(pl.name)}</b>`}</div>
      ${team.double ? `<div class="sq-buff">Pizzoccheri attivi: questo turno vale doppio</div>` : ""}${team.bonus ? `<div class="sq-buff">${team.bonus > 0 ? `Crotto: +${team.bonus} secondi` : `Nebbia: ${team.bonus} secondi`}</div>` : ""}</div>
    <div class="sq-cards"><div class="tiny faint">Carte di ${esc(team.name)}</div><div class="row" style="gap:8px">${Object.entries(SQ_CARDS).map(([k, c]) => `<button class="sq-card ${team.cards[k] ? "" : "used"}" data-sqc="${k}" ${team.cards[k] ? "" : "disabled"}><b>${c.n}</b><span>${c.d}</span></button>`).join("")}</div></div>
    <button class="btn sq-go block" id="sq-play">${ico("play", 16)}Via!</button>`;
  $("#sq-body").onclick = e => {
    const c = e.target.closest("[data-sqc]");
    if (c) {
      const k = c.dataset.sqc; if (!team.cards[k]) return; team.cards[k] = 0; sqSfx("card");
      if (k === "nebbia") { other.next -= 20; return sqBoard(`<b>Nebbia</b> su ${esc(other.name)}: al loro prossimo turno 20 secondi in meno.`); }
      if (k === "pizzoccheri") { team.double = true; return sqBoard(`<b>Pizzoccheri</b> per ${esc(team.name)}: questo turno vale doppio.`); }
      if (k === "crotto") { team.bonus += 20; return sqBoard(`<b>Crotto</b>: ${esc(team.name)} ha 20 secondi in più.`); }
    }
    if (e.target.closest("#sq-play")) { team.bonus += team.next; team.next = 0; ({ schizzo: sqSchizzo, tre: sqTre, stima: sqStima, passa: sqPassa, chi: sqChi })[kind](); }
  };
  if (team.next && !team.bonus) { team.bonus = team.next; team.next = 0; }
}
function sqAdvance(teamIdx, stations, why) {
  const t = SQG.teams[teamIdx];
  let n = stations; if (t.double && n > 0) n *= 2;
  t.pos = Math.min(SQ_STATIONS.length, t.pos + n);
  if (n > 0) sqSfx("ok");
  return n ? `<b>${esc(t.name)}</b> avanza di ${n} ${n === 1 ? "stazione" : "stazioni"}${why ? ` · ${why}` : ""}` : "";
}
function sqEndTurn(msgs) {
  const team = sqTeam(); team.double = false; team.bonus = 0;
  SQG.turn++;
  sqBoard(msgs.filter(Boolean).join("<br>") || "Nessuno avanza questa volta.");
}
// Passa il telefono: schermo che nasconde tutto finché non tocca la persona giusta.
function sqHand(who, text, then) {
  $("#sq-body").innerHTML = `<div class="sq-hand"><div class="sq-hand-ico">${ico("device", 34)}</div><div class="eyebrow">Passa il telefono</div>
    <div class="sq-hand-name">${esc(who)}</div><div class="small muted">${text}</div><button class="btn sq-go" id="sq-ready">Sono ${esc(who)}, vai</button></div>`;
  $("#sq-ready").onclick = then;
}
function sqRing(total, onEnd, el = "#sq-ring") {
  clearInterval(sqTimer);
  const start = Date.now();
  const paintRing = () => {
    const left = Math.max(0, total - (Date.now() - start) / 1000), r = $(el); if (!r) return clearInterval(sqTimer);
    r.style.setProperty("--p", left / total); r.querySelector("b").textContent = Math.ceil(left);
    r.classList.toggle("low", left <= 10);
    if (left <= 5 && Math.ceil(left) !== r._last) { r._last = Math.ceil(left); sqSfx("tick"); }
    if (left <= 0) { clearInterval(sqTimer); onEnd(); }
  };
  paintRing(); sqTimer = setInterval(paintRing, 200);
}
const sqTime = base => Math.max(15, base + sqTeam().bonus);
function sqWord() { let w; do { w = sqRand(SQ_WORDS); } while (SQG.used.has(w) && SQG.used.size < SQ_WORDS.length - 5); SQG.used.add(w); return w; }

// ───────── Lavagna ─────────
function sqCanvas(sel, opts = {}) {
  const cv = $(sel), ctx = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.scale(dpr, dpr);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const pad = { color: "#1a1a2e", size: 5, strokes: [], cur: null };
  const bg = () => { ctx.fillStyle = "#fffdf6"; ctx.fillRect(0, 0, r.width, r.height); };
  const draw = s => { ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.beginPath(); s.p.forEach(([x, y], i) => { if (!i) ctx.moveTo(x, y); else { const [px, py] = s.p[i - 1]; ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); } }); if (s.p.length === 1) ctx.lineTo(s.p[0][0] + 0.1, s.p[0][1]); ctx.stroke(); };
  const redraw = () => { bg(); pad.strokes.forEach(draw); };
  bg();
  if (!opts.readonly) {
    const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); pad.cur = { c: pad.color, w: pad.size, p: [pos(e)] }; pad.strokes.push(pad.cur); draw(pad.cur); };
    cv.onpointermove = e => { if (!pad.cur) return; pad.cur.p.push(pos(e)); redraw(); };
    cv.onpointerup = cv.onpointercancel = () => { pad.cur = null; };
  }
  pad.undo = () => { pad.strokes.pop(); redraw(); };
  pad.clear = () => { pad.strokes = []; redraw(); };
  pad.image = () => cv.toDataURL("image/jpeg", 0.8);
  pad.tools = () => `<div class="sq-tools">${["#1a1a2e", "#e63946", "#2a9d8f", "#f4a261", "#3a86ff", "#8338ec"].map(c => `<button class="sq-col ${c === pad.color ? "on" : ""}" data-col="${c}" style="--c:${c}"></button>`).join("")}
    <button class="sq-sz" data-sz="${pad.size === 5 ? 12 : 5}">${pad.size === 5 ? "Fine" : "Grosso"}</button><button class="sq-tb" data-tl="undo">${ico("undo", 16)}</button><button class="sq-tb" data-tl="clear">${ico("trash", 16)}</button></div>`;
  return pad;
}
function sqBindTools(pad, box) {
  const repaint = () => { box.innerHTML = pad.tools(); };
  repaint();
  box.onclick = e => {
    const c = e.target.closest("[data-col]"), z = e.target.closest("[data-sz]"), t = e.target.closest("[data-tl]");
    if (c) pad.color = c.dataset.col; if (z) pad.size = Number(z.dataset.sz); if (t) pad[t.dataset.tl]();
    repaint();
  };
}

// ───────── Prove ─────────
function sqSchizzo() {
  const team = sqTeam(), pl = sqPlayer(team), word = sqWord(), other = SQG.teams[1 - SQG.turn % 2];
  sqHand(pl.name, "Solo tu guardi la parola: poi la disegni per la tua squadra. Niente lettere né numeri!", () => {
    $("#sq-body").innerHTML = `<div class="sq-secret"><div class="eyebrow">Parola da disegnare</div><div class="sq-word">${esc(word)}</div><button class="btn sq-go" id="sq-gox">Ho capito, giro il telefono</button></div>`;
    $("#sq-gox").onclick = () => {
      $("#sq-body").innerHTML = `<div class="sq-play"><div class="sq-bar"><div class="sq-ring" id="sq-ring"><b></b></div><div class="grow"><b>${esc(team.name)}</b><div class="tiny faint">Disegna ${esc(pl.name)} · gli altri indovinano a voce</div></div></div>
        <canvas class="sq-cv" id="sq-cv"></canvas><div id="sq-tools"></div>
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn grow" id="sq-pass">Ci arrendiamo</button><button class="btn sq-go grow" id="sq-hit">${ico("check", 16)}Indovinato!</button></div></div>`;
      const pad = sqCanvas("#sq-cv"); sqBindTools(pad, $("#sq-tools"));
      const total = sqTime(SQ_TYPES.schizzo.time), t0 = Date.now();
      const end = ok => {
        clearInterval(sqTimer);
        const left = total - (Date.now() - t0) / 1000;
        SQG.gallery.push({ img: pad.image(), word, by: pl.name, team: team.name });
        if (ok) return sqEndTurn([`<b>${esc(word)}</b> indovinato con ${Math.max(0, Math.round(left))} secondi di anticipo`, sqAdvance(SQG.turn % 2, left > total * 0.6 ? 3 : left > total * 0.3 ? 2 : 1, "Schizzo")]);
        sqSfx("no");
        $("#sq-body").innerHTML = `<div class="sq-steal" style="--tc:${other.color}"><div class="eyebrow">Tempo scaduto</div><div class="serif" style="font-size:28px">${esc(other.name)} può rubare!</div>
          <div class="small muted">Dieci secondi per dire la parola guardando il disegno.</div><img class="sq-thumb" src="${pad.image()}" alt=""><div class="sq-ring" id="sq-ring2"><b></b></div>
          <div class="row" style="gap:8px;margin-top:10px"><button class="btn grow" id="sq-no">Niente</button><button class="btn sq-go grow" id="sq-yes">Rubata!</button></div></div>`;
        const fin = stole => { clearInterval(sqTimer); sqEndTurn([`La parola era <b>${esc(word)}</b>`, stole ? sqAdvance(1 - SQG.turn % 2, 1, "furto") : ""]); };
        sqRing(10, () => fin(false), "#sq-ring2");
        $("#sq-yes").onclick = () => fin(true); $("#sq-no").onclick = () => fin(false);
      };
      sqRing(total, () => end(false));
      $("#sq-hit").onclick = () => end(true); $("#sq-pass").onclick = () => end(false);
    };
  });
}
function sqTre() {
  const team = sqTeam(), pl = sqPlayer(team), word = sqWord();
  sqHand(pl.name, "Vedrai una parola: falla indovinare scrivendo al massimo tre parole singole, una alla volta.", () => {
    const clues = [];
    const paint = () => {
      $("#sq-body").innerHTML = `<div class="sq-play"><div class="sq-bar"><div class="sq-ring" id="sq-ring"><b></b></div><div class="grow"><b>${esc(team.name)}</b><div class="tiny faint">Parola segreta (non leggerla ad alta voce): <b class="sq-peek">${esc(word)}</b></div></div></div>
        <div class="sq-clues">${[0, 1, 2].map(i => `<div class="sq-clue ${clues[i] ? "on" : ""}">${clues[i] ? esc(clues[i]) : i + 1}</div>`).join("")}</div>
        ${clues.length < 3 ? `<form id="sq-cf" class="row" style="gap:8px"><input name="c" placeholder="Indizio ${clues.length + 1}: una parola" autocomplete="off" style="flex:1"><button class="btn">Mostra</button></form>` : ""}
        <div class="small muted" style="text-align:center;margin:8px 0">Indovinate subito: con 1 indizio si avanza di 3, con 2 di 2, con 3 di 1.</div>
        <div class="row" style="gap:8px"><button class="btn grow" id="sq-pass">Non ci arriviamo</button><button class="btn sq-go grow" id="sq-hit">${ico("check", 16)}Indovinato!</button></div></div>`;
      const f = $("#sq-cf");
      if (f) { f.querySelector("input").focus(); f.onsubmit = e => { e.preventDefault(); const v = String(new FormData(f).get("c") || "").trim(); if (!v) return; if (/\s/.test(v)) return toast("Una parola sola!"); if (sqSame(v, word) || sqNorm(word).includes(sqNorm(v).slice(0, 4)) && sqNorm(v).length >= 4) return toast("Troppo facile: non puoi usare la parola stessa", "alert"); clues.push(v); sqSfx("tick"); paint(); sqRingKeep(); }; }
      $("#sq-hit").onclick = () => end(true); $("#sq-pass").onclick = () => end(false);
    };
    let total = sqTime(SQ_TYPES.tre.time), t0 = Date.now();
    const sqRingKeep = () => { const left = total - (Date.now() - t0) / 1000; total = left; t0 = Date.now(); sqRing(Math.max(1, left), () => end(false)); };
    const end = ok => { clearInterval(sqTimer); if (!ok) sqSfx("no"); sqEndTurn([`La parola era <b>${esc(word)}</b>${clues.length ? ` · indizi: ${clues.map(esc).join(", ")}` : ""}`, ok ? sqAdvance(SQG.turn % 2, Math.max(1, 4 - Math.max(1, clues.length)), "Tre parole") : ""]); };
    paint(); sqRing(total, () => end(false));
  });
}
function sqStima() {
  const pool = [...sqLiveEst(), ...SQ_EST].filter(q => !SQG.usedEst.has(q.q));
  const Q = sqRand(pool.length ? pool : SQ_EST); SQG.usedEst.add(Q.q);
  const order = [SQG.turn % 2, 1 - SQG.turn % 2], answers = [];
  const ask = k => {
    const t = SQG.teams[order[k]];
    sqHand(t.name, "Discutete a bassa voce e scrivete il vostro numero: gli altri non devono vederlo.", () => {
      $("#sq-body").innerHTML = `<div class="sq-secret" style="--tc:${t.color}"><div class="eyebrow">${esc(t.name)}</div><div class="sq-q">${esc(Q.q)}</div>
        <form id="sq-ef" class="sq-est"><input name="v" inputmode="decimal" placeholder="Il vostro numero" autocomplete="off"><span>${esc(Q.u)}</span></form><button class="btn sq-go" id="sq-eok">Conferma</button></div>`;
      const go_ = () => { const v = parseFloat(String(new FormData($("#sq-ef")).get("v")).replace(/\./g, "").replace(",", ".")); if (Number.isNaN(v)) return toast("Scrivete un numero"); answers[order[k]] = v; if (k === 0) ask(1); else reveal(); };
      $("#sq-eok").onclick = go_; $("#sq-ef").onsubmit = e => { e.preventDefault(); go_(); };
    });
  };
  const reveal = () => {
    const d = answers.map(v => Math.abs(v - Q.a)), best = d[0] === d[1] ? -1 : d[0] < d[1] ? 0 : 1;
    const max = Math.max(Q.a, ...answers) * 1.15 || 1;
    $("#sq-body").innerHTML = `<div class="sq-reveal"><div class="sq-q">${esc(Q.q)}</div>
      <div class="sq-numline">${[0, 1].map(k => `<div class="sq-mark" style="left:${Math.min(98, answers[k] / max * 100)}%;--tc:${SQG.teams[k].color}"><b>${answers[k].toLocaleString("it-IT")}</b><span>${esc(SQG.teams[k].name)}</span></div>`).join("")}
        <div class="sq-mark truth" style="left:${Math.min(98, Q.a / max * 100)}%"><b>${Q.a.toLocaleString("it-IT")}</b><span>Risposta</span></div></div>
      <button class="btn sq-go block" id="sq-next">Avanti</button></div>`;
    sqSfx(best >= 0 ? "ok" : "no");
    $("#sq-next").onclick = () => {
      const msgs = [`Risposta: <b>${Q.a.toLocaleString("it-IT")} ${esc(Q.u)}</b>`];
      if (best >= 0) { const close = d[best] <= Math.abs(Q.a) * 0.05; msgs.push(sqAdvance(best, close ? 3 : 2, close ? "centro quasi perfetto" : "più vicini")); }
      else msgs.push("Pari: nessuno avanza");
      sqEndTurn(msgs);
    };
  };
  ask(0);
}
function sqPassa() {
  const team = sqTeam(), word = sqWord(), ps = team.players;
  const steps = []; const n = Math.max(3, ps.length + 1);
  for (let i = 0; i < n; i++) steps.push({ kind: i % 2 ? "guess" : "draw", who: ps[i % ps.length] });
  if (steps.at(-1).kind === "draw") steps.push({ kind: "guess", who: ps[n % ps.length] });
  const chain = [{ kind: "word", text: word }];
  const run = i => {
    if (i >= steps.length) return finish();
    const st = steps[i], prev = chain.at(-1);
    sqHand(st.who.name, st.kind === "draw" ? "Vedrai una parola: disegnala in 30 secondi." : "Vedrai un disegno: scrivi che cosa rappresenta.", () => {
      if (st.kind === "draw") {
        $("#sq-body").innerHTML = `<div class="sq-play"><div class="sq-bar"><div class="sq-ring" id="sq-ring"><b></b></div><div class="grow"><div class="tiny faint">Disegna</div><b class="sq-big">${esc(prev.text)}</b></div></div>
          <canvas class="sq-cv" id="sq-cv"></canvas><div id="sq-tools"></div><button class="btn sq-go block" id="sq-done" style="margin-top:8px">Fatto, passa</button></div>`;
        const pad = sqCanvas("#sq-cv"); sqBindTools(pad, $("#sq-tools"));
        const done = () => { clearInterval(sqTimer); chain.push({ kind: "draw", img: pad.image(), by: st.who.name }); run(i + 1); };
        sqRing(sqTime(SQ_TYPES.passa.time), done); $("#sq-done").onclick = done;
      } else {
        $("#sq-body").innerHTML = `<div class="sq-play"><div class="tiny faint" style="text-align:center">Che cos'è?</div><img class="sq-thumb big" src="${prev.img}" alt="">
          <form id="sq-gf" class="row" style="gap:8px;margin-top:10px"><input name="g" placeholder="Secondo me è…" autocomplete="off" style="flex:1"><button class="btn sq-go">Passa</button></form></div>`;
        $("#sq-gf").onsubmit = e => { e.preventDefault(); const v = String(new FormData(e.target).get("g") || "").trim() || "boh"; chain.push({ kind: "guess", text: v, by: st.who.name }); run(i + 1); };
      }
    });
  };
  const finish = () => {
    const last = chain.at(-1).text, ok = sqSame(last, word);
    SQG.gallery.push({ chain, word, team: team.name });
    $("#sq-body").innerHTML = `<div class="sq-chain"><div class="eyebrow">Com'è andata la parola</div>
      ${chain.map((c, k) => `<div class="sq-link" style="animation-delay:${k * 0.5}s">${c.kind === "draw" ? `<img src="${c.img}" alt=""><span>disegnato da ${esc(c.by)}</span>` : `<b>${esc(c.text)}</b><span>${c.kind === "word" ? "parola di partenza" : `secondo ${esc(c.by)}`}</span>`}</div>`).join("")}
      <div class="sq-verdict ${ok ? "ok" : ""}" style="animation-delay:${chain.length * 0.5}s">${ok ? "Arrivata intatta!" : "Persa per strada…"}</div>
      <div class="row" style="gap:8px;margin-top:12px">${CLOUD ? `<button class="btn grow" id="sq-share">${ico("image", 15)}Manda in chat</button>` : ""}<button class="btn sq-go grow" id="sq-next">Avanti</button></div></div>`;
    setTimeout(() => sqSfx(ok ? "ok" : "no"), chain.length * 500);
    $("#sq-next").onclick = () => sqEndTurn([`Partita da <b>${esc(word)}</b>, arrivata come <b>${esc(last)}</b>`, ok ? sqAdvance(SQG.turn % 2, 3, "Passaparola") : sqAdvance(SQG.turn % 2, chain.some((c, k) => k > 0 && c.kind === "guess" && sqSame(c.text, word)) ? 1 : 0, "a metà strada c'era")]);
    $("#sq-share")?.addEventListener("click", async () => {
      const draws = chain.filter(c => c.kind === "draw"); if (!draws.length) return;
      const blob = await (await fetch(draws.at(-1).img)).blob();
      try { $("#composer-input").value = `Chiavenna Express: «${word}» è diventato «${last}»`; await sendChatPhoto(new File([blob], "passaparola.jpg", { type: "image/jpeg" })); toast("Mandato in chat", "check"); } catch (e) { toast(e.message, "alert"); }
    });
  };
  run(0);
}
function sqChi() {
  const team = sqTeam();
  const pool = (S.messages || []).filter(m => m.channel === "gruppo" && m.role !== "assistant" && m.member_id && !m.meta && String(m.content || "").length > 12 && String(m.content).length < 220 && !SQG.used.has(m.id));
  const m = sqRand(pool); SQG.used.add(m.id);
  const others = S.members.filter(x => x.id !== m.member_id).sort(() => Math.random() - 0.5).slice(0, 3);
  const opts = [member(m.member_id), ...others].filter(Boolean).sort(() => Math.random() - 0.5);
  $("#sq-body").innerHTML = `<div class="sq-secret" style="--tc:${team.color}"><div class="eyebrow">${esc(team.name)} · chi l'ha detto?</div>
    <div class="sq-quote">«${esc(m.content)}»</div><div class="tiny faint">${esc(fmtDateTime(m.created_at))}</div>
    <div class="sq-opts">${opts.map(o => `<button data-who="${o.id}">${avatar(o, "sm")}<span>${esc(o.name)}</span></button>`).join("")}</div></div>`;
  $("#sq-body").onclick = e => {
    const b = e.target.closest("[data-who]"); if (!b) return;
    const ok = b.dataset.who === m.member_id;
    b.classList.add(ok ? "ok" : "no"); $(`[data-who="${m.member_id}"]`)?.classList.add("ok"); sqSfx(ok ? "ok" : "no");
    setTimeout(() => sqEndTurn([`L'ha scritto <b>${esc(mname(m.member_id))}</b>`, ok ? sqAdvance(SQG.turn % 2, 2, "Chi l'ha detto") : ""]), 1400);
  };
}
// ───────── Arrivo ─────────
function sqFinale() {
  clearInterval(sqTimer);
  const [a, b] = SQG.teams, w = a.pos === b.pos ? -1 : a.pos > b.pos ? 0 : 1;
  sqSfx("win"); confettiBurst();
  const dest = trip().destination || "Capodanno";
  $("#sq-body").innerHTML = `<div class="sq-final">${sqTrack()}
    <div class="sq-new">${w < 0 ? "PAREGGIO" : "ARRIVO!"}</div>
    <div class="sq-title">${w < 0 ? "Arrivo appaiato" : esc(SQG.teams[w].name)}</div>
    <div class="sq-sub">${w < 0 ? "Due treni in stazione insieme: si festeggia in coppia." : `Primo treno a ${esc(dest)}: ${SQG.teams[w].players.map(p => esc(p.name)).join(", ")}`}</div>
    <div class="sq-score">${SQG.teams.map(t => `<div class="sq-sc" style="--tc:${t.color}"><b>${esc(t.name)}</b><span>${t.pos} stazioni</span></div>`).join("")}</div>
    ${SQG.gallery.length ? `<div class="label" style="margin:16px 0 8px">La galleria della serata</div><div class="sq-gallery">${SQG.gallery.map(g => g.img ? `<figure><img src="${g.img}" alt=""><figcaption>${esc(g.word)} · ${esc(g.by)}</figcaption></figure>` : (g.chain || []).filter(c => c.kind === "draw").map(c => `<figure><img src="${c.img}" alt=""><figcaption>${esc(g.word)} → ${esc(c.by)}</figcaption></figure>`).join("")).join("")}</div>` : ""}
    <div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn sq-go" data-act="sq-play">Rivincita</button></div></div>`;
  if (w >= 0 && SQG.teams[w].players.some(p => p.id === ME)) saveScore("squadre", 10 + SQG.teams[w].pos, { team: SQG.teams[w].name });
}
GAMES.squadre = { label: "Chiavenna Express", icon: "users", kind: "points" };
window.playSquadre = playSquadre;
Object.assign(ACTIONS, { "sq-play": () => { closeSheet(); playSquadre(); } });
