// One IELTS tab bar for teachers (Visual & UX Bible §13.12): the same bar inside school administration (with the
// School tab and admin pages under it) and on teacher pages outside the workspace (IeltsTeacherPageBar).
import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {RouterProvider,createBrowserRouter} from './src/lib/router';
import Programme from './src/pages/ielts/IeltsProgrammeWorkspace';
import PageBar from './src/components/ielts/teacher/IeltsTeacherPageBar';
function Admin(){
  const [view,setView]=React.useState(null);
  const [changes,setChanges]=React.useState(0);
  return <div>
    <button type="button" id="open-review" onClick={()=>setView({tab:'reviews',node:<p id="admin-review">Opened review</p>})}>open</button>
    <span id="changes">{changes}</span>
    <Programme embedded schoolId="school-a" initialSection={window.__initialSection} initialSchoolTool={window.__initialTool}
      adminView={view} onSectionChange={()=>{setView(null);setChanges((n)=>n+1);}}
      adminTools={{results:<p id="tool-results">Results tool</p>,journeys:<p id="tool-journeys">Journeys tool</p>,settings:<p id="tool-settings">Settings tool</p>}}
      adminExams={<p id="admin-exams">Guarded exam workspace</p>} />
  </div>;
}
createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([
  {path:'/admin',element:<Admin/>},
  {path:'/plain',element:<Programme schoolId="school-a"/>},
  {path:'/ielts/speaking-pilot/se-1',element:<div><PageBar active="reviews"/><main id="session">Session</main></div>},
  {path:'/ielts/programme',element:<p id="workspace-route">Workspace</p>},
])}/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  write: false,
  loader: { ".css": "empty" },
  define: { "import.meta": JSON.stringify({ env: { VITE_SUPABASE_URL: "https://test.supabase.co", VITE_SUPABASE_ANON_KEY: "test-key" } }) },
  logLevel: "silent",
});
const code = bundle.outputFiles[0].text;

async function open(path, { schools = [{ id: "school-a", name: "Test school", can_allocate: true, can_manage: true }], init = {} } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" + path, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  Object.assign(w, { TextEncoder, TextDecoder, Request, Response, Headers });
  Object.assign(w, init);
  w.fetch = async (url) => {
    const fn = String(url).split("/").pop();
    let data;
    if (fn === "rpc_ielts_programme_access") data = { schools };
    else if (fn === "rpc_ielts_programme_workspace") data = { schools, school_id: "school-a", can_allocate: true, can_manage: true, lead: null, teachers: [], students: [], total_students: 0, pending_count: 2, queue: [], classes: [], confidence: "low", readiness_available: false };
    else if (fn === "rpc_ielts_speaking_mock_overview") data = { school_id: "school-a", published_mocks: 6, students: [] };
    else if (fn === "rpc_ielts_review_queue") data = [];
    else if (fn === "rpc_ielts_learning_workspace") data = { manager: true, pilot_only: false, tasks: [], allocations: [] };
    else if (fn === "rpc_ielts_teacher_practice_history") data = { rows: [], has_more: false };
    else throw Error("Unexpected request " + fn);
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  w.eval(code);
  // Close the window even when an assertion fails, so a failing test never keeps the process alive.
  test.after?.(() => { try { dom.window.close(); } catch { /* already closed */ } });
  const wait = async (fn) => {
    for (let i = 0; i < 60; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); }
    throw Error("UI did not settle: " + w.document.body.textContent.slice(0, 400));
  };
  const tabs = () => [...w.document.querySelectorAll(".itn-nav > .itn-link")].map((b) => b.querySelector(".isn-label").childNodes[0].textContent);
  const tab = (label) => [...w.document.querySelectorAll(".itn-nav > .itn-link")].find((b) => b.querySelector(".isn-label").childNodes[0].textContent === label);
  const current = () => w.document.querySelector('.itn-nav [aria-current="page"] .isn-label')?.childNodes[0].textContent;
  return { w, dom, errors, wait, tabs, tab, current };
}

