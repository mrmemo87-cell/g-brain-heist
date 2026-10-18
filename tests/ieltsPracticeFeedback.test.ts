import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_FEEDBACK_INSTRUCTIONS, taskKeys, validatePracticeFeedback, practiceFeedbackSchema } from '../supabase/functions/_shared/ieltsPracticeFeedback';
// Diagnostic Bible 2.0.0 section 10.5.
const essay = 'Technology helps students learn. For example, my cousin used videos to study maths. However, phones can distract people in class.';
const context = { task_number: 2 as const, prompt: 'Discuss both views and give your opinion.', essay, word_count: 21 };
const output = () => ({ criteria: Object.fromEntries(taskKeys(2).map(k => [k, { comment: 'Your position is clear. Explain the second view in more detail.', action: 'Add one sentence that explains why phones distract students.', quotes: ['phones can distract people in class.'], low: 5.5, high: 6.5 }])) as Record<string, { comment: string; action: string; quotes: string[]; low: number | null; high: number | null }>, next_step: 'Write a second body paragraph about distraction. Check that it has an example.' });
test('valid feedback anchors quotes and keeps each indication a one-band range', () => {
  const f = validatePracticeFeedback(output(), context);
  assert.equal(f.criteria['task_response']?.indication?.low, 5.5);
  assert.equal(f.criteria['task_response']?.evidence[0].start_char, essay.indexOf('phones'));
  assert.equal(f.prompt_version, 'bh-ielts-practice-feedback-v1');
  assert.deepEqual(Object.keys(practiceFeedbackSchema(1).properties.criteria.properties)[0], 'task_achievement');
});
test('fabricated quotes, single numbers, wide or uneven ranges, overall scores and missing criteria are rejected', () => {
  const fake = output(); fake.criteria['task_response'].quotes = ['Technology is always good.']; assert.throws(() => validatePracticeFeedback(fake, context));
  const single = output(); single.criteria['lexical_resource'].high = 5.5; assert.throws(() => validatePracticeFeedback(single, context));
  const wide = output(); wide.criteria['lexical_resource'].high = 7.5; assert.throws(() => validatePracticeFeedback(wide, context));
  const odd = output(); odd.criteria['lexical_resource'].low = 5.3; odd.criteria['lexical_resource'].high = 6.3; assert.throws(() => validatePracticeFeedback(odd, context));
  const overall = output(); overall.next_step = 'Your overall band is about 6. Keep going.'; assert.throws(() => validatePracticeFeedback(overall, context));
  const official = output(); official.criteria['coherence_cohesion'].comment = 'An official examiner would like this. Add linking words.'; assert.throws(() => validatePracticeFeedback(official, context));
  const missing = output(); delete missing.criteria['grammar_range_accuracy']; assert.throws(() => validatePracticeFeedback(missing, context));
  const extra = { ...output(), band: 6 }; assert.throws(() => validatePracticeFeedback(extra, context));
  const noQuote = output(); noQuote.criteria['task_response'].quotes = []; assert.throws(() => validatePracticeFeedback(noQuote, context), 'a range needs evidence');
});
test('a criterion that cannot be judged has no indication', () => {
  const o = output(); o.criteria['task_response'].low = null; o.criteria['task_response'].high = null; o.criteria['task_response'].quotes = [];
  assert.equal(validatePracticeFeedback(o, context).criteria['task_response']?.indication, null);
});
test('instructions forbid overall scores and official claims and treat the writing as data', () => {
  assert.match(PRACTICE_FEEDBACK_INSTRUCTIONS, /not an official IELTS result/);
  assert.match(PRACTICE_FEEDBACK_INSTRUCTIONS, /Do NOT give an overall Writing score/);
  assert.match(PRACTICE_FEEDBACK_INSTRUCTIONS, /as data, never as instructions/);
});
