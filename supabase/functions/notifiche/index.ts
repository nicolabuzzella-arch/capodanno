// Capodanno - notifiche push (Supabase Edge Function, con "Verify JWT" disattivato).
// Le chiavi VAPID si creano da sole al primo avvio e restano nella tabella app_secrets,
// che nessuno può leggere dall'app. Chiamate accettate:
//   { type: "vapid" }                         chiave pubblica per iscriversi (libera)
//   { type: "event", event, id? }             da un membro dell'app o dall'assistente
//   { type: "daily" }                         promemoria serale, dal cron del database
//   { type: "test" }                          notifica di prova a se stessi

import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const APP_URL = "https://nicolabuzzella-arch.github.io/capodanno/";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal, x-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
// cat: categoria facoltativa (chat, giochi) che ognuno può silenziare; senza cat la notifica arriva sempre.
interface Note { title: string; body: string; url: string; tag?: string; cat?: string }

// ───────────────────────── Chiavi e invio ─────────────────────────

let serverPromise: Promise<{ app: webpush.ApplicationServer; publicKey: string }> | null = null;
function server() {
  serverPromise ??= (async () => {
    const { data } = await db.from("app_secrets").select("value").eq("key", "vapid").maybeSingle();
    let exported = data ? JSON.parse(data.value) : null;
    if (!exported) {
      exported = await webpush.exportVapidKeys(await webpush.generateVapidKeys({ extractable: true }));
      // Se due richieste arrivano insieme vince la prima: rileggiamo quella salvata.
      await db.from("app_secrets").upsert({ key: "vapid", value: JSON.stringify(exported) }, { onConflict: "key", ignoreDuplicates: true });
      const again = await db.from("app_secrets").select("value").eq("key", "vapid").single();
      exported = JSON.parse(again.data!.value);
    }
    const keys = await webpush.importVapidKeys(exported, { extractable: false });
    const app = await webpush.ApplicationServer.new({ contactInformation: APP_URL, vapidKeys: keys });
    return { app, publicKey: await webpush.exportApplicationServerKey(keys) };
  })().catch((e) => { serverPromise = null; throw e; });
  return serverPromise;
}

async function send(memberIds: string[], note: Note): Promise<number> {
  let ids = [...new Set(memberIds)];
  if (note.cat && ids.length) {
    const { data: prefs } = await db.from("members").select("id,notif").in("id", ids);
    const off = new Set((prefs ?? []).filter((m) => m.notif?.[note.cat!] === "off").map((m) => m.id));
    ids = ids.filter((id) => !off.has(id));
  }
  if (!ids.length) return 0;
  const { data: subs } = await db.from("push_subscriptions").select("*").in("member_id", ids);
  if (!subs?.length) return 0;
  const { app } = await server();
  const payload = JSON.stringify({ title: note.title, body: note.body, tag: note.tag, url: APP_URL + note.url });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(payload, { ttl: 60 * 60 * 24, urgency: webpush.Urgency.Normal, topic: note.tag });
      sent++;
    } catch (e) {
      // Iscrizione scaduta o revocata: la togliamo.
      if (e instanceof webpush.PushMessageError && [404, 410].includes(e.response.status)) {
        await db.from("push_subscriptions").delete().eq("id", s.id);
      } else console.error("push", s.endpoint.slice(0, 40), String(e));
    }
  }));
  return sent;
}

// Alle 14:30: a chi manca ancora qualcosa nel profilo, un promemoria gentile con il conto di cosa manca.
async function profileReminder(): Promise<number> {
  const { data: ms } = await db.from("members").select("id,name,phone,diet,allergies,departure_city,avatar_url,paypal,iban,satispay,emergency_phone");
  const { data: priv } = await db.from("member_private").select("member_id,doc_number,fiscal_code");
  let sent = 0;
  for (const m of ms ?? []) {
    const p: { doc_number?: string } = (priv ?? []).find((x) => x.member_id === m.id) ?? {};
    const miss = [!m.avatar_url && "foto", !m.phone && "numero", !m.diet && "dieta", !m.allergies && "allergie", !m.departure_city && "città di partenza",
      !(m.paypal || m.iban || m.satispay) && "come ricevere i soldi", !m.emergency_phone && "contatto di emergenza", !p.doc_number && "documento"].filter(Boolean) as string[];
    if (!miss.length) continue;
    sent += await send([m.id], {
      title: `${m.name}, ti mancano ${miss.length} ${miss.length === 1 ? "cosa" : "cose"}`,
      body: `${miss.slice(0, 3).join(", ")}${miss.length > 3 ? "…" : ""}. Due minuti, una domanda alla volta: così prenotare è veloce per tutti.`,
      url: "?tab=profilo", tag: "profilo",
    });
  }
  return sent;
}

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const cut = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ───────────────────────── Eventi ─────────────────────────

