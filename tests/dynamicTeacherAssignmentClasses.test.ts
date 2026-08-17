import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260818100000_dynamic_teacher_assignment_class_audience.sql', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const types = readFileSync('types.ts', 'utf8');

test('teacher assignment class codes are school-defined rather than regex-defined', () => {
  assert.match(migration, /drop constraint if exists assignments_batch_check/i);
  assert.match(migration, /length\(trim\(batch\)\) between 1 and 100/i);
  assert.doesNotMatch(migration, /6\|7\|8\|9\|10\|11\|12/);
  assert.match(types, /type AssignmentBatch = SchoolBatch \| 'All'/);
});

test('assignment create and update use allocations and canonical class rosters', () => {
  assert.match(migration, /private\.teacher_assignment_authorized_students/);
  assert.match(migration, /join public\.class_students cs on cs\.class_id = ac\.id/i);
  assert.match(migration, /cta\.teacher_user_id = p_teacher_user_id/i);
  assert.match(migration, /class_id, school_id/i);
  assert.match(migration, /CLASS_HAS_NO_REGISTERED_STUDENTS/i);
  assert.match(migration, /create or replace function public\.rpc_update_teacher_assignment/i);
});

test('assignment UX scopes classes by subject and prevents publishing to empty classes', () => {
  assert.match(wizard, /normalizeSubject\(item\.subject\) === normalizeSubject\(assignmentSubject\)/);
  assert.match(wizard, /No registered students yet/);
  assert.match(portal, /publishStatus !== 'draft'/);
  assert.match(portal, /no registered students/);
  assert.match(portal, /availableAssignmentClasses/);
});
