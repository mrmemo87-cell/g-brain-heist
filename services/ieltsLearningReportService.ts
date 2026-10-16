import { supabase } from "./supabaseClient";
export const learningSkills = [
  "listening",
  "reading",
  "writing",
  "speaking",
] as const;
export type LearningSkill = (typeof learningSkills)[number];
export const pathwayLabels = {
  foundation: "Foundation + introductory IELTS",
  exam_preparation: "Focused IELTS preparation",
  more_evidence: "More evidence needed",
} as const;
export interface SkillPlan {
  pathway: keyof typeof pathwayLabels;
  rationale: string;
  sources: string[];
}
export interface LearningGoal {
  skill: LearningSkill;
  action: string;
  success: string;
  check: string;
}
export interface LearningPlanFields {
  study_goal: string;
  next_action: string;
  review_on: string;
  skills: Record<LearningSkill, SkillPlan>;
  goals: LearningGoal[];
}
export interface LearningPlan {
  id: string;
  version: number;
  fields: LearningPlanFields;
  author: string;
  created_at: string;
}
export interface ReportEvidence {
  source_type: string;
  source_id: string;
  instance_id: string;
  skill: LearningSkill;
  occurred_at: string;
  kind: string;
  raw_score?: number;
  total?: number;
  word_count?: number;
  review_id?: string | null;
  reviewed_at?: string | null;
  reviewer?: string | null;
  next_step?: string | null;
  item_observations?: {
    item: string;
    construct: string | null;
    response_state: string;
    marks_awarded: number;
    marks_possible: number;
  }[];
  observations?: Record<string, { status: string; comment: string }> | null;
  feedback?: Record<string, string> | null;
  title?: string;
  status?: string;
  submitted_at?: string | null;
  staff_route?: string;
  version: string | null;
  test_type?: string;
  confidence: string;
  exposure?: string;
  conditions?: string;
  submission_status?: string;
  route: string;
  snapshot_hash: string;
}
export interface LearningReportContext {
  school_id: string;
  student_id: string;
  student_name: string;
  school_name: string;
  can_manage: boolean;
  plan: LearningPlan | null;
  years: { id: string; name: string; starts_on: string; ends_on: string }[];
  evidence: ReportEvidence[];
  reports: {
    id: string;
    version: number;
    status: "draft" | "final";
    period_start: string;
    period_end: string;
  }[];
}
export interface IeltsMonthlyReport {
  school_brand?: { logo_url: string | null };
  id: string;
  version: number;
  status: "draft" | "final";
  generated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
  payload_hash: string;
  payload: {
    schemaVersion: "ielts-monthly-report-v1";
    bibleVersion: string;
    student: { id: string; name: string };
    school: { id: string; name: string; logo_url?: string | null };
    period: {
      start: string;
      end: string;
      cutoff: string;
      timezone: string;
      interim: boolean;
    };
    plan: LearningPlan;
    evidence: ReportEvidence[];
    confidence: "low";
    progress: "improvement_not_yet_established";
    limitations: string[];
  };
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error?.message === "plan_evidence_inconsistent")
    throw new Error(
      "The plan asks for an assessment that already has teacher-reviewed evidence. Revise the goal or explicitly request a fresh follow-up before sharing.",
    );
  if (error?.message === "plan_source_changed_review")
    throw new Error(
      "Supporting evidence has changed. Check the plan’s evidence references and share an updated plan before generating the report.",
    );
  if (error)
    throw new Error(
      "This step could not be confirmed. Your saved work is safe. Check your connection, reload to confirm the latest version, then try again.",
    );
  if (!data || typeof data !== "object")
    throw new Error(
      "This learning record could not be confirmed. Please reload.",
    );
  return data as T;
}
export async function learningReportContext(school?: string, student?: string) {
  const d = await rpc<LearningReportContext>(
    "rpc_ielts_learning_report_context",
    { p_school: school ?? null, p_student: student ?? null },
  );
  if (
    !Array.isArray(d.evidence) ||
    !Array.isArray(d.reports) ||
    typeof d.can_manage !== "boolean" ||
    (student && d.student_id !== student) ||
    (school && d.school_id !== school)
  )
    throw new Error(
      "This learning record could not be confirmed. Please reload.",
    );
  return d;
}
export const saveLearningPlan = (
  school: string,
  student: string,
  fields: LearningPlanFields,
  expected: string | null,
  request: string,
) =>
  rpc<{ id: string; version: number }>("rpc_ielts_save_learning_plan", {
    p_school: school,
    p_student: student,
    p_fields: fields,
    p_expected: expected,
    p_request: request,
  });
