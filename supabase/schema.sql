-- Capodanno - schema del database.
-- Da incollare UNA volta in Supabase → SQL Editor → New query → Run.
-- Prima di eseguire, cambia il codice invito qui sotto (riga "CAMBIAMI").

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── Tabelle ─────────────────────────

create table if not exists trip (
  id int primary key default 1 check (id = 1),
  name text not null default 'Capodanno',
  destination text,
  start_date date,
  end_date date,
  invite_code text not null,
  notes text,
  created_at timestamptz not null default now()
);

insert into trip (invite_code) values ('CAMBIAMI') on conflict (id) do nothing;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#e8e8ec',
  rsvp text not null default 'forse' check (rsvp in ('si', 'forse', 'no')),
  phone text,
  email text,
  diet text,
  allergies text,
  preferences text,
  car_seats int not null default 0,
  departure_city text,
  emergency_name text,
  emergency_phone text,
  paypal text,
  iban text,
  satispay text,
  ride_with uuid references members on delete set null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- PIN cifrati: nessuna policy, li leggono solo le funzioni qui sotto.
create table if not exists member_secrets (
  member_id uuid primary key references members on delete cascade,
  pin_hash text not null,
  failed int not null default 0
);

-- Ogni telefono (sessione anonima) è collegato a un membro.
create table if not exists devices (
  user_id uuid primary key,
  member_id uuid not null references members on delete cascade,
  created_at timestamptz not null default now()
);

-- Dati per prenotazioni e registrazione in hotel: li vede solo il diretto interessato e l'organizzatore.
create table if not exists member_private (
  member_id uuid primary key references members on delete cascade,
  legal_name text,
  birth_date date,
  birth_place text,
  nationality text,
  fiscal_code text,
  doc_type text,
  doc_number text,
  doc_issued_by text,
  doc_expiry date,
  address text,
  updated_at timestamptz not null default now()
);

create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  description text,
  kind text not null default 'single' check (kind in ('single', 'multi')),
  allow_add boolean not null default true,
  status text not null default 'open' check (status in ('open', 'closed')),
  closes_at timestamptz,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls on delete cascade,
  label text not null,
  details text,
  url text,
  price numeric,
  added_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists votes (
  poll_id uuid not null references polls on delete cascade,
  option_id uuid not null references poll_options on delete cascade,
  member_id uuid not null references members on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, member_id)
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'altro',
  title text not null,
  status text not null default 'idea' check (status in ('idea', 'da_prenotare', 'prenotato', 'pagato', 'annullato')),
  provider text,
  code text,
  start_at timestamptz,
  end_at timestamptz,
  address text,
  url text,
  phone text,
  price numeric,
  paid_by uuid references members on delete set null,
  cancel_by date,
  notes text,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists payment_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric not null check (amount > 0),
  due_date date,
  pay_to uuid not null references members on delete cascade,
  debtors uuid[] not null,
  note text,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

-- Spese in stile Splitwise: payers = chi ha messo i soldi, owed = di chi è la spesa (mappe id membro → euro).
-- I pagamenti tra persone (saldi, quote) sono righe con kind = 'payment'.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric not null check (amount > 0),
  kind text not null default 'expense' check (kind in ('expense', 'payment')),
  category text not null default 'altro',
  payers jsonb not null,
  owed jsonb not null,
  split_mode text not null default 'equal' check (split_mode in ('equal', 'exact', 'percent', 'shares')),
  split_input jsonb,
  note text,
  spent_on date not null default current_date,
  booking_id uuid references bookings on delete set null,
  request_id uuid references payment_requests on delete set null,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings on delete cascade,
  expense_id uuid references expenses on delete cascade,
  name text not null,
  path text not null,
  size int,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members on delete cascade,
  game text not null,
  score int not null,
  day date not null default current_date,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists itinerary (
  id uuid primary key default gen_random_uuid(),
  day date,
  time text,
  title text not null,
  place text,
  notes text,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists checklist (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  assignee uuid references members on delete set null,
  done boolean not null default false,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members on delete set null,
  role text not null check (role in ('user', 'assistant')),
  channel text not null default 'assistente' check (channel in ('assistente', 'gruppo')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Funzioni di supporto ─────────────────────────

create or replace function my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from devices where user_id = auth.uid()
$$;

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from devices where user_id = auth.uid())
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select m.is_admin from members m join devices d on d.member_id = m.id where d.user_id = auth.uid()), false)
$$;

-- Anteprima per la schermata di ingresso: nome del viaggio e chi c'è già (solo con il codice giusto).
create or replace function trip_preview(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare t trip;
begin
  select * into t from trip where upper(invite_code) = upper(trim(p_code));
  if not found then return null; end if;
  return json_build_object(
    'name', t.name,
    'members', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'color', color) order by created_at) from members), '[]'::json)
  );
end $$;

