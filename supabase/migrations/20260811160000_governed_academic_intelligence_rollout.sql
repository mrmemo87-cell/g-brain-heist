-- Phase 9: governed academic-intelligence rollout.
--
-- A school may validate staff-only pilot output before release. Student and family
-- publication stays fail closed until a School Head approves a versioned policy,
-- a deterministic readiness snapshot passes that policy, and an append-only
-- capability decision enables the audience. Corrections and retention actions are
-- requests and decisions; they never rewrite or silently delete academic evidence.

create table public.academic_intelligence_governance_policies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  policy_version integer not null check (policy_version > 0),
  supersedes_policy_id uuid references public.academic_intelligence_governance_policies(id) on delete restrict,
  min_evidence_coverage_percent numeric(5,2) not null check (min_evidence_coverage_percent between 0 and 100),
  min_curriculum_coverage_percent numeric(5,2) not null check (min_curriculum_coverage_percent between 0 and 100),
  min_shadow_review_percent numeric(5,2) not null check (min_shadow_review_percent between 0 and 100),
  min_intervention_review_percent numeric(5,2) not null check (min_intervention_review_percent between 0 and 100),
  min_reproducible_report_samples integer not null check (min_reproducible_report_samples between 1 and 1000),
  retention_months integer not null check (retention_months between 12 and 180),
  correction_response_days integer not null check (correction_response_days between 1 and 90),
  governance_attestation text not null check (length(trim(governance_attestation)) >= 40),
  policy_hash text not null check (policy_hash ~ '^[0-9a-f]{64}$'),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  unique (school_id, academic_year_id, policy_version),
  unique (supersedes_policy_id),
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete restrict
);

create table public.academic_intelligence_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  policy_id uuid not null references public.academic_intelligence_governance_policies(id) on delete restrict,
  readiness_status text not null check (readiness_status in ('ready','not_ready')),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  blockers jsonb not null check (jsonb_typeof(blockers) = 'array'),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  source_snapshot_hash text not null check (source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  readiness_hash text not null check (readiness_hash ~ '^[0-9a-f]{64}$'),
  evaluated_by uuid not null references auth.users(id) on delete restrict,
  evaluated_at timestamptz not null default now(),
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete restrict
);

create table public.academic_intelligence_release_decisions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  policy_id uuid not null references public.academic_intelligence_governance_policies(id) on delete restrict,
  readiness_snapshot_id uuid not null references public.academic_intelligence_readiness_snapshots(id) on delete restrict,
  capability text not null check (capability in (
    'student_reports','family_reports','schoolwide_reporting','intervention_effectiveness'
  )),
  decision text not null check (decision in ('enabled','paused','disabled')),
  rationale text not null check (length(trim(rationale)) >= 20),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete restrict
);

create table public.academic_report_correction_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  report_id uuid not null references public.academic_report_snapshots(id) on delete restrict,
  reason_code text not null check (reason_code in (
    'source_error','scope_error','identity_error','interpretation_concern','privacy_concern','other'
  )),
  detail text not null check (length(trim(detail)) >= 20),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now()
);

create table public.academic_report_correction_events (
  id uuid primary key default gen_random_uuid(),
  correction_request_id uuid not null references public.academic_report_correction_requests(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  event_type text not null check (event_type in (
    'submitted','acknowledged','rejected','superseded','closed'
  )),
  replacement_report_id uuid references public.academic_report_snapshots(id) on delete restrict,
  rationale text not null check (length(trim(rationale)) >= 10),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((event_type = 'superseded') = (replacement_report_id is not null))
);

create table public.academic_intelligence_retention_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  request_type text not null check (request_type in ('export','restrict','delete')),
  scope_type text not null check (scope_type in ('report','student','academic_year')),
  report_id uuid references public.academic_report_snapshots(id) on delete restrict,
  student_id uuid references public.users(id) on delete restrict,
  academic_year_id uuid references public.school_academic_years(id) on delete restrict,
  reason text not null check (length(trim(reason)) >= 20),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  check (
    (scope_type = 'report' and report_id is not null and student_id is null and academic_year_id is null)
    or (scope_type = 'student' and report_id is null and student_id is not null and academic_year_id is null)
    or (scope_type = 'academic_year' and report_id is null and student_id is null and academic_year_id is not null)
  )
);

create table public.academic_intelligence_retention_decisions (
  id uuid primary key default gen_random_uuid(),
  retention_request_id uuid not null references public.academic_intelligence_retention_requests(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  decision text not null check (decision in (
    'needs_legal_review','approved_for_export','approved_for_restriction',
    'approved_for_deletion','rejected','completed'
  )),
  rationale text not null check (length(trim(rationale)) >= 20),
  evidence_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_manifest) = 'object'),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create index academic_intelligence_policies_school_year_idx
  on public.academic_intelligence_governance_policies(school_id, academic_year_id, policy_version desc);
create index academic_intelligence_policies_approved_by_idx
  on public.academic_intelligence_governance_policies(approved_by, approved_at desc);
create index academic_intelligence_readiness_school_year_idx
  on public.academic_intelligence_readiness_snapshots(school_id, academic_year_id, evaluated_at desc);
create index academic_intelligence_readiness_policy_idx
  on public.academic_intelligence_readiness_snapshots(policy_id, evaluated_at desc);
create index academic_intelligence_readiness_evaluated_by_idx
  on public.academic_intelligence_readiness_snapshots(evaluated_by, evaluated_at desc);
create index academic_intelligence_release_latest_idx
  on public.academic_intelligence_release_decisions(school_id, academic_year_id, capability, decided_at desc);
create index academic_intelligence_release_policy_idx
  on public.academic_intelligence_release_decisions(policy_id, readiness_snapshot_id);
create index academic_intelligence_release_decided_by_idx
  on public.academic_intelligence_release_decisions(decided_by, decided_at desc);
create index academic_report_corrections_school_idx
  on public.academic_report_correction_requests(school_id, requested_at desc);
create index academic_report_corrections_report_idx
  on public.academic_report_correction_requests(report_id, requested_at desc);
