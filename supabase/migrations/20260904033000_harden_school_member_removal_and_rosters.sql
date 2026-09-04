-- Removed school members must immediately leave every live school roster surface
-- while historical academic/audit records remain intact.

-- Clean legacy school labels for users that were already removed from a school
-- but still have stale live class placement rows from the old removal flow.
update public.users u
set school = null
where u.school_id is null
  and u.school is not null
  and exists (
    select 1
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    where cs.student_id = u.id
      and not exists (
        select 1
        from public.school_members sm
        where sm.school_id = c.school_id
          and sm.user_id = u.id
      )
  );

-- Remove invalid live class placements. Suspended students keep their placement
-- so it can reappear if they are reactivated; only users no longer belonging to
-- the school (or no longer students there) are detached.
delete from public.class_students cs
using public.classes c, public.users u
where cs.class_id = c.id
  and cs.student_id = u.id
  and (
    u.school_id is distinct from c.school_id
    or not exists (
      select 1
      from public.school_members sm
      where sm.school_id = c.school_id
        and sm.user_id = u.id
    )
    or exists (
      select 1
      from public.school_members sm
      where sm.school_id = c.school_id
        and sm.user_id = u.id
        and sm.role_in_school is distinct from 'student'
    )
  );

create or replace function public.get_class_roster(p_class_id uuid)
returns table(
  student_id uuid,
  username text,
  email text,
  avatar_url text,
  grade text,
  batch text,
  level integer,
  xp integer,
  last_seen timestamptz,
  is_banned boolean,
  enrolled_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_school_id uuid;
begin
  select c.school_id into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_school_id is null then
    raise exception 'Class not found';
  end if;

  if not public.can_administer_school(v_school_id) then
    raise exception 'Access denied';
  end if;

  return query
  select
    u.id as student_id,
    u.username::text,
    u.email::text,
    u.avatar_url::text,
    coalesce(u.grade, '')::text as grade,
    coalesce(u.batch, '')::text as batch,
    coalesce(u.level, 1)::int as level,
    coalesce(u.xp, 0)::int as xp,
    u.last_seen,
    coalesce(u.is_banned, false) as is_banned,
    cs.joined_at as enrolled_at
  from public.class_students cs
  join public.classes c
    on c.id = cs.class_id
  join public.users u
    on u.id = cs.student_id
   and u.school_id = c.school_id
  join public.school_members sm
    on sm.school_id = c.school_id
   and sm.user_id = u.id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where cs.class_id = p_class_id
    and coalesce(u.role, 'student') = 'student'
  order by u.username;
end;
$function$;

create or replace function public.get_school_class_rosters(p_school_id uuid)
returns table(
  class_id uuid,
  class_code text,
  class_name text,
  grade_level text,
  is_active boolean,
  student_count bigint,
  teacher_count bigint
)
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if not public.can_administer_school(p_school_id) then
    raise exception 'Access denied';
  end if;

  return query
  select
    c.id as class_id,
    c.class_code::text,
    coalesce(c.class_name, c.class_code)::text as class_name,
    c.grade_level::text,
    c.is_active,
    (
      select count(*)::bigint
      from public.class_students cs
      join public.users u
        on u.id = cs.student_id
       and u.school_id = c.school_id
      join public.school_members sm
        on sm.school_id = c.school_id
       and sm.user_id = u.id
       and sm.status = 'active'
       and sm.role_in_school = 'student'
      where cs.class_id = c.id
        and coalesce(u.role, 'student') = 'student'
    ) as student_count,
    (
      select count(*)::bigint
      from public.class_teacher_assignments cta
      where cta.class_id = c.id
        and cta.active = true
    ) as teacher_count
  from public.classes c
  where c.school_id = p_school_id
  order by c.grade_level nulls last, c.class_code;
end;
$function$;

create or replace function public.get_unassigned_students(p_school_id uuid)
returns table(
  student_id uuid,
  username text,
  email text,
  avatar_url text,
  grade text,
  batch text,
  level integer,
  xp integer
)
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if not public.can_administer_school(p_school_id) then
    raise exception 'Access denied';
  end if;

  return query
  select
    u.id as student_id,
    u.username::text,
    u.email::text,
    u.avatar_url::text,
    coalesce(u.grade, '')::text as grade,
    coalesce(u.batch, '')::text as batch,
    coalesce(u.level, 1)::int as level,
    coalesce(u.xp, 0)::int as xp
  from public.users u
  join public.school_members sm
    on sm.school_id = p_school_id
   and sm.user_id = u.id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where u.school_id = p_school_id
    and coalesce(u.role, 'student') = 'student'
    and not coalesce(u.is_banned, false)
    and not exists (
      select 1
      from public.class_students cs
      join public.classes c on c.id = cs.class_id
      where cs.student_id = u.id
        and c.school_id = p_school_id
    )
  order by u.grade nulls last, u.username;
end;
$function$;

create or replace function public.get_class_statistics(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_result jsonb;
  v_class record;
begin
  select * into v_class
  from public.classes
  where id = p_class_id;

  if v_class is null then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;

  if not public.can_administer_school(v_class.school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  with active_students as (
    select u.*
    from public.class_students cs
    join public.users u
      on u.id = cs.student_id
     and u.school_id = v_class.school_id
    join public.school_members sm
      on sm.school_id = v_class.school_id
     and sm.user_id = u.id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where cs.class_id = p_class_id
      and coalesce(u.role, 'student') = 'student'
  )
  select jsonb_build_object(
    'success', true,
    'class_id', p_class_id,
    'class_code', v_class.class_code,
    'class_name', coalesce(v_class.class_name, v_class.class_code),
    'grade_level', v_class.grade_level,
    'student_count', (select count(*) from active_students),
    'teacher_count', (
      select count(*)
      from public.class_teacher_assignments
      where class_id = p_class_id and active = true
    ),
    'avg_level', (select coalesce(round(avg(level)::numeric, 1), 0) from active_students),
    'avg_xp', (select coalesce(round(avg(xp)::numeric, 0), 0) from active_students),
    'total_xp', (select coalesce(sum(xp), 0) from active_students),
    'teachers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', cta.teacher_user_id,
        'username', u.username,
        'subject', cta.subject
      )), '[]'::jsonb)
      from public.class_teacher_assignments cta
      join public.users u on u.id = cta.teacher_user_id
      where cta.class_id = p_class_id and cta.active = true
    )
  ) into v_result;

  return v_result;
