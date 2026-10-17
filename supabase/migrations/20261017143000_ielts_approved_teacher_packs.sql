-- Private, school-scoped instructional downloads; no student evidence or scoring writes.
create table private.ielts_approved_teacher_packs (
 school_id uuid not null references public.schools(id) on delete restrict,
 lesson_code text not null check (lesson_code in ('IELTS-03','IELTS-04')),
 title text not null,
 version text not null,
 object_path text not null unique,
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes integer not null check (size_bytes between 1 and 20000000),
 authorization_basis text not null,
 released_at timestamptz,
 primary key (school_id,lesson_code,version)
);
revoke all on private.ielts_approved_teacher_packs from public,anon,authenticated;
alter table private.ielts_approved_teacher_packs enable row level security;
create function public.can_read_ielts_teacher_pack(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and exists(select 1 from public.users u where u.id=(select auth.uid()) and not coalesce(u.is_banned,true))
 and exists(select 1 from private.ielts_approved_teacher_packs p where p.object_path=p_path
   and p.released_at is not null and coalesce(public.can_manage_ielts_practice_school(p.school_id),false));
$$;
revoke all on function public.can_read_ielts_teacher_pack(text) from public,anon,authenticated;
grant execute on function public.can_read_ielts_teacher_pack(text) to authenticated;
create function public.rpc_ielts_approved_teacher_packs(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null
 or coalesce((select u.is_banned from public.users u where u.id=(select auth.uid())),true)
 or not coalesce(public.can_manage_ielts_practice_school(p_school),false) then
  raise exception using errcode='42501',message='not_authorized';
 end if;
 return jsonb_build_object('school_id',p_school,'release','teacher_only','packs',coalesce((
 select jsonb_agg(jsonb_build_object('lesson_code',p.lesson_code,'title',p.title,'version',p.version,
 'object_path',p.object_path,'sha256',p.sha256,'size_bytes',p.size_bytes) order by p.lesson_code,p.version)
 from private.ielts_approved_teacher_packs p where p.school_id=p_school and p.released_at is not null
 ),'[]'::jsonb));
end;
$$;
revoke all on function public.rpc_ielts_approved_teacher_packs(uuid) from public,anon,authenticated;
grant execute on function public.rpc_ielts_approved_teacher_packs(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ielts-teacher-course-packs','ielts-teacher-course-packs',false,20000000,array['application/zip']);
create policy ielts_approved_teacher_pack_read on storage.objects for select to authenticated
using (bucket_id='ielts-teacher-course-packs' and public.can_read_ielts_teacher_pack(name));
-- Restrictive boundaries prevent unrelated permissive policies from admitting pack access.
create policy ielts_teacher_pack_read_boundary on storage.objects as restrictive for select to authenticated
using (bucket_id<>'ielts-teacher-course-packs' or public.can_read_ielts_teacher_pack(name));
create policy ielts_teacher_pack_anon_boundary on storage.objects as restrictive for all to anon
using (bucket_id<>'ielts-teacher-course-packs') with check (bucket_id<>'ielts-teacher-course-packs');
create policy ielts_teacher_pack_no_insert on storage.objects as restrictive for insert to authenticated
with check (bucket_id<>'ielts-teacher-course-packs');
create policy ielts_teacher_pack_no_update on storage.objects as restrictive for update to authenticated
using (bucket_id<>'ielts-teacher-course-packs') with check (bucket_id<>'ielts-teacher-course-packs');
create policy ielts_teacher_pack_no_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id<>'ielts-teacher-course-packs');
notify pgrst,'reload schema';
