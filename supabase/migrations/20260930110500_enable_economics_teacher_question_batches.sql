-- Make the governed teacher PDF question-batch workflow registry-driven.
-- Any active subject alias backed by a published canonical registry is allowed;
-- teacher/school subject assignment checks still enforce actual scope.

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
       or not exists (
         select 1
         from public.academic_skill_registry_subject_aliases subject_alias
         join public.academic_skill_registry_versions subject_registry
           on subject_registry.id = subject_alias.registry_version_id
          and subject_registry.status = 'published'
         where subject_alias.alias_normalized = lower(trim(v_subject))
           and subject_alias.status = 'active'
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

revoke all on function public.rpc_teacher_submit_question_batch(uuid,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_submit_question_batch(uuid,jsonb)
to authenticated,service_role;

