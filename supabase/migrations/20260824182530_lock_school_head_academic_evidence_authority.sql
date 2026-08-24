-- School Head academic metrics are official attainment surfaces. Assignment
-- scores therefore come only from the verified, grade-eligible summary view,
-- and Cambridge scores must have at least one authority-qualified observation.
-- Legacy executive builders are retained only for non-academic payload fields;
-- every academic metric and academic-decline signal is replaced before return
-- or persistence.

create or replace function private.school_head_authoritative_scored_work(
  p_school_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (
  student_id uuid,
  evidence_key text,
  percentage numeric,
  observed_at timestamptz,
  evidence_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.student_id,
    'assignment:' || r.assignment_id::text || ':' || r.student_id::text,
    r.accuracy::numeric,
    r.completed_at,
    'assignment'
  from private.student_verified_assignment_summaries r
  join public.assignments a
    on a.id = r.assignment_id
   and a.school_id = p_school_id
  join public.school_members sm
    on sm.school_id = a.school_id
   and sm.user_id = r.student_id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where r.completed_at >= p_period_start
    and r.completed_at < p_period_end
    and r.accuracy is not null

  union all

  select
    qs.student_id,
    'cambridge:' || qs.id::text,
    qs.percentage::numeric,
    qs.submitted_at,
    'cambridge'
  from public.quiz_scores qs
  join public.school_members sm
    on sm.school_id = qs.school_id
   and sm.user_id = qs.student_id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where qs.school_id = p_school_id
    and qs.submitted_at >= p_period_start
    and qs.submitted_at < p_period_end
    and coalesce(qs.attempt_status, 'completed') <> 'deleted'
    and qs.percentage is not null
    and exists (
      select 1
      from public.student_learning_observations o
      where o.school_id = qs.school_id
        and o.student_id = qs.student_id
        and o.source_type = 'cambridge_attempt'
        and o.source_id = qs.id
        and public.student_learning_observation_is_qualified(
          o.source_type,
          o.contributes_to_focus_state,
          o.evidence
        )
    );
$$;

revoke all on function private.school_head_authoritative_scored_work(
  uuid, timestamptz, timestamptz
) from public, anon, authenticated, service_role;

comment on function private.school_head_authoritative_scored_work(
  uuid, timestamptz, timestamptz
) is
  'Internal School Head score stream: verified assignment summaries plus authority-qualified Cambridge attempts only.';

create or replace function private.school_head_authoritative_grade_performance(
  p_school_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
  scored_work as materialized (
    select *
    from private.school_head_authoritative_scored_work(
      p_school_id, p_period_start, p_period_end
    )
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
        case
          when gr.grade_level ~ '^[0-9]+$' then gr.grade_level::integer
          else 999
        end,
        gr.grade_level
    ),
    '[]'::jsonb
  )
  from grade_rows gr;
$$;

revoke all on function private.school_head_authoritative_grade_performance(
  uuid, timestamptz, timestamptz
) from public, anon, authenticated, service_role;

create or replace function private.school_head_authoritative_academic_summary(
  p_school_id uuid,
  p_days integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      greatest(7, least(coalesce(p_days, 30), 365)) as days,
      now() as period_end
  ),
  periods as (
    select
      period_end,
      period_end - make_interval(days => days) as period_start,
      period_end - make_interval(days => days * 2) as previous_start
    from bounds
  ),
  current_work as materialized (
    select sw.*
    from periods p
    cross join lateral private.school_head_authoritative_scored_work(
      p_school_id, p.period_start, p.period_end
    ) sw
  ),
  previous_work as materialized (
    select sw.*
    from periods p
    cross join lateral private.school_head_authoritative_scored_work(
      p_school_id, p.previous_start, p.period_start
    ) sw
  )
  select jsonb_build_object(
    'average', (select round(avg(percentage)::numeric, 1) from current_work),
    'previous_average', (
      select round(avg(percentage)::numeric, 1) from previous_work
    ),
    'grade_performance', private.school_head_authoritative_grade_performance(
      p_school_id,
      (select period_start from periods),
      (select period_end from periods)
    ),
    'cambridge_attempts', (
      select count(distinct evidence_key)::integer
      from current_work
      where evidence_type = 'cambridge'
    )
  );
$$;

revoke all on function private.school_head_authoritative_academic_summary(
  uuid, integer
) from public, anon, authenticated, service_role;

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
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  return private.school_head_authoritative_grade_performance(
    p_school_id,
    now() - make_interval(days => v_days),
    now()
  );
end;
$$;

revoke all on function public.school_head_get_grade_performance(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_grade_performance(uuid, integer)
  to authenticated;

comment on function public.school_head_get_grade_performance(uuid, integer) is
  'School Head grade performance from verified, grade-eligible assignment summaries and authority-qualified Cambridge attempts only.';

create or replace function private.school_head_authority_qualified_academic_decline(
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
  v_days integer := greatest(7, least(coalesce(p_days, 30), 180));
  v_count integer := 0;
  v_oldest timestamptz := null;
  v_affected jsonb := '[]'::jsonb;
begin
  with current_students as (
    select distinct
      sm.user_id as student_id,
      coalesce(c.grade_level, 'Unassigned') as grade_level
    from public.school_members sm
    join public.class_students cs on cs.student_id = sm.user_id
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = sm.school_id
     and c.is_active is distinct from false
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ),
  scored as materialized (
    select sw.*, cs.grade_level
    from private.school_head_authoritative_scored_work(
      p_school_id,
      now() - make_interval(days => v_days * 2),
      now()
    ) sw
    join current_students cs on cs.student_id = sw.student_id
  ),
  periods as (
    select
      grade_level,
      avg(percentage) filter (
        where observed_at >= now() - make_interval(days => v_days)
      ) as current_average,
      count(*) filter (
        where observed_at >= now() - make_interval(days => v_days)
      ) as current_count,
      avg(percentage) filter (
        where observed_at < now() - make_interval(days => v_days)
      ) as previous_average,
      count(*) filter (
        where observed_at < now() - make_interval(days => v_days)
      ) as previous_count,
      min(observed_at) filter (
        where observed_at >= now() - make_interval(days => v_days)
      ) as issue_at
    from scored
    group by grade_level
  ),
  issues as materialized (
    select
      grade_level,
      round(current_average, 1) as current_average,
      round(previous_average, 1) as previous_average,
      round(previous_average - current_average, 1) as decline,
      issue_at
    from periods
    where current_count >= 5
      and previous_count >= 5
      and previous_average - current_average >= 10
  ),
  sample as (
    select * from issues order by decline desc limit 12
  )
  select
    (select count(*) from issues),
    (select min(issue_at) from issues),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', 'Grade ' || coalesce(grade_level, 'Not set'),
        'detail', previous_average || '% → ' || current_average
          || '% · down ' || decline || ' points'
      ))
      from sample
    ), '[]'::jsonb)
  into v_count, v_oldest, v_affected;

  if v_count = 0 then
    return '[]'::jsonb;
  end if;

  return jsonb_build_array(private.school_head_make_decision(
    'academic_decline',
    'critical',
    v_count,
    'Academic performance has declined materially',
    format(
      '%s grade level(s) fell by at least 10 percentage points against the previous reporting period.',
      v_count
    ),
    'Review academic performance',
    'academic',
    'Academic performance',
    'Academic leadership',
    'A sustained decline in verified or authority-qualified evidence can indicate curriculum, engagement, or support problems.',
    v_oldest,
    v_affected
  ));