create index academic_report_corrections_requester_idx
  on public.academic_report_correction_requests(requested_by, requested_at desc);
create index academic_report_correction_events_request_idx
  on public.academic_report_correction_events(correction_request_id, created_at desc);
create index academic_report_correction_events_school_idx
  on public.academic_report_correction_events(school_id, created_at desc);
create index academic_report_correction_events_actor_idx
  on public.academic_report_correction_events(actor_user_id, created_at desc);
create index academic_retention_requests_school_idx
  on public.academic_intelligence_retention_requests(school_id, requested_at desc);
create index academic_retention_requests_report_idx
  on public.academic_intelligence_retention_requests(report_id) where report_id is not null;
create index academic_retention_requests_student_idx
  on public.academic_intelligence_retention_requests(student_id) where student_id is not null;
create index academic_retention_requests_year_idx
  on public.academic_intelligence_retention_requests(academic_year_id) where academic_year_id is not null;
create index academic_retention_requests_requester_idx
  on public.academic_intelligence_retention_requests(requested_by, requested_at desc);
create index academic_retention_decisions_request_idx
  on public.academic_intelligence_retention_decisions(retention_request_id, decided_at desc);
create index academic_retention_decisions_school_idx
  on public.academic_intelligence_retention_decisions(school_id, decided_at desc);
create index academic_retention_decisions_actor_idx
  on public.academic_intelligence_retention_decisions(decided_by, decided_at desc);

alter table public.academic_intelligence_governance_policies enable row level security;
alter table public.academic_intelligence_readiness_snapshots enable row level security;
alter table public.academic_intelligence_release_decisions enable row level security;
alter table public.academic_report_correction_requests enable row level security;
alter table public.academic_report_correction_events enable row level security;
alter table public.academic_intelligence_retention_requests enable row level security;
alter table public.academic_intelligence_retention_decisions enable row level security;

revoke all on table public.academic_intelligence_governance_policies from public, anon, authenticated, service_role;
revoke all on table public.academic_intelligence_readiness_snapshots from public, anon, authenticated, service_role;
revoke all on table public.academic_intelligence_release_decisions from public, anon, authenticated, service_role;
revoke all on table public.academic_report_correction_requests from public, anon, authenticated, service_role;
revoke all on table public.academic_report_correction_events from public, anon, authenticated, service_role;
revoke all on table public.academic_intelligence_retention_requests from public, anon, authenticated, service_role;
revoke all on table public.academic_intelligence_retention_decisions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.academic_intelligence_governance_policies to service_role;
grant select, insert, update, delete on table public.academic_intelligence_readiness_snapshots to service_role;
grant select, insert, update, delete on table public.academic_intelligence_release_decisions to service_role;
grant select, insert, update, delete on table public.academic_report_correction_requests to service_role;
grant select, insert, update, delete on table public.academic_report_correction_events to service_role;
grant select, insert, update, delete on table public.academic_intelligence_retention_requests to service_role;
grant select, insert, update, delete on table public.academic_intelligence_retention_decisions to service_role;

create or replace function private.academic_intelligence_governance_record_is_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'academic_intelligence_governance_record_is_append_only';
end;
$$;
revoke all on function private.academic_intelligence_governance_record_is_append_only()
  from public, anon, authenticated, service_role;

create trigger trg_academic_intelligence_policies_append_only before update or delete
  on public.academic_intelligence_governance_policies for each row
  execute function private.academic_intelligence_governance_record_is_append_only();
create trigger trg_academic_intelligence_readiness_append_only before update or delete
  on public.academic_intelligence_readiness_snapshots for each row
  execute function private.academic_intelligence_governance_record_is_append_only();
create trigger trg_academic_intelligence_release_append_only before update or delete
  on public.academic_intelligence_release_decisions for each row
  execute function private.academic_intelligence_governance_record_is_append_only();
create trigger trg_academic_report_corrections_append_only before update or delete
  on public.academic_report_correction_requests for each row
  execute function private.academic_intelligence_governance_record_is_append_only();
create trigger trg_academic_report_correction_events_append_only before update or delete
  on public.academic_report_correction_events for each row
  execute function private.academic_intelligence_governance_record_is_append_only();
create trigger trg_academic_retention_requests_append_only before update or delete
  on public.academic_intelligence_retention_requests for each row
  execute function private.academic_intelligence_governance_record_is_append_only();
create trigger trg_academic_retention_decisions_append_only before update or delete
  on public.academic_intelligence_retention_decisions for each row
  execute function private.academic_intelligence_governance_record_is_append_only();

create or replace function public.academic_intelligence_can_govern(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    public.is_school_owner(p_school_id)
    or exists (
      select 1 from public.school_members sm
      where sm.school_id = p_school_id and sm.user_id = (select auth.uid())
        and sm.status = 'active' and sm.role_in_school = 'school_admin'
    )
  );
$$;
revoke all on function public.academic_intelligence_can_govern(uuid) from public, anon, authenticated;
grant execute on function public.academic_intelligence_can_govern(uuid) to service_role;

create or replace function public.academic_intelligence_capability_is_enabled(
  p_school_id uuid, p_academic_year_id uuid, p_capability text
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select d.decision = 'enabled'
    from public.academic_intelligence_release_decisions d
    where d.school_id = p_school_id and d.academic_year_id = p_academic_year_id
      and d.capability = p_capability
    order by d.decided_at desc, d.id desc limit 1
  ), false);
