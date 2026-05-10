-- Exécuter dans Supabase → SQL Editor
-- Table principale (URLs directes + métadonnées). Les fichiers peuvent aussi vivre dans Storage.

create extension if not exists "pgcrypto";

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('IMAGE', 'VIDEO', 'ANIMATION')),
  original_url text not null,
  poster_url text,
  tags text[] not null default '{}',
  category_slugs text[] not null default '{}',
  views_count integer not null default 0,
  likes_count integer not null default 0,
  source text default 'manual',
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists media_created_at_idx on public.media (created_at desc);

alter table public.media enable row level security;

-- Politiques RLS : drop puis create pour pouvoir ré-exécuter le script sans erreur 42710
drop policy if exists "media_select_public" on public.media;
create policy "media_select_public" on public.media for select using (true);

drop policy if exists "media_insert_authenticated" on public.media;
create policy "media_insert_authenticated" on public.media for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "media_insert_anon_site" on public.media;
create policy "media_insert_anon_site" on public.media for insert
  to anon
  with check (true);

-- --- Storage : bucket pour uploads hébergés chez Supabase ---
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "storage_media_read" on storage.objects;
create policy "storage_media_read" on storage.objects for select using (bucket_id = 'media');

drop policy if exists "storage_media_insert_auth" on storage.objects;
create policy "storage_media_insert_auth" on storage.objects for insert
  with check (bucket_id = 'media' and auth.role() = 'authenticated');

drop policy if exists "storage_media_insert_anon_site" on storage.objects;
create policy "storage_media_insert_anon_site" on storage.objects for insert
  to anon
  with check (bucket_id = 'media');

-- Après upload, enregistre dans `media` une ligne avec :
-- original_url = URL publique du fichier (getPublicUrl) ou chemin signé,
-- storage_path = chemin dans le bucket.
