import { supabase } from './supabaseClient.js';
export const payloadContainsAnswerKey = (value) => {
    if (Array.isArray(value))
        return value.some(payloadContainsAnswerKey);
    if (value && typeof value === 'object') {
        return Object.entries(value).some(([key, item]) => key.toLowerCase() === 'answer_key' || payloadContainsAnswerKey(item));
    }
    return false;
};
export const validateExamJsonText = (text, fallback = {}) => {
    const trimmed = text.trim();
    if (!trimmed) {
        return { ok: true, value: fallback, containsAnswerKey: false };
    }
    try {
        const value = JSON.parse(trimmed);
        return { ok: true, value, containsAnswerKey: payloadContainsAnswerKey(value) };
    }
    catch (error) {
        return {
            ok: false,
            value: fallback,
            error: error instanceof Error ? error.message : 'Invalid JSON',
            containsAnswerKey: false,
        };
    }
};
const withClient = (client) => client ?? supabase;
/**
 * assertNoRpcError is for RPCs that must return non-null/non-undefined values.
 * It intentionally throws for null data; use a separate helper or call-site null
 * handling for RPCs where null is a legitimate successful response.
 */
const assertNoRpcError = (name, data, error) => {
    if (error) {
        throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
    }
    if (data === null || data === undefined) {
        throw new Error(`${name} returned no data`);
    }
    return data;
};
const stripAnswerKeys = (value) => {
    if (Array.isArray(value)) {
        return value.map(stripAnswerKeys);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => key.toLowerCase() !== 'answer_key')
            .map(([key, item]) => [key, stripAnswerKeys(item)]));
    }
    return value;
};
export const sanitizePublicFormPayload = (payload) => {
    if (!payload || typeof payload !== 'object')
        return null;
    return stripAnswerKeys(payload);
};
export const rpcIeltsExamWhoami = async (examEventId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_exam_whoami', {
        p_exam_event_id: examEventId,
    });
    const response = assertNoRpcError('rpc_ielts_exam_whoami', data, error);
    return {
        ...response,
        form_public_payload: sanitizePublicFormPayload(response.form_public_payload),
    };
};
export const rpcIeltsStartAttempt = async (assignmentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_start_attempt', {
        p_assignment_id: assignmentId,
    });
    return assertNoRpcError('rpc_ielts_start_attempt', data, error);
};
export const rpcIeltsAutosaveAttempt = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_autosave_attempt', {
        p_attempt_id: params.attemptId,
        p_lock_token: params.lockToken,
        p_section: params.section,
        p_payload: params.payload,
        p_draft_version: params.draftVersion,
        p_client_saved_at: params.clientSavedAt,
    });
    return assertNoRpcError('rpc_ielts_autosave_attempt', data, error);
};
export const rpcIeltsSubmitAttempt = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_submit_attempt', {
        p_attempt_id: params.attemptId,
        p_lock_token: params.lockToken,
        p_payload: params.payload,
        p_idempotency_key: params.idempotencyKey,
    });
    return assertNoRpcError('rpc_ielts_submit_attempt', data, error);
};
export const rpcIeltsLogIncident = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_log_incident', {
        p_attempt_id: params.attemptId,
        p_lock_token: params.lockToken,
        p_incident_type: params.incidentType,
        p_severity: params.severity,
        p_payload: params.payload,
    });
    return assertNoRpcError('rpc_ielts_log_incident', data, error);
};
export const rpcIeltsExamMonitoring = async (examEventId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_exam_monitoring', {
        p_exam_event_id: examEventId,
    });
    return assertNoRpcError('rpc_ielts_exam_monitoring', data, error);
};
export const rpcIeltsPauseExam = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_pause_exam', {
        p_exam_event_id: params.examEventId,
        p_reason: params.reason ?? null,
    });
    return assertNoRpcError('rpc_ielts_pause_exam', data, error);
};
export const rpcIeltsResumeExam = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_resume_exam', {
        p_exam_event_id: params.examEventId,
        p_reason: params.reason ?? null,
    });
    return assertNoRpcError('rpc_ielts_resume_exam', data, error);
};
export const rpcIeltsExtendAttempt = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_extend_attempt', {
        p_attempt_id: params.attemptId,
        p_extra_minutes: params.extraMinutes,
        p_reason: params.reason ?? null,
    });
    return assertNoRpcError('rpc_ielts_extend_attempt', data, error);
};
export const rpcIeltsForceSubmitAttempt = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_force_submit_attempt', {
        p_attempt_id: params.attemptId,
        p_reason: params.reason ?? null,
    });
    return assertNoRpcError('rpc_ielts_force_submit_attempt', data, error);
};
export const rpcIeltsVoidAttempt = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_void_attempt', {
        p_attempt_id: params.attemptId,
        p_reason: params.reason ?? null,
    });
    return assertNoRpcError('rpc_ielts_void_attempt', data, error);
};
export const rpcIeltsCreateExamEvent = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_create_exam_event', {
        p_title: params.title,
        p_description: params.description ?? null,
        p_starts_at: params.startsAt,
        p_ends_at: params.endsAt,
        p_duration_minutes: params.durationMinutes,
        p_status: params.status ?? 'draft',
        p_school_id: params.schoolId ?? null,
    });
    return assertNoRpcError('rpc_ielts_create_exam_event', data, error);
};
export const rpcIeltsCreateExamForm = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_create_exam_form', {
        p_exam_event_id: params.examEventId,
        p_form_code: params.formCode,
        p_reading_payload: params.readingPayload,
        p_listening_payload: params.listeningPayload,
        p_writing_payload: params.writingPayload,
        p_answer_key: params.answerKey,
        p_speaking_payload: params.speakingPayload ?? null,
        p_is_active: params.isActive ?? true,
    });
    return assertNoRpcError('rpc_ielts_create_exam_form', data, error);
};
export const rpcIeltsAssignExamToClass = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_assign_exam_to_class', {
        p_exam_event_id: params.examEventId,
        p_class_id: params.classId,
        p_form_id: params.formId ?? null,
    });
    return assertNoRpcError('rpc_ielts_assign_exam_to_class', data, error);
};
export const rpcIeltsAssignExamToStudents = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_assign_exam_to_students', {
        p_exam_event_id: params.examEventId,
        p_student_ids: params.studentIds,
        p_form_id: params.formId ?? null,
        p_class_id: params.classId ?? null,
    });
    return assertNoRpcError('rpc_ielts_assign_exam_to_students', data, error);
};
export const rpcIeltsListManageableExams = async (client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_list_manageable_exams', {});
    return assertNoRpcError('rpc_ielts_list_manageable_exams', data, error);
};
export const rpcIeltsGetExamAdminDetail = async (examEventId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_get_exam_admin_detail', {
        p_exam_event_id: examEventId,
    });
    return assertNoRpcError('rpc_ielts_get_exam_admin_detail', data, error);
};
export const createExamIdempotencyKey = (attemptId) => {
    const storageKey = `ielts_exam_submit_key_${attemptId}`;
    const existing = typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : null;
    if (existing)
        return existing;
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
