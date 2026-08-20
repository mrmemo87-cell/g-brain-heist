import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const report = readFileSync('components/student-progress/AcademicReportBuilder.tsx', 'utf8');
test('academic report uses a stable evidence-first section contract', () => {
    assert.match(report, /01 · Subject evidence/);
    assert.match(report, /02 · Intervention outcomes/);
    assert.match(report, /Reporting disclosures/);
    assert.doesNotMatch(report, /teacherComment|includeTimeline|includeAssignments/);
});
