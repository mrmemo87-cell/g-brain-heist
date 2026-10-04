-- Questions inside an assignment are pooled before confidence or progress classification.
-- Raw item observations stay append-only for audit and question-level review.
create or replace function private.academic_assignment_assessment_observations(
  p_student_id uuid, p_skill_key text, p_as_of timestamptz
) returns setof public.student_learning_observations
language sql stable security definer set search_path = ''
as $$
  with eligible as (
    select o.* from public.student_learning_observations o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.observed_at <= p_as_of
      and o.source_type in ('assignment_result','registry_verified_assignment')
      and public.student_learning_observation_is_qualified(o.source_type,o.contributes_to_focus_state,o.evidence)
  ), grouped as (
    select source_type, coalesce(source_id::text,source_key) instance, academic_year_id,
      (array_agg(id order by observed_at desc,created_at desc,id desc))[1] latest_id,
      sum(evidence_count)::integer items,
      string_agg(distinct coalesce(nullif(evidence->>'evidence_focus_code',''),p_skill_key),'|'
        order by coalesce(nullif(evidence->>'evidence_focus_code',''),p_skill_key)) focus_signature,
      case when count(evidence_percentage)=count(*) and sum(evidence_count)>0
        then round(sum(evidence_percentage * evidence_count)/sum(evidence_count),2) end percentage
    from eligible group by source_type,coalesce(source_id::text,source_key),academic_year_id
  )
  select (jsonb_populate_record(null::public.student_learning_observations,
    to_jsonb(o) || jsonb_build_object(
      'evidence_count',g.items,'evidence_percentage',g.percentage,
      'evidence',o.evidence || jsonb_build_object('assessment_focus_signature',g.focus_signature),
      'observation_type',case when g.percentage is null then o.observation_type
        when g.percentage<60 then 'focus' when g.percentage>=80 then 'strength' else 'developing' end
    ))).*
  from grouped g join eligible o on o.id=g.latest_id
  union all
  select o.* from public.student_learning_observations o
  where o.student_id=p_student_id and o.skill_key=p_skill_key and o.observed_at<=p_as_of
    and not (o.source_type in ('assignment_result','registry_verified_assignment')
      and public.student_learning_observation_is_qualified(o.source_type,o.contributes_to_focus_state,o.evidence));
