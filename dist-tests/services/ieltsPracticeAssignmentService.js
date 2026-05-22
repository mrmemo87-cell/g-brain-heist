import { supabase } from './supabaseClient.js';
const withClient = (client) => client ?? supabase;
const assertNoRpcError = (name, data, error) => {
    if (error) {
        throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
    }
    if (data === null || data === undefined) {
        throw new Error(`${name} returned no data`);
    }
    return data;
};
const toRpcItems = (items = []) => items.map((item, index) => ({
    skill: item.skill,
    content_type: item.contentType,
    content_id: item.contentId,
    title: item.title ?? null,
    required: item.required ?? true,
    order_index: item.orderIndex ?? index,
}));
export const getIeltsPracticeItemRoute = (item) => {
    const contentId = String(item.content_id ?? '').trim();
    if (!contentId)
        return null;
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
export const rpcIeltsPracticeListAssignments = async (params = {}, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_list_assignments', {
        p_school_id: params.schoolId ?? null,
        p_class_id: params.classId ?? null,
        p_status_filter: params.statusFilter ?? 'active',
    });
    return assertNoRpcError('rpc_ielts_practice_list_assignments', data, error);
};
export const rpcIeltsPracticeCreateAssignment = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_create_assignment', {
        p_school_id: params.schoolId,
        p_class_id: params.classId ?? null,
        p_title: params.title,
        p_description: params.description ?? null,
        p_due_at: params.dueAt ?? null,
        p_items: toRpcItems(params.items),
    });
    return assertNoRpcError('rpc_ielts_practice_create_assignment', data, error);
};
export const rpcIeltsPracticeAssignToClass = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assign_to_class', {
        p_assignment_id: params.assignmentId,
        p_class_id: params.classId ?? null,
    });
    return assertNoRpcError('rpc_ielts_practice_assign_to_class', data, error);
};
export const rpcIeltsPracticeUpdateAssignment = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_update_assignment', {
        p_assignment_id: params.assignmentId,
        p_title: params.title,
        p_description: params.description ?? null,
        p_due_at: params.dueAt ?? null,
    });
    return assertNoRpcError('rpc_ielts_practice_update_assignment', data, error);
};
export const rpcIeltsPracticeCloseAssignment = async (assignmentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_close_assignment', {
        p_assignment_id: assignmentId,
    });
    return assertNoRpcError('rpc_ielts_practice_close_assignment', data, error);
};
export const rpcIeltsPracticeArchiveAssignment = async (assignmentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_archive_assignment', {
        p_assignment_id: assignmentId,
    });
    return assertNoRpcError('rpc_ielts_practice_archive_assignment', data, error);
};
export const rpcIeltsPracticeRestoreAssignment = async (assignmentId, status = 'closed', client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_restore_assignment', {
        p_assignment_id: assignmentId,
        p_status: status,
    });
    return assertNoRpcError('rpc_ielts_practice_restore_assignment', data, error);
};
export const rpcIeltsPracticeAssignmentDetail = async (assignmentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assignment_detail', {
        p_assignment_id: assignmentId,
    });
    return assertNoRpcError('rpc_ielts_practice_assignment_detail', data, error);
};
export const rpcIeltsPracticeAssignToStudents = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assign_to_students', {
        p_assignment_id: params.assignmentId,
        p_student_ids: params.studentIds,
    });
    return assertNoRpcError('rpc_ielts_practice_assign_to_students', data, error);
};
export const rpcIeltsPracticeStudentAssignments = async (client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_student_assignments', {});
    return assertNoRpcError('rpc_ielts_practice_student_assignments', data, error);
};
export const rpcIeltsPracticeMarkStarted = async (assignmentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_started', {
        p_assignment_id: assignmentId,
    });
    return assertNoRpcError('rpc_ielts_practice_mark_started', data, error);
};
export const rpcIeltsPracticeMarkCompleted = async (assignmentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_completed', {
        p_assignment_id: assignmentId,
    });
    return assertNoRpcError('rpc_ielts_practice_mark_completed', data, error);
};
export const rpcIeltsPracticeForceCompleteAssignment = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_force_complete_assignment', {
        p_assignment_id: params.assignmentId,
        p_student_id: params.studentId,
        p_reason: params.reason ?? null,
    });
    return assertNoRpcError('rpc_ielts_practice_force_complete_assignment', data, error);
};
export const rpcIeltsPracticeAssignmentProgress = async (assignmentId, studentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_assignment_progress', {
        p_assignment_id: assignmentId,
        p_student_id: studentId ?? null,
    });
    return assertNoRpcError('rpc_ielts_practice_assignment_progress', data, error);
};
export const rpcIeltsPracticeMarkItemStarted = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_item_started', {
        p_assignment_id: params.assignmentId,
        p_assignment_item_id: params.assignmentItemId,
    });
    return assertNoRpcError('rpc_ielts_practice_mark_item_started', data, error);
};
export const rpcIeltsPracticeMarkItemCompleted = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_item_completed', {
        p_assignment_id: params.assignmentId,
        p_assignment_item_id: params.assignmentItemId,
        p_practice_attempt_type: params.practiceAttemptType ?? null,
        p_practice_attempt_id: params.practiceAttemptId ?? null,
    });
    return assertNoRpcError('rpc_ielts_practice_mark_item_completed', data, error);
};
export const rpcIeltsPracticeMarkItemSubmitted = async (params, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_mark_item_submitted', {
        p_assignment_id: params.assignmentId,
        p_assignment_item_id: params.assignmentItemId,
        p_practice_attempt_type: params.practiceAttemptType ?? null,
        p_practice_attempt_id: params.practiceAttemptId ?? null,
    });
    return assertNoRpcError('rpc_ielts_practice_mark_item_submitted', data, error);
};
