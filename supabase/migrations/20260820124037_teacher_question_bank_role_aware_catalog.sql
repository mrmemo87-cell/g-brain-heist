-- Allow shared question-bank surfaces to use the existing governed catalogue
-- service for both students and teachers without weakening either authority.
--
-- Student behavior remains unchanged: current school year, grade, required
-- subjects, and elective enrolments still drive the catalogue.
--
-- Teacher behavior is only enabled when the signed-in user has a teacher
-- profile plus an active class/subject allocation. The existing
-- get_all_active_questions() RPC remains the authority for school, subject,
-- grade, verified content, and curriculum mapping visibility.

create or replace function public.rpc_student_academic_subjects(p_student_id uuid default null::uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
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

  -- Compatibility path for a teacher opening a shared question-bank surface.
  -- It only applies when the caller is requesting their own catalogue and has
  -- an active class/subject allocation. Student inspection keeps the original
  -- student contract below.
  if v_student = v_caller then
    select t.id into v_teacher
    from public.teachers t
    where t.user_id = v_caller;

    if v_teacher is not null then
      select sm.school_id into v_teacher_school
      from public.school_members sm
      where sm.user_id = v_caller
        and sm.status = 'active'
      order by sm.joined_at desc nulls last, sm.id
      limit 1;

      if v_teacher_school is null then
        select u.school_id into v_teacher_school
        from public.users u
        where u.id = v_caller;
      end if;

      if v_teacher_school is not null and exists (
        select 1
        from public.class_teacher_assignments cta
        join public.classes c
          on c.id = cta.class_id
         and c.school_id = cta.school_id
        where cta.teacher_user_id = v_caller
          and cta.school_id = v_teacher_school
          and cta.active
          and coalesce(c.is_active, true)
      ) then
        v_year := public.academic_resolve_year_id(v_teacher_school, now());

        return jsonb_build_object(
          'success', true,
          'ready', true,
          'academicYearId', v_year,
          'gradeLevel', null,
          'subjects', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', a.id,
              'code', a.code,
              'name', a.name,
              'requirement', 'teacher_allocation',
              'scopeId', null,
              'approvedQuestionCount', (
                select count(*)
                from public.get_all_active_questions(a.name, null, v_teacher, 1000, 0) q
              )
            ) order by a.name)
            from public.academic_subjects a
            where a.is_active
              and exists (
                select 1
                from public.class_teacher_assignments cta
                join public.classes c
                  on c.id = cta.class_id
                 and c.school_id = cta.school_id
                where cta.teacher_user_id = v_caller
                  and cta.school_id = v_teacher_school
                  and cta.active
                  and coalesce(c.is_active, true)
                  and private.teacher_assignment_subject_key(cta.subject)
                      = private.teacher_assignment_subject_key(a.name)
              )
          ), '[]'::jsonb)
        );
      end if;
    end if;
  end if;

  -- Original governed student contract.
  select u.school_id into v_school
  from public.users u
  where u.id = v_student;

  if v_school is null then
    return jsonb_build_object(
      'success', true,
      'ready', false,
      'code', 'school_required',
      'subjects', '[]'::jsonb
    );
  end if;

  if v_caller <> v_student and not (
    public.can_administer_school(v_school)
    or public.is_school_owner(v_school)
    or exists (
      select 1
      from public.class_students cs
      join public.class_teacher_assignments cta
        on cta.class_id = cs.class_id
       and cta.active
      where cs.student_id = v_student
        and cta.teacher_user_id = v_caller
        and cta.school_id = v_school
    )
  ) then
    raise exception using errcode = '42501', message = 'student_academic_subject_access_denied';
  end if;

  select e.academic_year_id, e.grade_level
    into v_year, v_grade
  from public.student_academic_enrolments e
  join public.school_academic_years y
    on y.id = e.academic_year_id
   and y.status = 'current'
  where e.student_id = v_student
    and e.school_id = v_school
    and current_date between e.starts_on and coalesce(e.ends_on, current_date)
  order by e.starts_on desc, e.created_at desc
  limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object(
      'success', true,
      'ready', false,
      'code', 'current_grade_enrolment_required',
      'subjects', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'ready', true,
    'academicYearId', v_year,
    'gradeLevel', v_grade,
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'code', a.code,
        'name', a.name,
        'requirement', m.subject_requirement,
        'scopeId', m.curriculum_scope_id,
        'approvedQuestionCount', (
          select count(distinct im.assessment_item_id)
          from public.curriculum_item_objective_mappings im
          join public.curriculum_assessment_items i
            on i.id = im.assessment_item_id
           and i.is_active
          join public.curriculum_framework_versions fv
            on fv.id = im.framework_version_id
           and fv.status = 'published'
          where im.curriculum_scope_id = m.curriculum_scope_id
            and im.status = 'approved'
            and im.mapping_role = 'primary'
            and im.item_content_hash = i.content_hash
            and im.curriculum_version_content_hash = fv.content_hash
        )
      ) order by a.name)
      from public.school_curriculum_scope_mappings m
      join public.academic_subjects a
        on a.id = m.academic_subject_id
       and a.is_active
      where m.school_id = v_school
        and m.academic_year_id = v_year
        and m.grade_level = v_grade
        and m.status = 'active'
        and (
          m.subject_requirement = 'required'
          or exists (
            select 1
            from public.student_subject_enrolments se
            where se.student_id = v_student
              and se.academic_year_id = v_year
              and se.academic_subject_id = m.academic_subject_id
              and se.status = 'active'
              and current_date >= se.starts_on
              and (se.ends_on is null or current_date <= se.ends_on)
          )
        )
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.rpc_student_learning_catalog(
  p_subject_code text default null::text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_student uuid := auth.uid();
  v_school uuid;
  v_year uuid;
  v_grade text;
  v_scope uuid;
  v_subject uuid;
  v_teacher uuid;
  v_teacher_school uuid;
  v_teacher_subject_name text;
begin
  if v_student is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  -- Teacher compatibility path. The existing teacher question RPC remains the
  -- authority for school, class, subject, grade and verified curriculum scope.
  select t.id into v_teacher
  from public.teachers t
  where t.user_id = v_student;

  if v_teacher is not null then
    select sm.school_id into v_teacher_school
    from public.school_members sm
    where sm.user_id = v_student
      and sm.status = 'active'
    order by sm.joined_at desc nulls last, sm.id
    limit 1;

    if v_teacher_school is null then
      select u.school_id into v_teacher_school
      from public.users u
      where u.id = v_student;
    end if;

    if v_teacher_school is not null and exists (
      select 1
      from public.class_teacher_assignments cta
      join public.classes c
        on c.id = cta.class_id
       and c.school_id = cta.school_id
      where cta.teacher_user_id = v_student
        and cta.school_id = v_teacher_school
        and cta.active
        and coalesce(c.is_active, true)
    ) then
      select a.name into v_teacher_subject_name
      from public.academic_subjects a
      where a.is_active
        and (
          a.code = public.academic_normalize_subject_key(p_subject_code)
          or a.id::text = p_subject_code
        )
        and exists (
          select 1
          from public.class_teacher_assignments cta
          join public.classes c
            on c.id = cta.class_id
           and c.school_id = cta.school_id
          where cta.teacher_user_id = v_student
            and cta.school_id = v_teacher_school
            and cta.active
            and coalesce(c.is_active, true)
            and private.teacher_assignment_subject_key(cta.subject)
                = private.teacher_assignment_subject_key(a.name)
        )
      limit 1;

      if v_teacher_subject_name is null then
        return jsonb_build_object(
          'success', true,
          'ready', true,
          'code', 'subject_not_allocated',
          'questions', '[]'::jsonb
        );
      end if;

      v_year := public.academic_resolve_year_id(v_teacher_school, now());

      return jsonb_build_object(
        'success', true,
        'ready', true,
        'academicYearId', v_year,
        'gradeLevel', null,
        'scopeId', null,
        'questions', coalesce((
          select jsonb_agg(to_jsonb(q) order by q.created_at desc)
          from public.get_all_active_questions(
            v_teacher_subject_name,
            null,
            v_teacher,
            greatest(1, least(coalesce(p_limit, 20), 500)),
            0
          ) q
        ), '[]'::jsonb)
      );
    end if;
  end if;

  -- Original governed student contract.
  select u.school_id into v_school
  from public.users u
  where u.id = v_student;

  if v_school is null then
    return jsonb_build_object(
      'success', true,
      'ready', false,
      'code', 'school_required',
      'questions', '[]'::jsonb
    );
  end if;

  select e.academic_year_id, e.grade_level
    into v_year, v_grade
  from public.student_academic_enrolments e
  join public.school_academic_years y
    on y.id = e.academic_year_id
   and y.status = 'current'
  where e.student_id = v_student
    and e.school_id = v_school
    and current_date between e.starts_on and coalesce(e.ends_on, current_date)
  order by e.starts_on desc, e.created_at desc
  limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object(
      'success', true,
      'ready', false,
      'code', 'current_grade_enrolment_required',
      'questions', '[]'::jsonb
    );
  end if;

  select m.curriculum_scope_id, m.academic_subject_id
    into v_scope, v_subject
  from public.school_curriculum_scope_mappings m
  join public.academic_subjects a
    on a.id = m.academic_subject_id
  where m.school_id = v_school
    and m.academic_year_id = v_year
    and m.grade_level = v_grade
    and m.status = 'active'
    and (
      a.code = public.academic_normalize_subject_key(p_subject_code)
      or a.id::text = p_subject_code
    )
    and (
      m.subject_requirement = 'required'
      or exists (
        select 1
        from public.student_subject_enrolments se
        where se.student_id = v_student
          and se.academic_year_id = v_year
          and se.academic_subject_id = m.academic_subject_id
          and se.status = 'active'
          and current_date >= se.starts_on
          and (se.ends_on is null or current_date <= se.ends_on)
      )
    )
  limit 1;

  if v_scope is null then
    return jsonb_build_object(
      'success', true,
      'ready', true,
      'code', 'subject_not_enrolled',
      'questions', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'ready', true,
    'academicYearId', v_year,
    'gradeLevel', v_grade,
    'scopeId', v_scope,
    'questions', coalesce((
      select jsonb_agg(question_row.payload order by random())
      from (
        select jsonb_build_object(
          'id', q.id,
          'teacher_id', q.teacher_id,
          'subject', a.name,
          'subject_id', a.code,
          'topic', q.topic,
          'topic_name', q.topic_name,
          'difficulty', q.difficulty,
          'question_text', q.question_text,
          'image_url', q.image_url,
          'image_alt_text', q.image_alt_text,
          'question_type', q.question_type,
          'options', q.options,
          'correct_answer', q.correct_answer,
          'explanation', q.explanation,
          'hints', to_jsonb(q.hints),
          'time_limit', q.time_limit,
          'points', q.points,
          'tags', to_jsonb(q.tags),
          'grade_level', v_grade,
          'is_public', q.is_public,
          'is_active', q.is_active,
          'times_answered', q.times_answered,
          'times_correct', q.times_correct,
          'created_at', q.created_at,
          'updated_at', q.updated_at,
          'content_origin', q.content_origin,
          'verification_status', q.verification_status,
          'analytics_eligible', q.analytics_eligible,
          'curriculum', jsonb_build_object(
            'objectiveId', o.id,
            'objectiveCode', o.code,
            'objective', o.statement,
            'scopeId', im.curriculum_scope_id,
            'confidence', im.confidence_score,
            'mappingRole', im.mapping_role
          )
        ) payload
        from public.curriculum_item_objective_mappings im
        join public.curriculum_assessment_items i
          on i.id = im.assessment_item_id
         and i.is_active
         and i.source_type = 'question_bank'
        join public.questions q
          on q.id::text = i.source_record_id
         and q.is_active
         and q.is_public
         and q.content_origin = 'brain_heist'
         and q.verification_status = 'verified'
         and q.analytics_eligible
         and q.current_content_hash = q.verified_content_hash
         and i.content_hash = q.verified_content_hash
        join public.curriculum_objectives o
          on o.id = im.curriculum_objective_id
        join public.curriculum_framework_versions fv
          on fv.id = im.framework_version_id
         and fv.status = 'published'
        join public.academic_subjects a
          on a.id = i.academic_subject_id
        where im.curriculum_scope_id = v_scope
          and im.academic_subject_id = v_subject
          and im.status = 'approved'
          and im.mapping_role = 'primary'
          and im.item_content_hash = i.content_hash
          and im.curriculum_version_content_hash = fv.content_hash
        order by random()
        limit greatest(1, least(coalesce(p_limit, 20), 500))
      ) question_row
    ), '[]'::jsonb)
  );
end;
$function$;
