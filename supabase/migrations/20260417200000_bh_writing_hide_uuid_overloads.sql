-- Strategy: Drop UUID overloads, rewrite text versions as self-contained (not wrappers).
-- This eliminates PostgREST overload ambiguity permanently.

----------------------------------------------------------------------
-- 1. Drop all UUID-parameter versions
----------------------------------------------------------------------
drop function if exists public.rpc_bh_writing_teacher_report(uuid, text, text, boolean);
drop function if exists public.rpc_bh_writing_teacher_attempts(uuid, text, int);
drop function if exists public.rpc_bh_writing_teacher_general_report(uuid, text, text);
drop function if exists public.rpc_bh_writing_teacher_attempt_report(uuid, text, text);
drop function if exists public.rpc_bh_writing_teacher_reports(uuid, text, text);
drop function if exists public.rpc_bh_writing_save_teacher_report(uuid, text, text, text, text, text, jsonb, text, uuid);

----------------------------------------------------------------------
-- 2. Rewrite text versions as self-contained functions
----------------------------------------------------------------------

-- rpc_bh_writing_teacher_report(text, text, text, boolean)
create or replace function public.rpc_bh_writing_teacher_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null,
  p_include_snippet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
  v_actor record;
  v_authorized_class_id uuid := null;
  v_student record;
  v_profile jsonb := '{}'::jsonb;
  v_state jsonb := '{}'::jsonb;
  v_latest_eval jsonb := null;
  v_latest_attempt jsonb := null;
  v_monthly jsonb := null;
  v_completion_rate numeric := 0;
  v_completed_count int := 0;
  v_total_tasks int := 0;
  v_latest_total numeric := null;
  v_prev_total numeric := null;
  v_trend numeric := null;
  v_weaknesses text[] := '{}';
  v_top_tags text[] := '{}';
  v_strengths text[] := '{}';
  v_actions text[] := '{}';
  v_follow_up_flag boolean := false;
  v_snippet text := null;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  select u.role, coalesce(u.is_admin, false) as is_admin, u.school_id
  into v_actor from public.users u where u.id = auth.uid();

  if coalesce(v_actor.role, '') = 'teacher' and coalesce(v_actor.is_admin, false) = false then
    select cta.class_id into v_authorized_class_id
    from public.class_teacher_assignments cta
    join public.class_students cs on cs.class_id = cta.class_id and cs.student_id = v_sid
    join public.classes c on c.id = cta.class_id and c.school_id = v_actor.school_id
    where cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
    order by cta.class_id limit 1;
  end if;

  select u.id as student_id, u.username as student_name, u.grade as student_grade,
         c.id as class_id, c.class_name, c.class_code
  into v_student
  from public.users u
  left join public.class_students cs on cs.student_id = u.id
  left join public.classes c on c.id = cs.class_id
  where u.id = v_sid
    and (v_authorized_class_id is null or cs.class_id = v_authorized_class_id)
  order by c.created_at desc nulls last limit 1;

  if v_student.student_id is null then raise exception 'Student not found'; end if;

  select to_jsonb(sp.*) into v_profile from public.bh_writing_student_profiles sp where sp.student_id = v_sid;
  select ss.state into v_state from public.bh_writing_student_states ss where ss.student_id = v_sid;

  select ds.payload into v_latest_attempt
  from public.bh_writing_attempts ds
  where (coalesce(ds.payload->>'student_id', ds.payload->>'user_id'))::uuid = v_sid
    and (v_genre is null or ds.payload->>'genre' = v_genre)
  order by ds.created_at desc limit 1;

  select de.payload into v_latest_eval
  from public.bh_writing_daily_evaluations de
  where (coalesce(de.payload->>'student_id', de.payload->>'user_id'))::uuid = v_sid
    and (v_genre is null or de.payload->>'genre' = v_genre)
  order by de.created_at desc limit 1;

  select mr.payload into v_monthly
  from public.bh_writing_monthly_reports mr
  where (coalesce(mr.payload->>'student_id', mr.payload->>'user_id'))::uuid = v_sid
    and (v_genre is null or mr.payload->>'genre' = v_genre)
    and coalesce(mr.payload->>'month', '') = v_month
  order by mr.created_at desc limit 1;

  if v_state ? 'completed_daily_tasks' then
    select coalesce(jsonb_array_length(v_state->'completed_daily_tasks'), 0) into v_completed_count;
  end if;
  if v_state ? 'active_daily_tasks' then
    select coalesce(jsonb_array_length(v_state->'active_daily_tasks'), 0) into v_total_tasks;
  end if;
  if v_total_tasks > 0 then
    v_completion_rate := round((v_completed_count::numeric / v_total_tasks::numeric) * 100, 2);
  end if;

  with attempt_scores as (
    select (a.payload->'assessment'->>'total_score')::numeric as total_score, a.created_at
    from public.bh_writing_attempts a
    where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = v_sid
      and (v_genre is null or a.payload->>'genre' = v_genre) and a.payload ? 'assessment'
    order by a.created_at desc limit 2
  )
  select max(case when rn = 1 then total_score end), max(case when rn = 2 then total_score end)
  into v_latest_total, v_prev_total
  from (select total_score, row_number() over (order by created_at desc) as rn from attempt_scores) ranked;

  if v_latest_total is not null and v_prev_total is not null then
    v_trend := round(v_latest_total - v_prev_total, 2);
  end if;

  if v_latest_attempt is not null and jsonb_typeof(v_latest_attempt->'assessment'->'weakness_tags') = 'array' then
    select coalesce(array_agg(value), '{}') into v_weaknesses
    from jsonb_array_elements_text(v_latest_attempt->'assessment'->'weakness_tags');
  end if;

  if v_state ? 'repeated_error_memory' then
    with tags as (
      select key as tag, value::int as cnt
      from jsonb_each_text(coalesce(v_state->'repeated_error_memory'->'byStudent'->(v_sid::text)->'tagCounts', '{}'::jsonb))
      order by cnt desc limit 5
    )
    select coalesce(array_agg(tag), '{}') into v_top_tags from tags;
  end if;

  if v_latest_attempt is not null and jsonb_typeof(v_latest_attempt->'rich_feedback'->'strengths') = 'array' then
    select coalesce(array_agg(value), '{}') into v_strengths
    from (select value from jsonb_array_elements_text(v_latest_attempt->'rich_feedback'->'strengths') limit 3) s;
  end if;

  select array_remove(array[
    case when array_length(v_weaknesses, 1) > 0 then format('Prioritize targeted practice for: %s', array_to_string(v_weaknesses[1:2], ', ')) end,
    case when v_completion_rate < 70 then 'Increase writing consistency by scheduling shorter daily writing check-ins.' end,
    case when v_trend is not null and v_trend < 0 then 'Review recent regressions and reteach the current weekly target before increasing difficulty.' end
  ], null) into v_actions;

  select coalesce((cf.payload->>'flagged')::boolean, false) into v_follow_up_flag
  from public.bh_writing_calibration_followups cf where cf.student_id = v_sid
  order by cf.updated_at desc limit 1;

  if p_include_snippet and v_latest_attempt is not null then
    v_snippet := left(coalesce(v_latest_attempt->>'student_submission', ''), 180);
  end if;

  return jsonb_build_object(
    'report_type', 'teacher_writing_report',
    'generated_at', now(),
    'period', v_month,
    'student', jsonb_build_object(
      'student_id', v_student.student_id,
      'student_name', coalesce(v_student.student_name, 'Student'),
      'grade', coalesce((v_profile->>'grade')::int, nullif(v_student.student_grade::text, '')::int),
      'class_id', v_student.class_id,
      'class_name', coalesce(v_student.class_name, v_student.class_code, 'Unassigned')
    ),
    'genre', coalesce(v_genre, v_profile->>'genre', v_latest_attempt->>'genre', 'essay'),
    'overall_summary', jsonb_build_object(
      'latest_score', v_latest_total,
      'score_trend_delta', v_trend,
      'completion_rate_percent', v_completion_rate,
      'completed_tasks', v_completed_count,
      'total_tasks', v_total_tasks
    ),
    'strengths', to_jsonb(v_strengths),
    'priority_weak_areas', to_jsonb(v_weaknesses),
    'repeated_error_patterns', to_jsonb(v_top_tags),
    'latest_evaluation', coalesce(v_latest_eval->'evaluation', '{}'::jsonb),
    'monthly_summary', coalesce(v_monthly->'report', '{}'::jsonb),
    'teacher_actions', to_jsonb(coalesce(v_actions, '{}'::text[])),
    'calibration_follow_up_flag', coalesce(v_follow_up_flag, false),
    'evidence_snippet', v_snippet,
    'student_friendly_summary', jsonb_build_object(
      'strengths', to_jsonb(v_strengths),
      'top_improvement_targets', to_jsonb(v_weaknesses[1:3]),
      'progress_summary', case
        when v_trend is null then 'Keep going. Your writing progress will be clearer after more submissions.'
        when v_trend >= 0 then format('Nice momentum: your recent score trend is %s%s.', '+', v_trend::text)
        else format('You can recover quickly: recent trend is %s, so focus on the top targets this week.', v_trend)
      end,
      'next_steps', to_jsonb(coalesce(v_actions, '{}'::text[]))
    )
  );
