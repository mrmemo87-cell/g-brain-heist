import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { unzipSync, strFromU8 } from "fflate";
const b = await build({
  stdin: {
    contents:
      "export {populateLessonPowerPoint} from './services/ieltsLessonPowerPoint';export {lessonPresentation} from './services/ieltsLessonPresentation'",
    loader: "ts",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { populateLessonPowerPoint, lessonPresentation } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
const template = new Uint8Array(
  readFileSync("public/ielts/lessons/ielts-01-v2-template.pptx"),
);
const lesson = {
  school: { name: "School A & School B" },
  materials: [3, 4].map((n) => ({
    display_code: `L-00${n}`,
    title: "Approved activity",
    instructions: "Read questions first.",
    questions: Array.from({ length: 6 }, (_, i) => ({
      prompt: `Question ${i + 1} <detail>`,
      accepted_answers: ["SECRET"],
    })),
  })),
};
test("editable PowerPoint uses authorised school and questions with guided-practice reveals and no unresolved tokens", () => {
  const files = unzipSync(populateLessonPowerPoint(template, lesson));
  const slides = Object.entries(files)
    .filter(([p]) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .map(([, v]) => strFromU8(v));
  assert.equal(slides.length, 34);
  const text = slides.join("");
  assert.ok(text.includes("School A &amp; School B"));
  assert.ok(text.includes("Question 6 &lt;detail&gt;"));
  assert.equal(slides.filter((s) => s.includes("SECRET")).length, 12);
  assert.equal(slides.filter((s) => s.includes("<p:fade/>")).length, 34);
  assert.ok(!text.includes("advTm="));
  assert.ok(!text.includes("{{"));
  assert.throws(() =>
    populateLessonPowerPoint(template, { ...lesson, materials: [] }),
  );
});

test("LB-04 static PowerPoint preserves all content and removes every transition", () => {
  const animated = unzipSync(populateLessonPowerPoint(template, lesson));
  const reduced = unzipSync(populateLessonPowerPoint(template, lesson, true));
  for (const [p, bytes] of Object.entries(reduced)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(p)) continue;
    const xml = strFromU8(bytes);
    assert.ok(!xml.includes("<p:transition"));
    assert.equal(
      xml,
      strFromU8(animated[p]).replace(
        /<p:transition\b[^>]*>[\s\S]*?<\/p:transition>/g,
        "",
      ),
    );
  }
});
test("LB-01 public template carries no fixture key or school name", () => {
  const all = Object.values(unzipSync(template)).map(strFromU8).join(" ");
  assert.ok(!all.includes("SECRET"));
  assert.ok(!all.includes("School A"));
  assert.ok(all.includes("{{L3_A1}}"));
});

test("LB-03/04 both formats share every headline, body and stage in the same order", () => {
  const files = unzipSync(populateLessonPowerPoint(template, lesson));
  const expected = lessonPresentation(lesson);
  for (const [i, slide] of expected.entries()) {
    const d = new JSDOM(strFromU8(files[`ppt/slides/slide${i + 1}.xml`]), {
      contentType: "text/xml",
    }).window.document;
    const shapes = [...d.getElementsByTagName("p:sp")];
    const read = (name) => {
      const shape = shapes.find(
        (s) =>
          s.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") === name,
      );
      return [...shape.getElementsByTagName("a:t")]
        .map((x) => x.textContent)
        .join("\n");
    };
    assert.equal(read("headline"), slide.title);
    assert.equal(read("body"), slide.body);
    assert.equal(read("phase"), slide.phase);
    assert.ok(files[`ppt/notesSlides/notesSlide${i + 1}.xml`]);
  }
});
