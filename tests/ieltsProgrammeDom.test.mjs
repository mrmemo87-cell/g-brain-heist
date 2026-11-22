import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Programme from './src/pages/ielts/IeltsProgrammeWorkspace';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/_programme-check.html',element:<Programme schoolId="school-a"/>}])}/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  write: false,
  loader: { ".css": "empty" },
  define: {
    "import.meta":
      JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}}),
  },
  logLevel: "silent",
});
const code = bundle.outputFiles[0].text;
async function check(admin, pending = 0, manage = true) {
  const calls = [];
  let lead = null;
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/_programme-check.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.Request = Request;
  w.Response = Response;
  w.Headers = Headers;
  w.fetch = async (url, options) => {
    const fn = String(url).split("/").pop();
    const args = JSON.parse(options?.body || "{}");
    calls.push({ fn, args });
    const schools = [
      {
        id: "school-a",
        name: "Test school",
        can_allocate: admin,
        can_manage: manage,
      },
    ];
    let data;
    if (fn === "rpc_ielts_set_programme_lead") {
      lead = {
        id: args.p_change_id,
        teacher_id: args.p_teacher_id,
        name: "Test teacher",
        active: true,
      };
      data = null;
    } else if (fn === "rpc_ielts_programme_access") data = { schools };
    else if (fn === "rpc_ielts_programme_workspace")
      data = {
        schools,
        school_id: "school-a",
        can_allocate: admin,
        can_manage: manage,
        lead,
        teachers: admin ? [{ id: "teacher-a", name: "Test teacher" }] : [],
        students: [
          {
            id: "student-a",
            name: "Test student",
            listening: { attempt_id: "saved-a", raw_score: 8, total: 12 },
            reading: null,
            writing: null,
            speaking: null,
          },
        ],
        total_students: 1,
        pending_count: pending,
        queue: [],
        classes: [],
        confidence: "low",
        readiness_available: false,
      };
    else if (fn === "rpc_ielts_learning_report_context")
      data = {
        school_id: "school-a",
        student_id: args.p_student,
        student_name: "Test student",
        school_name: "Test school",
        can_manage: manage,
        plan: null,
        years: [],
        evidence: [],
        reports: [],
      };
    else if (fn === "rpc_ielts_batches") data = [];
    else if (fn === "rpc_ielts_speaking_mock_overview") data = {
      school_id: args.p_school_id, published_mocks: 6, students: [
        { id: "student-b", name: "Bek", mocks_had: 0, current: null },
        { id: "student-a", name: "Aida", mocks_had: 1, current: { assignment_id: "as-1", title: "Speaking practice mock C", assigned_at: "2026-11-20T08:00:00Z", session_id: "se-1", finished_at: "2026-11-21T08:00:00Z", state: "to_review" } },
      ] };
    else if (fn === "rpc_ielts_assign_speaking_mock_mix") data = { assigned: args.p_assignments.length, by_mock: {}, skipped: [] };
    else if (fn === "rpc_ielts_review_queue") data = [];
    else if (fn === "rpc_ielts_learning_workspace") data = { manager: true, pilot_only: false, tasks: [], allocations: [] };
    else throw Error("Unexpected request " + fn);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  w.eval(code);
  const wait = async (fn) => {
    for (let i = 0; i < 50; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("UI did not settle: " + w.document.body.textContent);
  };
  await wait(() => !!w.document.querySelector(".itn-today"));
  // Today shows only what needs the teacher now, then a few shortcuts; no invented band metrics.
  const today = w.document.querySelector(".itn-today");
  assert.match(today.querySelector(".isn-summary").textContent, pending > 0 ? new RegExp(pending + " submissions to review") : /Nothing is waiting for you/);
  if (pending > 0) assert.ok(today.querySelector(".itn-see-all"), "More waiting work than shown links to Reviews");
  else assert.ok(today.querySelector(".isn-caught-up"), "An empty queue says so plainly");
  // One IELTS map: every area once, grouped by the teacher's job (Visual & UX Bible 13.12).
  const map = today.querySelector(".itn-map");
  assert.ok(map, "Today shows the IELTS map");
  assert.deepEqual([...map.querySelectorAll(".itn-map-group h3")].map(x => x.textContent), manage
    ? ["Check work", "Give work", "Teach", "Know your students", "Run tests", "Set up"]
    : ["Check work", "Give work", "Know your students", "Run tests", "Set up"]);
  assert.deepEqual([...map.querySelectorAll(".itn-map-spot strong")].map(x => x.firstChild.textContent), manage
    ? ["Reviews", "Practice history", "Create assignment", "Targeted practice", "Speaking practice mocks", "Lessons", "Batches", "Student progress", "Exam sessions", "Speaking interviews", "Programme team"]
    : ["Reviews", "Speaking practice mocks", "Student progress", "Speaking interviews", "Programme team"]);
  assert.equal(today.querySelector(".itn-tiles"), null, "No second shortcut grid");
  assert.equal([...today.querySelectorAll(".isn-group")].find(g => g.textContent.includes("More tools")), undefined, "Nothing hidden in a folded box");
  assert.doesNotMatch(today.textContent, /average band|average score|overall band/i);

  const button = (label) =>
    Array.from(w.document.querySelectorAll("button")).find(
      (b) => b.textContent === label,
    );
  const nav = w.document.querySelector('[aria-label="IELTS teacher workspace"]');
  assert.ok(nav, "Teacher navigation exists");
  const tabLabel = (el) => el.querySelector(".isn-label")?.firstChild?.textContent.trim();
  const tab = (label) => [...nav.querySelectorAll(".itn-link")].find((b) => tabLabel(b) === label);
  assert.deepEqual([...nav.querySelectorAll(".itn-link:not(.itn-more-button)")].map(tabLabel), manage
    ? ["Today","Reviews","Students","Speaking","Batches","Lessons","Practice","Exams","Team"]
    : ["Today","Reviews","Students","Speaking","Team"], "Every destination is a tab on desktop");
  assert.equal(!!nav.querySelector(".itn-more-button"), manage, "Phones get More only when there are extra tools");
  assert.equal(tabLabel(nav.querySelector('[aria-current="page"]')), "Today");
  if (pending > 0) assert.match(nav.textContent, new RegExp(`Reviews \\(${pending} waiting\\)`));
  if (manage) {
    nav.querySelector(".itn-more-button").click();
    await wait(() => !!nav.querySelector(".itn-sheet"));
    assert.deepEqual([...nav.querySelectorAll(".itn-sheet-item strong")].map(x => x.textContent), ["Batches","Lessons","Practice","Exams","Team"]);
    [...today.querySelectorAll(".itn-map-spot")].find(b => b.querySelector("strong")?.firstChild.textContent === "Create assignment").click();
    await wait(() => !!w.document.querySelector(".ip-assignment-entry"));
    assert.equal(w.document.querySelectorAll('input[name="ielts-assignment-scope"]').length,3);
    assert.match(w.document.querySelector(".ip-assignment-entry").textContent,/Entire class/);
    assert.match(w.document.querySelector(".ip-assignment-entry").textContent,/IELTS course batch/);
    assert.match(w.document.querySelector(".ip-assignment-entry").textContent,/Individual student/);
    assert.equal(tabLabel(nav.querySelector('[aria-current="page"]')), "Practice", "Creating an assignment belongs to Practice");
    tab("Today").click();
  } else {
    assert.equal(button("Create assignment"),undefined, "Non-managers cannot open assignment creation");
  }
  tab("Students").click();
  await wait(() => w.document.body.textContent.includes("8 / 12 · Screener"));
  assert(w.document.body.textContent.includes("No submitted evidence"));
  assert.ok(w.document.querySelector(".isi-matrix"), "Student evidence matrix renders");
  const learnerButton = w.document.querySelector(".isi-student-button");
  assert.ok(learnerButton, "Each student has an accessible intelligence action");
  learnerButton.click();
  await wait(() => !!w.document.querySelector(".isi-drawer"));
  assert.match(w.document.querySelector(".isi-drawer").textContent, /Student intelligence/);
  assert.ok(w.document.querySelector(".isi-selected"), "Selected student is highlighted");
  const sections = [...w.document.querySelectorAll(".isi-drawer .isi-accordion")];
  assert.equal(sections.length, 5, "Five student intelligence sections can collapse");
  assert.ok(sections.some((section) => section.textContent.includes("Recent activity")));
  const recent = sections.find((section) => section.textContent.includes("Recent activity"));
  assert.equal(recent.open, false, "Activity history starts collapsed");
  recent.querySelector("summary").click();
  await wait(() => recent.open);
  assert.equal(w.document.querySelector(".isi-evidence-grid").closest("details").open, true, "Latest evidence remains expanded independently");
  assert.ok(w.document.querySelector(".isi-evidence-grid"), "All four skill cards are visible");
  assert.equal(w.document.querySelectorAll(".isi-evidence-card").length, 4);
  await wait(() => calls.some((entry) => entry.fn === "rpc_ielts_learning_report_context"));
  assert.equal(calls.find((entry) => entry.fn === "rpc_ielts_learning_report_context").args.p_student, "student-a");
  w.document.querySelector(".isi-close").click();
  await wait(() => !w.document.querySelector(".isi-drawer"));
  // Speaking desk: the whole class at once, work waiting for the teacher first (Visual & UX Bible 13.12).
  tab("Speaking").click();
  await wait(() => !!w.document.querySelector(".itn-sd-row"));
  assert.equal(w.document.querySelector(".itn-head h1").textContent, "Speaking desk");
  const rows = [...w.document.querySelectorAll(".itn-sd-row")];
  assert.deepEqual(rows.map((r) => r.querySelector("strong").textContent), ["Aida", "Bek"], "Finished mocks waiting for review come first");
  assert.equal(rows[0].querySelector(".itn-sd-act button").textContent, "Review →");
  assert.match(w.document.querySelector(".itn-sd-filters").textContent, /To review 1/);
  button("Give a new mock to 2 students").click();
  await wait(() => calls.some((c) => c.fn === "rpc_ielts_assign_speaking_mock_mix"));
  assert.deepEqual(calls.find((c) => c.fn === "rpc_ielts_assign_speaking_mock_mix").args.p_assignments.map((a) => a.student_id).sort(), ["student-a", "student-b"]);
  await wait(() => !!w.document.querySelector(".itn-message"));
  assert.match(w.document.querySelector(".itn-message").textContent, /2 students have a new mock/);
  tab("Team").click();
  await wait(() => w.document.querySelector(".itn-head h1")?.textContent === "Programme team");
  assert.equal(w.document.querySelector(".itn-head h1").textContent, "Programme team");
  await wait(() => w.document.body.textContent.includes("A clear owner"));
  if (admin) {
    const select = w.document.querySelector("fieldset select");
    select.value = "teacher-a";
    select.dispatchEvent(new w.Event("change", { bubbles: true }));
    const save = button("Save allocation");
    assert.equal(save.disabled, true);
    w.document.querySelector("fieldset input[type=checkbox]").click();
    await wait(() => !button("Save allocation").disabled);
    button("Save allocation").click();
    await wait(() =>
      w.document.body.textContent.includes("Test teacher · Programme lead"),
    );
    const request = calls.find((x) => x.fn === "rpc_ielts_set_programme_lead");
    assert.equal(request.args.p_school_id, "school-a");
    assert.equal(request.args.p_teacher_id, "teacher-a");
    assert.equal(request.args.p_expected_lead_id, null);
    assert.match(request.args.p_change_id, /^[\da-f-]{36}$/);
  } else {
    assert.equal(w.document.querySelector("fieldset"), null);
    assert(
      w.document.body.textContent.includes(
        "Your school administrator manages this allocation",
      ),
    );
  }
  assert.deepEqual(errors, []);
  dom.window.close();
  return {
    mode: admin ? "administrator" : "teacher",
    requests: calls.length,
    render: true,
    allocation: admin ? "confirmed payload" : "hidden",
  };
}
test("school administrator confirms allocation before submitting a scoped request", async () => {
  await check(true);
});
test("programme teacher can inspect evidence but cannot allocate a lead", async () => {
  await check(false);
});
test("pending reviews take priority over lesson preparation on Today", async () => {
  await check(false, 3);
});
test("staff without programme management sees only permitted everyday actions", async () => {
  await check(false, 0, false);
});

// Regression: a scrollable grid used to compress every open drawer section to ~80px.
test("student intelligence drawer scrolls complete panels without clipping", () => {
  const css = readFileSync("src/styles/ielts-student-progress.css", "utf8");
  assert.match(css, /\.ip-page \.isi-drawer-scroll\s*\{[^}]*display:\s*flex;/s);
  assert.match(css, /\.ip-page \.isi-drawer-scroll\s*>\s*\.isi-accordion\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(css, /\.ip-page \.isi-drawer-scroll \.isi-section-content\s*\{[^}]*overflow:\s*visible;/s);
});
