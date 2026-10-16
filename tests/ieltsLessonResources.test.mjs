import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
const b = await build({
  stdin: {
    contents:
      "export {lessonResourceHtml,escapeLessonHtml,lessonAudioPlayerHtml} from './services/ieltsLessonResources'",
    loader: "ts",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { lessonResourceHtml, lessonAudioPlayerHtml } = await import(
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
test("student downloads exclude scripts and keys and escape school/material text", () => {
  for (const kind of ["students", "plan", "start"]) {
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

test("LB-03 guided reveal follows question, has no script, and stays hidden until teacher advance", () => {
  const d = new JSDOM(lessonResourceHtml(lesson, "slides"), {
    runScripts: "dangerously",
  });
  const doc = d.window.document,
    slides = [...doc.querySelectorAll(".slide")];
  const reveal = slides.findIndex((s) => s.classList.contains("reveal"));
  assert.equal(slides[reveal].hidden, true);
  assert.ok(
    slides[reveal - 1].textContent.includes(
      lesson.materials[0].questions[0].prompt,
    ),
  );
  assert.ok(slides[reveal].textContent.includes("SECRETANSWER"));
  assert.ok(!doc.body.textContent.includes("PRIVATE SCRIPT"));
  for (let i = 0; i < reveal; i++) doc.querySelector("#next").click();
  assert.equal(slides[reveal].hidden, false);
  assert.ok(doc.querySelector("#status").textContent.includes("ANSWER 1"));
  assert.equal(slides[reveal].querySelector("aside").hidden, true);
  doc.querySelector("#notes").click();
  assert.equal(slides[reveal].querySelector("aside").hidden, false);
});
test("LB-04 reduced motion, bounds, slide selector and focused keyboard controls", () => {
  const d = new JSDOM(lessonResourceHtml(lesson, "slides"), {
    runScripts: "dangerously",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: true });
    },
  });
  const doc = d.window.document;
  assert.ok(doc.body.classList.contains("reduced-motion"));
  assert.equal(doc.querySelector("#prev").disabled, true);
  doc.querySelector("#motion").click();
  assert.ok(!doc.body.classList.contains("reduced-motion"));
  const jump = doc.querySelector("#jump");
  jump.value = "2";
  jump.dispatchEvent(new d.window.Event("change"));
  assert.equal(doc.querySelectorAll(".slide")[2].hidden, false);
  jump.dispatchEvent(
    new d.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  assert.equal(doc.querySelectorAll(".slide")[2].hidden, false);
  doc.dispatchEvent(new d.window.KeyboardEvent("keydown", { key: "End" }));
  assert.equal(doc.querySelector("#next").disabled, true);
  doc.dispatchEvent(new d.window.KeyboardEvent("keydown", { key: "Home" }));
  assert.equal(doc.querySelector("#prev").disabled, true);
  doc.dispatchEvent(new d.window.KeyboardEvent("keydown", { key: " " }));
  assert.equal(doc.querySelectorAll(".slide")[1].hidden, false);
  assert.ok(
    doc
      .querySelector("style")
      .textContent.includes("@media(prefers-reduced-motion:reduce)"),
  );
  assert.ok(!doc.querySelector("script").textContent.includes("setInterval"));
});

test("LB-02/05/07 teacher guide separates recording choices and walks through every step", () => {
  for (const kind of ["start", "plan"]) {
    const d = new JSDOM(lessonResourceHtml(lesson, kind)).window.document;
    const steps = [...d.querySelectorAll(".guide-step")];
    assert.equal(steps.length, 7);
    for (const [i, s] of steps.entries()) {
      assert.equal(s.id, `step-${i + 1}`);
      assert.ok(s.textContent.includes("Open:"));
      assert.ok(s.textContent.includes("Say:"));
      assert.ok(s.textContent.includes("Before moving on:"));
      assert.ok(s.querySelectorAll("ol li").length >= 2);
    }
    assert.ok(
      steps[1].textContent.includes("Audio-player.html → Round 1 / L-003"),
    );
    assert.ok(
      steps[1].textContent.includes("Leave slide 3 on screen throughout"),
    );
    assert.ok(
      steps[3].textContent.includes("Audio-player.html → Round 2 / L-004"),
    );
    assert.ok(steps[4].textContent.includes("directions only"));
    assert.ok(steps[4].textContent.includes("Do not require a retake"));
    assert.ok(
      steps[5].textContent.includes(
        "Help with access or technical problems only",
      ),
    );
    assert.ok(
      steps[5].textContent.includes("confirmed submitted/result state"),
    );
    assert.ok(d.body.textContent.includes("same L-003.mp3 and L-004.mp3"));
    assert.ok(d.body.textContent.includes("do not shorten the assessment"));
    assert.ok(!d.body.textContent.includes("SECRETANSWER"));
    assert.ok(!d.body.textContent.includes("PRIVATE SCRIPT"));
    assert.equal(
      d.querySelector(
        'a[href="https://www.brainsheist.com/ielts/reading-screener"]',
      ) !== null,
      true,
    );
    assert.equal(d.querySelector('a[href="Audio-player.html"]') !== null, true);
  }
});
test("workbook explains Reading is online without adding a replacement passage or lesson audio", () => {
  const d = new JSDOM(lessonResourceHtml(lesson, "students")).window.document;
  assert.ok(
    d.body.textContent.includes(
      "reading passages and questions are in Brains Heist, not in this workbook",
    ),
  );
  assert.ok(d.body.textContent.includes("Reading uses no lesson audio"));
  assert.equal(
    d.querySelector(
      'a[href="https://www.brainsheist.com/ielts/reading-screener"]',
    ) !== null,
    true,
  );
  assert.equal(d.querySelectorAll("audio").length, 0);
});

test("guided audio player uses matching MP3s, one active recording, explicit end/error cues and no autoplay", () => {
  const both = {
    ...lesson,
    materials: [
      lesson.materials[0],
      { ...lesson.materials[0], display_code: "L-004" },
    ],
  };
  const paused = [];
  const d = new JSDOM(lessonAudioPlayerHtml(both), {
    runScripts: "dangerously",
    beforeParse(w) {
      w.HTMLMediaElement.prototype.pause = function () {
        paused.push(this.dataset.code);
      };
    },
  });
  const tracks = [...d.window.document.querySelectorAll("audio")];
  assert.deepEqual(
    tracks.map((t) => t.getAttribute("src")),
    ["L-003.mp3", "L-004.mp3"],
  );
  assert.ok(tracks.every((t) => !t.autoplay && t.preload === "none"));
  assert.equal(
    d.window.document.querySelector('a[href="01-START-HERE.html"]') !== null,
    true,
  );
  assert.ok(!d.window.document.querySelector("img[onerror]"));
  tracks[1].dispatchEvent(new d.window.Event("play"));
  assert.deepEqual(paused, ["L-003"]);
  tracks[1].dispatchEvent(new d.window.Event("ended"));
  assert.ok(
    d.window.document
      .querySelector("#audio-status")
      .textContent.includes("L-004 finished"),
  );
  tracks[0].dispatchEvent(new d.window.Event("error"));
  assert.ok(
    d.window.document
      .querySelector("#audio-status")
      .textContent.includes("Extract the complete folder"),
  );
  assert.ok(!d.window.document.body.textContent.includes("SECRETANSWER"));
  assert.ok(!d.window.document.body.textContent.includes("PRIVATE SCRIPT"));
});

const readingLesson = {
  ...lesson,
  reading_backup: {
    code: "bh-ielts-targeted-reading-r1-v1",
    display_code: "R-001",
    title: "Approved reading",
    version: "0.1.0",
    content_sha256: "readinghash",
    instructions: "Choose TRUE FALSE NOT GIVEN.",
    passage: 'Approved passage <img onerror="bad()">',
    teacher_notes: "PRIVATE READING SCRIPT",
    questions: Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      prompt: `Reading statement ${i + 1}`,
      accepted_answers: ["PRIVATE READING ANSWER"],
    })),
  },
};
test("printable approved Reading has six source questions, answer/evidence spaces and no keys/scripts", () => {
  const d = new JSDOM(lessonResourceHtml(readingLesson, "reading-paper")).window
    .document;
  assert.ok(d.body.textContent.includes(readingLesson.reading_backup.passage));
  assert.equal(d.querySelectorAll("ol li").length, 6);
  assert.ok(d.body.textContent.includes("not Reading Screener A"));
  assert.ok(!d.body.textContent.includes("PRIVATE READING ANSWER"));
  assert.ok(!d.body.textContent.includes("PRIVATE READING SCRIPT"));
  assert.equal(d.querySelector("img[onerror]"), null);
  assert.ok(d.querySelector(".break"));
  assert.ok(d.querySelector("style").textContent.includes("size:A4"));
  const keys = lessonResourceHtml(readingLesson, "reading-paper-keys");
  assert.ok(keys.includes("PRIVATE READING ANSWER"));
  assert.ok(keys.includes("PRIVATE READING SCRIPT"));
  assert.throws(
    () => lessonResourceHtml(lesson, "reading-paper"),
    /unavailable/,
  );
});
test("Plan B gives timed paper steps, protects interrupted attempts and supports missing material/partial outages", () => {
  const html = lessonResourceHtml(readingLesson, "backup");
  const d = new JSDOM(html).window.document;
  assert.equal(d.querySelectorAll(".guide-step").length, 4);
  assert.ok(d.body.textContent.includes("35–38 min"));
  assert.ok(d.body.textContent.includes("55–60 min"));
  assert.ok(
    d.body.textContent.includes(
      "Do not reset, clear browser data, promise the timer has paused",
    ),
  );
  assert.ok(
    d.body.textContent.includes(
      "Do not play recordings or discuss answer keys",
    ),
  );
  assert.ok(d.querySelector('a[href="IELTS-01-reading-paper.html"]'));
  assert.ok(d.querySelector('a[href="IELTS-01-reading-paper-keys.html"]'));
  assert.ok(!html.includes("PRIVATE READING ANSWER"));
  const unavailable = new JSDOM(lessonResourceHtml(lesson, "backup")).window
    .document;
  assert.ok(
    unavailable.body.textContent.includes("Paper Reading task unavailable"),
  );
  assert.equal(
    unavailable.querySelector('a[href="IELTS-01-reading-paper.html"]'),
    null,
  );
});