$$;
revoke all on function private.academic_assignment_assessment_observations(uuid,text,timestamptz)
  from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.student_learning_rebuild_confidence_state(p_student_id uuid, p_skill_key text, p_as_of timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_latest public.student_learning_observations%rowtype;
  v_policy public.academic_evidence_confidence_policies%rowtype;
  v_metrics record;
  v_recent record;
  v_last_focus timestamptz;
  v_recovery integer := 0;
  v_age integer;
  v_span integer := 0;
  v_volume numeric := 0;
  v_observations numeric := 0;
  v_quality numeric := 0;
  v_recency numeric := 0;
  v_diversity numeric := 0;
  v_mapping numeric := 0;
  v_coverage numeric := 0;
  v_span_score numeric := 0;
  v_consistency numeric := 0;
  v_score numeric := 0;
  v_band text := 'none';
  v_assessment text := 'not_assessed';
  v_decision boolean := false;
  v_persistent boolean := false;
  v_resolution boolean := false;
  v_strength boolean := false;
  v_objective_id uuid;
  v_scope_id uuid;
  v_framework_id uuid;
begin
  if p_student_id is null or nullif(trim(p_skill_key), '') is null then return; end if;
  if p_as_of is null then raise exception 'confidence_as_of_is_required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text || ':' || trim(p_skill_key), 0)
  );

  select * into v_policy
  from public.academic_evidence_confidence_policies p
  where p.policy_key = 'longitudinal-confidence' and p.status = 'active'
  order by p.version desc limit 1;
  if not found then raise exception 'active_confidence_policy_missing'; end if;

  select o.* into v_latest
  from private.academic_assignment_assessment_observations(p_student_id,p_skill_key,p_as_of) o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and o.observed_at <= p_as_of
  order by o.observed_at desc, o.created_at desc, o.id desc limit 1;

  if not found then
    delete from public.student_learning_confidence_states c
    where c.student_id = p_student_id and c.skill_key = p_skill_key;
    return;
  end if;

  with scoped as (
    select o.*,
      public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      ) as is_qualified,
      case
        when o.source_type = 'cambridge_attempt' then coalesce((
          select avg((m.value->>'mappingConfidence')::numeric)
          from jsonb_array_elements(o.evidence->'mapping_snapshots') m(value)
          where (m.value->>'mappingConfidence') ~ '^[0-9]+(?:\.[0-9]+)?$'
        ), 0)
        when o.academic_subject_id is not null and o.academic_year_id is not null then 0.65
        when o.academic_subject_id is not null then 0.50
        else 0.35
      end as observation_mapping_score,
      case
        when o.source_type = 'cambridge_attempt' then coalesce((
          select r.mapping_coverage_percent / 100
          from public.cambridge_evidence_runs r
          where r.id = public.student_learning_try_uuid(o.evidence->>'evidence_run_id')
        ), 0)
        when o.academic_subject_id is not null and o.academic_year_id is not null then 0.65
        when o.academic_subject_id is not null then 0.50
        else 0.35
      end as observation_coverage_score
    from private.academic_assignment_assessment_observations(p_student_id,p_skill_key,p_as_of) o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.observed_at <= p_as_of
      and o.academic_year_id is not distinct from v_latest.academic_year_id
  )
  select
    count(*)::integer as total,
    count(*) filter (where is_qualified)::integer as qualified,
    coalesce(sum(evidence_count) filter (where is_qualified), 0)::integer as items,
    count(distinct source_type) filter (where is_qualified)::integer as source_types,
    count(distinct concat(source_type, ':', coalesce(source_id::text, source_key)))
      filter (where is_qualified)::integer as source_instances,
    count(*) filter (where is_qualified and observation_type = 'focus')::integer as focus_count,
    count(*) filter (where is_qualified and observation_type = 'developing')::integer as developing_count,
    count(*) filter (where is_qualified and observation_type = 'strength')::integer as strength_count,
    min(observed_at) filter (where is_qualified) as first_at,
    max(observed_at) filter (where is_qualified) as last_at,
    coalesce(avg(case evidence_quality when 'strong' then 1.0 when 'standard' then 0.75 else 0.40 end)
      filter (where is_qualified), 0) as quality_value,
    coalesce(avg(observation_mapping_score) filter (where is_qualified), 0) as mapping_value,
    coalesce(avg(observation_coverage_score) filter (where is_qualified), 0) as coverage_value
  into v_metrics
  from scoped;

  with recent as (
    select o.observation_type, o.observed_at, o.source_type,
      coalesce(nullif(o.evidence->>'assessment_focus_signature',''),nullif(o.evidence->>'evidence_focus_code',''),p_skill_key) focus_signature
    from private.academic_assignment_assessment_observations(p_student_id,p_skill_key,p_as_of) o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.observed_at <= p_as_of
      and o.academic_year_id is not distinct from v_latest.academic_year_id
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
    order by o.observed_at desc, o.created_at desc, o.id desc limit 3
  )
  select count(*) filter (where observation_type = 'focus')::integer as focus_count,
    count(*) filter (where observation_type = 'developing')::integer as developing_count,
    count(*) filter (where observation_type = 'strength')::integer as strength_count
   , count(distinct (observed_at at time zone 'UTC')::date)::integer as assessment_dates,
    exists(select 1 from recent a join recent b
      on a.source_type=b.source_type and a.focus_signature=b.focus_signature
      and (a.observed_at at time zone 'UTC')::date <> (b.observed_at at time zone 'UTC')::date
      where a.observation_type='focus' and b.observation_type='strength') as comparable_conflict
  into v_recent from recent;

  select max(o.observed_at) into v_last_focus
  from private.academic_assignment_assessment_observations(p_student_id,p_skill_key,p_as_of) o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and o.observed_at <= p_as_of
    and o.academic_year_id is not distinct from v_latest.academic_year_id
    and o.observation_type = 'focus'
    and public.student_learning_observation_is_qualified(
      o.source_type, o.contributes_to_focus_state, o.evidence
    );
  if v_last_focus is not null then
    select count(*)::integer into v_recovery
    from private.academic_assignment_assessment_observations(p_student_id,p_skill_key,p_as_of) o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.observed_at > v_last_focus and o.observed_at <= p_as_of
      and o.academic_year_id is not distinct from v_latest.academic_year_id
      and o.observation_type in ('developing', 'strength')
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      );
  end if;

  if v_metrics.last_at is not null then
    v_age := greatest(p_as_of::date - v_metrics.last_at::date, 0);
    v_span := greatest(v_metrics.last_at::date - v_metrics.first_at::date, 0);
  end if;
  v_volume := least(v_metrics.items::numeric / 10, 1);
  v_observations := least(v_metrics.qualified::numeric / 4, 1);
  v_quality := least(greatest(v_metrics.quality_value, 0), 1);
  v_recency := case when v_age is null then 0 when v_age <= 30 then 1
    when v_age <= 90 then 0.85 when v_age <= 180 then 0.65
    when v_age <= 365 then 0.40 else 0.20 end;
  v_diversity := case when v_metrics.source_types >= 2 then 1
    when v_metrics.source_instances >= 3 then 0.80
    when v_metrics.source_instances >= 2 then 0.65
    when v_metrics.source_instances = 1 then 0.35 else 0 end;
  v_mapping := least(greatest(v_metrics.mapping_value, 0), 1);
  v_coverage := least(greatest(v_metrics.coverage_value, 0), 1);
  v_span_score := case when v_span >= 28 then 1 when v_span >= 7 then 0.65
    when v_span > 0 then 0.35 when v_metrics.qualified > 0 then 0.20 else 0 end;
  v_consistency := case when v_metrics.qualified = 0 then 0 else
    greatest(v_metrics.focus_count, v_metrics.developing_count, v_metrics.strength_count)::numeric
      / v_metrics.qualified end;

  v_score := round(100 * (
    v_volume * (v_policy.weights->>'evidence_volume')::numeric +
    v_observations * (v_policy.weights->>'qualifying_observations')::numeric +
    v_quality * (v_policy.weights->>'evidence_quality')::numeric +
    v_recency * (v_policy.weights->>'recency')::numeric +
    v_diversity * (v_policy.weights->>'source_diversity')::numeric +
    v_mapping * (v_policy.weights->>'mapping_quality')::numeric +
    v_coverage * (v_policy.weights->>'source_coverage')::numeric +
    v_span_score * (v_policy.weights->>'time_span')::numeric +
    v_consistency * (v_policy.weights->>'consistency')::numeric
  ), 2);
  v_band := case when v_metrics.qualified = 0 then 'none'
    when v_score >= (v_policy.thresholds->>'confidence_band_high_from')::numeric then 'high'
    when v_score >= (v_policy.thresholds->>'confidence_band_medium_from')::numeric then 'medium'
    else 'low' end;
  v_decision :=
    v_score >= (v_policy.thresholds->>'decision_score_from')::numeric
    and v_metrics.qualified >= (v_policy.thresholds->>'decision_min_observations')::integer
    and v_metrics.items >= (v_policy.thresholds->>'decision_min_evidence_items')::integer
    and v_age <= (v_policy.thresholds->>'decision_max_age_days')::integer;
  v_persistent :=
    v_score >= (v_policy.thresholds->>'persistent_score_from')::numeric
    and v_metrics.focus_count >= (v_policy.thresholds->>'persistent_min_focus_observations')::integer
    and v_metrics.source_instances >= (v_policy.thresholds->>'persistent_min_source_instances')::integer
    and v_span >= (v_policy.thresholds->>'persistent_min_span_days')::integer
    and v_age <= (v_policy.thresholds->>'persistent_max_age_days')::integer;
  v_resolution :=
    v_score >= (v_policy.thresholds->>'resolution_score_from')::numeric
    and v_metrics.focus_count >= (v_policy.thresholds->>'resolution_min_prior_focus')::integer
    and v_recovery >= (v_policy.thresholds->>'resolution_min_recovery_observations')::integer
    and v_metrics.source_instances >= (v_policy.thresholds->>'resolution_min_source_instances')::integer
    and v_age <= (v_policy.thresholds->>'resolution_max_age_days')::integer;
  v_strength :=
    v_score >= (v_policy.thresholds->>'strength_score_from')::numeric
    and v_metrics.strength_count >= (v_policy.thresholds->>'strength_min_observations')::integer
    and v_metrics.source_instances >= (v_policy.thresholds->>'strength_min_source_instances')::integer
    and v_span >= (v_policy.thresholds->>'strength_min_span_days')::integer
    and v_age <= (v_policy.thresholds->>'strength_max_age_days')::integer;
  v_assessment := case
    when v_metrics.qualified = 0 then 'not_assessed'
    when v_age > (v_policy.thresholds->>'stale_after_days')::integer then 'stale'
    when v_recent.comparable_conflict and v_recent.assessment_dates > 1 and coalesce(v_recent.focus_count, 0) > 0 and coalesce(v_recent.strength_count, 0) > 0
      then 'contradictory'
    when not v_decision then 'low_data'
    else 'assessed'
  end;

  v_objective_id := public.student_learning_try_uuid(v_latest.evidence->>'curriculum_objective_id');
  v_scope_id := public.student_learning_try_uuid(v_latest.evidence->>'curriculum_scope_id');
  v_framework_id := public.student_learning_try_uuid(v_latest.evidence->>'framework_version_id');

  insert into public.student_learning_confidence_states(
    policy_id, school_id, student_id, academic_year_id, academic_subject_id,
    framework_version_id, curriculum_scope_id, curriculum_objective_id, grade_level,
    subject, topic, skill, subskill, skill_key, as_of_at, first_qualified_at,
    last_qualified_at, total_observations, qualifying_observations, evidence_items,
    source_type_count, source_instance_count, focus_observations, developing_observations,
    strength_observations, recent_focus_observations, recent_developing_observations,
    recent_strength_observations, recovery_observations_after_last_focus,
    evidence_age_days, evidence_span_days, evidence_volume_score, observation_score,
    quality_score, recency_score, diversity_score, mapping_score, source_coverage_score,
    span_score, consistency_score, confidence_score, confidence_band, assessment_state,
    decision_eligible, persistent_eligible, resolution_eligible, strength_eligible,
    teacher_review_required, gate_results, disclosure, computed_at
  ) values (
    v_policy.id, v_latest.school_id, v_latest.student_id, v_latest.academic_year_id,
    v_latest.academic_subject_id, v_framework_id, v_scope_id, v_objective_id,
    v_latest.grade_level_at_time, v_latest.subject, v_latest.topic, v_latest.skill,
    v_latest.subskill, v_latest.skill_key, p_as_of, v_metrics.first_at, v_metrics.last_at,
    v_metrics.total, v_metrics.qualified, v_metrics.items, v_metrics.source_types,
    v_metrics.source_instances, v_metrics.focus_count, v_metrics.developing_count,
    v_metrics.strength_count, coalesce(v_recent.focus_count, 0),
    coalesce(v_recent.developing_count, 0), coalesce(v_recent.strength_count, 0),
    v_recovery, v_age, v_span, v_volume, v_observations, v_quality, v_recency,
    v_diversity, v_mapping, v_coverage, v_span_score, v_consistency, v_score,
    v_band, v_assessment, v_decision, v_persistent, v_resolution, v_strength,
    v_assessment = 'contradictory' or v_persistent or v_resolution,
    jsonb_build_object(
      'decision', jsonb_build_object('passed', v_decision,
        'minimumScore', (v_policy.thresholds->>'decision_score_from')::numeric,
        'minimumObservations', (v_policy.thresholds->>'decision_min_observations')::integer,
        'minimumEvidenceItems', (v_policy.thresholds->>'decision_min_evidence_items')::integer,
        'maximumAgeDays', (v_policy.thresholds->>'decision_max_age_days')::integer),
      'persistent', jsonb_build_object('passed', v_persistent,
        'minimumScore', (v_policy.thresholds->>'persistent_score_from')::numeric,
        'minimumFocusObservations', (v_policy.thresholds->>'persistent_min_focus_observations')::integer,
        'minimumSourceInstances', (v_policy.thresholds->>'persistent_min_source_instances')::integer,
        'minimumSpanDays', (v_policy.thresholds->>'persistent_min_span_days')::integer,
        'maximumAgeDays', (v_policy.thresholds->>'persistent_max_age_days')::integer),
      'resolution', jsonb_build_object('passed', v_resolution,
        'minimumScore', (v_policy.thresholds->>'resolution_score_from')::numeric,
        'minimumPriorFocus', (v_policy.thresholds->>'resolution_min_prior_focus')::integer,
        'minimumRecoveryObservations', (v_policy.thresholds->>'resolution_min_recovery_observations')::integer,
        'minimumSourceInstances', (v_policy.thresholds->>'resolution_min_source_instances')::integer,
        'maximumAgeDays', (v_policy.thresholds->>'resolution_max_age_days')::integer),
      'strength', jsonb_build_object('passed', v_strength,
        'minimumScore', (v_policy.thresholds->>'strength_score_from')::numeric,
        'minimumStrengthObservations', (v_policy.thresholds->>'strength_min_observations')::integer,
        'minimumSourceInstances', (v_policy.thresholds->>'strength_min_source_instances')::integer,
        'minimumSpanDays', (v_policy.thresholds->>'strength_min_span_days')::integer,
        'maximumAgeDays', (v_policy.thresholds->>'strength_max_age_days')::integer)
    ),
    jsonb_build_object(
      'policyKey', v_policy.policy_key, 'policyVersion', v_policy.version,
      'academicYearScoped', true,
      'browserScoredCambridgeQualifies', false,
      'unansweredItemsClassifiedAsWeak', false,
      'scoreComponents', jsonb_build_object(
        'evidenceVolume', v_volume, 'qualifyingObservations', v_observations,
        'evidenceQuality', v_quality, 'recency', v_recency,
        'sourceDiversity', v_diversity, 'mappingQuality', v_mapping,
        'sourceCoverage', v_coverage, 'timeSpan', v_span_score,
        'consistency', v_consistency
      ),
      'excludedObservationCount', greatest(v_metrics.total - v_metrics.qualified, 0),
      'teacherJudgementRequiredForHighStakesLabels', true
    ), now()
  )
  on conflict (student_id, skill_key) do update set
    policy_id = excluded.policy_id, school_id = excluded.school_id,
    academic_year_id = excluded.academic_year_id,
    academic_subject_id = excluded.academic_subject_id,
    framework_version_id = excluded.framework_version_id,
    curriculum_scope_id = excluded.curriculum_scope_id,
    curriculum_objective_id = excluded.curriculum_objective_id,
    grade_level = excluded.grade_level, subject = excluded.subject,
    topic = excluded.topic, skill = excluded.skill, subskill = excluded.subskill,
    as_of_at = excluded.as_of_at, first_qualified_at = excluded.first_qualified_at,
    last_qualified_at = excluded.last_qualified_at, total_observations = excluded.total_observations,
    qualifying_observations = excluded.qualifying_observations,
    evidence_items = excluded.evidence_items, source_type_count = excluded.source_type_count,
    source_instance_count = excluded.source_instance_count,
    focus_observations = excluded.focus_observations,
    developing_observations = excluded.developing_observations,
    strength_observations = excluded.strength_observations,
    recent_focus_observations = excluded.recent_focus_observations,
    recent_developing_observations = excluded.recent_developing_observations,
    recent_strength_observations = excluded.recent_strength_observations,
    recovery_observations_after_last_focus = excluded.recovery_observations_after_last_focus,
    evidence_age_days = excluded.evidence_age_days,
    evidence_span_days = excluded.evidence_span_days,
    evidence_volume_score = excluded.evidence_volume_score,
    observation_score = excluded.observation_score, quality_score = excluded.quality_score,
    recency_score = excluded.recency_score, diversity_score = excluded.diversity_score,
    mapping_score = excluded.mapping_score, source_coverage_score = excluded.source_coverage_score,
    span_score = excluded.span_score, consistency_score = excluded.consistency_score,
    confidence_score = excluded.confidence_score, confidence_band = excluded.confidence_band,
    assessment_state = excluded.assessment_state, decision_eligible = excluded.decision_eligible,
    persistent_eligible = excluded.persistent_eligible,
    resolution_eligible = excluded.resolution_eligible,
    strength_eligible = excluded.strength_eligible,
    teacher_review_required = excluded.teacher_review_required,
    gate_results = excluded.gate_results, disclosure = excluded.disclosure,
    computed_at = excluded.computed_at;

  if v_latest.academic_year_id is not null and v_latest.academic_subject_id is not null then
    perform public.student_learning_rebuild_curriculum_coverage(
      p_student_id, v_latest.academic_year_id, v_latest.academic_subject_id, p_as_of
    );
  end if;
