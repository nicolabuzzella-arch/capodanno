/* Capodanno - messaggi vocali.
   Chat di gruppo: si registra come su WhatsApp e gli altri lo ascoltano con l'onda e l'avanzamento.
   Zampone e Ascolto: il microfono detta, così l'agente riceve le parole e risponde. */

Object.assign(ICONS, {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>',
});

const VOICE_MAX = 180;   // secondi
const VOICE_BARS = 36;   // barre dell'onda salvate con il messaggio
const V = { mode: null, rec: null, stream: null, chunks: [], start: 0, tick: 0, levels: [], actx: null, analyser: null, buf: null, recog: null, finalText: "", interim: "", sending: false };

const voiceMime = () => ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
  .find(t => window.MediaRecorder?.isTypeSupported?.(t)) || "";
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Microfono al posto della freccia quando il campo è vuoto, come su WhatsApp.
function syncComposerButtons() {
  const empty = !$("#composer-input").value.trim();
  $("#composer-send").hidden = empty;
  $("#composer-mic").hidden = !empty;
  $("#composer-mic").disabled = !!UI.waiting;
}

function recBar(html) {
  const bar = $("#rec-bar");
  bar.hidden = !html;
  $("#composer-form").hidden = !!html;
  bar.innerHTML = html || "";
}

async function startVoice() {
  if (V.mode) return;
  V.seg = UI.chatSeg;
  if (UI.chatSeg === "gruppo") return startRecording();
  return startDictation();
}

// ───────────────────────── Registrazione (chat di gruppo) ─────────────────────────

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Questo telefono non permette di registrare dall'app", "alert");
  try {
    V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    return toast("Serve il permesso del microfono: consentilo nelle impostazioni del telefono", "alert");
  }
  const mime = voiceMime();
  V.mode = "rec"; V.chunks = []; V.levels = []; V.start = Date.now();
  V.rec = new MediaRecorder(V.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
  V.rec.ondataavailable = e => { if (e.data?.size) V.chunks.push(e.data); };
  V.rec.start(250);
  // Livello del microfono per l'onda: dal vivo nella barra, poi salvato con il messaggio.
  try {
    V.actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = V.actx.createMediaStreamSource(V.stream);
    V.analyser = V.actx.createAnalyser(); V.analyser.fftSize = 512;
    V.buf = new Float32Array(V.analyser.fftSize);
    src.connect(V.analyser);
  } catch { V.analyser = null; }
  navigator.vibrate?.(15);
  recBar(`<button type="button" class="btn icon sm" data-act="voice-cancel" aria-label="Annulla">${ico("trash", 18)}</button>
    <span class="rec-dot"></span><span class="num rec-time" id="rec-time">0:00</span>
    <div class="rec-wave" id="rec-wave"></div>
    <button type="button" class="send" data-act="voice-send" aria-label="Invia vocale">${ico("send", 20)}</button>`);
  const wave = $("#rec-wave");
  V.tick = setInterval(() => {
    const s = (Date.now() - V.start) / 1000;
    $("#rec-time").textContent = fmtDur(s);
    let lvl = 0.08;
    if (V.analyser) {
      V.analyser.getFloatTimeDomainData(V.buf);
      let sum = 0; for (const x of V.buf) sum += x * x;
      lvl = Math.min(1, Math.sqrt(sum / V.buf.length) * 4.5);
    }
    V.levels.push(lvl);
    const last = V.levels.slice(-28);
    wave.innerHTML = last.map(l => `<i style="height:${Math.round(12 + l * 88)}%"></i>`).join("");
    if (s >= VOICE_MAX) stopVoice(true);
  }, 90);
}

function waveOf(levels) {
  if (!levels.length) return Array(VOICE_BARS).fill(20);
  const out = [];
  for (let i = 0; i < VOICE_BARS; i++) {
    const a = Math.floor(i * levels.length / VOICE_BARS), b = Math.max(a + 1, Math.floor((i + 1) * levels.length / VOICE_BARS));
    out.push(Math.max(...levels.slice(a, b)));
  }
  const top = Math.max(...out, 0.05);
  return out.map(x => Math.round(14 + 86 * Math.min(1, x / top)));
}

