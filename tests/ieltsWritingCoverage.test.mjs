import test from "node:test";
import assert from "node:assert/strict";
import { build } from 'esbuild';
// Diagnostic Bible 2.6.0 section 10.9: every error is marked — first AI pass without a "clearest problems" limit, a
// proofreading pass for what it left, and deterministic checks for the slips models miss.
// Regression for the 21 Nov 2026 screener draft: the first pass stopped at the 12-fix cap and missed spacing,
// capital-letter and spelling errors. The fixture below is written for this test and copies those error types.
const load = async (contents) => {
  const out = (await build({ stdin: { contents, loader: 'ts', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
};
const { mechanicalWritingHighlights, applyMechanicalFixes, completeWritingHighlights, cleanWritingHighlights, writingHighlightInstructions, writingProofreadInstructions, MAX_WRITING_HIGHLIGHTS } = await load(
  "export * from './supabase/functions/_shared/ieltsWritingMechanics';\nexport { completeWritingHighlights, cleanWritingHighlights, writingHighlightInstructions, writingProofreadInstructions, MAX_WRITING_HIGHLIGHTS } from './supabase/functions/_shared/ieltsWritingHighlights';");

const essay = "In the modern world,learning is important for the society.Somebody thinks that pupils should choose,but others disagree.this essay discusses both views.\n\nOn the one hand,Learning many subjects is neccessary for pupils'future.There is a saying  that interest is the best teacher.\n\nschool should balance them , and in 2025 about 3.5 million pupils, e.g. in Bishkek, Kyrgyzstan, use www.example.com daily. Few pupils take same exam.";
const at = (text, quote) => { const i = text.indexOf(quote); return { start_char: Array.from(text.slice(0, i)).length, end_char: Array.from(text.slice(0, i)).length + Array.from(quote).length }; };
const byQuote = (list) => Object.fromEntries(list.map((h) => [h.quote, h]));

test("deterministic checks find spacing, capital-letter, double-space and spelling slips with exact corrections", () => {
  const found = byQuote(mechanicalWritingHighlights(essay));
  const expect = {
    "world,learning": "world, learning",
    "society.Somebody": "society. Somebody",
    "choose,but": "choose, but",
    "disagree.this": "disagree. This",
    "hand,Learning": "hand, learning",
    "neccessary": "necessary",
    "pupils'future.There": "pupils' future. There",
    "saying  that": "saying that",
    "school": "School",
    "them ,": "them,",
  };
  for (const [quote, correction] of Object.entries(expect)) {
    assert.ok(found[quote], `missing: ${quote}`);
    assert.equal(found[quote].correction, correction, quote);
    assert.equal(found[quote].kind, "fix");
    assert.equal(Array.from(essay).slice(found[quote].start_char, found[quote].end_char).join(""), quote, "offsets are code points into the essay");
  }
  assert.equal(found["neccessary"].criterion, "lexical_resource");
  assert.equal(found["hand,Learning"].criterion, "grammar_range_accuracy");
});

test("deterministic checks leave numbers, abbreviations, names and web addresses alone", () => {
  const quotes = mechanicalWritingHighlights(essay).map((h) => h.quote).join(" | ");
  for (const safe of ["3.5", "e.g.", "Kyrgyzstan", "Bishkek", "www.example.com", "2025"]) assert.ok(!quotes.includes(safe), `false positive on ${safe}: ${quotes}`);
  assert.deepEqual(mechanicalWritingHighlights("Clean, correct writing. It has no slips, and I like it."), []);
  assert.equal(applyMechanicalFixes("The pupils' needs,so they learn.then"), "The pupils' needs, so they learn. Then");
  assert.equal(applyMechanicalFixes("education remains important,so"), "education remains important, so", "a mid-sentence correction keeps its small first letter");
});

test("the first pass is told to mark every error, and the proofreading pass looks only for what it left", () => {
  const first = writingHighlightInstructions(2);
  assert.match(first, /EVERY language problem/);
  assert.match(first, /do not stop after the most important problems/);
  assert.doesNotMatch(first, /up to 12|clearest problems/);
  const second = writingProofreadInstructions(2);
  assert.match(second, /already_marked/);
  assert.match(second, /take same exam/);
  assert.match(second, /Somebody thinks that/);
  assert.match(second, /never invent an error/i);
  assert.ok(MAX_WRITING_HIGHLIGHTS >= 60);
});

test("final list = first pass + non-overlapping proofreading fixes + every deterministic finding", () => {
  // A first pass that stopped at its old cap: 12 fixes and 1 strength that hides a missing space.
  const raw = [
    { criterion: "lexical_resource", kind: "fix", quote: "learning is important for the society", note: "No 'the' before society here.", correction: "learning is important for society" },
    { criterion: "coherence_cohesion", kind: "strength", quote: "the best teacher.\n\nschool should", note: "Good phrase.", correction: null },
  ];
  const first = cleanWritingHighlights(raw, essay, 2);
  assert.equal(first.length, 2);
  const proofread = [
    { criterion: "task_response", quote: "Somebody thinks that", note: "Use a general subject for a common view.", correction: "Some people think that" },
    { criterion: "grammar_range_accuracy", quote: "take same exam", note: "Use 'the' before 'same'.", correction: "take the same exam" },
    { criterion: "lexical_resource", quote: "Few pupils", note: "'Few' means almost none; you mean 'Some'.", correction: "Some pupils" },
    { criterion: "lexical_resource", quote: "important for the society", note: "Overlaps the first pass.", correction: "important for society" },
    { criterion: "grammar_range_accuracy", quote: "pupils should fly", note: "Not in the essay.", correction: "x" },
  ];
  const out = completeWritingHighlights(first, proofread, essay, 2);
  const q = byQuote(out);
  for (const quote of ["Somebody thinks that", "take same exam", "Few pupils", "neccessary", "school", "choose,but"]) assert.ok(q[quote], `missing ${quote}`);
  // Slips that touch an AI fix are carried in that fix's note instead of a second, overlapping highlight.
  for (const slip of ["world,learning", "society.Somebody"]) assert.ok(out.some((h) => h.note.includes(`"${slip}"`)), `slip not reported: ${slip}`);
  assert.equal(out.filter((h) => h.quote.includes("the society")).length, 1, "proofreading never overlaps the first pass");
  assert.ok(!out.some((h) => h.quote === "pupils should fly"), "invented quotes are dropped");
  assert.ok(!out.some((h) => h.kind === "strength" && h.quote.includes("school should")), "a strength that contains a mistake is removed");
  // "world,learning" overlaps the first AI fix but is outside its correction, so the fix note carries it too.
  const fix = out.find((h) => h.quote === "learning is important for the society");
  assert.ok(fix);
  assert.deepEqual(out.map((h) => h.start_char), out.map((h) => h.start_char).slice().sort((a, b) => a - b));
  for (const h of out) assert.equal(Array.from(essay).slice(h.start_char, h.end_char).join(""), h.quote);
  assert.ok(out.every((h) => h.note.length <= 500));
});

test("a deterministic slip inside an AI fix is merged into that fix, and AI corrections are cleaned", () => {
  const text = "However it ignores the hobbies,leading pupils to lose interest.";
  const first = [{ criterion: "grammar_range_accuracy", kind: "fix", quote: "However it ignores the hobbies,leading pupils", note: "Add a comma after 'However'.", correction: "However, it ignores their hobbies,leading pupils", ...at(text, "However it ignores the hobbies,leading pupils") }];
  const out = completeWritingHighlights(first, null, text, 2);
  assert.equal(out.length, 1, "covered by the AI fix: no second highlight");
  assert.equal(out[0].correction, "However, it ignores their hobbies, leading pupils", "the AI correction gets the missing space");
  const nullFix = [{ ...first[0], correction: null }];
  const merged = completeWritingHighlights(nullFix, [], text, 2);
  assert.equal(merged.length, 1);
  assert.match(merged[0].note, /Also: Put a space after the comma/);
});

test("a correct strength next to a slip is kept and the slip is narrowed to the words outside it", () => {
  const text = "On the one hand,letting students choose can raise their motivation.";
  const strength = "letting students choose can raise their motivation";
  const out = completeWritingHighlights([{ criterion: "lexical_resource", kind: "strength", quote: strength, note: "Clear, formal idea.", correction: null, ...at(text, strength) }], [], text, 2);
  const q = byQuote(out);
  assert.ok(q[strength], "the strength stays");
  assert.ok(q["hand,"], "the slip is still marked");
  assert.equal(q["hand,"].correction, null);
  assert.match(q["hand,"].note, /space after the comma/);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].start_char >= out[i - 1].end_char, "no overlaps");
});
