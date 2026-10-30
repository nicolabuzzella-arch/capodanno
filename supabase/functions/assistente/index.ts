// Capodanno - assistente AI del gruppo (Supabase Edge Function).
// Riceve una domanda da un membro, la salva in chat, chiede a Claude (con ricerca web
// e strumenti per scrivere nel database del gruppo) e salva la risposta in chat.
// Segreto richiesto: ANTHROPIC_API_KEY (Edge Functions → Secrets).

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 8;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non supportato" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth?.user) return json({ error: "Non autenticato" }, 401);

    const { data: device } = await db.from("devices").select("member_id").eq("user_id", auth.user.id).maybeSingle();
    if (!device) return json({ error: "Non fai parte del gruppo" }, 403);

    const { message } = await req.json();
    const text = String(message ?? "").trim().slice(0, 4000);
    if (!text) return json({ error: "Messaggio vuoto" }, 400);

    await db.from("messages").insert({ member_id: device.member_id, role: "user", content: text });

    const ctx = await loadContext(device.member_id);
    const reply = await runAssistant(ctx, text);

    await db.from("messages").insert({ member_id: null, role: "assistant", content: reply });
    return json({ reply });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Anthropic.APIError
      ? `Errore dal servizio AI (${err.status}). Riprova tra poco.`
      : "Qualcosa è andato storto. Riprova tra poco.";
    await db.from("messages").insert({ member_id: null, role: "assistant", content: `⚠️ ${msg}` });
    return json({ error: msg }, 500);
  }
});

// ───────────────────────── Contesto del gruppo ─────────────────────────

interface Ctx {
  me: Row;
  members: Row[];
  byName: Map<string, Row>;
  snapshot: string;
  history: string;
}

