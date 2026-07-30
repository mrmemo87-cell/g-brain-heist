import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const service = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260730150000_teacher_owned_assignment_deletion.sql', 'utf8');

test('teacher assignment deletion requires two destructive confirmations', () => {
  const handler = portal.slice(portal.indexOf('const handleDeleteAssignment'), portal.indexOf('const renderAssignments'));
  assert.equal((handler.match(/await brainsConfirm/g) ?? []).length, 2);
  assert.match(handler, /cannot be restored/i);
  assert.match(handler, /submissions, answers, results, and grades will be lost/i);
});

test('teacher assignment deletion is creator-scoped on the server', () => {
  assert.match(service, /rpcDeleteTeacherAssignment\(assignmentId\)/);
  assert.match(migration, /t\.user_id = auth\.uid\(\)/);
  assert.match(migration, /delete from public\.assignments/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
});