create or replace function join_trip(p_code text, p_name text, p_color text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessione mancante'; end if;
  if not exists (select 1 from trip where upper(invite_code) = upper(trim(p_code))) then raise exception 'Codice invito non valido'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'Il PIN deve avere 4 cifre'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Scrivi il tuo nome'; end if;
  if exists (select 1 from members where lower(name) = lower(trim(p_name))) then raise exception 'Questo nome è già nel gruppo: torna indietro e tocca il tuo nome'; end if;

  insert into members (name, color, is_admin)
  values (trim(p_name), coalesce(nullif(p_color, ''), '#e8e8ec'), not exists (select 1 from members))
  returning id into new_id;

  insert into member_secrets (member_id, pin_hash) values (new_id, crypt(p_pin, gen_salt('bf')));
  insert into devices (user_id, member_id) values (auth.uid(), new_id)
    on conflict (user_id) do update set member_id = excluded.member_id;
  return new_id;
end $$;

create or replace function rejoin_trip(p_code text, p_member uuid, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare s member_secrets;
begin
  if auth.uid() is null then raise exception 'Sessione mancante'; end if;
  if not exists (select 1 from trip where upper(invite_code) = upper(trim(p_code))) then raise exception 'Codice invito non valido'; end if;
  select * into s from member_secrets where member_id = p_member;
  if not found then raise exception 'Persona non trovata'; end if;
  if s.failed >= 8 then raise exception 'Troppi tentativi: chiedi all''organizzatore di reimpostare il PIN'; end if;
  if s.pin_hash <> crypt(p_pin, s.pin_hash) then
    -- Niente eccezione qui, altrimenti il contatore dei tentativi verrebbe annullato.
    update member_secrets set failed = failed + 1 where member_id = p_member;
    return null;
  end if;
  update member_secrets set failed = 0 where member_id = p_member;
  insert into devices (user_id, member_id) values (auth.uid(), p_member)
    on conflict (user_id) do update set member_id = excluded.member_id;
  return p_member;
end $$;

create or replace function reset_pin(p_member uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (is_admin() or my_member_id() = p_member) then raise exception 'Non autorizzato'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'Il PIN deve avere 4 cifre'; end if;
  update member_secrets set pin_hash = crypt(p_pin, gen_salt('bf')), failed = 0 where member_id = p_member;
end $$;

create or replace function leave_device() returns void
language sql security definer set search_path = public as $$
  delete from devices where user_id = auth.uid()
$$;

-- Solo un organizzatore può nominare o togliere organizzatori.
create or replace function guard_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null and not is_admin() then
    raise exception 'Solo l''organizzatore può cambiare i ruoli';
  end if;
  return new;
end $$;

drop trigger if exists members_guard_admin on members;
create trigger members_guard_admin before update on members for each row execute function guard_admin_flag();

-- ───────────────────────── Sicurezza (RLS) ─────────────────────────

alter table trip enable row level security;
alter table members enable row level security;
alter table member_secrets enable row level security;
alter table devices enable row level security;
alter table member_private enable row level security;
alter table polls enable row level security;
alter table poll_options enable row level security;
alter table votes enable row level security;
alter table bookings enable row level security;
alter table expenses enable row level security;
alter table itinerary enable row level security;
alter table checklist enable row level security;
alter table messages enable row level security;
alter table payment_requests enable row level security;
alter table files enable row level security;
alter table scores enable row level security;

drop policy if exists trip_read on trip;
create policy trip_read on trip for select using (is_member());
drop policy if exists trip_write on trip;
create policy trip_write on trip for update using (is_admin()) with check (is_admin());

drop policy if exists members_read on members;
create policy members_read on members for select using (is_member());
drop policy if exists members_update on members;
create policy members_update on members for update using (id = my_member_id() or is_admin()) with check (id = my_member_id() or is_admin());
drop policy if exists members_delete on members;
create policy members_delete on members for delete using (is_admin());

drop policy if exists devices_read on devices;
create policy devices_read on devices for select using (user_id = auth.uid());

drop policy if exists private_all on member_private;
create policy private_all on member_private for all
  using (member_id = my_member_id() or is_admin())
  with check (member_id = my_member_id() or is_admin());

drop policy if exists votes_read on votes;
create policy votes_read on votes for select using (is_member());
drop policy if exists votes_insert on votes;
create policy votes_insert on votes for insert with check (member_id = my_member_id());
drop policy if exists votes_delete on votes;
create policy votes_delete on votes for delete using (member_id = my_member_id());

drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (is_member());
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert with check (role = 'user' and member_id = my_member_id());
drop policy if exists messages_delete on messages;
create policy messages_delete on messages for delete using (is_admin() or member_id = my_member_id());

drop policy if exists scores_read on scores;
create policy scores_read on scores for select using (is_member());
drop policy if exists scores_insert on scores;
create policy scores_insert on scores for insert with check (member_id = my_member_id());
drop policy if exists scores_delete on scores;
create policy scores_delete on scores for delete using (is_admin());

-- Tabelle condivise: chi è nel gruppo può leggere e modificare tutto.
do $$
declare t text;
begin
  foreach t in array array['polls', 'poll_options', 'bookings', 'expenses', 'payment_requests', 'files', 'itinerary', 'checklist'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format('create policy %I on %I for all using (is_member()) with check (is_member())', t || '_all', t);
  end loop;
end $$;

-- ───────────────────────── Aggiornamenti in tempo reale ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['trip', 'members', 'member_private', 'polls', 'poll_options', 'votes', 'bookings', 'expenses', 'payment_requests', 'files', 'scores', 'itinerary', 'checklist', 'messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ───────────────────────── Documenti (biglietti, scontrini) ─────────────────────────
-- Cartella privata: si leggono solo da dentro l'app, con link temporanei.

insert into storage.buckets (id, name, public, file_size_limit)
values ('documenti', 'documenti', false, 20971520)
on conflict (id) do nothing;

drop policy if exists documenti_read on storage.objects;
create policy documenti_read on storage.objects for select using (bucket_id = 'documenti' and public.is_member());
drop policy if exists documenti_insert on storage.objects;
create policy documenti_insert on storage.objects for insert with check (bucket_id = 'documenti' and public.is_member());
drop policy if exists documenti_delete on storage.objects;
create policy documenti_delete on storage.objects for delete using (bucket_id = 'documenti' and public.is_member());
