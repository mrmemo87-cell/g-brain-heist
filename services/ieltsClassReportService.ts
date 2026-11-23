// Visual & UX Bible 1.21.0 section 13.13 and Diagnostic Bible 2.7.3 section 15.1: the teacher's class report.
// Read-only: what each student was given and how it went. Scores are only those the platform already governs:
// Listening and Reading marks (never a band), and the teacher's confirmed Speaking band, always labelled.
import { supabase } from "./supabaseClient";

export type ReportScope = "all" | "class" | "batch";
export type ReportKind = "targeted_practice" | "school_practice" | "screener" | "speaking_mock" | "speaking_interview";
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
export interface ReportStudent { id: string; name: string; class_name: string | null; items: ReportItem[] }
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
};

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
  for (const i of student.items) {
    const s = cellState(i, now);
    if (s === "result" || s === "done" || s === "waiting") done += 1;
    if (s === "overdue") overdue += 1;
    if (s === "waiting") waiting += 1;
  }
  return { given: student.items.filter((i) => i.status !== "excused").length, done, overdue, waiting };
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
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}