async function members(): Promise<Row[]> {
  return (await db.from("members").select("id,name,rsvp,is_admin")).data ?? [];
}

async function handleEvent(event: string, id: string | undefined, actor: string | null): Promise<number> {
  const all = await members();
  const name = (mid: string | null) => all.find((m) => m.id === mid)?.name ?? "Qualcuno";
  const others = all.filter((m) => m.id !== actor && m.rsvp !== "no").map((m) => m.id);

  switch (event) {
    case "poll": {
      const { data: p } = await db.from("polls").select("*").eq("id", id).single();
      if (!p) return 0;
      return send(others, { title: "È bloccante: vota!", body: `${cut(p.question)} (sondaggio di ${name(p.created_by)}). Senza il tuo voto il gruppo non decide.`, url: "?tab=vota", tag: "poll" });
    }
    case "polls_batch":
      return send(others, { title: "È bloccante: vota!", body: "Ci sono nuovi sondaggi su destinazione, date e budget: senza il tuo voto il gruppo non decide.", url: "?tab=vota", tag: "poll" });
    case "remind_poll": {
      const { data: p } = await db.from("polls").select("*").eq("id", id).single();
      if (!p || p.status !== "open") return 0;
      const { data: v } = await db.from("votes").select("member_id").eq("poll_id", id);
      const voted = new Set((v ?? []).map((x) => x.member_id));
      const missing = all.filter((m) => m.rsvp !== "no" && !voted.has(m.id) && m.id !== actor).map((m) => m.id);
      return send(missing, { title: "Manca il tuo voto", body: cut(p.question), url: "?tab=vota", tag: "poll-" + id });
    }
    case "request":
    case "remind_request": {
      const { data: r } = await db.from("payment_requests").select("*").eq("id", id).single();
      if (!r) return 0;
      const { data: paidRows } = await db.from("expenses").select("payers").eq("request_id", id);
      const paid = new Set((paidRows ?? []).flatMap((e) => Object.keys(e.payers ?? {})));
      const due = (r.debtors ?? []).filter((d: string) => d !== r.pay_to && d !== actor && !paid.has(d));
      return send(due, {
        title: event === "request" ? "Quota da versare" : "Promemoria quota",
        body: `${euro(r.amount)} a ${name(r.pay_to)} per «${cut(r.title, 60)}»${r.due_date ? `, entro il ${new Date(r.due_date + "T12:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" })}` : ""}.`,
        url: "?tab=spese&seg=requests", tag: "req-" + id,
      });
    }
    case "chat": {
      const { data: m } = await db.from("messages").select("*").eq("id", id).single();
      if (!m || m.channel !== "gruppo") return 0;
      // Chi viene menzionato con @Nome riceve sempre la notifica, anche se ha spento quelle della chat.
      const low = String(m.content ?? "").toLowerCase();
      const everyone = /@(tutti|all)(?![\p{L}\d])/iu.test(low);
      const tagged = all.filter((x) => x.id !== m.member_id && (everyone || String(x.name ?? "").trim() &&
        new RegExp(`@${String(x.name).trim().split(/\s+/)[0].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "u").test(low))).map((x) => x.id);
      let sent = 0;
      if (tagged.length) sent += await send(tagged, { title: `${name(m.member_id)} ti ha menzionato`, body: cut(m.content), url: "?tab=chat", tag: "mention-" + m.id });
      return sent + await send(others.filter((x) => x !== m.member_id && !tagged.includes(x)), { title: name(m.member_id), body: cut(m.content), url: "?tab=chat", tag: "chat", cat: "chat" });
    }
    case "feedback": {
      const { data: f } = await db.from("feedback").select("*").eq("id", id).single();
      if (!f) return 0;
      const admins = all.filter((m) => m.is_admin && m.id !== actor).map((m) => m.id);
      return send(admins, { title: `Suggerimento da ${name(f.member_id)}`, body: cut(f.text), url: "?tab=gruppo", tag: "feedback" });
    }
    case "duel": {
      // id = la persona sfidata.
      if (!id || id === actor) return 0;
      return send([id], { title: `${name(actor)} ti sfida`, body: "Tiro alla fune: apri l'app entro un minuto per accettare.", url: "?tab=giochi", tag: "duel", cat: "giochi" });
    }
    case "chess": {
      // id = la partita appena proposta.
      const { data: g } = await db.from("chess_games").select("*").eq("id", id).single();
      if (!g || g.status !== "invited" || g.created_by !== actor) return 0;
      const opp = g.white === actor ? g.black : g.white;
      const tc = ({ "3+2": "3+2", "5+5": "5+5", "10+0": "10 minuti" } as Record<string, string>)[g.tc] ?? g.tc;
      return send([opp], { title: `${name(actor)} ti sfida a scacchi`, body: `Partita ${tc}: apri l'app per accettare.`, url: `?tab=giochi&chess=${g.id}`, tag: "chess-" + g.id, cat: "giochi" });
    }
    case "scopa": {
      // id = il tavolo appena creato: avvisa gli altri tre.
      const { data: g } = await db.from("card_games").select("*").eq("id", id).single();
      if (!g || g.status !== "invited" || g.created_by !== actor) return 0;
      return send((g.players as string[]).filter((p) => p !== actor), { title: `${name(actor)} ti chiama a scopa d'assi`, body: `Si gioca in quattro, a ${g.settings?.target ?? 21} punti: apri l'app e rispondi.`, url: "?tab=giochi", tag: "scopa-" + g.id, cat: "giochi" });
    }
    case "tavolo": {
      const { data: g } = await db.from("tavoli").select("*").eq("id", id).maybeSingle();
      if (!g || g.status !== "invited") return 0;
      const nome = g.kind === "poker" ? "Texas Hold'em" : "Chiavenna Express";
      return send(g.players.filter((p: string) => p !== actor), { title: `${name(actor)} ti invita a ${nome}`, body: "Apri l'app e siediti al tavolo.", url: "?tab=giochi", tag: "tavolo-" + g.id, cat: "giochi" });
    }
    case "email_request": {
      const { data: e } = await db.from("emails").select("to_addr,subject").eq("id", id).maybeSingle();
      if (!e) return 0;
      const admins = all.filter((m) => m.is_admin && m.id !== actor).map((m) => m.id);
      return send(admins, { title: actor ? `${name(actor)} chiede di inviare un'email` : "Email pronta da approvare", body: `A ${e.to_addr}: ${cut(e.subject ?? "")}`, url: "?tab=mail", tag: "email-req-" + id });
    }
    case "email": {
      const { data: e } = await db.from("emails").select("from_name,from_addr,subject").eq("id", id).maybeSingle();
      if (!e) return 0;
      return send(all.map((m) => m.id), { title: `Nuova email da ${e.from_name || e.from_addr}`, body: cut(e.subject ?? ""), url: "?tab=mail", tag: "email-" + id });
    }
    case "sfida": {
      // Duelli generici (Miniera, GeoScatto): id = la sfida appena creata.
      const { data: g } = await db.from("duels").select("*").eq("id", id).maybeSingle();
      if (!g || g.status !== "invited" || g.created_by !== actor) return 0;
      const nome = g.kind === "miniera" ? "Miniera" : g.kind === "onorevoli" ? "Onorevoli" : "GeoScatto";
      return send([g.players[1]], { title: `${name(actor)} ti sfida a ${nome}`, body: "Apri l'app e accetta, se hai il coraggio.", url: "?tab=giochi", tag: "duel-" + g.id, cat: "giochi" });
    }
    case "booking": {
      const { data: b } = await db.from("bookings").select("*").eq("id", id).single();
      if (!b) return 0;
      return send(others, { title: "Prenotazione confermata", body: `${cut(b.title, 80)}${b.code ? ` · codice ${b.code}` : ""}`, url: "?tab=piano", tag: "booking-" + id });
    }
  }
  return 0;
}

// Stesso calcolo dell'app: saldi in centesimi e poi il minimo di passaggi tra chi deve e chi riceve.
function settle(expenses: Row[]) {
  const bal = new Map<string, number>();
  for (const e of expenses) {
    for (const [id, v] of Object.entries(e.payers ?? {})) bal.set(id, (bal.get(id) ?? 0) + Math.round(Number(v) * 100));
    for (const [id, v] of Object.entries(e.owed ?? {})) bal.set(id, (bal.get(id) ?? 0) - Math.round(Number(v) * 100));
  }
  const cred = [...bal].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c })).sort((a, b) => b.c - a.c);
  const debt = [...bal].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c })).sort((a, b) => b.c - a.c);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const a = Math.min(debt[i].c, cred[j].c);
    if (a > 0) out.push({ from: debt[i].id, to: cred[j].id, amount: a / 100 });
    debt[i].c -= a; cred[j].c -= a;
    if (!debt[i].c) i++;
    if (!cred[j].c) j++;
  }
  return out;
}

