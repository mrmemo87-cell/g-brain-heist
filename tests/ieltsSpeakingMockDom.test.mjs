import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
// Diagnostic Bible 2.7.0 section 10.12; Visual & UX Bible 13.11: the student's Speaking practice mock.
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const load = async (entry) => {
  const out = (await build({ entryPoints: [entry], bundle: true, format: "esm", write: false, logLevel: "silent" })).outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(out).toString("base64"));
};
const flow = await load("src/lib/speakingMockFlow.ts");

const L = (key, position, part, kind, answer_seconds = null, replay_allowed = false) =>
  ({ key, position, part, kind, answer_seconds, replay_allowed, replayed: false, audio_path: `${key}.mp3`, audio_seconds: 2 });
const lines = [
  L("sound", 1, 0, "sound_check"), L("intro", 2, 0, "say"), L("p1.intro", 3, 1, "say"),
  L("p1.q1", 4, 1, "question", 30, true), L("p1.q2", 5, 1, "question", 30, true), L("p1.q3", 6, 1, "question", 30, true),
  L("p2.intro", 7, 2, "say"), L("p2.prepare", 8, 2, "prepare"), L("p2.start", 9, 2, "long_turn", 120), L("p2.f1", 10, 2, "question", 20),
  L("p3.intro", 11, 3, "say"), L("p3.q1", 12, 3, "question", 45), L("p3.q2", 13, 3, "question", 45), L("p3.q3", 14, 3, "question", 45),
  L("end", 15, 4, "say"),
];
const A = (line_key, part) => ({ id: id(line_key.length), line_key, part, started_at: "2026-11-21T10:00:00Z", uploaded: true, missing: false, interrupted: false });
const sitting = (extra = {}) => ({
  session_id: id(400), status: "in_progress", server_now: "2026-11-21T10:00:00Z", title: "Speaking practice mock B",
  checks_passed: true, finished: false, preparation_started_at: null,
  cue_card: { topic: "Describe a place where you like to study.", points: ["where it is", "what it looks like", "why you like it"] },
  lines, answers: [], ...extra,
});

test("a mock continues from what the server recorded, hearing part introductions again", () => {
  assert.deepEqual(flow.resumePoint(sitting({ checks_passed: false })), { kind: "checks" });
  assert.deepEqual(flow.resumePoint(sitting()), { kind: "play", index: 1 }, "after the sound check");
  assert.deepEqual(flow.resumePoint(sitting({ answers: [A("p1.q1", 1)] })), { kind: "play", index: 4 }, "next question only");
  const p1 = ["p1.q1", "p1.q2", "p1.q3"].map((k) => A(k, 1));
  assert.deepEqual(flow.resumePoint(sitting({ answers: p1 })), { kind: "play", index: 6 }, "Part 2 introduction first");
  assert.deepEqual(flow.resumePoint(sitting({ answers: p1, preparation_started_at: "2026-11-21T09:59:30Z" })), { kind: "preparing", index: 7 },
    "back to the cue card; the minute keeps running");
  const p2 = [...p1, A("p2.start", 2), A("p2.f1", 2)];
  assert.deepEqual(flow.resumePoint(sitting({ answers: p2, preparation_started_at: "x" })), { kind: "play", index: 10 }, "Part 3 introduction");
  const all = [...p2, ...["p3.q1", "p3.q2", "p3.q3"].map((k) => A(k, 3))];
  assert.deepEqual(flow.resumePoint(sitting({ answers: all, preparation_started_at: "x" })), { kind: "closing", index: 14 });
  assert.deepEqual(flow.resumePoint(sitting({ finished: true })), { kind: "saving" });
  assert.deepEqual(flow.resumePoint(sitting({ status: "submitted" })), { kind: "done" });
});

