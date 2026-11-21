import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
// Diagnostic Bible 2.7.0 section 10.12; Visual & UX Bible 13.11: teacher and owner screens of the practice mock.
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const plain = (v) => JSON.parse(JSON.stringify(v));
const fake = `
export class MockError extends Error { constructor(code, m) { super(m); this.code = code; } }
const s = () => window.__mock;
const log = (name, args) => { s().calls.push([name, ...args]); };
export const mockCatalog = async () => s().catalog;
export const mockTeacherList = async () => s().rows;
export const assignMock = async (...a) => { log("assign", a); s().rows = [{ assignment_id: "${id(9)}", package_code: a[0], title: "Speaking practice mock B", assigned_at: "2026-11-21T10:00:00Z", assigned_by: "Teacher", cancelled_at: null, session_id: null, started_at: null, finished_at: null, status: null, reviewed: false, interrupted_answers: 0 }]; return { assigned: 1, script_version: 1 }; };
export const cancelMockAssignment = async (...a) => { log("cancel", a); s().rows = s().rows.map((r) => ({ ...r, cancelled_at: "2026-11-21T11:00:00Z" })); return { cancelled: true }; };
export const requestJoin = async (...a) => { log("join", a); return { submitted: true, blocked: null }; };
export const mockSegments = async () => s().segments;
export const ownerOverview = async () => s().overview;
export const ownerScript = async () => s().script;
export const reviewAudio = async (...a) => { log("review", a); return s().script; };
export const releaseScript = async (...a) => { log("release", a); return s().script; };
export const approveMockPackage = async (...a) => { log("approve", a); return {}; };
export const publishMock = async (...a) => { log("publish", a); return {}; };
export const examinerAudioUrl = async (p) => "https://audio.example/" + p;
`;
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';
import Panel from './src/components/ielts/SpeakingMockTeacherPanel';import Map from './src/components/ielts/SpeakingMockAnswerMap';import Studio from './src/pages/ielts/IeltsSpeakingMockStudio';
window.mount=()=>createRoot(document.getElementById('root')).render(React.createElement(RouterProvider,{router:createBrowserRouter([
 {path:'/panel',element:React.createElement(Panel,{studentId:'${id(1)}',studentName:'Aida'})},
 {path:'/map',element:React.createElement(Map,{sessionId:'${id(400)}'})},{path:'/studio',element:React.createElement(Studio)},
 {path:'/ielts/speaking-pilot/:id',element:React.createElement('p',null,'review page')}])}));`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, format: "iife", write: false, logLevel: "silent", jsx: "automatic",
  define: { "import.meta.env.VITE_SUPABASE_URL": '"http://localhost"', "import.meta.env.VITE_SUPABASE_ANON_KEY": '"x"' },
  plugins: [{ name: "fakes", setup(b) {
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    b.onResolve({ filter: /ieltsSpeakingMockService$/ }, () => ({ path: "fake-mock", namespace: "fake" }));
    b.onLoad({ filter: /fake-mock/, namespace: "fake" }, () => ({ contents: fake, loader: "js" }));
  } }],
});
async function mount(path, state) {
  const errors = [], vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" + path, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.__mock = { calls: [], ...state };
  w.eval(bundle.outputFiles[0].text);
  w.mount();
  const text = () => w.document.body.textContent;
  const wait = async (fn) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 15)); } throw Error("UI did not settle: " + text() + " " + errors.join(",")); };
  const button = (label) => [...w.document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  return { dom, w, text, wait, button, errors };
}
const catalog = [{ code: "bh-speaking-mock-b", title: "Speaking practice mock B", published: false, pilot_student: id(1), script_version: 1 }];
const row = (extra) => ({ assignment_id: id(8), package_code: "bh-speaking-mock-b", title: "Speaking practice mock B", assigned_at: "2026-11-21T10:00:00Z", assigned_by: "Teacher",
  cancelled_at: null, session_id: id(400), started_at: "2026-11-21T10:05:00Z", finished_at: "2026-11-21T10:20:00Z", status: "submitted", reviewed: false, interrupted_answers: 1, ...extra });

test("a teacher assigns the mock once, can cancel it before it starts, and sees honest states", async () => {
  const m = await mount("/panel", { catalog, rows: [] });
  try {
    await m.wait(() => m.text().includes("Speaking practice mock"));
    assert.match(m.text(), /never counts as a screener/);
    assert.match(m.text(), /Not an official IELTS test/);
    m.button("Assign to Aida").click();
    await m.wait(() => m.text().includes("Assigned · not started"));
    assert.deepEqual(plain(m.w.__mock.calls[0]), ["assign", "bh-speaking-mock-b", [id(1)]]);
    assert.equal(m.button("Assign to Aida").disabled, true, "one open attempt");
    assert.match(m.text(), /already has this mock open/);
    m.button("Cancel").click();
    await m.wait(() => m.text().includes("Cancelled"));
    assert.equal(m.button("Assign to Aida").disabled, false);
  } finally { m.dom.window.close(); }
  const r = await mount("/panel", { catalog, rows: [row({}), row({ assignment_id: id(7), status: "in_progress", finished_at: "x" }), row({ assignment_id: id(6), status: "in_progress", finished_at: null })] });
  try {
    await r.wait(() => r.text().includes("Ready for your review"));
    assert.match(r.text(), /1 interrupted or lost answer/);
    assert.match(r.text(), /Finished · still saving/);
    assert.match(r.text(), /Started by the student/);
    r.button("Retry saving").click();
    await r.wait(() => r.text().includes("ready for your review"));
    r.button("Review →").click();
    await r.wait(() => r.w.location.pathname === `/ielts/speaking-pilot/${id(400)}`);
  } finally { r.dom.window.close(); }
  const none = await mount("/panel", { catalog: [{ ...catalog[0], pilot_student: id(2) }], rows: [] });
  try {
    await new Promise((res) => setTimeout(res, 80));
    assert.equal(none.text().includes("Speaking practice mock"), false, "an unpublished mock is offered only for the pilot student");
  } finally { none.dom.window.close(); }
});

test("the review shows which question each answer belongs to and what was lost", async () => {
  const segments = { mock: true, replays: 1, checks: {}, parts: [
    { part: 1, clip_id: id(701), answers: [{ line_key: "p1.q1", start: 0, end: 20, question: "Do you work or are you a student?", interrupted: false },
      { line_key: "p1.q2", start: 20.8, end: 41, question: "What do you like most about your school?", interrupted: true }], lost: ["How do you usually get to school?"] }] };
  const m = await mount("/map", { segments });
  try {
    await m.wait(() => m.text().includes("Questions and answers"));
    assert.match(m.text(), /Do you work or are you a student\?/);
    assert.match(m.text(), /What do you like most about your school\? · interrupted/);
    assert.match(m.text(), /No audio survived for: How do you usually get to school\?/);
    assert.match(m.text(), /without supervision/);
    assert.match(m.text(), /Part 1 replays used: 1/);
    assert.ok(m.w.document.querySelector('[aria-label="Play this answer from 0:20"]'));
  } finally { m.dom.window.close(); }
  const empty = await mount("/map", { segments: { mock: false } });
  try {
    await new Promise((res) => setTimeout(res, 60));
    assert.equal(empty.text(), "", "interviews show nothing extra");
  } finally { empty.dom.window.close(); }
});

test("the owner must listen before approving, a rejection needs a note, and a version is used only when every line is approved", async () => {
  const line = (position, extra) => ({ position, key: `k${position}`, part: 1, kind: "question", body: `Question ${position}?`, answer_seconds: 30, replay_allowed: true, audio_key: "a".repeat(64),
    approved_audio: null, candidates: [{ id: id(position), path: `${id(position)}.mp3`, sha256: "b".repeat(64), duration_seconds: 2.4, rejected: false }], ...extra });
  const script = { id: id(100), package_code: "bh-speaking-mock-b", content_hash: "h", version: 1, voice: { voice: "Miriam", model: "eleven_multilingual_v2" },
    cue_card: { topic: "t", points: ["a", "b"] }, released_at: null, lines: [line(1), line(2, { approved_audio: { id: id(2), sha256: "b", duration_seconds: 2, approved_at: "x" }, candidates: [] })],
    needs_audio: { lines: 1, characters: 11 } };
  const overview = [{ code: "bh-speaking-mock-b", title: "Speaking practice mock B", content_hash: "h", approved: false, published: false, scripts: [{ id: id(100), version: 1, released_at: null, created_at: "x" }] }];
  const m = await mount("/studio", { overview, script });
  try {
    await m.wait(() => m.text().includes("Version 1"));
    m.button("Version 1").click();
    await m.wait(() => m.text().includes("Still needing a voice"));
    assert.match(m.text(), /1 line · 11 characters/);
    assert.match(m.text(), /nothing is generated until you agree/);
    assert.equal(m.button("Approve").disabled, true, "listen first");
    assert.equal(m.button("Reject").disabled, true, "a rejection needs a note");
    assert.equal(m.button("Use this version for students").disabled, true);
    m.button("Listen").click();
    await m.wait(() => m.w.document.querySelector("audio"));
    m.button("Approve").click();
    await m.wait(() => m.w.__mock.calls.some((c) => c[0] === "review"));
    assert.deepEqual(plain(m.w.__mock.calls.find((c) => c[0] === "review")), ["review", id(1), "b".repeat(64), true, ""]);
    assert.equal(m.button("Approve this exact package").disabled, true, "all six checks and a note");
  } finally { m.dom.window.close(); }
});

test("review pages label a practice mock as unsupervised and the student result says practice mock", () => {
  const page = readFileSync("src/pages/ielts/IeltsSpeakingPilot.tsx", "utf8");
  assert.match(page, /Practice mock · Recorded examiner · unsupervised/);
  assert.match(page, /<SpeakingMockTeacherPanel studentId=\{home\.student_id\}/);
  assert.match(page, /session\.evidence_kind === "practice_mock" && <SpeakingMockAnswerMap sessionId=\{session\.id\} \/>/);
  const insights = readFileSync("src/components/ielts/SpeakingInterviewInsights.tsx", "utf8");
  assert.match(insights, /Teacher Speaking band · practice mock/);
  assert.match(insights, /Recorded examiner · unsupervised practice/);
});
