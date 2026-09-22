-- Professional school subject provisioning.
--
-- A school-facing subject label (for example "ESL") can map to an existing
-- canonical academic subject (for example English), while grade scope,
-- selective student access, and teacher allocation remain governed by the
-- existing academic-year and curriculum authority.

alter table public.school_curriculum_scope_mappings
  add column if not exists display_name text,
  add column if not exists school_subject_id uuid references public.school_subjects(id) on delete set null;

create index if not exists school_curriculum_scope_mappings_school_subject_idx
  on public.school_curriculum_scope_mappings(school_id, academic_year_id, school_subject_id)
  where school_subject_id is not null;

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
    select 1
    from public.school_academic_years y
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

  -- The school label becomes an explicit school-scoped alias of the canonical
  -- academic subject. This keeps reporting/content authority canonical while
  -- letting schools use their own terminology.
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
        status = 'active',
        ends_on = null,
        created_by = v_actor,
        updated_at = now();

      v_selected_count := v_selected_count + 1;
    end loop;

    -- Students removed from the selective roster are withdrawn only within
    -- this grade; the same canonical subject may still be offered elsewhere.
    update public.student_subject_enrolments se
    set status = 'withdrawn', ends_on = current_date, updated_at = now()
    where se.school_id = p_school_id
      and se.academic_year_id = p_academic_year_id
      and se.academic_subject_id = p_academic_subject_id
      and se.status = 'active'
      and not (se.student_id = any(coalesce(p_selected_student_ids, '{}'::uuid[])))
      and exists (
        select 1
        from public.student_academic_enrolments e
        where e.student_id = se.student_id
          and e.school_id = p_school_id
          and e.academic_year_id = p_academic_year_id
          and e.grade_level = trim(p_grade_level)
      );
  end if;

  if p_teacher_user_id is not null then
    if not exists (
      select 1
      from public.school_members sm
      where sm.school_id = p_school_id
        and sm.user_id = p_teacher_user_id
        and sm.status = 'active'
        and sm.role_in_school in ('teacher', 'school_admin')
    ) then
      return jsonb_build_object('success', false, 'code', 'teacher_not_available_in_school');
    end if;

    foreach v_class_id in array coalesce(p_class_ids, '{}'::uuid[])
    loop
      if not exists (
        select 1 from public.classes c
        where c.id = v_class_id
          and c.school_id = p_school_id
          and c.is_active = true
          and c.grade_level::text = trim(p_grade_level)
      ) then
        return jsonb_build_object('success', false, 'code', 'class_not_in_selected_grade');
      end if;

      select public.admin_allocate_teacher_to_class_subject(
        p_school_id, v_class_id, p_teacher_user_id, v_name, true
      ) into v_allocation;

      if coalesce((v_allocation->>'success')::boolean, false) is not true then
        return jsonb_build_object(
          'success', false,
          'code', 'teacher_allocation_failed',
          'detail', coalesce(v_allocation->>'error', 'Teacher allocation could not be saved.')
        );
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

