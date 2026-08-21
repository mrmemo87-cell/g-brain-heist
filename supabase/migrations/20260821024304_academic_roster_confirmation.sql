-- Guarded school-admin confirmation for estimated current-year academic enrolments.
--
-- This is intentionally separate from class placement writes. It never rewrites
-- historical assignments/results and refuses to confirm a roster while current
-- student placement is incomplete or internally contradictory.

create or replace function public.rpc_school_admin_academic_roster_readiness(
  p_school_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_year public.school_academic_years%rowtype;
  v_active_student_members integer := 0;
  v_placed_students integer := 0;
  v_estimated_enrolments integer := 0;
  v_confirmed_enrolments integer := 0;
  v_unplaced_student_ids uuid[] := array[]::uuid[];
  v_role_mismatch_student_ids uuid[] := array[]::uuid[];
  v_multiple_enrolment_student_ids uuid[] := array[]::uuid[];
  v_confirmed_mismatch_student_ids uuid[] := array[]::uuid[];
  v_ready boolean := false;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  select * into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id
    and y.school_id = p_school_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_found');
  end if;

  select count(*)::integer
  into v_active_student_members
  from public.school_members sm
  join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.role_in_school = 'student';

  select count(*)::integer
  into v_placed_students
  from public.school_members sm
  join public.users u on u.id = sm.user_id
  join public.class_students cs on cs.student_id = sm.user_id
  join public.classes c
    on c.id = cs.class_id
   and c.school_id = p_school_id
   and coalesce(c.is_active, true)
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.role_in_school = 'student';

  select coalesce(array_agg(sm.user_id order by sm.user_id), array[]::uuid[])
  into v_unplaced_student_ids
  from public.school_members sm
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.role_in_school = 'student'
    and not exists (
      select 1
      from public.class_students cs
      join public.classes c
        on c.id = cs.class_id
       and c.school_id = p_school_id
       and coalesce(c.is_active, true)
      where cs.student_id = sm.user_id
    );

  select coalesce(array_agg(sm.user_id order by sm.user_id), array[]::uuid[])
  into v_role_mismatch_student_ids
  from public.school_members sm
  join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.role_in_school = 'student'
    and coalesce(u.role, 'student') <> 'student';

  select coalesce(array_agg(grouped.student_id order by grouped.student_id), array[]::uuid[])
  into v_multiple_enrolment_student_ids
  from (
    select e.student_id
    from public.student_academic_enrolments e
    join public.school_members sm
      on sm.school_id = p_school_id
     and sm.user_id = e.student_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where e.school_id = p_school_id
      and e.academic_year_id = p_academic_year_id
    group by e.student_id
    having count(*) > 1
  ) grouped;

  select coalesce(array_agg(e.student_id order by e.student_id), array[]::uuid[])
  into v_confirmed_mismatch_student_ids
  from public.student_academic_enrolments e
  join public.school_members sm
    on sm.school_id = p_school_id
   and sm.user_id = e.student_id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  join public.class_students cs on cs.student_id = e.student_id
  join public.classes c
    on c.id = cs.class_id
   and c.school_id = p_school_id
   and coalesce(c.is_active, true)
  where e.school_id = p_school_id
    and e.academic_year_id = p_academic_year_id
    and e.context_quality = 'confirmed'
    and (
      e.class_id is distinct from c.id
      or nullif(trim(e.grade_level), '') is distinct from nullif(trim(c.grade_level), '')
      or nullif(trim(e.class_code), '') is distinct from nullif(trim(c.class_code), '')
    );

  select count(*) filter (where e.context_quality = 'estimated')::integer,
         count(*) filter (where e.context_quality = 'confirmed')::integer
  into v_estimated_enrolments, v_confirmed_enrolments
  from public.student_academic_enrolments e
  join public.school_members sm
    on sm.school_id = p_school_id
   and sm.user_id = e.student_id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where e.school_id = p_school_id
    and e.academic_year_id = p_academic_year_id;

  v_ready := v_active_student_members > 0
    and cardinality(v_unplaced_student_ids) = 0
    and cardinality(v_role_mismatch_student_ids) = 0
    and cardinality(v_multiple_enrolment_student_ids) = 0
    and cardinality(v_confirmed_mismatch_student_ids) = 0;

  return jsonb_build_object(
    'success', true,
    'ready', v_ready,
    'academicYearId', v_year.id,
    'academicYearName', v_year.name,
    'academicYearStatus', v_year.status,
    'activeStudentMembers', v_active_student_members,
    'placedStudents', v_placed_students,
    'estimatedEnrolments', v_estimated_enrolments,
    'confirmedEnrolments', v_confirmed_enrolments,
    'unplacedStudentIds', to_jsonb(v_unplaced_student_ids),
    'roleMismatchStudentIds', to_jsonb(v_role_mismatch_student_ids),
    'multipleEnrolmentStudentIds', to_jsonb(v_multiple_enrolment_student_ids),
    'confirmedPlacementMismatchStudentIds', to_jsonb(v_confirmed_mismatch_student_ids)
  );
end;
$$;

revoke all on function public.rpc_school_admin_academic_roster_readiness(uuid, uuid) from public;
revoke all on function public.rpc_school_admin_academic_roster_readiness(uuid, uuid) from anon;
revoke all on function public.rpc_school_admin_academic_roster_readiness(uuid, uuid) from authenticated;
grant execute on function public.rpc_school_admin_academic_roster_readiness(uuid, uuid) to authenticated, service_role;

create or replace function public.rpc_school_admin_confirm_academic_roster(
  p_school_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_year public.school_academic_years%rowtype;
  v_readiness jsonb;
  v_updated_estimated integer := 0;
  v_inserted_missing integer := 0;
  v_confirmed_total integer := 0;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  select * into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id
    and y.school_id = p_school_id
    and y.status in ('planned', 'current')
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_confirmable');
  end if;

  v_readiness := public.rpc_school_admin_academic_roster_readiness(p_school_id, p_academic_year_id);
  if not coalesce((v_readiness ->> 'success')::boolean, false) then
    return v_readiness;
  end if;
  if not coalesce((v_readiness ->> 'ready')::boolean, false) then
    return v_readiness || jsonb_build_object('success', false, 'code', 'academic_roster_not_ready');
  end if;

  with placements as (
    select sm.user_id as student_id, c.id as class_id, c.grade_level, c.class_code
    from public.school_members sm
    join public.class_students cs on cs.student_id = sm.user_id
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = p_school_id
     and coalesce(c.is_active, true)
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  )
  update public.student_academic_enrolments e
  set class_id = p.class_id,
      grade_level = p.grade_level,
      class_code = p.class_code,
      starts_on = v_year.starts_on,
      ends_on = v_year.ends_on,
      context_quality = 'confirmed',
      source = 'school_admin',
      created_by = coalesce(e.created_by, v_actor),
      updated_at = now()
  from placements p
  where e.school_id = p_school_id
    and e.academic_year_id = p_academic_year_id
    and e.student_id = p.student_id
    and e.context_quality = 'estimated';

  get diagnostics v_updated_estimated = row_count;

  with placements as (
    select sm.user_id as student_id, c.id as class_id, c.grade_level, c.class_code
    from public.school_members sm
    join public.class_students cs on cs.student_id = sm.user_id
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = p_school_id
     and coalesce(c.is_active, true)
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  )
  insert into public.student_academic_enrolments(
    school_id, student_id, academic_year_id, class_id, grade_level, class_code,
    starts_on, ends_on, context_quality, source, created_by
  )
  select
    p_school_id, p.student_id, p_academic_year_id, p.class_id, p.grade_level, p.class_code,
    v_year.starts_on, v_year.ends_on, 'confirmed', 'school_admin', v_actor
  from placements p
  where not exists (
    select 1
    from public.student_academic_enrolments e
    where e.school_id = p_school_id
      and e.academic_year_id = p_academic_year_id
      and e.student_id = p.student_id
  );

  get diagnostics v_inserted_missing = row_count;

  select count(*)::integer
  into v_confirmed_total
  from public.student_academic_enrolments e
  join public.school_members sm
    on sm.school_id = p_school_id
   and sm.user_id = e.student_id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where e.school_id = p_school_id
    and e.academic_year_id = p_academic_year_id
    and e.context_quality = 'confirmed';

  perform private.academic_refresh_school_context(p_school_id);

  return jsonb_build_object(
    'success', true,
    'ready', true,
    'academicYearId', p_academic_year_id,
    'updatedEstimated', v_updated_estimated,
    'insertedMissing', v_inserted_missing,
    'confirmedEnrolments', v_confirmed_total
  );
end;
$$;

revoke all on function public.rpc_school_admin_confirm_academic_roster(uuid, uuid) from public;
revoke all on function public.rpc_school_admin_confirm_academic_roster(uuid, uuid) from anon;
revoke all on function public.rpc_school_admin_confirm_academic_roster(uuid, uuid) from authenticated;
grant execute on function public.rpc_school_admin_confirm_academic_roster(uuid, uuid) to authenticated, service_role;
