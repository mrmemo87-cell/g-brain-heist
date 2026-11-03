-- Pilot studies: measured school pilots (engagement, return, interventions, baseline → endline).
--
-- A pilot study is a measurement window, separate from the commercial 'pilot' plan:
-- creating or editing a study never changes schools.school_plan or trial_ends_at, so an
-- enterprise school (e.g. the founder's own school) can run a measured pilot safely.
--
-- Cohort = students who completed any baseline assignment, plus optional extra student ids,
-- limited to active student members of the study's school.
-- Learning activity = completed work only (question attempts, online assignment answers and
-- results, quiz scores). Logins (sessions) and PvP/raid events are deliberately excluded.

create table if not exists public.pilot_studies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  starts_on date not null,
  ends_on date not null,
  baseline_assignment_ids uuid[] not null default '{}',
  endline_assignment_ids uuid[] not null default '{}',
  extra_student_ids uuid[] not null default '{}',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pilot_studies_window check (ends_on > starts_on and ends_on <= starts_on + 365)
);

create index if not exists pilot_studies_school_idx on public.pilot_studies(school_id, starts_on desc);

alter table public.pilot_studies enable row level security;
revoke all on table public.pilot_studies from public, anon, authenticated;
-- No direct client access: reads and writes go through the RPCs below.

