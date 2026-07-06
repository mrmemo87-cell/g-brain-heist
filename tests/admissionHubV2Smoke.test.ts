import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const hub = readFileSync('components/AdmissionHub.tsx', 'utf8');
const candidateTest = readFileSync('public/admission-tests/admission-test.html', 'utf8');

test('Admission Hub V2 exposes activity notes from candidate details without token fragments', () => {
  assert.match(hub, /View candidate/);
  assert.match(hub, /Candidate profile/);
  assert.match(hub, /Admission package \/ matching tests/);
  assert.match(hub, /Sent links/);
  assert.match(hub, /Attempts, Results, Activity notes, and Retake/);
  assert.match(hub, /No activity notes recorded for this attempt\./);
  assert.match(hub, /Activity notes help the school review unusual test behaviour/);
  assert.doesNotMatch(hub, /c\.token\.slice/);
  assert.doesNotMatch(hub, /<span className="text-gray-500 text-xs">Token<\/span>/);
});

test('submitted and scored attempts expose result, activity notes, and retake actions', () => {
  assert.match(hub, /View result/);
  assert.match(hub, /Activity notes/);
  assert.match(hub, /Allow retake/);
  assert.match(hub, /This keeps the old attempt history and creates an audit log/);
});

test('advanced support tabs are hidden behind support tools by default', () => {
  assert.match(hub, /Advanced \/ Support Tools/);
  assert.match(hub, /showAdvancedTools \|\| MAIN_TABS\.includes/);
  assert.match(hub, /Advanced: Blueprints/);
  assert.match(hub, /Advanced: Test Forms/);
});

test('light school-friendly UI wording avoids technical terms in normal flow', () => {
  assert.match(hub, /Admission overview/);
  assert.match(hub, /Candidates waiting/);
  assert.match(hub, /Tests in progress/);
  assert.match(hub, /Results ready/);
  assert.match(hub, /Needs attention/);
  assert.match(hub, /Grade 6 Admission Package/);
  assert.match(hub, /English required/);
  assert.match(hub, /Maths required/);
  assert.match(hub, /Science optional/);
});

test('GSAP overview animation respects reduced motion', () => {
  assert.match(hub, /import \{ gsap \} from 'gsap'/);
  assert.match(hub, /prefers-reduced-motion: reduce/);
  assert.match(hub, /data-admission-card/);
});

test('candidate page has fair page-leave warnings and strict auto-submit threshold', () => {
  assert.match(candidateTest, /Leaving the test page repeatedly may cause your test to be submitted automatically/);
  assert.match(candidateTest, /Important: if you leave the test page again/);
  assert.match(candidateTest, /hiddenForMs >= 2000/);
  assert.match(candidateTest, /STATE\.countedPageLeaves > 5/);
  assert.match(candidateTest, /Auto-submitted after repeated page exits\./);
  assert.match(candidateTest, /Your test was submitted because the test page was left several times/);
  assert.doesNotMatch(candidateTest, /5 times/);
});

test('candidate page preserves refresh/reopen and submitted-lock copy', () => {
  assert.match(candidateTest, /page_reopened/);
  assert.match(candidateTest, /page_reload/);
  assert.match(candidateTest, /secondsRemaining\(data\.expires_at/);
  assert.match(candidateTest, /Submitted attempt cannot be edited after reopen/);
});

test('admin report uses friendly activity labels and auto-submit summary copy', () => {
  const service = readFileSync('services/admissionService.ts', 'utf8');
  assert.match(service, /buildAdmissionActivityNotes/);
  assert.match(service, /Page reopened/);
  assert.match(service, /Page refreshed\/reloaded/);
  assert.match(service, /Candidate left the test page/);
  assert.match(service, /Test auto-submitted after repeated page exits/);
  assert.doesNotMatch(hub, /submitted normally/);
  assert.doesNotMatch(hub, /Auto Submit Repeated Page Exits/);
});

test('report polish covers subject labels partial attempts objective grading and form labels', () => {
  assert.match(hub, /admissionSubjectLabel\(t\.subject\)/);
  assert.match(hub, /Answered \{reportData\.answered_count\} of \{reportData\.total_questions\} questions/);
  assert.match(hub, /This result is based on a partial attempt\./);
  assert.match(hub, /isObjectiveAutoScoredAdmissionReport\(reportData\)/);
  assert.match(hub, /buildAdmissionReportFormLabel/);
  assert.match(hub, /Code \{reportData\.form_code/);
  assert.match(hub, /No clear strengths yet — more completed answers are needed\./);
});

test('activity and submit SQL keep school isolation and dedupe repeated auto-submit event', () => {
  const migration = readFileSync('supabase/migrations/20260706124500_admission_report_activity_polish.sql', 'utf8');
  assert.match(migration, /one_repeated_exit_auto_submit_per_attempt/);
  assert.match(migration, /WHERE event_type = 'auto_submit_repeated_page_exits'/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /sm\.school_id = v_attempt\.school_id/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /Test auto-submitted after repeated page exits\./);
  assert.doesNotMatch(migration, /submitted normally/i);
});
