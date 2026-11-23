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
const { buildClassReportPrint, classReportPrinterReminder, CLASS_GRID_ROWS, CLASS_GRID_COLUMNS, STUDENT_FIRST_PAGE_ROWS, STUDENT_NEXT_PAGE_ROWS } = lib;

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
