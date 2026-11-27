// Visual & UX Bible 13.13 (1.22.0): the class report prints with Brains Heist smart printing (printBooklets planner).
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const out = await build({
  stdin: { contents: `export * from './src/lib/ieltsClassReportPrint'; export { planBookletPrint } from './src/lib/paperScan/printBooklets';`, loader: "ts", resolveDir: process.cwd() },
  bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent", mainFields: ["module", "main"],
  external: ["@supabase/*"],
  plugins: [{ name: "stub-supabase", setup(b) { b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: "sb", namespace: "stub" })); b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const supabase = {};", loader: "js" })); } }],
  define: { "import.meta.env.DEV": "false" },
});
const lib = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const { reportBrand, buildClassReportPrint, classReportPrinterReminder, CLASS_GRID_ROWS, CLASS_GRID_COLUMNS, STUDENT_FIRST_PAGE_ROWS, STUDENT_NEXT_PAGE_ROWS } = lib;

const now = Date.parse("2026-11-23T08:00:00Z");
const item = (k, extra = {}) => ({ key: "k" + k, kind: "targeted_practice", title: "Work " + k, code: null, skill: "reading", assigned_at: new Date(now - k * 3600000).toISOString(), due_at: null, status: "done", done_at: null, score: { raw: 3, total: 6 }, review: null, ...extra });
const student = (i, items) => ({ id: "s" + i, name: "Student " + i, class_name: "10A", items });
const report = (students) => ({ school_id: "school-a", scope: { kind: "class", value: "10A", name: "10A" }, generated_at: new Date(now).toISOString(), classes: ["10A"], batches: [], students });
const double = { keepTogether: true, duplex: true, pagesPerSide: 1 };
const pages = (html) => (html.match(/class="print-page rp-page"/g) || []).length;
const blanks = (html) => (html.match(/class="print-page blank-page"/g) || []).length;

test("each student gets their own sheets: a one-page report gets a blank back when printing double-sided", () => {
  const r = report([student(1, [item(1)]), student(2, [item(1), item(2)]), student(3, [item(1)])]);
  const doc = buildClassReportPrint(r, { view: "students", settings: double, schoolName: "Silk Road", documentId: "IEL-TEST", now });
  assert.equal(doc.orientation, "portrait");
  assert.equal(pages(doc.html), 3);
  assert.deepEqual(doc.plan.padding, [1, 1, 0], "no spacer after the last student");
  assert.equal(blanks(doc.html), 2);
  assert.equal(doc.plan.physicalSheets, 3);
  assert.equal(doc.status, "3 physical sheets · 3 content pages · 2 added blank pages");
  assert.match(doc.reminder, /^Double-sided · 1 page per side · A4 · Portrait · Actual size · Headers & footers off/);
  assert.match(doc.reminder, /Keep blank pages: each student starts on a fresh sheet\.$/);
  assert.match(doc.html, /IEL-TEST/);
  assert.match(doc.html, /not IELTS bands/);
  assert.match(doc.html, /None of these is an official IELTS result/);
});

test("single-sided or with separation off, no blank pages are added", () => {
  const r = report([student(1, [item(1)]), student(2, [item(1)])]);
  assert.equal(buildClassReportPrint(r, { view: "students", settings: { ...double, duplex: false }, now }).plan.blankPages, 0);
  const off = buildClassReportPrint(r, { view: "students", settings: { ...double, keepTogether: false }, now });
  assert.equal(off.plan.blankPages, 0);
  assert.match(off.reminder, /Student separation is off\.$/);
  const four = buildClassReportPrint(r, { view: "students", settings: { ...double, pagesPerSide: 4 }, now });
  assert.deepEqual(four.plan.padding, [7, 0], "with 4 pages per side, a sheet holds 8 pages");
});

test("long student lists continue on fixed pages; one student can be printed alone", () => {
  const many = Array.from({ length: STUDENT_FIRST_PAGE_ROWS + STUDENT_NEXT_PAGE_ROWS + 1 }, (_, k) => item(k));
  const r = report([student(1, many), student(2, [item(1)])]);
  const one = buildClassReportPrint(r, { view: "students", settings: double, studentId: "s1", now });
  assert.equal(pages(one.html), 3);
  assert.match(one.html, /Student page 3 of 3/);
  assert.match(one.html, /continued/);
  assert.ok(!one.html.includes("Student 2"));
  assert.equal(one.title, "IELTS student report · Student 1");
});

test("the whole class prints landscape, split into fixed pages of students and work columns", () => {
  const cols = Array.from({ length: CLASS_GRID_COLUMNS + 2 }, (_, k) => item(k));
  const r = report(Array.from({ length: CLASS_GRID_ROWS + 1 }, (_, i) => student(i, cols)));
  const doc = buildClassReportPrint(r, { view: "class", settings: double, documentId: "IEL-TEST", now });
  assert.equal(doc.orientation, "landscape");
  assert.equal(pages(doc.html), 4, "2 column groups × 2 student groups");
  assert.equal(doc.plan.blankPages, 0, "one document: nothing to separate");
  assert.match(doc.html, /Work 1–7 of 9 · students 1–11 of 12/);
  assert.match(doc.html, /Page 4 of 4/);
  assert.match(doc.html, /size:A4 landscape/);
  assert.match(classReportPrinterReminder(double, "landscape", "class"), /A4 · Landscape · Actual size/);
  assert.doesNotMatch(doc.reminder, /fresh sheet/);
});

