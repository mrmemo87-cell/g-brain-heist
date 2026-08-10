-- Phase 5: transparent evidence confidence and curriculum coverage.
--
-- Raw observations remain append-only. This migration adds rebuildable projections and
-- prevents high-stakes labels from outrunning evidence sufficiency, recency, diversity,
-- mapping quality, or time span. Curriculum coverage describes what has been assessed;
-- it is never a mastery score and an unassessed objective is never classified as weak.

create table public.academic_evidence_confidence_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'active', 'retired')),
  weights jsonb not null,
  thresholds jsonb not null,
  description text not null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (policy_key, version),
  check (length(trim(policy_key)) >= 3),
  check (length(trim(description)) >= 20),
  check (status <> 'active' or activated_at is not null),
  check (jsonb_typeof(weights) = 'object'),
  check (jsonb_typeof(thresholds) = 'object'),
  check (weights ?& array[
    'evidence_volume', 'qualifying_observations', 'evidence_quality', 'recency',
    'source_diversity', 'mapping_quality', 'source_coverage', 'time_span', 'consistency'
  ]),
  check (abs(
    (weights->>'evidence_volume')::numeric +
    (weights->>'qualifying_observations')::numeric +
    (weights->>'evidence_quality')::numeric +
    (weights->>'recency')::numeric +
    (weights->>'source_diversity')::numeric +
    (weights->>'mapping_quality')::numeric +
    (weights->>'source_coverage')::numeric +
    (weights->>'time_span')::numeric +
    (weights->>'consistency')::numeric - 1
  ) < 0.0001),
  check (thresholds ?& array[
    'confidence_band_medium_from', 'confidence_band_high_from',
    'decision_score_from', 'decision_min_observations', 'decision_min_evidence_items',
    'decision_max_age_days', 'persistent_score_from',
    'persistent_min_focus_observations', 'persistent_min_source_instances',
    'persistent_min_span_days', 'persistent_max_age_days', 'resolution_score_from',
    'resolution_min_prior_focus', 'resolution_min_recovery_observations',
    'resolution_min_source_instances', 'resolution_max_age_days', 'strength_score_from',
    'strength_min_observations', 'strength_min_source_instances',
    'strength_min_span_days', 'strength_max_age_days', 'stale_after_days'
  ])
);

create unique index academic_evidence_confidence_policies_active_uidx
  on public.academic_evidence_confidence_policies(policy_key)
  where status = 'active';

insert into public.academic_evidence_confidence_policies(
  id, policy_key, version, status, weights, thresholds, description, activated_at
) values (
  '7e5c9ee1-5af0-4a61-9b23-f5d9ac51c001',
  'longitudinal-confidence',
  1,
  'active',
  jsonb_build_object(
    'evidence_volume', 0.15,
    'qualifying_observations', 0.10,
    'evidence_quality', 0.15,
    'recency', 0.15,
    'source_diversity', 0.10,
    'mapping_quality', 0.15,
    'source_coverage', 0.10,
    'time_span', 0.05,
    'consistency', 0.05
  ),
  jsonb_build_object(
    'confidence_band_medium_from', 60,
    'confidence_band_high_from', 78,
    'decision_score_from', 60,
    'decision_min_observations', 2,
    'decision_min_evidence_items', 4,
    'decision_max_age_days', 180,
    'persistent_score_from', 70,
    'persistent_min_focus_observations', 3,
    'persistent_min_source_instances', 2,
    'persistent_min_span_days', 21,
    'persistent_max_age_days', 90,
    'resolution_score_from', 70,
    'resolution_min_prior_focus', 2,
    'resolution_min_recovery_observations', 2,
    'resolution_min_source_instances', 2,
    'resolution_max_age_days', 90,
    'strength_score_from', 68,
    'strength_min_observations', 2,
    'strength_min_source_instances', 2,
    'strength_min_span_days', 7,
    'strength_max_age_days', 90,
    'stale_after_days', 365
  ),
  'Phase 5 governed confidence policy for longitudinal student-learning conclusions.',
  now()
);

create or replace function private.academic_confidence_policy_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('active', 'retired') then
    raise exception using errcode = '23514',
      message = 'active_or_retired_confidence_policy_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.academic_confidence_policy_is_immutable()
  from public, anon, authenticated, service_role;

