-- Capodanno - aggiornamento 3: notifiche a scelta, ruota della fortuna con premi, vibe del gruppo, scopa d'assi.
-- Da incollare UNA volta in Supabase → SQL Editor → New query → Run (si può rieseguire senza danni).

-- ───────────────────────── Notifiche a scelta ─────────────────────────
-- {"chat": "off", "giochi": "off"}: le categorie facoltative che una persona ha silenziato.
alter table members add column if not exists notif jsonb not null default '{}'::jsonb;

-- ───────────────────────── Vibe del gruppo (solo organizzatore) ─────────────────────────
-- Le risposte dell'organizzatore alle domande sul gruppo: le legge Zampone per capire chi è chi.
create table if not exists vibe_answers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members on delete cascade, -- null = il gruppo in generale
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
alter table vibe_answers enable row level security;
drop policy if exists vibe_admin on vibe_answers;
create policy vibe_admin on vibe_answers for all using (is_admin()) with check (is_admin());

-- ───────────────────────── Ruota della fortuna ─────────────────────────
-- Un giro al giorno (ora italiana). Il premio lo estrae il server, così nessuno può truccare la ruota.
create table if not exists wheel_spins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members on delete cascade,
  day date not null,
  prize text not null,
  amount int not null default 0,
  label text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wheel_spins_member_day on wheel_spins (member_id, day);
alter table wheel_spins enable row level security;
drop policy if exists wheel_read on wheel_spins;
create policy wheel_read on wheel_spins for select using (is_member());

