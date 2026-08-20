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
export const rpcIeltsPracticeContentCatalog = async (params = {}, client) => {
    const { data, error } = await withClient(client).rpc('rpc_ielts_practice_content_catalog', {
        p_skill: params.skill ?? null,
        p_search: params.search?.trim() || null,
        p_limit: params.limit ?? 50,
    });
    return assertNoRpcError('rpc_ielts_practice_content_catalog', data, error);
};
