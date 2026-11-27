// Visual & UX Bible 13.13 (1.22.0): the class report prints with Brains Heist smart printing, the same rules as
// classroom booklets and certificates (src/lib/paperScan/printBooklets.ts): fixed A4 pages built before printing,
// each student's pages kept together on their own sheets (blank spacer pages where needed, so on a double-sided
// printer no two students share a sheet), a preview showing the exact sheets, and a printer reminder with the
// exact settings to choose in the print dialog. Nothing is fetched while printing; it prints the report on screen.
import { planBookletPrint, type BookletPrintPlan, type BookletPrintSettings } from "./paperScan/printBooklets";
import { createSchoolDocumentId, escapeSchoolDocumentHtml as esc, registerSchoolDocumentRecord } from "./schoolDocument";
import { normalizeBrandLogoUrl, PRODUCT_LOGO_URL, PRODUCT_NAME } from "./schoolBranding";
import {
  CLASS_REPORT_NOTE, MOCK_SKILLS, cellState, kindLabel, latestFor, markbookCell, markbookColumns, mockGroupTitle,
  mockSectionCell, reportColumns, resultText, stateLabel, studentSummary,
  type ClassReport, type ReportColumn, type ReportStudent, type MarkbookColumn,
} from "../../services/ieltsClassReportService";

export type ClassReportPrintView = "class" | "students";
export interface ClassReportPrintOptions {
  view: ClassReportPrintView;
  settings: BookletPrintSettings;
  schoolName?: string;
  /** The school's logo, shown before the school name as on every Brains Heist school document. */
  schoolLogoUrl?: string | null;
  studentId?: string;
  documentId?: string;
  now?: number;
}
export interface ClassReportPrintDocument {
  html: string;
  plan: BookletPrintPlan;
  orientation: "portrait" | "landscape";
  documentId: string;
  status: string;
  reminder: string;
  title: string;
}

/** Fixed page capacities (A4, 1 page per side) so pages never overflow and the plan is exact before printing. */
export const CLASS_GRID_ROWS = 11;
export const CLASS_GRID_COLUMNS = 7;
export const STUDENT_FIRST_PAGE_ROWS = 13;
export const STUDENT_NEXT_PAGE_ROWS = 17;

const SKILL: Record<string, string> = { listening: "Listening", reading: "Reading", writing: "Writing", speaking: "Speaking" };
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const chunk = <T,>(list: T[], first: number, next = first): T[][] => {
  if (!list.length) return [[]];
  const out: T[][] = [list.slice(0, first)];
  for (let i = first; i < list.length; i += next) out.push(list.slice(i, i + next));
  return out;
};
export { CLASS_REPORT_NOTE };

export function scopeTitle(report: ClassReport) {
  return report.scope.kind === "all" ? "All students" : report.scope.kind === "batch" ? `Course batch · ${report.scope.name ?? ""}` : `Class ${report.scope.name ?? ""}`;
}

/** The exact print-dialog settings, worded like the classroom booklet reminder. */
export function classReportPrinterReminder(settings: BookletPrintSettings, orientation: "portrait" | "landscape", view: ClassReportPrintView) {
  const sides = settings.duplex ? "Double-sided" : "Single-sided";
  const per = `${settings.pagesPerSide} page${settings.pagesPerSide === 1 ? "" : "s"} per side`;
  const layout = orientation === "landscape" ? "Landscape" : "Portrait";
  const keep = view === "students"
    ? settings.keepTogether ? " Keep blank pages: each student starts on a fresh sheet." : " Student separation is off."
    : "";
  return `${sides} · ${per} · A4 · ${layout} · Actual size · Headers & footers off · Background graphics on · Copies: 1 · Print all pages. Use these same settings in the printer dialog.${keep}`;
}

