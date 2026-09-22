import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('components/school-admin/SubjectProvisioningPanel.tsx', 'utf8');

test('Subject Studio uses a progressive five-step wizard instead of an all-at-once form', () => {
  for (const label of ["label: 'Subject'", "label: 'Grade'", "label: 'Access'", "label: 'Teacher'", "label: 'Review'"]) {
    assert.match(panel, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(panel, /currentStep === 1/);
  assert.match(panel, /currentStep === 5/);
  assert.match(panel, /continueWizard/);
  assert.match(panel, /backWizard/);
  assert.match(panel, /Current plan/);
});

test('Subject Studio prevents unsupported subject and grade combinations before publish', () => {
  assert.match(panel, /availableGrades\.has\(item\)/);
  assert.match(panel, /disabled=!supported|disabled=\{!supported\}/);
  assert.match(panel, /selectedScope/);
  assert.match(panel, /scopeId: selectedScope\.scopeId/);
});

test('selective access remains explicit and searchable', () => {
  assert.match(panel, /Selected students/);
  assert.match(panel, /Search \$\{gradeLabel\(grade\)\} students/);
  assert.match(panel, /selectedStudentIds: accessMode === 'selected'/);
  assert.match(panel, /Select visible/);
  assert.match(panel, /Clear/);
});

test('teacher allocation supports assign-now and assign-later without changing backend authority', () => {
  assert.match(panel, /type TeacherPlan = 'later' \| 'now'/);
  assert.match(panel, /Assign later/);
  assert.match(panel, /Assign a teacher now/);
  assert.match(panel, /teacherUserId: teacherPlan === 'now'/);
  assert.match(panel, /provisionSchoolSubject/);
});

test('Subject Studio owns its light-surface contrast instead of inheriting portal text color', () => {
  assert.match(panel, /text-slate-900/);
  assert.match(panel, /bg-white/);
  assert.match(panel, /text-slate-950/);
  assert.doesNotMatch(panel, /border-current/);
  assert.doesNotMatch(panel, /bg-current/);
});
