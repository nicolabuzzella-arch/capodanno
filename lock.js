/* Capodanno - blocco dell'app. Se blocco.json dice «attivo», l'app non parte per nessuno (nemmeno il login):
   compare solo la schermata «Error 104». I dati restano tutti dove sono. Per riaprire: "attivo": false. */
(function () {
  var K = "capodanno-blocco";
  var on = false;
  try { on = localStorage.getItem(K) === "1"; } catch (e) { /* niente memoria */ }
  window.__LOCK = on;
  function show() {
    if (document.getElementById("lock104")) return;
    var f = document.createElement("link"); f.rel = "stylesheet"; f.href = "https://fonts.googleapis.com/css2?family=Anton&display=swap"; document.head.appendChild(f);
    var s = document.createElement("style");
    s.textContent = "html.locked,html.locked body{overflow:hidden!important;background:#000!important}" +
      "html.locked body>*:not(#lock104){display:none!important}" +
      "#lock104{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;min-height:100vh;z-index:2147483647;background:#000;display:flex;flex-direction:column;align-items:center;overflow:hidden;-webkit-user-select:none;user-select:none}" +
      "#lock104 img{position:absolute;top:0;left:0;width:100%;height:100%;display:block;object-fit:cover;object-position:center 40%}" +
      "#lock104 .t{position:relative;z-index:1;margin-top:calc(env(safe-area-inset-top,0px) + 3.5vh);text-align:center;color:#fff;font-family:Anton,Impact,'Arial Black',sans-serif;line-height:.86;text-transform:uppercase;" +
      "text-shadow:0 0 2px #000,0 4px 0 #000,0 8px 30px rgba(0,0,0,.9)}" +
      "#lock104 .t small{display:block;font-size:clamp(26px,8vw,56px);letter-spacing:.14em}" +
      "#lock104 .t b{display:block;font-weight:400;font-size:clamp(96px,30vw,200px);letter-spacing:-.02em}";
    document.head.appendChild(s);
    var d = document.createElement("div");
    d.id = "lock104";
    d.innerHTML = '<img alt=""><div class="t"><small>Error</small><b>104</b></div>';
    // Se l'immagine non arriva (rete lenta, copia vecchia), riprova da sola con un indirizzo nuovo.
    var img = d.querySelector("img"), tries = 0;
    img.onerror = function () { if (++tries < 8) setTimeout(function () { img.src = "blocco-104.jpg?r=" + Date.now(); }, 1200 * tries); };
    img.src = "blocco-104.jpg?v=2";
    (document.body || document.documentElement).appendChild(d);
    document.documentElement.classList.add("locked");
  }
  if (on) { if (document.body) show(); else document.addEventListener("DOMContentLoaded", show); }
  function apply(now) {
    if (now === on) return;
    try { if (now) localStorage.setItem(K, "1"); else localStorage.removeItem(K); } catch (e) { /* niente memoria */ }
    if (now) { window.__LOCK = true; if (document.body) show(); }
    location.reload();
  }
  function check() {
    return fetch("blocco.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) apply(!!j.attivo); })
      .catch(function () { /* offline: vale l'ultimo stato noto */ });
  }
  // L'app aspetta questa risposta (al massimo 3 secondi) prima di partire: così non si vede nemmeno il login.
  window.lockReady = Promise.race([check(), new Promise(function (r) { setTimeout(r, 3000); })]);
  setInterval(check, 20000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
})();
