/* Capodanno - casella email del gruppo.
   Una casella Gmail dedicata, collegata dalla funzione «posta»: tutti vedono le email arrivate e inviate,
   rispondono o ne scrivono di nuove dall'app. Zampone legge ogni email nuova, avvisa il gruppo e prepara
   bozze di risposta che una persona invia con un tocco. */
"use strict";

const MAIL = { seg: "in", info: null, asked: false };
const mails = () => [...(S.emails || [])].sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
const mailUnread = () => mails().filter(e => e.direction === "in" && !(e.read_by || []).includes(ME));
window.mailUnreadCount = () => mailUnread().length;
const mailWho = e => (e.direction === "in" ? e.from_name || e.from_addr : `a ${e.to_addr}`);
const mailWhen = iso => { const d = new Date(iso), now = new Date(); return d.toDateString() === now.toDateString() ? fmtTime(iso) : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }); };
async function posta(body) {
  const { data, error } = await api.sb.functions.invoke("posta", { body });
  if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { /* messaggio generico */ } throw new Error(msg); }
  if (data?.error) throw new Error(data.error);
  return data;
}
async function mailInfo() {
  if (MAIL.asked || !CLOUD) return; MAIL.asked = true;
  try { MAIL.info = await posta({ action: "info" }); const el = $("#mail-addr"); if (el) el.innerHTML = mailAddrHtml(); } catch (e) { MAIL.info = { error: e.message }; const el = $("#mail-addr"); if (el) el.innerHTML = mailAddrHtml(); }
}
const mailAddrHtml = () => MAIL.info?.address
  ? `<div class="mail-addr-t">${esc(MAIL.info.address)}</div><button class="btn icon sm mail-copy" data-act="mail-copy" aria-label="Copia indirizzo">${ico("copy", 14)}</button>`
  : MAIL.info?.error ? `<div class="small muted">Casella non ancora collegata: ${esc(MAIL.info.error)}</div>` : `<div class="small faint">Carico l'indirizzo…</div>`;

EXTRA_VIEWS.mail = {
  title: "Mail", sub: "La casella del gruppo",
  view() {
    if (!CLOUD) return `<section class="card"><div class="small muted">La casella email funziona con il database collegato.</div></section>`;
    const list = mails(), drafts = list.filter(e => e.direction === "draft");
    const seg = MAIL.seg, shown = list.filter(e => e.direction === seg);
    const unread = mailUnread().length;
    return `<section class="card mail-head"><div class="row" style="gap:12px">${ico("mail", 22)}<div class="grow" id="mail-addr">${mailAddrHtml()}</div></div>
      <div class="small muted" style="margin-top:8px">Date questo indirizzo a hotel, ristoranti e locali: le risposte arrivano qui per tutti e ${AI()} vi avvisa.</div>
      <button class="btn block mail-ai" data-act="mail-zampone">${ico("spark", 16)}Fai scrivere a ${esc(AI())}</button>
      <div class="grid2" style="margin-top:12px;gap:8px"><button class="btn pearl block" data-act="mail-new">${ico("edit", 16)}${isAdmin() ? "Scrivi" : "Proponi un'email"}</button><button class="btn block" data-act="mail-sync">${ico("undo", 16)}Aggiorna</button></div></section>
      <div class="seg mail-seg">${[["in", `Arrivate${unread ? ` · ${unread}` : ""}`], ["out", "Inviate"], ["draft", `Da approvare${drafts.length ? ` · ${drafts.length}` : ""}`]].map(([k, l]) => `<button class="${seg === k ? "on" : ""}" data-act="mail-seg" data-v="${k}">${l}</button>`).join("")}</div>
      ${unread && seg === "in" ? `<button class="link" data-act="mail-allread" style="margin:-4px 4px 8px">${ico("check", 14)}Segna tutte come lette</button>` : ""}
      <section class="card mail-list">${shown.length ? shown.map(e => {
        const un = e.direction === "in" && !(e.read_by || []).includes(ME);
        return `<button class="mail-row ${un ? "unread" : ""}" data-act="mail-open" data-id="${e.id}">
          <span class="mail-av">${esc((mailWho(e).replace(/^a /, "") || "?").trim()[0] || "?").toUpperCase()}</span>
          <span class="grow"><span class="mail-top"><b class="ellipsis">${esc(e.direction === "draft" ? `${e.sent_by ? mname(e.sent_by) : AI()} → ${e.to_addr}` : mailWho(e))}</b><em>${esc(mailWhen(e.received_at))}</em></span>
          <span class="mail-sub ellipsis">${esc(e.subject || "(senza oggetto)")}</span><span class="mail-snip ellipsis">${esc(e.snippet || "")}</span></span>${un ? `<i class="mail-dot"></i>` : ""}</button>`;
      }).join("") : `<div class="small muted" style="padding:6px 2px">${seg === "in" ? "Ancora nessuna email arrivata." : seg === "out" ? "Ancora nessuna email inviata." : `Nessuna email in attesa di approvazione. Chiedi a ${AI()} di scrivere a un hotel o a un ristorante.`}</div>`}</section>`;
  },
  mount() { mailInfo(); },
};

