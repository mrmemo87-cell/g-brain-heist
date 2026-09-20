import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const edgeFunction = readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
test('PDF generation pipeline balances AI-created MCQ answer positions after normalization', () => {
    assert.match(edgeFunction, /balanceGeneratedMultipleChoiceOptions/);
    assert.match(edgeFunction, /hasBalancedGeneratedMultipleChoiceAnswers/);
    assert.match(edgeFunction, /generated_mcq_answer_position_balance_failed/);
    assert.match(edgeFunction, /questions: balancedQuestions/);
    assert.match(edgeFunction, /do not use a fixed correct-answer position/);
});
