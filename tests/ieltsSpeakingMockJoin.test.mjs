import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
// Diagnostic Bible 2.7.0 section 10.12: the server joins mock answers into one interview-format clip per part.
const load = async (entry) => {
  const out = (await build({ entryPoints: [entry], bundle: true, format: "esm", write: false, logLevel: "silent" })).outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(out).toString("base64"));
};
const j = await load("supabase/functions/_shared/ieltsSpeakingMockJoin.ts");
const { inspectSpeakingWav } = await load("supabase/functions/_shared/ieltsSpeakingAudio.ts");

/** A real 16 kHz mono WAV of the given length, filled with a value so we can find it again. */
function wav(seconds, value) {
  const n = Math.round(seconds * 16000);
  const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (p, s) => [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, value, true);
  return b;
}
const lines = [
  { key: "p1.q1", position: 4, part: 1, kind: "question", answer_seconds: 30 },
  { key: "p1.q2", position: 5, part: 1, kind: "question", answer_seconds: 30 },
  { key: "p1.intro", position: 3, part: 1, kind: "say", answer_seconds: null },
  { key: "p2.start", position: 9, part: 2, kind: "long_turn", answer_seconds: 120 },
];
const a = (line_key, part, extra = {}) => ({ id: line_key, line_key, part, uploaded: true, missing: false, verified: false, file_deleted: false, ...extra });

test("a part is joined only when every answer is uploaded or marked missing", () => {
  assert.deepEqual(j.partPlan(lines, [a("p1.q1", 1)], 1).waiting, ["p1.q2"]);
  assert.equal(j.partPlan(lines, [a("p1.q1", 1), a("p1.q2", 1, { uploaded: false })], 1).ready, false, "begun but not uploaded");
  const plan = j.partPlan(lines, [a("p1.q2", 1), a("p1.q1", 1, { uploaded: false, missing: true })], 1);
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.withAudio.map((x) => x.line.key), ["p1.q2"], "a lost answer is left out, not invented");
  const none = j.partPlan(lines, [a("p1.q1", 1, { uploaded: false, missing: true }), a("p1.q2", 1, { uploaded: false, missing: true })], 1);
  assert.equal(none.ready, false);
  assert.equal(none.noAudio, true);
});

test("answers are joined in line order with silence between them, in the interview clip format", () => {
  const one = j.answerPcm(wav(2, 1000), 30), two = j.answerPcm(wav(3, -2000), 30);
  const clip = j.joinAnswers([{ line_key: "p1.q1", pcm: one.pcm }, { line_key: "p1.q2", pcm: two.pcm }]);
  assert.equal(inspectSpeakingWav(clip.bytes).duration, 2 + 0.8 + 3);
  assert.deepEqual(clip.segments, [{ line_key: "p1.q1", start: 0, end: 2 }, { line_key: "p1.q2", start: 2.8, end: 5.8 }]);
  const v = new DataView(clip.bytes);
  assert.equal(v.getInt16(44 + 16000 * 2 * 1, true), 1000, "first answer");
  assert.equal(v.getInt16(44 + Math.round(16000 * 2.4) * 2, true), 0, "silence");
  assert.equal(v.getInt16(44 + 16000 * 4 * 2, true), -2000, "second answer");
});

test("audio longer than the time limit is cut at the limit; broken files are refused", () => {
  const long = j.answerPcm(wav(125, 7), 120);
  assert.equal(long.duration, 120);
  assert.equal(long.original, 125);
  const bad = wav(1, 1);
  new DataView(bad).setUint32(24, 44100, true);
  assert.throws(() => j.answerPcm(bad, 30), /invalid_recording/);
  assert.throws(() => j.joinAnswers([]), /no_audio/);
  const big = j.answerPcm(wav(120, 1), 120).pcm;
  assert.throws(() => j.joinAnswers([big, big, big, big].map((pcm, i) => ({ line_key: `k${i}`, pcm }))), /part_too_long/);
});

test("the clip id is stable per sitting and part, so a retry writes the same file", async () => {
  const s = "00000000-0000-0000-0000-000000000400";
  assert.equal(await j.partClipId(s, 1), await j.partClipId(s, 1));
  assert.notEqual(await j.partClipId(s, 1), await j.partClipId(s, 2));
  assert.match(await j.partClipId(s, 3), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("the join step uses the existing pipeline and never transcribes", () => {
  const fn = readFileSync("supabase/functions/ielts_speaking_mock_join/index.ts", "utf8");
  for (const call of ["rpc_ielts_speaking_mock_verify_answer", "rpc_ielts_speaking_mock_attach_part", "rpc_ielts_speaking_mock_answer_file_deleted", "rpc_ielts_speaking_mock_submit", "rpc_ielts_speaking_session"])
    assert.ok(fn.includes(call), call);
  assert.ok(!/SpeechToText|scribe|elevenlabs|openai|anthropic/i.test(fn), "no transcription or AI here");
  assert.ok(fn.includes('"ielts-speaking-pilot"'), "joined parts are stored with interview clips");
  assert.match(readFileSync("supabase/config.toml", "utf8"), /\[functions\.ielts_speaking_mock_join\]\nverify_jwt = true/);
});
