import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('students open Academic Progress inside the Learn tab', () => {
  const app = read('App.tsx');
  assert.match(app, /studentLearningView.*academic-profile/);
  assert.match(app, /Open Academic Progress/);
  assert.match(app, /<StudentAcademicProfile/);
  assert.match(app, /onClose=\{\(\) => setStudentLearningView\('catalog'\)\}/);
});

test('teacher, school admin, and school head portals embed the shared academic profile workspace', () => {
  const app = read('App.tsx');
  const admin = read('components/SchoolAdminPortal.tsx');
  const head = read('components/SchoolHeadPortal.tsx');
  assert.match(app, /components\/TeacherPortalShell/);
  assert.match(admin, /selectAdminTab\('academic-profiles'\)/);
  assert.match(admin, /<TeacherAcademicProfilesPage/);
  assert.match(head, /setAcademicProfilesOpen\(true\)/);
  assert.match(head, /<TeacherAcademicProfilesPage/);
  assert.doesNotMatch(head, /window\.location\.assign\(`\/school-head-learning-intelligence/);
});

test('the shared profile shows smart evidence confidence and curriculum coverage', () => {
  const service = read('services/studentAcademicProfileService.ts');
  const profile = read('components/student-progress/StudentAcademicProfile.tsx');
  assert.match(service, /rpc_student_academic_confidence/);
  assert.match(service, /year\.status === 'current'/);
  assert.match(profile, /How reliable and complete is the academic picture/);
  assert.match(profile, /Confidence measures the quality, recency and consistency of evidence/);
  assert.match(profile, /Qualified coverage/);
  assert.match(profile, /require teacher review/);
});
