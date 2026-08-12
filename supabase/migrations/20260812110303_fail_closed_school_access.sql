-- Fail closed on school membership creation and school-scoped teaching data.
-- Self-registration continues through join_school_by_code(), which is a
-- governed SECURITY DEFINER RPC and does not depend on client table grants.

drop policy if exists "Users can insert their own membership" on public.school_members;

revoke insert, update, delete, truncate, references, trigger
  on table public.school_members
  from anon, authenticated;

create or replace function public.get_teacher_assigned_classes(
  p_teacher_user_id uuid default null
)
returns table (
  class_id uuid,
  class_code text,
  class_name text,
  grade_level text,
  subject text,
  is_active boolean,
  school_id uuid,
  school_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_teacher_user_id uuid := coalesce(p_teacher_user_id, auth.uid());
  v_teacher_school_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select sm.school_id
    into v_teacher_school_id
  from public.school_members sm
  where sm.user_id = v_teacher_user_id
    and sm.status = 'active'
  order by sm.joined_at desc nulls last, sm.id
  limit 1;

  -- A missing active membership authorizes no school data.
  if v_teacher_school_id is null then
    return;
  end if;

  if v_teacher_user_id <> v_actor
    and not public.is_school_admin_of(v_actor, v_teacher_school_id)
  then
    raise exception using errcode = '42501', message = 'Teacher assignment access denied';
  end if;

  return query
  select
    c.id,
    c.class_code::text,
    coalesce(c.class_name, c.class_code)::text,
    c.grade_level::text,
    cta.subject::text,
    cta.active,
    c.school_id,
    coalesce(s.name, 'Unknown School')::text
  from public.class_teacher_assignments cta
  join public.classes c
    on c.id = cta.class_id
   and c.school_id = cta.school_id
  left join public.schools s on s.id = c.school_id
  where cta.teacher_user_id = v_teacher_user_id
    and cta.school_id = v_teacher_school_id
    and cta.active = true
  order by s.name nulls last, c.grade_level nulls last, c.class_code, cta.subject;
end;
$$;

revoke all on function public.get_teacher_assigned_classes(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_teacher_assigned_classes(uuid)
  to authenticated, service_role;

create or replace function public.rpc_get_students_for_assignment(
  p_teacher_id uuid default null
)
returns table (
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
set search_path = ''
as $$
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
    coalesce(nullif(trim(r.full_name), ''), 'Student name unavailable')::text,
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
    coalesce(nullif(trim(r.full_name), ''), 'Student name unavailable');
end;
$$;

revoke all on function public.rpc_get_students_for_assignment(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_get_students_for_assignment(uuid)
  to authenticated, service_role;

comment on function public.rpc_get_students_for_assignment(uuid) is
  'Returns only students in the authenticated teacher assigned classes; no assignment returns zero rows.';

-- These legacy global views are unused by the application and bypass the
-- class-scoped Cambridge reporting RPC. Keep privileged maintenance access.
revoke all on table public.teacher_cambridge_analytics
  from public, anon, authenticated;
revoke all on table public.student_cambridge_performance
  from public, anon, authenticated;

create or replace function public.school_head_update_setup(
  p_school_id uuid,
  p_step text,
  p_completed boolean default true,
  p_requested_modules text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modules text[];
  v_previous_modules text[];
begin
  if auth.uid() is null or not public.is_school_owner(p_school_id) then
    return jsonb_build_object('success', false, 'error', 'School Head access required.');
  end if;

  insert into public.school_head_onboarding (school_id)
  values (p_school_id)
  on conflict (school_id) do nothing;

  if p_step = 'identity' then
    update public.school_head_onboarding set
      identity_confirmed_at = case when p_completed then now() else null end,
      identity_confirmed_by = case when p_completed then auth.uid() else null end,
      updated_at = now()
    where school_id = p_school_id;
  elsif p_step = 'launch' then
    update public.school_head_onboarding set
      launch_test_confirmed_at = case when p_completed then now() else null end,
      launch_test_confirmed_by = case when p_completed then auth.uid() else null end,
      updated_at = now()
    where school_id = p_school_id;
  elsif p_step = 'modules' then
    select requested_modules
      into v_previous_modules
    from public.school_head_onboarding
    where school_id = p_school_id
    for update;

    select array_agg(distinct module_key order by module_key)
      into v_modules
    from unnest(array_append(coalesce(p_requested_modules, '{}'::text[]), 'core')) module_key
    where module_key in ('core', 'cambridge', 'ielts', 'writing', 'admissions');

    update public.school_head_onboarding set
      requested_modules = v_modules,
      modules_confirmed_at = now(),
      modules_confirmed_by = auth.uid(),
      updated_at = now()
    where school_id = p_school_id;

    if v_previous_modules is distinct from v_modules then
      insert into public.school_governance_audit_log (
        school_id,
        actor_user_id,
        event_type,
        category,
        severity,
        summary,
        metadata
      ) values (
        p_school_id,
        auth.uid(),
        'requested_programmes_updated',
        'school',
        'notice',
        'School programme requirements updated',
        jsonb_build_object(
          'previous_modules', to_jsonb(coalesce(v_previous_modules, '{}'::text[])),
          'requested_modules', to_jsonb(coalesce(v_modules, '{}'::text[]))
        )
      );
    end if;
  else
    return jsonb_build_object('success', false, 'error', 'This checklist step is updated automatically.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.school_head_update_setup(uuid, text, boolean, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.school_head_update_setup(uuid, text, boolean, text[])
  to authenticated;

notify pgrst, 'reload schema';