end;
$function$;

-- Strong removal path: detach from every live school surface and clear both the
-- canonical school_id and the legacy school label so the account immediately
-- behaves as an Individuals-mode account (school_id IS NULL).
create or replace function public.remove_school_member_legacy_assignment_vocabulary(
  p_member_user_id uuid,
  p_school_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := coalesce(p_school_id, public.my_school_id());
  v_target public.school_members%rowtype;
begin
  if not public.can_administer_school(v_school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  select * into v_target
  from public.school_members
  where school_id = v_school_id
    and user_id = p_member_user_id
  for update;

  if v_target.id is null then
    return jsonb_build_object('success', false, 'error', 'Member not found');
  end if;

  if v_target.is_owner then
    return jsonb_build_object('success', false, 'error', 'The school owner cannot be removed. Transfer ownership first.');
  end if;

  if v_target.role_in_school = 'school_admin' then
    return jsonb_build_object('success', false, 'error', 'Demote this delegated administrator before removing them.');
  end if;

  if exists (
    select 1
    from public.class_teacher_assignments
    where school_id = v_school_id
      and teacher_user_id = p_member_user_id
      and coalesce(active, true)
  ) then
    return jsonb_build_object('success', false, 'error', 'Reassign or remove this person''s active teaching assignments first.');
  end if;

  -- Always remove any live class placement belonging to this school, even if a
  -- legacy role mismatch previously left a stale row behind.
  delete from public.class_students cs
  using public.classes c
  where cs.class_id = c.id
    and c.school_id = v_school_id
    and cs.student_id = p_member_user_id;

  -- End any live operational teaching-group placement without erasing history.
  update public.school_ops_group_students gs
  set valid_to = greatest(gs.valid_from, current_date - 1)
  from public.school_ops_teaching_groups g
  where g.id = gs.group_id
    and g.school_id = v_school_id
    and gs.student_id = p_member_user_id
    and gs.valid_to is null;

  delete from public.school_members
  where id = v_target.id;

  update public.users
  set school_id = null,
      school = null,
      batch = case when v_target.role_in_school = 'student' then null else batch end
  where id = p_member_user_id
    and school_id = v_school_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Member removed from school and moved to Individuals mode'
  );
end;
$function$;

revoke all on function public.get_class_roster(uuid) from public, anon;
revoke all on function public.get_school_class_rosters(uuid) from public, anon;
revoke all on function public.get_unassigned_students(uuid) from public, anon;
revoke all on function public.get_class_statistics(uuid) from public, anon;
grant execute on function public.get_class_roster(uuid) to authenticated, service_role;
grant execute on function public.get_school_class_rosters(uuid) to authenticated, service_role;
grant execute on function public.get_unassigned_students(uuid) to authenticated, service_role;
grant execute on function public.get_class_statistics(uuid) to authenticated, service_role;