end;
$$;

-- rpc_bh_writing_teacher_attempts(text, text, int)
create or replace function public.rpc_bh_writing_teacher_attempts(
  p_student_id text,
  p_genre text default null,
  p_limit int default 80
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
  v_genre text := nullif(trim(p_genre), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 80), 200));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  return (
    with attempts as (
      select a.id as row_id, a.created_at, a.payload
      from public.bh_writing_attempts a
      where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = v_sid
        and (v_genre is null or a.payload->>'genre' = v_genre)
      order by a.created_at desc limit v_limit
    )
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'row_id', row_id,
        'attempt_id', coalesce(payload->>'id', row_id::text),
        'student_id', coalesce(payload->>'student_id', payload->>'user_id'),
        'genre', coalesce(payload->>'genre', 'essay'),
        'attempt_type', payload->>'attempt_type',
        'attempt_number', nullif(payload->>'attempt_number', '')::int,
        'retry_kind', payload->>'retry_kind',
        'revision_cycle_id', payload->>'revision_cycle_id',
        'parent_attempt_id', payload->>'parent_attempt_id',
        'prompt_id', payload->>'prompt_id',
        'prompt_text', coalesce(payload->>'prompt_text', ''),
        'student_submission', coalesce(payload->>'student_submission', ''),
        'assessment', coalesce(payload->'assessment', '{}'::jsonb),
        'rich_feedback', coalesce(payload->'rich_feedback', '{}'::jsonb),
        'created_at', created_at
      )), '[]'::jsonb
    ) from attempts
  );
