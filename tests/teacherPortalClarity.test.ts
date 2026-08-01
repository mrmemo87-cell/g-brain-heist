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
  assert.match(teacherPortal, /aria-label="Open Assignments"/);
  assert.match(teacherPortal, /aria-label="Open Reports"/);
  assert.match(teacherPortal, /Assignment Success/);
  assert.doesNotMatch(teacherPortal, /Review student progress, craft assignments/);
});

test('student alerts identify the learner, assignment, and reason for follow-up', () => {
  assert.match(teacherPortal, /needs help with “\$\{assignmentLabel\}”/);
  assert.match(teacherPortal, /has not completed “\$\{assignmentLabel\}”/);
  assert.match(teacherPortal, /dashboardAssignmentReports/);
  assert.doesNotMatch(teacherPortal, /Current success rate is \$\{successRate\}%\. Consider intervention\./);
});

test('teacher portal exposes assigned students and assignment metadata', () => {
  assert.match(teacherPortal, /const renderStudents/);
  assert.match(teacherPortal, />🏫 My Classes</);
  assert.match(teacherPortal, /Every assigned class, subject, and student in one organised view/);
  assert.match(teacherPortal, />Created<\/dt>/);
  assert.match(teacherPortal, />Questions<\/dt>/);
  assert.match(teacherPortal, />Students<\/dt>/);
});

test('assignment reports explain score and support ordering and filters', () => {
  assert.match(teacherPortal, /Assignment order/);
  assert.match(teacherPortal, /Needs review first/);
  assert.match(teacherPortal, /Total XP points earned from correct answers/);
  assert.match(collectiveReport, /Class Achievement Report/);
  assert.match(collectiveReport, /Create report/);
  assert.match(collectiveReport, /Students requiring support/);
  assert.match(collectiveReport, /Class average/);
  assert.match(collectiveReport, /Not submitted/);
  assert.match(collectiveReport, /selectedAssignmentIds/);
  assert.match(collectiveReport, /selectedStudentIds/);
  assert.match(collectiveReport, /Created from/);
  assert.match(collectiveReport, /Created to/);
  assert.match(collectiveReport, /All Classes/);
  assert.match(teacherPortal, /Student,Class,Score,Correct,Incorrect/);
  assert.ok(teacherPortal.indexOf('📊 Question Analysis') > teacherPortal.indexOf('Student Performance'));
  assert.match(
    teacherPortal,
    /Question Analysis follows the complete student roster and stays closed by default[\s\S]{0,200}<details className="group overflow-hidden rounded-xl/,
  );
  assert.match(teacherPortal, /handlePrintStudentAnalysis/);
  assert.match(teacherPortal, /Assignment performance report/);
});
