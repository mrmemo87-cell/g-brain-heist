import { supabase } from './supabaseClient.js';
import { rpcIeltsListManageableExams, type IeltsExamRpcClient } from './ieltsExamModeService.js';
import { resolveMySchoolCapabilities, type SchoolCapabilitiesRpcClient } from './schoolAdminService.js';

type SupabaseLike = IeltsExamRpcClient & {
  auth: Pick<typeof supabase.auth, 'getUser'>;
  from: typeof supabase.from;
};

export type IeltsExamModeAccessReason =
  | 'not_authenticated'
  | 'platform_admin'
  | 'platform_admin_role'
  | 'school_admin_capability'
  | 'manageable_exam_scope'
  | 'verification_error'
  | 'denied';

export interface IeltsExamModeAccessInputs {
  isAuthenticated: boolean;
  isAdmin?: boolean | null;
  role?: string | null;
  canAdministerSchool?: boolean;
  manageableExamCount?: number;
  manageableExamListSucceeded?: boolean;
}

export interface IeltsExamModeAccessResult {
  allowed: boolean;
  reason: IeltsExamModeAccessReason;
}

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'superadmin']);

const normalizeRole = (role?: string | null) => (role ?? '').trim().toLowerCase();

export const resolveIeltsExamModeAdminAccess = ({
  isAuthenticated,
  isAdmin = false,
  role = null,
  canAdministerSchool = false,
  manageableExamCount = 0,
  manageableExamListSucceeded = false,
}: IeltsExamModeAccessInputs): IeltsExamModeAccessResult => {
  if (!isAuthenticated) {
    return { allowed: false, reason: 'not_authenticated' };
  }

  if (Boolean(isAdmin)) {
    return { allowed: true, reason: 'platform_admin' };
  }

  if (PLATFORM_ADMIN_ROLES.has(normalizeRole(role))) {
    return { allowed: true, reason: 'platform_admin_role' };
  }

  if (canAdministerSchool) {
    return { allowed: true, reason: 'school_admin_capability' };
  }

  if (manageableExamListSucceeded && manageableExamCount > 0) {
    return { allowed: true, reason: 'manageable_exam_scope' };
  }

  return { allowed: false, reason: 'denied' };
};

export const checkIeltsExamModeAdminAccess = async (
  client: SupabaseLike = supabase as SupabaseLike
): Promise<IeltsExamModeAccessResult> => {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) {
    return { allowed: false, reason: 'verification_error' };
  }
  const user = authData.user;
  if (!user) {
    return resolveIeltsExamModeAdminAccess({ isAuthenticated: false });
  }

  let role: string | null = null;
  let isAdmin = false;
  let capabilityResolved = false;

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
    const capabilityResolution = await resolveMySchoolCapabilities(
      null,
      client as unknown as SchoolCapabilitiesRpcClient,
    );
    capabilityResolved = capabilityResolution.status === 'ready';
    if (capabilityResolution.capabilities?.can_administer) {
      return resolveIeltsExamModeAdminAccess({
        isAuthenticated: true,
        isAdmin,
        role,
        canAdministerSchool: true,
      });
    }
  } catch {
    capabilityResolved = false;
    // Fall through to the school-scoped exam list. This keeps assigned-teacher
    // access available when the capability RPC is unavailable.
  }

  try {
    const manageableExams = await rpcIeltsListManageableExams(client);
    if (manageableExams.length === 0 && (profileError || !capabilityResolved)) {
      return { allowed: false, reason: 'verification_error' };
    }
    return resolveIeltsExamModeAdminAccess({
      isAuthenticated: true,
      isAdmin,
      role,
      manageableExamListSucceeded: true,
      manageableExamCount: manageableExams.length,
    });
  } catch {
    return { allowed: false, reason: 'verification_error' };
  }
};
