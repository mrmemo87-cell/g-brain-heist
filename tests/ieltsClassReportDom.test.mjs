// Visual & UX Bible 1.21.0 section 13.13: the teacher's class report (whole class and each student, print, Excel).
import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {RouterProvider,createBrowserRouter} from './src/lib/router';
import Programme from './src/pages/ielts/IeltsProgrammeWorkspace';
createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'*',element:<Programme schoolId="school-a"/>}])}/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true, format: "iife", write: false, loader: { ".css": "empty" }, logLevel: "silent",
  define: { "import.meta": JSON.stringify({ env: { VITE_SUPABASE_URL: "https://test.supabase.co", VITE_SUPABASE_ANON_KEY: "test-key" } }) },
});
const code = bundle.outputFiles[0].text;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
const report = (scope) => ({
  school_id: "school-a", scope, generated_at: day(0), classes: ["10A", "11B"], batches: [{ id: "batch-1", name: "May group" }],
  students: [
    { id: "s1", name: "Aida", class_name: "10A", items: [
      { key: "targeted:r28", kind: "targeted_practice", title: "Reading step 1", code: "R-050", skill: "reading", assigned_at: day(-3), due_at: day(-1), status: "done", done_at: day(-2), score: { raw: 4, total: 6 }, review: "waiting" },
      { key: "mock:b", kind: "speaking_mock", title: "Speaking practice mock · Mock B", code: null, skill: "speaking", assigned_at: day(-5), due_at: null, status: "done", done_at: day(-4), score: null, band: { value: 6.5, label: "Teacher Speaking band · practice mock" }, review: "reviewed" },
      { key: "screener:w", kind: "screener", title: "=Writing Screener", code: null, skill: "writing", assigned_at: day(-9), due_at: null, status: "done", done_at: day(-8), score: null, review: "waiting" },
    ] },
    { id: "s2", name: "Bek", class_name: "10A", items: [
      { key: "targeted:r28", kind: "targeted_practice", title: "Reading step 1", code: "R-050", skill: "reading", assigned_at: day(-3), due_at: day(-1), status: "not_started", done_at: null, score: null, review: null },
    ] },
    { id: "s3", name: "Cara", class_name: "11B", items: [] },
  ],
});

const sec = (state, extra = {}) => ({ state, ...extra });
const markbook = {
  s1: { course: { done: 5, total: 26 }, official: [{ test_date: "2026-11-01", test_type: "academic", delivery: "computer", listening: 7, reading: 6.5, writing: 6, speaking: 6.5, overall: 6.5, verified: true }],
    mocks: [
      { key: "sitting:1", group: "paper:IELTS-M1:2026-10-24", form: "IELTS-M1", title: "Mock Test 1", delivery: "paper", source: "sitting", sat_on: "2026-10-24", practice: false, attempt_no: null,
        sections: { listening: sec("result", { raw: 29, answered: 40, exposed: false, indicative: { label: "6.0–7.0", low: 6, high: 7, central: 6.5 } }), reading: sec("not_sat"),
          writing: sec("result", { raw: null, exposed: false, criteria: {}, indicative: { label: "4.5–5.5", low: 4.5, high: 5.5, central: 5 } }), speaking: sec("not_sat") } },
      { key: "cbt:1", group: "cbt:IELTS-M2", form: "IELTS-M2", title: "Mock Test 2", delivery: "computer", source: "cbt", sat_on: "2026-11-17", practice: true, attempt_no: 2,
        sections: { listening: sec("result", { raw: 33, exposed: true, indicative: null }), reading: sec("in_progress"), writing: sec("waiting"), speaking: sec("not_part") } },
    ] },
  s2: { course: { done: 0, total: 26 }, official: [], mocks: [
      { key: "sitting:2", group: "paper:IELTS-M1:2026-10-24", form: "IELTS-M1", title: "Mock Test 1", delivery: "paper", source: "sitting", sat_on: "2026-10-24", practice: false, attempt_no: null,
        sections: { listening: sec("not_sat"), reading: sec("not_sat"), writing: sec("result", { criteria: { t1: { ta: 5 } }, exposed: false, indicative: null }), speaking: sec("not_sat") } }] },
  s3: { course: { done: 26, total: 26 }, official: [], mocks: [] },
};
const withBook = (r) => ({ ...r, markbook_version: 1, students: r.students.map((s) => ({ ...s, markbook: markbook[s.id],
  items: s.id === "s2" ? [...s.items, { key: "writing:29", kind: "reviewed_writing", title: "Mock Test 1 · Task 1 (paper)", code: "W-029", skill: "writing", assigned_at: day(-30), due_at: null, status: "done", done_at: day(-30), score: null, band: { value: 5.5, label: "Teacher Writing band · Task 1" }, review: "reviewed" }] : s.items })) });