/** Same rule as school documents (schoolDocument.ts): the school's logo, else the school's initials. */
export function reportBrand(schoolName: string, schoolLogoUrl?: string | null, origin = typeof location !== "undefined" ? location.origin : "") {
  const name = schoolName.trim() || PRODUCT_NAME;
  const logo = normalizeBrandLogoUrl(schoolLogoUrl) || (name === PRODUCT_NAME ? PRODUCT_LOGO_URL : null);
  const src = logo === PRODUCT_LOGO_URL ? origin + PRODUCT_LOGO_URL : logo;
  const initials = name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 3).join("").toUpperCase() || "SCH";
  return src ? `<img class="rp-logo" src="${esc(src)}" alt="${esc(name)} logo">` : `<span class="rp-mark">${esc(initials)}</span>`;
}

function pageHead(p: { schoolName: string; brand: string; title: string; subtitle: string; documentId: string; page: string }) {
  return `<header class="rp-head"><div class="rp-brand">${p.brand}<div><strong>${esc(p.schoolName)}</strong><small>Brains Heist IELTS · Teacher copy · Confidential</small></div></div>
  <div class="rp-id"><small>${esc(p.page)}</small><strong>${esc(p.documentId)}</strong></div></header>
  <div class="rp-title"><h1>${esc(p.title)}</h1><p>${esc(p.subtitle)}</p></div>`;
}
const pageFoot = (made: string) => `<footer class="rp-foot"><p>${esc(CLASS_REPORT_NOTE)}</p><span>Made ${esc(made)}</span></footer>`;

function cell(student: ReportStudent, key: string, now: number) {
  const item = latestFor(student, key);
  if (!item) return `<td class="is-none">·</td>`;
  const st = cellState(item, now);
  const text = resultText(item) || (st === "waiting" ? "To review" : stateLabel[st]);
  return `<td class="is-${st}">${esc(text)}</td>`;
}

type GridColumn = { kind: "work"; col: ReportColumn } | { kind: "book"; col: MarkbookColumn };
function gridHead(c: GridColumn) {
  if (c.kind === "work") return `<th><small>${esc(c.col.skill ? SKILL[c.col.skill] ?? c.col.skill : kindLabel[c.col.kind])}${c.col.code ? " · " + esc(c.col.code) : ""}</small><span class="rp-t">${esc(c.col.title)}</span></th>`;
  return `<th class="rp-book"><small>${esc(c.col.groupTitle)}</small>${esc(c.col.title)}</th>`;
}
function gridCell(student: ReportStudent, c: GridColumn, now: number) {
  if (c.kind === "work") return cell(student, c.col.key, now);
  const x = markbookCell(student, c.col);
  const sub = x.sub && x.sub !== x.text ? `<small>${esc(x.sub)}</small>` : "";
  return `<td class="is-${x.state === "practice" ? "result" : x.state === "none" ? "none" : x.state}">${esc(x.text)}${sub}</td>`;
}

function classPages(report: ClassReport, documentId: string, schoolName: string, brand: string, now: number): string[] {
  const book = markbookColumns(report.students);
  const columns: GridColumn[] = [...book.map((col) => ({ kind: "book" as const, col })), ...reportColumns(report.students).map((col) => ({ kind: "work" as const, col }))];
  const groups = chunk(columns, CLASS_GRID_COLUMNS);
  const noun = book.length ? "Columns" : "Work";
  const rows = chunk(report.students, CLASS_GRID_ROWS);
  const total = groups.length * rows.length;
  const made = day(report.generated_at);
  let totals = { given: 0, done: 0, overdue: 0, waiting: 0 };
  for (const s of report.students) { const x = studentSummary(s, now); totals = { given: totals.given + x.given, done: totals.done + x.done, overdue: totals.overdue + x.overdue, waiting: totals.waiting + x.waiting }; }
  const pages: string[] = [];
  let n = 0;
  groups.forEach((cols, g) => rows.forEach((students, r) => {
    n += 1;
    const from = g * CLASS_GRID_COLUMNS + 1, to = from + cols.length - 1;
    const summary = n === 1
      ? `<dl class="rp-stats"><div><dt>Students</dt><dd>${report.students.length}</dd></div><div><dt>Pieces of work given</dt><dd>${totals.given}</dd></div><div><dt>Done</dt><dd>${totals.given ? Math.round((totals.done / totals.given) * 100) : 0}% · ${totals.done}</dd></div><div><dt>Overdue</dt><dd>${totals.overdue}</dd></div><div><dt>Waiting for review</dt><dd>${totals.waiting}</dd></div></dl>`
      : "";
    const head = cols.map(gridHead).join("");
    const body = students.map((s) => {
      const x = studentSummary(s, now);
      return `<tr><th>${esc(s.name)}${s.class_name ? `<small>${esc(s.class_name)}</small>` : ""}</th><td class="rp-done">${x.done} / ${x.given}${x.overdue ? ` · ${x.overdue} late` : ""}</td>${cols.map((c) => gridCell(s, c, now)).join("")}</tr>`;
    }).join("");
    const where = columns.length ? `${noun} ${from}–${to} of ${columns.length} · students ${r * CLASS_GRID_ROWS + 1}–${r * CLASS_GRID_ROWS + students.length} of ${report.students.length}` : "No IELTS work given yet";
    pages.push(`<section class="print-page rp-page">${pageHead({ schoolName, brand, title: "IELTS class report", subtitle: `${scopeTitle(report)} · ${where}`, documentId, page: `Page ${n} of ${total}` })}${summary}
      <table class="rp-grid"><thead><tr><th>Student</th><th>Done</th>${head}</tr></thead><tbody>${body || `<tr><td colspan="2">No students here yet.</td></tr>`}</tbody></table>${pageFoot(made)}</section>`);
  }));
  return pages;
}

