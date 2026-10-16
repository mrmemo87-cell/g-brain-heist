import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
const audioFixture = new Uint8Array([1, 2, 3, 4]);
const fixtureAudioHash = createHash("sha256")
  .update(audioFixture)
  .digest("hex");
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
async function waitFor(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Expected lesson UI state did not settle");
    await wait();
  }
}
function pack(s) {
  return {
    school: {
      id: s,
      name: s === "school-a" ? "School A" : "School B",
      logo_url: null,
    },
    lesson_code: "IELTS-01",
    version: "1.1.0",
    reading_backup: {
      code: "bh-ielts-targeted-reading-r1-v1",
      display_code: "R-001",
      title: "Approved reading",
      version: "0.1.0",
      content_sha256: "c".repeat(64),
      instructions: "Choose TRUE FALSE NOT GIVEN.",
      passage: "An approved Reading practice passage.",
      teacher_notes: "PRIVATE READING NOTES",
      questions: Array.from({ length: 6 }, (_, i) => ({
        id: `r${i + 1}`,
        prompt: `Statement ${i + 1}`,
        accepted_answers: ["SECRET READING KEY"],
      })),
    },
    materials: [3, 4].map((n) => ({
      code: `bh-ielts-targeted-listening-l${n}-v1`,
      display_code: `L-00${n}`,
      title: "Guided listening",
      version: "0.1.0",
      content_sha256: "a".repeat(64),
      audio_sha256: fixtureAudioHash,
      audio_bucket: "ielts-targeted-listening",
      audio_path: "x",
      teacher_notes: "PRIVATE SCRIPT",
      instructions: "Read first.",
      questions: Array.from({ length: 6 }, (_, i) => ({
        id: `q${i + 1}`,
        prompt: `Day ${i + 1}`,
        accepted_answers: ["SECRET KEY"],
      })),
    })),
  };
}
async function setup(deny = false, tamper = false) {
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
  // Keep encoder-produced byte arrays in the same realm as fflate.
  w.Uint8Array = Uint8Array;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.Request = Request;
  w.Response = Response;
  w.Headers = Headers;
  w.Blob = Blob;
  Object.defineProperty(w, "crypto", { value: webcrypto });
  const downloads = [];
  w.URL.createObjectURL = (b) => {
    downloads.push(b);
    return "blob:mock";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  w.fetch = async (url, opts) => {
    if (String(url).startsWith("/ielts/lessons/"))
      return {
        ok: true,
        arrayBuffer: async () => {
          const bytes = readFileSync(
            "public/ielts/lessons/ielts-01-v2-template.pptx",
          );
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          );
        },
      };
    if (String(url).includes("/storage/v1/object/"))
      return {
        ok: true,
        blob: async () =>
          new Blob([tamper ? new Uint8Array([9]) : audioFixture], {
            type: "audio/mpeg",
          }),
      };
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
  await waitFor(() => w.document.body.textContent.includes("School A") || w.document.querySelector('[role="alert"]'));
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
test("teacher lesson library shows compact files by audience and keeps guidance collapsed", async () => {
  const { d, w, errors } = await setup();
  const groups = [...w.document.querySelectorAll(".lesson-resource-group h4")].map((h) => h.textContent);
  const resourceDisclosures = [...w.document.querySelectorAll(".lesson-resource-grid > .ip-disclosure")];
  assert.equal(resourceDisclosures.length, 4, "Classroom resource groups are individually collapsible");
  assert.equal(resourceDisclosures[3].open, false, "Private keys remain collapsed by default");
  resourceDisclosures[3].querySelector("summary").click();
  await waitFor(() => resourceDisclosures[3].open);
  assert.equal(resourceDisclosures[0].open, true, "Other resource sections keep their state");
  assert.deepEqual(groups, [
    "01 · Before class",
    "02 · Present",
    "03 · Give students",
    "04 · Teacher only",
  ]);
  const overview = w.document.querySelector(".lesson-overview");
  assert.match(overview.textContent, /Available to teach/);
  assert.match(overview.textContent, /IELTS-01/);
  assert.match(overview.textContent, /60 minutes/);
  const accordionSections = [...w.document.querySelectorAll(".lesson-library-content > .ip-disclosure")];
  assert.equal(accordionSections.length, 4, "Lesson essentials, resources, audio and guidance have separate collapsible navigation");
  assert.equal(accordionSections[0].open, true, "Lesson essentials visible by default");
  assert.equal(accordionSections[1].open, true, "Resource downloads visible by default");
  assert.equal(accordionSections[2].open, false, "Audio files initially compact");
  assert.equal(accordionSections[3].open, false, "Long lesson guidance initially compact");
  accordionSections[2].querySelector("summary").click();
  await waitFor(() => accordionSections[2].open);
  assert.equal(accordionSections[1].open, true, "Opening audio does not hide teaching resources");
  assert.equal(w.document.querySelectorAll(".lesson-primary-actions .sp-primary").length, 1);
  const groupText = (id) => w.document.getElementById(id).closest("section").textContent;
  assert.match(groupText("lesson-students-title"), /student workbook/);
  assert.doesNotMatch(groupText("lesson-students-title"), /scripts & keys/);
  assert.match(groupText("lesson-keys-title"), /scripts & keys/);
  assert.match(groupText("lesson-present-title"), /motion-free PowerPoint/);
  assert.equal(w.document.querySelectorAll(".lesson-audio").length, 2);
  const instructions = [...w.document.querySelectorAll(".lesson-details")];
  assert.equal(instructions.length, 2);
  assert.ok(instructions.every((x) => !x.open), "Long teaching guidance stays collapsed initially");
  assert.match(w.document.querySelector(".lesson-library-upcoming").textContent, /not released/);
  assert.deepEqual(errors, []);
  d.window.close();
});
test("school switch clears earlier content; access denial offers retry without downloads", async () => {
  const { d, w } = await setup();
  w.show("school-b");
  await waitFor(() => w.document.body.textContent.includes("School B") && !w.document.body.textContent.includes("School A"));
  assert.ok(w.document.body.textContent.includes("School B"));
  assert.ok(!w.document.body.textContent.includes("School A"));
  d.window.close();
  const denied = await setup(true);
  assert.ok(denied.w.document.querySelector('[role="alert"]'));
  assert.ok(!denied.w.document.body.textContent.includes("Download complete"));
  denied.d.window.close();
});

test("LB-05/06/09 complete ZIP includes both presentation modes and bound versions; student files omit keys", async () => {
  const { d, w, downloads, errors } = await setup();
  [...w.document.querySelectorAll("button")]
    .find((x) => x.textContent.includes("Download complete"))
    .click();
  for (let i = 0; i < 20 && !downloads.length; i++) await wait();
  assert.equal(downloads.length, 1, w.document.body.textContent);
  const files = unzipSync(new Uint8Array(await downloads[0].arrayBuffer()));
  assert.ok(files["IELTS-01-presentation.pptx"]);
  assert.ok(files["IELTS-01-presentation-static.pptx"]);
  const manifest = JSON.parse(strFromU8(files["versions.json"]));
  assert.equal(manifest.school.name, "School A");
  assert.equal(manifest.presentation_version, "2.0.0");
  assert.equal(manifest.lesson_bible_version, "1.0.0");
  assert.equal(manifest.teacher_guide_version, "1.1.0");
  assert.ok(files["01-START-HERE.html"]);
  assert.ok(files["IELTS-01-plan-b.html"]);
  assert.ok(files["IELTS-01-reading-paper.html"]);
  assert.ok(files["IELTS-01-reading-paper-keys.html"]);
  const paper = strFromU8(files["IELTS-01-reading-paper.html"]);
  assert.ok(paper.includes("An approved Reading practice passage."));
  assert.ok(!paper.includes("SECRET READING KEY"));
  assert.ok(!paper.includes("PRIVATE READING NOTES"));
  assert.ok(
    strFromU8(files["IELTS-01-reading-paper-keys.html"]).includes(
      "SECRET READING KEY",
    ),
  );
  assert.equal(manifest.reading_backup.code, "R-001");
  assert.equal(Object.keys(files)[0], "01-START-HERE.html");
  const guide = new JSDOM(strFromU8(files["01-START-HERE.html"])).window
    .document;
  for (const a of guide.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href.startsWith("https://"))
      assert.ok(files[href], `Guide link must resolve in ZIP: ${href}`);
  }
  const audio = new JSDOM(strFromU8(files["Audio-player.html"])).window
    .document;
  for (const t of audio.querySelectorAll("audio"))
    assert.ok(files[t.getAttribute("src")]);
  assert.ok(
    strFromU8(files["START-HERE.txt"]).includes(
      "Open 01-START-HERE.html first",
    ),
  );
  assert.ok(!strFromU8(files["IELTS-01-students.html"]).includes("SECRET KEY"));
  const staticSlides = Object.entries(
    unzipSync(files["IELTS-01-presentation-static.pptx"]),
  ).filter(([p]) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  assert.equal(staticSlides.length, 34);
  assert.ok(
    staticSlides.every(([, b]) => !strFromU8(b).includes("<p:transition")),
  );
  assert.deepEqual(errors, []);
  d.window.close();
});

test("LB-05 audio hash mismatch blocks the complete pack instead of exporting unverified recording", async () => {
  const { d, w, downloads } = await setup(false, true);
  [...w.document.querySelectorAll("button")]
    .find((x) => x.textContent.includes("Download complete"))
    .click();
  for (let i = 0; i < 20 && !w.document.querySelector('[role="alert"]'); i++)
    await wait();
  assert.equal(downloads.length, 0);
  assert.ok(
    w.document
      .querySelector('[role="alert"]')
      .textContent.includes("download could not finish"),
  );
  d.window.close();
});
