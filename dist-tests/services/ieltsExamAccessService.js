import { supabase } from './supabaseClient.js';
import { rpcIeltsListManageableExams } from './ieltsExamModeService.js';
import { resolveMySchoolCapabilities } from './schoolAdminService.js';
const PLATFORM_ADMIN_ROLES = new Set(['admin', 'superadmin']);
const normalizeRole = (role) => (role ?? '').trim().toLowerCase();
export const resolveIeltsExamModeAdminAccess = ({ isAuthenticated, isAdmin = false, role = null, canAdministerSchool = false, manageableExamCount = 0, manageableExamListSucceeded = false, }) => {
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
export const checkIeltsExamModeAdminAccess = async (client = supabase) => {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) {
        return { allowed: false, reason: 'verification_error' };
    }
    const user = authData.user;
    if (!user) {
        return resolveIeltsExamModeAdminAccess({ isAuthenticated: false });
    }
    let role = null;
    let isAdmin = false;
    let capabilityResolved = false;
    const { data: profile, error: profileError } = await client
        .from('users')
        .select('role, is_admin')
        .eq('id', user.id)
        .maybeSingle();
    if (!profileError && profile) {
        const typedProfile = profile;
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
        const capabilityResolution = await resolveMySchoolCapabilities(null, client);
        capabilityResolved = capabilityResolution.status === 'ready';
        if (capabilityResolution.capabilities?.can_administer) {
            return resolveIeltsExamModeAdminAccess({
                isAuthenticated: true,
                isAdmin,
                role,
                canAdministerSchool: true,
            });
        }
    }
    catch {
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
    }
    catch {
        return { allowed: false, reason: 'verification_error' };
    }
};