test("parts end where the next line belongs to another part; the Part 2 minute uses the server clock", () => {
  assert.equal(flow.partEndingAt(lines, 5), 1);
  assert.equal(flow.partEndingAt(lines, 4), null);
  assert.equal(flow.partEndingAt(lines, 13), 3);
  assert.equal(flow.partEndingAt(lines, 1), null, "the introduction is not a part");
  const start = Date.parse("2026-11-21T10:00:00Z");
  assert.equal(flow.preparationLeft("2026-11-21T10:00:00Z", 0, start + 20000), 40);
  assert.equal(flow.preparationLeft("2026-11-21T10:00:00Z", 30000, start + 20000), 10, "a slow device clock cannot add time");
  assert.equal(flow.preparationLeft("2026-11-21T10:00:00Z", 0, start + 90000), 0);
  assert.equal(flow.clock(119.2), "2:00");
  assert.equal(flow.clock(5), "0:05");
});

test("room and microphone checks", () => {
  const quiet = new Float32Array(1000).fill(0.001), loud = new Float32Array(1000).fill(0.1);
  assert.equal(flow.roomVerdict(flow.levelDb(quiet).average), "quiet");
  assert.equal(flow.roomVerdict(flow.levelDb(loud).average), "noisy");
  assert.equal(flow.voiceVerdict(flow.levelDb(quiet).peak), "too_quiet");
  assert.equal(flow.voiceVerdict(flow.levelDb(loud).peak), "ok");
});

