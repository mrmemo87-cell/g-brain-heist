import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const bank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');
const report = readFileSync('components/CollectiveAssignmentReport.tsx', 'utf8');
const preview = readFileSync('components/teacher/QuestionPreviewModal.tsx', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');

test('assignment workspace is one dated group with subject and progress categories', () => {
  assert.match(portal, />Subject<\/legend>/);
  assert.match(portal, />Progress<\/legend>/);
  assert.match(portal, /All assignments/);
  assert.match(portal, />Created<\/dt>/);
  assert.doesNotMatch(portal, /assignmentsByGroup/);
});

test('official questions are protected and teacher questions remain owned', () => {
  assert.match(bank, /'brains-heist': permittedQuestions\.filter\(\(question\) => !question\.teacher_id\)/);
  assert.match(bank, /question\.teacher_id === teacher\?\.id/);
  assert.match(bank, /Approved app library · read-only/);
  assert.match(portal, /Only questions in My Pool can be deleted/);
  assert.match(portal, /is_public: false/);
  assert.match(gameService, /\.eq\('teacher_id', teacher\.id\)/);
});

test('question previews share the complete light-theme component', () => {
  assert.match(bank, /QuestionPreviewModal/);
  assert.match(preview, /Question preview/);
  assert.match(preview, /Teacher explanation/);
  assert.match(preview, /Correct answer/);
});

test('collective reports filter class before assignment and can print to PDF', () => {
  const classFilter = report.indexOf('aria-label="Filter by class"');
  const assignmentFilter = report.indexOf('aria-label="Filter by assignment"');
  assert.ok(classFilter > -1 && assignmentFilter > classFilter);
  assert.match(report, /assignmentsForSelection/);
  assert.match(report, /Print \/ Save PDF/);
  assert.match(report, /window\.print\(\)/);
});
