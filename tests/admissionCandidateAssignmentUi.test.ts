import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const hub = readFileSync('components/AdmissionHub.tsx', 'utf8');
const runner = readFileSync('public/admission-tests/admission-test.html', 'utf8');
const rpcs = readFileSync('ADM_RPCS.sql', 'utf8');

test('Admission Candidates tab filters matching published forms by applied grade before showing other grades', () => {
  assert.match(hub, /matchingForms = publishedForms\.filter\(f => getFormGrade\(f, blueprints\) === c\.applied_grade\)/);
  assert.match(hub, /Show \$\{otherGradeForms\.length\} other-grade form\(s\)/);
  assert.match(hub, /Other grade — send only by exception/);
});

test('Admission form display titles derive from blueprint subject and grade rather than stale wizard state', () => {
  assert.match(hub, /getAdmissionFormTitle/);
  assert.match(hub, /Grade \$\{grade\}.*\$\{subject\} Admission Test/);
  assert.match(runner, /buildAdmissionTestTitle\(STATE\.grade, STATE\.subject\)/);
  assert.match(runner, /\$\('subjectBadge'\)\.textContent = STATE\.formTitle/);
});

test('Admission runner and RPC payload include reading passage linkage with an orphan fallback', () => {
  assert.match(runner, /Reading passage unavailable — please contact admissions\./);
  assert.match(runner, /q\.passage \|\| q\.passage_text/);
  assert.match(rpcs, /'reading_passage_id', q\.reading_passage_id/);
});