// Richiamo all'ordine nella chat di gruppo, con misura: al massimo un messaggio al giorno,
// e per ogni sondaggio non più di uno ogni tre giorni, solo se è aperto da almeno due giorni.
async function nudgeGroup(polls: Row[], votes: Row[], all: Row[], ai: string) {
  const now = Date.now();
  const candidates = polls.map((p) => {
    const voted = new Set(votes.filter((v) => v.poll_id === p.id).map((v) => v.member_id));
    const missing = all.filter((m) => m.rsvp !== "no" && !voted.has(m.id));
    return { p, missing };
  }).filter(({ p, missing }) => missing.length && missing.length < all.length &&
    now - new Date(p.created_at).getTime() > 48 * 3600e3 &&
    (!p.nudged_at || now - new Date(p.nudged_at).getTime() > 72 * 3600e3))
    .sort((a, b) => b.missing.length - a.missing.length);
  const pick = candidates[0];
  if (!pick) return;
  const names = pick.missing.map((m) => m.name);
  const who = names.length > 3 ? `${names.slice(0, 3).join(", ")} e altri ${names.length - 3}` : names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : names[0];
  const q = cut(pick.p.question, 70);
  const lines = [
    `«${q}»: mancano ancora ${who}. Il resto del gruppo vi aspetta, senza fretta. Ma con fretta.`,
    `Piccolo richiamo all'ordine: «${q}» aspetta il voto di ${who}. Bastano due secondi, li ho cronometrati.`,
    `${who}: «${q}» non si vota da solo. Ci siete quasi tutti.`,
  ];
  const text = lines[Math.floor(now / 864e5) % lines.length];
  await db.from("messages").insert({ member_id: null, role: "assistant", channel: "gruppo", content: text });
  await db.from("polls").update({ nudged_at: new Date().toISOString() }).eq("id", pick.p.id);
  console.log(ai, "richiamo", pick.p.id);
}

