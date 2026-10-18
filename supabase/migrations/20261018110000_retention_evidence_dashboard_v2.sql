-- Investor-grade retention evidence v2. Additive; does not alter trial controls or assessment data.
-- Privacy: only aggregate JSON, no identifiers / content; superadmin checked on every call.
-- Cohorts use true first recorded meaningful activity, NOT first observed in the reporting window.
-- NOTE: quests / pilot practice are initiation-unknown and not investor-proof of voluntary use.
create or replace function public.rpc_retention_trial_evidence_v2()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  v_output jsonb;
begin
  if (select auth.uid()) is null or not public.rpc_is_superadmin() then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  with eligible as (
    select u.id, u.role, u.school_id
    from public.users u
    where u.role in ('student','teacher')
      and not coalesce(u.is_banned,false)
      and (u.banned_until is null or u.banned_until <= now())
      and lower(coalesce(u.username,'')) !~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)'
  ), actions as (
    select r.student_id actor_id, 'student'::text actor_role,
      r.completed_at occurred_at, a.school_id, 'online_assignment'::text action_kind
    from public.student_assignment_results r
    join public.assignments a on a.id = r.assignment_id
    where r.completed_at is not null and r.completion_source = 'online'
      and not exists (
        select 1 from public.legacy_quarantined_assignment_students q
        where q.assignment_id=r.assignment_id and q.student_id=r.student_id
      )

    union all
    select q.user_id,'student',q.completed_at,u.school_id,'quest'
    from public.quest_runs q
    join public.users u on u.id=q.user_id
    where q.status='completed' and q.completed_at is not null

    union all
    select tr.user_id,'student',tr.completed_at,u.school_id,'trial_practice'
    from private.retention_trial_runs tr
    join public.users u on u.id=tr.user_id
    where tr.completed_at is not null

    union all
    select t.user_id,'teacher',a.created_at,a.school_id,'teacher_assignment'
    from public.assignments a
    join public.teachers t on t.id=a.teacher_id
    where a.created_at is not null

    union all
    select ps.recorded_by,'teacher',ps.confirmed_at,a.school_id,'teacher_paper_capture'
    from public.assignment_paper_submissions ps
    join public.assignments a on a.id=ps.assignment_id
    where ps.confirmed_at is not null

    union all
    select i.created_by,'teacher',i.created_at,i.school_id,'teacher_intervention'
    from public.student_learning_interventions i
    where i.created_at is not null
  ), valid_actions as materialized (
    select a.*
    from actions a
    join eligible e on e.id=a.actor_id and e.role=a.actor_role
    where a.occurred_at <= now()
      and (
        a.school_id is null or exists(
          select 1 from public.schools s
          where s.id=a.school_id and s.name !~* '(test|demo|sample|sandbox)'
        )
      )
  ), first_actions as (
    select actor_id,actor_role,
      date_trunc('week',min(occurred_at at time zone 'UTC'))::date first_week
    from valid_actions
    group by actor_id,actor_role
  ), latest_28d as (
    select *
    from valid_actions
    where occurred_at >= now()-interval '28 days'
  ), weekly_spine as (
    select gs::date week
    from generate_series(
      (date_trunc('week',now() at time zone 'UTC')-interval '11 weeks')::date,
      date_trunc('week',now() at time zone 'UTC')::date,
      interval '1 week'
    ) gs
  ), weekly as (
    select w.week,roles.actor_role,
      count(distinct a.actor_id) users,
      count(a.actor_id) actions,
      count(a.actor_id) filter(where a.action_kind='online_assignment') online_assignments,
      count(a.actor_id) filter(where a.action_kind='quest') quests,
      count(a.actor_id) filter(where a.action_kind='trial_practice') trial_practice,
      count(a.actor_id) filter(where a.action_kind='teacher_assignment') teacher_assignments,
      count(a.actor_id) filter(where a.action_kind='teacher_paper_capture') teacher_paper_captures,
      count(a.actor_id) filter(where a.action_kind='teacher_intervention') teacher_interventions
    from weekly_spine w
    cross join (values('teacher'::text),('student'::text)) roles(actor_role)
    left join valid_actions a
      on a.actor_role=roles.actor_role
      and date_trunc('week',a.occurred_at at time zone 'UTC')::date=w.week
    group by w.week,roles.actor_role
  ), cohorts as (
    select f.actor_role,f.first_week,
      count(*) users,
      count(*) filter(where exists (
        select 1 from valid_actions v
        where v.actor_id=f.actor_id and v.actor_role=f.actor_role
          and v.occurred_at >= (f.first_week+7)::timestamp at time zone 'UTC'
          and v.occurred_at < (f.first_week+14)::timestamp at time zone 'UTC'
      )) week_one,
      count(*) filter(where exists (
        select 1 from valid_actions v
        where v.actor_id=f.actor_id and v.actor_role=f.actor_role
          and v.occurred_at >= (f.first_week+28)::timestamp at time zone 'UTC'
          and v.occurred_at < (f.first_week+35)::timestamp at time zone 'UTC'
      )) week_four
    from first_actions f
    where f.first_week >= (date_trunc('week',now() at time zone 'UTC')-interval '11 weeks')::date
    group by f.actor_role,f.first_week
  ), paper_totals as (
    select count(*) paper_completions
    from public.student_assignment_results r
    join public.assignments a on a.id=r.assignment_id
    join eligible e on e.id=r.student_id and e.role='student'
    join public.schools s on s.id=a.school_id and s.name !~* '(test|demo|sample|sandbox)'
    where r.completion_source='paper'
      and r.completed_at >= now()-interval '28 days'
      and r.completed_at <= now()
      and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=r.assignment_id and q.student_id=r.student_id)
  )
  select jsonb_build_object(
    'generated_at',now(),
    'timezone','UTC',
    'window_days',84,
    'cohort_definition','First recorded meaningful action (all-time); W1/W4 are exact subsequent full calendar weeks, not signup retention.',
    'disclaimer','Assigned online work, quests, and trial practice are not verified voluntary learning. Page views and paper student completions are excluded from meaningful activity.',
    'summary',jsonb_build_object(
      'student_users_28d',(select count(distinct actor_id) from latest_28d where actor_role='student'),
      'teacher_users_28d',(select count(distinct actor_id) from latest_28d where actor_role='teacher'),
      'online_completions_28d',(select count(*) from latest_28d where action_kind='online_assignment'),
      'online_students_28d',(select count(distinct actor_id) from latest_28d where action_kind='online_assignment'),
      'teacher_assignments_28d',(select count(*) from latest_28d where action_kind='teacher_assignment'),
      'teachers_creating_28d',(select count(distinct actor_id) from latest_28d where action_kind='teacher_assignment'),
      'teacher_paper_captures_28d',(select count(*) from latest_28d where action_kind='teacher_paper_capture'),
      'teacher_interventions_28d',(select count(*) from latest_28d where action_kind='teacher_intervention'),
      'quest_completions_28d',(select count(*) from latest_28d where action_kind='quest'),
      'quest_users_28d',(select count(distinct actor_id) from latest_28d where action_kind='quest'),
      'trial_practice_completions_28d',(select count(*) from latest_28d where action_kind='trial_practice'),
      'trial_practice_users_28d',(select count(distinct actor_id) from latest_28d where action_kind='trial_practice'),
      'student_repeat_2weeks_28d',(
        select count(*) from (
          select actor_id from latest_28d where actor_role='student'
          group by actor_id
          having count(distinct date_trunc('week',occurred_at at time zone 'UTC')) >= 2
        ) repeated
      ),
      'active_schools_28d',(select count(distinct school_id) from latest_28d where school_id is not null),
      'paper_completions_28d',(select paper_completions from paper_totals),
      'trial_view_user_days_28d',(
        select count(*) from private.retention_trial_events
        where event_day >= (now() at time zone 'Asia/Bishkek')::date-27
          and kind in ('teacher_view','student_view')
      )
    ),
    'weekly',(
      select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('is_partial',w.week=date_trunc('week',now() at time zone 'UTC')::date)
        order by w.week,w.actor_role),'[]'::jsonb) from weekly w
    ),
    'cohorts',(
      select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object(
        'week_one_mature',(c.first_week+14 <= date_trunc('week',now() at time zone 'UTC')::date),
        'week_four_mature',(c.first_week+35 <= date_trunc('week',now() at time zone 'UTC')::date)
      ) order by c.first_week,c.actor_role),'[]'::jsonb) from cohorts c
    ),
    'quality',jsonb_build_object(
      'excluded_username_flags',(select count(*) from public.users u where u.role in ('student','teacher') and lower(coalesce(u.username,'')) ~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)'),
      'excluded_named_test_schools',(select count(*) from public.schools where name ~* '(test|demo|sample|sandbox)'),
      'exclusion_rule','Provisional name-based screening, not a confirmed exhaustive test-account list.'
    )
  ) into v_output;
  return v_output;
end;
$function$;

revoke all on function public.rpc_retention_trial_evidence_v2() from public, anon, authenticated;
grant execute on function public.rpc_retention_trial_evidence_v2() to authenticated;
