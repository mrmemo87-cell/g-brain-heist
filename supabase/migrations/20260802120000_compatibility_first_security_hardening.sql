-- Compatibility-first security hardening.
--
-- This migration deliberately preserves every authenticated application path.
-- It removes unintended anonymous/direct access, restores tenant checks on
-- school roster RPCs, and makes future public-schema objects fail closed until
-- a migration grants the exact access that the feature needs.

-- ---------------------------------------------------------------------------
-- Future objects: explicit API exposure only (no effect on existing objects).
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cambridge catalogue: keep the existing scoped SECURITY DEFINER RPCs as the
-- sole client access path. Catalogue maintenance remains available to trusted
-- migrations and service/backend operations.
-- ---------------------------------------------------------------------------

alter table public.cambridge_tests enable row level security;
revoke all on table public.cambridge_tests from anon, authenticated;

comment on table public.cambridge_tests is
  'Canonical Cambridge test catalogue. Client access is only through scoped Cambridge RPCs; direct anon/authenticated table access is denied.';

-- ---------------------------------------------------------------------------
-- School roster mutations: preserve existing responses and data updates while
-- requiring an authenticated staff member from the target school.
-- ---------------------------------------------------------------------------

create or replace function public.auto_enroll_students_by_grade(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes%rowtype;
  v_enrolled integer := 0;
begin
  select *
  into v_class
  from public.classes
  where id = p_class_id;

  if v_class is null then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;

  if not public._verify_school_staff(v_class.school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
  end if;

  if v_class.grade_level is null then
    return jsonb_build_object('success', false, 'error', 'Class has no grade level set');
  end if;

  insert into public.class_students (class_id, student_id)
  select p_class_id, u.id
  from public.users u
  where u.school_id = v_class.school_id
    and u.grade = v_class.grade_level::text
    and coalesce(u.role, 'student') = 'student'
    and not coalesce(u.is_banned, false)
    and not exists (
      select 1
      from public.class_students cs
      where cs.student_id = u.id
        and cs.class_id = p_class_id
    );

  get diagnostics v_enrolled = row_count;

  update public.users u
  set batch = v_class.class_code
  where u.id in (
    select cs.student_id
    from public.class_students cs
    where cs.class_id = p_class_id
  )
    and u.school_id = v_class.school_id;

  return jsonb_build_object(
    'success', true,
    'enrolled', v_enrolled,
    'message', format('Auto-enrolled %s students matching grade %s', v_enrolled, v_class.grade_level)
  );
end;
$$;

create or replace function public.add_student_to_class(p_class_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class record;
  v_student record;
  v_exists boolean;
begin
  select c.id, c.school_id, c.class_code, c.grade_level
  into v_class
  from public.classes c
  where c.id = p_class_id;

  if v_class is null then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;

  if not public._verify_school_staff(v_class.school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
  end if;

  select u.id, u.username, u.school_id
  into v_student
  from public.users u
  where u.id = p_student_id
    and coalesce(u.role, 'student') = 'student';

  if v_student is null then
    return jsonb_build_object('success', false, 'error', 'Student not found');
  end if;

  if v_student.school_id is distinct from v_class.school_id then
    return jsonb_build_object('success', false, 'error', 'Student is not in the same school as the class');
  end if;

  select exists (
    select 1
    from public.class_students cs
    where cs.class_id = p_class_id
      and cs.student_id = p_student_id
  ) into v_exists;

  if v_exists then
    return jsonb_build_object('success', false, 'error', 'Student is already enrolled in this class');
  end if;

  insert into public.class_students (class_id, student_id)
  values (p_class_id, p_student_id);

  update public.users
  set batch = v_class.class_code,
      grade = v_class.grade_level::integer
  where id = p_student_id
    and school_id = v_class.school_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Student %s added to class %s', v_student.username, v_class.class_code)
  );
end;
$$;

create or replace function public.remove_student_from_class(p_class_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_school_id uuid;
  v_deleted integer;
begin
  select c.school_id
  into v_class_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_class_school_id is null then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;

  if not public._verify_school_staff(v_class_school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
  end if;

  delete from public.class_students
  where class_id = p_class_id
    and student_id = p_student_id;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return jsonb_build_object('success', false, 'error', 'Student was not enrolled in this class');
  end if;

  update public.users
  set batch = null
  where id = p_student_id
    and school_id = v_class_school_id;

  return jsonb_build_object('success', true, 'message', 'Student removed from class');
end;
$$;

create or replace function public.move_student_between_classes(
  p_student_id uuid,
  p_from_class_id uuid,
  p_to_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to_class record;
  v_from_school_id uuid;
  v_student_name text;
begin
  select c.id, c.class_code, c.school_id, c.grade_level
  into v_to_class
  from public.classes c
  where c.id = p_to_class_id;

  if v_to_class is null then
    return jsonb_build_object('success', false, 'error', 'Destination class not found');
  end if;

  if not public._verify_school_staff(v_to_class.school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
  end if;

  select u.username
  into v_student_name
  from public.users u
  where u.id = p_student_id
    and u.school_id = v_to_class.school_id
    and coalesce(u.role, 'student') = 'student';

  if v_student_name is null then
    return jsonb_build_object('success', false, 'error', 'Student is not in the same school as the destination class');
  end if;

  if p_from_class_id is not null then
    select c.school_id
    into v_from_school_id
    from public.classes c
    where c.id = p_from_class_id;

    if v_from_school_id is distinct from v_to_class.school_id then
      return jsonb_build_object('success', false, 'error', 'Source and destination classes are in different schools');
    end if;

    delete from public.class_students
    where class_id = p_from_class_id
      and student_id = p_student_id;
  end if;

  if exists (
    select 1
    from public.class_students cs
    where cs.class_id = p_to_class_id
      and cs.student_id = p_student_id
  ) then
    update public.users
    set batch = v_to_class.class_code,
        grade = v_to_class.grade_level::integer
    where id = p_student_id
      and school_id = v_to_class.school_id;

    return jsonb_build_object('success', true, 'message', 'Student already in destination class');
  end if;

  insert into public.class_students (class_id, student_id)
  values (p_to_class_id, p_student_id);

  update public.users
  set batch = v_to_class.class_code,
      grade = v_to_class.grade_level::integer
  where id = p_student_id
    and school_id = v_to_class.school_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Student %s moved to class %s', v_student_name, v_to_class.class_code)
  );
end;
$$;

create or replace function public.bulk_add_students_to_class(p_class_id uuid, p_student_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class record;
  v_added integer := 0;
  v_skipped integer := 0;
  v_student_id uuid;
begin
  select c.id, c.class_code, c.school_id, c.grade_level
  into v_class
  from public.classes c
  where c.id = p_class_id;

  if v_class is null then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;

  if not public._verify_school_staff(v_class.school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
  end if;

  foreach v_student_id in array coalesce(p_student_ids, array[]::uuid[])
  loop
    if exists (
      select 1
      from public.class_students cs
      where cs.class_id = p_class_id
        and cs.student_id = v_student_id
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if not exists (
      select 1
      from public.users u
      where u.id = v_student_id
        and u.school_id = v_class.school_id
        and coalesce(u.role, 'student') = 'student'
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.class_students (class_id, student_id)
    values (p_class_id, v_student_id);

    update public.users
    set batch = v_class.class_code,
        grade = v_class.grade_level::integer
    where id = v_student_id
      and school_id = v_class.school_id;

    v_added := v_added + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'added', v_added,
    'skipped', v_skipped,
    'message', format('Added %s students to class %s (skipped %s)', v_added, v_class.class_code, v_skipped)
  );
end;
$$;

create or replace function public.bulk_remove_students_from_class(p_class_id uuid, p_student_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_school_id uuid;
  v_removed_ids uuid[] := array[]::uuid[];
  v_removed integer := 0;
begin
  select c.school_id
  into v_class_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_class_school_id is null then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;

  if not public._verify_school_staff(v_class_school_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
  end if;

  with removed as (
    delete from public.class_students
    where class_id = p_class_id
      and student_id = any(coalesce(p_student_ids, array[]::uuid[]))
    returning student_id
  )
  select coalesce(array_agg(student_id), array[]::uuid[])
  into v_removed_ids
  from removed;

  v_removed := cardinality(v_removed_ids);

  update public.users
  set batch = null
  where id = any(v_removed_ids)
    and school_id = v_class_school_id;

  return jsonb_build_object(
    'success', true,
    'removed', v_removed,
    'message', format('Removed %s students from class', v_removed)
  );
end;
$$;

revoke all on function public.auto_enroll_students_by_grade(uuid) from public, anon;
revoke all on function public.add_student_to_class(uuid, uuid) from public, anon;
revoke all on function public.remove_student_from_class(uuid, uuid) from public, anon;
revoke all on function public.move_student_between_classes(uuid, uuid, uuid) from public, anon;
revoke all on function public.bulk_add_students_to_class(uuid, uuid[]) from public, anon;
revoke all on function public.bulk_remove_students_from_class(uuid, uuid[]) from public, anon;

grant execute on function public.auto_enroll_students_by_grade(uuid) to authenticated;
grant execute on function public.add_student_to_class(uuid, uuid) to authenticated;
grant execute on function public.remove_student_from_class(uuid, uuid) to authenticated;
grant execute on function public.move_student_between_classes(uuid, uuid, uuid) to authenticated;
grant execute on function public.bulk_add_students_to_class(uuid, uuid[]) to authenticated;
grant execute on function public.bulk_remove_students_from_class(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- AP regeneration is a self-service endpoint. Keep the current student flow,
-- but prevent callers from mutating another player's AP by supplying their ID.
-- ---------------------------------------------------------------------------

create or replace function public.regenerate_user_ap(user_id_param uuid)
returns table(new_ap integer, ap_regenerated integer, minutes_elapsed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_user record;
  v_minutes integer;
  v_regen integer;
  v_new_ap integer;
begin
  if v_actor_id is null
     or (v_actor_id <> user_id_param and not public.is_superadmin(v_actor_id)) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select
    u.ap_now,
    u.ap_max,
    coalesce(u.last_ap_update, now()) as last_ap_update
  into v_user
  from public.users u
  where u.id = user_id_param
  for update;

  if not found then
    raise exception 'user_not_found';
  end if;

  v_minutes := greatest(0, extract(epoch from (now() - v_user.last_ap_update))::integer / 60);
  v_regen := v_minutes / 10;

  if v_regen > 0 and v_user.ap_now < v_user.ap_max then
    v_new_ap := least(v_user.ap_now + v_regen, v_user.ap_max);

    update public.users
    set ap_now = v_new_ap,
        last_ap_update = now(),
        updated_at = now()
    where id = user_id_param;

    return query select v_new_ap, v_new_ap - v_user.ap_now, v_minutes;
  else
    return query select v_user.ap_now, 0, v_minutes;
  end if;
end;
$$;

revoke all on function public.regenerate_user_ap(uuid) from public, anon;
grant execute on function public.regenerate_user_ap(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated-only views: remove anonymous access without changing any
-- signed-in application query. Authenticated tenant-scoping replacements are a
-- separate coordinated rollout because several existing screens query these
-- views directly.
-- ---------------------------------------------------------------------------

do $$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'competition_attempts',
    'competition_players',
    'ielts_admin_recent_attempts',
    'legacy_quarantined_assignment_students',
    'student_cambridge_performance',
    'teacher_cambridge_analytics',
    'users_with_current_ap'
  ]
  loop
    if to_regclass(format('public.%I', v_relation)) is not null then
      execute format('revoke all on table public.%I from anon', v_relation);
    end if;
  end loop;
end;
$$;
