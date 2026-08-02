import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTeacherRoster, type TeacherRosterRow } from '../src/lib/teacherRoster.js';

const student = (overrides: Partial<TeacherRosterRow> = {}): TeacherRosterRow => ({
  id: 'student-1',
  username: 'student-one',
  display_name: 'Student One',
  grade: 8,
  batch: '8A',
  avatar_url: null,
  class_code: '8A',
  ...overrides,
});

test('teacher roster keeps one canonical row when a fallback class duplicates a student', () => {
  const normalized = normalizeTeacherRoster([
    student({ class_code: '8B' }),
    student({ class_code: '8A' }),
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.id, 'student-1');
  assert.equal(normalized[0]?.batch, '8A');
});

test('teacher roster keeps distinct students and uses class code as the grouping source', () => {
  const normalized = normalizeTeacherRoster([
    student({ id: 'student-1', batch: null, class_code: ' 8a ' }),
    student({ id: 'student-2', username: 'student-two', display_name: 'Student Two', batch: '8B', class_code: '8B' }),
  ]);

  assert.deepEqual(normalized.map(row => [row.id, row.batch]), [
    ['student-1', '8A'],
    ['student-2', '8B'],
  ]);
});
