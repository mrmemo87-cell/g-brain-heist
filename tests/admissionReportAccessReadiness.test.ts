import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260706170000_admission_report_access_readiness_fix.sql', 'utf8');
const service = fs.readFileSync('services/admissionService.ts', 'utf8');
const hub = fs.readFileSync('components/AdmissionHub.tsx', 'utf8');

test('report RPC allows same-school admins and teachers while preserving school isolation', () => {
  assert.match(migration, /sm\.school_id = v_attempt\.school_id[\s\S]*sm\.user_id = auth\.uid\(\)[\s\S]*sm\.role_in_school IN \('school_admin', 'teacher'\)[\s\S]*sm\.status = 'active'/);
  assert.match(migration, /users u[\s\S]*u\.id = auth\.uid\(\)[\s\S]*u\.school_id = v_attempt\.school_id[\s\S]*coalesce\(u\.role, ''\) IN \('school_admin', 'teacher'\)/);
  assert.match(migration, /RETURN jsonb_build_object\('success', false, 'error', 'Access denied'\)/);
});

test('report readiness uses scored submitted attempts and real adm_attempts score columns', () => {
  assert.match(migration, /v_attempt\.status <> 'scored' OR v_attempt\.submitted_at IS NULL/);
  assert.match(migration, /v_attempt\.total_score IS NULL OR v_attempt\.max_score IS NULL OR v_attempt\.percentage IS NULL/);
  assert.match(migration, /'total_score', v_attempt\.total_score/);
  assert.match(migration, /'max_score', v_attempt\.max_score/);
  assert.match(migration, /'percentage', v_attempt\.percentage/);
  assert.doesNotMatch(migration, /v_attempt\.score\b|\.score\b|scored_at/);
});

test('report RPC distinguishes access, readiness, not found, and unavailable errors', () => {
  for (const expected of ['Attempt not found', 'Access denied', 'Result not ready', 'Report data unavailable']) {
    assert.match(migration, new RegExp(expected));
  }
});

test('frontend maps report errors to safe friendly messages', () => {
  assert.match(hub, /Access denied[\s\S]*You do not have permission to view this candidate report\./i);
  assert.match(hub, /Result not ready[\s\S]*Result not ready yet\. Please wait until the candidate submits and scoring is complete\./i);
  assert.match(hub, /attempt not found[\s\S]*We could not find this attempt\./i);
  assert.match(hub, /Report data unavailable[\s\S]*Report is unavailable right now\. Please try again\./i);
  assert.doesNotMatch(hub, /friendlyAdmissionError\('report not ready'/);
});

test('service propagates RPC report errors and maps report scores from total_score/max_score/percentage', () => {
  assert.match(service, /if \(!data\.success\) throw new Error\(data\.error \|\| 'Report data unavailable'\)/);
  assert.match(service, /total_score: raw\.attempt\?\.total_score \?\? 0/);
  assert.match(service, /max_score: raw\.attempt\?\.max_score \?\? 0/);
  assert.match(service, /percentage: raw\.attempt\?\.percentage \?\? 0/);
  assert.doesNotMatch(service, /raw\.attempt\?\.score\b|scored_at/);
});

test('candidate tokens remain hidden in normal Admission Hub rows', () => {
  assert.doesNotMatch(hub, /c\.token\.slice/);
  assert.match(hub, /Candidate-specific links are private/);
});
