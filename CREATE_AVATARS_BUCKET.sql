-- ============================================================================
-- STORAGE SETUP: AVATAR BUCKET
-- ============================================================================
-- Run this script in the Supabase SQL editor (or via the CLI) to ensure the
-- avatar storage bucket exists and has the correct row level security policies.
-- This unblocks the in-app avatar uploader (
-- see services/gameService.ts::upload_avatar_file ).
-- ============================================================================

-- Create the bucket if it does not already exist
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 2097152)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- Ensure RLS is enabled on the storage objects table (should be by default)
alter table storage.objects enable row level security;

drop policy if exists "Avatars public read" on storage.objects;
drop policy if exists "Users can upload avatars" on storage.objects;
drop policy if exists "Users manage their avatars" on storage.objects;
drop policy if exists "Users delete their avatars" on storage.objects;
-- Allow everyone (including anonymous) to read public avatar files
create policy "Avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Allow authenticated users to upload new avatar files into the bucket
create policy "Users can upload avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
  );

-- Allow authenticated users to update/delete only the objects they own
create policy "Users manage their avatars"
  on storage.objects for update using (
    bucket_id = 'avatars'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'avatars'
    and owner = auth.uid()
  );

create policy "Users delete their avatars"
  on storage.objects for delete using (
    bucket_id = 'avatars'
    and owner = auth.uid()
  );
