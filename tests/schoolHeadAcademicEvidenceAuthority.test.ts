import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath =
  'supabase/migrations/20260824182530_lock_school_head_academic_evidence_authority.sql';
const migration = fs.readFileSync(
  path.resolve(process.cwd(), migrationPath),
  'utf8',
);

const functionBody = (name: string, nextName?: string) => {
  const start = migration.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `${name} must be defined`);
  const end = nextName
    ? migration.indexOf(`create or replace function ${nextName}`, start + 1)
    : migration.length;
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return migration.slice(start, end);
};

test('School Head scored work uses only verified assignment summaries', () => {
  const body = functionBody(
    'private.school_head_authoritative_scored_work',
    'private.school_head_authoritative_grade_performance',
  );

  assert.match(body, /from private\.student_verified_assignment_summaries r/i);
  assert.match(body, /a\.school_id = p_school_id/i);
  assert.match(body, /sm\.status = 'active'/i);
  assert.match(body, /sm\.role_in_school = 'student'/i);
  assert.doesNotMatch(body, /student_assignment_results/i);
});

test('Cambridge score rows fail closed without an authority-qualified observation', () => {
  const body = functionBody(
    'private.school_head_authoritative_scored_work',
    'private.school_head_authoritative_grade_performance',
  );

  assert.match(body, /from public\.quiz_scores qs/i);
  assert.match(body, /and exists \([\s\S]*from public\.student_learning_observations o/i);
  assert.match(body, /o\.source_type = 'cambridge_attempt'/i);
  assert.match(body, /o\.source_id = qs\.id/i);
  assert.match(
    body,
    /public\.student_learning_observation_is_qualified\([\s\S]*o\.contributes_to_focus_state[\s\S]*o\.evidence/i,
  );
});

test('grade performance preserves its public contract and delegates to governed evidence', () => {
  const body = functionBody(
    'public.school_head_get_grade_performance',
    'private.school_head_authority_qualified_academic_decline',
  );

  assert.match(body, /returns jsonb/i);
  assert.match(body, /security definer[\s\S]*set search_path = ''/i);
  assert.match(body, /not public\.is_school_owner\(p_school_id\)/i);
  assert.match(body, /school_head_authoritative_grade_performance/i);
  assert.doesNotMatch(body, /student_assignment_results|from public\.quiz_scores/i);
  assert.match(
    migration,
    /revoke all on function public\.school_head_get_grade_performance\(uuid, integer\)[\s\S]*grant execute[\s\S]*to authenticated/i,
  );
});

test('academic decline uses governed scored work and replaces the legacy signal', () => {
  const decline = functionBody(
    'private.school_head_authority_qualified_academic_decline',
    'private.school_head_authoritative_operational_decisions',
  );
  const decisions = functionBody(
    'private.school_head_authoritative_operational_decisions',
  );

  assert.match(decline, /school_head_authoritative_scored_work/i);
  assert.match(decline, /current_count >= 5/i);
  assert.match(decline, /previous_count >= 5/i);
  assert.match(decline, /previous_average - current_average >= 10/i);
  assert.doesNotMatch(decline, /from public\.quiz_scores|student_assignment_results/i);
  assert.match(decisions, /item->>'id' <> 'academic_decline'/i);
  assert.match(decisions, /school_head_authority_qualified_academic_decline/i);
});

test('executive snapshot replaces every official academic aggregate before return', () => {
  const body = functionBody(
    'public.school_head_get_executive_snapshot',
  );

  assert.match(body, /school_head_authoritative_academic_summary/i);
  assert.match(body, /school_head_authoritative_operational_decisions/i);
  for (const jsonPath of [
    "'{academics,average}'",
    "'{academics,previous_average}'",
    "'{academics,grade_performance}'",
    "'{programs,cambridge_attempts}'",
    "'{decisions}'",
  ]) {
    assert.ok(body.includes(jsonPath), `${jsonPath} must be replaced`);
  }
  assert.doesNotMatch(body, /from public\.quiz_scores|student_assignment_results/i);
  assert.match(
    migration,
    /revoke all on function public\.school_head_get_executive_snapshot_unqualified_legacy_20260824\([\s\S]*from public, anon, authenticated, service_role/i,
  );
});

test('v2 is defined independently of the earlier compatibility rollout', () => {
  const body = functionBody(
    'public.school_head_get_executive_snapshot_v2',
    'private.refresh_school_head_decision_alerts',
  );

  assert.match(body, /v_snapshot := public\.school_head_get_executive_snapshot\(/i);
  assert.match(body, /v_grade_performance := public\.school_head_get_grade_performance\(/i);
  assert.match(body, /'\{academics,grade_performance\}'/i);
  assert.match(body, /not public\.is_school_owner\(p_school_id\)/i);
  assert.match(
    body,
    /revoke all[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
  );
});

test('persisted executive averages and alerts use the authoritative helpers', () => {
  const body = functionBody('private.refresh_school_head_decision_alerts');

  assert.match(body, /school_head_authoritative_operational_decisions/i);
  assert.match(body, /school_head_authoritative_academic_summary/i);
  assert.match(body, /v_average := \(v_academic->>'average'\)::numeric/i);
  assert.doesNotMatch(body, /avg\(qs\.percentage\)|from public\.quiz_scores/i);
  assert.match(
    migration,
    /revoke all on function private\.refresh_school_head_decision_alerts\(uuid, integer\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
});
