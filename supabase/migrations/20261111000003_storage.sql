-- =====================================================================
-- EuroKink — stockage des visuels de soirée (Supabase Storage)
-- À exécuter uniquement sur Supabase (schéma « storage »).
-- Chemin attendu : <organizer_id>/<nom-du-fichier>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Lecture publique (les visuels de soirées publiées sont affichés à tous)
create policy "event_images_read" on storage.objects for select
  using (bucket_id = 'event-images');

-- Envoi, remplacement, suppression : membres de l'organisateur ou admin
create policy "event_images_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images'
              and (public.is_admin()
                   or public.is_organizer_member(((storage.foldername(name))[1])::uuid)));

create policy "event_images_update" on storage.objects for update to authenticated
  using (bucket_id = 'event-images'
         and (public.is_admin()
              or public.is_organizer_member(((storage.foldername(name))[1])::uuid)));

create policy "event_images_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-images'
         and (public.is_admin()
              or public.is_organizer_member(((storage.foldername(name))[1])::uuid)));
