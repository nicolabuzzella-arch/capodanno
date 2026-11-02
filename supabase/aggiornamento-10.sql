-- Capodanno - aggiornamento 10: playlist del gruppo, stanze e letti.
-- Incolla nel SQL Editor di Supabase e premi Run (si può rieseguire senza problemi).

-- Playlist: ognuno aggiunge canzoni, tutti votano.
create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  added_by uuid references members on delete set null,
  title text not null,
  artist text,
  artwork text,
  preview text,
  ext_url text,
  created_at timestamptz not null default now()
);
create table if not exists song_votes (
  song_id uuid not null references songs on delete cascade,
  member_id uuid not null references members on delete cascade,
  created_at timestamptz not null default now(),
  primary key (song_id, member_id)
);

-- Stanze e letti: l'organizzatore disegna le stanze, ognuno sceglie il suo letto.
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  beds jsonb not null default '[]'::jsonb,   -- [{ k: "a", label: "Matrimoniale", type: "doppio" | "singolo" | "divano" | "castello" }]
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists bed_picks (
  member_id uuid primary key references members on delete cascade,
  room_id uuid not null references rooms on delete cascade,
  bed text not null,
  slot int not null default 0,              -- 0 o 1 nei letti doppi
  created_at timestamptz not null default now(),
  unique (room_id, bed, slot)
);

alter table songs enable row level security;
alter table song_votes enable row level security;
alter table rooms enable row level security;
alter table bed_picks enable row level security;

drop policy if exists songs_read on songs;
create policy songs_read on songs for select using (is_member());
drop policy if exists songs_add on songs;
create policy songs_add on songs for insert with check (is_member() and added_by = my_member_id());
drop policy if exists songs_del on songs;
create policy songs_del on songs for delete using (added_by = my_member_id() or is_admin());

drop policy if exists song_votes_read on song_votes;
create policy song_votes_read on song_votes for select using (is_member());
drop policy if exists song_votes_add on song_votes;
create policy song_votes_add on song_votes for insert with check (member_id = my_member_id());
drop policy if exists song_votes_del on song_votes;
create policy song_votes_del on song_votes for delete using (member_id = my_member_id());

drop policy if exists rooms_read on rooms;
create policy rooms_read on rooms for select using (is_member());
drop policy if exists rooms_admin on rooms;
create policy rooms_admin on rooms for all using (is_admin()) with check (is_admin());

drop policy if exists bed_picks_read on bed_picks;
create policy bed_picks_read on bed_picks for select using (is_member());
drop policy if exists bed_picks_write on bed_picks;
create policy bed_picks_write on bed_picks for all using (member_id = my_member_id() or is_admin()) with check (member_id = my_member_id() or is_admin());

do $$
declare t text;
begin
  foreach t in array array['songs', 'song_votes', 'rooms', 'bed_picks'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
