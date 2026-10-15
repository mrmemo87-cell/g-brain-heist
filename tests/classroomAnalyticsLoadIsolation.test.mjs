import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261015184500_school_analytics_and_background_write_isolation.sql',import.meta.url),'utf8');
const app = readFileSync(new URL('../App.tsx',import.meta.url),'utf8');

test('only new observations rely on AFTER INSERT refresh; replay keeps explicit recomputation', () => {
  assert.match(migration, /trg_student_learning_refresh_focus_state/);
  assert.match(migration, /get diagnostics v_observation_inserted = row_count/);
  assert.match(migration, /if v_observation_inserted = 0 then/);
  assert.match(migration, /perform public\.student_learning_refresh_focus_state\(p_student_id,v_skill_key\)/);
  assert.match(migration, /ingest_verified_assignment_registry_evidence/);
  assert.match(migration, /ingest_verified_assignment_diagnostic_evidence/);
  assert.doesNotMatch(migration, /drop trigger/i);
  assert.doesNotMatch(migration, /delete from public\.student_learning_observations/i);
});

test('head refresh is bounded, private and retries per school', () => {
  assert.match(migration, /private\.school_head_refresh_schedule/);
  assert.match(migration, /least\(greatest\(coalesce\(p_limit,3\),1\),5\)/);
  assert.match(migration, /pg_try_advisory_xact_lock/);
  assert.match(migration, /exception when others then/);
  assert.match(migration, /failure_count=private\.school_head_refresh_schedule\.failure_count\+1/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /interval '1 hour'/);
  assert.match(migration, /revoke all on function private\.run_school_head_refresh_batch/i);
  assert.match(migration, /s\.status='active'/);
  assert.match(migration, /sm\.is_owner and sm\.status='active'/);
  assert.match(migration, /school-head-decision-notifications/);
  assert.match(migration, /school-head-snapshot-retention/);
});

test('presence retains 60s client heartbeat and eliminates redundant writes on repeat focus', () => {
  assert.match(app, /setInterval\(touchPresence,\s*60_000\)/);
  assert.match(migration, /user_presence\.last_active_at < excluded\.last_active_at - interval '45 seconds'/);
  assert.match(migration, /if v_actor is null then/);
  assert.match(migration, /grant execute on function public\.rpc_touch_last_seen\(\) to authenticated/);
});

test('email provider delivery stays every minute; cleanup/reminders run independently', () => {
  assert.match(migration, /school-email-dispatcher','\* \* \* \* \*'/);
  assert.match(migration, /school-email-cleanup','3-58\/5 \* \* \* \*'/);
  assert.match(migration, /school-email-reminders','7-57\/10 \* \* \* \*'/);
  assert.match(migration, /net\.http_post\(/);
  assert.match(migration, /rpc_school_email_cleanup\(\)/);
  assert.match(migration, /rpc_enqueue_due_email_reminders\(\)/);
  assert.doesNotMatch(migration, /delete from public\.student_assignment_answers/i);
});

test('academic scoring and assignment-completion transaction remain untouched', () => {
  assert.doesNotMatch(migration,/create or replace function public\.rpc_submit_assignment_result_v2/i);
  assert.doesNotMatch(migration,/create or replace function public\.rpc_submit_assignment_answer_v2/i);
  assert.doesNotMatch(migration,/alter policy/i);
});
