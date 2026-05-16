import { supabase } from './supabaseClient.js';
import type { IeltsManageableExam } from './ieltsExamModeService.js';

type RpcError = { message?: string; details?: string; hint?: string; code?: string };

type SessionUser = { id: string };
type Session = { user: SessionUser };

type UserProfileRow = {
  role: string | null;
  is_admin: boolean | null;
};

type MaybeSingleProfileQuery = {
  maybeSingle: () => Promise<{ data: UserProfileRow | null; error: RpcError | null }>;
};

type EqProfileQuery = {
  eq: (column: string, value: string) => MaybeSingleProfileQuery;
};

type SelectProfileQuery = {
  select: (columns: string) => EqProfileQuery;
};

export type IeltsExamModeAuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: Session | null } }>;
  };
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  from: (table: string) => SelectProfileQuery;
};

export type IeltsExamModeAccessDecision = {
  allowed: boolean;
  reason:
    | 'not_authenticated'
    | 'superadmin'
    | 'users_is_admin'
    | 'role_admin'
    | 'role_superadmin'
    | 'role_school_admin'
    | 'manageable_exam'
    | 'no_exam_mode_permission';
};

const EXAM_MODE_ADMIN_ROLES = new Set(['school_admin', 'admin', 'superadmin']);

const isTrueRpcResult = (value: unknown): boolean => {
  if (value === true) return true;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return row['is_superadmin'] === true || row['is_admin'] === true || row['allowed'] === true;
  }
  return false;
};

export const checkIeltsExamModeAdminAccess = async (
  client: IeltsExamModeAuthClient = supabase as unknown as IeltsExamModeAuthClient
): Promise<IeltsExamModeAccessDecision> => {
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
  } else if (isTrueRpcResult(superadminData)) {
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
    if (normalizedRole === 'school_admin') return { allowed: true, reason: 'role_school_admin' };
    if (normalizedRole === 'superadmin') return { allowed: true, reason: 'role_superadmin' };
    return { allowed: true, reason: 'role_admin' };
  }

  const { data: manageableExams, error: manageableError } = await client.rpc('rpc_ielts_list_manageable_exams', {});
  if (manageableError) {
    console.warn('Failed to verify IELTS Exam Mode manageable exams:', manageableError);
    return { allowed: false, reason: 'no_exam_mode_permission' };
  }

  if (Array.isArray(manageableExams) && (manageableExams as IeltsManageableExam[]).length > 0) {
    return { allowed: true, reason: 'manageable_exam' };
  }

  return { allowed: false, reason: 'no_exam_mode_permission' };
};
