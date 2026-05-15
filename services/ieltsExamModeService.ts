import { supabase } from './supabaseClient.js';

export type IeltsExamAvailabilityReason =
  | 'ok'
  | 'not_authenticated'
  | 'exam_not_found'
  | 'not_assigned'
  | 'assignment_void'
  | 'form_unavailable'
  | 'exam_not_available'
  | string;

export type IeltsExamSection = 'reading' | 'listening' | 'writing' | 'speaking';

export type IeltsExamAttemptStatus =
  | 'assigned'
  | 'started'
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'auto_submitted'
  | 'locked'
  | 'void'
  | string;

export interface IeltsExamPublicFormPayload {
  id?: string;
  form_code?: string;
  reading_payload?: unknown;
  listening_payload?: unknown;
  writing_payload?: unknown;
  speaking_payload?: unknown | null;
  [key: string]: unknown;
}

export interface IeltsExamDraftPayload {
  section: IeltsExamSection | string;
  payload: unknown;
  draft_version?: number;
  server_saved_at?: string;
  client_saved_at?: string | null;
}

export interface IeltsExamWhoamiResponse {
  allowed: boolean;
  reason: IeltsExamAvailabilityReason;
  exam_event_id?: string;
  assignment_id?: string;
  attempt_id?: string | null;
  status?: IeltsExamAttemptStatus;
  server_now?: string;
  starts_at?: string;
  ends_at?: string;
  remaining_seconds?: number;
  form_public_payload?: IeltsExamPublicFormPayload | null;
  drafts?: IeltsExamDraftPayload[];
}

export interface IeltsStartAttemptResponse {
  attempt_id: string;
  assignment_id: string;
  exam_event_id: string;
  status: IeltsExamAttemptStatus;
  started_at: string;
  ends_at: string;
  server_now: string;
  remaining_seconds: number;
  lock_token: string;
}

export interface IeltsAutosaveResponse {
  attempt_id: string;
  section: string;
  draft_version: number;
  server_saved_at: string;
  server_now: string;
}

export interface IeltsSubmitResponse {
  submission_id: string;
  attempt_id: string;
  status: IeltsExamAttemptStatus;
  submitted_at: string;
  grading_status?: string;
  idempotent_replay?: boolean;
}

export interface IeltsIncidentResponse {
  incident_id: string;
  created_at: string;
}

export interface IeltsExamMonitoringRow {
  student_id: string;
  attempt_id: string | null;
  name: string | null;
  username: string | null;
  class_id: string | null;
  class_name: string | null;
  status: IeltsExamAttemptStatus;
  started_at: string | null;
  ends_at: string | null;
  remaining_seconds: number | null;
  last_heartbeat_at: string | null;
  last_save_age_seconds: number | null;
  incident_count: number;
  submitted_at: string | null;
}

export interface IeltsExamControlResponse {
  exam_event_id?: string;
  attempt_id?: string;
  submission_id?: string;
  status?: IeltsExamAttemptStatus;
  ends_at?: string;
  server_now?: string;
}

export interface IeltsManageableExam {
  id: string;
  school_id: string | null;
  title: string;
  description: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  active_form_id: string | null;
  form_count: number;
  assignment_count: number;
  submitted_count: number;
}

export interface IeltsExamAdminForm extends IeltsExamPublicFormPayload {
  id: string;
  exam_event_id: string;
  form_code: string;
  answer_key?: unknown;
  is_active: boolean;
  created_at: string;
}

export interface IeltsExamAdminClass {
  id: string;
  school_id: string;
  class_code: string | null;
  class_name: string;
  grade_level: number | string | null;
  is_active: boolean;
}

export interface IeltsExamAdminStudent {
  student_id: string;
  username: string | null;
  email: string | null;
  class_id: string | null;
  class_name: string | null;
  grade: number | string | null;
  batch: string | null;
}

export interface IeltsExamAdminAssignment {
  id: string;
  student_id: string;
  username: string | null;
  class_id: string | null;
  class_name: string | null;
  form_id: string;
  status: string;
  created_at: string;
}

