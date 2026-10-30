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
  - **Gruppo**, tra di voi, con risposte ai singoli messaggi;
  - **Zampone**;
  - **Ascolto**, uno spazio privato con l'AI che nell'app vede solo chi scrive.
- **Giochi**: Sudoku del giorno 9×9 (Normale e Killer), Tiro alla fune 1 contro 1 in tempo reale, Fuochi, con le classifiche di sempre.
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
2. **Database**: in Supabase → SQL Editor esegui `supabase/schema.sql` (cambiando prima il codice invito `CAMBIAMI`), poi `supabase/aggiornamento-1.sql`. In Authentication → Sign In / Providers attiva **Allow anonymous sign-ins**.
3. **Collegamento**: Project URL e chiave *publishable* vanno in `config.js`.
4. **Funzioni**: in Edge Functions crea `assistente` e `notifiche` incollando i file in `supabase/functions/…/index.ts`. Per **entrambe** disattiva *Verify JWT*: l'autorizzazione la fanno da sole, e serve per i promemoria automatici. In Secrets aggiungi `ANTHROPIC_API_KEY`.

## File

```
index.html, app.css, app.js       l'app
games.js, killer-lib.js           giochi e libreria di Killer Sudoku verificati
config.js                         collegamento a Supabase
sw.js, manifest.webmanifest       offline, notifiche e icona
guida/                            immagini da mandare con il link
supabase/schema.sql               database di base
supabase/aggiornamento-1.sql      profili, notifiche, chat, Ascolto, giochi, Zampone, suggerimenti
supabase/functions/assistente     Zampone e lo spazio Ascolto
supabase/functions/notifiche      notifiche push, promemoria e richiami
```
