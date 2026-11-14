import test from "node:test";
import assert from "node:assert/strict";
import { build } from 'esbuild';
const load = async (contents) => {
  const out = (await build({ stdin: { contents, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
    define: { 'import.meta.env': '{}' }, banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(process.cwd() + '/');" },
    plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })); } }] })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
};
const { cleanWritingHighlights, locateQuote, taskEstimate, writingHighlightInstructions, taskKeys, validatePracticeFeedback, practiceFeedbackInstructions, validateWritingAiOutput } = await load("export { cleanWritingHighlights, locateQuote, taskEstimate, writingHighlightInstructions } from './supabase/functions/_shared/ieltsWritingHighlights';\nexport { taskKeys, validatePracticeFeedback, practiceFeedbackInstructions } from './supabase/functions/_shared/ieltsPracticeFeedback';\nexport { validateWritingAiOutput } from './supabase/functions/_shared/ieltsWritingAiDraft';");
const essay = "Nowadays many peoples is using phones in class.\n\nIn my opinion, technology is a powerful tool. However, students can be distracted easily.";
test("highlights keep only quotes found in the essay, with code-point offsets and a correction for fixes", () => {
  const out = cleanWritingHighlights([
    { criterion: "grammar_range_accuracy", kind: "fix", quote: "peoples is", note: "People is already plural.", correction: "people are" },
    { criterion: "lexical_resource", kind: "strength", quote: "a powerful tool", note: "Good, natural phrase.", correction: "should be dropped" },
    { criterion: "coherence_cohesion", kind: "strength", quote: "However,", note: "Clear contrast word.", correction: null },
    { criterion: "lexical_resource", kind: "fix", quote: "phones are banned", note: "Not in the essay.", correction: "x" },
    { criterion: "fluency_coherence", kind: "fix", quote: "Nowadays", note: "Speaking criterion.", correction: null },
    { criterion: "task_response", kind: "fix", quote: "peoples is using", note: "Overlaps an earlier highlight.", correction: "people are using" },
    { criterion: "grammar_range_accuracy", kind: "fix", quote: "can be distracted", note: "Your overall band is 6.", correction: "x" }
  ], essay, 2);
  assert.equal(out.length, 3);
  const fix = out.find((h) => h.quote === "peoples is");
  assert.equal(fix.correction, "people are");
  assert.equal(Array.from(essay).slice(fix.start_char, fix.end_char).join(""), "peoples is");
  assert.equal(out.find((h) => h.quote === "a powerful tool").correction, null, "strengths never carry a correction");
  assert.deepEqual(out.map((h) => h.start_char), out.map((h) => h.start_char).slice().sort((a, b) => a - b));
  assert.deepEqual(cleanWritingHighlights("nope", essay, 2), []);
});
test("task 1 uses Task Achievement; a correction identical to the quote is dropped", () => {
  const out = cleanWritingHighlights([
    { criterion: "task_response", kind: "fix", quote: "In my opinion", note: "Task 1 has no opinion.", correction: null },
    { criterion: "task_achievement", kind: "fix", quote: "In my opinion", note: "Task 1 reports data, not opinions.", correction: "in my opinion" }
  ], essay, 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].criterion, "task_achievement");
  assert.equal(out[0].correction, null);
});
test("quotes are found case- and spacing-tolerantly but always keep the essay text", () => {
  const found = locateQuote(essay, "nowadays  MANY peoples");
  assert.equal(found?.text, "Nowadays many peoples");
});
test("estimated task band is the rounded mean of the four range midpoints, and needs all four", () => {
  const r = (low) => ({ indication: { low, high: low + 1 } });
  assert.deepEqual(taskEstimate({ task_response: r(5.5), coherence_cohesion: r(5.5), lexical_resource: r(6), grammar_range_accuracy: r(5) }, 2), { band: 6, low: 5.5, high: 6.5 });
  assert.deepEqual(taskEstimate({ task_achievement: r(5.5), coherence_cohesion: r(6), lexical_resource: r(6), grammar_range_accuracy: r(6) }, 1), { band: 6.5, low: 6, high: 7 });
  assert.equal(taskEstimate({ task_response: r(5.5), coherence_cohesion: r(5.5), lexical_resource: r(5.5), grammar_range_accuracy: r(6.5) }, 2)?.band, 6.5);
  assert.equal(taskEstimate({ task_response: { indication: null }, coherence_cohesion: r(5), lexical_resource: r(5), grammar_range_accuracy: r(5) }, 2), null);
  assert.deepEqual(taskEstimate({ task_response: r(8), coherence_cohesion: r(8), lexical_resource: r(8), grammar_range_accuracy: r(8) }, 2), { band: 8.5, low: 8, high: 9 });
});
test("practice feedback carries highlights and the estimate; bad highlights never fail the feedback", () => {
  const criteria = Object.fromEntries(taskKeys(2).map((k) => [k, { comment: "Your idea is clear. Explain your example in more detail.", action: "Add one example about class phones.", quotes: ["technology is a powerful tool"], low: 5.5, high: 6.5 }]));
  const ctx = { task_number: 2, prompt: "Discuss.", essay, word_count: 22 };
  const f = validatePracticeFeedback({ criteria, next_step: "Fix the verb after people. Then check every plural.", highlights: [
    { criterion: "grammar_range_accuracy", kind: "fix", quote: "peoples is", note: "Use the plural verb.", correction: "people are" },
    42,
    null
  ] }, ctx);
  assert.equal(f.highlights.length, 1);
  assert.equal(f.estimate?.band, 6);
  assert.match(practiceFeedbackInstructions(2), /correction/);
  assert.match(writingHighlightInstructions(1), /task_achievement/);
});
test("screener teacher draft (v2) adds highlights but still gives no band", () => {
  const observations = Object.fromEntries(["task_response", "coherence_cohesion", "lexical_resource", "grammar_range_accuracy"].map((k) => [k, { status: "developing", comment: "Your opinion is clear. Explain one reason in more detail.", quotes: ["technology is a powerful tool"] }]));
  const ctx = { response_text: essay, prompt: "Discuss.", word_count: 22, response_state: "answered", incident_count: 0, rubric_snapshot: {} };
  const out = validateWritingAiOutput({ observations, next_step: "Add one example. Check it supports your reason.", highlights: [
    { criterion: "grammar_range_accuracy", kind: "fix", quote: "peoples is", note: "Use the plural verb.", correction: "people are" }
  ] }, ctx);
  assert.equal(out.highlights.length, 1);
  assert.equal("estimate" in out, false);
  const blank = validateWritingAiOutput({ observations: Object.fromEntries(Object.keys(observations).map((k) => [k, { status: "insufficient_evidence", comment: "There is not enough writing to judge this yet.", quotes: [] }])), next_step: "Write a full essay next time.", highlights: [] }, { ...ctx, response_state: "blank" });
  assert.deepEqual(blank.highlights, []);
});
