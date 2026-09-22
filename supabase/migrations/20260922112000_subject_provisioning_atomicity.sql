-- Finalize subject provisioning as an atomic operation.
-- Validate the complete audience and teacher/class scope before writing any
-- school subject, alias, offering, enrolment, or allocation rows.

create or replace function public.rpc_school_admin_provision_subject(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_name text,
  p_code text,
  p_academic_subject_id uuid,
  p_grade_level text,
  p_scope_id uuid,
  p_access_mode text,
  p_selected_student_ids uuid[] default '{}'::uuid[],
  p_teacher_user_id uuid default null,
  p_class_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_code text := nullif(trim(coalesce(p_code, '')), '');
  v_requirement text;
  v_school_subject_id uuid;
  v_student_id uuid;
  v_class_id uuid;
  v_allocation jsonb;
  v_selected_count integer := 0;
  v_teacher_count integer := 0;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  if length(v_name) < 2 then
    return jsonb_build_object('success', false, 'code', 'subject_name_required');
  end if;
  if p_grade_level is null or trim(p_grade_level) !~ '^(?:[1-9]|1[0-2])$' then
    return jsonb_build_object('success', false, 'code', 'invalid_grade_level');
  end if;
  if p_access_mode not in ('all_grade', 'selected') then
    return jsonb_build_object('success', false, 'code', 'invalid_subject_access_mode');
  end if;
  if not exists (
    select 1 from public.school_academic_years y
    where y.id = p_academic_year_id and y.school_id = p_school_id
  ) then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_found');
  end if;
  if not exists (
    select 1
    from public.curriculum_scopes sc
    join public.curriculum_stages st on st.id = sc.stage_id
    join public.curriculum_framework_versions v on v.id = sc.framework_version_id
    join public.academic_subjects a on a.id = p_academic_subject_id and a.is_active
    where sc.id = p_scope_id
      and sc.academic_subject_id = p_academic_subject_id
      and st.sequence_number::text = trim(p_grade_level)
      and v.status = 'published'
  ) then
    return jsonb_build_object('success', false, 'code', 'offering_scope_does_not_match_grade_subject');
  end if;

  -- Validate the full selective audience before any writes.
  if p_access_mode = 'selected' then
    if cardinality(coalesce(p_selected_student_ids, '{}'::uuid[])) = 0 then
      return jsonb_build_object('success', false, 'code', 'select_at_least_one_student');
    end if;

    foreach v_student_id in array coalesce(p_selected_student_ids, '{}'::uuid[])
    loop
      if not exists (
        select 1
        from public.users u
        join public.student_academic_enrolments e
          on e.student_id = u.id
         and e.school_id = p_school_id
         and e.academic_year_id = p_academic_year_id
         and e.grade_level = trim(p_grade_level)
        where u.id = v_student_id
          and u.school_id = p_school_id
      ) then
        return jsonb_build_object('success', false, 'code', 'selected_student_not_in_grade');
      end if;
    end loop;
  end if;

  -- Validate staffing before any writes. Allocation itself is still performed
  -- through the existing canonical teacher-allocation authority.
  if p_teacher_user_id is not null then
    if cardinality(coalesce(p_class_ids, '{}'::uuid[])) = 0 then
      return jsonb_build_object('success', false, 'code', 'teacher_class_required');
    end if;
    if not exists (
      select 1 from public.school_members sm
      where sm.school_id = p_school_id
        and sm.user_id = p_teacher_user_id
        and sm.status = 'active'
        and sm.can_teach
    ) then
      return jsonb_build_object('success', false, 'code', 'teacher_not_available_in_school');
    end if;

    foreach v_class_id in array coalesce(p_class_ids, '{}'::uuid[])
    loop
      if not exists (
        select 1 from public.classes c
        where c.id = v_class_id
          and c.school_id = p_school_id
          and c.is_active is distinct from false
          and c.grade_level::text = trim(p_grade_level)
      ) then
        return jsonb_build_object('success', false, 'code', 'class_not_in_selected_grade');
      end if;
    end loop;
  end if;

  insert into public.academic_subject_aliases(academic_subject_id, school_id, alias)
  values (p_academic_subject_id, p_school_id, v_name)
  on conflict (school_id, alias_key) where school_id is not null
  do update set academic_subject_id = excluded.academic_subject_id, alias = excluded.alias;

  select s.id into v_school_subject_id
  from public.school_subjects s
  where s.school_id = p_school_id
    and lower(trim(s.name)) = lower(v_name)
  order by s.is_active desc, s.created_at desc
  limit 1;

  if v_school_subject_id is null then
    insert into public.school_subjects(
      school_id, name, code, is_active, created_by, academic_subject_id
    ) values (
      p_school_id, v_name, v_code, true, v_actor, p_academic_subject_id
    )
    returning id into v_school_subject_id;
  else
    update public.school_subjects
    set name = v_name,
        code = coalesce(v_code, code),
        is_active = true,
        academic_subject_id = p_academic_subject_id
    where id = v_school_subject_id and school_id = p_school_id;
  end if;

  v_requirement := case when p_access_mode = 'selected' then 'elective' else 'required' end;

  insert into public.school_curriculum_scope_mappings(
    school_id, academic_year_id, grade_level, academic_subject_id,
    curriculum_scope_id, status, mapping_quality, subject_requirement,
    display_name, school_subject_id,
    created_by, confirmed_by, confirmed_at
  ) values (
    p_school_id, p_academic_year_id, trim(p_grade_level), p_academic_subject_id,
    p_scope_id, 'active', 'confirmed', v_requirement,
    v_name, v_school_subject_id,
    v_actor, v_actor, now()
  )
  on conflict (school_id, academic_year_id, grade_level, academic_subject_id)
    where status in ('planned', 'active')
  do update set
    curriculum_scope_id = excluded.curriculum_scope_id,
    status = 'active',
    mapping_quality = 'confirmed',
    subject_requirement = excluded.subject_requirement,
    display_name = excluded.display_name,
    school_subject_id = excluded.school_subject_id,
    confirmed_by = v_actor,
    confirmed_at = now(),
    updated_at = now();

  if p_access_mode = 'selected' then
    foreach v_student_id in array coalesce(p_selected_student_ids, '{}'::uuid[])
    loop
      insert into public.student_subject_enrolments(
        school_id, student_id, academic_year_id, academic_subject_id,
        status, starts_on, ends_on, created_by
      )
      select
        p_school_id, v_student_id, p_academic_year_id, p_academic_subject_id,
        'active', y.starts_on, null, v_actor
      from public.school_academic_years y
      where y.id = p_academic_year_id and y.school_id = p_school_id
      on conflict (student_id, academic_year_id, academic_subject_id)
      do update set
        status = 'active', ends_on = null, created_by = v_actor, updated_at = now();
      v_selected_count := v_selected_count + 1;
    end loop;

    update public.student_subject_enrolments se
    set status = 'withdrawn', ends_on = current_date, updated_at = now()
    where se.school_id = p_school_id
      and se.academic_year_id = p_academic_year_id
      and se.academic_subject_id = p_academic_subject_id
      and se.status = 'active'
      and not (se.student_id = any(coalesce(p_selected_student_ids, '{}'::uuid[])))
      and exists (
        select 1 from public.student_academic_enrolments e
        where e.student_id = se.student_id
          and e.school_id = p_school_id
          and e.academic_year_id = p_academic_year_id
          and e.grade_level = trim(p_grade_level)
      );
  end if;

  if p_teacher_user_id is not null then
    foreach v_class_id in array coalesce(p_class_ids, '{}'::uuid[])
    loop
      select public.admin_allocate_teacher_to_class_subject(
        p_school_id, v_class_id, p_teacher_user_id, v_name, true
      ) into v_allocation;
      if coalesce((v_allocation->>'success')::boolean, false) is not true then
        raise exception using
          errcode = 'P0001',
          message = 'teacher_allocation_failed',
          detail = coalesce(v_allocation->>'error', 'Teacher allocation could not be saved.');
      end if;
      v_teacher_count := v_teacher_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'schoolSubjectId', v_school_subject_id,
    'displayName', v_name,
    'academicSubjectId', p_academic_subject_id,
    'gradeLevel', trim(p_grade_level),
    'accessMode', p_access_mode,
    'selectedStudents', v_selected_count,
    'teacherAllocations', v_teacher_count
  );
end;
$$;

revoke all on function public.rpc_school_admin_provision_subject(
  uuid, uuid, text, text, uuid, text, uuid, text, uuid[], uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.rpc_school_admin_provision_subject(
  uuid, uuid, text, text, uuid, text, uuid, text, uuid[], uuid, uuid[]
) to authenticated, service_role;
