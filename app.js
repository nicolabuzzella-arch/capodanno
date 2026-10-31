/* Capodanno - app di gruppo.
   Due motori dati con la stessa interfaccia:
   - Cloud: Supabase (dati condivisi in tempo reale, documenti, assistente AI)
   - Local: modalità prova, tutto su questo telefono (quando config.js è vuoto)
   I giochi stanno in games.js. */
"use strict";

const CFG = window.CAPODANNO_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
const TABLES = ["trip", "members", "member_private", "polls", "poll_options", "votes", "bookings", "expenses", "payment_requests", "itinerary", "checklist", "messages", "files", "scores", "feedback"];
const CACHE_KEY = "capodanno-cache-v3";
const CODE_KEY = "capodanno-code";
const SEEN_KEY = "capodanno-chat-seen";
const LAST_KEY = "capodanno-last-member";
const PUSH_KEY = "capodanno-push";
const BUCKET = "documenti";

// ───────────────────────── Utilità ─────────────────────────

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
const eur = n => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const cents = v => Math.round((Number(v) || 0) * 100);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const byCreated = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
const safeUrl = u => { u = String(u || "").trim(); if (!u) return ""; return /^https?:\/\//i.test(u) ? u : "https://" + u.replace(/^[a-z]+:/i, ""); };
const telUrl = p => "tel:" + String(p || "").replace(/[^\d+]/g, "");
const waUrl = p => { let d = String(p || "").replace(/[^\d+]/g, "").replace(/^\+/, ""); if (d.length === 10 && d.startsWith("3")) d = "39" + d; return "https://wa.me/" + d; };
const mapsUrl = a => "https://maps.apple.com/?q=" + encodeURIComponent(a);
const paypalUser = s => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?paypal\.(me|com\/paypalme)\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
const paypalUrl = (user, amount) => `https://www.paypal.com/paypalme/${encodeURIComponent(paypalUser(user))}/${Number(amount).toFixed(2)}EUR`;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const initials = n => String(n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* spazio pieno o bloccato */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

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
const fmtTime = d => new Date(d).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const toLocalInput = d => {
  if (!d) return "";
  const x = new Date(d); if (isNaN(x)) return "";
  const p = n => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};
const fromLocalInput = v => (v ? new Date(v).toISOString() : null);

// ───────────────────────── Icone (tratto unico, 24×24) ─────────────────────────

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  vote: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><path d="m8 12.2 2.8 2.8L16 9.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="4.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  wallet: '<path d="M4 7.5V7a2.5 2.5 0 0 1 2.5-2.5h10A1.5 1.5 0 0 1 18 6v1.5"/><rect x="3" y="7.5" width="18" height="13" rx="3.5"/><path d="M21 12h-4a2 2 0 0 0 0 4h4"/>',
  spark: '<path d="M12 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7Z"/><path d="M19 15.5c.25 1.6 1 2.3 2.5 2.5-1.5.2-2.25 1-2.5 2.5-.25-1.5-1-2.3-2.5-2.5 1.5-.2 2.25-.9 2.5-2.5Z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="m9.5 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  phone: '<path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  chat: '<path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.5A3.5 3.5 0 0 1 4 12.5Z"/>',
  bed: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="2"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="4"/><path d="M5 10h14M9 21l1.5-4M15 21l-1.5-4M9 13.5h.01M15 13.5h.01"/>',
  glass: '<path d="M7.5 3h9l-.6 6.5a3.9 3.9 0 0 1-7.8 0Z"/><path d="M12 13.5V20M8.5 21h7M8 7h8"/>',
  music: '<path d="M9 18V5.5l11-2.5v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  fork: '<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 1.2-3.5 3.6-3.5 7v3H17"/>',
  mountain: '<path d="m2.5 20 7-12 4 6.5 2.5-3.5 5.5 9Z"/><path d="m7.6 11.4 1.9 1.4 2-1.4"/>',
  car: '<path d="M4 16.5V12l2.2-5.2A1.5 1.5 0 0 1 7.6 6h8.8a1.5 1.5 0 0 1 1.4.8L20 12v4.5"/><path d="M3 12h18v5H3Z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  cart: '<path d="M3 4h2.5l2.2 11h10.6L20.5 8H6.6"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="3"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  alert: '<path d="M12 3.5 22 20H2Z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  file: '<path d="M6 3h8l5 5v13H6Z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5Z"/>',
  rain: '<path d="M7 14.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 6a4 4 0 0 1-.5 8.5Z"/><path d="m8.5 17.5-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
  snow: '<path d="M7 14.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 6a4 4 0 0 1-.5 8.5Z"/><path d="M8 18.5h.01M12 19.5h.01M16 18.5h.01M10 21.5h.01M14 21.5h.01"/>',
  storm: '<path d="M7 14.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 6a4 4 0 0 1-.5 8.5Z"/><path d="m12.5 12.5-2 4h3.5l-2 4"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z"/>',
  nav: '<path d="m3.5 11 17-7.5-7.5 17-2-7.5Z"/>',
  device: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/>',
  euro: '<path d="M17.5 6.5a7 7 0 1 0 0 11"/><path d="M4 10.5h9M4 13.5h9"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
  browser: '<rect x="2.5" y="4" width="19" height="16" rx="3.5"/><path d="M2.5 8.5h19M6 6.3h.01M8.5 6.3h.01"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  burst: '<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8"/><circle cx="12" cy="12" r="1.6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v3.5M9 20.5h6M10 16.5h4v4h-4Z"/>',
  game: '<path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.7 3.4a2.5 2.5 0 0 1-4.3 1.1L14 15.5h-4l-2.4 2.4a2.5 2.5 0 0 1-4.3-1.1l-.7-3.4A4.5 4.5 0 0 1 7 8Z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  split: '<circle cx="5.5" cy="12" r="2.5"/><path d="M8 12h4l4-5h4.5M12 12l4 5h4.5"/>',
};
const ico = (n, s = 20, extra = "") => `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICONS[n] || ""}</svg>`;
// Il logo: una C spessa con un bagliore nell'apertura.
const LOGO = (s = 64) => `<svg width="${s}" height="${s}" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lg-p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dfe8ff"/><stop offset=".5" stop-color="#e6d4ff"/><stop offset="1" stop-color="#c9f3ee"/></linearGradient></defs><path d="M352.4 141.1A150 150 0 1 0 352.4 370.9" fill="none" stroke="url(#lg-p)" stroke-width="70"/><path d="M320.3 179.4A100 100 0 1 0 320.3 332.6" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3"/><path d="M398 214c3 28 11 36 40 42-29 6-37 14-40 42-3-28-11-36-40-42 29-6 37-14 40-42Z" fill="#ffffff"/></svg>`;

// ───────────────────────── Costanti ─────────────────────────

// Il nome dell'agente: si cambia da Gruppo → Dati del viaggio.
const AI = () => (S.trip?.[0]?.ai_name || "Zampone");

const COLORS = ["#e8e8ec", "#a5b4fc", "#c4b5fd", "#7ee2b8", "#9cc3ff", "#ffadc6", "#f0abfc", "#ff9b85"];
// I vecchi toni dorati diventano lilla e orchidea: niente giallo nell'app.
const OLD_COLORS = { "#e9cf9a": "#a5b4fc", "#ffc978": "#f0abfc" };
const avatar = (m, cls = "") => m
  ? `<span class="av ${cls} ${m.avatar_url ? "photo" : ""}" style="--c:${esc(OLD_COLORS[m.color] || m.color || "#e8e8ec")}" title="${esc(m.name)}">${m.avatar_url && /^(https:|data:image\/)/.test(m.avatar_url)
      ? `<img src="${esc(m.avatar_url)}" alt="" loading="lazy">` : esc(initials(m.name))}</span>`
  : `<span class="av ai ${cls}">${ico("spark", cls === "sm" ? 13 : 18)}</span>`;

const CATEGORIES = {
  alloggio: { label: "Alloggio", icon: "bed" },
  viaggio: { label: "Viaggio", icon: "train" },
  cenone: { label: "Cenone", icon: "glass" },
  serata: { label: "Serata ed eventi", icon: "music" },
  ristorante: { label: "Ristoranti", icon: "fork" },
  attivita: { label: "Attività", icon: "mountain" },
  auto: { label: "Auto e parcheggio", icon: "car" },
  altro: { label: "Altro", icon: "box" },
};
const STATUSES = { idea: "Idea", da_prenotare: "Da prenotare", prenotato: "Prenotato", pagato: "Pagato", annullato: "Annullato" };
const EXP_CATS = {
  alloggio: ["Alloggio", "bed"], viaggio: ["Viaggio", "train"], cibo: ["Cibo e cene", "fork"], drink: ["Drink", "glass"], spesa: ["Spesa", "cart"],
  serata: ["Serata", "music"], attivita: ["Attività", "mountain"], auto: ["Auto e benzina", "car"], altro: ["Altro", "euro"],
};
const SPLIT_MODES = { equal: "Uguale", exact: "Importi", percent: "Percentuali", shares: "Quote" };
const RSVP = { si: "Ci sono", forse: "Forse", no: "Non vengo" };
const DOC_TYPES = ["Carta d'identità", "Passaporto", "Patente"];

const POLL_TEMPLATES = [
  { q: "Che tipo di Capodanno vogliamo?", multi: true, opts: ["Città d'arte italiana", "Capitale europea", "Montagna e neve", "Posto caldo, al mare", "Villa o casa in campagna"] },
  { q: "Dove andiamo?", d: "Aggiungi le tue proposte, oppure chiedi a Zampone di cercarne con i prezzi.", opts: [] },
  { q: "Quali date?", opts: ["30 dicembre – 1 gennaio", "31 dicembre – 2 gennaio", "29 dicembre – 1 gennaio"] },
  { q: "Budget a persona, tutto incluso", opts: ["Fino a 250 €", "250 – 450 €", "450 – 700 €", "Oltre 700 €"] },
  { q: "Come ci muoviamo?", multi: true, opts: ["Auto", "Treno", "Aereo", "Indifferente"] },
  { q: "Dove dormiamo?", opts: ["Hotel", "Appartamento o villa", "Agriturismo o baita", "Indifferente"] },
  { q: "Il cenone del 31", opts: ["Ristorante con menu di Capodanno", "Cuciniamo insieme", "Festa con cena inclusa", "Cena leggera, poi festa"] },
];

const AI_SUGGESTIONS = [
  "Proponi 5 destinazioni con prezzi indicativi e crea un sondaggio",
  "Che eventi ci sono la notte del 31 dove andiamo?",
  "Quanto ci costa a testa finora?",
  "Prepara la lista ospiti da mandare all'hotel",
  "Cosa manca ancora da prenotare?",
  "Dove mangiamo stasera vicino all'alloggio?",
];

const WEATHER = c => (c === 0 ? ["sun", "Sereno"] : c <= 2 ? ["sun", "Poco nuvoloso"] : c === 3 ? ["cloud", "Nuvoloso"] : c <= 48 ? ["fog", "Nebbia"]
  : c <= 67 || (c >= 80 && c <= 82) ? ["rain", "Pioggia"] : c <= 77 || c === 85 || c === 86 ? ["snow", "Neve"] : ["storm", "Temporale"]);

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
  async join(code, name, color, pin) { return this.ok(await this.sb.rpc("join_trip", { p_code: code, p_name: name, p_color: color, p_pin: pin })); },
  async rejoin(code, member, pin) {
    const id = this.ok(await this.sb.rpc("rejoin_trip", { p_code: code, p_member: member, p_pin: pin }));
    if (!id) throw new Error("PIN sbagliato");
    return id;
  },
  async claim(code, member, pin) { return this.ok(await this.sb.rpc("claim_member", { p_code: code, p_member: member, p_pin: pin })); },
  async resetPin(member, pin) { return this.ok(await this.sb.rpc("reset_pin", { p_member: member, p_pin: pin })); },
  // Notifiche: invio "spara e dimentica", un errore qui non deve mai bloccare l'app.
  notify(event, id) { this.sb.functions.invoke("notifiche", { body: { type: "event", event, id } }).catch(() => {}); },
  async notifyTest() { const { data, error } = await this.sb.functions.invoke("notifiche", { body: { type: "test" } }); if (error) throw new Error(await functionError(error, "notifiche")); return data; },
  async vapidKey() { const { data, error } = await this.sb.functions.invoke("notifiche", { body: { type: "vapid" } }); if (error) throw new Error(await functionError(error, "notifiche")); return data.publicKey; },
  async savePush(sub) { const j = sub.toJSON(); this.ok(await this.sb.rpc("save_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })); },
  async dropPush(endpoint) { await this.sb.rpc("drop_push", { p_endpoint: endpoint }); },
  pushEnabled: true,
  async leave() { await this.sb.rpc("leave_device"); },
  async loadAll() {
    const res = await Promise.all(TABLES.map(t => t === "messages"
      ? this.sb.from(t).select("*").order("created_at", { ascending: false }).limit(500)
      : this.sb.from(t).select("*")));
    const out = {};
    TABLES.forEach((t, i) => { out[t] = this.ok(res[i]) || []; });
    return out;
  },
  async insert(t, row) { return this.ok(await this.sb.from(t).insert(row).select().single()); },
  async upsert(t, row) { return this.ok(await this.sb.from(t).upsert(row).select().single()); },
  async update(t, match, patch) { let q = this.sb.from(t).update(patch); for (const k in match) q = q.eq(k, match[k]); return this.ok(await q); },
  async remove(t, match) { let q = this.sb.from(t).delete(); for (const k in match) q = q.eq(k, match[k]); return this.ok(await q); },
  subscribe(cb) { this.sb.channel("tutto").on("postgres_changes", { event: "*", schema: "public" }, cb).subscribe(); },
  channel(name, opts) { return this.sb.channel(name, opts); },
  removeChannel(ch) { this.sb.removeChannel(ch); },
  async ask(message, mode) {
    const { data, error } = await this.sb.functions.invoke("assistente", { body: { message, mode } });
    if (error) throw new Error(await functionError(error, "assistente"));
    return data;
  },
  filesEnabled: true,
  async uploadFile(owner, file) {
    const path = `${owner.booking_id || owner.expense_id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    this.ok(await this.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" }));
    return this.insert("files", { ...owner, name: file.name, path, size: file.size, created_by: ME });
  },
  async fileUrls(paths) {
    if (!paths.length) return {};
    const data = this.ok(await this.sb.storage.from(BUCKET).createSignedUrls(paths, 3600));
    return Object.fromEntries(data.map(d => [d.path, d.signedUrl]));
  },
  async uploadVoice(blob, ext) {
    const path = `${uuid()}.${ext}`;
    this.ok(await this.sb.storage.from("vocali").upload(path, blob, { contentType: blob.type || "audio/mp4" }));
    return path;
  },
  voiceUrl(path) { return this.sb.storage.from("vocali").getPublicUrl(path).data.publicUrl; },
  async removeVoice(path) { await this.sb.storage.from("vocali").remove([path]); },
  async uploadAvatar(blob) {
    const path = `${uuid()}.jpg`;
    this.ok(await this.sb.storage.from("avatar").upload(path, blob, { contentType: "image/jpeg" }));
    return this.sb.storage.from("avatar").getPublicUrl(path).data.publicUrl;
  },
  async removeFile(f) {
    await this.sb.storage.from(BUCKET).remove([f.path]);
    await this.remove("files", { id: f.id });
  },
};

// ───────────────────────── Motore Local (modalità prova) ─────────────────────────

const Local = {
  KEY: "capodanno-demo-v3", ME: "capodanno-demo-me", db: null, cb: null,
  async init() {
    try { this.db = JSON.parse(storage.get(this.KEY)); } catch { this.db = null; }
    if (!this.db) {
      this.db = Object.fromEntries(TABLES.map(t => [t, []]));
      this.db.trip = [{ id: 1, name: "Capodanno", invite_code: "DEMO", destination: null, start_date: null, end_date: null, notes: null }];
      this.db.secrets = {};
      this.save();
    }
    for (const t of TABLES) this.db[t] = this.db[t] || [];
    addEventListener("storage", e => { if (e.key === this.KEY) { this.db = JSON.parse(e.newValue); this.cb && this.cb(); } });
  },
  save() { storage.set(this.KEY, JSON.stringify(this.db)); },
  changed() { this.save(); setTimeout(() => this.cb && this.cb(), 0); },
  async whoami() { const id = storage.get(this.ME); return this.db.members.some(m => m.id === id) ? id : null; },
  checkCode(code) { if (String(code).trim().toUpperCase() !== this.db.trip[0].invite_code.toUpperCase()) throw new Error("Codice invito non valido"); },
  async preview(code) {
    try { this.checkCode(code); } catch { return null; }
    return { name: this.db.trip[0].name, members: this.db.members.map(({ id, name, color, avatar_url }) => ({ id, name, color, avatar_url, claimed: !!this.db.secrets[id] })) };
  },
  async join(code, name, color, pin) {
    this.checkCode(code);
    if (!/^\d{4}$/.test(pin)) throw new Error("Il PIN deve avere 4 cifre");
    if (name.trim().length < 2) throw new Error("Scrivi il tuo nome");
    if (this.db.members.some(m => m.name.toLowerCase() === name.trim().toLowerCase())) throw new Error("Questo nome è già nel gruppo: torna indietro e tocca il tuo nome");
    const m = this.defaults("members", { name: name.trim(), color, is_admin: this.db.members.length === 0 });
    this.db.members.push(m);
    this.db.secrets[m.id] = pin;
    storage.set(this.ME, m.id);
    this.changed();
    return m.id;
  },
  async rejoin(code, member, pin) {
    this.checkCode(code);
    if (this.db.secrets[member] !== pin) throw new Error("PIN sbagliato");
    storage.set(this.ME, member);
    return member;
  },
  async claim(code, member, pin) {
    this.checkCode(code);
    if (!/^\d{4}$/.test(pin)) throw new Error("Il PIN deve avere 4 cifre");
    if (this.db.secrets[member]) throw new Error("Questo profilo ha già un PIN: inseriscilo per entrare");
    this.db.secrets[member] = pin; storage.set(this.ME, member); this.save();
    return member;
  },
  async resetPin(member, pin) { this.db.secrets[member] = pin; this.save(); },
  notify() {},
  pushEnabled: false,
  async uploadAvatar(blob) { return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); },
  // In prova i vocali restano solo finché l'app è aperta.
  async uploadVoice(blob) { return URL.createObjectURL(blob); },
  voiceUrl(path) { return path; },
  async removeVoice() {},
  async leave() { storage.del(this.ME); },
  async loadAll() { const c = JSON.parse(JSON.stringify(this.db)); delete c.secrets; return c; },
  defaults(t, row) {
    const base = { id: uuid(), created_at: new Date().toISOString() };
    const d = {
      members: { color: COLORS[0], rsvp: "si", car_seats: 0, is_admin: false },
      polls: { kind: "single", allow_add: true, status: "open" },
      bookings: { status: "idea", category: "altro" },
      expenses: { spent_on: today(), category: "altro", kind: "expense", split_mode: "equal" },
      checklist: { done: false },
      messages: { channel: "assistente" },
      scores: { day: today() },
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
    if (t === "payment_requests" && m.id) this.db.expenses = this.db.expenses.map(e => (e.request_id === m.id ? { ...e, request_id: null } : e));
    if (t === "members" && m.id) {
      delete this.db.secrets[m.id];
      for (const k of ["votes", "scores"]) this.db[k] = this.db[k].filter(v => v.member_id !== m.id);
      this.db.member_private = this.db.member_private.filter(p => p.member_id !== m.id);
      this.db.members = this.db.members.map(x => (x.ride_with === m.id ? { ...x, ride_with: null } : x));
    }
    this.changed();
  },
  subscribe(cb) { this.cb = cb; },
  async ask(message, mode) {
    const priv = mode === "ascolto";
    await this.insert("messages", { member_id: ME, owner: priv ? ME : null, role: "user", channel: priv ? "privato" : "assistente", content: message });
    await new Promise(r => setTimeout(r, 700));
    await this.insert("messages", priv
      ? { member_id: null, owner: ME, role: "assistant", channel: "privato", content: "Sono qui. In **modalità prova** non posso ancora risponderti davvero: quando l'app sarà collegata, questo spazio ti ascolterà in privato." }
      : {
        member_id: null, role: "assistant", channel: "assistente",
        content: "Sono in **modalità prova**: per rispondere davvero e cercare sul web devo essere collegato. Intanto ecco come appare una proposta: il sondaggio lo crei tu con un tocco.",
        meta: { actions: [{ type: "poll", question: "Dove andiamo? (proposta di prova)", options: [{ label: "Vienna", price: 380 }, { label: "Praga", price: 320 }, { label: "Cortina", price: 520 }] }] },
      });
  },
  filesEnabled: false,
};

const api = CLOUD ? Cloud : Local;

// Traduce l'errore di una Edge Function in qualcosa che dice cosa sistemare su Supabase.
async function functionError(error, fn) {
  const status = error.context?.status;
  let body = null;
  try { body = await error.context.json(); } catch { /* risposta non JSON */ }
  if (body?.error && body.error !== "Invalid JWT" && !body.msg) return body.error;
  if (status === 404) return `la funzione «${fn}» non esiste su Supabase: va creata in Edge Functions con questo nome esatto.`;
  if (status === 401) return `Supabase blocca la funzione «${fn}»: apri la funzione, scheda Details, spegni «Verify JWT» e salva.`;
  if (status === 546 || status === 504) return "la risposta ha richiesto troppo tempo. Riprova con una domanda più semplice.";
  if (error.name === "FunctionsFetchError") return "non riesco a raggiungere Supabase. Controlla la connessione e riprova.";
  return `${body?.error || body?.msg || body?.message || error.message}${status ? ` (codice ${status})` : ""}`;
}

// ───────────────────────── Stato ─────────────────────────

let S = Object.fromEntries(TABLES.map(t => [t, []]));
let ME = null;
let OFFLINE = false;
const UI = { replyTo: null, tab: "home", planSeg: "bookings", moneySeg: "balances", chatSeg: "gruppo", waiting: false, lastMsgCount: 0, expCat: "" };

const trip = () => S.trip[0] || { name: "Capodanno" };
const me = () => S.members.find(m => m.id === ME);
const isAdmin = () => !!me()?.is_admin;
const member = id => S.members.find(m => m.id === id);
const mname = id => member(id)?.name || "—";
const going = () => S.members.filter(m => m.rsvp !== "no");
const msgs = ch => S.messages.filter(m => (m.channel || "assistente") === ch);

function saveCache() { storage.set(CACHE_KEY, JSON.stringify({ me: ME, S, cloud: CLOUD })); }
function loadCache() {
  try {
    const c = JSON.parse(storage.get(CACHE_KEY));
    if (c && c.cloud === CLOUD && c.me) { S = { ...S, ...c.S }; ME = c.me; return true; }
  } catch { /* cache rovinata */ }
  return false;
}

let reloadTimer = null;
function scheduleReload(payload) {
  // Le mosse degli scacchi vanno dritte alla scacchiera, senza ricaricare tutta l'app.
  if (payload?.table === "chess_games") { window.onChessChange?.(payload); return; }
  clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 250);
}
async function reload() {
  try {
    const data = await api.loadAll();
    S = data;
    S.messages.sort(byCreated);
    OFFLINE = false;
    checkAnswered();
    if (!S.members.some(m => m.id === ME)) { ME = null; storage.del(CACHE_KEY); storage.del(LAST_KEY); return showOnboarding(); }
    saveCache();
    rememberMe();
  } catch (e) {
    console.warn(e);
    OFFLINE = !navigator.onLine;
  }
  render();
}

// ───────────────────────── Conti (stile Splitwise) ─────────────────────────
// Ogni movimento ha "payers" (chi ha messo i soldi) e "owed" (di chi è la spesa), mappe id → euro.
// Saldo = quanto hai messo − quanto ti spetta. I pagamenti tra persone sono movimenti di tipo "payment".

const isPayment = e => e.kind === "payment";
function balances() {
  const b = new Map(S.members.map(m => [m.id, 0]));
  for (const e of S.expenses) {
    for (const [id, v] of Object.entries(e.payers || {})) b.set(id, (b.get(id) || 0) + Number(v));
    for (const [id, v] of Object.entries(e.owed || {})) b.set(id, (b.get(id) || 0) - Number(v));
  }
  return b;
}
function settlements() {
  const b = [...balances()].map(([id, v]) => ({ id, c: cents(v) }));
  const cred = b.filter(x => x.c > 0).sort((a, c) => c.c - a.c);
  const debt = b.filter(x => x.c < 0).map(x => ({ ...x, c: -x.c })).sort((a, c) => c.c - a.c);
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i].c, cred[j].c);
    if (amt > 0) out.push({ from: debt[i].id, to: cred[j].id, amount: amt / 100 });
    debt[i].c -= amt; cred[j].c -= amt;
    if (debt[i].c === 0) i++;
    if (cred[j].c === 0) j++;
  }
  return out;
}
// Ripartisce un totale in centesimi secondo dei pesi, col metodo dei resti maggiori: la somma torna sempre esatta.
function allocate(totalCents, weights) {
  const ids = Object.keys(weights).filter(id => weights[id] > 0);
  const W = ids.reduce((s, id) => s + weights[id], 0);
  if (!ids.length || W <= 0) return {};
  const raw = ids.map(id => ({ id, v: totalCents * weights[id] / W }));
  raw.forEach(r => { r.f = Math.floor(r.v); });
  let rest = totalCents - raw.reduce((s, r) => s + r.f, 0);
  raw.sort((a, b) => (b.v - b.f) - (a.v - a.f)).forEach(r => { if (rest > 0) { r.f++; rest--; } });
  return Object.fromEntries(raw.map(r => [r.id, r.f / 100]));
}
// Calcola la divisione da modalità e valori inseriti. Restituisce { owed } o { error }.
function computeSplit(amount, mode, values, included) {
  const tot = cents(amount);
  if (!tot) return { error: "Inserisci l'importo" };
  if (!included.length) return { error: "Scegli almeno una persona" };
  const v = id => num(values[id]) || 0;
  if (mode === "equal") return { owed: allocate(tot, Object.fromEntries(included.map(id => [id, 1]))) };
  if (mode === "exact") {
    const sum = included.reduce((s, id) => s + cents(v(id)), 0);
    if (sum !== tot) return { error: sum < tot ? `Mancano ${eur((tot - sum) / 100)}` : `Hai superato di ${eur((sum - tot) / 100)}` };
    return { owed: Object.fromEntries(included.filter(id => v(id) > 0).map(id => [id, cents(v(id)) / 100])) };
  }
  if (mode === "percent") {
    const sum = included.reduce((s, id) => s + v(id), 0);
    if (Math.abs(sum - 100) > 0.01) return { error: sum < 100 ? `Manca il ${(100 - sum).toFixed(1).replace(".0", "")}%` : `Hai superato di ${(sum - 100).toFixed(1).replace(".0", "")}%` };
    return { owed: allocate(tot, Object.fromEntries(included.map(id => [id, v(id)]))) };
  }
  const w = Object.fromEntries(included.map(id => [id, v(id)]));
  if (!Object.values(w).some(x => x > 0)) return { error: "Inserisci almeno una quota" };
  return { owed: allocate(tot, w) };
}
const myShare = e => (Number(e.payers?.[ME]) || 0) - (Number(e.owed?.[ME]) || 0);
const groupSpent = () => S.expenses.filter(e => !isPayment(e)).reduce((s, e) => s + Number(e.amount), 0);
const payerLabel = e => { const ids = Object.keys(e.payers || {}); return ids.length === 1 ? mname(ids[0]) : `${ids.length} persone`; };

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
function requestStatus(r) {
  const paid = new Set(S.expenses.filter(e => e.request_id === r.id).flatMap(e => Object.keys(e.payers || {})));
  const debtors = (r.debtors || []).filter(id => id !== r.pay_to && member(id));
  return { debtors, paid, unpaid: debtors.filter(id => !paid.has(id)) };
}
const myOpenRequests = () => S.payment_requests.filter(r => requestStatus(r).unpaid.includes(ME));
const plannedPerHead = () => S.bookings.filter(b => b.status !== "annullato").reduce((s, b) => s + (Number(b.price) || 0), 0) / Math.max(1, going().length);
const unreadChat = () => { const seen = storage.get(SEEN_KEY) || ""; return msgs("gruppo").filter(m => m.member_id !== ME && m.created_at > seen).length; };

// ───────────────────────── Render principale ─────────────────────────

const TABS = [
  { id: "home", label: "Home", ico: "home" },
  { id: "vota", label: "Vota", ico: "vote" },
  { id: "piano", label: "Piano", ico: "calendar" },
  { id: "spese", label: "Splitwise", ico: "wallet" },
  { id: "chat", label: "Chat", ico: "chat" },
];

function render() {
  if (!ME || !me()) return;
  const root = $("#root");
  const y = window.scrollY;
  const views = { home: viewHome, vota: viewVota, piano: viewPiano, spese: viewSpese, chat: viewChat, gruppo: viewGruppo, giochi: () => window.viewGiochi() };
  const titles = { home: trip().name || "Capodanno", vota: "Sondaggi", piano: "Piano", spese: "Splitwise", chat: "Chat", gruppo: "Il gruppo", giochi: "Giochi" };
  const subs = {
    home: `Ciao ${esc(me()?.name || "")}`,
    vota: "Decidiamo insieme",
    piano: "Prenotazioni, programma e cose da fare",
    spese: "Chi ha pagato, chi deve, quanto",
    chat: { gruppo: "Tra di noi", ai: `${AI()} cerca, organizza e vi tiene in riga`, ascolto: "Uno spazio privato, solo per te" }[UI.chatSeg],
    gruppo: `${S.members.length} ${S.members.length === 1 ? "persona" : "persone"}`,
    giochi: "Sfide e classifica del gruppo",
  };
  root.innerHTML = `<div id="app">
    ${OFFLINE ? `<div class="offline">Sei offline: vedi l'ultima copia salvata</div>` : ""}
    <header class="topbar">
      <div class="grow"><h1>${esc(titles[UI.tab])}</h1><div class="sub">${subs[UI.tab]}</div></div>
      <button class="btn icon glass-btn" data-act="tab" data-tab="giochi" aria-label="Giochi">${ico("game", 21)}</button>
      <button class="tap" data-act="tab" data-tab="gruppo" aria-label="Il gruppo">${avatar(me())}</button>
    </header>
    <main id="view">${views[UI.tab]()}</main>
  </div>`;
  renderDock();
  $("#fab").hidden = ["chat", "home"].includes(UI.tab);
  $("#app").classList.toggle("with-fab", !$("#fab").hidden);
  const composer = $("#composer");
  composer.classList.toggle("show", UI.tab === "chat");
  $("#composer-input").placeholder = { gruppo: "Scrivi al gruppo…", ai: `Chiedi a ${AI()}…`, ascolto: "Scrivi quello che senti…" }[UI.chatSeg];
  renderReplyBar();
  if (typeof syncComposerButtons === "function") {
    // Un vocale o una dettatura in corso si annulla se si cambia scheda.
    if (V.mode && (UI.tab !== "chat" || V.seg !== UI.chatSeg)) stopVoice(false);
    syncComposerButtons();
  }
  if (UI.tab === "home") mountHome();
  if (UI.tab === "chat") {
    if (UI.chatSeg === "gruppo") { const last = msgs("gruppo").at(-1); if (last) storage.set(SEEN_KEY, last.created_at); renderDock(); }
    const n = msgs(chatChannel()).length;
    if (n !== UI.lastMsgCount || UI.waiting) { UI.lastMsgCount = n; requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); }
    else window.scrollTo(0, y);
  } else window.scrollTo(0, y);
}

function renderDock() {
  const bar = $("#dock");
  bar.hidden = false;
  const badges = { vota: openPollsToVote().length, spese: myOpenRequests().length, chat: UI.tab === "chat" && UI.chatSeg === "gruppo" ? 0 : unreadChat() };
  // Numerino sull'icona dell'app (iPhone con app sulla Home, Android, desktop).
  const pending = badges.vota + badges.spese + badges.chat;
  if (navigator.setAppBadge) (pending ? navigator.setAppBadge(pending) : navigator.clearAppBadge()).catch(() => {});
  bar.innerHTML = `<div class="inner">${TABS.map(t => `
    <button class="${UI.tab === t.id ? "on" : ""}" data-act="tab" data-tab="${t.id}" aria-label="${t.label}">
      ${ico(t.ico, 22)}${t.label}
      ${badges[t.id] ? `<span class="badge">${badges[t.id]}</span>` : ""}
    </button>`).join("")}</div>`;
}

function go(tab) {
  if (UI.tab !== tab) { UI.tab = tab; UI.lastMsgCount = -1; render(); window.scrollTo(0, tab === "chat" ? document.body.scrollHeight : 0); }
}

const emptyState = (icon, title, text, extra = "") => `<div class="card empty">${ico(icon, 30)}<div class="serif">${title}</div><div class="small">${text}</div>${extra}</div>`;
const segmented = (key, items, act) => `<div class="seg">${items.map(([k, l]) => `<button class="${UI[key] === k ? "on" : ""}" data-act="${act}" data-v="${k}">${l}</button>`).join("")}</div>`;

// ───────────────────────── Home ─────────────────────────

function countdownTarget() {
  const now = new Date();
  // Dal 1° al 6 gennaio si festeggia ancora; poi si punta al prossimo Capodanno.
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
    ...S.itinerary.map(i => ({ when: i.day ? new Date(`${i.day}T${i.time || "12:00"}`) : null, title: i.title, sub: i.place, icon: "clock" })),
    ...S.bookings.filter(b => b.start_at && b.status !== "annullato").map(b => ({ when: new Date(b.start_at), title: b.title, sub: CATEGORIES[b.category]?.label, icon: CATEGORIES[b.category]?.icon || "box" })),
  ].filter(x => x.when && x.when.getTime() > now - 3 * 3600e3).sort((a, b) => a.when - b.when).slice(0, 4);
  const todo = S.bookings.filter(b => b.status === "idea" || b.status === "da_prenotare");
  const deadlines = S.bookings.filter(b => b.cancel_by && b.status !== "annullato" && (new Date(b.cancel_by + "T23:59") - now) / 864e5 < 10 && new Date(b.cancel_by + "T23:59") > now);
  const myTasks = S.checklist.filter(c => c.assignee === ME && !c.done);
  const myReq = myOpenRequests();
  const dest = t.destination ? esc(t.destination) : "Destinazione <em>da decidere</em>";
  const unread = unreadChat();
  const lastGroup = msgs("gruppo").at(-1);

  return `
  <section class="card hero">
    <canvas id="fireworks"></canvas>
    <div class="eyebrow">${target ? `Capodanno ${target.getFullYear()}` : "Buon anno"}</div>
    <div class="dest">${dest}</div>
    <div class="meta">
      <span>${ico("calendar", 15)}${t.start_date ? `${esc(fmtDate(t.start_date, { day: "numeric", month: "long" }))} – ${esc(fmtDate(t.end_date, { day: "numeric", month: "long" }))}` : "Date da decidere"}</span>
      <span>${ico("users", 15)}${S.members.length} ${S.members.length === 1 ? "persona" : "persone"}</span>
    </div>
    ${target ? `<div class="count" id="countdown">${["giorni", "ore", "min", "sec"].map(l => `<div><b data-u="${l}">–</b><span>${l}</span></div>`).join("")}</div>` : ""}
  </section>

  ${aiCard()}

  ${t.notes ? `<section class="card"><div class="row top">${ico("bell", 20)}<div class="grow"><div class="label" style="margin-bottom:6px">Avviso dell'organizzatore</div><div>${esc(t.notes).replace(/\n/g, "<br>")}</div></div></div></section>` : ""}

  ${pushCard()}

  ${isAdmin() && !S.polls.length ? `
  <section class="card">
    <div class="label">Primi passi</div>
    <div class="serif" style="font-size:26px;line-height:1.1;margin-bottom:8px">Ancora niente di deciso?</div>
    <p class="muted small" style="margin:0 0 16px">Crea in un tocco i sondaggi base: tipo di vacanza, destinazione, date, budget, trasporto, alloggio e cenone. Poi invita gli amici.</p>
    <button class="btn pearl block" data-act="starter-polls">${ico("vote", 18)}Crea i sondaggi base</button>
  </section>` : ""}

  ${tripOver() && settlements().length ? `
  <section class="card tap" data-act="money-go" data-v="balances">
    <div class="row top">${ico("split", 22)}<div class="grow"><div class="t">Vacanza finita: chiudiamo i conti</div>
      <div class="small muted" style="margin-top:4px">${(() => { const mine = settlements().filter(s => s.from === ME); return mine.length ? `Devi ${mine.map(s => `${eur(s.amount)} a ${esc(mname(s.to))}`).join(", ")}.` : "Bastano pochi pagamenti e tutti sono in pari."; })()}</div></div><span class="chev">${ico("chev", 18)}</span></div>
  </section>` : ""}

  ${myReq.length ? `
  <section class="card tap" data-act="money-go" data-v="requests">
    <div class="label">Quote da versare</div>
    ${myReq.map(r => `<div class="li"><div class="ib">${ico("card")}</div><div class="grow"><div class="t ellipsis">${esc(r.title)}</div><div class="small muted">a ${esc(mname(r.pay_to))}${r.due_date ? `, entro ${esc(fmtDate(r.due_date))}` : ""}</div></div><b class="num">${eur(r.amount)}</b></div>`).join("")}
  </section>` : ""}

  ${toVote.length ? `
  <section class="card tap" data-act="tab" data-tab="vota">
    <div class="row between" style="margin-bottom:14px"><div class="label" style="margin:0">Da votare</div><span class="pill plain num">${toVote.length}</span></div>
    ${toVote.slice(0, 3).map(p => `<div class="li"><div class="ib">${ico("vote")}</div><div class="grow t ellipsis">${esc(p.question)}</div><span class="chev">${ico("chev", 18)}</span></div>`).join("")}
  </section>` : ""}

  <div class="grid3" style="margin-bottom:12px">
    <section class="card tap" data-act="tab" data-tab="spese" style="margin:0;padding:16px 14px">
      <div class="eyebrow">Saldo</div>
      <div class="stat ${bal > 0.009 ? "pos" : bal < -0.009 ? "neg" : ""}" style="font-size:20px;margin-top:8px">${eur(Math.abs(bal))}</div>
      <div class="tiny muted">${bal > 0.009 ? "da ricevere" : bal < -0.009 ? "da dare" : "in pari"}</div>
    </section>
    <section class="card tap" data-act="tab" data-tab="piano" style="margin:0;padding:16px 14px">
      <div class="eyebrow">Da fare</div>
      <div class="stat" style="font-size:20px;margin-top:8px">${todo.length + myTasks.length}</div>
      <div class="tiny muted">${todo.length} prenot. · ${myTasks.length} tue</div>
    </section>
    <section class="card tap" data-act="tab" data-tab="piano" style="margin:0;padding:16px 14px">
      <div class="eyebrow">A testa</div>
      <div class="stat" style="font-size:20px;margin-top:8px">${eur(plannedPerHead())}</div>
      <div class="tiny muted">previsto</div>
    </section>
  </div>

  ${window.homeGamesCard ? window.homeGamesCard() : ""}

  <section class="card tap" data-act="chat-go" data-v="gruppo">
    <div class="row between" style="margin-bottom:${lastGroup ? 12 : 0}px"><div class="label" style="margin:0">Chat del gruppo</div>${unread ? `<span class="pill plain num">${unread} nuovi</span>` : `<span class="chev">${ico("chev", 18)}</span>`}</div>
    ${lastGroup ? `<div class="row">${avatar(member(lastGroup.member_id), "sm")}<div class="grow small ellipsis"><b>${esc(mname(lastGroup.member_id))}</b> <span class="muted">${esc(lastGroup.content)}</span></div><span class="tiny faint">${fmtTime(lastGroup.created_at)}</span></div>` : ""}
  </section>

  ${t.destination ? `<section class="card" id="weather-card"><div class="label">Meteo a ${esc(t.destination)}</div><div class="small faint">Carico le previsioni…</div></section>` : ""}

  ${deadlines.length ? `
  <section class="card">
    <div class="label" style="color:var(--amber)">Cancellazione gratuita in scadenza</div>
    ${deadlines.map(b => `<div class="li tap" data-act="booking" data-id="${b.id}"><div class="ib" style="color:var(--amber)">${ico("alert")}</div><div class="grow t ellipsis">${esc(b.title)}</div><span class="small" style="color:var(--amber)">entro ${esc(fmtDate(b.cancel_by))}</span></div>`).join("")}
  </section>` : ""}

  <section class="card">
    <div class="label">Prossimi impegni</div>
    ${upcoming.length ? upcoming.map(u => `
      <div class="li"><div class="ib">${ico(u.icon)}</div>
        <div class="grow"><div class="t ellipsis">${esc(u.title)}</div><div class="small muted">${esc(fmtDateTime(u.when))}${u.sub ? " · " + esc(u.sub) : ""}</div></div></div>`).join("")
      : `<div class="muted small">Ancora niente in programma.</div>`}
  </section>

  <section class="card tap" data-act="tab" data-tab="gruppo">
    <div class="row between">
      <div><div class="label" style="margin-bottom:10px">Il gruppo</div><div class="avs">${S.members.slice(0, 9).map(x => avatar(x, "sm")).join("")}</div></div>
      ${isAdmin() ? `<button class="btn sm" data-act="invite">${ico("share", 16)}Invita</button>` : ""}
    </div>
  </section>
`;
}

// Il riquadro di Zampone in Home: l'ultima cosa che ha detto e un campo per chiedergli subito qualcosa.
function aiCard() {
  const last = msgs("assistente").filter(m => m.role === "assistant").at(-1);
  const plain = last ? last.content.replace(/[*_`#>\[\]]/g, "").replace(/\(https?:[^)]+\)/g, "").replace(/\s+/g, " ").trim() : "";
  return `<section class="card ai-card">
    <div class="row" style="gap:12px">${avatar(null)}<div class="grow"><div class="serif" style="font-size:26px;line-height:1">${esc(AI())}</div><div class="tiny faint">L'agente del gruppo: cerca, pianifica, fa i conti e vi tiene in riga</div></div></div>
    ${last ? `<div class="ai-last tap" data-act="chat-go" data-v="ai"><div class="small">${esc(plain.slice(0, 220))}${plain.length > 220 ? "…" : ""}</div><div class="tiny faint" style="margin-top:6px">${esc(fmtDateTime(last.created_at))} · leggi tutto</div></div>` : ""}
    <form data-form="home-ask" class="ai-ask"><input name="q" placeholder="Chiedi a ${esc(AI())}…" autocomplete="off" enterkeyhint="send"><button class="send" aria-label="Chiedi">${ico("send", 18)}</button></form>
    <div class="chips scroll" style="margin-top:12px">${AI_SUGGESTIONS.map(q => `<button class="chip" data-act="ask" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
  </section>`;
}
// Scorciatoia per chiedere a Zampone qualcosa di legato alla sezione in cui ci si trova.
const aiChip = (q, label) => `<button class="chip ai-chip" data-act="ask" data-q="${esc(q)}">${ico("spark", 14)}${esc(label)}</button>`;

let countdownTimer = null;
let fireworksStop = null;
function mountHome() {
  clearInterval(countdownTimer);
  const tick = () => {
    const el = $("#countdown"); const target = countdownTarget();
    if (!el || !target) return clearInterval(countdownTimer);
    const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const v = { giorni: Math.floor(s / 86400), ore: Math.floor(s % 86400 / 3600), min: Math.floor(s % 3600 / 60), sec: s % 60 };
    for (const k in v) { const b = el.querySelector(`[data-u="${k}"]`); if (b) b.textContent = String(v[k]).padStart(k === "giorni" ? 1 : 2, "0"); }
  };
  tick(); countdownTimer = setInterval(tick, 1000);
  fireworksStop && fireworksStop();
  fireworksStop = fireworks($("#fireworks"));
  loadWeather();
}

// Meteo da Open-Meteo (gratuito, senza chiave). Le previsioni coprono i prossimi 16 giorni.
const weatherCache = {};
async function loadWeather() {
  const t = trip(), card = $("#weather-card");
  if (!card || !t.destination) return;
  const key = `${t.destination}|${t.start_date}|${t.end_date}`;
  try {
    if (!weatherCache[key]) {
      weatherCache[key] = (async () => {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t.destination.split(",")[0])}&count=1&language=it`)).json();
        const place = g.results?.[0];
        if (!place) return { error: "Non trovo la località per il meteo." };
        const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`)).json();
        return { place, days: f.daily.time.map((d, i) => ({ d, code: f.daily.weather_code[i], max: f.daily.temperature_2m_max[i], min: f.daily.temperature_2m_min[i], rain: f.daily.precipitation_probability_max[i] })) };
      })();
    }
    const w = await weatherCache[key];
    const el = $("#weather-card"); if (!el) return;
    if (w.error) { el.innerHTML = `<div class="label">Meteo</div><div class="small muted">${esc(w.error)}</div>`; return; }
    let days = w.days, note = "Prossimi giorni";
    if (t.start_date && t.end_date) {
      const inTrip = w.days.filter(x => x.d >= t.start_date && x.d <= t.end_date);
      if (inTrip.length) { days = inTrip; note = "Durante la vacanza"; }
      else note = `Le previsioni per le vostre date arrivano dal ${fmtDate(new Date(new Date(t.start_date).getTime() - 15 * 864e5), { day: "numeric", month: "long" })}. Intanto, i prossimi giorni:`;
    }
    el.innerHTML = `<div class="label">Meteo a ${esc(w.place.name)}</div><div class="tiny faint" style="margin:-6px 0 12px">${esc(note)}</div>
      <div class="weather">${days.slice(0, 7).map(x => { const [ic, lb] = WEATHER(x.code); return `<div title="${lb}"><div class="tiny muted">${esc(fmtDate(x.d, { weekday: "short", day: "numeric" }))}</div>${ico(ic, 24)}<div class="num small">${Math.round(x.max)}°<span class="faint"> ${Math.round(x.min)}°</span></div>${x.rain ? `<div class="tiny faint num">${x.rain}%</div>` : ""}</div>`; }).join("")}</div>`;
  } catch {
    delete weatherCache[key];
    const el = $("#weather-card"); if (el) el.innerHTML = `<div class="label">Meteo</div><div class="small muted">Previsioni non disponibili ora.</div>`;
  }
}

// Fuochi d'artificio leggeri su canvas, toni ghiaccio e perla.
function fireworks(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
  const colors = ["#dfe8ff", "#9cc3ff", "#ffffff", "#e6d4ff", "#c9f3ee"];
  let parts = [], raf = 0, last = 0, alive = true;
  const burst = () => {
    const x = canvas.width * (0.12 + Math.random() * 0.76), y = canvas.height * (0.1 + Math.random() * 0.4);
    const c = colors[Math.floor(Math.random() * colors.length)];
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n, sp = (1 + Math.random() * 1.9) * dpr;
      parts.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c });
    }
  };
  const draw = () => {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.75; ctx.strokeStyle = p.c; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
  };
  if (reduceMotion) {
    burst(); parts.forEach(p => { p.px = p.x + p.vx * 12; p.py = p.y + p.vy * 12; p.x += p.vx * 22; p.y += p.vy * 22; p.life = .6; }); draw();
    return () => {};
  }
  const frame = t => {
    if (!alive || !canvas.isConnected) return;
    if (t - last > 1300) { burst(); last = t; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.px = p.x; p.py = p.y;
      p.x += p.vx; p.y += p.vy; p.vy += 0.022 * dpr; p.vx *= 0.986; p.vy *= 0.986; p.life -= 0.011;
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

// ───────────────────────── Sondaggi ─────────────────────────

function viewVota() {
  const open = S.polls.filter(p => p.status === "open").sort(byCreated);
  const closed = S.polls.filter(p => p.status !== "open").sort(byCreated).reverse();
  return `
  <button class="btn primary block" data-act="new-poll" style="margin-bottom:12px">${ico("plus", 18)}Nuovo sondaggio</button>
  <div class="chips scroll" style="margin-bottom:16px">${aiChip("Per i sondaggi aperti con poche opzioni, cerca e proponi opzioni concrete con prezzo a testa", "Proponi opzioni con i prezzi")}${aiChip("Chi non ha ancora votato? Fai un richiamo simpatico ma deciso", "Chi non ha votato?")}</div>
  ${!S.polls.length ? emptyState("vote", "Nessun sondaggio", `Creane uno, oppure chiedi a ${AI()} di proporre delle opzioni con i prezzi.`,
    isAdmin() ? `<div style="margin-top:16px"><button class="btn sm" data-act="starter-polls">Crea i sondaggi base</button></div>` : "") : ""}
  ${open.map(pollCard).join("")}
  ${closed.length ? `<div class="section"><div class="label">Decisi</div></div>${closed.map(pollCard).join("")}` : ""}`;
}

function pollCard(p) {
  const d = pollData(p);
  const isOpen = p.status === "open";
  const missing = going().filter(m => !d.voterIds.has(m.id));
  const canManage = isAdmin() || p.created_by === ME;
  const deadline = p.closes_at && isOpen ? ` · si chiude ${fmtDate(p.closes_at, { day: "numeric", month: "short" })}` : "";
  return `
  <section class="card">
    <div class="row top">
      <div class="grow">
        <div class="serif" style="font-size:25px;line-height:1.1">${esc(p.question)}</div>
        ${p.description ? `<div class="small muted" style="margin-top:6px">${esc(p.description)}</div>` : ""}
        <div class="tiny faint" style="margin-top:8px">${d.voterIds.size} ${d.voterIds.size === 1 ? "voto" : "voti"}${p.kind === "multi" ? " · più scelte" : ""}${esc(deadline)}${p.created_by ? ` · di ${esc(mname(p.created_by))}` : ""}</div>
      </div>
      ${canManage ? `<button class="btn icon sm" data-act="poll-menu" data-id="${p.id}" aria-label="Opzioni">${ico("more", 18)}</button>` : ""}
    </div>
    <div style="margin-top:6px">
    ${d.opts.length ? d.opts.map(o => {
      const pct = d.max ? (o.voters.length / d.max) * 100 : 0;
      const win = !isOpen && d.max > 0 && o.voters.length === d.max;
      return `<div class="opt ${isOpen ? "tap" : ""} ${o.mine ? "mine" : ""} ${win ? "winner" : ""}" ${isOpen ? `role="button" data-act="vote" data-poll="${p.id}" data-opt="${o.id}"` : ""}>
        <span class="fillbar" style="width:${pct}%"></span>
        <div class="row">
          <span class="ck">${o.mine ? ico("check", 14) : win ? ico("star", 13) : ""}</span>
          <div class="grow"><div style="font-weight:500">${esc(o.label)}${o.price ? ` <span class="faint small num">~${eur(o.price)}</span>` : ""}</div>
            ${o.details ? `<div class="d">${esc(o.details)}</div>` : ""}
            ${o.url ? `<div class="d"><a href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener" data-stop class="link" style="font-size:13px">${ico("link", 14)}Apri</a></div>` : ""}
          </div>
          <div class="avs">${o.voters.slice(0, 4).map(id => avatar(member(id), "sm")).join("")}</div>
          <span class="num" style="min-width:16px;text-align:right">${o.voters.length}</span>
        </div>
      </div>`;
    }).join("") : `<div class="small muted" style="margin-top:12px">Nessuna opzione: aggiungi la prima.</div>`}
    </div>
    ${isOpen && p.allow_add ? `<button class="link" style="margin-top:14px" data-act="add-option" data-id="${p.id}">${ico("plus", 16)}Proponi un'opzione</button>` : ""}
    ${isOpen && missing.length && d.voterIds.size ? `<div class="tiny faint" style="margin-top:12px">Mancano: ${missing.map(m => esc(m.name)).join(", ")}</div>` : ""}
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

async function createPoll({ question, description, multi, allowAdd, closesAt, options }) {
  const p = await api.insert("polls", { question, description: description || null, kind: multi ? "multi" : "single", allow_add: allowAdd !== false, closes_at: closesAt || null, created_by: ME });
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
        <button type="button" class="link" style="margin-top:12px" data-act="more-opt">${ico("plus", 16)}Aggiungi opzione</button></div>
      <div class="field"><label>Chiusura (facoltativa)</label><input type="date" name="closes_at"></div>
      <label class="toggle"><span>Si possono scegliere più opzioni</span><span class="switch"><input type="checkbox" name="multi" ${prefill.multi ? "checked" : ""}><span></span></span></label>
      <label class="toggle"><span>Tutti possono proporre opzioni</span><span class="switch"><input type="checkbox" name="allow_add" checked><span></span></span></label>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Crea</button></div>
    </form>`);
}

// ───────────────────────── Piano ─────────────────────────

function viewPiano() {
  const seg = UI.planSeg;
  return `
  <div style="margin-bottom:18px">${segmented("planSeg", [["bookings", "Prenotazioni"], ["program", "Programma"], ["check", "Checklist"], ["info", "Info"]], "plan-seg")}</div>
  ${seg === "bookings" ? viewBookings() : seg === "program" ? viewProgram() : seg === "check" ? viewChecklist() : viewInfo()}`;
}

function viewBookings() {
  const list = S.bookings.slice().sort((a, b) => String(a.start_at || "9").localeCompare(String(b.start_at || "9")));
  const total = list.filter(b => b.status !== "annullato").reduce((s, b) => s + (Number(b.price) || 0), 0);
  const groups = Object.keys(CATEGORIES).map(k => [k, list.filter(b => (CATEGORIES[b.category] ? b.category : "altro") === k)]).filter(([, l]) => l.length);
  return `
  <button class="btn primary block" data-act="edit-booking" style="margin-bottom:12px">${ico("plus", 18)}Aggiungi prenotazione</button>
  <div class="chips scroll" style="margin-bottom:14px">${aiChip("Cosa manca da prenotare, in che ordine e con quali scadenze? Dammi un piano d'azione", "Cosa manca e in che ordine")}${aiChip("Organizza la logistica del viaggio: auto, posti, orari di partenza da Chiavenna, parcheggi e costi a testa", "Organizza la logistica")}</div>
  ${list.length ? `
    <section class="card">
      <div class="row between"><div><div class="eyebrow">Totale previsto</div><div class="stat" style="margin-top:6px">${eur(total)}</div></div>
      <div style="text-align:right"><div class="eyebrow">A testa</div><div class="stat" style="margin-top:6px">${eur(total / Math.max(1, going().length))}</div></div></div>
      <div class="chips" style="margin-top:14px">${Object.entries(STATUSES).map(([k, l]) => { const n = list.filter(b => b.status === k).length; return n ? `<span class="pill ${k}">${n} ${l.toLowerCase()}</span>` : ""; }).join("")}</div>
    </section>`
    : emptyState("bed", "Nessuna prenotazione", `Qui finiscono alloggio, viaggio, cenone, serata e tutto il resto. Aggiungile tu o chiedi a ${AI()}.`)}
  ${groups.map(([k, l]) => `
    <div class="section"><div class="label row" style="gap:8px">${ico(CATEGORIES[k].icon, 15)}${CATEGORIES[k].label}</div></div>
    <section class="card">${l.map(b => `
      <div class="li tap" data-act="booking" data-id="${b.id}">
        <div class="grow">
          <div class="t ellipsis">${esc(b.title)}</div>
          <div class="small muted ellipsis">${[b.start_at && fmtDateTime(b.start_at), b.provider, b.price && eur(b.price)].filter(Boolean).map(esc).join(" · ") || "Nessun dettaglio"}</div>
        </div>
        <span class="pill ${b.status}">${STATUSES[b.status] || b.status}</span>
      </div>`).join("")}
    </section>`).join("")}`;
}

async function filesBlock(owner, files) {
  let urls = {};
  if (files.length && api.filesEnabled) { try { urls = await api.fileUrls(files.map(f => f.path)); } catch { /* offline */ } }
  const key = owner.booking_id ? "booking" : "expense";
  const id = owner.booking_id || owner.expense_id;
  return `
    <div class="section" style="margin-top:18px"><div class="label">${key === "booking" ? "Documenti e biglietti" : "Scontrino"}</div>
      ${api.filesEnabled ? `<label class="link tap">${ico("upload", 16)}Carica<input type="file" hidden accept="application/pdf,image/*" data-upload="${key}" data-id="${id}"></label>` : ""}</div>
    <section class="card">
      ${files.length ? files.map(f => `<div class="li"><div class="ib">${ico(key === "booking" ? "file" : "receipt")}</div><div class="grow"><div class="t ellipsis">${esc(f.name)}</div><div class="tiny faint">${Math.max(1, Math.round((f.size || 0) / 1024))} KB · ${esc(mname(f.created_by))}</div></div>
          ${urls[f.path] ? `<a class="btn icon sm" href="${esc(urls[f.path])}" target="_blank" rel="noopener" aria-label="Apri">${ico("arrow", 16)}</a>` : ""}
          <button class="btn icon sm" data-act="remove-file" data-id="${f.id}" aria-label="Elimina">${ico("trash", 16)}</button></div>`).join("")
        : `<div class="small muted">${api.filesEnabled ? (key === "booking" ? "Carica PDF e foto di biglietti e conferme: li avrete tutti a portata di mano." : "Fotografa lo scontrino e caricalo qui.") : "Disponibile quando il database è collegato."}</div>`}
    </section>`;
}

async function sheetBooking(id) {
  const b = S.bookings.find(x => x.id === id); if (!b) return;
  const cat = CATEGORIES[b.category] || CATEGORIES.altro;
  const kv = (label, val) => (val ? `<div class="kv"><span>${label}</span><div class="grow">${val}</div></div>` : "");
  const hasExpense = S.expenses.some(e => e.booking_id === b.id);
  const files = await filesBlock({ booking_id: id }, S.files.filter(f => f.booking_id === id).sort(byCreated));
  openSheet(`
    <div class="row" style="gap:14px;margin-bottom:4px"><div class="ib">${ico(cat.icon)}</div><div class="eyebrow">${esc(cat.label)}</div></div>
    <h2 style="margin-top:10px">${esc(b.title)}</h2>
    <div class="row" style="gap:8px;margin:-6px 0 16px"><span class="pill ${b.status}">${STATUSES[b.status]}</span>${b.provider ? `<span class="small muted">${esc(b.provider)}</span>` : ""}</div>
    <div class="chips" style="margin-bottom:16px">
      ${b.code ? `<button class="chip" data-act="copy" data-text="${esc(b.code)}">${ico("copy", 15)}Copia codice</button>` : ""}
      ${b.address ? `<a class="chip" href="${esc(mapsUrl(b.address))}" target="_blank" rel="noopener">${ico("nav", 15)}Indicazioni</a>` : ""}
      ${b.url ? `<a class="chip" href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener">${ico("link", 15)}Sito</a>` : ""}
      ${b.phone ? `<a class="chip" href="${esc(telUrl(b.phone))}">${ico("phone", 15)}Chiama</a>` : ""}
    </div>
    <section class="card">
      ${kv("Codice", b.code ? `<b class="num">${esc(b.code)}</b>` : "")}
      ${kv("Inizio", esc(fmtDateTime(b.start_at)))}
      ${kv("Fine", esc(fmtDateTime(b.end_at)))}
      ${kv("Indirizzo", esc(b.address))}
      ${kv("Prezzo", b.price ? `<span class="num">${eur(b.price)}</span> <span class="faint small">(${eur(b.price / Math.max(1, going().length))} a testa)</span>` : "")}
      ${kv("Pagato da", b.paid_by ? esc(mname(b.paid_by)) : "")}
      ${kv("Cancellazione", b.cancel_by ? `gratuita entro ${esc(fmtDate(b.cancel_by, { day: "numeric", month: "long" }))}` : "")}
      ${kv("Note", b.notes ? esc(b.notes).replace(/\n/g, "<br>") : "")}
      ${!b.code && !b.start_at && !b.address && !b.price && !b.notes ? `<div class="small muted">Nessun dettaglio ancora: tocca Modifica.</div>` : ""}
    </section>
    ${files}
    <div class="stack" style="margin-top:14px">
      ${b.status === "idea" || b.status === "da_prenotare" ? `<button class="btn pearl block" data-act="mission" data-id="${b.id}">${ico("browser", 18)}Prenota e paga con Claude in Chrome</button>` : ""}
      ${b.price && b.paid_by && !hasExpense ? `<button class="btn block" data-act="booking-to-expense" data-id="${b.id}">${ico("split", 18)}Dividi la spesa tra tutti</button>` : ""}
      ${b.price && b.paid_by ? `<button class="btn block" data-act="booking-to-request" data-id="${b.id}">${ico("card", 18)}Chiedi la quota a tutti</button>` : ""}
    </div>
    <div class="actions"><button class="btn" data-act="close-sheet">Chiudi</button><button class="btn primary" data-act="edit-booking" data-id="${b.id}">${ico("edit", 17)}Modifica</button></div>`);
}

function missionText(b) {
  const t = trip();
  const people = going();
  const guests = people.map(m => {
    const p = S.member_private.find(r => r.member_id === m.id) || {};
    const bits = [p.legal_name || m.name, p.birth_date && `nato/a il ${fmtDate(p.birth_date, { day: "2-digit", month: "2-digit", year: "numeric" })}`,
      p.birth_place && `a ${p.birth_place}`, p.doc_number && `${p.doc_type || "documento"} ${p.doc_number}`, m.email, m.phone].filter(Boolean);
    return `- ${bits.join(", ")}`;
  }).join("\n");
  const diets = people.filter(m => m.diet || m.allergies).map(m => `- ${m.name}: ${[m.diet, m.allergies && "allergie: " + m.allergies].filter(Boolean).join(", ")}`).join("\n");
  return [
    `Prenota per il nostro gruppo: ${b.title}${t.destination ? ` (${t.destination})` : ""}.`,
    b.url ? `Sito: ${safeUrl(b.url)}` : b.provider ? `Sito o fornitore: ${b.provider}` : "Trova tu il sito ufficiale.",
    b.start_at || b.end_at ? `Date: dal ${fmtDateTime(b.start_at) || "?"} al ${fmtDateTime(b.end_at) || "?"}.` : t.start_date ? `Date del viaggio: dal ${fmtDate(t.start_date, { day: "numeric", month: "long" })} al ${fmtDate(t.end_date, { day: "numeric", month: "long" })}.` : "",
    `Persone: ${people.length}.`,
    b.price ? `Budget massimo totale: ${eur(b.price)}.` : "",
    b.notes ? `Note: ${b.notes}` : "",
    "",
    "Dati degli ospiti (usa solo quelli che il sito chiede):",
    guests,
    diets ? `\nEsigenze alimentari:\n${diets}` : "",
    "",
    "Istruzioni:",
    "1. Compila tutto con questi dati. Preferisci tariffe con cancellazione gratuita.",
    "2. Per pagare usa la carta salvata in questo browser.",
    "3. FERMATI prima del pulsante finale di pagamento: mostrami riepilogo, prezzo totale e condizioni di cancellazione, e aspetta la mia conferma.",
    "4. Dopo il pagamento dammi codice di prenotazione, orari di check-in e check-out, indirizzo e scadenza della cancellazione gratuita.",
  ].filter(x => x !== "").join("\n");
}

function sheetMission(id) {
  const b = S.bookings.find(x => x.id === id); if (!b) return;
  const text = missionText(b);
  openSheet(`
    <h2>Prenota e paga<br><em class="serif" style="color:var(--t2)">con Claude in Chrome</em></h2>
    <div class="note">${ico("shield", 18)}<span>La carta resta salvata <b>nel tuo browser</b>, non nell'app. Claude compila i moduli e si ferma prima di pagare: confermi tu, poi la banca chiede l'ok sul telefono.</span></div>
    <div class="steps">
      <div><span>Sul computer apri Chrome con l'estensione <b>Claude</b> e la carta salvata nei metodi di pagamento.</span></div>
      <div><span>Copia la missione qui sotto e incollala nella chat di Claude in Chrome.</span></div>
      <div><span>Quando hai il codice, aggiorna la prenotazione (o dillo a ${AI()}) e chiedi la quota a tutti.</span></div>
    </div>
    <div class="field" style="margin-top:8px"><label>Missione</label><textarea readonly class="mono-box">${esc(text)}</textarea></div>
    <div class="actions"><button class="btn" data-act="close-sheet">Chiudi</button><button class="btn primary" data-act="copy" data-text="${esc(text)}">${ico("copy", 17)}Copia missione</button></div>`);
}

function sheetEditBooking(id) {
  const b = S.bookings.find(x => x.id === id) || { category: "alloggio", status: "da_prenotare" };
  openSheet(`
    <h2>${id ? "Modifica prenotazione" : "Nuova prenotazione"}</h2>
    <form data-form="booking" data-id="${id || ""}">
      <div class="field"><label>Titolo</label><input name="title" required maxlength="120" value="${esc(b.title || "")}" placeholder="Es. Hotel Bellavista"></div>
      <div class="two">
        <div class="field"><label>Categoria</label><select name="category">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${b.category === k ? "selected" : ""}>${c.label}</option>`).join("")}</select></div>
        <div class="field"><label>Stato</label><select name="status">${Object.entries(STATUSES).map(([k, l]) => `<option value="${k}" ${b.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="two">
        <div class="field"><label>Fornitore o sito</label><input name="provider" value="${esc(b.provider || "")}" placeholder="Booking, Trenitalia…"></div>
        <div class="field"><label>Codice</label><input name="code" value="${esc(b.code || "")}" autocapitalize="characters"></div>
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
        <div class="field"><label>Prezzo totale €</label><input name="price" inputmode="decimal" value="${esc(b.price ?? "")}"></div>
        <div class="field"><label>Pagato da</label><select name="paid_by"><option value="">—</option>${S.members.map(m => `<option value="${m.id}" ${b.paid_by === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Cancellazione gratuita entro</label><input type="date" name="cancel_by" value="${esc(b.cancel_by || "")}"></div>
      <div class="field"><label>Note</label><textarea name="notes" placeholder="Orari, cosa include, a chi è intestata…">${esc(b.notes || "")}</textarea></div>
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
  <button class="btn primary block" data-act="edit-item" style="margin-bottom:12px">${ico("plus", 18)}Aggiungi al programma</button>
  <div class="chips scroll" style="margin-bottom:14px">${aiChip("Proponi un programma per i giorni del viaggio adatto al gruppo, con orari, locali e cosa prenotare", "Proponi il programma")}</div>
  ${!days.length && !undated.length ? emptyState("calendar", "Programma vuoto", "Il programma giorno per giorno appare qui. Le date arrivano dai dati del viaggio, che l'organizzatore imposta dopo il sondaggio.") : ""}
  ${days.map((d, i) => {
    const items = S.itinerary.filter(x => x.day === d).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    return `<div class="section"><div class="row" style="gap:10px"><span class="serif" style="font-size:26px">Giorno ${i + 1}</span><span class="small muted">${esc(fmtDate(d, { weekday: "long", day: "numeric", month: "long" }))}</span></div></div>
    <section class="card">${items.length ? items.map(itemRow).join("") : `<div class="small muted">Giornata libera</div>`}</section>`;
  }).join("")}
  ${undated.length ? `<div class="section"><div class="label">Senza data</div></div><section class="card">${undated.map(itemRow).join("")}</section>` : ""}`;
}
const itemRow = i => `
  <div class="li tap" data-act="edit-item" data-id="${i.id}">
    <div class="num" style="width:50px;color:var(--violet)">${esc(i.time || "—")}</div>
    <div class="grow"><div class="t">${esc(i.title)}</div>${i.place || i.notes ? `<div class="small muted">${[i.place, i.notes].filter(Boolean).map(esc).join(" · ")}</div>` : ""}</div>
    ${i.place ? `<a class="btn icon sm" href="${esc(mapsUrl(i.place))}" target="_blank" rel="noopener" data-stop aria-label="Indicazioni">${ico("nav", 16)}</a>` : ""}
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
  const done = items.filter(c => c.done).length;
  return `
  <form data-form="check-quick" class="row" style="margin-bottom:14px;gap:8px">
    <input name="text" placeholder="Aggiungi: caricabatterie, spumante, taxi…" maxlength="140" required>
    <button class="btn primary icon" aria-label="Aggiungi">${ico("plus", 20)}</button>
  </form>
  ${items.length ? `<section class="card">
    <div class="row between" style="margin-bottom:14px"><div class="label" style="margin:0">Completate</div><span class="num small muted">${done}/${items.length}</span></div>
    <div class="bar" style="margin-bottom:16px"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div>
    ${items.map(c => `
    <div class="li">
      <button data-act="check-toggle" data-id="${c.id}" aria-label="Fatto" style="width:26px;height:26px;border-radius:50%;flex:none;display:grid;place-items:center;${c.done ? "background:#fff;color:#000" : "box-shadow:inset 0 0 0 1.5px var(--t3)"}">${c.done ? ico("check", 15) : ""}</button>
      <div class="grow tap" data-act="edit-check" data-id="${c.id}" style="${c.done ? "text-decoration:line-through;color:var(--t3)" : ""}">${esc(c.text)}</div>
      ${c.assignee ? avatar(member(c.assignee), "sm") : ""}
    </div>`).join("")}</section>` : emptyState("list", "Checklist vuota", "Cose da fare e da portare, assegnabili a ognuno.")}`;
}

function sheetEditCheck(id) {
  const c = S.checklist.find(x => x.id === id); if (!c) return;
  openSheet(`
    <h2>Modifica</h2>
    <form data-form="check" data-id="${id}">
      <div class="field"><label>Cosa</label><input name="text" required value="${esc(c.text)}"></div>
      <div class="field"><label>Se ne occupa</label><select name="assignee"><option value="">Nessuno</option>${S.members.map(m => `<option value="${m.id}" ${c.assignee === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      <div class="actions"><button type="button" class="btn danger" data-act="delete" data-t="checklist" data-id="${id}">Elimina</button><button class="btn primary">Salva</button></div>
    </form>`);
}

function viewInfo() {
  const t = trip();
  const org = S.members.filter(m => m.is_admin);
  const places = S.bookings.filter(b => (b.phone || b.address) && b.status !== "annullato");
  const drivers = S.members.filter(m => m.car_seats > 0 && m.rsvp !== "no");
  const noRide = going().filter(m => !m.car_seats && !m.ride_with);
  return `
  <section class="card">
    <div class="label">Emergenze</div>
    <div class="li"><div class="ib" style="color:var(--red)">${ico("alert")}</div><div class="grow"><div class="t">Numero unico europeo</div><div class="small muted">Ambulanza, polizia, vigili del fuoco</div></div><a class="btn sm" href="tel:112">${ico("phone", 15)}112</a></div>
    ${org.filter(m => m.phone).map(m => `<div class="li">${avatar(m)}<div class="grow"><div class="t">${esc(m.name)}</div><div class="small muted">Organizzatore</div></div><a class="btn icon sm" href="${esc(telUrl(m.phone))}" aria-label="Chiama">${ico("phone", 16)}</a></div>`).join("")}
  </section>

  <section class="card">
    <div class="row between" style="margin-bottom:14px"><div class="label" style="margin:0">Auto e passaggi</div>${me().car_seats ? "" : `<button class="link" data-act="edit-profile">${ico("car", 16)}Ho l'auto</button>`}</div>
    ${drivers.length ? drivers.map(d => {
      const pax = S.members.filter(m => m.ride_with === d.id);
      const free = d.car_seats - pax.length;
      const mine = me().ride_with === d.id;
      return `<div class="li">${avatar(d)}<div class="grow"><div class="t">${esc(d.name)}${d.departure_city ? ` <span class="small muted">da ${esc(d.departure_city)}</span>` : ""}</div>
          <div class="small muted">${pax.length ? `Con ${pax.map(p => esc(p.name)).join(", ")} · ` : ""}${free > 0 ? `${free} ${free === 1 ? "posto libero" : "posti liberi"}` : "piena"}</div></div>
        ${d.id === ME ? "" : mine ? `<button class="btn sm" data-act="ride" data-id="">Scendo</button>` : free > 0 ? `<button class="btn sm" data-act="ride" data-id="${d.id}">Salgo</button>` : ""}</div>`;
    }).join("") : `<div class="small muted">Nessuno ha ancora indicato posti in auto. Se guidi, aggiungili nel tuo profilo.</div>`}
    ${drivers.length && noRide.length ? `<div class="tiny faint" style="margin-top:12px">Senza passaggio: ${noRide.map(m => esc(m.name)).join(", ")}</div>` : ""}
  </section>

  ${places.length ? `<section class="card"><div class="label">Indirizzi e contatti</div>${places.map(b => `
    <div class="li"><div class="ib">${ico(CATEGORIES[b.category]?.icon || "box")}</div><div class="grow"><div class="t ellipsis">${esc(b.title)}</div>${b.address ? `<div class="small muted ellipsis">${esc(b.address)}</div>` : ""}</div>
      ${b.address ? `<a class="btn icon sm" href="${esc(mapsUrl(b.address))}" target="_blank" rel="noopener" aria-label="Indicazioni">${ico("nav", 16)}</a>` : ""}
      ${b.phone ? `<a class="btn icon sm" href="${esc(telUrl(b.phone))}" aria-label="Chiama">${ico("phone", 16)}</a>` : ""}</div>`).join("")}</section>` : ""}

  ${t.notes ? `<section class="card"><div class="label">Note del viaggio</div><div class="small">${esc(t.notes).replace(/\n/g, "<br>")}</div></section>` : ""}`;
}

// ───────────────────────── Spese ─────────────────────────

function viewSpese() {
  const myBal = balances().get(ME) || 0;
  return `
  <section class="card" style="padding:22px 20px">
    <div class="eyebrow">${myBal > 0.009 ? "Ti devono" : myBal < -0.009 ? "Devi" : "Il tuo saldo"}</div>
    <div class="stat ${myBal > 0.009 ? "pos" : myBal < -0.009 ? "neg" : ""}" style="font-size:40px;margin:6px 0 4px">${eur(Math.abs(myBal))}</div>
    <div class="small muted">${myBal > 0.009 || myBal < -0.009 ? "in totale, già semplificato" : "Sei in pari con tutti"} · gruppo ${eur(groupSpent())}</div>
    <div class="row" style="gap:8px;margin-top:18px">
      <button class="btn primary grow" data-act="edit-expense">${ico("plus", 18)}Spesa</button>
      <button class="btn grow" data-act="settle-up">${ico("swap", 18)}Salda</button>
      <button class="btn icon" data-act="new-request" aria-label="Chiedi una quota">${ico("card", 19)}</button>
    </div>
  </section>
  <div class="chips scroll" style="margin:0 0 12px">${aiChip("Facci il punto dei conti: chi deve quanto a chi, in pochi passaggi", "Il punto dei conti")}${aiChip("Quanto ci costa a testa finora e quanto prevedi in totale?", "Quanto spendiamo a testa")}</div>
  <div style="margin:4px 0 16px">${segmented("moneySeg", [["balances", "Saldi"], ["list", "Spese"], ["requests", "Quote"], ["stats", "Grafici"]], "money-seg")}</div>
  ${UI.moneySeg === "balances" ? viewBalances() : UI.moneySeg === "list" ? viewExpenses() : UI.moneySeg === "requests" ? viewRequests() : viewStats()}`;
}

function payButtons(toId, amount) {
  const to = member(toId);
  if (!to) return "";
  return [
    to.paypal ? `<a class="btn sm" href="${esc(paypalUrl(to.paypal, amount))}" target="_blank" rel="noopener">${ico("card", 15)}PayPal</a>` : "",
    to.iban ? `<button class="btn sm" data-act="copy" data-text="${esc(to.iban.replace(/\s+/g, ""))}">${ico("bank", 15)}IBAN</button>` : "",
    to.satispay ? `<button class="btn sm" data-act="copy" data-text="${esc(to.satispay)}">${ico("device", 15)}Satispay</button>` : "",
  ].filter(Boolean).join("");
}

// Quanti passaggi di soldi servirebbero senza semplificare: una coppia per ogni «chi deve a chi» nelle spese.
function naiveTransfers() {
  const pairs = new Set();
  for (const e of S.expenses) {
    if (isPayment(e)) continue;
    const payers = Object.keys(e.payers || {});
    for (const d of Object.keys(e.owed || {})) for (const p of payers) if (d !== p) pairs.add(d + ">" + p);
  }
  return pairs.size;
}
const tripOver = () => { const t = trip(); return !!t.end_date && today() >= t.end_date; };
function settlePlanText(st) {
  return [`Chiudiamo i conti di ${trip().name}: ${st.length} ${st.length === 1 ? "pagamento" : "pagamenti"} e siamo pari.`, "",
    ...st.map(s => { const to = member(s.to); return `- ${mname(s.from)} → ${mname(s.to)}: ${eur(s.amount)}${to?.paypal ? ` (PayPal: ${paypalUrl(to.paypal, s.amount)})` : to?.iban ? ` (IBAN ${to.iban})` : ""}`; }),
    "", `Segnate i pagamenti nell'app: ${location.origin}${location.pathname}`].join("\n");
}
// «Chiudi i conti»: il piano con il minimo di passaggi, come Splitwise. In primo piano a fine vacanza.
function closeAccountsCard(st) {
  const naive = naiveTransfers();
  return `<section class="card" ${tripOver() ? 'style="box-shadow:inset 0 0 0 1px rgba(230,212,255,.35)"' : ""}>
    <div class="row top"><div class="game-ico" style="width:46px;height:46px;border-radius:15px">${ico("split", 22)}</div>
      <div class="grow"><div class="serif" style="font-size:24px;line-height:1.1">${tripOver() ? "Vacanza finita: chiudiamo i conti" : "Chiudi i conti"}</div>
        <div class="small muted" style="margin-top:4px">Bastano <b>${st.length}</b> ${st.length === 1 ? "pagamento" : "pagamenti"}${naive > st.length ? ` invece di ${naive}` : ""} perché tutti siano in pari.</div></div></div>
    <button class="btn pearl block" style="margin-top:14px" data-act="share-plan">${ico("share", 17)}Condividi il piano nel gruppo</button>
  </section>`;
}

function viewBalances() {
  const bal = balances();
  const st = settlements();
  if (!S.expenses.length) return emptyState("split", "Nessuna spesa", "Registra chi paga cosa, anche in più persone e con divisioni diverse: l'app calcola chi deve quanto a chi, con il minimo di passaggi.");
  const mine = st.filter(s => s.from === ME || s.to === ME);
  const others = st.filter(s => s.from !== ME && s.to !== ME);
  const row = s => `
    <div class="li" style="flex-wrap:wrap">
      <div class="row grow" style="gap:10px;min-width:190px">${avatar(member(s.from), "sm")}<span class="faint">${ico("arrow", 14)}</span>${avatar(member(s.to), "sm")}
        <span class="small"><b>${s.from === ME ? "Tu" : esc(mname(s.from))}</b> ${s.from === ME ? "devi" : "deve"} a <b>${s.to === ME ? "te" : esc(mname(s.to))}</b></span></div>
      <b class="num ${s.to === ME ? "pos" : s.from === ME ? "neg" : ""}">${eur(s.amount)}</b>
      ${s.from === ME || s.to === ME || isAdmin() ? `<div class="row" style="gap:6px;width:100%;justify-content:flex-end;margin-top:6px">${s.from === ME ? payButtons(s.to, s.amount) : ""}<button class="btn sm" data-act="settle-up" data-from="${s.from}" data-to="${s.to}" data-amount="${s.amount}">${ico("check", 15)}Saldato</button></div>` : ""}
    </div>`;
  return `
  ${st.length ? closeAccountsCard(st) : ""}
  ${st.length ? `
    ${mine.length ? `<section class="card"><div class="label">Ti riguardano</div>${mine.map(row).join("")}</section>` : ""}
    ${others.length ? `<section class="card"><div class="label">Tra gli altri</div>${others.map(row).join("")}</section>` : ""}`
    : `<section class="card"><div class="row">${ico("check", 20)}<span>Siete tutti in pari.</span></div></section>`}
  <section class="card"><div class="label">Persone</div>${[...bal].sort((a, b) => b[1] - a[1]).map(([id, v]) => `
    <div class="li tap" data-act="person" data-id="${id}">${avatar(member(id), "sm")}<span class="grow t ellipsis">${esc(mname(id))}</span>
      <span class="small num ${v > 0.009 ? "pos" : v < -0.009 ? "neg" : "muted"}">${v > 0.009 ? "riceve " : v < -0.009 ? "deve " : "in pari"}${Math.abs(v) > 0.009 ? eur(Math.abs(v)) : ""}</span>
      <span class="chev">${ico("chev", 16)}</span>
    </div>`).join("")}</section>`;
}

function expenseRow(e) {
  const pay = isPayment(e);
  const [lb, ic] = pay ? ["Pagamento", "swap"] : (EXP_CATS[e.category] || EXP_CATS.altro);
  const share = myShare(e);
  const involved = e.payers?.[ME] != null || e.owed?.[ME] != null;
  const sub = pay
    ? `${esc(mname(Object.keys(e.payers)[0]))} ha dato ${eur(e.amount)} a ${esc(mname(Object.keys(e.owed)[0]))}`
    : `${esc(payerLabel(e))} ha pagato ${eur(e.amount)}`;
  return `<div class="li tap" data-act="expense" data-id="${e.id}">
    <div class="ib">${ico(ic)}</div>
    <div class="grow"><div class="t ellipsis">${esc(e.title)}</div><div class="small muted ellipsis">${sub}</div></div>
    <div style="text-align:right">${pay ? `<span class="tiny faint">${esc(lb)}</span>` : !involved ? `<span class="tiny faint">non ti riguarda</span>`
      : `<div class="tiny ${share >= 0 ? "pos" : "neg"}">${share >= 0 ? "presti" : "devi"}</div><b class="num small ${share >= 0 ? "pos" : "neg"}">${eur(Math.abs(share))}</b>`}</div>
  </div>`;
}

function viewExpenses() {
  const all = S.expenses.slice().sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)) || byCreated(b, a));
  const list = UI.expCat ? all.filter(e => (UI.expCat === "payment" ? isPayment(e) : !isPayment(e) && e.category === UI.expCat)) : all;
  if (!all.length) return emptyState("receipt", "Nessuna spesa", "Aggiungi la prima: chi ha pagato, quanto, e come dividerla.");
  const cats = [...new Set(all.filter(e => !isPayment(e)).map(e => e.category))];
  const byMonth = {};
  for (const e of list) (byMonth[String(e.spent_on).slice(0, 7)] ||= []).push(e);
  return `
  <div class="chips scroll" style="margin-bottom:14px">
    <button class="chip ${!UI.expCat ? "on" : ""}" data-act="exp-cat" data-v="">Tutte</button>
    ${cats.map(c => `<button class="chip ${UI.expCat === c ? "on" : ""}" data-act="exp-cat" data-v="${c}">${ico((EXP_CATS[c] || EXP_CATS.altro)[1], 14)}${esc((EXP_CATS[c] || EXP_CATS.altro)[0])}</button>`).join("")}
    ${all.some(isPayment) ? `<button class="chip ${UI.expCat === "payment" ? "on" : ""}" data-act="exp-cat" data-v="payment">${ico("swap", 14)}Pagamenti</button>` : ""}
  </div>
  ${Object.entries(byMonth).map(([mo, l]) => `
    <div class="section"><div class="label">${esc(new Date(mo + "-15").toLocaleDateString("it-IT", { month: "long", year: "numeric" }))}</div><span class="tiny faint num">${eur(l.filter(e => !isPayment(e)).reduce((s, e) => s + Number(e.amount), 0))}</span></div>
    <section class="card">${l.map(expenseRow).join("")}</section>`).join("") || `<div class="card empty small">Nessun movimento in questa categoria.</div>`}`;
}

function viewRequests() {
  const list = S.payment_requests.slice().sort(byCreated).reverse();
  const head = `<button class="btn block" style="margin-bottom:14px" data-act="new-request">${ico("plus", 18)}Chiedi una quota</button>`;
  if (!list.length) return head + emptyState("card", "Nessuna quota", "Chiedi a tutti la propria parte di un acconto o di una prenotazione: ognuno paga con un tocco e vedi chi manca.");
  return head + list.map(r => {
    const st = requestStatus(r);
    const iOwe = st.unpaid.includes(ME);
    const canManage = isAdmin() || r.created_by === ME || r.pay_to === ME;
    const pct = st.debtors.length ? (st.debtors.length - st.unpaid.length) / st.debtors.length * 100 : 100;
    return `<section class="card">
      <div class="row top">
        <div class="grow"><div class="serif" style="font-size:24px;line-height:1.1">${esc(r.title)}</div>
          <div class="small muted" style="margin-top:6px">${eur(r.amount)} a testa · a ${esc(mname(r.pay_to))}${r.due_date ? ` · entro ${esc(fmtDate(r.due_date, { day: "numeric", month: "long" }))}` : ""}</div>
          ${r.note ? `<div class="small faint" style="margin-top:4px">${esc(r.note)}</div>` : ""}</div>
        ${canManage ? `<button class="btn icon sm" data-act="request-menu" data-id="${r.id}" aria-label="Opzioni">${ico("more", 18)}</button>` : ""}
      </div>
      <div class="row between" style="margin:16px 0 8px"><span class="tiny faint">Pagato</span><span class="num small">${st.debtors.length - st.unpaid.length}/${st.debtors.length}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="row" style="margin-top:12px;gap:6px;flex-wrap:wrap">${st.debtors.map(id => `<span style="opacity:${st.paid.has(id) ? 1 : .35}">${avatar(member(id), "sm")}</span>`).join("")}</div>
      ${iOwe ? `<div class="divider"></div><div class="small" style="margin-bottom:10px">Paga la tua quota a <b>${esc(mname(r.pay_to))}</b></div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${payButtons(r.pay_to, r.amount) || `<span class="tiny faint">${esc(mname(r.pay_to))} non ha ancora inserito PayPal o IBAN.</span>`}</div>
        <button class="btn primary block" style="margin-top:12px" data-act="pay-request" data-id="${r.id}" data-m="${ME}">${ico("check", 17)}Ho pagato ${eur(r.amount)}</button>` : st.paid.has(ME) ? `<div class="divider"></div><div class="row small" style="color:var(--green)">${ico("check", 16)}Hai già pagato</div>` : ""}
    </section>`;
  }).join("");
}

function viewStats() {
  const exp = S.expenses.filter(e => !isPayment(e));
  if (!exp.length) return emptyState("chart", "Ancora niente da mostrare", "I grafici si riempiono man mano che registrate le spese.");
  const total = exp.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = {};
  for (const e of exp) byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
  const people = S.members.map(m => ({ m, paid: exp.reduce((s, e) => s + (Number(e.payers?.[m.id]) || 0), 0), cost: exp.reduce((s, e) => s + (Number(e.owed?.[m.id]) || 0), 0) }));
  const maxP = Math.max(1, ...people.flatMap(p => [p.paid, p.cost]));
  const byDay = {};
  for (const e of exp) byDay[e.spent_on] = (byDay[e.spent_on] || 0) + Number(e.amount);
  const days = Object.entries(byDay).sort().slice(-10);
  const maxD = Math.max(1, ...days.map(d => d[1]));
  return `
  <section class="card">
    <div class="label">Per categoria</div>
    ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `
      <div style="margin-bottom:12px"><div class="row between small" style="margin-bottom:6px"><span class="row" style="gap:8px">${ico((EXP_CATS[c] || EXP_CATS.altro)[1], 15)}${esc((EXP_CATS[c] || EXP_CATS.altro)[0])}</span><span class="num">${eur(v)} <span class="faint">${Math.round(v / total * 100)}%</span></span></div>
      <div class="bar"><i style="width:${v / total * 100}%"></i></div></div>`).join("")}
  </section>
  <section class="card">
    <div class="label">Chi ha pagato e quanto ha speso</div>
    <div class="row tiny muted" style="gap:14px;margin:-4px 0 14px"><span class="row" style="gap:6px"><i class="legend-dot" style="background:#fff"></i>Ha pagato</span><span class="row" style="gap:6px"><i class="legend-dot" style="background:rgba(255,255,255,.3)"></i>Sua parte</span></div>
    ${people.filter(p => p.paid || p.cost).map(p => `
      <div class="row" style="margin-bottom:12px;gap:10px">${avatar(p.m, "sm")}<div class="grow">
        <div class="hbar"><i style="width:${p.paid / maxP * 100}%;background:#fff"></i></div>
        <div class="hbar" style="margin-top:4px"><i style="width:${p.cost / maxP * 100}%;background:rgba(255,255,255,.3)"></i></div></div>
        <div class="tiny num" style="width:74px;text-align:right">${eur(p.paid)}<br><span class="faint">${eur(p.cost)}</span></div></div>`).join("")}
  </section>
  ${days.length > 1 ? `<section class="card">
    <div class="label">Giorno per giorno</div>
    <div class="cols">${days.map(([d, v]) => `<div><div class="col" style="height:${Math.max(4, v / maxD * 100)}%" title="${eur(v)}"></div><span class="tiny faint">${esc(fmtDate(d, { day: "numeric", month: "numeric" }))}</span></div>`).join("")}</div>
  </section>` : ""}`;
}

function sheetPerson(id) {
  const x = member(id); if (!x) return;
  const v = balances().get(id) || 0;
  const exp = S.expenses.filter(e => e.payers?.[id] != null || e.owed?.[id] != null).sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)));
  const paid = exp.filter(e => !isPayment(e)).reduce((s, e) => s + (Number(e.payers?.[id]) || 0), 0);
  const cost = exp.filter(e => !isPayment(e)).reduce((s, e) => s + (Number(e.owed?.[id]) || 0), 0);
  const st = settlements().filter(s => s.from === id || s.to === id);
  openSheet(`
    <div class="row" style="gap:16px;margin-bottom:16px">${avatar(x, "lg")}<div><h2 style="margin:0">${esc(x.name)}</h2>
      <div class="num ${v > 0.009 ? "pos" : v < -0.009 ? "neg" : "muted"}" style="margin-top:6px">${v > 0.009 ? "deve ricevere " : v < -0.009 ? "deve dare " : "in pari"}${Math.abs(v) > 0.009 ? eur(Math.abs(v)) : ""}</div></div></div>
    <div class="grid2"><section class="card"><div class="eyebrow">Ha pagato</div><div class="stat" style="margin-top:6px;font-size:22px">${eur(paid)}</div></section>
      <section class="card"><div class="eyebrow">Sua parte</div><div class="stat" style="margin-top:6px;font-size:22px">${eur(cost)}</div></section></div>
    ${st.length ? `<section class="card"><div class="label">Per pareggiare</div>${st.map(s => `<div class="li"><span class="grow small">${s.from === id ? `Deve a <b>${esc(mname(s.to))}</b>` : `Riceve da <b>${esc(mname(s.from))}</b>`}</span><b class="num">${eur(s.amount)}</b>
      ${s.from === ME || s.to === ME || isAdmin() ? `<button class="btn sm" data-act="settle-up" data-from="${s.from}" data-to="${s.to}" data-amount="${s.amount}">Salda</button>` : ""}</div>`).join("")}</section>` : ""}
    ${exp.length ? `<div class="section"><div class="label">Movimenti</div></div><section class="card">${exp.map(e => `<div class="li tap" data-act="expense" data-id="${e.id}"><div class="grow"><div class="t ellipsis">${esc(e.title)}</div><div class="tiny faint">${esc(fmtDate(e.spent_on))}</div></div>
      <div class="tiny num" style="text-align:right">${e.payers?.[id] ? `<span class="pos">+${eur(e.payers[id])}</span><br>` : ""}${e.owed?.[id] ? `<span class="neg">−${eur(e.owed[id])}</span>` : ""}</div></div>`).join("")}</section>` : ""}
    <div class="actions"><button class="btn" data-act="close-sheet">Chiudi</button></div>`);
}

async function sheetExpense(id) {
  const e = S.expenses.find(x => x.id === id); if (!e) return;
  const pay = isPayment(e);
  const [lb, ic] = pay ? ["Pagamento", "swap"] : (EXP_CATS[e.category] || EXP_CATS.altro);
  const share = myShare(e);
  const files = pay ? "" : await filesBlock({ expense_id: id }, S.files.filter(f => f.expense_id === id).sort(byCreated));
  const lines = (map, sign) => Object.entries(map || {}).sort((a, b) => b[1] - a[1]).map(([mid, v]) => `<div class="li">${avatar(member(mid), "sm")}<span class="grow">${esc(mid === ME ? "Tu" : mname(mid))}</span><span class="num ${sign}">${eur(v)}</span></div>`).join("");
  openSheet(`
    <div class="row" style="gap:14px"><div class="ib">${ico(ic)}</div><div class="eyebrow">${esc(lb)} · ${esc(fmtDate(e.spent_on, { day: "numeric", month: "long", year: "numeric" }))}</div></div>
    <h2 style="margin:12px 0 4px">${esc(e.title)}</h2>
    <div class="stat" style="font-size:34px;margin-bottom:6px">${eur(e.amount)}</div>
    ${!pay && (e.payers?.[ME] != null || e.owed?.[ME] != null) ? `<div class="small ${share >= 0 ? "pos" : "neg"}" style="margin-bottom:16px">${share >= 0 ? `Presti ${eur(share)}` : `Devi ${eur(-share)}`}</div>` : `<div style="height:10px"></div>`}
    ${pay ? `<section class="card"><div class="row">${avatar(member(Object.keys(e.payers)[0]))}<span class="faint">${ico("arrow", 18)}</span>${avatar(member(Object.keys(e.owed)[0]))}<span class="grow small">${esc(mname(Object.keys(e.payers)[0]))} ha dato ${eur(e.amount)} a ${esc(mname(Object.keys(e.owed)[0]))}</span></div></section>`
      : `<section class="card"><div class="label">Ha pagato</div>${lines(e.payers, "")}</section>
         <section class="card"><div class="label">Diviso ${e.split_mode && e.split_mode !== "equal" ? "per " + SPLIT_MODES[e.split_mode].toLowerCase() : "in parti uguali"}</div>${lines(e.owed, "muted")}</section>`}
    ${e.note ? `<section class="card"><div class="label">Nota</div><div class="small">${esc(e.note)}</div></section>` : ""}
    ${files}
    <div class="tiny faint" style="margin-top:14px">Aggiunta da ${esc(mname(e.created_by))} il ${esc(fmtDateTime(e.created_at))}</div>
    <div class="actions"><button class="btn danger" data-act="delete" data-t="expenses" data-id="${e.id}">${ico("trash", 17)}Elimina</button>${pay ? "" : `<button class="btn primary" data-act="edit-expense" data-id="${e.id}">${ico("edit", 17)}Modifica</button>`}</div>`);
}

// Modulo spesa: chi ha pagato (uno o più) e come si divide (uguale, importi, percentuali, quote).
function sheetEditExpense(id, prefill = {}) {
  const e = S.expenses.find(x => x.id === id) || {
    amount: prefill.amount ?? "", title: prefill.title || "", category: prefill.category || "altro", spent_on: today(), booking_id: prefill.booking_id || null,
    payers: { [prefill.payer || ME]: prefill.amount || 0 }, split_mode: "equal", split_input: Object.fromEntries(going().map(m => [m.id, 1])), note: "",
  };
  const payerIds = Object.keys(e.payers || {});
  const multiPay = payerIds.length > 1;
  const mode = e.split_mode || "equal";
  const input = e.split_input || Object.fromEntries(Object.keys(e.owed || {}).map(k => [k, e.owed[k]]));
  openSheet(`
    <h2>${id ? "Modifica spesa" : "Nuova spesa"}</h2>
    <form data-form="expense" data-id="${id || ""}" data-booking="${esc(e.booking_id || "")}" id="exp-form">
      <div class="field"><label>Per cosa</label><input name="title" required maxlength="120" value="${esc(e.title || "")}" placeholder="Es. Cena di sabato"></div>
      <div class="two">
        <div class="field"><label>Importo €</label><input name="amount" required inputmode="decimal" value="${esc(e.amount ?? "")}" placeholder="0,00" class="num" style="font-size:20px"></div>
        <div class="field"><label>Data</label><input type="date" name="spent_on" value="${esc(e.spent_on || today())}"></div>
      </div>
      <div class="field"><label>Categoria</label><div class="chips">${Object.entries(EXP_CATS).map(([k, [l, i]]) => `<label class="chip ${e.category === k ? "on" : ""}"><input type="radio" name="category" value="${k}" ${e.category === k ? "checked" : ""} hidden data-radio>${ico(i, 14)}${l}</label>`).join("")}</div></div>

      <div class="section" style="margin:18px 4px 10px"><div class="label">Ha pagato</div><button type="button" class="link" data-act="multi-pay">${multiPay ? "Una persona" : "Più persone"}</button></div>
      <input type="hidden" name="pay_mode" value="${multiPay ? "multi" : "single"}">
      <div id="pay-single" ${multiPay ? "hidden" : ""}><select name="payer">${S.members.map(m => `<option value="${m.id}" ${payerIds[0] === m.id ? "selected" : ""}>${esc(m.id === ME ? m.name + " (tu)" : m.name)}</option>`).join("")}</select></div>
      <div id="pay-multi" class="card" style="padding:6px 16px" ${multiPay ? "" : "hidden"}>${S.members.map(m => `
        <div class="li">${avatar(m, "sm")}<span class="grow small">${esc(m.name)}</span><input name="p_${m.id}" inputmode="decimal" class="num mini" placeholder="0,00" value="${multiPay && e.payers[m.id] != null ? esc(e.payers[m.id]) : ""}"></div>`).join("")}
        <div class="tiny" id="pay-sum" style="padding:10px 0"></div></div>

      <div class="section" style="margin:18px 4px 10px"><div class="label">Diviso</div></div>
      <input type="hidden" name="split_mode" value="${mode}">
      <div style="margin-bottom:10px">${`<div class="seg">${Object.entries(SPLIT_MODES).map(([k, l]) => `<button type="button" class="${mode === k ? "on" : ""}" data-act="split-mode" data-v="${k}">${l}</button>`).join("")}</div>`}</div>
      <div class="card" style="padding:6px 16px" id="split-rows" data-mode="${mode}">${S.members.map(m => {
        const inc = input[m.id] != null && (mode === "equal" ? true : Number(input[m.id]) > 0 || mode === "shares");
        return `<div class="li split-row">
          <label class="ckbox"><input type="checkbox" name="inc" value="${m.id}" ${inc ? "checked" : ""}><span>${ico("check", 13)}</span></label>
          ${avatar(m, "sm")}<span class="grow small ellipsis">${esc(m.name)}</span>
          <input name="v_${m.id}" inputmode="decimal" class="num mini split-in" value="${mode !== "equal" && input[m.id] != null ? esc(input[m.id]) : ""}">
          <span class="num small split-out" style="width:76px;text-align:right"></span></div>`;
      }).join("")}
        <div class="tiny" id="split-sum" style="padding:10px 0"></div></div>
      <div class="field" style="margin-top:14px"><label>Nota (facoltativa)</label><input name="note" maxlength="300" value="${esc(e.note || "")}"></div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Salva</button></div>
    </form>`);
  updateExpenseForm();
}

function readExpenseForm(f) {
  const fd = new FormData(f);
  const amount = num(fd.get("amount"));
  const mode = fd.get("split_mode");
  const included = fd.getAll("inc");
  const values = Object.fromEntries(S.members.map(m => [m.id, fd.get("v_" + m.id)]));
  const split = computeSplit(amount, mode, values, included);
  let payers, payError = null;
  if (fd.get("pay_mode") === "multi") {
    payers = Object.fromEntries(S.members.map(m => [m.id, num(fd.get("p_" + m.id)) || 0]).filter(([, v]) => v > 0).map(([k, v]) => [k, cents(v) / 100]));
    const sum = Object.values(payers).reduce((s, v) => s + cents(v), 0);
    if (!Object.keys(payers).length) payError = "Indica chi ha pagato";
    else if (amount && sum !== cents(amount)) payError = sum < cents(amount) ? `Pagato: mancano ${eur((cents(amount) - sum) / 100)}` : `Pagato: superato di ${eur((sum - cents(amount)) / 100)}`;
  } else payers = { [fd.get("payer")]: cents(amount) / 100 };
  const splitInput = mode === "equal" ? Object.fromEntries(included.map(id => [id, 1])) : Object.fromEntries(included.map(id => [id, num(values[id]) || 0]));
  return { amount, mode, payers, payError, owed: split.owed, splitError: split.error, splitInput, included };
}

function updateExpenseForm() {
  const f = $("#exp-form"); if (!f) return;
  const r = readExpenseForm(f);
  const box = $("#split-rows"); const mode = r.mode;
  box.dataset.mode = mode;
  const ph = { exact: "0,00", percent: "%", shares: "1" }[mode] || "";
  $$(".split-row", box).forEach(row => {
    const id = row.querySelector("input[name=inc]").value;
    const on = row.querySelector("input[name=inc]").checked;
    const inp = row.querySelector(".split-in");
    inp.hidden = mode === "equal"; inp.placeholder = ph; inp.disabled = !on;
    if (mode === "shares" && on && !inp.value) inp.value = "1";
    row.style.opacity = on ? 1 : .45;
    row.querySelector(".split-out").textContent = r.owed && r.owed[id] ? eur(r.owed[id]) : on && mode === "equal" ? "" : "—";
  });
  const sum = $("#split-sum");
  sum.innerHTML = r.splitError ? `<span class="neg">${esc(r.splitError)}</span>` : r.owed ? `<span class="pos">${ico("check", 12, 'style="display:inline;vertical-align:-1px"')} Diviso tra ${Object.keys(r.owed).length} persone</span>` : "";
  const ps = $("#pay-sum");
  if (ps) ps.innerHTML = r.payError ? `<span class="neg">${esc(r.payError)}</span>` : f.pay_mode.value === "multi" ? `<span class="pos">Totale pagato corretto</span>` : "";
}

function sheetSettle(prefill = {}) {
  const st = settlements();
  const s0 = prefill.from ? prefill : st.find(s => s.from === ME) || st.find(s => s.to === ME) || { from: ME, to: S.members.find(m => m.id !== ME)?.id, amount: "" };
  openSheet(`
    <h2>Registra un pagamento</h2>
    <p class="small muted" style="margin:-6px 0 16px">Quando qualcuno restituisce dei soldi: contanti, bonifico, PayPal, Satispay.</p>
    <form data-form="settle">
      <div class="two">
        <div class="field"><label>Chi paga</label><select name="from">${S.members.map(m => `<option value="${m.id}" ${s0.from === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
        <div class="field"><label>A chi</label><select name="to">${S.members.map(m => `<option value="${m.id}" ${s0.to === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Importo €</label><input name="amount" required inputmode="decimal" class="num" style="font-size:22px" value="${esc(s0.amount ? Number(s0.amount).toFixed(2) : "")}"></div>
      ${s0.to && s0.from === ME && payButtons(s0.to, s0.amount || 0) ? `<div class="field"><label>Paga adesso</label><div class="row" style="gap:6px;flex-wrap:wrap">${payButtons(s0.to, s0.amount || 0)}</div><div class="hint">Dopo aver pagato, torna qui e tocca Registra.</div></div>` : ""}
      <div class="field"><label>Come (facoltativo)</label><input name="note" placeholder="Contanti, bonifico, PayPal…"></div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Registra</button></div>
    </form>`);
}

function sheetNewRequest(prefill = {}) {
  openSheet(`
    <h2>Chiedi una quota</h2>
    <form data-form="request">
      <div class="field"><label>Per cosa</label><input name="title" required maxlength="120" value="${esc(prefill.title || "")}" placeholder="Es. Acconto appartamento"></div>
      <div class="two">
        <div class="field"><label>Importo a testa €</label><input name="amount" required inputmode="decimal" class="num" value="${esc(prefill.amount ? Number(prefill.amount).toFixed(2) : "")}"></div>
        <div class="field"><label>Entro il</label><input type="date" name="due_date"></div>
      </div>
      <div class="field"><label>Da versare a</label><select name="pay_to">${S.members.map(m => `<option value="${m.id}" ${(prefill.pay_to || ME) === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Chi deve pagare</label>
        <div class="chips">${S.members.map(m => { const on = m.rsvp !== "no"; return `<label class="chip ${on ? "on" : ""}"><input type="checkbox" name="debtors" value="${m.id}" ${on ? "checked" : ""} hidden data-chip>${esc(m.name)}</label>`; }).join("")}</div></div>
      <div class="field"><label>Nota (facoltativa)</label><input name="note" maxlength="200" placeholder="Es. causale del bonifico"></div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Chiedi</button></div>
    </form>`);
}

function sheetHowToPay() {
  const m = me();
  openSheet(`
    <h2>Pagamenti</h2>
    <section class="card">
      <div class="label">I tuoi metodi per ricevere</div>
      <div class="li"><div class="ib">${ico("card")}</div><div class="grow"><div class="t">PayPal</div><div class="small muted">${m.paypal ? "paypal.me/" + esc(paypalUser(m.paypal)) : "Non inserito"}</div></div></div>
      <div class="li"><div class="ib">${ico("bank")}</div><div class="grow"><div class="t">IBAN</div><div class="small muted num ellipsis">${esc(m.iban || "Non inserito")}</div></div></div>
      <div class="li"><div class="ib">${ico("device")}</div><div class="grow"><div class="t">Satispay</div><div class="small muted">${esc(m.satispay || "Non inserito")}</div></div></div>
      <button class="btn block" style="margin-top:14px" data-act="edit-profile">${ico("edit", 17)}Modifica</button>
    </section>
    <section class="card">
      <div class="li"><div class="ib">${ico("users")}</div><div class="grow"><div class="t">Tra di voi</div><div class="small muted">Quote e rimborsi con PayPal (carta registrata o Apple Pay), bonifico o Satispay. Il pulsante apre il pagamento già compilato.</div></div></div>
      <div class="li"><div class="ib">${ico("browser")}</div><div class="grow"><div class="t">Hotel, treni, locali</div><div class="small muted">Da una prenotazione tocca «Prenota e paga con Claude in Chrome»: compila i moduli con i dati del gruppo e paga con la carta salvata nel browser, dopo la tua conferma.</div></div></div>
      <div class="li"><div class="ib">${ico("shield")}</div><div class="grow"><div class="t">Perché l'app non salva carte</div><div class="small muted">Custodire numeri di carta richiede certificazioni di sicurezza (PCI-DSS) che un'app tra amici non ha. Le carte restano in PayPal, Apple Pay e nel browser.</div></div></div>
    </section>`);
}

// ───────────────────────── Chat ─────────────────────────

function md(src) {
  let s = esc(src);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</a>`);
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

// Testo semplice con link cliccabili, per la chat di gruppo.
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" data-stop>$1</a>').replace(/\n/g, "<br>");

const CHAT_SEGS = () => [["gruppo", "Gruppo"], ["ai", AI()], ["ascolto", "Ascolto"]];
const chatChannel = () => ({ gruppo: "gruppo", ai: "assistente", ascolto: "privato" }[UI.chatSeg] || "gruppo");

// Riquadro con le proposte dell'assistente: si creano solo con un tocco.
function proposalCards(m) {
  const acts = m.meta?.actions || [];
  return acts.map((a, i) => {
    if (a.type === "poll") {
      const done = S.polls.some(p => p.question.trim().toLowerCase() === String(a.question).trim().toLowerCase());
      return `<div class="proposal"><div class="eyebrow">Proposta di sondaggio</div><div class="t" style="margin:6px 0">${esc(a.question)}</div>
        ${(a.options || []).length ? `<ul>${a.options.map(o => `<li>${esc(o.label)}${o.price ? ` <span class="faint num">~${eur(o.price)}</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${done ? `<div class="small pos row" style="gap:6px">${ico("check", 14)}Sondaggio creato</div>`
          : `<button class="btn sm primary" data-act="create-proposal" data-id="${m.id}" data-i="${i}">${ico("vote", 15)}Crea il sondaggio</button>`}</div>`;
    }
    if (a.type === "option") {
      const poll = S.polls.find(p => p.id === a.poll_id);
      if (!poll) return "";
      const done = S.poll_options.some(o => o.poll_id === a.poll_id && o.label.trim().toLowerCase() === String(a.label).trim().toLowerCase());
      return `<div class="proposal"><div class="eyebrow">Nuova opzione per «${esc(poll.question)}»</div><div class="t" style="margin:6px 0">${esc(a.label)}${a.price ? ` <span class="faint num small">~${eur(a.price)}</span>` : ""}</div>
        ${done ? `<div class="small pos row" style="gap:6px">${ico("check", 14)}Aggiunta</div>`
          : `<button class="btn sm primary" data-act="create-proposal" data-id="${m.id}" data-i="${i}">${ico("plus", 15)}Aggiungi</button>`}</div>`;
    }
    return "";
  }).join("");
}

function quoteOf(id) {
  const q = S.messages.find(x => x.id === id);
  if (!q) return `<div class="quote faint">Messaggio eliminato</div>`;
  return `<div class="quote" data-act="jump" data-id="${q.id}"><b>${esc(q.member_id === ME ? "Tu" : mname(q.member_id))}</b><span class="ellipsis">${esc(q.content.slice(0, 120))}</span></div>`;
}

function viewChat() {
  const seg = UI.chatSeg;
  const list = msgs(chatChannel());
  let lastDay = "", lastWho = "";
  const intro = {
    ai: `<div class="note">${ico("spark", 18)}<span><b>${AI()}</b> è l'agente del gruppo: cerca sul web, pianifica, fa i conti, propone sondaggi (li crei tu con un tocco) e aggiorna prenotazioni, programma, spese e quote. Questa chat la vedono tutti.</span></div>`,
    ascolto: `<div class="note">${ico("lock", 18)}<span><b>Uno spazio solo tuo.</b> Nell'app questa conversazione la vedi soltanto tu: nessuno del gruppo, nemmeno l'organizzatore, può aprirla. Puoi cancellarla quando vuoi. Non sostituisce un professionista: se sei in pericolo chiama il <b>112</b>, oppure Telefono Amico Italia allo <b>02 2327 2327</b>.</span></div>`,
  }[seg] || "";
  const empty = {
    gruppo: `<div class="empty">${ico("chat", 30)}<div class="serif">Rompi il ghiaccio</div><div class="small">Scrivi il primo messaggio al gruppo.</div></div>`,
    ai: `<div class="empty">${ico("spark", 30)}<div class="serif">Chiedi qualsiasi cosa</div><div class="small">sulla vacanza, al gruppo intero.</div></div>
      <div class="chips">${AI_SUGGESTIONS.map(q => `<button class="chip" data-act="ask" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>`,
    ascolto: `<div class="empty">${ico("user", 30)}<div class="serif">Come stai, davvero?</div><div class="small">Scrivi quello che ti passa per la testa: qui c'è chi ascolta, senza giudicare.</div></div>`,
  }[seg];
  return `
  <div style="margin-bottom:16px">${segmented("chatSeg", CHAT_SEGS(), "chat-seg")}</div>
  <div class="chat">
    ${intro}
    ${!list.length ? empty : ""}
    ${list.map(m => {
      const day = fmtDate(m.created_at, { weekday: "long", day: "numeric", month: "long" });
      const sep = day !== lastDay ? `<div class="time-sep">${esc(day)}</div>` : "";
      const who = m.role === "assistant" ? "ai" : m.member_id;
      const cont = !sep && who === lastWho;
      lastDay = day; lastWho = who;
      const time = fmtTime(m.created_at);
      if (m.role === "assistant") return `${sep}<div class="msg ai" data-mid="${m.id}">${avatar(null, "sm")}<div class="bubble"><div class="who">${seg === "ascolto" ? "Ascolto" : AI()} · ${time}</div>${md(m.content)}${proposalCards(m)}</div></div>`;
      const mine = m.member_id === ME; const w = member(m.member_id);
      const body = m.meta?.voice ? voiceBubble(m) : seg === "gruppo" ? linkify(m.content) : esc(m.content).replace(/\n/g, "<br>");
      const tap = seg === "gruppo" && m.id !== "tmp" ? `data-act="msg-menu" data-id="${m.id}"` : "";
      return `${sep}<div class="msg ${mine ? "mine" : ""} ${cont && !m.reply_to ? "cont" : ""}" data-mid="${m.id}">${mine ? "" : cont ? `<span class="av-sp"></span>` : avatar(w, "sm")}<div class="bubble" ${tap}>${mine || cont || seg !== "gruppo" ? "" : `<div class="who">${esc(w?.name || "—")}</div>`}${m.reply_to ? quoteOf(m.reply_to) : ""}${body}<span class="stamp">${time}</span></div></div>`;
    }).join("")}
    ${UI.waiting && UI.waiting === seg ? `<div class="msg ai">${avatar(null, "sm")}<div class="bubble"><div class="who" id="thinking-label">${seg === "ascolto" ? "Sto leggendo" : "Sto pensando"}</div><div class="typing"><span></span><span></span><span></span></div></div></div>` : ""}
    ${seg === "ascolto" && list.length ? `<button class="link" style="align-self:center;margin-top:8px" data-act="clear-private">${ico("trash", 15)}Cancella questa conversazione</button>` : ""}
  </div>`;
}

function renderReplyBar() {
  const bar = $("#reply-bar");
  const q = UI.replyTo && UI.tab === "chat" && UI.chatSeg === "gruppo" ? S.messages.find(x => x.id === UI.replyTo) : null;
  bar.hidden = !q;
  bar.innerHTML = q ? `<div class="grow"><div class="tiny" style="color:var(--violet);font-weight:600">Rispondi a ${esc(q.member_id === ME ? "te stesso" : mname(q.member_id))}</div><div class="small muted ellipsis">${esc(q.content)}</div></div>
    <button class="btn icon sm" data-act="reply-cancel" aria-label="Annulla risposta">${ico("close", 16)}</button>` : "";
}

function startReply(id) {
  UI.replyTo = id; renderReplyBar();
  navigator.vibrate?.(10);
  $("#composer-input").focus();
}

async function sendGroup(text) {
  text = String(text || "").trim();
  if (!text) return;
  const reply = UI.replyTo;
  UI.replyTo = null; renderReplyBar();
  try {
    const row = await api.insert("messages", { member_id: ME, role: "user", channel: "gruppo", content: text.slice(0, 2000), reply_to: reply || null });
    api.notify("chat", row.id);
    if (CLOUD) { S.messages.push(row); render(); }
  } catch (e) { toast(e.message, "alert"); }
}

let thinkingTimer = null;
async function ask(text, mode = "ai") {
  text = String(text || "").trim();
  if (!text || UI.waiting) return;
  UI.waiting = mode;
  UI.chatSeg = mode;
  UI.tab = "chat"; render();
  const labels = mode === "ascolto" ? ["Sto leggendo", "Ci penso un attimo"] : ["Sto pensando", "Leggo i dati del gruppo", "Cerco sul web", "Confronto le opzioni", "Ancora un attimo"];
  let i = 0;
  thinkingTimer = setInterval(() => { const el = $("#thinking-label"); if (el) el.textContent = labels[Math.min(++i, labels.length - 1)]; }, 4000);
  const ch = mode === "ascolto" ? "privato" : "assistente";
  UI.aiBefore = msgs(ch).filter(m => m.role === "assistant").length;
  let keepWaiting = CLOUD;
  try {
    if (CLOUD) S.messages.push({ id: "tmp", member_id: ME, owner: mode === "ascolto" ? ME : null, role: "user", channel: ch, content: text, created_at: new Date().toISOString() });
    render();
    await api.ask(text, mode === "ascolto" ? "ascolto" : undefined);
  } catch (e) {
    // Rete caduta o telefono in pausa: la domanda quasi sempre è arrivata, la risposta comparirà da sola.
    const network = /raggiungere|fetch|network|load failed|tempo/i.test(e.message);
    if (!network) { keepWaiting = false; toast((mode === "ascolto" ? "Non riesco a rispondere ora: " : `${AI()} non risponde: `) + e.message, "alert"); }
  }
  if (!keepWaiting) { stopWaiting(); await reload(); return; }
  // Zampone lavora sul server: la risposta arriva in tempo reale. Dopo 3 minuti smettiamo di aspettare a vista.
  clearTimeout(UI.waitTimer);
  UI.waitTimer = setTimeout(() => { if (UI.waiting) { stopWaiting(); render(); toast(`${AI()} ci sta mettendo tanto: la risposta comparirà qui appena pronta`); } }, 180000);
  await reload();
}
function stopWaiting() { clearInterval(thinkingTimer); clearTimeout(UI.waitTimer); UI.waiting = false; }
// Chiamata a ogni ricarica: la risposta è arrivata?
function checkAnswered() {
  if (!UI.waiting) return;
  const ch = UI.waiting === "ascolto" ? "privato" : "assistente";
  if (msgs(ch).filter(m => m.role === "assistant").length > (UI.aiBefore ?? 0)) { stopWaiting(); navigator.vibrate?.(12); }
}

// Scorri un messaggio verso destra per rispondere, come su WhatsApp.
let lastSwipe = 0;
(() => {
  let sx = 0, sy = 0, el = null;
  document.addEventListener("touchstart", e => {
    el = UI.tab === "chat" && UI.chatSeg === "gruppo" ? e.target.closest(".msg[data-mid]:not(.ai)") : null;
    if (el) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!el) return;
    const dx = e.touches[0].clientX - sx, dy = Math.abs(e.touches[0].clientY - sy);
    if (dy > 30) { el.style.transform = ""; el = null; return; }
    if (dx > 0) el.style.transform = `translateX(${Math.min(dx, 70)}px)`;
  }, { passive: true });
  document.addEventListener("touchend", e => {
    if (!el) return;
    const dx = e.changedTouches[0].clientX - sx;
    el.style.transition = "transform .2s"; el.style.transform = "";
    const id = el.dataset.mid; const done = el;
    setTimeout(() => { done.style.transition = ""; }, 220);
    el = null;
    if (dx > 12) lastSwipe = Date.now();
    if (dx > 55 && id !== "tmp") startReply(id);
  });
})();

// ───────────────────────── Notifiche ─────────────────────────
// Su iPhone funzionano solo con l'app aggiunta alla schermata Home (iOS 16.4 o successivo).

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushState() {
  if (!api.pushEnabled) return "off";
  if (!pushSupported()) return isIOS && !isStandalone() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && storage.get(PUSH_KEY) === "on" ? "on" : "ask";
}
const PUSH_LABEL = { on: "Attive", ask: "Disattivate", install: "Serve l'app sulla Home", denied: "Bloccate nelle impostazioni", unsupported: "Non supportate qui", off: "Disponibili col database collegato" };
const b64ToBytes = str => { const pad = "=".repeat((4 - (str.length % 4)) % 4); return Uint8Array.from(atob((str + pad).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); };

async function enablePush() {
  const st = pushState();
  if (st === "install") return sheetInstall(true);
  if (st === "off" || st === "unsupported") return toast("Le notifiche qui non sono disponibili");
  if (st === "denied") return toast("Riattivale da Impostazioni → Notifiche → Capodanno", "bell");
  try {
    if (await Notification.requestPermission() !== "granted") return toast("Notifiche non attivate");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(await api.vapidKey()) });
    await api.savePush(sub);
    storage.set(PUSH_KEY, "on");
    api.notifyTest().catch(() => {});
    toast("Notifiche attivate", "bell"); render();
  } catch (e) { toast("Non riesco ad attivarle: " + e.message, "alert"); }
}
async function disablePush() {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await api.dropPush(sub.endpoint); await sub.unsubscribe(); }
  } catch { /* già disattivate */ }
  storage.del(PUSH_KEY); toast("Notifiche disattivate"); render();
}
// Se il telefono passa a un altro account, l'iscrizione segue la persona giusta.
async function syncPush() {
  if (pushState() !== "on") return;
  try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (sub) await api.savePush(sub); } catch { /* riprova al prossimo avvio */ }
}
function pushCard() {
  const st = pushState();
  if (!["ask", "install"].includes(st)) return "";
  return `<section class="card">
    <div class="row top">${ico("bell", 22)}<div class="grow"><div class="t">Attiva le notifiche</div>
      <div class="small muted" style="margin-top:4px">${st === "install" ? "Su iPhone arrivano solo con l'app aggiunta alla schermata Home." : "Servono per sondaggi, quote e prenotazioni: senza, il gruppo resta ad aspettarti. Chat e giochi li puoi silenziare quando vuoi."}</div></div></div>
    <div class="row" style="gap:8px;margin-top:14px"><button class="btn pearl grow" data-act="push-on">${st === "install" ? "Come fare" : "Attiva le notifiche"}</button></div>
  </section>`;
}
function applyDeepLink(q) {
  const tab = q.get("tab");
  if (!tab || ![...TABS.map(t => t.id), "giochi", "gruppo"].includes(tab)) return false;
  UI.tab = tab;
  if (tab === "spese" && q.get("seg")) UI.moneySeg = q.get("seg");
  if (tab === "chat") UI.chatSeg = "gruppo";
  if (q.get("chess")) window.chessDeepLink?.(q);
  return true;
}

// ───────────────────────── Gruppo e profili ─────────────────────────

function viewGruppo() {
  const m = me();
  const t = trip();
  const priv = S.member_private.find(r => r.member_id === ME);
  return `
  <section class="card">
    <div class="row">${avatar(m, "lg")}<div class="grow"><div class="serif" style="font-size:30px;line-height:1">${esc(m.name)}</div>
      <div class="small muted" style="margin-top:6px">${m.is_admin ? "Organizzatore" : "Nel gruppo"}</div></div></div>
    <div class="actions"><button class="btn" data-act="edit-profile">${ico("user", 17)}Profilo</button><button class="btn" data-act="edit-private">${ico("lock", 17)}Documenti</button></div>
    ${!priv?.doc_number ? `<div class="tiny faint" style="margin-top:12px">Inserisci i dati del documento: servono per registrarsi in hotel e per i biglietti nominativi.</div>` : ""}
  </section>

  ${isAdmin() ? `<section class="card">
    <div class="row between">
      <div><div class="eyebrow">Codice invito</div><div class="num" style="font-size:26px;letter-spacing:.14em;margin-top:6px">${esc(t.invite_code || "—")}</div></div>
      <button class="btn primary" data-act="invite">${ico("share", 17)}Invita</button>
    </div>
  </section>` : ""}

  <div class="section"><div class="label">Partecipanti · ${S.members.length}</div>${isAdmin() ? `<button class="link" data-act="add-person">${ico("plus", 15)}Aggiungi</button>` : ""}</div>
  <section class="card">${S.members.slice().sort(byCreated).map(x => `
    <div class="li tap" data-act="member" data-id="${x.id}">
      ${avatar(x)}
      <div class="grow"><div class="row" style="gap:8px"><span class="t ellipsis">${esc(x.name)}</span>${x.is_admin ? `<span class="pill admin">Organizzatore</span>` : ""}</div>
        <div class="small muted ellipsis">${[x.departure_city && "da " + x.departure_city, x.car_seats ? `auto, ${x.car_seats} posti` : "", x.diet, x.allergies && "allergie: " + x.allergies].filter(Boolean).map(esc).join(" · ")}</div></div>
      <span class="chev">${ico("chev", 18)}</span>
    </div>`).join("")}
  </section>

  ${isAdmin() ? `
  <div class="section"><div class="label">Strumenti organizzatore</div></div>
  <section class="card">
    <div class="li tap" data-act="edit-trip"><div class="ib">${ico("globe")}</div><div class="grow"><div class="t">Dati del viaggio</div><div class="small muted">Destinazione, date, avviso per tutti, codice invito</div></div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="li tap" data-act="feedback-list"><div class="ib">${ico("bell")}</div><div class="grow"><div class="t">Suggerimenti ricevuti</div><div class="small muted">${S.feedback.filter(f => f.status === "nuovo").length} da leggere · ${S.feedback.length} in tutto</div></div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="li tap" data-act="guest-list"><div class="ib">${ico("list")}</div><div class="grow"><div class="t">Lista ospiti</div><div class="small muted">Nomi, documenti e contatti pronti per hotel e biglietterie</div></div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="li tap" data-act="clear-chat" data-ch="gruppo"><div class="ib">${ico("chat")}</div><div class="grow"><div class="t">Svuota la chat di gruppo</div><div class="small muted">Cancella i messaggi per tutti</div></div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="li tap" data-act="clear-chat" data-ch="assistente"><div class="ib">${ico("spark")}</div><div class="grow"><div class="t">Svuota la chat di ${AI()}</div><div class="small muted">Cancella domande e risposte per tutti</div></div><span class="chev">${ico("chev", 18)}</span></div>
  </section>` : ""}

  <div class="section"><div class="label">App</div></div>
  <section class="card">
    <div class="li tap" data-act="feedback"><div class="ib">${ico("spark")}</div><div class="grow"><div class="t">Suggerisci una funzione</div><div class="small muted">Un'idea o un miglioramento per l'app</div></div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="li tap" data-act="push-toggle"><div class="ib">${ico("bell")}</div><div class="grow"><div class="t">Notifiche</div><div class="small muted">${PUSH_LABEL[pushState()]}</div></div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="li tap" data-act="how-to-pay"><div class="ib">${ico("card")}</div><div class="grow"><div class="t">Pagamenti</div><div class="small muted">I tuoi metodi per ricevere e come si paga</div></div><span class="chev">${ico("chev", 18)}</span></div>
    ${isIOS && !isStandalone() ? `<div class="li tap" data-act="install"><div class="ib">${ico("device")}</div><div class="grow t">Aggiungi alla schermata Home</div><span class="chev">${ico("chev", 18)}</span></div>` : ""}
    <div class="li tap" data-act="change-pin"><div class="ib">${ico("key")}</div><div class="grow t">Cambia PIN</div><span class="chev">${ico("chev", 18)}</span></div>
    <div class="li tap" data-act="logout"><div class="ib" style="color:var(--red)">${ico("logout")}</div><div class="grow t" style="color:var(--red)">Esci da questo telefono</div></div>
  </section>
  ${!CLOUD ? `<div class="banner"><b>Modalità prova.</b> I dati restano su questo telefono. Per condividerli con il gruppo collega il database (vedi guida).</div>` : ""}`;
}

function sheetMember(id) {
  const x = member(id); if (!x) return;
  const p = S.member_private.find(r => r.member_id === id);
  const kv = (l, v) => (v ? `<div class="kv"><span>${l}</span><div class="grow">${esc(v)}</div></div>` : "");
  openSheet(`
    <div class="row" style="gap:16px;margin-bottom:18px">${avatar(x, "lg")}<div><h2 style="margin:0">${esc(x.name)}</h2><div class="row" style="gap:6px;margin-top:6px">${x.is_admin ? `<span class="pill admin">Organizzatore</span>` : ""}</div></div></div>
    ${x.phone ? `<div class="chips" style="margin-bottom:16px"><a class="chip" href="${esc(telUrl(x.phone))}">${ico("phone", 15)}Chiama</a><a class="chip" href="${esc(waUrl(x.phone))}" target="_blank" rel="noopener">${ico("chat", 15)}WhatsApp</a></div>` : ""}
    <section class="card">
      ${kv("Telefono", x.phone)}${kv("Email", x.email)}${kv("Parte da", x.departure_city)}
      ${kv("Posti in auto", x.car_seats ? String(x.car_seats) : "")}${kv("Passaggio con", x.ride_with ? mname(x.ride_with) : "")}${kv("Dieta", x.diet)}${kv("Allergie", x.allergies)}
      ${kv("Preferenze", x.preferences)}${kv("Emergenza", [x.emergency_name, x.emergency_phone].filter(Boolean).join(" · "))}
      ${kv("PayPal", x.paypal && "paypal.me/" + paypalUser(x.paypal))}${kv("IBAN", x.iban)}${kv("Satispay", x.satispay)}
      ${!x.phone && !x.diet && !x.allergies && !x.departure_city ? `<div class="small muted">Profilo ancora da completare.</div>` : ""}
    </section>
    ${p && (isAdmin() || id === ME) ? `<div class="section"><div class="label row" style="gap:8px">${ico("lock", 14)}Dati riservati</div></div><section class="card">
      ${kv("Nome completo", p.legal_name)}${kv("Nascita", [p.birth_date && fmtDate(p.birth_date, { day: "numeric", month: "long", year: "numeric" }), p.birth_place].filter(Boolean).join(", "))}
      ${kv("Cittadinanza", p.nationality)}${kv("Codice fiscale", p.fiscal_code)}${kv("Documento", [p.doc_type, p.doc_number].filter(Boolean).join(" n. "))}
      ${kv("Rilasciato da", p.doc_issued_by)}${kv("Scadenza", p.doc_expiry && fmtDate(p.doc_expiry, { day: "numeric", month: "long", year: "numeric" }))}${kv("Indirizzo", p.address)}
    </section>` : ""}
    ${isAdmin() && id !== ME ? `<div class="stack" style="margin-top:14px">
      <button class="btn block" data-act="edit-profile" data-id="${id}">${ico("edit", 17)}Modifica il profilo</button>
      <button class="btn block" data-act="toggle-admin" data-id="${id}">${ico("star", 17)}${x.is_admin ? "Togli ruolo organizzatore" : "Rendi organizzatore"}</button>
      <button class="btn block" data-act="reset-pin" data-id="${id}">${ico("key", 17)}Reimposta PIN</button>
      <button class="btn block danger" data-act="remove-member" data-id="${id}">${ico("trash", 17)}Rimuovi dal gruppo</button></div>` : ""}
    ${id === ME ? `<button class="btn primary block" style="margin-top:14px" data-act="edit-profile">Modifica il mio profilo</button>` : ""}`);
}

// Profilo: il proprio, oppure (per l'organizzatore) quello di un altro o uno nuovo da creare.
function sheetProfile(id = ME) {
  const isNew = id === "new";
  const m = isNew ? { name: "", color: COLORS[Math.floor(Math.random() * COLORS.length)], car_seats: 0 } : member(id);
  const mine = id === ME;
  openSheet(`
    <h2>${isNew ? "Aggiungi una persona" : mine ? "Il mio profilo" : `Profilo di ${esc(m.name)}`}</h2>
    ${isNew ? `<p class="small muted" style="margin:-6px 0 16px">Al primo accesso toccherà il suo nome e sceglierà il PIN.</p>` : ""}
    <form data-form="profile" data-id="${isNew ? "new" : esc(id)}">
      <div class="field"><label>Nome</label><input name="name" required maxlength="40" value="${esc(m.name)}"></div>
      <div class="field"><label>Foto</label>
        <div class="row" style="gap:14px"><span id="av-preview">${avatar(m, "lg")}</span>
          <div class="stack grow" style="gap:8px"><label class="btn sm tap" style="width:fit-content">${ico("upload", 15)}Scegli una foto<input type="file" accept="image/*" hidden data-avatar></label>
          <button type="button" class="link" data-act="avatar-remove" ${m.avatar_url ? "" : "hidden"}>Rimuovi la foto</button></div></div>
        <input type="hidden" name="avatar_url" value="${esc(m.avatar_url || "")}"></div>
      <div class="field"><label>Colore${m.avatar_url ? " (si vede senza foto)" : ""}</label><div class="swatches">${COLORS.map(c => `<button type="button" class="${m.color === c ? "on" : ""}" style="--c:${c}" data-act="pick-color" data-c="${c}" aria-label="Colore"></button>`).join("")}</div><input type="hidden" name="color" value="${esc(m.color || COLORS[0])}"></div>
      <div class="two">
        <div class="field"><label>Cellulare</label><input name="phone" inputmode="tel" value="${esc(m.phone || "")}" placeholder="+39…"></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${esc(m.email || "")}"></div>
      </div>
      <div class="two">
        <div class="field"><label>Parto da</label><input name="departure_city" value="${esc(m.departure_city || "")}" placeholder="Città"></div>
        <div class="field"><label>Posti liberi in auto</label><input name="car_seats" inputmode="numeric" value="${esc(m.car_seats || 0)}"></div>
      </div>
      <div class="field"><label>Dieta</label><input name="diet" value="${esc(m.diet || "")}" placeholder="Vegetariano, vegano, senza glutine…"></div>
      <div class="field"><label>Allergie e intolleranze</label><input name="allergies" value="${esc(m.allergies || "")}"></div>
      <div class="field"><label>Preferenze e desideri</label><textarea name="preferences" placeholder="Es. camera tranquilla, niente discoteca, voglio sciare…">${esc(m.preferences || "")}</textarea></div>
      <div class="field"><label>Note per ${AI()}</label><textarea name="notes" placeholder="Tutto quello che è utile sapere: abitudini, budget, cose da evitare, sorprese…">${esc(m.notes || "")}</textarea><div class="hint">Le legge ${AI()} per proporre cose adatte a tutti.</div></div>
      <div class="two">
        <div class="field"><label>Contatto di emergenza</label><input name="emergency_name" value="${esc(m.emergency_name || "")}" placeholder="Nome"></div>
        <div class="field"><label>Telefono</label><input name="emergency_phone" inputmode="tel" value="${esc(m.emergency_phone || "")}"></div>
      </div>
      <div class="section" style="margin:10px 4px 12px"><div class="label">Per ricevere i pagamenti</div></div>
      <div class="field"><label>PayPal.me</label><input name="paypal" value="${esc(m.paypal || "")}" placeholder="nome utente o link paypal.me" autocapitalize="off"></div>
      <div class="field"><label>IBAN</label><input name="iban" value="${esc(m.iban || "")}" autocapitalize="characters" class="num"></div>
      <div class="field"><label>Satispay</label><input name="satispay" inputmode="tel" value="${esc(m.satispay || "")}" placeholder="Numero collegato a Satispay"></div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Salva</button></div>
    </form>`);
}

function sheetPrivate() {
  const p = S.member_private.find(r => r.member_id === ME) || {};
  openSheet(`
    <h2>Documenti</h2>
    <div class="note">${ico("lock", 18)}<span>Li vedete <b>solo tu e l'organizzatore</b>. Servono per la registrazione in hotel (obbligatoria per legge), i biglietti nominativi e le liste ospiti. Non inserire mai dati di carte di pagamento.</span></div>
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
      <div class="field"><label>Destinazione</label><input name="destination" value="${esc(t.destination || "")}" placeholder="Da decidere con un sondaggio"><div class="hint">Scrivi la città: serve anche per il meteo.</div></div>
      <div class="two">
        <div class="field"><label>Partenza</label><input type="date" name="start_date" value="${esc(t.start_date || "")}"></div>
        <div class="field"><label>Ritorno</label><input type="date" name="end_date" value="${esc(t.end_date || "")}"></div>
      </div>
      <div class="field"><label>Avviso per tutti</label><textarea name="notes" placeholder="Compare in Home. Es. Entro venerdì votate le date!">${esc(t.notes || "")}</textarea></div>
      <div class="field"><label>Il gruppo in breve, per ${AI()}</label><textarea name="group_notes" placeholder="Es. siamo in 8, due coppie; budget medio; amiamo il buon cibo e ballare; due di noi non sciano…">${esc(t.group_notes || "")}</textarea><div class="hint">${AI()} lo usa per proporre destinazioni, locali e attività adatti a voi.</div>
      <div class="field"><label>Nome dell'agente</label><input name="ai_name" maxlength="24" value="${esc(t.ai_name || "Zampone")}"></div></div>
      <div class="field"><label>WhatsApp per i suggerimenti</label><input name="feedback_whatsapp" inputmode="tel" value="${esc(t.feedback_whatsapp || "")}" placeholder="+39…"><div class="hint">Le idee per l'app arrivano qui. Il numero lo vedono solo i membri del gruppo.</div></div>
      ${CLOUD ? `<div class="field"><label>Codice invito</label><input name="invite_code" required minlength="4" value="${esc(t.invite_code || "")}" autocapitalize="characters" class="num"><div class="hint">Cambialo se il link è finito nelle mani sbagliate: chi è già dentro resta dentro.</div></div>` : ""}
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">Salva</button></div>
    </form>`);
}

function guestListText() {
  const lines = [`OSPITI - ${trip().name}${trip().destination ? " - " + trip().destination : ""}`, `Persone: ${going().length}`, ""];
  S.members.filter(m => m.rsvp !== "no").forEach((m, i) => {
    const p = S.member_private.find(r => r.member_id === m.id) || {};
    lines.push(`${i + 1}. ${p.legal_name || m.name}`);
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
    ${missing.length ? `<div class="note">${ico("alert", 18)}<span>Mancano i documenti di <b>${missing.map(m => esc(m.name)).join(", ")}</b>. Si inseriscono da Gruppo → Documenti.</span></div>` : ""}
    <textarea readonly class="mono-box" style="min-height:320px">${esc(text)}</textarea>
    <div class="actions"><button class="btn" data-act="copy" data-text="${esc(text)}">${ico("copy", 17)}Copia</button>${navigator.share ? `<button class="btn primary" data-act="share-text" data-text="${esc(text)}">${ico("share", 17)}Condividi</button>` : ""}</div>`);
}

function sheetInstall(forPush = false) {
  openSheet(`
    <h2>Mettila sulla Home</h2>
    ${forPush ? `<p class="small muted" style="margin:-6px 0 12px">Su iPhone le notifiche arrivano solo dall'app aggiunta alla Home. Poi aprila dall'icona e attivale da lì.</p>` : ""}
    <img src="guida/${/android/i.test(navigator.userAgent) ? "android" : "iphone"}.png" alt="" style="width:100%;border-radius:22px;margin-bottom:14px;box-shadow:inset 0 0 0 1px var(--line)">
    <div class="steps">
      <div><span>In Safari tocca <b>Condividi</b>, il quadrato con la freccia verso l'alto.</span></div>
      <div><span>Scorri e tocca <b>Aggiungi alla schermata Home</b>, poi <b>Aggiungi</b>.</span></div>
      <div><span>Apri l'app dall'icona e rientra toccando il tuo nome e inserendo il PIN.</span></div>
    </div>
    <div class="actions"><button class="btn primary" data-act="close-sheet">Ho capito</button></div>`);
}

// ───────────────────────── Benvenuto: il questionario del primo accesso ─────────────────────────
// Parte da solo finché la persona non l'ha completato: dati, esigenze e preferenze in pochi passi.

const DIETS = ["Mangio tutto", "Vegetariana", "Vegana", "Pescetariana", "Senza glutine", "Senza lattosio", "Halal"];
const INTERESTS = ["Festa e ballare", "Buon cibo", "Relax", "Cultura e musei", "Neve e sci", "Natura e passeggiate", "Spa e benessere", "Shopping", "Giochi da tavolo"];
const WIZ_STEPS = 5;

function maybeWizard() {
  const m = me();
  if (!m || m.onboarded || UI.wizardShown || storage.get("capodanno-wizard-later") === today() || $("#sheet").classList.contains("open")) return false;
  UI.wizardShown = true;
  sheetWizard(1);
  return true;
}

function wizHead(step, title, sub) {
  return `<div class="row between" style="margin-bottom:6px"><span class="eyebrow">Passo ${step} di ${WIZ_STEPS}</span>
      <div class="wiz-dots">${Array.from({ length: WIZ_STEPS }, (_, i) => `<i class="${i < step ? "on" : ""}"></i>`).join("")}</div></div>
    <h2 style="margin-bottom:6px">${title}</h2><p class="small muted" style="margin:0 0 18px">${sub}</p>`;
}
const chipGroup = (name, items, selected) => `<div class="chips">${items.map(x => `<label class="chip ${selected.includes(x) ? "on" : ""}"><input type="checkbox" name="${name}" value="${esc(x)}" ${selected.includes(x) ? "checked" : ""} hidden data-chip>${esc(x)}</label>`).join("")}</div>`;
const splitList = s => String(s || "").split(/\s*[,;]\s*/).filter(Boolean);

function sheetWizard(step) {
  const m = me();
  const p = S.member_private.find(r => r.member_id === ME) || {};
  const nav = (optional, last) => `<div class="actions">
      ${step === 1 ? `<button type="button" class="btn" data-act="wiz-later">Più tardi</button>` : `<button type="button" class="btn" data-act="wiz-go" data-step="${step - 1}">Indietro</button>`}
      ${optional ? `<button type="button" class="btn" data-act="wiz-go" data-step="${step + 1}">Salta</button>` : ""}
      <button class="btn primary">${last ? "Fine" : "Avanti"}</button></div>`;
  let body = "";
  if (step === 1) {
    body = `${wizHead(1, `Benvenuto, ${esc(m.name)}`, `Due minuti per raccontarci di te: così l'organizzatore e ${AI()} sanno già di cosa hai bisogno.`)}
      <div class="field"><label>Foto</label>
        <div class="row" style="gap:14px"><span id="av-preview">${avatar(m, "lg")}</span>
          <div class="stack grow" style="gap:8px"><label class="btn sm tap" style="width:fit-content">${ico("upload", 15)}Scegli una foto<input type="file" accept="image/*" hidden data-avatar></label>
          <button type="button" class="link" data-act="avatar-remove" ${m.avatar_url ? "" : "hidden"}>Rimuovi la foto</button></div></div>
        <input type="hidden" name="avatar_url" value="${esc(m.avatar_url || "")}"><input type="hidden" name="color" value="${esc(m.color || COLORS[0])}"></div>
      <div class="field"><label>Come ti chiamiamo</label><input name="name" required maxlength="40" value="${esc(m.name)}"></div>
      <div class="two">
        <div class="field"><label>Cellulare</label><input name="phone" inputmode="tel" value="${esc(m.phone || "")}" placeholder="+39…"></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${esc(m.email || "")}"></div>
      </div>${nav(false)}`;
  } else if (step === 2) {
    const diets = splitList(m.diet);
    body = `${wizHead(2, "A tavola", "Per scegliere ristoranti e cenone senza sorprese.")}
      <div class="field"><label>Alimentazione</label>${chipGroup("diet", DIETS, diets)}</div>
      <div class="field"><label>Altro sull'alimentazione</label><input name="diet_other" value="${esc(diets.filter(d => !DIETS.includes(d)).join(", "))}" placeholder="Es. niente funghi, poco piccante"></div>
      <div class="field"><label>Allergie e intolleranze</label><input name="allergies" value="${esc(m.allergies || "")}" placeholder="Es. frutta a guscio, crostacei"><div class="hint">Se non ne hai, lascia vuoto.</div></div>${nav(false)}`;
  } else if (step === 3) {
    const pref = splitList(m.preferences);
    body = `${wizHead(3, "Il viaggio", "Da dove parti, se hai l'auto e cosa ti piace fare.")}
      <div class="two">
        <div class="field"><label>Parto da</label><input name="departure_city" value="${esc(m.departure_city || "")}" placeholder="Città"></div>
        <div class="field"><label>Posti liberi in auto</label><input name="car_seats" inputmode="numeric" value="${esc(m.car_seats || 0)}"><div class="hint">0 se non porti l'auto.</div></div>
      </div>
      <div class="field"><label>Cosa ti piacerebbe fare</label>${chipGroup("interests", INTERESTS, pref)}</div>
      <div class="field"><label>Altro da sapere</label><textarea name="notes" placeholder="Abitudini, budget, cose da evitare, desideri…">${esc(m.notes || "")}</textarea></div>
      <div class="two">
        <div class="field"><label>Contatto di emergenza</label><input name="emergency_name" value="${esc(m.emergency_name || "")}" placeholder="Nome"></div>
        <div class="field"><label>Telefono</label><input name="emergency_phone" inputmode="tel" value="${esc(m.emergency_phone || "")}"></div>
      </div>${nav(false)}`;
  } else if (step === 4) {
    body = `${wizHead(4, "Documento", "Facoltativo, ma fa risparmiare tempo: serve per la registrazione in hotel e i biglietti nominativi.")}
      <div class="note">${ico("lock", 18)}<span>Lo vedete <b>solo tu e l'organizzatore</b>.</span></div>
      <div class="field"><label>Nome e cognome come sul documento</label><input name="legal_name" value="${esc(p.legal_name || "")}"></div>
      <div class="two">
        <div class="field"><label>Data di nascita</label><input type="date" name="birth_date" value="${esc(p.birth_date || "")}"></div>
        <div class="field"><label>Luogo di nascita</label><input name="birth_place" value="${esc(p.birth_place || "")}"></div>
      </div>
      <div class="two">
        <div class="field"><label>Documento</label><select name="doc_type">${DOC_TYPES.map(d => `<option ${p.doc_type === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
        <div class="field"><label>Numero</label><input name="doc_number" value="${esc(p.doc_number || "")}" autocapitalize="characters"></div>
      </div>
      <div class="two">
        <div class="field"><label>Scadenza</label><input type="date" name="doc_expiry" value="${esc(p.doc_expiry || "")}"></div>
        <div class="field"><label>Codice fiscale</label><input name="fiscal_code" value="${esc(p.fiscal_code || "")}" autocapitalize="characters"></div>
      </div>${nav(true)}`;
  } else {
    body = `${wizHead(5, "Per ricevere i soldi", "Facoltativo: chi ti deve qualcosa vedrà il pulsante per pagarti con un tocco.")}
      <div class="field"><label>PayPal.me</label><input name="paypal" value="${esc(m.paypal || "")}" placeholder="nome utente o link paypal.me" autocapitalize="off"></div>
      <div class="field"><label>IBAN</label><input name="iban" value="${esc(m.iban || "")}" autocapitalize="characters" class="num"></div>
      <div class="field"><label>Satispay</label><input name="satispay" inputmode="tel" value="${esc(m.satispay || "")}" placeholder="Numero collegato a Satispay"></div>${nav(true, true)}`;
  }
  openSheet(`<form data-form="wizard" data-step="${step}">${body}</form>`);
}

async function finishWizard() {
  await api.update("members", { id: ME }, { onboarded: true });
  closeSheet(); await reload();
  toast("Profilo completato, grazie", "check");
  if (isIOS && !isStandalone()) setTimeout(sheetInstall, 500);
}

// ───────────────────────── Onboarding ─────────────────────────
// Il telefono ricorda chi sei (anche nel link salvato sulla Home): al rientro mostra solo il tuo account.

const ONB = { code: "", preview: null, step: "code", who: null, color: COLORS[1], err: "" };
let onbStop = null;
const knownMember = () => new URLSearchParams(location.search).get("u") || storage.get(LAST_KEY);

function showOnboarding() {
  $("#dock").hidden = true;
  $("#fab").hidden = true;
  $("#composer").classList.remove("show");
  const urlCode = new URLSearchParams(location.search).get("c");
  ONB.code = ONB.code || urlCode || storage.get(CODE_KEY) || (CLOUD ? "" : "DEMO");
  renderOnboarding();
  if ((urlCode || ONB.code) && !ONB.preview) onbCheckCode(urlCode || ONB.code, true);
}

const pinFields = `
  <div class="two">
    <div class="field"><label>Scegli un PIN</label><input name="pin" class="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password"></div>
    <div class="field"><label>Ripetilo</label><input name="pin2" class="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password"></div>
  </div>
  <div class="tiny faint" style="margin:-4px 4px 16px">4 cifre: servono per rientrare da un altro telefono o dopo aver messo l'app sulla Home.</div>`;

function renderOnboarding() {
  const P = ONB.preview;
  const year = (countdownTarget() || new Date()).getFullYear();
  const m = P?.members.find(x => x.id === ONB.who);
  let body = "";
  if (ONB.step === "code") {
    body = `
      <form data-form="onb-code">
        <div class="field"><label>Codice invito</label><input name="code" required value="${esc(ONB.code)}" autocapitalize="characters" autocomplete="off" placeholder="······" class="code-input"></div>
        <button class="btn primary block">Entra</button>
      </form>`;
  } else if (ONB.step === "who") {
    body = `
      <div class="eyebrow">${esc(P.name)}</div>
      <div class="serif" style="font-size:30px;margin:6px 0 4px">Chi sei?</div>
      ${P.members.length ? `<div class="who-list">${P.members.map(x => `<button data-act="onb-pick" data-id="${x.id}">${avatar(x, "sm")}<span class="grow ellipsis">${esc(x.name)}</span>${x.claimed === false ? `<span class="tiny faint">nuovo</span>` : ""}</button>`).join("")}</div>
        <div class="tiny faint" style="margin-bottom:14px">Già entrato? Tocca il tuo nome. Prima volta? Tocca Unisciti.</div>
        <button class="btn primary block" data-act="onb-new">${ico("plus", 16)}Prima volta? Unisciti</button>`
      : `<div class="small muted" style="margin:4px 0 16px">Sei il primo: diventerai l'organizzatore e potrai creare i profili degli altri.</div>
        <button class="btn primary block" data-act="onb-new">Inizia</button>`}`;
  } else if (ONB.step === "pin" || ONB.step === "me") {
    const first = m && m.claimed === false;
    body = `
      <form data-form="${first ? "onb-claim" : "onb-rejoin"}" class="stack">
        <div class="row">${avatar(m, "lg")}<div><div class="eyebrow">${first ? "Primo accesso" : "Bentornato"}</div><div class="serif" style="font-size:30px">Ciao ${esc(m?.name)}</div></div></div>
        ${first ? `<div style="margin-top:16px">${pinFields}</div>`
          : `<div class="field" style="margin-top:16px"><label>Il tuo PIN</label><input name="pin" class="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="one-time-code" autofocus></div>`}
        <button class="btn primary block">Entra</button>
        ${ONB.step === "me" ? `<button type="button" class="link" style="justify-content:center;width:100%" data-act="onb-switch">Non sei ${esc(m?.name)}? Cambia account</button>`
          : `<button type="button" class="btn block" data-act="onb-back">Indietro</button>`}
      </form>`;
  } else if (ONB.step === "new") {
    body = `
      <form data-form="onb-join">
        <div class="field"><label>Come ti chiami?</label><input name="name" required maxlength="40" autocomplete="given-name" placeholder="Nome, come ti chiamano gli amici"></div>
        <div class="field"><label>Il tuo colore</label><div class="swatches">${COLORS.map(c => `<button type="button" class="${ONB.color === c ? "on" : ""}" style="--c:${c}" data-act="onb-color" data-c="${c}" aria-label="Colore"></button>`).join("")}</div></div>
        ${pinFields}
        <button class="btn primary block">Unisciti</button>
        <button type="button" class="btn block" style="margin-top:10px" data-act="onb-back">Indietro</button>
      </form>`;
  }
  $("#root").innerHTML = `
    <div class="onb">
      <canvas id="onb-fw"></canvas>
      <div class="logo-tile">${LOGO(76)}</div>
      <div class="eyebrow" style="margin-top:22px">Capodanno ${year}</div>
      <div class="mark" style="margin-top:8px">31<em>.</em>12</div>
      <div class="tag">Decidiamo, prenotiamo, dividiamo le spese e festeggiamo. Tutto in un posto, per tutto il gruppo.</div>
      ${!CLOUD ? `<div class="banner"><b>Modalità prova.</b> I dati restano su questo telefono. Codice invito: <b class="num">DEMO</b></div>` : ""}
      <div class="glass panel">${body}<div class="err" id="onb-err">${esc(ONB.err)}</div></div>
    </div>`;
  onbStop && onbStop();
  onbStop = fireworks($("#onb-fw"));
}

async function onbCheckCode(code, silent = false) {
  ONB.err = "";
  try {
    const p = await api.preview(code);
    if (!p) { if (!silent) ONB.err = "Codice invito non valido. Controlla il messaggio dell'organizzatore."; ONB.step = "code"; }
    else {
      ONB.code = code.trim().toUpperCase(); ONB.preview = p; storage.set(CODE_KEY, ONB.code);
      const known = knownMember();
      if (known && p.members.some(x => x.id === known)) { ONB.who = known; ONB.step = "me"; } else ONB.step = "who";
    }
  } catch (e) { ONB.err = e.message; }
  renderOnboarding();
}

// Tiene nell'indirizzo codice e persona: così l'icona sulla Home riapre direttamente il tuo account.
function rememberMe() {
  if (!ME) return;
  storage.set(LAST_KEY, ME);
  const code = trip().invite_code || ONB.code || storage.get(CODE_KEY);
  const want = `?c=${encodeURIComponent(code || "")}&u=${ME}`;
  if (code && location.search !== want) history.replaceState(null, "", location.pathname + want);
}

async function enterApp(memberId) {
  ME = memberId;
  storage.set(LAST_KEY, ME);
  onbStop && onbStop();
  ONB.preview = null; ONB.step = "code";
  window.scrollTo(0, 0);
  await reload();
  api.subscribe(scheduleReload);
  window.startLobby?.();
  setTimeout(() => { if (!maybeWizard() && isIOS && !isStandalone()) sheetInstall(); }, 500);
}

// ───────────────────────── Sheet e toast ─────────────────────────

function openSheet(html) {
  const el = $("#sheet");
  el.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div><div class="sheet-panel" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  el.classList.add("open");
  document.body.style.overflow = "hidden";
  sheetSwipe(el.querySelector(".sheet-panel"), el.querySelector(".sheet-backdrop"));
}
// Come su iPhone: trascinando il pannello verso il basso (dall'inizio del contenuto) si chiude.
function sheetSwipe(panel, backdrop) {
  let y0 = null, dy = 0, t0 = 0;
  panel.addEventListener("touchstart", e => {
    if (panel.scrollTop > 2 || e.target.closest("input,textarea,select,[data-noswipe]")) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); panel.style.transition = "none";
  }, { passive: true });
  panel.addEventListener("touchmove", e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (!dy) return;
    panel.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0.2, 1 - dy / 400));
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, Date.now() - t0);
    panel.style.transition = "transform .25s cubic-bezier(.2,.9,.25,1)";
    if (dy > 110 || (dy > 30 && v > 0.55)) { panel.style.transform = "translateY(105%)"; backdrop.style.opacity = "0"; setTimeout(closeSheet, 200); }
    else { panel.style.transform = ""; backdrop.style.opacity = ""; }
    y0 = null;
  };
  panel.addEventListener("touchend", end);
  panel.addEventListener("touchcancel", end);
}
function closeSheet() {
  const el = $("#sheet");
  el.classList.remove("open"); el.innerHTML = "";
  document.body.style.overflow = "";
}
let toastTimer = null;
function toast(msg, icon = "") {
  const el = $("#toast");
  el.innerHTML = `${icon ? ico(icon, 16) : ""}<span>${esc(msg)}</span>`;
  el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
// Ritaglia al centro e rimpicciolisce la foto: file leggeri e veloci da caricare.
async function squareImage(file, size) {
  const img = await createImageBitmap(file).catch(async () => {
    const el = new Image(); el.src = URL.createObjectURL(file); await el.decode(); return el;
  });
  const side = Math.min(img.width, img.height);
  const c = document.createElement("canvas"); c.width = c.height = size;
  c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("immagine non valida"))), "image/jpeg", 0.85));
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copiato", "check"); }
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
  "how-to-pay": () => sheetHowToPay(),
  async invite() {
    const code = trip().invite_code;
    const url = `${location.origin}${location.pathname}?c=${encodeURIComponent(code)}`;
    const text = `Organizziamo il Capodanno insieme: entra qui, vota e scegli con noi.\n${url}\nCodice invito: ${code}`;
    if (navigator.share) navigator.share({ title: "Capodanno", text }).catch(() => {});
    else copy(text);
  },
  async "starter-polls"(el) {
    el.disabled = true;
    try {
      for (const t of POLL_TEMPLATES) await createPoll({ question: t.q, description: t.d, multi: t.multi, options: t.opts });
      api.notify("polls_batch");
      toast("Sondaggi creati", "check"); await reload(); go("vota");
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
      ${p.status === "open" ? `<button class="btn block" data-act="remind-poll" data-id="${p.id}">${ico("bell", 17)}Ricorda a chi non ha votato</button>` : ""}
      <button class="btn block" data-act="poll-status" data-id="${p.id}">${ico(p.status === "open" ? "lock" : "vote", 17)}${p.status === "open" ? "Chiudi il sondaggio" : "Riapri"}</button>
      ${isAdmin() && p.status === "open" ? `<div class="tiny faint" style="text-align:center">Chiudendolo, l'opzione più votata risulta decisa. Poi aggiorna i dati del viaggio.</div>` : ""}
      <button class="btn block danger" data-act="delete" data-t="polls" data-id="${p.id}">${ico("trash", 17)}Elimina</button>
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
  "money-seg": el => { UI.moneySeg = el.dataset.v; render(); },
  "share-plan": () => { const t = settlePlanText(settlements()); navigator.share ? navigator.share({ text: t }).catch(() => {}) : copy(t); },
  "money-go": el => { UI.moneySeg = el.dataset.v; go("spese"); },
  "chat-seg": el => { UI.chatSeg = el.dataset.v; UI.lastMsgCount = -1; UI.replyTo = null; render(); },
  "reply-cancel": () => { UI.replyTo = null; renderReplyBar(); },
  "jump": el => {
    const t = $(`.msg[data-mid="${el.dataset.id}"]`);
    if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("flash"); setTimeout(() => t.classList.remove("flash"), 1200); }
  },
  "msg-menu": (el, e) => {
    if (Date.now() - lastSwipe < 500) return;
    const m = S.messages.find(x => x.id === el.dataset.id); if (!m) return;
    openSheet(`<div class="bubble" style="margin-bottom:16px">${linkify(m.content)}</div><div class="stack">
      <button class="btn block" data-act="msg-reply" data-id="${m.id}">${ico("arrow", 17)}Rispondi</button>
      ${m.meta?.voice ? "" : `<button class="btn block" data-act="copy" data-text="${esc(m.content)}">${ico("copy", 17)}Copia</button>`}
      ${m.member_id === ME || isAdmin() ? `<button class="btn block danger" data-act="msg-delete" data-id="${m.id}">${ico("trash", 17)}Elimina</button>` : ""}
      <button class="btn block" data-act="close-sheet">Annulla</button></div>`);
  },
  "msg-reply": el => { closeSheet(); startReply(el.dataset.id); },
  async "msg-delete"(el) {
    if (!confirm("Eliminare il messaggio per tutti?")) return;
    const voice = S.messages.find(x => x.id === el.dataset.id)?.meta?.voice;
    try { await api.remove("messages", { id: el.dataset.id }); if (voice) api.removeVoice(voice.path).catch(() => {}); closeSheet(); await reload(); } catch (e) { toast(e.message); }
  },
  async "clear-private"() {
    if (!confirm("Cancellare per sempre questa conversazione?")) return;
    try { for (const m of msgs("privato")) await api.remove("messages", { id: m.id }); await reload(); toast("Conversazione cancellata"); } catch (e) { toast(e.message); }
  },
  async "create-proposal"(el) {
    const m = S.messages.find(x => x.id === el.dataset.id); const a = m?.meta?.actions?.[el.dataset.i];
    if (!a) return;
    el.disabled = true;
    try {
      if (a.type === "poll") {
        const p = await api.insert("polls", { question: a.question, description: a.description || null, kind: a.multi ? "multi" : "single", allow_add: true, created_by: ME });
        for (const o of a.options || []) await api.insert("poll_options", { poll_id: p.id, label: o.label, details: o.details || null, url: o.url || null, price: o.price ?? null, added_by: ME });
        api.notify("poll", p.id);
        toast("Sondaggio creato", "check");
      } else {
        await api.insert("poll_options", { poll_id: a.poll_id, label: a.label, details: a.details || null, url: a.url || null, price: a.price ?? null, added_by: ME });
        toast("Opzione aggiunta", "check");
      }
      await reload();
    } catch (e) { toast(e.message, "alert"); el.disabled = false; }
  },
  "chat-go": el => { UI.chatSeg = el.dataset.v; go("chat"); },
  "exp-cat": el => { UI.expCat = el.dataset.v; render(); },
  booking: el => sheetBooking(el.dataset.id),
  "edit-booking": el => sheetEditBooking(el.dataset.id),
  mission: el => sheetMission(el.dataset.id),
  "booking-to-expense": el => {
    const b = S.bookings.find(x => x.id === el.dataset.id);
    const cat = ["alloggio", "viaggio", "attivita", "serata", "auto"].includes(b.category) ? b.category : ["ristorante", "cenone"].includes(b.category) ? "cibo" : "altro";
    sheetEditExpense(null, { title: b.title, amount: b.price, payer: b.paid_by, category: cat, booking_id: b.id });
  },
  "booking-to-request": el => {
    const b = S.bookings.find(x => x.id === el.dataset.id);
    sheetNewRequest({ title: b.title, amount: b.price / Math.max(1, going().length), pay_to: b.paid_by });
  },
  async "remove-file"(el) {
    const f = S.files.find(x => x.id === el.dataset.id);
    if (!f || !confirm(`Eliminare ${f.name}?`)) return;
    try { await api.removeFile(f); await reload(); f.booking_id ? sheetBooking(f.booking_id) : sheetExpense(f.expense_id); } catch (e) { toast(e.message); }
  },
  "edit-item": el => sheetEditItem(el.dataset.id),
  "edit-check": el => sheetEditCheck(el.dataset.id),
  async "check-toggle"(el) {
    const c = S.checklist.find(x => x.id === el.dataset.id);
    try { c.done = !c.done; render(); await api.update("checklist", { id: c.id }, { done: c.done }); } catch (e) { toast(e.message); scheduleReload(); }
  },
  async ride(el) {
    try { await api.update("members", { id: ME }, { ride_with: el.dataset.id || null }); await reload(); } catch (e) { toast(e.message); }
  },
  expense: el => sheetExpense(el.dataset.id),
  "edit-expense": el => sheetEditExpense(el.dataset.id),
  person: el => sheetPerson(el.dataset.id),
  "settle-up": el => sheetSettle(el.dataset.from ? { from: el.dataset.from, to: el.dataset.to, amount: el.dataset.amount } : {}),
  "split-mode": el => {
    const f = $("#exp-form");
    f.split_mode.value = el.dataset.v;
    $$("[data-act=split-mode]").forEach(b => b.classList.toggle("on", b === el));
    $$(".split-in", f).forEach(i => { i.value = ""; });
    if (el.dataset.v === "exact" || el.dataset.v === "percent") {
      // Precompila con la divisione uguale: si ritocca solo quello che serve.
      const r = readExpenseForm(f), inc = r.included;
      const eq = computeSplit(r.amount || 0, "equal", {}, inc).owed || {};
      const pct = allocate(10000, Object.fromEntries(inc.map(id => [id, 1])));
      inc.forEach(id => { const i = f["v_" + id]; if (i) i.value = el.dataset.v === "exact" ? (eq[id] ?? "") : (pct[id] ?? ""); });
    }
    updateExpenseForm();
  },
  "multi-pay": el => {
    const f = $("#exp-form");
    const multi = f.pay_mode.value !== "multi";
    f.pay_mode.value = multi ? "multi" : "single";
    $("#pay-single").hidden = multi; $("#pay-multi").hidden = !multi;
    el.textContent = multi ? "Una persona" : "Più persone";
    if (multi) { const amt = num(f.amount.value); const p = f["p_" + f.payer.value]; if (p && amt && !p.value) p.value = amt; }
    updateExpenseForm();
  },
  "new-request": () => sheetNewRequest(),
  async "pay-request"(el) {
    const r = S.payment_requests.find(x => x.id === el.dataset.id);
    const who = el.dataset.m;
    if (who === ME && !confirm(`Confermi di aver pagato ${eur(r.amount)} a ${mname(r.pay_to)}?`)) return;
    try {
      await api.insert("expenses", { title: `Quota: ${r.title}`, amount: Number(r.amount), kind: "payment", category: "altro", payers: { [who]: Number(r.amount) }, owed: { [r.pay_to]: Number(r.amount) }, split_mode: "exact", request_id: r.id, spent_on: today(), created_by: ME });
      closeSheet(); toast("Quota segnata come pagata", "check"); await reload();
    } catch (e) { toast(e.message); }
  },
  "request-menu": el => {
    const r = S.payment_requests.find(x => x.id === el.dataset.id);
    const st = requestStatus(r);
    openSheet(`<h2>${esc(r.title)}</h2>
      ${st.unpaid.length ? `<div class="label">Segna come pagato</div><section class="card">${st.unpaid.map(id => `<div class="li">${avatar(member(id), "sm")}<span class="grow">${esc(mname(id))}</span><button class="btn sm" data-act="pay-request" data-id="${r.id}" data-m="${id}">${ico("check", 15)}Pagato</button></div>`).join("")}</section>` : `<div class="note">${ico("check", 18)}<span>Hanno pagato tutti.</span></div>`}
      <div class="stack" style="margin-top:14px">
        ${st.unpaid.length ? `<button class="btn block" data-act="remind-push" data-id="${r.id}">${ico("bell", 17)}Notifica a chi deve pagare</button>
        <button class="btn block" data-act="remind" data-id="${r.id}">${ico("share", 17)}Promemoria su WhatsApp</button>` : ""}
        <button class="btn block danger" data-act="delete" data-t="payment_requests" data-id="${r.id}">${ico("trash", 17)}Elimina la richiesta</button>
        <button class="btn block" data-act="close-sheet">Chiudi</button></div>`);
  },
  remind(el) {
    const r = S.payment_requests.find(x => x.id === el.dataset.id);
    const st = requestStatus(r);
    const to = member(r.pay_to);
    const text = `Promemoria quota «${r.title}»: ${eur(r.amount)} a testa da versare a ${to?.name}${r.due_date ? ` entro il ${fmtDate(r.due_date, { day: "numeric", month: "long" })}` : ""}.\nMancano: ${st.unpaid.map(mname).join(", ")}.${to?.paypal ? `\nPayPal: ${paypalUrl(to.paypal, r.amount)}` : ""}${to?.iban ? `\nIBAN: ${to.iban}` : ""}\nApri l'app: ${location.origin}${location.pathname}`;
    if (navigator.share) navigator.share({ text }).catch(() => {}); else copy(text);
  },
  member: el => sheetMember(el.dataset.id),
  "edit-profile": el => sheetProfile(el.dataset.id || ME),
  "add-person": () => sheetProfile("new"),
  "edit-private": () => sheetPrivate(),
  "edit-trip": () => sheetTrip(),
  "guest-list": () => sheetGuestList(),
  async "clear-chat"(el) {
    const ch = el.dataset.ch;
    if (!confirm(`Cancellare tutta la chat ${ch === "gruppo" ? "di gruppo" : "di " + AI()} per tutti?`)) return;
    try { for (const m of msgs(ch)) await api.remove("messages", { id: m.id }); await reload(); toast("Chat svuotata"); } catch (e) { toast(e.message); }
  },
  feedback: () => openSheet(`
    <h2>Suggerisci una funzione</h2>
    <p class="small muted" style="margin:-6px 0 16px">Un'idea, un miglioramento, qualcosa che non va: arriva all'organizzatore${trip().feedback_whatsapp ? " su WhatsApp" : ""}.</p>
    <form data-form="feedback">
      <div class="field"><label>Di che si tratta</label><select name="kind"><option value="idea">Nuova funzione</option><option value="migliora">Miglioramento</option><option value="problema">Qualcosa non funziona</option></select></div>
      <div class="field"><label>Racconta</label><textarea name="text" required maxlength="1500" placeholder="Es. vorrei poter vedere le foto della serata tutte insieme"></textarea></div>
      <div class="actions"><button type="button" class="btn" data-act="close-sheet">Annulla</button><button class="btn primary">${trip().feedback_whatsapp ? `${ico("chat", 17)}Invia su WhatsApp` : "Invia"}</button></div>
    </form>`),
  "feedback-list": () => {
    const KIND = { idea: "Nuova funzione", migliora: "Miglioramento", problema: "Problema" };
    const list = S.feedback.slice().sort(byCreated).reverse();
    openSheet(`<h2>Suggerimenti</h2>${list.length ? list.map(f => `<section class="card" style="${f.status === "nuovo" ? "" : "opacity:.6"}">
        <div class="row" style="gap:10px;margin-bottom:8px">${avatar(member(f.member_id), "sm")}<span class="grow small"><b>${esc(mname(f.member_id))}</b> · ${esc(KIND[f.kind] || f.kind)}</span><span class="tiny faint">${esc(fmtDate(f.created_at))}</span></div>
        <div class="small">${esc(f.text).replace(/\n/g, "<br>")}</div>
        <div class="row" style="gap:8px;margin-top:12px">${f.status === "nuovo" ? `<button class="btn sm" data-act="feedback-done" data-id="${f.id}">${ico("check", 15)}Fatto</button>` : `<span class="small pos">Fatto</span>`}
          <button class="btn sm danger" data-act="delete" data-t="feedback" data-id="${f.id}">${ico("trash", 15)}</button></div></section>`).join("")
      : `<div class="empty small">Ancora nessun suggerimento.</div>`}<div class="actions"><button class="btn" data-act="close-sheet">Chiudi</button></div>`);
  },
  async "feedback-done"(el) { try { await api.update("feedback", { id: el.dataset.id }, { status: "fatto" }); await reload(); ACTIONS["feedback-list"](); } catch (e) { toast(e.message); } },
  "push-on": () => enablePush(),
  async "notif-pref"(el) {
    const notif = { ...(me()?.notif || {}), [el.dataset.k]: el.checked ? "on" : "off" };
    try { await api.update("members", { id: ME }, { notif }); me().notif = notif; toast(el.checked ? "Attivate" : "Silenziate", "bell"); } catch (e) { toast(e.message, "alert"); el.checked = !el.checked; }
  },
  "push-later": () => { storage.set(PUSH_KEY + "-later", today()); render(); },
  "push-toggle": () => {
    const st = pushState();
    if (st !== "on") return enablePush();
    const prefs = me()?.notif || {};
    const opt = (k, t, d) => `<label class="li tap"><div class="grow"><div class="t">${t}</div><div class="small muted">${d}</div></div><span class="switch"><input type="checkbox" data-act="notif-pref" data-k="${k}" ${prefs[k] === "off" ? "" : "checked"}><span></span></span></label>`;
    openSheet(`<h2>Notifiche</h2>
      <div class="label">Sempre attive</div>
      <div class="small muted" style="margin:-4px 0 14px">Sondaggi da votare, quote da pagare, prenotazioni confermate e il promemoria della sera (solo se c'è qualcosa in sospeso). Sono quelle che fanno girare il viaggio: non si spengono.</div>
      <div class="label">A scelta tua</div>
      ${opt("chat", "Messaggi del gruppo", "Ogni messaggio nella chat")}
      ${opt("giochi", "Sfide ai giochi", "Inviti a scacchi, scopa, tiro alla fune")}
      <div class="stack" style="margin-top:16px"><button class="btn block" data-act="push-test">${ico("bell", 17)}Manda una notifica di prova</button>
      <button class="btn block danger" data-act="push-off">Disattiva su questo telefono</button><button class="btn block" data-act="close-sheet">Chiudi</button></div>`);
  },
  async "push-test"() { try { const r = await api.notifyTest(); toast(r?.sent ? "Inviata: arriva tra un attimo" : "Nessun telefono iscritto", "bell"); } catch (e) { toast(e.message, "alert"); } },
  "push-off": () => { closeSheet(); disablePush(); },
  "remind-poll": el => { api.notify("remind_poll", el.dataset.id); closeSheet(); toast("Promemoria inviato a chi non ha votato", "bell"); },
  "remind-push": el => { api.notify("remind_request", el.dataset.id); closeSheet(); toast("Notifica inviata a chi deve pagare", "bell"); },
  "avatar-remove": el => {
    const f = el.closest("form"); f.avatar_url.value = "";
    $("#av-preview").innerHTML = avatar({ name: f.elements.name.value || "?", color: f.elements.color.value }, "lg"); el.hidden = true;
  },
  "pick-color": el => { $$(".swatches button").forEach(b => b.classList.toggle("on", b === el)); $('input[name="color"]').value = el.dataset.c; },
  async "toggle-admin"(el) {
    const x = member(el.dataset.id);
    try { await api.update("members", { id: x.id }, { is_admin: !x.is_admin }); closeSheet(); await reload(); } catch (e) { toast(e.message); }
  },
  async "reset-pin"(el) {
    const pin = prompt(`Nuovo PIN di 4 cifre per ${mname(el.dataset.id)}:`);
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) return toast("Il PIN deve avere 4 cifre");
    try { await api.resetPin(el.dataset.id, pin); toast("PIN reimpostato: comunicalo in privato", "check"); } catch (e) { toast(e.message); }
  },
  async "change-pin"() {
    const pin = prompt("Nuovo PIN (4 cifre):");
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) return toast("Il PIN deve avere 4 cifre");
    try { await api.resetPin(ME, pin); toast("PIN cambiato", "check"); } catch (e) { toast(e.message); }
  },
  async "remove-member"(el) {
    if (!confirm(`Rimuovere ${mname(el.dataset.id)} dal gruppo? Spariscono anche i suoi voti e punteggi.`)) return;
    try { await api.remove("members", { id: el.dataset.id }); closeSheet(); await reload(); } catch (e) { toast(e.message); }
  },
  async logout() {
    if (!confirm("Uscire da questo telefono? Potrai rientrare con nome e PIN.")) return;
    await api.leave(); ME = null; storage.del(CACHE_KEY); storage.del(LAST_KEY);
    location.replace(location.pathname + "?c=" + encodeURIComponent(trip().invite_code || ""));
  },
  "wiz-go": el => { const n = Number(el.dataset.step); n > WIZ_STEPS ? finishWizard() : sheetWizard(n); },
  "wiz-later": () => { storage.set("capodanno-wizard-later", today()); closeSheet(); },
  "onb-pick": el => { ONB.who = el.dataset.id; ONB.step = "pin"; ONB.err = ""; renderOnboarding(); },
  "onb-switch": () => { ONB.step = "who"; ONB.err = ""; renderOnboarding(); },
  "onb-new": () => { ONB.step = "new"; ONB.err = ""; renderOnboarding(); },
  "onb-back": () => { ONB.step = !ONB.preview ? "code" : ONB.preview.members.some(x => x.id === knownMember()) && ONB.step !== "pin" ? "me" : "who"; ONB.err = ""; renderOnboarding(); },
  "onb-color": el => { ONB.color = el.dataset.c; $$(".swatches button").forEach(b => b.classList.toggle("on", b === el)); },
};

document.addEventListener("click", e => {
  if (e.target.closest("[data-stop]")) return;
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener("change", async e => {
  if (e.target.matches("[data-chip]")) e.target.closest(".chip").classList.toggle("on", e.target.checked);
  if (e.target.matches("[data-radio]")) $$(`input[name="${e.target.name}"]`).forEach(r => r.closest(".chip").classList.toggle("on", r.checked));
  if (e.target.closest("#exp-form")) updateExpenseForm();
  if (e.target.matches("[data-avatar]")) {
    const file = e.target.files[0]; const f = e.target.closest("form");
    if (!file) return;
    try {
      toast("Preparo la foto…", "upload");
      const url = await api.uploadAvatar(await squareImage(file, 320));
      f.avatar_url.value = url;
      $("#av-preview").innerHTML = avatar({ name: f.elements.name.value, color: f.elements.color.value, avatar_url: url }, "lg");
      f.querySelector("[data-act=avatar-remove]").hidden = false;
      toast("Foto pronta: premi Salva", "check");
    } catch (err) { toast("Foto non caricata: " + err.message, "alert"); }
    return;
  }
  if (e.target.matches("[data-upload]")) {
    const file = e.target.files[0]; const { upload: kind, id } = e.target.dataset;
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast("File troppo grande (massimo 20 MB)");
    toast("Carico il file…", "upload");
    try {
      await api.uploadFile(kind === "booking" ? { booking_id: id } : { expense_id: id }, file);
      await reload(); toast("File caricato", "check");
      kind === "booking" ? sheetBooking(id) : sheetExpense(id);
    } catch (err) { toast(err.message); }
  }
});
document.addEventListener("input", e => { if (e.target.closest("#exp-form")) updateExpenseForm(); });

// ───────────────────────── Moduli (submit) ─────────────────────────

const val = (fd, k) => { const v = fd.get(k); return v === null ? null : String(v).trim() || null; };

const FORMS = {
  async "home-ask"(fd, f) { const q = val(fd, "q"); f.reset(); if (q) ask(q); return "keep"; },
  async feedback(fd) {
    const text = val(fd, "text"), kind = val(fd, "kind");
    const wa = trip().feedback_whatsapp;
    const label = { idea: "Nuova funzione", migliora: "Miglioramento", problema: "Problema" }[kind];
    // Prima apriamo WhatsApp (iPhone lo permette solo subito dopo il tocco), poi salviamo nell'app.
    if (wa) location.href = `${waUrl(wa)}?text=${encodeURIComponent(`${label} per l'app di Capodanno, da ${me().name}:\n\n${text}`)}`;
    const row = await api.insert("feedback", { member_id: ME, kind, text });
    api.notify("feedback", row.id);
    toast(wa ? "Grazie! Premi Invia su WhatsApp" : "Grazie! Suggerimento inviato", "check");
  },
  async wizard(fd, f) {
    const step = Number(f.dataset.step);
    if (step === 1) await api.update("members", { id: ME }, { name: val(fd, "name"), phone: val(fd, "phone"), email: val(fd, "email"), avatar_url: val(fd, "avatar_url") });
    if (step === 2) await api.update("members", { id: ME }, { diet: [...fd.getAll("diet"), ...splitList(fd.get("diet_other"))].join(", ") || null, allergies: val(fd, "allergies") });
    if (step === 3) await api.update("members", { id: ME }, {
      departure_city: val(fd, "departure_city"), car_seats: parseInt(fd.get("car_seats"), 10) || 0, preferences: fd.getAll("interests").join(", ") || null,
      notes: val(fd, "notes"), emergency_name: val(fd, "emergency_name"), emergency_phone: val(fd, "emergency_phone"),
    });
    if (step === 4 && (val(fd, "doc_number") || val(fd, "legal_name"))) {
      const keys = ["legal_name", "birth_date", "birth_place", "doc_type", "doc_number", "doc_expiry", "fiscal_code"];
      const prev = S.member_private.find(r => r.member_id === ME) || {};
      await api.upsert("member_private", { ...prev, member_id: ME, ...Object.fromEntries(keys.map(k => [k, val(fd, k)])), updated_at: new Date().toISOString() });
    }
    if (step === 5) await api.update("members", { id: ME }, { paypal: val(fd, "paypal") ? paypalUser(val(fd, "paypal")) : null, iban: val(fd, "iban")?.toUpperCase() || null, satispay: val(fd, "satispay") });
    await reload();
    if (step >= WIZ_STEPS) await finishWizard(); else sheetWizard(step + 1);
    return "keep";
  },
  async "onb-code"(fd) { await onbCheckCode(val(fd, "code") || ""); },
  async "onb-rejoin"(fd) {
    try { await enterApp(await api.rejoin(ONB.code, ONB.who, val(fd, "pin"))); }
    catch (e) { ONB.err = e.message; renderOnboarding(); }
  },
  async "onb-claim"(fd) {
    if (val(fd, "pin") !== val(fd, "pin2")) { ONB.err = "I due PIN non coincidono"; return renderOnboarding(); }
    try { await enterApp(await api.claim(ONB.code, ONB.who, val(fd, "pin"))); }
    catch (e) { ONB.err = e.message; renderOnboarding(); }
  },
  async "onb-join"(fd) {
    if (val(fd, "pin") !== val(fd, "pin2")) { ONB.err = "I due PIN non coincidono"; return renderOnboarding(); }
    try { await enterApp(await api.join(ONB.code, val(fd, "name"), ONB.color, val(fd, "pin"))); }
    catch (e) { ONB.err = e.message; renderOnboarding(); }
  },
  async poll(fd) {
    const options = fd.getAll("opt").map(s => String(s).trim()).filter(Boolean);
    const closes = val(fd, "closes_at");
    const p = await createPoll({ question: val(fd, "question"), description: val(fd, "description"), multi: fd.get("multi") === "on", allowAdd: fd.get("allow_add") === "on", closesAt: closes ? new Date(closes + "T23:59").toISOString() : null, options });
    api.notify("poll", p.id);
    toast("Sondaggio creato", "check");
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
    const before = S.bookings.find(b => b.id === f.dataset.id);
    const saved = f.dataset.id ? (await api.update("bookings", { id: f.dataset.id }, row), { id: f.dataset.id }) : await api.insert("bookings", { ...row, created_by: ME });
    // Avvisa il gruppo quando una prenotazione diventa confermata.
    if (["prenotato", "pagato"].includes(row.status) && !["prenotato", "pagato"].includes(before?.status)) api.notify("booking", saved.id);
    toast("Prenotazione salvata", "check");
  },
  async item(fd, f) {
    const row = { title: val(fd, "title"), day: val(fd, "day"), time: val(fd, "time"), place: val(fd, "place"), notes: val(fd, "notes") };
    if (f.dataset.id) await api.update("itinerary", { id: f.dataset.id }, row);
    else await api.insert("itinerary", { ...row, created_by: ME });
  },
  async "check-quick"(fd, f) { await api.insert("checklist", { text: val(fd, "text"), created_by: ME }); f.reset(); },
  async check(fd, f) { await api.update("checklist", { id: f.dataset.id }, { text: val(fd, "text"), assignee: val(fd, "assignee") }); },
  async expense(fd, f) {
    const r = readExpenseForm(f);
    if (!r.amount || r.amount <= 0) throw new Error("Inserisci un importo valido");
    if (r.payError) throw new Error(r.payError);
    if (r.splitError) throw new Error(r.splitError);
    const row = {
      title: val(fd, "title"), amount: cents(r.amount) / 100, spent_on: val(fd, "spent_on") || today(), category: val(fd, "category") || "altro", note: val(fd, "note"),
      kind: "expense", payers: r.payers, owed: r.owed, split_mode: r.mode, split_input: r.splitInput,
    };
    if (f.dataset.id) await api.update("expenses", { id: f.dataset.id }, row);
    else await api.insert("expenses", { ...row, booking_id: f.dataset.booking || null, created_by: ME });
    toast("Spesa salvata", "check");
  },
  async settle(fd) {
    const amount = num(fd.get("amount")), from = val(fd, "from"), to = val(fd, "to");
    if (!amount || amount <= 0) throw new Error("Inserisci un importo valido");
    if (from === to) throw new Error("Scegli due persone diverse");
    await api.insert("expenses", { title: `${mname(from)} ha pagato ${mname(to)}`, amount: cents(amount) / 100, kind: "payment", category: "altro", payers: { [from]: cents(amount) / 100 }, owed: { [to]: cents(amount) / 100 }, split_mode: "exact", note: val(fd, "note"), spent_on: today(), created_by: ME });
    toast("Pagamento registrato", "check");
  },
  async request(fd) {
    const amount = num(fd.get("amount"));
    const debtors = fd.getAll("debtors");
    if (!amount || amount <= 0) throw new Error("Inserisci un importo valido");
    if (!debtors.length) throw new Error("Seleziona chi deve pagare");
    const r = await api.insert("payment_requests", { title: val(fd, "title"), amount, due_date: val(fd, "due_date"), pay_to: val(fd, "pay_to"), debtors, note: val(fd, "note"), created_by: ME });
    api.notify("request", r.id);
    UI.moneySeg = "requests";
    toast("Quota richiesta", "check");
  },
  async profile(fd, f) {
    const id = f.dataset.id || ME;
    const row = {
      name: val(fd, "name"), color: val(fd, "color"), phone: val(fd, "phone"), email: val(fd, "email"), departure_city: val(fd, "departure_city"),
      car_seats: parseInt(fd.get("car_seats"), 10) || 0, diet: val(fd, "diet"), allergies: val(fd, "allergies"), preferences: val(fd, "preferences"),
      emergency_name: val(fd, "emergency_name"), emergency_phone: val(fd, "emergency_phone"),
      paypal: val(fd, "paypal") ? paypalUser(val(fd, "paypal")) : null, iban: val(fd, "iban")?.toUpperCase() || null, satispay: val(fd, "satispay"),
      notes: val(fd, "notes"), avatar_url: val(fd, "avatar_url"),
    };
    if (id === "new") {
      if (S.members.some(m => m.name.toLowerCase() === row.name.toLowerCase())) throw new Error("C'è già una persona con questo nome");
      await api.insert("members", row);
      toast(`${row.name} aggiunto al gruppo`, "check");
    } else {
      await api.update("members", { id }, row);
      toast("Profilo salvato", "check");
    }
  },
  async private(fd) {
    const keys = ["legal_name", "birth_date", "birth_place", "nationality", "fiscal_code", "doc_type", "doc_number", "doc_issued_by", "doc_expiry", "address"];
    await api.upsert("member_private", { member_id: ME, ...Object.fromEntries(keys.map(k => [k, val(fd, k)])), updated_at: new Date().toISOString() });
    toast("Documenti salvati", "lock");
  },
  async trip(fd) {
    const patch = { name: val(fd, "name"), destination: val(fd, "destination"), start_date: val(fd, "start_date"), end_date: val(fd, "end_date"), notes: val(fd, "notes"), group_notes: val(fd, "group_notes"), feedback_whatsapp: val(fd, "feedback_whatsapp"), ai_name: val(fd, "ai_name") || "Zampone" };
    if (CLOUD) patch.invite_code = (val(fd, "invite_code") || "").toUpperCase();
    await api.update("trip", { id: 1 }, patch);
    toast("Viaggio aggiornato", "check");
  },
};

document.addEventListener("submit", async e => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector("button:not([type=button])");
  if (btn) btn.disabled = true;
  try {
    const res = await FORMS[f.dataset.form](new FormData(f), f);
    if (res === "keep") return;
    if (f.closest(".sheet")) { closeSheet(); await reload(); }
    else if (ME && !f.dataset.form.startsWith("onb")) await reload();
  } catch (err) {
    toast(err.message || "Errore", "alert");
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
});

// Composer della chat: scrive al gruppo o all'assistente, a seconda della scheda.
const composer = $("#composer-input");
composer.addEventListener("input", () => { composer.style.height = "auto"; composer.style.height = Math.min(140, composer.scrollHeight) + "px"; });
composer.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !isIOS) { e.preventDefault(); $("#composer-form").requestSubmit(); } });
$("#composer-form").addEventListener("submit", e => {
  e.preventDefault();
  e.stopPropagation();
  const text = composer.value;
  composer.value = ""; composer.style.height = "auto"; syncComposerButtons();
  if (UI.chatSeg === "gruppo") sendGroup(text); else ask(text, UI.chatSeg);
});
$("#composer-send").innerHTML = ico("send", 20);
$("#fab").innerHTML = ico("spark", 26);

// ───────────────────────── Avvio ─────────────────────────

// ───────────────────────── Aggiornamenti automatici ─────────────────────────
// Ogni volta che l'app torna in primo piano (e ogni 5 minuti) controlla version.json:
// se è uscita una versione nuova si ricarica da sola, ma mai nel mezzo di una partita, un vocale o un modulo.
let APP_V = null, updatePending = false;
async function checkUpdate() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const v = (await r.json()).v;
    if (APP_V === null) { APP_V = v; return; }
    if (v !== APP_V) { updatePending = true; navigator.serviceWorker?.getRegistration().then(reg => reg?.update()).catch(() => {}); applyUpdate(); }
  } catch { /* offline */ }
}
function applyUpdate() {
  if (!updatePending) return;
  const busy = !$("#game").hidden || (typeof V !== "undefined" && V.mode) || UI.waiting || $("#sheet").classList.contains("open")
    || (document.activeElement && document.activeElement.matches("input,textarea") && document.activeElement.value);
  if (busy) return setTimeout(applyUpdate, 4000);
  location.reload();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
setInterval(checkUpdate, 5 * 60000);

async function boot() {
  checkUpdate();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    // Tocco su una notifica con l'app già aperta: il service worker ci dice dove andare.
    navigator.serviceWorker.addEventListener("message", e => { if (e.data?.url && applyDeepLink(new URL(e.data.url).searchParams)) { closeSheet(); render(); window.scrollTo(0, 0); } });
  }
  applyDeepLink(new URLSearchParams(location.search));
  const cached = loadCache();
  if (cached) render();
  try {
    await api.init();
    const id = await api.whoami();
    if (!id) { ME = null; return showOnboarding(); }
    ME = id;
    await reload();
    api.subscribe(scheduleReload);
    syncPush();
    window.startLobby?.();
    setTimeout(maybeWizard, 800);
  } catch (e) {
    console.error(e);
    if (cached) { OFFLINE = true; render(); }
    else $("#root").innerHTML = `<div class="onb"><div class="logo-tile">${LOGO(76)}</div><div class="err" style="margin-top:20px">Non riesco a collegarmi: ${esc(e.message)}</div><button class="btn primary" style="margin-top:16px" onclick="location.reload()">Riprova</button></div>`;
  }
}

document.addEventListener("visibilitychange", () => { if (!document.hidden && ME) scheduleReload(); });
addEventListener("online", () => ME && scheduleReload());
addEventListener("offline", () => { OFFLINE = true; ME && render(); });

// Avvio dopo che games.js ha registrato le sue funzioni.
addEventListener("DOMContentLoaded", boot);