async function open(path, { book = false } = {}) {
  const errors = [], calls = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" + path, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  Object.assign(w, { TextEncoder, TextDecoder, Request, Response, Headers });
  let blob = null, printed = 0;
  w.URL.createObjectURL = (b) => { blob = b; return "blob:report"; };
  w.URL.revokeObjectURL = () => {};
  const popup = new JSDOM("<!doctype html><html><body></body></html>", { url: "about:blank", pretendToBeVisual: true }).window;
  popup.print = () => { printed += 1; };
  let opened = 0;
  w.open = () => { opened += 1; return popup; };
  w.print = () => { throw new Error("the app page must not be printed directly"); };
  w.scrollTo = () => {};
  let saved = "";
  w.HTMLAnchorElement.prototype.click = function () { saved = this.download; };
  w.fetch = async (url, init) => {
    const fn = String(url).split("/").pop();
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ fn, body });
    let data;
    if (fn.startsWith("schools?")) data = { name: "Test school", logo_url: "https://cdn.example.org/logo.png" };
    else if (fn === "rpc_ielts_programme_access") data = { schools: [{ id: "school-a", name: "Test school", can_allocate: true, can_manage: true }] };
    else if (fn === "rpc_ielts_programme_workspace") data = { schools: [{ id: "school-a", name: "Test school" }], school_id: "school-a", can_allocate: true, can_manage: true, lead: null, teachers: [], students: [], total_students: 0, pending_count: 0, queue: [], classes: [], confidence: "low", readiness_available: false };
    else if (fn === "rpc_ielts_speaking_mock_overview") data = { school_id: "school-a", published_mocks: 6, students: [] };
    else if (fn === "rpc_ielts_learning_workspace") data = { manager: true, pilot_only: false, tasks: [], allocations: [] };
    else if (fn === "rpc_ielts_class_report") { data = report({ kind: body.p_scope, value: body.p_value, name: body.p_scope === "batch" ? "May group" : body.p_value }); if (book) data = withBook(data); }
    else throw Error("Unexpected request " + fn);
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  w.eval(code);
  test.after?.(() => { try { dom.window.close(); } catch { /* closed */ } });
  const wait = async (fn) => {
    for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); }
    throw Error("UI did not settle: " + w.document.body.textContent.slice(0, 300));
  };
  const button = (text) => [...w.document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  return { w, dom, errors, calls, wait, button, blob: () => blob, printed: () => printed, saved: () => saved, popup, opened: () => opened };
}

