// Capodanno - assistente AI del gruppo (Supabase Edge Function).
// Riceve una domanda da un membro, la salva in chat, chiede a Claude (con ricerca web
// e strumenti per scrivere nel database del gruppo) e salva la risposta in chat.
// Segreto richiesto: ANTHROPIC_API_KEY (Edge Functions → Secrets).

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 14;
// Le Edge Functions gratuite durano al massimo 150 secondi: teniamo un margine per salvare la risposta.
const TIME_BUDGET_MS = 135_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// Lavoro in background: la risposta HTTP parte subito, la funzione resta viva finché il lavoro non finisce.
// deno-lint-ignore no-explicit-any
const background = (p: Promise<unknown>) => { const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(p); else p.catch(console.error); };

Deno.serve(async (req) => {
  let privateMode = false;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non supportato" }, 405);

  try {
    // Il punto della situazione del mattino, lanciato dal cron del database.
    if (req.headers.get("x-cron")) {
      const { data: secret } = await db.from("app_secrets").select("value").eq("key", "cron").maybeSingle();
      if (!secret || req.headers.get("x-cron") !== secret.value) return json({ error: "Non autorizzato" }, 401);
      return json({ ok: await morningBrief() });
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth?.user) return json({ error: "Non autenticato" }, 401);

    const { data: device } = await db.from("devices").select("member_id").eq("user_id", auth.user.id).maybeSingle();
    if (!device) return json({ error: "Non fai parte del gruppo" }, 403);

    const { message, mode } = await req.json();
    const text = String(message ?? "").trim().slice(0, 4000);
    if (!text) return json({ error: "Messaggio vuoto" }, 400);

    // Spazio «Ascolto»: conversazione privata, senza strumenti e senza i dati del gruppo.
    if (mode === "ascolto") {
      privateMode = true;
      const owner = device.member_id;
      await db.from("messages").insert({ member_id: owner, owner, role: "user", channel: "privato", content: text });
      // Si risponde subito al telefono; il lavoro continua sul server e la risposta arriva in chat da sola,
      // anche se nel frattempo il telefono si blocca o perde la connessione.
      background((async () => {
        try {
          const reply = await listen(owner, text);
          await db.from("messages").insert({ member_id: null, owner, role: "assistant", channel: "privato", content: reply });
        } catch (err) {
          console.error(err);
          await db.from("messages").insert({ member_id: null, owner, role: "assistant", channel: "privato", content: "Scusa, mi sono perso un attimo. Riscrivimi tra poco: sono qui.", meta: { error: true } });
        }
      })());
      return json({ accepted: true }, 202);
    }

    await db.from("messages").insert({ member_id: device.member_id, role: "user", channel: "assistente", content: text });

    background((async () => {
      try {
        const ctx = await loadContext(device.member_id);
        const reply = await runAssistant(ctx, text);
        await db.from("messages").insert({
          member_id: null, role: "assistant", channel: "assistente", content: reply,
          meta: ctx.proposals.length ? { actions: ctx.proposals } : null,
        });
      } catch (err) {
        console.error(err);
        await db.from("messages").insert({ member_id: null, role: "assistant", channel: "assistente", content: explainError(err), meta: { error: true } });
      }
    })());
    return json({ accepted: true }, 202);
  } catch (err) {
    console.error(err);
    const msg = explainError(err);
    // L'errore finisce nella chat dell'assistente solo se non era una conversazione privata.
    if (!privateMode) await db.from("messages").insert({ member_id: null, role: "assistant", channel: "assistente", content: msg, meta: { error: true } });
    return json({ error: msg }, 500);
  }
});

// Messaggio d'errore che dice cosa sistemare, invece di un generico «errore».
function explainError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const detail = String((err as { error?: { error?: { message?: string } } }).error?.error?.message ?? err.message ?? "");
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return "Manca la chiave di Claude: aggiungi ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets.";
    if (err.status === 401) return "La chiave di Claude (ANTHROPIC_API_KEY) non è valida: ricopiala da console.anthropic.com → API Keys.";
    if (err.status === 403) return "La chiave di Claude non ha i permessi per questa richiesta. Controlla l'account su console.anthropic.com.";
    if (/credit balance|billing|purchase credits/i.test(detail)) return "Il credito Claude è finito o non è mai stato caricato: ricaricalo su console.anthropic.com → Billing.";
    if (err.status === 429) return "Troppe richieste a Claude in poco tempo. Riprova tra un minuto.";
    if (err.status === 529 || (err.status ?? 0) >= 500) return "Claude è sovraccarico in questo momento. Riprova tra poco.";
    return `Errore dal servizio AI (${err.status}): ${detail.slice(0, 200)}`;
  }
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return "Manca la chiave di Claude: aggiungi ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets.";
  return `Qualcosa è andato storto: ${String((err as Error)?.message ?? err).slice(0, 200)}`;
}

// ───────────────────────── Contesto del gruppo ─────────────────────────

interface Ctx {
  aiName: string;
  proposals: Row[];
  me: Row;
  members: Row[];
  byName: Map<string, Row>;
  snapshot: string;
  history: { role: "user" | "assistant"; content: string }[];
}

