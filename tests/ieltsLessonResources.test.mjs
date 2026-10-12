import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
const b = await build({
  stdin: {
    contents:
      "export {lessonResourceHtml,escapeLessonHtml} from './services/ieltsLessonResources'",
    loader: "ts",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { lessonResourceHtml } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
const lesson = {
  school: {
    id: "a",
    name: "School A <script>bad()</script>",
    logo_url: "javascript:bad()",
  },
  lesson_code: "IELTS-01",
  version: "1.0.0",
  materials: [
    {
      display_code: "L-003",
      title: "Guided activity",
      version: "1",
      code: "task",
      content_sha256: "hash",
      audio_sha256: "sha",
      instructions: "Read then listen.",
      teacher_notes: "PRIVATE SCRIPT",
      questions: [
        {
          id: "q1",
          prompt: 'Day <img onerror="bad()">',
          accepted_answers: ["SECRETANSWER"],
        },
      ],
    },
  ],
};
test("student and presentation downloads exclude scripts and keys and escape school/material text", () => {
  for (const kind of ["students", "slides", "plan"]) {
    const html = lessonResourceHtml(lesson, kind);
    assert.ok(!html.includes("SECRETANSWER"));
    assert.ok(!html.includes("PRIVATE SCRIPT"));
    const d = new JSDOM(html);
    assert.equal(d.window.document.querySelector("img[onerror]"), null);
    assert.equal(d.window.document.querySelector(".logo"), null);
    assert.ok(d.window.document.body.textContent.includes("School A"));
  }
  const keys = lessonResourceHtml(lesson, "keys");
  assert.ok(keys.includes("SECRETANSWER"));
  assert.ok(keys.includes("PRIVATE SCRIPT"));
});
test("offline presentation has keyboard navigation and print layout; school identity follows the authorised pack", () => {
  const d = new JSDOM(lessonResourceHtml(lesson, "slides"), {
    runScripts: "dangerously",
  });
  const slides = [...d.window.document.querySelectorAll(".slide")];
  assert.equal(slides.filter((x) => !x.hidden).length, 1);
  d.window.document.dispatchEvent(
    new d.window.KeyboardEvent("keydown", { key: "ArrowRight" }),
  );
  assert.equal(slides[1].hidden, false);
  d.window.document.querySelector("#prev").click();
  assert.equal(slides[0].hidden, false);
  assert.ok(
    d.window.document
      .querySelector("style")
      .textContent.includes("@media print"),
  );
  const other = lessonResourceHtml(
    {
      ...lesson,
      school: {
        id: "b",
        name: "School B",
        logo_url: "https://example.org/logo.png",
      },
    },
    "students",
  );
  assert.ok(other.includes("School B"));
  assert.ok(!other.includes("School A"));
});