test("Students has a Class report: whole class grid with marks, the teacher's band, review and overdue states", async () => {
  const { w, dom, errors, calls, wait, button } = await open("/ielts/programme?programmeSection=students");
  await wait(() => !!button("Class report"));
  button("Class report").click();
  await wait(() => !!w.document.querySelector(".itn-cr-grid"));
  assert.match(w.location.search, /report=1/);
  assert.deepEqual(calls.find((c) => c.fn === "rpc_ielts_class_report").body, { p_school_id: "school-a", p_scope: "all", p_value: null });
  assert.equal(w.document.querySelector("#itn-cr-title").textContent, "All students");
  const heads = [...w.document.querySelectorAll(".itn-cr-grid thead .itn-cr-coltitle")].map((e) => e.textContent);
  assert.deepEqual(heads, ["Reading step 1", "Speaking practice mock · Mock B", "=Writing Screener"], "newest work first");
  const row = (name) => [...w.document.querySelectorAll(".itn-cr-grid tbody tr")].find((r) => r.querySelector(".itn-cr-name").textContent === name);
  const cells = (name) => [...row(name).querySelectorAll("td .itn-cr-cell")].map((c) => c.textContent);
  assert.deepEqual(cells("Aida"), ["4 / 6", "Band 6.5", "To review"]);
  assert.deepEqual(cells("Bek"), ["Overdue", "·", "·"]);
  assert.equal(row("Aida").querySelector(".itn-cr-done").textContent, "3 / 3");
  assert.match(row("Bek").querySelector(".itn-cr-done").textContent, /0 \/ 1 · 1 late/);
  const stats = [...w.document.querySelectorAll(".itn-cr-stats dd")].map((d) => d.textContent);
  assert.deepEqual(stats, ["4", "75% · 3", "1", "1"]);
  assert.match(w.document.querySelector(".itn-cr-note").textContent, /not IELTS bands/);
  assert.match(w.document.querySelector(".itn-cr-note").textContent, /None of these is an\s+official IELTS result/);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test("each student's list, class and batch choices, print and the Excel download", async () => {
  const { w, dom, errors, calls, wait, button, blob, printed, saved, popup, opened } = await open("/ielts/programme?programmeSection=students&report=1");
  await wait(() => !!w.document.querySelector(".itn-cr-grid"));
  [...w.document.querySelectorAll(".itn-cr-name")].find((b) => b.textContent === "Aida").click();
  await wait(() => w.document.querySelectorAll(".itn-cr-person").length === 1);
  const person = w.document.querySelector(".itn-cr-person");
  assert.equal(person.querySelector("h3").textContent, "Aida");
  assert.match(person.querySelector("header p").textContent, /Class 10A · 3 of 3 done · 1 waiting for review/);
  const rows = [...person.querySelectorAll("tbody tr")].map((r) => r.querySelectorAll("td")[5].textContent);
  assert.deepEqual(rows, ["4 / 6correct answers", "Band 6.5Teacher Speaking band · practice mock", "—"]);
  const pick = w.document.querySelector(".itn-cr-controls select");
  pick.value = "batch:batch-1";
  pick.dispatchEvent(new w.Event("change", { bubbles: true }));
  await wait(() => calls.some((c) => c.fn === "rpc_ielts_class_report" && c.body.p_scope === "batch"));
  assert.deepEqual(calls.filter((c) => c.fn === "rpc_ielts_class_report").pop().body, { p_school_id: "school-a", p_scope: "batch", p_value: "batch-1" });
  await wait(() => w.document.querySelector("#itn-cr-title").textContent === "Course batch · May group");
  pick.value = "class:11B";
  pick.dispatchEvent(new w.Event("change", { bubbles: true }));
  await wait(() => w.document.querySelector("#itn-cr-title").textContent === "Class 11B");

  button("Print or save as PDF").click();
  await wait(() => !!w.document.querySelector(".itn-cr-print"));
  assert.equal(w.document.querySelector(".itn-cr-print legend").textContent, "Smart printing");
  assert.match(w.document.querySelector(".itn-cr-plan").textContent, /A4 portrait$/, "starts on the view on screen (each student)");
  button("Whole class").click();
  await wait(() => /^1 physical sheet · 1 content page · 0 added blank pages · A4 landscape$/.test(w.document.querySelector(".itn-cr-plan").textContent));
  button("A report for each student").click();
  await wait(() => w.document.querySelector(".itn-cr-plan").textContent === "3 physical sheets · 3 content pages · 2 added blank pages · A4 portrait");
  assert.ok(w.document.querySelector(".itn-cr-print input[type=checkbox]").checked, "each student's pages kept together by default");
  assert.equal(w.document.querySelector('.itn-cr-print select[aria-label="Print sides"]').value, "double");
  button("Open print preview").click();
  assert.equal(opened(), 1);
  await wait(() => popup.document.getElementById("print")?.disabled === false);
  assert.equal(popup.document.querySelectorAll(".rp-page").length, 3, "one page per student");
  assert.equal(popup.document.querySelectorAll(".blank-page").length, 2, "a blank back after each student but the last");
  const logo = popup.document.querySelector(".rp-head .rp-brand img.rp-logo");
  assert.equal(logo?.getAttribute("src"), "https://cdn.example.org/logo.png", "the school logo comes before the school name");
  assert.equal(logo.nextElementSibling.querySelector("strong").textContent, "Test school");
  assert.match(popup.document.getElementById("printer-reminder").textContent, /Double-sided · 1 page per side · A4 · Portrait/);
  assert.match(popup.document.querySelectorAll(".rp-page")[2].textContent, /Cara/);
  popup.document.getElementById("print").click();
  assert.equal(printed(), 1);
  button("Download for Excel").click();
  const csv = await new Promise((r) => { const fr = new w.FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsText(blob()); });
  assert.equal(blob().type, "text/csv;charset=utf-8");
  assert.ok(csv.replace(/^\uFEFF/, "").startsWith("Student,Class,Work,Code,Type,Skill,Given,Due,Status,Done on,Result,Result note"));
  assert.match(csv, /Aida,10A,Reading step 1,R-050,Targeted practice,reading,.*,Done,.*,4 \/ 6,"Correct answers \(marks, not a band\)"/);
  assert.match(csv, /Aida,10A,'=Writing Screener,/, "a title that looks like a formula is neutralised");
  assert.match(csv, /Bek,10A,Reading step 1,.*,Overdue,/);
  assert.match(csv, /Cara,11B,No IELTS work given yet/);
  assert.match(saved(), /^IELTS class report - Class 11B - \d{4}-\d{2}-\d{2}\.csv$/);

  button("← Back to students").click();
  await wait(() => !w.document.querySelector(".itn-cr") && !!button("Class report"));
  assert.doesNotMatch(w.location.search, /report=1/);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test("mark book: course, each mock per section with marks and the labelled indicative range, real IELTS, Writing bands, print and Excel", async () => {
  const { w, dom, errors, wait, button, blob, saved, popup } = await open("/ielts/programme?programmeSection=students&report=1", { book: true });
  await wait(() => !!w.document.querySelector(".itn-cr-grid .itn-cr-bookgroup"));
  const groups = [...w.document.querySelectorAll(".itn-cr-grid thead .itn-cr-bookgroup")].map((e) => e.textContent);
  assert.deepEqual(groups, ["Mock Test 1 · Paper · 24 Oct 2026 · indicative, not official", "Mock Test 2 · Computer · indicative, not official", "Real IELTS (latest)"]);
  const sub = [...w.document.querySelectorAll(".itn-cr-grid thead .itn-cr-subrow th")].map((e) => e.textContent);
  assert.deepEqual(sub, ["Listening", "Reading", "Writing", "Speaking", "Listening", "Reading", "Writing", "Speaking", "Listening", "Reading", "Writing", "Speaking", "Overall"]);
  assert.ok(w.document.querySelector(".itn-cr-grid thead th.is-sticky"), "the name column stays in view on a phone");
  const row = (name) => [...w.document.querySelectorAll(".itn-cr-grid tbody tr")].find((r) => r.querySelector(".itn-cr-name").textContent === name);
  const book = (name) => [...row(name).querySelectorAll("td.itn-cr-booktd .itn-cr-cell")].map((c) => c.textContent);
  assert.deepEqual(book("Aida"), ["5 / 26units", "29 / 406.0–7.0", "Not sat", "4.5–5.5indicative range", "Not sat",
    "33 / 40practice · no range", "Started", "To review", "—", "7.0", "6.5", "6.0", "6.5", "6.5verified"]);
  assert.deepEqual(book("Bek"), ["0 / 26units", "Not sat", "Not sat", "Ratedratings incomplete · no range", "Not sat", "·", "·", "·", "·", "·", "·", "·", "·", "·"]);
  assert.match(row("Aida").querySelectorAll("td.itn-cr-booktd .itn-cr-cell")[1].title, /Indicative band range 6\.0–7\.0 · Confidence: low · Not an official IELTS result · teacher-entered paper evidence/);
  const heads = [...w.document.querySelectorAll(".itn-cr-grid thead .itn-cr-coltitle")].map((e) => e.textContent);
  assert.ok(heads.includes("Mock Test 1 · Task 1 (paper)"), "teacher-reviewed Writing is a column");
  assert.ok([...row("Bek").querySelectorAll("td .itn-cr-cell")].some((c) => c.textContent === "Band 5.5"));
  assert.match(row("Bek").querySelector(".itn-cr-done").textContent, /0 \/ 1/, "reviewed Writing that was never assigned is not counted as work given");
  assert.match(w.document.querySelector(".itn-cr-note").textContent, /indicative band range/);
  assert.match(w.document.querySelector(".itn-cr-note").textContent, /except the Real IELTS columns/);

  [...w.document.querySelectorAll(".itn-cr-name")].find((b) => b.textContent === "Aida").click();
  await wait(() => !!w.document.querySelector(".itn-cr-person .itn-cr-booklist"));
  const card = w.document.querySelector(".itn-cr-person");
  assert.match(card.querySelector("header p").textContent, /Course 5 \/ 26 units/);
  const lines = [...card.querySelectorAll(".itn-cr-booklist tbody tr")].map((r) => r.querySelector("th").textContent);
  assert.deepEqual(lines.slice(0, 2), ["Mock Test 1 · Paper · 24 Oct 2026Teacher-entered paper evidence", "Mock Test 2 · ComputerPractice (repeat) · no range"]);
  assert.match(lines[2], /^Real IELTS · .+Official result · verified$/);

  button("Download mark book for Excel").click();
  const csv = await new Promise((r) => { const fr = new w.FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsText(blob()); });
  const lines2 = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.match(lines2[0], /^Student,Class,Done,Course units done,Mock Test 1 · Paper · 24 Oct 2026 · Listening,/);
  assert.match(lines2[0], /Real IELTS \(latest\) · Overall/);
  assert.match(lines2[1], /^Aida,10A,3 \/ 3,5 \/ 26,29 \/ 40 · 6\.0–7\.0,Not sat,4\.5–5\.5 · indicative range,Not sat,33 \/ 40 · practice · no range,Started,To review,—,7\.0,6\.5,6\.0,6\.5,6\.5 · verified,/);
  assert.match(csv, /Note,,"Reading and Listening show correct answers/);
  assert.match(saved(), /^IELTS mark book - All students - \d{4}-\d{2}-\d{2}\.csv$/);
  button("Download for Excel").click();
  const list = await new Promise((r) => { const fr = new w.FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsText(blob()); });
  assert.match(list, /Aida,10A,Mock Test 1,IELTS-M1,Mock test \(paper\),listening,2026-10-24,,Done,,29 \/ 40,Correct answers out of 40 · Indicative band range 6\.0–7\.0 · Confidence: low · Not an official IELTS result · teacher-entered paper evidence/);
  assert.match(list, /Aida,10A,IELTS course,,Course progress,,,,,,5 \/ 26 units,/);
  assert.match(list, /Aida,10A,"Real IELTS \(Academic, computer\)",,Official IELTS result,overall,2026-11-01,,Verified,,6\.5,/);

  button("Print or save as PDF").click();
  await wait(() => !!w.document.querySelector(".itn-cr-print"));
  button("Whole class").click();
  button("Open print preview").click();
  await wait(() => popup.document.getElementById("print")?.disabled === false);
  const printed = popup.document.body.textContent;
  assert.match(printed, /Mock Test 1 · Paper · 24 Oct 2026/);
  assert.match(printed, /29 \/ 406\.0–7\.0/);
  assert.match(printed, /indicative band range/);
  assert.deepEqual(errors, []);
  dom.window.close();
});
