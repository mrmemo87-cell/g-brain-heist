import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTeacherQuestionImport } from '../src/lib/teacherQuestionBulkImport.js';
const header = 'subject,topic,grade_levels,difficulty,question_type,question_text,option1,option2,option3,option4,correct_answer,explanation,points,time_limit';
test('teacher bulk import supports CSV and preserves optional grade suggestions', () => {
    const preview = parseTeacherQuestionImport(`${header}\nMaths,Fractions,6|7,easy,multiple_choice,"What is 1/2 + 1/4?",1/4,2/4,3/4,1,3/4,Use a common denominator,10,30`);
    assert.equal(preview.issues.length, 0);
    assert.equal(preview.questions.length, 1);
    assert.deepEqual(preview.questions[0]?.eligible_grade_levels, [6, 7]);
    assert.equal(preview.questions[0]?.topic, 'Fractions');
});
test('teacher bulk import accepts tab-delimited spreadsheet paste', () => {
    const preview = parseTeacherQuestionImport('subject\ttopic\tgrade_levels\tdifficulty\tquestion_type\tquestion_text\tcorrect_answer\nScience\tLab safety\t7\tmedium\ttrue_false\tWear safety glasses\tTrue');
    assert.equal(preview.issues.length, 0);
    assert.deepEqual(preview.questions[0]?.options, ['True', 'False']);
});
test('teacher bulk import blocks spreadsheet date coercion before saving', () => {
    const preview = parseTeacherQuestionImport(`${header}\nMaths,Fractions,6,easy,multiple_choice,Fraction?,2026/3/4,1/2,1/3,1/4,1/2,,10,30`);
    assert.equal(preview.questions.length, 0);
    assert.match(preview.issues[0]?.message || '', /fraction converted into a date/i);
});
test('teacher bulk import skips duplicate rows in one batch', () => {
    const row = 'English,Grammar,6,easy,multiple_choice,Choose the noun,run,book,quickly,blue,book,,10,30';
    const preview = parseTeacherQuestionImport(`${header}\n${row}\n${row}`);
    assert.equal(preview.questions.length, 1);
    assert.deepEqual(preview.duplicateRows, [3]);
});
