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
