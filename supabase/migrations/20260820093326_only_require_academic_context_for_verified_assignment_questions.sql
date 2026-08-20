create or replace function private.assert_assignment_verified_question_scope_coverage(
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments%rowtype;
  v_grades text[] := '{}'::text[];
  v_grade text;
  v_question record;
  v_question_count integer := 0;
  v_brains_heist_question_count integer := 0;
begin
  select * into v_assignment
  from public.assignments a
  where a.id = p_assignment_id;
  if not found then return; end if;

  if coalesce(v_assignment.publish_status, 'published') = 'draft' then
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (where q.content_origin = 'brain_heist')::integer
  into v_question_count, v_brains_heist_question_count
  from public.assignment_questions aq
  join public.questions q on q.id = aq.question_id
  where aq.assignment_id = p_assignment_id;

  if v_question_count = 0 then
    raise exception using errcode = '23514', message = 'published_assignment_requires_questions';
  end if;

  -- Teacher/My Pool questions are classroom-only and intentionally excluded
  -- from official Academic Profile evidence. They must remain publishable even
  -- when a school has not configured an academic year/curriculum yet.
  if v_brains_heist_question_count = 0 then
    return;
  end if;

  -- From this point onward the assignment contains official Brains Heist
  -- Verified content, so governed academic context is mandatory.
  if v_assignment.school_id is null
     or v_assignment.academic_year_id is null
     or v_assignment.academic_subject_id is null then
    raise exception using
      errcode = '23514',
      message = 'assignment_academic_context_required_for_verified_evidence';
  end if;

  if nullif(trim(v_assignment.grade_level_snapshot), '') is not null then
    v_grades := array[v_assignment.grade_level_snapshot];
  else
    select coalesce(array_agg(distinct c.grade_level order by c.grade_level), '{}'::text[])
    into v_grades
    from public.student_assignments sa
    join public.classes c
      on c.school_id = v_assignment.school_id
     and upper(regexp_replace(trim(c.class_code), '\s+', '', 'g'))
       = upper(regexp_replace(trim(coalesce(sa.batch, '')), '\s+', '', 'g'))
    where sa.assignment_id = p_assignment_id
      and nullif(trim(c.grade_level), '') is not null;
  end if;

  if cardinality(v_grades) = 0 then
    raise exception using
      errcode = '23514',
      message = 'assignment_grade_context_required_for_verified_evidence';
  end if;

  for v_question in
    select q.id, q.content_origin, q.verification_status, q.analytics_eligible,
           q.is_public, q.is_active, q.current_content_hash, q.verified_content_hash,
           q.eligible_grade_levels, q.academic_subject_id
    from public.assignment_questions aq
    join public.questions q on q.id = aq.question_id
    where aq.assignment_id = p_assignment_id
  loop
    if v_question.content_origin <> 'brain_heist' then
      continue;
    end if;

    if v_question.verification_status <> 'verified'
       or not coalesce(v_question.analytics_eligible, false)
       or not coalesce(v_question.is_public, false)
       or not coalesce(v_question.is_active, false)
       or v_question.current_content_hash is null
       or v_question.verified_content_hash is null
       or v_question.current_content_hash <> v_question.verified_content_hash then
      raise exception using
        errcode = '23514',
        message = 'assignment_contains_non_authoritative_brains_heist_question',
        detail = 'question_id=' || v_question.id::text;
    end if;

    foreach v_grade in array v_grades loop
      if v_grade !~ '^[0-9]+$'
         or v_question.eligible_grade_levels is null
         or not (v_grade::smallint = any(v_question.eligible_grade_levels)) then
        raise exception using
          errcode = '23514',
          message = 'verified_question_not_eligible_for_assignment_grade',
          detail = 'question_id=' || v_question.id::text || '; grade=' || coalesce(v_grade, 'unknown');
      end if;

      if not private.verified_question_has_curriculum_mapping(
        v_question.id,
        v_assignment.school_id,
        v_assignment.academic_year_id,
        v_grade,
        v_assignment.academic_subject_id
      ) then
        raise exception using
          errcode = '23514',
          message = 'verified_question_not_mapped_for_assignment_curriculum',
          detail = 'question_id=' || v_question.id::text || '; grade=' || v_grade;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function private.assert_assignment_verified_question_scope_coverage(uuid) from public, anon, authenticated;
