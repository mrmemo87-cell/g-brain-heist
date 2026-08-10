-- Phase 6: golden progress journeys, non-destructive shadow comparison, and
-- teacher validation. Source observations remain immutable and shadow runs never
-- write a candidate conclusion into the current focus-state projection.

create table public.academic_progress_golden_journeys (
  id uuid primary key default gen_random_uuid(),
  journey_key text not null unique,
  version integer not null default 1 check (version > 0),
  category text not null check (category in (
    'missing', 'weak', 'recurring', 'persistent', 'improving', 'resolved',
    'strength', 'decline', 'contradictory', 'stale', 'year_transition'
  )),
  description text not null,
  input_metrics jsonb not null check (jsonb_typeof(input_metrics) = 'object'),
  expected_status text not null check (expected_status in (
    'insufficient_evidence', 'contradictory', 'new_focus', 'recurring', 'persistent',
    'improving', 'resolved', 'emerging_strength', 'consistent_strength'
  )),
  expected_trend text not null check (expected_trend in (
    'declining', 'stable', 'improving', 'resolved', 'strong'
  )),
  expected_priority text not null check (expected_priority in ('high', 'medium', 'low')),
  expected_teacher_review boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approval_source text not null default 'academic_reviewer'
    check (approval_source in ('system_contract', 'academic_reviewer')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(journey_key)) >= 3),
  check (length(trim(description)) >= 20),
  check (status <> 'approved' or approved_at is not null),
  check (approval_source <> 'academic_reviewer' or status <> 'approved' or approved_by is not null)
);

create index academic_progress_golden_journeys_status_idx
  on public.academic_progress_golden_journeys(status, category, journey_key);
create index academic_progress_golden_journeys_approved_by_idx
  on public.academic_progress_golden_journeys(approved_by)
  where approved_by is not null;

