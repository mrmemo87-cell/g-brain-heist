import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evidenceConfirmationLabel,
  isActiveSupportStatus,
  summarizeComparableTrend,
} from '../components/student-progress/academicReportingSemantics';

const read = (path: string) => readFileSync(path, 'utf8');

const migrationPath = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_fix_academic_profile_reporting_integrity.sql'))
  .sort()
  .at(-1);

test('low-data positive evidence is never presented as a support state', () => {
  assert.equal(isActiveSupportStatus('insufficient_evidence'), false);
  assert.match(evidenceConfirmationLabel('strength'), /Positive evidence/);
  assert.match(evidenceConfirmationLabel('strength'), /more evidence needed/);
});

test('subject trend only compares the same skill across separate dates', () => {
  assert.equal(summarizeComparableTrend([
    { observedAt: '2026-08-20T09:00:00Z', score: 0, comparableKey: 'future-tense' },
    { observedAt: '2026-08-21T09:00:00Z', score: 100, comparableKey: 'vocabulary' },
  ]), 'Not enough comparable evidence yet');

  assert.equal(summarizeComparableTrend([
    { observedAt: '2026-08-20T09:00:00Z', score: 0, comparableKey: 'future-tense' },
    { observedAt: '2026-08-20T14:00:00Z', score: 20, comparableKey: 'future-tense' },
  ]), 'Not enough comparable evidence yet');

  assert.equal(summarizeComparableTrend([
    { observedAt: '2026-08-20T09:00:00Z', score: 20, comparableKey: 'future-tense' },
    { observedAt: '2026-08-28T09:00:00Z', score: 80, comparableKey: 'future-tense' },
  ]), 'Comparable evidence shows positive movement');
});

test('academic profile and report share the trustworthy reporting vocabulary', () => {
  const service = read('services/studentAcademicProfileService.ts');
  const profile = read('components/student-progress/StudentAcademicProfileV2.tsx');
  const report = read('components/student-progress/IndividualStudentAcademicReportV2.tsx');
  assert.match(service, /'insufficient_evidence'/);
  assert.match(service, /'contradictory'/);
  assert.match(service, /writing_assessment_review/);
  assert.match(profile, /Evidence to confirm/);
  assert.match(profile, /Teacher snapshot/);
  assert.match(profile, /Established strengths/);
  assert.match(report, /Evidence to confirm/);
  assert.match(report, /Established strengths/);
  assert.doesNotMatch(profile, /\['insufficient_evidence', 'new_focus', 'recurring', 'persistent'\]/);
  assert.doesNotMatch(report, /\['new_focus', 'recurring', 'persistent', 'insufficient_evidence'\]/);
});

test('classifier fallback never turns recovery evidence into a fresh support label', () => {
  assert.ok(migrationPath, 'reporting-integrity migration must exist');
  const migration = read(`supabase/migrations/${migrationPath}`);
  assert.ok(migration.includes("if v_latest = ''focus'' then"));
  assert.ok(migration.includes("v_status := ''insufficient_evidence''"));
  assert.match(migration, /student_learning_refresh_focus_state/);
});