$$;
revoke all on function public.academic_intelligence_capability_is_enabled(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.academic_intelligence_capability_is_enabled(uuid,uuid,text)
  to service_role;

create or replace function public.rpc_approve_academic_intelligence_governance_policy(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_min_evidence_coverage_percent numeric,
  p_min_curriculum_coverage_percent numeric,
  p_min_shadow_review_percent numeric,
  p_min_intervention_review_percent numeric,
  p_min_reproducible_report_samples integer,
  p_retention_months integer,
  p_correction_response_days integer,
  p_governance_attestation text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_previous public.academic_intelligence_governance_policies%rowtype;
  v_version integer;
  v_hash text;
  v_id uuid;
  v_payload jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.is_school_owner(p_school_id) then
    raise exception 'Only the School Head can approve academic-intelligence governance';
  end if;
  if not exists (select 1 from public.school_academic_years y
    where y.id = p_academic_year_id and y.school_id = p_school_id) then
    raise exception 'Academic year does not belong to the selected school';
  end if;
  if p_min_evidence_coverage_percent not between 0 and 100
    or p_min_curriculum_coverage_percent not between 0 and 100
    or p_min_shadow_review_percent not between 0 and 100
    or p_min_intervention_review_percent not between 0 and 100
    or p_min_reproducible_report_samples not between 1 and 1000
    or p_retention_months not between 12 and 180
    or p_correction_response_days not between 1 and 90
    or length(trim(coalesce(p_governance_attestation, ''))) < 40 then
    raise exception 'Governance policy values are outside the accepted range';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('academic-governance-policy:' || p_school_id::text || ':' || p_academic_year_id::text, 0)
  );
  select * into v_previous from public.academic_intelligence_governance_policies p
  where p.school_id = p_school_id and p.academic_year_id = p_academic_year_id
  order by p.policy_version desc limit 1;
  v_version := coalesce(v_previous.policy_version, 0) + 1;
  v_payload := jsonb_build_object(
    'schoolId', p_school_id, 'academicYearId', p_academic_year_id, 'version', v_version,
    'minEvidenceCoveragePercent', p_min_evidence_coverage_percent,
    'minCurriculumCoveragePercent', p_min_curriculum_coverage_percent,
    'minShadowReviewPercent', p_min_shadow_review_percent,
    'minInterventionReviewPercent', p_min_intervention_review_percent,
    'minReproducibleReportSamples', p_min_reproducible_report_samples,
    'retentionMonths', p_retention_months,
    'correctionResponseDays', p_correction_response_days,
    'governanceAttestation', trim(p_governance_attestation)
  );
  v_hash := encode(extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.academic_intelligence_governance_policies(
    school_id, academic_year_id, policy_version, supersedes_policy_id,
    min_evidence_coverage_percent, min_curriculum_coverage_percent,
    min_shadow_review_percent, min_intervention_review_percent,
    min_reproducible_report_samples, retention_months, correction_response_days,
    governance_attestation, policy_hash, approved_by
  ) values (
    p_school_id, p_academic_year_id, v_version, v_previous.id,
    p_min_evidence_coverage_percent, p_min_curriculum_coverage_percent,
    p_min_shadow_review_percent, p_min_intervention_review_percent,
    p_min_reproducible_report_samples, p_retention_months, p_correction_response_days,
    trim(p_governance_attestation), v_hash, v_caller
  ) returning id into v_id;
  return jsonb_build_object('success', true, 'policyId', v_id, 'version', v_version,
    'policyHash', v_hash, 'supersedesPolicyId', v_previous.id);
end;
$$;
revoke all on function public.rpc_approve_academic_intelligence_governance_policy(
  uuid,uuid,numeric,numeric,numeric,numeric,integer,integer,integer,text
) from public, anon;
grant execute on function public.rpc_approve_academic_intelligence_governance_policy(
  uuid,uuid,numeric,numeric,numeric,numeric,integer,integer,integer,text
) to authenticated, service_role;

create or replace function public.rpc_evaluate_academic_intelligence_readiness(
  p_school_id uuid, p_academic_year_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_policy public.academic_intelligence_governance_policies%rowtype;
  v_students integer := 0;
  v_students_with_evidence integer := 0;
  v_evidence_coverage numeric := 0;
  v_curriculum_coverage numeric := 0;
  v_golden_pass boolean := false;
  v_shadow_total integer := 0;
  v_shadow_required integer := 0;
  v_shadow_reviewed integer := 0;
  v_shadow_review_percent numeric := 100;
  v_high_risk_unreviewed integer := 0;
  v_evaluated_checkpoints integer := 0;
  v_reviewed_checkpoints integer := 0;
  v_intervention_review_percent numeric := 100;
  v_reproducible_samples integer := 0;
  v_final_reports integer := 0;
  v_metrics jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_sources jsonb;
  v_source_hash text;
  v_readiness_hash text;
  v_status text;
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.academic_intelligence_can_govern(p_school_id) then
    raise exception 'Not authorised to evaluate academic-intelligence readiness';
  end if;
  select * into v_policy from public.academic_intelligence_governance_policies p
  where p.school_id = p_school_id and p.academic_year_id = p_academic_year_id
  order by p.policy_version desc limit 1;
  if not found then raise exception 'An approved governance policy is required before readiness evaluation'; end if;

  select count(distinct e.student_id)::integer into v_students
  from public.student_academic_enrolments e
  join public.school_academic_years y on y.id = e.academic_year_id and y.school_id = e.school_id
  where e.school_id = p_school_id and e.academic_year_id = p_academic_year_id
    and e.starts_on <= y.ends_on and coalesce(e.ends_on, y.ends_on) >= y.starts_on;
  select count(distinct o.student_id)::integer into v_students_with_evidence
  from public.student_learning_observations o
  where o.school_id = p_school_id and o.academic_year_id = p_academic_year_id;
  v_evidence_coverage := case when v_students = 0 then 0
    else round(100.0 * v_students_with_evidence / v_students, 2) end;
  select coalesce(round(avg(c.qualified_coverage_percent), 2), 0) into v_curriculum_coverage
  from public.student_curriculum_coverage_states c
  where c.school_id = p_school_id and c.academic_year_id = p_academic_year_id;
  select exists (
    select 1 from public.academic_progress_golden_validation_runs g
    join public.academic_evidence_confidence_policies cp on cp.id = g.policy_id
    where g.status = 'completed' and g.failed_count = 0 and g.journey_count > 0
      and cp.status = 'active'
  ) into v_golden_pass;
  with latest_shadow as (
    select r.* from public.student_learning_shadow_runs r
    where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id
      and r.status = 'completed'
    order by r.completed_at desc, r.id desc limit 1
  )
  select coalesce(max(total_compared), 0), coalesce(max(teacher_review_required_count), 0)
  into v_shadow_total, v_shadow_required from latest_shadow;
  with latest_shadow as (
    select r.id from public.student_learning_shadow_runs r
    where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id
      and r.status = 'completed'
    order by r.completed_at desc, r.id desc limit 1
  ), latest_reviews as (
    select distinct on (vr.shadow_result_id) vr.shadow_result_id, vr.verdict
    from public.student_learning_validation_reviews vr
    join public.student_learning_shadow_results sr on sr.id = vr.shadow_result_id
    join latest_shadow ls on ls.id = sr.shadow_run_id
    where sr.teacher_review_required
    order by vr.shadow_result_id, vr.review_version desc
  )
  select count(*)::integer into v_shadow_reviewed from latest_reviews;
  v_shadow_review_percent := case when v_shadow_required = 0 then 100
    else round(100.0 * v_shadow_reviewed / v_shadow_required, 2) end;
  with latest_shadow as (
    select r.id from public.student_learning_shadow_runs r
    where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id
      and r.status = 'completed'
    order by r.completed_at desc, r.id desc limit 1
  )
  select count(*)::integer into v_high_risk_unreviewed
  from public.student_learning_shadow_results sr join latest_shadow ls on ls.id = sr.shadow_run_id
  where sr.risk_level = 'high' and sr.teacher_review_required
    and coalesce((select vr.verdict from public.student_learning_validation_reviews vr
      where vr.shadow_result_id = sr.id order by vr.review_version desc limit 1),
      'needs_more_evidence') = 'needs_more_evidence';
  select count(*)::integer into v_evaluated_checkpoints
  from public.student_learning_intervention_checkpoints c
  join public.student_learning_interventions i on i.id = c.intervention_id
  where c.school_id = p_school_id and i.academic_year_id = p_academic_year_id
    and c.status = 'evaluated';
  select count(*)::integer into v_reviewed_checkpoints
  from public.student_learning_intervention_outcome_reviews r
  join public.student_learning_intervention_checkpoints c on c.id = r.checkpoint_id
  join public.student_learning_interventions i on i.id = c.intervention_id
  where r.school_id = p_school_id and i.academic_year_id = p_academic_year_id
    and c.status = 'evaluated';
  v_intervention_review_percent := case when v_evaluated_checkpoints = 0 then 100
    else round(100.0 * v_reviewed_checkpoints / v_evaluated_checkpoints, 2) end;
  select count(*)::integer into v_final_reports from public.academic_report_snapshots r
  where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id and r.status = 'final';
  select count(distinct e.report_id)::integer into v_reproducible_samples
  from public.academic_report_events e join public.academic_report_snapshots r on r.id = e.report_id
  where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id
    and e.event_type = 'reused';

  if v_students = 0 then v_blockers := v_blockers || '"no_enrolled_students"'::jsonb; end if;
  if v_evidence_coverage < v_policy.min_evidence_coverage_percent then
    v_blockers := v_blockers || '"evidence_coverage_below_policy"'::jsonb; end if;
  if v_curriculum_coverage < v_policy.min_curriculum_coverage_percent then
    v_blockers := v_blockers || '"curriculum_coverage_below_policy"'::jsonb; end if;
  if not v_golden_pass then v_blockers := v_blockers || '"golden_validation_not_passed"'::jsonb; end if;
  if v_shadow_total = 0 then v_blockers := v_blockers || '"shadow_validation_not_completed"'::jsonb; end if;
  if v_shadow_review_percent < v_policy.min_shadow_review_percent then
    v_blockers := v_blockers || '"shadow_review_below_policy"'::jsonb; end if;
  if v_high_risk_unreviewed > 0 then v_blockers := v_blockers || '"high_risk_shadow_reviews_open"'::jsonb; end if;
  if v_intervention_review_percent < v_policy.min_intervention_review_percent then
    v_blockers := v_blockers || '"intervention_review_below_policy"'::jsonb; end if;
  if v_reproducible_samples < v_policy.min_reproducible_report_samples then
    v_blockers := v_blockers || '"reproducible_report_samples_below_policy"'::jsonb; end if;
  if v_final_reports = 0 then v_blockers := v_blockers || '"no_final_reports"'::jsonb; end if;
  if v_evaluated_checkpoints = 0 then
    v_warnings := v_warnings || '"no_evaluated_intervention_checkpoints"'::jsonb; end if;

  v_metrics := jsonb_build_object(
    'eligibleStudents', v_students, 'studentsWithEvidence', v_students_with_evidence,
    'evidenceCoveragePercent', v_evidence_coverage,
    'curriculumCoveragePercent', v_curriculum_coverage,
    'goldenValidationPassed', v_golden_pass,
    'shadowComparisons', v_shadow_total, 'shadowReviewsRequired', v_shadow_required,
    'shadowReviewsCompleted', v_shadow_reviewed, 'shadowReviewPercent', v_shadow_review_percent,
    'highRiskShadowReviewsOpen', v_high_risk_unreviewed,
    'evaluatedInterventionCheckpoints', v_evaluated_checkpoints,
    'reviewedInterventionCheckpoints', v_reviewed_checkpoints,
    'interventionReviewPercent', v_intervention_review_percent,
    'finalReports', v_final_reports, 'reproducibleReportSamples', v_reproducible_samples
  );
  v_sources := jsonb_build_object('policyHash', v_policy.policy_hash, 'metrics', v_metrics,
    'blockers', v_blockers, 'warnings', v_warnings);
  v_source_hash := encode(extensions.digest(pg_catalog.convert_to(v_sources::text, 'UTF8'), 'sha256'), 'hex');
  v_status := case when jsonb_array_length(v_blockers) = 0 then 'ready' else 'not_ready' end;
  v_readiness_hash := encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('status', v_status, 'sourceSnapshotHash', v_source_hash)::text, 'UTF8'
  ), 'sha256'), 'hex');
  insert into public.academic_intelligence_readiness_snapshots(
    school_id, academic_year_id, policy_id, readiness_status, metrics, blockers,
    warnings, source_snapshot_hash, readiness_hash, evaluated_by
  ) values (
    p_school_id, p_academic_year_id, v_policy.id, v_status, v_metrics, v_blockers,
    v_warnings, v_source_hash, v_readiness_hash, v_caller
  ) returning id into v_id;
  return jsonb_build_object('success', true, 'readinessSnapshotId', v_id,
    'status', v_status, 'metrics', v_metrics, 'blockers', v_blockers,
    'warnings', v_warnings, 'sourceSnapshotHash', v_source_hash,
    'readinessHash', v_readiness_hash, 'policyId', v_policy.id);
