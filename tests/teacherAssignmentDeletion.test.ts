import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const service = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260730150000_teacher_owned_assignment_deletion.sql', 'utf8');

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ');

test('teacher assignment deletion requires an explicit destructive confirmation flow', () => {
  const start = portal.indexOf('const handleDeleteAssignment');
  const end = portal.indexOf('const renderAssignments', start);
  assert.ok(start >= 0 && end > start, 'delete-assignment handler must exist');

  const handler = portal.slice(start, end);
  const normalized = normalize(handler);
  const confirmations = handler.match(/brainsConfirm\s*\(/g) ?? [];

  assert.ok(confirmations.length >= 1, 'deletion must require destructive confirmation');
  assert.match(normalized, /cannot be restored|permanent|permanently|cannot be undone/);
  assert.match(normalized, /submissions|answers|results|grades|scores|progress|reporting/);
  assert.match(normalized, /delete_teacher_assignment|deleteassignment|delete assignment/);
});

test('teacher assignment deletion is creator-scoped on the server', () => {
  assert.match(service, /rpcDeleteTeacherAssignment\(assignmentId\)/);

  const normalized = normalize(migration);
  const directCreatorPredicate = /t\.user_id\s*=\s*auth\.uid\(\)/i.test(migration);
  const resolvedCreatorGuard = /t\.user_id/i.test(migration)
    && /auth\.uid\(\)/i.test(migration)
    && /raise exception|return false|not authorized|not its creator/i.test(migration);

  assert.ok(
    directCreatorPredicate || resolvedCreatorGuard,
    'deletion RPC must bind the authenticated actor to the assignment creator',
  );
  assert.match(normalized, /delete from public\.assignments/);
  assert.match(normalized, /grant execute .* to authenticated/);
});
