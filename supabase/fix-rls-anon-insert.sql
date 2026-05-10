-- À exécuter une fois dans Supabase → SQL Editor
-- Pour un site HTML/JS avec la clé "anon" seulement (pas de connexion utilisateur).

-- ─── Table media : autoriser INSERT pour le rôle anon ───
drop policy if exists "media_insert_anon_site" on public.media;
create policy "media_insert_anon_site" on public.media
  for insert
  to anon
  with check (true);

-- (Optionnel) Si tu préfères supprimer l’ancienne règle "connectés uniquement" :
-- drop policy if exists "media_insert_authenticated" on public.media;

-- ─── Storage bucket `media` : upload depuis le navigateur anonyme ───
drop policy if exists "storage_media_insert_anon_site" on storage.objects;
create policy "storage_media_insert_anon_site" on storage.objects
  for insert
  to anon
  with check (bucket_id = 'media');

-- ⚠️ En prod, tout le monde pourra ajouter du contenu. Plus tard : passe par Auth admin
-- ou une Edge Function avec service_role, et enlève ces politiques anon.
