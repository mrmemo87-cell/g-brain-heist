import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../supabase/migrations/20261015221500_classroom_preventive_load_hardening.sql', import.meta.url), 'utf8');
const load = readFileSync(new URL('../load-tests/classroom.js', import.meta.url), 'utf8');

test('queue improves cadence without adding parallel workers', () => {
  assert.match(sql, /cron\.schedule\(\s*'brains-heist-assignment-evidence-worker','10 seconds'/);
  assert.match(sql, /private\.process_one_verified_assignment_evidence\(\)/);
  assert.doesNotMatch(sql, /create or replace function private\.process_one_verified_assignment_evidence/i);
});

test('teacher answer/result RLS uses scoped helper, not private table grants', () => {
  assert.match(sql, /alter policy saa_teacher_group_select on public\.student_assignment_answers/);
  assert.match(sql, /alter policy sar_teacher_group_select on public\.student_assignment_results/);
  assert.match(sql, /public\.can_access_assigned_school_subject_group\(/);
  assert.doesNotMatch(sql, /grant select on public\.school_subject_group_teachers/i);
});

test('student-owned answers and attempts remain self-only with cached auth identity', () => {
  for (const policy of ['Students view own answers','saa_student_self','Students insert own answers','Students can view their own attempts','Students can insert their own attempts','question_attempts_student_own']) {
    assert.ok(sql.includes('alter policy '+(policy.includes(' ')?'"'+policy+'"':policy)),policy);
  }
  assert.equal((sql.match(/\(select auth\.uid\(\)\)/g)||[]).length,6);
});

test('email retries bounded and exhausted notifications marked failed', () => {
  assert.match(sql, /q\.attempts>=5/);
  assert.match(sql, /q\.attempts<5/);
  assert.match(sql, /set status='failed', delivery_status='failed'/);
  assert.match(sql, /grant execute on function public\.rpc_claim_assignment_email_notifications/);
  assert.doesNotMatch(sql, /grant execute on function public\.rpc_claim_assignment_email_notifications\(integer\)\s+to authenticated/);
});

test('load test checks the heavy pending-assignment payload and completion', () => {
  assert.match(load, /rpc_get_student_pending_assignments_v2/);
  assert.match(load, /http_req_duration\{operation:pending_full\}/);
  assert.match(load, /http_req_duration\{operation:finalize\}/);
});