-- Effetti attivi: silenzio in chat, soprannome, titolo del giorno, scudo.
create table if not exists effects (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mute', 'nick', 'title', 'shield')),
  target uuid not null references members on delete cascade,
  by uuid references members on delete set null,
  value text,
  until timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists effects_target on effects (target, until);
alter table effects enable row level security;
drop policy if exists effects_read on effects;
create policy effects_read on effects for select using (is_member());

do $$
declare t text;
begin
  foreach t in array array['wheel_spins', 'effects'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

create or replace function today_it() returns date
language sql stable as $$ select (now() at time zone 'Europe/Rome')::date $$;

create or replace function spin_wheel() returns wheel_spins
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_member_id(); d date := today_it(); n int; extra int; r numeric; s wheel_spins;
  p text; amt int := 0; lbl text;
  titles text[] := array['Sindaco della serata', 'Re del brindisi', 'Ministro del divertimento', 'Custode delle lenticchie',
    'Presidente del dopocena', 'Guardiano dello spumante', 'Assessore al trenino', 'Maestro di cerimonie', 'Influencer del gruppo', 'Capitano della playlist'];
begin
  if me is null then raise exception 'Non fai parte del gruppo'; end if;
  select count(*), count(*) filter (where prize = 'again') into n, extra from wheel_spins where member_id = me and day = d;
  if n > extra then raise exception 'Hai già girato oggi: torna domani'; end if;
  r := random() * 100;
  -- Pesi: gettoni 46, titolo 15, niente 12, soprannome 8, silenzia 7, scudo 6, rigira 5, jackpot 1.
  if r < 20 then p := 'coins'; amt := 10;
  elsif r < 34 then p := 'coins'; amt := 25;
  elsif r < 42 then p := 'coins'; amt := 50;
  elsif r < 46 then p := 'coins'; amt := 100;
  elsif r < 61 then p := 'title'; lbl := titles[1 + floor(random() * array_length(titles, 1))::int];
  elsif r < 73 then p := 'nothing';
  elsif r < 81 then p := 'nick';
  elsif r < 88 then p := 'mute';
  elsif r < 94 then p := 'shield';
  elsif r < 99 then p := 'again';
  else p := 'coins'; amt := 500; lbl := 'Jackpot';
  end if;
  insert into wheel_spins (member_id, day, prize, amount, label, used_at)
  values (me, d, p, amt, lbl, case when p in ('mute', 'nick') then null else now() end)
  returning * into s;
  if p = 'title' then insert into effects (kind, target, by, value, until) values ('title', me, me, lbl, now() + interval '24 hours'); end if;
  if p = 'shield' then insert into effects (kind, target, by, until) values ('shield', me, me, now() + interval '24 hours'); end if;
  return s;
end $$;

-- Usa un premio da giocare su qualcuno: silenzio o soprannome per un'ora (entro 48 ore dalla vincita).
create or replace function use_prize(p_spin uuid, p_target uuid, p_value text default null) returns effects
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); s wheel_spins; e effects;
begin
  select * into s from wheel_spins where id = p_spin for update;
  if s.id is null or s.member_id <> me then raise exception 'Premio non tuo'; end if;
  if s.used_at is not null then raise exception 'Premio già usato'; end if;
  if s.prize not in ('mute', 'nick') then raise exception 'Questo premio non si usa su altri'; end if;
  if s.created_at < now() - interval '48 hours' then raise exception 'Premio scaduto'; end if;
  if p_target = me or not exists (select 1 from members where id = p_target) then raise exception 'Scegli qualcun altro'; end if;
  if exists (select 1 from effects where kind = 'shield' and target = p_target and until > now()) then raise exception 'Ha lo scudo attivo: ritenta più tardi'; end if;
  if s.prize = 'nick' and (p_value is null or length(trim(p_value)) < 2 or length(p_value) > 24) then raise exception 'Soprannome da 2 a 24 caratteri'; end if;
  update wheel_spins set used_at = now() where id = p_spin;
  insert into effects (kind, target, by, value, until)
  values (s.prize, p_target, me, case when s.prize = 'nick' then trim(p_value) end, now() + interval '1 hour')
  returning * into e;
  return e;
end $$;

-- Chi è silenziato non può scrivere nella chat di gruppo finché dura l'effetto.
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert
  with check (role = 'user' and member_id = my_member_id() and (channel <> 'privato' or owner = my_member_id())
    and (channel <> 'gruppo' or not exists (select 1 from effects where kind = 'mute' and target = my_member_id() and until > now())));

-- ───────────────────────── Scopa d'assi in quattro ─────────────────────────
-- Posti 0 e 2 contro 1 e 3. Il mazzo si mescola da un seme casuale scelto dal server quando tutti accettano;
-- ogni telefono ricostruisce la partita dalla lista delle giocate. Il server controlla turni e giocatori.
create table if not exists card_games (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'scopa' check (kind in ('scopa')),
  players uuid[] not null,
  accepted boolean[] not null default array[true, false, false, false],
  created_by uuid not null references members on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'invited' check (status in ('invited', 'active', 'over', 'cancelled')),
  seed bigint,
  actions jsonb not null default '[]'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_games_status on card_games (status, updated_at desc);
alter table card_games enable row level security;
drop policy if exists card_read on card_games;
create policy card_read on card_games for select using (is_member());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'card_games') then
    alter publication supabase_realtime add table card_games;
  end if;
end $$;

create or replace function card_create(p_players uuid[], p_settings jsonb) returns card_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g card_games;
begin
  if me is null then raise exception 'Non fai parte del gruppo'; end if;
  if array_length(p_players, 1) <> 4 or p_players[1] <> me then raise exception 'Servono quattro giocatori, tu per primo'; end if;
  if (select count(distinct x) from unnest(p_players) x) <> 4 then raise exception 'Quattro persone diverse'; end if;
  if (select count(*) from members where id = any(p_players)) <> 4 then raise exception 'Giocatore non valido'; end if;
  update card_games set status = 'cancelled', updated_at = now() where created_by = me and status = 'invited';
  insert into card_games (players, created_by, settings) values (p_players, me, coalesce(p_settings, '{}'::jsonb)) returning * into g;
  return g;
end $$;

create or replace function card_answer(p_id uuid, p_ok boolean) returns card_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g card_games; i int; acc boolean[];
begin
  select * into g from card_games where id = p_id for update;
  if g.id is null or g.status <> 'invited' then raise exception 'Invito scaduto'; end if;
  i := array_position(g.players, me);
  if i is null or i = 1 then raise exception 'Non autorizzato'; end if;
  if not p_ok then
    update card_games set status = 'cancelled', result = jsonb_build_object('declined', me), updated_at = now() where id = p_id returning * into g;
    return g;
  end if;
  acc := g.accepted; acc[i] := true;
  update card_games set accepted = acc,
    status = case when true = all(acc) then 'active' else 'invited' end,
    seed = case when true = all(acc) then floor(random() * 2147483647)::bigint end,
    updated_at = now()
  where id = p_id returning * into g;
  return g;
end $$;

create or replace function card_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update card_games set status = 'cancelled', updated_at = now()
  where id = p_id and created_by = my_member_id() and status = 'invited';
end $$;

-- Turno: 36 giocate per mano (9 carte a testa); il mazziere ruota a ogni mano e inizia chi gli sta a destra.
create or replace function card_play(p_id uuid, p_ply int, p_action jsonb) returns card_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g card_games; n int; seat int;
begin
  select * into g from card_games where id = p_id for update;
  if g.id is null or g.status <> 'active' then raise exception 'La partita è finita'; end if;
  n := jsonb_array_length(g.actions);
  if p_ply <> n then raise exception 'Posizione cambiata, riprova'; end if;
  seat := ((n / 36) + 1 + (n % 36)) % 4;
  if g.players[seat + 1] is distinct from me then raise exception 'Non è il tuo turno'; end if;
  update card_games set actions = actions || jsonb_build_array(p_action || jsonb_build_object('s', seat, 't', now_ms())), updated_at = now()
  where id = p_id returning * into g;
  return g;
end $$;

create or replace function card_finish(p_id uuid, p_result jsonb) returns card_games
language plpgsql security definer set search_path = public as $$
declare me uuid := my_member_id(); g card_games;
begin
  select * into g from card_games where id = p_id for update;
  if g.id is null or me <> all(g.players) then raise exception 'Non autorizzato'; end if;
  if g.status = 'active' then
    update card_games set status = 'over', result = p_result, updated_at = now() where id = p_id returning * into g;
  end if;
  return g;
end $$;