async function stopVoice(send) {
  if (!V.mode || V.sending) return;
  if (V.mode === "dict") return stopDictation(send);
  V.sending = true;
  clearInterval(V.tick);
  const dur = (Date.now() - V.start) / 1000;
  const mime = V.rec.mimeType || voiceMime() || "audio/mp4";
  await new Promise(r => { V.rec.onstop = r; try { V.rec.stop(); } catch { r(); } });
  V.stream.getTracks().forEach(t => t.stop());
  V.actx?.close().catch(() => {});
  const blob = new Blob(V.chunks, { type: mime.split(";")[0] });
  const wave = waveOf(V.levels);
  Object.assign(V, { mode: null, rec: null, stream: null, actx: null, analyser: null, chunks: [], sending: false });
  recBar(null); syncComposerButtons();
  if (!send) return;
  if (dur < 0.7 || blob.size < 800) return toast("Tieni premuto un po' di più: il vocale è troppo corto");
  const reply = UI.replyTo;
  UI.replyTo = null; renderReplyBar();
  try {
    const path = await api.uploadVoice(blob, mime.includes("webm") ? "webm" : "m4a");
    const row = await api.insert("messages", {
      member_id: ME, role: "user", channel: "gruppo", content: `Messaggio vocale (${fmtDur(dur)})`, reply_to: reply || null,
      meta: { voice: { path, dur: Math.round(dur * 10) / 10, wave, mime: blob.type } },
    });
    api.notify("chat", row.id);
    if (CLOUD) { S.messages.push(row); render(); }
  } catch (e) { toast("Vocale non inviato: " + e.message, "alert"); }
}

// ───────────────────────── Dettatura (Zampone e Ascolto) ─────────────────────────

function startDictation() {
  if (!SpeechRec) return toast("Per parlare con " + AI() + " su questo telefono usa il microfono della tastiera", "alert");
  if (UI.waiting) return;
  V.mode = "dict"; V.finalText = ""; V.interim = ""; V.start = Date.now();
  const r = V.recog = new SpeechRec();
  r.lang = "it-IT"; r.continuous = true; r.interimResults = true;
  r.onresult = e => {
    let fin = "", mid = "";
    for (const res of e.results) (res.isFinal ? (fin += res[0].transcript + " ") : (mid += res[0].transcript));
    V.finalText = fin; V.interim = mid;
    const el = $("#dict-text"); if (el) el.textContent = (fin + mid).trim() || "Ti ascolto…";
  };
  r.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { toast("Serve il permesso del microfono e del riconoscimento vocale", "alert"); stopDictation(false); }
  };
  r.onend = () => { if (V.mode === "dict" && V.recog === r) { V.recog = null; const el = $("#dict-hint"); if (el) el.textContent = "Tocca la freccia per inviare"; } };
  try { r.start(); } catch { V.mode = null; return toast("Il microfono non è disponibile in questo momento", "alert"); }
  navigator.vibrate?.(15);
  recBar(`<button type="button" class="btn icon sm" data-act="voice-cancel" aria-label="Annulla">${ico("trash", 18)}</button>
    <span class="rec-dot"></span>
    <div class="grow dict"><div id="dict-text">Ti ascolto…</div><div class="tiny faint" id="dict-hint">${UI.chatSeg === "ascolto" ? "Parla liberamente" : `Parla, ${AI()} ti ascolta`}</div></div>
    <button type="button" class="send" data-act="voice-send" aria-label="Invia">${ico("send", 20)}</button>`);
}

async function stopDictation(send) {
  const r = V.recog;
  V.sending = true;
  if (r) {
    // Si aspetta l'ultimo pezzo riconosciuto prima di inviare.
    await new Promise(res => { const t = setTimeout(res, 1200); r.onend = () => { clearTimeout(t); res(); }; try { send ? r.stop() : r.abort(); } catch { res(); } });
  }
  const text = (V.finalText + " " + V.interim).replace(/\s+/g, " ").trim();
  Object.assign(V, { mode: null, recog: null, finalText: "", interim: "", sending: false });
  recBar(null); syncComposerButtons();
  if (!send) return;
  if (!text) return toast("Non ho sentito niente: riprova un po' più vicino al telefono");
  ask(text, UI.chatSeg);
}