export interface IeltsExamAdminDetail {
  exam: IeltsManageableExam;
  forms: IeltsExamAdminForm[];
  classes: IeltsExamAdminClass[];
  students: IeltsExamAdminStudent[];
  assignments: IeltsExamAdminAssignment[];
}

export interface CreateExamEventParams {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status?: 'draft' | 'scheduled' | 'live' | 'paused' | 'closed' | 'cancelled' | string;
  schoolId?: string | null;
}

export interface CreateExamFormParams {
  examEventId: string;
  formCode: string;
  readingPayload: unknown;
  listeningPayload: unknown;
  writingPayload: unknown;
  answerKey: unknown;
  speakingPayload?: unknown | null;
  isActive?: boolean;
}

export interface AssignExamToClassParams {
  examEventId: string;
  classId: string;
  formId?: string | null;
}

export interface AssignExamToStudentsParams {
  examEventId: string;
  studentIds: string[];
  formId?: string | null;
  classId?: string | null;
}

export interface IeltsExamAssignmentResponse {
  exam_event_id: string;
  class_id?: string;
  form_id: string;
  assigned_count: number;
}

export interface AutosaveAttemptParams {
  attemptId: string;
  lockToken: string;
  section: string;
  payload: unknown;
  draftVersion: number;
  clientSavedAt: string;
}

export interface SubmitAttemptParams {
  attemptId: string;
  lockToken: string;
  payload: unknown;
  idempotencyKey: string;
}

export interface LogIncidentParams {
  attemptId: string;
  lockToken: string;
  incidentType: string;
  severity: 'info' | 'warning' | 'critical' | string;
  payload: unknown;
}

export interface ExtendAttemptParams {
  attemptId: string;
  extraMinutes: number;
  reason?: string | null;
}

export interface AttemptControlParams {
  attemptId: string;
  reason?: string | null;
}

export interface ExamControlParams {
  examEventId: string;
  reason?: string | null;
}

type RpcError = { message?: string; details?: string; hint?: string; code?: string };
type RpcResult<T> = Promise<{ data: T | null; error: RpcError | null }>;
export type IeltsExamRpcClient = Pick<typeof supabase, 'rpc'>;


export interface IeltsJsonValidationResult {
  ok: boolean;
  value: unknown;
  error?: string;
  containsAnswerKey: boolean;
}

export const payloadContainsAnswerKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(payloadContainsAnswerKey);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) => key.toLowerCase() === 'answer_key' || payloadContainsAnswerKey(item)
    );
  }
  return false;
};

export const validateExamJsonText = (text: string, fallback: unknown = {}): IeltsJsonValidationResult => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: fallback, containsAnswerKey: false };
  }

  try {
    const value = JSON.parse(trimmed) as unknown;
    return { ok: true, value, containsAnswerKey: payloadContainsAnswerKey(value) };
  } catch (error) {
    return {
      ok: false,
      value: fallback,
      error: error instanceof Error ? error.message : 'Invalid JSON',
      containsAnswerKey: false,
    };
  }
};

const withClient = (client?: IeltsExamRpcClient): IeltsExamRpcClient => client ?? supabase;

/**
 * assertNoRpcError is for RPCs that must return non-null/non-undefined values.
 * It intentionally throws for null data; use a separate helper or call-site null
 * handling for RPCs where null is a legitimate successful response.
 */
const assertNoRpcError = <T>(name: string, data: T | null, error: RpcError | null): T => {
  if (error) {
    throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  }
  if (data === null || data === undefined) {
    throw new Error(`${name} returned no data`);
  }
  return data;
};

const stripAnswerKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripAnswerKeys);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key.toLowerCase() !== 'answer_key')
        .map(([key, item]) => [key, stripAnswerKeys(item)])
    );
  }

  return value;
};

export const sanitizePublicFormPayload = (payload: unknown): IeltsExamPublicFormPayload | null => {
  if (!payload || typeof payload !== 'object') return null;
  return stripAnswerKeys(payload) as IeltsExamPublicFormPayload;
};