test("inside school administration there is one bar, with a School tab for results, journeys and settings", async () => {
  const { w, dom, errors, wait, tabs, tab, current } = await open("/admin");
  await wait(() => !!w.document.querySelector(".itn-today"));
  assert.deepEqual(tabs(), ["Today", "Reviews", "Students", "Speaking", "Assign", "Batches", "Lessons", "Exams", "Team", "School"]);
  assert.equal(w.document.querySelectorAll("nav").length, 1, "no second IELTS menu");
  assert.ok(w.document.querySelector(".itn-page.itn-embedded"), "embedded styles keep the bar off the portal's phone bar");

  tab("School").click();
  await wait(() => !!w.document.querySelector("#tool-results"));
  assert.equal(w.document.querySelector(".itn-head h1").textContent, "School IELTS administration");
  assert.equal(current(), "School");
  [...w.document.querySelectorAll(".itn-segmented button")].find((b) => b.textContent === "IELTS settings").click();
  await wait(() => !!w.document.querySelector("#tool-settings"));
  assert.match(w.location.search, /schoolTool=settings/);

  tab("Exams").click();
  await wait(() => !!w.document.querySelector("#admin-exams"));

  // A page the portal opens (a review) sits under the same bar, and any tab closes it.
  w.document.querySelector("#open-review").click();
  await wait(() => !!w.document.querySelector("#admin-review"));
  assert.equal(current(), "Reviews");
  assert.equal(w.document.querySelector(".itn-head"), null);
  tab("Students").click();
  await wait(() => !w.document.querySelector("#admin-review") && w.document.querySelector(".itn-head h1")?.textContent === "Student progress");
  assert.ok(Number(w.document.querySelector("#changes").textContent) >= 3);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test("school-admin addresses open the matching place in the bar", async () => {
  const { w, dom, wait, current } = await open("/admin", { init: { __initialSection: "school", __initialTool: "journeys" } });
  await wait(() => !!w.document.querySelector("#tool-journeys"));
  assert.equal(current(), "School");
  assert.equal(w.document.querySelector('.itn-segmented [aria-pressed="true"]').textContent, "Student journeys");
  dom.window.close();
});

test("teachers outside school administration never see the School tab", async () => {
  const { w, dom, wait, tabs } = await open("/plain");
  await wait(() => !!w.document.querySelector(".itn-today"));
  assert.ok(!tabs().includes("School"));
  await wait(() => !!w.sessionStorage.getItem("bh-ielts-teacher-bar"));
  assert.equal(JSON.parse(w.sessionStorage.getItem("bh-ielts-teacher-bar")).review_count, 2, "the workspace leaves the bar's review count for other teacher pages");
  // Let the Today requests settle before closing the window, so nothing keeps the test process alive.
  await new Promise((r) => setTimeout(r, 200));
  dom.window.close();
});

test("teacher pages outside the workspace show the same bar and go back to it", async () => {
  const { w, dom, errors, wait, tabs, tab, current } = await open("/ielts/speaking-pilot/se-1");
  w.sessionStorage.setItem("bh-ielts-teacher-bar", JSON.stringify({ school_id: "school-a", school_name: "Test school", can_manage: true, review_count: 4 }));
  await wait(() => tabs().length === 9);
  assert.equal(current(), "Reviews");
  assert.equal(w.document.querySelector(".itn-nav .isn-badge").textContent, "4");
  assert.equal(w.document.querySelector(".itn-pagebar .isn-back").textContent.trim(), "← IELTS teaching");
  tab("Speaking").click();
  await wait(() => !!w.document.querySelector("#workspace-route"));
  assert.equal(w.location.pathname + w.location.search, "/ielts/programme?programmeSection=speaking&school=school-a");
  assert.deepEqual(errors, []);
  dom.window.close();
});

test("students opening their own Speaking feedback see no teacher bar", async () => {
  const { w, dom, wait } = await open("/ielts/speaking-pilot/se-1", { schools: [] });
  await wait(() => !!w.document.querySelector("#session"));
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(w.document.querySelector(".itn-pagebar"), null);
  dom.window.close();
});
