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
  await wait(() => w.document.body.textContent.includes("What would you like to do?"));
  // Today must offer an obvious next step, followed by the core teacher flow
  // and then the less-frequent tools. Do not render invented band metrics.
  const today = w.document.querySelector(".ip-today");
  assert.ok(today, "Teacher Today workspace is visible");
  const todayDisclosures = [...today.querySelectorAll(".ip-disclosure")];
  assert.ok(todayDisclosures.length >= (manage ? 4 : 3), "Today sections have accessible collapsible navigation");
  assert.equal(todayDisclosures[0].open, true, "Primary action stays open");
  const specialist = todayDisclosures.find((el) => el.querySelector("summary")?.textContent?.includes("More teaching tools"));
  if (manage) {
    assert.ok(specialist, "Specialist tools have an expandable section");
    assert.equal(specialist.open, false, "Less-frequent tools begin collapsed");
    specialist.querySelector("summary").click();
    await wait(() => specialist.open);
    specialist.querySelector("summary").click();
    await wait(() => !specialist.open);
  }
  const primary = today.querySelector(".ip-today-priority .sp-primary");
  assert.ok(primary);
  assert.match(primary.textContent, pending > 0 ? /Open review desk/ : manage ? /Open lesson library/ : /View student progress/);
  const visibleTasks = [...today.querySelectorAll(".ip-today-action-copy strong")].map(x => x.textContent);
  assert.deepEqual(visibleTasks, manage
    ? ["Lessons & teaching packs", "Create assignment", "Writing & Speaking reviews", "Student progress & plans"]
    : ["Writing & Speaking reviews", "Student progress & plans"]);
  const secondary = [...today.querySelectorAll(".ip-today-links button strong")].map(x => x.textContent);
  if (manage) {
    assert.deepEqual(secondary, [
      "Targeted practice", "Practice history", "Course batches",
      "Speaking interviews", "Exam sessions"
    ]);
  } else {
    assert.deepEqual(secondary, []);
  }
  assert.doesNotMatch(today.textContent, /average band|average score|overall band/i);
  assert.ok(today.querySelector(".ip-today-priority").compareDocumentPosition(today.querySelector(".ip-today-teaching")) & w.Node.DOCUMENT_POSITION_FOLLOWING);

  const button = (label) =>
    Array.from(w.document.querySelectorAll("button")).find(
      (b) => b.textContent === label,
    );
  const nav = w.document.querySelector('[aria-label="IELTS teacher workspace"]');
  assert.ok(nav, "Professional teacher navigation exists");
  const groupNames = [...nav.querySelectorAll(".ip-nav-group > summary")].map(el=>el.textContent.trim());
  assert.deepEqual(groupNames, manage
    ? ["◫Overview⌄","▤Teaching & Assignments⌄","✓Assessment & Reviews⌄","♧Programme Management⌄"]
    : ["◫Overview⌄","▤Teaching & Assignments⌄","✓Assessment & Reviews⌄","♧Programme Management⌄"].filter(n=>!n.includes("Teaching & Assignments")));
  if (manage) {
    button("Create assignment").click();
    await wait(() => !!w.document.querySelector(".ip-assignment-entry"));
    assert.equal(w.document.querySelectorAll('input[name="ielts-assignment-scope"]').length,3);
    assert.match(w.document.querySelector(".ip-assignment-entry").textContent,/Entire class/);
    assert.match(w.document.querySelector(".ip-assignment-entry").textContent,/IELTS course batch/);
    assert.match(w.document.querySelector(".ip-assignment-entry").textContent,/Individual student/);
    button("Today").click();
  } else {
    assert.equal(button("Create assignment"),undefined, "Non-managers cannot open assignment creation");
  }
  button("Student progress").click();
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
  button("Programme team").click();
  await wait(() => !!w.document.querySelector(".ip-disclosure"));
  assert.ok([...w.document.querySelectorAll(".ip-disclosure")].some((section) => section.querySelector("summary")?.textContent?.includes("Programme lead & school access")));
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