/** The student's mocks and real IELTS results, at the top of their first page. */
function studentBook(student: ReportStudent): { html: string; rows: number } {
  const mb = student.markbook;
  if (!mb || (!mb.mocks.length && !mb.official.length)) return { html: "", rows: 0 };
  const td = (text: string, sub: string, state: string) => `<td class="is-${state}">${esc(text)}${sub && sub !== text ? `<small>${esc(sub)}</small>` : ""}</td>`;
  const mocks = mb.mocks.map((m) => `<tr><td><strong>${esc(mockGroupTitle(m))}</strong>${m.practice ? "<small>practice · no range</small>" : m.source === "sitting" ? "<small>teacher-entered paper evidence</small>" : ""}</td>${MOCK_SKILLS.map((k) => { const c = mockSectionCell(m.sections[k], k, m); return td(c.text, c.sub, c.state === "practice" ? "result" : c.state); }).join("")}<td>—</td></tr>`).join("");
  const official = mb.official.map((o) => `<tr><td><strong>Real IELTS · ${esc(day(o.test_date))}</strong><small>Official result · ${o.verified ? "verified" : "student-reported"}</small></td>${[o.listening, o.reading, o.writing, o.speaking, o.overall].map((v) => `<td class="is-result">${esc(Number(v).toFixed(1))}</td>`).join("")}</tr>`).join("");
  return {
    html: `<table class="rp-list rp-book-list"><thead><tr><th>Mock test / real IELTS</th><th>Listening</th><th>Reading</th><th>Writing</th><th>Speaking</th><th>Overall</th></tr></thead><tbody>${mocks}${official}</tbody></table>`,
    rows: mb.mocks.length + mb.official.length + 1,
  };
}

