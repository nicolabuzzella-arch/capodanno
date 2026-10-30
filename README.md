# 🎆 Capodanno

L'app del gruppo per organizzare la vacanza di Capodanno: si decide tutto con i **sondaggi**, poi si tengono in ordine **prenotazioni**, **programma**, **spese** e **checklist**. C'è anche un **assistente AI** che cerca sul web, propone opzioni, crea sondaggi e aggiorna i dati.

Funziona su iPhone come un'app vera (icona sulla Home, schermo intero, anche offline) senza passare dall'App Store.

---

## Per gli amici: come si entra (30 secondi)

1. Apri il link ricevuto su WhatsApp **con Safari**.
2. Tocca **Sono nuovo/a**, scrivi il nome, scegli un avatar e un **PIN di 4 cifre**.
3. Condividi ⬆︎ → **Aggiungi alla schermata Home**.
4. Apri l'app dall'icona 🎆, tocca il tuo nome e inserisci il PIN.

Fine: niente account, email o password.

---

## Per l'organizzatore: messa online (circa 15 minuti, una volta sola)

Finché `config.js` è vuoto l'app funziona in **modalità prova**: i dati restano sul telefono e il codice è `DEMO`. Per condividerla con il gruppo servono tre servizi gratuiti (l'AI costa pochi euro):

| Servizio | A cosa serve | Costo |
|---|---|---|
| GitHub Pages | Mette online l'app | Gratis |
| Supabase | Database condiviso e in tempo reale | Gratis |
| Anthropic (Claude) | L'assistente AI | Circa 5-15 € per tutta la vacanza |

### 1. Metti online l'app (GitHub Pages)
1. Nel repository vai in **Settings → Pages**.
2. In *Source* scegli **Deploy from a branch**, branch **main**, cartella **/ (root)**, poi **Save**.
3. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/capodanno/`.

### 2. Crea il database (Supabase)
1. Registrati su [supabase.com](https://supabase.com) e crea un progetto: **New project**, regione **Central EU (Frankfurt)**. Salva la password del database da qualche parte.
2. Apri `supabase/schema.sql` e alla riga con `'CAMBIAMI'` scrivi il tuo **codice invito** (es. `CAPO27`).
3. In Supabase vai su **SQL Editor → New query**, incolla tutto il file e premi **Run**.
4. Vai su **Authentication → Sign In / Providers** e attiva **Allow anonymous sign-ins**.
5. Vai su **Project Settings → API** e copia **Project URL** e la chiave **anon / publishable**.
6. Incollale in `config.js` (oppure mandale a Claude, che le inserisce per te).

> Le chiavi in `config.js` non sono segrete. I dati sono protetti dalle regole del database: chi non è nel gruppo non vede nulla, e i documenti li vedono solo il diretto interessato e l'organizzatore.

### 3. Accendi l'assistente (Claude)
1. Su [console.anthropic.com](https://console.anthropic.com) crea un account, vai in **Billing**, carica circa 10 € e imposta un **limite di spesa** mensile.
2. In **API Keys** crea una chiave e copiala. Questa sì che è segreta: non metterla nell'app e non mandarla in chat.
3. In Supabase vai su **Edge Functions → Deploy a new function → Via Editor**. Chiamala esattamente `assistente`, incolla il contenuto di `supabase/functions/assistente/index.ts` e premi **Deploy**.
4. In **Edge Functions → Secrets** aggiungi `ANTHROPIC_API_KEY` con la chiave del punto 2.

### 4. Inizia
1. Apri il link dell'app: **chi entra per primo diventa organizzatore** 👑.
2. In Home tocca **Crea i sondaggi base** (tipo di vacanza, destinazione, date, budget, trasporto, alloggio, cenone).
3. Tocca **+ Invita** e manda il link nel gruppo WhatsApp.
4. Quando un sondaggio è deciso, chiudilo (•••) e aggiorna i **Dati del viaggio** in Gruppo → Strumenti organizzatore.

---

## Cosa c'è dentro

- **Home**: conto alla rovescia, conferme di partecipazione, cosa c'è da votare, prossimi impegni, il tuo saldo, scadenze per cancellare gratis.
- **Vota**: sondaggi a scelta singola o multipla, chiunque può proporre opzioni (con prezzo e link), si vede chi ha votato cosa e chi manca.
- **Piano**: prenotazioni per categoria con codice, orari, indirizzo, mappa, prezzo e scadenza di cancellazione; programma giorno per giorno; checklist con le cose da fare assegnate.
- **Spese**: chi ha pagato cosa, divisione automatica e il minimo di passaggi di soldi per pareggiare i conti.
- **Assistente**: chat condivisa con un'AI che vede tutti i dati del gruppo. Cerca sul web prezzi, eventi, ristoranti e meteo; crea sondaggi; registra prenotazioni, spese, programma e checklist; prepara liste ospiti ed email per hotel e ristoranti.
- **Gruppo**: profili con contatti, dieta, allergie, città di partenza e posti in auto; dati dei documenti visibili solo all'organizzatore; lista ospiti pronta da copiare.

## Pagamenti e registrazioni sui siti

Né l'assistente né l'app pagano da soli o salvano carte di credito. È voluto:

- ogni pagamento online chiede la conferma della banca (3D Secure) sul telefono di chi paga;
- i siti di prenotazione bloccano i bot;
- tenere le carte di tutti in un'app fatta in casa è un rischio che non vale la pena correre.

Come si fa invece:
1. L'assistente trova l'opzione, prepara i dati e ti dà il link diretto.
2. Per compilare i moduli lunghi l'organizzatore può usare **Claude in Chrome** (l'estensione per il browser) con la **Lista ospiti** dell'app: Claude compila e si ferma prima del pagamento.
3. Paghi tu con Apple Pay o con la carta, poi registri la prenotazione (o dici all'assistente «ho prenotato…») e la spesa si divide da sola.

## File

```
index.html, app.css, app.js            l'app
config.js                              collegamento a Supabase (vuoto = modalità prova)
sw.js, manifest.webmanifest, icon-*    funzionamento offline e icona per iPhone
supabase/schema.sql                    tabelle, regole di sicurezza, funzioni per entrare con il PIN
supabase/functions/assistente/index.ts l'assistente AI (Supabase Edge Function)
```
