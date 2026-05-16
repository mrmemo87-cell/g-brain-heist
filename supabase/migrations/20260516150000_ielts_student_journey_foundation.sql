-- Phase 3 IELTS Journey Dashboard foundation.
-- Returns student-safe readiness metadata from existing attempt, exam, and
-- assignment tables. This migration does not modify Exam Mode behavior.

create or replace function public.rpc_ielts_student_journey(p_student_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := coalesce(p_student_id, auth.uid());
  v_student_school_id uuid;
  v_actor_id uuid := auth.uid();
  v_can_view boolean := false;
  v_reading numeric;
  v_listening numeric;
  v_writing numeric;
  v_speaking numeric;
  v_overall numeric;
  v_estimate_count int := 0;
  v_recent_practice jsonb := '[]'::jsonb;
  v_recent_exam_submissions jsonb := '[]'::jsonb;
  v_assigned_summary jsonb := jsonb_build_object('total', 0, 'assigned', 0, 'in_progress', 0, 'completed', 0, 'overdue', 0);
  v_assigned_total int := 0;
  v_activity_count int := 0;
  v_confidence text := 'low';
  v_weak_skill text;
  v_next_recommendation text;
  v_has_user_id boolean;
  v_band_column text;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;
  if v_student_id is null then raise exception 'student_required'; end if;

  select u.school_id into v_student_school_id
  from public.users u
  where u.id = v_student_id;

  v_can_view := v_student_id = v_actor_id;

  if not v_can_view and v_student_school_id is not null then
    select exists (
      select 1
      from public.users u
      where u.id = v_actor_id
        and (
          coalesce(u.is_admin, false) = true
          or coalesce(u.role, '') in ('admin', 'superadmin')
          or (coalesce(u.role, '') = 'school_admin' and u.school_id = v_student_school_id)
        )
    ) or exists (
      select 1
      from public.school_members sm
      where sm.school_id = v_student_school_id
        and sm.user_id = v_actor_id
        and sm.status = 'active'
        and sm.role_in_school in ('school_admin', 'admin', 'superadmin')
    ) or exists (
      select 1
      from public.classes c
      join public.class_teacher_assignments cta on cta.class_id = c.id
      join public.class_students cs on cs.class_id = c.id
      where c.school_id = v_student_school_id
        and coalesce(c.is_active, true) = true
        and cta.teacher_user_id = v_actor_id
        and coalesce(cta.active, true) = true
        and cs.student_id = v_student_id
    ) into v_can_view;
  end if;

  if not v_can_view then raise exception 'forbidden'; end if;

  if to_regclass('public.ielts_reading_attempts') is not null then
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'user_id') into v_has_user_id;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'est_band') then 'est_band'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'estimated_band') then 'estimated_band'
      else null
    end into v_band_column;
    if v_has_user_id and v_band_column is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'started_at') then
      execute format('select %I::numeric from public.ielts_reading_attempts where user_id = $1 and %I is not null order by started_at desc limit 1', v_band_column, v_band_column) into v_reading using v_student_id;
      execute format($sql$
        select coalesce(jsonb_agg(jsonb_build_object(
          'source', 'practice', 'skill', 'reading', 'id', id, 'content_id', set_id,
          'occurred_at', coalesce(completed_at, started_at), 'score_percent', percent, 'estimated_band', %I
        ) order by started_at desc), '[]'::jsonb)
        from (select * from public.ielts_reading_attempts where user_id = $1 order by started_at desc limit 5) r
      $sql$, v_band_column) into v_recent_practice using v_student_id;
    end if;
  end if;

  if to_regclass('public.ielts_listening_attempts') is not null then
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'user_id') into v_has_user_id;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'est_band') then 'est_band'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'estimated_band') then 'estimated_band'
      else null
    end into v_band_column;
    if v_has_user_id and v_band_column is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'started_at') then
      execute format('select %I::numeric from public.ielts_listening_attempts where user_id = $1 and %I is not null order by started_at desc limit 1', v_band_column, v_band_column) into v_listening using v_student_id;
      execute format($sql$
        select $2 || coalesce(jsonb_agg(jsonb_build_object(
          'source', 'practice', 'skill', 'listening', 'id', id, 'content_id', set_id,
          'occurred_at', coalesce(completed_at, started_at), 'score_percent', percent, 'estimated_band', %I
        ) order by started_at desc), '[]'::jsonb)
        from (select * from public.ielts_listening_attempts where user_id = $1 order by started_at desc limit 5) l
      $sql$, v_band_column) into v_recent_practice using v_student_id, v_recent_practice;
    end if;
  end if;

  if to_regclass('public.ielts_writing_attempts') is not null then
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_writing_attempts' and column_name = 'user_id') into v_has_user_id;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_writing_attempts' and column_name = 'band_overall') then 'band_overall'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_writing_attempts' and column_name = 'band_score') then 'band_score'
      else null
    end into v_band_column;
    if v_has_user_id and v_band_column is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_writing_attempts' and column_name = 'submitted_at') then
      execute format('select %I::numeric from public.ielts_writing_attempts where user_id = $1 and %I is not null order by submitted_at desc limit 1', v_band_column, v_band_column) into v_writing using v_student_id;
      execute format($sql$
        select $2 || coalesce(jsonb_agg(jsonb_build_object(
          'source', 'practice', 'skill', 'writing', 'id', id, 'content_id', task_id,
          'occurred_at', submitted_at, 'estimated_band', %I
        ) order by submitted_at desc), '[]'::jsonb)
        from (select * from public.ielts_writing_attempts where user_id = $1 order by submitted_at desc limit 5) w
      $sql$, v_band_column) into v_recent_practice using v_student_id, v_recent_practice;
    end if;
  end if;

  if to_regclass('public.ielts_speaking_attempts') is not null then
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_speaking_attempts' and column_name = 'user_id') into v_has_user_id;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_speaking_attempts' and column_name = 'band_overall') then 'band_overall'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_speaking_attempts' and column_name = 'band_score') then 'band_score'
      else null
    end into v_band_column;
    if v_has_user_id and v_band_column is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_speaking_attempts' and column_name = 'submitted_at') then
      execute format('select %I::numeric from public.ielts_speaking_attempts where user_id = $1 and %I is not null order by submitted_at desc limit 1', v_band_column, v_band_column) into v_speaking using v_student_id;
      execute format($sql$
        select $2 || coalesce(jsonb_agg(jsonb_build_object(
          'source', 'practice', 'skill', 'speaking', 'id', id, 'content_id', task_id,
          'occurred_at', submitted_at, 'estimated_band', %I
        ) order by submitted_at desc), '[]'::jsonb)
        from (select * from public.ielts_speaking_attempts where user_id = $1 order by submitted_at desc limit 5) s
      $sql$, v_band_column) into v_recent_practice using v_student_id, v_recent_practice;
    end if;
  end if;

  select count(*) filter (where value is not null), round(avg(value)::numeric, 1)
  into v_estimate_count, v_overall
  from (values (v_reading), (v_listening), (v_writing), (v_speaking)) estimates(value);

  select skill into v_weak_skill
  from (values ('reading', v_reading), ('listening', v_listening), ('writing', v_writing), ('speaking', v_speaking)) skills(skill, value)
  where value is not null
  order by value asc
  limit 1;

  select coalesce(jsonb_agg(value order by (value->>'occurred_at')::timestamptz desc), '[]'::jsonb)
  into v_recent_practice
  from (select value from jsonb_array_elements(v_recent_practice) value order by (value->>'occurred_at')::timestamptz desc limit 5) recent;

  if to_regclass('public.ielts_exam_submissions') is not null and to_regclass('public.ielts_exam_attempts') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_exam_submissions' and column_name = 'student_id') then
      select coalesce(jsonb_agg(jsonb_build_object(
        'source', 'exam_mode',
        'submission_id', s.id,
        'attempt_id', s.attempt_id,
        'submitted_at', s.submitted_at,
        'grading_status', s.grading_status,
        'attempt_status', a.status,
        'exam_event_id', a.exam_event_id
      ) order by s.submitted_at desc), '[]'::jsonb)
      into v_recent_exam_submissions
      from (
        select * from public.ielts_exam_submissions
        where student_id = v_student_id
        order by submitted_at desc
        limit 5
      ) s
      left join public.ielts_exam_attempts a on a.id = s.attempt_id;
    end if;
  end if;

  if to_regclass('public.ielts_practice_assignment_students') is not null then
    select jsonb_build_object(
      'total', coalesce(count(s.id), 0),
      'assigned', coalesce(count(s.id) filter (where s.status = 'assigned'), 0),
      'in_progress', coalesce(count(s.id) filter (where s.status = 'in_progress'), 0),
      'completed', coalesce(count(s.id) filter (where s.status = 'completed'), 0),
      'overdue', coalesce(count(s.id) filter (where s.status = 'overdue' or (a.due_at is not null and a.due_at < now() and s.status not in ('completed', 'excused'))), 0)
    ), count(s.id)
    into v_assigned_summary, v_assigned_total
    from public.ielts_practice_assignment_students s
    left join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = v_student_id;
  end if;

  v_activity_count := coalesce(jsonb_array_length(v_recent_practice), 0) + coalesce(jsonb_array_length(v_recent_exam_submissions), 0);
  v_confidence := case
    when v_estimate_count >= 3 and v_activity_count >= 5 then 'high'
    when v_estimate_count >= 1 or v_activity_count >= 2 or v_assigned_total > 0 then 'medium'
    else 'low'
  end;

  v_next_recommendation := case
    when v_weak_skill is not null then 'Focus your next practice on ' || v_weak_skill || ' to improve your estimated readiness.'
    when v_assigned_total > 0 then 'Open your assigned IELTS practice and complete the next pending task.'
    else 'Complete a reading or listening practice set to start building your readiness estimate.'
  end;

  return jsonb_build_object(
    'student_id', v_student_id,
    'target_band', null,
    'current_estimates', jsonb_build_object(
      'reading', v_reading,
      'listening', v_listening,
      'writing', v_writing,
      'speaking', v_speaking,
      'overall', v_overall
    ),
    'confidence_level', v_confidence,
    'recent_practice', v_recent_practice,
    'recent_exam_mode_submissions', v_recent_exam_submissions,
    'assigned_practice_summary', coalesce(v_assigned_summary, jsonb_build_object('total', 0, 'assigned', 0, 'in_progress', 0, 'completed', 0, 'overdue', 0)),
    'weak_skill', v_weak_skill,
    'next_recommendation', v_next_recommendation
  );
end;
$$;

grant execute on function public.rpc_ielts_student_journey(uuid) to authenticated;
