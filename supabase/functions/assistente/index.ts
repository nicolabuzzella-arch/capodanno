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

    const { message, mode, message_id } = await req.json();
    // «Osserva»: Zampone legge un messaggio della chat di gruppo e, se c'è qualcosa da registrare o da fare,
    // lo fa da solo e lo dice in una riga nella sua chat, proponendo il passo successivo.
    if (mode === "osserva") {
      const { data: gm } = await db.from("messages").select("id,member_id,channel,content,created_at,meta").eq("id", message_id).maybeSingle();
      if (!gm || gm.channel !== "gruppo" || gm.member_id !== device.member_id) return json({ skipped: true });
      if (gm.meta?.osservato) return json({ skipped: true });
      await db.from("messages").update({ meta: { ...(gm.meta ?? {}), osservato: true } }).eq("id", gm.id);
      background((async () => {
        try {
          const ctx = await loadContext(device.member_id);
          ctx.history = [];
          const reply = await runAssistant(ctx, `[Automatico, non è una domanda] Nella chat di gruppo ${ctx.me.name} ha appena scritto: «${String(gm.content).slice(0, 1500)}».
Se contiene qualcosa da registrare (un pagamento o una spesa, una prenotazione fatta, un orario, da dove parte qualcuno, chi guida, diete o allergie, cose da portare, una data) registralo SUBITO tu con gli strumenti, senza chiedere.
Se contiene una cosa da fare (prenotare, cercare, decidere, pagare una quota), fai tu la parte che puoi fare adesso (ricerca, sondaggio, quota) e proponi di occuparti del resto.
Poi rispondi in una o due righe: cosa hai segnato e il prossimo passo che ti offri di fare tu («Vuoi che…?»).
Se il messaggio non contiene niente di utile per l'organizzazione, rispondi esattamente: NIENTE`);
          if (/^\s*NIENTE\s*\.?\s*$/i.test(reply) || (!ctx.proposals.length && reply.length < 3)) return;
          await db.from("messages").insert({ member_id: null, role: "assistant", channel: "assistente", content: reply, meta: { auto: true, from: gm.id, ...(ctx.proposals.length ? { actions: ctx.proposals } : {}) } });
        } catch (err) { console.error(err); }
      })());
      return json({ accepted: true }, 202);
    }
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
  const [trip, members, priv, polls, options, votes, bookings, expenses, requests, itinerary, checklist, msgs, scores, groupChat, vibes, daily, photos, news, effects] = await Promise.all([
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
    db.from("messages").select("member_id,content,created_at").eq("channel", "gruppo").order("created_at", { ascending: false }).limit(120),
    db.from("vibe_answers").select("member_id,question,answer").order("created_at"),
    db.from("daily_answers").select("member_id,question,answer,day").order("created_at", { ascending: false }).limit(120),
    db.from("photos").select("member_id,caption,created_at").order("created_at", { ascending: false }).limit(40),
    db.from("news").select("items,updated_at").eq("id", 1).maybeSingle(),
    db.from("effects").select("kind,target,value,until").gt("until", new Date().toISOString()),
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
    `CHAT DI GRUPPO (ultimi 120 messaggi: leggili tutti, ci sono decisioni, preferenze, cose dette e da salvare):\n${(groupChat.data ?? []).slice().reverse().map((x) => `- ${name(x.member_id)}: ${String(x.content).slice(0, 300)}`).join("\n") || "(vuota)"}`,
    `RISPOSTE ALLE DOMANDE DEL GIORNO (preferenze dichiarate da ognuno: usale per proporre e decidere):\n${(daily.data ?? []).map((d) => `- ${name(d.member_id)} · ${d.question} → ${d.answer}`).join("\n") || "(nessuna)"}`,
    `FOTO CARICATE: ${(photos.data ?? []).length}${(photos.data ?? []).filter((x) => x.caption).slice(0, 10).map((x) => ` · ${name(x.member_id)}: «${x.caption}»`).join("")}`,
    `EFFETTI DELLA RUOTA ATTIVI: ${(effects.data ?? []).map((e) => `${name(e.target)} ${e.kind === "mute" ? "silenziato" : e.kind === "nick" ? `si chiama «${e.value}»` : e.kind === "title" ? `ha il titolo «${e.value}»` : "ha lo scudo"} fino alle ${new Date(e.until).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}`).join("; ") || "nessuno"}`,
    `NOTIZIE DEL GIORNO (sezione Home, da testate affidabili):\n${((news.data?.items ?? []) as Row[]).map((n) => `- ${n.titolo}`).join("\n") || "(nessuna)"}`,
    `CHI È CHI (note dell'organizzatore sul gruppo, riservate: usale per capire e personalizzare, non citarle mai alla lettera):\n${(vibes.data ?? []).map((v) => `- ${v.member_id ? name(v.member_id) : "Gruppo"} · ${v.question} → ${v.answer}`).join("\n") || "(ancora nessuna)"}`,
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
  { type: "web_search_20260209", name: "web_search", max_uses: 16, user_location: { type: "approximate", country: "IT", timezone: "Europe/Rome" } },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 12 },
  {
    name: "treni",
    description: "Orari e PREZZI REALI di Trenitalia (Frecce, Intercity, regionali e i treni internazionali venduti da Trenitalia) per un giorno e un'ora precisi, letti in tempo reale dal sistema di vendita. Usalo sempre per i treni prima di cercare sul web. Restituisce le soluzioni con partenza, arrivo, durata, cambi, treni e prezzo per il numero di adulti indicato.",
    input_schema: {
      type: "object",
      properties: {
        da: { type: "string", description: "Stazione o città di partenza, es. «Chiavenna», «Milano Centrale»" },
        a: { type: "string", description: "Stazione o città di arrivo" },
        data: { type: "string", description: "AAAA-MM-GG" },
        ora: { type: "string", description: "HH:MM, da quando cercare (default 06:00)" },
        adulti: { type: "integer" },
        solo_frecce: { type: "boolean" },
      },
      required: ["da", "a", "data"],
    },
  },
  {
    name: "mostra_alloggi",
    description: "Mostra nella chat le strutture trovate come SCHEDE con foto (nome, piattaforma, foto, prezzo, posti letto, voto, zona, cancellazione, link diretto) e un pulsante per metterle ai voti. Usalo SEMPRE quando proponi alloggi, con 4-8 strutture reali trovate sulle varie piattaforme. La foto è l'immagine principale della pagina della struttura (og:image o prima foto della galleria), letta con web_fetch.",
    input_schema: {
      type: "object",
      properties: {
        strutture: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nome: { type: "string" },
              piattaforma: { type: "string", description: "Booking, Airbnb, Expedia, Hotels.com, Vrbo, sito ufficiale…" },
              url: { type: "string", description: "Link diretto alla pagina della struttura, con le date se possibile" },
              foto: { type: "string", description: "URL https di un'immagine della struttura" },
              prezzo_totale: { type: "number", description: "Euro per tutte le notti e tutte le persone" },
              prezzo_testa: { type: "number" },
              posti_letto: { type: "integer" },
              camere: { type: "integer" },
              voto: { type: "string", description: "es. «9,1 su 10 (1.240 recensioni)» o «4,92 ★»" },
              zona: { type: "string", description: "Quartiere e distanza dal centro" },
              cancellazione: { type: "string" },
              note: { type: "string", description: "Una riga: perché va bene o cosa non va" },
              visto_il: { type: "string", description: "Data e ora in cui hai letto il prezzo" },
            },
            required: ["nome", "url"],
          },
        },
      },
      required: ["strutture"],
    },
  },
  {
    name: "link_alloggi",
    description: "Prepara i link di ricerca GIÀ COMPILATI con città, date e numero di persone per Booking (hotel e appartamenti), Airbnb e Google Hotels. Usalo sempre quando si cercano alloggi: i link vanno nella risposta insieme alle strutture concrete che trovi.",
    input_schema: {
      type: "object",
      properties: {
        citta: { type: "string", description: "Città o zona, es. «Vienna» o «Praga, Città Vecchia»" },
        checkin: { type: "string", description: "AAAA-MM-GG; se manca uso le date del viaggio" },
        checkout: { type: "string", description: "AAAA-MM-GG; se manca uso le date del viaggio" },
        adulti: { type: "integer", description: "Persone; se manca uso quante sono nel gruppo" },
        camere: { type: "integer" },
        prezzo_max_notte: { type: "integer", description: "Budget massimo per notte per l'intera struttura, in euro (facoltativo)" },
      },
      required: ["citta"],
    },
  },
  {
    name: "crea_sondaggio",
    description: "Crea SUBITO un sondaggio nella sezione Vota e avvisa il gruppo. Usalo quando qualcuno lo chiede o quando dalla conversazione emerge una decisione da prendere tra opzioni concrete. Prima controlla nello stato del gruppo che non esista già un sondaggio aperto sullo stesso tema: in quel caso aggiungi opzioni a quello (aggiungi_opzione) invece di crearne un altro.",
    input_schema: {
      type: "object",
      properties: {
        domanda: { type: "string" },
        descrizione: { type: "string" },
        scelta_multipla: { type: "boolean" },
        scadenza: { type: "string", description: "YYYY-MM-DD, facoltativa" },
        opzioni: {
          type: "array",
          items: { type: "object", properties: { etichetta: { type: "string" }, dettagli: { type: "string" }, url: { type: "string" }, prezzo_eur: { type: "number" } }, required: ["etichetta"] },
        },
      },
      required: ["domanda", "opzioni"],
    },
  },
  {
    name: "aggiungi_opzione",
    description: "Aggiunge SUBITO un'opzione a un sondaggio aperto (poll_id dallo stato del gruppo).",
    input_schema: { type: "object", properties: { poll_id: { type: "string" }, etichetta: { type: "string" }, dettagli: { type: "string" }, url: { type: "string" }, prezzo_eur: { type: "number" } }, required: ["poll_id", "etichetta"] },
  },
  {
    name: "aggiorna_membro",
    description: "Aggiorna il profilo di un membro con quello che dice di sé (o che l'organizzatore dice di lui): dieta, allergie, preferenze, città di partenza, posti liberi in auto, con chi viaggia in auto, note. Usalo appena qualcuno lo scrive, senza chiedere conferma.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome del membro; se manca è chi scrive." },
        dieta: { type: "string" }, allergie: { type: "string" }, preferenze: { type: "string" },
        partenza: { type: "string", description: "Città di partenza" },
        posti_auto: { type: "number", description: "Posti liberi offerti nella propria auto (0 se non porta l'auto)" },
        in_auto_con: { type: "string", description: "Nome di chi guida l'auto su cui sale" },
        note: { type: "string", description: "Altro da ricordare su questa persona (si aggiunge alle note esistenti)" },
      },
    },
  },
  {
    name: "proponi_sondaggio",
    description: "Prepara un sondaggio da far confermare con un pulsante «Crea il sondaggio». Usalo solo quando non è chiaro se il gruppo vuole davvero votare; altrimenti usa crea_sondaggio.",
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
    case "treni": {
      const B = "https://www.lefrecce.it/Channels.Website.BFF.WEB/website";
      const H = { "User-Agent": "Mozilla/5.0 (CapodannoApp)", "Accept": "application/json", "Content-Type": "application/json", "Accept-Language": "it-IT" };
      const station = async (q: string) => {
        const r = await fetch(`${B}/locations/search?name=${encodeURIComponent(q)}&limit=5`, { headers: H, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`ricerca stazione ${r.status}`);
        const list = await r.json() as { id: number; name?: string; displayName?: string }[];
        if (!list?.length) throw new Error(`stazione non trovata: ${q}`);
        return list[0];
      };
      try {
        const [from, to] = await Promise.all([station(String(input.da)), station(String(input.a))]);
        const adults = Math.max(1, Number(input.adulti ?? 1));
        const body = {
          departureLocationId: from.id, arrivalLocationId: to.id,
          departureTime: `${String(input.data)}T${String(input.ora ?? "06:00").slice(0, 5)}:00.000`,
          adults, children: 0,
          criteria: { frecceOnly: !!input.solo_frecce, regionalOnly: false, noChanges: false, order: "DEPARTURE_DATE", limit: 10, offset: 0 },
          advancedSearchRequest: { bestFare: false },
        };
        const r = await fetch(`${B}/ticket/solutions`, { method: "POST", headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
        if (!r.ok) throw new Error(`soluzioni ${r.status}`);
        // deno-lint-ignore no-explicit-any
        const d = await r.json() as any;
        // deno-lint-ignore no-explicit-any
        const sols = (d.solutions ?? []).map((x: any) => x.solution ?? x).slice(0, 10).map((s: any) => ({
          partenza: s.departureTime, arrivo: s.arrivalTime, durata: s.duration, stato: s.status,
          prezzo_totale: s.price && !s.price.hideAmount ? `${s.price.amount} €${s.price.indicative ? " (indicativo)" : ""}` : "non in vendita",
          prezzo_a_testa: s.price?.amount ? `${Math.round(s.price.amount / adults * 100) / 100} €` : null,
          // deno-lint-ignore no-explicit-any
          treni: (s.trains ?? []).map((n: any) => [n.trainCategory || n.denomination || n.acronym, n.name].filter(Boolean).join(" ")).filter(Boolean),
          cambi: Math.max(0, (s.nodes ?? s.trains ?? []).length - 1),
        }));
        const link = `https://www.trenitalia.com/it.html`;
        return JSON.stringify({ fonte: "Trenitalia, sistema di vendita Le Frecce, letto ora", da: from.displayName || from.name, a: to.displayName || to.name, data: input.data, adulti: adults, soluzioni: sols, prenota: link,
          nota: sols.length ? "Prezzi per tutti gli adulti indicati, tariffa più bassa disponibile in questo momento." : "Nessuna soluzione: prova un'altra ora, una stazione vicina o cerca sul web (Italo, ÖBB, SBB)." });
      } catch (e) {
        return JSON.stringify({ errore: String((e as Error).message ?? e), consiglio: "Il sistema Trenitalia non ha risposto: cerca con web_search/web_fetch sui siti ufficiali (trenitalia.com, italotreno.com, oebb.at, sbb.ch, thetrainline.com) per la data esatta." });
      }
    }
    case "mostra_alloggi": {
      const ok = (u: unknown) => typeof u === "string" && /^https:\/\//.test(u) ? u : null;
      // deno-lint-ignore no-explicit-any
      const items = ((input.strutture as any[]) ?? []).slice(0, 10).map((s: any) => clean({
        name: String(s.nome ?? "").slice(0, 120), platform: s.piattaforma ? String(s.piattaforma).slice(0, 40) : null, url: ok(s.url), img: ok(s.foto),
        total: Number(s.prezzo_totale) || null, head: Number(s.prezzo_testa) || null, beds: Number(s.posti_letto) || null, rooms: Number(s.camere) || null,
        rating: s.voto ? String(s.voto).slice(0, 60) : null, zone: s.zona ? String(s.zona).slice(0, 120) : null, cancel: s.cancellazione ? String(s.cancellazione).slice(0, 120) : null,
        note: s.note ? String(s.note).slice(0, 200) : null, seen: s.visto_il ? String(s.visto_il).slice(0, 40) : null,
      })).filter((s: Row) => s.name && s.url);
      if (!items.length) return "Nessuna struttura valida: servono almeno nome e link https.";
      ctx.proposals.push({ type: "stays", items });
      return `Mostrate ${items.length} schede con foto nella chat. Nel testo della risposta fai solo un breve confronto e la tua raccomandazione, senza ripetere tutti i dettagli.`;
    }
    case "link_alloggi": {
      const { data: tr } = await db.from("trip").select("start_date,end_date").eq("id", 1).single();
      const city = String(input.citta ?? "").trim();
      const ci = String(input.checkin ?? tr?.start_date ?? ""), co = String(input.checkout ?? tr?.end_date ?? "");
      const ad = Math.max(1, Number(input.adulti ?? ctx.members.length ?? 2));
      const rooms = Math.max(1, Number(input.camere ?? 1));
      const max = Number(input.prezzo_max_notte ?? 0);
      const q = encodeURIComponent(city);
      const dates = ci && co ? `&checkin=${ci}&checkout=${co}` : "";
      const price = max > 0 ? `&nflt=${encodeURIComponent(`price=EUR-min-${max}-1`)}` : "";
      const out = {
        booking_hotel: `https://www.booking.com/searchresults.it.html?ss=${q}${dates}&group_adults=${ad}&no_rooms=${rooms}&group_children=0&order=review_score_and_price${price}`,
        booking_appartamenti: `https://www.booking.com/searchresults.it.html?ss=${q}${dates}&group_adults=${ad}&no_rooms=${rooms}&group_children=0&nflt=${encodeURIComponent("ht_id=201")}`,
        airbnb: `https://www.airbnb.it/s/${encodeURIComponent(city.replace(/\s+/g, "-"))}/homes?${ci && co ? `checkin=${ci}&checkout=${co}&` : ""}adults=${ad}${max > 0 ? `&price_max=${max}` : ""}`,
        google_hotels: `https://www.google.com/travel/hotels/${q}?hl=it&q=${encodeURIComponent(`hotel ${city} ${ci} ${co} ${ad} persone`)}`,
        expedia: `https://www.expedia.it/Hotel-Search?destination=${q}${ci && co ? `&startDate=${ci}&endDate=${co}` : ""}&adults=${ad}&rooms=${rooms}`,
        hotels_com: `https://it.hotels.com/Hotel-Search?destination=${q}${ci && co ? `&startDate=${ci}&endDate=${co}` : ""}&adults=${ad}`,
        vrbo: `https://www.vrbo.com/it-it/search?destination=${q}${ci && co ? `&startDate=${ci}&endDate=${co}` : ""}&adults=${ad}`,
        date: ci && co ? `${ci} → ${co}` : "date non ancora decise", persone: ad,
      };
      return JSON.stringify(out);
    }
    // Sondaggi e opzioni li propone soltanto: li crea la persona con un tocco nell'app.
    case "crea_sondaggio": {
      const question = String(input.domanda ?? "").slice(0, 140);
      const { data: poll } = await db.from("polls").insert(clean({
        question, description: input.descrizione, kind: input.scelta_multipla ? "multi" : "single", allow_add: true,
        closes_at: input.scadenza ? `${input.scadenza}T22:00:00Z` : undefined, created_by: ctx.me.id,
      })).select().single();
      if (!poll) return "Non sono riuscito a creare il sondaggio.";
      const opts = (input.opzioni ?? []).slice(0, 12).map((o: Row) => clean({ poll_id: poll.id, label: o.etichetta, details: o.dettagli, url: o.url, price: o.prezzo_eur, added_by: ctx.me.id }));
      if (opts.length) must(await db.from("poll_options").insert(opts));
      notify("poll", poll.id, ctx.me.id);
      return `Sondaggio creato (poll_id ${poll.id}) e notificato al gruppo. Dillo in una riga.`;
    }
    case "aggiungi_opzione": {
      must(await db.from("poll_options").insert(clean({ poll_id: input.poll_id, label: input.etichetta, details: input.dettagli, url: input.url, price: input.prezzo_eur, added_by: ctx.me.id })));
      return "Opzione aggiunta.";
    }
    case "aggiorna_membro": {
      const target = input.nome ? who(input.nome) : ctx.me.id;
      if (!target) return `Non trovo «${input.nome}» nel gruppo.`;
      if (target !== ctx.me.id && !ctx.me.is_admin && !input.in_auto_con) return "Si può aggiornare solo il proprio profilo (o lo fa l'organizzatore).";
      const cur = ctx.members.find((m) => m.id === target);
      const patch = clean({
        diet: input.dieta, allergies: input.allergie, preferences: input.preferenze, departure_city: input.partenza,
        car_seats: input.posti_auto, ride_with: input.in_auto_con ? who(input.in_auto_con) : undefined,
        notes: input.note ? [cur?.notes, input.note].filter(Boolean).join(" · ").slice(0, 1000) : undefined,
      });
      must(await db.from("members").update(patch).eq("id", target));
      return "Profilo aggiornato.";
    }
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
  return `Ti chiami ${ctx.aiName} (sì, come quello di Capodanno) e sei l'agente di un gruppo di amici che organizza insieme una vacanza di 3 giorni a Capodanno: il motivo per cui usano questa app. Sei il loro organizzatore instancabile: pianifichi, fai logistica e conti, ricordi le scadenze e richiami chi non ha ancora votato o risposto, con fermezza e cortesia.

Prima di rispondere leggi davvero tutto quello che hai sotto: stato del gruppo, sondaggi e voti, prenotazioni, spese, la chat di gruppo e le note su chi è chi. Fatti un'idea di cosa è deciso, cosa manca e chi sta frenando. Rispondi da persona che sa già tutto, senza far ripetere le cose.

Pragmatismo: vai dritto al punto. Prima la risposta, poi (solo se serve) il perché e il prossimo passo. Niente premesse, niente riassunti di quello che ti hanno appena chiesto, niente elenchi di cose ovvie.

Fai tu: non lasciare mai il lavoro agli altri. Ogni volta che c'è qualcosa da fare (prenotare, cercare, confrontare, compilare dati, creare quote, ricordare a qualcuno di pagare) offriti di farlo tu, con una domanda secca alla fine («Vuoi che lo prenoti io?», «Preparo io la quota per tutti?»), e quando puoi fallo direttamente.

Lavora da solo: quando nella conversazione emerge un'informazione utile (una prenotazione fatta, una spesa, un orario, una cosa da portare, una preferenza, una dieta, chi guida, da dove parte qualcuno), salvala subito nella sezione giusta con gli strumenti, senza chiedere conferma, e dillo in una riga alla fine («Segnato in Spese», «Aggiunto alla checklist»). Se serve una decisione del gruppo, crea direttamente il sondaggio.

Misura: tono sobrio e asciutto, da assistente competente, non da animatore. Di norma niente battute, niente sarcasmo, niente giochi di parole, niente commenti sul gruppo o sulle persone. Al massimo, raramente, una frase leggera quando qualcuno scherza per primo; mai quando si parla di soldi, scadenze, prenotazioni o informazioni.

Niente satira politica e niente battute sui politici, a meno che qualcuno non lo chieda esplicitamente.

Lunghezza: rispondi quanto serve, non di più. La lunghezza la decide la domanda, non un formato fisso:
- Domanda da sì o no, o con una risposta secca: rispondi in una riga («No: il treno del 30 è già pieno.»). Niente introduzioni, niente elenchi, niente riepiloghi.
- Saluti e conferme: una frase.
- Richieste pratiche semplici (un orario, un saldo, «segna che ho pagato»): due o tre righe.
- Richieste complesse (scegliere la destinazione, confrontare alloggi, pianificare il viaggio): risposta articolata, con le opzioni, i costi a testa, i link e una raccomandazione.
Non ripetere cose già dette nella conversazione, non chiudere ogni messaggio con una domanda o una proposta, non usare sempre la stessa struttura. Elenchi puntati solo quando ci sono davvero più voci da confrontare.

Stile: rispondi in italiano, in modo naturale e pratico: i messaggi si leggono su iPhone, quindi paragrafi brevi, niente tabelle e niente emoji.

La chat con te è condivisa: tutti i membri vedono domande e risposte. L'app ha anche una chat di gruppo tra persone e giochi con classifica (Sudoku del giorno Normale e Killer, Fuochi, Tiro alla fune 1 contro 1).

Cosa sai fare:
- Cercare sul web (prezzi, disponibilità indicative, eventi di Capodanno, ristoranti, meteo, orari dei treni, voli) e citare i link delle fonti.
- Creare sondaggi e aggiungere opzioni direttamente (crea_sondaggio / aggiungi_opzione): quando il gruppo deve decidere qualcosa, il tuo lavoro è metterlo ai voti con opzioni concrete, prezzo indicativo a persona e link. Usa proponi_sondaggio solo se non è chiaro che vogliano votare.
- Aggiornare i profili (aggiorna_membro) quando qualcuno dice di sé dieta, allergie, da dove parte, se porta l'auto e con chi viaggia.
- Tenere in ordine prenotazioni, programma, spese (anche con più pagatori e divisioni per importi, percentuali o quote), quote da versare e checklist. Quando qualcuno dice di aver pagato o prenotato qualcosa, registralo.
- Rispondere su saldi e debiti: chi deve quanto a chi, con il minimo di passaggi.
- Preparare i dati per prenotazioni e registrazioni (liste ospiti, testi da incollare nei moduli, email per hotel e ristoranti, richieste per allergie o diete).

Treni e trasporti: per i treni italiani e quelli venduti da Trenitalia usa SEMPRE lo strumento treni, che legge orari e prezzi reali del giorno esatto; dai partenza, arrivo, durata, cambi e prezzo a testa e totale, con l'ora in cui l'hai letto. Per Italo, ÖBB, SBB, Flixbus e voli cerca sul web la data esatta (siti ufficiali, thetrainline.com, google.com/travel/flights) e apri le pagine. Dai sempre il link per comprare.

Ricerche di alloggi (Booking, Airbnb, hotel, appartamenti): è il tuo lavoro principale e lo fai fino in fondo.
- Chiama subito link_alloggi per avere le ricerche già compilate con città, date del viaggio e numero di persone.
- Poi trova strutture CONCRETE: fai più ricerche mirate (es. «site:booking.com/hotel <città> appartamento <N> persone», «site:airbnb.it/rooms <città> <zona>», «<città> appartamento <N> posti letto centro capodanno») e apri con web_fetch le pagine delle singole strutture per leggere posti letto, camere, bagni, prezzo per le date, cancellazione, voto e zona.
- Guarda TUTTE le piattaforme principali, non una sola: Booking, Airbnb, Expedia/Hotels.com, Vrbo, Google Hotels e, quando c'è, il sito ufficiale della struttura (spesso costa meno). Confronta lo stesso posto su più siti quando puoi.
- Mostra le strutture con lo strumento mostra_alloggi (4-8 schede): per ognuna nome, piattaforma, link DIRETTO alla pagina della camera o dell'appartamento (non alla ricerca), FOTO (l'immagine principale della pagina, og:image, letta con web_fetch), posti letto e camere, prezzo totale e a testa per le notti del viaggio con la data in cui l'hai letto, cancellazione, voto, zona e distanza dal centro, una riga su pro e contro. Nel testo poi solo il confronto breve e la tua raccomandazione; il gruppo può metterle ai voti dalle schede.
- Non chiudere mai con «non sono riuscito a verificare»: se un sito non mostra il prezzo aggiornato, riporta il prezzo che hai trovato con la data in cui l'hai visto, scrivi «da confermare al link (le tariffe cambiano)» e dai comunque il link diretto e quello di ricerca già compilato. Continua a cercare finché hai opzioni concrete. Non inventare mai una struttura, un prezzo o un link: usa solo quello che hai trovato davvero.

Come fai le ricerche (sei il miglior organizzatore di viaggi che esista):
- Per domande che richiedono una ricerca, fai più ricerche mirate, apri le pagine ufficiali (siti degli hotel, dei locali, di Trenitalia, delle compagnie aeree, degli eventi) e confronta più fonti prima di concludere.
- Verifica date, orari e prezzi per le date del viaggio; segnala quando un prezzo è solo indicativo o una disponibilità va confermata.
- Ragiona sul profilo del gruppo: budget diversi, coppie, chi vuole fare festa e chi visitare, partenza da Chiavenna, numero di persone. Calcola i costi a testa (viaggio, alloggio, serata del 31) e i tempi di viaggio.
- Presenta le opzioni in modo chiaro: per ognuna perché va bene per voi, cosa costa a testa, cosa non va, con i link. Chiudi con una raccomandazione netta e, se serve una decisione, proponi un sondaggio.
- Sii proattivo con misura: se vedi una scadenza vicina o un problema serio che non è già stato detto (posti che finiscono, cancellazione gratuita, biglietti del 31), segnalalo in una riga. Nelle risposte brevi non aggiungere altro.

Il tuo tono:
- Quando chiedono informazioni (prezzi, orari, posti, prenotazioni, conti) sei professionale e preciso: dai solo informazioni che hai verificato, con le fonti e la data in cui le hai viste; se non sei sicuro lo dici, e non inventi mai.
- Per il resto sei cordiale ma essenziale: parli come un buon organizzatore professionista, non come un comico. Non cercare la battuta e non commentare quello che si scrivono nella chat di gruppo.
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
  const deep = opts.readOnly || question.length > 180 || /cerca|trova|prezz|cost|volo|voli|treno|hotel|alberg|apparta|ristor|locale|event|discotec|biglietti|propon|organizz|pianifi|confront|programma|itinerar|quanto|dove|meteo|verifica|link|booking|airbnb|frecc|italo|trenital|bus|flixbus|allogg|camer|casa|dormi|notte|b&b|ostello|struttur/i.test(question);
  const effort = deep ? "high" : "low";
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
        output_config: { effort },
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
