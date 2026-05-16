import { supabase } from './supabaseClient.js';

export type IeltsPracticeSkill = 'reading' | 'listening' | 'writing' | 'speaking';
export type IeltsPracticeAssignmentStatus = 'draft' | 'assigned' | 'closed' | 'archived' | string;
export type IeltsPracticeStudentStatus = 'assigned' | 'in_progress' | 'completed' | 'overdue' | 'excused' | string;

export interface IeltsPracticeAssignmentItemInput {
  skill: IeltsPracticeSkill | string;
  contentType: string;
  contentId: string;
  title?: string | null;
  required?: boolean;
  orderIndex?: number;
}

export interface IeltsPracticeAssignmentItem {
  id: string;
  assignment_id: string;
  skill: IeltsPracticeSkill | string;
  content_type: string;
  content_id: string;
  title: string | null;
  required: boolean;
  order_index: number;
  created_at: string;
}

export interface IeltsPracticeAssignmentSummary {
  id: string;
  school_id: string;
  class_id: string | null;
  assigned_by: string;
  title: string;
  description: string | null;
  status: IeltsPracticeAssignmentStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  class_name?: string | null;
  total_students?: number;
  assigned_count?: number;
  in_progress_count?: number;
  completed_count?: number;
  overdue_count?: number;
  excused_count?: number;
  completion_percent?: number;
  item_count?: number;
  items?: IeltsPracticeAssignmentItem[];
}


export interface IeltsPracticeAssignmentStudentProgress {
  student_id: string;
  username: string | null;
  email: string | null;
  class_id: string | null;
  class_name: string | null;
  status: IeltsPracticeStudentStatus;
  completed_at: string | null;
  updated_at: string;
}

export interface IeltsPracticeAssignmentDetail {
  assignment: IeltsPracticeAssignmentSummary;
  items: IeltsPracticeAssignmentItem[];
  students: IeltsPracticeAssignmentStudentProgress[];
}

export interface IeltsPracticeStudentAssignment extends IeltsPracticeAssignmentSummary {
  student_assignment_id: string;
  student_status: IeltsPracticeStudentStatus;
  completed_at: string | null;
  student_updated_at?: string | null;
}

export interface CreateIeltsPracticeAssignmentParams {
  schoolId: string;
  classId?: string | null;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  items?: IeltsPracticeAssignmentItemInput[];
}

export interface AssignIeltsPracticeToClassParams {
  assignmentId: string;
  classId?: string | null;
}

export interface AssignIeltsPracticeToStudentsParams {
  assignmentId: string;
  studentIds: string[];
}

export interface IeltsPracticeAssignmentRpcClient {
  rpc: typeof supabase.rpc;
}

type RpcError = { message?: string; details?: string; hint?: string; code?: string };
type RpcResult<T> = Promise<{ data: T | null; error: RpcError | null }>;

const withClient = (client?: IeltsPracticeAssignmentRpcClient): IeltsPracticeAssignmentRpcClient => client ?? supabase;

const assertNoRpcError = <T>(name: string, data: T | null, error: RpcError | null): T => {
  if (error) {
    throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  }
  if (data === null || data === undefined) {
    throw new Error(`${name} returned no data`);
  }
  return data;
};

const toRpcItems = (items: IeltsPracticeAssignmentItemInput[] = []) => items.map((item, index) => ({
  skill: item.skill,
  content_type: item.contentType,
  content_id: item.contentId,
  title: item.title ?? null,
  required: item.required ?? true,
  order_index: item.orderIndex ?? index,
}));


export const getIeltsPracticeItemRoute = (item: Pick<IeltsPracticeAssignmentItem, 'content_type' | 'content_id'>): string | null => {
  const contentId = String(item.content_id ?? '').trim();
  if (!contentId) return null;

  const encodedContentId = encodeURIComponent(contentId);
  switch (item.content_type) {
    case 'ielts_reading_set':
      return `/ielts/reading/${encodedContentId}`;
    case 'ielts_listening_set':
      return `/ielts/listening/${encodedContentId}`;
    case 'ielts_writing_task':
      return `/ielts/writing/${encodedContentId}`;
    case 'ielts_speaking_task':
      return `/ielts/speaking/${encodedContentId}`;
    default:
      return null;
  }
};

export const rpcIeltsPracticeListAssignments = async (
  params: { schoolId?: string | null; classId?: string | null } = {},
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary[]> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_list_assignments', {
    p_school_id: params.schoolId ?? null,
    p_class_id: params.classId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary[]>>;

  return assertNoRpcError('rpc_ielts_practice_list_assignments', data, error);
};

export const rpcIeltsPracticeCreateAssignment = async (
  params: CreateIeltsPracticeAssignmentParams,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_create_assignment', {
    p_school_id: params.schoolId,
    p_class_id: params.classId ?? null,
    p_title: params.title,
    p_description: params.description ?? null,
    p_due_at: params.dueAt ?? null,
    p_items: toRpcItems(params.items),
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary>>;

  return assertNoRpcError('rpc_ielts_practice_create_assignment', data, error);
};

export const rpcIeltsPracticeAssignToClass = async (
  params: AssignIeltsPracticeToClassParams,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assign_to_class', {
    p_assignment_id: params.assignmentId,
    p_class_id: params.classId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary>>;

  return assertNoRpcError('rpc_ielts_practice_assign_to_class', data, error);
};


export const rpcIeltsPracticeAssignmentDetail = async (
  assignmentId: string,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentDetail> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assignment_detail', {
    p_assignment_id: assignmentId,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentDetail>>;

  return assertNoRpcError('rpc_ielts_practice_assignment_detail', data, error);
};

export const rpcIeltsPracticeAssignToStudents = async (
  params: AssignIeltsPracticeToStudentsParams,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assign_to_students', {
    p_assignment_id: params.assignmentId,
    p_student_ids: params.studentIds,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary>>;

  return assertNoRpcError('rpc_ielts_practice_assign_to_students', data, error);
};

export const rpcIeltsPracticeStudentAssignments = async (
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeStudentAssignment[]> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_student_assignments', {}) as unknown as Awaited<RpcResult<IeltsPracticeStudentAssignment[]>>;

  return assertNoRpcError('rpc_ielts_practice_student_assignments', data, error);
};

export const rpcIeltsPracticeMarkStarted = async (
  assignmentId: string,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeStudentAssignment> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_started', {
    p_assignment_id: assignmentId,
  }) as unknown as Awaited<RpcResult<IeltsPracticeStudentAssignment>>;

  return assertNoRpcError('rpc_ielts_practice_mark_started', data, error);
};

export const rpcIeltsPracticeMarkCompleted = async (
  assignmentId: string,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeStudentAssignment> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_completed', {
    p_assignment_id: assignmentId,
  }) as unknown as Awaited<RpcResult<IeltsPracticeStudentAssignment>>;

  return assertNoRpcError('rpc_ielts_practice_mark_completed', data, error);
};
