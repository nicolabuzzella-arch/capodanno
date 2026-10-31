-- Capodanno - aggiornamento 5: Onorevoli diventa una sfida 1 contro 1.
-- Basta incollarlo nel SQL Editor di Supabase e premere Run (si può rieseguire senza problemi).
alter table duels drop constraint if exists duels_kind_check;
alter table duels add constraint duels_kind_check check (kind in ('miniera', 'geo', 'onorevoli'));
