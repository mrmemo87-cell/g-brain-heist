import { supabase } from './supabaseClient.js';

export type IeltsJourneyConfidenceLevel = 'low' | 'medium' | 'high' | string;
export type IeltsJourneySkill = 'reading' | 'listening' | 'writing' | 'speaking' | string;

export interface IeltsJourneyEstimates {
  reading: number | null;
  listening: number | null;
  writing: number | null;
  speaking: number | null;
  overall: number | null;
}

export interface IeltsJourneyRecentPracticeItem {
  source: 'practice' | string;
  skill: IeltsJourneySkill;
  id: string;
  content_id?: string | number | null;
  occurred_at: string | null;
  score_percent?: number | null;
  estimated_band?: number | null;
}

export interface IeltsJourneyExamSubmissionItem {
  source: 'exam_mode' | string;
  submission_id: string;
  attempt_id: string | null;
  submitted_at: string | null;
  grading_status: string | null;
  attempt_status?: string | null;
  exam_event_id?: string | null;
  title?: string | null;
  result_status?: string | null;
}
export interface IeltsJourneyAssignmentItem {
  assignment_id: string;
  title: string;
  status: string;
  assigned_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  due_at?: string | null;
}
export interface IeltsJourneyTeacherFeedbackItem {
  review_id: string;
  skill: IeltsJourneySkill;
  attempt_id: string;
  overall_band: number | null;
  rubric_summary?: string | null;
  feedback_preview?: string | null;
  reviewed_at?: string | null;
  review_result_link: string;
}

export interface IeltsJourneyAssignedPracticeSummary {
  total: number;
  assigned: number;
  in_progress: number;
  completed: number;
  overdue: number;
}

export interface IeltsStudentJourney {
  student_id: string;
  target_band: number | null;
  current_estimates: IeltsJourneyEstimates;
  confidence_level: IeltsJourneyConfidenceLevel;
  recent_practice: IeltsJourneyRecentPracticeItem[];
  recent_exam_mode_submissions: IeltsJourneyExamSubmissionItem[];
  assigned_practice_summary: IeltsJourneyAssignedPracticeSummary;
  assigned_practice: IeltsJourneyAssignmentItem[];
  completed_practice: IeltsJourneyAssignmentItem[];
  teacher_feedback: IeltsJourneyTeacherFeedbackItem[];
  weak_skill: IeltsJourneySkill | null;
  next_recommendation: string;
}

export interface IeltsJourneyRpcClient {
  rpc: typeof supabase.rpc;
}

type RpcError = { message?: string; details?: string; hint?: string; code?: string };
type RpcResult<T> = Promise<{ data: T | null; error: RpcError | null }>;

const withClient = (client?: IeltsJourneyRpcClient): IeltsJourneyRpcClient => client ?? supabase;

const assertNoRpcError = <T>(name: string, data: T | null, error: RpcError | null): T => {
  if (error) {
    throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  }
  if (data === null || data === undefined) {
    throw new Error(`${name} returned no data`);
  }
  return data;
};

export const rpcIeltsStudentJourney = async (
  studentId?: string | null,
  client?: IeltsJourneyRpcClient
): Promise<IeltsStudentJourney> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_student_journey', {
    p_student_id: studentId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsStudentJourney>>;

  return assertNoRpcError('rpc_ielts_student_journey', data, error);
};
