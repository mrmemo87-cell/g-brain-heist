import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceGeneratedMultipleChoiceOptions, generatedMultipleChoiceAnswerPositionCounts, hasBalancedGeneratedMultipleChoiceAnswers, } from '../supabase/functions/_shared/teacherQuestionOptionBalance.js';
const generatedMcq = (index, optionCount = 4) => {
    const options = Array.from({ length: optionCount }, (_, optionIndex) => optionIndex === 0 ? `Correct ${index}` : `Distractor ${index}-${optionIndex}`);
    return {
        question_type: 'multiple_choice',
        options,
        correct_answer: `Correct ${index}`,
        candidate_origin: 'ai_generated_from_source',
        question_text: `Generated question ${index}`,
    };
};
test('generated four-option MCQs are balanced across A/B/C/D without changing answers', () => {
    const original = Array.from({ length: 14 }, (_, index) => generatedMcq(index + 1));
    const balanced = balanceGeneratedMultipleChoiceOptions(original, 'silk-road-reference-seed');
    assert.equal(hasBalancedGeneratedMultipleChoiceAnswers(balanced), true);
    const counts = generatedMultipleChoiceAnswerPositionCounts(balanced).get(4);
    assert.ok(counts);
    assert.equal(counts.reduce((total, count) => total + count, 0), 14);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.deepEqual([...counts].sort((a, b) => a - b), [3, 3, 4, 4]);
    balanced.forEach((question, index) => {
        assert.equal(question.correct_answer, original[index].correct_answer);
        assert.ok(question.options.includes(question.correct_answer));
        assert.equal(new Set(question.options).size, question.options.length);
    });
    assert.deepEqual(original[0].options, [
        'Correct 1',
        'Distractor 1-1',
        'Distractor 1-2',
        'Distractor 1-3',
    ]);
});
test('balancing is deterministic for the same seed and avoids relying on AI option order', () => {
    const source = Array.from({ length: 12 }, (_, index) => generatedMcq(index + 1));
    const first = balanceGeneratedMultipleChoiceOptions(source, 'same-payload');
    const second = balanceGeneratedMultipleChoiceOptions(source, 'same-payload');
    assert.deepEqual(first.map((question) => question.options), second.map((question) => question.options));
    assert.equal(hasBalancedGeneratedMultipleChoiceAnswers(first), true);
});
test('extracted questions, true/false and short-answer items keep their original option order', () => {
    const questions = [
        {
            ...generatedMcq(1),
            candidate_origin: 'source_question',
            question_text: 'Extracted source MCQ',
        },
        {
            question_type: 'true_false',
            options: ['True', 'False'],
            correct_answer: 'True',
            candidate_origin: 'ai_generated_from_source',
            question_text: 'Generated true/false',
        },
        {
            question_type: 'short_answer',
            options: [],
            correct_answer: 'A short response',
            candidate_origin: 'ai_generated_from_source',
            question_text: 'Generated short answer',
        },
    ];
    const balanced = balanceGeneratedMultipleChoiceOptions(questions, 'preserve-non-generated-mcq');
    assert.deepEqual(balanced[0].options, questions[0].options);
    assert.deepEqual(balanced[1].options, ['True', 'False']);
    assert.deepEqual(balanced[2].options, []);
});
test('generated MCQs with different option counts are balanced independently', () => {
    const questions = [
        ...Array.from({ length: 8 }, (_, index) => generatedMcq(index + 1, 3)),
        ...Array.from({ length: 11 }, (_, index) => generatedMcq(index + 101, 5)),
    ];
    const balanced = balanceGeneratedMultipleChoiceOptions(questions, 'mixed-option-counts');
    const counts = generatedMultipleChoiceAnswerPositionCounts(balanced);
    assert.equal(hasBalancedGeneratedMultipleChoiceAnswers(balanced), true);
    assert.deepEqual([...(counts.get(3) ?? [])].sort((a, b) => a - b), [2, 3, 3]);
    assert.deepEqual([...(counts.get(5) ?? [])].sort((a, b) => a - b), [2, 2, 2, 2, 3]);
});
test('malformed generated MCQs are left unchanged for the existing human-attention path', () => {
    const malformed = {
        question_type: 'multiple_choice',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'Missing answer',
        candidate_origin: 'ai_generated_from_source',
        question_text: 'Malformed generated MCQ',
    };
    const [balanced] = balanceGeneratedMultipleChoiceOptions([malformed], 'malformed');
    assert.deepEqual(balanced.options, malformed.options);
    assert.equal(hasBalancedGeneratedMultipleChoiceAnswers([balanced]), true);
});