async function loadContext(memberId: string): Promise<Ctx> {
  const [trip, members, priv, polls, options, votes, bookings, expenses, requests, itinerary, checklist, msgs, scores, groupChat] = await Promise.all([
    db.from("trip").select("name,destination,start_date,end_date,notes,group_notes,ai_name").eq("id", 1).single(),
    db.from("members").select("id,name,rsvp,phone,diet,allergies,preferences,notes,car_seats,departure_city,ride_with,paypal,iban,satispay,is_admin").order("created_at"),
    db.from("member_private").select("*"),
    db.from("polls").select("*").order("created_at"),
    db.from("poll_options").select("*").order("created_at"),
    db.from("votes").select("option_id,member_id"),
    db.from("bookings").select("*").order("start_at", { nullsFirst: false }),
    db.from("expenses").select("*").order("spent_on"),
    db.from("payment_requests").select("*").order("created_at"),
    db.from("itinerary").select("*").order("day").order("time"),
    db.from("checklist").select("*").order("created_at"),
    db.from("messages").select("member_id,role,content,created_at,meta").eq("channel", "assistente").order("created_at", { ascending: false }).limit(21),
    db.from("scores").select("member_id,game,score,day").order("created_at", { ascending: false }).limit(200),
    db.from("messages").select("member_id,content,created_at").eq("channel", "gruppo").order("created_at", { ascending: false }).limit(40),
  ]);

  const m: Row[] = members.data ?? [];
  const me = m.find((x) => x.id === memberId)!;
  const name = (id: string | null) => m.find((x) => x.id === id)?.name ?? "—";

  // Dati personali: l'organizzatore vede quelli di tutti, gli altri solo i propri.
  const privRows: Row[] = (priv.data ?? []).filter((p) => me.is_admin || p.member_id === memberId);

  const pollText = (polls.data ?? []).map((p) => {
    const opts = (options.data ?? []).filter((o) => o.poll_id === p.id).map((o) => {
      const voters = (votes.data ?? []).filter((v) => v.option_id === o.id).map((v) => name(v.member_id));
      return `   - [option_id ${o.id}] ${o.label}${o.price ? ` (~${o.price}€)` : ""}${o.details ? ` - ${o.details}` : ""}: ${voters.length} voti${voters.length ? ` (${voters.join(", ")})` : ""}`;
    });
    return `- [poll_id ${p.id}] «${p.question}» ${p.status === "open" ? "APERTO" : "CHIUSO"}${p.kind === "multi" ? ", scelta multipla" : ""}\n${opts.join("\n") || "   (nessuna opzione)"}`;
  }).join("\n");

  const balances = new Map<string, number>(m.map((x) => [x.id, 0]));
  for (const e of expenses.data ?? []) {
    for (const [id, v] of Object.entries(e.payers ?? {})) balances.set(id, (balances.get(id) ?? 0) + Number(v));
    for (const [id, v] of Object.entries(e.owed ?? {})) balances.set(id, (balances.get(id) ?? 0) - Number(v));
  }
  const fmtMap = (o: Row) => Object.entries(o ?? {}).map(([id, v]) => `${name(id)} ${Number(v).toFixed(2)}€`).join(", ");
  const paidIds = (r: Row) => new Set((expenses.data ?? []).filter((e) => e.request_id === r.id).flatMap((e) => Object.keys(e.payers ?? {})));

  const snapshot = [
    `VIAGGIO: ${JSON.stringify(trip.data)}`,
    `MEMBRI (${m.length}):\n${m.map((x) => `- ${x.name}${x.is_admin ? " [organizzatore]" : ""}` +
      `${x.departure_city ? ` · parte da ${x.departure_city}` : ""}${x.car_seats ? ` · auto con ${x.car_seats} posti liberi` : ""}` +
      `${x.diet ? ` · dieta: ${x.diet}` : ""}${x.allergies ? ` · allergie: ${x.allergies}` : ""}${x.preferences ? ` · preferenze: ${x.preferences}` : ""}${x.notes ? ` · note: ${x.notes}` : ""}` +
      `${x.ride_with ? ` · in auto con ${name(x.ride_with)}` : ""}${x.phone ? ` · tel ${x.phone}` : ""}` +
      `${x.paypal ? ` · paypal.me/${x.paypal}` : ""}${x.iban ? ` · IBAN ${x.iban}` : ""}${x.satispay ? ` · Satispay ${x.satispay}` : ""}`).join("\n")}`,
    privRows.length
      ? `DATI PERSONALI RISERVATI (usali solo per compilare prenotazioni/registrazioni per chi te lo chiede e ne ha diritto):\n${privRows.map((p) => `- ${name(p.member_id)}: ${JSON.stringify({ ...p, member_id: undefined, updated_at: undefined })}`).join("\n")}`
      : "DATI PERSONALI RISERVATI: non disponibili per chi sta chiedendo.",
    `SONDAGGI:\n${pollText || "(nessuno)"}`,
    `PRENOTAZIONI:\n${(bookings.data ?? []).map((b) => `- [booking_id ${b.id}] ${JSON.stringify({ ...b, id: undefined, created_at: undefined, created_by: undefined, paid_by: b.paid_by ? name(b.paid_by) : null })}`).join("\n") || "(nessuna)"}`,
    `PROGRAMMA:\n${(itinerary.data ?? []).map((i) => `- ${i.day ?? "?"} ${i.time ?? ""} ${i.title}${i.place ? ` @ ${i.place}` : ""}${i.notes ? ` (${i.notes})` : ""}`).join("\n") || "(vuoto)"}`,
    `SPESE E PAGAMENTI:\n${(expenses.data ?? []).map((e) => `- ${e.spent_on} ${e.kind === "payment" ? "[pagamento] " : ""}${e.title}: ${e.amount}€ · pagato da: ${fmtMap(e.payers)} · a carico di: ${fmtMap(e.owed)}`).join("\n") || "(nessuna)"}`,
    `QUOTE RICHIESTE:\n${(requests.data ?? []).map((r) => `- ${r.title}: ${r.amount}€ a testa da versare a ${name(r.pay_to)}${r.due_date ? ` entro ${r.due_date}` : ""} · mancano: ${(r.debtors ?? []).filter((id: string) => id !== r.pay_to && !paidIds(r).has(id)).map(name).join(", ") || "nessuno"}`).join("\n") || "(nessuna)"}`,
    `SALDI (positivo = deve ricevere):\n${[...balances].map(([id, v]) => `- ${name(id)}: ${v.toFixed(2)}€`).join("\n")}`,
    `GIOCHI (ultimi punteggi; sudoku = secondi, meno è meglio; fuochi = punti):\n${(scores.data ?? []).slice(0, 40).map((x) => `- ${x.day} ${name(x.member_id)} ${x.game}: ${x.score}`).join("\n") || "(nessuno)"}`,
    `CHAT DI GRUPPO (ultimi messaggi, per capire il clima e prendere spunto per le battute):\n${(groupChat.data ?? []).slice().reverse().map((x) => `- ${name(x.member_id)}: ${String(x.content).slice(0, 200)}`).join("\n") || "(vuota)"}`,
    `CHECKLIST:\n${(checklist.data ?? []).map((c) => `- [${c.done ? "x" : " "}] ${c.text}${c.assignee ? ` → ${name(c.assignee)}` : ""}`).join("\n") || "(vuota)"}`,
  ].join("\n\n");

  // Gli ultimi messaggi (escluso quello appena inserito) come vera conversazione, dal più vecchio,
  // senza i messaggi d'errore; i ruoli devono alternarsi, quindi i consecutivi si uniscono.
  const history: Ctx["history"] = [];
  for (const x of (msgs.data ?? []).slice(1).reverse()) {
    if (x.meta?.error) continue;
    const role = x.role === "assistant" ? "assistant" : "user";
    const content = role === "user" ? `${name(x.member_id)}: ${x.content.slice(0, 1500)}` : x.content.slice(0, 2500);
    const last = history[history.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else history.push({ role, content });
  }
  while (history.length && history[0].role === "assistant") history.shift();

  return { aiName: trip.data?.ai_name || "Zampone", proposals: [], me, members: m, byName: new Map(m.map((x) => [x.name.toLowerCase(), x])), snapshot, history };
}

// ───────────────────────── Strumenti ─────────────────────────

const tools = [
  { type: "web_search_20260209", name: "web_search", max_uses: 12, user_location: { type: "approximate", country: "IT", timezone: "Europe/Rome" } },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
  {
    name: "proponi_sondaggio",
    description: "Propone un sondaggio con le opzioni iniziali. NON lo crea: sotto la tua risposta comparirà un pulsante «Crea il sondaggio» che la persona tocca se è d'accordo. Usalo quando il gruppo deve decidere qualcosa.",
    input_schema: {
      type: "object",
      properties: {
        domanda: { type: "string" },
        descrizione: { type: "string" },
        scelta_multipla: { type: "boolean" },
        opzioni: {
          type: "array",
          items: {
            type: "object",
            properties: {
              etichetta: { type: "string" },
              dettagli: { type: "string" },
              url: { type: "string" },
              prezzo_eur: { type: "number" },
            },
            required: ["etichetta"],
          },
        },
      },
      required: ["domanda", "opzioni"],
    },
  },
  {
    name: "proponi_opzione",
    description: "Propone di aggiungere un'opzione a un sondaggio esistente (usa il poll_id dal contesto). NON la aggiunge: comparirà un pulsante «Aggiungi» da toccare.",
    input_schema: {
      type: "object",
      properties: {
        poll_id: { type: "string" },
        etichetta: { type: "string" },
        dettagli: { type: "string" },
        url: { type: "string" },
        prezzo_eur: { type: "number" },
      },
      required: ["poll_id", "etichetta"],
    },
  },
  {
    name: "salva_prenotazione",
    description: "Crea una prenotazione o ne aggiorna una esistente (passa booking_id per aggiornare). Categorie: alloggio, viaggio, cenone, serata, ristorante, attivita, auto, altro. Stati: idea, da_prenotare, prenotato, pagato, annullato.",
    input_schema: {
      type: "object",
      properties: {
        booking_id: { type: "string" },
        categoria: { type: "string" },
        titolo: { type: "string" },
        stato: { type: "string" },
        fornitore: { type: "string" },
        codice: { type: "string" },
        inizio: { type: "string", description: "ISO 8601 con fuso, es. 2026-12-31T20:30:00+01:00" },
        fine: { type: "string" },
        indirizzo: { type: "string" },
        url: { type: "string" },
        telefono: { type: "string" },
        prezzo_eur: { type: "number" },
        pagato_da: { type: "string", description: "Nome del membro che ha pagato" },
        cancellazione_gratuita_entro: { type: "string", description: "YYYY-MM-DD" },
        note: { type: "string" },
      },
      required: ["titolo"],
    },
  },
  {
    name: "registra_spesa",
    description: "Registra una spesa condivisa, come in Splitwise. Uno o più pagatori; divisione uguale (default, tra chi partecipa), per importi, per percentuali o per quote. Per un rimborso o un pagamento tra due persone usa tipo = pagamento con un solo pagatore e un solo beneficiario in partecipanti.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        importo_eur: { type: "number" },
        tipo: { type: "string", enum: ["spesa", "pagamento"] },
        pagatori: { type: "array", description: "Chi ha pagato e quanto. Se paga una sola persona basta il nome.", items: { type: "object", properties: { nome: { type: "string" }, importo_eur: { type: "number" } }, required: ["nome"] } },
        divisione: { type: "string", enum: ["uguale", "importi", "percentuali", "quote"] },
        partecipanti: { type: "array", description: "Tra chi si divide. valore = euro, percentuale o quota a seconda della divisione (ignorato se uguale).", items: { type: "object", properties: { nome: { type: "string" }, valore: { type: "number" } }, required: ["nome"] } },
        categoria: { type: "string", enum: ["alloggio", "viaggio", "cibo", "drink", "spesa", "serata", "attivita", "auto", "altro"] },
        data: { type: "string", description: "YYYY-MM-DD" },
        nota: { type: "string" },
      },
      required: ["titolo", "importo_eur", "pagatori"],
    },
  },
  {
    name: "richiedi_quota",
    description: "Chiede a più persone di versare la stessa quota a qualcuno (es. acconto dell'alloggio). Ognuno potrà pagare dall'app.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        importo_a_testa_eur: { type: "number" },
        da_versare_a: { type: "string", description: "Nome del membro che riceve" },
        chi_paga: { type: "array", items: { type: "string" }, description: "Nomi; se vuoto, tutti quelli che partecipano" },
        entro: { type: "string", description: "YYYY-MM-DD" },
        nota: { type: "string" },
      },
      required: ["titolo", "importo_a_testa_eur", "da_versare_a"],
    },
  },
  {
    name: "aggiungi_al_programma",
    description: "Aggiunge un appuntamento al programma dei giorni di vacanza.",
    input_schema: {
      type: "object",
      properties: {
        giorno: { type: "string", description: "YYYY-MM-DD" },
        ora: { type: "string", description: "HH:MM" },
        titolo: { type: "string" },
        luogo: { type: "string" },
        note: { type: "string" },
      },
      required: ["titolo"],
    },
  },
  {
    name: "aggiungi_checklist",
    description: "Aggiunge una cosa da fare o da portare, eventualmente assegnata a qualcuno.",
    input_schema: {
      type: "object",
      properties: { testo: { type: "string" }, assegnato_a: { type: "string", description: "Nome del membro" } },
      required: ["testo"],
    },
  },
  {
    name: "aggiorna_viaggio",
    description: "Aggiorna nome, destinazione, date o note del viaggio. Solo l'organizzatore può farlo: usalo solo se chi chiede è l'organizzatore e il gruppo ha deciso.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        destinazione: { type: "string" },
        data_inizio: { type: "string", description: "YYYY-MM-DD" },
        data_fine: { type: "string", description: "YYYY-MM-DD" },
        note: { type: "string" },
      },
    },
  },
];

