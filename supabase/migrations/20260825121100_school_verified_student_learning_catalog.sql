-- Keep student subject counts and learning catalogues aligned with the same
-- authority used by assignments and Academic Profiles: current Global
-- Verified plus current same-school Verified questions only.

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

  -- Teachers keep the allocation-aware catalogue. Its question count comes
  -- from the governed three-pool teacher RPC.
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
        join public.classes c
          on c.id = cta.class_id and c.school_id = cta.school_id
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
                from public.get_all_active_questions(
                  subject.name, null, v_teacher, 1000, 0
                ) catalog_question
              )
            ) order by subject.name)
            from public.academic_subjects subject
            where subject.is_active
              and exists (
                select 1
                from public.class_teacher_assignments cta
                join public.classes c
                  on c.id = cta.class_id and c.school_id = cta.school_id
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

  select u.school_id into v_school
  from public.users u where u.id = v_student;

  if v_school is null then
    return jsonb_build_object(
      'success', true, 'ready', false, 'code', 'school_required',
      'subjects', '[]'::jsonb
    );
  end if;

  if v_caller <> v_student and not (
    public.can_administer_school(v_school)
    or public.is_school_owner(v_school)
    or exists (
      select 1
      from public.class_students class_student
      join public.class_teacher_assignments cta
        on cta.class_id = class_student.class_id and cta.active
      where class_student.student_id = v_student
        and cta.teacher_user_id = v_caller
        and cta.school_id = v_school
    )
  ) then
    raise exception using errcode = '42501',
      message = 'student_academic_subject_access_denied';
  end if;

  select enrolment.academic_year_id, enrolment.grade_level
  into v_year, v_grade
  from public.student_academic_enrolments enrolment
  join public.school_academic_years academic_year
    on academic_year.id = enrolment.academic_year_id
   and academic_year.status = 'current'
  where enrolment.student_id = v_student
    and enrolment.school_id = v_school
    and current_date between enrolment.starts_on
      and coalesce(enrolment.ends_on, current_date)
  order by enrolment.starts_on desc, enrolment.created_at desc
  limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object(
      'success', true, 'ready', false,
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
        'id', subject.id,
        'code', subject.code,
        'name', subject.name,
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
           and framework_version.content_hash =
             item_mapping.curriculum_version_content_hash
          where item_mapping.curriculum_scope_id =
              school_mapping.curriculum_scope_id
            and item_mapping.academic_subject_id = subject.id
            and item_mapping.status = 'approved'
            and item_mapping.mapping_role = 'primary'
            and item_mapping.superseded_at is null
            and item_mapping.item_content_hash = assessment_item.content_hash
        )
      ) order by subject.name)
      from public.school_curriculum_scope_mappings school_mapping
      join public.academic_subjects subject
        on subject.id = school_mapping.academic_subject_id
       and subject.is_active
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
              and (subject_enrolment.ends_on is null
                or current_date <= subject_enrolment.ends_on)
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

