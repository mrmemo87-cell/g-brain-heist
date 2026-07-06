import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const hub = readFileSync('components/AdmissionHub.tsx', 'utf8');
const runner = readFileSync('public/admission-tests/admission-test.html', 'utf8');
const rpcs = readFileSync('ADM_RPCS.sql', 'utf8');
const passageMigration = readFileSync('supabase/migrations/20260630113000_admission_start_attempt_passages.sql', 'utf8');

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

test('Admission start-attempt RPC SQL returns passage metadata for every question', () => {
  for (const sql of [rpcs, passageMigration]) {
    assert.match(sql, /CREATE OR REPLACE FUNCTION (public\.)?rpc_adm_start_attempt\(\s*p_token TEXT,\s*p_form_code TEXT\s*\)/i);
    assert.match(sql, /'passage', q\.passage/);
    assert.match(sql, /'reading_passage_id', q\.reading_passage_id/);
    assert.match(sql, /'question_type', q\.question_type/);
    assert.match(sql, /'diagnostic_skill', q\.diagnostic_skill/);
    assert.match(sql, /'grade', COALESCE\(v_blueprint\.target_grade, v_blueprint\.target_stage\)/);
    assert.match(sql, /'form_title', CONCAT\('Grade '/);
  }
});

test('Admission runner renders q.passage and does not silently omit reading context', () => {
  assert.match(runner, /q\.passage \|\| q\.passage_text/);
  assert.match(runner, /<div class="passage-box">/);
  assert.match(runner, /q\.question_type === 'reading_comprehension' \|\| q\.reading_passage_id/);
  assert.match(runner, /Reading passage unavailable — please contact admissions\./);
});

test('Admission Candidates tab hides closed forms from send-test options', () => {
  assert.match(hub, /const publishedForms = forms\.filter\(f => f\.status === 'published' && !isFormCodeSubjectConflict\(f, blueprints\)\)/);
  assert.doesNotMatch(hub, /const publishedForms = forms\.filter\(f => f\.status !== 'archived'\)/);
  assert.match(hub, /assignableForms\.length > 0 \? assignableForms\.map/);
});


test('closed SCI5 forms cannot render as not-sent sendable candidate cards', () => {
  assert.match(hub, /const publishedForms = forms\.filter\(f => f\.status === 'published' && !isFormCodeSubjectConflict\(f, blueprints\)\)/);
  assert.match(hub, /const assignableForms = showOtherGrades \? \[\.\.\.matchingForms, \.\.\.otherGradeForms\] : matchingForms/);
  assert.match(hub, /\{getAttemptLabel\(attempt, true\)\}/);
  assert.doesNotMatch(hub, /forms\.filter\(f => f\.status !== 'closed'\)/);
});

test('closed form attempts are rendered as history, not sendable cards', () => {
  assert.match(hub, /const attemptedFormIds = new Set\(attempts\.filter\(a => a\.candidate_id === c\.id\)\.map\(a => a\.form_id\)\)/);
  assert.match(hub, /const historyForms = forms\.filter\(f => attemptedFormIds\.has\(f\.id\) && !publishedForms\.some\(pf => pf\.id === f\.id\)\)/);
  assert.match(hub, /assignableForms\.length > 0 \? assignableForms\.map/);
});

test('stale SCI or MAT form codes cannot be displayed as English sendables', () => {
  assert.match(hub, /const getFormSubjectFromCode/);
  assert.match(hub, /code\.startsWith\('sci'\)\) return 'science'/);
  assert.match(hub, /code\.startsWith\('mat'\) \|\| code\.startsWith\('math'\)\) return 'maths'/);
  assert.match(hub, /const publishedForms = forms\.filter\(f => f\.status === 'published' && !isFormCodeSubjectConflict\(f, blueprints\)\)/);
  assert.match(hub, /legacy\/stale/);
});


test('Admission Candidates tab send cards use in-scope matching form data and keep completed/incomplete actions distinct', () => {
  const candidatesSection = hub.slice(hub.indexOf("{filteredCandidates.map((c) =>"), hub.indexOf("{activeTab === 'results'"));

  assert.match(candidatesSection, /const matchingForms = publishedForms\.filter/);
  assert.match(candidatesSection, /const assignableForms = showOtherGrades \? \[\.\.\.matchingForms, \.\.\.otherGradeForms\] : matchingForms/);
  assert.match(candidatesSection, /assignableForms\.length > 0 \? assignableForms\.map\(f => \{/);
  assert.match(candidatesSection, /getAttemptLabel\(attempt, true\)/);
  assert.doesNotMatch(candidatesSection, /!!matching\b/, 'send cards must not reference the out-of-scope matching variable');
  assert.doesNotMatch(candidatesSection, /\bmatching\./, 'send cards must not reference an out-of-scope matching object');

  assert.match(candidatesSection, /isFinalAdmissionAttempt\(attempt\) \? \([\s\S]*View result[\s\S]*Activity notes[\s\S]*Allow retake/);
  assert.match(candidatesSection, /\) : \([\s\S]*>Copy<\/button>[\s\S]*>WhatsApp<\/button>[\s\S]*>Email<\/button>/);
});
