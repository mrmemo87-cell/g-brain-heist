import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { doesAnswerMatchCorrectAnswer } from '../src/lib/ieltsPracticeScoring.js';
test('listening grading matches lowercase typed answer against JSON array string', () => {
    assert.equal(doesAnswerMatchCorrectAnswer('september', '["September","september"]'), true);
});
test('listening grading trims whitespace around student answer', () => {
    assert.equal(doesAnswerMatchCorrectAnswer(' September ', '["September"]'), true);
});
test('listening grading rejects wrong answer', () => {
    assert.equal(doesAnswerMatchCorrectAnswer('october', '["September","september"]'), false);
});
test('listening grading rejects empty answer', () => {
    assert.equal(doesAnswerMatchCorrectAnswer('   ', '["September","september"]'), false);
});
test('final QA listening keys accept recorded time variants, capitalization and numeric input without fuzzy matches', () => {
    const manifest = JSON.parse(readFileSync('docs/ielts/practice/final-qa-2026-10-16/revisions.json', 'utf8'));
    for (const material of manifest.materials.filter((m) => m.content.skill === 'listening')) {
        for (const question of material.content.questions) {
            for (const answer of question.key) {
                assert.equal(doesAnswerMatchCorrectAnswer(` ${answer.toUpperCase()} `, question.key), true);
                assert.equal(doesAnswerMatchCorrectAnswer(answer, JSON.stringify(question.key)), true);
                if (/^\d+$/.test(answer))
                    assert.equal(doesAnswerMatchCorrectAnswer(Number(answer), question.key), true);
            }
            assert.equal(doesAnswerMatchCorrectAnswer('definitelyincorrect', question.key), false);
            assert.equal(doesAnswerMatchCorrectAnswer('', question.key), false);
        }
    }
});
