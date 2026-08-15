-- Carry reviewed visual descriptions through the governed student catalog.

drop function if exists public.get_all_active_questions(text,text,uuid,integer,integer);
create function public.get_all_active_questions(
  p_subject text default null, p_difficulty text default null,
  p_teacher_id uuid default null, p_limit integer default 500, p_offset integer default 0
)
returns table (
  id uuid, teacher_id uuid, subject text, subject_id text, topic text,
  topic_name text, difficulty text, question_text text, image_url text,
  image_alt_text text, question_type text, options jsonb, correct_answer text,
  explanation text, hints text[], time_limit integer, points integer, tags text[],
  grade_level text, is_public boolean, is_active boolean, times_answered integer,
  times_correct integer, created_at timestamptz, updated_at timestamptz,
  creator_name text, creator_school_id uuid, is_mine boolean, content_origin text,
  verification_status text, analytics_eligible boolean, verified_at timestamptz,
  verified_by uuid, verified_by_authority text, verified_content_hash text,
  current_content_hash text, content_version text, content_revision integer,
  eligible_grade_levels smallint[]
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_teacher uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id = v_actor;
  if v_teacher is null then raise exception using errcode = '42501', message = 'teacher_required'; end if;
  if p_teacher_id is not null and p_teacher_id <> v_teacher then
    raise exception using errcode = '42501', message = 'cannot_browse_another_teacher_pool';
  end if;
  return query
  select q.id, q.teacher_id, q.subject, q.subject_id, q.topic, q.topic_name,
    q.difficulty, q.question_text, q.image_url, q.image_alt_text,
    q.question_type, q.options, q.correct_answer, q.explanation, q.hints,
    q.time_limit, q.points, q.tags, q.grade_level, q.is_public, q.is_active,
    q.times_answered, q.times_correct, q.created_at, q.updated_at,
    case when q.content_origin = 'brain_heist' then 'Brains Heist' else coalesce(u.username, 'Teacher') end,
    case when q.content_origin = 'brain_heist' then null else u.school_id end,
    q.content_origin = 'teacher' and q.teacher_id = v_teacher,
    q.content_origin, q.verification_status, q.analytics_eligible, q.verified_at,
    q.verified_by, q.verified_by_authority, q.verified_content_hash,
    q.current_content_hash, q.content_version, q.content_revision,
    q.eligible_grade_levels
  from public.questions q
  left join public.teachers t on t.id = q.teacher_id
  left join public.users u on u.id = t.user_id
  where q.is_active
    and (p_subject is null or q.subject = p_subject)
    and (p_difficulty is null or q.difficulty = p_difficulty)
    and (
      (q.content_origin = 'brain_heist' and q.verification_status = 'verified'
        and q.analytics_eligible and q.is_public
        and q.current_content_hash = q.verified_content_hash)
      or (q.content_origin = 'teacher' and q.teacher_id = v_teacher)
    )
    and (p_teacher_id is null or q.teacher_id = v_teacher)
  order by q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.get_all_active_questions(text,text,uuid,integer,integer)
  to authenticated, service_role;

create or replace function public.rpc_student_learning_catalog(
  p_subject_code text default null, p_limit integer default 20
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid(); v_school uuid; v_year uuid;
  v_grade text; v_scope uuid; v_subject uuid;
begin
  if v_student is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select u.school_id into v_school from public.users u where u.id = v_student;
  if v_school is null then return jsonb_build_object('success', true, 'ready', false, 'code', 'school_required', 'questions', '[]'::jsonb); end if;

  select e.academic_year_id, e.grade_level into v_year, v_grade
  from public.student_academic_enrolments e
  join public.school_academic_years y on y.id = e.academic_year_id and y.status = 'current'
  where e.student_id = v_student and e.school_id = v_school
    and current_date between e.starts_on and coalesce(e.ends_on, current_date)
  order by e.starts_on desc, e.created_at desc limit 1;
  if v_year is null or v_grade is null then
    return jsonb_build_object('success', true, 'ready', false,
      'code', 'current_grade_enrolment_required', 'questions', '[]'::jsonb);
  end if;

  select m.curriculum_scope_id, m.academic_subject_id into v_scope, v_subject
  from public.school_curriculum_scope_mappings m
  join public.academic_subjects a on a.id = m.academic_subject_id
  where m.school_id = v_school and m.academic_year_id = v_year
    and m.grade_level = v_grade and m.status = 'active'
    and (a.code = public.academic_normalize_subject_key(p_subject_code) or a.id::text = p_subject_code)
    and (m.subject_requirement = 'required' or exists (
      select 1 from public.student_subject_enrolments se
      where se.student_id = v_student and se.academic_year_id = v_year
        and se.academic_subject_id = m.academic_subject_id and se.status = 'active'
        and current_date >= se.starts_on and (se.ends_on is null or current_date <= se.ends_on)
    )) limit 1;
  if v_scope is null then
    return jsonb_build_object('success', true, 'ready', true,
      'code', 'subject_not_enrolled', 'questions', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success', true, 'ready', true, 'academicYearId', v_year,
    'gradeLevel', v_grade, 'scopeId', v_scope,
    'questions', coalesce((
      select jsonb_agg(question_row.payload order by random()) from (
        select jsonb_build_object(
          'id', q.id, 'teacher_id', q.teacher_id, 'subject', a.name,
          'subject_id', a.code, 'topic', q.topic, 'topic_name', q.topic_name,
          'difficulty', q.difficulty, 'question_text', q.question_text,
          'image_url', q.image_url, 'image_alt_text', q.image_alt_text,
          'question_type', q.question_type, 'options', q.options,
          'correct_answer', q.correct_answer, 'explanation', q.explanation,
          'hints', to_jsonb(q.hints), 'time_limit', q.time_limit,
          'points', q.points, 'tags', to_jsonb(q.tags),
          'grade_level', v_grade, 'is_public', q.is_public, 'is_active', q.is_active,
          'times_answered', q.times_answered, 'times_correct', q.times_correct,
          'created_at', q.created_at, 'updated_at', q.updated_at,
          'content_origin', q.content_origin, 'verification_status', q.verification_status,
          'analytics_eligible', q.analytics_eligible,
          'curriculum', jsonb_build_object(
            'objectiveId', o.id, 'objectiveCode', o.code, 'objective', o.statement,
            'scopeId', im.curriculum_scope_id, 'confidence', im.confidence_score,
            'mappingRole', im.mapping_role
          )
        ) payload
        from public.curriculum_item_objective_mappings im
        join public.curriculum_assessment_items i on i.id = im.assessment_item_id
          and i.is_active and i.source_type = 'question_bank'
        join public.questions q on q.id::text = i.source_record_id
          and q.is_active and q.is_public and q.content_origin = 'brain_heist'
          and q.verification_status = 'verified' and q.analytics_eligible
          and q.current_content_hash = q.verified_content_hash
          and i.content_hash = q.verified_content_hash
        join public.curriculum_objectives o on o.id = im.curriculum_objective_id
        join public.curriculum_framework_versions fv on fv.id = im.framework_version_id
          and fv.status = 'published'
        join public.academic_subjects a on a.id = i.academic_subject_id
        where im.curriculum_scope_id = v_scope and im.academic_subject_id = v_subject
          and im.status = 'approved' and im.mapping_role = 'primary'
          and im.item_content_hash = i.content_hash
          and im.curriculum_version_content_hash = fv.content_hash
        order by random() limit greatest(1, least(coalesce(p_limit, 20), 500))
      ) question_row
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_student_learning_catalog(text,integer)
  from public, anon, authenticated;
grant execute on function public.rpc_student_learning_catalog(text,integer)
  to authenticated, service_role;
