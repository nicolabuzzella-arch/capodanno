/* Capodanno - altri giochi.
   - Ruota della fortuna: un giro al giorno, premi veri (silenziare qualcuno in chat per un'ora, soprannomi, titoli, scudo, gettoni).
   - Enigma del giorno: rompicapi difficili, tre tentativi, un indizio; più un archivio per chi non si arrende.
   - Ordine di grandezza: il Trivial al contrario, sei categorie ma si risponde con un numero e conta quanto ci vai vicino.
   - Onorevoli: lotta a turni tra politici e giornalisti italiani, con le loro frasi celebri al posto delle mosse.
   Usa le funzioni globali di app.js e games.js. */
"use strict";

Object.assign(GAMES, {
  enigma: { label: "Enigma del giorno", icon: "key", kind: "sum" },
  trivia: { label: "Ordine di grandezza", icon: "chart", kind: "points" },
  onorevoli: { label: "Onorevoli", icon: "trophy", kind: "points" },
});
const seededRand = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const dayNum = (d = today()) => Math.floor(new Date(d + "T12:00:00Z").getTime() / 864e5);
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/,/g, ".").replace(/[^a-z0-9./ -]/g, " ")
  .replace(/\b(il|lo|la|i|gli|le|un|uno|una|suo|sua|e|di|del|della|kg|km|cm|gradi|euro|centesimi)\b/g, " ").replace(/\s+/g, " ").trim();

// ───────────────────────── Ruota della fortuna ─────────────────────────

const WHEEL = [
  { k: "coins10", label: "10", sub: "gettoni", c: "#e6d4ff" },
  { k: "mute", label: "Silenzia", sub: "1 ora", c: "#c9f3ee" },
  { k: "coins25", label: "25", sub: "gettoni", c: "#dfe8ff" },
  { k: "title", label: "Titolo", sub: "del giorno", c: "#e6d4ff" },
  { k: "nothing", label: "Niente", sub: "ritenta", c: "#c9f3ee" },
  { k: "coins50", label: "50", sub: "gettoni", c: "#dfe8ff" },
  { k: "nick", label: "Soprannome", sub: "a un amico", c: "#e6d4ff" },
  { k: "shield", label: "Scudo", sub: "24 ore", c: "#c9f3ee" },
  { k: "coins100", label: "100", sub: "gettoni", c: "#dfe8ff" },
  { k: "again", label: "Rigira", sub: "subito", c: "#e6d4ff" },
  { k: "jackpot", label: "500", sub: "jackpot", c: "#c9f3ee" },
];
const prizeKey = s => (s.prize === "coins" ? (s.amount >= 500 ? "jackpot" : `coins${s.amount}`) : s.prize);
const PRIZE_TEXT = {
  mute: "Puoi silenziare qualcuno nella chat di gruppo per un'ora. Hai 48 ore per usarlo.",
  nick: "Puoi dare un soprannome a qualcuno per un'ora: in chat comparirà così.",
  title: "Hai un titolo per 24 ore, accanto al tuo nome in chat.",
  shield: "Per 24 ore nessuno può silenziarti né rinominarti.",
  nothing: "Niente stavolta. La ruota ha un senso dell'umorismo tutto suo.",
  again: "Rigira! La ruota ti concede un altro giro, subito.",
};
const spinsToday = () => (S.wheel_spins || []).filter(s => s.member_id === ME && s.day === today());
const canSpin = () => { const t = spinsToday(); return t.length <= t.filter(s => s.prize === "again").length; };
const unusedPrizes = () => (S.wheel_spins || []).filter(s => s.member_id === ME && ["mute", "nick"].includes(s.prize) && !s.used_at && Date.now() - new Date(s.created_at) < 48 * 3600e3);
const coinsOf = id => (S.wheel_spins || []).filter(s => s.member_id === id).reduce((t, s) => t + (s.amount || 0), 0);

function wheelSvg() {
  const n = WHEEL.length, R = 150, a = 2 * Math.PI / n;
  const seg = (i) => {
    const a0 = i * a - Math.PI / 2 - a / 2, a1 = a0 + a;
    const p = t => `${(R + R * Math.cos(t)).toFixed(1)},${(R + R * Math.sin(t)).toFixed(1)}`;
    const mid = a0 + a / 2, tx = R + R * 0.66 * Math.cos(mid), ty = R + R * 0.66 * Math.sin(mid), rot = mid * 180 / Math.PI + 90;
    const w = WHEEL[i];
    return `<path d="M${R},${R} L${p(a0)} A${R},${R} 0 0 1 ${p(a1)} Z" fill="${w.c}" opacity="${i % 2 ? 0.82 : 1}"/>
      <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) rotate(${rot.toFixed(1)})"><text text-anchor="middle" font-size="${w.label.length > 6 ? 13 : 17}" font-weight="700" fill="#0a0a0c" y="-2">${w.label}</text><text text-anchor="middle" font-size="9.5" fill="#0a0a0c" opacity=".7" y="11">${w.sub}</text></g>`;
  };
  return `<svg viewBox="0 0 300 300" class="wheel-svg" id="wheel"><g id="wheel-rot">${WHEEL.map((_, i) => seg(i)).join("")}</g><circle cx="150" cy="150" r="26" fill="#0d0c22" stroke="rgba(255,255,255,.5)" stroke-width="2"/></svg>`;
}
async function spin() {
  if (!canSpin()) return toast("Hai già girato oggi: torna domani");
  const btn = $("#wheel-go"); if (btn) btn.disabled = true;
  let s;
  try {
    if (CLOUD) s = await rpcG("spin_wheel");
    else s = await localSpin();
  } catch (e) { if (btn) btn.disabled = false; return toast(e.message.includes("spin_wheel") ? "Esegui aggiornamento-3.sql per attivare la ruota" : e.message, "alert"); }
  const idx = WHEEL.findIndex(w => w.k === prizeKey(s));
  const g = $("#wheel-rot");
  const cur = Number(g.dataset.deg || 0);
  const target = cur + 360 * 6 + (360 - idx * (360 / WHEEL.length)) - (cur % 360);
  g.style.transition = "transform 4.6s cubic-bezier(.12,.75,.12,1)";
  g.style.transform = `rotate(${target}deg)`; g.dataset.deg = target;
  // Piccoli tic mentre gira.
  let ticks = 0; const tk = setInterval(() => { navigator.vibrate?.(3); if (++ticks > 30) clearInterval(tk); }, 120);
  setTimeout(async () => {
    clearInterval(tk);
    navigator.vibrate?.([30, 40, 60]);
    await reload();
    const w = WHEEL[idx];
    openSheet(`<div class="prize"><div class="prize-badge" style="background:${w.c}">${w.label}</div>
      <div class="serif" style="font-size:32px;margin-top:14px">${s.prize === "coins" ? `${s.amount} gettoni${s.amount >= 500 ? ", jackpot!" : ""}` : s.prize === "title" ? esc(s.label) : w.label}</div>
      <p class="muted">${s.prize === "coins" ? `Ne hai ${coinsOf(ME)} in tutto: la classifica della Fortuna ti guarda.` : PRIZE_TEXT[s.prize] || ""}</p>
      ${["mute", "nick"].includes(s.prize) ? `<button class="btn pearl block" data-act="prize-use" data-id="${s.id}">Usalo adesso</button>` : ""}
      <button class="btn block" style="margin-top:8px" data-act="close-sheet">${s.prize === "again" ? "Rigiro" : "Chiudi"}</button></div>`);
  }, 4800);
}
async function localSpin() {
  const r = Math.random() * 100, titles = ["Re del brindisi", "Sindaco della serata", "Custode delle lenticchie"];
  const [prize, amount, label] = r < 20 ? ["coins", 10] : r < 34 ? ["coins", 25] : r < 42 ? ["coins", 50] : r < 46 ? ["coins", 100] : r < 61 ? ["title", 0, titles[Math.floor(Math.random() * 3)]]
    : r < 73 ? ["nothing", 0] : r < 81 ? ["nick", 0] : r < 88 ? ["mute", 0] : r < 94 ? ["shield", 0] : r < 99 ? ["again", 0] : ["coins", 500, "Jackpot"];
  const row = await api.insert("wheel_spins", { member_id: ME, day: today(), prize, amount, label: label || null, used_at: ["mute", "nick"].includes(prize) ? null : new Date().toISOString(), created_at: new Date().toISOString() });
  if (prize === "title") await api.insert("effects", { kind: "title", target: ME, by: ME, value: label, until: new Date(Date.now() + 864e5).toISOString() });
  if (prize === "shield") await api.insert("effects", { kind: "shield", target: ME, by: ME, until: new Date(Date.now() + 864e5).toISOString() });
  return row;
}
async function rpcG(fn, args = {}) { const { data, error } = await api.sb.rpc(fn, args); if (error) throw new Error(error.message); return data; }
function sheetUsePrize(id) {
  const s = (S.wheel_spins || []).find(x => x.id === id); if (!s) return;
  openSheet(`<h2>${s.prize === "mute" ? "Chi silenzi per un'ora?" : "A chi dai un soprannome?"}</h2>
    ${s.prize === "nick" ? `<div class="field"><label>Soprannome</label><input id="nick-val" maxlength="24" placeholder="Es. Il Conte Spumante"></div>` : `<p class="small muted" style="margin-top:-6px">Non potrà scrivere nella chat di gruppo per 60 minuti. Zampone lo ascolterà comunque.</p>`}
    <div class="stack" style="gap:6px">${S.members.filter(m => m.id !== ME).map(m => `<button class="li tap" data-act="prize-target" data-id="${id}" data-t="${m.id}">${avatar(m, "sm")}<span class="grow t" style="text-align:left">${esc(m.name)}</span>${effectsOf(m.id).shield ? `<span class="tiny faint">scudo</span>` : ""}</button>`).join("")}</div>`);
}
async function usePrize(id, target) {
  const s = (S.wheel_spins || []).find(x => x.id === id);
  const value = s?.prize === "nick" ? ($("#nick-val")?.value || "").trim() : null;
  if (s?.prize === "nick" && (!value || value.length < 2)) return toast("Scrivi il soprannome");
  try {
    if (CLOUD) await rpcG("use_prize", { p_spin: id, p_target: target, p_value: value });
    else {
      if (effectsOf(target).shield) throw new Error("Ha lo scudo attivo: ritenta più tardi");
      await api.update("wheel_spins", { id }, { used_at: new Date().toISOString() });
      await api.insert("effects", { kind: s.prize, target, by: ME, value, until: new Date(Date.now() + 3600e3).toISOString() });
    }
    closeSheet(); await reload();
    toast(s.prize === "mute" ? `${mname(target)} è silenziato per un'ora` : `Da adesso ${mname(target)} è «${value}»`);
    if (CLOUD) api.insert("messages", { member_id: ME, role: "user", channel: "gruppo", content: s.prize === "mute" ? `La ruota ha parlato: ${mname(target)} resta in silenzio per un'ora.` : `La ruota ha parlato: per un'ora ${mname(target)} si chiama «${value}».` }).catch(() => {});
  } catch (e) { toast(e.message, "alert"); }
}
function wheelCard() {
  const inv = unusedPrizes();
  const todayFeed = (S.wheel_spins || []).filter(s => s.day === today() && s.member_id !== ME).slice(-5).reverse();
  const top = [...new Set(S.members.map(m => m.id))].map(id => ({ id, c: coinsOf(id) })).filter(x => x.c).sort((a, b) => b.c - a.c).slice(0, 3);
  return `<section class="card game-card wheel-card">
    <div class="row top"><div class="game-ico">${ico("star", 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">Ruota della fortuna</div>
      <div class="small muted" style="margin-top:6px">Un giro al giorno. Si vincono gettoni, titoli, scudi e il premio più ambito: silenziare un amico per un'ora.</div></div></div>
    <div class="wheel-box"><div class="wheel-pin"></div>${wheelSvg()}</div>
    <button class="btn pearl block" id="wheel-go" data-act="wheel-spin" ${canSpin() ? "" : "disabled"}>${canSpin() ? "Gira la ruota" : "Hai già girato: torna domani"}</button>
    ${inv.map(s => `<div class="li cb-inv"><div class="ib">${ico(s.prize === "mute" ? "lock" : "edit")}</div><div class="grow"><div class="t">${s.prize === "mute" ? "Silenzia qualcuno" : "Soprannome per un amico"}</div><div class="tiny faint">Da usare entro ${fmtTime(new Date(new Date(s.created_at).getTime() + 48 * 3600e3).toISOString())} di ${fmtDate(new Date(new Date(s.created_at).getTime() + 48 * 3600e3).toISOString(), { weekday: "long" })}</div></div><button class="btn sm primary" data-act="prize-use" data-id="${s.id}">Usa</button></div>`).join("")}
    ${todayFeed.length ? `<div class="label" style="margin:14px 0 6px">Oggi alla ruota</div>${todayFeed.map(s => `<div class="li">${avatar(member(s.member_id), "sm")}<div class="grow small"><b>${esc(mname(s.member_id))}</b> ha vinto ${s.prize === "coins" ? `${s.amount} gettoni` : s.prize === "title" ? `il titolo «${esc(s.label)}»` : (WHEEL.find(w => w.k === s.prize)?.label || "").toLowerCase()}</div></div>`).join("")}` : ""}
    ${top.length ? `<div class="tiny faint" style="margin-top:12px">Classifica della Fortuna: ${top.map((x, i) => `${i + 1}. ${esc(mname(x.id))} ${x.c}`).join(" · ")}</div>` : ""}
  </section>`;
}

