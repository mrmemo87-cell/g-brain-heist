-- Phase 4 IELTS Readiness Engine foundation.
-- Converts existing practice attempt data into student-safe estimated readiness
-- values. This migration intentionally does not modify Exam Mode behavior, does
-- not create advanced analytics/reports, and never exposes protected answer data.

create or replace function public.ielts_estimated_readiness_band(p_raw_score numeric, p_total_questions numeric, p_percent numeric default null)
returns numeric
language sql
immutable
as $$
  with normalized as (
    select case
      when p_percent is not null and p_percent between 0 and 100 then p_percent
      when p_raw_score is not null and p_total_questions is not null and p_total_questions > 0 then (greatest(p_raw_score, 0) / p_total_questions) * 100
      else null
    end as pct
  )
  select case
    when pct is null then null::numeric
    when pct >= 97.5 then 9.0
    when pct >= 90 then 8.0
    when pct >= 80 then 7.0
    when pct >= 65 then 6.0
    when pct >= 50 then 5.0
    when pct >= 35 then 4.0
    when pct >= 22.5 then 3.0
    when pct >= 10 then 2.0
    when pct > 0 then 1.0
    else null::numeric
  end
  from normalized;
$$;

create or replace function public.ielts_latest_skill_readiness(p_student_id uuid)
returns table (
  skill text,
  estimated_band numeric,
  source_type text,
  source_id text,
  confidence text,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_column text;
  v_band_column text;
  v_raw_column text;
  v_total_column text;
  v_percent_column text;
  v_time_column text;
  v_id_column text;
  v_skill text;
begin
  if p_student_id is null then
    raise exception 'student_required';
  end if;

  create temporary table if not exists tmp_ielts_latest_skill_readiness (
    skill text,
    estimated_band numeric,
    source_type text,
    source_id text,
    confidence text,
    last_activity_at timestamptz
  ) on commit drop;
  truncate tmp_ielts_latest_skill_readiness;

  -- Reading: prefer existing estimated band columns, otherwise conservatively map percent/raw+total.
  if to_regclass('public.ielts_reading_attempts') is not null then
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'user_id') then 'user_id'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'profile_id') then 'profile_id'
      else null
    end into v_user_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'est_band') then 'est_band'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'estimated_band') then 'estimated_band'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'band_estimate') then 'band_estimate'
      else null
    end into v_band_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'raw_score') then 'raw_score'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'score_raw') then 'score_raw'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'score') then 'score'
      else null
    end into v_raw_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'total_questions') then 'total_questions'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'question_count') then 'question_count'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'total') then 'total'
      else null
    end into v_total_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'percent') then 'percent'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'score_percentage') then 'score_percentage'
      else null
    end into v_percent_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'completed_at') then 'completed_at'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'started_at') then 'started_at'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'created_at') then 'created_at'
      else null
    end into v_time_column;
    select case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_reading_attempts' and column_name = 'id') then 'id' else null end into v_id_column;

    if v_user_column is not null and v_time_column is not null and v_id_column is not null and (v_band_column is not null or v_percent_column is not null or (v_raw_column is not null and v_total_column is not null)) then
      execute format($sql$
        insert into tmp_ielts_latest_skill_readiness(skill, estimated_band, source_type, source_id, confidence, last_activity_at)
        select 'reading', estimate, source_type, source_id, confidence, last_at
        from (
          select raw_estimate as estimate,
            'practice'::text as source_type,
            id_value as source_id,
            case when band_value is not null then 'high' else 'medium' end as confidence,
            last_at
          from (
            select %1$I::text as id_value,
              %2$I as last_at,
              %3$s as band_value,
              coalesce(%3$s, public.ielts_estimated_readiness_band(%4$s, %5$s, %6$s)) as raw_estimate,
              %4$s as raw_score,
              %5$s as total_questions,
              %6$s as percent_score
            from public.ielts_reading_attempts
            where %7$I = $1
            order by %2$I desc nulls last
          ) src
          cross join lateral (select src.raw_estimate as estimate) e
          where e.estimate is not null
          order by last_at desc nulls last
          limit 1
        ) latest
      $sql$,
        v_id_column,
        v_time_column,
        coalesce(format('%I::numeric', v_band_column), 'null::numeric'),
        coalesce(format('%I::numeric', v_raw_column), 'null::numeric'),
        coalesce(format('%I::numeric', v_total_column), 'null::numeric'),
        coalesce(format('%I::numeric', v_percent_column), 'null::numeric'),
        v_user_column
      ) using p_student_id;
    end if;
  end if;

  -- Listening: same conservative handling as reading.
  if to_regclass('public.ielts_listening_attempts') is not null then
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'user_id') then 'user_id'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'profile_id') then 'profile_id'
      else null
    end into v_user_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'est_band') then 'est_band'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'estimated_band') then 'estimated_band'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'band_estimate') then 'band_estimate'
      else null
    end into v_band_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'raw_score') then 'raw_score'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'score_raw') then 'score_raw'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'score') then 'score'
      else null
    end into v_raw_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'total_questions') then 'total_questions'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'question_count') then 'question_count'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'total') then 'total'
      else null
    end into v_total_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'percent') then 'percent'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'score_percentage') then 'score_percentage'
      else null
    end into v_percent_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'completed_at') then 'completed_at'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'started_at') then 'started_at'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'created_at') then 'created_at'
      else null
    end into v_time_column;
    select case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_listening_attempts' and column_name = 'id') then 'id' else null end into v_id_column;

    if v_user_column is not null and v_time_column is not null and v_id_column is not null and (v_band_column is not null or v_percent_column is not null or (v_raw_column is not null and v_total_column is not null)) then
      execute format($sql$
        insert into tmp_ielts_latest_skill_readiness(skill, estimated_band, source_type, source_id, confidence, last_activity_at)
        select 'listening', estimate, source_type, source_id, confidence, last_at
        from (
          select raw_estimate as estimate,
            'practice'::text as source_type,
            id_value as source_id,
            case when band_value is not null then 'high' else 'medium' end as confidence,
            last_at
          from (
            select %1$I::text as id_value,
              %2$I as last_at,
              %3$s as band_value,
              coalesce(%3$s, public.ielts_estimated_readiness_band(%4$s, %5$s, %6$s)) as raw_estimate,
              %4$s as raw_score,
              %5$s as total_questions,
              %6$s as percent_score
            from public.ielts_listening_attempts
            where %7$I = $1
            order by %2$I desc nulls last
          ) src
          cross join lateral (select src.raw_estimate as estimate) e
          where e.estimate is not null
          order by last_at desc nulls last
          limit 1
        ) latest
      $sql$,
        v_id_column,
        v_time_column,
        coalesce(format('%I::numeric', v_band_column), 'null::numeric'),
        coalesce(format('%I::numeric', v_raw_column), 'null::numeric'),
        coalesce(format('%I::numeric', v_total_column), 'null::numeric'),
        coalesce(format('%I::numeric', v_percent_column), 'null::numeric'),
        v_user_column
      ) using p_student_id;
    end if;
  end if;

  -- Writing/speaking: only use existing human/rubric/estimated band fields. No AI grading.
  foreach v_skill in array array['writing','speaking'] loop
    v_band_column := null; v_time_column := null; v_user_column := null; v_id_column := null;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'user_id') then 'user_id'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'profile_id') then 'profile_id'
      else null
    end into v_user_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'band_overall') then 'band_overall'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'band_score') then 'band_score'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'estimated_band') then 'estimated_band'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'rubric_band') then 'rubric_band'
      else null
    end into v_band_column;
    select case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'submitted_at') then 'submitted_at'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'created_at') then 'created_at'
      else null
    end into v_time_column;
    select case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = format('ielts_%s_attempts', v_skill) and column_name = 'id') then 'id' else null end into v_id_column;

    if to_regclass(format('public.ielts_%s_attempts', v_skill)) is not null and v_user_column is not null and v_band_column is not null and v_time_column is not null and v_id_column is not null then
      execute format($sql$
        insert into tmp_ielts_latest_skill_readiness(skill, estimated_band, source_type, source_id, confidence, last_activity_at)
        select %1$L, %2$I::numeric, 'practice'::text, %3$I::text, 'high'::text, %4$I
        from public.%5$I
        where %6$I = $1 and %2$I is not null
        order by %4$I desc nulls last
        limit 1
      $sql$, v_skill, v_band_column, v_id_column, v_time_column, format('ielts_%s_attempts', v_skill), v_user_column) using p_student_id;
    end if;
  end loop;

  return query
  select r.skill, r.estimated_band, r.source_type, r.source_id, r.confidence, r.last_activity_at
  from tmp_ielts_latest_skill_readiness r
  order by case r.skill when 'reading' then 1 when 'listening' then 2 when 'writing' then 3 when 'speaking' then 4 else 5 end;
