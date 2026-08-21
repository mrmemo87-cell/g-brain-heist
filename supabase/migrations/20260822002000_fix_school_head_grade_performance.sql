-- Fix School Head grade performance so normal completed school assignments are
-- included alongside recorded quiz/Cambridge scores.
--
-- This is intentionally additive. The legacy executive snapshot remains untouched;
-- a v2 wrapper patches only academics.grade_performance and the frontend can fall
-- back to the legacy snapshot during staggered deployments.

create or replace function public.school_head_get_grade_performance(
  p_school_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_days integer := greatest(7, least(coalesce(p_days, 30), 365));
  v_period_start timestamptz := now() - make_interval(days => v_days);
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  with active_grades as (
    select distinct coalesce(c.grade_level, 'Unassigned') as grade_level
    from public.classes c
    where c.school_id = p_school_id
      and c.is_active is distinct from false
  ),
  current_students as (
    select distinct
      sm.user_id as student_id,
      coalesce(c.grade_level, 'Unassigned') as grade_level
    from public.school_members sm
    join public.class_students cs
      on cs.student_id = sm.user_id
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = sm.school_id
     and c.is_active is distinct from false
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ),
  scored_work as (
    -- Normal teacher assignments are recorded here, not in quiz_scores.
    select
      sar.student_id,
      'assignment:' || sar.assignment_id::text || ':' || sar.student_id::text as evidence_key,
      sar.accuracy::numeric as percentage
    from public.student_assignment_results sar
    join public.assignments a
      on a.id = sar.assignment_id
     and a.school_id = p_school_id
    join public.student_assignments sa
      on sa.assignment_id = sar.assignment_id
     and sa.student_id = sar.student_id
    where sar.completed_at >= v_period_start
      and lower(coalesce(sa.status, '')) in ('completed', 'graded')
      and sar.accuracy is not null

    union all

    -- Preserve the existing School Head behavior for recorded quizzes/Cambridge.
    select
      qs.student_id,
      'quiz:' || qs.id::text as evidence_key,
      qs.percentage::numeric as percentage
    from public.quiz_scores qs
    where qs.school_id = p_school_id
      and qs.submitted_at >= v_period_start
      and coalesce(qs.attempt_status, 'completed') <> 'deleted'
      and qs.percentage is not null
  ),
  grade_rows as (
    select
      ag.grade_level,
      count(distinct cs.student_id)::integer as students,
      count(distinct sw.evidence_key)::integer as assessments,
      round(avg(sw.percentage)::numeric, 1) as average
    from active_grades ag
    left join current_students cs
      on cs.grade_level = ag.grade_level
    left join scored_work sw
      on sw.student_id = cs.student_id
    group by ag.grade_level
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'grade', gr.grade_level,
        'students', gr.students,
        'assessments', gr.assessments,
        'average', gr.average
      )
      order by
        case when gr.grade_level ~ '^[0-9]+$' then gr.grade_level::integer else 999 end,
        gr.grade_level
    ),
    '[]'::jsonb
  )
  into v_result
  from grade_rows gr;

  return v_result;
end;
$$;

revoke all on function public.school_head_get_grade_performance(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.school_head_get_grade_performance(uuid, integer)
  to authenticated;

comment on function public.school_head_get_grade_performance(uuid, integer) is
  'School Head grade-level scored-work summary. Uses current active class placement and combines completed assignment results with recorded quiz/Cambridge scores for the selected period.';

create or replace function public.school_head_get_executive_snapshot_v2(
  p_school_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_grade_performance jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  v_snapshot := public.school_head_get_executive_snapshot(p_school_id, p_days);
  v_grade_performance := public.school_head_get_grade_performance(p_school_id, p_days);

  return jsonb_set(
    v_snapshot,
    '{academics,grade_performance}',
    coalesce(v_grade_performance, '[]'::jsonb),
    true
  );
end;
$$;

revoke all on function public.school_head_get_executive_snapshot_v2(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.school_head_get_executive_snapshot_v2(uuid, integer)
  to authenticated;

comment on function public.school_head_get_executive_snapshot_v2(uuid, integer) is
  'Compatibility-safe School Head executive snapshot wrapper that replaces only grade_performance with scored assignment plus quiz/Cambridge data.';
