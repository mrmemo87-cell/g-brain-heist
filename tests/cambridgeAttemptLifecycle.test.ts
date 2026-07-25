import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260722142215_harden_cambridge_attempt_lifecycle.sql',
  'utf8',
);
const studentHub = readFileSync('components/CambridgeTestsHub.tsx', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const listeningPaper = readFileSync(
  'public/cambridge-tests/English stage 9/cambridge_listening_test_1.html',
  'utf8',
);

test('database permits only one active attempt per student, test, and version', () => {
  assert.match(migration, /create unique index if not exists quiz_scores_one_active_attempt/);
  assert.match(migration, /school_id, student_id, test_id, quiz_version/);
  assert.match(migration, /archived_action.*'duplicate_voided'/s);
  assert.match(migration, /order by answered_count desc, score desc, submitted_at asc/);
});

test('submission RPC is authenticated, atomic, and idempotent', () => {
  assert.match(migration, /create or replace function public\.submit_cambridge_attempt/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /'idempotent', true/);
  assert.match(migration, /when unique_violation/);
  assert.match(migration, /full_name_status <> 'verified'/);
});

test('students resolve completion by authenticated student id rather than display name', () => {
  assert.match(migration, /create or replace function public\.get_my_cambridge_attempt_state/);
  assert.match(migration, /where qs\.student_id = v_actor/);
  assert.match(studentHub, /\.eq\('student_id', profile\.id\)/);
  assert.doesNotMatch(studentHub, /\.in\('student_name'/);
});

test('teacher score access and actions require matching class and subject', () => {
  assert.match(migration, /public\.class_students cs/);
  assert.match(migration, /cs\.student_id = s\.student_id/);
  assert.match(migration, /public\.cambridge_assignment_matches_test/);
  assert.match(migration, /cta\.can_grade = true/);
  assert.match(migration, /Only the assigned class and subject teacher can allow this retake/);
  assert.match(teacherPortal, /results are limited to your assigned classes and subjects/);
});

test('test submission stops exam activity and closes only after acknowledgement', () => {
  assert.match(listeningPaper, /submit_cambridge_attempt/);
  assert.match(listeningPaper, /stopAudioPlayback\(\)/);
  assert.match(listeningPaper, /window\.ExamGuard\?\.stop/);
  assert.match(listeningPaper, /idempotent: data\.idempotent === true/);
  assert.match(studentHub, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(studentHub, /setExitSubmissionPending\(true\)/);
  assert.match(studentHub, /Submission is taking longer than expected\. Your test is still open/);
  assert.doesNotMatch(studentHub, /Give the iframe a moment to process the auto-submit/);
});