end;
$$;

grant execute on function public.ielts_latest_skill_readiness(uuid) to authenticated;
grant execute on function public.ielts_estimated_readiness_band(numeric, numeric, numeric) to authenticated;

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
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;
  if v_student_id is null then raise exception 'student_required'; end if;

  select u.school_id into v_student_school_id from public.users u where u.id = v_student_id;
  v_can_view := v_student_id = v_actor_id;

  if not v_can_view and v_student_school_id is not null then
    select exists (
      select 1 from public.users u
      where u.id = v_actor_id and (
        coalesce(u.is_admin, false) = true or coalesce(u.role, '') in ('admin', 'superadmin') or (coalesce(u.role, '') = 'school_admin' and u.school_id = v_student_school_id)
      )
    ) or exists (
      select 1 from public.school_members sm
      where sm.school_id = v_student_school_id and sm.user_id = v_actor_id and sm.status = 'active' and sm.role_in_school in ('school_admin', 'admin', 'superadmin')
    ) or exists (
      select 1 from public.classes c
      join public.class_teacher_assignments cta on cta.class_id = c.id
      join public.class_students cs on cs.class_id = c.id
      where c.school_id = v_student_school_id and coalesce(c.is_active, true) = true and cta.teacher_user_id = v_actor_id and coalesce(cta.active, true) = true and cs.student_id = v_student_id
    ) into v_can_view;
  end if;

  if not v_can_view then raise exception 'forbidden'; end if;

  select max(estimated_band) filter (where skill = 'reading'),
         max(estimated_band) filter (where skill = 'listening'),
         max(estimated_band) filter (where skill = 'writing'),
         max(estimated_band) filter (where skill = 'speaking')
  into v_reading, v_listening, v_writing, v_speaking
  from public.ielts_latest_skill_readiness(v_student_id);

  select count(*) filter (where value is not null), round(avg(value)::numeric, 1)
  into v_estimate_count, v_overall
  from (values (v_reading), (v_listening), (v_writing), (v_speaking)) estimates(value);

  select skill into v_weak_skill
  from (values ('reading', v_reading), ('listening', v_listening), ('writing', v_writing), ('speaking', v_speaking)) skills(skill, value)
  where value is not null
  order by value asc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source', source_type,
    'skill', skill,
    'id', source_id,
    'occurred_at', last_activity_at,
    'estimated_band', estimated_band,
    'confidence', confidence
  ) order by last_activity_at desc nulls last), '[]'::jsonb)
  into v_recent_practice
  from (select * from public.ielts_latest_skill_readiness(v_student_id) order by last_activity_at desc nulls last limit 5) r;

  if to_regclass('public.ielts_exam_submissions') is not null and to_regclass('public.ielts_exam_attempts') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_exam_submissions' and column_name = 'student_id') then
      select coalesce(jsonb_agg(jsonb_build_object(
        'source', 'exam_mode', 'submission_id', s.id, 'attempt_id', s.attempt_id,
        'submitted_at', s.submitted_at, 'grading_status', s.grading_status,
        'attempt_status', a.status, 'exam_event_id', a.exam_event_id
      ) order by s.submitted_at desc), '[]'::jsonb)
      into v_recent_exam_submissions
      from (select * from public.ielts_exam_submissions where student_id = v_student_id order by submitted_at desc limit 5) s
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
    'current_estimates', jsonb_build_object('reading', v_reading, 'listening', v_listening, 'writing', v_writing, 'speaking', v_speaking, 'overall', v_overall),
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

