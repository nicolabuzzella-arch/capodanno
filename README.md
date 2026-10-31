# Capodanno

L'app del gruppo per organizzare il Capodanno, con **Zampone**: l'agente AI che cerca, pianifica, fa i conti e vi tiene in riga.

Funziona su iPhone e Android come un'app vera (icona sulla Home, schermo intero, notifiche) senza passare dagli store.

---

## Per gli amici: come si entra

Manda il link insieme a una delle due immagini in `guida/`: **iphone.png** o **android.png**. Bastano tre passaggi, poi si tocca il proprio nome e si sceglie un PIN.

---

## Cosa c'è dentro

- **Zampone, l'agente**:
  - fa ricerche approfondite sul web e confronta i prezzi sui siti ufficiali;
  - propone sondaggi (li crei tu con un tocco), organizza logistica, programma e conti;
  - ogni mattina fa il punto della situazione e richiama all'ordine chi non vota, con misura.
- **Vota**: sondaggi singoli o multipli, con proposte di tutti, scadenze e promemoria a chi manca.
- **Piano**:
  - prenotazioni con biglietti in PDF, codice, mappa, prezzo a testa e scadenza della cancellazione gratuita;
  - «Prenota e paga con Claude in Chrome»;
  - programma, checklist, auto e passaggi, emergenze.
- **Splitwise**: spese con uno o più pagatori, divise in parti uguali, per importi, per percentuali o per quote. Debiti semplificati, «Salda», quote da versare, grafici, scontrini e «Chiudi i conti» a fine vacanza.
- **Chat**:
  - **Gruppo**, tra di voi, con risposte ai singoli messaggi e messaggi vocali;
  - **Zampone**, a cui si può anche parlare: il microfono detta il messaggio;
  - **Ascolto**, uno spazio privato con l'AI che nell'app vede solo chi scrive.
- **Sezioni**: profilo da completare una domanda alla volta, passaggi in auto con costo a testa, meteo da quattro modelli con una frase d'autore, mappa animata del viaggio, «Raccontami il gruppo» per l'organizzatore.
- **Giochi**:
  - **Scopa d'assi** in quattro, due contro due, con carte milanesi: chi invita sceglie coppie, punti e varianti; allenamento contro i bot;
  - **Ruota della fortuna** con premi (silenziare un amico in chat per un'ora, soprannomi, titoli, scudi, gettoni), **Enigma del giorno**, **Ordine di grandezza** (il Trivial con risposte numeriche), **Onorevoli** (lotta tra politici a colpi di frasi celebri);
  - **Scacchi** 1 contro 1 dal vivo con l'orologio (3+2, 5+5, 10 minuti), patta, abbandono, partite da guardare e classifica Elo; allenamento contro il telefono (tre livelli) o in due sullo stesso telefono;
  - Sudoku del giorno 9×9 (Normale e Killer), Tiro alla fune 1 contro 1 in tempo reale, Fuochi, con le classifiche di sempre.
- **Gruppo**:
  - profili con foto, esigenze, documenti (visibili solo all'organizzatore) e metodi di pagamento;
  - questionario al primo accesso;
  - suggerimenti per l'app, che arrivano all'organizzatore su WhatsApp.
- **Notifiche**: nuovi sondaggi, quote, messaggi, sfide, e un promemoria serale solo se c'è qualcosa in sospeso.

## Pagamenti

L'app non salva carte: servirebbero certificazioni di sicurezza (PCI-DSS) che un'app tra amici non ha.

- **Tra di voi**: pulsanti PayPal (con l'importo già inserito), IBAN e Satispay.
- **Hotel, treni e locali**: Claude in Chrome compila e paga con la carta salvata nel browser, dopo la tua conferma.

---

## Messa online (per l'organizzatore)

Servono GitHub Pages (l'app), Supabase (database, notifiche, foto) e una chiave di Claude (l'agente, pochi euro).

1. **GitHub Pages**: in Settings → Pages scegli *Deploy from a branch*, poi `main` e `/ (root)`.
2. **Database**: in Supabase → SQL Editor esegui `supabase/schema.sql` (cambiando prima il codice invito `CAMBIAMI`), poi `supabase/aggiornamento-1.sql`, `supabase/aggiornamento-2.sql` `supabase/aggiornamento-3.sql`, `supabase/aggiornamento-4.sql` e `supabase/aggiornamento-5.sql`. In Authentication → Sign In / Providers attiva **Allow anonymous sign-ins**.
3. **Collegamento**: Project URL e chiave *publishable* vanno in `config.js`.
4. **Funzioni**: in Edge Functions crea `assistente`, `notifiche` e `notizie` incollando i file in `supabase/functions/…/index.ts`. Per **tutte e tre** disattiva *Verify JWT*: l'autorizzazione la fanno da sole, e serve per i promemoria automatici. In Secrets aggiungi `ANTHROPIC_API_KEY`.

## File

```
index.html, app.css, app.js       l'app
games.js, killer-lib.js           giochi e libreria di Killer Sudoku verificati
chess.js, chess-engine.js         scacchi: partite dal vivo, regole complete e avversario al computer
pezzi/                            pezzi degli scacchi (set Celtic, licenza MIT)
voice.js                          messaggi vocali e dettatura
config.js                         collegamento a Supabase
sw.js, manifest.webmanifest       offline, notifiche e icona
guida/                            immagini da mandare con il link
supabase/schema.sql               database di base
supabase/aggiornamento-1.sql      profili, notifiche, chat, Ascolto, giochi, Zampone, suggerimenti
supabase/aggiornamento-2.sql      messaggi vocali e scacchi
supabase/aggiornamento-3.sql      notifiche a scelta, vibe del gruppo, ruota e premi, scopa d'assi
supabase/aggiornamento-4.sql      foto, duelli 1 contro 1, posizione, domanda del giorno, notizie, promemoria 14:30
supabase/aggiornamento-5.sql      Onorevoli come sfida 1 contro 1
supabase/functions/notizie        rassegna dai grandi giornali, ogni tre ore
home2.js, mappa3d.js, duelli.js   Home, tab Giochi, foto; mappa 3D; Miniera e GeoScatto
sezioni.js                        profilo, vibe, passaggi, meteo, mappa
giochi2.js, scopa.js              ruota, enigmi, Ordine di grandezza, Onorevoli, scopa d'assi
loghi/                            loghi dei giochi
version.json                      cambia a ogni pubblicazione: le app aperte si aggiornano da sole
supabase/functions/assistente     Zampone e lo spazio Ascolto
supabase/functions/notifiche      notifiche push, promemoria e richiami
```
