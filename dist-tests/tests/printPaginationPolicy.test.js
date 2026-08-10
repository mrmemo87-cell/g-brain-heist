import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = (path) => fs.readFileSync(path, 'utf8');
const academicCss = read('components/student-progress/StudentAcademicProfile.css');
const academicReport = read('components/student-progress/IndividualStudentAcademicReport.tsx');
const schoolDocument = read('src/lib/schoolDocument.ts');
const cambridgeReport = read('components/ProfessionalCambridgeReport.tsx');
const writingReport = read('src/lib/brains_heist/writingReportDocument.ts');
test('Student Progress report uses section-aware pagination instead of forced section pages', () => {
    assert.match(academicReport, /sap-print-section sap-print-page/);
    assert.match(academicCss, /\.sap-print-page\{break-before:auto!important;page-break-before:auto!important\}/);
    assert.match(academicCss, /\.sap-print-section\{break-inside:auto!important;page-break-inside:auto!important/);
    assert.doesNotMatch(academicCss, /\.sap-print-page\{break-before:page\}/);
    assert.doesNotMatch(academicCss, /\.sap-print-section\{break-inside:avoid\}/);
});
test('Student Progress tables fill available space but never split a row', () => {
    assert.match(academicCss, /\.sap-print-report table\{break-inside:auto!important;page-break-inside:auto!important\}/);
    assert.match(academicCss, /\.sap-print-report thead\{display:table-header-group!important\}/);
    assert.match(academicCss, /\.sap-print-report tr[^}]*break-inside:avoid!important;page-break-inside:avoid!important/);
    assert.match(academicCss, /\.sap-print-section-heading\{break-after:avoid-page!important;page-break-after:avoid!important\}/);
});
test('cards, timeline entries, comments and report footer remain indivisible', () => {
    assert.match(academicCss, /\.sap-print-focus-grid article/);
    assert.match(academicCss, /\.sap-print-three>div/);
    assert.match(academicCss, /\.sap-print-timeline p/);
    assert.match(academicCss, /\.sap-print-report blockquote/);
    assert.ok(academicCss.includes('.sap-print-footer{break-inside:avoid!important;page-break-inside:avoid!important}'));
});
test('central school document engine already follows the same pagination contract', () => {
    assert.match(schoolDocument, /thead\{display:table-header-group\}/);
    assert.match(schoolDocument, /tr\{break-inside:avoid\}/);
    assert.match(schoolDocument, /document-card[^}]*break-inside:avoid/);
    assert.match(schoolDocument, /h2[^}]*break-after:avoid/);
});
test('Cambridge and Writing print surfaces preserve atomic rows/cards', () => {
    assert.match(cambridgeReport, /table thead[^}]*display: table-header-group/);
    assert.match(cambridgeReport, /table tr,[\s\S]*break-inside: avoid !important/);
    assert.match(writingReport, /\.panel\{break-inside:avoid/);
});