// ───────────────────────── Enigma del giorno ─────────────────────────
// Risposte accettate già normalizzate; i numeri valgono anche scritti con la virgola.
const ENIGMI = [
  { q: "Un mattone pesa 1 kg più mezzo mattone. Quanto pesa un mattone (in kg)?", a: ["2"], h: "Chiama x il peso del mattone e scrivi l'equazione." },
  { q: "Una mazza e una palla costano insieme 1,10 €. La mazza costa 1 € più della palla. Quanti centesimi costa la palla?", a: ["5"], h: "Non sono 10. Se la palla costa x, la mazza costa x + 1." },
  { q: "100 lampadine spente in fila. La persona 1 tocca tutte, la 2 tocca le pari, la 3 i multipli di 3… fino alla 100: ogni tocco accende o spegne. Quante lampadine restano accese?", a: ["10"], h: "Una lampadina resta accesa se ha un numero dispari di divisori." },
  { q: "Con quanti zeri finisce 100! (il prodotto 1 × 2 × 3 × … × 100)?", a: ["24"], h: "Conta i fattori 5: non dimenticare il 25, il 50, il 75 e il 100." },
  { q: "Qual è il numero che segue: 1, 11, 21, 1211, 111221, …?", a: ["312211"], h: "Leggi ad alta voce il numero precedente." },
  { q: "Alle 3:15, quanti gradi ci sono tra la lancetta delle ore e quella dei minuti?", a: ["7.5"], h: "La lancetta delle ore non sta ferma sul 3." },
  { q: "12 monete identiche, una falsa che pesa diversamente (non sai se di più o di meno). Con una bilancia a due piatti, quante pesate servono al minimo per trovarla e dire se è più pesante o più leggera?", a: ["3"], h: "Ogni pesata ha tre esiti possibili." },
  { q: "Quanti quadrati di qualsiasi dimensione ci sono in una scacchiera 8×8?", a: ["204"], h: "Somma i quadrati da 1² a 8²." },
  { q: "Quante persone servono in una stanza perché la probabilità che due compiano gli anni lo stesso giorno superi il 50%?", a: ["23"], h: "Molte meno di quante pensi." },
  { q: "Due treni distanti 100 km si vengono incontro a 50 km/h ciascuno. Una mosca vola avanti e indietro tra loro a 75 km/h finché si scontrano. Quanti km percorre la mosca?", a: ["75"], h: "Non sommare la serie: calcola quanto tempo vola." },
  { q: "Un uomo guarda un ritratto e dice: «Fratelli e sorelle non ne ho, ma il padre di quell'uomo è il figlio di mio padre». Chi è nel ritratto?", a: ["figlio", "mio figlio"], h: "«Il figlio di mio padre», senza fratelli, è lui stesso." },
  { q: "Più ne togli, più diventa grande. Cos'è?", a: ["buca", "buco", "fossa"], h: "Pensa a una pala." },
  { q: "Fuori da una stanza chiusa ci sono tre interruttori, dentro una lampadina. Puoi entrare una sola volta. Oltre alla luce, quale proprietà della lampadina usi per capire quale interruttore la comanda?", a: ["calore", "caldo", "temperatura"], h: "Una lampadina accesa da un po' lascia una traccia anche da spenta." },
  { q: "Quante volte in 24 ore la lancetta delle ore e quella dei minuti si sovrappongono?", a: ["22"], h: "Non sono 24: ogni 12 ore ne perdi una." },
  { q: "Qual è l'ultima cifra di 7 elevato alla 2026?", a: ["9"], h: "Le ultime cifre delle potenze di 7 si ripetono ogni 4." },
  { q: "Quanti sono i numeri primi minori di 100?", a: ["25"], h: "Tra 1 e 50 sono 15." },
  { q: "Una lumaca in fondo a un pozzo di 10 metri sale 3 metri di giorno e scivola giù di 2 di notte. In quanti giorni esce?", a: ["8"], h: "L'ultimo giorno non scivola più." },
  { q: "5 macchine fanno 5 pezzi in 5 minuti. Quanti minuti impiegano 100 macchine a fare 100 pezzi?", a: ["5"], h: "Quanto ci mette una macchina a fare un pezzo?" },
  { q: "Una chiazza di ninfee raddoppia ogni giorno e copre tutto il lago in 48 giorni. In quanti giorni ne copre metà?", a: ["47"], h: "Ragiona all'indietro dal giorno 48." },
  { q: "In un gruppo di 12 persone ognuno stringe la mano a tutti gli altri una volta. Quante strette di mano in tutto?", a: ["66"], h: "12 × 11, ma ogni stretta la stai contando due volte." },
  { q: "Qual è il più piccolo numero divisibile per tutti i numeri da 1 a 10?", a: ["2520"], h: "Minimo comune multiplo: 2³ · 3² · 5 · 7." },
  { q: "In quanti modi diversi si possono sedere 5 persone attorno a un tavolo rotondo (le rotazioni contano come uguali)?", a: ["24"], h: "Fissa una persona e disponi le altre." },
  { q: "Il Leone mente il lunedì, il martedì e il mercoledì; l'Unicorno il giovedì, il venerdì e il sabato. Gli altri giorni dicono la verità. Oggi entrambi dicono: «Ieri era un mio giorno di bugie». Che giorno è?", a: ["giovedi"], h: "Per il Leone oggi è lunedì o giovedì." },
  { q: "Qual è il numero che segue: 2, 3, 5, 9, 17, …?", a: ["33"], h: "Guarda le differenze tra un numero e il successivo." },
  { q: "Numerando le pagine di un libro da 1 a 100, quante volte scrivi la cifra 9?", a: ["20"], h: "Contale nelle unità e poi nelle decine." },
  { q: "Nel cassetto al buio ci sono 10 calzini rossi e 10 blu. Quanti ne devi prendere al minimo per essere sicuro di avere una coppia dello stesso colore?", a: ["3"], h: "Principio dei cassetti." },
  { q: "Quale numero di quattro cifre, moltiplicato per 4, dà le stesse cifre in ordine inverso?", a: ["2178"], h: "Deve iniziare per 2 e finire per 8." },
  { q: "Il prodotto delle età delle tre figlie è 36 e la somma è il numero civico, che il postino conosce ma non basta. Poi il padre dice: «La maggiore suona il piano». Quanti anni ha la maggiore?", a: ["9"], h: "Solo due terne con prodotto 36 hanno la stessa somma." },
  { q: "Quanti divisori positivi ha il numero 360?", a: ["24"], h: "360 = 2³ · 3² · 5." },
  { q: "In quanti modi puoi salire una scala di 10 gradini facendo uno o due gradini alla volta?", a: ["89"], h: "Fibonacci." },
  { q: "Una corda è tesa attorno all'equatore. La allunghi di 1 metro e la sollevi uniformemente. Di quanti centimetri circa si alza da terra?", a: ["16", "15.9", "15.92"], h: "Non dipende dalla grandezza della Terra: 1 / (2π) metri." },
  { q: "Tre scatole hanno l'etichetta sbagliata: «mele», «arance», «miste». Pescando un solo frutto, da quale scatola devi pescare per correggere tutte le etichette?", a: ["miste", "mista"], h: "Quella che di sicuro non è mista." },
  { q: "Un re ha 1000 bottiglie, una avvelenata. Il veleno uccide in un giorno e lui ha un giorno solo. Quanti assaggiatori servono al minimo per trovarla?", a: ["10"], h: "Pensa in binario." },
  { q: "Quanto fa 1/(1·2) + 1/(2·3) + 1/(3·4) + … + 1/(99·100)? Scrivilo come decimale.", a: ["0.99", "99/100"], h: "1/(n(n+1)) = 1/n − 1/(n+1)." },
  { q: "Un orologio rintocca 6 volte in 5 secondi alle 6. Quanti secondi impiega a rintoccare 12 volte a mezzanotte?", a: ["11"], h: "Conta gli intervalli, non i rintocchi." },
  { q: "Ho tanti fratelli quante sorelle, ma ognuna delle mie sorelle ha il doppio dei fratelli rispetto alle sorelle. Quanti figli ci sono in famiglia?", a: ["7"], h: "Prova con 4 maschi e 3 femmine." },
];
// Indovinelli del giorno: una parola sola da indovinare. a = risposte accettate (senza articolo), h = indizio.
const INDOVINELLI = [
  { q: "Una scatola senza cardini, senza chiave e senza coperchio, eppure dentro custodisce un tesoro d'oro.", a: ["uovo"], h: "La apre il pulcino." },
  { q: "Vive senza respirare, è fredda come la morte; non ha mai sete eppure beve sempre; porta una cotta di maglia che non tintinna.", a: ["pesce"], h: "Le squame." },
  { q: "Trenta cavalli bianchi su una collina rossa: prima mordono, poi pestano, poi stanno fermi.", a: ["denti", "dente", "dentatura"], h: "Sono in bocca." },
  { q: "Ha radici che nessuno vede, è più alta degli alberi, sale e sale ma non cresce mai.", a: ["montagna", "monte"], h: "Ci si scia sopra." },
  { q: "Al mattino cammina con quattro zampe, a mezzogiorno con due, la sera con tre.", a: ["uomo", "essere umano", "persona"], h: "Lo chiese la Sfinge a Edipo; la terza zampa è un bastone." },
  { q: "Campo bianco, seme nero: cinque buoi lo tirano e tre lo tengono.", a: ["scrittura", "scrivere", "penna", "mano"], h: "Il campo è un foglio, i buoi sono le dita." },
  { q: "Il povero ce l'ha, al ricco manca, e se lo mangi muori.", a: ["niente", "nulla"], h: "Pensa a cosa non c'è." },
  { q: "Ha un occhio solo e una lunga coda: più corre, più la coda si accorcia.", a: ["ago"], h: "La coda è un filo." },
  { q: "Chi la fa non la dice, chi la prende non lo sa, chi lo sa non la prende.", a: ["moneta falsa", "banconota falsa", "soldi falsi", "denaro falso"], h: "Si spaccia." },
  { q: "Ti rispondo senza che tu mi chiami, ripeto soltanto le tue ultime parole, abito nelle valli e nelle grotte.", a: ["eco"], h: "Grida in montagna." },
  { q: "Sale senza gambe, scende senza scale, e quando è alta ti mette a letto.", a: ["febbre", "temperatura"], h: "Si misura sotto il braccio." },
  { q: "Gira tutta la casa e poi si mette in un angolo.", a: ["scopa"], h: "Pulisce, ma è anche un gioco di carte." },
  { q: "Cammina sulla testa tutto il giorno, e nessuno se ne accorge.", a: ["chiodo", "chiodo della scarpa", "chiodi"], h: "Sta sotto la suola." },
  { q: "Lo puoi prendere ma non lo puoi tenere a lungo.", a: ["respiro", "fiato"], h: "Trattienilo e capisci." },
  { q: "Si getta quando serve e si ritira quando non serve più.", a: ["ancora"], h: "In porto." },
  { q: "Cammina senza piedi, parla senza bocca e gira il mondo chiusa dentro una busta.", a: ["lettera"], h: "Il postino." },
  { q: "Ha la lingua ma non parla, ha i lacci ma non è una trappola, e ogni giorno la calpesti.", a: ["scarpa", "scarpe"], h: "Si allaccia." },
  { q: "Chi lo fabbrica lo vende, chi lo compra non lo usa, chi lo usa non lo vede.", a: ["bara", "cassa da morto", "feretro"], h: "Riguarda l'ultimo viaggio." },
  { q: "Ho città ma nessuna casa, foreste ma nessun albero, mari ma nessun pesce.", a: ["mappa", "cartina", "carta geografica", "atlante"], h: "La apri prima di partire." },
  { q: "Divora tutto: uccelli, bestie, fiori; rode il ferro e sbriciola la pietra. Nessuno lo ferma.", a: ["tempo"], h: "Scorre." },
  { q: "Grida senza voce, morde senza denti, sussurra senza bocca.", a: ["vento"], h: "Muove gli alberi." },
  { q: "Mi trovi una volta in un minuto, due volte in un momento, mai in cento anni.", a: ["m", "emme", "lettera m"], h: "Guarda le parole, non il tempo." },
  { q: "Più è sporca, più è bianca.", a: ["lavagna"], h: "A scuola." },
  { q: "Fa il giro del mondo restando sempre nello stesso angolo.", a: ["francobollo"], h: "Sta su una busta." },
  { q: "Se mi dai da mangiare vivo, se mi dai da bere muoio.", a: ["fuoco", "fiamma"], h: "Si spegne con l'acqua." },
  { q: "Ha mille occhi ma non vede niente; trattiene senza stringere.", a: ["rete"], h: "La usa il pescatore." },
  { q: "Ha una testa e una croce, ma nessun corpo.", a: ["moneta", "monetina"], h: "Si lancia per decidere." },
  { q: "Più ne togli, più divento grande.", a: ["buco", "buca", "fossa"], h: "Lo fai con una pala." },
  { q: "Più ne hai, meno ne vedi.", a: ["buio", "oscurità", "oscurita"], h: "Spegni la luce." },
  { q: "Ha dodici figli, ognuno con circa trenta figli, metà bianchi e metà neri.", a: ["anno"], h: "I figli neri sono le notti." },
  { q: "Lo hai davanti ma non lo vedi mai: quando arriva, è già diventato un'altra cosa.", a: ["domani", "futuro"], h: "Quando lo raggiungi si chiama oggi." },
  { q: "Più è vecchio più vale, eppure ogni anno lo vogliamo nuovo... in bottiglia.", a: ["vino"], h: "Si brinda." },
];
function riddleOfDay(day = today()) { return INDOVINELLI[((dayNum(day) * 5) % INDOVINELLI.length + INDOVINELLI.length) % INDOVINELLI.length]; }
const stripArt = s => norm(s).replace(/^(il|lo|la|i|gli|le|un|uno|una|l)\s+|^l'/, "").replace(/^l\s/, "").trim();
function checkRiddle(r, input) {
  const v = stripArt(String(input).replace(/'/g, " "));
  if (!v) return false;
  const stem = w => (w.length > 3 ? w.replace(/[aeiou]$/, "") : w);
  return r.a.some(a => { const n = stripArt(String(a).replace(/'/g, " ")); return v === n || (v.length === n.length && stem(v) === stem(n)) || v.split(" ").includes(n); });
}
const ENIGMA_KEY = "capodanno-enigma-";
function enigmaOfDay(day = today()) { return ENIGMI[((dayNum(day) * 7) % ENIGMI.length + ENIGMI.length) % ENIGMI.length]; }
function checkAnswer(e, input) {
  const v = norm(input);
  if (!v) return false;
  return e.a.some(a => { const n = norm(a); if (v === n) return true; const x = Number(v), y = Number(n); if (!Number.isNaN(x) && !Number.isNaN(y)) return Math.abs(x - y) < 1e-9; return v.split(" ").includes(n); });
}
function playEnigma(idx) {
  const daily = idx == null;
  const e = daily ? riddleOfDay() : ENIGMI[idx];
  const isRight = v => (daily ? checkRiddle(e, v) : checkAnswer(e, v));
  // Ogni indovinello ha la sua impronta: i tentativi contano solo per quello giusto (non per quelli di altre versioni).
  const rid = daily ? hashStr(e.q) : null;
  const key = ENIGMA_KEY + (daily ? today() + "-" + rid : "x" + idx) + "-" + ME;
  let st; try { st = JSON.parse(storage.get(key)) || {}; } catch { st = {}; }
  st.tries ||= 0;
  const myTry = daily ? (S.scores || []).find(s => s.game === "enigma" && s.member_id === ME && s.day === today() && s.meta?.rid === rid) : null;
  const official = daily && !myTry;
  // Tentativo già fatto (anche da un altro telefono): niente secondo tentativo, si vede l'esito e la parola.
  if (daily && !st.done && myTry) { st.done = true; st.won = !!(myTry.meta?.ok || myTry.score > 0); st.tries = 1; storage.set(key, JSON.stringify(st)); }
  const maxT = daily ? 1 : 3;
  openGame(`
    <div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">${daily ? "Indovinello del giorno" : `Enigma n. ${idx + 1}`}</div><div class="tiny faint">${daily ? "Una parola sola: o la sai o no" : "Allenamento · tre tentativi"}</div></div><span style="width:36px"></span></div>
    <div class="enigma">
      <div class="game-ico big">${ico("key", 36)}</div>
      <p class="enigma-q serif">${esc(e.q)}</p>
      ${daily ? `<div class="rd-slots" aria-label="${e.a[0].length} lettere">${[...e.a[0]].map(ch => (ch === " " ? `<i class="sp"></i>` : `<i></i>`)).join("")}</div><div class="tiny faint" style="text-align:center">Una parola${/ /.test(e.a[0]) ? "" : `, ${e.a[0].length} lettere`}</div>` : ""}
      <div id="en-hint" class="enigma-hint" ${st.hint ? "" : "hidden"}>${ico("key", 15)}${esc(e.h)}</div>
      <form id="en-form" class="row" style="gap:8px;margin-top:16px"><input name="a" placeholder="${daily ? "La parola" : "La tua risposta"}" autocomplete="off" style="flex:1" ${st.done ? "disabled" : ""}><button class="btn pearl" ${st.done ? "disabled" : ""}>Prova</button></form>
      <div class="row between" style="margin-top:10px"><span class="tiny faint" id="en-tries">${daily ? "" : `${maxT - st.tries} tentativi`}</span>${st.hint || st.done ? "" : `<button class="link tiny" id="en-hint-btn">${daily ? "Indizio (vale un punto in meno)" : "Indizio"}</button>`}</div>
      <div id="en-out"></div>
      ${daily ? "" : `<button class="btn block" style="margin-top:14px" data-act="enigma-next">Un altro enigma</button>`}
    </div>`);
  const save = () => storage.set(key, JSON.stringify(st));
  const out = msg => { $("#en-out").innerHTML = msg; };
  const whoGot = () => {
    // Chi ci ha preso oggi, chi no e chi deve ancora rispondere.
    const rows = (S.scores || []).filter(x => x.game === "enigma" && x.day === today() && x.meta?.rid === rid);
    const by = new Map(rows.map(r => [r.member_id, r]));
    return `<div class="who-got">${S.members.map(m => { const r = by.get(m.id); return `<div class="${r ? (r.meta?.ok || r.score > 0 ? "yes" : "no") : "wait"}">${avatar(m, "sm")}<span>${esc(m.name)}</span><b>${r ? (r.meta?.ok || r.score > 0 ? "giusto" : "sbagliato") : "non ancora"}</b></div>`; }).join("")}</div>`;
  };
  if (daily && st.done) setTimeout(() => { const o = $("#en-out"); if (o) o.insertAdjacentHTML("beforeend", whoGot()); }, 0);
  if (st.done) out(st.won ? `<div class="enigma-ok">Risolto. ${esc(e.a[0])}.</div>` : `<div class="enigma-ko">La risposta era: <b>${esc(e.a[0])}</b>.</div>`);
  $("#en-hint-btn")?.addEventListener("click", () => { st.hint = true; save(); $("#en-hint").hidden = false; $("#en-hint-btn").remove(); });
  $("#en-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const v = new FormData(ev.target).get("a");
    if (!String(v).trim() || st.done) return;
    st.tries++;
    if (isRight(v)) {
      st.done = st.won = true; save();
      const pts = daily ? (st.hint ? 2 : 3) : Math.max(1, 4 - st.tries - (st.hint ? 1 : 0));
      out(`<div class="enigma-ok">Esatto! ${official ? `+${pts} punti` : ""}</div>`);
      navigator.vibrate?.([30, 40, 30]); confettiBurst();
      if (official) { await saveScore("enigma", pts, { ok: true, answer: String(v).slice(0, 60), rid }); $("#en-out")?.insertAdjacentHTML("beforeend", whoGot()); }
      else { const solved = JSON.parse(storage.get(ENIGMA_KEY + "solved") || "[]"); solved.push(idx); storage.set(ENIGMA_KEY + "solved", JSON.stringify([...new Set(solved)])); }
    } else if (st.tries >= maxT) {
      st.done = true; save();
      out(`<div class="enigma-ko">${daily ? "Sbagliato" : "Niente da fare"}: era <b>${esc(e.a[0])}</b>.</div>`);
      if (official) { await saveScore("enigma", 0, { ok: false, answer: String(v).slice(0, 60), rid }); $("#en-out")?.insertAdjacentHTML("beforeend", whoGot()); }
    } else { save(); out(`<div class="enigma-ko">No. Ritenta.</div>`); $("#game .enigma").classList.add("shake"); setTimeout(() => $("#game .enigma")?.classList.remove("shake"), 400); }
    $("#en-tries").textContent = st.done || daily ? "" : `${maxT - st.tries} tentativi`;
    if (st.done) $$("#en-form input, #en-form button").forEach(x => { x.disabled = true; });
  });
}
function confettiBurst() {
  const c = document.createElement("div"); c.className = "confetti";
  c.innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="--x:${Math.random() * 200 - 100}vw;--d:${0.6 + Math.random() * 0.8}s;--r:${Math.random() * 720}deg;background:${["#e6d4ff", "#c9f3ee", "#9cc3ff", "#ffd27a", "#ff8f8f"][i % 5]}"></i>`).join("");
  document.body.appendChild(c); setTimeout(() => c.remove(), 1800);
}

// ───────────────────────── Ordine di grandezza (trivia) ─────────────────────────
// t: "y" anno (20 anni di errore = 0 punti), "l" scala logaritmica, numero = tolleranza lineare.
const CATS = [
  { k: "G", name: "Geografia", c: "#c9dcff" }, { k: "S", name: "Storia", c: "#e6d4ff" }, { k: "C", name: "Scienza", c: "#c9f3ee" },
  { k: "P", name: "Sport", c: "#dfe8ff" }, { k: "T", name: "Spettacolo", c: "#d9ccff" }, { k: "K", name: "Capodanno e Italia", c: "#f0e2ff" },
];
const TQ = [
  ["G", "Quanti metri è alto il Monte Bianco?", 4806, "m", 600], ["G", "Quanti km è lungo il Po?", 652, "km", "l"], ["G", "Quanti km² misura l'Italia?", 302068, "km²", "l"],
  ["G", "Quanti metri è alto l'Everest?", 8849, "m", 1200], ["G", "Quanti Stati fanno parte dell'Unione Europea?", 27, "", 10], ["G", "Quanti km separano Milano e Roma in linea d'aria?", 477, "km", "l"],
  ["G", "Quanti km è lungo il Nilo?", 6650, "km", "l"], ["G", "Quanti comuni ci sono in Italia (circa)?", 7896, "", "l"], ["G", "Quanti milioni di abitanti ha l'Italia?", 59, "milioni", "l"],
  ["G", "A quanti metri sul livello del mare si trova Chiavenna?", 333, "m", "l"], ["G", "Quanti milioni di abitanti ha Vienna?", 2, "milioni", "l"],
  ["S", "In che anno cadde il muro di Berlino?", 1989, "", "y"], ["S", "In che anno nacque il Regno d'Italia?", 1861, "", "y"], ["S", "In che anno Colombo arrivò in America?", 1492, "", "y"],
  ["S", "In che anno gli italiani scelsero la Repubblica con il referendum?", 1946, "", "y"], ["S", "In che anno fu presa la Bastiglia?", 1789, "", "y"], ["S", "In che anno l'uomo sbarcò sulla Luna?", 1969, "", "y"],
  ["S", "In che anno entrarono in circolazione monete e banconote in euro?", 2002, "", "y"], ["S", "In che anno cadde l'Impero romano d'Occidente?", 476, "", "y"], ["S", "In che anno fu introdotto il calendario gregoriano?", 1582, "", "y"],
  ["S", "In che anno morì Napoleone?", 1821, "", "y"], ["S", "Quanti anni durò la Guerra dei cent'anni?", 116, "anni", 30],
  ["C", "Quante ossa ha il corpo umano adulto?", 206, "", 60], ["C", "Quanti km al secondo percorre la luce nel vuoto?", 299792, "km/s", "l"], ["C", "Quanti km dista in media la Luna dalla Terra?", 384400, "km", "l"],
  ["C", "Quanti elementi ha la tavola periodica?", 118, "", 40], ["C", "Quanti cromosomi ha una cellula umana?", 46, "", 20], ["C", "A quanti gradi Celsius corrisponde lo zero assoluto?", -273, "°C", 60],
  ["C", "Quanti denti ha un adulto, denti del giudizio compresi?", 32, "", 12], ["C", "Che percentuale dell'aria è ossigeno?", 21, "%", 15], ["C", "Quanti anni luce dista Proxima Centauri?", 4.2, "anni luce", "l"],
  ["C", "Quanti minuti impiega la luce del Sole ad arrivare sulla Terra?", 8.3, "minuti", "l"], ["C", "Quanti gradi ci sono sulla superficie del Sole (°C, circa)?", 5500, "°C", "l"],
  ["P", "Quanti Mondiali di calcio ha vinto l'Italia?", 4, "", 3], ["P", "Quanti km è lunga una maratona?", 42.195, "km", 15], ["P", "Quanti centimetri è alto un canestro da basket?", 305, "cm", 80],
  ["P", "In che anno si corse il primo Giro d'Italia?", 1909, "", "y"], ["P", "In quanti secondi Bolt ha corso i 100 metri del record del mondo?", 9.58, "s", 0.6], ["P", "Quanti titoli mondiali ha vinto Valentino Rossi, tutte le classi?", 9, "", 5],
  ["P", "Quanti metri è lunga una piscina olimpionica?", 50, "m", 25], ["P", "Quante buche ha un percorso da golf regolamentare?", 18, "", 8], ["P", "Quanti punti servono per vincere un set di pallavolo (non il tie-break)?", 25, "", 10],
  ["P", "Quanti giocatori ha in campo una squadra di rugby a 15?", 15, "", 6], ["P", "Quanti titoli costruttori di Formula 1 ha vinto la Ferrari?", 16, "", 8],
  ["T", "In che anno uscì il primo film di Harry Potter?", 2001, "", "y"], ["T", "In che anno si tenne il primo Festival di Sanremo?", 1951, "", "y"], ["T", "Quanti minuti dura il film Titanic?", 194, "minuti", 60],
  ["T", "Quanti Oscar vinse Titanic?", 11, "", 6], ["T", "In che anno uscì al cinema il primo Star Wars?", 1977, "", "y"], ["T", "In che anno fu presentato il primo iPhone?", 2007, "", "y"],
  ["T", "In che anno uscì «La dolce vita» di Fellini?", 1960, "", "y"], ["T", "In che anno i Måneskin vinsero l'Eurovision?", 2021, "", "y"], ["T", "In che anno uscì «Thriller» di Michael Jackson?", 1982, "", "y"],
  ["T", "In che anno fu fondata Netflix?", 1997, "", "y"],
  ["K", "Quanti chicchi d'uva si mangiano a mezzanotte secondo la tradizione spagnola?", 12, "", 6], ["K", "Quante ore di differenza ci sono d'inverno tra l'Italia e New York?", 6, "ore", 4],
  ["K", "Quanti fusi orari attraversa la Russia?", 11, "", 6], ["K", "Quanti litri contiene una bottiglia Magnum?", 1.5, "litri", 1.5], ["K", "Quanti gradi alcolici ha di solito uno spumante?", 11.5, "% vol", 6],
  ["K", "Quante regioni ha l'Italia?", 20, "", 8], ["K", "Quanti abitanti ha Chiavenna, circa?", 7300, "", "l"], ["K", "Quante calorie ha un calice di spumante da 125 ml, circa?", 90, "kcal", "l"],
  ["K", "A quanti gradi si serve idealmente uno spumante?", 7, "°C", 6],
];
function triviaScore(q, guess) {
  const [, , a, , t] = q;
  if (guess == null || Number.isNaN(guess)) return 0;
  let p;
  if (t === "y") p = 100 - 5 * Math.abs(guess - a);
  else if (t === "l") p = guess <= 0 ? 0 : 100 * (1 - Math.abs(Math.log10(guess / a)) / 0.4);
  else p = 100 * (1 - Math.abs(guess - a) / t);
  return Math.max(0, Math.min(100, Math.round(p)));
}
function triviaRound(seed) {
  const rnd = seededRand(seed);
  return CATS.map(c => { const qs = TQ.filter(q => q[0] === c.k); return qs[Math.floor(rnd() * qs.length)]; });
}
function playTrivia(practice) {
  const official = !practice && !playedToday("trivia");
  const seed = practice ? Math.floor(Math.random() * 1e9) : dayNum() * 101;
  const qs = triviaRound(seed);
  let i = 0, total = 0;
  const res = [];
  openGame(`
    <div class="game-top"><button class="btn icon sm" data-act="close-game" aria-label="Chiudi">${ico("close", 18)}</button>
      <div class="grow" style="text-align:center"><div class="eyebrow">Ordine di grandezza</div><div class="tiny faint">${official ? "Partita del giorno · vale per la classifica" : "Allenamento"}</div></div><span class="num" id="tr-tot" style="width:44px;text-align:right">0</span></div>
    <div class="pie" id="tr-pie">${CATS.map((c, k) => `<i style="--c:${c.c};--k:${k}"></i>`).join("")}<b id="tr-n">1/6</b></div>
    <div id="tr-box" class="trivia"></div>`);
  const show = () => {
    const q = qs[i], c = CATS.find(x => x.k === q[0]);
    $("#tr-box").innerHTML = `<div class="tr-cat" style="--c:${c.c}">${c.name}</div>
      <p class="serif tr-q">${esc(q[1])}</p>
      <form id="tr-form"><div class="tr-in"><button type="button" class="tr-sign" id="tr-sign" aria-label="Cambia segno">±</button><input name="g" inputmode="decimal" placeholder="Il tuo numero" autocomplete="off" autofocus><span>${esc(q[3])}</span></div>
      <button class="btn pearl block" style="margin-top:12px">Conferma</button></form>
      <p class="tiny faint" style="text-align:center;margin-top:8px">Non serve la cifra esatta: più ci vai vicino, più punti (fino a 100).</p>`;
    $("#tr-n").textContent = `${i + 1}/6`;
    // La tastiera numerica dell'iPhone non ha il meno: lo mette questo tasto.
    $("#tr-sign").addEventListener("click", () => { const inp = $("#tr-form input[name=g]"); const v = inp.value.trim(); inp.value = v.startsWith("-") ? v.slice(1) : "-" + v; $("#tr-sign").classList.toggle("on", inp.value.startsWith("-")); inp.focus(); });
    $("#tr-form").addEventListener("submit", e => {
      e.preventDefault();
      const raw = String(new FormData(e.target).get("g")).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
      const g = parseFloat(String(new FormData(e.target).get("g")).replace(",", "."));
      const guess = Number.isNaN(g) ? parseFloat(raw) : g;
      const pts = triviaScore(q, guess);
      total += pts; res.push(pts);
      $("#tr-tot").textContent = total;
      if (pts >= 60) $$("#tr-pie i")[i].classList.add("on");
      navigator.vibrate?.(pts >= 90 ? [20, 30, 20] : 10);
      $("#tr-box").innerHTML = `<div class="tr-cat" style="--c:${c.c}">${c.name}</div>
        <div class="tr-res"><div class="tr-pts ${pts >= 90 ? "great" : pts >= 60 ? "ok" : "bad"}">+${pts}</div>
        <div class="small muted">Hai detto <b>${Number.isNaN(guess) ? "—" : guess.toLocaleString("it-IT")}</b>, la risposta è <b>${q[2].toLocaleString("it-IT")} ${esc(q[3])}</b></div>
        <div class="small" style="margin-top:6px">${pts === 100 ? "Centro perfetto." : pts >= 90 ? "Chirurgico." : pts >= 60 ? "Spicchio conquistato." : pts > 0 ? "Fuori di poco, o di tanto." : "Siamo in un altro ordine di grandezza."}</div></div>
        <button class="btn pearl block" id="tr-next" style="margin-top:16px">${i < 5 ? "Avanti" : "Risultato"}</button>`;
      $("#tr-next").onclick = () => { i++; if (i < 6) show(); else end(); };
    });
  };
  const end = async () => {
    const wedges = res.filter(p => p >= 60).length;
    $("#tr-box").innerHTML = `<div class="glass win"><div class="serif" style="font-size:40px">${total} punti</div>
      <div class="small muted">${wedges}/6 spicchi${wedges === 6 ? ": torta completa, applausi" : ""}</div><div id="tr-rank" class="small" style="margin-top:8px"></div>
      <div class="actions"><button class="btn" data-act="close-game">Chiudi</button><button class="btn primary" data-act="trivia-practice">Allenati ancora</button></div></div>`;
    if (wedges === 6) confettiBurst();
    if (official) { await saveScore("trivia", total, { wedges }); const r = myRank("trivia"); const el = $("#tr-rank"); if (el && r) el.innerHTML = `In classifica sei <b>${r.pos}°</b> su ${r.of}`; }
  };
  show();
}

// ───────────────────────── Onorevoli ─────────────────────────
// Cinque categorie, ognuna ne batte due e perde con le altre due:
// Showman (TV, giornalisti, comici) batte Tecnico e Statista: li trasforma in meme.
// Tecnico (economisti, burocrati) batte Tribuno e Rivoluzionario: i numeri smontano slogan e barricate.
// Tribuno (capipopolo, leader di piazza) batte Statista e Showman: la piazza urla più forte del palazzo e dello studio.
// Statista (grandi leader di governo) batte Rivoluzionario e Tecnico: istituzionalizza la rivoluzione e guida i tecnici.
// Rivoluzionario batte Showman e Tribuno: rovescia lo spettacolo e scavalca i capipopolo.
const TYPES = { S: { n: "Showman", c: "#c9f3ee" }, T: { n: "Tecnico", c: "#c9dcff" }, P: { n: "Tribuno", c: "#ffd0d0" }, C: { n: "Statista", c: "#e6d4ff" }, R: { n: "Rivoluzionario", c: "#ffe0a8" } };
const BEATS = { S: ["T", "C"], T: ["P", "R"], P: ["C", "S"], C: ["R", "T"], R: ["S", "P"] };
// Mossa: [nome, potenza, precisione, effetto]. Effetti: heal, atk+, def+, def-, atk-, stun (probabilità), multi (colpi).
const POLS = [
  { id: "berlusconi", n: "Silvio Berlusconi", t: "S", hp: 112, atk: 58, def: 48, spd: 50, m: [["Mi consenta", 42, 100], ["Meno male che Silvio c'è", 0, 100, "heal"], ["Il contratto con gli italiani", 0, 100, "atk+"], ["La barzelletta", 26, 95, "stun"]] },
  { id: "meloni", n: "Giorgia Meloni", t: "P", hp: 104, atk: 60, def: 50, spd: 58, m: [["Io sono Giorgia", 44, 100], ["È finita la pacchia", 58, 85], ["Pronti", 0, 100, "atk+"], ["Underdog", 0, 100, "heal"]] },
  { id: "salvini", n: "Matteo Salvini", t: "P", hp: 108, atk: 62, def: 44, spd: 52, m: [["Ruspa!", 62, 80], ["Prima gli italiani", 42, 100], ["Un bacione", 0, 100, "heal"], ["Pieni poteri", 0, 100, "atk+"]] },
  { id: "renzi", n: "Matteo Renzi", t: "C", hp: 98, atk: 60, def: 46, spd: 64, m: [["Enrico stai sereno", 30, 95, "stun"], ["First reaction: shock", 46, 100], ["Rottamazione", 58, 85], ["Leopolda", 0, 100, "atk+"]] },
  { id: "conte", n: "Giuseppe Conte", t: "T", hp: 104, atk: 54, def: 56, spd: 50, m: [["Avvocato del popolo", 0, 100, "heal"], ["Potenza di fuoco", 58, 85], ["Il DPCM", 22, 100, "stun"], ["Pochette", 0, 100, "def+"]] },
  { id: "schlein", n: "Elly Schlein", t: "P", hp: 100, atk: 56, def: 50, spd: 60, m: [["Non ci hanno visto arrivare", 52, 90], ["Armocromia", 0, 100, "def+"], ["Salario minimo", 42, 100], ["Testardamente unitari", 0, 100, "heal"]] },
  { id: "grillo", n: "Beppe Grillo", t: "S", hp: 106, atk: 62, def: 42, spd: 54, m: [["V-Day", 62, 80], ["Uno vale uno", 0, 100, "atk-"], ["Il Parlamento come una scatoletta di tonno", 56, 85], ["Tsunami Tour", 42, 100]] },
  { id: "dimaio", n: "Luigi Di Maio", t: "P", hp: 96, atk: 52, def: 48, spd: 62, m: [["Abbiamo abolito la povertà", 0, 100, "heal"], ["Il balcone", 0, 100, "atk+"], ["Congiuntivo creativo", 24, 95, "stun"], ["Cambio di casacca", 44, 100]] },
  { id: "bersani", n: "Pier Luigi Bersani", t: "C", hp: 108, atk: 52, def: 54, spd: 44, m: [["Smacchiare il giaguaro", 52, 95], ["Metafora emiliana", 26, 95, "stun"], ["Le lenzuolate", 42, 100], ["La Ditta", 0, 100, "def+"]] },
  { id: "andreotti", n: "Giulio Andreotti", t: "C", hp: 110, atk: 56, def: 58, spd: 40, m: [["Il potere logora chi non ce l'ha", 56, 90], ["A pensar male si fa peccato", 0, 100, "def-"], ["Divo Giulio", 0, 100, "heal"], ["Sette governi", 0, 100, "atk+"]] },
  { id: "sgarbi", n: "Vittorio Sgarbi", t: "S", hp: 98, atk: 64, def: 40, spd: 60, m: [["Capra! Capra! Capra!", 20, 95, "multi"], ["Ignorante!", 44, 100], ["Critica d'arte", 0, 100, "atk-"], ["Lite in diretta", 24, 95, "stun"]] },
  { id: "draghi", n: "Mario Draghi", t: "T", hp: 106, atk: 60, def: 56, spd: 46, m: [["Whatever it takes", 66, 80], ["Lo spread", 0, 100, "def-"], ["Governo dei migliori", 0, 100, "heal"], ["Silenzio stampa", 0, 100, "def+"]] },
  { id: "mentana", n: "Enrico Mentana", t: "S", hp: 100, atk: 58, def: 48, spd: 58, m: [["Maratona Mentana", 0, 100, "heal"], ["Blastata social", 52, 95], ["Ultim'ora", 40, 100], ["Exit poll", 26, 95, "stun"]] },
  { id: "vespa", n: "Bruno Vespa", t: "S", hp: 104, atk: 54, def: 52, spd: 46, m: [["Il plastico", 46, 100], ["Porta a Porta", 22, 100, "stun"], ["Il salotto", 0, 100, "heal"], ["Il libro di Natale", 42, 100]] },
  { id: "travaglio", n: "Marco Travaglio", t: "S", hp: 98, atk: 62, def: 44, spd: 56, m: [["Editoriale al vetriolo", 58, 85], ["Il Fatto", 42, 100], ["Querela", 0, 100, "atk-"], ["Retroscena", 24, 95, "stun"]] },
  { id: "dipietro", n: "Antonio Di Pietro", t: "P", hp: 106, atk: 58, def: 50, spd: 48, m: [["Che c'azzecca?", 26, 95, "stun"], ["Mani pulite", 58, 85], ["La toga", 0, 100, "def+"], ["Italia dei Valori", 0, 100, "heal"]] },
  { id: "prodi", n: "Romano Prodi", t: "T", hp: 108, atk: 52, def: 56, spd: 44, m: [["Mortadella", 0, 100, "heal"], ["L'Ulivo", 0, 100, "def+"], ["L'euro", 52, 95], ["In bicicletta", 42, 100]] },
  { id: "fornero", n: "Elsa Fornero", t: "T", hp: 100, atk: 56, def: 50, spd: 50, m: [["Choosy", 24, 100, "atk-"], ["Le lacrime", 0, 100, "heal"], ["Gli esodati", 54, 90], ["La riforma", 44, 100]] },
  // ── Altri italiani ──
  { id: "trota", n: "Renzo Bossi", w: "Renzo Bossi", t: "S", hp: 98, atk: 52, def: 46, spd: 58, m: [["Il Trota", 42, 100], ["La laurea in Albania", 0, 100, "heal"], ["Figlio d'arte", 52, 90], ["Consigliere regionale", 0, 100, "def+"]] },
  { id: "giannino", n: "Oscar Giannino", t: "T", hp: 100, atk: 56, def: 50, spd: 52, m: [["Fermare il declino", 52, 90], ["Il master a Chicago", 0, 100, "atk+"], ["Il papillon", 0, 100, "def+"], ["Lezione di economia", 42, 100]] },
  { id: "craxi", n: "Bettino Craxi", t: "C", hp: 108, atk: 60, def: 50, spd: 48, m: [["Sigonella", 56, 90], ["Il garofano", 0, 100, "atk+"], ["Decisionismo", 46, 100], ["Hammamet", 0, 100, "heal"]] },
  { id: "bossi", n: "Umberto Bossi", t: "P", hp: 106, atk: 60, def: 46, spd: 50, m: [["Roma ladrona", 50, 95], ["La canottiera", 0, 100, "def+"], ["Il dito medio", 28, 95, "stun"], ["Pontida", 0, 100, "atk+"]] },
  { id: "razzi", n: "Antonio Razzi", t: "S", hp: 102, atk: 54, def: 48, spd: 54, m: [["Amico di Kim", 28, 95, "stun"], ["L'italiano creativo", 44, 100], ["Gita a Pyongyang", 0, 100, "atk+"], ["La pensione", 0, 100, "heal"]] },
  { id: "monti", n: "Mario Monti", t: "T", hp: 106, atk: 56, def: 56, spd: 44, m: [["Salva Italia", 50, 95], ["Lo spread a 500", 0, 100, "def-"], ["Il loden", 0, 100, "def+"], ["Sobrietà", 42, 100]] },
  { id: "dalema", n: "Massimo D'Alema", t: "C", hp: 102, atk: 58, def: 52, spd: 48, m: [["Spocchia", 52, 90], ["La barca", 0, 100, "def+"], ["La Bicamerale", 0, 100, "atk-"], ["Il baffino", 44, 100]] },
  { id: "mastella", n: "Clemente Mastella", t: "P", hp: 104, atk: 52, def: 54, spd: 50, m: [["Ceppaloni", 42, 100], ["Cambio di maggioranza", 0, 100, "heal"], ["Il ponte per tutti", 0, 100, "def+"], ["Udeur", 50, 90]] },
  { id: "toninelli", n: "Danilo Toninelli", t: "S", hp: 98, atk: 54, def: 46, spd: 58, m: [["Il tunnel del Brennero", 28, 95, "stun"], ["Analisi costi-benefici", 0, 100, "def-"], ["Il gilet", 0, 100, "def+"], ["Gaffe in diretta", 46, 100]] },
  { id: "dibattista", n: "Alessandro Di Battista", t: "P", hp: 100, atk: 58, def: 46, spd: 60, m: [["Onestà!", 52, 95], ["Il viaggio in Sudamerica", 0, 100, "heal"], ["Il reportage", 42, 100], ["Il ritorno", 0, 100, "atk+"]] },
  { id: "calenda", n: "Carlo Calenda", t: "T", hp: 100, atk: 58, def: 50, spd: 54, m: [["Il thread su Twitter", 46, 100], ["Competenza", 50, 90], ["Litigio social", 28, 95, "stun"], ["Fronte repubblicano", 0, 100, "def+"]] },
  // ── Prima Repubblica e Risorgimento ──
  { id: "moro", n: "Aldo Moro", t: "C", hp: 106, atk: 54, def: 58, spd: 44, m: [["Le convergenze parallele", 48, 95], ["La pazienza democristiana", 0, 100, "heal"], ["La mediazione", 0, 100, "atk-"], ["Strategia dell'attenzione", 42, 100]] },
  { id: "berlinguer", n: "Enrico Berlinguer", t: "C", hp: 104, atk: 56, def: 54, spd: 48, m: [["La questione morale", 54, 90], ["L'austerità", 0, 100, "def+"], ["Eurocomunismo", 44, 100], ["Il compromesso storico", 0, 100, "heal"]] },
  { id: "pertini", n: "Sandro Pertini", t: "C", hp: 108, atk: 58, def: 50, spd: 50, m: [["Non ci prendono più!", 48, 95], ["La pipa", 0, 100, "heal"], ["Il partigiano", 54, 90], ["Il Presidente più amato", 0, 100, "atk+"]] },
  { id: "garibaldi", n: "Giuseppe Garibaldi", t: "R", hp: 110, atk: 62, def: 48, spd: 56, m: [["Qui si fa l'Italia o si muore", 56, 90], ["Obbedisco", 0, 100, "heal"], ["La camicia rossa", 0, 100, "atk+"], ["Teano", 44, 100]] },
  { id: "cavour", n: "Camillo Benso di Cavour", t: "T", hp: 102, atk: 56, def: 54, spd: 50, m: [["Libera Chiesa in libero Stato", 48, 95], ["La diplomazia", 0, 100, "atk-"], ["Il Connubio", 0, 100, "def+"], ["La Crimea", 50, 90]] },
  // ── Il mondo e la storia ──
  { id: "stalin", n: "Iosif Stalin", t: "R", hp: 114, atk: 62, def: 54, spd: 42, m: [["Piano quinquennale", 0, 100, "atk+"], ["I baffi d'acciaio", 50, 95], ["La cortina di ferro", 0, 100, "def+"], ["Collettivizzazione", 58, 85]] },
  { id: "che", n: "Che Guevara", t: "R", hp: 100, atk: 62, def: 44, spd: 62, m: [["Hasta la victoria siempre", 54, 90], ["Guerriglia", 20, 95, "multi"], ["La motocicletta", 0, 100, "heal"], ["Il basco", 0, 100, "def+"]] },
  { id: "castro", n: "Fidel Castro", t: "R", hp: 110, atk: 56, def: 54, spd: 44, m: [["Il discorso di sette ore", 26, 100, "stun"], ["La Rivoluzione", 52, 90], ["Il sigaro", 0, 100, "heal"], ["La barba", 0, 100, "def+"]] },
  { id: "napoleone", n: "Napoleone Bonaparte", t: "C", hp: 104, atk: 64, def: 48, spd: 56, m: [["Austerlitz", 58, 85], ["Il Codice civile", 44, 100], ["Il bicorno", 0, 100, "def+"], ["I cento giorni", 0, 100, "heal"]] },
  { id: "cesare", n: "Giulio Cesare", w: "Gaio Giulio Cesare", t: "C", hp: 106, atk: 62, def: 50, spd: 54, m: [["Veni, vidi, vici", 52, 95], ["Alea iacta est", 0, 100, "atk+"], ["Il Rubicone", 46, 100], ["Le legioni", 0, 100, "def+"]] },
  { id: "churchill", n: "Winston Churchill", t: "C", hp: 112, atk: 58, def: 56, spd: 40, m: [["Sangue, fatica, lacrime e sudore", 56, 90], ["Whisky alle undici", 0, 100, "heal"], ["Mai arrendersi", 0, 100, "def+"], ["La V di vittoria", 44, 100]] },
  { id: "lenin", n: "Vladimir Lenin", t: "R", hp: 102, atk: 58, def: 50, spd: 52, m: [["Le tesi di aprile", 48, 95], ["Che fare?", 0, 100, "atk-"], ["Il treno piombato", 44, 100], ["Il mausoleo", 0, 100, "heal"]] },
  { id: "kennedy", n: "John Fitzgerald Kennedy", t: "C", hp: 100, atk: 58, def: 48, spd: 60, m: [["Non chiederti cosa può fare il tuo paese", 54, 90], ["Ich bin ein Berliner", 46, 100], ["Il sorriso", 0, 100, "heal"], ["La Nuova Frontiera", 0, 100, "atk+"]] },
  { id: "obama", n: "Barack Obama", t: "C", hp: 102, atk: 56, def: 52, spd: 58, m: [["Yes we can", 46, 100], ["Il microfono che cade", 56, 85], ["Obamacare", 0, 100, "heal"], ["Il discorso", 0, 100, "atk+"]] },
  { id: "trump", n: "Donald Trump", t: "P", hp: 108, atk: 62, def: 46, spd: 50, m: [["You're fired!", 56, 85], ["Fake news!", 28, 95, "stun"], ["Il muro", 0, 100, "def+"], ["Covfefe", 0, 100, "atk-"]] },
  { id: "thatcher", n: "Margaret Thatcher", t: "C", hp: 106, atk: 58, def: 58, spd: 44, m: [["La Lady di ferro", 54, 90], ["No, no, no!", 28, 95, "stun"], ["Privatizzazioni", 46, 100], ["The lady's not for turning", 0, 100, "def+"]] },
  { id: "merkel", n: "Angela Merkel", t: "T", hp: 110, atk: 54, def: 60, spd: 42, m: [["Il rigore dei conti", 50, 95], ["Wir schaffen das", 0, 100, "heal"], ["Le mani a rombo", 0, 100, "def+"], ["Lo sguardo di sbieco", 28, 95, "stun"]] },
  { id: "degaulle", n: "Charles de Gaulle", t: "C", hp: 106, atk: 58, def: 52, spd: 46, m: [["L'appello del 18 giugno", 54, 90], ["Vive le Québec libre!", 46, 100], ["La grandeur", 0, 100, "atk+"], ["Je vous ai compris", 0, 100, "heal"]] },
  { id: "gandhi", n: "Mahatma Gandhi", t: "R", hp: 104, atk: 50, def: 60, spd: 50, m: [["La marcia del sale", 50, 95], ["Resistenza passiva", 0, 100, "def+"], ["Il digiuno", 0, 100, "heal"], ["Sii il cambiamento", 44, 100]] },
  { id: "lincoln", n: "Abraham Lincoln", t: "C", hp: 108, atk: 58, def: 54, spd: 46, m: [["Governo del popolo, dal popolo, per il popolo", 54, 90], ["Gettysburg", 46, 100], ["Il cilindro", 0, 100, "def+"], ["La barba", 0, 100, "heal"]] },
  // ── TV trash ──
  { id: "malgioglio", n: "Cristiano Malgioglio", t: "S", hp: 100, atk: 56, def: 48, spd: 58, m: [["Che ansiaaa!", 28, 95, "stun"], ["Il giudizio di Malgy", 48, 95], ["Il ciuffo bianco", 0, 100, "def+"], ["Tormentone estivo", 44, 100]] },
  { id: "durso", n: "Barbara D'Urso", t: "S", hp: 106, atk: 56, def: 52, spd: 52, m: [["Col cuore", 0, 100, "heal"], ["Lo scoop in esclusiva", 50, 95], ["L'ospite in collegamento", 28, 95, "stun"], ["Pomeriggio Cinque", 44, 100]] },
  { id: "corona", n: "Fabrizio Corona", t: "S", hp: 102, atk: 62, def: 44, spd: 58, m: [["Lo scandalo", 54, 90], ["Il paparazzo", 46, 100], ["Diretta Instagram", 28, 95, "stun"], ["Il tatuaggio", 0, 100, "def+"]] },
  { id: "marini", n: "Valeria Marini", t: "S", hp: 100, atk: 54, def: 48, spd: 56, m: [["Stellare!", 48, 95], ["Lo sguardo da diva", 28, 95, "stun"], ["La linea di costumi", 0, 100, "atk+"], ["Il bacio", 0, 100, "heal"]] },
  { id: "lamborghini", n: "Elettra Lamborghini", t: "S", hp: 98, atk: 58, def: 44, spd: 62, m: [["Il twerking", 20, 95, "multi"], ["Pem pem", 46, 100], ["La parrucca rosa", 0, 100, "def+"], ["Il patrimonio di famiglia", 0, 100, "heal"]] },
  { id: "vacchi", n: "Gianluca Vacchi", t: "S", hp: 102, atk: 56, def: 50, spd: 56, m: [["Enjoy", 46, 100], ["Balletto sullo yacht", 20, 95, "multi"], ["I tatuaggi", 0, 100, "def+"], ["La barba bianca", 0, 100, "atk+"]] },
  { id: "casella", n: "Giucas Casella", t: "S", hp: 100, atk: 54, def: 50, spd: 50, m: [["L'ipnosi", 30, 95, "stun"], ["Quando lo dico io!", 50, 95], ["Le mani incollate", 0, 100, "atk-"], ["Il trucco", 44, 100]] },
  { id: "tina", n: "Tina Cipollari", t: "S", hp: 104, atk: 60, def: 48, spd: 50, m: [["Il commento al vetriolo", 52, 90], ["Lo sguardo di Tina", 28, 95, "stun"], ["Il cartello", 46, 100], ["La poltrona in studio", 0, 100, "def+"]] },
  { id: "gemma", n: "Gemma Galgani", t: "S", hp: 108, atk: 50, def: 54, spd: 46, m: [["La sfilata", 0, 100, "atk+"], ["Il ballo col cavaliere", 44, 100], ["L'ennesimo cuore spezzato", 50, 90], ["Il trono over", 0, 100, "heal"]] },
  { id: "signorini", n: "Alfonso Signorini", t: "S", hp: 102, atk: 56, def: 52, spd: 50, m: [["La busta", 28, 95, "stun"], ["Il gossip", 44, 100], ["Il Grande Fratello", 50, 95], ["La copertina", 0, 100, "atk+"]] },
];
// Gruppi per il filtro nella scelta della squadra.
const POL_TV = ["malgioglio", "durso", "corona", "marini", "lamborghini", "vacchi", "casella", "tina", "gemma", "signorini"];
const POL_GROUP = id => (POL_TV.includes(id) ? "tv" : ["moro", "berlinguer", "pertini", "garibaldi", "cavour", "andreotti", "craxi"].includes(id) ? "storia-it"
  : ["stalin", "che", "castro", "napoleone", "cesare", "churchill", "lenin", "kennedy", "obama", "trump", "thatcher", "merkel", "degaulle", "gandhi", "lincoln"].includes(id) ? "mondo" : "oggi");
const polInitials = n => n.split(" ").map(w => w[0]).join("").slice(0, 2);
// Le facce: le foto di Wikipedia (licenze libere), scaricate una volta e ricordate sul telefono.
const POL_FACES_KEY = "capodanno-volti-2";
let polFaces = {}; try { polFaces = JSON.parse(storage.get(POL_FACES_KEY) || "{}") || {}; } catch { polFaces = {}; }
let polFacesAsked = false;
// Una richiesta per personaggio alla scheda di Wikipedia (italiana, poi inglese): prende la foto principale.
async function fetchPolFace(host, title) {
  const r = await fetch(`https://${host}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.thumbnail?.source || d.originalimage?.source || null;
}
async function loadPolFaces() {
  if (polFacesAsked) return; polFacesAsked = true;
  const missing = POLS.filter(p => !polFaces[p.id] && (LOCAL_FAIL.has(p.id) || !LOCAL_FACE.has(p.id)));
  if (!missing.length) return;
  await Promise.all(missing.map(async p => {
    for (const host of ["it", "en"]) {
      try { const u = await fetchPolFace(host, p.w || p.n); if (u && /^https:\/\/upload\.wikimedia\.org\//.test(u)) { polFaces[p.id] = u; break; } } catch { /* senza rete restano le iniziali */ }
    }
  }));
  storage.set(POL_FACES_KEY, JSON.stringify(polFaces));
  $$(".pol-face[data-pol]").forEach(el => { const u = polFaces[el.dataset.pol]; if (u && !el.querySelector("img")) el.insertAdjacentHTML("beforeend", `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer" onerror="polFaceErr(this)">`); });
}
// Prima la foto salvata nell'app (cartella volti/), se manca quella presa da Wikipedia, se manca anche quella le iniziali.
const LOCAL_FACE = new Set(POLS.map(p => p.id));
const LOCAL_FAIL = new Set();
window.polFaceErr = img => {
  const box = img.closest(".pol-face"), id = box?.dataset.pol; img.remove();
  if (!id) return;
  if (img.dataset.local) { LOCAL_FAIL.add(id); if (polFaces[id]) $$(`.pol-face[data-pol="${id}"]`).forEach(el => { if (!el.querySelector("img")) el.insertAdjacentHTML("beforeend", `<img src="${esc(polFaces[id])}" alt="" referrerpolicy="no-referrer" onerror="polFaceErr(this)">`); }); else { clearTimeout(window.__pfT); window.__pfT = setTimeout(() => { polFacesAsked = false; loadPolFaces(); }, 300); } }
};
const polFace = (p, cls = "") => {
  const local = LOCAL_FACE.has(p.id) && !LOCAL_FAIL.has(p.id);
  const src = local ? `volti/${p.id}.jpg` : polFaces[p.id];
  return `<div class="pol-face ${cls}" data-pol="${p.id}" style="--c:${TYPES[p.t].c}"><span>${polInitials(p.n)}</span>${src ? `<img src="${esc(src)}" alt="" ${local ? 'data-local="1"' : 'referrerpolicy="no-referrer"'} onerror="polFaceErr(this)">` : ""}</div>`;
};
const polCard = (p, cls = "") => `<div class="pol ${cls}" style="--c:${TYPES[p.t].c}">${polFace(p)}<div class="pol-name">${esc(p.n)}</div><div class="pol-type">${TYPES[p.t].n}</div></div>`;
// ───────────────────────── Schede nei Giochi ─────────────────────────

window.games2Cards = function () {
  const en = myRank("enigma"), tr = myRank("trivia"), on = myRank("onorevoli");
  const enDone = playedToday("enigma"), trDone = playedToday("trivia");
  return `
  ${wheelCard()}
  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("key", 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">Enigma del giorno</div>
      <div class="small muted" style="margin-top:6px">Uno al giorno, uguale per tutti, volutamente cattivo. Tre tentativi; l'indizio costa un punto.${en ? ` Tu: ${en.s.score} pt, ${en.pos}°.` : ""}</div></div></div>
    <div class="grid2" style="margin-top:14px;gap:8px">
      <button class="btn ${enDone ? "" : "pearl"} block" data-act="play-enigma">${enDone ? "Rivedi l'enigma" : "Risolvi"}</button>
      <button class="btn block" data-act="enigma-next">Archivio</button></div>
  </section>
  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("chart", 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">Ordine di grandezza</div>
      <div class="small muted" style="margin-top:6px">Il Trivial al contrario: sei categorie, ma rispondi con un numero. Non serve saperlo, serve andarci vicino. Sei spicchi per la torta.${tr ? ` Record: ${tr.s.score}.` : ""}</div></div></div>
    <div class="grid2" style="margin-top:14px;gap:8px">
      <button class="btn ${trDone ? "" : "pearl"} block" data-act="play-trivia">${trDone ? "Fatta oggi" : "Partita del giorno"}</button>
      <button class="btn block" data-act="trivia-practice">Allenamento</button></div>
  </section>
  <section class="card game-card">
    <div class="row top"><div class="game-ico">${ico("trophy", 30)}</div><div class="grow"><div class="serif" style="font-size:28px;line-height:1">Onorevoli</div>
      <div class="small muted" style="margin-top:6px">Politici e giornalisti in lotta a turni, con le loro frasi celebri come mosse. Sfida un amico o resisti alle legislature.${on ? ` Record: ${on.s.score}.` : ""}</div></div></div>
    <button class="btn pearl block" style="margin-top:14px" data-act="play-onorevoli">In aula</button>
  </section>`;
};
window.games2Ranks = () => `${rankCard("enigma")}${rankCard("trivia")}${rankCard("onorevoli")}`;

Object.assign(ACTIONS, {
  "wheel-spin": () => spin(),
  "prize-use": el => sheetUsePrize(el.dataset.id),
  "prize-target": el => usePrize(el.dataset.id, el.dataset.t),
  "play-enigma": () => playEnigma(),
  "enigma-next": () => {
    const solved = new Set(JSON.parse(storage.get(ENIGMA_KEY + "solved") || "[]"));
    const left = ENIGMI.map((_, i) => i).filter(i => !solved.has(i));
    if (!left.length) return toast("Li hai risolti tutti. Rispetto.");
    playEnigma(left[Math.floor(Math.random() * left.length)]);
  },
  "play-trivia": () => playTrivia(false),
  "trivia-practice": () => playTrivia(true),
  "play-onorevoli": () => playOnorevoli(),
});