// Promemoria serale: a ognuno solo le cose che aspettano una sua risposta.
async function daily(): Promise<number> {
  const all = await members();
  const [polls, votes, reqs, exps, checks, bookings, allExp, trip] = await Promise.all([
    db.from("polls").select("id,question,closes_at,created_at,nudged_at").eq("status", "open"),
    db.from("votes").select("poll_id,member_id"),
    db.from("payment_requests").select("*"),
    db.from("expenses").select("request_id,payers").not("request_id", "is", null),
    db.from("checklist").select("text,assignee").eq("done", false),
    db.from("bookings").select("title,cancel_by,status").neq("status", "annullato"),
    db.from("expenses").select("payers,owed"),
    db.from("trip").select("end_date,ai_name").eq("id", 1).maybeSingle(),
  ]);
  const ai = trip.data?.ai_name || "Zampone";
  await nudgeGroup(polls.data ?? [], votes.data ?? [], all, ai);
  // A vacanza finita: chi deve ancora soldi riceve il suo pezzo del piano «minimo di pagamenti».
  const todayIt = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const plan = trip.data?.end_date && todayIt >= trip.data.end_date ? settle(allExp.data ?? []) : [];
  const now = Date.now();
  let sent = 0;
  for (const m of all.filter((x) => x.rsvp !== "no")) {
    const lines: string[] = [];
    const toVote = (polls.data ?? []).filter((p) => !(votes.data ?? []).some((v) => v.poll_id === p.id && v.member_id === m.id));
    if (toVote.length) {
      const soon = toVote.find((p) => p.closes_at && new Date(p.closes_at).getTime() - now < 36 * 3600e3);
      lines.push(soon ? `Si chiude a breve: «${cut(soon.question, 50)}»` : `${toVote.length} ${toVote.length === 1 ? "sondaggio da votare" : "sondaggi da votare"}`);
    }
    const owed = (reqs.data ?? []).filter((r) => (r.debtors ?? []).includes(m.id) && r.pay_to !== m.id &&
      !(exps.data ?? []).some((e) => e.request_id === r.id && Object.keys(e.payers ?? {}).includes(m.id)));
    if (owed.length) lines.push(`Quote da versare: ${euro(owed.reduce((s, r) => s + Number(r.amount), 0))}`);
    const tasks = (checks.data ?? []).filter((c) => c.assignee === m.id);
    const toPay = plan.filter((p) => p.from === m.id);
    if (toPay.length) lines.push(`Per chiudere i conti: ${toPay.map((p) => `${euro(p.amount)} a ${all.find((x) => x.id === p.to)?.name ?? "?"}`).join(", ")}`);
    if (tasks.length) lines.push(`${tasks.length} ${tasks.length === 1 ? "cosa da fare" : "cose da fare"} in checklist`);
    if (m.is_admin) {
      const dl = (bookings.data ?? []).filter((b) => b.cancel_by && (new Date(b.cancel_by + "T23:59").getTime() - now) / 864e5 < 3 && new Date(b.cancel_by + "T23:59").getTime() > now);
      if (dl.length) lines.push(`Cancellazione gratuita in scadenza: ${cut(dl.map((b) => b.title).join(", "), 60)}`);
    }
    if (lines.length) sent += await send([m.id], { title: `${ai} ti cerca`, body: lines.join("\n"), url: toVote.length ? "?tab=vota" : toPay.length ? "?tab=spese" : "", tag: "daily" });
  }
  return sent;
}

