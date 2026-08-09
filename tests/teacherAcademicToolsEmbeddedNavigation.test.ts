import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wrapper = readFileSync('components/TeacherPortalIntegrated.tsx', 'utf8');
const viteConfig = readFileSync('vite.config.ts', 'utf8');
const report = readFileSync('components/student-progress/IndividualStudentAcademicReport.tsx', 'utf8');

test('teacher academic tools stay inside the teacher portal shell', () => {
  assert.match(viteConfig, /'\.\/components\/TeacherPortal\.tsx': path\.resolve\(__dirname, 'components\/TeacherPortalIntegrated\.tsx'\)/);
  assert.match(wrapper, /<TeacherPortal \{\.\.\.props\} \/>/);
  assert.match(wrapper, /<TeacherAcademicProfilesPage \/>/);
  assert.match(wrapper, /<TeacherInterventionIntelligencePage \/>/);
  assert.match(wrapper, /onClickCapture=\{handleNavigationCapture\}/);
  assert.doesNotMatch(wrapper, /window\.location\.assign/);
});

test('academic report section numbers follow only included sections', () => {
  assert.match(report, /const sectionNumbers = useMemo/);
  assert.match(report, /focus: includeFocus \? next\+\+ : null/);
  assert.match(report, /strengths: includeStrengths \? next\+\+ : null/);
  assert.match(report, /assignments: includeAssignments \? next\+\+ : null/);
  assert.match(report, /timeline: includeTimeline \? next\+\+ : null/);
  assert.match(report, /comment: teacherComment\.trim\(\) \? next\+\+ : null/);
  assert.doesNotMatch(report, /<span>0[2-6]<\/span>/);
});
