// Visual & UX Bible 1.24.0 section 13.13 and Diagnostic Bible 2.7.4 section 15.1: the teacher's class report and mark book.
// Read-only: what each student was given and how it went. Scores are only those the platform already governs:
// Listening and Reading marks (never a band), the teacher's confirmed Speaking and Writing bands, always labelled,
// and for full mocks the labelled bh-indicative-v1 indicative band range (section 9.5). Official IELTS results are
// shown as recorded (section 18A).
import { supabase } from "./supabaseClient";

export type ReportScope = "all" | "class" | "batch";
export type ReportKind = "targeted_practice" | "school_practice" | "screener" | "speaking_mock" | "speaking_interview" | "reviewed_writing";
export type ReportStatus = "not_started" | "in_progress" | "done" | "excused" | "skipped";
export interface ReportItem {
  key: string;
  kind: ReportKind;
  title: string;
  code: string | null;
  skill: string | null;
  assigned_at: string;
  due_at: string | null;
  status: ReportStatus;
  done_at: string | null;
  score: { raw: number; total: number } | null;
  band?: { value: number; label: string } | null;
  review: "waiting" | "reviewed" | null;
}
export type MockSkill = "listening" | "reading" | "writing" | "speaking";
export const MOCK_SKILLS: MockSkill[] = ["listening", "reading", "writing", "speaking"];
export interface IndicativeRange { label: string; low: number | null; high: number | null; central: number | null }
export interface MockSection {
  state: "result" | "not_sat" | "in_progress" | "waiting" | "not_part";
  raw?: number | null;
  answered?: number | null;
  exposed?: boolean;
  criteria?: Record<string, unknown> | null;
  indicative?: IndicativeRange | null;
  /** 'rewrite': the Writing of a mock written again after feedback (always practice). */
  practice_reason?: "rewrite" | null;
}
export interface MarkbookMock {
  key: string;
  /** Mocks with the same group share columns: the same form, delivery and (for paper) date. */
  group: string;
  form: string;
  title: string;
  delivery: "paper" | "computer";
  source: "sitting" | "cbt";
  sat_on: string;
  /** A repeat of a mock the student already had is practice: marks only, no indicative range. */
  practice: boolean;
  attempt_no: number | null;
  sections: Record<MockSkill, MockSection>;
}
export interface OfficialResult {
  test_date: string; test_type: string; delivery: string;
  listening: number; reading: number; writing: number; speaking: number; overall: number; verified: boolean;
}
export interface Markbook { mocks: MarkbookMock[]; course: { done: number; total: number }; official: OfficialResult[] }
export interface ReportStudent { id: string; name: string; class_name: string | null; items: ReportItem[]; markbook?: Markbook }
export interface ClassReport {
  school_id: string;
  scope: { kind: ReportScope; value: string | null; name: string | null };
  generated_at: string;
  classes: string[];
  batches: { id: string; name: string }[];
  students: ReportStudent[];
}

export async function classReport(schoolId: string, scope: ReportScope = "all", value: string | null = null): Promise<ClassReport> {
  const { data, error } = await supabase.rpc("rpc_ielts_class_report", { p_school_id: schoolId, p_scope: scope, p_value: value });
  if (error) throw new Error(error.message?.includes("not_authorized")
    ? "Only the programme lead and school administrators can open the class report."
    : "The class report could not be opened just now. Nothing was changed. Try again in a moment.");
  return data as ClassReport;
}

export const kindLabel: Record<ReportKind, string> = {
  targeted_practice: "Targeted practice",
  school_practice: "School practice",
  screener: "Screener",
  speaking_mock: "Speaking practice mock",
  speaking_interview: "Speaking interview",
  reviewed_writing: "Teacher-reviewed Writing",
};

/** The words every copy carries (Diagnostic Bible 15.1): on screen, in print and in every download. */
export const CLASS_REPORT_NOTE =
  "Reading and Listening show correct answers out of the total, not IELTS bands. A Speaking band is the teacher's band, shown only after the teacher confirms the review; practice mock bands are practice. A Writing band is the teacher's band for that one task, shown only after the teacher finalizes the review. Mock tests show marks out of 40 and an indicative band range (from IELTS's published average marks, or the teacher's Writing and Speaking criterion ratings): a planning aid, Confidence: low; a repeated mock is practice and has no range. None of these is an official IELTS result, except the Real IELTS columns, which show official results as recorded (verified or student-reported).";

