import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wrapper = readFileSync('components/TeacherPortalIntegrated.tsx', 'utf8');
const viteConfig = readFileSync('vite.config.ts', 'utf8');
const report = readFileSync('components/student-progress/AcademicReportBuilder.tsx', 'utf8');

test('teacher academic tools stay inside the teacher portal shell', () => {
  assert.match(viteConfig, /'\.\/components\/TeacherPortal\.tsx': path\.resolve\(__dirname, 'components\/TeacherPortalIntegrated\.tsx'\)/);
  assert.match(wrapper, /<TeacherPortal \{\.\.\.props\} \/>/);
  assert.match(wrapper, /<TeacherAcademicProfilesPage \/>/);
  assert.match(wrapper, /<TeacherInterventionIntelligencePage \/>/);
  assert.match(wrapper, /onClickCapture=\{handleNavigationCapture\}/);
  assert.doesNotMatch(wrapper, /window\.location\.assign/);
});

test('academic report sections are immutable evidence outputs', () => {
  assert.match(report, /01 · Subject evidence/);
  assert.match(report, /02 · Intervention outcomes/);
  assert.match(report, /Reporting disclosures/);
  assert.match(report, /Approve & Finalize/);
  assert.doesNotMatch(report, /teacherComment|textarea/);
});
