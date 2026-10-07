import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
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
async function check(admin) {
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
        can_manage: true,
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
        can_manage: true,
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
        pending_count: 0,
        queue: [],
        classes: [],
        confidence: "low",
        readiness_available: false,
      };
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
  await wait(() => w.document.body.textContent.includes("Start with the work"));
  const button = (label) =>
    Array.from(w.document.querySelectorAll("button")).find(
      (b) => b.textContent === label,
    );
  button("Student progress").click();
  await wait(() => w.document.body.textContent.includes("8 / 12 · Screener"));
  assert(w.document.body.textContent.includes("No submitted evidence"));
  button("Programme team").click();
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