-- ─────────────────────────────────────────────────────────────
-- Core metric computation (private; callers authorize first)
-- ─────────────────────────────────────────────────────────────
create or replace function private.pilot_study_metrics(p_study_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.pilot_studies%rowtype;
  v_school_name text;
  v_tz text;
  v_today date;
  v_last date;
  v_weeks integer;
  v_result jsonb;
begin
  select * into v from public.pilot_studies where id = p_study_id;
  if not found then return null; end if;

  select s.name, coalesce(nullif(s.time_zone, ''), 'Asia/Bishkek')
    into v_school_name, v_tz
  from public.schools s where s.id = v.school_id;

  v_today := (now() at time zone v_tz)::date;
  v_last := least(v_today, v.ends_on);
  v_weeks := greatest(0, ((v_last - v.starts_on) / 7) + 1);

  with members as (
    select sm.user_id
    from public.school_members sm
    where sm.school_id = v.school_id and sm.status = 'active' and sm.role_in_school = 'student'
  ),
  cohort as (
    select distinct c.student_id
    from (
      select r.student_id from public.student_assignment_results r
      where r.assignment_id = any(v.baseline_assignment_ids) and r.completed_at is not null
      union
      select unnest(v.extra_student_ids)
    ) c
    join members m on m.user_id = c.student_id
  ),
  events as (
    select qa.student_id, coalesce(qa.attempted_at, qa.created_at) as at, 'question' as kind
      from public.question_attempts qa join cohort c on c.student_id = qa.student_id
    union all
    select saa.student_id, saa.answered_at, 'answer'
      from public.student_assignment_answers saa join cohort c on c.student_id = saa.student_id
    union all
    select sar.student_id, sar.completed_at, 'assignment'
      from public.student_assignment_results sar join cohort c on c.student_id = sar.student_id
      where coalesce(sar.completion_source, 'online') <> 'paper'
    union all
    select qs.student_id, qs.submitted_at, 'quiz'
      from public.quiz_scores qs join cohort c on c.student_id = qs.student_id
      where coalesce(qs.attempt_status, 'completed') <> 'deleted'
  ),
  wevents as (
    select e.student_id, e.kind, ((((e.at at time zone v_tz)::date) - v.starts_on) / 7) as wk
    from events e
    where e.at is not null
      and (e.at at time zone v_tz)::date between v.starts_on and v_last
  ),
  weeks as (
    select g as wk,
      v.starts_on + g * 7 as week_start,
      (v.starts_on + g * 7 + 6) <= v_last as complete
    from generate_series(0, greatest(v_weeks - 1, -1)) g
  ),
  weekly as (
    select w.wk, w.week_start, w.complete,
      count(distinct we.student_id) as active,
      count(*) filter (where we.kind = 'question') as questions,
      count(*) filter (where we.kind in ('assignment', 'quiz')) as completions
    from weeks w left join wevents we on we.wk = w.wk
    group by w.wk, w.week_start, w.complete
  ),
  wk0 as (select distinct student_id from wevents where wk = 0),
  ret as (
    select
      (select count(*) from wk0) as base,
      (select count(*) from wk0 where exists (select 1 from wevents e where e.student_id = wk0.student_id and e.wk = 1)) as w1,
      (select count(*) from wk0 where exists (select 1 from wevents e where e.student_id = wk0.student_id and e.wk = 4)) as w4
  ),
  iv as (
    select
      count(*) as started,
      count(*) filter (where i.outcome_status is not null) as with_outcome,
      count(*) filter (where i.outcome_status in ('improved', 'resolved')) as improved,
      count(*) filter (where i.status in ('planned', 'active')) as open
    from public.student_learning_interventions i
    join cohort c on c.student_id = i.student_id
    where i.school_id = v.school_id
      and i.status <> 'cancelled'
      and (i.created_at at time zone v_tz)::date between v.starts_on and v.ends_on
  ),
  base_scores as (
    select r.student_id, avg(r.accuracy)::numeric as pct
    from public.student_assignment_results r join cohort c on c.student_id = r.student_id
    where r.assignment_id = any(v.baseline_assignment_ids) and r.accuracy is not null
    group by r.student_id
  ),
  end_scores as (
    select r.student_id, avg(r.accuracy)::numeric as pct
    from public.student_assignment_results r join cohort c on c.student_id = r.student_id
    where r.assignment_id = any(v.endline_assignment_ids) and r.accuracy is not null
    group by r.student_id
  ),
  paired as (
    select b.student_id, b.pct as base_pct, e.pct as end_pct
    from base_scores b join end_scores e on e.student_id = b.student_id
  )
  select jsonb_build_object(
    'study', jsonb_build_object(
      'id', v.id, 'school_id', v.school_id, 'school_name', v_school_name, 'name', v.name,
      'starts_on', v.starts_on, 'ends_on', v.ends_on, 'notes', v.notes,
      'baseline_assignment_ids', to_jsonb(v.baseline_assignment_ids),
      'endline_assignment_ids', to_jsonb(v.endline_assignment_ids),
      'extra_student_ids', to_jsonb(v.extra_student_ids),
      'current_week', case when v_today < v.starts_on then 0 else least(v_weeks, ((v.ends_on - v.starts_on) / 7) + 1) end,
      'total_weeks', ((v.ends_on - v.starts_on) / 7) + 1,
      'finished', v_today > v.ends_on
    ),
    'cohort_n', (select count(*) from cohort),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week', w.wk + 1, 'week_start', w.week_start, 'complete', w.complete,
        'active', w.active, 'questions', w.questions, 'completions', w.completions
      ) order by w.wk) from weekly w), '[]'::jsonb),
    'latest_complete_week', (
      select jsonb_build_object('week', w.wk + 1, 'active', w.active,
        'work_per_active', case when w.active > 0 then round((w.questions + w.completions)::numeric / w.active, 1) end)
      from weekly w where w.complete order by w.wk desc limit 1),
    'return', (select jsonb_build_object(
      'base_n', r.base, 'week_1', r.w1, 'week_4', r.w4,
      'week_1_mature', v.starts_on + 13 <= v_last,
      'week_4_mature', v.starts_on + 34 <= v_last) from ret r),
    'interventions', (select to_jsonb(iv) from iv),
    'scores', (select jsonb_build_object(
      'baseline_n', (select count(*) from base_scores),
      'endline_n', (select count(*) from end_scores),
      'paired_n', count(*),
      'baseline_mean', round(avg(p.base_pct), 1),
      'endline_mean', round(avg(p.end_pct), 1),
      'mean_change', round(avg(p.end_pct - p.base_pct), 1),
      'improved_n', count(*) filter (where p.end_pct > p.base_pct)
    ) from paired p),
    'min_n', 10,
    'generated_at', now()
  ) into v_result;

  return v_result;
end
$$;

