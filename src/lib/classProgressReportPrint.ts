// Class Progress Report printing. Uses Brains Heist smart printing, the same rules as classroom booklets,
// certificates and the IELTS class report (src/lib/paperScan/printBooklets.ts, src/lib/ieltsClassReportPrint.ts):
// fixed A4 pages built before printing, a preview of the exact sheets, the school's logo on every page, and a
// printer reminder with the exact settings to choose in the print dialog. Nothing is fetched while printing.
import { planBookletPrint, type BookletPrintPlan, type BookletPrintSettings } from "./paperScan/printBooklets";
import { createSchoolDocumentId, escapeSchoolDocumentHtml as esc, registerSchoolDocumentRecord } from "./schoolDocument";
import { reportBrand } from "./ieltsClassReportPrint";
import { PRODUCT_NAME } from "./schoolBranding";
import { BAND_LABELS, BAND_ORDER, longDate, type CprModel, type CprSupportRow } from "./classProgressReport";

export interface ClassProgressPrintOptions {
  settings: BookletPrintSettings;
  teacherNote: string;
  focus: string[];
  documentId?: string;
  schoolId?: string | null;
  groupId?: string | null;
}
export interface ClassProgressPrintDocument { html: string; plan: BookletPrintPlan; documentId: string; status: string; reminder: string; title: string; pages: number }

/** Support rows that fit on page 2 with everything else; the rest continue on extra pages. */
export const SUPPORT_ROWS_PAGE_2 = 6;
export const SUPPORT_ROWS_NEXT_PAGE = 18;

const STATUS_TEXT: Record<CprSupportRow["status"], string> = { plan_active: "Plan active", plan_planned: "Plan planned", needs_plan: "Needs plan" };
const TONE: Record<CprModel["status"]["tone"], string> = { good: "good", working: "working", watch: "watch", below: "below" };

export function classProgressPrinterReminder(settings: BookletPrintSettings) {
  const sides = settings.duplex ? "Double-sided" : "Single-sided";
  const per = `${settings.pagesPerSide} page${settings.pagesPerSide === 1 ? "" : "s"} per side`;
  return `${sides} · ${per} · A4 · Portrait · Actual size · Headers & footers off · Background graphics on · Copies: 1 · Print all pages. Use these same settings in the printer dialog.`;
}

const percent = (v: number | null) => (v === null ? "—" : `${v}%`);
const signed = (v: number | null) => (v === null ? "" : `${v > 0 ? "+" : ""}${v} points`);

function header(model: CprModel, brand: string, documentId: string, page: number, total: number) {
  return `<header class="cp-head"><div class="cp-brand">${brand}<div><strong>${esc(model.schoolName)}</strong><small>Class Progress Report</small></div></div>
  <div class="cp-id"><small>Generated ${esc(longDate(model.generatedAt))} · page ${page} of ${total}</small><strong>${esc(documentId)}</strong></div></header>`;
}
function footer(model: CprModel, text: string) {
  return `<footer class="cp-foot"><span>${esc(text)}</span><span>${esc(model.schoolName)} · Confidential: for school staff</span></footer>`;
}