end;
$$;

revoke all on function private.school_head_authority_qualified_academic_decline(
  uuid, integer
) from public, anon, authenticated, service_role;

create or replace function private.school_head_authoritative_operational_decisions(
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
  v_legacy jsonb;
  v_kept jsonb;
begin
  v_legacy := private.school_head_build_operational_decisions(
    p_school_id, p_days
  );

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_kept
  from jsonb_array_elements(coalesce(v_legacy, '[]'::jsonb)) item
  where item->>'id' <> 'academic_decline';

  return v_kept || private.school_head_authority_qualified_academic_decline(
    p_school_id, p_days
  );
end;
$$;

revoke all on function private.school_head_authoritative_operational_decisions(
  uuid, integer
) from public, anon, authenticated, service_role;

-- Preserve the existing non-academic executive JSON contract behind a
-- non-callable compatibility implementation. The new public function below
-- replaces every official academic field and decision before returning.
do $$
begin
  if to_regprocedure(
    'public.school_head_get_executive_snapshot_unqualified_legacy_20260824(uuid,integer)'
  ) is null then
    execute 'alter function public.school_head_get_executive_snapshot(uuid, integer) '
      || 'rename to school_head_get_executive_snapshot_unqualified_legacy_20260824';
  end if;
end;
$$;

revoke all on function public.school_head_get_executive_snapshot_unqualified_legacy_20260824(
  uuid, integer
) from public, anon, authenticated, service_role;

create or replace function public.school_head_get_executive_snapshot(
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
  v_base jsonb;
  v_academic jsonb;
  v_operational jsonb;
  v_enriched jsonb;
begin
  if (select auth.uid()) is null
     or not coalesce(public.is_school_owner(p_school_id), false) then
    raise exception using
      errcode = '42501',
      message = 'school_head_access_required';
  end if;

  v_base := public.school_head_get_executive_snapshot_unqualified_legacy_20260824(
    p_school_id, p_days
  );
  v_academic := private.school_head_authoritative_academic_summary(
    p_school_id, p_days
  );
  v_operational := private.school_head_authoritative_operational_decisions(
    p_school_id, p_days
  );

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'first_seen_at', a.first_seen_at,
      'last_seen_at', a.last_seen_at,
      'alert_status', coalesce(a.status, 'open')
    )
  ), '[]'::jsonb)
  into v_enriched
  from jsonb_array_elements(v_operational) item
  left join public.school_head_decision_alerts a
    on a.school_id = p_school_id
   and a.decision_key = item->>'id';

  v_base := jsonb_set(
    v_base,
    '{academics,average}',
    coalesce(v_academic->'average', 'null'::jsonb),
    true
  );
  v_base := jsonb_set(
    v_base,
    '{academics,previous_average}',
    coalesce(v_academic->'previous_average', 'null'::jsonb),
    true
  );
  v_base := jsonb_set(
    v_base,
    '{academics,grade_performance}',
    coalesce(v_academic->'grade_performance', '[]'::jsonb),
    true
  );
  v_base := jsonb_set(
    v_base,
    '{programs,cambridge_attempts}',
    coalesce(v_academic->'cambridge_attempts', '0'::jsonb),
    true
  );
  v_base := jsonb_set(v_base, '{decisions}', v_enriched, true);

  return v_base;