end;
$function$;

revoke all on function public.student_learning_rebuild_confidence_state(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.student_learning_rebuild_confidence_state(uuid,text,timestamptz) to service_role;
CREATE OR REPLACE FUNCTION public.student_learning_refresh_focus_state(p_student_id uuid, p_skill_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conf public.student_learning_confidence_states%rowtype;
  v_latest public.student_learning_observations%rowtype;
  v_decision jsonb;
begin
  if p_student_id is null or nullif(trim(p_skill_key), '') is null then return; end if;
  perform public.student_learning_rebuild_confidence_state(p_student_id, p_skill_key, now());
  select * into v_conf from public.student_learning_confidence_states c
  where c.student_id = p_student_id and c.skill_key = p_skill_key;
  if not found then
    delete from public.student_learning_focus_states s
    where s.student_id = p_student_id and s.skill_key = p_skill_key;
    return;
  end if;

  select o.* into v_latest from private.academic_assignment_assessment_observations(p_student_id,p_skill_key,now()) o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and o.academic_year_id is not distinct from v_conf.academic_year_id
    and public.student_learning_observation_is_qualified(
      o.source_type, o.contributes_to_focus_state, o.evidence
    )
  order by o.observed_at desc, o.created_at desc, o.id desc limit 1;
  if not found then
    select o.* into v_latest from private.academic_assignment_assessment_observations(p_student_id,p_skill_key,now()) o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.academic_year_id is not distinct from v_conf.academic_year_id
    order by o.observed_at desc, o.created_at desc, o.id desc limit 1;
  end if;

  v_decision := public.student_learning_classify_progress(
    public.student_learning_confidence_progress_metrics(v_conf, v_latest.observation_type)
  );

  insert into public.student_learning_focus_states(
    school_id, student_id, subject, topic, skill, subskill, skill_key,
    first_observed_at, last_observed_at, focus_occurrences, developing_occurrences,
    strength_occurrences, recent_focus_occurrences, recent_developing_occurrences,
    recent_strength_occurrences, latest_observation_type, current_status, trend, priority,
    latest_evidence_percentage, evidence_items, evidence_occurrences, updated_at,
    confidence_state_id, academic_year_id, confidence_score, confidence_band,
    assessment_state, decision_eligible, teacher_review_required, confidence_computed_at
  ) values (
    v_latest.school_id, v_latest.student_id, v_latest.subject, v_latest.topic,
    v_latest.skill, v_latest.subskill, v_latest.skill_key,
    coalesce(v_conf.first_qualified_at, v_latest.observed_at),
    coalesce(v_conf.last_qualified_at, v_latest.observed_at),
    v_conf.focus_observations, v_conf.developing_observations,
    v_conf.strength_observations, v_conf.recent_focus_observations,
    v_conf.recent_developing_observations, v_conf.recent_strength_observations,
    v_latest.observation_type,
    case
      when v_decision->>'status' = 'insufficient_evidence'
       and v_latest.observation_type = 'focus'
       and coalesce(v_latest.contributes_to_focus_state, false)
       and coalesce(v_conf.focus_observations, 0) >= 1
       and p_skill_key not like 'diagnostic:%'
      then 'new_focus'
      else v_decision->>'status'
    end,
    v_decision->>'trend',
    v_decision->>'priority', v_latest.evidence_percentage,
    v_conf.qualifying_observations, v_conf.evidence_items, now(), v_conf.id,
    v_conf.academic_year_id, v_conf.confidence_score, v_conf.confidence_band,
    v_conf.assessment_state, v_conf.decision_eligible,
    (v_decision->>'teacherReviewRequired')::boolean, v_conf.computed_at
  )
  on conflict (student_id, skill_key) do update set
    school_id = excluded.school_id, subject = excluded.subject, topic = excluded.topic,
    skill = excluded.skill, subskill = excluded.subskill,
    first_observed_at = excluded.first_observed_at,
    last_observed_at = excluded.last_observed_at,
    focus_occurrences = excluded.focus_occurrences,
    developing_occurrences = excluded.developing_occurrences,
    strength_occurrences = excluded.strength_occurrences,
    recent_focus_occurrences = excluded.recent_focus_occurrences,
    recent_developing_occurrences = excluded.recent_developing_occurrences,
    recent_strength_occurrences = excluded.recent_strength_occurrences,
    latest_observation_type = excluded.latest_observation_type,
    current_status = excluded.current_status, trend = excluded.trend,
    priority = excluded.priority,
    latest_evidence_percentage = excluded.latest_evidence_percentage,
    evidence_items = excluded.evidence_items,
    evidence_occurrences = excluded.evidence_occurrences,
    confidence_state_id = excluded.confidence_state_id,
    academic_year_id = excluded.academic_year_id,
    confidence_score = excluded.confidence_score,
    confidence_band = excluded.confidence_band,
    assessment_state = excluded.assessment_state,
    decision_eligible = excluded.decision_eligible,
    teacher_review_required = excluded.teacher_review_required,
    confidence_computed_at = excluded.confidence_computed_at,
    updated_at = excluded.updated_at;
end;
$function$;

revoke all on function public.student_learning_refresh_focus_state(uuid,text) from public,anon,authenticated;
grant execute on function public.student_learning_refresh_focus_state(uuid,text) to service_role;

-- Refresh only affected current-year derived summaries; no raw or archived evidence is rewritten.
do $refresh$
declare affected record;
begin
  for affected in
    select distinct f.student_id,f.skill_key
    from public.student_learning_focus_states f
    join public.school_academic_years y on y.id=f.academic_year_id and y.status='current'
    where exists(select 1 from public.student_learning_observations o
      where o.student_id=f.student_id and o.skill_key=f.skill_key
        and o.academic_year_id=f.academic_year_id
        and o.source_type in ('assignment_result','registry_verified_assignment'))
  loop
    perform public.student_learning_refresh_focus_state(affected.student_id,affected.skill_key);
  end loop;
end;
$refresh$;