/** The state a teacher reads first: overdue beats not started; finished work waiting for a teacher says so. */
export type CellState = "result" | "done" | "waiting" | "in_progress" | "not_started" | "overdue" | "excused" | "skipped";
export function cellState(item: ReportItem, now = Date.now()): CellState {
  if (item.status === "excused" || item.status === "skipped") return item.status;
  if (item.status === "done") {
    if (item.score || item.band) return "result";
    return item.review === "waiting" ? "waiting" : "done";
  }
  if (item.due_at && Date.parse(item.due_at) < now) return "overdue";
  return item.status === "in_progress" ? "in_progress" : "not_started";
}
export const stateLabel: Record<CellState, string> = {
  result: "Done", done: "Done", waiting: "Done · waiting for review", in_progress: "Started",
  not_started: "Not started", overdue: "Overdue", excused: "Excused", skipped: "Skipped",
};
/** The result text: "4 / 6" marks for Listening and Reading, or the teacher's Speaking band. */
export function resultText(item: ReportItem): string {
  if (item.score) return `${item.score.raw} / ${item.score.total}`;
  if (item.band) return `Band ${Number(item.band.value).toFixed(1)}`;
  return "";
}

export interface ReportColumn { key: string; title: string; code: string | null; skill: string | null; kind: ReportKind; given: number; latest: string }
/** One column per piece of work, newest first; a student given the same work twice shows the newest. */
export function reportColumns(students: ReportStudent[]): ReportColumn[] {
  const map = new Map<string, ReportColumn>();
  for (const s of students) for (const i of s.items) {
    const c = map.get(i.key);
    if (!c) map.set(i.key, { key: i.key, title: i.title, code: i.code, skill: i.skill, kind: i.kind, given: 1, latest: i.assigned_at });
    else { c.given += 1; if (i.assigned_at > c.latest) c.latest = i.assigned_at; }
  }
  return [...map.values()].sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : a.title.localeCompare(b.title)));
}
export function latestFor(student: ReportStudent, key: string): ReportItem | undefined {
  let best: ReportItem | undefined;
  for (const i of student.items) if (i.key === key && (!best || i.assigned_at > best.assigned_at)) best = i;
  return best;
}
export function studentSummary(student: ReportStudent, now = Date.now()) {
  let done = 0, overdue = 0, waiting = 0;
  // Teacher-reviewed Writing that was never assigned is shown, but is not work given.
  const given = student.items.filter((i) => i.kind !== "reviewed_writing");
  for (const i of given) {
    const s = cellState(i, now);
    if (s === "result" || s === "done" || s === "waiting") done += 1;
    if (s === "overdue") overdue += 1;
    if (s === "waiting") waiting += 1;
  }
  return { given: given.filter((i) => i.status !== "excused").length, done, overdue, waiting };
}

const day = (v: string | null) => (v ? v.slice(0, 10) : "");
const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formulas in names or titles.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** One row per student per piece of work, ready for Excel (UTF-8 with BOM). */
export function reportCsv(report: ClassReport, now = Date.now()): string {
  const head = ["Student", "Class", "Work", "Code", "Type", "Skill", "Given", "Due", "Status", "Done on", "Result", "Result note"];
  const rows = [head.join(",")];
  for (const s of report.students) {
    if (!s.items.length) rows.push([s.name, s.class_name, "No IELTS work given yet", "", "", "", "", "", "", "", "", ""].map(csvCell).join(","));
    for (const i of s.items) {
      const st = cellState(i, now);
      const note = i.score ? "Correct answers (marks, not a band)" : i.band ? `${i.band.label} · not an official IELTS result` : "";
      rows.push([s.name, s.class_name, i.title, i.code, kindLabel[i.kind], i.skill, day(i.assigned_at), day(i.due_at),
        stateLabel[st], day(i.done_at), resultText(i), note].map(csvCell).join(","));
    }
    const mb = s.markbook;
    if (mb) {
      rows.push([s.name, s.class_name, "IELTS course", "", "Course progress", "", "", "", "", "", `${mb.course.done} / ${mb.course.total} units`, "Units completed out of published units"].map(csvCell).join(","));
      for (const m of mb.mocks) for (const k of MOCK_SKILLS) {
        const c = mockSectionCell(m.sections[k], k, m);
        rows.push([s.name, s.class_name, m.title, m.form, `Mock test (${m.delivery})`, k, day(m.sat_on), "", c.status, "", c.text, c.note].map(csvCell).join(","));
      }
      for (const o of mb.official) for (const k of [...MOCK_SKILLS, "overall"] as const) {
        rows.push([s.name, s.class_name, `Real IELTS (${o.test_type === "general_training" ? "General Training" : "Academic"}, ${o.delivery})`, "", "Official IELTS result", k, day(o.test_date), "", o.verified ? "Verified" : "Student-reported", "", band(o[k]), officialNote(o)].map(csvCell).join(","));
      }
    }
  }
  rows.push(["Note", "", CLASS_REPORT_NOTE].map(csvCell).join(","));
  return "﻿" + rows.join("\r\n") + "\r\n";
}

