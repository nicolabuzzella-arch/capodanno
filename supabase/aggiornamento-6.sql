-- Capodanno - aggiornamento 6: video in chat.
-- Incolla nel SQL Editor di Supabase e premi Run (si può rieseguire senza problemi).
insert into storage.buckets (id, name, public, file_size_limit)
values ('video', 'video', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;
drop policy if exists video_insert on storage.objects;
create policy video_insert on storage.objects for insert with check (bucket_id = 'video' and public.is_member());
drop policy if exists video_delete on storage.objects;
create policy video_delete on storage.objects for delete using (bucket_id = 'video' and public.is_member());
