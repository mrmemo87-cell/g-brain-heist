import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('English Academic Profile trends separate Writing Hub from assignments', () => {
  const profile = read('components/student-progress/StudentAcademicProfileV2.tsx');
  const report = read('components/student-progress/IndividualStudentAcademicReportV2.tsx');
  const semantics = read('components/student-progress/academicReportingSemantics.ts');
  for (const source of [profile, report]) {
    assert.match(source, /English|english/);
    assert.match(source, /Writing Hub/);
    assert.match(source, /Assignments/);
    assert.match(source, /writing_attempt/);
    assert.match(source, /assignment_result/);
    assert.match(source, /summarizeComparableTrend/);
  }
  assert.match(semantics, /No evidence in this period/);
  assert.match(semantics, /Not enough comparable evidence yet/);
});

test('Academic report header has explicit high contrast text', () => {
  const css = read('components/student-progress/StudentAcademicProfile.css');
  assert.match(css, /Academic report top-of-page contrast guard/);
  assert.match(css, /sap-print-brand strong[\s\S]*#0f172a !important/);
  assert.match(css, /sap-report-toolbar strong[\s\S]*#ffffff !important/);
});

test('Lockdown question picker is touch-scrollable on mobile', () => {
  const modal = read('src/features/clanTerritory/components/QuestionSelectionModal.tsx');
  assert.match(modal, /100dvh/);
  assert.match(modal, /min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain/);
  assert.match(modal, /WebkitOverflowScrolling: 'touch'/);
});

test('pilot billing hides paid seat caps and highlighted controls stay readable', () => {
  const billing = read('components/school-admin/BillingTabUI.tsx');
  const contrast = read('components/school-admin/BillingContrast.css');
  assert.match(billing, /planDetails\.seats && isPaid/);
  assert.doesNotMatch(billing, /isPaid \|\| \(isPilot && isActive\)/);
  assert.match(billing, /Full pilot access/);
  assert.match(contrast, /button\.bg-emerald-600/);
  assert.match(contrast, /button\.bg-emerald-800/);
  assert.match(contrast, /button\.bg-cyan-800/);
  assert.doesNotMatch(contrast, /button\.bg-emerald-100/);
  assert.match(contrast, /span\.bg-emerald-100[\s\S]*color: #065f46 !important/);
});