function studentPages(student: ReportStudent, report: ClassReport, documentId: string, schoolName: string, brand: string, now: number): string[] {
  const x = studentSummary(student, now);
  const book = studentBook(student);
  const first = Math.max(2, STUDENT_FIRST_PAGE_ROWS - book.rows);
  const parts = chunk(student.items, first, STUDENT_NEXT_PAGE_ROWS);
  const made = day(report.generated_at);
  return parts.map((items, i) => {
    const rows = items.map((it) => {
      const st = cellState(it, now);
      const result = resultText(it);
      const note = it.band ? it.band.label : it.score ? "correct answers" : "";
      return `<tr><td><strong>${esc(it.title)}</strong><small>${esc(kindLabel[it.kind])}${it.code ? " · " + esc(it.code) : ""}</small></td><td>${esc(it.skill ? SKILL[it.skill] ?? it.skill : "—")}</td><td>${esc(day(it.assigned_at))}</td><td>${esc(day(it.due_at))}</td><td class="is-${st}">${esc(stateLabel[st])}${it.done_at ? `<small>${esc(day(it.done_at))}</small>` : ""}</td><td>${esc(result || "—")}${note ? `<small>${esc(note)}</small>` : ""}</td></tr>`;
    }).join("");
    const summary = i === 0
      ? `<dl class="rp-stats"><div><dt>Class</dt><dd>${esc(student.class_name ?? "—")}</dd></div><div><dt>Given</dt><dd>${x.given}</dd></div><div><dt>Done</dt><dd>${x.done}</dd></div><div><dt>Overdue</dt><dd>${x.overdue}</dd></div><div><dt>Waiting for review</dt><dd>${x.waiting}</dd></div>${student.markbook ? `<div><dt>Course units</dt><dd>${student.markbook.course.done} / ${student.markbook.course.total}</dd></div>` : ""}</dl>${book.html}`
      : "";
    return `<section class="print-page rp-page">${pageHead({ schoolName, brand, title: student.name, subtitle: `IELTS student report · ${scopeTitle(report)}${i ? " · continued" : ""}`, documentId, page: `Student page ${i + 1} of ${parts.length}` })}${summary}
      <table class="rp-list"><thead><tr><th>Work</th><th>Skill</th><th>Given</th><th>Due</th><th>Status</th><th>Result</th></tr></thead><tbody>${rows || `<tr><td colspan="6">No IELTS work given yet.</td></tr>`}</tbody></table>${pageFoot(made)}</section>`;
  });
}

