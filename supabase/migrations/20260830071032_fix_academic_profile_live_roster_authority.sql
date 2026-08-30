create or replace function public.rpc_teacher_academic_profile_students_for_year(p_academic_year_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_school_id uuid;
  v_is_admin boolean := false;
  v_is_teacher boolean := false;
  v_operational_year_id uuid;
  v_result jsonb;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select y.school_id into v_school_id
  from public.school_academic_years y
  where y.id = p_academic_year_id;

  if v_school_id is null then
    raise exception 'Academic year not found';
  end if;

  v_is_admin := public.can_administer_school(v_school_id)
    or public.is_school_owner(v_school_id);
  v_is_teacher := exists (
    select 1 from public.teachers t where t.user_id = v_caller
  );

  if not v_is_admin and not v_is_teacher then
    raise exception 'Not authorized';
  end if;

  v_operational_year_id := public.academic_resolve_operational_year_id(v_school_id, now());

  with roster_candidates as (
    -- Current/operational year: the live School Admin class placement is authoritative.
    -- This prevents rollover/history rows from resurrecting removed students or moving a
    -- live student to a prepared future class before the live placement actually changes.
    select
      sm.user_id as student_id,
      v_school_id as school_id,
      p_academic_year_id as academic_year_id,
      school_class.id as class_id,
      school_class.grade_level,
      school_class.class_code,
      null::date as starts_on,
      0 as source_rank
    from public.school_members sm
    join public.class_students cs
      on cs.student_id = sm.user_id
    join public.classes school_class
      on school_class.id = cs.class_id
     and school_class.school_id = v_school_id
     and coalesce(school_class.is_active, true)
    where sm.school_id = v_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
      and p_academic_year_id = v_operational_year_id

    union all

    -- Historical/non-operational years remain year-specific and use academic enrolment history.
    select
      e.student_id,
      e.school_id,
      e.academic_year_id,
      e.class_id,
      e.grade_level,
      e.class_code,
      e.starts_on,
      1 as source_rank
    from public.student_academic_enrolments e
    join public.school_members sm
      on sm.school_id = e.school_id
     and sm.user_id = e.student_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where e.school_id = v_school_id
      and e.academic_year_id = p_academic_year_id
      and p_academic_year_id is distinct from v_operational_year_id
  ),
  roster as (
    select distinct on (candidate.student_id)
      candidate.student_id,
      candidate.school_id,
      candidate.academic_year_id,
      candidate.class_id,
      candidate.grade_level,
      candidate.class_code
    from roster_candidates candidate
    order by candidate.student_id,
             candidate.source_rank,
             candidate.starts_on desc nulls last,
             candidate.class_id
  )
  select coalesce(
    jsonb_agg(
      row_data
      order by row_data->>'grade',
               row_data->>'class_name',
               row_data->>'student_name'
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select jsonb_build_object(
      'student_id', u.id,
      'student_name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'username', u.username,
      'class_name', coalesce(
        nullif(trim(school_class.class_code), ''),
        nullif(trim(school_class.class_name), ''),
        nullif(trim(roster_row.class_code), ''),
        '—'
      ),
      'grade', roster_row.grade_level,
      'school_id', roster_row.school_id,
      'subjects', coalesce((
        select to_jsonb(array_agg(distinct subject_name order by subject_name))
        from (
          select subject.name as subject_name
          from public.school_curriculum_scope_mappings mapping
          join public.academic_subjects subject
            on subject.id = mapping.academic_subject_id
           and subject.is_active
          where mapping.school_id = roster_row.school_id
            and mapping.academic_year_id = roster_row.academic_year_id
            and mapping.grade_level = roster_row.grade_level
            and mapping.status = 'active'
            and (
              mapping.subject_requirement = 'required'
              or exists (
                select 1
                from public.student_subject_enrolments subject_enrolment
                where subject_enrolment.student_id = roster_row.student_id
                  and subject_enrolment.school_id = roster_row.school_id
                  and subject_enrolment.academic_year_id = roster_row.academic_year_id
                  and subject_enrolment.academic_subject_id = subject.id
                  and subject_enrolment.status = 'active'
              )
            )
            and (
              v_is_admin
              or exists (
                select 1
                from public.class_teacher_assignments cta
                where cta.school_id = roster_row.school_id
                  and cta.class_id = roster_row.class_id
                  and cta.teacher_user_id = v_caller
                  and cta.active
                  and private.teacher_assignment_subject_key(cta.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
              or exists (
                select 1
                from private.school_year_teacher_allocation_snapshots snap
                where snap.school_id = roster_row.school_id
                  and snap.academic_year_id = roster_row.academic_year_id
                  and snap.class_id = roster_row.class_id
                  and snap.teacher_user_id = v_caller
                  and private.teacher_assignment_subject_key(snap.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
            )

          union

          select trim(cta.subject) as subject_name
          from public.class_teacher_assignments cta
          where cta.school_id = roster_row.school_id
            and cta.class_id = roster_row.class_id
            and cta.active
            and (v_is_admin or cta.teacher_user_id = v_caller)
            and nullif(trim(cta.subject), '') is not null

          union

          select trim(snap.subject) as subject_name
          from private.school_year_teacher_allocation_snapshots snap
          where snap.school_id = roster_row.school_id
            and snap.academic_year_id = roster_row.academic_year_id
            and snap.class_id = roster_row.class_id
            and (v_is_admin or snap.teacher_user_id = v_caller)
            and nullif(trim(snap.subject), '') is not null
        ) subjects_for_student
      ), '[]'::jsonb)
    ) as row_data
    from roster roster_row
    join public.users u
      on u.id = roster_row.student_id
     and u.school_id = roster_row.school_id
    left join public.classes school_class
      on school_class.id = roster_row.class_id
     and school_class.school_id = roster_row.school_id
    where v_is_admin
      or exists (
        select 1
        from public.class_teacher_assignments cta
        where cta.school_id = roster_row.school_id
          and cta.class_id = roster_row.class_id
          and cta.teacher_user_id = v_caller
          and cta.active
      )
      or exists (
        select 1
        from private.school_year_teacher_allocation_snapshots snap
        where snap.school_id = roster_row.school_id
          and snap.academic_year_id = roster_row.academic_year_id
          and snap.class_id = roster_row.class_id
          and snap.teacher_user_id = v_caller
      )
  ) rows;

  return v_result;
end;
$function$;

revoke all on function public.rpc_teacher_academic_profile_students_for_year(uuid) from public, anon;
grant execute on function public.rpc_teacher_academic_profile_students_for_year(uuid) to authenticated, service_role;

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
    return jsonb_build_object('success',false,'error','Access denied');
  end if;

  select * into v_target
  from public.school_members
  where school_id = v_school_id and user_id = p_member_user_id
  for update;

  if v_target.id is null then
    return jsonb_build_object('success',false,'error','Member not found');
  end if;
  if v_target.is_owner then
    return jsonb_build_object('success',false,'error','The school owner cannot be removed. Transfer ownership first.');
  end if;
  if v_target.role_in_school = 'school_admin' then
    return jsonb_build_object('success',false,'error','Demote this delegated administrator before removing them.');
  end if;
  if exists(
    select 1 from public.class_teacher_assignments
    where school_id = v_school_id
      and teacher_user_id = p_member_user_id
      and coalesce(active,true)
  ) then
    return jsonb_build_object('success',false,'error','Reassign or remove this person''s active teaching assignments first.');
  end if;

  if v_target.role_in_school = 'student' then
    -- class_students is the live/current placement surface. Removing a student from the
    -- school must remove that current placement while historical enrolment stays available.
    delete from public.class_students cs
    using public.classes c
    where cs.class_id = c.id
      and c.school_id = v_school_id
      and cs.student_id = p_member_user_id;

    update public.school_ops_group_students gs
    set valid_to = greatest(gs.valid_from, current_date - 1)
    from public.school_ops_teaching_groups g
    where g.id = gs.group_id
      and g.school_id = v_school_id
      and gs.student_id = p_member_user_id
      and gs.valid_to is null;
  end if;

  delete from public.school_members where id = v_target.id;
  update public.users
  set school_id = null,
      batch = case when v_target.role_in_school = 'student' then null else batch end
  where id = p_member_user_id and school_id = v_school_id;

  return jsonb_build_object('success',true,'message','Member removed from school');
end;
$function$;

revoke all on function public.remove_school_member_legacy_assignment_vocabulary(uuid,uuid)
  from public, anon, authenticated, service_role;
