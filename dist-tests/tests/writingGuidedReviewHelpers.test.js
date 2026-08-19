import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeIssueExplanation, isMeaningfullyDifferent, normalizeForComparison, remapIssueType, validateIssueConsistency, } from '../src/pages/writing/WritingHub.js';
import { applyWritingGuidedReviewSpotlightSync } from '../vite.config.js';
test('normalizeForComparison and isMeaningfullyDifferent suppress fake rewrites', () => {
    const original = ' I am not good at math. ';
    const improved = 'i am   not good at   math .';
    assert.strictEqual(normalizeForComparison(original), 'i am not good at math.');
    assert.strictEqual(isMeaningfullyDifferent(original, improved), false);
});
test('validateIssueConsistency fails when explanation is unrelated to sentence', () => {
    const result = validateIssueConsistency({
        id: '1',
        kind: 'clarity',
        label: 'Make it clearer',
        originalSentence: 'I joined the science club to test my idea.',
        diagnosis: 'Remember to write a strong conclusion in paragraph four.',
        improvedSentence: null,
        whyThisIsStronger: 'This improves organization and transitions.',
        coachingNote: null,
        evidenceSpan: '0:12',
    });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'explanation_not_grounded_in_sentence');
});
test('remapIssueType downgrades grammar label when rewrite is not meaningful', () => {
    const remapped = remapIssueType({
        id: '2',
        kind: 'grammar',
        label: 'Grammar issue',
        originalSentence: 'She go to school every day.',
        diagnosis: 'Fix verb agreement.',
        improvedSentence: 'She go to school every day.',
        whyThisIsStronger: 'Better grammar.',
        coachingNote: null,
        evidenceSpan: '12:24',
    });
    assert.strictEqual(remapped.kind, 'clarity');
    assert.strictEqual(remapped.label, 'Clearer phrasing');
    assert.strictEqual(remapped.improvedSentence, null);
});
test('getSafeIssueExplanation replaces banned placeholder copy', () => {
    const issue = getSafeIssueExplanation({
        id: '3',
        kind: 'grammar',
        label: 'Grammar issue',
        originalSentence: 'I am not good in math.',
        diagnosis: 'This sentence needs a small grammar fix.',
        improvedSentence: 'I am not good at math.',
        whyThisIsStronger: 'Correct preposition.',
        coachingNote: null,
        evidenceSpan: '30:42',
    });
    assert.notStrictEqual(issue.diagnosis, 'This sentence needs a small grammar fix.');
    assert.strictEqual(issue.diagnosis, 'Replace "in" with "at" in the highlighted wording.');
});
test('Guided Review spotlight isolates the active range before overlap filtering can reindex it', () => {
    const source = `
    <div className="cinematic-feedback__essay">
      {renderAnnotatedText(activeCinematicText, cinematicRanges, cinematicIndex, handleRangeMount, true)}
    </div>
  `;
    const result = applyWritingGuidedReviewSpotlightSync(source);
    assert.strictEqual(result.changed, true);
    assert.match(result.code, /activeCinematicRange \? \[activeCinematicRange\] : \[\]/);
    assert.match(result.code, /activeCinematicRange \? 0 : null/);
    assert.match(result.code, /handleRangeMount\(cinematicIndex, element\)/);
    assert.doesNotMatch(result.code, /renderAnnotatedText\(activeCinematicText, cinematicRanges, cinematicIndex, handleRangeMount, true\)/);
});
