import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const load = async (entry) => {
  const out = (await build({ entryPoints: [entry], bundle: true, format: 'esm', write: false, logLevel: 'silent' })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
};
// Diagnostic Bible 2.5.0 section 10.10: teacher-only AI band estimates that lean cautious, never optimistic.
const { finalizeEstimates, floorHalf, wordCount, ESTIMATE_INSTRUCTIONS, PRONUNCIATION_ESTIMATE_INSTRUCTIONS, ESTIMATE_VERSION } =
  await load('supabase/functions/_shared/ieltsSpeakingEstimate.ts');
const lang = (fc, lr, gr, p1, p2, p3) => ({
  fluency_coherence: { band: fc, reason: 'Answers were short.' }, lexical_resource: { band: lr, reason: 'Repeats "good".' },
  grammar_range_accuracy: { band: gr, reason: 'Frequent tense errors.' }, part_1: p1, part_2: p2, part_3: p3,
});
const plenty = { 1: 120, 2: 180, 3: 200 };

test('every value snaps DOWN to a half band and stays on the 0-9 scale', () => {
  assert.equal(floorHalf(5.9), 5.5);
  assert.equal(floorHalf(6.25), 6);
  assert.equal(floorHalf(6.5), 6.5);
  assert.equal(floorHalf(12), 9);
  assert.equal(floorHalf(-1), 0);
  assert.equal(floorHalf('6'), null);
  assert.equal(floorHalf(Number.NaN), null);
});

test('overall is the mean of the four criteria rounded down; Parts never exceed it by more than half a band', () => {
  const e = finalizeEstimates(lang(6, 6, 5.5, 7, 6, 5.5), { band: 5.5, reason: 'Some stress errors.' }, plenty);
  assert.equal(e.version, ESTIMATE_VERSION);
  assert.equal(e.bands.overall, 5.5, 'mean 5.75 rounds down to 5.5');
  assert.equal(e.bands.part_1, 6, 'Part 1 capped at overall + 0.5');
  assert.equal(e.bands.part_3, 5.5);
  assert.equal(e.reasons.pronunciation, 'Some stress errors.');
});

test('no pronunciation from audio means no overall estimate', () => {
  const e = finalizeEstimates(lang(6, 6, 6, 6, 6, 6), null, plenty);
  assert.equal(e.bands.pronunciation, null);
  assert.equal(e.bands.overall, null);
  assert.equal(e.bands.part_2, 6);
});

test('thin evidence caps every estimate; a near-silent part cannot exceed 4.0', () => {
  const thin = finalizeEstimates(lang(7, 7, 7, 7, 7, 7), { band: 7 }, { 1: 40, 2: 40, 3: 30 });
  assert.ok(Object.values(thin.bands).every((v) => v === null || v <= 4.5));
  assert.match(thin.basis, /capped at 4\.5/);
  const silentPart = finalizeEstimates(lang(6, 6, 6, 6, 6, 6), { band: 6 }, { 1: 150, 2: 10, 3: 150 });
  assert.equal(silentPart.bands.part_2, 4);
});

test('garbage from the model never becomes a band', () => {
  const e = finalizeEstimates({ fluency_coherence: { band: 'seven' }, part_1: '6' }, { band: null }, plenty);
  assert.ok(Object.values(e.bands).every((v) => v === null));
  assert.equal(wordCount('I like | it is good'), 5);
});

test('prompts lean cautious and keep pronunciation to audio', () => {
  assert.match(ESTIMATE_INSTRUCTIONS, /choose the LOWER band/);
  assert.match(ESTIMATE_INSTRUCTIONS, /Never raise Fluency and Coherence because the text reads smoothly/);
  assert.match(ESTIMATE_INSTRUCTIONS, /Pronunciation is not your job/);
  assert.match(PRONUNCIATION_ESTIMATE_INSTRUCTIONS, /choose the LOWER one/);
  assert.match(PRONUNCIATION_ESTIMATE_INSTRUCTIONS, /never mention nationality/);
});
