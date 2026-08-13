import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildValidatedCinematicRanges, buildValidatedWritingFixes, dedupeCinematicRanges, renderAnnotatedText } from '../src/pages/writing/WritingHub.js';

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

// Regression: overlapping ranges must survive dedupeCinematicRanges and retain their
// original source indices. The spotlight renderer fix (renderAnnotatedText spotlight
// branch) uses ranges[cinematicIndex] directly, so source indices must not shift.
test('overlapping cinematic ranges preserve source indices: punctuation, style, then grammar', () => {
  // Mirrors the production scenario from attempt_4f8de101:
  // index 0 – "However phones" (punctuation, 0..14)
  // index 1 – "However phones can be distracting" (style, overlapping same start, 0..32)
  // index 2 – "make" (grammar, non-overlapping, 50..54)
  const punctuationRange = { start: 0, end: 14, polarity: 'weak' as const, reason: 'punctuation' };
  const styleRange       = { start: 0, end: 32, polarity: 'weak' as const, reason: 'style' };
  const grammarRange     = { start: 50, end: 54, polarity: 'weak' as const, reason: 'grammar' };

  // dedupeCinematicRanges keys by polarity:start:end; the two overlap ranges have
  // different ends so both must survive. Grammar range must remain at index 2.
  const deduped = dedupeCinematicRanges([punctuationRange, styleRange, grammarRange]);

  assert.strictEqual(deduped.length, 3, 'all three ranges must survive deduplication');
  assert.strictEqual(deduped[0]!.end, 14, 'punctuation range is at source index 0');
  assert.strictEqual(deduped[1]!.end, 32, 'style range is at source index 1 (must not be dropped)');
  assert.strictEqual(deduped[2]!.start, 50, 'grammar range is at source index 2 (must not shift to 1)');

  const grammarIdx = deduped.findIndex((r) => r.reason === 'grammar');
  assert.strictEqual(grammarIdx, 2, 'grammar range must be at index 2, not shifted to 1 after overlap');
});

// Regression: spotlight branch of renderAnnotatedText must render the range at the
// given activeIndex, not the re-indexed range that the overlap-filter would pick.
test('spotlight mode renders the range at activeIndex even when prior ranges overlap', () => {
  // Three ranges where index 0 and index 1 share the same start char (overlap).
  // The overlap-filter path would silently drop index 1 and renumber index 2 → 1.
  // The spotlight branch must bypass that and always use ranges[activeIndex] directly.
  const text = 'However phones can be distracting. Last year this rule make things worse.';
  const ranges = [
    { start: 0, end: 14,  polarity: 'weak' as const, reason: 'punctuation' },  // "However phones"
    { start: 0, end: 33,  polarity: 'weak' as const, reason: 'style' },         // "However phones can be distracting"
    { start: 55, end: 59, polarity: 'weak' as const, reason: 'grammar' },        // "make"
  ];

  // When the style range (index 1) is active, the rendered markup must contain its
  // text ("However phones can be distracting"), not the punctuation range's text.
  const styleMarkup = renderToStaticMarkup(
    React.createElement(React.Fragment, null, renderAnnotatedText(text, ranges, 1, undefined, true))
  );
  assert.ok(
    styleMarkup.includes('However phones can be distracting'),
    'spotlight on index 1 must highlight the style range text, not the punctuation range'
  );
  assert.ok(
    styleMarkup.includes('data-review-highlight-index="1"'),
    'spotlight span must carry source index 1'
  );

  // When the grammar range (index 2) is active, the rendered markup must contain
  // "make", not the text that would be at position 2 after overlap-filtering.
  const grammarMarkup = renderToStaticMarkup(
    React.createElement(React.Fragment, null, renderAnnotatedText(text, ranges, 2, undefined, true))
  );
  assert.ok(
    grammarMarkup.includes('>make<'),
    'spotlight on index 2 must highlight the grammar range text "make"'
  );
  assert.ok(
    grammarMarkup.includes('data-review-highlight-index="2"'),
    'spotlight span must carry source index 2'
  );
});