// ---- Mark book (Diagnostic Bible 2.7.4 section 15.1) ----------------------------------------------------------------

export const SKILL_NAME: Record<string, string> = { listening: "Listening", reading: "Reading", writing: "Writing", speaking: "Speaking", overall: "Overall" };
const band = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(1));
const shortDay = (v: string) => { const d = new Date(v + (v.length === 10 ? "T00:00:00Z" : "")); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
const officialNote = (o: OfficialResult) => `Official IELTS result · ${o.verified ? "verified" : "student-reported"} · test date ${o.test_date}`;

export type MarkbookCellState = "result" | "practice" | "not_sat" | "in_progress" | "waiting" | "not_part" | "none";
export interface MarkbookCell { text: string; sub: string; state: MarkbookCellState; title: string; status: string; note: string }

/** One mock section: L/R marks /40 with the indicative range; W/S the range from the teacher's criteria. */
export function mockSectionCell(sec: MockSection | undefined, skill: MockSkill, mock: MarkbookMock): MarkbookCell {
  const name = SKILL_NAME[skill];
  const where = `${mock.title} · ${mock.delivery === "paper" ? "paper" : "computer"} · ${shortDay(mock.sat_on)}`;
  const paper = mock.source === "sitting" ? " · teacher-entered paper evidence" : "";
  const empty = (text: string, state: MarkbookCellState, status: string, why: string): MarkbookCell => ({ text, sub: "", state, title: `${where} · ${name}: ${why}`, status, note: why });
  if (!sec || sec.state === "not_sat") return empty("Not sat", "not_sat", "Not sat", "no result recorded (not sat, or not entered yet)");
  if (sec.state === "in_progress") return empty("Started", "in_progress", "Started", "started, not finished");
  if (sec.state === "waiting") return empty("To review", "waiting", "Done · waiting for review", "finished, waiting for the teacher to mark");
  if (sec.state === "not_part") return empty("—", "not_part", "Not part of this mock", "not part of the computer mock");
  const objective = skill === "listening" || skill === "reading";
  const practice = !!(mock.practice || sec.exposed);
  const range = sec.indicative && typeof sec.indicative === "object" ? sec.indicative : null;
  const text = objective ? `${sec.raw ?? 0} / 40` : range ? range.label : "Rated";
  const sub = range ? (objective ? range.label : "indicative range") : practice ? "practice · no range" : objective ? "no range" : "ratings incomplete · no range";
  const blank = objective && typeof sec.answered === "number" && sec.answered < 40 ? ` (${40 - sec.answered} blank)` : "";
  const note = (objective ? `Correct answers out of 40${blank}` : "Teacher's criterion ratings")
    + (range ? ` · Indicative band range ${range.label} · Confidence: low · Not an official IELTS result`
      : sec.practice_reason === "rewrite" ? " · rewrite after feedback: practice, no indicative range"
      : practice ? " · repeated mock: practice, no indicative range" : " · no indicative range")
    + paper;
  return { text, sub, state: practice ? "practice" : "result", title: `${where} · ${name}: ${note}`, status: practice ? "Done · practice" : "Done", note };
}

export interface MarkbookColumn {
  key: string;
  kind: "course" | "mock" | "official";
  /** The heading over a group of columns (one mock, or the real IELTS result). */
  group: string;
  groupTitle: string;
  title: string;
  skill?: MockSkill | "overall";
}

/** Mark book columns before the work columns: course progress, each mock (four sections), then real IELTS results. */
export function markbookColumns(students: ReportStudent[]): MarkbookColumn[] {
  const withBook = students.filter((s) => s.markbook);
  if (!withBook.length) return [];
  const cols: MarkbookColumn[] = [{ key: "course", kind: "course", group: "course", groupTitle: "Course", title: "Units done" }];
  const groups = new Map<string, MarkbookMock>();
  for (const s of withBook) for (const m of s.markbook!.mocks) if (!groups.has(m.group)) groups.set(m.group, m);
  const ordered = [...groups.values()].sort((a, b) => a.form.localeCompare(b.form) || (a.delivery === b.delivery ? 0 : a.delivery === "paper" ? -1 : 1) || a.sat_on.localeCompare(b.sat_on));
  for (const m of ordered) {
    const groupTitle = mockGroupTitle(m);
    for (const k of MOCK_SKILLS) cols.push({ key: `mock|${m.group}|${k}`, kind: "mock", group: m.group, groupTitle, title: SKILL_NAME[k], skill: k });
  }
  if (withBook.some((s) => s.markbook!.official.length)) {
    for (const k of [...MOCK_SKILLS, "overall"] as const) cols.push({ key: `official|${k}`, kind: "official", group: "official", groupTitle: "Real IELTS (latest)", title: SKILL_NAME[k], skill: k });
  }
  return cols;
}
export function mockGroupTitle(m: MarkbookMock): string {
  return m.source === "cbt" ? `${m.title} · Computer` : `${m.title} · ${m.delivery === "paper" ? "Paper" : "Computer"} · ${shortDay(m.sat_on)}`;
}
/** Consecutive columns sharing a group, for a two-row table heading. */
export function columnGroups(cols: MarkbookColumn[]): { group: string; title: string; span: number }[] {
  const out: { group: string; title: string; span: number }[] = [];
  for (const c of cols) {
    const last = out[out.length - 1];
    if (last && last.group === c.group) last.span += 1;
    else out.push({ group: c.group, title: c.groupTitle, span: 1 });
  }
  return out;
}

export function markbookCell(student: ReportStudent, col: MarkbookColumn): MarkbookCell {
  const mb = student.markbook;
  const none = (title: string): MarkbookCell => ({ text: "·", sub: "", state: "none", title, status: "", note: "" });
  if (!mb) return none("No mark book data");
  if (col.kind === "course") {
    return { text: `${mb.course.done} / ${mb.course.total}`, sub: "units", state: "result", title: `IELTS course: ${mb.course.done} of ${mb.course.total} units completed`, status: "", note: "Units completed out of published units" };
  }
  if (col.kind === "official") {
    const o = mb.official[0];
    if (!o) return none("No official IELTS result recorded");
    const v = o[col.skill as keyof OfficialResult] as number;
    return { text: band(v), sub: col.skill === "overall" ? (o.verified ? "verified" : "student-reported") : "", state: "result", title: `${officialNote(o)} · ${SKILL_NAME[col.skill!]} ${band(v)}`, status: o.verified ? "Verified" : "Student-reported", note: officialNote(o) };
  }
  let mock: MarkbookMock | undefined;
  for (const m of mb.mocks) if (m.group === col.group) mock = m;
  if (!mock) return none("Not in this mock");
  return mockSectionCell(mock.sections[col.skill as MockSkill], col.skill as MockSkill, mock);
}

/** The mark book for Excel: one row per student, a column per mark book column and per piece of work. */
export function markbookCsv(report: ClassReport, now = Date.now()): string {
  const mcols = markbookColumns(report.students);
  const wcols = reportColumns(report.students);
  const head = ["Student", "Class", "Done",
    ...mcols.map((c) => (c.kind === "course" ? "Course units done" : `${c.groupTitle} · ${c.title}`)),
    ...wcols.map((c) => `${c.title}${c.code ? " (" + c.code + ")" : ""} · ${c.skill ? SKILL_NAME[c.skill] ?? c.skill : kindLabel[c.kind]}`)];
  const rows = [head.map(csvCell).join(",")];
  for (const s of report.students) {
    const x = studentSummary(s, now);
    const mb = mcols.map((c) => {
      const cell = markbookCell(s, c);
      if (cell.state === "none") return "";
      return cell.sub && cell.sub !== cell.text && cell.sub !== "units" ? `${cell.text} · ${cell.sub}` : cell.text;
    });
    const work = wcols.map((c) => {
      const i = latestFor(s, c.key);
      if (!i) return "";
      const st = cellState(i, now);
      return resultText(i) || stateLabel[st];
    });
    rows.push([s.name, s.class_name, `${x.done} / ${x.given}`, ...mb, ...work].map(csvCell).join(","));
  }
  rows.push(["Note", "", CLASS_REPORT_NOTE].map(csvCell).join(","));
  return "﻿" + rows.join("\r\n") + "\r\n";
}