end;
$$;
revoke all on function public.rpc_evaluate_academic_intelligence_readiness(uuid,uuid) from public, anon;
grant execute on function public.rpc_evaluate_academic_intelligence_readiness(uuid,uuid)
  to authenticated, service_role;

create or replace function public.rpc_decide_academic_intelligence_release(
  p_readiness_snapshot_id uuid, p_capability text, p_decision text, p_rationale text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_snapshot public.academic_intelligence_readiness_snapshots%rowtype;
  v_latest_policy_id uuid;
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_snapshot from public.academic_intelligence_readiness_snapshots r
  where r.id = p_readiness_snapshot_id;
  if not found then raise exception 'Readiness snapshot not found'; end if;
  if not public.is_school_owner(v_snapshot.school_id) then
    raise exception 'Only the School Head can decide an academic-intelligence release';
  end if;
  if p_capability not in ('student_reports','family_reports','schoolwide_reporting','intervention_effectiveness')
    or p_decision not in ('enabled','paused','disabled')
    or length(trim(coalesce(p_rationale, ''))) < 20 then
    raise exception 'Invalid academic-intelligence release decision';
  end if;
  select p.id into v_latest_policy_id from public.academic_intelligence_governance_policies p
  where p.school_id = v_snapshot.school_id and p.academic_year_id = v_snapshot.academic_year_id
  order by p.policy_version desc limit 1;
  if v_snapshot.policy_id <> v_latest_policy_id then
    raise exception 'Readiness must be re-evaluated against the latest governance policy';
  end if;
  if p_decision = 'enabled' and v_snapshot.readiness_status <> 'ready' then
    raise exception 'A ready snapshot is required to enable an academic-intelligence capability';
  end if;
  if p_decision = 'enabled' and p_capability = 'intervention_effectiveness'
    and coalesce((v_snapshot.metrics->>'evaluatedInterventionCheckpoints')::integer, 0) = 0 then
    raise exception 'Measured intervention checkpoints are required before effectiveness release';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'academic-release:' || v_snapshot.school_id::text || ':' || v_snapshot.academic_year_id::text || ':' || p_capability, 0
  ));
  insert into public.academic_intelligence_release_decisions(
    school_id, academic_year_id, policy_id, readiness_snapshot_id,
    capability, decision, rationale, decided_by
  ) values (
    v_snapshot.school_id, v_snapshot.academic_year_id, v_snapshot.policy_id,
    v_snapshot.id, p_capability, p_decision, trim(p_rationale), v_caller
  ) returning id into v_id;
  return jsonb_build_object('success', true, 'releaseDecisionId', v_id,
    'capability', p_capability, 'decision', p_decision,
    'readinessHash', v_snapshot.readiness_hash);
