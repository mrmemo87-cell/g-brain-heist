import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260810223000_progress_validation_shadow_comparison.sql',
  'utf8',
);
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');

const validationTables = [
  'academic_progress_golden_journeys',
  'academic_progress_golden_validation_runs',
  'student_learning_shadow_runs',
  'student_learning_shadow_results',
  'student_learning_validation_reviews',
];

test('phase 6 creates fail-closed validation and review records', () => {
  for (const table of validationTables) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}`, 'i'));
  }
  assert.match(migration, /academic_validation_record_is_append_only/i);
  assert.match(migration, /completed_validation_run_is_immutable/i);
});

test('one classifier drives live focus golden cases and shadow candidates', () => {
  assert.match(migration, /student_learning_classify_progress\(p_metrics jsonb\)/i);
  const calls = migration.match(/student_learning_classify_progress\(/gi) ?? [];
  assert.ok(calls.length >= 4);
  assert.match(migration, /student_learning_refresh_focus_state[\s\S]+student_learning_classify_progress/i);
  assert.match(roadmap, /single deterministic classifier used by the[\s\S]+live focus refresh, golden validation, and shadow comparison/i);
});

test('golden journeys cover every required progress and data-quality path', () => {
  for (const journey of [
    'missing-evidence', 'low-data-focus', 'new-focus-qualified', 'recurring-focus',
    'persistent-focus', 'improving-after-focus', 'resolved-after-focus',
    'emerging-strength', 'consistent-strength', 'declining-recurring-focus',
    'recent-contradiction', 'stale-prior-persistence',
    'new-year-does-not-inherit-persistence',
  ]) assert.match(migration, new RegExp(`'${journey}'`, 'i'));
  assert.match(migration, /approved_or_retired_golden_journey_is_immutable/i);
});

test('golden validation compares all four decision outputs', () => {
  assert.match(migration, /v_actual->>'status' = v_case\.expected_status/i);
  assert.match(migration, /v_actual->>'trend' = v_case\.expected_trend/i);
  assert.match(migration, /v_actual->>'priority' = v_case\.expected_priority/i);
  assert.match(migration, /teacherReviewRequired'[\s\S]+expected_teacher_review/i);
  assert.match(migration, /'allGoldenJourneysPassed', v_failed = 0/i);
});

test('shadow comparison is gated by a passing golden run', () => {
  assert.match(migration, /r\.status = 'completed' and r\.failed_count = 0/i);
  assert.match(migration, /passing_golden_validation_required/i);
  assert.match(migration, /golden_validation_run_id uuid not null/i);
  assert.match(roadmap, /blocked unless the latest policy has a completed golden run with zero failures/i);
});

test('shadow scope is bounded isolated and concurrency safe', () => {
  assert.match(migration, /comparison_limit between 1 and 1000/i);
  assert.match(migration, /p_limit < 1 or p_limit > 1000/i);
  assert.match(migration, /o\.academic_year_id = p_academic_year_id/i);
  assert.match(migration, /o\.observed_at <= p_as_of/i);
  assert.match(migration, /p_student_ids is null or o\.student_id = any\(p_student_ids\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
});

test('every comparison freezes traceable evidence and both decisions', () => {
  for (const field of [
    'current_snapshot', 'candidate_snapshot', 'evidence_observation_count',
    'evidence_latest_at', 'evidence_snapshot_hash', 'comparison_outcome',
    'risk_level', 'teacher_review_required',
  ]) assert.match(migration, new RegExp(field, 'i'));
  assert.match(migration, /extensions\.digest[\s\S]+sha256/i);
  assert.match(migration, /evidence_snapshot_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
});

test('comparison categories and high-risk states remain explicit', () => {
  for (const outcome of [
    'same', 'missing_current_state', 'confidence_withheld',
    'contradiction_detected', 'status_changed',
  ]) assert.match(migration, new RegExp(`'${outcome}'`, 'i'));
  assert.match(migration, /persistent','resolved','consistent_strength/i);
  assert.match(migration, /candidate->>'status' in \('persistent','resolved','consistent_strength','contradictory'\)/i);
});

test('shadow disclosure forbids automatic record mutation', () => {
  assert.match(migration, /'sourceObservationsMutated', false/i);
  assert.match(migration, /'focusStatesMutated', false/i);
  assert.match(migration, /'candidateConclusionsApplied', false/i);
  assert.match(migration, /'teacherValidationChangesLearnerRecord', false/i);
  assert.match(roadmap, /does[\s\S]*not mutate observations, focus states, or source results/i);
});

test('teacher review is scoped versioned and professionally reasoned', () => {
  assert.match(migration, /rpc_submit_student_learning_validation_review/i);
  assert.match(migration, /class_teacher_assignments[\s\S]+cs\.student_id = v_result\.student_id/i);
  assert.match(migration, /not authorized for validation review/i);
  assert.match(migration, /review_version integer not null/i);
  assert.match(migration, /supersedes_review_id/i);
  assert.match(migration, /length\(trim\(rationale\)\) >= 10/i);
});

test('disagreement and missing-evidence verdicts require actionable detail', () => {
  assert.match(migration, /expected_status_required_for_disagreement/i);
  assert.match(migration, /evidence_gap_required/i);
  for (const code of [
    'mapping_quality', 'recency', 'evidence_volume', 'source_diversity',
    'contradiction', 'year_context', 'subject_context', 'source_coverage',
  ]) assert.match(migration, new RegExp(`'${code}'`, 'i'));
});

test('validation reading preserves school class and subject boundaries', () => {
  assert.match(migration, /rpc_school_student_progress_validation/i);
  assert.match(migration, /not authorized for school progress validation/i);
  assert.match(migration, /class_students[\s\S]+class_teacher_assignments/i);
  assert.match(migration, /public\.academic_normalize_subject_key\(cta\.subject\)/i);
  assert.match(migration, /latestReviewVersionOnlyInSummary/i);
});

test('service execution boundaries do not expose shadow writes to browsers', () => {
  for (const fn of [
    'rpc_run_academic_progress_golden_validation',
    'rpc_run_student_learning_shadow_validation',
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`, 'is'));
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${fn}[^;]+to authenticated`, 'is'));
  }
  assert.doesNotMatch(migration, /auth\.role\(\)/i);
});

test('phase 6 rollout requires reproducibility and teacher acceptance', () => {
  assert.match(roadmap, /## Phase 6 contract/i);
  assert.match(roadmap, /### Phase 6 rollout gate/i);
  assert.match(roadmap, /totals, candidate decisions, and evidence hashes must be identical/i);
  assert.match(roadmap, /Never treat a mismatch count alone as model accuracy/i);
  assert.match(roadmap, /Do not[\s\S]*auto-apply\s+candidate conclusions/i);
  assert.match(roadmap, /Phase 7 remains a[\s\S]+teacher-approved intervention pilot/i);
});