end;
$$;

revoke all on function public.school_head_get_executive_snapshot(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_executive_snapshot(uuid, integer)
  to authenticated;

comment on function public.school_head_get_executive_snapshot(uuid, integer) is
  'School Head executive snapshot with verified assignment attainment, authority-qualified Cambridge metrics, and authority-qualified academic alerts.';

-- Production may not yet have the earlier compatibility migration. Define v2
-- explicitly so this migration has no dependency on that rollout. It preserves
-- the v1 JSON shape and applies the governed grade payload idempotently.
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

  v_snapshot := public.school_head_get_executive_snapshot(
    p_school_id, p_days
  );
  v_grade_performance := public.school_head_get_grade_performance(
    p_school_id, p_days
  );

  return jsonb_set(
    v_snapshot,
    '{academics,grade_performance}',
    coalesce(v_grade_performance, '[]'::jsonb),
    true
  );
end;
$$;

revoke all on function public.school_head_get_executive_snapshot_v2(
  uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_executive_snapshot_v2(
  uuid, integer
) to authenticated;

comment on function public.school_head_get_executive_snapshot_v2(
  uuid, integer
) is
  'Compatibility-safe School Head executive snapshot with verified assignment and authority-qualified Cambridge academic evidence.';

create or replace function private.refresh_school_head_decision_alerts(
  p_school_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decisions jsonb := private.school_head_authoritative_operational_decisions(
    p_school_id, p_days
  );
  v_decision jsonb;
  v_active_keys text[] := '{}'::text[];
  v_student_count integer;
  v_inactive_count integer;
  v_average numeric;
  v_missing integer;
  v_open integer;
  v_academic jsonb;
begin
  for v_decision in
    select value from jsonb_array_elements(v_decisions)
  loop
    v_active_keys := array_append(v_active_keys, v_decision->>'id');
    insert into public.school_head_decision_alerts(
      school_id, decision_key, severity, title, description, destination,
      decision_payload, status, first_seen_at, last_seen_at, resolved_at,
      next_in_app_at, next_email_at
    ) values (
      p_school_id, v_decision->>'id', v_decision->>'severity',
      v_decision->>'title', v_decision->>'description',
      v_decision->>'destination', v_decision, 'open', now(), now(), null,
      now(), case when v_decision->>'severity' = 'info' then null else now() end
    ) on conflict (school_id, decision_key) do update set
      severity = excluded.severity,
      title = excluded.title,
      description = excluded.description,
      destination = excluded.destination,
      decision_payload = excluded.decision_payload,
      status = 'open',
      first_seen_at = case
        when public.school_head_decision_alerts.status = 'resolved' then now()
        else public.school_head_decision_alerts.first_seen_at
      end,
      last_seen_at = now(),
      resolved_at = null,
      next_in_app_at = case
        when public.school_head_decision_alerts.status = 'resolved' then now()
        else public.school_head_decision_alerts.next_in_app_at
      end,
      next_email_at = case
        when public.school_head_decision_alerts.status = 'resolved'
          and excluded.severity <> 'info' then now()
        else public.school_head_decision_alerts.next_email_at
      end,
      updated_at = now();
  end loop;

  update public.school_head_decision_alerts
  set status = 'resolved',
      resolved_at = now(),
      updated_at = now(),
      next_in_app_at = null,
      next_email_at = null
  where school_id = p_school_id
    and status = 'open'
    and not (decision_key = any(v_active_keys));

  select count(*)
  into v_student_count
  from public.school_members sm
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.role_in_school = 'student';

  select count(*)
  into v_inactive_count
  from public.school_members sm
  join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.role_in_school = 'student'
    and (u.last_seen is null or u.last_seen < now() - interval '14 days');

  v_academic := private.school_head_authoritative_academic_summary(
    p_school_id, p_days
  );
  v_average := (v_academic->>'average')::numeric;

  select coalesce((
    select (d->>'count')::integer
    from jsonb_array_elements(v_decisions) d
    where d->>'id' = 'missing_class_subject_teachers'
  ), 0)
  into v_missing;

  insert into public.school_head_metric_snapshots(
    school_id, snapshot_date, student_count, inactive_student_count,
    academic_average, missing_class_subject_count
  ) values (
    p_school_id, current_date, v_student_count, v_inactive_count,
    v_average, v_missing
  ) on conflict (school_id, snapshot_date) do update set
    student_count = excluded.student_count,
    inactive_student_count = excluded.inactive_student_count,
    academic_average = excluded.academic_average,
    missing_class_subject_count = excluded.missing_class_subject_count,
    updated_at = now();

  select count(*)
  into v_open
  from public.school_head_decision_alerts
  where school_id = p_school_id
    and status = 'open';

  return jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'open_alerts', v_open,
    'decisions', v_decisions
  );
end;
$$;

revoke all on function private.refresh_school_head_decision_alerts(uuid, integer)
  from public, anon, authenticated, service_role;