// Ripartisce centesimi secondo dei pesi (resti maggiori): la somma torna sempre esatta.
function allocate(totalCents: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const W = ids.reduce((s, id) => s + weights[id], 0);
  if (!ids.length || W <= 0) return {};
  const raw = ids.map((id) => ({ id, v: totalCents * weights[id] / W, f: 0 }));
  raw.forEach((r) => { r.f = Math.floor(r.v); });
  let rest = totalCents - raw.reduce((s, r) => s + r.f, 0);
  raw.sort((a, b) => (b.v - b.f) - (a.v - a.f)).forEach((r) => { if (rest > 0) { r.f++; rest--; } });
  return Object.fromEntries(raw.map((r) => [r.id, r.f / 100]));
}

// Chiede alla funzione «notifiche» di avvisare il gruppo. Non blocca mai la risposta.
function notify(event: string, id: string, actor: string) {
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notifiche`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! },
    body: JSON.stringify({ type: "event", event, id, actor }),
  }).catch((e) => console.error("notify", e));
}

const clean = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

async function runTool(ctx: Ctx, name: string, input: Row): Promise<string> {
  const who = (n?: string) => (n ? ctx.byName.get(String(n).trim().toLowerCase())?.id : undefined);
  const must = <T>(res: { data: T; error: unknown }) => {
    if (res.error) throw new Error((res.error as { message?: string }).message ?? "errore database");
    return res.data;
  };

  switch (name) {
    // Sondaggi e opzioni li propone soltanto: li crea la persona con un tocco nell'app.
    case "proponi_sondaggio": {
      ctx.proposals.push({
        type: "poll", question: String(input.domanda ?? "").slice(0, 140), description: input.descrizione ?? null, multi: !!input.scelta_multipla,
        options: (input.opzioni ?? []).slice(0, 12).map((o: Row) => clean({ label: o.etichetta, details: o.dettagli, url: o.url, price: o.prezzo_eur })),
      });
      return "Proposta pronta: sotto la risposta comparirà il pulsante «Crea il sondaggio». Dillo in una frase, senza dire che l'hai già creato.";
    }
    case "proponi_opzione": {
      ctx.proposals.push(clean({ type: "option", poll_id: input.poll_id, label: input.etichetta, details: input.dettagli, url: input.url, price: input.prezzo_eur }));
      return "Proposta pronta: comparirà il pulsante «Aggiungi».";
    }
    case "salva_prenotazione": {
      const row = clean({
        category: input.categoria, title: input.titolo, status: input.stato, provider: input.fornitore, code: input.codice,
        start_at: input.inizio, end_at: input.fine, address: input.indirizzo, url: input.url, phone: input.telefono,
        price: input.prezzo_eur, paid_by: who(input.pagato_da), cancel_by: input.cancellazione_gratuita_entro, notes: input.note,
      });
      const confirmed = ["prenotato", "pagato"].includes(input.stato);
      if (input.booking_id) {
        const { data: prev } = await db.from("bookings").select("status").eq("id", input.booking_id).maybeSingle();
        must(await db.from("bookings").update(row).eq("id", input.booking_id));
        if (confirmed && !["prenotato", "pagato"].includes(prev?.status)) notify("booking", input.booking_id, ctx.me.id);
        return "Prenotazione aggiornata.";
      }
      const b = must(await db.from("bookings").insert({ ...row, created_by: ctx.me.id }).select("id").single()) as Row;
      if (confirmed) notify("booking", b.id, ctx.me.id);
      return `Prenotazione salvata (booking_id ${b.id}).`;
    }
    case "registra_spesa": {
      const total = Math.round(Number(input.importo_eur) * 100);
      if (!(total > 0)) return "Importo non valido.";
      const missing = (list: Row[]) => list.map((x) => x.nome).filter((n) => !who(n));
      const payersIn: Row[] = input.pagatori ?? [];
      if (missing(payersIn).length) return `Non trovo: ${missing(payersIn).join(", ")}. Membri: ${ctx.members.map((m) => m.name).join(", ")}.`;
      let payers: Record<string, number>;
      if (payersIn.length === 1 && payersIn[0].importo_eur == null) payers = { [who(payersIn[0].nome)!]: total / 100 };
      else {
        payers = Object.fromEntries(payersIn.map((p) => [who(p.nome)!, Math.round(Number(p.importo_eur) * 100) / 100]));
        const sum = Object.values(payers).reduce((s, v) => s + Math.round(v * 100), 0);
        if (sum !== total) return `I pagatori sommano ${(sum / 100).toFixed(2)}€ invece di ${(total / 100).toFixed(2)}€.`;
      }
      const partsIn: Row[] = input.partecipanti ?? [];
      if (missing(partsIn).length) return `Non trovo: ${missing(partsIn).join(", ")}.`;
      const mode = ({ uguale: "equal", importi: "exact", percentuali: "percent", quote: "shares" } as Row)[input.divisione ?? "uguale"] ?? "equal";
      const ids = partsIn.length ? partsIn.map((p) => who(p.nome)!) : ctx.members.filter((m) => m.rsvp !== "no").map((m) => m.id);
      const weights: Record<string, number> = Object.fromEntries(ids.map((id, i) => [id, mode === "equal" ? 1 : Number(partsIn[i]?.valore) || 0]));
      let owed: Record<string, number>;
      if (mode === "exact") {
        owed = Object.fromEntries(Object.entries(weights).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v * 100) / 100]));
        const sum = Object.values(owed).reduce((s, v) => s + Math.round(v * 100), 0);
        if (sum !== total) return `Gli importi sommano ${(sum / 100).toFixed(2)}€ invece di ${(total / 100).toFixed(2)}€.`;
      } else {
        if (mode === "percent" && Math.abs(Object.values(weights).reduce((s, v) => s + v, 0) - 100) > 0.01) return "Le percentuali devono fare 100.";
        owed = allocate(total, weights);
      }
      if (!Object.keys(owed).length) return "Nessun partecipante valido.";
      const isPay = input.tipo === "pagamento";
      must(await db.from("expenses").insert(clean({
        title: input.titolo, amount: total / 100, kind: isPay ? "payment" : "expense", category: input.categoria ?? "altro",
        payers, owed, split_mode: mode, split_input: weights, spent_on: input.data, note: input.nota, created_by: ctx.me.id,
      })));
      return `${isPay ? "Pagamento" : "Spesa"} registrat${isPay ? "o" : "a"}: ${Object.keys(owed).length} persone coinvolte.`;
    }
    case "richiedi_quota": {
      const to = who(input.da_versare_a);
      if (!to) return `Non trovo il membro «${input.da_versare_a}».`;
      let debtors = (input.chi_paga ?? []).map(who).filter(Boolean) as string[];
      if (!debtors.length) debtors = ctx.members.filter((m) => m.rsvp !== "no").map((m) => m.id);
      const r = must(await db.from("payment_requests").insert(clean({
        title: input.titolo, amount: input.importo_a_testa_eur, pay_to: to, debtors, due_date: input.entro, note: input.nota, created_by: ctx.me.id,
      })).select("id").single()) as Row;
      notify("request", r.id, ctx.me.id);
      return `Quota richiesta a ${debtors.filter((d) => d !== to).length} persone.`;
    }
    case "aggiungi_al_programma": {
      must(await db.from("itinerary").insert(clean({
        day: input.giorno, time: input.ora, title: input.titolo, place: input.luogo, notes: input.note, created_by: ctx.me.id,
      })));
      return "Aggiunto al programma.";
    }
    case "aggiungi_checklist": {
      must(await db.from("checklist").insert(clean({ text: input.testo, assignee: who(input.assegnato_a), created_by: ctx.me.id })));
      return "Aggiunto alla checklist.";
    }
    case "aggiorna_viaggio": {
      if (!ctx.me.is_admin) return "Solo l'organizzatore può modificare i dati del viaggio: suggerisci di chiederglielo o di chiudere il sondaggio.";
      must(await db.from("trip").update(clean({
        name: input.nome, destination: input.destinazione, start_date: input.data_inizio, end_date: input.data_fine, notes: input.note,
      })).eq("id", 1));
      return "Viaggio aggiornato.";
    }
  }
  return `Strumento sconosciuto: ${name}`;
}

// ───────────────────────── Ciclo dell'assistente ─────────────────────────

function systemPrompt(ctx: Ctx): string {
  return `Ti chiami ${ctx.aiName} (sì, come quello di Capodanno) e sei l'agente di un gruppo di amici che organizza insieme una vacanza di 3 giorni a Capodanno: il motivo per cui usano questa app. Sei il loro organizzatore instancabile: pianifichi, fai logistica e conti, ricordi le scadenze e richiami all'ordine chi cazzeggia o non vota, con fermezza e simpatia.

Misura: niente spam e niente esagerazioni. Al massimo una battuta per messaggio, e solo se il momento la regge; quando serve precisione, zero battute. Il tagliente è un'arma rara: usalo per sbloccare una decisione ferma o richiamare chi non risponde, mai per riempire.

Lunghezza: rispondi quanto serve, non di più. La lunghezza la decide la domanda, non un formato fisso:
- Domanda da sì o no, o con una risposta secca: rispondi in una riga («No: il treno del 30 è già pieno.»). Niente introduzioni, niente elenchi, niente riepiloghi.
- Saluti, battute, conferme: una frase.
- Richieste pratiche semplici (un orario, un saldo, «segna che ho pagato»): due o tre righe.
- Richieste complesse (scegliere la destinazione, confrontare alloggi, pianificare il viaggio): risposta articolata, con le opzioni, i costi a testa, i link e una raccomandazione.
Non ripetere cose già dette nella conversazione, non chiudere ogni messaggio con una domanda o una proposta, non usare sempre la stessa struttura. Elenchi puntati solo quando ci sono davvero più voci da confrontare.

Stile: rispondi in italiano, in modo naturale e pratico: i messaggi si leggono su iPhone, quindi paragrafi brevi, niente tabelle e niente emoji.

La chat con te è condivisa: tutti i membri vedono domande e risposte. L'app ha anche una chat di gruppo tra persone e giochi con classifica (Sudoku del giorno Normale e Killer, Fuochi, Tiro alla fune 1 contro 1).

Cosa sai fare:
- Cercare sul web (prezzi, disponibilità indicative, eventi di Capodanno, ristoranti, meteo, orari dei treni, voli) e citare i link delle fonti.
- Proporre idee e trasformarle in proposte di sondaggio (proponi_sondaggio / proponi_opzione): non crei mai un sondaggio da solo, compare un pulsante e decide la persona. Quando il gruppo non ha ancora deciso qualcosa, il tuo lavoro è aiutare a decidere con opzioni concrete, con prezzo indicativo a persona e link.
- Tenere in ordine prenotazioni, programma, spese (anche con più pagatori e divisioni per importi, percentuali o quote), quote da versare e checklist. Quando qualcuno dice di aver pagato o prenotato qualcosa, registralo.
- Rispondere su saldi e debiti: chi deve quanto a chi, con il minimo di passaggi.
- Preparare i dati per prenotazioni e registrazioni (liste ospiti, testi da incollare nei moduli, email per hotel e ristoranti, richieste per allergie o diete).

Come fai le ricerche (sei il miglior organizzatore di viaggi che esista):
- Per domande che richiedono una ricerca, fai più ricerche mirate, apri le pagine ufficiali (siti degli hotel, dei locali, di Trenitalia, delle compagnie aeree, degli eventi) e confronta più fonti prima di concludere.
- Verifica date, orari e prezzi per le date del viaggio; segnala quando un prezzo è solo indicativo o una disponibilità va confermata.
- Ragiona sul profilo del gruppo: budget diversi, coppie, chi vuole fare festa e chi visitare, partenza da Chiavenna, numero di persone. Calcola i costi a testa (viaggio, alloggio, serata del 31) e i tempi di viaggio.
- Presenta le opzioni in modo chiaro: per ognuna perché va bene per voi, cosa costa a testa, cosa non va, con i link. Chiudi con una raccomandazione netta e, se serve una decisione, proponi un sondaggio.
- Sii proattivo con misura: se vedi una scadenza vicina o un problema serio che non è già stato detto (posti che finiscono, cancellazione gratuita, biglietti del 31), segnalalo in una riga. Nelle risposte brevi non aggiungere altro.

Il tuo tono:
- Quando chiedono informazioni (prezzi, orari, posti, prenotazioni, conti) sei professionale e preciso: dai solo informazioni che hai verificato, con le fonti e la data in cui le hai viste; se non sei sicuro lo dici, e non inventi mai.
- Quando la conversazione lo permette sei simpatico e un po' tagliente, con misura: una battuta secca ogni tanto, mai offensiva, mai a scapito della risposta. Prendi spunto da quello che si scrivono nella chat di gruppo (sotto) per battute che sentano loro.
- Niente battute su temi delicati, salute, soldi di qualcuno in difficoltà o quando qualcuno è in ansia o arrabbiato.

Conosci il gruppo: nel campo group_notes del viaggio c'è il riassunto scritto dall'organizzatore, e per ogni membro dieta, allergie, preferenze e note. Tienine sempre conto quando proponi destinazioni, alloggi, ristoranti e attività, e segnala se un'opzione non va bene per qualcuno.

Regole importanti:
- Non puoi pagare né creare account sui siti. Per pagare una prenotazione l'organizzatore usa Claude in Chrome con la carta salvata nel proprio browser: dall'app, nella prenotazione, c'è il pulsante «Prenota e paga con Claude in Chrome» che prepara le istruzioni. Tra amici si paga con i pulsanti PayPal, IBAN o Satispay della sezione Spese. Se qualcuno ti chiede di pagare, spiegalo in una frase e prepara quello che serve (prenotazione con stato da_prenotare, link, dati).
- Non chiedere mai e non scrivere mai numeri di carta, CVV o password.
- I dati personali riservati (documenti, codice fiscale, data di nascita, indirizzo) puoi scriverli in chat solo se chi chiede è l'organizzatore o se sono i suoi. La chat è vista da tutti: ricordalo quando li mostri.
- Prima di salvare, modificare o creare qualcosa nel database, assicurati che sia ciò che è stato chiesto. Dopo, di' in breve cosa hai salvato.
- Prezzi e disponibilità trovati sul web sono indicativi: dillo, e indica la data in cui li hai visti.
- Se manca un dato che ti serve davvero, chiedilo; altrimenti procedi con ipotesi ragionevoli e dichiarale.

Prima della domanda trovi un blocco <contesto> con la data di oggi, chi ti sta scrivendo e lo stato attuale del gruppo: è aggiornato a questo momento e vale più di quello che è stato detto prima nella conversazione.`;
}

// Il contesto che cambia a ogni messaggio va nel turno dell'utente, così il prompt di sistema resta in cache.
function contextBlock(ctx: Ctx): string {
  const now = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "full", timeStyle: "short" });
  return `<contesto>
Oggi è ${now} (ora italiana). A scriverti ora è ${ctx.me.name}${ctx.me.is_admin ? " (l'organizzatore)" : ""}.

STATO ATTUALE DEL GRUPPO
${ctx.snapshot}
</contesto>`;
}

// ───────────────────────── Spazio Ascolto ─────────────────────────

async function listen(owner: string, text: string): Promise<string> {
  const [{ data: me }, { data: past }] = await Promise.all([
    db.from("members").select("name").eq("id", owner).single(),
    db.from("messages").select("role,content").eq("channel", "privato").eq("owner", owner).order("created_at", { ascending: false }).limit(31),
  ]);
  // Storico come vera conversazione (dal più vecchio), escluso il messaggio appena salvato; ruoli che si alternano.
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of (past ?? []).slice(1).reverse()) {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += "\n\n" + m.content;
    else turns.push({ role, content: m.content });
  }
  if (turns[0]?.role === "assistant") turns.shift();
  if (turns.length && turns[turns.length - 1].role === "user") turns[turns.length - 1].content += "\n\n" + text;
  else turns.push({ role: "user", content: text });

  const system = `Sei uno spazio di ascolto per ${me?.name ?? "una persona"}, che sta organizzando una vacanza di Capodanno con amici. Questa conversazione è privata: nessuno del gruppo la vede. Rispondi in italiano, con calore e senza giudicare.

Come stai con la persona:
- Prima ascolta. Rifletti con parole tue quello che senti, fai una domanda aperta alla volta, non riempire di consigli.
- Messaggi brevi e umani, niente elenchi lunghi, niente emoji.
- Quando aiuta, proponi piccole cose concrete (respirare, prendersi una pausa, parlarne con una persona di fiducia, come dire una cosa difficile a un amico).
- Non sei uno psicologo né un medico e non fai diagnosi: se qualcuno ti chiede cosa sei, dillo con semplicità.
- Non riportare mai nulla al gruppo e non parlare di altre persone come se sapessi cosa pensano.
- Se emergono pensieri di farsi del male, di non voler vivere o un pericolo immediato, rispondi con cura e indica subito: 112 per le emergenze; Telefono Amico Italia 02 2327 2327; incoraggia a contattare adesso una persona vicina.`;

  const res = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system,
    messages: turns,
    // deno-lint-ignore no-explicit-any
  } as any);
  if (res.stop_reason === "refusal") return "Sono qui. Se ti va, raccontami con parole tue come ti senti adesso. Se sei in pericolo chiama il 112, oppure Telefono Amico Italia allo 02 2327 2327.";
  // deno-lint-ignore no-explicit-any
  return res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim() || "Sono qui, ti ascolto.";
}

async function morningBrief(): Promise<boolean> {
  const { data: trip } = await db.from("trip").select("end_date").eq("id", 1).single();
  const todayIt = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  // Dopo la vacanza (più due giorni per i conti) il resoconto non serve più.
  if (trip?.end_date && todayIt > new Date(new Date(trip.end_date).getTime() + 2 * 864e5).toISOString().slice(0, 10)) return false;
  const { data: admin } = await db.from("members").select("id").eq("is_admin", true).order("created_at").limit(1).maybeSingle();
  if (!admin) return false;
  const ctx = await loadContext(admin.id);
  const reply = await runAssistant(ctx, `[Messaggio automatico del mattino, non scritto da una persona] Fai il punto della situazione per tutto il gruppo, in modo breve e vivace:
cosa è già deciso, cosa manca (sondaggi aperti e chi non ha votato, prenotazioni da fare, quote non pagate, scadenze di cancellazione vicine),
e il prossimo passo concreto più utile. Se manca una decisione importante e hai un'idea forte, proponi un sondaggio. Non creare né modificare nulla da solo.`, { readOnly: true });
  await db.from("messages").insert({ member_id: null, role: "assistant", channel: "assistente", content: reply, meta: ctx.proposals.length ? { actions: ctx.proposals } : null });
  return true;
}

