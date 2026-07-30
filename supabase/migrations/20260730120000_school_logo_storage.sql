-- Public school branding assets, writable only by administrators of that school.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-logos',
  'school-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public school logos are readable"
on storage.objects for select
using (bucket_id = 'school-logos');

create policy "School administrators upload their logo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'school-logos'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role = 'school_admin'
      and u.school_id::text = (storage.foldername(name))[1]
  )
);

create policy "School administrators update their logo"
on storage.objects for update to authenticated
using (
  bucket_id = 'school-logos'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role = 'school_admin'
      and u.school_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'school-logos'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role = 'school_admin'
      and u.school_id::text = (storage.foldername(name))[1]
  )
);
