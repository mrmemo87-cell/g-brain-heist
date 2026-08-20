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
export const rpcIeltsStudentJourney = async (studentId, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_student_journey', {
        p_student_id: studentId ?? null,
    });
    return assertNoRpcError('rpc_ielts_student_journey', data, error);
};