create or replace function public.rpc_student_learning_catalog(
  p_subject_code text default null::text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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

  select teacher.id into v_teacher
  from public.teachers teacher
  where teacher.user_id = v_student;

  if v_teacher is not null then
    select member.school_id into v_teacher_school
    from public.school_members member
    where member.user_id = v_student and member.status = 'active'
    order by member.joined_at desc nulls last, member.id
    limit 1;

    if v_teacher_school is null then
      select app_user.school_id into v_teacher_school
      from public.users app_user where app_user.id = v_student;
    end if;

    if v_teacher_school is not null and exists (
      select 1
      from public.class_teacher_assignments allocation
      join public.classes class
        on class.id = allocation.class_id
       and class.school_id = allocation.school_id
      where allocation.teacher_user_id = v_student
        and allocation.school_id = v_teacher_school
        and allocation.active and coalesce(class.is_active, true)
    ) then
      select subject.name into v_teacher_subject_name
      from public.academic_subjects subject
      where subject.is_active
        and (
          subject.code = public.academic_normalize_subject_key(p_subject_code)
          or subject.id::text = p_subject_code
        )
        and exists (
          select 1
          from public.class_teacher_assignments allocation
          join public.classes class
            on class.id = allocation.class_id
           and class.school_id = allocation.school_id
          where allocation.teacher_user_id = v_student
            and allocation.school_id = v_teacher_school
            and allocation.active and coalesce(class.is_active, true)
            and private.teacher_assignment_subject_key(allocation.subject) =
              private.teacher_assignment_subject_key(subject.name)
        )
      limit 1;

      if v_teacher_subject_name is null then
        return jsonb_build_object(
          'success', true, 'ready', true,
          'code', 'subject_not_allocated', 'questions', '[]'::jsonb
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
          select jsonb_agg(to_jsonb(catalog_question)
            order by catalog_question.created_at desc)
          from public.get_all_active_questions(
            v_teacher_subject_name, null, v_teacher,
            greatest(1, least(coalesce(p_limit, 20), 500)), 0
          ) catalog_question
        ), '[]'::jsonb)
      );
    end if;
  end if;

  select app_user.school_id into v_school
  from public.users app_user where app_user.id = v_student;
  if v_school is null then
    return jsonb_build_object(
      'success', true, 'ready', false, 'code', 'school_required',
      'questions', '[]'::jsonb
    );
  end if;

  select enrolment.academic_year_id, enrolment.grade_level
  into v_year, v_grade
  from public.student_academic_enrolments enrolment
  join public.school_academic_years academic_year
    on academic_year.id = enrolment.academic_year_id
   and academic_year.status = 'current'
  where enrolment.student_id = v_student
    and enrolment.school_id = v_school
    and current_date between enrolment.starts_on
      and coalesce(enrolment.ends_on, current_date)
  order by enrolment.starts_on desc, enrolment.created_at desc
  limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object(
      'success', true, 'ready', false,
      'code', 'current_grade_enrolment_required',
      'questions', '[]'::jsonb
    );
  end if;

  select school_mapping.curriculum_scope_id,
    school_mapping.academic_subject_id
  into v_scope, v_subject
  from public.school_curriculum_scope_mappings school_mapping
  join public.academic_subjects subject
    on subject.id = school_mapping.academic_subject_id
  where school_mapping.school_id = v_school
    and school_mapping.academic_year_id = v_year
    and school_mapping.grade_level = v_grade
    and school_mapping.status = 'active'
    and (
      subject.code = public.academic_normalize_subject_key(p_subject_code)
      or subject.id::text = p_subject_code
    )
    and (
      school_mapping.subject_requirement = 'required'
      or exists (
        select 1
        from public.student_subject_enrolments subject_enrolment
        where subject_enrolment.student_id = v_student
          and subject_enrolment.academic_year_id = v_year
          and subject_enrolment.academic_subject_id =
            school_mapping.academic_subject_id
          and subject_enrolment.status = 'active'
          and current_date >= subject_enrolment.starts_on
          and (subject_enrolment.ends_on is null
            or current_date <= subject_enrolment.ends_on)
      )
    )
  limit 1;

  if v_scope is null then
    return jsonb_build_object(
      'success', true, 'ready', true, 'code', 'subject_not_enrolled',
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
      select jsonb_agg(question_row.payload order by question_row.random_order)
      from (
        select random() as random_order,
          jsonb_build_object(
            'id', question.id,
            'teacher_id', question.teacher_id,
            'subject', subject.name,
            'subject_id', subject.code,
            'topic', question.topic,
            'topic_name', question.topic_name,
            'difficulty', question.difficulty,
            'question_text', question.question_text,
            'image_url', question.image_url,
            'image_alt_text', question.image_alt_text,
            'question_type', question.question_type,
            'options', question.options,
            'correct_answer', question.correct_answer,
            'explanation', question.explanation,
            'hints', to_jsonb(question.hints),
            'time_limit', question.time_limit,
            'points', question.points,
            'tags', to_jsonb(question.tags),
            'grade_level', v_grade,
            'eligible_grade_levels', to_jsonb(question.eligible_grade_levels),
            'is_public', question.is_public,
            'is_active', question.is_active,
            'times_answered', question.times_answered,
            'times_correct', question.times_correct,
            'created_at', question.created_at,
            'updated_at', question.updated_at,
            'content_origin', question.content_origin,
            'pool_scope', question.pool_scope,
            'owner_school_id', question.owner_school_id,
            'verification_status', question.verification_status,
            'analytics_eligible', question.analytics_eligible,
            'curriculum_strand', question.curriculum_strand,
            'curriculum_skill', question.curriculum_skill,
            'curriculum_subskill', question.curriculum_subskill,
            'curriculum_objective', question.curriculum_objective,
            'curriculum', jsonb_build_object(
              'objectiveId', objective.id,
              'objectiveCode', objective.code,
              'objective', objective.statement,
              'scopeId', item_mapping.curriculum_scope_id,
              'confidence', item_mapping.confidence_score,
              'mappingRole', item_mapping.mapping_role
            )
          ) as payload
        from public.curriculum_item_objective_mappings item_mapping
        join public.curriculum_assessment_items assessment_item
          on assessment_item.id = item_mapping.assessment_item_id
         and assessment_item.is_active
         and assessment_item.source_type = 'question_bank'
        join public.questions question
          on question.id::text = assessment_item.source_record_id
         and question.academic_subject_id = v_subject
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
        join public.curriculum_objectives objective
          on objective.id = item_mapping.curriculum_objective_id
         and objective.is_assessable
        join public.curriculum_framework_versions framework_version
          on framework_version.id = item_mapping.framework_version_id
         and framework_version.status in ('published', 'retired')
         and framework_version.content_hash =
           item_mapping.curriculum_version_content_hash
        join public.academic_subjects subject
          on subject.id = assessment_item.academic_subject_id
        where item_mapping.curriculum_scope_id = v_scope
          and item_mapping.academic_subject_id = v_subject
          and item_mapping.status = 'approved'
          and item_mapping.mapping_role = 'primary'
          and item_mapping.superseded_at is null
          and item_mapping.item_content_hash = assessment_item.content_hash
        order by random()
        limit greatest(1, least(coalesce(p_limit, 20), 500))
      ) question_row
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_student_learning_catalog(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_student_learning_catalog(text, integer)
  to authenticated, service_role;

comment on function public.rpc_student_academic_subjects(uuid) is
  'Curriculum subjects with question counts restricted to Global Verified and the student same-school Verified pool.';
comment on function public.rpc_student_learning_catalog(text, integer) is
  'Student learning catalogue restricted to exact-curriculum Global Verified and same-school Verified questions; teacher-private questions are excluded.';
