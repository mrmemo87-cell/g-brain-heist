import { supabase } from './supabaseClient.js';
const EXAM_MODE_ADMIN_ROLES = new Set(['school_admin', 'admin', 'superadmin']);
const isTrueRpcResult = (value) => {
    if (value === true)
        return true;
    if (value && typeof value === 'object') {
        const row = value;
        return row['is_superadmin'] === true || row['is_admin'] === true || row['allowed'] === true;
    }
    return false;
};
export const checkIeltsExamModeAdminAccess = async (client = supabase) => {
    const { data: sessionData } = await client.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
        return { allowed: false, reason: 'not_authenticated' };
    }
    const profilePromise = client
        .from('users')
        .select('role,is_admin')
        .eq('id', userId)
        .maybeSingle();
    const superadminPromise = client.rpc('is_superadmin', { p_user_id: userId });
    const [{ data: profile, error: profileError }, { data: superadminData, error: superadminError }] = await Promise.all([
        profilePromise,
        superadminPromise,
    ]);
    if (superadminError) {
        console.warn('Failed to verify IELTS Exam Mode superadmin status:', superadminError);
    }
    else if (isTrueRpcResult(superadminData)) {
        return { allowed: true, reason: 'superadmin' };
    }
    if (profileError) {
        console.warn('Failed to load IELTS Exam Mode user profile:', profileError);
    }
    if (profile?.is_admin) {
        return { allowed: true, reason: 'users_is_admin' };
    }
    const normalizedRole = profile?.role?.toLowerCase() ?? '';
    if (EXAM_MODE_ADMIN_ROLES.has(normalizedRole)) {
        if (normalizedRole === 'school_admin')
            return { allowed: true, reason: 'role_school_admin' };
        if (normalizedRole === 'superadmin')
            return { allowed: true, reason: 'role_superadmin' };
        return { allowed: true, reason: 'role_admin' };
    }
    const { data: manageableExams, error: manageableError } = await client.rpc('rpc_ielts_list_manageable_exams', {});
    if (manageableError) {
        console.warn('Failed to verify IELTS Exam Mode manageable exams:', manageableError);
        return { allowed: false, reason: 'no_exam_mode_permission' };
    }
    if (Array.isArray(manageableExams) && manageableExams.length > 0) {
        return { allowed: true, reason: 'manageable_exam' };
    }
    return { allowed: false, reason: 'no_exam_mode_permission' };
};