export const rpcIeltsExamWhoami = async (
  examEventId: string,
  client?: IeltsExamRpcClient
): Promise<IeltsExamWhoamiResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_exam_whoami', {
    p_exam_event_id: examEventId,
  }) as unknown as Awaited<RpcResult<IeltsExamWhoamiResponse>>;

  const response = assertNoRpcError('rpc_ielts_exam_whoami', data, error);
  return {
    ...response,
    form_public_payload: sanitizePublicFormPayload(response.form_public_payload),
  };
};

export const rpcIeltsStartAttempt = async (
  assignmentId: string,
  client?: IeltsExamRpcClient
): Promise<IeltsStartAttemptResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_start_attempt', {
    p_assignment_id: assignmentId,
  }) as unknown as Awaited<RpcResult<IeltsStartAttemptResponse>>;

  return assertNoRpcError('rpc_ielts_start_attempt', data, error);
};

export const rpcIeltsAutosaveAttempt = async (
  params: AutosaveAttemptParams,
  client?: IeltsExamRpcClient
): Promise<IeltsAutosaveResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_autosave_attempt', {
    p_attempt_id: params.attemptId,
    p_lock_token: params.lockToken,
    p_section: params.section,
    p_payload: params.payload,
    p_draft_version: params.draftVersion,
    p_client_saved_at: params.clientSavedAt,
  }) as unknown as Awaited<RpcResult<IeltsAutosaveResponse>>;

  return assertNoRpcError('rpc_ielts_autosave_attempt', data, error);
};

export const rpcIeltsSubmitAttempt = async (
  params: SubmitAttemptParams,
  client?: IeltsExamRpcClient
): Promise<IeltsSubmitResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_submit_attempt', {
    p_attempt_id: params.attemptId,
    p_lock_token: params.lockToken,
    p_payload: params.payload,
    p_idempotency_key: params.idempotencyKey,
  }) as unknown as Awaited<RpcResult<IeltsSubmitResponse>>;

  return assertNoRpcError('rpc_ielts_submit_attempt', data, error);
};

export const rpcIeltsLogIncident = async (
  params: LogIncidentParams,
  client?: IeltsExamRpcClient
): Promise<IeltsIncidentResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_log_incident', {
    p_attempt_id: params.attemptId,
    p_lock_token: params.lockToken,
    p_incident_type: params.incidentType,
    p_severity: params.severity,
    p_payload: params.payload,
  }) as unknown as Awaited<RpcResult<IeltsIncidentResponse>>;

  return assertNoRpcError('rpc_ielts_log_incident', data, error);
};


export const rpcIeltsExamMonitoring = async (
  examEventId: string,
  client?: IeltsExamRpcClient
): Promise<IeltsExamMonitoringRow[]> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_exam_monitoring', {
    p_exam_event_id: examEventId,
  }) as unknown as Awaited<RpcResult<IeltsExamMonitoringRow[]>>;

  return assertNoRpcError('rpc_ielts_exam_monitoring', data, error);
};

export const rpcIeltsPauseExam = async (
  params: ExamControlParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamControlResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_pause_exam', {
    p_exam_event_id: params.examEventId,
    p_reason: params.reason ?? null,
  }) as unknown as Awaited<RpcResult<IeltsExamControlResponse>>;

  return assertNoRpcError('rpc_ielts_pause_exam', data, error);
};

export const rpcIeltsResumeExam = async (
  params: ExamControlParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamControlResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_resume_exam', {
    p_exam_event_id: params.examEventId,
    p_reason: params.reason ?? null,
  }) as unknown as Awaited<RpcResult<IeltsExamControlResponse>>;

  return assertNoRpcError('rpc_ielts_resume_exam', data, error);
};

export const rpcIeltsExtendAttempt = async (
  params: ExtendAttemptParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamControlResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_extend_attempt', {
    p_attempt_id: params.attemptId,
    p_extra_minutes: params.extraMinutes,
    p_reason: params.reason ?? null,
  }) as unknown as Awaited<RpcResult<IeltsExamControlResponse>>;

  return assertNoRpcError('rpc_ielts_extend_attempt', data, error);
};

