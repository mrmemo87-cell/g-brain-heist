import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const bank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');
const report = [
  readFileSync('components/CollectiveAssignmentReport.tsx', 'utf8'),
  readFileSync('components/CollectiveAssignmentReportView.tsx', 'utf8'),
].join('\n');
const preview = readFileSync('components/teacher/QuestionPreviewModal.tsx', 'utf8');
const reportStyles = readFileSync('components/CollectiveAssignmentReport.css', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');

test('assignment workspace is one dated group with subject and progress categories', () => {
  assert.match(portal, />Subject<\/legend>/);
  assert.match(portal, />Progress<\/legend>/);
  assert.match(portal, /All assignments/);
  assert.match(portal, />Created<\/dt>/);
  assert.doesNotMatch(portal, /assignmentsByGroup/);
});

test('official questions are protected and teacher questions remain owned', () => {
  assert.match(bank, /isBrainsHeistPoolQuestion\(question, teacher\?\.id\)/);
  assert.match(bank, /isSchoolPoolQuestion\(question, teacher\?\.id\)/);
  assert.match(bank, /isMyPoolQuestion\(question, teacher\?\.id\)/);
  assert.match(bank, /official Academic Profile evidence/);
  assert.match(portal, /Only questions in My Pool can be deleted/);
  assert.match(gameService, /is_public: false/);
  assert.match(gameService, /\.eq\('teacher_id', teacher\.id\)/);
});

test('question previews share the complete light-theme component', () => {
  assert.match(bank, /QuestionPreviewModal/);
  assert.match(preview, /Question preview/);
  assert.match(preview, /Teacher explanation/);
  assert.match(preview, /Correct answer/);
  assert.ok(preview.indexOf('question-preview__meta') < preview.indexOf('question-preview__prompt'));
  assert.ok(preview.indexOf('question-preview__prompt') < preview.indexOf('Answer choices'));
});

test('question-bank topics start assignments from one explicit subject', () => {
  assert.match(bank, /Add to a new assignment/);
  assert.match(bank, /qb-modal__header-actions/);
  assert.doesNotMatch(bank, /All assigned subjects/);
  assert.match(bank, /question\.subject !== effectiveSubject/);
});

test('collective reports select assignments and students and can print a professional PDF', () => {
  const classFilter = report.indexOf('aria-label="Filter by class"');
  const assignmentSelector = report.indexOf('<strong>Assignments to include</strong>');
  const studentSelector = report.indexOf('<strong>Students to include</strong>');
  assert.ok(classFilter > -1 && assignmentSelector > -1 && studentSelector > assignmentSelector);
  assert.match(report, /selectedAssignmentIds/);
  assert.match(report, /selectedStudentIds/);
  assert.match(report, /students\.forEach/);
  assert.match(report, /collective-print-report/);
  assert.match(report, /Create report/);
  assert.match(report, /Print report/);
  assert.match(report, /frame\.contentWindow\?\.print\(\)/);
  assert.match(report, /createPortal/);
  assert.match(report, /Not submitted/);
  assert.match(reportStyles, /print-color-adjust:exact/);
  assert.match(reportStyles, /collective-grade--strong/);
});