end;
$$;
revoke all on function public.rpc_decide_academic_intelligence_release(uuid,text,text,text) from public, anon;
grant execute on function public.rpc_decide_academic_intelligence_release(uuid,text,text,text)
  to authenticated, service_role;

create or replace function public.rpc_request_academic_report_correction(
  p_report_id uuid, p_reason_code text, p_detail text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_report public.academic_report_snapshots%rowtype;
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_report from public.academic_report_snapshots r where r.id = p_report_id;
  if not found then raise exception 'Academic report not found'; end if;
  if v_report.status <> 'final' then raise exception 'Only a Final academic report can receive a correction request'; end if;
  if not public.academic_intelligence_can_govern(v_report.school_id)
    and not (v_report.report_type = 'student' and v_report.student_id = v_caller and v_report.status = 'final') then
    raise exception 'Not authorised to request a correction for this report';
  end if;
  if p_reason_code not in ('source_error','scope_error','identity_error','interpretation_concern','privacy_concern','other')
    or length(trim(coalesce(p_detail, ''))) < 20 then raise exception 'Invalid correction request'; end if;
  insert into public.academic_report_correction_requests(
    school_id, report_id, reason_code, detail, requested_by
  ) values (v_report.school_id, v_report.id, p_reason_code, trim(p_detail), v_caller)
  returning id into v_id;
  insert into public.academic_report_correction_events(
    correction_request_id, school_id, event_type, rationale, actor_user_id
  ) values (v_id, v_report.school_id, 'submitted', 'Correction request submitted for governed review.', v_caller);
  return jsonb_build_object('success', true, 'correctionRequestId', v_id,
    'reportId', v_report.id, 'originalReportRemainsImmutable', true);
end;
$$;
revoke all on function public.rpc_request_academic_report_correction(uuid,text,text) from public, anon;
grant execute on function public.rpc_request_academic_report_correction(uuid,text,text)
  to authenticated, service_role;

create or replace function public.rpc_resolve_academic_report_correction(
  p_correction_request_id uuid, p_event_type text, p_rationale text,
  p_replacement_report_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_request public.academic_report_correction_requests%rowtype;
  v_original public.academic_report_snapshots%rowtype;
  v_replacement public.academic_report_snapshots%rowtype;
  v_latest_event text;
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_request from public.academic_report_correction_requests r
  where r.id = p_correction_request_id;
  if not found then raise exception 'Correction request not found'; end if;
  if not public.academic_intelligence_can_govern(v_request.school_id) then
    raise exception 'Not authorised to resolve this correction request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('academic-correction:' || v_request.id::text, 0)
  );
  select e.event_type into v_latest_event from public.academic_report_correction_events e
  where e.correction_request_id = v_request.id order by e.created_at desc, e.id desc limit 1;
  if v_latest_event in ('rejected','superseded','closed') then
    raise exception 'This correction request already has a terminal decision';
  end if;
  if p_event_type not in ('acknowledged','rejected','superseded','closed')
    or length(trim(coalesce(p_rationale, ''))) < 10 then raise exception 'Invalid correction event'; end if;
  if p_event_type = 'superseded' then
    select * into v_original from public.academic_report_snapshots r where r.id = v_request.report_id;
    select * into v_replacement from public.academic_report_snapshots r where r.id = p_replacement_report_id;
    if not found or v_replacement.school_id <> v_request.school_id or v_replacement.status <> 'final'
      or v_replacement.scope_key <> v_original.scope_key
      or v_replacement.audience <> v_original.audience
      or v_replacement.report_version <= v_original.report_version then
      raise exception 'A later final report in the same scope is required to supersede a correction';
    end if;
  elsif p_replacement_report_id is not null then
    raise exception 'Replacement report is valid only for a superseded correction';
  end if;
  insert into public.academic_report_correction_events(
    correction_request_id, school_id, event_type, replacement_report_id,
    rationale, actor_user_id
  ) values (
    v_request.id, v_request.school_id, p_event_type, p_replacement_report_id,
    trim(p_rationale), v_caller
  ) returning id into v_id;
  return jsonb_build_object('success', true, 'correctionEventId', v_id,
    'eventType', p_event_type, 'originalReportRemainsImmutable', true);
end;
$$;
revoke all on function public.rpc_resolve_academic_report_correction(uuid,text,text,uuid) from public, anon;
grant execute on function public.rpc_resolve_academic_report_correction(uuid,text,text,uuid)
  to authenticated, service_role;

create or replace function public.rpc_request_academic_intelligence_retention_action(
  p_school_id uuid, p_request_type text, p_scope_type text, p_reason text,
  p_report_id uuid default null, p_student_id uuid default null, p_academic_year_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_caller uuid := (select auth.uid()); v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.academic_intelligence_can_govern(p_school_id) then
    raise exception 'Not authorised to request an academic-intelligence retention action'; end if;
  if p_request_type not in ('export','restrict','delete')
    or p_scope_type not in ('report','student','academic_year')
    or length(trim(coalesce(p_reason, ''))) < 20 then raise exception 'Invalid retention request'; end if;
  if p_scope_type = 'report' and not exists (select 1 from public.academic_report_snapshots r
      where r.id = p_report_id and r.school_id = p_school_id) then raise exception 'Report is outside the selected school';
  elsif p_scope_type = 'student' and not exists (select 1 from public.users u
      where u.id = p_student_id and u.school_id = p_school_id) then raise exception 'Student is outside the selected school';
  elsif p_scope_type = 'academic_year' and not exists (select 1 from public.school_academic_years y
      where y.id = p_academic_year_id and y.school_id = p_school_id) then raise exception 'Academic year is outside the selected school';
  end if;
  insert into public.academic_intelligence_retention_requests(
    school_id, request_type, scope_type, report_id, student_id, academic_year_id,
    reason, requested_by
  ) values (
    p_school_id, p_request_type, p_scope_type, p_report_id, p_student_id,
    p_academic_year_id, trim(p_reason), v_caller
  ) returning id into v_id;
  return jsonb_build_object('success', true, 'retentionRequestId', v_id,
    'executionAutomatic', false, 'legalReviewRequiredBeforeDestructiveAction', true);
end;
$$;
revoke all on function public.rpc_request_academic_intelligence_retention_action(
  uuid,text,text,text,uuid,uuid,uuid
) from public, anon;
grant execute on function public.rpc_request_academic_intelligence_retention_action(
  uuid,text,text,text,uuid,uuid,uuid
) to authenticated, service_role;

create or replace function public.rpc_decide_academic_intelligence_retention_action(
  p_retention_request_id uuid, p_decision text, p_rationale text,
  p_evidence_manifest jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_request public.academic_intelligence_retention_requests%rowtype;
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_request from public.academic_intelligence_retention_requests r
  where r.id = p_retention_request_id;
  if not found then raise exception 'Retention request not found'; end if;
  if not public.is_school_owner(v_request.school_id) then
    raise exception 'Only the School Head can decide an academic-intelligence retention action'; end if;
  if p_decision not in ('needs_legal_review','approved_for_export','approved_for_restriction',
      'approved_for_deletion','rejected','completed')
    or length(trim(coalesce(p_rationale, ''))) < 20
    or jsonb_typeof(coalesce(p_evidence_manifest, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid retention decision'; end if;
  if p_decision = 'approved_for_deletion' and v_request.request_type <> 'delete' then
    raise exception 'Deletion approval requires a deletion request'; end if;
  insert into public.academic_intelligence_retention_decisions(
    retention_request_id, school_id, decision, rationale, evidence_manifest, decided_by
  ) values (
    v_request.id, v_request.school_id, p_decision, trim(p_rationale),
    coalesce(p_evidence_manifest, '{}'::jsonb), v_caller
  ) returning id into v_id;
  return jsonb_build_object('success', true, 'retentionDecisionId', v_id,
    'decision', p_decision, 'recordsDeletedByThisRpc', false);
end;
$$;
revoke all on function public.rpc_decide_academic_intelligence_retention_action(uuid,text,text,jsonb) from public, anon;
grant execute on function public.rpc_decide_academic_intelligence_retention_action(uuid,text,text,jsonb)
  to authenticated, service_role;

create or replace function public.rpc_academic_intelligence_governance_context(
  p_school_id uuid, p_academic_year_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid := (select auth.uid()); v_year_id uuid := p_academic_year_id;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.academic_intelligence_can_govern(p_school_id) then
    raise exception 'Not authorised for academic-intelligence governance'; end if;
  if v_year_id is null then select y.id into v_year_id from public.school_academic_years y
    where y.school_id = p_school_id order by (y.status = 'active') desc, y.starts_on desc limit 1; end if;
  if v_year_id is null or not exists (select 1 from public.school_academic_years y
    where y.id = v_year_id and y.school_id = p_school_id) then raise exception 'Academic year not found'; end if;
  return jsonb_build_object(
    'success', true, 'schoolId', p_school_id, 'academicYearId', v_year_id,
    'viewer', jsonb_build_object('id', v_caller,
      'role', case when public.is_school_owner(p_school_id) then 'school_head' else 'school_admin' end),
    'years', coalesce((select jsonb_agg(jsonb_build_object(
      'id', y.id, 'name', y.name, 'status', y.status, 'startsOn', y.starts_on, 'endsOn', y.ends_on
    ) order by y.starts_on desc) from public.school_academic_years y where y.school_id = p_school_id), '[]'::jsonb),
    'policy', (select jsonb_build_object(
      'id', p.id, 'version', p.policy_version, 'policyHash', p.policy_hash,
      'minEvidenceCoveragePercent', p.min_evidence_coverage_percent,
      'minCurriculumCoveragePercent', p.min_curriculum_coverage_percent,
      'minShadowReviewPercent', p.min_shadow_review_percent,
      'minInterventionReviewPercent', p.min_intervention_review_percent,
      'minReproducibleReportSamples', p.min_reproducible_report_samples,
      'retentionMonths', p.retention_months, 'correctionResponseDays', p.correction_response_days,
      'governanceAttestation', p.governance_attestation, 'approvedAt', p.approved_at
    ) from public.academic_intelligence_governance_policies p
      where p.school_id = p_school_id and p.academic_year_id = v_year_id
      order by p.policy_version desc limit 1),
    'readiness', (select jsonb_build_object(
      'id', r.id, 'status', r.readiness_status, 'metrics', r.metrics,
      'blockers', r.blockers, 'warnings', r.warnings,
      'sourceSnapshotHash', r.source_snapshot_hash, 'readinessHash', r.readiness_hash,
      'policyId', r.policy_id, 'evaluatedAt', r.evaluated_at
    ) from public.academic_intelligence_readiness_snapshots r
      where r.school_id = p_school_id and r.academic_year_id = v_year_id
      order by r.evaluated_at desc, r.id desc limit 1),
    'releases', coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.capability) from (
      select distinct on (d.capability) d.capability, d.decision, d.rationale,
        d.readiness_snapshot_id as "readinessSnapshotId", d.decided_at as "decidedAt"
      from public.academic_intelligence_release_decisions d
      where d.school_id = p_school_id and d.academic_year_id = v_year_id
      order by d.capability, d.decided_at desc, d.id desc
    ) x), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x."requestedAt" desc) from (
      select c.id, c.report_id as "reportId", c.reason_code as "reasonCode", c.detail,
        c.requested_at as "requestedAt", latest.event_type as "latestEvent",
        latest.created_at as "latestEventAt"
      from public.academic_report_correction_requests c
      left join lateral (select e.event_type, e.created_at from public.academic_report_correction_events e
        where e.correction_request_id = c.id order by e.created_at desc, e.id desc limit 1) latest on true
      where c.school_id = p_school_id
      order by c.requested_at desc limit 25
    ) x), '[]'::jsonb),
    'retentionRequests', coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x."requestedAt" desc) from (
      select r.id, r.request_type as "requestType", r.scope_type as "scopeType",
        r.reason, r.requested_at as "requestedAt", latest.decision as "latestDecision",
        latest.decided_at as "latestDecisionAt"
      from public.academic_intelligence_retention_requests r
      left join lateral (select d.decision, d.decided_at from public.academic_intelligence_retention_decisions d
        where d.retention_request_id = r.id order by d.decided_at desc, d.id desc limit 1) latest on true
      where r.school_id = p_school_id
      order by r.requested_at desc limit 25
    ) x), '[]'::jsonb),
    'permissions', jsonb_build_object('canEvaluate', true,
      'canApprovePolicy', public.is_school_owner(p_school_id),
      'canDecideRelease', public.is_school_owner(p_school_id),
      'canDecideRetention', public.is_school_owner(p_school_id)),
    'disclosure', jsonb_build_object(
      'externalReleaseFailsClosed', true, 'governanceRecordsAreAppendOnly', true,
      'correctionsCreateSupersedingReports', true, 'retentionRequestsNeverDeleteAutomatically', true,
      'missingEvidenceNeverCountsAsWeakness', true
    )
  );