create table public.academic_progress_golden_validation_runs (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.academic_evidence_confidence_policies(id) on delete restrict,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  journey_count integer not null default 0 check (journey_count >= 0),
  passed_count integer not null default 0 check (passed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  disclosure jsonb not null default '{}'::jsonb check (jsonb_typeof(disclosure) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  check (status = 'running' or completed_at is not null),
  check (passed_count + failed_count <= journey_count)
);

create index academic_progress_golden_validation_runs_latest_idx
  on public.academic_progress_golden_validation_runs(policy_id, completed_at desc)
  where status = 'completed';
create index academic_progress_golden_validation_runs_created_by_idx
  on public.academic_progress_golden_validation_runs(created_by)
  where created_by is not null;

create table public.student_learning_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  policy_id uuid not null references public.academic_evidence_confidence_policies(id) on delete restrict,
  golden_validation_run_id uuid not null
    references public.academic_progress_golden_validation_runs(id) on delete restrict,
  as_of_at timestamptz not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  student_filter_count integer,
  comparison_limit integer not null check (comparison_limit between 1 and 1000),
  total_compared integer not null default 0 check (total_compared >= 0),
  exact_match_count integer not null default 0 check (exact_match_count >= 0),
  difference_count integer not null default 0 check (difference_count >= 0),
  high_risk_difference_count integer not null default 0 check (high_risk_difference_count >= 0),
  teacher_review_required_count integer not null default 0
    check (teacher_review_required_count >= 0),
  disclosure jsonb not null default '{}'::jsonb check (jsonb_typeof(disclosure) = 'object'),
  failure_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete restrict,
  check (status = 'running' or completed_at is not null),
  check (exact_match_count + difference_count <= total_compared)
);

create index student_learning_shadow_runs_school_year_idx
  on public.student_learning_shadow_runs(school_id, academic_year_id, started_at desc);
create index student_learning_shadow_runs_year_idx
  on public.student_learning_shadow_runs(academic_year_id, school_id);
create index student_learning_shadow_runs_golden_idx
  on public.student_learning_shadow_runs(golden_validation_run_id);
create index student_learning_shadow_runs_review_idx
  on public.student_learning_shadow_runs(school_id, teacher_review_required_count, completed_at desc)
  where status = 'completed';
create index student_learning_shadow_runs_policy_idx
  on public.student_learning_shadow_runs(policy_id, golden_validation_run_id);
create index student_learning_shadow_runs_created_by_idx
  on public.student_learning_shadow_runs(created_by)
  where created_by is not null;

create table public.student_learning_shadow_results (
  id uuid primary key default gen_random_uuid(),
  shadow_run_id uuid not null references public.student_learning_shadow_runs(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  academic_subject_id uuid references public.academic_subjects(id) on delete restrict,
  confidence_state_id uuid not null
    references public.student_learning_confidence_states(id) on delete restrict,
  skill_key text not null,
  subject text not null,
  topic text,
  skill text not null,
  subskill text,
  current_status text,
  candidate_status text not null check (candidate_status in (
    'insufficient_evidence', 'contradictory', 'new_focus', 'recurring', 'persistent',
    'improving', 'resolved', 'emerging_strength', 'consistent_strength'
  )),
  candidate_trend text not null check (candidate_trend in (
    'declining', 'stable', 'improving', 'resolved', 'strong'
  )),
  candidate_priority text not null check (candidate_priority in ('high', 'medium', 'low')),
  comparison_outcome text not null check (comparison_outcome in (
    'same', 'missing_current_state', 'confidence_withheld',
    'contradiction_detected', 'status_changed'
  )),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  teacher_review_required boolean not null default false,
  evidence_observation_count integer not null check (evidence_observation_count >= 0),
  evidence_latest_at timestamptz,
  evidence_snapshot_hash text not null check (evidence_snapshot_hash ~ '^[0-9a-f]{64}$'),
  current_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(current_snapshot) = 'object'),
  candidate_snapshot jsonb not null check (jsonb_typeof(candidate_snapshot) = 'object'),
  compared_at timestamptz not null default now(),
  unique (shadow_run_id, student_id, skill_key)
);

create index student_learning_shadow_results_run_outcome_idx
  on public.student_learning_shadow_results(shadow_run_id, comparison_outcome, risk_level);
create index student_learning_shadow_results_year_idx
  on public.student_learning_shadow_results(academic_year_id, school_id);
create index student_learning_shadow_results_subject_idx
  on public.student_learning_shadow_results(academic_subject_id)
  where academic_subject_id is not null;
create index student_learning_shadow_results_school_review_idx
  on public.student_learning_shadow_results(school_id, teacher_review_required, risk_level, compared_at desc)
  where teacher_review_required;
create index student_learning_shadow_results_teacher_scope_idx
  on public.student_learning_shadow_results(student_id, academic_subject_id, subject, shadow_run_id);
create index student_learning_shadow_results_confidence_idx
  on public.student_learning_shadow_results(confidence_state_id);

create table public.student_learning_validation_reviews (
  id uuid primary key default gen_random_uuid(),
  shadow_result_id uuid not null references public.student_learning_shadow_results(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  reviewer_id uuid not null references public.users(id) on delete restrict,
  reviewer_role text not null check (reviewer_role in ('teacher', 'school_admin', 'school_head')),
  review_version integer not null check (review_version > 0),
  supersedes_review_id uuid references public.student_learning_validation_reviews(id) on delete restrict,
  verdict text not null check (verdict in ('agree', 'disagree', 'needs_more_evidence')),
  expected_status text check (expected_status is null or expected_status in (
    'insufficient_evidence', 'contradictory', 'new_focus', 'recurring', 'persistent',
    'improving', 'resolved', 'emerging_strength', 'consistent_strength'
  )),
  evidence_gap_codes text[] not null default '{}'::text[],
  rationale text not null,
  reviewed_at timestamptz not null default now(),
  unique (shadow_result_id, reviewer_id, review_version),
  unique (supersedes_review_id),
  check (length(trim(rationale)) >= 10),
  check (verdict <> 'disagree' or expected_status is not null),
  check (verdict <> 'needs_more_evidence' or cardinality(evidence_gap_codes) > 0),
  check (review_version = 1 or supersedes_review_id is not null),
  check (evidence_gap_codes <@ array[
    'mapping_quality', 'recency', 'evidence_volume', 'source_diversity',
    'contradiction', 'year_context', 'subject_context', 'source_coverage', 'other'
  ]::text[])
);

create index student_learning_validation_reviews_result_latest_idx
  on public.student_learning_validation_reviews(shadow_result_id, reviewer_id, review_version desc);
create index student_learning_validation_reviews_school_verdict_idx
  on public.student_learning_validation_reviews(school_id, verdict, reviewed_at desc);
create index student_learning_validation_reviews_reviewer_idx
  on public.student_learning_validation_reviews(reviewer_id, reviewed_at desc);

alter table public.academic_progress_golden_journeys enable row level security;
alter table public.academic_progress_golden_validation_runs enable row level security;
alter table public.student_learning_shadow_runs enable row level security;
alter table public.student_learning_shadow_results enable row level security;
alter table public.student_learning_validation_reviews enable row level security;

revoke all on table public.academic_progress_golden_journeys
  from public, anon, authenticated, service_role;
revoke all on table public.academic_progress_golden_validation_runs
  from public, anon, authenticated, service_role;
revoke all on table public.student_learning_shadow_runs
  from public, anon, authenticated, service_role;
revoke all on table public.student_learning_shadow_results
  from public, anon, authenticated, service_role;
revoke all on table public.student_learning_validation_reviews
  from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.academic_progress_golden_journeys to service_role;
grant select, insert, update, delete on table public.academic_progress_golden_validation_runs to service_role;
grant select, insert, update, delete on table public.student_learning_shadow_runs to service_role;
grant select, insert, update, delete on table public.student_learning_shadow_results to service_role;
grant select, insert, update, delete on table public.student_learning_validation_reviews to service_role;

create or replace function private.academic_progress_golden_journey_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('approved', 'retired') then
    raise exception using errcode = '23514',
      message = 'approved_or_retired_golden_journey_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.academic_progress_golden_journey_immutable()
  from public, anon, authenticated, service_role;

create trigger trg_academic_progress_golden_journey_immutable
before update or delete on public.academic_progress_golden_journeys
for each row execute function private.academic_progress_golden_journey_immutable();

create or replace function private.academic_progress_completed_run_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or old.status in ('completed', 'failed') then
    raise exception using errcode = '23514', message = 'completed_validation_run_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.academic_progress_completed_run_immutable()
  from public, anon, authenticated, service_role;

create trigger trg_academic_progress_golden_run_immutable
before update or delete on public.academic_progress_golden_validation_runs
for each row execute function private.academic_progress_completed_run_immutable();
create trigger trg_student_learning_shadow_run_immutable
before update or delete on public.student_learning_shadow_runs
for each row execute function private.academic_progress_completed_run_immutable();

create or replace function private.academic_progress_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'academic_validation_record_is_append_only';
end;
$$;
revoke all on function private.academic_progress_append_only()
  from public, anon, authenticated, service_role;

create trigger trg_student_learning_shadow_result_append_only
before update or delete on public.student_learning_shadow_results
for each row execute function private.academic_progress_append_only();
create trigger trg_student_learning_validation_review_append_only
before update or delete on public.student_learning_validation_reviews
for each row execute function private.academic_progress_append_only();

create or replace function public.student_learning_classify_progress(p_metrics jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_assessment text := p_metrics->>'assessment_state';
  v_latest text := p_metrics->>'latest_observation_type';
  v_focus integer := coalesce((p_metrics->>'focus_observations')::integer, 0);
  v_recent_focus integer := coalesce((p_metrics->>'recent_focus_observations')::integer, 0);
  v_recovery integer := coalesce((p_metrics->>'recovery_observations_after_last_focus')::integer, 0);
  v_decision boolean := coalesce((p_metrics->>'decision_eligible')::boolean, false);
  v_persistent boolean := coalesce((p_metrics->>'persistent_eligible')::boolean, false);
  v_resolution boolean := coalesce((p_metrics->>'resolution_eligible')::boolean, false);
  v_strength boolean := coalesce((p_metrics->>'strength_eligible')::boolean, false);
  v_status text;
  v_trend text;
  v_priority text;
  v_review boolean := false;
begin
  if jsonb_typeof(p_metrics) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'progress_metrics_object_required';
  end if;
  if v_assessment not in ('not_assessed', 'low_data', 'assessed', 'stale', 'contradictory') then
    raise exception using errcode = '22023', message = 'valid_assessment_state_required';
  end if;
  if v_latest not in ('focus', 'developing', 'strength') then
    raise exception using errcode = '22023', message = 'valid_latest_observation_type_required';
  end if;
  if least(v_focus, v_recent_focus, v_recovery) < 0 then
    raise exception using errcode = '22023', message = 'progress_counts_must_be_nonnegative';
  end if;

  if v_assessment in ('not_assessed', 'low_data', 'stale') then
    v_status := 'insufficient_evidence'; v_trend := 'stable';
  elsif v_assessment = 'contradictory' then
    v_status := 'contradictory'; v_trend := 'stable'; v_review := true;
  elsif v_focus = 0 then
    if v_strength then
      v_status := 'consistent_strength'; v_trend := 'strong';
    else
      v_status := 'emerging_strength';
      v_trend := case when v_latest = 'strength' then 'strong' else 'stable' end;
    end if;
  elsif v_latest = 'strength' and v_resolution and v_recent_focus = 0 then
    v_status := 'resolved'; v_trend := 'resolved'; v_review := true;
  elsif v_latest in ('strength', 'developing') and v_decision
    and v_recovery >= 2 and v_recent_focus <= 1 then
    v_status := 'improving'; v_trend := 'improving';
  elsif v_persistent and v_recent_focus >= 2 then
    v_status := 'persistent'; v_trend := 'stable'; v_review := true;
  elsif v_decision and v_focus >= 2 then
    v_status := 'recurring';
    v_trend := case when v_latest = 'focus' and v_recent_focus >= 2
      then 'declining' else 'stable' end;
  else
    v_status := 'new_focus'; v_trend := 'stable';
  end if;

  v_priority := case when v_status = 'persistent' then 'high'
    when v_status in ('recurring', 'new_focus', 'contradictory') then 'medium'
    else 'low' end;
  return jsonb_build_object(
    'status', v_status, 'trend', v_trend, 'priority', v_priority,
    'teacherReviewRequired', v_review,
    'classifierVersion', 'progress-classifier-v1'
  );
end;
$$;
revoke all on function public.student_learning_classify_progress(jsonb)
  from public, anon, authenticated;
grant execute on function public.student_learning_classify_progress(jsonb) to service_role;

insert into public.academic_progress_golden_journeys(
  journey_key, category, description, input_metrics,
  expected_status, expected_trend, expected_priority, expected_teacher_review,
  status, approval_source, approved_at
) values
  ('missing-evidence', 'missing',
    'No qualifying evidence must remain explicitly insufficient rather than weak.',
    jsonb_build_object('assessment_state','not_assessed','latest_observation_type','focus',
      'focus_observations',0,'recent_focus_observations',0,
      'recovery_observations_after_last_focus',0,'decision_eligible',false,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'insufficient_evidence','stable','low',false,'approved','system_contract',now()),
  ('low-data-focus', 'weak',
    'A single or sparse focus signal must be withheld until the decision gate passes.',
    jsonb_build_object('assessment_state','low_data','latest_observation_type','focus',
      'focus_observations',1,'recent_focus_observations',1,
      'recovery_observations_after_last_focus',0,'decision_eligible',false,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'insufficient_evidence','stable','low',false,'approved','system_contract',now()),
  ('new-focus-qualified', 'weak',
    'A qualified first focus pattern is visible without being overstated as recurring.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','focus',
      'focus_observations',1,'recent_focus_observations',1,
      'recovery_observations_after_last_focus',0,'decision_eligible',true,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'new_focus','stable','medium',false,'approved','system_contract',now()),
  ('recurring-focus', 'recurring',
    'Repeated qualified focus evidence becomes recurring before persistence is proven.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','focus',
      'focus_observations',2,'recent_focus_observations',1,
      'recovery_observations_after_last_focus',0,'decision_eligible',true,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'recurring','stable','medium',false,'approved','system_contract',now()),
  ('persistent-focus', 'persistent',
    'Persistent focus requires the dedicated confidence gate and recent repeated focus.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','focus',
      'focus_observations',3,'recent_focus_observations',2,
      'recovery_observations_after_last_focus',0,'decision_eligible',true,
      'persistent_eligible',true,'resolution_eligible',false,'strength_eligible',false),
    'persistent','stable','high',true,'approved','system_contract',now()),
  ('improving-after-focus', 'improving',
    'Two later recovery observations show improvement without claiming full resolution.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','developing',
      'focus_observations',2,'recent_focus_observations',1,
      'recovery_observations_after_last_focus',2,'decision_eligible',true,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'improving','improving','low',false,'approved','system_contract',now()),
  ('resolved-after-focus', 'resolved',
    'Resolution requires the resolution gate plus recent strength after prior focus.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','strength',
      'focus_observations',2,'recent_focus_observations',0,
      'recovery_observations_after_last_focus',2,'decision_eligible',true,
      'persistent_eligible',false,'resolution_eligible',true,'strength_eligible',true),
    'resolved','resolved','low',true,'approved','system_contract',now()),
  ('emerging-strength', 'strength',
    'Strength evidence below the dedicated gate remains emerging rather than consistent.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','strength',
      'focus_observations',0,'recent_focus_observations',0,
      'recovery_observations_after_last_focus',0,'decision_eligible',true,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'emerging_strength','strong','low',false,'approved','system_contract',now()),
  ('consistent-strength', 'strength',
    'Consistent strength appears only after the independent strength gate passes.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','strength',
      'focus_observations',0,'recent_focus_observations',0,
      'recovery_observations_after_last_focus',0,'decision_eligible',true,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',true),
    'consistent_strength','strong','low',false,'approved','system_contract',now()),
  ('declining-recurring-focus', 'decline',
    'Recent repeated focus within a recurring pattern is disclosed as declining.',
    jsonb_build_object('assessment_state','assessed','latest_observation_type','focus',
      'focus_observations',2,'recent_focus_observations',2,
      'recovery_observations_after_last_focus',0,'decision_eligible',true,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'recurring','declining','medium',false,'approved','system_contract',now()),
  ('recent-contradiction', 'contradictory',
    'Conflicting recent focus and strength evidence is routed to teacher review.',
    jsonb_build_object('assessment_state','contradictory','latest_observation_type','strength',
      'focus_observations',2,'recent_focus_observations',1,
      'recovery_observations_after_last_focus',1,'decision_eligible',false,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'contradictory','stable','medium',true,'approved','system_contract',now()),
  ('stale-prior-persistence', 'stale',
    'A formerly persistent pattern cannot remain current after its evidence becomes stale.',
    jsonb_build_object('assessment_state','stale','latest_observation_type','focus',
      'focus_observations',4,'recent_focus_observations',3,
      'recovery_observations_after_last_focus',0,'decision_eligible',false,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false),
    'insufficient_evidence','stable','low',false,'approved','system_contract',now()),
  ('new-year-does-not-inherit-persistence', 'year_transition',
    'A new academic year with low data cannot inherit the prior year persistent label.',
    jsonb_build_object('assessment_state','low_data','latest_observation_type','developing',
      'focus_observations',0,'recent_focus_observations',0,
      'recovery_observations_after_last_focus',0,'decision_eligible',false,
      'persistent_eligible',false,'resolution_eligible',false,'strength_eligible',false,
      'previous_year_status','persistent','academic_year_isolated',true),
    'insufficient_evidence','stable','low',false,'approved','system_contract',now())
on conflict (journey_key) do nothing;

create or replace function public.rpc_run_academic_progress_golden_validation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy_id uuid;
  v_run_id uuid;
  v_case record;
  v_actual jsonb;
  v_passed integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  select p.id into v_policy_id
  from public.academic_evidence_confidence_policies p
  where p.policy_key = 'longitudinal-confidence' and p.status = 'active'
  order by p.version desc limit 1;
  if v_policy_id is null then
    return jsonb_build_object('success', false, 'code', 'active_confidence_policy_missing');
  end if;

  insert into public.academic_progress_golden_validation_runs(policy_id, created_by)
  values (v_policy_id, (select auth.uid())) returning id into v_run_id;

  begin
    for v_case in
      select * from public.academic_progress_golden_journeys j
      where j.status = 'approved' order by j.category, j.journey_key
    loop
      v_total := v_total + 1;
      v_actual := public.student_learning_classify_progress(v_case.input_metrics);
      if v_actual->>'status' = v_case.expected_status
        and v_actual->>'trend' = v_case.expected_trend
        and v_actual->>'priority' = v_case.expected_priority
        and (v_actual->>'teacherReviewRequired')::boolean = v_case.expected_teacher_review then
        v_passed := v_passed + 1;
      else
        v_failed := v_failed + 1;
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'journeyKey', v_case.journey_key, 'category', v_case.category,
        'passed', v_actual->>'status' = v_case.expected_status
          and v_actual->>'trend' = v_case.expected_trend
          and v_actual->>'priority' = v_case.expected_priority
          and (v_actual->>'teacherReviewRequired')::boolean = v_case.expected_teacher_review,
        'expected', jsonb_build_object('status', v_case.expected_status,
          'trend', v_case.expected_trend, 'priority', v_case.expected_priority,
          'teacherReviewRequired', v_case.expected_teacher_review),
        'actual', v_actual
      ));
    end loop;
    if v_total = 0 then raise exception 'approved_golden_journeys_missing'; end if;
    update public.academic_progress_golden_validation_runs set
      status = case when v_failed = 0 then 'completed' else 'failed' end,
      journey_count = v_total, passed_count = v_passed, failed_count = v_failed,
      results = v_results,
      disclosure = jsonb_build_object(
        'allGoldenJourneysPassed', v_failed = 0,
        'sourceObservationsMutated', false,
        'focusStatesMutated', false,
        'requiredBeforeShadowComparison', true
      ), completed_at = now()
    where id = v_run_id;
  exception when others then
    update public.academic_progress_golden_validation_runs set
      status = 'failed', journey_count = v_total,
      passed_count = v_passed, failed_count = greatest(v_failed, 1),
      results = v_results,
      disclosure = jsonb_build_object('error', sqlerrm,
        'sourceObservationsMutated', false, 'focusStatesMutated', false),
      completed_at = now()
    where id = v_run_id;
  end;

  return (select jsonb_build_object(
    'success', r.status = 'completed' and r.failed_count = 0,
    'runId', r.id, 'status', r.status, 'journeyCount', r.journey_count,
    'passedCount', r.passed_count, 'failedCount', r.failed_count,
    'results', r.results, 'disclosure', r.disclosure
  ) from public.academic_progress_golden_validation_runs r where r.id = v_run_id);
end;
$$;
revoke all on function public.rpc_run_academic_progress_golden_validation()
  from public, anon, authenticated;
grant execute on function public.rpc_run_academic_progress_golden_validation() to service_role;

create or replace function public.student_learning_confidence_progress_metrics(
  p_confidence_state public.student_learning_confidence_states,
  p_latest_observation_type text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'assessment_state', p_confidence_state.assessment_state,
    'latest_observation_type', p_latest_observation_type,
    'focus_observations', p_confidence_state.focus_observations,
    'recent_focus_observations', p_confidence_state.recent_focus_observations,
    'recovery_observations_after_last_focus', p_confidence_state.recovery_observations_after_last_focus,
    'decision_eligible', p_confidence_state.decision_eligible,
    'persistent_eligible', p_confidence_state.persistent_eligible,
    'resolution_eligible', p_confidence_state.resolution_eligible,
    'strength_eligible', p_confidence_state.strength_eligible
  );
$$;
revoke all on function public.student_learning_confidence_progress_metrics(
  public.student_learning_confidence_states,text
) from public, anon, authenticated;
grant execute on function public.student_learning_confidence_progress_metrics(
  public.student_learning_confidence_states,text
) to service_role;

create or replace function public.student_learning_refresh_focus_state(p_student_id uuid, p_skill_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  select o.* into v_latest from public.student_learning_observations o
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
    v_latest.observation_type, v_decision->>'status', v_decision->>'trend',
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
$$;
revoke all on function public.student_learning_refresh_focus_state(uuid,text)
  from public, anon, authenticated;
grant execute on function public.student_learning_refresh_focus_state(uuid,text) to service_role;

create or replace function public.rpc_run_student_learning_shadow_validation(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_as_of timestamptz,
  p_student_ids uuid[] default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy_id uuid;
  v_golden_run_id uuid;
  v_run_id uuid;
  v_row record;
  v_conf public.student_learning_confidence_states%rowtype;
  v_latest_type text;
  v_current record;
  v_candidate jsonb;
  v_outcome text;
  v_risk text;
  v_requires_review boolean;
  v_observation_count integer;
  v_evidence_latest_at timestamptz;
  v_evidence_hash text;
begin
  if p_school_id is null or p_academic_year_id is null or p_as_of is null then
    return jsonb_build_object('success', false, 'code', 'school_year_and_as_of_required');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    return jsonb_build_object('success', false, 'code', 'comparison_limit_out_of_range');
  end if;
  if not exists (select 1 from public.school_academic_years y
    where y.id = p_academic_year_id and y.school_id = p_school_id) then
    return jsonb_build_object('success', false, 'code', 'school_academic_year_not_found');
  end if;
  if p_student_ids is not null and exists (
    select 1 from unnest(p_student_ids) sid
    left join public.users u on u.id = sid and u.school_id = p_school_id
    where u.id is null
  ) then return jsonb_build_object('success', false, 'code', 'student_filter_outside_school'); end if;

  select p.id into v_policy_id from public.academic_evidence_confidence_policies p
  where p.policy_key = 'longitudinal-confidence' and p.status = 'active'
  order by p.version desc limit 1;
  select r.id into v_golden_run_id
  from public.academic_progress_golden_validation_runs r
  where r.policy_id = v_policy_id and r.status = 'completed' and r.failed_count = 0
  order by r.completed_at desc limit 1;
  if v_golden_run_id is null then
    return jsonb_build_object('success', false, 'code', 'passing_golden_validation_required');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'progress-shadow:' || p_school_id::text || ':' || p_academic_year_id::text, 0
  ));
  insert into public.student_learning_shadow_runs(
    school_id, academic_year_id, policy_id, golden_validation_run_id,
    as_of_at, student_filter_count, comparison_limit, created_by
  ) values (
    p_school_id, p_academic_year_id, v_policy_id, v_golden_run_id, p_as_of,
    case when p_student_ids is null then null else cardinality(p_student_ids) end,
    p_limit, (select auth.uid())
  ) returning id into v_run_id;

  begin
    for v_row in
      select o.student_id, o.skill_key
      from public.student_learning_observations o
      where o.school_id = p_school_id and o.academic_year_id = p_academic_year_id
        and o.observed_at <= p_as_of
        and (p_student_ids is null or o.student_id = any(p_student_ids))
      group by o.student_id, o.skill_key
      order by o.student_id, o.skill_key
      limit p_limit
    loop
      select f.current_status, f.trend, f.priority, f.confidence_score,
        f.confidence_band, f.assessment_state, f.updated_at
      into v_current
      from public.student_learning_focus_states f
      where f.student_id = v_row.student_id and f.skill_key = v_row.skill_key;

      perform public.student_learning_rebuild_confidence_state(
        v_row.student_id, v_row.skill_key, p_as_of
      );
      select * into v_conf from public.student_learning_confidence_states c
      where c.student_id = v_row.student_id and c.skill_key = v_row.skill_key;
      if not found then continue; end if;
      select o.observation_type into v_latest_type
      from public.student_learning_observations o
      where o.student_id = v_row.student_id and o.skill_key = v_row.skill_key
        and o.academic_year_id = p_academic_year_id and o.observed_at <= p_as_of
      order by public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      ) desc, o.observed_at desc, o.created_at desc, o.id desc limit 1;
      v_candidate := public.student_learning_classify_progress(
        public.student_learning_confidence_progress_metrics(v_conf, v_latest_type)
      );

      v_outcome := case
        when v_current.current_status is null then 'missing_current_state'
        when v_current.current_status = v_candidate->>'status' then 'same'
        when v_candidate->>'status' = 'insufficient_evidence' then 'confidence_withheld'
        when v_candidate->>'status' = 'contradictory' then 'contradiction_detected'
        else 'status_changed' end;
      v_risk := case
        when v_outcome <> 'same' and (
          coalesce(v_current.current_status, '') in ('persistent','resolved','consistent_strength')
          or v_candidate->>'status' in ('persistent','resolved','consistent_strength','contradictory')
        ) then 'high'
        when v_outcome <> 'same' then 'medium' else 'low' end;
      v_requires_review := v_outcome <> 'same'
        or (v_candidate->>'teacherReviewRequired')::boolean;

      select count(*)::integer, max(o.observed_at),
        encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
          o.id::text, o.observed_at::text, o.created_at::text, o.observation_type,
          o.source_type, o.source_key, o.evidence_count::text,
          o.evidence_percentage::text, o.evidence_quality,
          o.contributes_to_focus_state::text
        ), ',' order by o.observed_at, o.created_at, o.id), ''), 'UTF8'), 'sha256'), 'hex')
      into v_observation_count, v_evidence_latest_at, v_evidence_hash
      from public.student_learning_observations o
      where o.student_id = v_row.student_id and o.skill_key = v_row.skill_key
        and o.academic_year_id = p_academic_year_id and o.observed_at <= p_as_of;

      insert into public.student_learning_shadow_results(
        shadow_run_id, school_id, student_id, academic_year_id, academic_subject_id,
        confidence_state_id, skill_key, subject, topic, skill, subskill,
        current_status, candidate_status, candidate_trend, candidate_priority,
        comparison_outcome, risk_level, teacher_review_required,
        evidence_observation_count, evidence_latest_at, evidence_snapshot_hash,
        current_snapshot, candidate_snapshot
      ) values (
        v_run_id, p_school_id, v_row.student_id, p_academic_year_id,
        v_conf.academic_subject_id, v_conf.id, v_conf.skill_key, v_conf.subject,
        v_conf.topic, v_conf.skill, v_conf.subskill, v_current.current_status,
        v_candidate->>'status', v_candidate->>'trend', v_candidate->>'priority',
        v_outcome, v_risk, v_requires_review, v_observation_count,
        v_evidence_latest_at, v_evidence_hash,
        jsonb_build_object('status', v_current.current_status, 'trend', v_current.trend,
          'priority', v_current.priority, 'confidenceScore', v_current.confidence_score,
          'confidenceBand', v_current.confidence_band,
          'assessmentState', v_current.assessment_state, 'updatedAt', v_current.updated_at),
        jsonb_build_object('decision', v_candidate, 'confidenceStateId', v_conf.id,
          'confidenceScore', v_conf.confidence_score, 'confidenceBand', v_conf.confidence_band,
          'assessmentState', v_conf.assessment_state, 'gates', v_conf.gate_results,
          'asOf', v_conf.as_of_at, 'computedAt', v_conf.computed_at)
      );
    end loop;

    update public.student_learning_shadow_runs r set
      status = 'completed',
      total_compared = x.total_count,
      exact_match_count = x.match_count,
      difference_count = x.difference_count,
      high_risk_difference_count = x.high_risk_count,
      teacher_review_required_count = x.review_count,
      disclosure = jsonb_build_object(
        'goldenValidationRunId', v_golden_run_id,
        'academicYearIsolated', true,
        'evidenceCutoffApplied', true,
        'evidenceSnapshotsHashed', true,
        'sourceObservationsMutated', false,
        'focusStatesMutated', false,
        'confidenceProjectionRefreshed', true,
        'candidateConclusionsApplied', false,
        'teacherValidationChangesLearnerRecord', false
      ), completed_at = now()
    from (
      select count(*)::integer as total_count,
        count(*) filter (where s.comparison_outcome = 'same')::integer as match_count,
        count(*) filter (where s.comparison_outcome <> 'same')::integer as difference_count,
        count(*) filter (where s.comparison_outcome <> 'same' and s.risk_level = 'high')::integer as high_risk_count,
        count(*) filter (where s.teacher_review_required)::integer as review_count
      from public.student_learning_shadow_results s where s.shadow_run_id = v_run_id
    ) x where r.id = v_run_id;
  exception when others then
    update public.student_learning_shadow_runs set status = 'failed',
      failure_code = sqlstate,
      disclosure = jsonb_build_object('error', sqlerrm,
        'sourceObservationsMutated', false, 'focusStatesMutated', false,
        'candidateConclusionsApplied', false), completed_at = now()
    where id = v_run_id;
  end;

  return (select jsonb_build_object(
    'success', r.status = 'completed', 'runId', r.id, 'status', r.status,
    'totalCompared', r.total_compared, 'exactMatches', r.exact_match_count,
    'differences', r.difference_count,
    'highRiskDifferences', r.high_risk_difference_count,
    'teacherReviewRequired', r.teacher_review_required_count,
    'failureCode', r.failure_code, 'disclosure', r.disclosure
  ) from public.student_learning_shadow_runs r where r.id = v_run_id);
