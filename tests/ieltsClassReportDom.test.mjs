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

async function open(path) {
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
    if (fn === "rpc_ielts_programme_access") data = { schools: [{ id: "school-a", name: "Test school", can_allocate: true, can_manage: true }] };
    else if (fn === "rpc_ielts_programme_workspace") data = { schools: [{ id: "school-a", name: "Test school" }], school_id: "school-a", can_allocate: true, can_manage: true, lead: null, teachers: [], students: [], total_students: 0, pending_count: 0, queue: [], classes: [], confidence: "low", readiness_available: false };
    else if (fn === "rpc_ielts_speaking_mock_overview") data = { school_id: "school-a", published_mocks: 6, students: [] };
    else if (fn === "rpc_ielts_learning_workspace") data = { manager: true, pilot_only: false, tasks: [], allocations: [] };
    else if (fn === "rpc_ielts_class_report") data = report({ kind: body.p_scope, value: body.p_value, name: body.p_scope === "batch" ? "May group" : body.p_value });
    else throw Error("Unexpected request " + fn);
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  w.eval(code);
  test.after?.(() => { try { dom.window.close(); } catch { /* closed */ } });
  const wait = async (fn) => {
    for (let i = 0; i < 80; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); }
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
