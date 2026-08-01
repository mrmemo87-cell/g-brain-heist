import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValidatedCinematicRanges, buildValidatedWritingFixes } from '../src/pages/writing/WritingHub.js';

const submission = [
  'Ahmed immediately realize that they have drifted away and took a wrong entrance to he city.',
  'Then we tried to call them but unluckily, there was no signals so Ahmed had to drive our mini van to lead us to their place.',
].join(' ');

test('feedback quality gate accepts grounded, local grammar corrections', () => {
  const fixes = buildValidatedWritingFixes(submission, {
    grammar_fixes: [
      {
        original: 'to he city',
        issue: 'The article is missing its first letter.',
        better_version: 'to the city',
      },
      {
        original: 'there was no signals',
        issue: 'Use a plural verb with plural signals.',
        better_version: 'there were no signals',
      },
    ],
  });

  assert.deepStrictEqual(fixes.map((fix) => fix.original), ['to he city', 'there was no signals']);
  assert.deepStrictEqual(fixes.map((fix) => fix.betterVersion), ['to the city', 'there were no signals']);
  fixes.forEach((fix) => assert.strictEqual(submission.slice(fix.start, fix.end), fix.original));
});

test('feedback quality gate rejects a neighbouring-sentence replacement', () => {
  const fixes = buildValidatedWritingFixes(submission, {
    natural_phrase_upgrades: [{
      original: 'unluckily, there was no signals',
      why_it_helps: 'This phrasing adds more action and clarity.',
      better_version: 'Ahmed took the wheel of our mini van to guide us back to them.',
    }],
  });

  assert.deepStrictEqual(fixes, []);
});

test('feedback quality gate rejects ambiguous, invented, unchanged, and non-punctuation fixes', () => {
  const repeated = `${submission} Then we tried to call them again.`;
  const fixes = buildValidatedWritingFixes(repeated, {
    grammar_fixes: [
      { original: 'Then we tried to call them', issue: 'Change this.', better_version: 'We telephoned them' },
      { original: 'words that were never submitted', issue: 'Invented evidence.', better_version: 'new words' },
      { original: 'to he city', issue: 'No actual correction.', better_version: 'to he city' },
    ],
    punctuation_fixes: [{
      original: 'there was no signals',
      issue: 'This is grammar, not punctuation.',
      better_version: 'there were no signals',
    }],
  });

  assert.deepStrictEqual(fixes, []);
});

test('feedback quality gate keeps punctuation-only transformations', () => {
  const fixes = buildValidatedWritingFixes('we arrived safely', {
    punctuation_fixes: [{
      original: 'we arrived safely',
      issue: 'Start the sentence with a capital and add a full stop.',
      better_version: 'We arrived safely.',
    }],
  });

  assert.strictEqual(fixes.length, 1);
  assert.strictEqual(fixes[0]?.kind, 'punctuation');
});

test('cinematic narrowing uses the correction bound to its evidence, never another raw fix', () => {
  const text = 'The van was out of sight. we looked around for it but to no avail. Then we took a wrong entrance to he city.';
  const ranges = buildValidatedCinematicRanges(text, {
    punctuation_fixes: [
      {
        original: 'The van was out of sight. we looked around for it but to no avail.',
        issue: 'This sentence needs a punctuation fix.',
        better_version: 'The van was out of sight. We looked around for it but to no avail.',
      },
      {
        original: 'we looked around for it',
        issue: 'Incorrect neighbouring rewrite.',
        better_version: 'Ahmed took the wheel of the van.',
      },
    ],
    grammar_fixes: [
      {
        original: 'entrance to he city',
        issue: 'Add the missing letter in the article.',
        better_version: 'entrance to the city',
      },
      { original: 'to', issue: 'Ambiguous raw fix.', better_version: 'the' },
    ],
  });

  assert.strictEqual(ranges.length, 2);
  const punctuation = ranges.find((range) => range.sourceFix?.kind === 'punctuation');
  const grammar = ranges.find((range) => range.sourceFix?.kind === 'grammar');
  assert.strictEqual(text.slice(punctuation!.start, punctuation!.end), 'w');
  assert.strictEqual(punctuation!.sourceFix?.original, 'The van was out of sight. we looked around for it but to no avail.');
  assert.strictEqual(text.slice(grammar!.start, grammar!.end), 'entrance to he city');
  assert.strictEqual(grammar!.sourceFix?.betterVersion, 'entrance to the city');
});
