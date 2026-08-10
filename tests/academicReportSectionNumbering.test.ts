import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const report = readFileSync('components/student-progress/IndividualStudentAcademicReport.tsx', 'utf8');

test('student progress report numbers only sections that are actually included', () => {
  assert.match(report, /const sectionNumbers = useMemo/);
  assert.match(report, /overview: take\(\)/);
  assert.match(report, /focus: includeFocus \? take\(\) : null/);
  assert.match(report, /strengths: includeStrengths \? take\(\) : null/);
  assert.match(report, /assignments: includeAssignments \? take\(\) : null/);
  assert.match(report, /timeline: includeTimeline \? take\(\) : null/);
  assert.match(report, /comment: teacherComment\.trim\(\) \? take\(\) : null/);
  assert.match(report, /<span>\{sectionNumbers\.overview\}<\/span>/);
  assert.match(report, /<span>\{sectionNumbers\.focus\}<\/span>/);
  assert.match(report, /<span>\{sectionNumbers\.strengths\}<\/span>/);
  assert.match(report, /<span>\{sectionNumbers\.assignments\}<\/span>/);
  assert.match(report, /<span>\{sectionNumbers\.timeline\}<\/span>/);
  assert.match(report, /<span>\{sectionNumbers\.comment\}<\/span>/);
  assert.doesNotMatch(report, /<span>0[2-6]<\/span>/);
});
