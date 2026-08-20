-- Source-sync for the production migration applied on 2026-08-19.
-- Keep teacher roster access fail-closed while presenting a useful student name,
-- and expose the governed question-content hash helper only to authenticated
-- application roles that need it.

create or replace function public.rpc_get_students_for_assignment(
  p_teacher_id uuid default null::uuid
)
returns table(
  id uuid,
  username text,
  display_name text,
  grade text,
  batch text,
  avatar_url text,
  school_id uuid,
  class_id uuid,
  class_code text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_teacher_user_id uuid;
  v_teacher_school_id uuid;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_teacher_id is not null then
    select t.user_id
      into v_teacher_user_id
    from public.teachers t
    where t.id = p_teacher_id;

    if v_teacher_user_id is null then
      raise exception using errcode = 'P0002', message = 'Teacher not found';
    end if;
  else
    v_teacher_user_id := v_actor_user_id;
  end if;

  if not exists (
    select 1
    from public.teachers t
    where t.user_id = v_teacher_user_id
  ) then
    raise exception using errcode = '42501', message = 'Teacher profile required';
  end if;

  select sm.school_id
    into v_teacher_school_id
  from public.school_members sm
  where sm.user_id = v_teacher_user_id
    and sm.status = 'active'
  order by sm.joined_at desc nulls last, sm.id
  limit 1;

  -- A teacher profile without active school membership authorizes no roster.
  if v_teacher_school_id is null then
    return;
  end if;

  if v_actor_user_id <> v_teacher_user_id
    and not public.is_school_admin_of(v_actor_user_id, v_teacher_school_id)
  then
    raise exception using errcode = '42501', message = 'Teacher roster access denied';
  end if;

  -- No assignment deliberately returns zero rows. Never widen to the school.
  if not exists (
    select 1
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id = cta.class_id
     and c.school_id = cta.school_id
    where cta.teacher_user_id = v_teacher_user_id
      and cta.school_id = v_teacher_school_id
      and cta.active = true
  ) then
    return;
  end if;

  return query
  with assigned_classes as (
    select distinct
      c.id as class_id,
      c.class_code,
      c.grade_level,
      c.school_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id = cta.class_id
     and c.school_id = cta.school_id
    where cta.teacher_user_id = v_teacher_user_id
      and cta.school_id = v_teacher_school_id
      and cta.active = true
  ), canonical_roster as (
    select distinct on (u.id)
      u.id,
      u.username,
      u.full_name,
      coalesce(nullif(trim(u.grade), ''), ac.grade_level) as grade,
      u.batch,
      u.avatar_url,
      u.school_id,
      ac.class_id,
      ac.class_code
    from assigned_classes ac
    join public.class_students cs on cs.class_id = ac.class_id
    join public.users u
      on u.id = cs.student_id
     and u.school_id = ac.school_id
     and coalesce(u.role, 'student') = 'student'
    where not coalesce(u.is_banned, false)
    order by u.id, cs.joined_at desc nulls last, ac.class_code
  ), legacy_roster as (
    -- Older accounts may predate class_students. Only accept an exact batch
    -- to class-code match, and never infer membership from grade alone.
    select distinct on (u.id)
      u.id,
      u.username,
      u.full_name,
      coalesce(nullif(trim(u.grade), ''), ac.grade_level) as grade,
      u.batch,
      u.avatar_url,
      u.school_id,
      ac.class_id,
      ac.class_code
    from assigned_classes ac
    join public.users u
      on u.school_id = ac.school_id
     and upper(regexp_replace(trim(coalesce(u.batch, '')), '\s+', '', 'g'))
         = upper(regexp_replace(trim(coalesce(ac.class_code, '')), '\s+', '', 'g'))
     and coalesce(u.role, 'student') = 'student'
    where not coalesce(u.is_banned, false)
      and not exists (
        select 1
        from public.class_students existing
        where existing.student_id = u.id
      )
    order by u.id, ac.class_code
  ), roster as (
    select * from canonical_roster
    union all
    select * from legacy_roster
  )
  select
    r.id,
    r.username::text,
    coalesce(nullif(trim(r.full_name), ''), nullif(trim(r.username), ''), 'Student')::text,
    coalesce(r.grade, '')::text,
    coalesce(nullif(trim(r.class_code), ''), nullif(trim(r.batch), ''), '')::text,
    r.avatar_url::text,
    r.school_id,
    r.class_id,
    coalesce(r.class_code, '')::text
  from roster r
  order by
    r.grade nulls last,
    coalesce(nullif(trim(r.class_code), ''), nullif(trim(r.batch), ''), '') nulls last,
    coalesce(nullif(trim(r.full_name), ''), nullif(trim(r.username), ''), 'Student');
end;
$function$;

revoke all on function public.rpc_get_students_for_assignment(uuid) from public;
revoke all on function public.rpc_get_students_for_assignment(uuid) from anon;
grant execute on function public.rpc_get_students_for_assignment(uuid) to authenticated, service_role;

-- The hash helper lives in the private schema and is used by governed question
-- import/authority paths. Authenticated application calls need schema USAGE and
-- function EXECUTE, but the helper remains unavailable to anonymous callers.
grant usage on schema private to authenticated, service_role;
revoke all on function private.question_content_hash(uuid, text, jsonb, text, text, text, text) from public;
revoke all on function private.question_content_hash(uuid, text, jsonb, text, text, text, text) from anon;
grant execute on function private.question_content_hash(uuid, text, jsonb, text, text, text, text) to authenticated, service_role;
