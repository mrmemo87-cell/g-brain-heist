import { supabase } from './supabaseClient.js';

export interface IeltsSchoolResultsSummary {
  total_students: number;
  assigned_practice_count: number;
  completed_practice_count: number;
  exam_submission_count: number;
  average_estimated_overall: number | null;
}

export interface IeltsSchoolResultsStudentRow {
  student_id: string;
  username: string | null;
  email: string | null;
  class_id: string | null;
  class_name: string | null;
  assigned_practice_total: number;
  completed_practice_total: number;
  latest_reading_estimate: number | null;
  latest_listening_estimate: number | null;
  latest_writing_estimate: number | null;
  latest_speaking_estimate: number | null;
  latest_overall_estimate: number | null;
  last_activity_at: string | null;
}

export interface IeltsSchoolResultsFiltersApplied {
  class_id: string | null;
  student_id: string | null;
  limit: number;
}

export interface IeltsSchoolResultsResponse {
  school_id: string;
  filters_applied: IeltsSchoolResultsFiltersApplied;
  summary: IeltsSchoolResultsSummary;
  students: IeltsSchoolResultsStudentRow[];
}

export interface IeltsSchoolResultsParams {
  schoolId?: string | null;
  classId?: string | null;
  studentId?: string | null;
  limit?: number | null;
}

export interface IeltsResultsRpcClient {
  rpc: typeof supabase.rpc;
}

type RpcError = { message?: string; details?: string; hint?: string; code?: string };
type RpcResult<T> = Promise<{ data: T | null; error: RpcError | null }>;

const withClient = (client?: IeltsResultsRpcClient): IeltsResultsRpcClient => client ?? supabase;

const assertNoRpcError = <T>(name: string, data: T | null, error: RpcError | null): T => {
  if (error) {
    throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  }
  if (data === null || data === undefined) {
    throw new Error(`${name} returned no data`);
  }
  return data;
};

export const rpcIeltsSchoolResults = async (
  params: IeltsSchoolResultsParams = {},
  client?: IeltsResultsRpcClient,
): Promise<IeltsSchoolResultsResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_school_results', {
    p_school_id: params.schoolId ?? null,
    p_class_id: params.classId ?? null,
    p_student_id: params.studentId ?? null,
    p_limit: params.limit ?? 100,
  }) as unknown as Awaited<RpcResult<IeltsSchoolResultsResponse>>;

  return assertNoRpcError('rpc_ielts_school_results', data, error);
};
