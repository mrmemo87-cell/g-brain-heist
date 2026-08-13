import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCanonicalCorrections,
  reconcileCanonicalCorrections,
  type CanonicalCorrection,
} from '../supabase/functions/bh_writing_ai/canonical_corrections.js';

const correction = (
  source: string,
  original: string,
  better: string,
  category: CanonicalCorrection['category'] = 'grammar',
): CanonicalCorrection => {
  const start = source.indexOf(original);
  return {
    category,
    original,
    better_version: better,
    explanation: 'Objective correction.',
    start_char: start,
    end_char: start + original.length,
    weakness_tag: category === 'punctuation' ? 'punctuation_error' : 'agreement_error',
  };
};

test('canonical reconciliation rejects hallucinated spans and exact duplicates', () => {
  const source = 'The rules says students must stay.';
  const valid = correction(source, 'says', 'say');
  const hallucinated = { ...valid, original: 'rulez' };
  assert.deepEqual(reconcileCanonicalCorrections([valid, valid, hallucinated], source), [valid]);
});

test('canonical reconciliation keeps one deterministic rewrite for overlapping proposals', () => {
  const source = 'Amir made a quick decision he ran home.';
  const broad = correction(source, 'decision he ran', 'decision, and he ran', 'sentence_structure');
  const narrow = correction(source, 'decision', 'decision,', 'punctuation');
  assert.deepEqual(reconcileCanonicalCorrections([narrow, broad], source), [broad]);
});

test('canonical corrections are applied right-to-left without shifting later offsets', () => {
  const source = 'The rules says Amir were ready.';
  const canonical = reconcileCanonicalCorrections([
    correction(source, 'says', 'say'),
    correction(source, 'were', 'was'),
  ], source);
  assert.equal(applyCanonicalCorrections(source, canonical), 'The rules say Amir was ready.');
});

test('canonical reconciliation rejects no-op rewrites', () => {
  const source = 'Amir was ready.';
  assert.deepEqual(reconcileCanonicalCorrections([
    correction(source, 'ready', ' ready '),
  ], source), []);
});

test('canonical reconciliation safely repairs a wrong model offset for a unique verbatim span', () => {
  const source = 'The rules says students must stay.';
  const valid = correction(source, 'says', 'say');
  const wrongOffset = { ...valid, start_char: 0, end_char: 4 };
  assert.deepEqual(reconcileCanonicalCorrections([wrongOffset], source), [valid]);
});

test('canonical reconciliation rejects offset recovery when the original span is ambiguous', () => {
  const source = 'He run and they run.';
  const ambiguous = {
    ...correction(source, 'run', 'runs'),
    start_char: 999,
    end_char: 1002,
  };
  assert.deepEqual(reconcileCanonicalCorrections([ambiguous], source), []);
});

test('canonical reconciliation recovers a verifier correction with wrong offsets when its text is unique', () => {
  const source = 'Amir waited. she brought the project.';
  const capitalization = {
    ...correction(source, 'she brought the project.', 'She brought the project.', 'capitalization'),
    start_char: 999,
    end_char: 999 + 'she brought the project.'.length,
  };
  const canonical = reconcileCanonicalCorrections([capitalization], source);
  assert.equal(canonical.length, 1);
  assert.equal(applyCanonicalCorrections(source, canonical), 'Amir waited. She brought the project.');
});

test('canonical reconciliation keeps a complete sentence-boundary repair over a comma-only overlap', () => {
  const source = 'Amir made a quick decision he ran home.';
  const invalidCommaOnly = correction(source, 'decision he ran', 'decision, he ran', 'punctuation');
  const completeBoundaryRepair = correction(source, 'decision he ran', 'decision: he ran', 'sentence_structure');
  const canonical = reconcileCanonicalCorrections([invalidCommaOnly, completeBoundaryRepair], source);
  assert.deepEqual(canonical, [completeBoundaryRepair]);
  assert.equal(applyCanonicalCorrections(source, canonical), 'Amir made a quick decision: he ran home.');
});
