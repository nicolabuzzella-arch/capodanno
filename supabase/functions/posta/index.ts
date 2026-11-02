// Capodanno - casella email del gruppo (Supabase Edge Function, «Verify JWT» disattivato).
// Usa una casella Gmail dedicata tramite le API ufficiali di Google (HTTPS, nessuna password salvata):
// segreti GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_ADDRESS (+ ANTHROPIC_API_KEY per i riassunti).
// Chiamate:
//   { action: "sync" }                                  dal cron ogni 3 minuti o da un membro (pulsante Aggiorna)
//   { action: "send", to, subject, body, reply_to? }    da un membro: manda una email (anche una bozza di Zampone: draft_id)
//   { action: "info" }                                  indirizzo della casella

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });
const ADDRESS = Deno.env.get("GMAIL_ADDRESS") ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// ───────── Google ─────────
let token: { v: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (token && Date.now() < token.exp) return token.v;
  const id = Deno.env.get("GMAIL_CLIENT_ID"), secret = Deno.env.get("GMAIL_CLIENT_SECRET"), refresh = Deno.env.get("GMAIL_REFRESH_TOKEN");
  if (!id || !secret || !refresh) throw new Error("Casella non collegata: mancano i segreti GMAIL_ su Supabase");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }) });
  const d = await r.json();
  if (!r.ok) throw new Error(`Google ha rifiutato l'accesso (${d.error ?? r.status}): rigenera il refresh token`);
  token = { v: d.access_token, exp: Date.now() + (Number(d.expires_in ?? 3600) - 120) * 1000 };
  return token.v;
}
async function gmail(path: string, init: RequestInit = {}): Promise<Row> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${d.error?.message ?? ""}`);
  return d;
}
const b64urlDecode = (s: string) => { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
const b64urlEncode = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64 = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };
const htmlToText = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
function bodyOf(part: Row): { text: string; html: string; files: Row[] } {
  let text = "", html = "";
  const files: Row[] = [];
  const walk = (p: Row) => {
    if (p.filename && p.body?.attachmentId) files.push({ name: p.filename, size: p.body.size, type: p.mimeType });
    else if (p.mimeType === "text/plain" && p.body?.data && !text) text = b64urlDecode(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64urlDecode(p.body.data);
    (p.parts ?? []).forEach(walk);
  };
  walk(part);
  return { text, html, files };
}
const header = (m: Row, name: string) => (m.payload?.headers ?? []).find((h: Row) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const parseFrom = (v: string) => { const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/); return m ? { name: m[1].trim(), addr: m[2].trim() } : { name: "", addr: v.trim() }; };

// ───────── Sincronizzazione ─────────
async function sync(): Promise<number> {
  const list = await gmail(`messages?maxResults=25&q=${encodeURIComponent("in:anywhere -in:spam -in:trash newer_than:14d")}`);
  const ids: string[] = (list.messages ?? []).map((m: Row) => m.id);
  if (!ids.length) return 0;
  const { data: known } = await db.from("emails").select("gmail_id").in("gmail_id", ids);
  const have = new Set((known ?? []).map((k) => k.gmail_id));
  let added = 0;
  for (const id of ids.filter((i) => !have.has(i)).reverse()) {
    const m = await gmail(`messages/${id}?format=full`);
    const from = parseFrom(header(m, "From"));
    const outgoing = (m.labelIds ?? []).includes("SENT") || (ADDRESS && from.addr.toLowerCase() === ADDRESS.toLowerCase());
    if ((m.labelIds ?? []).includes("DRAFT")) continue;
    const { text, html, files } = bodyOf(m.payload ?? {});
    const body = (text || htmlToText(html)).slice(0, 60000);
    const row = {
      gmail_id: m.id, thread_id: m.threadId, direction: outgoing ? "out" : "in", from_addr: from.addr, from_name: from.name || null,
      to_addr: header(m, "To"), subject: header(m, "Subject") || "(senza oggetto)", snippet: String(m.snippet ?? "").slice(0, 300), body,
      attachments: files, received_at: new Date(Number(m.internalDate)).toISOString(),
    };
    const { data: ins, error } = await db.from("emails").insert(row).select().single();
    if (error) { console.error(error); continue; }
    added++;
    if (!outgoing) await announce(ins);
  }
  return added;
}

// Una email nuova: notifica a tutti e due righe di Zampone nella sua chat.
async function announce(e: Row) {
  fetch(`${SUPA_URL}/functions/v1/notifiche`, { method: "POST", headers: { "Content-Type": "application/json", "x-internal": SERVICE_KEY },
    body: JSON.stringify({ type: "event", event: "email", id: e.id }) }).catch(() => {});
  try {
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const { data: trip } = await db.from("trip").select("ai_name").eq("id", 1).maybeSingle();
    const res = await anthropic.messages.create({
      model: "claude-opus-5-5", max_tokens: 600,
      // deno-lint-ignore no-explicit-any
      output_config: { effort: "low" } as any,
      system: `Sei ${trip?.ai_name ?? "Zampone"}, l'organizzatore di un gruppo di amici che prepara il viaggio di Capodanno. È arrivata un'email nella casella del gruppo. In italiano, tono sobrio: in due o tre righe di' chi scrive, cosa dice di importante (prezzi, disponibilità, scadenze, conferme) e cosa conviene fare adesso, offrendoti di preparare tu la risposta. Niente emoji.`,
      messages: [{ role: "user", content: `Da: ${e.from_name ?? ""} <${e.from_addr}>\nOggetto: ${e.subject}\n\n${String(e.body).slice(0, 6000)}` }],
      // deno-lint-ignore no-explicit-any
    } as any);
    // deno-lint-ignore no-explicit-any
    const text = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (text) await db.from("messages").insert({ member_id: null, role: "assistant", channel: "assistente", content: `**Nuova email** · ${e.subject}\n\n${text}`, meta: { email: e.id } });
  } catch (err) { console.error(err); }
}