test("names and titles are escaped in the printed document", () => {
  const r = report([student(1, [item(1, { title: "<img src=x onerror=alert(1)>" })])]);
  r.students[0].name = "<b>Aida</b>";
  const doc = buildClassReportPrint(r, { view: "students", settings: double, now });
  assert.ok(!doc.html.includes("<img src=x"));
  assert.ok(!doc.html.includes("<b>Aida</b>"));
  assert.match(doc.html, /&lt;b&gt;Aida&lt;\/b&gt;/);
});

test("the school logo comes before the school name; without one, the school's initials (school document rule)", () => {
  const r = report([student(1, [item(1)])]);
  const withLogo = buildClassReportPrint(r, { view: "class", settings: double, schoolName: "Silk Road International School", schoolLogoUrl: "https://cdn.example.org/silk.png", now });
  assert.match(withLogo.html, /<div class="rp-brand"><img class="rp-logo" src="https:\/\/cdn.example.org\/silk.png" alt="Silk Road International School logo"><div><strong>Silk Road International School<\/strong>/);
  const noLogo = buildClassReportPrint(r, { view: "class", settings: double, schoolName: "Silk Road International School", now });
  assert.match(noLogo.html, /<span class="rp-mark">SRI<\/span><div><strong>Silk Road International School/);
  assert.match(reportBrand("Silk Road", "javascript:alert(1)"), /rp-mark">SR</, "only https logos are used");
  assert.match(reportBrand("", null, "https://app.example"), /src="https:\/\/app.example\/logo.png"/, "no school: the Brains Heist logo");
});

// Mark book (Diagnostic Bible 2.7.4 section 15.1): course, mocks and real IELTS print with the class and on each student.
const mock = (extra = {}) => ({ key: "sitting:1", group: "paper:IELTS-M1:2026-10-24", form: "IELTS-M1", title: "Mock Test 1", delivery: "paper", source: "sitting", sat_on: "2026-10-24", practice: false, attempt_no: null,
  sections: { listening: { state: "result", raw: 29, answered: 40, exposed: false, indicative: { label: "6.0–7.0", low: 6, high: 7, central: 6.5 } }, reading: { state: "not_sat" }, writing: { state: "result", criteria: {}, exposed: false, indicative: { label: "4.5–5.5", low: 4.5, high: 5.5, central: 5 } }, speaking: { state: "not_sat" } }, ...extra });
const book = (mocks, official = []) => ({ mocks, course: { done: 3, total: 26 }, official });

test("mark book columns print before the work, with marks, the labelled range and not-sat sections", () => {
  const s = { ...student(1, [item(1)]), markbook: book([mock()], [{ test_date: "2026-11-01", test_type: "academic", delivery: "computer", listening: 7, reading: 6.5, writing: 6, speaking: 6.5, overall: 6.5, verified: false }]) };
  const doc = buildClassReportPrint(report([s]), { view: "class", settings: double, documentId: "IEL-TEST", now });
  // 1 course + 4 mock sections + 5 real IELTS + 1 work = 11 columns: two pages of 7.
  assert.equal(pages(doc.html), 2);
  assert.match(doc.html, /Columns 1–7 of 11/);
  assert.match(doc.html, /<th class="rp-book"><small>Mock Test 1 · Paper · 24 Oct 2026<\/small>Listening<\/th>/);
  assert.match(doc.html, /<td class="is-result">29 \/ 40<small>6\.0–7\.0<\/small><\/td><td class="is-not_sat">Not sat<\/td>/);
  assert.match(doc.html, /<td class="is-result">3 \/ 26<small>units<\/small><\/td>/);
  assert.match(doc.html, /6\.5<small>student-reported<\/small>/);
  assert.match(doc.html, /Confidence: low/);
  assert.match(doc.html, /except the Real IELTS columns/);
});

test("each student's first page carries their mocks and real IELTS results, and still fits", () => {
  const many = Array.from({ length: STUDENT_FIRST_PAGE_ROWS }, (_, k) => item(k));
  const s = { ...student(1, many), markbook: book([mock(), mock({ key: "sitting:2", sat_on: "2026-11-20", group: "paper:IELTS-M1:2026-11-20", practice: true })]) };
  const doc = buildClassReportPrint(report([s]), { view: "students", settings: double, now });
  assert.equal(pages(doc.html), 2, "the mock rows take room from the first page");
  assert.match(doc.html, /<dt>Course units<\/dt><dd>3 \/ 26<\/dd>/);
  assert.match(doc.html, /rp-book-list/);
  assert.match(doc.html, /Mock Test 1 · Paper · 20 Nov 2026<\/strong><small>practice · no range<\/small>/);
  assert.match(doc.html, /teacher-entered paper evidence/);
  const plain = buildClassReportPrint(report([student(1, many)]), { view: "students", settings: double, now });
  assert.equal(pages(plain.html), 1, "without a mark book, unchanged");
});
