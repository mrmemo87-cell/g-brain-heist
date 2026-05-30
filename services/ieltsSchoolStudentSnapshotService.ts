import { supabase } from './supabaseClient.js';

export type IeltsSnapshotSkill = 'reading' | 'listening' | 'writing' | 'speaking' | string;

export interface IeltsSnapshotStudent {
  id: string;
  name: string | null;
  username?: string | null;
  avatar_url?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  batch?: string | null;
  school_id: string | null;
  last_activity_at: string | null;
}

export interface IeltsSnapshotReadiness {
  status_label: 'More practice needed' | 'On track' | 'Ready' | 'Not enough data' | string;
  target_band: number | null;
  overall_band: number | null;
  reading_band: number | null;
  listening_band: number | null;
  writing_band: number | null;
  speaking_band: number | null;
  sources: Record<string, string | null>;
}

export interface IeltsSnapshotAssignmentItem {
  skill: IeltsSnapshotSkill;
  title: string | null;
  status: string;
  completed_at?: string | null;
  submitted_at?: string | null;
  finalized_at?: string | null;
  feedback_status?: string | null;
  cta?: { label: string; route: string } | null;
}

export interface IeltsSnapshotAssignment {
  title: string;
  due_at: string | null;
  status: string;
  progress: { completed_count: number; total_count: number };
  items: IeltsSnapshotAssignmentItem[];
}

export interface IeltsSnapshotActivityItem {
  skill: IeltsSnapshotSkill;
  title: string | null;
  status: string;
  occurred_at: string | null;
  band?: number | null;
  score?: string | null;
  route?: string | null;
}

export interface IeltsSchoolStudentSnapshot {
  student: IeltsSnapshotStudent;
  readiness: IeltsSnapshotReadiness;
  assignments: {
    active: IeltsSnapshotAssignment[];
    completed: IeltsSnapshotAssignment[];
  };
  recent_activity: {
    objective_results: IeltsSnapshotActivityItem[];
    reviewed_feedback: IeltsSnapshotActivityItem[];
    pending_reviews: IeltsSnapshotActivityItem[];
  };
  needs_attention: string[];
}

export interface IeltsSchoolStudentSnapshotRpcClient {
  rpc: typeof supabase.rpc;
}

type RpcError = { message?: string; details?: string; hint?: string; code?: string };
type RpcResult<T> = Promise<{ data: T | null; error: RpcError | null }>;

const withClient = (client?: IeltsSchoolStudentSnapshotRpcClient): IeltsSchoolStudentSnapshotRpcClient => client ?? supabase;

const assertNoRpcError = <T>(name: string, data: T | null, error: RpcError | null): T => {
  if (error) {
    throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  }
  if (data === null || data === undefined) {
    throw new Error(`${name} returned no data`);
  }
  return data;
};

export const humanizeIeltsSnapshotStatus = (status?: string | null): string => {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'assigned') return 'Not started';
  if (normalized === 'in_progress') return 'In progress';
  if (normalized === 'awaiting_feedback' || normalized === 'pending_review' || normalized === 'review_pending') return 'Review pending';
  if (normalized === 'feedback_ready' || normalized === 'finalized' || normalized === 'reviewed') return 'Feedback ready';
  if (normalized === 'not_required') return 'Not required';
  if (normalized === 'force_submitted') return 'Submitted';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
};

export const bandGapLabel = (band?: number | null, target?: number | null): string | null => {
  if (band == null || target == null) return null;
  const gap = Math.round((target - band) * 10) / 10;
  if (gap <= 0) return 'At or above target';
  return `${gap.toFixed(1)} below target`;
};

export const rpcIeltsSchoolStudentSnapshot = async (
  studentId: string,
  client?: IeltsSchoolStudentSnapshotRpcClient,
): Promise<IeltsSchoolStudentSnapshot> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_school_student_snapshot', {
    p_student_id: studentId,
  }) as unknown as Awaited<RpcResult<IeltsSchoolStudentSnapshot>>;

  return assertNoRpcError('rpc_ielts_school_student_snapshot', data, error);
};