// ───────── Invio ─────────
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
async function sendMail(me: string, input: Row): Promise<Row> {
  let to = String(input.to ?? "").trim(), subject = String(input.subject ?? "").trim(), body = String(input.body ?? "");
  let reply: Row | null = null, draft: Row | null = null;
  if (input.draft_id) {
    const { data } = await db.from("emails").select("*").eq("id", input.draft_id).eq("direction", "draft").maybeSingle();
    if (!data) throw new Error("Bozza non trovata");
    draft = data; to ||= data.to_addr; subject ||= data.subject; body ||= data.body;
    if (data.reply_to) input.reply_to = data.reply_to;
  }
  if (input.reply_to) { const { data } = await db.from("emails").select("*").eq("id", input.reply_to).maybeSingle(); reply = data; }
  if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+(\s*,\s*[^@\s,]+@[^@\s,]+\.[^@\s,]+)*$/.test(to)) throw new Error("Indirizzo email non valido");
  if (!subject) subject = reply ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : "(senza oggetto)";
  const { data: who } = await db.from("members").select("name").eq("id", me).maybeSingle();
  let msgId = "";
  if (reply?.gmail_id) { try { const g = await gmail(`messages/${reply.gmail_id}?format=metadata&metadataHeaders=Message-ID`); msgId = header(g, "Message-ID"); } catch { /* senza thread */ } }
  const lines = [
    `To: ${to}`, `Subject: ${encodeHeader(subject)}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64",
    ...(msgId ? [`In-Reply-To: ${msgId}`, `References: ${msgId}`] : []), "", b64(body).replace(/(.{76})/g, "$1\r\n"),
  ];
  const sent = await gmail("messages/send", { method: "POST", body: JSON.stringify({ raw: b64urlEncode(lines.join("\r\n")), ...(reply?.thread_id ? { threadId: reply.thread_id } : {}) }) });
  const row = { gmail_id: sent.id, thread_id: sent.threadId, direction: "out", from_addr: ADDRESS, from_name: who?.name ?? null, to_addr: to, subject, snippet: body.slice(0, 200), body, sent_by: me, reply_to: reply?.id ?? null };
  const { data: ins } = await db.from("emails").insert(row).select().single();
  if (draft) await db.from("emails").delete().eq("id", draft.id);
  return ins ?? row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const { data: secret } = await db.from("app_secrets").select("value").eq("key", "cron").maybeSingle();
    if (secret && req.headers.get("x-cron") === secret.value) return json({ added: await sync() });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth?.user) return json({ error: "Non autenticato" }, 401);
    const { data: device } = await db.from("devices").select("member_id").eq("user_id", auth.user.id).maybeSingle();
    if (!device) return json({ error: "Non fai parte del gruppo" }, 403);
    if (body.action === "info") return json({ address: ADDRESS, ready: !!Deno.env.get("GMAIL_REFRESH_TOKEN") });
    if (body.action === "sync") return json({ added: await sync() });
    const { data: meRow } = await db.from("members").select("is_admin,name").eq("id", device.member_id).maybeSingle();
    if (body.action === "send") {
      if (!meRow?.is_admin) return json({ error: "Solo l'organizzatore può inviare: usa «Chiedi di inviare»" }, 403);
      return json({ ok: true, email: await sendMail(device.member_id, body) });
    }
    // Elimina: solo l'organizzatore. L'email va nel cestino di Gmail (si recupera da lì per 30 giorni) e sparisce dall'app.
    if (body.action === "delete") {
      if (!meRow?.is_admin) return json({ error: "Solo l'organizzatore può eliminare le email" }, 403);
      const { data: e } = await db.from("emails").select("id,gmail_id").eq("id", body.id).maybeSingle();
      if (!e) return json({ ok: true });
      if (e.gmail_id) { try { await gmail(`messages/${e.gmail_id}/trash`, { method: "POST" }); } catch (err) { console.error(err); } }
      await db.from("emails").delete().eq("id", e.id);
      return json({ ok: true });
    }
    // Richiesta di invio da parte di un membro: diventa una bozza che l'organizzatore approva con un tocco.
    if (body.action === "request") {
      const to = String(body.to ?? "").trim();
      if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(to)) return json({ error: "Indirizzo email non valido" }, 400);
      const { data: d, error } = await db.from("emails").insert({ direction: "draft", to_addr: to, from_addr: ADDRESS || null, from_name: meRow?.name ?? null, subject: String(body.subject ?? "").slice(0, 200) || "(senza oggetto)", body: String(body.body ?? "").slice(0, 20000), snippet: String(body.body ?? "").slice(0, 200), reply_to: body.reply_to || null, sent_by: device.member_id }).select().single();
      if (error) return json({ error: error.message }, 500);
      fetch(`${SUPA_URL}/functions/v1/notifiche`, { method: "POST", headers: { "Content-Type": "application/json", "x-internal": SERVICE_KEY }, body: JSON.stringify({ type: "event", event: "email_request", id: d.id, actor: device.member_id }) }).catch(() => {});
      return json({ ok: true, draft: d });
    }
    return json({ error: "Richiesta sconosciuta" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