function pageOne(model: CprModel, brand: string, documentId: string, total: number) {
  const period = model.periodFrom ? `${longDate(model.periodFrom)} – ${longDate(model.periodTo)}` : longDate(model.periodTo);
  const teachers = model.teachers.length ? `Teacher: ${model.teachers.join(", ")} · ` : "";
  const avgLabel = model.mode === "tests" ? "Test average" : "Recent work average";
  const improvingSub = model.mode === "tests" ? `of ${model.matched} who sat both` : `of ${model.matched} with enough work`;
  const homeworkRate = model.homeworkAssigned ? Math.round((model.homeworkDone / model.homeworkAssigned) * 100) : null;
  const plansFor = new Set(model.support.filter((r) => r.status !== "needs_plan").map((r) => r.student.id)).size;
  const kpis = `<div class="cp-kpis">
    <div class="cp-kpi"><span>${esc(avgLabel)}</span><b>${esc(percent(model.averageNow))}</b><em>from ${esc(percent(model.averageStart))}</em><i class="${(model.averageChange ?? 0) >= 0 ? "pos" : "neg"}">${esc(signed(model.averageChange) || "—")}</i></div>
    <div class="cp-kpi"><span>Students improving</span><b>${model.improving}</b><em>${esc(improvingSub)}</em><i class="mut">${model.dropped} dropped</i></div>
    <div class="cp-kpi"><span>Tasks completed</span><b>${esc(percent(model.completion))}</b><em>${model.doneTotal} / ${model.assignedTotal}</em><i class="${homeworkRate !== null && homeworkRate < 80 ? "warn" : "mut"}">${homeworkRate !== null ? `Homework ${homeworkRate}%` : "No homework set"}</i></div>
    <div class="cp-kpi cp-kpi--warn"><span>Need support</span><b>${model.support.length}</b><em>students</em><i class="warn">${model.support.length ? `${plansFor} ${plansFor === 1 ? "has" : "have"} a plan · p. 2` : "None flagged"}</i></div>
  </div>`;

  const level = model.expectedLevel;
  const skillRows = model.skills.length
    ? model.skills.map((s) => {
        const evidence = s.reliable
          ? `${s.startAnswers + s.nowAnswers} answers`
          : `Low evidence · ${s.nowAnswers} answer${s.nowAnswers === 1 ? "" : "s"} on the latest${model.mode === "tests" ? " test" : " work"}`;
        const change = s.start !== null && s.now !== null ? s.now - s.start : null;
        return `<div class="cp-skill${s.reliable ? "" : " cp-skill--low"}"><div><strong>${esc(s.name)}</strong><small>${esc(evidence)}</small></div>
          <div class="cp-bars"><div class="cp-track"><div class="cp-bar cp-bar--start" style="width:${s.start ?? 0}%"></div></div><div class="cp-track cp-track--now"><div class="cp-bar cp-bar--now" style="width:${s.now ?? 0}%"></div></div><div class="cp-level" style="left:${level}%"></div></div>
          <div class="cp-skill-n"><span>${esc(percent(s.start))} → </span><strong>${esc(percent(s.now))}</strong><i class="${s.reliable && change !== null && change > 0 ? "pos" : "mut"}">${change === null ? "" : `${s.reliable ? "" : "≈ "}${change > 0 ? "+" : ""}${change} pts`}</i></div></div>`;
      }).join("")
    : `<p class="cp-empty">The questions in this period carry no skill tags yet, so progress by skill cannot be shown.</p>`;
  const weak = model.weakSkills.length
    ? `<div class="cp-weak"><strong>Weakest skill areas · all work this period</strong><div>${model.weakSkills.map((w) => `<div><b>${w.pct}%</b><span>${esc(w.name)}</span></div>`).join("")}</div></div>`
    : "";

  const maxWeek = Math.max(1, model.rosterSize);
  const weeks = model.weeks.map((w) => `<div class="cp-week"><b>${w.active}</b><div style="height:${Math.max(1.2, (w.active / maxWeek) * 17).toFixed(1)}mm" class="${w.active < model.rosterSize / 2 ? "low" : ""}"></div><span>${esc(w.label)}</span></div>`).join("");
  const classworkRate = model.classworkAssigned ? Math.round((model.classworkDone / model.classworkAssigned) * 100) : null;

  return `<section class="print-page cp-page">${header(model, brand, documentId, 1, total)}
  <div class="cp-title"><div><p>${esc(period)}</p><h1>${esc(model.groupName)}</h1><span>${esc(teachers)}${model.rosterSize} students${model.subject ? ` · ${esc(model.subject)}` : ""}</span></div>
  <div class="cp-status cp-status--${TONE[model.status.tone]}"><i></i>${esc(model.status.label)}</div></div>
  ${kpis}
  <div class="cp-callout"><strong>In short:</strong> ${esc(model.summary)}</div>
  <section><h2>Progress by skill area</h2>
    <div class="cp-legend"><span><i class="start"></i>${esc(model.startLabel)}</span><span><i class="now"></i>${esc(model.nowLabel)}</span><span><i class="level"></i>Expected level ${level}%</span></div>
    ${skillRows}${weak}</section>
  <section><h2>Engagement</h2><div class="cp-eng">
    <div class="cp-tiles"><div><span>Active this week</span><b>${model.activeThisWeek} / ${model.rosterSize}</b></div><div><span>Classwork done</span><b>${esc(percent(classworkRate))}</b></div>
    <div><span>Homework done</span><b>${model.homeworkAssigned ? `${model.homeworkDone} / ${model.homeworkAssigned}` : "—"}</b></div><div><span>Support plans</span><b>${model.activePlans} open</b></div></div>
    <div class="cp-chart"><span>Students who completed work each week (of ${model.rosterSize})</span><div class="cp-weeks">${weeks || "<p class=\"cp-empty\">No completed work yet.</p>"}</div></div>
  </div></section>
  ${footer(model, `Expected level ${level}% ${model.expectedLevelSet ? "set by the school" : "(school default)"}.${model.taggedShare !== null ? ` Skill detail covers ${model.taggedShare}% of answers; the rest carry no skill tag.` : ""}`)}</section>`;
}

