-- Capodanno - aggiornamento 12: cuori sui messaggi della chat di gruppo e «visualizzato da».
-- Incolla nel SQL Editor di Supabase e premi Run (si può rieseguire senza problemi).
create table if not exists reazioni (
  message_id uuid not null references messages on delete cascade,
  member_id uuid not null references members on delete cascade,
  emoji text not null default 'cuore',
  created_at timestamptz not null default now(),
  primary key (message_id, member_id)
);
-- Fin dove ognuno ha letto la chat di gruppo: un messaggio è «visualizzato» da chi ha letto fino a dopo il suo invio.
create table if not exists letture (
  member_id uuid primary key references members on delete cascade,
  gruppo_at timestamptz not null default now()
);
alter table reazioni enable row level security;
alter table letture enable row level security;
drop policy if exists reazioni_read on reazioni;
create policy reazioni_read on reazioni for select using (is_member());
drop policy if exists reazioni_add on reazioni;
create policy reazioni_add on reazioni for insert with check (member_id = my_member_id());
drop policy if exists reazioni_del on reazioni;
create policy reazioni_del on reazioni for delete using (member_id = my_member_id());
drop policy if exists letture_read on letture;
create policy letture_read on letture for select using (is_member());
drop policy if exists letture_add on letture;
create policy letture_add on letture for insert with check (member_id = my_member_id());
drop policy if exists letture_upd on letture;
create policy letture_upd on letture for update using (member_id = my_member_id()) with check (member_id = my_member_id());
do $$
declare t text;
begin
  foreach t in array array['reazioni', 'letture'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
