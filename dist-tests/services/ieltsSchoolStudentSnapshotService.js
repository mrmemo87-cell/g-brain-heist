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
export const humanizeIeltsSnapshotStatus = (status) => {
    const normalized = String(status ?? '').trim().toLowerCase();
    if (!normalized || normalized === 'assigned')
        return 'Not started';
    if (normalized === 'in_progress')
        return 'In progress';
    if (normalized === 'awaiting_feedback' || normalized === 'pending_review' || normalized === 'review_pending')
        return 'Review pending';
    if (normalized === 'feedback_ready' || normalized === 'finalized' || normalized === 'reviewed')
        return 'Feedback ready';
    if (normalized === 'not_required')
        return 'Not required';
    if (normalized === 'force_submitted')
        return 'Submitted';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
};
export const bandGapLabel = (band, target) => {
    if (band == null || target == null)
        return null;
    const gap = Math.round((target - band) * 10) / 10;
    if (gap <= 0)
        return 'At or above target';
    return `${gap.toFixed(1)} below target`;
};
export const rpcIeltsSchoolStudentSnapshot = async (studentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_school_student_snapshot', {
        p_student_id: studentId,
    });
    return assertNoRpcError('rpc_ielts_school_student_snapshot', data, error);
};