// ---- Rendered screens with a fake server ---------------------------------------------------
const fake = `
export class MockError extends Error { constructor(code, m) { super(m); this.code = code; } }
const s = () => window.__mock;
export const mockHome = async () => s().home;
export const mockSitting = async () => s().sitting;
export const startMock = async (...args) => { s().calls.push(["start", ...args]); return s().sitting; };
export const saveChecks = async (...a) => { s().calls.push(["checks", ...a]); s().sitting = { ...s().sitting, checks_passed: true }; return s().sitting; };
export const requestReplay = async (sid, key) => { s().calls.push(["replay", key]);
  s().sitting = { ...s().sitting, lines: s().sitting.lines.map((l) => l.key === key ? { ...l, replayed: true } : l) }; return s().sitting; };
export const startPreparation = async () => s().sitting;
export const beginAnswer = async (sid, key, aid) => { s().calls.push(["begin", key]);
  s().sitting = { ...s().sitting, answers: [...s().sitting.answers, { id: aid, line_key: key, part: 1, started_at: "x", uploaded: false, missing: false, interrupted: false }] }; return s().sitting; };
export const finishMock = async () => s().sitting;
export const requestJoin = async () => ({ submitted: true });
export const loadExaminerAudio = async (lines) => Object.fromEntries(lines.map((l) => [l.key, "blob:" + l.key]));
export const localAnswers = async () => [];
export const sendAnswer = async (a) => { s().calls.push(["send", a.lineKey, a.chunks.length > 0, a.complete]); return s().sitting; };
`;
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';
import Page from './src/pages/ielts/IeltsSpeakingMock';import Card from './src/components/ielts/SpeakingMockCard';
window.mount=()=>createRoot(document.getElementById('root')).render(React.createElement(RouterProvider,{router:createBrowserRouter([
 {path:'/ielts/speaking-mock/:assignmentId',element:React.createElement(Page)},{path:'/ielts/speaking-mock',element:React.createElement(Page)},
 {path:'/card',element:React.createElement(Card)}])}));`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true, format: "iife", write: false, logLevel: "silent", jsx: "automatic",
  define: { "import.meta.env.VITE_SUPABASE_URL": '"http://localhost"', "import.meta.env.VITE_SUPABASE_ANON_KEY": '"x"' },
  plugins: [{
    name: "fakes",
    setup(b) {
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
      b.onResolve({ filter: /ieltsSpeakingMockService$/ }, () => ({ path: "fake-mock", namespace: "fake" }));
      b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: "fake-supabase", namespace: "fake" }));
      b.onLoad({ filter: /fake-mock/, namespace: "fake" }, () => ({ contents: fake, loader: "js" }));
      b.onLoad({ filter: /fake-supabase/, namespace: "fake" }, () => ({ contents: "export const supabase={auth:{getUser:async()=>({data:{user:{id:'u1'}}})}};", loader: "js" }));
    },
  }],
});
// Values made inside the page come from another realm; compare them as plain data.
const plain = (v) => JSON.parse(JSON.stringify(v));
const wording = { version: "mock-recording-v1", body: "We will record your answers. Your teacher listens to them." };
async function mount(path, state) {
  const errors = [], vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" + path, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.__mock = { calls: [], ...state };
  w.crypto.randomUUID = () => id(999);
  w.Audio = function () { this.play = async () => { w.__played = (w.__played || []).concat(this.src); setTimeout(() => this.onended?.(), 1); }; };
  w.__level = 0.001;
  w.URL.createObjectURL = () => "blob:mic"; w.URL.revokeObjectURL = () => {};
  w.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
  w.AudioContext = class { createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData: (b) => b.fill(w.__level) }; } createMediaStreamSource() { return { connect() {} }; } async close() {} };
  w.MediaRecorder = class {
    constructor() { this.state = "inactive"; w.__recorders = (w.__recorders || 0) + 1; }
    start() { this.state = "recording"; setTimeout(() => this.ondataavailable?.({ data: new w.Blob(["x"]) }), 5); }
    pause() { this.state = "paused"; w.__paused = (w.__paused || 0) + 1; } resume() { this.state = "recording"; }
    stop() { this.state = "inactive"; setTimeout(() => this.onstop?.(), 1); }
  };
  w.eval(bundle.outputFiles[0].text);
  w.mount();
  const text = () => w.document.body.textContent;
  const wait = async (fn, tries = 100) => { for (let i = 0; i < tries; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 15)); } throw Error("UI did not settle: " + text() + " " + errors.join(",")); };
  const click = (label) => { const b = [...w.document.querySelectorAll("button")].find((x) => x.textContent.trim() === label); assert.ok(b, `button ${label} in: ${text()}`); b.click(); };
  return { dom, w, text, wait, click, errors };
}
const home = (extra = {}) => ({ available: true, recording_wording: wording, voice_wording: null,
  mocks: [{ assignment_id: id(300), title: "Speaking practice mock B", assigned_at: "2026-11-21T10:00:00Z", session_id: null, state: "ready" }], ...extra });

test("one action per screen: before you start, then the exact recording wording, then the test loads", async () => {
  const m = await mount(`/ielts/speaking-mock/${id(300)}`, { home: home(), sitting: sitting({ checks_passed: false }) });
  try {
    await m.wait(() => m.text().includes("Before you start"));
    for (const label of ["Speaking practice mock", "Recorded examiner", "Not an official IELTS test"]) assert.ok(m.text().includes(label), label);
    assert.equal(m.w.document.querySelectorAll("main button").length, 1, "one action");
    m.click("Next");
    await m.wait(() => m.text().includes(wording.body));
    m.click("I agree, continue");
    await m.wait(() => m.text().includes("Sound check"));
    assert.deepEqual(plain(m.w.__mock.calls[0]), ["start", id(300), id(999), "mock-recording-v1", null], "no voice question without the school's record");
    for (const l of lines) if (l.kind !== "sound_check") assert.ok(!m.text().includes(l.key));
    assert.deepEqual(m.errors, []);
  } finally { m.dom.window.close(); }
});

test("the voice-improvement question is its own screen with two equal answers, and No is sent as No", async () => {
  const voice = { version: "mock-voice-v1", body: "May Brains Heist use your recordings to make the app better?" };
  const m = await mount(`/ielts/speaking-mock/${id(300)}`, { home: home({ voice_wording: voice }), sitting: sitting({ checks_passed: false }) });
  try {
    await m.wait(() => m.text().includes("Before you start"));
    m.click("Next");
    await m.wait(() => m.text().includes("About the recording"));
    m.click("I agree, continue");
    await m.wait(() => m.text().includes(voice.body));
    assert.deepEqual([...m.w.document.querySelectorAll("main button")].map((b) => b.textContent), ["Yes", "No"]);
    m.click("No");
    await m.wait(() => m.text().includes("Sound check"));
    assert.deepEqual(plain(m.w.__mock.calls[0].slice(4)), [{ answer: false, wording: "mock-voice-v1" }]);
  } finally { m.dom.window.close(); }
});

test("a finished mock shows Done with no score, band or praise; the list explains each state", async () => {
  const done = await mount(`/ielts/speaking-mock/${id(300)}`, { home: home({ mocks: [{ ...home().mocks[0], session_id: id(400), state: "finished" }] }), sitting: sitting({ status: "submitted" }) });
  try {
    await done.wait(() => done.text().includes("Done"));
    assert.match(done.text(), /Your teacher will check them/);
    assert.doesNotMatch(done.text(), /band|score|great|excellent|well done|good job/i);
  } finally { done.dom.window.close(); }
  const list = await mount("/ielts/speaking-mock", { home: home({ mocks: [
    { ...home().mocks[0], state: "ready" },
    { assignment_id: id(301), title: "Older mock", assigned_at: "2026-11-01T10:00:00Z", session_id: id(401), state: "reviewed" },
  ] }) });
  try {
    await list.wait(() => list.text().includes("Speaking practice mocks"));
    assert.match(list.text(), /Ready to start/);
    assert.match(list.text(), /Checked by your teacher/);
  } finally { list.dom.window.close(); }
});

test("the Journey card appears only for an open mock", async () => {
  const none = await mount("/card", { home: home({ mocks: [] }) });
  try {
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(none.w.document.querySelector("#speaking-mock-heading"), null);
  } finally { none.dom.window.close(); }
  const open = await mount("/card", { home: home() });
  try {
    await open.wait(() => open.text().includes("Start the mock"));
    assert.match(open.text(), /Not an official IELTS test/);
  } finally { open.dom.window.close(); }
});

test("checks, then each question plays once, records by itself, allows one replay in Part 1, and moves on", async () => {
  const started = { ...home().mocks[0], session_id: id(400), state: "in_progress" };
  const m = await mount(`/ielts/speaking-mock/${id(300)}`, { home: home({ mocks: [started] }), sitting: sitting({ checks_passed: false }) });
  try {
    await m.wait(() => m.text().includes("Sound check"));
    m.click("I can hear it");
    await m.wait(() => m.text().includes("Is your room quiet?"));
    m.w.__level = 0.1;
    m.click("Start the check");
    await m.wait(() => m.text().includes("Too noisy"), 600);
    m.w.__level = 0.001;
    m.click("Check again");
    await m.wait(() => m.text().includes("quiet enough"), 600);
    m.click("Next");
    await m.wait(() => m.text().includes("Microphone check"));
    m.click("Record my voice");
    await m.wait(() => m.text().includes("could not hear you"), 600);
    m.w.__level = 0.1;
    m.click("Try again");
    await m.wait(() => m.text().includes("Sounds good"), 600);
    m.click("Sounds good — start the test");
    await m.wait(() => m.text().includes("Recording") && m.text().includes("0:"), 300);
    assert.deepEqual(plain(m.w.__mock.calls.map((c) => c[0])), ["checks", "begin"]);
    assert.equal(m.w.__mock.calls[1][1], "p1.q1", "the first question, after the introductions");
    assert.deepEqual(plain(m.w.__played.slice(-3)), ["blob:intro", "blob:p1.intro", "blob:p1.q1"]);
    assert.match(m.text(), /Part 1/);
    assert.equal(m.w.document.querySelector("button[disabled]")?.textContent, "I've finished", "no accidental finish in the first seconds");
    m.click("Hear the question again (once)");
    await m.wait(() => !m.text().includes("Hear the question again"));
    assert.equal(m.w.__paused, 1, "recording pauses while the question replays");
    await m.wait(() => !m.w.document.querySelector("button[disabled]"), 300);
    m.click("I've finished");
    await m.wait(() => m.w.__mock.calls.filter((c) => c[0] === "begin").length === 2, 300);
    assert.equal(m.w.__mock.calls.find((c) => c[0] === "begin" && c[1] === "p1.q2")[1], "p1.q2");
    await m.wait(() => m.w.__mock.calls.some((c) => c[0] === "send"), 300);
    assert.deepEqual(plain(m.w.__mock.calls.find((c) => c[0] === "send")), ["send", "p1.q1", true, true], "the answer is kept and sent");
    assert.match(m.text(), /Hear the question again/, "the next question has its own single replay");
    assert.doesNotMatch(m.text(), /great|excellent|well done|good job|band|score/i);
  } finally { m.dom.window.close(); }
});