revoke all on function private.pilot_study_metrics(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Super admin: create / update a study
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_upsert_pilot_study(
  p_school_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_baseline_assignment_ids uuid[] default '{}',
  p_endline_assignment_ids uuid[] default '{}',
  p_extra_student_ids uuid[] default '{}',
  p_notes text default null,
  p_study_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_bad integer;
begin
  if auth.uid() is null or not public.rpc_is_superadmin() then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists (select 1 from public.schools where id = p_school_id) then raise exception 'SCHOOL_NOT_FOUND'; end if;

  -- Every baseline/endline assignment must belong to the study's school.
  select count(*) into v_bad
  from unnest(coalesce(p_baseline_assignment_ids, '{}') || coalesce(p_endline_assignment_ids, '{}')) as x(id)
  where not exists (
    select 1 from public.assignments a
    left join public.teachers t on t.id = a.teacher_id
    left join public.users u on u.id = t.user_id
    where a.id = x.id and coalesce(a.school_id, u.school_id) = p_school_id
  );
  if v_bad > 0 then raise exception 'ASSIGNMENT_NOT_IN_SCHOOL'; end if;

  if p_study_id is null then
    insert into public.pilot_studies (school_id, name, starts_on, ends_on, baseline_assignment_ids,
      endline_assignment_ids, extra_student_ids, notes, created_by)
    values (p_school_id, btrim(p_name), p_starts_on, p_ends_on, coalesce(p_baseline_assignment_ids, '{}'),
      coalesce(p_endline_assignment_ids, '{}'), coalesce(p_extra_student_ids, '{}'), nullif(btrim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    update public.pilot_studies set
      school_id = p_school_id, name = btrim(p_name), starts_on = p_starts_on, ends_on = p_ends_on,
      baseline_assignment_ids = coalesce(p_baseline_assignment_ids, '{}'),
      endline_assignment_ids = coalesce(p_endline_assignment_ids, '{}'),
      extra_student_ids = coalesce(p_extra_student_ids, '{}'),
      notes = nullif(btrim(p_notes), ''), updated_at = now()
    where id = p_study_id
    returning id into v_id;
    if v_id is null then raise exception 'STUDY_NOT_FOUND'; end if;
  end if;

  return private.pilot_study_metrics(v_id);
end
$$;

revoke all on function public.admin_upsert_pilot_study(uuid, text, date, date, uuid[], uuid[], uuid[], text, uuid) from public, anon;
grant execute on function public.admin_upsert_pilot_study(uuid, text, date, date, uuid[], uuid[], uuid[], text, uuid) to authenticated;

create or replace function public.admin_delete_pilot_study(p_study_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.rpc_is_superadmin() then raise exception 'NOT_AUTHORIZED'; end if;
  delete from public.pilot_studies where id = p_study_id;
end
$$;

revoke all on function public.admin_delete_pilot_study(uuid) from public, anon;
grant execute on function public.admin_delete_pilot_study(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Super admin: all studies with their metrics
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_list_pilot_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.rpc_is_superadmin() then raise exception 'NOT_AUTHORIZED'; end if;
  return jsonb_build_object(
    'studies', coalesce((
      select jsonb_agg(private.pilot_study_metrics(p.id) order by p.starts_on desc, p.created_at desc)
      from public.pilot_studies p
    ), '[]'::jsonb),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'plan', s.school_plan) order by s.name)
      from public.schools s
    ), '[]'::jsonb)
  );
end
$$;

revoke all on function public.admin_list_pilot_metrics() from public, anon;
grant execute on function public.admin_list_pilot_metrics() to authenticated;

-- Assignments of one school, to pick baseline/endline tests.
create or replace function public.admin_list_school_assignments_for_pilot(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.rpc_is_superadmin() then raise exception 'NOT_AUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'title', coalesce(a.title, a.topic_name), 'created_at', a.created_at,
      'completed_n', (select count(*) from public.student_assignment_results r where r.assignment_id = a.id and r.completed_at is not null))
      order by a.created_at desc)
    from public.assignments a
    left join public.teachers t on t.id = a.teacher_id
    left join public.users u on u.id = t.user_id
    where coalesce(a.school_id, u.school_id) = p_school_id
  ), '[]'::jsonb);
end
$$;

revoke all on function public.admin_list_school_assignments_for_pilot(uuid) from public, anon;
grant execute on function public.admin_list_school_assignments_for_pilot(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Summary for one study: super admin always; that school's admins once the study has ended.
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_pilot_summary(p_study_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_ends date;
  v_tz text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;
  select p.school_id, p.ends_on, coalesce(nullif(s.time_zone, ''), 'Asia/Bishkek')
    into v_school, v_ends, v_tz
  from public.pilot_studies p join public.schools s on s.id = p.school_id
  where p.id = p_study_id;
  if v_school is null then raise exception 'NOT_AUTHORIZED'; end if;

  if not public.rpc_is_superadmin() then
    if (now() at time zone v_tz)::date <= v_ends or not exists (
      select 1 from public.school_members sm
      where sm.school_id = v_school and sm.user_id = auth.uid() and sm.status = 'active'
        and sm.role_in_school in ('school_admin', 'admin')
    ) then
      raise exception 'NOT_AUTHORIZED';
    end if;
  end if;

  return private.pilot_study_metrics(p_study_id);
end
$$;

revoke all on function public.get_pilot_summary(uuid) from public, anon;
grant execute on function public.get_pilot_summary(uuid) to authenticated;
