-- Phase 2: make assignment evidence meaningful, complete, and safe for longitudinal focus-state decisions.
-- Tiny samples remain visible in the history but do not drive persistent weakness/strength labels.

alter table public.student_learning_observations
  add column if not exists evidence_quality text not null default 'standard'
    check (evidence_quality in ('provisional', 'standard', 'strong')),
  add column if not exists contributes_to_focus_state boolean not null default true;

create index if not exists idx_student_learning_observations_focus_contributors
  on public.student_learning_observations(student_id, skill_key, observed_at desc)
  where contributes_to_focus_state = true;

create or replace function public.student_learning_refresh_focus_state(p_student_id uuid, p_skill_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.student_learning_observations%rowtype;
  v_first_at timestamptz;
  v_last_at timestamptz;
  v_focus integer := 0;
  v_developing integer := 0;
  v_strength integer := 0;
  v_recent_focus integer := 0;
  v_recent_developing integer := 0;
  v_recent_strength integer := 0;
  v_items integer := 0;
  v_occurrences integer := 0;
  v_status text;
  v_trend text;
  v_priority text;
begin
  if p_student_id is null or nullif(trim(p_skill_key), '') is null then return; end if;

  select o.* into v_latest
  from public.student_learning_observations o
  where o.student_id = p_student_id
    and o.skill_key = p_skill_key
    and o.contributes_to_focus_state = true
  order by o.observed_at desc, o.created_at desc, o.id desc
  limit 1;

  if not found then
    delete from public.student_learning_focus_states s
    where s.student_id = p_student_id and s.skill_key = p_skill_key;
    return;
  end if;

  select min(o.observed_at), max(o.observed_at),
    count(*) filter (where o.observation_type = 'focus')::integer,
    count(*) filter (where o.observation_type = 'developing')::integer,
    count(*) filter (where o.observation_type = 'strength')::integer,
    count(*)::integer,
    coalesce(sum(o.evidence_count), 0)::integer
  into v_first_at, v_last_at, v_focus, v_developing, v_strength, v_items, v_occurrences
  from public.student_learning_observations o
  where o.student_id = p_student_id
    and o.skill_key = p_skill_key
    and o.contributes_to_focus_state = true;

  with recent as (
    select o.observation_type
    from public.student_learning_observations o
    where o.student_id = p_student_id
      and o.skill_key = p_skill_key
      and o.contributes_to_focus_state = true
    order by o.observed_at desc, o.created_at desc, o.id desc
    limit 3
  )
  select count(*) filter (where observation_type = 'focus')::integer,
    count(*) filter (where observation_type = 'developing')::integer,
    count(*) filter (where observation_type = 'strength')::integer
  into v_recent_focus, v_recent_developing, v_recent_strength
  from recent;

  if v_focus = 0 then
    if v_strength >= 2 then
      v_status := 'consistent_strength'; v_trend := 'strong';
    else
      v_status := 'emerging_strength';
      v_trend := case when v_latest.observation_type = 'strength' then 'strong' else 'stable' end;
    end if;
  elsif v_latest.observation_type = 'strength' and v_recent_strength >= 2 and v_recent_focus = 0 then
    v_status := 'resolved'; v_trend := 'resolved';
  elsif v_latest.observation_type in ('strength', 'developing')
      and (v_recent_strength + v_recent_developing) >= 2 and v_recent_focus <= 1 then
    v_status := 'improving'; v_trend := 'improving';
  elsif v_focus >= 3 and v_recent_focus >= 2 then
    v_status := 'persistent';
    v_trend := case when v_latest.observation_type = 'focus' then 'stable' else 'improving' end;
  elsif v_focus >= 2 then
    v_status := 'recurring';
    v_trend := case
      when v_latest.observation_type = 'focus' and v_recent_focus >= 2 then 'declining'
      when v_latest.observation_type in ('strength', 'developing') then 'improving'
      else 'stable'
    end;
  else
    v_status := 'new_focus';
    v_trend := case when v_latest.observation_type = 'focus' then 'stable' else 'improving' end;
  end if;

  v_priority := case
    when v_status = 'persistent' then 'high'
    when v_status in ('recurring', 'new_focus') then 'medium'
    else 'low'
  end;

  insert into public.student_learning_focus_states (
    school_id, student_id, subject, topic, skill, subskill, skill_key,
    first_observed_at, last_observed_at,
    focus_occurrences, developing_occurrences, strength_occurrences,
    recent_focus_occurrences, recent_developing_occurrences, recent_strength_occurrences,
    latest_observation_type, current_status, trend, priority,
    latest_evidence_percentage, evidence_items, evidence_occurrences, updated_at
  ) values (
    v_latest.school_id, v_latest.student_id, v_latest.subject, v_latest.topic,
    v_latest.skill, v_latest.subskill, v_latest.skill_key,
    v_first_at, v_last_at,
    v_focus, v_developing, v_strength,
    v_recent_focus, v_recent_developing, v_recent_strength,
    v_latest.observation_type, v_status, v_trend, v_priority,
    v_latest.evidence_percentage, v_items, v_occurrences, now()
  )
  on conflict (student_id, skill_key) do update set
    school_id = excluded.school_id,
    subject = excluded.subject,
    topic = excluded.topic,
    skill = excluded.skill,
    subskill = excluded.subskill,
    first_observed_at = excluded.first_observed_at,
    last_observed_at = excluded.last_observed_at,
    focus_occurrences = excluded.focus_occurrences,
    developing_occurrences = excluded.developing_occurrences,
    strength_occurrences = excluded.strength_occurrences,
    recent_focus_occurrences = excluded.recent_focus_occurrences,
    recent_developing_occurrences = excluded.recent_developing_occurrences,
    recent_strength_occurrences = excluded.recent_strength_occurrences,
    latest_observation_type = excluded.latest_observation_type,
    current_status = excluded.current_status,
    trend = excluded.trend,
    priority = excluded.priority,
    latest_evidence_percentage = excluded.latest_evidence_percentage,
    evidence_items = excluded.evidence_items,
    evidence_occurrences = excluded.evidence_occurrences,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.student_learning_refresh_focus_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.student_learning_refresh_focus_state(uuid, text)
  to service_role;

create or replace function public.student_learning_extract_tag(p_tags text[], p_prefix text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(trim(substring(tag from char_length(p_prefix) + 1)), '')
  from unnest(coalesce(p_tags, array[]::text[])) tag
  where lower(tag) like lower(p_prefix) || '%'
  order by tag
  limit 1;
$$;

revoke all on function public.student_learning_extract_tag(text[], text)
  from public, anon, authenticated;
grant execute on function public.student_learning_extract_tag(text[], text)
  to service_role;

create or replace function public.student_learning_ingest_assignment_result(
  p_assignment_id uuid,
  p_student_id uuid,
  p_completed_at timestamptz,
  p_accuracy integer,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment record;
  v_school_id uuid;
  v_expected_count integer := 0;
  v_answered_count integer := 0;
  v_result_correct integer := 0;
  v_result_incorrect integer := 0;
  v_student_status text;
  v_group record;
  v_percentage numeric;
  v_kind text;
  v_skill_key text;
  v_source_key text;
  v_quality text;
  v_contributes boolean;
begin
  if p_assignment_id is null or p_student_id is null or p_completed_at is null then return; end if;

  select
    a.school_id,
    a.class_id,
    a.teacher_id,
    a.title,
    a.difficulty,
    coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), ''), 'General') as subject_name,
    coalesce(nullif(trim(a.topic_name), ''), nullif(trim(a.title), ''), 'General') as default_topic,
    sa.status,
    r.correct,
    r.incorrect,
    count(aq.question_id)::integer as expected_count
  into v_assignment
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id = a.id and sa.student_id = p_student_id
  join public.student_assignment_results r
    on r.assignment_id = a.id and r.student_id = p_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.subject_name, a.subject, a.subject_id, a.topic_name,
    sa.status, r.correct, r.incorrect;

  if not found then return; end if;

  v_expected_count := coalesce(v_assignment.expected_count, 0);
  v_result_correct := coalesce(v_assignment.correct, 0);
  v_result_incorrect := coalesce(v_assignment.incorrect, 0);
  v_student_status := v_assignment.status;

  select count(*)::integer into v_answered_count
  from public.student_assignment_answers saa
  where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id;

  -- Only an authoritative, fully-completed assignment can create longitudinal evidence.
  if v_student_status <> 'completed'
     or v_expected_count <= 0
     or v_answered_count <> v_expected_count
     or (v_result_correct + v_result_incorrect) <> v_expected_count then
    return;
  end if;

  select coalesce(v_assignment.school_id, u.school_id) into v_school_id
  from public.users u where u.id = p_student_id;
  if v_school_id is null then return; end if;

  for v_group in
    select
      coalesce(nullif(trim(qd.topic_name), ''), nullif(trim(qd.topic), ''), v_assignment.default_topic) as topic_name,
      coalesce(
        public.student_learning_extract_tag(qd.tags, 'skill:'),
        coalesce(nullif(trim(qd.topic_name), ''), nullif(trim(qd.topic), ''), v_assignment.default_topic)
      ) as skill_name,
      public.student_learning_extract_tag(qd.tags, 'subskill:') as subskill_name,
      count(*)::integer as question_count,
      count(*) filter (where saa.is_correct is true)::integer as correct_count
    from public.student_assignment_answers saa
    left join public.assignment_question_details qd
      on qd.assignment_id = saa.assignment_id and qd.question_id = saa.question_id
    where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id
    group by 1, 2, 3
  loop
    if v_group.question_count <= 0 then continue; end if;

    v_percentage := round((v_group.correct_count::numeric / v_group.question_count::numeric) * 100, 2);
    v_kind := case
      when v_percentage < 60 then 'focus'
      when v_percentage >= 80 then 'strength'
      else 'developing'
    end;
    v_quality := case
      when v_group.question_count < 3 then 'provisional'
      when v_group.question_count < 6 then 'standard'
      else 'strong'
    end;
    v_contributes := v_group.question_count >= 3;
    v_skill_key := public.student_learning_build_skill_key(
      v_assignment.subject_name, v_group.topic_name, v_group.skill_name, v_group.subskill_name
    );
    v_source_key := concat_ws(':', 'assignment', p_assignment_id::text, 'topic', md5(v_skill_key));

    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence_quality, contributes_to_focus_state,
      evidence, system_generated
    ) values (
      v_school_id, p_student_id, v_assignment.subject_name, v_group.topic_name,
      v_group.skill_name, v_group.subskill_name, v_skill_key,
      v_kind, 'assignment_result', p_assignment_id, v_source_key, p_completed_at,
      v_percentage, v_group.question_count, v_quality, v_contributes,
      jsonb_build_object(
        'assignment_id', p_assignment_id,
        'assignment_title', v_assignment.title,
        'class_id', v_assignment.class_id,
        'teacher_id', v_assignment.teacher_id,
        'difficulty', v_assignment.difficulty,
        'topic', v_group.topic_name,
        'skill', v_group.skill_name,
        'subskill', v_group.subskill_name,
        'correct', v_group.correct_count,
        'incorrect', v_group.question_count - v_group.correct_count,
        'question_count', v_group.question_count,
        'expected_question_count', v_expected_count,
        'answered_question_count', v_answered_count,
        'overall_accuracy', p_accuracy,
        'overall_score', p_score,
        'classification_thresholds', jsonb_build_object('focus_below', 60, 'strength_from', 80),
        'evidence_quality', v_quality,
        'contributes_to_focus_state', v_contributes
      ),
      true
    )
    on conflict (student_id, source_key) do update set
      observed_at = excluded.observed_at,
      observation_type = excluded.observation_type,
      evidence_percentage = excluded.evidence_percentage,
      evidence_count = excluded.evidence_count,
      evidence_quality = excluded.evidence_quality,
      contributes_to_focus_state = excluded.contributes_to_focus_state,
      evidence = excluded.evidence;
  end loop;
end;
$$;

revoke all on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer)
  to service_role;

-- Rebuild only assignment-derived history using the stricter Phase 2 rules.
delete from public.student_learning_observations
where source_type = 'assignment_result';

do $backfill_meaningful_assignment_evidence$
declare r record;
begin
  for r in
    select assignment_id, student_id, completed_at, accuracy, score
    from public.student_assignment_results
    where completed_at is not null
    order by completed_at, assignment_id, student_id
  loop
    perform public.student_learning_ingest_assignment_result(
      r.assignment_id, r.student_id, r.completed_at, r.accuracy, r.score
    );
  end loop;
end
$backfill_meaningful_assignment_evidence$;

-- Rebuild the projection so provisional assignment evidence never influences current status.
delete from public.student_learning_focus_states;

do $rebuild_learning_focus_projection$
declare r record;
begin
  for r in
    select distinct student_id, skill_key
    from public.student_learning_observations
    where contributes_to_focus_state = true
    order by student_id, skill_key
  loop
    perform public.student_learning_refresh_focus_state(r.student_id, r.skill_key);
  end loop;
end
$rebuild_learning_focus_projection$;
