import { supabase } from './supabaseClient.js';
const defaultClient = supabase;
const ACCESS_RPC_DENIAL_MARKERS = [
    'enabled_value_required',
    'school_not_found',
    'not_authenticated',
    'forbidden',
];
const accessRpcErrorReason = (message) => {
    const normalized = (message ?? '').trim().toLowerCase();
    return ACCESS_RPC_DENIAL_MARKERS.find((marker) => normalized.includes(marker)) ?? 'rpc_error';
};
const failedAccess = (reason, error) => ({
    status: 'error',
    role: 'student',
    isAdmin: false,
    isStaff: false,
    enabled: false,
    schoolId: null,
    canManage: false,
    reason,
    ...(error ? { error } : {}),
});
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const parseAccessPayload = (payload) => {
    if (!isRecord(payload))
        return failedAccess('invalid_response');
    const resolved = payload['resolved'];
    const role = payload['role'];
    const isAdmin = payload['is_admin'];
    const isStaff = payload['is_staff'];
    const enabled = payload['enabled'];
    const schoolId = payload['school_id'];
    const canManage = payload['can_manage'];
    const reason = payload['reason'];
    const validShape = typeof resolved === 'boolean'
        && typeof role === 'string'
        && role.trim().length > 0
        && typeof isAdmin === 'boolean'
        && typeof isStaff === 'boolean'
        && typeof enabled === 'boolean'
        && (schoolId === null || typeof schoolId === 'string')
        && typeof canManage === 'boolean'
        && typeof reason === 'string'
        && reason.length > 0;
    if (!validShape)
        return failedAccess('invalid_response');
    if (!resolved)
        return failedAccess(reason);
    return {
        status: 'ready',
        role: role.trim().toLowerCase(),
        isAdmin,
        isStaff,
        enabled,
        schoolId: schoolId,
        canManage,
        reason,
    };
};
const callAccessRpc = async (client, functionName, params) => {
    try {
        const { data, error } = await client.rpc(functionName, params);
        if (error) {
            const message = error.message || 'IELTS access request failed';
            return failedAccess(accessRpcErrorReason(message), message);
        }
        return parseAccessPayload(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'IELTS access request failed';
        return failedAccess(accessRpcErrorReason(message), message);
    }
};
export async function resolveIeltsExtraPracticeAccess(client = defaultClient) {
    return callAccessRpc(client, 'rpc_ielts_extra_practice_access');
}
export async function updateIeltsExtraPracticeAccess(enabled, client = defaultClient) {
    return callAccessRpc(client, 'rpc_ielts_update_extra_practice_access', {
        p_enabled: enabled,
    });
}