create or replace function public.rpc_ielts_school_results(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_student_id uuid default null,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_school_id uuid;
  v_actor_school_id uuid;
  v_is_manager boolean := false;
  v_is_teacher boolean := false;
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_summary jsonb;
  v_students jsonb;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;

  select u.school_id into v_actor_school_id from public.users u where u.id = v_actor_id;
  v_school_id := coalesce(p_school_id, v_actor_school_id);
  if v_school_id is null and p_student_id is not null then
    select u.school_id into v_school_id from public.users u where u.id = p_student_id;
  end if;
  if v_school_id is null then raise exception 'school_required'; end if;

  select exists (
    select 1 from public.users u
    where u.id = v_actor_id and (
      coalesce(u.is_admin, false) = true or coalesce(u.role, '') in ('admin', 'superadmin') or (coalesce(u.role, '') = 'school_admin' and u.school_id = v_school_id)
    )
  ) or exists (
    select 1 from public.school_members sm
    where sm.school_id = v_school_id and sm.user_id = v_actor_id and sm.status = 'active' and sm.role_in_school in ('school_admin', 'admin', 'superadmin')
  ) into v_is_manager;

  if not v_is_manager then
    select exists (
      select 1 from public.classes c
      join public.class_teacher_assignments cta on cta.class_id = c.id
      where c.school_id = v_school_id and coalesce(c.is_active, true) = true and cta.teacher_user_id = v_actor_id and coalesce(cta.active, true) = true and (p_class_id is null or c.id = p_class_id)
    ) into v_is_teacher;
  end if;

  if not (v_is_manager or v_is_teacher) then raise exception 'forbidden'; end if;

  create temporary table if not exists tmp_ielts_school_results_students (
    student_id uuid primary key,
    username text,
    email text,
    class_id uuid,
    class_name text,
    assigned_practice_total int default 0,
    completed_practice_total int default 0,
    latest_reading_estimate numeric,
    latest_listening_estimate numeric,
    latest_writing_estimate numeric,
    latest_speaking_estimate numeric,
    latest_overall_estimate numeric,
    last_activity_at timestamptz
  ) on commit drop;
  truncate tmp_ielts_school_results_students;

  if v_is_manager then
    insert into tmp_ielts_school_results_students (student_id, username, email, class_id, class_name)
    select distinct on (u.id) u.id, u.username, u.email, c.id, c.class_name
    from public.users u
    left join public.class_students cs on cs.student_id = u.id
    left join public.classes c on c.id = cs.class_id and c.school_id = v_school_id and coalesce(c.is_active, true)
    where u.school_id = v_school_id and coalesce(u.role, 'student') = 'student' and (p_class_id is null or c.id = p_class_id) and (p_student_id is null or u.id = p_student_id)
    order by u.id, c.class_name nulls last
    limit v_limit;
  else
    insert into tmp_ielts_school_results_students (student_id, username, email, class_id, class_name)
    select distinct on (u.id) u.id, u.username, u.email, c.id, c.class_name
    from public.classes c
    join public.class_teacher_assignments cta on cta.class_id = c.id
    join public.class_students cs on cs.class_id = c.id
    join public.users u on u.id = cs.student_id and u.school_id = v_school_id
    where c.school_id = v_school_id and coalesce(c.is_active, true) = true and cta.teacher_user_id = v_actor_id and coalesce(cta.active, true) = true and coalesce(u.role, 'student') = 'student' and (p_class_id is null or c.id = p_class_id) and (p_student_id is null or u.id = p_student_id)
    order by u.id, c.class_name nulls last
    limit v_limit;
  end if;

  if to_regclass('public.ielts_practice_assignment_students') is not null then
    update tmp_ielts_school_results_students t
    set assigned_practice_total = coalesce(p.assigned_total, 0),
        completed_practice_total = coalesce(p.completed_total, 0),
        last_activity_at = greatest(t.last_activity_at, p.last_activity_at)
    from (
      select s.student_id, count(s.id)::int as assigned_total, count(s.id) filter (where s.status = 'completed')::int as completed_total, max(s.updated_at) as last_activity_at
      from public.ielts_practice_assignment_students s
      join tmp_ielts_school_results_students target on target.student_id = s.student_id
      group by s.student_id
    ) p
    where p.student_id = t.student_id;
  end if;

  if to_regclass('public.ielts_exam_submissions') is not null and to_regclass('public.ielts_exam_attempts') is not null then
    update tmp_ielts_school_results_students t
    set last_activity_at = greatest(t.last_activity_at, e.last_activity_at)
    from (
      select s.student_id, max(s.submitted_at) as last_activity_at
      from public.ielts_exam_submissions s
      join tmp_ielts_school_results_students target on target.student_id = s.student_id
      group by s.student_id
    ) e
    where e.student_id = t.student_id;
  end if;

  update tmp_ielts_school_results_students t
  set latest_reading_estimate = r.reading,
      latest_listening_estimate = r.listening,
      latest_writing_estimate = r.writing,
      latest_speaking_estimate = r.speaking,
      last_activity_at = greatest(t.last_activity_at, r.last_activity_at)
  from (
    select target.student_id,
      max(readiness.estimated_band) filter (where readiness.skill = 'reading') as reading,
      max(readiness.estimated_band) filter (where readiness.skill = 'listening') as listening,
      max(readiness.estimated_band) filter (where readiness.skill = 'writing') as writing,
      max(readiness.estimated_band) filter (where readiness.skill = 'speaking') as speaking,
      max(readiness.last_activity_at) as last_activity_at
    from tmp_ielts_school_results_students target
    left join lateral public.ielts_latest_skill_readiness(target.student_id) readiness on true
    group by target.student_id
  ) r
  where r.student_id = t.student_id;

  update tmp_ielts_school_results_students t
  set latest_overall_estimate = estimates.overall
  from (
    select student_id, round(avg(value)::numeric, 1) as overall
    from tmp_ielts_school_results_students base
    cross join lateral (values (base.latest_reading_estimate), (base.latest_listening_estimate), (base.latest_writing_estimate), (base.latest_speaking_estimate)) v(value)
    where value is not null
    group by student_id
  ) estimates
  where estimates.student_id = t.student_id;

  select jsonb_build_object(
    'total_students', coalesce(count(distinct t.student_id), 0),
    'assigned_practice_count', coalesce(sum(t.assigned_practice_total), 0),
    'completed_practice_count', coalesce(sum(t.completed_practice_total), 0),
    'exam_submission_count', coalesce((select count(*) from public.ielts_exam_submissions s join tmp_ielts_school_results_students target on target.student_id = s.student_id), 0),
    'average_estimated_overall', round(avg(t.latest_overall_estimate)::numeric, 1)
  ) into v_summary
  from tmp_ielts_school_results_students t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', student_id, 'username', username, 'email', email, 'class_id', class_id, 'class_name', class_name,
    'assigned_practice_total', assigned_practice_total,
    'completed_practice_total', completed_practice_total,
    'latest_reading_estimate', latest_reading_estimate,
    'latest_listening_estimate', latest_listening_estimate,
    'latest_writing_estimate', latest_writing_estimate,
    'latest_speaking_estimate', latest_speaking_estimate,
    'latest_overall_estimate', latest_overall_estimate,
    'last_activity_at', last_activity_at
  ) order by last_activity_at desc nulls last, username nulls last, email nulls last), '[]'::jsonb)
  into v_students
  from tmp_ielts_school_results_students;

  return jsonb_build_object(
    'school_id', v_school_id,
    'filters_applied', jsonb_build_object('class_id', p_class_id, 'student_id', p_student_id, 'limit', v_limit),
    'summary', coalesce(v_summary, jsonb_build_object('total_students', 0, 'assigned_practice_count', 0, 'completed_practice_count', 0, 'exam_submission_count', 0, 'average_estimated_overall', null)),
    'students', coalesce(v_students, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.rpc_ielts_school_results(uuid, uuid, uuid, int) to authenticated;