export const generateMonthlyReport = (
  school: string,
  student: string,
  year: string,
  start: string,
  end: string,
  cutoff: string,
  plan: string,
) =>
  rpc<{ id: string; version: number }>("rpc_ielts_generate_monthly_report", {
    p_school: school,
    p_student: student,
    p_year: year,
    p_start: start,
    p_end: end,
    p_cutoff: cutoff,
    p_plan: plan,
  });
export async function monthlyReport(id: string, finalize = false) {
  const d = await rpc<IeltsMonthlyReport>("rpc_ielts_monthly_report", {
    p_report: id,
    p_finalize: finalize,
  });
  if (
    d.id !== id ||
    d.payload?.schemaVersion !== "ielts-monthly-report-v1" ||
    d.payload.confidence !== "low" ||
    d.payload.progress !== "improvement_not_yet_established" ||
    !["draft", "final"].includes(d.status)
  )
    throw new Error("This report could not be confirmed. Please reload.");
  return d;
}
export const emptyLearningPlan = (): LearningPlanFields => ({
  study_goal: "",
  next_action: "",
  review_on: "",
  skills: Object.fromEntries(
    learningSkills.map((s) => [
      s,
      { pathway: "more_evidence", rationale: "", sources: [] },
    ]),
  ) as unknown as Record<LearningSkill, SkillPlan>,
  goals: [{ skill: "writing", action: "", success: "", check: "" }],
});
export function evidenceSummary(e: ReportEvidence) {
  if (e.kind === "guided_practice")
    return e.status === "completed"
      ? "Practice · completed"
      : e.review_id
        ? "Practice · feedback shared"
        : e.submitted_at
          ? "Practice · submitted"
          : e.status === "historical_status_unavailable"
            ? "Earlier work status unavailable"
            : "Practice · assigned";
  if (e.raw_score != null && e.total != null)
    return `${e.raw_score} / ${e.total} · Short screener`;
  return e.review_id
    ? "Short check · teacher reviewed"
    : "Short check · awaiting teacher review";
}
export function evidenceInPeriod(
  e: ReportEvidence,
  start: string,
  end: string,
) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bishkek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(e.occurred_at));
  return day >= start && day <= end;
}

export const saveLearningPlanWithAi = (
  school: string,
  student: string,
  fields: LearningPlanFields,
  expected: string | null,
  request: string,
  draft: string,
) =>
  rpc<{ id: string; version: number }>("rpc_ielts_save_plan_with_ai", {
    p_school: school,
    p_student: student,
    p_fields: fields,
    p_expected: expected,
    p_request: request,
    p_draft: draft,
  });
export async function draftLearningPlan(school: string, student: string) {
  const { data, error } = await supabase.functions.invoke(
    "ielts_learning_plan_ai",
    { body: { schoolId: school, studentId: student } },
  );
  if (
    error ||
    !data?.id ||
    !data?.fields ||
    data.teacher_confirmation_required !== true
  )
    throw new Error(
      "AI help could not finish. Your current plan is safe. Try again or continue editing yourself.",
    );
  return data as {
    id: string;
    fields: LearningPlanFields;
    teacher_confirmation_required: true;
  };
}

export const requestIeltsReportCorrection = (report: string, detail: string) =>
  rpc<{ id: string }>("rpc_ielts_report_correction", {
    p_report: report,
    p_detail: detail,
  });
