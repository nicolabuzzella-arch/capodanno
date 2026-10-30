/* Capodanno - app di gruppo.
   Due motori dati con la stessa interfaccia:
   - Cloud: Supabase (dati condivisi in tempo reale + assistente AI)
   - Local: modalità prova, tutto su questo telefono (quando config.js è vuoto) */
"use strict";

const CFG = window.CAPODANNO_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
const TABLES = ["trip", "members", "member_private", "polls", "poll_options", "votes", "bookings", "expenses", "itinerary", "checklist", "messages"];
const CACHE_KEY = "capodanno-cache-v1";
const CODE_KEY = "capodanno-code";

// ───────────────────────── Utilità ─────────────────────────

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
const eur = n => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const today = () => new Date().toISOString().slice(0, 10);
const byCreated = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
const safeUrl = u => { u = String(u || "").trim(); if (!u) return ""; return /^https?:\/\//i.test(u) ? u : "https://" + u.replace(/^[a-z]+:/i, ""); };
const telUrl = p => "tel:" + String(p || "").replace(/[^\d+]/g, "");
const waUrl = p => { let d = String(p || "").replace(/[^\d+]/g, "").replace(/^\+/, ""); if (d.length === 10 && d.startsWith("3")) d = "39" + d; return "https://wa.me/" + d; };
const mapsUrl = a => "https://maps.apple.com/?q=" + encodeURIComponent(a);
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtDate = (d, opts = { weekday: "short", day: "numeric", month: "short" }) => {
  if (!d) return "";
  const x = typeof d === "string" && d.length === 10 ? new Date(d + "T12:00:00") : new Date(d);
  return isNaN(x) ? "" : x.toLocaleDateString("it-IT", opts);
};
const fmtDateTime = d => {
  if (!d) return "";
  const x = new Date(d);
  return isNaN(x) ? "" : x.toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const toLocalInput = d => {
  if (!d) return "";
  const x = new Date(d); if (isNaN(x)) return "";
  const p = n => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};
const fromLocalInput = v => (v ? new Date(v).toISOString() : null);

const PALETTE = ["#8B7CFF", "#FF5C8A", "#4FD1C5", "#F6C453", "#5AA9FF", "#34D399", "#FFA94D", "#E879F9"];
const colorFor = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; };
const avatar = (m, cls = "") => m
  ? `<span class="avatar ${cls}" style="background:${colorFor(m.name)}33" title="${esc(m.name)}">${esc(m.emoji || "🙂")}</span>`
  : `<span class="avatar ${cls}">✨</span>`;

const EMOJIS = ["🥳", "🍾", "🎆", "🦄", "🐻", "🦊", "🐼", "🐯", "🐸", "🐧", "🦁", "🐨", "🌶️", "🍕", "🎸", "⚽️", "🌈", "⭐️", "🔥", "💃", "🕺", "😎", "🤠", "👑"];

const CATEGORIES = {
  alloggio: { label: "Alloggio", icon: "🏨" },
  viaggio: { label: "Viaggio", icon: "🚆" },
  cenone: { label: "Cenone", icon: "🍾" },
  serata: { label: "Serata / evento", icon: "🎉" },
  ristorante: { label: "Ristorante", icon: "🍽️" },
  attivita: { label: "Attività", icon: "🎿" },
  auto: { label: "Auto / parcheggio", icon: "🚗" },
  altro: { label: "Altro", icon: "📦" },
};
const STATUSES = { idea: "Idea", da_prenotare: "Da prenotare", prenotato: "Prenotato", pagato: "Pagato", annullato: "Annullato" };
const EXP_CATS = { alloggio: "🏨 Alloggio", viaggio: "🚆 Viaggio", cibo: "🍽️ Cibo", serata: "🎉 Serata", spesa: "🛒 Spesa", attivita: "🎿 Attività", rimborso: "💸 Rimborso", altro: "📦 Altro" };
const RSVP = { si: "Ci sono", forse: "Forse", no: "Non vengo" };
const DOC_TYPES = ["Carta d'identità", "Passaporto", "Patente"];

const POLL_TEMPLATES = [
  { q: "Che tipo di Capodanno vogliamo?", multi: true, opts: ["Città d'arte italiana", "Capitale europea", "Montagna e neve", "Posto caldo / mare", "Villa o casa in campagna"] },
  { q: "Dove andiamo?", d: "Aggiungi le tue proposte! Puoi anche chiedere all'assistente di cercare idee con i prezzi.", opts: [] },
  { q: "Quali date?", opts: ["30 dic → 1 gen", "31 dic → 2 gen", "29 dic → 1 gen (un giorno in più)"] },
  { q: "Budget a persona, tutto incluso?", opts: ["Fino a 250 €", "250 – 450 €", "450 – 700 €", "Oltre 700 €"] },
  { q: "Come ci muoviamo?", multi: true, opts: ["Auto", "Treno", "Aereo", "Indifferente"] },
  { q: "Dove dormiamo?", opts: ["Hotel", "Appartamento / villa", "Agriturismo / baita", "Indifferente"] },
  { q: "Il cenone del 31?", opts: ["Ristorante con menu di Capodanno", "Cuciniamo insieme a casa", "Festa o evento con cena inclusa", "Cena leggera e poi festa"] },
];

const AI_SUGGESTIONS = [
  "Proponi 5 destinazioni per Capodanno con prezzi indicativi e crea un sondaggio",
  "Che eventi ci sono la notte del 31 dove andiamo?",
  "Quanto ci costa a testa finora?",
  "Prepara la lista ospiti da mandare all'hotel",
  "Cosa manca ancora da prenotare?",
  "Dove mangiamo stasera vicino all'alloggio?",
];

// ───────────────────────── Motore Cloud (Supabase) ─────────────────────────

const Cloud = {
  sb: null,
  async init() {
    this.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await this.sb.auth.getSession();
    if (!data.session) {
      const r = await this.sb.auth.signInAnonymously();
      if (r.error) throw r.error;
    }
  },
  ok(r) { if (r.error) throw new Error(r.error.message); return r.data; },
  async whoami() { return this.ok(await this.sb.from("devices").select("member_id").maybeSingle())?.member_id || null; },
  async preview(code) { return this.ok(await this.sb.rpc("trip_preview", { p_code: code })); },
  async join(code, name, emoji, pin) { return this.ok(await this.sb.rpc("join_trip", { p_code: code, p_name: name, p_emoji: emoji, p_pin: pin })); },
  async rejoin(code, member, pin) {
    const id = this.ok(await this.sb.rpc("rejoin_trip", { p_code: code, p_member: member, p_pin: pin }));
    if (!id) throw new Error("PIN sbagliato");
    return id;
  },
  async resetPin(member, pin) { return this.ok(await this.sb.rpc("reset_pin", { p_member: member, p_pin: pin })); },
  async leave() { await this.sb.rpc("leave_device"); },
  async loadAll() {
    const res = await Promise.all(TABLES.map(t => t === "messages"
      ? this.sb.from(t).select("*").order("created_at", { ascending: false }).limit(300)
      : this.sb.from(t).select("*")));
    const out = {};
    TABLES.forEach((t, i) => { out[t] = this.ok(res[i]) || []; });
    return out;
  },
  async insert(t, row) { return this.ok(await this.sb.from(t).insert(row).select().single()); },
  async upsert(t, row) { return this.ok(await this.sb.from(t).upsert(row).select().single()); },
  async update(t, match, patch) { let q = this.sb.from(t).update(patch); for (const k in match) q = q.eq(k, match[k]); return this.ok(await q); },
  async remove(t, match) { let q = this.sb.from(t).delete(); for (const k in match) q = q.eq(k, match[k]); return this.ok(await q); },
  subscribe(cb) {
    this.sb.channel("tutto").on("postgres_changes", { event: "*", schema: "public" }, cb).subscribe();
  },
  async ask(message) {
    const { data, error } = await this.sb.functions.invoke("assistente", { body: { message } });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch { /* risposta non JSON */ }
      throw new Error(msg);
    }
    return data;
  },
};

// ───────────────────────── Motore Local (modalità prova) ─────────────────────────

const Local = {
  KEY: "capodanno-demo-v1", ME: "capodanno-demo-me", db: null, cb: null,
  async init() {
    try { this.db = JSON.parse(localStorage.getItem(this.KEY)); } catch { this.db = null; }
    if (!this.db) {
      this.db = Object.fromEntries(TABLES.map(t => [t, []]));
      this.db.trip = [{ id: 1, name: "Capodanno", invite_code: "DEMO", destination: null, start_date: null, end_date: null, notes: null }];
      this.db.secrets = {};
      this.save();
    }
    addEventListener("storage", e => { if (e.key === this.KEY) { this.db = JSON.parse(e.newValue); this.cb && this.cb(); } });
  },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.db)); },
  changed() { this.save(); setTimeout(() => this.cb && this.cb(), 0); },
  async whoami() { const id = localStorage.getItem(this.ME); return this.db.members.some(m => m.id === id) ? id : null; },
  checkCode(code) { if (String(code).trim().toUpperCase() !== this.db.trip[0].invite_code.toUpperCase()) throw new Error("Codice invito non valido"); },
  async preview(code) {
    try { this.checkCode(code); } catch { return null; }
    return { name: this.db.trip[0].name, members: this.db.members.map(({ id, name, emoji }) => ({ id, name, emoji })) };
  },
  async join(code, name, emoji, pin) {
    this.checkCode(code);
    if (!/^\d{4}$/.test(pin)) throw new Error("Il PIN deve avere 4 cifre");
    if (name.trim().length < 2) throw new Error("Scrivi il tuo nome");
    if (this.db.members.some(m => m.name.toLowerCase() === name.trim().toLowerCase())) throw new Error("Questo nome è già nel gruppo: torna indietro e tocca il tuo nome");
    const m = this.defaults("members", { name: name.trim(), emoji, is_admin: this.db.members.length === 0 });
    this.db.members.push(m);
    this.db.secrets[m.id] = pin;
    localStorage.setItem(this.ME, m.id);
    this.changed();
    return m.id;
  },
  async rejoin(code, member, pin) {
    this.checkCode(code);
    if (this.db.secrets[member] !== pin) throw new Error("PIN sbagliato");
    localStorage.setItem(this.ME, member);
    return member;
  },
  async resetPin(member, pin) { this.db.secrets[member] = pin; this.save(); },
  async leave() { localStorage.removeItem(this.ME); },
  async loadAll() { const c = JSON.parse(JSON.stringify(this.db)); delete c.secrets; return c; },
  defaults(t, row) {
    const base = { id: uuid(), created_at: new Date().toISOString() };
    const d = {
      members: { emoji: "🙂", rsvp: "forse", car_seats: 0, is_admin: false },
      polls: { kind: "single", allow_add: true, status: "open" },
      bookings: { status: "idea", category: "altro" },
      expenses: { spent_on: today(), category: "altro" },
      checklist: { done: false },
    }[t] || {};
    return { ...base, ...d, ...row };
  },
  match(row, m) { return Object.keys(m).every(k => row[k] === m[k]); },
  async insert(t, row) { const r = this.defaults(t, row); this.db[t].push(r); this.changed(); return r; },
  async upsert(t, row) {
    const key = t === "member_private" ? "member_id" : "id";
    const i = this.db[t].findIndex(r => r[key] === row[key]);
    if (i >= 0) this.db[t][i] = { ...this.db[t][i], ...row }; else this.db[t].push({ ...row });
    this.changed(); return row;
  },
  async update(t, m, patch) { this.db[t] = this.db[t].map(r => (this.match(r, m) ? { ...r, ...patch } : r)); this.changed(); },
  async remove(t, m) {
    this.db[t] = this.db[t].filter(r => !this.match(r, m));
    if (t === "polls" && m.id) { this.db.poll_options = this.db.poll_options.filter(o => o.poll_id !== m.id); this.db.votes = this.db.votes.filter(v => v.poll_id !== m.id); }
    if (t === "poll_options" && m.id) this.db.votes = this.db.votes.filter(v => v.option_id !== m.id);
    if (t === "members" && m.id) { delete this.db.secrets[m.id]; this.db.votes = this.db.votes.filter(v => v.member_id !== m.id); this.db.member_private = this.db.member_private.filter(p => p.member_id !== m.id); }
    this.changed();
  },
  subscribe(cb) { this.cb = cb; },
  async ask(message) {
    await this.insert("messages", { member_id: ME, role: "user", content: message });
    await new Promise(r => setTimeout(r, 700));
    await this.insert("messages", {
      member_id: null, role: "assistant",
      content: "Sono in **modalità prova**: per rispondere davvero, cercare sul web e aggiornare prenotazioni e sondaggi devo essere collegato.\n\nSegui la guida nel file `README.md` (sezione «Collega il database e l'assistente»): bastano una decina di minuti.",
    });
  },
};