function supportTable(rows: CprSupportRow[]) {
  if (!rows.length) return `<p class="cp-empty">No student is flagged for support in this period.</p>`;
  return `<table class="cp-table"><thead><tr><th>Student</th><th>Concern</th><th>Plan in place</th><th>Status</th></tr></thead><tbody>${rows.map((r) =>
    `<tr><td><strong>${esc(r.student.name)}</strong></td><td>${esc(r.concern)}</td><td>${esc(r.plan)}</td><td class="st-${r.status}">${esc(STATUS_TEXT[r.status])}</td></tr>`).join("")}</tbody></table>`;
}

function bandsBlock(model: CprModel) {
  const row = (label: string, bands: Record<string, number>, total: number) => total
    ? `<div class="cp-band-row"><strong>${esc(label)}</strong><div class="cp-band">${BAND_ORDER.map((b) => bands[b] ? `<div class="b-${b}" style="width:${(bands[b] / total) * 100}%">${bands[b]}</div>` : "").join("")}</div></div>`
    : "";
  const startLabel = model.mode === "tests" && model.baseline ? new Date(model.baseline.assigned_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "Earlier";
  const nowLabel = model.mode === "tests" && model.latest ? new Date(model.latest.assigned_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "Recent";
  return `<section><h2>Where the class stands</h2><p class="cp-sub">Students by level against the school's ${model.expectedLevel}% expected level${model.mode === "tests" ? " · each test counts the students who sat it" : ""}</p>
    ${row(startLabel, model.bandsStart, model.bandsStartTotal)}${row(nowLabel, model.bandsNow, model.bandsNowTotal)}
    <div class="cp-band-key">${BAND_ORDER.map((b) => `<span><i class="b-${b}"></i>${esc(BAND_LABELS[b])}</span>`).join("")}</div></section>`;
}

function pageTwo(model: CprModel, brand: string, documentId: string, total: number, rows: CprSupportRow[], more: number, options: ClassProgressPrintOptions) {
  const improved = model.improved.length
    ? model.improved.map((s) => `<div class="cp-li"><span>${esc(s.name)}</span><strong class="pos">+${s.change} pts</strong></div>`).join("")
    : `<p class="cp-empty">No improvement to show yet.</p>`;
  const highlights = model.highlights.length ? model.highlights.map((h) => `<div>${esc(h)}</div>`).join("") : `<p class="cp-empty">No highlights yet.</p>`;
  const focus = options.focus.map((f) => f.trim()).filter(Boolean);
  const note = options.teacherNote.trim();
  return `<section class="print-page cp-page">${header(model, brand, documentId, 2, total)}
  ${bandsBlock(model)}
  <section><h2>Students who need support</h2>${supportTable(rows)}<p class="cp-sub">${more ? `Continued on the next page (${more} more). ` : ""}Plans come from Brains Heist intervention plans.</p></section>
  <div class="cp-two"><div class="cp-card"><strong>Most improved</strong>${improved}</div><div class="cp-card"><strong>Highlights</strong><div class="cp-hl">${highlights}</div></div></div>
  ${note ? `<div class="cp-note"><div><strong>Teacher's note</strong><small>Written by the teacher</small></div><p>${esc(note)}</p></div>` : ""}
  ${focus.length ? `<section><h2>Focus for next term</h2><ol class="cp-focus">${focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ol></section>` : ""}
  <div class="cp-sign"><div>Teacher · ${esc(model.teachers[0] ?? "")}</div><div>Reviewed by · Head of Department</div></div>
  ${footer(model, `Results from ${model.mode === "tests" ? "the chosen start and end tests" : "students' earlier and recent marked work"} and all marked work in the period.`)}</section>`;
}

function continuationPage(model: CprModel, brand: string, documentId: string, page: number, total: number, rows: CprSupportRow[]) {
  return `<section class="print-page cp-page">${header(model, brand, documentId, page, total)}
  <section><h2>Students who need support · continued</h2>${supportTable(rows)}</section>
  ${footer(model, "Plans come from Brains Heist intervention plans.")}</section>`;
}

const css = `
  @page { size:A4 portrait; margin:0; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; background:#e8edf4; font-family:Inter,"Noto Sans",Arial,sans-serif; color:#13213c; }
  .bar { position:sticky; top:0; background:#172438; color:white; padding:16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; z-index:2; }
  .bar button { padding:10px 20px; border:0; border-radius:8px; background:white; color:#172438; font-weight:bold; cursor:pointer; min-height:44px; }
  .bar button.back { background:transparent; color:white; border:1px solid rgba(255,255,255,.45); }
  .bar button:disabled { opacity:.65; cursor:wait; }
  .bar-copy { display:grid; gap:5px; } #printer-reminder { font-size:12px; line-height:1.5; color:#cbd5e1; }
  .preview-viewport { margin:0 auto; } .preview-stage { width:210mm; transform-origin:top left; } .student-booklet { display:flow-root; }
  .print-page { width:210mm; height:297mm; margin:20px auto; background:white; overflow:hidden; }
  .cp-page { position:relative; padding:11mm 13mm 18mm; display:flex; flex-direction:column; gap:3.6mm; font-size:9.5pt; }
  .cp-page h2 { margin:0 0 1.6mm; font-size:13pt; color:#0b2f70; }
  .cp-head { display:flex; justify-content:space-between; align-items:center; gap:8mm; padding-bottom:3mm; border-bottom:1px solid #dce3ed; }
  .cp-brand { display:flex; align-items:center; gap:3mm; } .rp-logo { width:12mm; height:12mm; object-fit:contain; }
  .rp-mark { display:grid; place-items:center; width:12mm; height:12mm; border-radius:3mm; background:#0b2f70; color:white; font-weight:900; font-size:8pt; }
  .cp-brand strong { display:block; font-size:10.5pt; } .cp-brand small { display:block; color:#5d6b82; font-size:7.5pt; letter-spacing:.08em; text-transform:uppercase; }
  .cp-id { text-align:right; } .cp-id small { display:block; color:#5d6b82; font-size:7.5pt; } .cp-id strong { font:700 8pt/1.3 "Courier New",monospace; }
  .cp-title { display:flex; justify-content:space-between; align-items:flex-end; gap:6mm; }
  .cp-title p { margin:0; font-size:7.5pt; font-weight:900; letter-spacing:.14em; text-transform:uppercase; color:#165dff; }
  .cp-title h1 { margin:1.2mm 0 .8mm; font-size:21pt; line-height:1.1; letter-spacing:-.02em; } .cp-title span { color:#5d6b82; font-size:9.5pt; }
  .cp-status { flex-shrink:0; display:flex; align-items:center; gap:2mm; padding:1.8mm 3.6mm; border-radius:99px; font-weight:800; font-size:9.5pt; }
  .cp-status i { width:2.6mm; height:2.6mm; border-radius:50%; background:currentColor; }
  .cp-status--good { background:#e7f6ef; color:#087f5b; } .cp-status--working { background:#fff3d6; color:#7b4b00; }
  .cp-status--watch { background:#fff3d6; color:#7b4b00; } .cp-status--below { background:#fff2f0; color:#b42318; }
  .cp-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:2.6mm; }
  .cp-kpi { border:1px solid #dce3ed; border-radius:2.6mm; padding:2.6mm 3.2mm; background:#f4f7fb; }
  .cp-kpi--warn { border-color:#f0d9a8; background:#fff8e6; }
  .cp-kpi span { display:block; font-size:8pt; font-weight:700; color:#5d6b82; } .cp-kpi b { font-size:19pt; font-weight:900; margin-right:1.4mm; }
  .cp-kpi em { font-style:normal; font-size:8.5pt; color:#5d6b82; } .cp-kpi i { display:block; font-style:normal; font-weight:800; font-size:8.5pt; }
  .pos { color:#087f5b; } .neg { color:#b42318; } .mut { color:#5d6b82; } .warn { color:#7b4b00; }
  .cp-callout { border-left:1mm solid #165dff; background:#eef4ff; border-radius:1.5mm; padding:2.4mm 3.6mm; line-height:1.5; }
  .cp-legend { display:flex; flex-wrap:wrap; gap:4mm; font-size:8pt; color:#5d6b82; margin-bottom:2mm; }
  .cp-legend span { display:flex; align-items:center; gap:1.5mm; } .cp-legend i { width:3.6mm; height:2mm; border-radius:.5mm; }
  .cp-legend i.start { background:#b9cdf5; } .cp-legend i.now { background:#0b2f70; } .cp-legend i.level { width:.6mm; height:3mm; background:#b42318; }
  .cp-skill { display:grid; grid-template-columns:44mm 1fr 26mm; gap:3mm; align-items:center; margin-bottom:2.2mm; }
  .cp-skill strong { font-size:9.5pt; } .cp-skill small { display:block; font-size:7.5pt; color:#5d6b82; font-weight:600; }
  .cp-skill--low small { color:#9a6700; } .cp-skill--low .cp-bars { opacity:.45; }
  .cp-bars { position:relative; display:flex; flex-direction:column; gap:.8mm; }
  .cp-track { height:2.3mm; border-radius:1mm; background:#f0f3f8; } .cp-track--now { height:3.1mm; }
  .cp-bar { height:100%; border-radius:1mm; } .cp-bar--start { background:#b9cdf5; } .cp-bar--now { background:#0b2f70; }
  .cp-level { position:absolute; top:-.8mm; bottom:-.8mm; width:.6mm; background:#b42318; }
  .cp-skill-n { text-align:right; font-size:9pt; } .cp-skill-n span { color:#5d6b82; } .cp-skill-n i { display:block; font-style:normal; font-weight:800; }
  .cp-weak { margin-top:2mm; border:1px solid #dce3ed; border-radius:2mm; padding:2.4mm 3mm; }
  .cp-weak > strong { display:block; font-size:9pt; margin-bottom:1.6mm; }
  .cp-weak > div { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:2mm; }
  .cp-weak > div > div { background:#fff3f2; border-radius:1.5mm; padding:1.6mm 2mm; } .cp-weak b { display:block; font-size:12pt; color:#b42318; }
  .cp-weak span { font-size:8pt; font-weight:600; line-height:1.3; }
  .cp-eng { display:grid; grid-template-columns:64mm 1fr; gap:4mm; }
  .cp-tiles { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2mm; }
  .cp-tiles div { border:1px solid #dce3ed; border-radius:2mm; padding:2mm 2.6mm; } .cp-tiles span { display:block; font-size:7.5pt; color:#5d6b82; font-weight:700; } .cp-tiles b { font-size:13pt; }
  .cp-chart { border:1px solid #dce3ed; border-radius:2mm; padding:2.4mm 3mm; display:flex; flex-direction:column; }
  .cp-chart > span { font-size:7.5pt; font-weight:700; color:#5d6b82; }
  .cp-weeks { flex:1; display:flex; align-items:flex-end; gap:1.6mm; margin-top:2mm; min-height:24mm; }
  .cp-week { flex:1; display:flex; flex-direction:column; align-items:center; gap:.6mm; } .cp-week b { font-size:7.5pt; }
  .cp-week div { width:100%; border-radius:.8mm .8mm 0 0; background:#165dff; } .cp-week div.low { background:#f0b440; }
  .cp-week span { font-size:7pt; color:#5d6b82; white-space:nowrap; }
  .cp-sub { margin:0 0 2mm; font-size:8pt; color:#5d6b82; }
  .cp-band-row { display:grid; grid-template-columns:22mm 1fr; gap:3mm; align-items:center; margin-bottom:1.6mm; } .cp-band-row strong { font-size:9.5pt; }
  .cp-band { display:flex; height:6.2mm; border-radius:1.5mm; overflow:hidden; font-weight:800; font-size:9pt; }
  .cp-band div { display:grid; place-items:center; color:white; }
  .b-below { background:#b42318; } .b-working { background:#f0b440; color:#13213c!important; } .b-at { background:#165dff; } .b-above { background:#0b2f70; }
  .cp-band-key { display:flex; flex-wrap:wrap; gap:4mm; padding-left:25mm; font-size:8pt; color:#5d6b82; }
  .cp-band-key span { display:flex; align-items:center; gap:1.2mm; } .cp-band-key i { width:2.6mm; height:2.6mm; border-radius:.5mm; }
  .cp-table { width:100%; border-collapse:collapse; font-size:9pt; table-layout:fixed; }
  .cp-table th { background:#0b2f70; color:white; text-align:left; font-size:7.5pt; text-transform:uppercase; letter-spacing:.04em; padding:1.8mm 2.4mm; }
  .cp-table th:first-child { width:36mm; } .cp-table th:last-child { width:24mm; }
  .cp-table td { border-bottom:1px solid #dce3ed; padding:1.5mm 2.4mm; vertical-align:top; overflow-wrap:anywhere; }
  .st-plan_active,.st-plan_planned { color:#087f5b; font-weight:800; } .st-needs_plan { color:#b42318; font-weight:800; }
  .cp-two { display:grid; grid-template-columns:1fr 1fr; gap:3mm; }
  .cp-card { border:1px solid #dce3ed; border-radius:2.6mm; padding:2.6mm 3.2mm; } .cp-card > strong { display:block; margin-bottom:1.6mm; font-size:9.5pt; }
  .cp-li { display:flex; justify-content:space-between; padding:1mm 0; border-bottom:1px solid #eef1f6; }
  .cp-hl { line-height:1.55; }
  .cp-note { border:1px solid #dce3ed; border-radius:2.6mm; padding:2.6mm 3.2mm; background:#f4f7fb; }
  .cp-note > div { display:flex; justify-content:space-between; margin-bottom:1.2mm; } .cp-note small { color:#5d6b82; font-size:8pt; }
  .cp-note p { margin:0; line-height:1.55; white-space:pre-wrap; }
  .cp-focus { margin:0; padding-left:5mm; line-height:1.5; }
  .cp-sign { margin-top:auto; display:grid; grid-template-columns:1fr 1fr; gap:10mm; padding-top:2mm; }
  .cp-sign div { border-top:1px solid #13213c; padding-top:1.4mm; font-size:8pt; color:#5d6b82; }
  .cp-foot { position:absolute; left:13mm; right:13mm; bottom:7mm; display:flex; justify-content:space-between; gap:6mm; border-top:1px solid #dce3ed; padding-top:1.5mm; color:#5d6b82; font-size:7pt; line-height:1.35; }
  .cp-foot span:last-child { white-space:nowrap; }
  .cp-empty { margin:0; color:#5d6b82; font-size:9pt; }
  .blank-page { display:flex; align-items:center; justify-content:center; color:#68788e; border:2px dashed #b9c4d4; }
  .blank-page span { font-size:16px; text-align:center; padding:30px; }
  @media print {
    html,body { background:white; margin:0; padding:0; } .bar { display:none; }
    .preview-viewport { width:auto!important; height:auto!important; margin:0; } .preview-stage { width:auto; transform:none!important; }
    .print-page { margin:0; break-inside:avoid; break-after:page; } .student-booklet:last-child .print-page:last-child { break-after:auto; }
    .blank-page { display:block; border:0; } .blank-page span { display:none; }
  }
  @media screen and (max-width:850px) { .bar { gap:10px; padding:12px; } }`;

export function buildClassProgressPrint(model: CprModel, options: ClassProgressPrintOptions): ClassProgressPrintDocument {
  const documentId = options.documentId ?? createSchoolDocumentId("class");
  const brand = reportBrand(model.schoolName || PRODUCT_NAME, model.schoolLogoUrl);
  const firstRows = model.support.slice(0, SUPPORT_ROWS_PAGE_2);
  const rest = model.support.slice(SUPPORT_ROWS_PAGE_2);
  const chunks: typeof rest[] = [];
  for (let i = 0; i < rest.length; i += SUPPORT_ROWS_NEXT_PAGE) chunks.push(rest.slice(i, i + SUPPORT_ROWS_NEXT_PAGE));
  const total = 2 + chunks.length;
  const pages = [
    pageOne(model, brand, documentId, total),
    pageTwo(model, brand, documentId, total, firstRows, rest.length, options),
    ...chunks.map((rows, i) => continuationPage(model, brand, documentId, 3 + i, total, rows)),
  ];
  const settings = { ...options.settings, keepTogether: false };
  const plan = planBookletPrint([pages.length], settings);
  const status = `${plan.physicalSheets} physical sheet${plan.physicalSheets === 1 ? "" : "s"} · ${plan.contentPages} page${plan.contentPages === 1 ? "" : "s"}`;
  const reminder = classProgressPrinterReminder(settings);
  const title = `Class progress report · ${model.groupName}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head>
<body><div class="bar"><button type="button" id="back" class="back">← Back to Brains Heist</button><button type="button" id="print" disabled>Preparing…</button><div class="bar-copy"><strong id="print-status" role="status">${esc(status)}</strong><span id="printer-reminder">${esc(reminder)}</span></div></div>
<div class="preview-viewport"><main class="preview-stage"><article class="student-booklet">${pages.join("")}</article></main></div></body></html>`;
  return { html, plan, documentId, status, reminder, title, pages: pages.length };
}

/** Open the smart print preview in a window reserved by the click, wire Print and Back, and register the document. */
export function openClassProgressPrint(model: CprModel, options: ClassProgressPrintOptions, reserved?: Window | null): Window | null {
  const doc = buildClassProgressPrint(model, options);
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
      documentId: doc.documentId, templateVersion: "class-progress-report-v1", title: doc.title, schoolName: model.schoolName, schoolLogoUrl: model.schoolLogoUrl,
      audience: "internal", status: "final", confidentiality: "confidential", generatedAt: model.generatedAt, schoolId: options.schoolId ?? null,
      visibilityScope: "school_staff", sourceType: "class_progress_report", sourceId: options.groupId ?? undefined, documentTypeLabel: "Class progress report",
    },
    bodyHtml: "", persistPayload: false, orientation: "portrait", paper: "A4",
  });
  return win;
}