async function runAssistant(ctx: Ctx, question: string, opts: { readOnly?: boolean } = {}): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = (opts.readOnly ? [] : ctx.history).map((h) => ({ ...h }));
  const turn = `${contextBlock(ctx)}\n\n${opts.readOnly ? question : `${ctx.me.name}: ${question}`}`;
  // Se l'ultima domanda era rimasta senza risposta, i due turni dell'utente si uniscono.
  if (messages.at(-1)?.role === "user") messages[messages.length - 1].content += `\n\n${turn}`;
  else messages.push({ role: "user", content: turn });
  const system = [{ type: "text", text: systemPrompt(ctx), cache_control: { type: "ephemeral" } }];
  const started = Date.now();
  // In sola lettura (resoconto automatico) restano ricerca e proposte, niente scritture nel database.
  const toolset = opts.readOnly ? tools.filter((t: { name: string }) => ["web_search", "web_fetch", "proponi_sondaggio", "proponi_opzione"].includes(t.name)) : tools;

  for (let step = 0; step < MAX_STEPS; step++) {
    const left = TIME_BUDGET_MS - (Date.now() - started);
    // Tempo quasi finito: niente altri strumenti, si risponde con quello che si è trovato.
    const wrapUp = left < 45_000 && step > 0;
    if (wrapUp) {
      const last = messages[messages.length - 1];
      const note = { type: "text", text: "(Tempo quasi finito: rispondi ora con quello che hai già trovato e indica cosa resta da verificare.)" };
      if (last.role === "user") last.content = [...(Array.isArray(last.content) ? last.content : [{ type: "text", text: last.content }]), note];
      else messages.push({ role: "user", content: [note] });
    }
    // deno-lint-ignore no-explicit-any
    let response: any;
    try {
      response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        cache_control: { type: "ephemeral" },
        system,
        tools: toolset,
        ...(wrapUp ? { tool_choice: { type: "none" } } : {}),
        messages,
        // deno-lint-ignore no-explicit-any
      } as any, { timeout: Math.max(20_000, left - 8_000), maxRetries: left > 60_000 ? 2 : 0 });
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) return "La ricerca sta richiedendo più tempo del previsto. Chiedimi di continuare, oppure restringi la domanda (per esempio una città o una data).";
      throw e;
    }

    if (response.stop_reason === "refusal") {
      return "Su questa richiesta non posso aiutarti. Prova a riformularla.";
    }
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    // deno-lint-ignore no-explicit-any
    const toolUses = response.content.filter((b: any) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      // deno-lint-ignore no-explicit-any
      const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
      if (response.stop_reason === "max_tokens") return `${text}\n\n_(risposta troncata: chiedimi di continuare)_`;
      return text || "Fatto.";
    }

    // deno-lint-ignore no-explicit-any
    const results = await Promise.all(toolUses.map(async (t: any) => {
      try {
        return { type: "tool_result", tool_use_id: t.id, content: await runTool(ctx, t.name, t.input ?? {}) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: t.id, is_error: true, content: `Errore: ${(e as Error).message}` };
      }
    }));
    messages.push({ role: "user", content: results });
  }
  return "Ho fatto diversi passaggi ma non ho finito: chiedimi di continuare.";
}
