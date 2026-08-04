import { supabase } from './supabaseClient.js';

export type IeltsExtraPracticeAccessStatus = 'ready' | 'error';

export interface IeltsExtraPracticeAccess {
  status: IeltsExtraPracticeAccessStatus;
  role: string;
  isAdmin: boolean;
  isStaff: boolean;
  enabled: boolean;
  schoolId: string | null;
  canManage: boolean;
  reason: string;
  error?: string;
}

export interface IeltsExtraPracticeRpcClient {
  rpc(
    functionName: string,
    params?: Record<string, unknown>
  ): PromiseLike<{
    data: unknown;
    error: { message?: string | null } | null;
  }>;
}

const defaultClient = supabase as unknown as IeltsExtraPracticeRpcClient;

const failedAccess = (reason: string, error?: string): IeltsExtraPracticeAccess => ({
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseAccessPayload = (payload: unknown): IeltsExtraPracticeAccess => {
  if (!isRecord(payload)) return failedAccess('invalid_response');

  const resolved = payload['resolved'];
  const role = payload['role'];
  const isAdmin = payload['is_admin'];
  const isStaff = payload['is_staff'];
  const enabled = payload['enabled'];
  const schoolId = payload['school_id'];
  const canManage = payload['can_manage'];
  const reason = payload['reason'];

  const validShape =
    typeof resolved === 'boolean'
    && typeof role === 'string'
    && role.trim().length > 0
    && typeof isAdmin === 'boolean'
    && typeof isStaff === 'boolean'
    && typeof enabled === 'boolean'
    && (schoolId === null || typeof schoolId === 'string')
    && typeof canManage === 'boolean'
    && typeof reason === 'string'
    && reason.length > 0;

  if (!validShape) return failedAccess('invalid_response');
  if (!resolved) return failedAccess(reason);

  return {
    status: 'ready',
    role: role.trim().toLowerCase(),
    isAdmin,
    isStaff,
    enabled,
    schoolId: schoolId as string | null,
    canManage,
    reason,
  };
};

const callAccessRpc = async (
  client: IeltsExtraPracticeRpcClient,
  functionName: string,
  params?: Record<string, unknown>
): Promise<IeltsExtraPracticeAccess> => {
  try {
    const { data, error } = await client.rpc(functionName, params);
    if (error) return failedAccess('rpc_error', error.message || 'IELTS access request failed');
    return parseAccessPayload(data);
  } catch (error) {
    return failedAccess(
      'rpc_error',
      error instanceof Error ? error.message : 'IELTS access request failed'
    );
  }
};

export async function resolveIeltsExtraPracticeAccess(
  client: IeltsExtraPracticeRpcClient = defaultClient
): Promise<IeltsExtraPracticeAccess> {
  return callAccessRpc(client, 'rpc_ielts_extra_practice_access');
}

export async function updateIeltsExtraPracticeAccess(
  enabled: boolean,
  client: IeltsExtraPracticeRpcClient = defaultClient
): Promise<IeltsExtraPracticeAccess> {
  return callAccessRpc(client, 'rpc_ielts_update_extra_practice_access', {
    p_enabled: enabled,
  });
}
