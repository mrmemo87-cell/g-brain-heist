import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGrammarFix, normalizeWeaknessTag } from '../src/lib/brains_heist/writingWeaknessTags';

const CANONICAL = new Set(['agreement_error', 'article_error', 'tense_error', 'punctuation_error', 'run_on', 'weak_word_choice', 'spelling_error']);

test('model labels outside the canonical list map to the right tag', () => {
  // Labels returned by bh_writing_ai (gpt-4o) on the demo essay, 19 Nov 2026.
  assert.equal(normalizeWeaknessTag('subject_verb_agreement', CANONICAL), 'agreement_error');
  assert.equal(normalizeWeaknessTag('missing_comma', CANONICAL), 'punctuation_error');
  assert.equal(normalizeWeaknessTag('Subject-Verb Agreement', CANONICAL), 'agreement_error');
  assert.equal(normalizeWeaknessTag('comma splice', CANONICAL), 'run_on');
  assert.equal(normalizeWeaknessTag('article_error', CANONICAL), 'article_error');
  assert.equal(normalizeWeaknessTag('something_new', CANONICAL), null);
  assert.equal(normalizeWeaknessTag(undefined, CANONICAL), null);
  assert.equal(normalizeWeaknessTag('  ', CANONICAL), null);
});

test('an agreement explanation is not reported as an article mistake', () => {
  const issue = "The verb 'look' should be in the third person singular form 'looks' to agree with the singular subject 'school.'".toLowerCase();
  assert.equal(classifyGrammarFix(issue, 'so our school look more beautiful.', 'so our school looks more beautiful.'), 'agreement_error');
});

test('the word "the" alone no longer means an article mistake', () => {
  assert.equal(classifyGrammarFix('use the plural form of the noun', 'two book', 'two books'), null);
  assert.equal(classifyGrammarFix('the word order is wrong in the question', 'why you are late', 'why are you late'), null);
});

test('real article mistakes are still found', () => {
  assert.equal(classifyGrammarFix('use the article "an" before a vowel sound', 'a apple', 'an apple'), 'article_error');
  assert.equal(classifyGrammarFix("add 'the' before the river name", 'near Thames', 'near the Thames'), 'article_error');
  assert.equal(classifyGrammarFix('missing article before the singular noun', 'it is big park', 'it is a big park'), 'article_error');
});

test('tense and agreement wording still classify as before', () => {
  assert.equal(classifyGrammarFix('use the past tense here', 'yesterday I go', 'yesterday I went'), 'tense_error');
  assert.equal(classifyGrammarFix('subject-verb agreement', 'he have', 'he has'), 'agreement_error');
});