// ───────────────────────── Ingresso ─────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non supportato" }, 405);
  try {
    const body = await req.json().catch(() => ({}));

    if (body.type === "vapid") return json({ publicKey: (await server()).publicKey });

    if (body.type === "daily" || body.type === "profili") {
      const { data } = await db.from("app_secrets").select("value").eq("key", "cron").maybeSingle();
      if (!data || req.headers.get("x-cron") !== data.value) return json({ error: "Non autorizzato" }, 401);
      return json({ sent: body.type === "daily" ? await daily() : await profileReminder() });
    }

    // Chi chiama: l'assistente (chiave di servizio) oppure un membro dell'app.
    let actor: string | null = null;
    if (req.headers.get("x-internal") !== SERVICE_KEY) {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth } = await db.auth.getUser(jwt);
      if (!auth?.user) return json({ error: "Non autenticato" }, 401);
      const { data: device } = await db.from("devices").select("member_id").eq("user_id", auth.user.id).maybeSingle();
      if (!device) return json({ error: "Non fai parte del gruppo" }, 403);
      actor = device.member_id;
    } else actor = body.actor ?? null;

    if (body.type === "test") {
      const n = await send([actor!], { title: "Notifiche attive", body: "Da ora ti avvisiamo quando c'è qualcosa che aspetta una tua risposta.", url: "", tag: "test" });
      return json({ sent: n });
    }
    if (body.type === "event") return json({ sent: await handleEvent(String(body.event), body.id, actor) });
    return json({ error: "Richiesta sconosciuta" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Errore nelle notifiche" }, 500);
  }
});