end;
$$;

-- rpc_bh_writing_teacher_general_report(text, text, text)
create or replace function public.rpc_bh_writing_teacher_general_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
  v_base jsonb := '{}'::jsonb;
  v_attempts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  select public.rpc_bh_writing_teacher_report(p_student_id, v_month, v_genre, true) into v_base;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'attempt_id', coalesce(a.payload->>'id', a.id::text),
      'created_at', a.created_at,
      'attempt_type', a.payload->>'attempt_type',
      'retry_kind', a.payload->>'retry_kind',
      'revision_cycle_id', a.payload->>'revision_cycle_id',
      'prompt_text', coalesce(a.payload->>'prompt_text', ''),
      'student_submission', coalesce(a.payload->>'student_submission', ''),
      'assessment', coalesce(a.payload->'assessment', '{}'::jsonb)
    ) order by a.created_at desc), '[]'::jsonb
  ) into v_attempts
  from public.bh_writing_attempts a
  where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = v_sid
    and (v_genre is null or a.payload->>'genre' = v_genre)
  limit 25;

  return jsonb_build_object('report_mode', 'student', 'report', v_base, 'attempts', v_attempts);
end;
$$;

-- rpc_bh_writing_teacher_attempt_report(text, text, text)
create or replace function public.rpc_bh_writing_teacher_attempt_report(
  p_student_id text,
  p_attempt_id text,
  p_genre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
  v_genre text := nullif(trim(p_genre), '');
  v_attempt jsonb := null;
  v_prev_attempt jsonb := null;
  v_latest_eval jsonb := '{}'::jsonb;
  v_next_action text := null;
  v_issues text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  select jsonb_build_object(
    'attempt_id', coalesce(a.payload->>'id', a.id::text),
    'row_id', a.id, 'created_at', a.created_at,
    'genre', coalesce(a.payload->>'genre', 'essay'),
    'attempt_type', a.payload->>'attempt_type',
    'attempt_number', nullif(a.payload->>'attempt_number', '')::int,
    'retry_kind', a.payload->>'retry_kind',
    'revision_cycle_id', a.payload->>'revision_cycle_id',
    'parent_attempt_id', a.payload->>'parent_attempt_id',
    'prompt_id', a.payload->>'prompt_id',
    'prompt_text', coalesce(a.payload->>'prompt_text', ''),
    'student_submission', coalesce(a.payload->>'student_submission', ''),
    'assessment', coalesce(a.payload->'assessment', '{}'::jsonb),
    'rich_feedback', coalesce(a.payload->'rich_feedback', '{}'::jsonb)
  ) into v_attempt
  from public.bh_writing_attempts a
  where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = v_sid
    and (coalesce(a.payload->>'id', a.id::text)) = p_attempt_id
    and (v_genre is null or a.payload->>'genre' = v_genre)
  limit 1;

  if v_attempt is null then raise exception 'Attempt not found'; end if;

  select jsonb_build_object(
    'attempt_id', coalesce(a.payload->>'id', a.id::text),
    'created_at', a.created_at,
    'prompt_text', coalesce(a.payload->>'prompt_text', ''),
    'student_submission', coalesce(a.payload->>'student_submission', ''),
    'assessment', coalesce(a.payload->'assessment', '{}'::jsonb)
  ) into v_prev_attempt
  from public.bh_writing_attempts a
  where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid = v_sid
    and a.created_at < (v_attempt->>'created_at')::timestamptz
    and (v_genre is null or a.payload->>'genre' = coalesce(v_genre, v_attempt->>'genre'))
  order by a.created_at desc limit 1;

  select de.payload into v_latest_eval
  from public.bh_writing_daily_evaluations de
  where (coalesce(de.payload->>'student_id', de.payload->>'user_id'))::uuid = v_sid
    and (v_genre is null or de.payload->>'genre' = coalesce(v_genre, v_attempt->>'genre'))
  order by de.created_at desc limit 1;

  if jsonb_typeof(v_attempt->'assessment'->'weakness_tags') = 'array' then
    select coalesce(array_agg(value), '{}') into v_issues
    from jsonb_array_elements_text(v_attempt->'assessment'->'weakness_tags');
  end if;

  v_next_action := coalesce(v_latest_eval->'evaluation'->>'recommended_next_action',
    'Revisit the top weakness tags and submit a focused retry attempt.');

  return jsonb_build_object(
    'report_mode', 'attempt',
    'attempt', v_attempt,
    'previous_attempt', coalesce(v_prev_attempt, '{}'::jsonb),
    'evaluation', coalesce(v_latest_eval->'evaluation', '{}'::jsonb),
    'precise_issues', to_jsonb(v_issues),
    'suggested_next_action', v_next_action
  );
end;
$$;

-- rpc_bh_writing_teacher_reports(text, text, text)
create or replace function public.rpc_bh_writing_teacher_reports(
  p_student_id text,
  p_attempt_id text default null,
  p_mode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
begin
  return coalesce(
    (select jsonb_agg(jsonb_build_object(
        'id', r.id, 'student_id', r.student_id, 'attempt_id', r.attempt_id,
        'report_mode', r.report_mode, 'month', r.month, 'genre', r.genre,
        'status', r.status, 'report_payload', r.report_payload,
        'teacher_comment', r.teacher_comment, 'created_by', r.created_by,
        'updated_by', r.updated_by, 'created_at', r.created_at, 'updated_at', r.updated_at
      ) order by r.updated_at desc)
     from public.bh_writing_teacher_reports r
     where r.student_id = v_sid
       and public.can_access_bh_writing_student(r.student_id)
       and (p_attempt_id is null or r.attempt_id = p_attempt_id)
       and (p_mode is null or r.report_mode = p_mode)
    ), '[]'::jsonb
  );
end;
$$;

-- rpc_bh_writing_save_teacher_report(text, ...)
create or replace function public.rpc_bh_writing_save_teacher_report(
  p_student_id text,
  p_attempt_id text default null,
  p_mode text default 'student',
  p_month text default null,
  p_genre text default null,
  p_status text default 'draft',
  p_report_payload jsonb default '{}'::jsonb,
  p_teacher_comment text default null,
  p_report_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
  v_id uuid;
  v_mode text := lower(coalesce(p_mode, 'student'));
  v_status text := lower(coalesce(p_status, 'draft'));
  v_row public.bh_writing_teacher_reports;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_mode not in ('student', 'attempt') then raise exception 'Invalid report mode'; end if;
  if v_status not in ('draft', 'final') then raise exception 'Invalid report status'; end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  if p_report_id is not null then
    update public.bh_writing_teacher_reports r
    set attempt_id = p_attempt_id, report_mode = v_mode, month = p_month,
        genre = p_genre, status = v_status,
        report_payload = coalesce(p_report_payload, '{}'::jsonb),
        teacher_comment = p_teacher_comment, updated_by = auth.uid(), updated_at = now()
    where r.id = p_report_id and r.student_id = v_sid
      and public.can_access_bh_writing_student(r.student_id)
    returning r.id into v_id;
    if v_id is null then raise exception 'Report not found or not authorized'; end if;
  else
    insert into public.bh_writing_teacher_reports (
      student_id, attempt_id, report_mode, month, genre, status,
      report_payload, teacher_comment, created_by, updated_by
    ) values (
      v_sid, p_attempt_id, v_mode, p_month, p_genre, v_status,
      coalesce(p_report_payload, '{}'::jsonb), p_teacher_comment, auth.uid(), auth.uid()
    ) returning id into v_id;
  end if;

  select * into v_row from public.bh_writing_teacher_reports where id = v_id;

  return jsonb_build_object(
    'id', v_row.id, 'student_id', v_row.student_id, 'attempt_id', v_row.attempt_id,
    'report_mode', v_row.report_mode, 'month', v_row.month, 'genre', v_row.genre,
    'status', v_row.status, 'report_payload', v_row.report_payload,
    'teacher_comment', v_row.teacher_comment, 'created_by', v_row.created_by,
    'updated_by', v_row.updated_by, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at
  );
end;
$$;

----------------------------------------------------------------------
-- 3. Grant text-parameter versions to authenticated
----------------------------------------------------------------------
grant execute on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) to authenticated;
grant execute on function public.rpc_bh_writing_teacher_attempts(text, text, int) to authenticated;
grant execute on function public.rpc_bh_writing_teacher_general_report(text, text, text) to authenticated;
grant execute on function public.rpc_bh_writing_teacher_attempt_report(text, text, text) to authenticated;
grant execute on function public.rpc_bh_writing_teacher_reports(text, text, text) to authenticated;
grant execute on function public.rpc_bh_writing_save_teacher_report(text, text, text, text, text, text, jsonb, text, uuid) to authenticated;
