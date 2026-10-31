import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const expression = wizard.match(/const assignmentResourceSubject = ([\s\S]*?);/)?.[1];
assert.ok(expression, 'Assignment resource subject resolver must exist');
const resolve = new Function('selectedTeachingGroup', 'subjectTeachingGroups', 'assignmentSubject', 'return (' + expression + ');');
test('class batches retain the mapped academic subject without a selected teaching group', () => {
    assert.equal(resolve(null, [{ academicSubjectName: 'Physics' }], 'Physics-0654'), 'Physics');
});
test('group audiences keep their selected resource subject', () => {
    assert.equal(resolve({ academicSubjectName: 'Physics' }, [{ academicSubjectName: 'Science' }], 'Physics-0654'), 'Physics');
});
test('unmapped subjects keep their exact school identity instead of guessing from an exam code', () => {
    assert.equal(resolve(null, [], 'Physics-0654'), 'Physics-0654');
    assert.equal(resolve(null, [{ academicSubjectName: null }], 'Local Physics'), 'Local Physics');
});
test('a missing mapping on one allocated group does not hide another explicit mapping', () => {
    assert.equal(resolve(null, [{ academicSubjectName: null }, { academicSubjectName: 'Physics' }], 'Physics-0654'), 'Physics');
});
