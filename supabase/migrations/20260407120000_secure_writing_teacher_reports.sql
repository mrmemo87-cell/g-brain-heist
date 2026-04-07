-- Secure teacher scoping + report RPC for Brains Heist Writing Hub

-- Checks whether the current auth user can access the target student's writing data.
-- Rules:
--   - admin: allowed
--   - school_admin: same school only
--   - teacher: same school AND active class assignment AND student enrolled in that class
create or replace function public.can_access_bh_writing_student(p_student_id uuid)
returns boolean
language sql
stable
as $$
  with me as (
    select
      u.id,
      u.role,
      coalesce(u.is_admin, false) as is_admin,
      u.school_id
    from public.users u
    where u.id = auth.uid()
  ),
  target as (
    select
      u.id,
      u.school_id
    from public.users u
    where u.id = p_student_id
  )
  select
    -- global admins
    exists (
      select 1
      from me
      where is_admin = true or role = 'admin'
    )
    or
    -- school admins can only view students in their school
    exists (
      select 1
      from me
      join target on target.school_id = me.school_id
      where me.role = 'school_admin'
    )
    or
    -- teachers can only view students they actively teach in class roster
    exists (
      select 1
      from me
      join target on target.school_id = me.school_id
      join public.teachers t
        on t.user_id = me.id
      join public.class_teacher_assignments cta
        on cta.teacher_user_id = me.id
       and coalesce(cta.active, true) = true
      join public.class_students cs
        on cs.class_id = cta.class_id
       and cs.student_id = target.id
      where me.role = 'teacher'
    );
$$;

comment on function public.can_access_bh_writing_student(uuid)
  is 'Authorizes BH writing student access using admin/school_admin/teacher+class roster checks.';

-- Update helper so policies can keep using it for non-student-specific tables.
create or replace function public.is_bh_admin_or_teacher()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        coalesce(u.is_admin, false)
        or u.role in ('admin', 'school_admin')
      )
  )
  or exists (
    select 1
    from public.teachers t
    where t.user_id = auth.uid()
  );
$$;

-- Tighten profile/state policies to scoped teacher/student access.
drop policy if exists "bh writing profile self select" on public.bh_writing_student_profiles;
create policy "bh writing profile scoped select" on public.bh_writing_student_profiles
for select
using (public.can_access_bh_writing_student(student_id) or student_id = auth.uid());

drop policy if exists "bh writing profile self upsert" on public.bh_writing_student_profiles;
create policy "bh writing profile scoped upsert" on public.bh_writing_student_profiles
for all
using (
  student_id = auth.uid()
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) or u.role in ('admin', 'school_admin'))
  )
)
with check (
  student_id = auth.uid()
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) or u.role in ('admin', 'school_admin'))
  )
);

drop policy if exists "bh writing states self" on public.bh_writing_student_states;
create policy "bh writing states scoped" on public.bh_writing_student_states
for all
using (
  student_id = auth.uid()
  or public.can_access_bh_writing_student(student_id)
)
with check (
  student_id = auth.uid()
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) or u.role in ('admin', 'school_admin'))
  )
);

-- Ensure payload-table reads are roster-scoped for teachers.
drop policy if exists "bh writing attempts read" on public.bh_writing_attempts;
create policy "bh writing attempts read" on public.bh_writing_attempts
for select
using (
  coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
  or public.can_access_bh_writing_student((coalesce(payload->>'student_id', payload->>'user_id'))::uuid)
);

drop policy if exists "bh writing weekly plans read" on public.bh_writing_weekly_plans;
create policy "bh writing weekly plans read" on public.bh_writing_weekly_plans
for select
using (
  coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
  or public.can_access_bh_writing_student((coalesce(payload->>'student_id', payload->>'user_id'))::uuid)
);

drop policy if exists "bh writing daily tasks read" on public.bh_writing_daily_tasks;
create policy "bh writing daily tasks read" on public.bh_writing_daily_tasks
for select
using (
  coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
  or public.can_access_bh_writing_student((coalesce(payload->>'student_id', payload->>'user_id'))::uuid)
);

drop policy if exists "bh writing submissions read" on public.bh_writing_daily_submissions;
create policy "bh writing submissions read" on public.bh_writing_daily_submissions
for select
using (
  coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
  or public.can_access_bh_writing_student((coalesce(payload->>'student_id', payload->>'user_id'))::uuid)
);

drop policy if exists "bh writing evaluations read" on public.bh_writing_daily_evaluations;
create policy "bh writing evaluations read" on public.bh_writing_daily_evaluations
for select
using (
  coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
  or public.can_access_bh_writing_student((coalesce(payload->>'student_id', payload->>'user_id'))::uuid)
);

drop policy if exists "bh writing monthly reports read" on public.bh_writing_monthly_reports;
create policy "bh writing monthly reports read" on public.bh_writing_monthly_reports
for select
using (
  coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
  or public.can_access_bh_writing_student((coalesce(payload->>'student_id', payload->>'user_id'))::uuid)
);

drop policy if exists "bh writing memory read" on public.bh_writing_memory_snapshots;
create policy "bh writing memory read" on public.bh_writing_memory_snapshots
for select
using (
  coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
  or public.can_access_bh_writing_student((coalesce(payload->>'student_id', payload->>'user_id'))::uuid)
);