create or replace function public.rpc_school_admin_subject_provisioning_state(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  return jsonb_build_object(
    'success', true,
    'offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mappingId', m.id,
        'schoolSubjectId', m.school_subject_id,
        'academicYearId', m.academic_year_id,
        'gradeLevel', m.grade_level,
        'academicSubjectId', m.academic_subject_id,
        'canonicalName', a.name,
        'displayName', coalesce(nullif(trim(m.display_name), ''), a.name),
        'scopeId', m.curriculum_scope_id,
        'accessMode', case when m.subject_requirement = 'elective' then 'selected' else 'all_grade' end,
        'selectedStudentIds', coalesce((
          select jsonb_agg(se.student_id order by se.student_id)
          from public.student_subject_enrolments se
          where se.school_id = m.school_id
            and se.academic_year_id = m.academic_year_id
            and se.academic_subject_id = m.academic_subject_id
            and se.status = 'active'
            and exists (
              select 1 from public.student_academic_enrolments e
              where e.student_id = se.student_id
                and e.school_id = m.school_id
                and e.academic_year_id = m.academic_year_id
                and e.grade_level = m.grade_level
            )
        ), '[]'::jsonb),
        'teacherUserIds', coalesce((
          select jsonb_agg(distinct cta.teacher_user_id)
          from public.class_teacher_assignments cta
          join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
          where cta.school_id = m.school_id
            and cta.active
            and c.grade_level::text = m.grade_level
            and lower(trim(cta.subject)) = lower(trim(coalesce(nullif(m.display_name, ''), a.name)))
        ), '[]'::jsonb),
        'classIds', coalesce((
          select jsonb_agg(distinct cta.class_id)
          from public.class_teacher_assignments cta
          join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
          where cta.school_id = m.school_id
            and cta.active
            and c.grade_level::text = m.grade_level
            and lower(trim(cta.subject)) = lower(trim(coalesce(nullif(m.display_name, ''), a.name)))
        ), '[]'::jsonb)
      ) order by m.academic_year_id desc, m.grade_level, coalesce(m.display_name, a.name))
      from public.school_curriculum_scope_mappings m
      join public.academic_subjects a on a.id = m.academic_subject_id
      where m.school_id = p_school_id
        and m.status in ('planned', 'active')
        and (m.school_subject_id is not null or nullif(trim(m.display_name), '') is not null)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_school_admin_subject_provisioning_state(uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_subject_provisioning_state(uuid)
  to authenticated, service_role;

-- Preserve the existing governed student subject catalogue while exposing the
-- school-facing label. The canonical code/id remain unchanged, so question
-- selection, analytics, and reporting continue to use the canonical subject.
create or replace function public.rpc_student_academic_subjects(
  p_student_id uuid default null::uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_student uuid := coalesce(p_student_id, auth.uid());
  v_school uuid;
  v_year uuid;
  v_grade text;
  v_teacher uuid;
  v_teacher_school uuid;
begin
  if v_caller is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if v_student = v_caller then
    select t.id into v_teacher
    from public.teachers t
    where t.user_id = v_caller;

    if v_teacher is not null then
      select sm.school_id into v_teacher_school
      from public.school_members sm
      where sm.user_id = v_caller and sm.status = 'active'
      order by sm.joined_at desc nulls last, sm.id
      limit 1;

      if v_teacher_school is null then
        select u.school_id into v_teacher_school
        from public.users u where u.id = v_caller;
      end if;

      if v_teacher_school is not null and exists (
        select 1
        from public.class_teacher_assignments cta
        join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
        where cta.teacher_user_id = v_caller
          and cta.school_id = v_teacher_school
          and cta.active and coalesce(c.is_active, true)
      ) then
        v_year := public.academic_resolve_year_id(v_teacher_school, now());
        return jsonb_build_object(
          'success', true,
          'ready', true,
          'academicYearId', v_year,
          'gradeLevel', null,
          'subjects', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', subject.id,
              'code', subject.code,
              'name', subject.name,
              'requirement', 'teacher_allocation',
              'scopeId', null,
              'approvedQuestionCount', (
                select count(*)
                from public.get_all_active_questions(subject.name, null, v_teacher, 1000, 0) catalog_question
              )
            ) order by subject.name)
            from public.academic_subjects subject
            where subject.is_active
              and exists (
                select 1
                from public.class_teacher_assignments cta
                join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
                where cta.teacher_user_id = v_caller
                  and cta.school_id = v_teacher_school
                  and cta.active and coalesce(c.is_active, true)
                  and private.teacher_assignment_subject_key(cta.subject) =
                    private.teacher_assignment_subject_key(subject.name)
              )
          ), '[]'::jsonb)
        );
      end if;
    end if;
  end if;

  select u.school_id into v_school from public.users u where u.id = v_student;
  if v_school is null then
    return jsonb_build_object('success', true, 'ready', false, 'code', 'school_required', 'subjects', '[]'::jsonb);
  end if;

  if v_caller <> v_student and not (
    public.can_administer_school(v_school)
    or public.is_school_owner(v_school)
    or exists (
      select 1
      from public.class_students class_student
      join public.class_teacher_assignments cta on cta.class_id = class_student.class_id and cta.active
      where class_student.student_id = v_student
        and cta.teacher_user_id = v_caller
        and cta.school_id = v_school
    )
  ) then
    raise exception using errcode = '42501', message = 'student_academic_subject_access_denied';
  end if;

  select enrolment.academic_year_id, enrolment.grade_level
  into v_year, v_grade
  from public.student_academic_enrolments enrolment
  join public.school_academic_years academic_year
    on academic_year.id = enrolment.academic_year_id and academic_year.status = 'current'
  where enrolment.student_id = v_student
    and enrolment.school_id = v_school
    and current_date between enrolment.starts_on and coalesce(enrolment.ends_on, current_date)
  order by enrolment.starts_on desc, enrolment.created_at desc
  limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object(
      'success', true, 'ready', false, 'code', 'current_grade_enrolment_required', 'subjects', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'ready', true,
    'academicYearId', v_year,
    'gradeLevel', v_grade,
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', subject.id,
        'code', subject.code,
        'name', coalesce(nullif(trim(school_mapping.display_name), ''), subject.name),
        'canonicalName', subject.name,
        'requirement', school_mapping.subject_requirement,
        'scopeId', school_mapping.curriculum_scope_id,
        'approvedQuestionCount', (
          select count(distinct item_mapping.assessment_item_id)
          from public.curriculum_item_objective_mappings item_mapping
          join public.curriculum_assessment_items assessment_item
            on assessment_item.id = item_mapping.assessment_item_id
           and assessment_item.is_active
           and assessment_item.source_type = 'question_bank'
          join public.questions question
            on question.id::text = assessment_item.source_record_id
           and question.academic_subject_id = subject.id
           and question.verification_status = 'verified'
           and question.analytics_eligible
           and question.is_active
           and question.current_content_hash = question.verified_content_hash
           and assessment_item.content_hash = question.verified_content_hash
           and v_grade ~ '^[0-9]+$'
           and v_grade::smallint = any(question.eligible_grade_levels)
           and (
             (question.pool_scope = 'global'
               and question.content_origin = 'brain_heist'
               and question.owner_school_id is null
               and question.is_public
               and assessment_item.school_id is null)
             or (question.pool_scope = 'school'
               and question.content_origin = 'teacher'
               and question.owner_school_id = v_school
               and not question.is_public
               and assessment_item.school_id = v_school)
           )
          join public.curriculum_framework_versions framework_version
            on framework_version.id = item_mapping.framework_version_id
           and framework_version.status in ('published', 'retired')
           and framework_version.content_hash = item_mapping.curriculum_version_content_hash
          where item_mapping.curriculum_scope_id = school_mapping.curriculum_scope_id
            and item_mapping.academic_subject_id = subject.id
            and item_mapping.status = 'approved'
            and item_mapping.mapping_role = 'primary'
            and item_mapping.superseded_at is null
            and item_mapping.item_content_hash = assessment_item.content_hash
        )
      ) order by coalesce(nullif(trim(school_mapping.display_name), ''), subject.name))
      from public.school_curriculum_scope_mappings school_mapping
      join public.academic_subjects subject
        on subject.id = school_mapping.academic_subject_id and subject.is_active
      where school_mapping.school_id = v_school
        and school_mapping.academic_year_id = v_year
        and school_mapping.grade_level = v_grade
        and school_mapping.status = 'active'
        and (
          school_mapping.subject_requirement = 'required'
          or exists (
            select 1
            from public.student_subject_enrolments subject_enrolment
            where subject_enrolment.student_id = v_student
              and subject_enrolment.academic_year_id = v_year
              and subject_enrolment.academic_subject_id = subject.id
              and subject_enrolment.status = 'active'
              and current_date >= subject_enrolment.starts_on
              and (subject_enrolment.ends_on is null or current_date <= subject_enrolment.ends_on)
          )
        )
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_student_academic_subjects(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_student_academic_subjects(uuid)
  to authenticated, service_role;
