import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const candidateHtml = fs.readFileSync('public/admission-tests/admission-test.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260705120000_admission_attempt_lifecycle_sondos_fix.sql', 'utf8');
const hub = fs.readFileSync('components/AdmissionHub.tsx', 'utf8');

test('candidate submit is backend-confirmed and failures keep the test open', () => {
  assert.match(candidateHtml, /STATE\.submitInProgress = true/, 'submit clicks should be locked while RPC is pending');
  assert.match(candidateHtml, /if \(!res\.ok \|\| !results\?\.success\) throw new Error/, 'UI must reject failed submit RPCs');
  assert.match(candidateHtml, /STATE\.submitted = true;\s*clearInterval\(STATE\.timerInterval\);\s*await logAttemptEvent\('submitted'/s, 'submitted state is only set after backend success');
  assert.match(candidateHtml, /Your answers are still on this page/, 'backend submit failure must show friendly retry copy');
});

test('timeout and repeated page exits use the same finalization RPC', () => {
  assert.match(candidateHtml, /handleSubmit\(true\)/, 'timer expiry calls submit handler');
  assert.match(candidateHtml, /p_auto_submit_reason: autoReason/, 'manual, timeout, and auto submit use one RPC');
  assert.match(migration, /p_auto_submit_reason TEXT DEFAULT NULL/, 'backend submit accepts auto-submit reason idempotently');
  assert.match(migration, /IF v_attempt\.status IN \('submitted', 'scored', 'expired'\)/, 'backend submit is idempotent for final attempts');
});

test('tab leave logging uses tab_hidden/tab_visible, survives reopen, and auto-finalizes over threshold', () => {
  assert.match(candidateHtml, /logAttemptEvent\('tab_hidden'/, 'hidden event uses supported backend event type');
  assert.match(candidateHtml, /logAttemptEvent\('tab_visible', \{ hidden_for_ms: hiddenForMs/, 'visible event records hidden duration');
  assert.match(candidateHtml, /if \(hiddenForMs >= 2000/, 'only two-second page leaves are counted');
  assert.match(candidateHtml, /STATE\.countedPageLeaves = Number\(data\.counted_page_leaves \|\| 0\)/, 'threshold count is restored from backend');
  assert.match(candidateHtml, /STATE\.countedPageLeaves > 5[\s\S]*autoSubmitForRepeatedPageExits/, 'more than five counted leaves auto-submit');
  assert.match(migration, /'auto_submit_repeated_page_exits'/, 'backend stores auto-submit event');
});

test('final attempts reopen as completed/read-only from backend source of truth', () => {
  assert.match(migration, /v_final_attempt[\s\S]*status IN \('submitted','scored','expired'\)/, 'start RPC selects latest final attempt');
  assert.match(migration, /'completed', true[\s\S]*'attempt_status', v_final_attempt\.status/, 'start RPC returns completed state');
  assert.match(candidateHtml, /data\.completed \|\| \['submitted', 'scored', 'expired'\]\.includes\(data\.attempt_status\)/, 'candidate UI renders completion instead of editable test');
});

test('activity notes and admin status/actions are attempt-scoped and consistent', () => {
  assert.match(hub, /AdmService\.getAttemptActivity\(attemptId\)/, 'per-attempt activity loads by exact attempt id');
  assert.match(hub, /getAdmissionLifecycleStatus/, 'shared lifecycle status helper is present');
  assert.match(hub, /isFinalAdmissionAttempt/, 'shared final-attempt helper controls completed actions');
  assert.match(hub, /View result[\s\S]*Activity notes[\s\S]*Allow retake/, 'completed cards render result/activity/retake actions');
  assert.doesNotMatch(hub, /\.token\}\s*<\//, 'candidate tokens must not be rendered directly');
  assert.match(fs.readFileSync('supabase/migrations/20260701090000_admission_candidate_attempt_events.sql', 'utf8'), /role_in_school = 'school_admin'/, 'retake remains school-admin isolated');
  assert.match(fs.readFileSync('supabase/migrations/20260701090000_admission_candidate_attempt_events.sql', 'utf8'), /role_in_school IN \('school_admin','teacher'\)/, 'notes remain school-member isolated');
});
