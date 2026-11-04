-- Capodanno - aggiornamento 11: ora esatta dell'ultimo accesso di ognuno (la vede solo l'organizzatore).
-- Incolla nel SQL Editor di Supabase e premi Run (si può rieseguire senza problemi).
create table if not exists accessi (
  member_id uuid primary key references members on delete cascade,
  last_seen timestamptz not null default now(),   -- l'ultimo momento in cui aveva l'app aperta
  opened_at timestamptz,                          -- quando l'ha aperta l'ultima volta
  dove text                                       -- la sezione in cui era
);
alter table accessi enable row level security;
drop policy if exists accessi_read on accessi;
create policy accessi_read on accessi for select using (member_id = my_member_id() or is_admin());
drop policy if exists accessi_write on accessi;
create policy accessi_write on accessi for insert with check (member_id = my_member_id());
drop policy if exists accessi_update on accessi;
create policy accessi_update on accessi for update using (member_id = my_member_id()) with check (member_id = my_member_id());
