-- Canonical School Head engagement analytics.
--
-- Student engagement is based on auditable, timestamped Brains Heist learning
-- and gameplay events that are actually populated in production. Login
-- presence (users.last_seen) is deliberately not used for the executive
-- engagement KPI, learner-activity mix, 14-day re-engagement count, or trend.

create or replace function private.school_head_student_activity_events(
  p_school_id uuid
)
returns table (
  student_id uuid,
  occurred_at timestamptz,
  source text
)
language sql
stable
security definer
set search_path = ''
as $$
  with raw_activity(student_id, occurred_at, source) as (
    select qa.student_id, coalesce(qa.attempted_at, qa.created_at), 'question_attempt'
    from public.question_attempts qa

    union all
    select saa.student_id, saa.answered_at, 'assignment_answer'
    from public.student_assignment_answers saa

    union all
    select sar.student_id, sar.completed_at, 'assignment_result'
    from public.student_assignment_results sar

    union all
    select qs.student_id, qs.submitted_at, 'quiz_score'
    from public.quiz_scores qs
    where coalesce(qs.attempt_status, 'completed') <> 'deleted'

    union all
    select qr.user_id, qr.started_at, 'quest_run'
    from public.quest_runs qr

    union all
    select paa.attacker_id, paa.created_at, 'pvp_attack'
    from public.pvp_attack_attempts paa

    union all
    select bra.participant_id, bra.submitted_at, 'raid_attack'
    from public.brains_heist_raid_attacks bra

    union all
    select bbe.student_id, bbe.submitted_at, 'battle_event'
    from public.brains_heist_battle_events bbe

    union all
    select bsa.student_id, bsa.submitted_at, 'student_attempt'
    from public.brains_heist_student_attempts bsa

    union all
    select s.user_id, s.started_at, 'session'
    from public.sessions s

    union all
    select
      case
        when coalesce(w.payload->>'student_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (w.payload->>'student_id')::uuid
        else null
      end,
      w.created_at,
      'writing_submission'
    from public.bh_writing_daily_submissions w

    union all
    select ira.user_id, ira.started_at, 'ielts_reading'
    from public.ielts_reading_attempts ira

    union all
    select ila.user_id, ila.started_at, 'ielts_listening'
    from public.ielts_listening_attempts ila

    union all
    select iwa.user_id, iwa.submitted_at, 'ielts_writing'
    from public.ielts_writing_attempts iwa

    union all
    select isa.user_id, isa.submitted_at, 'ielts_speaking'
    from public.ielts_speaking_attempts isa

    union all
    select ima.user_id, ima.started_at, 'ielts_mock'
    from public.ielts_mock_test_attempts ima

    union all
    select iea.student_id, iea.started_at, 'ielts_exam'
    from public.ielts_exam_attempts iea
  )
  select r.student_id, r.occurred_at, r.source
  from raw_activity r
  join public.school_members sm
    on sm.user_id = r.student_id
   and sm.school_id = p_school_id
   and sm.status = 'active'
   and sm.role_in_school = 'student'
  where r.student_id is not null
    and r.occurred_at is not null;
$$;

revoke all on function private.school_head_student_activity_events(uuid)
  from public, anon, authenticated, service_role;

comment on function private.school_head_student_activity_events(uuid) is
  'Internal school-scoped stream of timestamped learner learning/gameplay events used by School Head engagement analytics.';

create or replace function private.school_head_engagement_summary(
  p_school_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with enrolled as (
    select distinct sm.user_id as student_id
    from public.school_members sm
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ),
  last_activity as materialized (
    select e.student_id, max(e.occurred_at) as last_activity_at
    from private.school_head_student_activity_events(p_school_id) e
    group by e.student_id
  )
  select jsonb_build_object(
    'student_total', count(*)::integer,
    'active_students_7d', count(*) filter (
      where la.last_activity_at >= now() - interval '7 days'
    )::integer,
    'active_students_14d', count(*) filter (
      where la.last_activity_at >= now() - interval '14 days'
    )::integer,
    'active_students_30d', count(*) filter (
      where la.last_activity_at >= now() - interval '30 days'
    )::integer,
    'inactive_students_14d', count(*) filter (
      where la.last_activity_at is null
         or la.last_activity_at < now() - interval '14 days'
    )::integer,
    'latest_activity_at', max(la.last_activity_at),
    'definition', 'Distinct enrolled learners with at least one recorded Brains Heist learning or gameplay event in the reporting window.'
  )
  from enrolled en
  left join last_activity la on la.student_id = en.student_id;
$$;

revoke all on function private.school_head_engagement_summary(uuid)
  from public, anon, authenticated, service_role;

comment on function private.school_head_engagement_summary(uuid) is
  'Canonical School Head learner engagement summary based on recorded learning/gameplay events rather than login presence.';

create or replace function public.school_head_get_engagement_trend(
  p_school_id uuid,
  p_weeks integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_weeks integer := greatest(4, least(coalesce(p_weeks, 8), 12));
  v_summary jsonb;
  v_students integer := 0;
  v_points jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  v_summary := private.school_head_engagement_summary(p_school_id);
  v_students := coalesce((v_summary->>'student_total')::integer, 0);

  with buckets as (
    select
      g as bucket_index,
      now() - make_interval(days => ((v_weeks - g) * 7)) as starts_at,
      now() - make_interval(days => ((v_weeks - g - 1) * 7)) as ends_at
    from generate_series(0, v_weeks - 1) as g
  ),
  school_activity as materialized (
    select e.student_id, e.occurred_at
    from private.school_head_student_activity_events(p_school_id) e
    where e.occurred_at >= now() - make_interval(days => (v_weeks * 7))
      and e.occurred_at < now()
  ),
  weekly as (
    select
      b.bucket_index,
      b.starts_at,
      b.ends_at,
      count(distinct sa.student_id)::integer as active_students
    from buckets b
    left join school_activity sa
      on sa.occurred_at >= b.starts_at
     and sa.occurred_at < b.ends_at
    group by b.bucket_index, b.starts_at, b.ends_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'label', to_char(w.starts_at, 'Mon DD'),
        'starts_at', w.starts_at,
        'ends_at', w.ends_at,
        'active_students', w.active_students,
        'activity_rate', case
          when v_students > 0 then round((w.active_students::numeric * 100) / v_students, 1)
          else 0
        end
      )
      order by w.bucket_index
    ),
    '[]'::jsonb
  )
  into v_points
  from weekly w;

  return jsonb_build_object(
    'weeks', v_weeks,
    'student_total', v_students,
    'active_students_7d', coalesce((v_summary->>'active_students_7d')::integer, 0),
    'active_students_14d', coalesce((v_summary->>'active_students_14d')::integer, 0),
    'active_students_30d', coalesce((v_summary->>'active_students_30d')::integer, 0),
    'inactive_students_14d', coalesce((v_summary->>'inactive_students_14d')::integer, 0),
    'latest_activity_at', v_summary->'latest_activity_at',
    'definition', v_summary->>'definition',
    'points', v_points,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.school_head_get_engagement_trend(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_engagement_trend(uuid, integer)
  to authenticated;

comment on function public.school_head_get_engagement_trend(uuid, integer) is
  'School Head-only weekly learner engagement trend from actual recorded learning/gameplay events across Brains Heist modules.';

-- Keep the executive Overview snapshot on the same canonical engagement
-- definition as the trend. Academic authority logic remains unchanged.
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
  v_engagement jsonb;
  v_decisions jsonb := '[]'::jsonb;
  v_inactive_14d integer := 0;
  v_had_inactive boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if p_school_id is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  v_snapshot := public.school_head_get_executive_snapshot(p_school_id, p_days);
  v_grade_performance := public.school_head_get_grade_performance(p_school_id, p_days);
  v_engagement := private.school_head_engagement_summary(p_school_id);
  v_inactive_14d := coalesce((v_engagement->>'inactive_students_14d')::integer, 0);

  v_snapshot := jsonb_set(
    v_snapshot,
    '{academics,grade_performance}',
    coalesce(v_grade_performance, '[]'::jsonb),
    true
  );

  v_snapshot := jsonb_set(
    v_snapshot,
    '{engagement,active_students_7d}',
    to_jsonb(coalesce((v_engagement->>'active_students_7d')::integer, 0)),
    true
  );
  v_snapshot := jsonb_set(
    v_snapshot,
    '{engagement,active_students_30d}',
    to_jsonb(coalesce((v_engagement->>'active_students_30d')::integer, 0)),
    true
  );
  v_snapshot := jsonb_set(
    v_snapshot,
    '{engagement,inactive_students_14d}',
    to_jsonb(v_inactive_14d),
    true
  );
  v_snapshot := jsonb_set(
    v_snapshot,
    '{engagement,definition}',
    to_jsonb(v_engagement->>'definition'),
    true
  );
  v_snapshot := jsonb_set(
    v_snapshot,
    '{engagement,latest_activity_at}',
    coalesce(v_engagement->'latest_activity_at', 'null'::jsonb),
    true
  );

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_snapshot->'decisions', '[]'::jsonb)) item
    where item->>'id' = 'inactive_students'
  ) into v_had_inactive;

  select coalesce(
    jsonb_agg(
      case
        when item->>'id' = 'inactive_students' then
          item || jsonb_build_object(
            'count', v_inactive_14d,
            'description', format(
              '%s student(s) have no recorded learning or gameplay activity in the last 14 days.',
              v_inactive_14d
            )
          )
        else item
      end
      order by ord
    ) filter (where item->>'id' <> 'inactive_students' or v_inactive_14d > 0),
    '[]'::jsonb
  )
  into v_decisions
  from jsonb_array_elements(coalesce(v_snapshot->'decisions', '[]'::jsonb))
    with ordinality as d(item, ord);

  if v_inactive_14d > 0 and not v_had_inactive then
    v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
      'id', 'inactive_students',
      'severity', 'warning',
      'count', v_inactive_14d,
      'title', 'Student engagement needs attention',
      'description', format(
        '%s student(s) have no recorded learning or gameplay activity in the last 14 days.',
        v_inactive_14d
      ),
      'action', 'Review engagement',
      'destination', 'academic'
    ));
  end if;

  v_snapshot := jsonb_set(v_snapshot, '{decisions}', v_decisions, true);

  return v_snapshot;
end;
$$;

revoke all on function public.school_head_get_executive_snapshot_v2(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_executive_snapshot_v2(uuid, integer)
  to authenticated;

comment on function public.school_head_get_executive_snapshot_v2(uuid, integer) is
  'School Head executive snapshot with authoritative academic evidence and canonical recorded learner engagement.';