import { supabase } from './supabaseClient.js';
import { rpcIeltsListManageableExams, type IeltsExamRpcClient } from './ieltsExamModeService.js';

type AuthUserResponse = Awaited<ReturnType<typeof supabase.auth.getUser>>;
type SupabaseLike = IeltsExamRpcClient & {
  auth: Pick<typeof supabase.auth, 'getUser'>;
  from: typeof supabase.from;
};

export type IeltsExamModeAccessReason =
  | 'not_authenticated'
  | 'platform_admin'
  | 'school_admin_role'
  | 'manageable_exam_scope'
  | 'denied';

export interface IeltsExamModeAccessInputs {
  isAuthenticated: boolean;
  isAdmin?: boolean | null;
  role?: string | null;
  manageableExamCount?: number;
  manageableExamListSucceeded?: boolean;
}

export interface IeltsExamModeAccessResult {
  allowed: boolean;
  reason: IeltsExamModeAccessReason;
}

const SCHOOL_SCOPED_EXAM_ROLES = new Set(['school_admin', 'admin', 'superadmin']);

const normalizeRole = (role?: string | null) => (role ?? '').trim().toLowerCase();

export const resolveIeltsExamModeAdminAccess = ({
  isAuthenticated,
  isAdmin = false,
  role = null,
  manageableExamCount = 0,
  manageableExamListSucceeded = false,
}: IeltsExamModeAccessInputs): IeltsExamModeAccessResult => {
  if (!isAuthenticated) {
    return { allowed: false, reason: 'not_authenticated' };
  }

  if (Boolean(isAdmin)) {
    return { allowed: true, reason: 'platform_admin' };
  }

  if (SCHOOL_SCOPED_EXAM_ROLES.has(normalizeRole(role))) {
    return { allowed: true, reason: 'school_admin_role' };
  }

  if (manageableExamListSucceeded && manageableExamCount > 0) {
    return { allowed: true, reason: 'manageable_exam_scope' };
  }

  return { allowed: false, reason: 'denied' };
};

const getAuthenticatedUser = async (client: SupabaseLike): Promise<AuthUserResponse['data']['user'] | null> => {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
};

export const checkIeltsExamModeAdminAccess = async (
  client: SupabaseLike = supabase as SupabaseLike
): Promise<IeltsExamModeAccessResult> => {
  const user = await getAuthenticatedUser(client);
  if (!user) {
    return resolveIeltsExamModeAdminAccess({ isAuthenticated: false });
  }

  let role: string | null = null;
  let isAdmin = false;

  const { data: profile, error: profileError } = await client
    .from('users')
    .select('role, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profileError && profile) {
    const typedProfile = profile as { role?: string | null; is_admin?: boolean | null };
    role = typedProfile.role ?? null;
    isAdmin = Boolean(typedProfile.is_admin);
  }

  const directRoleResult = resolveIeltsExamModeAdminAccess({
    isAuthenticated: true,
    isAdmin,
    role,
  });
  if (directRoleResult.allowed) {
    return directRoleResult;
  }

  try {
    const manageableExams = await rpcIeltsListManageableExams(client);
    return resolveIeltsExamModeAdminAccess({
      isAuthenticated: true,
      isAdmin,
      role,
      manageableExamListSucceeded: true,
      manageableExamCount: manageableExams.length,
    });
  } catch {
    return resolveIeltsExamModeAdminAccess({
      isAuthenticated: true,
      isAdmin,
      role,
      manageableExamListSucceeded: false,
      manageableExamCount: 0,
    });
  }
};
