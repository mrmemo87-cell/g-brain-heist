import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const listMigration = readFileSync('supabase/migrations/20261021033730_teacher_followups.sql', 'utf8');
const actionMigration = readFileSync('supabase/migrations/20261021100000_teacher_followup_actions.sql', 'utf8');
const service = readFileSync('services/teacherFollowUpService.ts', 'utf8');
const page = readFileSync('components/student-progress/TeacherWeeklyFollowUpsPage.tsx', 'utf8');
const shell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const notifications = readFileSync('services/notificationService.ts', 'utf8');

test('follow-up list is scoped to the signed-in teacher and closed to anonymous callers', () => {
  assert.match(listMigration, /create or replace function public\.get_teacher_followups\(\)/i);
  assert.match(listMigration, /where u\.id = auth\.uid\(\) and u\.role in \('teacher', 'school_admin'\)/i);
  assert.match(listMigration, /join me on a\.teacher_id = me\.teacher_id/i);
  assert.match(listMigration, /revoke all on function public\.get_teacher_followups\(\) from public, anon/i);
  assert.match(listMigration, /alter table public\.teacher_followups enable row level security/i);
});

test('the three tabs come from overdue work, low scores and inactivity', () => {
  assert.match(listMigration, /sa\.status <> 'completed'/i);
  assert.match(listMigration, /having avg\(r\.accuracy\) < 50/i);
  assert.match(listMigration, /daily_streak_rewards/i);
  assert.match(listMigration, /'late' as tab/i);
});

test('follow-ups can only be logged for students the database flags for that teacher', () => {
  assert.match(actionMigration, /drop policy if exists teacher_followups_insert_own/i);
  assert.match(actionMigration, /from public\.get_teacher_followups\(\) f\s+where f\.student_id = any \(p_student_ids\)\s+and f\.tab = p_reason/i);
  assert.match(actionMigration, /cardinality\(p_student_ids\) > 100/i);
  assert.match(actionMigration, /revoke all on function public\.log_teacher_followups\(uuid\[\], text, text, jsonb\) from public, anon/i);
  assert.match(actionMigration, /'teacher_reminder'/);
});

test('the screen reads and writes only through the follow-up RPCs', () => {
  assert.match(service, /rpc\('get_teacher_followups'\)/);
  assert.match(service, /rpc\('log_teacher_followups'/);
  assert.doesNotMatch(service, /from\('teacher_followups'\)\s*\.insert/);
  assert.match(page, /Who needs you this week/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /type="checkbox"/);
});

test('teachers reach the screen from the workspace navigation', () => {
  assert.match(portal, /'dashboard' \| 'follow-ups'/);
  assert.match(portal, /id: 'follow-ups', label: 'Follow-ups'/);
  assert.match(shell, /activeTool === 'follow-ups'/);
  assert.match(shell, /onPlanPractice=\{openInterventionsForStudent\}/);
  assert.match(notifications, /teacher_reminder: \{ emoji:/);
});