// ───────────────────────── Ascolto dei vocali ─────────────────────────

const player = { audio: null, id: null, raf: 0 };

function voiceBubble(m) {
  const v = m.meta.voice;
  const playing = player.id === m.id && player.audio && !player.audio.paused;
  return `<div class="vn" data-vn="${m.id}">
    <button class="vn-play" data-act="vn-play" data-id="${m.id}" aria-label="${playing ? "Pausa" : "Ascolta"}">${ico(playing ? "pause" : "play", 18)}</button>
    <div class="vn-wave" data-act="vn-seek" data-id="${m.id}">${(v.wave || []).map(h => `<i style="height:${h}%"></i>`).join("")}</div>
    <span class="vn-time num" data-vn-time>${fmtDur(v.dur || 0)}</span></div>`;
}

function paintVoice() {
  const a = player.audio; if (!a) return;
  const box = $(`.vn[data-vn="${player.id}"]`);
  if (box) {
    const dur = a.duration && isFinite(a.duration) ? a.duration : S.messages.find(x => x.id === player.id)?.meta?.voice?.dur || 1;
    const p = Math.min(1, a.currentTime / dur);
    const bars = box.querySelectorAll(".vn-wave i");
    const n = Math.round(p * bars.length);
    bars.forEach((b, i) => b.classList.toggle("on", i < n));
    box.querySelector("[data-vn-time]").textContent = fmtDur(a.paused && !a.currentTime ? dur : a.currentTime);
    const btn = box.querySelector(".vn-play"); const want = a.paused ? "play" : "pause";
    if (btn.dataset.state !== want) { btn.dataset.state = want; btn.innerHTML = ico(want, 18); }
  }
  if (!a.paused) player.raf = requestAnimationFrame(paintVoice);
}

function playVoice(id, seekTo) {
  const m = S.messages.find(x => x.id === id); if (!m?.meta?.voice) return;
  // Stesso vocale: pausa o ripresa. Un altro: si ferma quello di prima.
  if (player.id === id && player.audio) {
    if (seekTo != null && isFinite(player.audio.duration)) player.audio.currentTime = seekTo * player.audio.duration;
    else if (!player.audio.paused) { player.audio.pause(); paintVoice(); return; }
    player.audio.play().catch(() => {}); paintVoice(); return;
  }
  if (player.audio) { player.audio.pause(); const old = player.id; player.id = null; const box = $(`.vn[data-vn="${old}"]`); if (box) box.outerHTML = voiceBubble(S.messages.find(x => x.id === old)); }
  const a = new Audio(api.voiceUrl(m.meta.voice.path));
  a.preload = "auto";
  player.audio = a; player.id = id;
  a.addEventListener("ended", () => { a.currentTime = 0; paintVoice(); });
  a.addEventListener("play", () => { cancelAnimationFrame(player.raf); player.raf = requestAnimationFrame(paintVoice); });
  a.addEventListener("loadedmetadata", () => { if (seekTo != null) a.currentTime = seekTo * a.duration; });
  // play() parte subito, dentro il tocco: iPhone blocca l'audio avviato più tardi.
  a.play().catch(() => toast("Non riesco a riprodurre questo vocale", "alert"));
}

Object.assign(ACTIONS, {
  "voice-start": () => startVoice(),
  "voice-send": () => stopVoice(true),
  "voice-cancel": () => stopVoice(false),
  "vn-play": el => playVoice(el.dataset.id),
  "vn-seek": (el, e) => {
    const r = el.getBoundingClientRect();
    playVoice(el.dataset.id, Math.max(0, Math.min(1, ((e?.clientX ?? r.left) - r.left) / r.width)));
  },
});

$("#composer-mic").innerHTML = ico("mic", 21);
$("#composer-input").addEventListener("input", syncComposerButtons);
syncComposerButtons();
