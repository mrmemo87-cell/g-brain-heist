import { supabase } from "./supabaseClient";
export interface ProgrammeSchool {
  id: string;
  name: string;
  can_allocate: boolean;
  can_manage: boolean;
}
export interface ProgrammeEvidence {
  attempt_id: string;
  raw_score?: number;
  total?: number;
  reviewed?: boolean;
  status?: string;
}
export interface ProgrammeStudent {
  id: string;
  name: string;
  listening: ProgrammeEvidence | null;
  reading: ProgrammeEvidence | null;
  writing: ProgrammeEvidence | null;
  speaking: ProgrammeEvidence | null;
}
export interface ProgrammeWorkspace {
  platform_owner: boolean;
  schools: ProgrammeSchool[];
  school_id: string;
  can_allocate: boolean;
  can_manage: boolean;
  lead: {
    id: string;
    teacher_id: string;
    name: string;
    active: boolean;
  } | null;
  teachers: { id: string; name: string }[];
  students: ProgrammeStudent[];
  total_students: number;
  pending_count: number;
  queue: {
    skill: "writing" | "speaking";
    attempt_id: string;
    name: string;
    created_at: string;
  }[];
  classes: { id: string; class_name: string; student_count: number }[];
  confidence: "low";
  readiness_available: false;
}
async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(
      "We could not confirm this step. Saved assessments are safe. Check your access and connection, then try again.",
    );
  return data as T;
}
export const programmeAccess = () =>
  rpc<{ schools: ProgrammeSchool[] }>("rpc_ielts_programme_access");
export const programmeWorkspace = (schoolId: string, search = "", offset = 0) =>
  rpc<ProgrammeWorkspace>("rpc_ielts_programme_workspace", {
    p_school_id: schoolId,
    p_search: search,
    p_offset: offset,
  });
export const setProgrammeLead = (
  schoolId: string,
  teacherId: string | null,
  expectedId: string | null,
  changeId: string,
) =>
  rpc<void>("rpc_ielts_set_programme_lead", {
    p_school_id: schoolId,
    p_teacher_id: teacherId,
    p_expected_lead_id: expectedId,
    p_change_id: changeId,
  });
export function programmeEvidenceLabel(
  skill: string,
  e: ProgrammeEvidence | null,
) {
  if (!e) return "No submitted evidence";
  if (skill === "reading" || skill === "listening")
    return `${e.raw_score ?? 0} / ${e.total ?? 0} · Screener`;
  if (e.reviewed) return "Teacher feedback ready";
  if (e.status === "in_progress") return "Interview in progress";
  return "Awaiting teacher review";
}
export function programmeEvidenceRoute(
  skill: string,
  e: ProgrammeEvidence | null,
) {
  if (!e) return null;
  const id = encodeURIComponent(e.attempt_id);
  return skill === "speaking"
    ? `/ielts/speaking-pilot/${id}`
    : skill === "writing"
      ? `/ielts/writing-screener/reviews/${id}`
      : `/ielts/screener-result/${id}`;
}
