import test from 'node:test';
import assert from 'node:assert/strict';
import { extractIeltsQuestions, getIeltsSectionInstructions, getIeltsSectionTitle, validateRenderableExamPayload, } from '../services/ieltsExamPayloadParser.js';
test('IELTS payload parser renders direct questions schema', () => {
    const payload = {
        title: 'Reading',
        instructions: 'Answer all questions.',
        questions: [
            { id: 'r1', prompt: 'Question one?', type: 'short_answer' },
            { id: 'r2', question: 'Question two?', choices: ['A', 'B'] },
        ],
    };
    assert.equal(getIeltsSectionTitle(payload, 'reading', 'Fallback'), 'Reading');
    assert.equal(getIeltsSectionInstructions(payload, 'reading'), 'Answer all questions.');
    assert.deepEqual(extractIeltsQuestions(payload, 'reading'), [
        { id: 'r1', prompt: 'Question one?', type: 'short_answer', options: undefined },
        { id: 'r2', prompt: 'Question two?', type: 'text', options: ['A', 'B'] },
    ]);
});
test('IELTS payload parser flattens tasks with nested questions', () => {
    const payload = {
        title: 'Reading Passage',
        tasks: [
            {
                id: 'passage-1',
                title: 'Passage 1',
                passage: 'A short passage.',
                questions: [
                    { id: 'r1', prompt: 'Find a detail.' },
                    { id: 'r2', prompt: 'Choose a heading.', options: ['A', 'B', 'C'] },
                ],
            },
        ],
    };
    const questions = extractIeltsQuestions(payload, 'reading');
    assert.equal(questions.length, 2);
    assert.equal(questions[0].id, 'r1');
    assert.match(questions[0].prompt, /^Passage 1 — A short passage\.: Find a detail\.$/);
    assert.deepEqual(questions[1].options, ['A', 'B', 'C']);
});
test('IELTS payload parser unwraps section and payload nesting fallbacks', () => {
    const wrapped = {
        reading: {
            payload: {
                items: [{ question_id: 'r1', text: 'Nested reading question?' }],
            },
        },
    };
    assert.deepEqual(extractIeltsQuestions(wrapped, 'reading'), [
        { id: 'r1', prompt: 'Nested reading question?', type: 'text', options: undefined },
    ]);
});
test('IELTS payload parser validates non-renderable empty payloads', () => {
    assert.deepEqual(validateRenderableExamPayload({}, 'writing'), {
        ok: false,
        questionCount: 0,
        message: 'Payload must include a non-empty questions/items/prompts array, tasks/parts/passages with nested questions, or a prompt/text/task string.',
    });
    assert.deepEqual(validateRenderableExamPayload({ task: 'Write an essay.' }, 'writing'), {
        ok: true,
        questionCount: 1,
    });
});