create trigger trg_academic_confidence_policy_immutable
before update or delete on public.academic_evidence_confidence_policies
for each row execute function private.academic_confidence_policy_is_immutable();

create table public.student_learning_confidence_states (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.academic_evidence_confidence_policies(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  academic_year_id uuid references public.school_academic_years(id) on delete restrict,
  academic_subject_id uuid references public.academic_subjects(id) on delete restrict,
  framework_version_id uuid references public.curriculum_framework_versions(id) on delete restrict,
  curriculum_scope_id uuid references public.curriculum_scopes(id) on delete restrict,
  curriculum_objective_id uuid references public.curriculum_objectives(id) on delete restrict,
  grade_level text,
  subject text not null,
  topic text,
  skill text not null,
  subskill text,
  skill_key text not null,
  as_of_at timestamptz not null,
  first_qualified_at timestamptz,
  last_qualified_at timestamptz,
  total_observations integer not null default 0 check (total_observations >= 0),
  qualifying_observations integer not null default 0 check (qualifying_observations >= 0),
  evidence_items integer not null default 0 check (evidence_items >= 0),
  source_type_count integer not null default 0 check (source_type_count >= 0),
  source_instance_count integer not null default 0 check (source_instance_count >= 0),
  focus_observations integer not null default 0 check (focus_observations >= 0),
  developing_observations integer not null default 0 check (developing_observations >= 0),
  strength_observations integer not null default 0 check (strength_observations >= 0),
  recent_focus_observations integer not null default 0 check (recent_focus_observations >= 0),
  recent_developing_observations integer not null default 0 check (recent_developing_observations >= 0),
  recent_strength_observations integer not null default 0 check (recent_strength_observations >= 0),
  recovery_observations_after_last_focus integer not null default 0
    check (recovery_observations_after_last_focus >= 0),
  evidence_age_days integer check (evidence_age_days is null or evidence_age_days >= 0),
  evidence_span_days integer not null default 0 check (evidence_span_days >= 0),
  evidence_volume_score numeric(5,4) not null check (evidence_volume_score between 0 and 1),
  observation_score numeric(5,4) not null check (observation_score between 0 and 1),
  quality_score numeric(5,4) not null check (quality_score between 0 and 1),
  recency_score numeric(5,4) not null check (recency_score between 0 and 1),
  diversity_score numeric(5,4) not null check (diversity_score between 0 and 1),
  mapping_score numeric(5,4) not null check (mapping_score between 0 and 1),
  source_coverage_score numeric(5,4) not null check (source_coverage_score between 0 and 1),
  span_score numeric(5,4) not null check (span_score between 0 and 1),
  consistency_score numeric(5,4) not null check (consistency_score between 0 and 1),
  confidence_score numeric(5,2) not null check (confidence_score between 0 and 100),
  confidence_band text not null check (confidence_band in ('none', 'low', 'medium', 'high')),
  assessment_state text not null
    check (assessment_state in ('not_assessed', 'low_data', 'assessed', 'stale', 'contradictory')),
  decision_eligible boolean not null default false,
  persistent_eligible boolean not null default false,
  resolution_eligible boolean not null default false,
  strength_eligible boolean not null default false,
  teacher_review_required boolean not null default false,
  gate_results jsonb not null default '{}'::jsonb check (jsonb_typeof(gate_results) = 'object'),
  disclosure jsonb not null default '{}'::jsonb check (jsonb_typeof(disclosure) = 'object'),
  computed_at timestamptz not null default now(),
  unique (student_id, skill_key)
);

create index student_learning_confidence_school_band_idx
  on public.student_learning_confidence_states(school_id, confidence_band, assessment_state);
create index student_learning_confidence_student_subject_idx
  on public.student_learning_confidence_states(student_id, academic_year_id, academic_subject_id, confidence_score desc);
create index student_learning_confidence_objective_idx
  on public.student_learning_confidence_states(curriculum_objective_id, student_id)
  where curriculum_objective_id is not null;
create index student_learning_confidence_review_idx
  on public.student_learning_confidence_states(school_id, teacher_review_required, computed_at desc)
  where teacher_review_required;

create table public.student_curriculum_coverage_states (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete cascade,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  grade_level text,
  curriculum_scope_id uuid references public.curriculum_scopes(id) on delete restrict,
  mapping_quality text check (mapping_quality is null or mapping_quality in ('confirmed', 'estimated')),
  total_assessable_objectives integer not null default 0 check (total_assessable_objectives >= 0),
  observed_objectives integer not null default 0 check (observed_objectives >= 0),
  qualified_objectives integer not null default 0 check (qualified_objectives >= 0),
  unassessed_objectives integer not null default 0 check (unassessed_objectives >= 0),
  low_data_objectives integer not null default 0 check (low_data_objectives >= 0),
  focus_objectives integer not null default 0 check (focus_objectives >= 0),
  strength_objectives integer not null default 0 check (strength_objectives >= 0),
  outside_scope_objectives integer not null default 0 check (outside_scope_objectives >= 0),
  unmapped_skill_count integer not null default 0 check (unmapped_skill_count >= 0),
  observed_coverage_percent numeric(5,2) not null default 0
    check (observed_coverage_percent between 0 and 100),
  qualified_coverage_percent numeric(5,2) not null default 0
    check (qualified_coverage_percent between 0 and 100),
  reporting_readiness text not null check (reporting_readiness in (
    'curriculum_not_configured', 'no_evidence', 'low_coverage', 'partial_coverage', 'broad_coverage'
  )),
  disclosure jsonb not null default '{}'::jsonb check (jsonb_typeof(disclosure) = 'object'),
  as_of_at timestamptz not null,
  computed_at timestamptz not null default now(),
  unique (student_id, academic_year_id, academic_subject_id)
);

create index student_curriculum_coverage_school_year_idx
  on public.student_curriculum_coverage_states(school_id, academic_year_id, academic_subject_id, reporting_readiness);
create index student_curriculum_coverage_student_idx
  on public.student_curriculum_coverage_states(student_id, academic_year_id, qualified_coverage_percent desc);

alter table public.academic_evidence_confidence_policies enable row level security;
alter table public.student_learning_confidence_states enable row level security;
alter table public.student_curriculum_coverage_states enable row level security;

revoke all on table public.academic_evidence_confidence_policies
  from public, anon, authenticated, service_role;
revoke all on table public.student_learning_confidence_states
  from public, anon, authenticated, service_role;
revoke all on table public.student_curriculum_coverage_states
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.academic_evidence_confidence_policies to service_role;
grant select, insert, update, delete on table public.student_learning_confidence_states to service_role;
grant select, insert, update, delete on table public.student_curriculum_coverage_states to service_role;

create or replace function public.student_learning_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(trim(p_value), '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
revoke all on function public.student_learning_try_uuid(text) from public, anon, authenticated;
grant execute on function public.student_learning_try_uuid(text) to service_role;

create or replace function public.student_learning_observation_is_qualified(
  p_source_type text,
  p_contributes boolean,
  p_evidence jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_source_type = 'cambridge_attempt' then
      coalesce(p_evidence->>'scoring_authority', '') in ('teacher_verified', 'server_verified')
      and jsonb_typeof(p_evidence->'mapping_snapshots') = 'array'
      and jsonb_array_length(p_evidence->'mapping_snapshots') > 0
    else coalesce(p_contributes, false)
  end;
$$;
revoke all on function public.student_learning_observation_is_qualified(text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.student_learning_observation_is_qualified(text, boolean, jsonb)
  to service_role;

create or replace function public.student_learning_rebuild_curriculum_coverage(
  p_student_id uuid,
  p_academic_year_id uuid,
  p_academic_subject_id uuid,
  p_as_of timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_grade text;
  v_scope_id uuid;
  v_mapping_quality text;
  v_total integer := 0;
  v_observed integer := 0;
  v_qualified integer := 0;
  v_focus integer := 0;
  v_strength integer := 0;
  v_outside integer := 0;
  v_unmapped integer := 0;
  v_observed_percent numeric := 0;
  v_qualified_percent numeric := 0;
  v_readiness text;
  v_assessment_counts jsonb;
begin
  if p_student_id is null or p_academic_year_id is null or p_academic_subject_id is null then
    return;
  end if;

  select u.school_id into v_school_id from public.users u where u.id = p_student_id;
  if v_school_id is null then return; end if;

  select coalesce(o.grade_level_at_time, e.grade_level)
  into v_grade
  from (select 1) seed
  left join lateral (
    select x.grade_level_at_time
    from public.student_learning_observations x
    where x.student_id = p_student_id
      and x.academic_year_id = p_academic_year_id
      and x.academic_subject_id = p_academic_subject_id
      and x.observed_at <= p_as_of
    order by x.observed_at desc, x.created_at desc, x.id desc
    limit 1
  ) o on true
  left join lateral (
    select x.grade_level
    from public.student_academic_enrolments x
    where x.student_id = p_student_id and x.academic_year_id = p_academic_year_id
      and x.starts_on <= p_as_of::date
      and (x.ends_on is null or x.ends_on >= p_as_of::date)
    order by (x.context_quality = 'confirmed') desc, x.starts_on desc, x.id desc
    limit 1
  ) e on true;

  select m.curriculum_scope_id, m.mapping_quality
  into v_scope_id, v_mapping_quality
  from public.school_curriculum_scope_mappings m
  where m.school_id = v_school_id
    and m.academic_year_id = p_academic_year_id
    and m.academic_subject_id = p_academic_subject_id
    and m.grade_level = v_grade
    and m.status in ('active', 'planned')
  order by case m.status when 'active' then 1 else 2 end, m.updated_at desc, m.id
  limit 1;

  if v_scope_id is not null then
    select count(*)::integer into v_total
    from public.curriculum_objectives o
    where o.curriculum_scope_id = v_scope_id and o.is_assessable;
  end if;

  select
    count(distinct c.curriculum_objective_id) filter (
      where c.curriculum_objective_id is not null
        and c.curriculum_scope_id = v_scope_id and c.total_observations > 0
    )::integer,
    count(distinct c.curriculum_objective_id) filter (
      where c.curriculum_objective_id is not null
        and c.curriculum_scope_id = v_scope_id and c.decision_eligible
    )::integer,
    count(distinct c.curriculum_objective_id) filter (
      where c.curriculum_objective_id is not null
        and c.curriculum_scope_id = v_scope_id and c.decision_eligible
        and c.focus_observations > 0
    )::integer,
    count(distinct c.curriculum_objective_id) filter (
      where c.curriculum_objective_id is not null
        and c.curriculum_scope_id = v_scope_id and c.strength_eligible
    )::integer,
    count(distinct c.curriculum_objective_id) filter (
      where c.curriculum_objective_id is not null
        and (v_scope_id is null or c.curriculum_scope_id is distinct from v_scope_id)
    )::integer,
    count(*) filter (where c.curriculum_objective_id is null)::integer,
    jsonb_build_object(
      'notAssessed', count(*) filter (where c.assessment_state = 'not_assessed'),
      'lowData', count(*) filter (where c.assessment_state = 'low_data'),
      'assessed', count(*) filter (where c.assessment_state = 'assessed'),
      'stale', count(*) filter (where c.assessment_state = 'stale'),
      'contradictory', count(*) filter (where c.assessment_state = 'contradictory')
    )
  into v_observed, v_qualified, v_focus, v_strength, v_outside, v_unmapped,
    v_assessment_counts
  from public.student_learning_confidence_states c
  where c.student_id = p_student_id
    and c.academic_year_id = p_academic_year_id
    and c.academic_subject_id = p_academic_subject_id;

  v_observed := coalesce(v_observed, 0);
  v_qualified := coalesce(v_qualified, 0);
  v_focus := coalesce(v_focus, 0);
  v_strength := coalesce(v_strength, 0);
  v_outside := coalesce(v_outside, 0);
  v_unmapped := coalesce(v_unmapped, 0);
  v_assessment_counts := coalesce(v_assessment_counts, '{}'::jsonb);
  v_observed_percent := case when v_total = 0 then 0
    else round(least(v_observed, v_total)::numeric * 100 / v_total, 2) end;
  v_qualified_percent := case when v_total = 0 then 0
    else round(least(v_qualified, v_total)::numeric * 100 / v_total, 2) end;

  v_readiness := case
    when v_scope_id is null or v_total = 0 then 'curriculum_not_configured'
    when v_observed = 0 then 'no_evidence'
    when v_qualified_percent < 50 then 'low_coverage'
    when v_qualified_percent < 80 then 'partial_coverage'
    else 'broad_coverage'
  end;

  insert into public.student_curriculum_coverage_states(
    school_id, student_id, academic_year_id, academic_subject_id, grade_level,
    curriculum_scope_id, mapping_quality, total_assessable_objectives,
    observed_objectives, qualified_objectives, unassessed_objectives,
    low_data_objectives, focus_objectives, strength_objectives,
    outside_scope_objectives, unmapped_skill_count, observed_coverage_percent,
    qualified_coverage_percent, reporting_readiness, disclosure, as_of_at, computed_at
  ) values (
    v_school_id, p_student_id, p_academic_year_id, p_academic_subject_id, v_grade,
    v_scope_id, v_mapping_quality, v_total, v_observed, v_qualified,
    greatest(v_total - v_observed, 0), greatest(v_observed - v_qualified, 0),
    v_focus, v_strength, v_outside, v_unmapped, v_observed_percent,
    v_qualified_percent, v_readiness,
    jsonb_build_object(
      'coverageIsNotMastery', true,
      'unassessedObjectivesAreNotWeaknesses', true,
      'readinessMeaning', 'Breadth of qualified evidence across the mapped curriculum scope.',
      'gradeLevel', v_grade,
      'curriculumMappingQuality', v_mapping_quality,
      'assessmentStates', v_assessment_counts,
      'outsideScopeObjectives', v_outside,
      'unmappedSkillCount', v_unmapped
    ),
    p_as_of, now()
  )
  on conflict (student_id, academic_year_id, academic_subject_id) do update set
    school_id = excluded.school_id,
    grade_level = excluded.grade_level,
    curriculum_scope_id = excluded.curriculum_scope_id,
    mapping_quality = excluded.mapping_quality,
    total_assessable_objectives = excluded.total_assessable_objectives,
    observed_objectives = excluded.observed_objectives,
    qualified_objectives = excluded.qualified_objectives,
    unassessed_objectives = excluded.unassessed_objectives,
    low_data_objectives = excluded.low_data_objectives,
    focus_objectives = excluded.focus_objectives,
    strength_objectives = excluded.strength_objectives,
    outside_scope_objectives = excluded.outside_scope_objectives,
    unmapped_skill_count = excluded.unmapped_skill_count,
    observed_coverage_percent = excluded.observed_coverage_percent,
    qualified_coverage_percent = excluded.qualified_coverage_percent,
    reporting_readiness = excluded.reporting_readiness,
    disclosure = excluded.disclosure,
    as_of_at = excluded.as_of_at,
    computed_at = excluded.computed_at;
end;
$$;
revoke all on function public.student_learning_rebuild_curriculum_coverage(uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.student_learning_rebuild_curriculum_coverage(uuid,uuid,uuid,timestamptz)
  to service_role;

create or replace function public.student_learning_rebuild_confidence_state(
  p_student_id uuid,
  p_skill_key text,
  p_as_of timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  from public.student_learning_observations o
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
    from public.student_learning_observations o
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
    select o.observation_type
    from public.student_learning_observations o
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
  into v_recent from recent;

  select max(o.observed_at) into v_last_focus
  from public.student_learning_observations o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and o.observed_at <= p_as_of
    and o.academic_year_id is not distinct from v_latest.academic_year_id
    and o.observation_type = 'focus'
    and public.student_learning_observation_is_qualified(
      o.source_type, o.contributes_to_focus_state, o.evidence
    );
  if v_last_focus is not null then
    select count(*)::integer into v_recovery
    from public.student_learning_observations o
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
    when coalesce(v_recent.focus_count, 0) > 0 and coalesce(v_recent.strength_count, 0) > 0
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
$$;
revoke all on function public.student_learning_rebuild_confidence_state(uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.student_learning_rebuild_confidence_state(uuid,text,timestamptz)
  to service_role;

alter table public.student_learning_focus_states
  drop constraint if exists student_learning_focus_states_current_status_check;
alter table public.student_learning_focus_states
  add constraint student_learning_focus_states_current_status_check check (current_status in (
    'insufficient_evidence', 'contradictory', 'new_focus', 'recurring', 'persistent',
    'improving', 'resolved', 'emerging_strength', 'consistent_strength'
  ));
alter table public.student_learning_focus_states
  add column if not exists confidence_state_id uuid
    references public.student_learning_confidence_states(id) on delete set null,
  add column if not exists academic_year_id uuid
    references public.school_academic_years(id) on delete restrict,
  add column if not exists confidence_score numeric(5,2)
    check (confidence_score is null or confidence_score between 0 and 100),
  add column if not exists confidence_band text
    check (confidence_band is null or confidence_band in ('none', 'low', 'medium', 'high')),
  add column if not exists assessment_state text
    check (assessment_state is null or assessment_state in (
      'not_assessed', 'low_data', 'assessed', 'stale', 'contradictory'
    )),
  add column if not exists decision_eligible boolean not null default false,
  add column if not exists teacher_review_required boolean not null default false,
  add column if not exists confidence_computed_at timestamptz;

create index if not exists student_learning_focus_confidence_idx
  on public.student_learning_focus_states(student_id, academic_year_id, confidence_band, current_status);

create or replace function public.student_learning_refresh_focus_state(p_student_id uuid, p_skill_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conf public.student_learning_confidence_states%rowtype;
  v_latest public.student_learning_observations%rowtype;
  v_status text;
  v_trend text;
  v_priority text;
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

  select o.* into v_latest
  from public.student_learning_observations o
  where o.student_id = p_student_id and o.skill_key = p_skill_key
    and o.academic_year_id is not distinct from v_conf.academic_year_id
    and public.student_learning_observation_is_qualified(
      o.source_type, o.contributes_to_focus_state, o.evidence
    )
  order by o.observed_at desc, o.created_at desc, o.id desc limit 1;
  if not found then
    select o.* into v_latest from public.student_learning_observations o
    where o.student_id = p_student_id and o.skill_key = p_skill_key
      and o.academic_year_id is not distinct from v_conf.academic_year_id
    order by o.observed_at desc, o.created_at desc, o.id desc limit 1;
  end if;

  if v_conf.assessment_state in ('not_assessed', 'low_data', 'stale') then
    v_status := 'insufficient_evidence'; v_trend := 'stable';
  elsif v_conf.assessment_state = 'contradictory' then
    v_status := 'contradictory'; v_trend := 'stable';
  elsif v_conf.focus_observations = 0 then
    if v_conf.strength_eligible then
      v_status := 'consistent_strength'; v_trend := 'strong';
    else
      v_status := 'emerging_strength';
      v_trend := case when v_latest.observation_type = 'strength' then 'strong' else 'stable' end;
    end if;
  elsif v_latest.observation_type = 'strength'
    and v_conf.resolution_eligible and v_conf.recent_focus_observations = 0 then
    v_status := 'resolved'; v_trend := 'resolved';
  elsif v_latest.observation_type in ('strength', 'developing')
    and v_conf.decision_eligible
    and v_conf.recovery_observations_after_last_focus >= 2
    and v_conf.recent_focus_observations <= 1 then
    v_status := 'improving'; v_trend := 'improving';
  elsif v_conf.persistent_eligible and v_conf.recent_focus_observations >= 2 then
    v_status := 'persistent'; v_trend := 'stable';
  elsif v_conf.decision_eligible and v_conf.focus_observations >= 2 then
    v_status := 'recurring';
    v_trend := case when v_latest.observation_type = 'focus'
      and v_conf.recent_focus_observations >= 2 then 'declining' else 'stable' end;
  else
    v_status := 'new_focus'; v_trend := 'stable';
  end if;

  v_priority := case when v_status = 'persistent' then 'high'
    when v_status in ('recurring', 'new_focus', 'contradictory') then 'medium' else 'low' end;

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
    v_latest.observation_type, v_status, v_trend, v_priority,
    v_latest.evidence_percentage, v_conf.qualifying_observations,
    v_conf.evidence_items, now(), v_conf.id, v_conf.academic_year_id,
    v_conf.confidence_score, v_conf.confidence_band, v_conf.assessment_state,
    v_conf.decision_eligible, v_conf.teacher_review_required, v_conf.computed_at
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
$$;
revoke all on function public.student_learning_refresh_focus_state(uuid,text)
  from public, anon, authenticated;
grant execute on function public.student_learning_refresh_focus_state(uuid,text) to service_role;

create or replace function public.rpc_rebuild_student_learning_confidence(
  p_student_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_skill record;
  v_count integer := 0;
begin
  if p_student_id is null or p_as_of is null then
    return jsonb_build_object('success', false, 'code', 'student_and_as_of_required');
  end if;
  if not exists (select 1 from public.users u where u.id = p_student_id) then
    return jsonb_build_object('success', false, 'code', 'student_not_found');
  end if;
  for v_skill in
    select distinct o.skill_key
    from public.student_learning_observations o
    where o.student_id = p_student_id and o.observed_at <= p_as_of
    order by o.skill_key
  loop
    perform public.student_learning_rebuild_confidence_state(
      p_student_id, v_skill.skill_key, p_as_of
    );
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('success', true, 'studentId', p_student_id,
    'skillsRebuilt', v_count, 'asOf', p_as_of);
end;
$$;
revoke all on function public.rpc_rebuild_student_learning_confidence(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.rpc_rebuild_student_learning_confidence(uuid,timestamptz)
  to service_role;

create or replace function public.rpc_student_academic_confidence(
  p_student_id uuid default null,
  p_academic_year_id uuid default null,
  p_academic_subject_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_student_id uuid := coalesce(p_student_id, (select auth.uid()));
  v_school_id uuid;
  v_is_self boolean := false;
  v_is_admin boolean := false;
  v_is_head boolean := false;
  v_allowed_subjects text[] := array[]::text[];
  v_is_teacher boolean := false;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_student_id is null then raise exception 'Student is required'; end if;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  if v_school_id is null then raise exception 'Student is not attached to a school'; end if;

  v_is_self := v_caller = v_student_id;
  v_is_head := public.is_school_owner(v_school_id);
  select exists (
    select 1 from public.school_members sm
    where sm.school_id = v_school_id and sm.user_id = v_caller
      and sm.status = 'active' and sm.role_in_school = 'school_admin'
  ) into v_is_admin;
  select coalesce(array_agg(distinct public.academic_normalize_subject_key(cta.subject))
    filter (where nullif(trim(cta.subject), '') is not null), array[]::text[])
  into v_allowed_subjects
  from public.class_students cs
  join public.class_teacher_assignments cta on cta.class_id = cs.class_id
    and cta.school_id = v_school_id and cta.teacher_user_id = v_caller and cta.active
  where cs.student_id = v_student_id;
  v_is_teacher := cardinality(v_allowed_subjects) > 0;
  if not (v_is_self or v_is_admin or v_is_head or v_is_teacher) then
    raise exception 'Not authorized';
  end if;
  if p_academic_subject_id is not null and v_is_teacher
    and not (v_is_self or v_is_admin or v_is_head)
    and not exists (
      select 1 from public.academic_subjects s where s.id = p_academic_subject_id
        and (public.academic_normalize_subject_key(s.name) = any(v_allowed_subjects)
          or s.code = any(v_allowed_subjects))
    ) then raise exception 'Not authorized for requested subject';
  end if;

  select jsonb_build_object(
    'success', true,
    'studentId', v_student_id,
    'scope', jsonb_build_object('academicYearId', p_academic_year_id,
      'academicSubjectId', p_academic_subject_id,
      'viewer', case when v_is_self then 'student' when v_is_head then 'school_head'
        when v_is_admin then 'school_admin' else 'teacher' end),
    'summary', jsonb_build_object(
      'skillsTracked', count(*),
      'assessedSkills', count(*) filter (where c.assessment_state = 'assessed'),
      'lowDataSkills', count(*) filter (where c.assessment_state in ('not_assessed','low_data')),
      'staleSkills', count(*) filter (where c.assessment_state = 'stale'),
      'contradictorySkills', count(*) filter (where c.assessment_state = 'contradictory'),
      'teacherReviewRequired', count(*) filter (where c.teacher_review_required)
    ),
    'confidenceStates', coalesce(jsonb_agg(jsonb_build_object(
      'skillKey', c.skill_key, 'subject', c.subject, 'topic', c.topic,
      'skill', c.skill, 'subskill', c.subskill,
      'academicYearId', c.academic_year_id, 'academicSubjectId', c.academic_subject_id,
      'curriculumObjectiveId', c.curriculum_objective_id,
      'confidenceScore', c.confidence_score, 'confidenceBand', c.confidence_band,
      'assessmentState', c.assessment_state,
      'qualifyingObservations', c.qualifying_observations,
      'evidenceItems', c.evidence_items, 'sourceTypes', c.source_type_count,
      'sourceInstances', c.source_instance_count, 'evidenceAgeDays', c.evidence_age_days,
      'evidenceSpanDays', c.evidence_span_days,
      'decisionEligible', c.decision_eligible,
      'persistentEligible', c.persistent_eligible,
      'resolutionEligible', c.resolution_eligible,
      'strengthEligible', c.strength_eligible,
      'teacherReviewRequired', c.teacher_review_required,
      'gates', c.gate_results, 'disclosure', c.disclosure,
      'asOf', c.as_of_at, 'computedAt', c.computed_at
    ) order by c.subject, c.skill), '[]'::jsonb),
    'coverage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'academicYearId', x.academic_year_id, 'academicSubjectId', x.academic_subject_id,
        'gradeLevel', x.grade_level, 'curriculumScopeId', x.curriculum_scope_id,
        'mappingQuality', x.mapping_quality,
        'totalAssessableObjectives', x.total_assessable_objectives,
        'observedObjectives', x.observed_objectives,
        'qualifiedObjectives', x.qualified_objectives,
        'unassessedObjectives', x.unassessed_objectives,
        'lowDataObjectives', x.low_data_objectives,
        'focusObjectives', x.focus_objectives, 'strengthObjectives', x.strength_objectives,
        'outsideScopeObjectives', x.outside_scope_objectives,
        'unmappedSkillCount', x.unmapped_skill_count,
        'observedCoveragePercent', x.observed_coverage_percent,
        'qualifiedCoveragePercent', x.qualified_coverage_percent,
        'reportingReadiness', x.reporting_readiness,
        'disclosure', x.disclosure, 'asOf', x.as_of_at, 'computedAt', x.computed_at
      ) order by x.academic_year_id, x.academic_subject_id)
      from public.student_curriculum_coverage_states x
      join public.academic_subjects xs on xs.id = x.academic_subject_id
      where x.student_id = v_student_id
        and (p_academic_year_id is null or x.academic_year_id = p_academic_year_id)
        and (p_academic_subject_id is null or x.academic_subject_id = p_academic_subject_id)
        and (v_is_self or v_is_admin or v_is_head
          or xs.code = any(v_allowed_subjects)
          or public.academic_normalize_subject_key(xs.name) = any(v_allowed_subjects))
    ), '[]'::jsonb),
    'disclosure', jsonb_build_object(
      'confidenceIsEvidenceQualityNotAttainment', true,
      'coverageIsNotMastery', true,
      'unassessedObjectivesAreNotWeaknesses', true,
      'highStakesConclusionsRequireTeacherReview', true,
      'projectionFreshnessVisiblePerRecord', true
    )
  ) into v_result
  from public.student_learning_confidence_states c
  left join public.academic_subjects s on s.id = c.academic_subject_id
  where c.student_id = v_student_id
    and (p_academic_year_id is null or c.academic_year_id = p_academic_year_id)
    and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
    and (v_is_self or v_is_admin or v_is_head
      or public.academic_normalize_subject_key(c.subject) = any(v_allowed_subjects)
      or s.code = any(v_allowed_subjects));

  return coalesce(v_result, jsonb_build_object('success', true, 'studentId', v_student_id,
    'confidenceStates', '[]'::jsonb, 'coverage', '[]'::jsonb));
end;
$$;
revoke all on function public.rpc_student_academic_confidence(uuid,uuid,uuid)
  from public, anon;
grant execute on function public.rpc_student_academic_confidence(uuid,uuid,uuid)
  to authenticated, service_role;

comment on table public.academic_evidence_confidence_policies is
  'Immutable versioned weights and minimum gates for evidence confidence decisions.';
comment on table public.student_learning_confidence_states is
  'Rebuildable academic-year-scoped confidence projection; confidence describes evidence quality, not attainment.';
comment on table public.student_curriculum_coverage_states is
  'Rebuildable breadth-of-evidence projection; unassessed objectives are not weaknesses and coverage is not mastery.';
comment on function public.rpc_student_academic_confidence(uuid,uuid,uuid) is
  'Authorised confidence and curriculum coverage read contract with explicit missing-data disclosure.';
