-- Capodanno - aggiornamento 2: messaggi vocali e scacchi.
-- Da incollare UNA volta in Supabase → SQL Editor → New query → Run (si può rieseguire senza danni).

-- ───────────────────────── Messaggi vocali ─────────────────────────
-- I file hanno nomi casuali e impossibili da indovinare; caricarli e cancellarli può solo chi è nel gruppo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('vocali', 'vocali', true, 5242880)
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists vocali_insert on storage.objects;
create policy vocali_insert on storage.objects for insert with check (bucket_id = 'vocali' and public.is_member());
drop policy if exists vocali_delete on storage.objects;
create policy vocali_delete on storage.objects for delete using (bucket_id = 'vocali' and public.is_member());

-- ───────────────────────── Scacchi ─────────────────────────
-- Una riga per partita. Le mosse sono una lista di {u: mossa UCI, t: istante del server in ms}:
-- gli orologi si calcolano dagli istanti del server, così nessuno può barare con l'ora del telefono.
-- Si scrive solo tramite le funzioni qui sotto, che controllano turno, orologio e giocatori.
create table if not exists chess_games (
  id uuid primary key default gen_random_uuid(),
  white uuid not null references members on delete cascade,
  black uuid not null references members on delete cascade,
  created_by uuid not null references members on delete cascade,
  tc text not null check (tc in ('3+2', '5+5', '10+0')),
  base_ms int not null,
  inc_ms int not null,
  status text not null default 'invited' check (status in ('invited', 'active', 'over', 'declined', 'cancelled')),
  moves jsonb not null default '[]'::jsonb,
  result text check (result in ('1-0', '0-1', '1/2-1/2', 'aborted')),
  reason text,
  draw_offer uuid references members on delete set null,
  started_ms bigint,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chess_games_status on chess_games (status, updated_at desc);

alter table chess_games enable row level security;
drop policy if exists chess_read on chess_games;
create policy chess_read on chess_games for select using (is_member());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chess_games') then
    alter publication supabase_realtime add table chess_games;
  end if;
end $$;

create or replace function now_ms() returns bigint
language sql volatile as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- Tempo rimasto [bianco, nero] in millisecondi all'istante at_ms.
-- Le prime due mosse (una a testa) non consumano tempo; dopo ogni mossa si aggiunge l'incremento.
create or replace function chess_clock(g chess_games, at_ms bigint) returns bigint[]
language plpgsql stable as $$
declare
  n int := jsonb_array_length(g.moves);
  w bigint := g.base_ms;
  b bigint := g.base_ms;
  prev bigint := g.started_ms;
  t bigint;
begin
  for i in 0 .. n - 1 loop
    t := (g.moves -> i ->> 't')::bigint;
    if i >= 2 then
      if i % 2 = 0 then w := w - (t - prev) + g.inc_ms; else b := b - (t - prev) + g.inc_ms; end if;
    end if;
    prev := t;
  end loop;
  if g.status = 'active' and n >= 2 then
    if n % 2 = 0 then w := w - (at_ms - prev); else b := b - (at_ms - prev); end if;
  end if;
  return array[w, b];
end $$;

create or replace function chess_finish(p_id uuid, p_result text, p_reason text) returns void
language sql security definer set search_path = public as $$
  update chess_games set status = 'over', result = p_result, reason = p_reason, draw_offer = null,
    ended_at = now(), updated_at = now() where id = p_id;
$$;
revoke execute on function chess_finish(uuid, text, text) from public, anon, authenticated;

create or replace function server_ms() returns bigint
language sql volatile as $$ select now_ms() $$;

create or replace function chess_invite(p_opp uuid, p_tc text, p_color text default 'r') returns chess_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g chess_games; white_first boolean;
begin
  if me is null then raise exception 'Non fai parte del gruppo'; end if;
  if p_opp = me or not exists (select 1 from members where id = p_opp) then raise exception 'Avversario non valido'; end if;
  if p_tc not in ('3+2', '5+5', '10+0') then raise exception 'Cadenza non valida'; end if;
  white_first := case p_color when 'w' then true when 'b' then false else random() < 0.5 end;
  -- Un solo invito in sospeso per volta.
  update chess_games set status = 'cancelled', updated_at = now() where created_by = me and status = 'invited';
  insert into chess_games (white, black, created_by, tc, base_ms, inc_ms)
  values (case when white_first then me else p_opp end, case when white_first then p_opp else me end, me, p_tc,
          split_part(p_tc, '+', 1)::int * 60000, split_part(p_tc, '+', 2)::int * 1000)
  returning * into g;
  return g;
end $$;

create or replace function chess_answer(p_id uuid, p_ok boolean) returns chess_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g chess_games;
begin
  select * into g from chess_games where id = p_id for update;
  if g.id is null or g.status <> 'invited' then raise exception 'Invito scaduto'; end if;
  if me not in (g.white, g.black) or me = g.created_by then raise exception 'Non autorizzato'; end if;
  if g.created_at < now() - interval '15 minutes' then
    update chess_games set status = 'cancelled', updated_at = now() where id = p_id;
    raise exception 'Invito scaduto';
  end if;
  update chess_games set status = case when p_ok then 'active' else 'declined' end,
    started_ms = case when p_ok then now_ms() end, updated_at = now()
  where id = p_id returning * into g;
  return g;
end $$;

create or replace function chess_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update chess_games set status = 'cancelled', updated_at = now()
  where id = p_id and created_by = my_member_id() and status = 'invited';
end $$;

-- p_ply = numero di mosse già giocate (serve a scartare mosse doppie o fuori tempo).
-- p_result/p_reason: il telefono che dà matto, stallo o patta lo dichiara insieme alla mossa.
create or replace function chess_move(p_id uuid, p_ply int, p_uci text, p_result text default null, p_reason text default null) returns chess_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g chess_games; n int; mover uuid; clk bigint[]; now_t bigint := now_ms(); white_moves boolean;
begin
  select * into g from chess_games where id = p_id for update;
  if g.id is null or g.status <> 'active' then raise exception 'La partita è finita'; end if;
  n := jsonb_array_length(g.moves);
  if p_ply <> n then raise exception 'Posizione cambiata, riprova'; end if;
  white_moves := n % 2 = 0;
  mover := case when white_moves then g.white else g.black end;
  if me is distinct from mover then raise exception 'Non è il tuo turno'; end if;
  if p_uci !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' then raise exception 'Mossa non valida'; end if;
  -- Bandierina: se il tempo è finito (con mezzo secondo di tolleranza per la rete), la mossa non vale.
  if n >= 2 then
    clk := chess_clock(g, now_t);
    if (case when white_moves then clk[1] else clk[2] end) < -500 then
      perform chess_finish(p_id, case when white_moves then '0-1' else '1-0' end, 'tempo');
      select * into g from chess_games where id = p_id;
      return g;
    end if;
  end if;
  update chess_games set moves = moves || jsonb_build_array(jsonb_build_object('u', p_uci, 't', now_t)),
    draw_offer = null, updated_at = now()
  where id = p_id;
  if p_result is not null then
    if p_result not in ('1-0', '0-1', '1/2-1/2') then raise exception 'Risultato non valido'; end if;
    if p_reason = 'matto' and p_result <> (case when white_moves then '1-0' else '0-1' end) then raise exception 'Risultato non valido'; end if;
    perform chess_finish(p_id, p_result, coalesce(p_reason, 'patta'));
  end if;
  select * into g from chess_games where id = p_id;
  return g;
end $$;

create or replace function chess_resign(p_id uuid) returns chess_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g chess_games;
begin
  select * into g from chess_games where id = p_id for update;
  if g.id is null or g.status <> 'active' or me not in (g.white, g.black) then raise exception 'Non autorizzato'; end if;
  if jsonb_array_length(g.moves) < 2 then perform chess_finish(p_id, 'aborted', 'annullata');
  else perform chess_finish(p_id, case when me = g.white then '0-1' else '1-0' end, 'abbandono'); end if;
  select * into g from chess_games where id = p_id;
  return g;
end $$;

create or replace function chess_draw(p_id uuid, p_action text) returns chess_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g chess_games;
begin
  select * into g from chess_games where id = p_id for update;
  if g.id is null or g.status <> 'active' or me not in (g.white, g.black) then raise exception 'Non autorizzato'; end if;
  if p_action = 'offer' then
    if g.draw_offer is not null and g.draw_offer <> me then perform chess_finish(p_id, '1/2-1/2', 'accordo');
    else update chess_games set draw_offer = me, updated_at = now() where id = p_id; end if;
  elsif p_action = 'accept' and g.draw_offer is not null and g.draw_offer <> me then
    perform chess_finish(p_id, '1/2-1/2', 'accordo');
  elsif p_action = 'decline' and g.draw_offer is not null and g.draw_offer <> me then
    update chess_games set draw_offer = null, updated_at = now() where id = p_id;
  end if;
  select * into g from chess_games where id = p_id;
  return g;
end $$;

-- Chiunque nel gruppo può chiedere di controllare l'orologio: chiude la partita se qualcuno è senza tempo
-- o se una delle prime due mosse non arriva entro 30 secondi.
create or replace function chess_flag(p_id uuid) returns chess_games
language plpgsql security definer set search_path = public as $$
declare g chess_games; n int; clk bigint[]; now_t bigint := now_ms(); last_t bigint;
begin
  if not is_member() then raise exception 'Non autorizzato'; end if;
  select * into g from chess_games where id = p_id for update;
  if g.id is null or g.status <> 'active' then return g; end if;
  n := jsonb_array_length(g.moves);
  if n < 2 then
    last_t := case when n = 0 then g.started_ms else (g.moves -> 0 ->> 't')::bigint end;
    if now_t - last_t > 30000 then perform chess_finish(p_id, 'aborted', 'prima mossa'); end if;
  else
    clk := chess_clock(g, now_t);
    if n % 2 = 0 and clk[1] <= 0 then perform chess_finish(p_id, '0-1', 'tempo');
    elsif n % 2 = 1 and clk[2] <= 0 then perform chess_finish(p_id, '1-0', 'tempo'); end if;
  end if;
  select * into g from chess_games where id = p_id;
  return g;
end $$;