export const rpcIeltsForceSubmitAttempt = async (
  params: AttemptControlParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamControlResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_force_submit_attempt', {
    p_attempt_id: params.attemptId,
    p_reason: params.reason ?? null,
  }) as unknown as Awaited<RpcResult<IeltsExamControlResponse>>;

  return assertNoRpcError('rpc_ielts_force_submit_attempt', data, error);
};

export const rpcIeltsVoidAttempt = async (
  params: AttemptControlParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamControlResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_void_attempt', {
    p_attempt_id: params.attemptId,
    p_reason: params.reason ?? null,
  }) as unknown as Awaited<RpcResult<IeltsExamControlResponse>>;

  return assertNoRpcError('rpc_ielts_void_attempt', data, error);
};


export const rpcIeltsCreateExamEvent = async (
  params: CreateExamEventParams,
  client?: IeltsExamRpcClient
): Promise<IeltsManageableExam> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_create_exam_event', {
    p_title: params.title,
    p_description: params.description ?? null,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt,
    p_duration_minutes: params.durationMinutes,
    p_status: params.status ?? 'draft',
    p_school_id: params.schoolId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsManageableExam>>;

  return assertNoRpcError('rpc_ielts_create_exam_event', data, error);
};

export const rpcIeltsCreateExamForm = async (
  params: CreateExamFormParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamAdminForm> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_create_exam_form', {
    p_exam_event_id: params.examEventId,
    p_form_code: params.formCode,
    p_reading_payload: params.readingPayload,
    p_listening_payload: params.listeningPayload,
    p_writing_payload: params.writingPayload,
    p_answer_key: params.answerKey,
    p_speaking_payload: params.speakingPayload ?? null,
    p_is_active: params.isActive ?? true,
  }) as unknown as Awaited<RpcResult<IeltsExamAdminForm>>;

  return assertNoRpcError('rpc_ielts_create_exam_form', data, error);
};

export const rpcIeltsAssignExamToClass = async (
  params: AssignExamToClassParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamAssignmentResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_assign_exam_to_class', {
    p_exam_event_id: params.examEventId,
    p_class_id: params.classId,
    p_form_id: params.formId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsExamAssignmentResponse>>;

  return assertNoRpcError('rpc_ielts_assign_exam_to_class', data, error);
};

export const rpcIeltsAssignExamToStudents = async (
  params: AssignExamToStudentsParams,
  client?: IeltsExamRpcClient
): Promise<IeltsExamAssignmentResponse> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_assign_exam_to_students', {
    p_exam_event_id: params.examEventId,
    p_student_ids: params.studentIds,
    p_form_id: params.formId ?? null,
    p_class_id: params.classId ?? null,
  }) as unknown as Awaited<RpcResult<IeltsExamAssignmentResponse>>;

  return assertNoRpcError('rpc_ielts_assign_exam_to_students', data, error);
};

export const rpcIeltsListManageableExams = async (
  client?: IeltsExamRpcClient
): Promise<IeltsManageableExam[]> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_list_manageable_exams', {}) as unknown as Awaited<RpcResult<IeltsManageableExam[]>>;

  return assertNoRpcError('rpc_ielts_list_manageable_exams', data, error);
};

export const rpcIeltsGetExamAdminDetail = async (
  examEventId: string,
  client?: IeltsExamRpcClient
): Promise<IeltsExamAdminDetail> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_get_exam_admin_detail', {
    p_exam_event_id: examEventId,
  }) as unknown as Awaited<RpcResult<IeltsExamAdminDetail>>;

  return assertNoRpcError('rpc_ielts_get_exam_admin_detail', data, error);
};

export const createExamIdempotencyKey = (attemptId: string): string => {
  const storageKey = `ielts_exam_submit_key_${attemptId}`;
  const existing = typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : null;
  if (existing) return existing;

  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    // Fallback is intentionally non-cryptographic: idempotency keys are not security credentials; crypto.randomUUID is the primary path, and this only reduces accidental double-submits.
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `${attemptId}:${randomPart}`;
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(storageKey, key);
  }
  return key;
};
