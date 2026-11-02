-- Capodanno - aggiornamento 8: tavoli da gioco per più persone (Poker Texas Hold'em e il gioco a squadre).
-- Un tavolo ha posti (persone o bot), inviti da accettare e la lista delle mosse; ogni telefono ricostruisce la partita.
-- Incolla nel SQL Editor di Supabase e premi Run (si può rieseguire senza problemi).
create table if not exists tavoli (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('poker', 'squadre')),
  seats jsonb not null,                 -- [{ id: uuid | null, bot: bool, name, team }]
  players uuid[] not null,              -- persone sedute (per i permessi)
  accepted uuid[] not null default '{}',
  created_by uuid not null references members on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'invited' check (status in ('invited', 'active', 'over', 'cancelled')),
  seed bigint not null default floor(random() * 2147483647)::bigint,
  actions jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tavoli_status on tavoli (status, updated_at desc);
alter table tavoli enable row level security;
drop policy if exists tavoli_read on tavoli;
create policy tavoli_read on tavoli for select using (is_member());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tavoli') then
    alter publication supabase_realtime add table tavoli;
  end if;
end $$;

create or replace function tavolo_create(p_kind text, p_seats jsonb, p_settings jsonb) returns tavoli
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g tavoli; ppl uuid[];
begin
  if me is null then raise exception 'Non fai parte del gruppo'; end if;
  select array_agg((s->>'id')::uuid) into ppl from jsonb_array_elements(p_seats) s where coalesce((s->>'bot')::boolean, false) = false and s->>'id' is not null;
  if ppl is null or not (me = any(ppl)) then raise exception 'Devi sederti anche tu'; end if;
  if (select count(*) from members where id = any(ppl)) <> array_length(ppl, 1) then raise exception 'Giocatore non valido'; end if;
  update tavoli set status = 'cancelled', updated_at = now() where created_by = me and status = 'invited' and kind = p_kind;
  insert into tavoli (kind, seats, players, accepted, created_by, settings, status)
  values (p_kind, p_seats, ppl, array[me], me, coalesce(p_settings, '{}'::jsonb), case when array_length(ppl, 1) = 1 then 'active' else 'invited' end)
  returning * into g;
  return g;
end $$;

create or replace function tavolo_answer(p_id uuid, p_ok boolean) returns tavoli
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g tavoli;
begin
  select * into g from tavoli where id = p_id for update;
  if g.id is null or g.status <> 'invited' then raise exception 'Invito scaduto'; end if;
  if not (me = any(g.players)) then raise exception 'Non sei a questo tavolo'; end if;
  if not p_ok then
    update tavoli set status = 'cancelled', result = jsonb_build_object('declined', me), updated_at = now() where id = p_id returning * into g;
    return g;
  end if;
  update tavoli set accepted = array(select distinct unnest(accepted || me)),
    status = case when (select count(distinct x) from unnest(accepted || me) x) >= array_length(players, 1) then 'active' else 'invited' end,
    updated_at = now()
  where id = p_id returning * into g;
  return g;
end $$;

create or replace function tavolo_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update tavoli set status = 'cancelled', updated_at = now() where id = p_id and created_by = my_member_id() and status = 'invited';
end $$;

-- Una mossa: la posizione deve essere quella attesa (p_ply = numero di mosse già fatte). Chi crea il tavolo muove anche per i bot.
create or replace function tavolo_act(p_id uuid, p_ply int, p_action jsonb) returns tavoli
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g tavoli; seat jsonb;
begin
  select * into g from tavoli where id = p_id for update;
  if g.id is null or g.status <> 'active' then raise exception 'Il tavolo è chiuso'; end if;
  if not (me = any(g.players)) then raise exception 'Non sei a questo tavolo'; end if;
  if p_ply is not null and p_ply <> jsonb_array_length(g.actions) then raise exception 'Posizione cambiata, riprova'; end if;
  seat := g.seats -> coalesce((p_action->>'s')::int, -1);
  if seat is not null and not (coalesce((seat->>'bot')::boolean, false) and g.created_by = me) and (seat->>'id') is distinct from me::text and p_action ? 's' then
    raise exception 'Non è il tuo posto';
  end if;
  update tavoli set actions = actions || jsonb_build_array(p_action || jsonb_build_object('by', me, 't', now_ms())), updated_at = now()
  where id = p_id returning * into g;
  return g;
end $$;

-- Dati condivisi della partita (es. i disegni del gioco a squadre): si fondono con quelli già presenti.
create or replace function tavolo_data(p_id uuid, p_patch jsonb) returns tavoli
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g tavoli;
begin
  select * into g from tavoli where id = p_id for update;
  if g.id is null or not (me = any(g.players)) then raise exception 'Non sei a questo tavolo'; end if;
  update tavoli set data = data || p_patch, updated_at = now() where id = p_id returning * into g;
  return g;
end $$;

create or replace function tavolo_finish(p_id uuid, p_result jsonb) returns tavoli
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g tavoli;
begin
  select * into g from tavoli where id = p_id for update;
  if g.id is null or not (me = any(g.players)) then raise exception 'Non autorizzato'; end if;
  if g.status in ('active', 'invited') then update tavoli set status = 'over', result = p_result, updated_at = now() where id = p_id returning * into g; end if;
  return g;
end $$;
