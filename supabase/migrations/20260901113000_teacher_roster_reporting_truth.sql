-- Teacher roster/reporting truth model.
--
-- A teacher needs three different views of student identity:
--   1) enrolled roster: everyone currently enrolled in allocated classes,
--   2) assignment eligibility: only students who may receive new work now,
--   3) historical reporting: everyone who actually submitted the work, even if
--      they were later suspended, banned, moved, or removed from the current roster.
--
-- Keep those concepts separate so moderation never erases school records.

create or replace function private.teacher_assignment_authorized_students(
  p_teacher_user_id uuid,
  p_school_id uuid,
  p_subject text,
  p_class_id uuid default null,
  p_student_ids uuid[] default null
)
returns table(student_id uuid, class_code text)
language sql
stable
security definer
set search_path = ''
as $$
  with allocated_classes as (
    select distinct c.id, c.class_code, c.school_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id = cta.class_id
     and c.school_id = cta.school_id
    where cta.teacher_user_id = p_teacher_user_id
      and cta.school_id = p_school_id
      and cta.active = true
      and coalesce(c.is_active, true)
      and private.teacher_assignment_subject_key(cta.subject)
          = private.teacher_assignment_subject_key(p_subject)
      and (p_class_id is null or c.id = p_class_id)
  ), canonical_roster as (
    select u.id as student_id, ac.class_code
    from allocated_classes ac
    join public.class_students cs on cs.class_id = ac.id
    join public.users u
      on u.id = cs.student_id
     and u.school_id = ac.school_id
     and coalesce(u.role, 'student') = 'student'
    where not coalesce(u.is_banned, false)
      and not (u.banned_until is not null and u.banned_until > now())
  ), legacy_roster as (
    select u.id as student_id, ac.class_code
    from allocated_classes ac
    join public.users u
      on u.school_id = ac.school_id
     and upper(regexp_replace(trim(coalesce(u.batch, '')), '\s+', '', 'g'))
         = upper(regexp_replace(trim(ac.class_code), '\s+', '', 'g'))
     and coalesce(u.role, 'student') = 'student'
    where not coalesce(u.is_banned, false)
      and not (u.banned_until is not null and u.banned_until > now())
      and not exists (
        select 1
        from public.class_students existing
        where existing.student_id = u.id
      )
  ), roster as (
    select * from canonical_roster
    union all
    select * from legacy_roster
  )
  select distinct on (r.student_id)
    r.student_id,
    r.class_code::text
  from roster r
  where p_student_ids is null or r.student_id = any(p_student_ids)
  order by r.student_id, r.class_code;
$$;

revoke all on function private.teacher_assignment_authorized_students(uuid, uuid, text, uuid, uuid[])
  from public, anon, authenticated, service_role;