end;
$$;
revoke all on function public.rpc_academic_intelligence_governance_context(uuid,uuid) from public, anon;
grant execute on function public.rpc_academic_intelligence_governance_context(uuid,uuid)
  to authenticated, service_role;

create or replace function public.rpc_academic_intelligence_audit_manifest(
  p_school_id uuid, p_academic_year_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid := (select auth.uid()); v_manifest jsonb; v_hash text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.is_school_owner(p_school_id) then
    raise exception 'Only the School Head can export the academic-intelligence audit manifest'; end if;
  v_manifest := jsonb_build_object(
    'schemaVersion', 'academic-intelligence-audit-v1', 'schoolId', p_school_id,
    'academicYearId', p_academic_year_id,
    'policyHashes', coalesce((select jsonb_agg(p.policy_hash order by p.policy_version)
      from public.academic_intelligence_governance_policies p
      where p.school_id = p_school_id and p.academic_year_id = p_academic_year_id), '[]'::jsonb),
    'readinessHashes', coalesce((select jsonb_agg(r.readiness_hash order by r.evaluated_at)
      from public.academic_intelligence_readiness_snapshots r
      where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id), '[]'::jsonb),
    'releaseDecisionCount', (select count(*) from public.academic_intelligence_release_decisions d
      where d.school_id = p_school_id and d.academic_year_id = p_academic_year_id),
    'reportCount', (select count(*) from public.academic_report_snapshots r
      where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id),
    'finalReportCount', (select count(*) from public.academic_report_snapshots r
      where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id and r.status = 'final'),
    'sourceReferenceCount', (select count(*) from public.academic_report_source_snapshots s
      join public.academic_report_snapshots r on r.id = s.report_id
      where r.school_id = p_school_id and r.academic_year_id = p_academic_year_id),
    'correctionRequestCount', (select count(*) from public.academic_report_correction_requests c
      join public.academic_report_snapshots r on r.id = c.report_id
      where c.school_id = p_school_id and r.academic_year_id = p_academic_year_id),
    'retentionRequestCount', (select count(*) from public.academic_intelligence_retention_requests r
      where r.school_id = p_school_id and (r.academic_year_id = p_academic_year_id or r.academic_year_id is null))
  );
  v_hash := encode(extensions.digest(pg_catalog.convert_to(v_manifest::text, 'UTF8'), 'sha256'), 'hex');
  return jsonb_build_object('success', true, 'manifest', v_manifest,
    'manifestHash', v_hash, 'generatedAt', transaction_timestamp());
end;
$$;
revoke all on function public.rpc_academic_intelligence_audit_manifest(uuid,uuid) from public, anon;
grant execute on function public.rpc_academic_intelligence_audit_manifest(uuid,uuid)
  to authenticated, service_role;

-- Replace Part 8 finalization with the external-audience release gate. Staff-only
-- report review remains available during shadow and pilot stages.
create or replace function public.rpc_finalize_academic_report_snapshot(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_caller uuid := (select auth.uid()); v_report public.academic_report_snapshots%rowtype; v_capability text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_report from public.academic_report_snapshots r where r.id = p_report_id for update;
  if not found then raise exception 'Academic report not found'; end if;
  if not public.academic_reporting_can_generate(v_report.school_id, v_report.report_type,
      v_report.student_id, v_report.class_id, v_report.academic_subject_id) then
    raise exception 'Not authorised to finalize this academic report'; end if;
  v_capability := case v_report.audience when 'student' then 'student_reports'
    when 'family' then 'family_reports' else null end;
  if v_capability is not null and not public.academic_intelligence_capability_is_enabled(
      v_report.school_id, v_report.academic_year_id, v_capability) then
    raise exception 'Academic-intelligence release is not enabled for this report audience';
  end if;
  if v_report.status = 'final' then return jsonb_build_object('success', true,
    'reportId', v_report.id, 'status', 'final', 'payloadHash', v_report.payload_hash,
    'alreadyFinal', true); end if;
  update public.academic_report_snapshots set status = 'final', finalized_by = v_caller,
    finalized_at = now() where id = v_report.id;
  insert into public.academic_report_events(report_id, actor_user_id, event_type, event_data)
  values (v_report.id, v_caller, 'finalized', jsonb_build_object(
    'payloadHash', v_report.payload_hash, 'sourceSnapshotHash', v_report.source_snapshot_hash,
    'governedReleaseCapability', v_capability));
  return jsonb_build_object('success', true, 'reportId', v_report.id,
    'status', 'final', 'payloadHash', v_report.payload_hash, 'alreadyFinal', false);
end;
$$;
revoke all on function public.rpc_finalize_academic_report_snapshot(uuid) from public, anon;
grant execute on function public.rpc_finalize_academic_report_snapshot(uuid) to authenticated, service_role;

-- Pausing student publication must also stop later reads of an already-final report.
-- Authorised staff retain access so that they can audit, correct, or supersede it.
create or replace function public.rpc_get_academic_report_snapshot(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_report public.academic_report_snapshots%rowtype;
  v_staff boolean := false;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_report from public.academic_report_snapshots r where r.id = p_report_id;
  if not found then raise exception 'Academic report not found'; end if;
  v_staff := public.academic_reporting_can_generate(
    v_report.school_id, v_report.report_type, v_report.student_id,
    v_report.class_id, v_report.academic_subject_id
  );
  if not v_staff and not (
    v_report.status = 'final' and v_report.report_type = 'student'
    and v_report.audience = 'student' and v_report.student_id = v_caller
    and public.academic_intelligence_capability_is_enabled(
      v_report.school_id, v_report.academic_year_id, 'student_reports'
    )
  ) then raise exception 'Not authorised to view this academic report'; end if;
  return jsonb_build_object(
    'success', true,
    'report', jsonb_build_object(
      'id', v_report.id, 'reportType', v_report.report_type,
      'audience', v_report.audience, 'status', v_report.status,
      'version', v_report.report_version, 'supersedesReportId', v_report.supersedes_report_id,
      'academicYearId', v_report.academic_year_id, 'academicTermId', v_report.academic_term_id,
      'periodStart', v_report.period_start, 'periodEnd', v_report.period_end,
      'evidenceCutoffAt', v_report.evidence_cutoff_at,
      'sourceSnapshotHash', v_report.source_snapshot_hash,
      'payloadHash', v_report.payload_hash, 'payload', v_report.report_payload,
      'generatedAt', v_report.generated_at, 'finalizedAt', v_report.finalized_at,
      'sourceReferences', case when v_staff then coalesce((
        select jsonb_agg(jsonb_build_object(
          'sourceType', s.source_type, 'sourceId', s.source_id,
          'snapshotHash', s.source_snapshot_hash
        ) order by s.source_type, s.source_id)
        from public.academic_report_source_snapshots s where s.report_id = v_report.id
      ), '[]'::jsonb) else '[]'::jsonb end
    ),
    'disclosure', jsonb_build_object(
      'privateTeacherNotesExcluded', true,
      'studentAccessRequiresFinalStudentAudience', true,
      'studentAccessRequiresCurrentRelease', true,
      'sourceReferencesVisibleToAuthorisedStaffOnly', true
    )
  );
end;
$$;
revoke all on function public.rpc_get_academic_report_snapshot(uuid) from public, anon;
grant execute on function public.rpc_get_academic_report_snapshot(uuid) to authenticated, service_role;

comment on table public.academic_intelligence_governance_policies is
  'School Head-approved, immutable rollout thresholds, retention terms, and correction SLA by academic year.';
comment on table public.academic_intelligence_readiness_snapshots is
  'Deterministic launch evidence snapshots evaluated against the exact approved governance policy.';
comment on table public.academic_intelligence_release_decisions is
  'Append-only capability enable, pause, and disable decisions; the latest decision is authoritative.';
comment on table public.academic_report_correction_requests is
  'Correction requests that preserve the original report and may link a later final superseding version.';
comment on table public.academic_intelligence_retention_requests is
  'Governed export, restriction, and deletion requests. Request creation never mutates evidence.';
