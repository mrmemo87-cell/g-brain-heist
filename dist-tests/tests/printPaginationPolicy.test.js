import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = (path) => fs.readFileSync(path, 'utf8');
const academicCss = read('components/student-progress/AcademicReportBuilder.css');
const academicReport = read('components/student-progress/AcademicReportBuilder.tsx');
const schoolDocument = read('src/lib/schoolDocument.ts');
const cambridgeReport = read('components/ProfessionalCambridgeReport.tsx');
const writingReport = read('src/lib/brains_heist/writingReportDocument.ts');
test('Student Progress report uses section-aware pagination instead of forced section pages', () => {
    assert.match(academicReport, /className="arb-section"/);
    assert.doesNotMatch(academicCss, /\.arb-section\{[^}]*break-inside:avoid/);
    assert.doesNotMatch(academicCss, /break-before:page/);
});
test('Student Progress tables fill available space but never split a row', () => {
    assert.match(academicCss, /\.arb-report thead\{display:table-header-group\}/);
    assert.match(academicCss, /\.arb-report tr\{break-inside:avoid\}/);
});
test('cards, timeline entries, comments and report footer remain indivisible', () => {
    assert.match(academicCss, /\.arb-subjects article/);
    assert.match(academicCss, /\.arb-disclosures/);
    assert.match(academicCss, /\.arb-footer\{break-inside:avoid\}/);
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