drop policy if exists "bh writing calibration read" on public.bh_writing_calibration_followups;
create policy "bh writing calibration read" on public.bh_writing_calibration_followups
for select
using (student_id = auth.uid() or public.can_access_bh_writing_student(student_id));

-- Teacher-facing structured report RPC (no full submission by default).
create or replace function public.rpc_bh_writing_teacher_report(
  p_student_id uuid,
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
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
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
  v_snippet text := null;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_access_bh_writing_student(p_student_id) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  select
    u.id as student_id,
    u.username as student_name,
    u.grade as student_grade,
    c.id as class_id,
    c.class_name,
    c.class_code
  into v_student
  from public.users u
  left join public.class_students cs on cs.student_id = u.id
  left join public.classes c on c.id = cs.class_id
  where u.id = p_student_id
  order by c.created_at desc nulls last
  limit 1;

  if v_student.student_id is null then
    raise exception 'Student not found';
  end if;

  select to_jsonb(sp.*) into v_profile
  from public.bh_writing_student_profiles sp
  where sp.student_id = p_student_id;

  select ss.state into v_state
  from public.bh_writing_student_states ss
  where ss.student_id = p_student_id;

  select ds.payload into v_latest_attempt
  from public.bh_writing_attempts ds
  where (ds.payload->>'student_id')::uuid = p_student_id
    and (v_genre is null or ds.payload->>'genre' = v_genre)
  order by ds.created_at desc
  limit 1;

  select de.payload into v_latest_eval
  from public.bh_writing_daily_evaluations de
  where (de.payload->>'student_id')::uuid = p_student_id
    and (v_genre is null or de.payload->>'genre' = v_genre)
  order by de.created_at desc
  limit 1;

  select mr.payload into v_monthly
  from public.bh_writing_monthly_reports mr
  where (mr.payload->>'student_id')::uuid = p_student_id
    and (v_genre is null or mr.payload->>'genre' = v_genre)
    and coalesce(mr.payload->>'month', '') = v_month
  order by mr.created_at desc
  limit 1;

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
    select
      (a.payload->'assessment'->>'total_score')::numeric as total_score,
      a.created_at
    from public.bh_writing_attempts a
    where (a.payload->>'student_id')::uuid = p_student_id
      and (v_genre is null or a.payload->>'genre' = v_genre)
      and a.payload ? 'assessment'
    order by a.created_at desc
    limit 2
  )
  select
    max(case when rn = 1 then total_score end),
    max(case when rn = 2 then total_score end)
  into v_latest_total, v_prev_total
  from (
    select total_score, row_number() over (order by created_at desc) as rn
    from attempt_scores
  ) ranked;

  if v_latest_total is not null and v_prev_total is not null then
    v_trend := round(v_latest_total - v_prev_total, 2);
  end if;

  if v_latest_attempt is not null and jsonb_typeof(v_latest_attempt->'assessment'->'weakness_tags') = 'array' then
    select coalesce(array_agg(value), '{}')
    into v_weaknesses
    from jsonb_array_elements_text(v_latest_attempt->'assessment'->'weakness_tags');
  end if;

  if v_state ? 'repeated_error_memory' then
    with tags as (
      select
        key as tag,
        value::int as cnt
      from jsonb_each_text(
        coalesce(
          v_state->'repeated_error_memory'->'byStudent'->(p_student_id::text)->'tagCounts',
          '{}'::jsonb
        )
      )
      order by cnt desc
      limit 5
    )
    select coalesce(array_agg(tag), '{}') into v_top_tags from tags;
  end if;

  if v_latest_attempt is not null and jsonb_typeof(v_latest_attempt->'rich_feedback'->'strengths') = 'array' then
    select coalesce(array_agg(value), '{}')
    into v_strengths
    from (
      select value
      from jsonb_array_elements_text(v_latest_attempt->'rich_feedback'->'strengths')
      limit 3
    ) s;
  end if;

  select array_remove(array[
    case when array_length(v_weaknesses, 1) > 0 then format('Prioritize targeted practice for: %s', array_to_string(v_weaknesses[1:2], ', ')) end,
    case when v_completion_rate < 70 then 'Increase writing consistency by scheduling shorter daily writing check-ins.' end,
    case when v_trend is not null and v_trend < 0 then 'Review recent regressions and reteach the current weekly target before increasing difficulty.' end
  ], null) into v_actions;

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
      'grade', coalesce((v_profile->>'grade')::int, v_student.student_grade),
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
    'evidence_snippet', v_snippet,
    'student_friendly_summary', jsonb_build_object(
      'strengths', to_jsonb(v_strengths),
      'top_improvement_targets', to_jsonb(v_weaknesses[1:3]),
      'progress_summary', case
        when v_trend is null then 'Keep going. Your writing progress will be clearer after more submissions.'
        when v_trend >= 0 then format('Nice momentum: your recent score trend is %+s.', v_trend)
        else format('You can recover quickly: recent trend is %s, so focus on the top targets this week.', v_trend)
      end,
      'next_steps', to_jsonb(coalesce(v_actions, '{}'::text[]))
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_report(uuid, text, text, boolean) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_report(uuid, text, text, boolean) to authenticated;
