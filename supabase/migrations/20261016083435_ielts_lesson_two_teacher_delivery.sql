-- Silk Road IELTS-02 teacher-only pilot. Lesson 2 source is installed separately into
-- private.ielts_teacher_lesson_two_content to avoid duplicating answer keys in migrations.
-- No grading, student assignment, exposure, historical evidence or score mutation.
create table if not exists private.ielts_teacher_lesson_two_content (
  school_id uuid primary key references public.schools(id) on delete restrict,
  lesson_code text not null check (lesson_code = 'IELTS-02'),
  version text not null check (version = '1.0.0'),
  source_blob_sha1 text not null check (source_blob_sha1 ~ '^[a-f0-9]{40}$'),
  source jsonb not null check (
    source->>'code' = 'IELTS-02' and source->>'version' = '1.0.0'
    and jsonb_typeof(source->'stages') = 'array'
    and jsonb_typeof(source->'reading'->'items') = 'array'
    and jsonb_typeof(source->'followup'->'items') = 'array'
  ),
  authorization_basis text not null,
  authorized_at timestamptz not null default now(),
  released_at timestamptz,
  constraint ielts_lesson_two_source_check check (source_blob_sha1 <> '')
);
revoke all on table private.ielts_teacher_lesson_two_content from public, anon, authenticated;
create or replace function public.rpc_ielts_teacher_lesson_two(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare v_school jsonb; v_lesson record;
begin
  if (select auth.uid()) is null
    or coalesce((select u.is_banned from public.users u where u.id = (select auth.uid())), true)
    or not coalesce(public.can_manage_ielts_practice_school(p_school), false)
  then
    raise exception using errcode='42501', message='not_authorized';
  end if;
  select jsonb_build_object('id',s.id,'name',s.name,'logo_url',s.logo_url)
  into v_school from public.schools s where s.id = p_school;
  if v_school is null then
    raise exception using errcode='42501', message='not_authorized';
  end if;
  select c.* into v_lesson from private.ielts_teacher_lesson_two_content c
  where c.school_id = p_school and c.lesson_code = 'IELTS-02' and c.released_at is not null;
  if not found then
    raise exception using errcode='P0002', message='lesson_not_released';
  end if;
  return jsonb_build_object(
    'school',v_school,'lesson_code',v_lesson.lesson_code,
    'version',v_lesson.version,'source_blob_sha1',v_lesson.source_blob_sha1,
    'release','teacher_only','content',v_lesson.source
  );
end;
$function$;
revoke all on function public.rpc_ielts_teacher_lesson_two(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_teacher_lesson_two(uuid) to authenticated;
notify pgrst, 'reload schema';