const css = (orientation: "portrait" | "landscape") => {
  const w = orientation === "landscape" ? "297mm" : "210mm", h = orientation === "landscape" ? "210mm" : "297mm";
  return `
  @page { size:A4 ${orientation}; margin:0; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; background:#e8edf4; font-family:Inter,"Noto Sans",Arial,sans-serif; color:#13213c; }
  .bar { position:sticky; top:0; background:#172438; color:white; padding:16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; z-index:2; }
  .bar button { padding:10px 20px; border:0; border-radius:8px; background:white; color:#172438; font-weight:bold; cursor:pointer; min-height:44px; }
  .bar button.back { background:transparent; color:white; border:1px solid rgba(255,255,255,.45); }
  .bar button:disabled { opacity:.65; cursor:wait; }
  .bar-copy { display:grid; gap:5px; }
  #printer-reminder { font-size:12px; line-height:1.5; color:#cbd5e1; }
  .preview-viewport { margin:0 auto; }
  .preview-stage { width:${w}; transform-origin:top left; }
  .student-booklet { display:flow-root; }
  .print-page { width:${w}; height:${h}; margin:20px auto; background:white; overflow:hidden; }
  .rp-page { position:relative; padding:12mm 13mm 24mm; display:flex; flex-direction:column; gap:4mm; }
  .rp-head { display:flex; justify-content:space-between; align-items:center; gap:8mm; padding-bottom:3mm; border-bottom:1px solid #dce3ed; }
  .rp-brand { display:flex; align-items:center; gap:3mm; }
  .rp-logo { width:12mm; height:12mm; object-fit:contain; }
  .rp-mark { display:grid; place-items:center; width:12mm; height:12mm; border-radius:3mm; background:#0b2f70; color:white; font-weight:900; font-size:8pt; letter-spacing:.04em; }
  .rp-brand strong { display:block; font-size:11pt; } .rp-brand small,.rp-id small { display:block; color:#5d6b82; font-size:7.5pt; }
  .rp-id { text-align:right; } .rp-id strong { font:700 8pt/1.3 "Courier New",monospace; }
  .rp-title h1 { margin:0; font-size:17pt; letter-spacing:-.01em; } .rp-title p { margin:1mm 0 0; color:#5d6b82; font-size:9pt; }
  .rp-stats { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:2.5mm; margin:0; }
  .rp-stats div { border:1px solid #dce3ed; border-radius:2mm; padding:1.4mm 3mm; background:#f4f7fb; }
  .rp-stats dt { font-size:7pt; color:#5d6b82; text-transform:uppercase; letter-spacing:.05em; font-weight:800; } .rp-stats dd { margin:.3mm 0 0; font-size:11pt; font-weight:800; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8pt; }
  th,td { border:1px solid #dce3ed; padding:1.6mm 2mm; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
  thead th { background:#0b2f70; color:white; font-size:7.5pt; font-weight:700; }
  thead th small { display:block; color:#c7d6f5; font-size:6.5pt; text-transform:uppercase; letter-spacing:.05em; }
  tbody th small, td small { display:block; color:#5d6b82; font-size:7pt; font-weight:400; }
  tbody tr:nth-child(even) { background:#f7f9fc; }
  .rp-grid thead th:first-child { width:40mm; } .rp-grid thead th:nth-child(2) { width:24mm; }
  .rp-grid tbody th, .rp-grid td.rp-done { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rp-grid tbody tr { height:10mm; }
  .rp-grid thead th { line-height:1.2; }
  .rp-grid thead th .rp-t { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .rp-grid td small { font-size:6.5pt; line-height:1.15; }
  .rp-grid td, .rp-grid tbody th { padding:1.2mm 1.6mm; }
  .rp-grid td { text-align:center; font-weight:700; } .rp-grid td.rp-done { text-align:left; }
  .rp-list thead th:first-child { width:38%; }
  .rp-book-list td { text-align:center; font-weight:700; } .rp-book-list td:first-child { text-align:left; font-weight:400; }
  .rp-grid thead th.rp-book { background:#123f8c; }
  .is-not_sat,.is-not_part { color:#64748b; font-weight:400!important; }
  .is-result,.is-done { color:#047857; } .is-waiting { color:#be123c; } .is-overdue { color:#b45309; } .is-in_progress { color:#1d4ed8; }
  .is-not_started,.is-excused,.is-skipped,.is-none { color:#64748b; font-weight:400!important; }
  .rp-foot { position:absolute; left:13mm; right:13mm; bottom:8mm; display:flex; justify-content:space-between; gap:8mm; border-top:1px solid #dce3ed; padding-top:1.5mm; color:#5d6b82; font-size:6.2pt; line-height:1.3; }
  .rp-foot p { margin:0; max-width:88%; } .rp-foot span { white-space:nowrap; }
  .blank-page { display:flex; align-items:center; justify-content:center; color:#68788e; border:2px dashed #b9c4d4; }
  .blank-page span { font-size:16px; text-align:center; padding:30px; }
  @media print {
    html,body { background:white; margin:0; padding:0; }
    .bar { display:none; }
    .preview-viewport { width:auto!important; height:auto!important; margin:0; }
    .preview-stage { width:auto; transform:none!important; }
    .print-page { margin:0; break-inside:avoid; break-after:page; }
    .student-booklet:last-child .print-page:last-child { break-after:auto; }
    .blank-page { display:block; border:0; }
    .blank-page span { display:none; }
  }
  @media screen and (max-width:850px) { .bar { gap:10px; padding:12px; } }`;
};

