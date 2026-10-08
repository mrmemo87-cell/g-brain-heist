import { supabase } from "./supabaseClient";
export type LearningFeedback = Record<
  "went_well" | "work_on" | "practice" | "check_again",
  string
>;
export interface LearningAllocation {
  id: string;
  title: string;
  purpose: string;
  status: string;
  student_name: string;
  reason: string;
  due_at: string | null;
  reviewed: boolean;
}
export interface LearningWorkspace {
  manager: boolean;
  pilot_only: boolean;
  tasks: {
    code: string;
    title: string;
    purpose: string;
    success_description: string;
  }[];
  allocations: LearningAllocation[];
}
export interface LearningDetail {
  id: string;
  student_id: string;
  manager: boolean;
  title: string;
  purpose: string;
  instructions: string;
  success_description: string;
  reason: string;
  questions: { id: string; prompt: string }[];
  audio_bucket: string;
  audio_path: string;
  audio_sha256: string;
  status: string;
  answers: Record<string, string>;
  revision: number;
  source_attempt_id: string;
  play_count: number;
  conditions_need_review: boolean;
  result: null | {
    score: number;
    total: number;
    submitted_at: string;
    outcomes: {
      id: string;
      correct: boolean;
      response_state: string;
      accepted_answers: string[];
    }[];
  };
  review: null | {
    fields: LearningFeedback;
    reviewer: string;
    reviewed_at: string;
  };
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(
      error.message.includes("draft_changed")
        ? "This task changed in another tab. Reopen it and choose which saved copy to use."
        : "We could not confirm this step. Check your access and connection, then try again.",
    );
  return data as T;
}
export const learningWorkspace = (school: string | null = null) =>
  rpc<LearningWorkspace>("rpc_ielts_learning_workspace", { p_school: school });
export const learningDetail = (id: string) =>
  rpc<LearningDetail>("rpc_ielts_learning_detail", { p_id: id });
export const allocateLearning = (
  school: string,
  student: string,
  task: string,
  source: string,
  reason: string,
  request: string,
) =>
  rpc<string>("rpc_ielts_learning_allocate", {
    p_school: school,
    p_student: student,
    p_task: task,
    p_source: source,
    p_reason: reason,
    p_due: null,
    p_request: request,
  });
export const saveLearning = (
  id: string,
  revision: number,
  answers: Record<string, string>,
) =>
  rpc<number>("rpc_ielts_learning_save", {
    p_id: id,
    p_revision: revision,
    p_answers: answers,
  });
export const submitLearning = (id: string, revision: number) =>
  rpc<LearningDetail>("rpc_ielts_learning_submit", {
    p_id: id,
    p_revision: revision,
  });
export const learningIncident = (id: string, kind: string) =>
  rpc<void>("rpc_ielts_learning_incident", { p_id: id, p_kind: kind });
export const shareLearningReview = (
  id: string,
  feedback: LearningFeedback,
  request: string,
) =>
  rpc<LearningDetail>("rpc_ielts_learning_review", {
    p_id: id,
    p_feedback: feedback,
    p_request: request,
  });
export async function learningAudio(d: LearningDetail) {
  const { data, error } = await supabase.storage
    .from(d.audio_bucket)
    .createSignedUrl(d.audio_path, 3600);
  if (error || !data?.signedUrl)
    throw new Error(
      "The recording could not load. Your answers are safe. Try loading it again.",
    );
  return data.signedUrl;
}
