-- Capodanno - aggiornamento 1: profili creati dall'organizzatore, note per l'assistente, notifiche push.
-- Da incollare UNA volta in Supabase → SQL Editor → New query → Run (si può rieseguire senza danni).

-- ───────────────────────── Profili e note ─────────────────────────

alter table members add column if not exists notes text;
alter table members add column if not exists avatar_url text;

-- Niente più «Ci sei?»: chi riceve il link fa già parte del gruppo.
alter table members alter column rsvp set default 'si';
update members set rsvp = 'si' where rsvp <> 'si';
alter table trip add column if not exists group_notes text;

-- L'organizzatore può creare i profili degli amici: al primo accesso ognuno sceglie il proprio PIN.
drop policy if exists members_insert on members;
create policy members_insert on members for insert with check (is_admin());

create or replace function trip_preview(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare t trip;
begin
  select * into t from trip where upper(invite_code) = upper(trim(p_code));
  if not found then return null; end if;
  return json_build_object(
    'name', t.name,
    'members', coalesce((select json_agg(json_build_object(
        'id', m.id, 'name', m.name, 'color', m.color, 'avatar_url', m.avatar_url,
        'claimed', exists (select 1 from member_secrets s where s.member_id = m.id)
      ) order by m.created_at) from members m), '[]'::json)
  );
end $$;

create or replace function claim_member(p_code text, p_member uuid, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Sessione mancante'; end if;
  if not exists (select 1 from trip where upper(invite_code) = upper(trim(p_code))) then raise exception 'Codice invito non valido'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'Il PIN deve avere 4 cifre'; end if;
  if not exists (select 1 from members where id = p_member) then raise exception 'Persona non trovata'; end if;
  if exists (select 1 from member_secrets where member_id = p_member) then raise exception 'Questo profilo ha già un PIN: inseriscilo per entrare'; end if;
  insert into member_secrets (member_id, pin_hash) values (p_member, crypt(p_pin, gen_salt('bf')));
  insert into devices (user_id, member_id) values (auth.uid(), p_member)
    on conflict (user_id) do update set member_id = excluded.member_id;
  return p_member;
end $$;

-- Reimpostare il PIN funziona anche per i profili che non l'hanno ancora scelto.
create or replace function reset_pin(p_member uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (is_admin() or my_member_id() = p_member) then raise exception 'Non autorizzato'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'Il PIN deve avere 4 cifre'; end if;
  insert into member_secrets (member_id, pin_hash) values (p_member, crypt(p_pin, gen_salt('bf')))
    on conflict (member_id) do update set pin_hash = excluded.pin_hash, failed = 0;
end $$;

-- ───────────────────────── Notifiche push ─────────────────────────

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_read on push_subscriptions;
create policy push_read on push_subscriptions for select using (member_id = my_member_id());

create or replace function save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_member_id() is null then raise exception 'Non fai parte del gruppo'; end if;
  insert into push_subscriptions (member_id, endpoint, p256dh, auth) values (my_member_id(), p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function drop_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and member_id = my_member_id()
$$;

-- Segreti del server (chiavi delle notifiche, parola d'ordine del promemoria): nessuna policy, li legge solo il server.
create table if not exists app_secrets (key text primary key, value text not null);
alter table app_secrets enable row level security;
insert into app_secrets (key, value) values ('cron', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

-- Promemoria ogni sera alle 18 (ora italiana d'inverno): a ognuno solo quello che aspetta una sua risposta.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule('capodanno-promemoria') where exists (select 1 from cron.job where jobname = 'capodanno-promemoria');
select cron.schedule('capodanno-promemoria', '0 17 * * *', $$
  select net.http_post(
    url := 'https://hvrolzzeyclxfcdoaubx.supabase.co/functions/v1/notifiche',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select value from public.app_secrets where key = 'cron')),
    body := '{"type":"daily"}'::jsonb
  )
$$);

-- ───────────────────────── Foto profilo ─────────────────────────
-- Cartella pubblica in sola lettura: le foto si mostrano senza link temporanei. Caricano e cancellano solo i membri.


insert into storage.buckets (id, name, public, file_size_limit)
values ('avatar', 'avatar', true, 2097152)
on conflict (id) do nothing;

drop policy if exists avatar_insert on storage.objects;
create policy avatar_insert on storage.objects for insert with check (bucket_id = 'avatar' and public.is_member());
drop policy if exists avatar_delete on storage.objects;
create policy avatar_delete on storage.objects for delete using (bucket_id = 'avatar' and public.is_member());

-- ───────────────────────── Chat: risposte, proposte dell'assistente, spazio Ascolto ─────────────────────────

alter table messages add column if not exists reply_to uuid references messages(id) on delete set null;
alter table messages add column if not exists owner uuid references members on delete cascade;
alter table messages add column if not exists meta jsonb;
alter table messages drop constraint if exists messages_channel_check;
alter table messages add constraint messages_channel_check check (channel in ('assistente', 'gruppo', 'privato'));

-- La chat «Ascolto» la legge e la cancella solo chi l'ha scritta: nessun altro membro, nemmeno l'organizzatore.
drop policy if exists messages_read on messages;
create policy messages_read on messages for select
  using (case when channel = 'privato' then owner = my_member_id() else is_member() end);
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert
  with check (role = 'user' and member_id = my_member_id() and (channel <> 'privato' or owner = my_member_id()));
drop policy if exists messages_delete on messages;
create policy messages_delete on messages for delete
  using (case when channel = 'privato' then owner = my_member_id() else (is_admin() or member_id = my_member_id()) end);

-- ───────────────────────── Questionario del primo accesso ─────────────────────────
alter table members add column if not exists onboarded boolean not null default false;

-- ───────────────────────── Il gruppo in breve (lo legge l'assistente; si modifica da Gruppo → Dati del viaggio) ─────────────────────────
update trip set group_notes = 'Siamo una dozzina di ragazzi tra i 25 e i 28 anni, tutti simpatici. Per Capodanno vogliamo fare festa, bere e stare in una bella città. Budget diversi: qualcuno può e vuole spendere di più, altri meno. Pochi sono interessati a visitare, i più vogliono fare casino e bere. Nel gruppo ci sono 4 o 5 coppie. Partiamo quasi tutti da Chiavenna (SO), probabilmente in macchina; in alternativa aereo o treno, ma spendendo poco.'
where id = 1 and (group_notes is null or group_notes = '');

-- ───────────────────────── Suggerimenti per l'app ─────────────────────────
-- Il numero WhatsApp dell'organizzatore si imposta dall'app (Gruppo → Dati del viaggio), non nel codice.
alter table trip add column if not exists feedback_whatsapp text;

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members on delete set null,
  kind text not null default 'idea',
  text text not null,
  status text not null default 'nuovo',
  created_at timestamptz not null default now()
);
alter table feedback enable row level security;
drop policy if exists feedback_insert on feedback;
create policy feedback_insert on feedback for insert with check (member_id = my_member_id());
drop policy if exists feedback_read on feedback;
create policy feedback_read on feedback for select using (is_admin() or member_id = my_member_id());
drop policy if exists feedback_admin on feedback;
create policy feedback_admin on feedback for update using (is_admin()) with check (is_admin());
drop policy if exists feedback_delete on feedback;
create policy feedback_delete on feedback for delete using (is_admin());

-- ───────────────────────── Il punto della situazione, ogni mattina alle 9 (ora italiana d'inverno) ─────────────────────────
select cron.unschedule('capodanno-buongiorno') where exists (select 1 from cron.job where jobname = 'capodanno-buongiorno');
select cron.schedule('capodanno-buongiorno', '0 8 * * *', $$
  select net.http_post(
    url := 'https://hvrolzzeyclxfcdoaubx.supabase.co/functions/v1/assistente',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select value from public.app_secrets where key = 'cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
$$);

-- ───────────────────────── Zampone, l'agente ─────────────────────────
alter table trip add column if not exists ai_name text not null default 'Zampone';
alter table polls add column if not exists nudged_at timestamptz;