const api = CLOUD ? Cloud : Local;

// ───────────────────────── Stato ─────────────────────────

let S = Object.fromEntries(TABLES.map(t => [t, []]));
let ME = null;
let OFFLINE = false;
const UI = { tab: "home", planSeg: "bookings", waiting: false, lastMsgCount: 0 };

const trip = () => S.trip[0] || { name: "Capodanno" };
const me = () => S.members.find(m => m.id === ME);
const isAdmin = () => !!me()?.is_admin;
const member = id => S.members.find(m => m.id === id);
const mname = id => member(id)?.name || "—";
const going = () => S.members.filter(m => m.rsvp !== "no");

function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ me: ME, S, cloud: CLOUD })); } catch { /* spazio pieno */ } }
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c && c.cloud === CLOUD && c.me) { S = { ...S, ...c.S }; ME = c.me; return true; }
  } catch { /* cache rovinata */ }
  return false;
}

let reloadTimer = null;
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 250); }
async function reload() {
  try {
    const data = await api.loadAll();
    S = data;
    S.messages.sort(byCreated);
    OFFLINE = false;
    if (!S.members.some(m => m.id === ME)) { ME = null; localStorage.removeItem(CACHE_KEY); return showOnboarding(); }
    saveCache();
  } catch (e) {
    console.warn(e);
    OFFLINE = !navigator.onLine;
  }
  render();
}

// ───────────────────────── Calcoli ─────────────────────────

function balances() {
  const b = new Map(S.members.map(m => [m.id, 0]));
  for (const e of S.expenses) {
    const amt = Number(e.amount) || 0;
    b.set(e.paid_by, (b.get(e.paid_by) || 0) + amt);
    const ids = e.split_among || [];
    for (const id of ids) b.set(id, (b.get(id) || 0) - amt / Math.max(1, ids.length));
  }
  return b;
}
function settlements() {
  const b = [...balances()].map(([id, v]) => ({ id, v: Math.round(v * 100) / 100 }));
  const cred = b.filter(x => x.v > 0.009).sort((a, c) => c.v - a.v);
  const debt = b.filter(x => x.v < -0.009).map(x => ({ ...x, v: -x.v })).sort((a, c) => c.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i].v, cred[j].v);
    out.push({ from: debt[i].id, to: cred[j].id, amount: Math.round(amt * 100) / 100 });
    debt[i].v -= amt; cred[j].v -= amt;
    if (debt[i].v < 0.01) i++;
    if (cred[j].v < 0.01) j++;
  }
  return out;
}
function pollData(p) {
  const opts = S.poll_options.filter(o => o.poll_id === p.id).sort(byCreated).map(o => {
    const voters = S.votes.filter(v => v.option_id === o.id).map(v => v.member_id);
    return { ...o, voters, mine: voters.includes(ME) };
  });
  const max = Math.max(0, ...opts.map(o => o.voters.length));
  const voterIds = new Set(S.votes.filter(v => v.poll_id === p.id).map(v => v.member_id));
  return { opts, max, voterIds, voted: voterIds.has(ME) };
}
const openPollsToVote = () => S.polls.filter(p => p.status === "open" && !pollData(p).voted);

// ───────────────────────── Render principale ─────────────────────────

const TABS = [
  { id: "home", label: "Home", ico: "🏠" },
  { id: "vota", label: "Vota", ico: "🗳️" },
  { id: "piano", label: "Piano", ico: "🗓️" },
  { id: "spese", label: "Spese", ico: "💶" },
  { id: "chat", label: "Assistente", ico: "✨" },
];

