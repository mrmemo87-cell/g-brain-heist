import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260825000141_academic_year_fresh_start_continuity.sql',
  'utf8',
);
const service = readFileSync('services/academicYearContinuityService.ts', 'utf8');
const card = readFileSync('components/school-admin/AcademicYearContinuityCard.tsx', 'utf8');
const subjectsTab = readFileSync('components/school-admin/tabs/SubjectsTab.tsx', 'utf8');

test('raw automated writing is retained as history but cannot become authoritative evidence', () => {
  assert.match(migration, /student_learning_enforce_writing_attempt_history/i);
  assert.match(migration, /new\.source_type = 'writing_attempt'[\s\S]*new\.contributes_to_focus_state := false/i);
  assert.match(migration, /'evidence_authority', 'automated_history'/i);
  assert.match(migration, /validate constraint student_learning_writing_attempt_non_authoritative_chk/i);
});

test('academic setup refreshes only the affected calendar period', () => {
  assert.match(migration, /academic_refresh_school_context_for_period/i);
  assert.match(migration, /between p_starts_on and p_ends_on/i);
  assert.match(migration, /coalesce\(a\.publish_status, 'published'\) = 'draft'/i);
  assert.doesNotMatch(migration, /update public\.assignments a[\s\S]*where a\.school_id = p_school_id;\s*update public\.student_learning_observations/i);
  assert.match(migration, /'refreshScope', 'affected_period_only'/i);
  assert.match(migration, /'historicalRecordsRewritten', false/i);
});

test('school admins receive isolated current-year metrics and protected history', () => {
  assert.match(migration, /rpc_school_admin_academic_year_continuity/i);
  assert.match(migration, /coalesce\([\s\S]*a\.academic_year_id[\s\S]*academic_resolve_year_id\(a\.school_id, a\.assigned_at\)/i);
  assert.match(migration, /'historicalYearsReadOnly', true/i);
  assert.match(migration, /'currentYearResultsIsolated', true/i);
  assert.match(migration, /'previousEvidenceAffectsCurrentAttainment', false/i);
  assert.match(migration, /'teacherCanUseHistoryAsContext', true/i);
});

test('the school admin UI presents Fresh Start Smart Memory without blocking setup', () => {
  assert.match(service, /rpc_school_admin_academic_year_continuity/i);
  assert.match(card, /Fresh Start · Smart Memory/i);
  assert.match(card, /Start clean\. Keep the story\./i);
  assert.match(card, /Current-year results only/i);
  assert.match(card, /Past evidence is context, not current attainment/i);
  assert.match(card, /Read-only history/i);
  assert.match(subjectsTab, /AcademicYearContinuityCard/i);
  assert.match(subjectsTab, /<AcademicYearContinuityCard\s*\/>/i);
});