-- Legacy RPC name retained for client compatibility. It now returns the full
-- enrolled roster for the teacher's allocated classes and explicitly marks
-- whether each student can receive new assignments. This lets My Classes and
-- Reports remain truthful without weakening assignment-write authorization.
drop function if exists public.rpc_get_students_for_assignment(uuid);
create function public.rpc_get_students_for_assignment(p_teacher_id uuid default null)
returns table(
  id uuid,
  username text,
  display_name text,
  grade text,
  batch text,
  avatar_url text,
  school_id uuid,
  class_id uuid,
  class_code text,
  assignment_eligible boolean,
  access_status text,
  banned_until timestamptz
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

  if v_teacher_school_id is null then
    return;
  end if;

  if v_actor_user_id <> v_teacher_user_id
    and not public.is_school_admin_of(v_actor_user_id, v_teacher_school_id)
  then
    raise exception using errcode = '42501', message = 'Teacher roster access denied';
  end if;

  if not exists (
    select 1
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id = cta.class_id
     and c.school_id = cta.school_id
    where cta.teacher_user_id = v_teacher_user_id
      and cta.school_id = v_teacher_school_id
      and cta.active = true
      and coalesce(c.is_active, true)
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
      and coalesce(c.is_active, true)
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
      ac.class_code,
      coalesce(u.is_banned, false) as is_banned,
      u.banned_until
    from assigned_classes ac
    join public.class_students cs on cs.class_id = ac.class_id
    join public.users u
      on u.id = cs.student_id
     and u.school_id = ac.school_id
     and coalesce(u.role, 'student') = 'student'
    order by u.id, cs.joined_at desc nulls last, ac.class_code
  ), legacy_roster as (
    select distinct on (u.id)
      u.id,
      u.username,
      u.full_name,
      coalesce(nullif(trim(u.grade), ''), ac.grade_level) as grade,
      u.batch,
      u.avatar_url,
      u.school_id,
      ac.class_id,
      ac.class_code,
      coalesce(u.is_banned, false) as is_banned,
      u.banned_until
    from assigned_classes ac
    join public.users u
      on u.school_id = ac.school_id
     and upper(regexp_replace(trim(coalesce(u.batch, '')), '\s+', '', 'g'))
         = upper(regexp_replace(trim(coalesce(ac.class_code, '')), '\s+', '', 'g'))
     and coalesce(u.role, 'student') = 'student'
    where not exists (
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
    coalesce(r.class_code, '')::text,
    (
      not r.is_banned
      and not (r.banned_until is not null and r.banned_until > now())
    ) as assignment_eligible,
    case
      when r.is_banned then 'banned'
      when r.banned_until is not null and r.banned_until > now() then 'suspended'
      else 'active'
    end::text as access_status,
    r.banned_until
  from roster r
  order by
    r.grade nulls last,
    coalesce(nullif(trim(r.class_code), ''), nullif(trim(r.batch), ''), '') nulls last,
    coalesce(nullif(trim(r.full_name), ''), nullif(trim(r.username), ''), 'Student');
end;
$$;

revoke all on function public.rpc_get_students_for_assignment(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_get_students_for_assignment(uuid) to authenticated;

-- Historical reports are evidence records. Never derive visibility or identity
-- from the student's current assignment eligibility.
drop function if exists public.rpc_teacher_assignment_report(uuid, uuid);
create function public.rpc_teacher_assignment_report(p_assignment_id uuid, p_teacher_id uuid)
returns table(
  student_id uuid,
  student_name text,
  batch text,
  historical_batch text,
  current_batch text,
  current_class_id uuid,
  current_placement_ambiguous boolean,
  score integer,
  correct integer,
  incorrect integer,
  accuracy integer,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_teacher_user uuid;
begin
  select t.user_id
    into v_teacher_user
  from public.teachers t
  where t.id = p_teacher_id;

  if v_actor is null or v_teacher_user is distinct from v_actor then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  if not exists (
    select 1
    from public.assignments a
    where a.id = p_assignment_id
      and a.teacher_id = p_teacher_id
  ) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  return query
  select
    r.student_id,
    coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Student')::text,
    coalesce(sa.batch, a.class_code_snapshot, a.batch)::text as batch,
    coalesce(sa.batch, a.class_code_snapshot, a.batch)::text as historical_batch,
    case when cp.placement_count = 1 then cp.class_code end::text as current_batch,
    case when cp.placement_count = 1 then cp.class_id end as current_class_id,
    coalesce(cp.placement_count, 0) > 1 as current_placement_ambiguous,
    r.score,
    r.correct,
    r.incorrect,
    r.accuracy,
    r.completed_at
  from public.student_assignment_results r
  join public.assignments a on a.id = r.assignment_id
  join public.users u on u.id = r.student_id
  left join public.student_assignments sa
    on sa.assignment_id = r.assignment_id
   and sa.student_id = r.student_id
  left join lateral (
    select
      count(*)::integer as placement_count,
      (array_agg(c.id order by c.id))[1] as class_id,
      (array_agg(c.class_code order by c.id))[1] as class_code
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    where cs.student_id = r.student_id
      and c.school_id = a.school_id
  ) cp on true
  where r.assignment_id = p_assignment_id
    and not exists (
      select 1
      from public.legacy_quarantined_assignment_students q
      where q.assignment_id = r.assignment_id
        and q.student_id = r.student_id
    )
  order by r.completed_at desc;
end;
$$;

revoke all on function public.rpc_teacher_assignment_report(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_teacher_assignment_report(uuid, uuid) to authenticated;

comment on function public.rpc_get_students_for_assignment(uuid) is
  'Teacher allocated-class roster with assignment eligibility metadata; moderation does not erase roster visibility.';
comment on function public.rpc_teacher_assignment_report(uuid, uuid) is
  'Historical assignment results with official student identity and assignment-time class provenance.';

notify pgrst, 'reload schema';
