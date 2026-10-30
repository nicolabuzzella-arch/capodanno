# Capodanno

L'app del gruppo per organizzare la vacanza di Capodanno. Si decide tutto con i **sondaggi**, poi si tengono in ordine **prenotazioni**, **programma**, **spese in stile Splitwise**, **quote** e **checklist**. Ci sono anche una **chat di gruppo**, un **assistente AI** che cerca sul web e aggiorna i dati, e **due giochi con classifica**.

Funziona su iPhone come un'app vera (icona sulla Home, schermo intero, anche offline) senza passare dall'App Store.

---

## Per gli amici: come si entra (30 secondi)

1. Apri il link ricevuto su WhatsApp **con Safari**.
2. Tocca **Sono nuovo**, scrivi il nome, scegli un colore e un **PIN di 4 cifre**.
3. Condividi → **Aggiungi alla schermata Home**.
4. Apri l'app dall'icona, tocca il tuo nome e inserisci il PIN.

Niente account, email o password.

---

## Cosa c'è dentro

- **Home**: conto alla rovescia, conferme di partecipazione, avviso dell'organizzatore, cosa c'è da votare, quote da versare, meteo della destinazione, giochi, ultimo messaggio della chat, prossimi impegni.
- **Vota**: sondaggi a scelta singola o multipla, con scadenza. Chiunque può proporre opzioni con prezzo e link, e si vede chi ha votato cosa e chi manca.
- **Piano**:
  - **prenotazioni** per categoria, con codice, orari, mappa, prezzo a testa, scadenza della cancellazione gratuita e biglietti in PDF;
  - **programma** giorno per giorno e **checklist** assegnabile;
  - **info**: emergenze, contatti delle strutture, auto e passaggi.
- **Spese** (come Splitwise):
  - una o più persone che pagano;
  - divisione **in parti uguali, per importi, per percentuali o per quote**;
  - debiti semplificati, «Salda» e saldo per persona;
  - foto degli scontrini, filtri per categoria, grafici;
  - **quote da versare** (acconti) con chi ha pagato e chi manca.
- **Chat**: una chat di **gruppo** tra di voi e una con l'**assistente AI**. L'assistente cerca prezzi, eventi, ristoranti e meteo; crea sondaggi; registra prenotazioni, spese e quote; prepara liste ospiti ed email.
- **Giochi**:
  - **Sudoku del giorno**: 6×6 facile o 9×9 classico, stessa griglia per tutti, conta il primo tentativo e ogni errore aggiunge 15 secondi;
  - **Fuochi**: 30 secondi per far esplodere più razzi possibile;
  - classifica di oggi e di sempre.
- **Gruppo**: profili con contatti, dieta, allergie, città di partenza, posti in auto e metodi per ricevere pagamenti. I documenti li vedono solo il diretto interessato e l'organizzatore, che ha la lista ospiti pronta da copiare.

## Pagamenti

- **Tra di voi** (quote, rimborsi): il pulsante apre **PayPal** con l'importo già compilato, così si paga con la carta registrata in PayPal o con Apple Pay. In alternativa ci sono IBAN da copiare o Satispay. Poi si segna come pagato.
- **Hotel, treni, locali**: dalla prenotazione tocca **«Prenota e paga con Claude in Chrome»**. L'app prepara una «missione» con i dati del gruppo; la incolli in Claude in Chrome sul computer e Claude compila i moduli e paga con **la carta salvata nel tuo browser**, dopo la tua conferma.
- L'app **non salva numeri di carta**. Servirebbero certificazioni di sicurezza (PCI-DSS) che un'app tra amici non ha.

---

## Per l'organizzatore: messa online (circa 15 minuti, una volta sola)

Finché `config.js` è vuoto l'app funziona in **modalità prova**: i dati restano sul telefono e il codice è `DEMO`. Per condividerla servono tre servizi gratuiti (l'AI costa pochi euro):

| Servizio | A cosa serve | Costo |
|---|---|---|
| GitHub Pages | Mette online l'app | Gratis |
| Supabase | Database condiviso, chat in tempo reale, documenti | Gratis |
| Anthropic (Claude) | L'assistente AI | Circa 5-15 € per tutta la vacanza |

### 1. Metti online l'app (GitHub Pages)
1. Nel repository apri **Settings → Pages**.
2. In *Source* scegli **Deploy from a branch**, branch **main**, cartella **/ (root)**, poi **Save**.
3. Dopo un minuto l'app è su `https://<utente>.github.io/capodanno/`.

### 2. Crea il database (Supabase)
1. Registrati su [supabase.com](https://supabase.com) e crea un progetto: regione **Central EU (Frankfurt)**.
2. Apri `supabase/schema.sql` e alla riga con `'CAMBIAMI'` scrivi il tuo **codice invito** (es. `CAPO27`).
3. In Supabase apri **SQL Editor → New query**, incolla tutto il file e premi **Run**.
4. Apri **Authentication → Sign In / Providers** e attiva **Allow anonymous sign-ins**.
5. Apri **Project Settings → API** e copia **Project URL** e la chiave **anon / publishable** in `config.js` (oppure mandale a Claude).

> Le chiavi di `config.js` non sono segrete. I dati sono protetti dalle regole del database: chi non è nel gruppo non vede nulla.

### 3. Accendi l'assistente (Claude)
1. Su [console.anthropic.com](https://console.anthropic.com) apri **Billing**, carica circa 10 € e imposta un **limite di spesa**.
2. In **API Keys** crea una chiave. Questa è segreta: non metterla nell'app e non mandarla in chat.
3. In Supabase apri **Edge Functions → Deploy a new function → Via Editor**. Chiamala `assistente`, incolla `supabase/functions/assistente/index.ts` e premi **Deploy**.
4. In **Edge Functions → Secrets** aggiungi `ANTHROPIC_API_KEY` con la chiave.

### 4. Inizia
1. Apri il link dell'app: **chi entra per primo diventa organizzatore**.
2. In Home tocca **Crea i sondaggi base**.
3. Tocca **Invita** e manda il link nel gruppo WhatsApp.
4. Quando un sondaggio è deciso, chiudilo e aggiorna i **Dati del viaggio** (Gruppo → Strumenti organizzatore).

## File

```
index.html, app.css, app.js            l'app
games.js                               Sudoku del giorno, Fuochi, classifica
config.js                              collegamento a Supabase (vuoto = modalità prova)
sw.js, manifest.webmanifest, icon-*    offline e icona per iPhone
supabase/schema.sql                    tabelle, regole di sicurezza, accesso con PIN, cartella documenti
supabase/functions/assistente/index.ts l'assistente AI (Supabase Edge Function)
```
