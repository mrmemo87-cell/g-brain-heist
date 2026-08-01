import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const subjects = ['english', 'maths', 'science'];
const letters = ['A', 'B', 'C', 'D'];
function load(subject) {
    return JSON.parse(readFileSync(`supabase/seed/admission-official-bank/${subject}/grade_7.json`, 'utf8'));
}
function distribution(questions) {
    const counts = new Map(letters.map(letter => [letter, 0]));
    const stems = new Set();
    for (const question of questions) {
        if (!Array.isArray(question.options) || question.correct_index == null)
            continue;
        assert.equal(question.correct_answer, question.options[question.correct_index], `${question.external_id} correct answer must match option`);
        counts.set(letters[question.correct_index], (counts.get(letters[question.correct_index]) ?? 0) + 1);
        const normalized = String(question.prompt).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        assert.equal(stems.has(normalized), false, `${question.external_id} duplicates prompt stem`);
        stems.add(normalized);
    }
    return counts;
}
test('Grade 7 official bank answer keys are balanced by subject and have no duplicate stems', () => {
    for (const subject of subjects) {
        const counts = distribution(load(subject).questions);
        const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
        assert.ok(total > 0);
        for (const letter of letters)
            assert.ok((counts.get(letter) ?? 0) / total <= 0.4, `${subject} option ${letter} exceeds 40%`);
    }
});