/** Build the print document: fixed pages, the smart print plan, blank spacers, status and printer reminder. */
export function buildClassReportPrint(report: ClassReport, options: ClassReportPrintOptions): ClassReportPrintDocument {
  const now = options.now ?? Date.now();
  const schoolName = options.schoolName?.trim() || PRODUCT_NAME;
  const brand = reportBrand(schoolName, options.schoolLogoUrl);
  const documentId = options.documentId ?? createSchoolDocumentId("ielts");
  const view = options.view;
  const orientation = view === "class" ? "landscape" : "portrait";
  const booklets: string[][] = view === "class"
    ? [classPages(report, documentId, schoolName, brand, now)]
    : (options.studentId ? report.students.filter((s) => s.id === options.studentId) : report.students)
        .map((s) => studentPages(s, report, documentId, schoolName, brand, now));
  const settings = view === "class" ? { ...options.settings, keepTogether: false } : options.settings;
  const plan = planBookletPrint(booklets.map((b) => b.length), settings);
  const blank = `<section class="print-page blank-page" aria-label="Blank spacer page"><span>Blank spacer · the next student's report starts on a new sheet</span></section>`;
  const content = booklets.map((pages, i) => `<article class="student-booklet">${pages.join("")}${blank.repeat(plan.padding[i] ?? 0)}</article>`).join("");
  const status = `${plan.physicalSheets} physical sheet${plan.physicalSheets === 1 ? "" : "s"} · ${plan.contentPages} content page${plan.contentPages === 1 ? "" : "s"} · ${plan.blankPages} added blank page${plan.blankPages === 1 ? "" : "s"}`;
  const reminder = classReportPrinterReminder(settings, orientation, view);
  const title = view === "class" ? `IELTS class report · ${scopeTitle(report)}` : options.studentId && booklets.length ? `IELTS student report · ${report.students.find((s) => s.id === options.studentId)?.name ?? ""}` : `IELTS student reports · ${scopeTitle(report)}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css(orientation)}</style></head>
<body><div class="bar"><button type="button" id="back" class="back">← Back to Brains Heist</button><button type="button" id="print" disabled>Preparing…</button><div class="bar-copy"><strong id="print-status" role="status">${esc(status)}</strong><span id="printer-reminder">${esc(reminder)}</span></div></div>
<div class="preview-viewport"><main class="preview-stage">${content}</main></div></body></html>`;
  return { html, plan, orientation, documentId, status, reminder, title };
}

/**
 * Open the smart print preview in a window reserved by the click (so pop-up blockers allow it), wire Print and Back,
 * scale the preview to the screen, and enable Print once fonts are ready. Registers the school document record.
 */
export function openClassReportPrint(report: ClassReport, options: ClassReportPrintOptions, reserved?: Window | null): Window | null {
  const doc = buildClassReportPrint(report, options);
  const win = reserved && !reserved.closed ? reserved : window.open("", "_blank");
  if (!win) return null;
  try { win.opener = null; } catch { /* some browsers forbid it */ }
  win.document.open();
  win.document.write(doc.html);
  win.document.close();
  const d = win.document;
  d.getElementById("print")?.addEventListener("click", () => win.print());
  d.getElementById("back")?.addEventListener("click", () => win.close());
  const stage = d.querySelector<HTMLElement>(".preview-stage"), viewport = d.querySelector<HTMLElement>(".preview-viewport");
  const scale = () => {
    if (!stage || !viewport) return;
    const width = stage.offsetWidth || 1;
    const s = Math.min(1, Math.max(200, win.innerWidth - 24) / width);
    stage.style.transform = `scale(${s})`;
    viewport.style.width = `${width * s}px`;
    viewport.style.height = `${stage.offsetHeight * s}px`;
  };
  win.addEventListener("resize", scale);
  const images = Array.from(d.images).map((img) => (img.complete ? Promise.resolve() : new Promise<void>((done) => { img.addEventListener("load", () => done(), { once: true }); img.addEventListener("error", () => done(), { once: true }); })));
  // A logo that never answers must not block printing: Print is enabled after at most 2.5 s.
  const settle = new Promise<void>((done) => win.setTimeout(done, 2500));
  void Promise.race([Promise.all([Promise.resolve(d.fonts?.ready), ...images]), settle]).then(() => {
    if (win.closed) return;
    scale();
    const button = d.getElementById("print") as HTMLButtonElement | null;
    if (button) { button.disabled = false; button.textContent = "Print / Save PDF"; }
  });
  void registerSchoolDocumentRecord({
    meta: {
      documentId: doc.documentId, templateVersion: "ielts-class-report-v2", title: doc.title, schoolName: options.schoolName ?? PRODUCT_NAME, schoolLogoUrl: options.schoolLogoUrl ?? null,
      audience: "teacher", status: "final", confidentiality: "confidential", generatedAt: report.generated_at, schoolId: report.school_id,
      visibilityScope: "school_staff", sourceType: "ielts_class_report", documentTypeLabel: "IELTS class report",
    },
    bodyHtml: "", persistPayload: false, orientation: doc.orientation, paper: "A4",
  });
  return win;
}
