-- Capodanno - aggiornamento 4: foto, duelli 1 contro 1, posizione condivisa, domanda del giorno, notizie, promemoria del profilo.
-- Da incollare UNA volta in Supabase → SQL Editor → New query → Run (si può rieseguire senza danni).

-- ───────────────────────── Foto (chat e sezione Foto) ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('foto', 'foto', true, 8388608)
on conflict (id) do update set public = true, file_size_limit = 8388608;
drop policy if exists foto_insert on storage.objects;
create policy foto_insert on storage.objects for insert with check (bucket_id = 'foto' and public.is_member());
drop policy if exists foto_delete on storage.objects;
create policy foto_delete on storage.objects for delete using (bucket_id = 'foto' and public.is_member());

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members on delete cascade,
  path text not null,
  caption text,
  w int, h int,
  message_id uuid references messages on delete set null,
  created_at timestamptz not null default now()
);
alter table photos enable row level security;
drop policy if exists photos_read on photos;
create policy photos_read on photos for select using (is_member());
drop policy if exists photos_insert on photos;
create policy photos_insert on photos for insert with check (member_id = my_member_id());
drop policy if exists photos_delete on photos;
create policy photos_delete on photos for delete using (member_id = my_member_id() or is_admin());

-- ───────────────────────── Domanda del giorno ─────────────────────────
create table if not exists daily_answers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members on delete cascade,
  day date not null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  unique (member_id, day)
);
alter table daily_answers enable row level security;
drop policy if exists daily_read on daily_answers;
create policy daily_read on daily_answers for select using (is_member());
drop policy if exists daily_write on daily_answers;
create policy daily_write on daily_answers for insert with check (member_id = my_member_id());

-- ───────────────────────── Posizione condivisa (solo con consenso) ─────────────────────────
alter table members add column if not exists loc_lat double precision;
alter table members add column if not exists loc_lon double precision;
alter table members add column if not exists loc_at timestamptz;

-- ───────────────────────── Notizie ─────────────────────────
-- Una riga sola: la scrive la funzione «notizie» (con la chiave di servizio), la leggono tutti i membri.
create table if not exists news (
  id int primary key default 1 check (id = 1),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into news (id) values (1) on conflict (id) do nothing;
alter table news enable row level security;
drop policy if exists news_read on news;
create policy news_read on news for select using (is_member());

-- ───────────────────────── Duelli 1 contro 1 (Miniera, GeoScatto) ─────────────────────────
-- data: dati della partita uguali per entrambi (mappa, foto). actions: mosse con il posto (0 o 1) di chi le fa.
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('miniera', 'geo')),
  players uuid[] not null,
  created_by uuid not null references members on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'over', 'declined', 'cancelled')),
  data jsonb not null default '{}'::jsonb,
  seed bigint not null default floor(random() * 2147483647)::bigint,
  actions jsonb not null default '[]'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists duels_status on duels (status, updated_at desc);
alter table duels enable row level security;
drop policy if exists duels_read on duels;
create policy duels_read on duels for select using (is_member());

do $$
declare t text;
begin
  foreach t in array array['photos', 'daily_answers', 'news', 'duels'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

create or replace function duel_create(p_opp uuid, p_kind text, p_data jsonb) returns duels
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g duels;
begin
  if me is null then raise exception 'Non fai parte del gruppo'; end if;
  if p_opp = me or not exists (select 1 from members where id = p_opp) then raise exception 'Avversario non valido'; end if;
  update duels set status = 'cancelled', updated_at = now() where created_by = me and status = 'invited' and kind = p_kind;
  insert into duels (kind, players, created_by, data) values (p_kind, array[me, p_opp], me, coalesce(p_data, '{}'::jsonb)) returning * into g;
  return g;
end $$;

create or replace function duel_answer(p_id uuid, p_ok boolean) returns duels
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g duels;
begin
  select * into g from duels where id = p_id for update;
  if g.id is null or g.status <> 'invited' then raise exception 'Invito scaduto'; end if;
  if g.players[2] <> me then raise exception 'Non autorizzato'; end if;
  update duels set status = case when p_ok then 'active' else 'declined' end, updated_at = now() where id = p_id returning * into g;
  return g;
end $$;

create or replace function duel_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update duels set status = 'cancelled', updated_at = now() where id = p_id and created_by = my_member_id() and status = 'invited';
end $$;

-- p_ply: per i giochi a turni è il numero di mosse già fatte (il turno è del posto p_ply % 2); null per i giochi senza turni.
create or replace function duel_act(p_id uuid, p_ply int, p_action jsonb) returns duels
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g duels; seat int;
begin
  select * into g from duels where id = p_id for update;
  if g.id is null or g.status <> 'active' then raise exception 'La partita è finita'; end if;
  seat := array_position(g.players, me) - 1;
  if seat is null then raise exception 'Non autorizzato'; end if;
  if p_ply is not null then
    if p_ply <> jsonb_array_length(g.actions) then raise exception 'Posizione cambiata, riprova'; end if;
    if p_ply % 2 <> seat then raise exception 'Non è il tuo turno'; end if;
  end if;
  update duels set actions = actions || jsonb_build_array(p_action || jsonb_build_object('s', seat, 't', now_ms())), updated_at = now()
  where id = p_id returning * into g;
  return g;
end $$;

create or replace function duel_finish(p_id uuid, p_result jsonb) returns duels
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g duels;
begin
  select * into g from duels where id = p_id for update;
  if g.id is null or not (me = any(g.players)) then raise exception 'Non autorizzato'; end if;
  if g.status = 'active' then update duels set status = 'over', result = p_result, updated_at = now() where id = p_id returning * into g; end if;
  return g;
end $$;

-- ───────────────────────── Lavori automatici ─────────────────────────
-- Notizie aggiornate ogni tre ore.
select cron.unschedule('capodanno-notizie') where exists (select 1 from cron.job where jobname = 'capodanno-notizie');
select cron.schedule('capodanno-notizie', '7 */3 * * *', $$
  select net.http_post(
    url := 'https://hvrolzzeyclxfcdoaubx.supabase.co/functions/v1/notizie',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select value from public.app_secrets where key = 'cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
$$);
-- Alle 14:30 (ora italiana d'inverno) un promemoria a chi non ha ancora completato il profilo.
select cron.unschedule('capodanno-profili') where exists (select 1 from cron.job where jobname = 'capodanno-profili');
select cron.schedule('capodanno-profili', '30 13 * * *', $$
  select net.http_post(
    url := 'https://hvrolzzeyclxfcdoaubx.supabase.co/functions/v1/notifiche',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select value from public.app_secrets where key = 'cron')),
    body := '{"type":"profili"}'::jsonb
  )
$$);
