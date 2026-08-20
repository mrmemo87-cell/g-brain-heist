import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const subjects = ['english', 'maths', 'science'];
const letters = ['A', 'B', 'C', 'D'];
function load(subject) {
    return JSON.parse(readFileSync(`supabase/seed/admission-official-bank/${subject}/grade_5.json`, 'utf8'));
}
function distribution(questions) {
    const counts = new Map(letters.map(letter => [letter, 0]));
    for (const question of questions) {
        if (!Array.isArray(question.options) || question.correct_index == null)
            continue;
        assert.equal(question.correct_answer, question.options[question.correct_index], `${question.external_id} correct answer must match reordered option`);
        counts.set(letters[question.correct_index], (counts.get(letters[question.correct_index]) ?? 0) + 1);
    }
    return counts;
}
test('Grade 5 official bank answer keys are distributed by subject and overall', () => {
    const overall = new Map(letters.map(letter => [letter, 0]));
    let overallTotal = 0;
    for (const subject of subjects) {
        const questions = load(subject).questions;
        const counts = distribution(questions);
        const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
        assert.ok(total > 0);
        for (const letter of letters) {
            overall.set(letter, (overall.get(letter) ?? 0) + (counts.get(letter) ?? 0));
            assert.ok((counts.get(letter) ?? 0) / total <= 0.4, `${subject} option ${letter} exceeds 40%`);
        }
        overallTotal += total;
    }
    for (const letter of letters)
        assert.ok((overall.get(letter) ?? 0) / overallTotal <= 0.4, `overall option ${letter} exceeds 40%`);
});
