import { supabase } from './supabaseClient.js';

export type IeltsReviewSkill = 'writing' | 'speaking';
export type IeltsReviewStatus = 'pending' | 'in_review' | 'finalized' | string;

export type WritingRubric = {
  task_achievement: number | null;
  coherence_cohesion: number | null;
  lexical_resource: number | null;
  grammar: number | null;
};

export type SpeakingRubric = {
  fluency: number | null;
  lexical_resource: number | null;
  grammar: number | null;
  pronunciation: number | null;
};

export type IeltsReviewRubric = WritingRubric | SpeakingRubric | Record<string, number | null>;

export interface IeltsReviewQueueItem {
  skill: IeltsReviewSkill;
  attempt_id: string;
  student_id: string;
  student_name: string | null;
  class_id: string | null;
  class_name: string | null;
  submitted_at: string | null;
  review_id: string | null;
  review_status: IeltsReviewStatus;
  overall_band: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  prompt: string | null;
  task_title: string | null;
  word_count: number | null;
  duration_seconds: number | null;
}

export interface IeltsReviewDetail extends IeltsReviewQueueItem {
  review_id: string;
  prompt: string | null;
  task_type?: string | null;
  part?: number | null;
  student_answer?: string | null;
  transcript?: string | null;
  audio_url?: string | null;
  rubric: IeltsReviewRubric;
  strengths: string | null;
  improvements: string | null;
  next_steps: string | null;
  teacher_feedback: string | null;
  private_notes: string | null;
}

export interface IeltsReviewQueueFilters {
  schoolId?: string | null;
  classId?: string | null;
  studentId?: string | null;
  skill?: IeltsReviewSkill | '' | null;
  reviewStatus?: IeltsReviewStatus | '' | null;
  limit?: number | null;
}

export interface SubmitIeltsReviewParams {
  skill: IeltsReviewSkill;
  attemptId: string;
  rubric: IeltsReviewRubric;
  overallBand: number | null;
  strengths?: string | null;
  improvements?: string | null;
  nextSteps?: string | null;
  teacherFeedback?: string | null;
  privateNotes?: string | null;
  finalize?: boolean;
}

export interface IeltsTeacherReviewRpcClient {
  rpc: typeof supabase.rpc;
}

type RpcError = { message?: string; details?: string; hint?: string; code?: string };
type RpcResult<T> = Promise<{ data: T | null; error: RpcError | null }>;

const withClient = (client?: IeltsTeacherReviewRpcClient): IeltsTeacherReviewRpcClient => client ?? supabase;

const assertNoRpcError = <T>(name: string, data: T | null, error: RpcError | null): T => {
  if (error) {
    throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  }
  if (data === null || data === undefined) {
    throw new Error(`${name} returned no data`);
  }
  return data;
};

export const writingRubricKeys: Array<keyof WritingRubric> = ['task_achievement', 'coherence_cohesion', 'lexical_resource', 'grammar'];
export const speakingRubricKeys: Array<keyof SpeakingRubric> = ['fluency', 'lexical_resource', 'grammar', 'pronunciation'];

export const emptyWritingRubric = (): WritingRubric => ({ task_achievement: null, coherence_cohesion: null, lexical_resource: null, grammar: null });
export const emptySpeakingRubric = (): SpeakingRubric => ({ fluency: null, lexical_resource: null, grammar: null, pronunciation: null });

export const normalizeBandInput = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(9, Math.max(0, Math.round(numeric * 2) / 2));
};

export const rubricForSkill = (skill: IeltsReviewSkill, rubric?: IeltsReviewRubric | null): IeltsReviewRubric => {
  const keys = skill === 'writing' ? writingRubricKeys : speakingRubricKeys;
  const fallback = skill === 'writing' ? emptyWritingRubric() : emptySpeakingRubric();
  return keys.reduce<Record<string, number | null>>((acc, key) => {
    acc[key] = normalizeBandInput((rubric as Record<string, unknown> | undefined)?.[key]) ?? fallback[key as keyof typeof fallback] ?? null;
    return acc;
  }, {});
};

export const rpcIeltsReviewQueue = async (
  filters: IeltsReviewQueueFilters = {},
  client?: IeltsTeacherReviewRpcClient,
): Promise<IeltsReviewQueueItem[]> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_review_queue', {
    p_school_id: filters.schoolId ?? null,
    p_class_id: filters.classId ?? null,
    p_student_id: filters.studentId ?? null,
    p_skill: filters.skill || null,
    p_review_status: filters.reviewStatus || null,
    p_limit: filters.limit ?? 100,
  }) as unknown as Awaited<RpcResult<IeltsReviewQueueItem[]>>;

  return assertNoRpcError('rpc_ielts_review_queue', data, error);
};

export const rpcIeltsReviewDetail = async (
  skill: IeltsReviewSkill,
  attemptId: string,
  client?: IeltsTeacherReviewRpcClient,
): Promise<IeltsReviewDetail> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_review_detail', {
    p_skill: skill,
    p_attempt_id: attemptId,
  }) as unknown as Awaited<RpcResult<IeltsReviewDetail>>;

  return assertNoRpcError('rpc_ielts_review_detail', data, error);
};

export const rpcIeltsSubmitReview = async (
  params: SubmitIeltsReviewParams,
  client?: IeltsTeacherReviewRpcClient,
): Promise<IeltsReviewDetail> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_submit_review', {
    p_skill: params.skill,
    p_attempt_id: params.attemptId,
    p_rubric: rubricForSkill(params.skill, params.rubric),
    p_overall_band: normalizeBandInput(params.overallBand),
    p_strengths: params.strengths ?? null,
    p_improvements: params.improvements ?? null,
    p_next_steps: params.nextSteps ?? null,
    p_teacher_feedback: params.teacherFeedback ?? null,
    p_private_notes: params.privateNotes ?? null,
    p_finalize: params.finalize ?? false,
  }) as unknown as Awaited<RpcResult<IeltsReviewDetail>>;

  return assertNoRpcError('rpc_ielts_submit_review', data, error);
};
