import { supabase } from "./supabaseClient";
export type FeedbackKey = "went_well" | "work_on" | "practice" | "check_again";
export type LearningSkill = "listening" | "reading" | "writing" | "speaking";
export type LearningFeedback = Record<
  "went_well" | "work_on" | "practice" | "check_again",
  string
> & { criteria?: Record<string, string>; audio_checked?: boolean };
export interface LearningAllocation {
  id: string;
  task_code?: string;
  originality_label?: string | null;
  display_code?: string;
  student_id?: string;
  assigned_at?: string;
  title: string;
  purpose: string;
  skill: LearningSkill;
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
    originality_label?: string | null;
  display_code?: string;
    pilot_student: string;
    pilot_student_name: string;
    version: string;
    title: string;
    purpose: string;
    success_description: string;
    skill: LearningSkill;
    content: LearningContent;
    instructions: string;
    content_sha256: string;
    requires_review: boolean;
    approved: boolean;
    questions: {
      id: string;
      prompt: string;
      accepted_answers?: string[];
      primary_name: string;
      supporting_name: string;
    }[];
  }[];
  allocations: LearningAllocation[];
}
export interface LearningContent {
  passage?: string;
  prompt?: string;
  scaffold?: string;
  teacher_notes?: string;
  focus?: string;
  scope?: string;
  suggested_minutes?: number;
  mapping_scope?: string;
}
export interface LearningDetail {
  originality_label?: string | null;
  display_code?: string;
  skill: LearningSkill;
  content: LearningContent;
  source_route: string;
  pending_recordings: string[];
  recordings: {
    id: string;
    path: string;
    duration_seconds: number;
    interrupted: boolean;
    sha256: string;
  }[];
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
    score: number | null;
    total: number | null;
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
      error.message.includes("Originality review required")
        ? "A content administrator must finish originality review before this task can be assigned."
        : error.message.includes("already been exposed")
        ? "This student has already seen this material or a linked variant. Choose an unseen independent check."
        : error.message.includes("draft_changed")
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
  aiDraft?: string,
) =>
  rpc<LearningDetail>(aiDraft ? "rpc_ielts_learning_review_with_draft" : "rpc_ielts_learning_review", {
    p_id: id,
    p_feedback: feedback,
    p_request: request,
    ...(aiDraft ? { p_draft: aiDraft } : {}),
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

export const approveLearningContent = (
  school: string,
  task: string,
  hash: string,
  notes: string,
  confirmed: boolean,
) =>
  rpc<void>("rpc_ielts_learning_approve_content", {
    p_school: school,
    p_task: task,
    p_hash: hash,
    p_notes: notes,
    p_confirmed: confirmed,
  });
export const beginLearningRecording = (id: string, clip: string) =>
  rpc<{ path: string }>("rpc_ielts_learning_begin_recording", {
    p_id: id,
    p_clip: clip,
    p_consent: true,
  });
export const abandonLearningRecording = (id: string, clip: string) =>
  rpc<void>("rpc_ielts_learning_abandon_recording", { p_id: id, p_clip: clip });
export async function learningRecordingAudio(path: string) {
  const { data, error } = await supabase.storage
    .from("ielts-learning-recordings")
    .createSignedUrl(path, 900);
  if (error || !data?.signedUrl)
    throw new Error("Your recording could not load. Try again.");
  return data.signedUrl;
}

export async function uploadLearningRecording(
  audio: import("./ieltsSpeakingPilotService").LocalSpeakingAudio,
): Promise<LearningDetail> {
  const { localSpeaking, prepareSpeakingWav } =
    await import("./ieltsSpeakingPilotService");
  const blob =
    audio.blob ??
    (await prepareSpeakingWav(
      new Blob(audio.chunks, { type: audio.chunks[0]?.type || "audio/webm" }),
    ));
  await localSpeaking("put", { ...audio, blob, complete: true });
  const path = `${audio.ownerId}/${audio.sessionId}/${audio.id}.wav`;
  const { error } = await supabase.storage
    .from("ielts-learning-recordings")
    .upload(path, blob, { contentType: "audio/wav", upsert: false });
  if (
    error &&
    !["409", "400"].includes(
      String((error as { statusCode?: string }).statusCode),
    )
  )
    throw new Error(
      "Your recording is protected on this device. Keep this page open and retry.",
    );
  const { data, error: verifyError } = await supabase.functions.invoke(
    "ielts_learning_recording",
    {
      body: {
        allocationId: audio.sessionId,
        clipId: audio.id,
        interrupted: audio.interrupted,
      },
    },
  );
  if (verifyError || !data?.detail)
    throw new Error(
      "We could not confirm your recording. Your device copy is safe; retry saving.",
    );
  await localSpeaking("delete", audio.id);
  return data.detail;
}

export interface LearningReviewContext {
  school_id: string;
  student_name: string;
  questions: { id: string; prompt: string; accepted_answers?: string[] }[];
  teacher_notes: string | null;
  source: null | {
    score: number; total: number; confidence: string; integrity_state: string;
    items: { id: string; prompt: string; construct: string; response: string | null;
      accepted_answers: string[]; correct: boolean; response_state: string }[];
  };
}
export const learningReviewContext = (id: string) =>
  rpc<LearningReviewContext>("rpc_ielts_learning_review_context", { p_id: id });
export async function draftLearningFeedback(id: string): Promise<{ id: string; fields: LearningFeedback }> {
  const { data, error } = await supabase.functions.invoke("ielts_learning_teacher_ai", { body: { allocationId: id } });
  if (error || !data?.fields || !data?.id) throw new Error("AI help could not finish. Your feedback is safe. Try again or continue writing it yourself.");
  return data;
}
