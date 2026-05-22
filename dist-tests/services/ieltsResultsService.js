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
export const rpcIeltsSchoolResults = async (params = {}, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_school_results', {
        p_school_id: params.schoolId ?? null,
        p_class_id: params.classId ?? null,
        p_student_id: params.studentId ?? null,
        p_limit: params.limit ?? 100,
    });
    return assertNoRpcError('rpc_ielts_school_results', data, error);
};
