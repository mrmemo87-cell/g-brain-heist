import { supabase } from './supabaseClient.js';

export type IeltsPracticeSkill = 'reading' | 'listening' | 'writing' | 'speaking';
export type IeltsPracticeAssignmentStatus = 'draft' | 'assigned' | 'closed' | 'archived' | string;
export type IeltsPracticeStudentStatus = 'assigned' | 'in_progress' | 'completed' | 'overdue' | 'excused' | string;
export type IeltsPracticeAssignmentListStatusFilter = 'active' | 'archived' | 'all';

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
  assigned_count?: number;
  in_progress_count?: number;
  completed_count?: number;
  skipped_count?: number;
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
  required_count?: number;
  completed_required_count?: number;
  item_count?: number;
  completed_item_count?: number;
}

export interface IeltsPracticeAssignmentItemProgress {
  assignment_item_id: string;
  skill: IeltsPracticeSkill | string;
  content_type: string;
  content_id: string;
  title: string | null;
  required: boolean;
  order_index: number;
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped' | string;
  practice_attempt_type: string | null;
  practice_attempt_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface IeltsPracticeAssignmentProgress {
  assignment_id: string;
  student_id?: string | null;
  student_status?: IeltsPracticeStudentStatus | null;
  assignment_completed_at?: string | null;
  required_count: number;
  completed_required_count?: number;
  item_count: number;
  completed_item_count?: number;
  all_required_completed?: boolean;
  items?: IeltsPracticeAssignmentItemProgress[];
  students?: Array<{
    student_id: string;
    student_status: IeltsPracticeStudentStatus;
    completed_at: string | null;
    required_count: number;
    completed_required_count: number;
    item_count: number;
    completed_item_count: number;
    all_required_completed: boolean;
  }>;
}

export interface IeltsPracticeAssignmentDetail {
  assignment: IeltsPracticeAssignmentSummary;
  items: IeltsPracticeAssignmentItem[];
  students: IeltsPracticeAssignmentStudentProgress[];
  item_progress?: IeltsPracticeAssignmentProgress;
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

export interface UpdateIeltsPracticeAssignmentParams {
  assignmentId: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
}

export interface ForceCompleteIeltsPracticeAssignmentParams {
  assignmentId: string;
  studentId: string;
  reason?: string | null;
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
  params: { schoolId?: string | null; classId?: string | null; statusFilter?: IeltsPracticeAssignmentListStatusFilter | null } = {},
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary[]> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_list_assignments', {
    p_school_id: params.schoolId ?? null,
    p_class_id: params.classId ?? null,
    p_status_filter: params.statusFilter ?? 'active',
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



export const rpcIeltsPracticeUpdateAssignment = async (
  params: UpdateIeltsPracticeAssignmentParams,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_update_assignment', {
    p_assignment_id: params.assignmentId,
    p_title: params.title,
    p_description: params.description ?? null,
    p_due_at: params.dueAt ?? null,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary>>;

  return assertNoRpcError('rpc_ielts_practice_update_assignment', data, error);
};

export const rpcIeltsPracticeCloseAssignment = async (
  assignmentId: string,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_close_assignment', {
    p_assignment_id: assignmentId,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary>>;

  return assertNoRpcError('rpc_ielts_practice_close_assignment', data, error);
};

export const rpcIeltsPracticeArchiveAssignment = async (
  assignmentId: string,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_archive_assignment', {
    p_assignment_id: assignmentId,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary>>;

  return assertNoRpcError('rpc_ielts_practice_archive_assignment', data, error);
};

export const rpcIeltsPracticeRestoreAssignment = async (
  assignmentId: string,
  status: 'closed' | 'assigned' = 'closed',
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentSummary> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_restore_assignment', {
    p_assignment_id: assignmentId,
    p_status: status,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentSummary>>;

  return assertNoRpcError('rpc_ielts_practice_restore_assignment', data, error);
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


export const rpcIeltsPracticeForceCompleteAssignment = async (
  params: ForceCompleteIeltsPracticeAssignmentParams,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeStudentAssignment> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_force_complete_assignment', {
    p_assignment_id: params.assignmentId,
    p_student_id: params.studentId,
    p_reason: params.reason ?? null,
  }) as unknown as Awaited<RpcResult<IeltsPracticeStudentAssignment>>;

  return assertNoRpcError('rpc_ielts_practice_force_complete_assignment', data, error);
};

export const rpcIeltsPracticeAssignmentProgress = async (
  assignmentId: string,
  studentId?: string | null,
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentProgress> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assignment_progress', {
    p_assignment_id: assignmentId,
    p_student_id: studentId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentProgress>>;

  return assertNoRpcError('rpc_ielts_practice_assignment_progress', data, error);
};

export const rpcIeltsPracticeMarkItemStarted = async (
  params: { assignmentId: string; assignmentItemId: string },
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentProgress> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_item_started', {
    p_assignment_id: params.assignmentId,
    p_assignment_item_id: params.assignmentItemId,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentProgress>>;

  return assertNoRpcError('rpc_ielts_practice_mark_item_started', data, error);
};

export const rpcIeltsPracticeMarkItemCompleted = async (
  params: { assignmentId: string; assignmentItemId: string; practiceAttemptType?: string | null; practiceAttemptId?: string | null },
  client?: IeltsPracticeAssignmentRpcClient
): Promise<IeltsPracticeAssignmentProgress> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_item_completed', {
    p_assignment_id: params.assignmentId,
    p_assignment_item_id: params.assignmentItemId,
    p_practice_attempt_type: params.practiceAttemptType ?? null,
    p_practice_attempt_id: params.practiceAttemptId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsPracticeAssignmentProgress>>;

  return assertNoRpcError('rpc_ielts_practice_mark_item_completed', data, error);
};
