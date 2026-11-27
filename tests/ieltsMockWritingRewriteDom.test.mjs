// Visual & UX Bible 1.25.0 section 13.15 / Diagnostic Bible 2.7.5 section 12B: Mock Test 1 · Writing rewrite on screen.
import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const define = { "import.meta": JSON.stringify({ env: { VITE_SUPABASE_URL: "https://test.supabase.co", VITE_SUPABASE_ANON_KEY: "test-key" } }) };
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {RouterProvider,createBrowserRouter} from './src/lib/router';
import Home from './src/pages/ielts/IeltsMockHome';
import Mock from './src/pages/ielts/IeltsMockTest';
createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([
 {path:'/ielts/mocks',element:<Home/>},{path:'/ielts/mocks/:attemptId',element:<Mock/>},{path:'*',element:<p>elsewhere</p>}])}/>);`,
    loader: "tsx", resolveDir: process.cwd(),
  },
  bundle: true, format: "iife", write: false, loader: { ".css": "empty", ".png": "empty", ".svg": "empty", ".jpg": "empty" }, logLevel: "silent", define,
});
const code = bundle.outputFiles[0].text;
const units = await build({
  stdin: { contents: `export {mockRewriteSummary} from './services/ieltsTeacherReviewService';export {mockSectionCell} from './services/ieltsClassReportService';`, loader: "ts", resolveDir: process.cwd() },
  bundle: true, format: "esm", write: false, logLevel: "silent", define, platform: "browser",
});
const { mockRewriteSummary, mockSectionCell } = await import("data:text/javascript;base64," + Buffer.from(units.outputFiles[0].text).toString("base64"));

const now = () => new Date().toISOString();
const task1 = { prompt: "The diagram below shows how rainwater is collected and treated for use in homes.", minimum_words: 150, suggested_minutes: 20,
  figure: { src: "/ielts/mocks/IELTS-M1W/writing-task1.png?v=abc", title: "Collecting and treating rainwater for household use", note: "Illustrative diagram for practice; fictional system.", alt: "A nine-stage process." } };
const task2 = { prompt: "Some people believe that every child should learn to play a musical instrument at school.", minimum_words: 250, suggested_minutes: 40 };
const base = { attempt_id: "att-1", code: "IELTS-M1W", title: "Mock Test 1 · Writing rewrite", version: "1.0.0", kind: "writing_rewrite", sections: ["writing"],
  status: "in_progress", section: "writing", practice: true, attempt_no: 1, audio: null, saved_at: null, section_seconds: 3600 };
const notStarted = () => ({ ...base, started: false, section_started_at: null, deadline: null, server_now: now(), remaining_seconds: null, payload: null, answers: null });
const started = () => ({ ...base, started: true, section_started_at: now(), deadline: new Date(Date.now() + 3600e3).toISOString(), server_now: now(), remaining_seconds: 3600, payload: { task1, task2 }, answers: {} });
const result = {
  attempt_id: "att-1", code: "IELTS-M1W", title: "Mock Test 1 · Writing rewrite", version: "1.0.0", kind: "writing_rewrite", form_sections: ["writing"],
  status: "completed", practice: true, attempt_no: 1, started_at: now(), completed_at: now(), sections: {},
  skills: { writing: { t1: "My task one.", t2: "My task two.", t1_words: 3, t2_words: 3, review: null, reviewed_in_writing_review: true, tasks: [
    { task: "t1", label: "Mock Test 1 · Task 1 (computer rewrite)", writing_attempt_id: "w-1", reviewed: true, band: 6, reviewed_at: now() },
    { task: "t2", label: "Mock Test 1 · Task 2 (computer rewrite)", writing_attempt_id: "w-2", reviewed: false, band: null, reviewed_at: null }] } },
  payload: { listening: null, reading: null, writing: { task1, task2 } },
};

async function open(path, handlers) {
  const errors = [], calls = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" + path, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  Object.assign(w, { TextEncoder, TextDecoder, Request, Response, Headers });
  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.fetch = async (url, init) => {
    const fn = String(url).split("?")[0].split("/").pop();
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ fn, body });
    const data = handlers[fn] ? handlers[fn](body) : null;
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  w.eval(code);
  test.after(() => { try { dom.window.close(); } catch { /* closed */ } });
  const wait = async (fn) => {
    for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); }
    throw Error("UI did not settle: " + w.document.body.textContent.slice(0, 400));
  };
  const button = (text) => [...w.document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  return { w, dom, errors, calls, wait, button };
}

test("the mock list shows the rewrite as 60 minutes of Writing, practice, and its Writing state", async () => {
  const entry = { code: "IELTS-M1W", title: "Mock Test 1 · Writing rewrite", version: "1.0.0", kind: "writing_rewrite", sections: ["writing"], practice: true, available: true, minutes: 60, attempts: [] };
  const { w, dom, wait } = await open("/ielts/mocks", { rpc_ielts_mock_cbt_home: () => [entry] });
  await wait(() => w.document.body.textContent.includes("Mock Test 1 · Writing rewrite"));
  const text = w.document.querySelector(".mk-home-card").textContent;
  assert.match(text, /About 60 min · Writing \(2 tasks\) · practice \(no band range\)/);
  assert.doesNotMatch(text, /headphones|Listening/);
  assert.match(text, /Your teacher checks them like your other writing/);
  dom.window.close();

  const doneEntry = { ...entry, available: false, attempts: [{ id: "att-1", status: "completed", section: "done", attempt_no: 1, practice: true, started_at: now(), completed_at: now(), listening: null, reading: null, writing_reviewed: false,
    writing_tasks: [{ task: "t1", reviewed: true }, { task: "t2", reviewed: false }] }] };
  const second = await open("/ielts/mocks", { rpc_ielts_mock_cbt_home: () => [doneEntry] });
  await second.wait(() => !!second.w.document.querySelector(".mk-attempts"));
  assert.match(second.w.document.querySelector(".mk-attempts").textContent, /· practice.*Writing waiting for your teacher/);
  assert.ok(!second.button("Take it again") && !second.button("Start the test"), "one attempt only");
  second.dom.window.close();
});

test("rewrite intro, no paste, leaving the page recorded, bigger picture, and the result with teacher feedback per task", async () => {
  let current = notStarted();
  const { w, dom, errors, calls, wait, button } = await open("/ielts/mocks/att-1", {
    rpc_ielts_mock_cbt_state: () => current,
    rpc_ielts_mock_cbt_begin_section: () => (current = started()),
    rpc_ielts_mock_cbt_save: () => ({ saved: true, saved_at: now(), remaining_seconds: 3500 }),
    rpc_ielts_mock_cbt_log_event: () => ({ recorded: true }),
    rpc_ielts_mock_cbt_finish_section: () => (current = { ...base, status: "completed", section: "done", started: false, payload: null }),
    rpc_ielts_mock_cbt_result: () => result,
  });
  await wait(() => !!w.document.querySelector("[data-testid=mk-rewrite-note]"));
  const intro = w.document.querySelector(".mk-intro-card").textContent;
  assert.match(intro, /Writing rewrite · practice/);
  assert.match(intro, /no band range/);
  assert.match(intro, /Pasting is turned off/);
  assert.match(intro, /your teacher can see that you left/);
  assert.doesNotMatch(intro, /you have taken this test before/, "the rewrite has its own wording");
  button("Start Writing").click();
  await wait(() => !!w.document.querySelector("#mk-t1"));
  const img = w.document.querySelector(".mk-figure img");
  assert.equal(img.getAttribute("alt"), "A nine-stage process.");
  button("Bigger picture").click();
  await wait(() => w.document.querySelector(".mk-figure").classList.contains("is-zoomed"));
  assert.equal(button("Smaller picture").getAttribute("aria-pressed"), "true");

  const area = w.document.querySelector("#mk-t1");
  assert.equal(area.getAttribute("spellcheck"), "false");
  assert.equal(area.getAttribute("autocomplete"), "off");
  const paste = new w.Event("paste", { bubbles: true, cancelable: true });
  area.dispatchEvent(paste);
  assert.equal(paste.defaultPrevented, true, "pasting is blocked");
  await wait(() => !!w.document.querySelector(".mk-paste-note"));
  Object.defineProperty(w.document, "visibilityState", { configurable: true, get: () => "hidden" });
  w.document.dispatchEvent(new w.Event("visibilitychange"));
  Object.defineProperty(w.document, "visibilityState", { configurable: true, get: () => "visible" });
  w.document.dispatchEvent(new w.Event("visibilitychange"));
  await wait(() => calls.filter((c) => c.fn === "rpc_ielts_mock_cbt_log_event").length >= 3);
  assert.deepEqual(calls.filter((c) => c.fn === "rpc_ielts_mock_cbt_log_event").map((c) => c.body.p_kind).sort(), ["paste_blocked", "tab_hidden", "tab_visible"]);

  button("Submit test").click();
  await wait(() => !!w.document.querySelector(".mk-modal"));
  [...w.document.querySelectorAll(".mk-modal button")].find((b) => b.textContent === "Submit test").click();
  await wait(() => !!w.document.querySelector(".mk-writing-tasks"));
  const page = w.document.querySelector(".mk-result").textContent;
  assert.match(page, /Your Writing/);
  assert.match(page, /Writing rewrite · practice: no band range/);
  assert.doesNotMatch(page, /Listening|Reading/, "a Writing-only result has no other sections");
  const rows = [...w.document.querySelectorAll(".mk-writing-tasks li")].map((li) => li.textContent);
  assert.match(rows[0], /Teacher Writing band · Task 1: 6\.0.*Checked by your teacher.*Not an official IELTS result/);
  assert.match(rows[1], /Waiting for your teacher/);
  assert.equal([...w.document.querySelectorAll(".mk-writing-tasks button")].length, 1, "feedback opens only once the teacher has checked the task");
  button("Read feedback →").click();
  await wait(() => w.location.pathname === "/ielts/review-result/writing/w-1");
  assert.deepEqual(errors, []);
  dom.window.close();
});

test("a first sitting reads as Mock Test 1 · Writing and shows the Writing range once both tasks are checked", async () => {
  const entry = { code: "IELTS-M1W", title: "Mock Test 1 · Writing", version: "1.0.0", kind: "writing_mock", sections: ["writing"], practice: false, available: true, minutes: 60, attempts: [] };
  const list = await open("/ielts/mocks", { rpc_ielts_mock_cbt_home: () => [entry] });
  await list.wait(() => !!list.w.document.querySelector(".mk-home-card"));
  const card = list.w.document.querySelector(".mk-home-card").textContent;
  assert.match(card, /Mock Test 1 · Writing/);
  assert.doesNotMatch(card, /rewrite|practice/);
  assert.match(card, /Writing band range appears when both are checked/);
  list.dom.window.close();

  const fresh = { ...base, title: "Mock Test 1 · Writing", kind: "writing_mock", practice: false };
  const done = { ...result, title: "Mock Test 1 · Writing", kind: "writing_mock", practice: false,
    skills: { writing: { ...result.skills.writing, indicative: { label: "6.0–7.0", low: 6, high: 7, central: 6.5 },
      tasks: result.skills.writing.tasks.map((t) => ({ ...t, reviewed: true, band: t.task === "t1" ? 6 : 6.5, reviewed_at: now() })) } } };
  let current = { ...notStarted(), ...fresh };
  const { w, dom, errors, wait, button } = await open("/ielts/mocks/att-1", {
    rpc_ielts_mock_cbt_state: () => current,
    rpc_ielts_mock_cbt_result: () => done,
  });
  await wait(() => !!w.document.querySelector("[data-testid=mk-writing-mock-note]"));
  assert.doesNotMatch(w.document.querySelector(".mk-intro-card").textContent, /rewrite|no band range/);
  current = { ...current, status: "completed", section: "done" };
  dom.window.close();
  const res = await open("/ielts/mocks/att-1", { rpc_ielts_mock_cbt_state: () => ({ ...current }), rpc_ielts_mock_cbt_result: () => done });
  await res.wait(() => !!res.w.document.querySelector(".mk-ind"));
  const ind = res.w.document.querySelector(".mk-ind").textContent;
  assert.match(ind, /6\.0–7\.0.*Indicative band range.*Not an official IELTS result.*Confidence: low.*M1 Writing · Task 1 \+ Task 2 × 2/);
  assert.doesNotMatch(res.w.document.querySelector(".mk-result").textContent, /rewrite/);
  assert.deepEqual(errors.concat(res.errors), []);
  assert.ok(button);
  res.dom.window.close();
});

test("teacher summary of the timed section and the class report note never imply a band", () => {
  const ctx = { code: "IELTS-M1W", title: "Mock Test 1 · Writing rewrite", task: "t1", practice: true, completed_at: null,
    integrity: { tab_switches: 2, focus_lost: 0, paste_blocked: 1, minutes_used: 47, closed_by: "time", started_at: null } };
  assert.equal(mockRewriteSummary(ctx), "Mock Test 1 · Writing rewrite · timed on screen · practice (no band range) · time ran out after 47 min · left the test page 2 times · tried to paste 1 time (blocked)");
  assert.equal(mockRewriteSummary({ ...ctx, integrity: null }), "Mock Test 1 · Writing rewrite · timed on screen · practice (no band range)");
  assert.equal(mockRewriteSummary({ ...ctx, title: "Mock Test 1 · Writing", practice: false, integrity: null }),
    "Mock Test 1 · Writing · timed on screen · first sitting: counts toward the Writing indicative range · the AI check is for you only");
  const mock = { key: "cbt:1", group: "cbt:IELTS-M1W", form: "IELTS-M1W", title: "Mock Test 1 · Writing rewrite", delivery: "computer", source: "cbt", sat_on: "2026-11-28", practice: true, attempt_no: 1, sections: {} };
  const cell = mockSectionCell({ state: "result", criteria: { t1: { ta: 6 } }, exposed: true, indicative: null, practice_reason: "rewrite" }, "writing", mock);
  assert.equal(cell.state, "practice");
  assert.match(cell.note, /rewrite after feedback: practice, no indicative range/);
  assert.equal(mockSectionCell({ state: "not_part" }, "listening", mock).text, "—");
});
