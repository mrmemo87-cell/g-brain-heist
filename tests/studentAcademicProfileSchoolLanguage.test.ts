import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (relative: string) => fs.readFileSync(relative, 'utf8');

test('Student Academic Profile uses school language and source-specific evidence', () => {
  const source = read('components/student-progress/StudentAcademicProfileV2.tsx');
  assert.match(source, /What should we work on\?/);
  assert.match(source, /How is the student moving over time\?/);
  assert.match(source, /sap-source-badge/);
  assert.match(source, /item\.source_type === 'assignment_result'/);
  assert.match(source, /item\.source_type === 'writing_attempt'/);
  assert.match(source, /corrections/);
  assert.match(source, /From the student's work/);
  assert.match(source, /SubjectTrendChart/);
  assert.match(source, /How this profile works/);
  assert.match(source, /Technical reporting terminology/);
});

test('Individual report has explicit React and portal imports', () => {
  const source = read('components/student-progress/IndividualStudentAcademicReportV2.tsx');
  assert.match(source, /useMemo, useRef, useState/);
  assert.match(source, /createPortal/);
  assert.match(source, /createSchoolBrand/);
  assert.match(source, /formatLearningStatus/);
});

test('Student Support Plans keep technical detail collapsible', () => {
  const source = read('components/student-progress/TeacherInterventionIntelligencePageV2.tsx');
  assert.match(source, /What should we work on next\?/);
  assert.match(source, /Example from assessed work/);
  assert.match(source, /Why is this being suggested\?/);
  assert.match(source, /Technical record/);
  assert.match(source, /How support plans work/);
  assert.doesNotMatch(source, /Evidence-led intervention queue/);
});

test('legacy entry points route to the simplified implementations', () => {
  assert.match(read('components/student-progress/StudentAcademicProfile.tsx'), /StudentAcademicProfileV2/);
  assert.match(read('components/student-progress/TeacherInterventionIntelligencePage.tsx'), /TeacherInterventionIntelligencePageV2/);
  assert.match(read('components/student-progress/IndividualStudentAcademicReport.tsx'), /IndividualStudentAcademicReportV2/);
});
