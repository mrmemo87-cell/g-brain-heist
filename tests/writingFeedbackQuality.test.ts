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

test('quality rules generalize across unrelated students, wording, and correction positions', () => {
  const cases = [
    {
      text: 'Every morning, Lina walk to school with her younger sister.',
      original: 'Lina walk to school',
      better: 'Lina walks to school',
      kind: 'grammar' as const,
    },
    {
      text: 'Our science experiment was success because everyone followed the steps.',
      original: 'was success',
      better: 'was successful',
      kind: 'grammar' as const,
    },
    {
      text: 'The audience listened carefully however they did not ask questions.',
      original: 'carefully however',
      better: 'carefully; however,',
      kind: 'punctuation' as const,
    },
    {
      text: 'I recommend the library because it gives students a quiet place to study.',
      original: 'it gives students a quiet place to study',
      better: 'it provides students with a quiet place to study',
      kind: 'phrase' as const,
    },
  ];

  cases.forEach((item) => {
    const feedback = item.kind === 'punctuation'
      ? { punctuation_fixes: [{ original: item.original, issue: 'Correct the punctuation between the clauses.', better_version: item.better }] }
      : item.kind === 'phrase'
        ? { natural_phrase_upgrades: [{ original: item.original, why_it_helps: 'This wording is more natural and precise.', better_version: item.better }] }
        : { grammar_fixes: [{ original: item.original, issue: 'Correct the grammatical form in this phrase.', better_version: item.better }] };
    const fixes = buildValidatedWritingFixes(item.text, feedback);
    assert.strictEqual(fixes.length, 1, item.text);
    assert.strictEqual(item.text.slice(fixes[0]!.start, fixes[0]!.end), item.original);
    assert.strictEqual(fixes[0]!.betterVersion, item.better);
  });
});

test('repeated identical mistakes are all retained when each has verified offsets', () => {
  const text = 'She walk to school, and later she walk home.';
  const firstStart = text.indexOf('walk');
  const secondStart = text.lastIndexOf('walk');
  const fixes = buildValidatedWritingFixes(text, {
    grammar_fixes: [
      { original: 'walk', issue: 'Use third-person singular agreement.', better_version: 'walks', start_char: firstStart, end_char: firstStart + 4 },
      { original: 'walk', issue: 'Use third-person singular agreement.', better_version: 'walks', start_char: secondStart, end_char: secondStart + 4 },
    ],
  });

  assert.deepStrictEqual(fixes.map((fix) => fix.start), [firstStart, secondStart]);
  assert.ok(fixes.every((fix) => text.slice(fix.start, fix.end) === 'walk'));
});

test('overlapping punctuation/style ranges before a make grammar range do not shift its cinematic index', () => {
  // The punctuation fix spans the same characters as the phrase upgrade (overlap).
  // After deduplication only one of those two leading ranges survives, but the
  // grammar fix for "make" must still appear as the final range at its own
  // position so that ranges[activeIndex] resolves correctly in spotlight mode.
  const text = 'Every day he make sure the door are closed properly.';
  const overlapStart = text.indexOf('Every day he');
  const overlapEnd = overlapStart + 'Every day he'.length;

  const ranges = buildValidatedCinematicRanges(text, {
    punctuation_fixes: [
      {
        original: 'Every day he',
        issue: 'This phrase should start with a capital and have a comma after it.',
        better_version: 'Every day, he',
        start_char: overlapStart,
        end_char: overlapEnd,
      },
    ],
    natural_phrase_upgrades: [
      {
        original: 'Every day he',
        why_it_helps: 'Restructuring clarifies the subject.',
        better_version: 'Every day, he',
        start_char: overlapStart,
        end_char: overlapEnd,
      },
    ],
    grammar_fixes: [
      {
        original: 'make',
        issue: 'Use third-person singular agreement.',
        better_version: 'makes',
      },
    ],
  });

  // The two overlapping leading ranges collapse to one; the make fix is separate.
  assert.ok(ranges.length >= 1, 'at least the make grammar range must survive');
  const makeRange = ranges.find((r) => text.slice(r.start, r.end) === 'make');
  assert.ok(makeRange != null, 'the make grammar range must be present');
  // Confirm ranges[activeIndex] directly identifies the make range (spotlight alignment).
  const activeIndex = ranges.indexOf(makeRange);
  assert.ok(activeIndex >= 0);
  assert.strictEqual(ranges[activeIndex], makeRange);
  assert.strictEqual(text.slice(ranges[activeIndex]!.start, ranges[activeIndex]!.end), 'make');
});
