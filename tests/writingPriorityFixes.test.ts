import test from 'node:test';
import assert from 'node:assert/strict';

import { describeFixPattern, selectPriorityWritingFixes } from '../src/lib/brains_heist/writingPriorityFixes.js';

const fix = (id: string, kind: 'grammar' | 'punctuation' | 'phrase' | 'style', start: number, weaknessTag?: string) => ({ id, kind, start, weaknessTag });

test('leads with one example from each of the most repeated mistake patterns', () => {
  const fixes = [
    fix('p1', 'punctuation', 5, 'punctuation_error'),
    fix('t1', 'grammar', 10, 'tense_error'),
    fix('t2', 'grammar', 40, 'tense_error'),
    fix('t3', 'grammar', 90, 'tense_error'),
    fix('a1', 'grammar', 20, 'article_error'),
    fix('a2', 'grammar', 60, 'article_error'),
    fix('w1', 'phrase', 30, 'weak_word_choice'),
  ];
  const { priority, rest } = selectPriorityWritingFixes(fixes, 3);
  assert.deepEqual(priority.map((item) => item.fix.id), ['t1', 'a1', 'p1']);
  assert.deepEqual(priority.map((item) => item.patternCount), [3, 2, 1]);
  assert.equal(priority[0]!.patternLabel, 'verb tense');
  assert.deepEqual(rest.map((item) => item.id), ['t2', 't3', 'a2', 'w1']);
});

test('prefers grammar over punctuation and phrasing when patterns are equally frequent', () => {
  const { priority } = selectPriorityWritingFixes([
    fix('w', 'phrase', 1, 'weak_word_choice'),
    fix('p', 'punctuation', 2, 'punctuation_error'),
    fix('g', 'grammar', 3, 'agreement_error'),
  ], 2);
  assert.deepEqual(priority.map((item) => item.fix.id), ['g', 'p']);
});

test('fills spare slots from the same pattern and never invents fixes', () => {
  const two = selectPriorityWritingFixes([fix('a', 'grammar', 9), fix('b', 'grammar', 2)], 3);
  assert.deepEqual(two.priority.map((item) => item.fix.id), ['b', 'a']);
  assert.equal(two.rest.length, 0);
  const none = selectPriorityWritingFixes([], 3);
  assert.deepEqual(none, { priority: [], rest: [] });
});

test('names patterns in plain words, including unknown tags and untagged fixes', () => {
  assert.equal(describeFixPattern(fix('x', 'grammar', 0, 'run_on')), 'sentences that run together');
  assert.equal(describeFixPattern(fix('x', 'grammar', 0, 'capitalisation_error')), 'capitalisation');
  assert.equal(describeFixPattern(fix('x', 'punctuation', 0)), 'punctuation and capital letters');
});
