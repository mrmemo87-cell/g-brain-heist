import assert from 'node:assert/strict';
import test from 'node:test';
import { classMatchesConfiguredGrade, getConfiguredSchoolGrades, } from '../src/features/onboarding/schoolGradeOptions.js';
test('school signup exposes every configured grade without a global range', () => {
    const classes = [
        { grade_level: '6' },
        { grade_level: '4' },
        { grade_level: 'Foundation' },
        { grade_level: '13' },
        { grade_level: '5' },
        { grade_level: '4' },
        { grade_level: null },
    ];
    assert.deepEqual(getConfiguredSchoolGrades(classes), ['4', '5', '6', '13', 'Foundation']);
});
test('class dropdown only shows classes belonging to the selected configured grade', () => {
    assert.equal(classMatchesConfiguredGrade({ grade_level: ' 4 ' }, '4'), true);
    assert.equal(classMatchesConfiguredGrade({ grade_level: '5' }, '4'), false);
});
