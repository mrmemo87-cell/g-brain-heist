import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { unzipSync, strFromU8 } from "fflate";
const b = await build({
  stdin: {
    contents:
      "export {populateLessonPowerPoint} from './services/ieltsLessonPowerPoint'",
    loader: "ts",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { populateLessonPowerPoint } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
const template = new Uint8Array(
  readFileSync("public/ielts/lessons/ielts-01-v1-template.pptx"),
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
test("editable PowerPoint uses authorised school and questions without private keys or unresolved tokens", () => {
  const files = unzipSync(populateLessonPowerPoint(template, lesson));
  const slides = Object.entries(files)
    .filter(([p]) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .map(([, v]) => strFromU8(v));
  assert.equal(slides.length, 22);
  const text = slides.join("");
  assert.ok(text.includes("School A &amp; School B"));
  assert.ok(text.includes("Question 6 &lt;detail&gt;"));
  assert.ok(!text.includes("SECRET"));
  assert.ok(!text.includes("{{"));
  assert.throws(() =>
    populateLessonPowerPoint(template, { ...lesson, materials: [] }),
  );
});