function mailOpen(id) {
  const e = (S.emails || []).find(x => x.id === id); if (!e) return toast("Email non trovata", "alert");
  if (e.direction === "in" && !(e.read_by || []).includes(ME)) { e.read_by = [...(e.read_by || []), ME]; api.sb.rpc("email_read", { p_id: id }).then(() => {}, () => {}); }
  const draft = e.direction === "draft";
  const body = linkify(e.body || e.snippet || "");
  openSheet(`<div class="mail-view">
    ${draft ? `<div class="eyebrow">${e.sent_by ? `Richiesta di ${esc(mname(e.sent_by))}` : `Bozza preparata da ${esc(AI())}`}${isAdmin() ? " · da approvare" : " · in attesa dell'organizzatore"}</div>` : ""}
    <h2 style="margin:4px 0 10px">${esc(e.subject || "(senza oggetto)")}</h2>
    <div class="mail-meta"><div><span>Da</span><b>${esc(e.direction === "in" ? `${e.from_name ? e.from_name + " · " : ""}${e.from_addr}` : `${e.from_name || "Il gruppo"} · ${e.from_addr || MAIL.info?.address || ""}`)}</b></div>
      <div><span>A</span><b>${esc(e.to_addr || "")}</b></div><div><span>Quando</span><b>${esc(fmtDateTime(e.received_at))}</b></div></div>
    <div class="mail-body">${body}</div>
    ${(e.attachments || []).length ? `<div class="mail-att">${ico("file", 15)}${e.attachments.map(f => esc(f.name)).join(", ")} <span class="faint">(apri dalla casella Gmail)</span></div>` : ""}
    <div class="actions" style="flex-wrap:wrap">${draft
      ? isAdmin() ? `<button class="btn" data-act="mail-discard" data-id="${e.id}">${ico("trash", 15)}Rifiuta</button><button class="btn" data-act="mail-edit" data-id="${e.id}">${ico("edit", 15)}Modifica</button><button class="btn primary" data-act="mail-send-draft" data-id="${e.id}">${ico("send", 15)}Approva e invia</button>`
        : `${e.sent_by === ME ? `<button class="btn" data-act="mail-discard" data-id="${e.id}">${ico("trash", 15)}Ritira</button>` : ""}<div class="mail-wait">${ico("clock", 15)}In attesa dell'approvazione di ${esc(firstName(S.members.find(x => x.is_admin)) || "organizzatore")}</div>`
      : `${isAdmin() ? `<button class="btn mail-del" data-act="mail-delete" data-id="${e.id}">${ico("trash", 15)}Elimina</button>` : ""}${e.direction === "in" ? `<button class="btn" data-act="mail-ask" data-id="${e.id}">${ico("spark", 15)}Risposta da ${esc(AI())}</button><button class="btn primary" data-act="mail-reply" data-id="${e.id}">${ico("reply", 15)}Rispondi</button>` : ""}`}</div></div>`);
  if (UI.tab === "mail") setTimeout(() => { if (UI.tab === "mail" && !$("#sheet")?.classList.contains("open")) render(); }, 0);
}
function mailCompose(opts = {}) {
  openSheet(`<h2>${opts.draft ? "Modifica la bozza" : opts.reply ? "Rispondi" : "Nuova email"}</h2>
    <form id="mail-form" class="stack" style="gap:10px">
      <div class="field"><label>A</label><input name="to" type="email" inputmode="email" autocomplete="off" required value="${esc(opts.to || "")}" placeholder="info@hotel.com"></div>
      <div class="field"><label>Oggetto</label><input name="subject" value="${esc(opts.subject || "")}" placeholder="Richiesta disponibilità 30 dicembre – 2 gennaio"></div>
      <div class="field"><label>Testo</label><textarea name="body" rows="10" placeholder="Buongiorno, siamo un gruppo di…">${esc(opts.body || "")}</textarea></div>
      <div class="tiny faint">Parte dall'indirizzo del gruppo${MAIL.info?.address ? ` (${esc(MAIL.info.address)})` : ""}. Tutti vedranno l'email e la risposta.${isAdmin() ? "" : " Solo l'organizzatore può inviare: gli arriva la tua richiesta e la approva con un tocco."}</div>
      <button class="btn pearl block" type="submit">${ico("send", 16)}${isAdmin() ? "Invia" : "Chiedi di inviare"}</button></form>`);
  $("#mail-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target), btn = ev.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Invio…";
    try {
      const payload = { to: String(f.get("to")).trim(), subject: String(f.get("subject")).trim(), body: String(f.get("body")), reply_to: opts.reply || null };
      if (isAdmin()) { await posta({ action: "send", ...payload, draft_id: opts.draft || null }); closeSheet(); toast("Email inviata", "check"); MAIL.seg = "out"; }
      else { await posta({ action: "request", ...payload }); closeSheet(); toast("Richiesta inviata all'organizzatore", "check"); MAIL.seg = "draft"; }
      await reload();
    } catch (e) { toast("Non inviata: " + e.message, "alert"); btn.disabled = false; btn.innerHTML = `${ico("send", 16)}Invia`; }
  });
}
Object.assign(ACTIONS, {
  "mail-seg": el => { MAIL.seg = el.dataset.v; render(); },
  "mail-open": el => mailOpen(el.dataset.id),
  "mail-new": () => mailCompose(),
  "mail-reply": el => { const e = S.emails.find(x => x.id === el.dataset.id); if (!e) return; closeSheet(); mailCompose({ reply: e.id, to: e.from_addr, subject: /^re:/i.test(e.subject || "") ? e.subject : `Re: ${e.subject || ""}`, body: `\n\n— Il gruppo di Capodanno\n\n> ${String(e.body || "").split("\n").slice(0, 30).join("\n> ")}` }); },
  "mail-edit": el => { const e = S.emails.find(x => x.id === el.dataset.id); if (!e) return; closeSheet(); mailCompose({ draft: e.id, to: e.to_addr, subject: e.subject, body: e.body }); },
  async "mail-send-draft"(el) {
    el.disabled = true;
    try { await posta({ action: "send", draft_id: el.dataset.id }); closeSheet(); toast("Email inviata", "check"); await reload(); }
    catch (e) { toast("Non inviata: " + e.message, "alert"); el.disabled = false; }
  },
  async "mail-discard"(el) {
    if (!confirm("Scartare questa bozza?")) return;
    try { await api.sb.rpc("email_discard", { p_id: el.dataset.id }); closeSheet(); await reload(); } catch (e) { toast(e.message, "alert"); }
  },
  "mail-ask": el => { const e = S.emails.find(x => x.id === el.dataset.id); if (!e) return; closeSheet(); UI.chatSeg = "ai"; go("chat"); ask(`Leggi l'email «${e.subject}» di ${e.from_name || e.from_addr} (id ${e.id}) e preparami la bozza di risposta.`, "ai"); },
  async "mail-sync"(el) {
    el.disabled = true;
    try { const r = await posta({ action: "sync" }); toast(r.added ? `${r.added} email nuove` : "Nessuna email nuova", "mail"); await reload(); }
    catch (e) { toast(e.message, "alert"); } finally { el.disabled = false; }
  },
  "mail-zampone": () => {
    openSheet(`<h2>Email scritta da ${esc(AI())}</h2><p class="small muted" style="margin:-6px 0 12px">Digli a chi scrivere e cosa chiedere: prepara la bozza completa (anche in inglese o tedesco) e ${isAdmin() ? "tu la approvi con un tocco" : "l'organizzatore la approva"}.</p>
      <form id="mail-z" class="stack" style="gap:10px"><textarea name="t" rows="5" placeholder="Es. Scrivi all'Hotel Prater (info@prater.at) per chiedere 4 camere triple dal 30 dicembre al 2 gennaio, colazione inclusa, e il prezzo totale"></textarea>
      <button class="btn pearl block">${ico("spark", 16)}Scrivila</button></form>`);
    $("#mail-z").addEventListener("submit", ev => { ev.preventDefault(); const t = String(new FormData(ev.target).get("t") || "").trim(); if (!t) return; closeSheet(); UI.chatSeg = "ai"; go("chat"); ask(`Prepara un'email dalla casella del gruppo: ${t}`, "ai"); });
  },
  async "mail-delete"(el) {
    if (!confirm("Eliminare questa email per tutti? Finisce nel cestino di Gmail, da dove si può recuperare per 30 giorni.")) return;
    el.disabled = true;
    try { await posta({ action: "delete", id: el.dataset.id }); S.emails = (S.emails || []).filter(x => x.id !== el.dataset.id); closeSheet(); toast("Email eliminata", "trash"); await reload(); }
    catch (e) { toast(e.message, "alert"); el.disabled = false; }
  },
  async "mail-allread"() { for (const e of mailUnread()) { e.read_by = [...(e.read_by || []), ME]; api.sb.rpc("email_read", { p_id: e.id }).then(() => {}, () => {}); } render(); },
  "mail-copy": () => { navigator.clipboard?.writeText(MAIL.info?.address || "").then(() => toast("Indirizzo copiato", "copy"), () => {}); },
});
