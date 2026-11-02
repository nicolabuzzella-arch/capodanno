-- Capodanno - aggiornamento 7: casella email del gruppo (Gmail).
-- Le email arrivano nella tabella «emails» (le scrive solo la funzione «posta»), tutti i membri le leggono.
-- Incolla nel SQL Editor di Supabase e premi Run (si può rieseguire senza problemi).
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  gmail_id text unique,
  thread_id text,
  direction text not null check (direction in ('in', 'out', 'draft')),
  from_addr text,
  from_name text,
  to_addr text,
  subject text,
  snippet text,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  sent_by uuid references members on delete set null,
  reply_to uuid references emails on delete set null,
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists emails_when on emails (received_at desc);
alter table emails enable row level security;
drop policy if exists emails_read on emails;
create policy emails_read on emails for select using (is_member());
-- Segnare come letta: solo aggiungendo se stessi a read_by.
create or replace function email_read(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update emails set read_by = array(select distinct unnest(read_by || my_member_id())) where id = p_id and my_member_id() is not null;
$$;
-- Le bozze preparate da Zampone si possono scartare.
create or replace function email_discard(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from emails where id = p_id and direction = 'draft' and is_member();
$$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'emails') then
    alter publication supabase_realtime add table emails;
  end if;
end $$;

-- Controllo delle email nuove ogni 3 minuti.
select cron.unschedule('capodanno-posta') where exists (select 1 from cron.job where jobname = 'capodanno-posta');
select cron.schedule('capodanno-posta', '*/3 * * * *', $$
  select net.http_post(
    url := 'https://hvrolzzeyclxfcdoaubx.supabase.co/functions/v1/posta',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select value from public.app_secrets where key = 'cron')),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 60000
  )
$$);
