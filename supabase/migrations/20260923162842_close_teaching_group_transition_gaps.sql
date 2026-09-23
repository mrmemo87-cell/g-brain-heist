
create or replace function private.actor_can_review_bh_writing_assessment(
  p_actor uuid,
  p_school_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    p_actor is not null
    and p_school_id is not null
    and p_student_id is not null
    and (
      public.is_superadmin(p_actor)
      or exists(
        select 1 from public.users actor
        where actor.id=p_actor and (coalesce(actor.is_admin,false) or actor.role='admin')
      )
      or public.is_school_owner(p_school_id)
      or public.is_school_admin_of(p_actor,p_school_id)
      or exists(
        select 1
        from private.teacher_current_teaching_roster(p_actor,p_school_id) r
        where r.student_id=p_student_id
          and (
            lower(coalesce(r.academic_subject_code,''))='english'
            or lower(coalesce(r.academic_subject_name,''))='english'
            or lower(trim(r.school_subject_name)) like 'english%'
            or lower(trim(r.school_subject_name))='esl'
          )
      )
      or (
        not exists(select 1 from private.teacher_current_teaching_groups(p_actor,p_school_id))
        and exists(
          select 1
          from public.class_students cs
          join public.class_teacher_assignments cta
            on cta.class_id=cs.class_id
           and cta.teacher_user_id=p_actor
           and coalesce(cta.active,true)
          join public.classes c on c.id=cs.class_id and c.school_id=p_school_id
          where cs.student_id=p_student_id
            and lower(trim(coalesce(cta.subject,c.subject,''))) like 'english%'
        )
      )
    );
$function$;

revoke all on function private.actor_can_review_bh_writing_assessment(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_teacher_submit_question_batch(p_extraction_id uuid, p_questions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_teacher public.teachers%rowtype;
  v_extraction public.teacher_question_pdf_extractions%rowtype;
  v_batch_id uuid;
  v_item jsonb;
  v_taxonomy jsonb;
  v_options jsonb;
  v_question_id uuid;
  v_question_hash text;
  v_fingerprint text;
  v_subject text;
  v_topic text;
  v_difficulty text;
  v_question_type text;
  v_question_text text;
  v_correct_answer text;
  v_explanation text;
  v_grades smallint[];
  v_source_index integer;
  v_count integer;
  v_created integer := 0;
  v_ao text;
  v_cognitive text;
  v_confidence numeric;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select t.* into v_teacher
  from public.teachers t
  where t.user_id = v_actor;

  if v_teacher.id is null then
    raise exception using errcode = '42501', message = 'teacher_required';
  end if;

  if p_extraction_id is null then
    raise exception using errcode = '22023', message = 'pdf_extraction_required';
  end if;

  select e.* into v_extraction
  from public.teacher_question_pdf_extractions e
  where e.id = p_extraction_id
    and e.teacher_id = v_teacher.id
    and e.teacher_user_id = v_actor;

  if v_extraction.id is null then
    raise exception using errcode = '42501', message = 'teacher_pdf_extraction_access_denied';
  end if;

  if exists (
    select 1 from public.teacher_question_batches b
    where b.extraction_id = p_extraction_id
  ) then
    raise exception using errcode = '23505', message = 'teacher_question_batch_already_submitted';
  end if;

  if jsonb_typeof(p_questions) <> 'array' then
    raise exception using errcode = '22023', message = 'questions_array_required';
  end if;

  v_count := jsonb_array_length(p_questions);
  if v_count < 1 or v_count > 50 then
    raise exception using errcode = '22023', message = 'question_batch_requires_1_to_50_questions';
  end if;

  -- Create the immutable batch first. The whole RPC is one transaction, so any
  -- invalid item rolls back both the batch and every inserted question.
  insert into public.teacher_question_batches (
    teacher_id, teacher_user_id, school_id, extraction_id,
    submitted_question_count, created_question_count, duplicate_question_count
  ) values (
    v_teacher.id, v_actor, v_extraction.school_id, v_extraction.id,
    v_count, 0, v_count
  ) returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_questions)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'question_batch_item_object_required';
    end if;

    v_source_index := coalesce((v_item ->> 'source_index')::integer, 0);
    v_subject := trim(coalesce(v_item ->> 'subject', ''));
    v_topic := coalesce(nullif(trim(v_item ->> 'topic'), ''), 'General');
    v_difficulty := lower(trim(coalesce(v_item ->> 'difficulty', '')));
    v_question_type := lower(trim(coalesce(v_item ->> 'question_type', '')));
    v_question_text := trim(coalesce(v_item ->> 'question_text', ''));
    v_correct_answer := trim(coalesce(v_item ->> 'correct_answer', ''));
    v_explanation := trim(coalesce(v_item ->> 'explanation', ''));
    v_options := coalesce(v_item -> 'options', '[]'::jsonb);
    v_taxonomy := v_item -> 'taxonomy_proposal';
    v_confidence := coalesce((v_item ->> 'extraction_confidence')::numeric, -1);

    if v_source_index < 1 or v_source_index > 50
       or v_subject not in (
         'Maths', 'Science', 'Biology', 'Chemistry', 'Physics', 'English',
         'Russian Language', 'Kyrgyz Language', 'German Language', 'Geography',
         'Global Perspective', 'Travel & Tourism', 'ICT'
       )
       or length(v_topic) not between 1 and 160
       or v_difficulty not in ('easy', 'medium', 'hard')
       or v_question_type not in ('multiple_choice', 'true_false', 'short_answer')
       or length(v_question_text) not between 5 and 4000
       or length(v_correct_answer) not between 1 and 2000
       or length(v_explanation) > 5000
       or v_confidence < 0 or v_confidence > 1 then
      raise exception using errcode = '22023', message = format('invalid_question_batch_item_%s', v_source_index);
    end if;

    if exists (
      select 1
      from private.teacher_current_teaching_groups(v_actor, v_extraction.school_id)
    ) then
      if not exists (
        select 1
        from private.teacher_current_teaching_groups(v_actor, v_extraction.school_id) g
        where private.teacher_assignment_subject_key(g.school_subject_name)
                = private.teacher_assignment_subject_key(v_subject)
           or private.teacher_assignment_subject_key(coalesce(g.academic_subject_name,''))
                = private.teacher_assignment_subject_key(v_subject)
      ) then
        raise exception using errcode = '42501', message = format('teacher_subject_not_assigned_%s', v_source_index);
      end if;
    elsif exists (
      select 1
      from public.class_teacher_assignments cta
      where cta.teacher_user_id = v_actor
        and cta.school_id = v_extraction.school_id
        and cta.active is distinct from false
    ) and not exists (
      select 1
      from public.class_teacher_assignments cta
      where cta.teacher_user_id = v_actor
        and cta.school_id = v_extraction.school_id
        and cta.active is distinct from false
        and private.teacher_assignment_subject_key(cta.subject)
          = private.teacher_assignment_subject_key(v_subject)
    ) then
      raise exception using errcode = '42501', message = format('teacher_subject_not_assigned_%s', v_source_index);
    end if;

    if jsonb_typeof(v_item -> 'eligible_grade_levels') <> 'array' then
      raise exception using errcode = '22023', message = format('grade_levels_required_at_item_%s', v_source_index);
    end if;
    select coalesce(array_agg(distinct value::smallint order by value::smallint), '{}'::smallint[])
      into v_grades
    from jsonb_array_elements_text(v_item -> 'eligible_grade_levels') grade(value)
    where value ~ '^[0-9]{1,2}$' and value::integer between 1 and 12;
    if cardinality(v_grades) < 1 then
      raise exception using errcode = '22023', message = format('grade_levels_required_at_item_%s', v_source_index);
    end if;

    if v_question_type = 'multiple_choice' then
      if jsonb_typeof(v_options) <> 'array'
         or jsonb_array_length(v_options) < 2
         or jsonb_array_length(v_options) > 6
         or exists (select 1 from jsonb_array_elements(v_options) option where jsonb_typeof(option) <> 'string')
         or (select count(*) from jsonb_array_elements_text(v_options))
            <> (select count(distinct lower(trim(value))) from jsonb_array_elements_text(v_options) option(value))
         or not exists (
           select 1 from jsonb_array_elements_text(v_options) option(value)
           where lower(trim(value)) = lower(v_correct_answer)
         ) then
        raise exception using errcode = '22023', message = format('invalid_multiple_choice_at_item_%s', v_source_index);
      end if;
    elsif v_question_type = 'true_false' then
      v_options := '["True", "False"]'::jsonb;
      if lower(v_correct_answer) not in ('true', 'false') then
        raise exception using errcode = '22023', message = format('invalid_true_false_at_item_%s', v_source_index);
      end if;
    else
      v_options := '[]'::jsonb;
    end if;

    if jsonb_typeof(v_taxonomy) <> 'object'
       or length(trim(coalesce(v_taxonomy ->> 'primary_skill_name', ''))) not between 3 and 160
       or length(trim(coalesce(v_taxonomy ->> 'atomic_subskill_name', ''))) not between 3 and 200
       or length(trim(coalesce(v_taxonomy ->> 'evidence_statement', ''))) not between 20 and 500
       or coalesce((v_taxonomy ->> 'confidence_score')::numeric, -1) < 0
       or coalesce((v_taxonomy ->> 'confidence_score')::numeric, -1) > 1 then
      raise exception using errcode = '22023', message = format('taxonomy_proposal_required_at_item_%s', v_source_index);
    end if;

    v_ao := upper(trim(coalesce(v_taxonomy ->> 'assessment_process_code', '')));
    v_cognitive := lower(trim(coalesce(v_taxonomy ->> 'cognitive_process', '')));
    if not (
      (v_ao = 'AO1' and v_cognitive in ('remember', 'understand'))
      or (v_ao = 'AO2' and v_cognitive = 'apply')
      or (v_ao = 'AO3' and v_cognitive = 'analyze')
      or (v_ao = 'AO4' and v_cognitive = 'evaluate')
    ) then
      raise exception using errcode = '22023', message = format('invalid_assessment_process_at_item_%s', v_source_index);
    end if;

    v_fingerprint := private.question_content_fingerprint(
      v_subject, v_topic, v_question_text, v_options, v_correct_answer, v_question_type
    );
    v_question_id := null;
    v_question_hash := null;

    insert into public.questions (
      teacher_id, subject, subject_id, topic, topic_name, difficulty,
      question_text, question_type, options, correct_answer, explanation,
      hints, time_limit, points, tags, grade_level, eligible_grade_levels,
      content_origin, verification_status, analytics_eligible, is_public,
      curriculum_review_status
    ) values (
      v_teacher.id,
      v_subject,
      nullif(trim(v_item ->> 'subject_id'), ''),
      v_topic,
      v_topic,
      v_difficulty,
      v_question_text,
      v_question_type,
      v_options,
      v_correct_answer,
      nullif(v_explanation, ''),
      '{}'::text[],
      greatest(10, least(coalesce((v_item ->> 'time_limit')::integer, 30), 1800)),
      greatest(1, least(coalesce((v_item ->> 'points')::integer,
        case v_difficulty when 'hard' then 20 when 'medium' then 15 else 10 end), 30)),
      array[
        trim(v_taxonomy ->> 'primary_skill_name'),
        trim(v_taxonomy ->> 'atomic_subskill_name'),
        v_ao
      ]::text[],
      array_to_string(v_grades, ','),
      v_grades,
      'teacher',
      'in_review',
      false,
      false,
      'in_review'
    ) on conflict (teacher_id, content_fingerprint)
      where content_origin = 'teacher' and is_active
      do nothing
    returning id, current_content_hash into v_question_id, v_question_hash;

    if v_question_id is not null then
      v_created := v_created + 1;
    else
      select q.id, q.current_content_hash
        into v_question_id, v_question_hash
      from public.questions q
      where q.teacher_id = v_teacher.id
        and q.content_origin = 'teacher'
        and q.is_active
        and q.content_fingerprint = v_fingerprint
      order by q.created_at
      limit 1;
    end if;

    if v_question_id is null or v_question_hash is null then
      raise exception using errcode = '23514', message = format('question_batch_item_not_persisted_%s', v_source_index);
    end if;

    insert into public.teacher_question_batch_items (
      batch_id, question_id, source_index, source_page,
      submitted_content_hash, question_snapshot, taxonomy_proposal,
      extraction_confidence, needs_human_attention
    ) values (
      v_batch_id,
      v_question_id,
      v_source_index,
      case when coalesce((v_item ->> 'source_page')::integer, 0) between 1 and 60
        then (v_item ->> 'source_page')::integer else null end,
      v_question_hash,
      jsonb_build_object(
        'subject', v_subject,
        'topic', v_topic,
        'difficulty', v_difficulty,
        'question_type', v_question_type,
        'question_text', v_question_text,
        'options', v_options,
        'correct_answer', v_correct_answer,
        'explanation', v_explanation,
        'eligible_grade_levels', to_jsonb(v_grades),
        'content_hash', v_question_hash
      ),
      v_taxonomy,
      v_confidence,
      coalesce((v_item ->> 'needs_human_attention')::boolean, true)
    );
  end loop;

  update public.teacher_question_batches
  set created_question_count = v_created,
      duplicate_question_count = v_count - v_created
  where id = v_batch_id;

  -- A narrowly scoped trigger below permits only this initial counter
  -- finalization. The batch and its evidence remain immutable afterward.

  return jsonb_build_object(
    'success', true,
    'batchId', v_batch_id,
    'status', 'in_review',
    'submitted', v_count,
    'created', v_created,
    'duplicatesSkipped', v_count - v_created,
    'academicProfileEligible', false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_student_academic_confidence(p_student_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_academic_subject_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := (select auth.uid());
  v_student_id uuid := coalesce(p_student_id, (select auth.uid()));
  v_school_id uuid;
  v_is_self boolean := false;
  v_is_admin boolean := false;
  v_is_head boolean := false;
  v_allowed_subjects text[] := array[]::text[];
  v_is_teacher boolean := false;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_student_id is null then raise exception 'Student is required'; end if;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  if v_school_id is null then raise exception 'Student is not attached to a school'; end if;

  v_is_self := v_caller = v_student_id;
  v_is_head := public.is_school_owner(v_school_id);
  select exists (
    select 1 from public.school_members sm
    where sm.school_id = v_school_id and sm.user_id = v_caller
      and sm.status = 'active' and sm.role_in_school = 'school_admin'
  ) into v_is_admin;
  select coalesce(array_agg(distinct allowed.subject_key),array[]::text[])
  into v_allowed_subjects
  from (
    select public.academic_normalize_subject_key(r.school_subject_name) as subject_key
    from private.teacher_current_teaching_roster(v_caller,v_school_id) r
    where r.student_id=v_student_id

    union

    select coalesce(
      nullif(r.academic_subject_code,''),
      public.academic_normalize_subject_key(r.academic_subject_name)
    ) as subject_key
    from private.teacher_current_teaching_roster(v_caller,v_school_id) r
    where r.student_id=v_student_id
      and (r.academic_subject_code is not null or r.academic_subject_name is not null)

    union

    select public.academic_normalize_subject_key(h.school_subject_name) as subject_key
    from private.teacher_historical_teaching_roster(v_caller,v_school_id,p_academic_year_id) h
    where p_academic_year_id is not null
      and h.student_id=v_student_id

    union

    select coalesce(
      nullif(h.academic_subject_code,''),
      public.academic_normalize_subject_key(h.academic_subject_name)
    ) as subject_key
    from private.teacher_historical_teaching_roster(v_caller,v_school_id,p_academic_year_id) h
    where p_academic_year_id is not null
      and h.student_id=v_student_id
      and (h.academic_subject_code is not null or h.academic_subject_name is not null)

    union

    select public.academic_normalize_subject_key(cta.subject) as subject_key
    from public.class_students cs
    join public.class_teacher_assignments cta
      on cta.class_id=cs.class_id
     and cta.school_id=v_school_id
     and cta.teacher_user_id=v_caller
     and cta.active
    where cs.student_id=v_student_id
      and not exists(
        select 1 from private.teacher_current_teaching_groups(v_caller,v_school_id)
      )
  ) allowed
  where nullif(trim(allowed.subject_key),'') is not null;
  v_is_teacher := cardinality(v_allowed_subjects) > 0;
  if not (v_is_self or v_is_admin or v_is_head or v_is_teacher) then
    raise exception 'Not authorized';
  end if;
  if p_academic_subject_id is not null and v_is_teacher
    and not (v_is_self or v_is_admin or v_is_head)
    and not exists (
      select 1 from public.academic_subjects s where s.id = p_academic_subject_id
        and (public.academic_normalize_subject_key(s.name) = any(v_allowed_subjects)
          or s.code = any(v_allowed_subjects))
    ) then raise exception 'Not authorized for requested subject';
  end if;

  select jsonb_build_object(
    'success', true,
    'studentId', v_student_id,
    'scope', jsonb_build_object('academicYearId', p_academic_year_id,
      'academicSubjectId', p_academic_subject_id,
      'viewer', case when v_is_self then 'student' when v_is_head then 'school_head'
        when v_is_admin then 'school_admin' else 'teacher' end),
    'summary', jsonb_build_object(
      'skillsTracked', count(*),
      'assessedSkills', count(*) filter (where c.assessment_state = 'assessed'),
      'lowDataSkills', count(*) filter (where c.assessment_state in ('not_assessed','low_data')),
      'staleSkills', count(*) filter (where c.assessment_state = 'stale'),
      'contradictorySkills', count(*) filter (where c.assessment_state = 'contradictory'),
      'teacherReviewRequired', count(*) filter (where c.teacher_review_required)
    ),
    'confidenceStates', coalesce(jsonb_agg(jsonb_build_object(
      'skillKey', c.skill_key, 'subject', c.subject, 'topic', c.topic,
      'skill', c.skill, 'subskill', c.subskill,
      'academicYearId', c.academic_year_id, 'academicSubjectId', c.academic_subject_id,
      'curriculumObjectiveId', c.curriculum_objective_id,
      'confidenceScore', c.confidence_score, 'confidenceBand', c.confidence_band,
      'assessmentState', c.assessment_state,
      'qualifyingObservations', c.qualifying_observations,
      'evidenceItems', c.evidence_items, 'sourceTypes', c.source_type_count,
      'sourceInstances', c.source_instance_count, 'evidenceAgeDays', c.evidence_age_days,
      'evidenceSpanDays', c.evidence_span_days,
      'decisionEligible', c.decision_eligible,
      'persistentEligible', c.persistent_eligible,
      'resolutionEligible', c.resolution_eligible,
      'strengthEligible', c.strength_eligible,
      'teacherReviewRequired', c.teacher_review_required,
      'gates', c.gate_results, 'disclosure', c.disclosure,
      'asOf', c.as_of_at, 'computedAt', c.computed_at
    ) order by c.subject, c.skill), '[]'::jsonb),
    'coverage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'academicYearId', x.academic_year_id, 'academicSubjectId', x.academic_subject_id,
        'gradeLevel', x.grade_level, 'curriculumScopeId', x.curriculum_scope_id,
        'mappingQuality', x.mapping_quality,
        'totalAssessableObjectives', x.total_assessable_objectives,
        'observedObjectives', x.observed_objectives,
        'qualifiedObjectives', x.qualified_objectives,
        'unassessedObjectives', x.unassessed_objectives,
        'lowDataObjectives', x.low_data_objectives,
        'focusObjectives', x.focus_objectives, 'strengthObjectives', x.strength_objectives,
        'outsideScopeObjectives', x.outside_scope_objectives,
        'unmappedSkillCount', x.unmapped_skill_count,
        'observedCoveragePercent', x.observed_coverage_percent,
        'qualifiedCoveragePercent', x.qualified_coverage_percent,
        'reportingReadiness', x.reporting_readiness,
        'disclosure', x.disclosure, 'asOf', x.as_of_at, 'computedAt', x.computed_at
      ) order by x.academic_year_id, x.academic_subject_id)
      from public.student_curriculum_coverage_states x
      join public.academic_subjects xs on xs.id = x.academic_subject_id
      where x.student_id = v_student_id
        and (p_academic_year_id is null or x.academic_year_id = p_academic_year_id)
        and (p_academic_subject_id is null or x.academic_subject_id = p_academic_subject_id)
        and (v_is_self or v_is_admin or v_is_head
          or xs.code = any(v_allowed_subjects)
          or public.academic_normalize_subject_key(xs.name) = any(v_allowed_subjects))
    ), '[]'::jsonb),
    'disclosure', jsonb_build_object(
      'confidenceIsEvidenceQualityNotAttainment', true,
      'coverageIsNotMastery', true,
      'unassessedObjectivesAreNotWeaknesses', true,
      'highStakesConclusionsRequireTeacherReview', true,
      'projectionFreshnessVisiblePerRecord', true
    )
  ) into v_result
  from public.student_learning_confidence_states c
  left join public.academic_subjects s on s.id = c.academic_subject_id
  where c.student_id = v_student_id
    and (p_academic_year_id is null or c.academic_year_id = p_academic_year_id)
    and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
    and (v_is_self or v_is_admin or v_is_head
      or public.academic_normalize_subject_key(c.subject) = any(v_allowed_subjects)
      or s.code = any(v_allowed_subjects));

  return coalesce(v_result, jsonb_build_object('success', true, 'studentId', v_student_id,
    'confidenceStates', '[]'::jsonb, 'coverage', '[]'::jsonb));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_academic_progress_experience_context(p_student_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_role text;
  v_viewer_name text;
  v_school record;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  if p_student_id is not null then
    select u.school_id into v_school_id from public.users u where u.id = p_student_id;
    if v_school_id is null then raise exception 'Student is not attached to a school'; end if;
  else
    select sm.school_id into v_school_id
    from public.school_members sm
    where sm.user_id = v_caller and sm.status = 'active' and sm.is_owner is true
    order by sm.joined_at desc nulls last
    limit 1;

    if v_school_id is null then
      select u.school_id into v_school_id from public.users u where u.id = v_caller;
    end if;

    if v_school_id is null then
      select sm.school_id into v_school_id
      from public.school_members sm
      where sm.user_id = v_caller and sm.status = 'active'
      order by sm.is_owner desc, sm.joined_at desc nulls last
      limit 1;
    end if;
  end if;

  if v_school_id is null then raise exception 'School context could not be resolved'; end if;

  if p_student_id is not null and v_caller = p_student_id then
    v_role := 'student';
  elsif public.is_school_owner(v_school_id) then
    v_role := 'school_head';
  elsif exists (
    select 1 from public.school_members sm
    where sm.school_id = v_school_id and sm.user_id = v_caller
      and sm.status = 'active' and sm.role_in_school = 'school_admin'
  ) then
    v_role := 'school_admin';
  elsif p_student_id is not null and exists (
    select 1
    from private.teacher_current_teaching_roster(v_caller,v_school_id) r
    where r.student_id=p_student_id
  ) then
    v_role := 'teacher';
  elsif p_student_id is null and exists (
    select 1 from private.teacher_current_teaching_groups(v_caller,v_school_id)
  ) then
    v_role := 'teacher';
  elsif p_student_id is not null
    and not exists(select 1 from private.teacher_current_teaching_groups(v_caller,v_school_id))
    and exists (
      select 1
      from public.class_students cs
      join public.class_teacher_assignments cta
        on cta.class_id=cs.class_id
       and cta.school_id=v_school_id
       and cta.teacher_user_id=v_caller
       and cta.active is true
      where cs.student_id=p_student_id
    ) then
    v_role := 'teacher';
  elsif p_student_id is null
    and not exists(select 1 from private.teacher_current_teaching_groups(v_caller,v_school_id))
    and exists (
      select 1 from public.class_teacher_assignments cta
      where cta.school_id=v_school_id and cta.teacher_user_id=v_caller and cta.active is true
    ) then
    v_role := 'teacher';
  elsif p_student_id is null and exists (
    select 1 from public.users u where u.id = v_caller and u.school_id = v_school_id
  ) then
    v_role := 'student';
  else
    raise exception 'Not authorised for this school progress context';
  end if;

  select coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Authorised user')
  into v_viewer_name
  from public.users u where u.id = v_caller;
  v_viewer_name := coalesce(v_viewer_name, 'Authorised user');

  select s.id, s.name, s.logo_url into v_school
  from public.schools s where s.id = v_school_id;

  return jsonb_build_object(
    'viewer', jsonb_build_object('id', v_caller, 'name', v_viewer_name, 'role', v_role),
    'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'logo_url', v_school.logo_url)
  );
end;
$function$
;

create or replace function public.rpc_school_admin_set_teaching_staff_status(
  p_school_id uuid,
  p_member_user_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_group_assignments integer:=0;
begin
  if not p_enabled then
    select count(*) into v_group_assignments
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g
      on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
    where gt.school_id=p_school_id
      and gt.teacher_user_id=p_member_user_id
      and gt.active;

    if v_group_assignments>0 then
      return jsonb_build_object(
        'success',false,
        'error',format('This person has %s active teaching group allocation(s). Reassign or remove them first.',v_group_assignments),
        'code','ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION',
        'assignment_count',v_group_assignments
      );
    end if;
  end if;

  return private.normalize_teacher_allocation_payload(
    public.rpc_school_admin_set_teaching_staff_status_legacy_assignment_vocabulary(
      p_school_id,p_member_user_id,p_enabled
    )
  );
end;
$function$;

create or replace function public.school_admin_transition_member_role(
  p_school_id uuid,
  p_member_user_id uuid,
  p_new_role text,
  p_keep_teaching boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_group_assignments integer:=0;
  v_new_can_teach boolean;
begin
  v_new_can_teach:=case
    when p_new_role='teacher' then true
    when p_new_role='school_admin' then p_keep_teaching
    else false
  end;

  if not v_new_can_teach then
    select count(*) into v_group_assignments
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g
      on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
    where gt.school_id=p_school_id
      and gt.teacher_user_id=p_member_user_id
      and gt.active;

    if v_group_assignments>0 then
      return jsonb_build_object(
        'success',false,
        'error',format('This person has %s active teaching group allocation(s). Reassign or remove them before disabling teaching access.',v_group_assignments),
        'code','ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION',
        'assignment_count',v_group_assignments
      );
    end if;
  end if;

  return private.normalize_teacher_allocation_payload(
    public.school_admin_transition_member_role_legacy_assignment_vocabulary(
      p_school_id,p_member_user_id,p_new_role,p_keep_teaching,p_reason
    )
  );
end;
$function$;

create or replace function public.remove_school_member(
  p_member_user_id uuid,
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_school_id uuid:=coalesce(p_school_id,public.my_school_id());
  v_group_assignments integer:=0;
begin
  select count(*) into v_group_assignments
  from public.school_subject_group_teachers gt
  join public.school_subject_groups g
    on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
  where gt.school_id=v_school_id
    and gt.teacher_user_id=p_member_user_id
    and gt.active;

  if v_group_assignments>0 then
    return jsonb_build_object(
      'success',false,
      'error',format('Reassign or remove this person''s %s active teaching group allocation(s) first.',v_group_assignments),
      'code','ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION',
      'assignment_count',v_group_assignments
    );
  end if;

  return private.normalize_teacher_allocation_payload(
    public.remove_school_member_legacy_assignment_vocabulary(p_member_user_id,v_school_id)
  );
end;
$function$;

revoke all on function public.rpc_teacher_submit_question_batch(uuid,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_submit_question_batch(uuid,jsonb)
to authenticated,service_role;

revoke all on function public.rpc_student_academic_confidence(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_confidence(uuid,uuid,uuid)
to authenticated,service_role;

revoke all on function public.rpc_academic_progress_experience_context(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_academic_progress_experience_context(uuid)
to authenticated,service_role;

revoke all on function public.rpc_school_admin_set_teaching_staff_status(uuid,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_set_teaching_staff_status(uuid,uuid,boolean)
to authenticated,service_role;

revoke all on function public.school_admin_transition_member_role(uuid,uuid,text,boolean,text)
from public,anon,authenticated,service_role;
grant execute on function public.school_admin_transition_member_role(uuid,uuid,text,boolean,text)
to authenticated,service_role;

revoke all on function public.remove_school_member(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.remove_school_member(uuid,uuid)
to authenticated,service_role;