async function loadContext(memberId: string): Promise<Ctx> {
  const [trip, members, priv, polls, options, votes, bookings, expenses, itinerary, checklist, msgs] = await Promise.all([
    db.from("trip").select("name,destination,start_date,end_date,invite_code,notes").eq("id", 1).single(),
    db.from("members").select("id,name,emoji,rsvp,phone,diet,allergies,preferences,car_seats,departure_city,is_admin").order("created_at"),
    db.from("member_private").select("*"),
    db.from("polls").select("*").order("created_at"),
    db.from("poll_options").select("*").order("created_at"),
    db.from("votes").select("option_id,member_id"),
    db.from("bookings").select("*").order("start_at", { nullsFirst: false }),
    db.from("expenses").select("*").order("spent_on"),
    db.from("itinerary").select("*").order("day").order("time"),
    db.from("checklist").select("*").order("created_at"),
    db.from("messages").select("member_id,role,content,created_at").order("created_at", { ascending: false }).limit(30),
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
    balances.set(e.paid_by, (balances.get(e.paid_by) ?? 0) + Number(e.amount));
    const share = Number(e.amount) / Math.max(1, e.split_among.length);
    for (const id of e.split_among) balances.set(id, (balances.get(id) ?? 0) - share);
  }

  const snapshot = [
    `VIAGGIO: ${JSON.stringify(trip.data)}`,
    `MEMBRI (${m.length}):\n${m.map((x) => `- ${x.emoji} ${x.name}${x.is_admin ? " [organizzatore]" : ""} · partecipa: ${x.rsvp}` +
      `${x.departure_city ? ` · parte da ${x.departure_city}` : ""}${x.car_seats ? ` · auto con ${x.car_seats} posti liberi` : ""}` +
      `${x.diet ? ` · dieta: ${x.diet}` : ""}${x.allergies ? ` · allergie: ${x.allergies}` : ""}${x.preferences ? ` · preferenze: ${x.preferences}` : ""}` +
      `${x.phone ? ` · tel ${x.phone}` : ""}`).join("\n")}`,
    privRows.length
      ? `DATI PERSONALI RISERVATI (usali solo per compilare prenotazioni/registrazioni per chi te lo chiede e ne ha diritto):\n${privRows.map((p) => `- ${name(p.member_id)}: ${JSON.stringify({ ...p, member_id: undefined, updated_at: undefined })}`).join("\n")}`
      : "DATI PERSONALI RISERVATI: non disponibili per chi sta chiedendo.",
    `SONDAGGI:\n${pollText || "(nessuno)"}`,
    `PRENOTAZIONI:\n${(bookings.data ?? []).map((b) => `- [booking_id ${b.id}] ${JSON.stringify({ ...b, id: undefined, created_at: undefined, created_by: undefined, paid_by: b.paid_by ? name(b.paid_by) : null })}`).join("\n") || "(nessuna)"}`,
    `PROGRAMMA:\n${(itinerary.data ?? []).map((i) => `- ${i.day ?? "?"} ${i.time ?? ""} ${i.title}${i.place ? ` @ ${i.place}` : ""}${i.notes ? ` (${i.notes})` : ""}`).join("\n") || "(vuoto)"}`,
    `SPESE:\n${(expenses.data ?? []).map((e) => `- ${e.spent_on} ${e.title}: ${e.amount}€ pagato da ${name(e.paid_by)}, diviso tra ${e.split_among.map(name).join(", ")}`).join("\n") || "(nessuna)"}`,
    `SALDI (positivo = deve ricevere):\n${[...balances].map(([id, v]) => `- ${name(id)}: ${v.toFixed(2)}€`).join("\n")}`,
    `CHECKLIST:\n${(checklist.data ?? []).map((c) => `- [${c.done ? "x" : " "}] ${c.text}${c.assignee ? ` → ${name(c.assignee)}` : ""}`).join("\n") || "(vuota)"}`,
  ].join("\n\n");

  // Gli ultimi messaggi (escluso quello appena inserito) come trascrizione, dal più vecchio.
  const history = (msgs.data ?? []).slice(1).reverse()
    .map((x) => `${x.role === "assistant" ? "Assistente" : name(x.member_id)}: ${x.content.slice(0, 1500)}`).join("\n");

  return { me, members: m, byName: new Map(m.map((x) => [x.name.toLowerCase(), x])), snapshot, history };
}

// ───────────────────────── Strumenti ─────────────────────────

const tools = [
  { type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "IT", timezone: "Europe/Rome" } },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
  {
    name: "crea_sondaggio",
    description: "Crea un sondaggio per il gruppo, con le opzioni iniziali. Usalo quando il gruppo deve decidere qualcosa (destinazione, date, alloggio, locale…).",
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
    name: "aggiungi_opzione",
    description: "Aggiunge un'opzione a un sondaggio esistente (usa il poll_id dal contesto).",
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
    description: "Registra una spesa condivisa. Se non specificato, si divide tra tutti i membri che partecipano.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        importo_eur: { type: "number" },
        pagato_da: { type: "string", description: "Nome del membro" },
        diviso_tra: { type: "array", items: { type: "string" }, description: "Nomi dei membri" },
        categoria: { type: "string" },
        data: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["titolo", "importo_eur", "pagato_da"],
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

const clean = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

async function runTool(ctx: Ctx, name: string, input: Row): Promise<string> {
  const who = (n?: string) => (n ? ctx.byName.get(String(n).trim().toLowerCase())?.id : undefined);
  const must = <T>(res: { data: T; error: unknown }) => {
    if (res.error) throw new Error((res.error as { message?: string }).message ?? "errore database");
    return res.data;
  };

  switch (name) {
    case "crea_sondaggio": {
      const poll = must(await db.from("polls").insert({
        question: input.domanda,
        description: input.descrizione ?? null,
        kind: input.scelta_multipla ? "multi" : "single",
        created_by: ctx.me.id,
      }).select("id").single()) as Row;
      const opts = (input.opzioni ?? []).map((o: Row) => ({
        poll_id: poll.id, label: o.etichetta, details: o.dettagli ?? null, url: o.url ?? null, price: o.prezzo_eur ?? null, added_by: ctx.me.id,
      }));
      if (opts.length) must(await db.from("poll_options").insert(opts));
      return `Sondaggio creato (poll_id ${poll.id}) con ${opts.length} opzioni.`;
    }
    case "aggiungi_opzione": {
      must(await db.from("poll_options").insert({
        poll_id: input.poll_id, label: input.etichetta, details: input.dettagli ?? null, url: input.url ?? null, price: input.prezzo_eur ?? null, added_by: ctx.me.id,
      }));
      return "Opzione aggiunta.";
    }
    case "salva_prenotazione": {
      const row = clean({
        category: input.categoria, title: input.titolo, status: input.stato, provider: input.fornitore, code: input.codice,
        start_at: input.inizio, end_at: input.fine, address: input.indirizzo, url: input.url, phone: input.telefono,
        price: input.prezzo_eur, paid_by: who(input.pagato_da), cancel_by: input.cancellazione_gratuita_entro, notes: input.note,
      });
      if (input.booking_id) {
        must(await db.from("bookings").update(row).eq("id", input.booking_id));
        return "Prenotazione aggiornata.";
      }
      const b = must(await db.from("bookings").insert({ ...row, created_by: ctx.me.id }).select("id").single()) as Row;
      return `Prenotazione salvata (booking_id ${b.id}).`;
    }
    case "registra_spesa": {
      const payer = who(input.pagato_da);
      if (!payer) return `Non trovo il membro «${input.pagato_da}». Membri: ${ctx.members.map((m) => m.name).join(", ")}.`;
      let split = (input.diviso_tra ?? []).map(who).filter(Boolean) as string[];
      if (!split.length) split = ctx.members.filter((m) => m.rsvp !== "no").map((m) => m.id);
      must(await db.from("expenses").insert(clean({
        title: input.titolo, amount: input.importo_eur, paid_by: payer, split_among: split,
        category: input.categoria, spent_on: input.data, created_by: ctx.me.id,
      })));
      return `Spesa registrata, divisa tra ${split.length} persone.`;
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
  const now = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "full", timeStyle: "short" });
  return `Sei l'assistente di un gruppo di amici che organizza insieme una vacanza di 3 giorni a Capodanno. Rispondi in italiano, in modo caldo, pratico e conciso: i messaggi si leggono su iPhone, quindi usa paragrafi brevi ed elenchi puntati, niente tabelle.

Oggi è ${now} (ora italiana). A scriverti ora è ${ctx.me.name}${ctx.me.is_admin ? " (l'organizzatore)" : ""}. La chat è condivisa: tutti i membri vedono domande e risposte.

Cosa sai fare:
- Cercare sul web (prezzi, disponibilità indicative, eventi di Capodanno, ristoranti, meteo, orari dei treni, voli) e citare i link delle fonti.
- Proporre idee e trasformarle in sondaggi (crea_sondaggio / aggiungi_opzione) così il gruppo vota. Quando il gruppo non ha ancora deciso qualcosa, il tuo lavoro è aiutare a decidere con opzioni concrete, con prezzo indicativo a persona e link.
- Tenere in ordine prenotazioni, programma, spese e checklist con gli strumenti. Quando qualcuno dice di aver pagato o prenotato qualcosa, registralo.
- Preparare i dati per prenotazioni e registrazioni (liste ospiti, testi da incollare nei moduli, email per hotel e ristoranti, richieste per allergie o diete).

Regole importanti:
- Non puoi pagare né creare account sui siti: prepari tutto e dai il link diretto; il pagamento lo fa una persona, con la propria carta o Apple Pay. Se qualcuno ti chiede di pagare, spiegalo in una frase e prepara quello che serve.
- Non chiedere mai e non scrivere mai numeri di carta, CVV o password.
- I dati personali riservati (documenti, codice fiscale, data di nascita, indirizzo) puoi scriverli in chat solo se chi chiede è l'organizzatore o se sono i suoi. La chat è vista da tutti: ricordalo quando li mostri.
- Prima di salvare, modificare o creare qualcosa nel database, assicurati che sia ciò che è stato chiesto. Dopo, di' in breve cosa hai salvato.
- Prezzi e disponibilità trovati sul web sono indicativi: dillo, e indica la data in cui li hai visti.
- Se manca un dato che ti serve davvero, chiedilo; altrimenti procedi con ipotesi ragionevoli e dichiarale.

STATO ATTUALE DEL GRUPPO
${ctx.snapshot}

ULTIMI MESSAGGI IN CHAT
${ctx.history || "(nessuno)"}`;
}

async function runAssistant(ctx: Ctx, question: string): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: `${ctx.me.name}: ${question}` }];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: systemPrompt(ctx),
      tools,
      messages,
      // deno-lint-ignore no-explicit-any
    } as any);

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
