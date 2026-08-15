import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAllocatableTeacherLabel,
  getAllocatableTeachers,
} from '../src/lib/schoolAdminTeacherAllocations.js';

test('teacher allocation candidates are selected by teaching capability, not primary role', () => {
  const candidates = getAllocatableTeachers([
    { user_id: 'teacher', username: 'Ms. Maths', role_in_school: 'teacher', can_teach: true },
    { user_id: 'dual-role', username: 'Mr. English', role_in_school: 'school_admin', can_teach: true },
    { user_id: 'admin-only', username: 'School Admin', role_in_school: 'school_admin', can_teach: false },
  ]);

  assert.deepEqual(candidates.map((candidate) => candidate.user_id), ['teacher', 'dual-role']);
});

test('dual-role teachers are clearly labelled in allocation dropdowns', () => {
  assert.equal(
    formatAllocatableTeacherLabel({
      user_id: 'dual-role',
      username: 'Mr. English',
      role_in_school: 'school_admin',
      can_teach: true,
    }),
    'Mr. English — Teaching staff & School Admin',
  );
  assert.equal(
    formatAllocatableTeacherLabel({
      user_id: 'teacher',
      username: 'Ms. Maths',
      role_in_school: 'teacher',
      can_teach: true,
    }),
    'Ms. Maths',
  );
});