function render() {
  if (!ME) return;
  const root = $("#root");
  const y = window.scrollY;
  const views = { home: viewHome, vota: viewVota, piano: viewPiano, spese: viewSpese, chat: viewChat, gruppo: viewGruppo };
  const titles = { home: trip().name || "Capodanno", vota: "Sondaggi", piano: "Piano", spese: "Spese", chat: "Assistente", gruppo: "Il gruppo" };
  const subs = {
    home: `Ciao ${esc(me()?.name || "")} 👋`,
    vota: "Decidiamo insieme",
    piano: "Prenotazioni, programma e cose da fare",
    spese: "Chi ha pagato cosa",
    chat: "Cerca, prenota, organizza",
    gruppo: `${S.members.length} persone · ${going().filter(m => m.rsvp === "si").length} confermate`,
  };
  root.innerHTML = `<div id="app">
    ${OFFLINE ? `<div class="offline">Sei offline: vedi l'ultima copia salvata</div>` : ""}
    <header class="topbar">
      <div class="grow"><h1>${esc(titles[UI.tab])}</h1><div class="sub">${subs[UI.tab]}</div></div>
      <button class="me-btn" data-act="tab" data-tab="gruppo" aria-label="Il gruppo">${esc(me()?.emoji || "🙂")}</button>
    </header>
    <main id="view">${views[UI.tab]()}</main>
  </div>`;
  renderTabbar();
  $("#composer").classList.toggle("show", UI.tab === "chat");
  if (UI.tab === "home") mountHome();
  if (UI.tab === "chat") {
    const n = S.messages.length;
    if (n !== UI.lastMsgCount || UI.waiting) { UI.lastMsgCount = n; requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); }
    else window.scrollTo(0, y);
  } else window.scrollTo(0, y);
}

function renderTabbar() {
  const bar = $("#tabbar");
  bar.hidden = false;
  const toVote = openPollsToVote().length;
  bar.innerHTML = `<div class="inner">${TABS.map(t => `
    <button class="${UI.tab === t.id ? "on" : ""}" data-act="tab" data-tab="${t.id}">
      <span class="ico">${t.ico}</span>${t.label}
      ${t.id === "vota" && toVote ? `<span class="badge">${toVote}</span>` : ""}
    </button>`).join("")}</div>`;
}

function go(tab) {
  if (UI.tab !== tab) { UI.tab = tab; render(); window.scrollTo(0, tab === "chat" ? document.body.scrollHeight : 0); }
}

// ───────────────────────── Home ─────────────────────────

function countdownTarget() {
  const now = new Date();
  // Dal 1° al 6 gennaio festeggiamo ancora; poi si punta al prossimo Capodanno.
  if (now.getMonth() === 0 && now.getDate() <= 6) return null;
  return new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0);
}

function viewHome() {
  const t = trip();
  const m = me();
  const target = countdownTarget();
  const toVote = openPollsToVote();
  const bal = balances().get(ME) || 0;
  const now = Date.now();
  const upcoming = [
    ...S.itinerary.map(i => ({ when: i.day ? new Date(`${i.day}T${i.time || "12:00"}`) : null, title: i.title, sub: i.place, ico: "🗓️" })),
    ...S.bookings.filter(b => b.start_at && b.status !== "annullato").map(b => ({ when: new Date(b.start_at), title: b.title, sub: CATEGORIES[b.category]?.label, ico: CATEGORIES[b.category]?.icon || "📌" })),
  ].filter(x => x.when && x.when.getTime() > now - 3 * 3600e3).sort((a, b) => a.when - b.when).slice(0, 4);
  const todo = S.bookings.filter(b => b.status === "idea" || b.status === "da_prenotare");
  const deadlines = S.bookings.filter(b => b.cancel_by && b.status !== "annullato" && (new Date(b.cancel_by + "T23:59") - now) / 864e5 < 10 && new Date(b.cancel_by + "T23:59") > now);
  const myTasks = S.checklist.filter(c => c.assignee === ME && !c.done);
  const counts = { si: S.members.filter(x => x.rsvp === "si").length, forse: S.members.filter(x => x.rsvp === "forse").length, no: S.members.filter(x => x.rsvp === "no").length };

  return `
  <section class="card hero">
    <canvas id="fireworks"></canvas>
    <div class="kicker">${target ? `Capodanno ${target.getFullYear()}` : "Buon anno! 🥂"}</div>
    <h2 class="title">${esc(t.destination || "Destinazione da decidere")}</h2>
    <div class="where">${t.start_date ? `${esc(fmtDate(t.start_date, { day: "numeric", month: "long" }))} → ${esc(fmtDate(t.end_date, { day: "numeric", month: "long" }))}` : "Date da decidere"} · ${counts.si} confermati</div>
    ${target ? `<div class="count" id="countdown">${["giorni", "ore", "min", "sec"].map(l => `<div><b data-u="${l}">–</b><span>${l}</span></div>`).join("")}</div>` : ""}
  </section>

  <section class="card">
    <div class="row between"><h2 style="margin:0">Ci sei?</h2><span class="small muted">✅ ${counts.si} · 🤔 ${counts.forse} · ❌ ${counts.no}</span></div>
    <div class="seg" style="margin-top:12px">${Object.entries(RSVP).map(([k, l]) => `<button class="${m?.rsvp === k ? "on" : ""}" data-act="rsvp" data-v="${k}">${l}</button>`).join("")}</div>
  </section>

  ${isAdmin() && !S.polls.length ? `
  <section class="card" style="border-color:rgba(246,196,83,.4)">
    <h2>Primi passi</h2>
    <p class="muted" style="margin:0 0 12px">Non avete ancora deciso niente? Crea in un tocco i sondaggi base (tipo di vacanza, destinazione, date, budget, trasporto, alloggio, cenone), poi invita gli amici.</p>
    <button class="btn primary block" data-act="starter-polls">🗳️ Crea i sondaggi base</button>
  </section>` : ""}

  <section class="card">
    <div class="row between"><h2 style="margin:0">Il gruppo</h2><button class="link" data-act="invite">+ Invita</button></div>
    <div class="row tap" data-act="tab" data-tab="gruppo" style="margin-top:12px">
      <div class="avatars">${S.members.slice(0, 8).map(x => avatar(x)).join("")}</div>
      <span class="muted small">${S.members.length === 1 ? "Ci sei solo tu: invita gli altri!" : `${S.members.length} persone`}</span>
    </div>
  </section>

  ${toVote.length ? `
  <section class="card tap" data-act="tab" data-tab="vota">
    <h2>Da votare (${toVote.length})</h2>
    ${toVote.slice(0, 3).map(p => `<div class="list-item"><div class="icon-box">🗳️</div><div class="grow ellipsis">${esc(p.question)}</div><span class="faint">›</span></div>`).join("")}
  </section>` : ""}

  ${deadlines.length ? `
  <section class="card" style="border-color:rgba(255,169,77,.45)">
    <h2>⏰ Cancellazione gratuita in scadenza</h2>
    ${deadlines.map(b => `<div class="list-item tap" data-act="booking" data-id="${b.id}"><div class="grow">${esc(b.title)}</div><span class="small" style="color:var(--orange)">entro ${esc(fmtDate(b.cancel_by))}</span></div>`).join("")}
  </section>` : ""}

  <section class="card">
    <h2>Prossimi impegni</h2>
    ${upcoming.length ? upcoming.map(u => `
      <div class="list-item"><div class="icon-box">${u.ico}</div>
        <div class="grow"><div class="ellipsis">${esc(u.title)}</div><div class="small muted">${esc(fmtDateTime(u.when))}${u.sub ? " · " + esc(u.sub) : ""}</div></div></div>`).join("")
      : `<div class="muted small">Ancora niente in programma.</div>`}
  </section>

  <div class="two">
    <section class="card tap" data-act="tab" data-tab="spese" style="margin-bottom:14px">
      <h2>Il tuo saldo</h2>
      <div class="stat ${bal > 0.009 ? "pos" : bal < -0.009 ? "neg" : ""}">${eur(Math.abs(bal))}</div>
      <div class="small muted">${bal > 0.009 ? "devi ricevere" : bal < -0.009 ? "devi dare" : "sei in pari"}</div>
    </section>
    <section class="card tap" data-act="tab" data-tab="piano" style="margin-bottom:14px">
      <h2>Da fare</h2>
      <div class="stat">${todo.length + myTasks.length}</div>
      <div class="small muted">${todo.length} da prenotare · ${myTasks.length} per te</div>
    </section>
  </div>

  <div class="section-title">✨ Chiedi all'assistente</div>
  <div class="chips scroll" style="margin-bottom:8px">${AI_SUGGESTIONS.map(s => `<button class="chip" data-act="ask" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
}

let countdownTimer = null;
let fireworksStop = null;
function mountHome() {
  clearInterval(countdownTimer);
  const tick = () => {
    const el = $("#countdown"); const target = countdownTarget();
    if (!el || !target) return clearInterval(countdownTimer);
    let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const v = { giorni: Math.floor(s / 86400), ore: Math.floor(s % 86400 / 3600), min: Math.floor(s % 3600 / 60), sec: s % 60 };
    for (const k in v) { const b = el.querySelector(`[data-u="${k}"]`); if (b) b.textContent = String(v[k]).padStart(k === "giorni" ? 1 : 2, "0"); }
  };
  tick(); countdownTimer = setInterval(tick, 1000);
  fireworksStop && fireworksStop();
  fireworksStop = fireworks($("#fireworks"));
}

// Fuochi d'artificio leggeri su canvas.
function fireworks(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = () => { canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; };
  size();
  const colors = ["#F6C453", "#FFE29A", "#FF5C8A", "#8B7CFF", "#4FD1C5"];
  let parts = [], raf = 0, last = 0, alive = true;
  const burst = () => {
    const x = canvas.width * (0.15 + Math.random() * 0.7), y = canvas.height * (0.12 + Math.random() * 0.4);
    const c = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < 38; i++) {
      const a = (Math.PI * 2 * i) / 38, sp = (1.2 + Math.random() * 1.8) * dpr;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c });
    }
  };
  if (reduceMotion) { burst(); parts.forEach(p => { p.x += p.vx * 18; p.y += p.vy * 18; }); }
  const frame = t => {
    if (!alive || !canvas.isConnected) return;
    if (t - last > 1100) { burst(); last = t; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.025 * dpr; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.012;
      ctx.globalAlpha = Math.max(0, p.life) * 0.8; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  if (reduceMotion) { ctx.fillStyle = "#F6C453"; parts.forEach(p => { ctx.globalAlpha = .6; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * dpr, 0, 7); ctx.fill(); }); }
  else raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

// ───────────────────────── Sondaggi ─────────────────────────

function viewVota() {
  const open = S.polls.filter(p => p.status === "open").sort(byCreated);
  const closed = S.polls.filter(p => p.status !== "open").sort(byCreated).reverse();
  return `
  <button class="btn primary block" data-act="new-poll" style="margin-bottom:16px">＋ Nuovo sondaggio</button>
  ${!S.polls.length ? `<div class="card empty"><div class="big">🗳️</div>Nessun sondaggio ancora.<br>Creane uno, oppure chiedi all'assistente di proporre delle opzioni.
     ${isAdmin() ? `<div style="margin-top:14px"><button class="btn sm" data-act="starter-polls">Crea i sondaggi base</button></div>` : ""}</div>` : ""}
  ${open.map(pollCard).join("")}
  ${closed.length ? `<div class="section-title">Decisi</div>${closed.map(pollCard).join("")}` : ""}`;
}

function pollCard(p) {
  const d = pollData(p);
  const isOpen = p.status === "open";
  const missing = going().filter(m => !d.voterIds.has(m.id));
  const canManage = isAdmin() || p.created_by === ME;
  return `
  <section class="card">
    <div class="row between" style="align-items:flex-start">
      <div class="grow"><h3>${esc(p.question)}</h3>
        ${p.description ? `<div class="small muted">${esc(p.description)}</div>` : ""}
        <div class="small faint" style="margin-top:4px">${d.voterIds.size} ${d.voterIds.size === 1 ? "voto" : "voti"}${p.kind === "multi" ? " · più scelte" : ""}${p.created_by ? ` · di ${esc(mname(p.created_by))}` : ""}</div>
      </div>
      ${canManage ? `<button class="btn sm" data-act="poll-menu" data-id="${p.id}" aria-label="Opzioni">•••</button>` : ""}
    </div>
    ${d.opts.length ? d.opts.map(o => {
      const pct = d.max ? (o.voters.length / d.max) * 100 : 0;
      const win = !isOpen && d.max > 0 && o.voters.length === d.max;
      return `<div class="opt ${isOpen ? "tap" : ""} ${o.mine ? "mine" : ""} ${win ? "winner" : ""}" ${isOpen ? `role="button" data-act="vote" data-poll="${p.id}" data-opt="${o.id}"` : ""}>
        <span class="bar" style="width:${pct}%"></span>
        <div class="row">
          <span class="check">${o.mine ? "✓" : ""}</span>
          <div class="grow"><div>${win ? "🏆 " : ""}${esc(o.label)}${o.price ? ` <span class="faint small">· ~${eur(o.price)}</span>` : ""}</div>
            ${o.details ? `<div class="details">${esc(o.details)}</div>` : ""}
            ${o.url ? `<div class="details"><a href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener" data-stop>Apri link ↗</a></div>` : ""}
          </div>
          <div class="avatars">${o.voters.slice(0, 4).map(id => avatar(member(id), "sm")).join("")}</div>
          <span class="votes">${o.voters.length}</span>
        </div>
      </div>`;
    }).join("") : `<div class="small muted" style="margin-top:10px">Nessuna opzione: aggiungi la prima!</div>`}
    ${isOpen && p.allow_add ? `<button class="link" style="margin-top:12px" data-act="add-option" data-id="${p.id}">＋ Proponi un'opzione</button>` : ""}
    ${isOpen && missing.length && d.voterIds.size ? `<div class="small faint" style="margin-top:10px">Mancano: ${missing.map(m => esc(m.name)).join(", ")}</div>` : ""}
  </section>`;
}

async function toggleVote(pollId, optId) {
  const p = S.polls.find(x => x.id === pollId);
  const already = S.votes.some(v => v.option_id === optId && v.member_id === ME);
  try {
    if (already) {
      await api.remove("votes", { option_id: optId, member_id: ME });
      S.votes = S.votes.filter(v => !(v.option_id === optId && v.member_id === ME));
    } else {
      if (p.kind !== "multi") {
        const mine = S.votes.filter(v => v.poll_id === pollId && v.member_id === ME);
        for (const v of mine) await api.remove("votes", { option_id: v.option_id, member_id: ME });
        S.votes = S.votes.filter(v => !(v.poll_id === pollId && v.member_id === ME));
      }
      const v = { poll_id: pollId, option_id: optId, member_id: ME };
      await api.insert("votes", v);
      S.votes.push(v);
    }
    render();
  } catch (e) { toast(e.message); scheduleReload(); }
}

async function createPoll({ question, description, multi, allowAdd, options }) {
  const p = await api.insert("polls", { question, description: description || null, kind: multi ? "multi" : "single", allow_add: allowAdd !== false, created_by: ME });
  for (const label of options) await api.insert("poll_options", { poll_id: p.id, label, added_by: ME });
  return p;
}

function sheetNewPoll(prefill = {}) {
  const opts = prefill.opts?.length ? prefill.opts : ["", ""];
  openSheet(`
    <h2>Nuovo sondaggio</h2>
    <div class="field"><label>Idee pronte</label><div class="chips scroll">${POLL_TEMPLATES.map((t, i) => `<button type="button" class="chip" data-act="poll-template" data-i="${i}">${esc(t.q)}</button>`).join("")}</div></div>
    <form data-form="poll">
      <div class="field"><label>Domanda</label><input name="question" required maxlength="140" value="${esc(prefill.q || "")}" placeholder="Es. Dove facciamo il cenone?"></div>
      <div class="field"><label>Descrizione (facoltativa)</label><input name="description" maxlength="300" value="${esc(prefill.d || "")}"></div>
      <div class="field"><label>Opzioni</label><div id="opt-list" class="stack">${opts.map(o => `<input name="opt" value="${esc(o)}" placeholder="Opzione">`).join("")}</div>
        <button type="button" class="link" style="margin-top:10px" data-act="more-opt">＋ Aggiungi opzione</button></div>
      <label class="toggle"><span>Si possono scegliere più opzioni</span><span class="switch"><input type="checkbox" name="multi" ${prefill.multi ? "checked" : ""}><span></span></span></label>
      <label class="toggle"><span>Tutti possono proporre opzioni</span><span class="switch"><input type="checkbox" name="allow_add" checked><span></span></span></label>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Crea</button></div>
    </form>`);
}

// ───────────────────────── Piano: prenotazioni, programma, checklist ─────────────────────────

function viewPiano() {
  const seg = UI.planSeg;
  return `
  <div class="seg" style="margin-bottom:16px">
    ${[["bookings", "Prenotazioni"], ["program", "Programma"], ["check", "Checklist"]].map(([k, l]) => `<button class="${seg === k ? "on" : ""}" data-act="plan-seg" data-v="${k}">${l}</button>`).join("")}
  </div>
  ${seg === "bookings" ? viewBookings() : seg === "program" ? viewProgram() : viewChecklist()}`;
}

function viewBookings() {
  const list = S.bookings.slice().sort((a, b) => String(a.start_at || "9").localeCompare(String(b.start_at || "9")));
  const total = list.filter(b => b.status !== "annullato").reduce((s, b) => s + (Number(b.price) || 0), 0);
  const groups = Object.keys(CATEGORIES).map(k => [k, list.filter(b => (CATEGORIES[b.category] ? b.category : "altro") === k)]).filter(([, l]) => l.length);
  return `
  <button class="btn primary block" data-act="edit-booking" style="margin-bottom:14px">＋ Aggiungi prenotazione</button>
  ${list.length ? `<div class="chips" style="margin-bottom:6px">
      ${Object.entries(STATUSES).map(([k, l]) => { const n = list.filter(b => b.status === k).length; return n ? `<span class="pill ${k}">${n} ${l.toLowerCase()}</span>` : ""; }).join("")}
      ${total ? `<span class="chip">Totale ${eur(total)} · ${eur(total / Math.max(1, going().length))} a testa</span>` : ""}
    </div>` : `<div class="card empty"><div class="big">🏨</div>Qui finiranno alloggio, viaggio, cenone, serata e tutto il resto.<br>Puoi aggiungerle tu o chiedere all'assistente.</div>`}
  ${groups.map(([k, l]) => `
    <div class="section-title">${CATEGORIES[k].icon} ${CATEGORIES[k].label}</div>
    <section class="card">${l.map(b => `
      <div class="list-item tap" data-act="booking" data-id="${b.id}">
        <div class="grow">
          <div class="row" style="gap:8px"><span class="ellipsis" style="font-weight:600">${esc(b.title)}</span></div>
          <div class="small muted">${[b.start_at && fmtDateTime(b.start_at), b.provider, b.price && eur(b.price)].filter(Boolean).map(esc).join(" · ") || "Nessun dettaglio"}</div>
        </div>
        <span class="pill ${b.status}">${STATUSES[b.status] || b.status}</span>
      </div>`).join("")}
    </section>`).join("")}`;
}

function sheetBooking(id) {
  const b = S.bookings.find(x => x.id === id); if (!b) return;
  const cat = CATEGORIES[b.category] || CATEGORIES.altro;
  const row = (label, val) => (val ? `<div class="list-item"><div class="small muted" style="width:110px">${label}</div><div class="grow">${val}</div></div>` : "");
  openSheet(`
    <div class="row" style="gap:12px;margin-bottom:6px"><div class="icon-box">${cat.icon}</div><div class="grow"><h2 style="margin:0">${esc(b.title)}</h2><span class="pill ${b.status}">${STATUSES[b.status]}</span></div></div>
    <div class="chips" style="margin:14px 0">
      ${b.code ? `<button class="chip" data-act="copy" data-text="${esc(b.code)}">📋 Copia codice</button>` : ""}
      ${b.address ? `<a class="chip" href="${esc(mapsUrl(b.address))}" target="_blank" rel="noopener">🧭 Indicazioni</a>` : ""}
      ${b.url ? `<a class="chip" href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener">🔗 Sito</a>` : ""}
      ${b.phone ? `<a class="chip" href="${esc(telUrl(b.phone))}">📞 Chiama</a>` : ""}
    </div>
    <section class="card">
      ${row("Categoria", esc(cat.label))}
      ${row("Fornitore", esc(b.provider))}
      ${row("Codice", b.code ? `<b style="font-family:ui-monospace,monospace">${esc(b.code)}</b>` : "")}
      ${row("Inizio", esc(fmtDateTime(b.start_at)))}
      ${row("Fine", esc(fmtDateTime(b.end_at)))}
      ${row("Indirizzo", esc(b.address))}
      ${row("Prezzo", b.price ? `${eur(b.price)} <span class="faint small">(${eur(b.price / Math.max(1, going().length))} a testa)</span>` : "")}
      ${row("Pagato da", b.paid_by ? esc(mname(b.paid_by)) : "")}
      ${row("Cancellazione", b.cancel_by ? `gratuita entro ${esc(fmtDate(b.cancel_by, { day: "numeric", month: "long" }))}` : "")}
      ${row("Note", b.notes ? esc(b.notes).replace(/\n/g, "<br>") : "")}
    </section>
    ${b.price && b.paid_by && !S.expenses.some(e => e.title === b.title && Number(e.amount) === Number(b.price)) ? `<button class="btn block" style="margin-bottom:10px" data-act="booking-to-expense" data-id="${b.id}">💶 Registra come spesa divisa tra tutti</button>` : ""}
    <div class="actions"><button class="btn" data-act="close-sheet">Chiudi</button><button class="btn primary" data-act="edit-booking" data-id="${b.id}">Modifica</button></div>`);
}

function sheetEditBooking(id) {
  const b = S.bookings.find(x => x.id === id) || { category: "alloggio", status: "da_prenotare" };
  openSheet(`
    <h2>${id ? "Modifica prenotazione" : "Nuova prenotazione"}</h2>
    <form data-form="booking" data-id="${id || ""}">
      <div class="field"><label>Titolo</label><input name="title" required maxlength="120" value="${esc(b.title || "")}" placeholder="Es. Hotel Bellavista"></div>
      <div class="two">
        <div class="field"><label>Categoria</label><select name="category">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${b.category === k ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}</select></div>
        <div class="field"><label>Stato</label><select name="status">${Object.entries(STATUSES).map(([k, l]) => `<option value="${k}" ${b.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="two">
        <div class="field"><label>Fornitore / sito</label><input name="provider" value="${esc(b.provider || "")}" placeholder="Booking, Trenitalia…"></div>
        <div class="field"><label>Codice prenotazione</label><input name="code" value="${esc(b.code || "")}" autocapitalize="characters"></div>
      </div>
      <div class="two">
        <div class="field"><label>Inizio / check-in</label><input type="datetime-local" name="start_at" value="${esc(toLocalInput(b.start_at))}"></div>
        <div class="field"><label>Fine / check-out</label><input type="datetime-local" name="end_at" value="${esc(toLocalInput(b.end_at))}"></div>
      </div>
      <div class="field"><label>Indirizzo</label><input name="address" value="${esc(b.address || "")}"></div>
      <div class="two">
        <div class="field"><label>Link</label><input name="url" inputmode="url" value="${esc(b.url || "")}"></div>
        <div class="field"><label>Telefono</label><input name="phone" inputmode="tel" value="${esc(b.phone || "")}"></div>
      </div>
      <div class="two">
        <div class="field"><label>Prezzo totale (€)</label><input name="price" inputmode="decimal" value="${esc(b.price ?? "")}"></div>
        <div class="field"><label>Pagato da</label><select name="paid_by"><option value="">—</option>${S.members.map(m => `<option value="${m.id}" ${b.paid_by === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Cancellazione gratuita entro</label><input type="date" name="cancel_by" value="${esc(b.cancel_by || "")}"></div>
      <div class="field"><label>Note</label><textarea name="notes" placeholder="Orari check-in, cosa include, a chi intestata…">${esc(b.notes || "")}</textarea></div>
      <div class="actions">${id ? `<button type="button" class="btn danger" data-act="delete" data-t="bookings" data-id="${id}">Elimina</button>` : `<button type="button" class="btn" data-act="close-sheet">Annulla</button>`}<button class="btn primary">Salva</button></div>
    </form>`);
}

function tripDays() {
  const t = trip();
  const days = new Set(S.itinerary.map(i => i.day).filter(Boolean));
  if (t.start_date && t.end_date) {
    for (let d = new Date(t.start_date + "T12:00"); d <= new Date(t.end_date + "T12:00") && days.size < 20; d.setDate(d.getDate() + 1)) days.add(d.toISOString().slice(0, 10));
  }
  return [...days].sort();
}

function viewProgram() {
  const days = tripDays();
  const undated = S.itinerary.filter(i => !i.day);
  return `
  <button class="btn primary block" data-act="edit-item" style="margin-bottom:14px">＋ Aggiungi al programma</button>
  ${!days.length && !undated.length ? `<div class="card empty"><div class="big">🗓️</div>Il programma giorno per giorno apparirà qui.<br>Le date si fissano dai dati del viaggio (le imposta l'organizzatore dopo il sondaggio).</div>` : ""}
  ${days.map(d => {
    const items = S.itinerary.filter(i => i.day === d).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    return `<div class="section-title">${esc(fmtDate(d, { weekday: "long", day: "numeric", month: "long" }))}</div>
    <section class="card">${items.length ? items.map(itemRow).join("") : `<div class="small muted">Giornata libera ✨</div>`}</section>`;
  }).join("")}
  ${undated.length ? `<div class="section-title">Senza data</div><section class="card">${undated.map(itemRow).join("")}</section>` : ""}`;
}
const itemRow = i => `
  <div class="list-item tap" data-act="edit-item" data-id="${i.id}">
    <div style="width:52px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--gold-2)">${esc(i.time || "—")}</div>
    <div class="grow"><div>${esc(i.title)}</div>${i.place || i.notes ? `<div class="small muted">${[i.place, i.notes].filter(Boolean).map(esc).join(" · ")}</div>` : ""}</div>
    ${i.place ? `<a class="chip" href="${esc(mapsUrl(i.place))}" target="_blank" rel="noopener" data-stop>🧭</a>` : ""}
  </div>`;

function sheetEditItem(id) {
  const i = S.itinerary.find(x => x.id === id) || { day: trip().start_date || "" };
  openSheet(`
    <h2>${id ? "Modifica" : "Aggiungi al programma"}</h2>
    <form data-form="item" data-id="${id || ""}">
      <div class="field"><label>Cosa</label><input name="title" required maxlength="120" value="${esc(i.title || "")}" placeholder="Es. Aperitivo in piazza"></div>
      <div class="two">
        <div class="field"><label>Giorno</label><input type="date" name="day" value="${esc(i.day || "")}"></div>
        <div class="field"><label>Ora</label><input type="time" name="time" value="${esc(i.time || "")}"></div>
      </div>
      <div class="field"><label>Dove</label><input name="place" value="${esc(i.place || "")}"></div>
      <div class="field"><label>Note</label><input name="notes" value="${esc(i.notes || "")}"></div>
      <div class="actions">${id ? `<button type="button" class="btn danger" data-act="delete" data-t="itinerary" data-id="${id}">Elimina</button>` : `<button type="button" class="btn" data-act="close-sheet">Annulla</button>`}<button class="btn primary">Salva</button></div>
    </form>`);
}

function viewChecklist() {
  const items = S.checklist.slice().sort((a, b) => (a.done - b.done) || byCreated(a, b));
  return `
  <form data-form="check-quick" class="row" style="margin-bottom:14px">
    <input name="text" placeholder="Aggiungi: caricabatterie, spumante, prenotare taxi…" maxlength="140" required>
    <button class="btn primary" aria-label="Aggiungi">＋</button>
  </form>
  ${items.length ? `<section class="card">${items.map(c => `
    <div class="list-item">
      <button data-act="check-toggle" data-id="${c.id}" class="opt-check" aria-label="Fatto" style="width:28px;height:28px;border-radius:50%;border:2px solid ${c.done ? "var(--green)" : "var(--t3)"};background:${c.done ? "var(--green)" : "none"};color:#06071a;font-weight:800;flex:none">${c.done ? "✓" : ""}</button>
      <div class="grow tap" data-act="edit-check" data-id="${c.id}" style="${c.done ? "text-decoration:line-through;color:var(--t3)" : ""}">${esc(c.text)}</div>
      ${c.assignee ? avatar(member(c.assignee), "sm") : ""}
    </div>`).join("")}</section>` : `<div class="card empty"><div class="big">✅</div>Cose da fare e da portare, assegnabili a ognuno.</div>`}`;
}

function sheetEditCheck(id) {
  const c = S.checklist.find(x => x.id === id); if (!c) return;
  openSheet(`
    <h2>Modifica</h2>
    <form data-form="check" data-id="${id}">
      <div class="field"><label>Cosa</label><input name="text" required value="${esc(c.text)}"></div>
      <div class="field"><label>Se ne occupa</label><select name="assignee"><option value="">Nessuno</option>${S.members.map(m => `<option value="${m.id}" ${c.assignee === m.id ? "selected" : ""}>${esc(m.emoji)} ${esc(m.name)}</option>`).join("")}</select></div>
      <div class="actions"><button type="button" class="btn danger" data-act="delete" data-t="checklist" data-id="${id}">Elimina</button><button class="btn primary">Salva</button></div>
    </form>`);
}

// ───────────────────────── Spese ─────────────────────────

function viewSpese() {
  const total = S.expenses.filter(e => e.category !== "rimborso").reduce((s, e) => s + Number(e.amount), 0);
  const bal = balances();
  const st = settlements();
  const maxAbs = Math.max(1, ...[...bal.values()].map(Math.abs));
  const list = S.expenses.slice().sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)) || byCreated(b, a));
  return `
  <button class="btn primary block" data-act="edit-expense" style="margin-bottom:14px">＋ Aggiungi spesa</button>
  <div class="two">
    <section class="card"><h2>Totale gruppo</h2><div class="stat">${eur(total)}</div><div class="small muted">${S.expenses.filter(e => e.category !== "rimborso").length} spese</div></section>
    <section class="card"><h2>Il tuo saldo</h2>
      <div class="stat ${(bal.get(ME) || 0) > 0.009 ? "pos" : (bal.get(ME) || 0) < -0.009 ? "neg" : ""}">${eur(Math.abs(bal.get(ME) || 0))}</div>
      <div class="small muted">${(bal.get(ME) || 0) > 0.009 ? "devi ricevere" : (bal.get(ME) || 0) < -0.009 ? "devi dare" : "sei in pari"}</div></section>
  </div>
  ${st.length ? `<section class="card"><h2>Per pareggiare</h2>${st.map(s => `
    <div class="list-item">
      ${avatar(member(s.from), "sm")}<span class="grow small"><b>${esc(mname(s.from))}</b> → <b>${esc(mname(s.to))}</b></span>
      <b>${eur(s.amount)}</b>
      ${s.from === ME || s.to === ME || isAdmin() ? `<button class="btn sm" data-act="settle" data-from="${s.from}" data-to="${s.to}" data-amount="${s.amount}">Saldato</button>` : ""}
    </div>`).join("")}</section>` : ""}
  ${S.expenses.length ? `<section class="card"><h2>Saldi</h2>${[...bal].sort((a, b) => b[1] - a[1]).map(([id, v]) => `
    <div class="list-item">${avatar(member(id), "sm")}<span class="grow small">${esc(mname(id))}</span>
      <div style="width:90px;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden"><div style="height:100%;width:${Math.abs(v) / maxAbs * 100}%;background:${v >= 0 ? "var(--green)" : "var(--red)"};${v < 0 ? "margin-left:auto" : ""}"></div></div>
      <span class="small ${v > 0.009 ? "pos" : v < -0.009 ? "neg" : "muted"}" style="width:84px;text-align:right;font-variant-numeric:tabular-nums">${v > 0.009 ? "+" : v < -0.009 ? "−" : ""}${eur(Math.abs(v))}</span>
    </div>`).join("")}</section>` : ""}
  <div class="section-title">Movimenti</div>
  ${list.length ? `<section class="card">${list.map(e => `
    <div class="list-item tap" data-act="edit-expense" data-id="${e.id}">
      <div class="icon-box">${(EXP_CATS[e.category] || EXP_CATS.altro).split(" ")[0]}</div>
      <div class="grow"><div class="ellipsis">${esc(e.title)}</div><div class="small muted">${esc(mname(e.paid_by))} · ${esc(fmtDate(e.spent_on))} · ${e.split_among?.length || 0} persone</div></div>
      <b style="font-variant-numeric:tabular-nums">${eur(e.amount)}</b>
    </div>`).join("")}</section>` : `<div class="card empty"><div class="big">💶</div>Registra chi paga cosa: l'app calcola in automatico chi deve quanto a chi.</div>`}`;
}

function sheetEditExpense(id, prefill = {}) {
  const e = S.expenses.find(x => x.id === id) || { paid_by: ME, split_among: going().map(m => m.id), spent_on: today(), category: "altro", ...prefill };
  openSheet(`
    <h2>${id ? "Modifica spesa" : "Nuova spesa"}</h2>
    <form data-form="expense" data-id="${id || ""}">
      <div class="field"><label>Per cosa</label><input name="title" required maxlength="120" value="${esc(e.title || "")}" placeholder="Es. Spesa al supermercato"></div>
      <div class="two">
        <div class="field"><label>Importo (€)</label><input name="amount" required inputmode="decimal" value="${esc(e.amount ?? "")}" placeholder="0,00"></div>
        <div class="field"><label>Data</label><input type="date" name="spent_on" value="${esc(e.spent_on || today())}"></div>
      </div>
      <div class="two">
        <div class="field"><label>Pagato da</label><select name="paid_by">${S.members.map(m => `<option value="${m.id}" ${e.paid_by === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Categoria</label><select name="category">${Object.entries(EXP_CATS).map(([k, l]) => `<option value="${k}" ${e.category === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Diviso tra</label>
        <div class="chips">${S.members.map(m => `<label class="chip ${e.split_among?.includes(m.id) ? "on" : ""}"><input type="checkbox" name="split" value="${m.id}" ${e.split_among?.includes(m.id) ? "checked" : ""} hidden data-chip>${esc(m.emoji)} ${esc(m.name)}</label>`).join("")}</div>
        <div class="hint">In parti uguali tra le persone selezionate.</div></div>
      <div class="actions">${id ? `<button type="button" class="btn danger" data-act="delete" data-t="expenses" data-id="${id}">Elimina</button>` : `<button type="button" class="btn" data-act="close-sheet">Annulla</button>`}<button class="btn primary">Salva</button></div>
    </form>`);
}

// ───────────────────────── Chat con l'assistente ─────────────────────────

function md(src) {
  let s = esc(src);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]} ↗</a>`);
  const out = []; let list = null;
  for (const line of s.split("\n")) {
    const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^#{1,4}\s+(.*)/);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      if (!list || list.type !== type) { if (list) out.push(`</${list.type}>`); list = { type }; out.push(`<${type}>`); }
      out.push(`<li>${(ul || ol)[1]}</li>`);
      continue;
    }
    if (list) { out.push(`</${list.type}>`); list = null; }
    if (h) out.push(`<div class="h">${h[1]}</div>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`</${list.type}>`);
  return out.join("");
}

function viewChat() {
  const msgs = S.messages;
  let lastDay = "";
  return `
  <div class="chat">
    <div class="privacy"><span>👥</span><span>Questa chat è condivisa: tutto il gruppo vede domande e risposte. L'assistente cerca sul web, crea sondaggi e aggiorna prenotazioni, programma e spese. Non paga e non salva carte: prepara tutto e ti dà il link.</span></div>
    ${!msgs.length ? `<div class="empty"><div class="big">✨</div>Chiedi qualsiasi cosa sulla vacanza.</div>
      <div class="chips">${AI_SUGGESTIONS.map(s => `<button class="chip" data-act="ask" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
    ${msgs.map(m => {
      const day = fmtDate(m.created_at, { weekday: "long", day: "numeric", month: "long" });
      const sep = day !== lastDay ? `<div class="time-sep">${esc(day)}</div>` : ""; lastDay = day;
      const time = new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      if (m.role === "assistant") return `${sep}<div class="msg ai">${avatar(null)}<div class="bubble"><div class="who">Assistente · ${time}</div>${md(m.content)}</div></div>`;
      const mine = m.member_id === ME; const who = member(m.member_id);
      return `${sep}<div class="msg ${mine ? "mine" : ""}">${mine ? "" : avatar(who)}<div class="bubble">${mine ? "" : `<div class="who">${esc(who?.name || "—")} · ${time}</div>`}${esc(m.content).replace(/\n/g, "<br>")}</div></div>`;
    }).join("")}
    ${UI.waiting ? `<div class="msg ai">${avatar(null)}<div class="bubble"><div class="who" id="thinking-label">Sto pensando…</div><div class="typing"><span></span><span></span><span></span></div></div></div>` : ""}
  </div>`;
}

let thinkingTimer = null;
async function ask(text) {
  text = String(text || "").trim();
  if (!text || UI.waiting) return;
  UI.waiting = true;
  go("chat"); render();
  const labels = ["Sto pensando…", "Leggo i dati del gruppo…", "Cerco sul web…", "Confronto le opzioni…", "Ancora un attimo…"];
  let i = 0;
  thinkingTimer = setInterval(() => { const el = $("#thinking-label"); if (el) el.textContent = labels[Math.min(++i, labels.length - 1)]; }, 4000);
  try {
    if (CLOUD) S.messages.push({ id: "tmp", member_id: ME, role: "user", content: text, created_at: new Date().toISOString() });
    render();
    await api.ask(text);
  } catch (e) {
    toast("L'assistente non risponde: " + e.message);
  } finally {
    clearInterval(thinkingTimer);
    UI.waiting = false;
    await reload();
  }
}

// ───────────────────────── Gruppo e profili ─────────────────────────

function viewGruppo() {
  const m = me();
  const t = trip();
  return `
  <section class="card">
    <div class="row">${avatar(m, "lg")}<div class="grow"><h3 style="font-size:20px">${esc(m.name)}</h3>
      <div class="small muted">${m.is_admin ? "Organizzatore · " : ""}${RSVP[m.rsvp]}</div></div></div>
    <div class="actions"><button class="btn" data-act="edit-profile">✏️ Profilo</button><button class="btn" data-act="edit-private">🔒 Dati documenti</button></div>
  </section>

  <section class="card">
    <h2>Invita</h2>
    <div class="row between"><div><div class="small muted">Codice invito</div><div style="font-size:22px;font-weight:700;letter-spacing:.12em">${esc(t.invite_code || "—")}</div></div>
    <button class="btn primary" data-act="invite">Condividi link</button></div>
  </section>

  <div class="section-title">Partecipanti (${S.members.length})</div>
  <section class="card">${S.members.slice().sort(byCreated).map(x => `
    <div class="list-item tap" data-act="member" data-id="${x.id}">
      ${avatar(x)}
      <div class="grow"><div class="row" style="gap:6px"><b class="ellipsis">${esc(x.name)}</b>${x.is_admin ? `<span class="pill admin">👑</span>` : ""}<span class="pill ${x.rsvp}">${RSVP[x.rsvp]}</span></div>
        <div class="small muted ellipsis">${[x.departure_city && "da " + x.departure_city, x.car_seats ? `🚗 ${x.car_seats} posti` : "", x.diet, x.allergies && "⚠️ " + x.allergies].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div></div>
      ${x.phone ? `<a class="chip" href="${esc(waUrl(x.phone))}" target="_blank" rel="noopener" data-stop>💬</a>` : ""}
    </div>`).join("")}
  </section>

  ${isAdmin() ? `
  <div class="section-title">Strumenti organizzatore</div>
  <section class="card stack">
    <button class="btn block" data-act="edit-trip">🧳 Dati del viaggio (destinazione, date)</button>
    <button class="btn block" data-act="guest-list">📋 Lista ospiti per prenotazioni</button>
    <div class="small muted">La lista ospiti contiene nomi, documenti e contatti di chi li ha inseriti: incollala nei moduli di hotel e biglietterie, o dalla a Claude in Chrome per compilarli.</div>
  </section>` : ""}

  <div class="section-title">App</div>
  <section class="card stack">
    ${isIOS && !isStandalone() ? `<button class="btn block" data-act="install">📲 Aggiungi alla schermata Home</button>` : ""}
    <button class="btn block" data-act="change-pin">🔑 Cambia PIN</button>
    <button class="btn block danger" data-act="logout">Esci da questo telefono</button>
    ${!CLOUD ? `<div class="banner" style="margin:0">Modalità prova: i dati restano su questo telefono. Per condividerli con il gruppo collega il database (vedi guida).</div>` : ""}
  </section>`;
}

function sheetMember(id) {
  const x = member(id); if (!x) return;
  const p = S.member_private.find(r => r.member_id === id);
  const row = (l, v) => (v ? `<div class="list-item"><div class="small muted" style="width:120px">${l}</div><div class="grow">${esc(v)}</div></div>` : "");
  openSheet(`
    <div class="row" style="gap:14px;margin-bottom:14px">${avatar(x, "lg")}<div><h2 style="margin:0">${esc(x.name)}</h2><span class="pill ${x.rsvp}">${RSVP[x.rsvp]}</span> ${x.is_admin ? `<span class="pill admin">Organizzatore</span>` : ""}</div></div>
    ${x.phone ? `<div class="chips" style="margin-bottom:14px"><a class="chip" href="${esc(telUrl(x.phone))}">📞 Chiama</a><a class="chip" href="${esc(waUrl(x.phone))}" target="_blank" rel="noopener">💬 WhatsApp</a></div>` : ""}
    <section class="card">
      ${row("Telefono", x.phone)}${row("Email", x.email)}${row("Parte da", x.departure_city)}
      ${row("Posti auto liberi", x.car_seats ? String(x.car_seats) : "")}${row("Dieta", x.diet)}${row("Allergie", x.allergies)}
      ${row("Preferenze", x.preferences)}${row("Emergenza", [x.emergency_name, x.emergency_phone].filter(Boolean).join(" · "))}
      ${!x.phone && !x.diet && !x.allergies && !x.departure_city ? `<div class="small muted">Profilo ancora da completare.</div>` : ""}
    </section>
    ${p && (isAdmin() || id === ME) ? `<div class="section-title">🔒 Dati riservati</div><section class="card">
      ${row("Nome completo", p.legal_name)}${row("Nascita", [p.birth_date && fmtDate(p.birth_date, { day: "numeric", month: "long", year: "numeric" }), p.birth_place].filter(Boolean).join(" · "))}
      ${row("Cittadinanza", p.nationality)}${row("Codice fiscale", p.fiscal_code)}${row("Documento", [p.doc_type, p.doc_number].filter(Boolean).join(" n. "))}
      ${row("Rilasciato da", p.doc_issued_by)}${row("Scadenza", p.doc_expiry && fmtDate(p.doc_expiry, { day: "numeric", month: "long", year: "numeric" }))}${row("Indirizzo", p.address)}
    </section>` : ""}
    ${isAdmin() && id !== ME ? `<div class="stack">
      <button class="btn block" data-act="toggle-admin" data-id="${id}">${x.is_admin ? "Togli ruolo organizzatore" : "👑 Rendi organizzatore"}</button>
      <button class="btn block" data-act="reset-pin" data-id="${id}">🔑 Reimposta PIN</button>
      <button class="btn block danger" data-act="remove-member" data-id="${id}">Rimuovi dal gruppo</button></div>` : ""}
    ${id === ME ? `<button class="btn primary block" data-act="edit-profile">Modifica il mio profilo</button>` : ""}`);
}

function sheetProfile() {
  const m = me();
  openSheet(`
    <h2>Il mio profilo</h2>
    <form data-form="profile">
      <div class="field"><label>Nome</label><input name="name" required maxlength="40" value="${esc(m.name)}"></div>
      <div class="field"><label>Avatar</label><div class="emoji-grid">${EMOJIS.map(e => `<button type="button" class="${m.emoji === e ? "on" : ""}" data-act="pick-emoji" data-e="${e}">${e}</button>`).join("")}</div><input type="hidden" name="emoji" value="${esc(m.emoji)}"></div>
      <div class="two">
        <div class="field"><label>Cellulare</label><input name="phone" inputmode="tel" value="${esc(m.phone || "")}" placeholder="+39…"></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${esc(m.email || "")}"></div>
      </div>
      <div class="two">
        <div class="field"><label>Parto da</label><input name="departure_city" value="${esc(m.departure_city || "")}" placeholder="Città"></div>
        <div class="field"><label>Posti auto liberi</label><input name="car_seats" inputmode="numeric" value="${esc(m.car_seats || 0)}"></div>
      </div>
      <div class="field"><label>Dieta</label><input name="diet" value="${esc(m.diet || "")}" placeholder="Vegetariano, vegano, senza glutine…"></div>
      <div class="field"><label>Allergie / intolleranze</label><input name="allergies" value="${esc(m.allergies || "")}"></div>
      <div class="field"><label>Preferenze e desideri</label><textarea name="preferences" placeholder="Es. camera tranquilla, niente discoteca, voglio sciare…">${esc(m.preferences || "")}</textarea></div>
      <div class="two">
        <div class="field"><label>Contatto emergenza</label><input name="emergency_name" value="${esc(m.emergency_name || "")}" placeholder="Nome"></div>
        <div class="field"><label>Tel. emergenza</label><input name="emergency_phone" inputmode="tel" value="${esc(m.emergency_phone || "")}"></div>
      </div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Salva</button></div>
    </form>`);
}

function sheetPrivate() {
  const p = S.member_private.find(r => r.member_id === ME) || {};
  openSheet(`
    <h2>Dati per le prenotazioni</h2>
    <div class="privacy"><span>🔒</span><span>Li vedete solo tu e l'organizzatore. Servono per registrarsi in hotel (in Italia è obbligatorio per legge), biglietti nominativi e liste ospiti. Non inserire mai dati di carte di pagamento.</span></div>
    <form data-form="private">
      <div class="field"><label>Nome e cognome come sul documento</label><input name="legal_name" value="${esc(p.legal_name || "")}" autocomplete="name"></div>
      <div class="two">
        <div class="field"><label>Data di nascita</label><input type="date" name="birth_date" value="${esc(p.birth_date || "")}"></div>
        <div class="field"><label>Luogo di nascita</label><input name="birth_place" value="${esc(p.birth_place || "")}"></div>
      </div>
      <div class="two">
        <div class="field"><label>Cittadinanza</label><input name="nationality" value="${esc(p.nationality || "Italiana")}"></div>
        <div class="field"><label>Codice fiscale</label><input name="fiscal_code" value="${esc(p.fiscal_code || "")}" autocapitalize="characters"></div>
      </div>
      <div class="two">
        <div class="field"><label>Documento</label><select name="doc_type">${DOC_TYPES.map(d => `<option ${p.doc_type === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
        <div class="field"><label>Numero</label><input name="doc_number" value="${esc(p.doc_number || "")}" autocapitalize="characters"></div>
      </div>
      <div class="two">
        <div class="field"><label>Rilasciato da</label><input name="doc_issued_by" value="${esc(p.doc_issued_by || "")}" placeholder="Comune di…"></div>
        <div class="field"><label>Scadenza</label><input type="date" name="doc_expiry" value="${esc(p.doc_expiry || "")}"></div>
      </div>
      <div class="field"><label>Indirizzo di residenza</label><input name="address" value="${esc(p.address || "")}" autocomplete="street-address"></div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Salva</button></div>
    </form>`);
}

function sheetTrip() {
  const t = trip();
  openSheet(`
    <h2>Dati del viaggio</h2>
    <form data-form="trip">
      <div class="field"><label>Nome</label><input name="name" required value="${esc(t.name || "Capodanno")}"></div>
      <div class="field"><label>Destinazione</label><input name="destination" value="${esc(t.destination || "")}" placeholder="Da decidere con un sondaggio"></div>
      <div class="two">
        <div class="field"><label>Partenza</label><input type="date" name="start_date" value="${esc(t.start_date || "")}"></div>
        <div class="field"><label>Ritorno</label><input type="date" name="end_date" value="${esc(t.end_date || "")}"></div>
      </div>
      <div class="field"><label>Note per tutti</label><textarea name="notes">${esc(t.notes || "")}</textarea></div>
      ${CLOUD ? `<div class="field"><label>Codice invito</label><input name="invite_code" required minlength="4" value="${esc(t.invite_code || "")}" autocapitalize="characters"><div class="hint">Cambialo se il link è finito nelle mani sbagliate: chi è già dentro resta dentro.</div></div>` : ""}
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Salva</button></div>
    </form>`);
}

function guestListText() {
  const lines = [`OSPITI - ${trip().name}${trip().destination ? " - " + trip().destination : ""}`, `Persone confermate: ${S.members.filter(m => m.rsvp === "si").length}`, ""];
  S.members.filter(m => m.rsvp !== "no").forEach((m, i) => {
    const p = S.member_private.find(r => r.member_id === m.id) || {};
    lines.push(`${i + 1}. ${p.legal_name || m.name}${m.rsvp === "forse" ? " (da confermare)" : ""}`);
    const birth = [p.birth_date && "nato/a il " + fmtDate(p.birth_date, { day: "2-digit", month: "2-digit", year: "numeric" }), p.birth_place && "a " + p.birth_place].filter(Boolean).join(" ");
    if (birth) lines.push(`   ${birth}${p.nationality ? " · " + p.nationality : ""}`);
    if (p.fiscal_code) lines.push(`   Codice fiscale: ${p.fiscal_code}`);
    if (p.doc_number) lines.push(`   ${p.doc_type || "Documento"} n. ${p.doc_number}${p.doc_issued_by ? ", rilasciato da " + p.doc_issued_by : ""}${p.doc_expiry ? ", scad. " + fmtDate(p.doc_expiry, { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}`);
    if (p.address) lines.push(`   Residenza: ${p.address}`);
    const contact = [m.phone, m.email].filter(Boolean).join(" · ");
    if (contact) lines.push(`   Contatti: ${contact}`);
    if (m.diet || m.allergies) lines.push(`   Alimentazione: ${[m.diet, m.allergies && "allergie: " + m.allergies].filter(Boolean).join(", ")}`);
    lines.push("");
  });
  return lines.join("\n");
}

function sheetGuestList() {
  const text = guestListText();
  const missing = S.members.filter(m => m.rsvp !== "no" && !S.member_private.find(r => r.member_id === m.id)?.doc_number);
  openSheet(`
    <h2>Lista ospiti</h2>
    ${missing.length ? `<div class="banner">Mancano i documenti di: ${missing.map(m => esc(m.name)).join(", ")}. Chiedi di compilarli in Gruppo → 🔒 Dati documenti.</div>` : ""}
    <textarea readonly style="min-height:300px;font-size:13px;font-family:ui-monospace,monospace">${esc(text)}</textarea>
    <div class="actions"><button class="btn" data-act="copy" data-text="${esc(text)}">📋 Copia</button>${navigator.share ? `<button class="btn primary" data-act="share-text" data-text="${esc(text)}">Condividi</button>` : ""}</div>`);
}

function sheetInstall() {
  openSheet(`
    <h2>Mettila sulla Home</h2>
    <div class="stack">
      <div class="row"><div class="icon-box">1</div><div>In Safari tocca <b>Condividi</b> <span style="font-size:20px">⎋</span> (il quadrato con la freccia in su, in basso).</div></div>
      <div class="row"><div class="icon-box">2</div><div>Scorri e tocca <b>Aggiungi alla schermata Home</b>, poi <b>Aggiungi</b>.</div></div>
      <div class="row"><div class="icon-box">3</div><div>Apri l'app dall'icona 🎆 e rientra scegliendo il tuo nome e il PIN.</div></div>
    </div>
    <div class="actions"><button class="btn primary" data-act="close-sheet">Ho capito</button></div>`);
}

// ───────────────────────── Onboarding ─────────────────────────

const ONB = { code: "", preview: null, step: "code", who: null, emoji: "🥳", err: "" };
let onbStop = null;

function showOnboarding() {
  $("#tabbar").hidden = true;
  $("#composer").classList.remove("show");
  const urlCode = new URLSearchParams(location.search).get("c");
  ONB.code = ONB.code || urlCode || localStorage.getItem(CODE_KEY) || (CLOUD ? "" : "DEMO");
  renderOnboarding();
  if (urlCode && !ONB.preview) onbCheckCode(urlCode);
}

function renderOnboarding() {
  const P = ONB.preview;
  let body = "";
  if (ONB.step === "code") {
    body = `
      <form data-form="onb-code" class="stack">
        <div class="field"><label>Codice invito</label><input name="code" required value="${esc(ONB.code)}" autocapitalize="characters" autocomplete="off" placeholder="Te l'ha mandato l'organizzatore" style="text-align:center;letter-spacing:.15em;font-size:20px"></div>
        <button class="btn primary block">Entra</button>
      </form>`;
  } else if (ONB.step === "who") {
    body = `
      <div class="muted" style="margin-bottom:6px">Benvenuto in <b style="color:#fff">${esc(P.name)}</b>. Chi sei?</div>
      ${P.members.length ? `<div class="who-list">${P.members.map(m => `<button data-act="onb-pick" data-id="${m.id}">${avatar(m, "sm")}<span class="ellipsis">${esc(m.name)}</span></button>`).join("")}</div>
        <div class="small faint" style="margin-bottom:10px">Ti sei già unito da un altro telefono o da Safari? Tocca il tuo nome.</div>` : `<div class="small faint" style="margin:6px 0 14px">Sei il primo: diventerai l'organizzatore 👑</div>`}
      <button class="btn primary block" data-act="onb-new">Sono nuovo/a</button>`;
  } else if (ONB.step === "pin") {
    const m = P.members.find(x => x.id === ONB.who);
    body = `
      <form data-form="onb-rejoin" class="stack">
        <div class="row" style="justify-content:center">${avatar(m, "lg")}</div>
        <div style="text-align:center;font-size:20px;font-weight:700">Ciao ${esc(m?.name)}!</div>
        <div class="field"><label>Il tuo PIN</label><input name="pin" class="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="one-time-code" autofocus></div>
        <button class="btn primary block">Entra</button>
        <button type="button" class="btn block" data-act="onb-back">Indietro</button>
      </form>`;
  } else if (ONB.step === "new") {
    body = `
      <form data-form="onb-join" class="stack">
        <div class="field"><label>Come ti chiami?</label><input name="name" required maxlength="40" autocomplete="given-name" placeholder="Nome (come ti chiamano gli amici)"></div>
        <div class="field"><label>Scegli il tuo avatar</label><div class="emoji-grid">${EMOJIS.map(e => `<button type="button" class="${ONB.emoji === e ? "on" : ""}" data-act="onb-emoji" data-e="${e}">${e}</button>`).join("")}</div></div>
        <div class="two">
          <div class="field"><label>Scegli un PIN</label><input name="pin" class="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password"></div>
          <div class="field"><label>Ripetilo</label><input name="pin2" class="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password"></div>
        </div>
        <div class="small faint">4 cifre: ti servono per rientrare da un altro telefono o dopo aver aggiunto l'app alla Home.</div>
        <button class="btn primary block">Unisciti</button>
        <button type="button" class="btn block" data-act="onb-back">Indietro</button>
      </form>`;
  }
  $("#root").innerHTML = `
    <div class="onb">
      <canvas id="onb-fw"></canvas>
      <div class="logo">Capodanno</div>
      <div class="tag">Decidiamo, prenotiamo e festeggiamo. Insieme. 🥂</div>
      ${!CLOUD ? `<div class="banner">Modalità prova: i dati restano su questo telefono. Codice invito: <b>DEMO</b></div>` : ""}
      ${body}
      <div class="err" id="onb-err">${esc(ONB.err)}</div>
    </div>`;
  onbStop && onbStop();
  onbStop = fireworks($("#onb-fw"));
}

async function onbCheckCode(code) {
  ONB.err = "";
  try {
    const p = await api.preview(code);
    if (!p) { ONB.err = "Codice invito non valido. Controlla il messaggio dell'organizzatore."; ONB.step = "code"; }
    else { ONB.code = code.trim().toUpperCase(); ONB.preview = p; ONB.step = "who"; localStorage.setItem(CODE_KEY, ONB.code); }
  } catch (e) { ONB.err = e.message; }
  renderOnboarding();
}

async function enterApp(memberId) {
  ME = memberId;
  onbStop && onbStop();
  ONB.preview = null; ONB.step = "code";
  window.scrollTo(0, 0);
  await reload();
  api.subscribe(scheduleReload);
  if (isIOS && !isStandalone()) setTimeout(sheetInstall, 600);
}

// ───────────────────────── Sheet e toast ─────────────────────────

function openSheet(html) {
  const el = $("#sheet");
  el.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div><div class="sheet-panel" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  el.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  const el = $("#sheet");
  el.classList.remove("open"); el.innerHTML = "";
  document.body.style.overflow = "";
}
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copiato ✓"); }
  catch { toast("Tieni premuto sul testo per copiarlo"); }
}

// ───────────────────────── Azioni (click) ─────────────────────────

const ACTIONS = {
  tab: el => { closeSheet(); go(el.dataset.tab); },
  "close-sheet": () => closeSheet(),
  ask: el => ask(el.dataset.q),
  copy: el => copy(el.dataset.text),
  "share-text": el => navigator.share({ text: el.dataset.text }).catch(() => {}),
  install: () => sheetInstall(),
  async rsvp(el) {
    try { await api.update("members", { id: ME }, { rsvp: el.dataset.v }); me().rsvp = el.dataset.v; render(); } catch (e) { toast(e.message); }
  },
  async invite() {
    const code = trip().invite_code;
    const url = `${location.origin}${location.pathname}?c=${encodeURIComponent(code)}`;
    const text = `🎆 Organizziamo il Capodanno insieme! Entra qui, vota e scegli con noi: ${url}\nCodice invito: ${code}`;
    if (navigator.share) navigator.share({ title: "Capodanno", text }).catch(() => {});
    else copy(text);
  },
  async "starter-polls"(el) {
    el.disabled = true;
    try {
      for (const t of POLL_TEMPLATES) await createPoll({ question: t.q, description: t.d, multi: t.multi, options: t.opts });
      toast("Sondaggi creati 🗳️"); await reload(); go("vota");
    } catch (e) { toast(e.message); el.disabled = false; }
  },
  "new-poll": () => sheetNewPoll(),
  "poll-template": el => sheetNewPoll(POLL_TEMPLATES[el.dataset.i]),
  "more-opt": () => { const i = document.createElement("input"); i.name = "opt"; i.placeholder = "Opzione"; $("#opt-list").append(i); i.focus(); },
  vote: el => toggleVote(el.dataset.poll, el.dataset.opt),
  "add-option": el => openSheet(`
    <h2>Proponi un'opzione</h2>
    <form data-form="option" data-poll="${el.dataset.id}">
      <div class="field"><label>Opzione</label><input name="label" required maxlength="120" autofocus></div>
      <div class="field"><label>Dettagli (facoltativi)</label><input name="details" maxlength="300" placeholder="Perché ti piace, cosa include…"></div>
      <div class="two"><div class="field"><label>Prezzo indicativo €</label><input name="price" inputmode="decimal"></div><div class="field"><label>Link</label><input name="url" inputmode="url"></div></div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Aggiungi</button></div>
    </form>`),
  "poll-menu": el => {
    const p = S.polls.find(x => x.id === el.dataset.id);
    openSheet(`<h2>${esc(p.question)}</h2><div class="stack">
      <button class="btn block" data-act="poll-status" data-id="${p.id}">${p.status === "open" ? "🔒 Chiudi il sondaggio" : "🔓 Riapri"}</button>
      ${isAdmin() && p.status === "open" ? `<div class="small muted">Chiudendolo l'opzione più votata viene segnata come decisa. Poi aggiorna i dati del viaggio se serve.</div>` : ""}
      <button class="btn block danger" data-act="delete" data-t="polls" data-id="${p.id}">Elimina</button>
      <button class="btn block" data-act="close-sheet">Annulla</button></div>`);
  },
  async "poll-status"(el) {
    const p = S.polls.find(x => x.id === el.dataset.id);
    try { await api.update("polls", { id: p.id }, { status: p.status === "open" ? "closed" : "open" }); closeSheet(); await reload(); } catch (e) { toast(e.message); }
  },
  async delete(el) {
    if (!confirm("Eliminare definitivamente?")) return;
    try { await api.remove(el.dataset.t, { id: el.dataset.id }); closeSheet(); toast("Eliminato"); await reload(); } catch (e) { toast(e.message); }
  },
  "plan-seg": el => { UI.planSeg = el.dataset.v; render(); },
  booking: el => sheetBooking(el.dataset.id),
  "edit-booking": el => sheetEditBooking(el.dataset.id),
  async "booking-to-expense"(el) {
    const b = S.bookings.find(x => x.id === el.dataset.id);
    sheetEditExpense(null, { title: b.title, amount: b.price, paid_by: b.paid_by, category: ["alloggio", "viaggio", "attivita"].includes(b.category) ? b.category : b.category === "ristorante" || b.category === "cenone" ? "cibo" : "altro" });
  },
  "edit-item": el => sheetEditItem(el.dataset.id),
  "edit-check": el => sheetEditCheck(el.dataset.id),
  async "check-toggle"(el) {
    const c = S.checklist.find(x => x.id === el.dataset.id);
    try { c.done = !c.done; render(); await api.update("checklist", { id: c.id }, { done: c.done }); } catch (e) { toast(e.message); scheduleReload(); }
  },
  "edit-expense": el => sheetEditExpense(el.dataset.id),
  async settle(el) {
    const { from, to, amount } = el.dataset;
    if (!confirm(`${mname(from)} ha dato ${eur(amount)} a ${mname(to)}?`)) return;
    try {
      await api.insert("expenses", { title: `Rimborso ${mname(from)} → ${mname(to)}`, amount: Number(amount), paid_by: from, split_among: [to], category: "rimborso", spent_on: today(), created_by: ME });
      toast("Segnato come saldato ✓"); await reload();
    } catch (e) { toast(e.message); }
  },
  member: el => sheetMember(el.dataset.id),
  "edit-profile": () => sheetProfile(),
  "edit-private": () => sheetPrivate(),
  "edit-trip": () => sheetTrip(),
  "guest-list": () => sheetGuestList(),
  "pick-emoji": el => { $$(".emoji-grid button").forEach(b => b.classList.toggle("on", b === el)); $('input[name="emoji"]').value = el.dataset.e; },
  async "toggle-admin"(el) {
    const x = member(el.dataset.id);
    try { await api.update("members", { id: x.id }, { is_admin: !x.is_admin }); closeSheet(); await reload(); } catch (e) { toast(e.message); }
  },
  async "reset-pin"(el) {
    const pin = prompt(`Nuovo PIN di 4 cifre per ${mname(el.dataset.id)}:`);
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) return toast("Il PIN deve avere 4 cifre");
    try { await api.resetPin(el.dataset.id, pin); toast("PIN reimpostato: comunicalo in privato"); } catch (e) { toast(e.message); }
  },
  async "change-pin"() {
    const pin = prompt("Nuovo PIN (4 cifre):");
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) return toast("Il PIN deve avere 4 cifre");
    try { await api.resetPin(ME, pin); toast("PIN cambiato ✓"); } catch (e) { toast(e.message); }
  },
  async "remove-member"(el) {
    if (!confirm(`Rimuovere ${mname(el.dataset.id)} dal gruppo? Spariscono anche i suoi voti e le spese pagate da lui/lei.`)) return;
    try { await api.remove("members", { id: el.dataset.id }); closeSheet(); await reload(); } catch (e) { toast(e.message); }
  },
  async logout() {
    if (!confirm("Uscire da questo telefono? Potrai rientrare con nome e PIN.")) return;
    await api.leave(); ME = null; localStorage.removeItem(CACHE_KEY); location.reload();
  },
  "onb-pick": el => { ONB.who = el.dataset.id; ONB.step = "pin"; ONB.err = ""; renderOnboarding(); },
  "onb-new": () => { ONB.step = "new"; ONB.err = ""; renderOnboarding(); },
  "onb-back": () => { ONB.step = ONB.preview ? "who" : "code"; ONB.err = ""; renderOnboarding(); },
  "onb-emoji": el => { ONB.emoji = el.dataset.e; $$(".emoji-grid button").forEach(b => b.classList.toggle("on", b === el)); },
};

document.addEventListener("click", e => {
  if (e.target.closest("[data-stop]")) return;
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener("change", e => {
  if (e.target.matches("[data-chip]")) e.target.closest(".chip").classList.toggle("on", e.target.checked);
});

// ───────────────────────── Moduli (submit) ─────────────────────────

const val = (fd, k) => { const v = fd.get(k); return v === null ? null : String(v).trim() || null; };

const FORMS = {
  async "onb-code"(fd) { await onbCheckCode(val(fd, "code") || ""); },
  async "onb-rejoin"(fd) {
    try { await enterApp(await api.rejoin(ONB.code, ONB.who, val(fd, "pin"))); }
    catch (e) { ONB.err = e.message; renderOnboarding(); }
  },
  async "onb-join"(fd) {
    if (val(fd, "pin") !== val(fd, "pin2")) { ONB.err = "I due PIN non coincidono"; return renderOnboarding(); }
    try { await enterApp(await api.join(ONB.code, val(fd, "name"), ONB.emoji, val(fd, "pin"))); }
    catch (e) { ONB.err = e.message; renderOnboarding(); }
  },
  async poll(fd) {
    const options = fd.getAll("opt").map(s => String(s).trim()).filter(Boolean);
    await createPoll({ question: val(fd, "question"), description: val(fd, "description"), multi: fd.get("multi") === "on", allowAdd: fd.get("allow_add") === "on", options });
    toast("Sondaggio creato 🗳️");
  },
  async option(fd, f) {
    await api.insert("poll_options", { poll_id: f.dataset.poll, label: val(fd, "label"), details: val(fd, "details"), price: num(fd.get("price")), url: val(fd, "url"), added_by: ME });
  },
  async booking(fd, f) {
    const row = {
      title: val(fd, "title"), category: val(fd, "category"), status: val(fd, "status"), provider: val(fd, "provider"), code: val(fd, "code"),
      start_at: fromLocalInput(val(fd, "start_at")), end_at: fromLocalInput(val(fd, "end_at")), address: val(fd, "address"), url: val(fd, "url"),
      phone: val(fd, "phone"), price: num(fd.get("price")), paid_by: val(fd, "paid_by"), cancel_by: val(fd, "cancel_by"), notes: val(fd, "notes"),
    };
    if (f.dataset.id) await api.update("bookings", { id: f.dataset.id }, row);
    else await api.insert("bookings", { ...row, created_by: ME });
    toast("Prenotazione salvata ✓");
  },
  async item(fd, f) {
    const row = { title: val(fd, "title"), day: val(fd, "day"), time: val(fd, "time"), place: val(fd, "place"), notes: val(fd, "notes") };
    if (f.dataset.id) await api.update("itinerary", { id: f.dataset.id }, row);
    else await api.insert("itinerary", { ...row, created_by: ME });
  },
  async "check-quick"(fd, f) { await api.insert("checklist", { text: val(fd, "text"), created_by: ME }); f.reset(); },
  async check(fd, f) { await api.update("checklist", { id: f.dataset.id }, { text: val(fd, "text"), assignee: val(fd, "assignee") }); },
  async expense(fd, f) {
    const amount = num(fd.get("amount"));
    const split = fd.getAll("split");
    if (!amount || amount <= 0) throw new Error("Inserisci un importo valido");
    if (!split.length) throw new Error("Seleziona almeno una persona");
    const row = { title: val(fd, "title"), amount, spent_on: val(fd, "spent_on") || today(), paid_by: val(fd, "paid_by"), category: val(fd, "category"), split_among: split };
    if (f.dataset.id) await api.update("expenses", { id: f.dataset.id }, row);
    else await api.insert("expenses", { ...row, created_by: ME });
    toast("Spesa salvata ✓");
  },
  async profile(fd) {
    await api.update("members", { id: ME }, {
      name: val(fd, "name"), emoji: val(fd, "emoji"), phone: val(fd, "phone"), email: val(fd, "email"), departure_city: val(fd, "departure_city"),
      car_seats: parseInt(fd.get("car_seats"), 10) || 0, diet: val(fd, "diet"), allergies: val(fd, "allergies"), preferences: val(fd, "preferences"),
      emergency_name: val(fd, "emergency_name"), emergency_phone: val(fd, "emergency_phone"),
    });
    toast("Profilo salvato ✓");
  },
  async private(fd) {
    const keys = ["legal_name", "birth_date", "birth_place", "nationality", "fiscal_code", "doc_type", "doc_number", "doc_issued_by", "doc_expiry", "address"];
    await api.upsert("member_private", { member_id: ME, ...Object.fromEntries(keys.map(k => [k, val(fd, k)])), updated_at: new Date().toISOString() });
    toast("Dati salvati 🔒");
  },
  async trip(fd) {
    const patch = { name: val(fd, "name"), destination: val(fd, "destination"), start_date: val(fd, "start_date"), end_date: val(fd, "end_date"), notes: val(fd, "notes") };
    if (CLOUD) patch.invite_code = (val(fd, "invite_code") || "").toUpperCase();
    await api.update("trip", { id: 1 }, patch);
    toast("Viaggio aggiornato ✓");
  },
};

document.addEventListener("submit", async e => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector("button:not([type=button])");
  if (btn) btn.disabled = true;
  try {
    await FORMS[f.dataset.form](new FormData(f), f);
    if (f.closest(".sheet")) { closeSheet(); await reload(); }
    else if (ME && !f.dataset.form.startsWith("onb")) await reload();
  } catch (err) {
    toast(err.message || "Errore");
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
});

// Composer della chat
const composer = $("#composer-input");
composer.addEventListener("input", () => { composer.style.height = "auto"; composer.style.height = Math.min(140, composer.scrollHeight) + "px"; });
composer.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !isIOS) { e.preventDefault(); $("#composer-form").requestSubmit(); } });
$("#composer-form").addEventListener("submit", e => {
  e.preventDefault();
  e.stopPropagation();
  const text = composer.value;
  composer.value = ""; composer.style.height = "auto";
  ask(text);
});

// ───────────────────────── Avvio ─────────────────────────

function stars() {
  const box = $(".stars");
  box.innerHTML = Array.from({ length: 40 }, () =>
    `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${(Math.random() * 3.5).toFixed(2)}s;${Math.random() < .3 ? "width:3px;height:3px" : ""}"></i>`).join("");
}

async function boot() {
  stars();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const cached = loadCache();
  if (cached) render();
  try {
    await api.init();
    const id = await api.whoami();
    if (!id) { ME = null; return showOnboarding(); }
    ME = id;
    await reload();
    api.subscribe(scheduleReload);
  } catch (e) {
    console.error(e);
    if (cached) { OFFLINE = true; render(); }
    else $("#root").innerHTML = `<div class="onb"><div class="logo">Capodanno</div><div class="err">Non riesco a collegarmi: ${esc(e.message)}</div><button class="btn primary" onclick="location.reload()">Riprova</button></div>`;
  }
}

document.addEventListener("visibilitychange", () => { if (!document.hidden && ME) scheduleReload(); });
addEventListener("online", () => ME && scheduleReload());
addEventListener("offline", () => { OFFLINE = true; ME && render(); });

boot();
