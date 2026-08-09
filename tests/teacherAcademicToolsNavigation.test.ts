import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');

test('teacher workspace exposes academic profiles and interventions', () => {
  assert.match(teacherPortal, /label: 'Academic Profiles'/);
  assert.match(teacherPortal, /label: 'Interventions'/);
  assert.match(teacherPortal, /window\.location\.assign\('\/teacher-academic-profiles\.html'\)/);
  assert.match(teacherPortal, /window\.location\.assign\('\/teacher-interventions\.html'\)/);
});

test('teacher academic tools share the performance-report entitlement boundary', () => {
  assert.match(teacherPortal, /'academic-profiles': 'Performance Reports'/);
  assert.match(teacherPortal, /interventions: 'Performance Reports'/);
});
