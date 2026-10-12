import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
const buildResult = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Library from './src/pages/ielts/IeltsLessonLibrary';const root=createRoot(document.getElementById('root'));window.show=s=>root.render(<Library key={s} schoolId={s} onClose={()=>window.action='close'} onAssign={()=>window.action='assign'} onProgress={()=>window.action='progress'}/>);window.show('school-a');`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  loader: { ".css": "empty" },
  define: {
    "import.meta": JSON.stringify({
      env: {
        VITE_SUPABASE_URL: "https://test.supabase.co",
        VITE_SUPABASE_ANON_KEY: "test",
      },
    }),
  },
  logLevel: "silent",
});
const wait = () => new Promise((r) => setTimeout(r, 35));
function pack(s) {
  return {
    school: {
      id: s,
      name: s === "school-a" ? "School A" : "School B",
      logo_url: null,
    },
    lesson_code: "IELTS-01",
    version: "1.0.0",
    materials: [3, 4].map((n) => ({
      code: `bh-ielts-targeted-listening-l${n}-v1`,
      display_code: `L-00${n}`,
      title: "Guided listening",
      version: "0.1.0",
      content_sha256: "a".repeat(64),
      audio_sha256: "b".repeat(64),
      audio_bucket: "ielts-targeted-listening",
      audio_path: "x",
      teacher_notes: "PRIVATE SCRIPT",
      instructions: "Read first.",
      questions: [
        { id: "q1", prompt: "Day", accepted_answers: ["SECRET KEY"] },
      ],
    })),
  };
}
async function setup(deny = false) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => {
    if (!e.message.includes("navigation")) errors.push(e.message);
  });
  const d = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = d.window;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.Request = Request;
  w.Response = Response;
  w.Headers = Headers;
  w.Blob = Blob;
  const downloads = [];
  w.URL.createObjectURL = (b) => {
    downloads.push(b);
    return "blob:mock";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  w.fetch = async (url, opts) => {
    const args = JSON.parse(opts.body);
    return new Response(
      JSON.stringify(
        deny ? { message: "not_authorized" } : pack(args.p_school),
      ),
      {
        status: deny ? 403 : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  w.eval(buildResult.outputFiles[0].text);
  await wait();
  return { d, w, downloads, errors };
}
test("lesson library loads school resources and downloads a workbook without keys", async () => {
  const { d, w, downloads, errors } = await setup();
  assert.ok(w.document.body.textContent.includes("School A"));
  const buttons = [...w.document.querySelectorAll("button")];
  buttons.find((x) => x.textContent.includes("student workbook")).click();
  assert.equal(downloads.length, 1);
  const text = await downloads[0].text();
  assert.ok(text.includes("School A"));
  assert.ok(!text.includes("SECRET KEY"));
  buttons
    .find((x) => x.textContent.includes("Review student progress"))
    .click();
  assert.equal(w.action, "progress");
  assert.deepEqual(errors, []);
  d.window.close();
});
test("school switch clears earlier content; access denial offers retry without downloads", async () => {
  const { d, w } = await setup();
  w.show("school-b");
  await wait();
  assert.ok(w.document.body.textContent.includes("School B"));
  assert.ok(!w.document.body.textContent.includes("School A"));
  d.window.close();
  const denied = await setup(true);
  assert.ok(denied.w.document.querySelector('[role="alert"]'));
  assert.ok(!denied.w.document.body.textContent.includes("Download complete"));
  denied.d.window.close();
});
