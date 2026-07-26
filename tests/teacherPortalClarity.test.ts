import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const teacherPortal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');
const settingsModal = fs.readFileSync(path.resolve(process.cwd(), 'components/SettingsModal.tsx'), 'utf8');
const collectiveReport = fs.readFileSync(path.resolve(process.cwd(), 'components/CollectiveAssignmentReport.tsx'), 'utf8');

test('teacher account settings hide student-only progression fields', () => {
  assert.match(settingsModal, /profile\.role !== 'teacher'/);
  assert.match(settingsModal, /role="switch"/);
  assert.match(settingsModal, /Ultra Performance/);
});

test('teacher dashboard shortcuts navigate to their destinations', () => {
  assert.match(teacherPortal, /onClick=\{\(\) => setView\('students'\)\}/);
  assert.match(teacherPortal, /Given Assignments/);
  assert.match(teacherPortal, /aria-label="Open Student Submissions"/);
  assert.match(teacherPortal, /Assignment Success/);
  assert.doesNotMatch(teacherPortal, /Review student progress, craft assignments/);
});

test('teacher portal exposes assigned students and assignment metadata', () => {
  assert.match(teacherPortal, /const renderStudents/);
  assert.match(teacherPortal, /Only students in classes assigned to you are shown here/);
  assert.match(teacherPortal, />Created<\/dt>/);
  assert.match(teacherPortal, />Questions<\/dt>/);
  assert.match(teacherPortal, />Students<\/dt>/);
});

test('assignment reports explain score and support ordering and filters', () => {
  assert.match(teacherPortal, /Assignment order/);
  assert.match(teacherPortal, /Needs review first/);
  assert.match(teacherPortal, /Total XP points earned from correct answers/);
  assert.match(collectiveReport, /Filter by assignment/);
  assert.match(collectiveReport, /Created from/);
  assert.match(collectiveReport, /Created to/);
  assert.match(collectiveReport, /All Classes/);
});
