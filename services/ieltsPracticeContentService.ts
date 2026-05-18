import { supabase } from './supabaseClient.js';
import type { IeltsPracticeSkill } from './ieltsPracticeAssignmentService.js';

export interface IeltsPracticeContentCatalogItem {
  content_type: string;
  content_id: string;
  title: string;
  skill: IeltsPracticeSkill | string;
  description: string | null;
  difficulty: string | null;
  band: string | null;
}

export interface IeltsPracticeContentCatalogParams {
  skill?: IeltsPracticeSkill | string | null;
  search?: string | null;
  limit?: number | null;
}

export interface IeltsPracticeContentRpcClient {
  rpc: typeof supabase.rpc;
}

type RpcError = { message?: string; details?: string; hint?: string; code?: string };
type RpcResult<T> = Promise<{ data: T | null; error: RpcError | null }>;

const withClient = (client?: IeltsPracticeContentRpcClient): IeltsPracticeContentRpcClient => client ?? supabase;

const assertNoRpcError = <T>(name: string, data: T | null, error: RpcError | null): T => {
  if (error) {
    throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  }
  if (data === null || data === undefined) {
    throw new Error(`${name} returned no data`);
  }
  return data;
};

export const rpcIeltsPracticeContentCatalog = async (
  params: IeltsPracticeContentCatalogParams = {},
  client?: IeltsPracticeContentRpcClient,
): Promise<IeltsPracticeContentCatalogItem[]> => {
  const { data, error } = await withClient(client).rpc('rpc_ielts_practice_content_catalog', {
    p_skill: params.skill ?? null,
    p_search: params.search?.trim() || null,
    p_limit: params.limit ?? 50,
  }) as unknown as Awaited<RpcResult<IeltsPracticeContentCatalogItem[]>>;

  return assertNoRpcError('rpc_ielts_practice_content_catalog', data, error);
};
