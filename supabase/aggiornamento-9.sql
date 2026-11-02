-- Capodanno - aggiornamento 9: interruttori dell'organizzatore (per ora: Chiavenna Express visibile o «In arrivo»).
-- Incolla nel SQL Editor di Supabase e premi Run (si può rieseguire senza problemi).
alter table trip add column if not exists flags jsonb not null default '{}'::jsonb;
