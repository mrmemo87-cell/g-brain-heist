import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAssignableTeacherLabel,
  getAssignableTeachers,
} from '../src/lib/schoolAdminTeacherAssignments.js';

test('teacher assignment candidates are selected by teaching capability, not primary role', () => {
  const candidates = getAssignableTeachers([
    { user_id: 'teacher', username: 'Ms. Maths', role_in_school: 'teacher', can_teach: true },
    { user_id: 'dual-role', username: 'Mr. English', role_in_school: 'school_admin', can_teach: true },
    { user_id: 'admin-only', username: 'School Admin', role_in_school: 'school_admin', can_teach: false },
  ]);

  assert.deepEqual(candidates.map((candidate) => candidate.user_id), ['teacher', 'dual-role']);
});

test('dual-role teachers are clearly labelled in assignment dropdowns', () => {
  assert.equal(
    formatAssignableTeacherLabel({
      user_id: 'dual-role',
      username: 'Mr. English',
      role_in_school: 'school_admin',
      can_teach: true,
    }),
    'Mr. English — Teaching staff & School Admin',
  );
  assert.equal(
    formatAssignableTeacherLabel({
      user_id: 'teacher',
      username: 'Ms. Maths',
      role_in_school: 'teacher',
      can_teach: true,
    }),
    'Ms. Maths',
  );
});
