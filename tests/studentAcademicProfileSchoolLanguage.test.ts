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

test('secondary academic profile sections use one closed-by-default disclosure system', () => {
  const source = read('components/student-progress/StudentAcademicProfileV2.tsx');
  const disclosures = source.match(/<ProfileDisclosure/g) || [];
  assert.equal(disclosures.length, 6);
  assert.match(source, /sap-profile-disclosure/);
  assert.match(source, /className="when-closed">Open/);
  assert.match(source, /className="when-open">Close/);
  assert.doesNotMatch(source, /<details[^>]*\sopen(?:\s|>)/);
});

test('English combines assignment and Writing Hub evidence in one colour-coded trend chart', () => {
  const source = read('components/student-progress/StudentAcademicProfileV2.tsx');
  assert.match(source, /label: 'Assignments', tone: 'assignment'/);
  assert.match(source, /label: 'Writing Hub', tone: 'writing'/);
  assert.match(source, /subject: name, series/);
  assert.match(source, /sap-trend-line--\$\{trendSeries\.tone\}/);
  assert.match(source, /sap-trend-point--\$\{point\.series\.tone\}/);
});

test('subject trend points expose edge-aware interactive tooltips and semantic evidence colours', () => {
  const source = read('components/student-progress/StudentAcademicProfileV2.tsx');
  const styles = read('components/student-progress/StudentAcademicProfileV2Enhancements.css');
  assert.match(source, /sap-trend-tooltip--\$\{horizontalEdge\}/);
  assert.match(source, /sap-trend-tooltip--\$\{verticalEdge\}/);
  assert.match(source, /onMouseEnter/);
  assert.match(source, /onFocus/);
  assert.match(source, /onClick/);
  assert.match(source, /sap-trend-evidence-mix/);
  assert.match(styles, /\.is-support/);
  assert.match(styles, /\.is-developing/);
  assert.match(styles, /\.is-strength/);
  assert.doesNotMatch(source, /<title>/);
});

test('printed individual report contains subject trend graphs and point details', () => {
  const source = read('components/student-progress/IndividualStudentAcademicReportV2.tsx');
  assert.match(source, /PrintSubjectTrendChart/);
  assert.match(source, /sap-print-trend-grid/);
  assert.match(source, /sap-print-trend-point-list/);
  assert.match(source, /numbered point details/);
  assert.match(source, /Learning timeline \+ trend graphs/);
});

test('academic subject options are deduplicated case-insensitively', () => {
  const picker = read('components/student-progress/AcademicProgressSuite.tsx');
  const profile = read('components/student-progress/StudentAcademicProfileV2.tsx');
  assert.match(picker, /normalizeAcademicSubjectOptions/);
  assert.match(picker, /toLocaleLowerCase\(\)/);
  assert.match(profile, /normalizeAcademicSubjectOptions\(values\)/);
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