end;
$$;
revoke all on function public.rpc_run_student_learning_shadow_validation(uuid,uuid,timestamptz,uuid[],integer)
  from public, anon, authenticated;
grant execute on function public.rpc_run_student_learning_shadow_validation(uuid,uuid,timestamptz,uuid[],integer)
  to service_role;

create or replace function public.rpc_submit_student_learning_validation_review(
  p_shadow_result_id uuid,
  p_verdict text,
  p_expected_status text default null,
  p_evidence_gap_codes text[] default '{}'::text[],
  p_rationale text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_result record;
  v_role text;
  v_version integer;
  v_previous_id uuid;
  v_review_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select s.*, a.code as subject_code, a.name as subject_name
  into v_result
  from public.student_learning_shadow_results s
  left join public.academic_subjects a on a.id = s.academic_subject_id
  where s.id = p_shadow_result_id;
  if not found then return jsonb_build_object('success', false, 'code', 'shadow_result_not_found'); end if;

  if public.is_school_owner(v_result.school_id) then
    v_role := 'school_head';
  elsif exists (select 1 from public.school_members sm
    where sm.school_id = v_result.school_id and sm.user_id = v_caller
      and sm.status = 'active' and sm.role_in_school = 'school_admin') then
    v_role := 'school_admin';
  elsif exists (
    select 1 from public.class_students cs
    join public.class_teacher_assignments cta on cta.class_id = cs.class_id
      and cta.school_id = v_result.school_id and cta.teacher_user_id = v_caller and cta.active
    where cs.student_id = v_result.student_id
      and (public.academic_normalize_subject_key(cta.subject)
        = public.academic_normalize_subject_key(v_result.subject)
        or public.academic_normalize_subject_key(cta.subject) = v_result.subject_code
        or public.academic_normalize_subject_key(cta.subject)
          = public.academic_normalize_subject_key(v_result.subject_name))
  ) then v_role := 'teacher';
  else raise exception 'Not authorized for validation review'; end if;

  if p_verdict not in ('agree', 'disagree', 'needs_more_evidence') then
    return jsonb_build_object('success', false, 'code', 'invalid_validation_verdict');
  end if;
  if p_verdict = 'disagree' and p_expected_status is null then
    return jsonb_build_object('success', false, 'code', 'expected_status_required_for_disagreement');
  end if;
  if p_verdict = 'needs_more_evidence' and cardinality(coalesce(p_evidence_gap_codes, '{}'::text[])) = 0 then
    return jsonb_build_object('success', false, 'code', 'evidence_gap_required');
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 10 then
    return jsonb_build_object('success', false, 'code', 'review_rationale_too_short');
  end if;

  select r.id, r.review_version into v_previous_id, v_version
  from public.student_learning_validation_reviews r
  where r.shadow_result_id = p_shadow_result_id and r.reviewer_id = v_caller
  order by r.review_version desc limit 1;
  v_version := coalesce(v_version, 0) + 1;
  insert into public.student_learning_validation_reviews(
    shadow_result_id, school_id, reviewer_id, reviewer_role, review_version,
    supersedes_review_id, verdict, expected_status, evidence_gap_codes, rationale
  ) values (
    p_shadow_result_id, v_result.school_id, v_caller, v_role, v_version,
    v_previous_id, p_verdict, p_expected_status,
    coalesce(p_evidence_gap_codes, '{}'::text[]), trim(p_rationale)
  ) returning id into v_review_id;
  return jsonb_build_object('success', true, 'reviewId', v_review_id,
    'reviewVersion', v_version, 'verdict', p_verdict,
    'candidateConclusionApplied', false,
    'teacherValidationChangesLearnerRecord', false);
end;
$$;
revoke all on function public.rpc_submit_student_learning_validation_review(uuid,text,text,text[],text)
  from public, anon;
grant execute on function public.rpc_submit_student_learning_validation_review(uuid,text,text,text[],text)
  to authenticated, service_role;

create or replace function public.rpc_school_student_progress_validation(
  p_school_id uuid,
  p_shadow_run_id uuid default null,
  p_subject text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_run_id uuid;
  v_is_head boolean := false;
  v_is_admin boolean := false;
  v_is_teacher boolean := false;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  v_is_head := public.is_school_owner(p_school_id);
  select exists (select 1 from public.school_members sm
    where sm.school_id = p_school_id and sm.user_id = v_caller
      and sm.status = 'active' and sm.role_in_school = 'school_admin') into v_is_admin;
  select exists (select 1 from public.class_teacher_assignments cta
    where cta.school_id = p_school_id and cta.teacher_user_id = v_caller and cta.active)
  into v_is_teacher;
  if not (v_is_head or v_is_admin or v_is_teacher) then
    raise exception 'Not authorized for school progress validation';
  end if;
  if p_shadow_run_id is not null then
    select r.id into v_run_id from public.student_learning_shadow_runs r
    where r.id = p_shadow_run_id and r.school_id = p_school_id;
  else
    select r.id into v_run_id from public.student_learning_shadow_runs r
    where r.school_id = p_school_id and r.status = 'completed'
    order by r.completed_at desc limit 1;
  end if;
  if v_run_id is null then
    return jsonb_build_object('success', false, 'code', 'shadow_run_not_found');
  end if;

  with accessible as (
    select s.*
    from public.student_learning_shadow_results s
    left join public.academic_subjects a on a.id = s.academic_subject_id
    where s.shadow_run_id = v_run_id
      and (p_subject is null
        or public.academic_normalize_subject_key(s.subject)
          = public.academic_normalize_subject_key(p_subject))
      and (v_is_head or v_is_admin or exists (
        select 1 from public.class_students cs
        join public.class_teacher_assignments cta on cta.class_id = cs.class_id
          and cta.school_id = p_school_id and cta.teacher_user_id = v_caller and cta.active
        where cs.student_id = s.student_id
          and (public.academic_normalize_subject_key(cta.subject)
              = public.academic_normalize_subject_key(s.subject)
            or public.academic_normalize_subject_key(cta.subject) = a.code
            or public.academic_normalize_subject_key(cta.subject)
              = public.academic_normalize_subject_key(a.name))
      ))
  ), latest_reviews as (
    select distinct on (r.shadow_result_id, r.reviewer_id)
      r.shadow_result_id, r.reviewer_id, r.reviewer_role, r.review_version,
      r.verdict, r.expected_status, r.evidence_gap_codes, r.rationale, r.reviewed_at
    from public.student_learning_validation_reviews r
    join accessible a on a.id = r.shadow_result_id
    order by r.shadow_result_id, r.reviewer_id, r.review_version desc
  ), review_summary as (
    select r.shadow_result_id,
      count(*)::integer as review_count,
      count(*) filter (where r.verdict = 'agree')::integer as agree_count,
      count(*) filter (where r.verdict = 'disagree')::integer as disagree_count,
      count(*) filter (where r.verdict = 'needs_more_evidence')::integer as more_evidence_count,
      jsonb_agg(jsonb_build_object(
        'reviewerId', r.reviewer_id, 'reviewerRole', r.reviewer_role,
        'version', r.review_version, 'verdict', r.verdict,
        'expectedStatus', r.expected_status, 'evidenceGapCodes', r.evidence_gap_codes,
        'rationale', r.rationale, 'reviewedAt', r.reviewed_at
      ) order by r.reviewed_at desc) as reviews
    from latest_reviews r group by r.shadow_result_id
  )
  select jsonb_build_object(
    'success', true, 'shadowRunId', v_run_id,
    'viewer', case when v_is_head then 'school_head' when v_is_admin then 'school_admin' else 'teacher' end,
    'summary', jsonb_build_object(
      'visibleComparisons', count(*),
      'exactMatches', count(*) filter (where a.comparison_outcome = 'same'),
      'differences', count(*) filter (where a.comparison_outcome <> 'same'),
      'highRiskDifferences', count(*) filter (where a.comparison_outcome <> 'same' and a.risk_level = 'high'),
      'reviewRequired', count(*) filter (where a.teacher_review_required),
      'reviewed', count(*) filter (where coalesce(rs.review_count, 0) > 0),
      'teacherDisagreements', coalesce(sum(rs.disagree_count), 0),
      'needsMoreEvidence', coalesce(sum(rs.more_evidence_count), 0)
    ),
    'comparisons', coalesce(jsonb_agg(jsonb_build_object(
      'shadowResultId', a.id, 'studentId', a.student_id, 'subject', a.subject,
      'topic', a.topic, 'skill', a.skill, 'subskill', a.subskill,
      'currentStatus', a.current_status, 'candidateStatus', a.candidate_status,
      'candidateTrend', a.candidate_trend, 'candidatePriority', a.candidate_priority,
      'comparisonOutcome', a.comparison_outcome, 'riskLevel', a.risk_level,
      'teacherReviewRequired', a.teacher_review_required,
      'evidenceObservationCount', a.evidence_observation_count,
      'evidenceLatestAt', a.evidence_latest_at,
      'evidenceSnapshotHash', a.evidence_snapshot_hash,
      'currentSnapshot', a.current_snapshot, 'candidateSnapshot', a.candidate_snapshot,
      'reviewCount', coalesce(rs.review_count, 0),
      'agreeCount', coalesce(rs.agree_count, 0),
      'disagreeCount', coalesce(rs.disagree_count, 0),
      'needsMoreEvidenceCount', coalesce(rs.more_evidence_count, 0),
      'reviews', coalesce(rs.reviews, '[]'::jsonb)
    ) order by case a.risk_level when 'high' then 1 when 'medium' then 2 else 3 end,
      a.subject, a.student_id, a.skill_key), '[]'::jsonb),
    'disclosure', jsonb_build_object(
      'shadowOnly', true, 'candidateConclusionsApplied', false,
      'teacherValidationChangesLearnerRecord', false,
      'latestReviewVersionOnlyInSummary', true,
      'sourceEvidenceTraceableByHash', true
    )
  ) into v_result
  from accessible a left join review_summary rs on rs.shadow_result_id = a.id;
  return v_result;
end;
$$;
revoke all on function public.rpc_school_student_progress_validation(uuid,uuid,text)
  from public, anon;
grant execute on function public.rpc_school_student_progress_validation(uuid,uuid,text)
  to authenticated, service_role;

comment on table public.academic_progress_golden_journeys is
  'Approved synthetic contracts for missing, focus, persistence, recovery, strength, contradiction, staleness, decline, and year transitions.';
comment on table public.student_learning_shadow_runs is
  'Non-destructive comparisons between stored focus conclusions and confidence-gated candidates at a fixed evidence cutoff.';
comment on table public.student_learning_shadow_results is
  'Immutable per-skill comparison snapshots with exact evidence hashes and review risk.';
comment on table public.student_learning_validation_reviews is
  'Append-only professional teacher/admin validation; review never silently changes the learner record.';
comment on function public.rpc_run_student_learning_shadow_validation(uuid,uuid,timestamptz,uuid[],integer) is
  'Service-only bounded shadow comparison; requires a passing golden validation run and does not apply candidate conclusions.';
