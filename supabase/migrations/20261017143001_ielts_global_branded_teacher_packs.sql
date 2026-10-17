-- Owner-authorized global instructional catalogue; no student release or scoring changes.
create table private.ielts_teacher_pack_templates (
 lesson_code text primary key check(lesson_code in ('IELTS-03','IELTS-04')),
 title text not null, version text not null,
 branding_version text not null check(branding_version='1.0.0'),
 object_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes integer not null check(size_bytes between 1 and 20000000),
 authorization_basis text not null, released_at timestamptz
);
alter table private.ielts_teacher_pack_templates enable row level security;
revoke all on private.ielts_teacher_pack_templates from public,anon,authenticated;
create or replace function public.can_read_ielts_teacher_pack(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and exists(select 1 from public.users u where u.id=(select auth.uid()) and not coalesce(u.is_banned,true))
 and (
  exists(select 1 from private.ielts_approved_teacher_packs p where p.object_path=p_path
   and p.released_at is not null and coalesce(public.can_manage_ielts_practice_school(p.school_id),false))
  or (
   exists(select 1 from private.ielts_teacher_pack_templates t where t.object_path=p_path and t.released_at is not null)
   and exists(select 1 from public.schools s where coalesce(public.can_manage_ielts_practice_school(s.id),false))
  )
 );
$$;
revoke all on function public.can_read_ielts_teacher_pack(text) from public,anon,authenticated;
grant execute on function public.can_read_ielts_teacher_pack(text) to authenticated;
create function public.rpc_ielts_teacher_pack_catalogue(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_school jsonb;
begin
 if (select auth.uid()) is null
 or coalesce((select u.is_banned from public.users u where u.id=(select auth.uid())),true)
 or not coalesce(public.can_manage_ielts_practice_school(p_school),false) then
  raise exception using errcode='42501',message='not_authorized';
 end if;
 select jsonb_build_object('id',s.id,'name',s.name,'logo_url',s.logo_url) into v_school
 from public.schools s where s.id=p_school;
 if v_school is null then raise exception using errcode='42501',message='not_authorized';end if;
 return jsonb_build_object('school_id',p_school,'school',v_school,'release','teacher_only','packs',coalesce((
  select jsonb_agg(jsonb_build_object('lesson_code',t.lesson_code,'title',t.title,'version',t.version,
   'branding_version',t.branding_version,'object_path',t.object_path,'sha256',t.sha256,'size_bytes',t.size_bytes)
   order by t.lesson_code)
  from private.ielts_teacher_pack_templates t where t.released_at is not null
 ),'[]'::jsonb));
end;
$$;
revoke all on function public.rpc_ielts_teacher_pack_catalogue(uuid) from public,anon,authenticated;
grant execute on function public.rpc_ielts_teacher_pack_catalogue(uuid) to authenticated;
notify pgrst,'reload schema';
