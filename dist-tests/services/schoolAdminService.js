import { supabase } from './supabaseClient.js';
import { normalizeCambridgeRetakeResult, } from '../src/lib/cambridgeRetakeResult.js';
import { normalizeCambridgeIdentityLinkResult, } from '../src/lib/cambridgeIdentityLinkResult.js';
function getSettingBool(settings, key, defaultValue) {
    const raw = settings?.[key];
    if (typeof raw === 'boolean')
        return raw;
    if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (normalized === 'true')
            return true;
        if (normalized === 'false')
            return false;
    }
    return defaultValue;
}
// ============================================
// School Admin Service Functions
// ============================================
/**
 * Check if current user is a school admin for their school
 */
export async function isSchoolAdmin() {
    try {
        return Boolean((await getMySchoolCapabilities())?.can_administer);
    }
    catch (err) {
        console.error('Exception checking school admin status:', err);
        return false;
    }
}
export async function resolveMySchoolCapabilities(schoolId, client = supabase) {
    try {
        const { data, error } = await client.rpc('school_admin_get_my_allocation_capabilities', { p_school_id: schoolId || null });
        if (error) {
            return { status: 'error', capabilities: null, message: error.message || 'School access could not be verified.' };
        }
        const payload = data;
        if (!payload || payload['success'] !== true) {
            const reason = typeof payload?.['error'] === 'string' ? payload['error'].trim().toLowerCase() : '';
            if (reason === 'no active school membership' || reason === 'not authenticated') {
                return { status: 'ready', capabilities: null };
            }
            return { status: 'error', capabilities: null, message: 'School access could not be verified.' };
        }
        const role = payload['role'];
        const accountType = payload['account_type'];
        const resolvedSchoolId = payload['school_id'];
        if (typeof resolvedSchoolId !== 'string'
            || !['student', 'teacher', 'school_admin'].includes(String(role))) {
            return { status: 'error', capabilities: null, message: 'School access could not be verified.' };
        }
        return {
            status: 'ready',
            capabilities: {
                user_id: typeof payload['user_id'] === 'string' ? payload['user_id'] : '',
                school_id: resolvedSchoolId,
                role: role,
                account_type: accountType === 'school_head' ? 'school_head' : role,
                is_owner: Boolean(payload['is_owner']),
                can_administer: Boolean(payload['can_administer']),
                can_teach: Boolean(payload['can_teach']),
                has_active_teacher_allocation: Boolean(payload['has_active_teacher_allocation'] ?? payload['has_active_teaching_assignment']),
                can_manage_billing: Boolean(payload['can_manage_billing'] ?? payload['is_owner']),
                can_manage_admins: Boolean(payload['can_manage_admins'] ?? payload['is_owner']),
                can_transfer_ownership: Boolean(payload['can_transfer_ownership'] ?? payload['is_owner']),
                can_view_governance: Boolean(payload['can_view_governance'] ?? payload['is_owner']),
            },
        };
    }
    catch (error) {
        console.error('Exception loading school capabilities:', error);
        return { status: 'error', capabilities: null, message: 'School access could not be verified.' };
    }
}
export async function getMySchoolCapabilities(schoolId) {
    const resolution = await resolveMySchoolCapabilities(schoolId);
    return resolution.status === 'ready' ? resolution.capabilities : null;
}
/**
 * Get the user's current school membership
 */
export async function getCurrentSchool() {
    try {
        const capabilities = await getMySchoolCapabilities();
        if (!capabilities)
            return null;
        const schoolId = capabilities.school_id;
        const roleInSchool = capabilities.role;
        // Prefer admin RPC (returns school + stats). Requires SCHOOL_ADMIN_FUNCTIONS.sql deployed.
        const { data: details, error: detailsError } = await supabase.rpc('get_school_details', {
            p_school_id: schoolId,
        });
        if (detailsError || !details?.success) {
            console.error('Error fetching school details (run SCHOOL_ADMIN_FUNCTIONS.sql):', detailsError || details?.error);
            // Fallback: minimal school info via direct select (no stats)
            const { data: schoolRow, error: schoolError } = await supabase
                .from('schools')
                .select('id, name, slug, logo_url, settings, invite_code')
                .eq('id', schoolId)
                .maybeSingle();
            if (schoolError || !schoolRow) {
                console.error('Error fetching school row:', schoolError);
                return null;
            }
            const settings = (schoolRow.settings || {});
            const allowStudent = getSettingBool(settings, 'allow_student_signup', false);
            const allowTeacher = getSettingBool(settings, 'allow_teacher_signup', false);
            return {
                school: {
                    id: schoolRow.id,
                    name: schoolRow.name,
                    slug: schoolRow.slug,
                    logo_url: schoolRow.logo_url,
                    settings,
                    invite_code: schoolRow.invite_code,
                    allow_student_signup: allowStudent,
                    allow_teacher_signup: allowTeacher,
                },
                role: roleInSchool,
                stats: { students: 0, teachers: 0, admins: 0, total: 0 },
            };
        }
        const school = details.school;
        const settings = (school.settings || {});
        const allowStudent = getSettingBool(settings, 'allow_student_signup', false);
        const allowTeacher = getSettingBool(settings, 'allow_teacher_signup', false);
        const stats = details.stats;
        return {
            school: {
                id: school.id,
                name: school.name,
                slug: school.slug,
                logo_url: school.logo_url,
                settings,
                invite_code: school.invite_code,
                allow_student_signup: allowStudent,
                allow_teacher_signup: allowTeacher,
            },
            role: roleInSchool,
            stats: {
                students: Number(stats?.students ?? 0),
                teachers: Number(stats?.teachers ?? 0),
                admins: Number(stats?.admins ?? 0),
                total: Number(stats?.total ?? 0),
            },
        };
    }
    catch (err) {
        console.error('Exception fetching current school:', err);
        return null;
    }
}
export async function getSchoolDetails(schoolId) {
    try {
        const { data: details, error } = await supabase.rpc('get_school_details', {
            p_school_id: schoolId,
        });
        if (error || !details?.success) {
            console.error('Error fetching school details:', error || details?.error);
            return null;
        }
        const school = details.school;
        const settings = (school.settings || {});
        const allowStudent = getSettingBool(settings, 'allow_student_signup', false);
        const allowTeacher = getSettingBool(settings, 'allow_teacher_signup', false);
        const stats = details.stats;
        return {
            school: {
                id: school.id,
                name: school.name,
                slug: school.slug,
                logo_url: school.logo_url,
                settings,
                invite_code: school.invite_code,
                allow_student_signup: allowStudent,
                allow_teacher_signup: allowTeacher,
            },
            stats: {
                students: Number(stats?.students ?? 0),
                teachers: Number(stats?.teachers ?? 0),
                admins: Number(stats?.admins ?? 0),
                total: Number(stats?.total ?? 0),
            },
        };
    }
    catch (err) {
        console.error('Exception fetching school details:', err);
        return null;
    }
}
/**
 * List all members in the school
 */
export async function listSchoolMembers(schoolId, options) {
    try {
        const { data, error } = await supabase.rpc('get_school_members', {
            p_school_id: schoolId,
            p_role_filter: options?.role || null,
            p_search: options?.search || null,
            p_sort_key: options?.sortKey || 'username',
            p_sort_direction: options?.sortDirection || 'asc',
            p_limit: options?.limit || 50,
            p_offset: options?.offset || 0,
        });
        if (error || !data?.success) {
            console.error('Error listing school members:', error || data?.error);
            return { members: [], total: 0 };
        }
        const [{ data: namesData }, { data: capabilityData }] = await Promise.all([
            supabase.rpc('school_admin_get_member_names'),
            supabase.rpc('school_admin_list_member_capabilities', { p_school_id: schoolId }),
        ]);
        const namesById = new Map(((namesData?.success ? namesData.members : []) || []).map((row) => [row.user_id, row]));
        const capabilitiesById = new Map((capabilityData || []).map((row) => [row.user_id, row]));
        const membersRaw = (data.members || []);
        const mapped = membersRaw.map((row) => {
            const identity = namesById.get(row.user_id);
            const capability = capabilitiesById.get(row.user_id);
            return ({
                user_id: row.user_id,
                username: row.username,
                email: row.email,
                full_name: row.full_name ?? identity?.full_name ?? null,
                full_name_status: row.full_name_status ?? identity?.full_name_status ?? 'pending',
                role: row.role_in_school,
                avatar_url: row.avatar_url,
                grade: row.grade,
                batch: row.batch,
                level: row.level ?? 1,
                xp: row.xp ?? 0,
                last_seen: row.last_seen,
                is_banned: !!row.is_banned,
                banned_until: row.banned_until ?? null,
                required_changes: row.required_changes ?? null,
                joined_at: row.joined_at,
                is_owner: Boolean(capability?.is_owner),
                can_teach: Boolean(capability?.can_teach ?? row.role_in_school === 'teacher'),
            });
        });
        return { members: mapped, total: Number(data.total || 0) };
    }
    catch (err) {
        console.error('Exception listing school members:', err);
        return { members: [], total: 0 };
    }
}
export async function verifyStudentFullName(studentId, approved, correctedFullName) {
    const { data, error } = await supabase.rpc('school_admin_verify_student_full_name', {
        p_student_id: studentId,
        p_approved: approved,
        p_corrected_full_name: correctedFullName?.trim() || null,
    });
    if (error || !data?.success)
        return { success: false, error: data?.error || error?.message || 'Could not update name' };
    return data;
}
/**
 * Update a member's role within the school
 */
export async function updateMemberRole(schoolId, targetUserId, newRole, options) {
    try {
        const { data, error } = await supabase.rpc('school_admin_transition_member_role', {
            p_school_id: schoolId,
            p_member_user_id: targetUserId,
            p_new_role: newRole,
            p_keep_teaching: options?.keepTeaching ?? newRole === 'teacher',
            p_reason: options?.reason || null,
        });
        if (error) {
            console.error('Error updating member role:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return {
                success: false,
                error: data?.error || 'Failed to update role',
                allocationCount: Number(data?.allocation_count ?? data?.assignment_count ?? 0),
            };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception updating member role:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Remove a member from the school
 */
export async function removeMember(schoolId, targetUserId) {
    try {
        const { data, error } = await supabase.rpc('remove_school_member', {
            p_school_id: schoolId,
            p_member_user_id: targetUserId,
        });
        if (error) {
            console.error('Error removing member:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return { success: false, error: data?.error || 'Failed to remove member' };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception removing member:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Ban a member from the school
 */
export async function banMember(schoolId, targetUserId, reason) {
    try {
        // Reason is collected in the UI, but the current admin RPC does not store it.
        // (Keeping the prompt in the UI helps school admins confirm intent.)
        void reason;
        const { data, error } = await supabase.rpc('update_member_status', {
            p_school_id: schoolId,
            p_member_user_id: targetUserId,
            p_action: 'ban',
        });
        if (error) {
            console.error('Error banning member:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return { success: false, error: data?.error || 'Failed to ban member' };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception banning member:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Unban a member from the school
 */
export async function unbanMember(schoolId, targetUserId) {
    try {
        const { data, error } = await supabase.rpc('update_member_status', {
            p_school_id: schoolId,
            p_member_user_id: targetUserId,
            p_action: 'unban',
        });
        if (error) {
            console.error('Error unbanning member:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return { success: false, error: data?.error || 'Failed to unban member' };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception unbanning member:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Rotate the school's single invite code
 */
export async function rotateInviteCode(schoolId) {
    try {
        const { data, error } = await supabase.rpc('rotate_school_invite_code', {
            p_school_id: schoolId,
        });
        if (error || !data?.success) {
            console.error('Error rotating invite code:', error || data?.error);
            return { success: false, error: (error?.message || data?.error || 'Failed to rotate invite code') };
        }
        return { success: true, code: data.new_code };
    }
    catch (err) {
        console.error('Exception rotating invite code:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Update school settings
 */
export async function updateSchoolSettings(schoolId, settings) {
    try {
        // Name is a column, signup toggles live in settings JSON.
        if (typeof settings.name === 'string') {
            const { data, error } = await supabase.rpc('update_school_info', {
                p_school_id: schoolId,
                p_name: settings.name,
                p_logo_url: settings.logo_url ?? null,
                p_allowed_domains: null,
            });
            if (error || !data?.success) {
                console.error('Error updating school info:', error || data?.error);
                return { success: false, error: (error?.message || data?.error || 'Failed to update school name') };
            }
        }
        const mergedSettings = {};
        if (typeof settings['allow_student_signup'] === 'boolean')
            mergedSettings['allow_student_signup'] = settings['allow_student_signup'];
        if (typeof settings['allow_teacher_signup'] === 'boolean')
            mergedSettings['allow_teacher_signup'] = settings['allow_teacher_signup'];
        if (typeof settings['ielts_extra_practice_enabled'] === 'boolean')
            mergedSettings['ielts_extra_practice_enabled'] = settings['ielts_extra_practice_enabled'];
        if (Object.keys(mergedSettings).length > 0) {
            const { data, error } = await supabase.rpc('update_school_settings', {
                p_school_id: schoolId,
                p_settings: mergedSettings,
            });
            if (error || !data?.success) {
                console.error('Error updating school settings JSON:', error || data?.error);
                return { success: false, error: (error?.message || data?.error || 'Failed to update school settings') };
            }
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception updating school settings:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
export async function getSchoolIdentityStatus(schoolId) {
    const { data, error } = await supabase.rpc('rpc_school_admin_identity_status', { p_school_id: schoolId });
    if (error || !data?.success)
        throw new Error(error?.message || data?.error || 'School identity status is unavailable.');
    return {
        confirmed: Boolean(data.confirmed),
        confirmedAt: typeof data.confirmedAt === 'string' ? data.confirmedAt : null,
        confirmedBy: typeof data.confirmedBy === 'string' ? data.confirmedBy : null,
    };
}
const normalizeIdentityChangeRequest = (value) => {
    if (!value || typeof value.id !== 'string' || !['pending', 'approved', 'rejected', 'completed'].includes(value.status))
        return null;
    return {
        id: value.id,
        status: value.status,
        reason: typeof value.reason === 'string' ? value.reason : '',
        reviewNote: typeof value.reviewNote === 'string' ? value.reviewNote : null,
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
        reviewedAt: typeof value.reviewedAt === 'string' ? value.reviewedAt : null,
        completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    };
};
export async function getSchoolIdentityChangeRequestStatus(schoolId) {
    const { data, error } = await supabase.rpc('rpc_school_identity_change_request_status', { p_school_id: schoolId });
    if (error || !data?.success)
        throw new Error(error?.message || data?.error || 'Identity change request status is unavailable.');
    return normalizeIdentityChangeRequest(data.request);
}
export async function requestSchoolIdentityChange(schoolId, reason) {
    const { data, error } = await supabase.rpc('rpc_school_request_identity_change', {
        p_school_id: schoolId,
        p_reason: reason.trim(),
    });
    if (error || !data?.success)
        return { success: false, error: error?.message || data?.error || 'The identity change request could not be sent.' };
    return {
        success: true,
        message: typeof data.message === 'string' ? data.message : 'Request sent to the superadmin for review.',
        request: typeof data.requestId === 'string' ? {
            id: data.requestId,
            status: data.status === 'approved' || data.status === 'rejected' || data.status === 'completed' ? data.status : 'pending',
            reason: reason.trim(),
            reviewNote: null,
            createdAt: new Date().toISOString(),
            reviewedAt: null,
            completedAt: null,
        } : undefined,
    };
}
export async function listSuperadminSchoolIdentityChangeRequests(status = 'pending') {
    const { data, error } = await supabase.rpc('rpc_superadmin_list_school_identity_change_requests', {
        p_status: status,
        p_limit: 200,
    });
    if (error)
        throw new Error(error.message || 'Identity change requests could not be loaded.');
    return (Array.isArray(data) ? data : []).flatMap((value) => {
        const request = normalizeIdentityChangeRequest(value);
        if (!request || typeof value.schoolId !== 'string')
            return [];
        return [{
                ...request,
                schoolId: value.schoolId,
                schoolName: typeof value.schoolName === 'string' ? value.schoolName : 'Unknown school',
                schoolLogoUrl: typeof value.schoolLogoUrl === 'string' ? value.schoolLogoUrl : null,
                requestedBy: typeof value.requestedBy === 'string' ? value.requestedBy : '',
                requesterName: typeof value.requesterName === 'string' ? value.requesterName : 'School administrator',
                requesterEmail: typeof value.requesterEmail === 'string' ? value.requesterEmail : null,
                schoolNameAtRequest: typeof value.schoolNameAtRequest === 'string' ? value.schoolNameAtRequest : 'Unknown school',
                schoolLogoAtRequest: typeof value.schoolLogoAtRequest === 'string' ? value.schoolLogoAtRequest : null,
            }];
    });
}
export async function decideSchoolIdentityChangeRequest(requestId, decision, note) {
    const { data, error } = await supabase.rpc('rpc_superadmin_decide_school_identity_change_request', {
        p_request_id: requestId,
        p_decision: decision,
        p_note: note.trim() || null,
    });
    if (error || !data?.success)
        return { success: false, error: error?.message || data?.error || 'The identity change request could not be reviewed.' };
    return { success: true, message: typeof data.message === 'string' ? data.message : 'Identity change request updated.' };
}
export async function confirmSchoolIdentity(schoolId, name, logoUrl) {
    const { data, error } = await supabase.rpc('rpc_school_admin_confirm_identity', {
        p_school_id: schoolId,
        p_name: name,
        p_logo_url: logoUrl,
    });
    if (error || !data?.success)
        return { success: false, error: error?.message || data?.error || 'School identity could not be confirmed.' };
    return { success: true };
}
/** Upload a school-owned logo and return its public URL. */
export async function uploadSchoolLogo(schoolId, file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        return { success: false, error: 'Please choose a PNG, JPG or WebP image.' };
    if (file.size > 2 * 1024 * 1024)
        return { success: false, error: 'The logo must be 2 MB or smaller.' };
    const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${schoolId}/logo-${Date.now()}.${extension || 'png'}`;
    const { error } = await supabase.storage.from('school-logos').upload(path, file, { upsert: true, contentType: file.type });
    if (error)
        return { success: false, error: error.message };
    const { data } = supabase.storage.from('school-logos').getPublicUrl(path);
    return { success: true, url: data.publicUrl };
}
// ============================================
// School Admin Class + Assignment Tools
// ============================================
export async function listSchoolClasses(schoolId) {
    try {
        const { data, error } = await supabase.rpc('school_admin_list_classes', {
            p_school_id: schoolId,
        });
        if (error) {
            console.error('Error fetching classes:', error);
            return [];
        }
        const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
        return rows.map((row) => ({
            id: row.id,
            school_id: row.school_id,
            class_code: row.class_code,
            class_name: row.class_name,
            grade_level: row.grade_level ?? null,
            is_active: !!row.is_active,
        }));
    }
    catch (err) {
        console.error('Exception fetching classes:', err);
        return [];
    }
}
export async function saveSchoolClass(schoolId, payload) {
    try {
        const { data, error } = await supabase.rpc('school_admin_save_class', {
            p_school_id: schoolId,
            p_class_id: payload.id || null,
            p_class_code: payload.class_code,
            p_class_name: payload.class_name,
            p_grade_level: payload.grade_level,
            p_is_active: payload.is_active,
        });
        if (error) {
            console.error('Error saving class:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result && result.success === false) {
            return { success: false, error: result.error };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception saving class:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
export async function archiveSchoolClass(schoolId, classId) {
    try {
        const { data, error } = await supabase.rpc('school_admin_archive_class', {
            p_school_id: schoolId,
            p_class_id: classId,
        });
        if (error) {
            console.error('Error archiving class:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result && result.success === false) {
            return {
                success: false,
                code: result.code,
                studentCount: Number(result.student_count || 0),
                allocationCount: Number(result.allocation_count ?? result.assignment_count ?? 0),
                error: result.error,
            };
        }
        return { success: true, action: result?.action || 'archived' };
    }
    catch (err) {
        console.error('Exception archiving class:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
export async function listSchoolTeachers(schoolId) {
    try {
        const { data, error } = await supabase.rpc('school_admin_list_allocation_teachers', {
            p_school_id: schoolId,
        });
        if (error) {
            console.error('Error fetching teachers:', error);
            return [];
        }
        const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
        return rows.map((row) => ({
            user_id: row.user_id,
            username: row.username,
            email: row.email,
            subject_specializations: Array.isArray(row.subject_specializations) ? row.subject_specializations : [],
            verified: !!row.verified,
            role_in_school: row.role_in_school,
            is_owner: Boolean(row.is_owner),
            can_teach: Boolean(row.can_teach),
            has_active_allocation: Boolean(row.has_active_allocation ?? row.has_active_assignment),
        }));
    }
    catch (err) {
        console.error('Exception fetching teachers:', err);
        return [];
    }
}
export async function setAdministratorTeachingStaffStatus(schoolId, memberUserId, enabled) {
    try {
        const { data, error } = await supabase.rpc('rpc_school_admin_set_teaching_staff_status', {
            p_school_id: schoolId,
            p_member_user_id: memberUserId,
            p_enabled: enabled,
        });
        if (error)
            return { success: false, error: error.message };
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (!result?.success)
            return { success: false, error: result?.error || 'Teaching staff status could not be updated.' };
        return {
            success: true,
            can_teach: Boolean(result.can_teach),
            allocation_count: Number(result.allocation_count ?? result.assignment_count ?? 0),
        };
    }
    catch (error) {
        console.error('Exception updating teaching staff status:', error);
        return { success: false, error: 'Teaching staff status could not be updated.' };
    }
}
export async function listTeacherAllocations(schoolId) {
    try {
        const { data, error } = await supabase.rpc('school_admin_list_teacher_allocations', {
            p_school_id: schoolId,
        });
        if (error) {
            console.error('Error fetching teacher allocations:', error);
            throw new Error(error.message || 'Teacher allocations could not be loaded.');
        }
        const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
        return rows.map((row) => ({
            id: row.id,
            school_id: row.school_id,
            class_id: row.class_id,
            teacher_user_id: row.teacher_user_id,
            subject: row.subject,
            active: !!row.active,
            allocated_at: row.allocated_at ?? row.created_at ?? null,
            teacher_name: row.teacher_name || row.teacher_username || row.teacher_email || 'Unknown teacher',
            teacher_username: row.teacher_username || null,
            teacher_email: row.teacher_email || null,
            teacher_membership_status: row.teacher_membership_status || null,
            teacher_can_teach: Boolean(row.teacher_can_teach),
            class_code: row.class_code || null,
            class_name: row.class_name || null,
            grade_level: row.grade_level == null ? null : String(row.grade_level),
        }));
    }
    catch (err) {
        console.error('Exception fetching teacher allocations:', err);
        throw err instanceof Error
            ? err
            : new Error('Teacher allocations could not be loaded.');
    }
}
export async function allocateTeacherToClassSubject(schoolId, classId, teacherUserId, subject, active) {
    try {
        const { data, error } = await supabase.rpc('admin_allocate_teacher_to_class_subject', {
            p_school_id: schoolId,
            p_class_id: classId,
            p_teacher_user_id: teacherUserId,
            p_subject: subject,
            p_active: active,
        });
        if (error) {
            console.error('Error allocating teacher:', error);
            return { success: false, error: error.message };
        }
        if (data && data.success === false) {
            return { success: false, error: data.error || 'Failed to allocate teacher' };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception allocating teacher:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
export async function deleteTeacherAllocation(allocationId, schoolId) {
    try {
        // Get school ID if not provided
        let effectiveSchoolId = schoolId;
        if (!effectiveSchoolId) {
            const overview = await getCurrentSchool();
            effectiveSchoolId = overview?.school?.id;
        }
        if (!effectiveSchoolId) {
            return { success: false, error: 'Could not determine school' };
        }
        const { data, error } = await supabase.rpc('school_admin_delete_teacher_allocation', {
            p_school_id: effectiveSchoolId,
            p_allocation_id: allocationId,
        });
        if (error) {
            console.error('Error deleting teacher allocation:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result && result.success === false) {
            return { success: false, error: result.error };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception deleting teacher allocation:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
export async function listClassStudents(classIds, schoolId) {
    try {
        if (classIds.length === 0)
            return [];
        // Get school ID if not provided
        let effectiveSchoolId = schoolId;
        if (!effectiveSchoolId) {
            const overview = await getCurrentSchool();
            effectiveSchoolId = overview?.school?.id;
        }
        if (!effectiveSchoolId) {
            console.error('Could not determine school for listClassStudents');
            return [];
        }
        const { data, error } = await supabase.rpc('school_admin_list_class_students', {
            p_school_id: effectiveSchoolId,
            p_class_ids: classIds,
        });
        if (error) {
            console.error('Error fetching class students:', error);
            return [];
        }
        const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
        return rows.map((row) => ({
            class_id: row.class_id,
            student_id: row.student_id,
        }));
    }
    catch (err) {
        console.error('Exception fetching class students:', err);
        return [];
    }
}
/**
 * Preserve a Cambridge submission in audit history and allow a fresh attempt.
 */
export async function allowQuizRetake(scoreId, reason) {
    try {
        const { data, error } = await supabase.rpc('allow_cambridge_retake', {
            p_score_id: scoreId,
            p_reason: reason?.trim() || null,
        });
        if (error) {
            console.error('Error allowing Cambridge retake:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        return normalizeCambridgeRetakeResult(result);
    }
    catch (err) {
        console.error('Exception allowing Cambridge retake:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/** @deprecated Use allowQuizRetake. Kept for callers outside the current portal bundle. */
export const deleteQuizSubmission = allowQuizRetake;
/**
 * Link one legacy Cambridge submission to a verified student in the same school.
 * The database records the administrator, reason, and historical identity snapshot.
 */
export async function linkCambridgeAttemptStudent(scoreId, studentId, reason) {
    try {
        const { data, error } = await supabase.rpc('school_admin_link_cambridge_attempt_student', {
            p_score_id: scoreId,
            p_student_id: studentId,
            p_reason: reason.trim(),
        });
        if (error) {
            console.error('Error linking Cambridge attempt identity:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        return normalizeCambridgeIdentityLinkResult(result);
    }
    catch (err) {
        console.error('Exception linking Cambridge attempt identity:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
// ============================================
// Teacher Class Access Functions
// ============================================
/**
 * Get the classes and subjects allocated to a teacher.
 */
export async function getTeacherAllocatedClasses(teacherUserId) {
    try {
        const { data, error } = await supabase.rpc('get_teacher_allocated_classes', {
            p_teacher_user_id: teacherUserId || null,
        });
        if (error) {
            console.error('Error fetching teacher allocated classes:', error);
            return [];
        }
        return (data || []).map((row) => ({
            class_id: row.class_id,
            class_code: row.class_code,
            class_name: row.class_name,
            grade_level: row.grade_level ?? null,
            subject: row.subject,
            is_active: !!row.is_active,
            school_id: row.school_id,
            school_name: row.school_name,
        }));
    }
    catch (err) {
        console.error('Exception fetching teacher allocated classes:', err);
        return [];
    }
}
/**
 * Get a teacher profile together with their allocated classes.
 */
export async function getTeacherProfileWithAllocations(teacherUserId) {
    try {
        const { data, error } = await supabase.rpc('get_teacher_profile_with_classes', {
            p_teacher_user_id: teacherUserId || null,
        });
        if (error) {
            console.error('Error fetching teacher profile with allocations:', error);
            return null;
        }
        if (!data || !data.success) {
            return null;
        }
        return {
            ...data,
            allocated_classes: data.allocated_classes ?? data.assigned_classes ?? [],
        };
    }
    catch (err) {
        console.error('Exception fetching teacher profile with allocations:', err);
        return null;
    }
}
/**
 * Check if teacher has access to a specific class
 */
export async function teacherHasClassAccess(teacherUserId, classId) {
    try {
        const { data, error } = await supabase.rpc('teacher_has_class_access', {
            p_teacher_user_id: teacherUserId,
            p_class_id: classId,
        });
        if (error) {
            console.error('Error checking teacher class access:', error);
            return false;
        }
        return !!data;
    }
    catch (err) {
        console.error('Exception checking teacher class access:', err);
        return false;
    }
}
/**
 * Get classes available for teacher (for dropdown filtering)
 */
export async function filterClassesForTeacher(teacherUserId, schoolId) {
    try {
        const { data, error } = await supabase.rpc('filter_classes_for_teacher', {
            p_teacher_user_id: teacherUserId || null,
            p_school_id: schoolId || null,
        });
        if (error) {
            console.error('Error filtering classes for teacher:', error);
            return [];
        }
        return (data || []).map((row) => ({
            id: row.id,
            school_id: schoolId || '',
            class_code: row.class_code,
            class_name: row.class_name,
            grade_level: row.grade_level ?? null,
            is_active: true,
        }));
    }
    catch (err) {
        console.error('Exception filtering classes for teacher:', err);
        return [];
    }
}
// ============================================
// School Subjects Management (via RPCs — Patch J)
// ============================================
/**
 * List all active subjects for a school
 */
export async function listSchoolSubjects(schoolId) {
    try {
        const { data, error } = await supabase.rpc('school_admin_list_subjects', {
            p_school_id: schoolId,
        });
        if (error) {
            console.error('Error fetching school subjects:', error);
            return [];
        }
        const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
        if (!Array.isArray(rows)) {
            console.error('Invalid school subjects response: expected an array');
            return [];
        }
        return rows;
    }
    catch (err) {
        console.error('Exception fetching school subjects:', err);
        return [];
    }
}
/**
 * Create a new subject
 */
export async function createSchoolSubject(schoolId, name, code) {
    try {
        const { data, error } = await supabase.rpc('school_admin_create_subject', {
            p_school_id: schoolId,
            p_name: name,
            p_code: code || null,
        });
        if (error) {
            console.error('Error creating subject:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result && result.success === false) {
            return { success: false, error: result.error };
        }
        return { success: true, subject: result?.subject };
    }
    catch (err) {
        console.error('Exception creating subject:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Update a subject
 */
export async function updateSchoolSubject(subjectId, updates, schoolId) {
    try {
        let effectiveSchoolId = schoolId;
        if (!effectiveSchoolId) {
            const overview = await getCurrentSchool();
            effectiveSchoolId = overview?.school?.id;
        }
        if (!effectiveSchoolId) {
            return { success: false, error: 'Could not determine school' };
        }
        const { data, error } = await supabase.rpc('school_admin_update_subject', {
            p_school_id: effectiveSchoolId,
            p_subject_id: subjectId,
            p_name: updates.name !== undefined ? (updates.name || null) : null,
            p_code: updates.code !== undefined ? updates.code : null,
            p_is_active: updates.is_active ?? null,
        });
        if (error) {
            console.error('Error updating subject:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result && result.success === false) {
            return { success: false, error: result.error };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception updating subject:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Delete (soft delete) a subject
 */
export async function deleteSchoolSubject(subjectId, schoolId) {
    try {
        let effectiveSchoolId = schoolId;
        if (!effectiveSchoolId) {
            const overview = await getCurrentSchool();
            effectiveSchoolId = overview?.school?.id;
        }
        if (!effectiveSchoolId) {
            return { success: false, error: 'Could not determine school' };
        }
        const { data, error } = await supabase.rpc('school_admin_delete_subject', {
            p_school_id: effectiveSchoolId,
            p_subject_id: subjectId,
        });
        if (error) {
            console.error('Error deleting subject:', error);
            return { success: false, error: error.message };
        }
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result && result.success === false) {
            return { success: false, error: result.error };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception deleting subject:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * List members via new RPC (with search)
 */
export async function listMembersViaRPC(search) {
    try {
        const { data, error } = await supabase.rpc('school_admin_list_members', {
            p_search: search || null,
        });
        if (error) {
            console.error('Error listing members via RPC:', error);
            return [];
        }
        return data || [];
    }
    catch (err) {
        console.error('Exception listing members via RPC:', err);
        return [];
    }
}
/**
 * Set member role via RPC (student/teacher)
 */
export async function setMemberRoleViaRPC(memberUserId, newRole) {
    try {
        const { data, error } = await supabase.rpc('school_admin_set_member_role', {
            p_member_user_id: memberUserId,
            p_new_role: newRole,
        });
        if (error) {
            console.error('Error setting member role via RPC:', error);
            return { success: false, error: error.message };
        }
        if (data && typeof data === 'object' && 'success' in data) {
            return data;
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception setting member role via RPC:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Move student to class via RPC
 */
export async function moveStudentToClassViaRPC(studentId, classId, fromClassId = null) {
    try {
        const { data, error } = await supabase.rpc('move_student_between_classes', {
            p_student_id: studentId,
            p_from_class_id: fromClassId,
            p_to_class_id: classId,
        });
        if (error) {
            console.error('Error moving student via RPC:', error);
            return { success: false, error: error.message };
        }
        if (data && typeof data === 'object' && 'success' in data) {
            return data;
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception moving student via RPC:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
export async function transferStudentPlacement(input) {
    const { data, error } = await supabase.rpc('rpc_school_admin_transfer_student_placement', {
        p_school_id: input.schoolId,
        p_student_id: input.studentId,
        p_expected_from_class_id: input.expectedFromClassId,
        p_to_class_id: input.toClassId,
        p_reason: input.reason,
        p_effective_date: input.effectiveDate,
        p_exception_id: input.exceptionId ?? null,
    });
    if (error)
        return { success: false, error: error.message };
    return data ?? { success: false, error: 'No placement response was returned.' };
}
export async function unassignStudentPlacement(input) {
    const { data, error } = await supabase.rpc('rpc_school_admin_unassign_student_placement', {
        p_school_id: input.schoolId,
        p_student_id: input.studentId,
        p_expected_from_class_id: input.expectedFromClassId,
        p_reason: input.reason,
        p_effective_date: input.effectiveDate,
        p_exception_id: input.exceptionId ?? null,
    });
    if (error)
        return { success: false, error: error.message };
    return data ?? { success: false, error: 'No placement response was returned.' };
}
export async function bulkTransferStudentPlacements(input) {
    const { data, error } = await supabase.rpc('rpc_school_admin_bulk_transfer_student_placements', {
        p_school_id: input.schoolId,
        p_student_ids: input.studentIds,
        p_to_class_id: input.toClassId,
        p_reason: input.reason,
        p_effective_date: input.effectiveDate,
    });
    if (error)
        return { success: false, error: error.message };
    return data ?? { success: false, error: 'No placement response was returned.' };
}
export async function refreshPlacementExceptions(schoolId) {
    const { data, error } = await supabase.rpc('rpc_school_admin_refresh_placement_exceptions', { p_school_id: schoolId });
    if (error)
        return { success: false, error: error.message };
    return data ?? { success: true };
}
export async function listPlacementExceptions(schoolId) {
    const { data, error } = await supabase.rpc('rpc_school_admin_list_placement_exceptions', { p_school_id: schoolId });
    if (error)
        throw new Error(error.message);
    return Array.isArray(data) ? data : [];
}
export async function getStudentPlacementReview(schoolId, studentId) {
    const { data, error } = await supabase.rpc('rpc_school_admin_get_student_placement_review', {
        p_school_id: schoolId,
        p_student_id: studentId,
    });
    if (error)
        throw new Error(error.message);
    return data ?? { error: 'student_not_found' };
}
/**
 * Get all students enrolled in a specific class
 */
export async function getClassRoster(classId) {
    try {
        const { data, error } = await supabase.rpc('get_class_roster', {
            p_class_id: classId,
        });
        if (error) {
            console.error('Error fetching class roster:', error);
            return [];
        }
        return (data || []).map((row) => ({
            student_id: row.student_id,
            username: row.username,
            email: row.email,
            avatar_url: row.avatar_url,
            grade: row.grade || '',
            batch: row.batch || '',
            level: row.level ?? 1,
            xp: row.xp ?? 0,
            last_seen: row.last_seen,
            is_banned: !!row.is_banned,
            enrolled_at: row.enrolled_at,
        }));
    }
    catch (err) {
        console.error('Exception fetching class roster:', err);
        return [];
    }
}
/**
 * Get all classes in a school with student and teacher counts
 */
export async function getSchoolClassRosters(schoolId) {
    try {
        const { data, error } = await supabase.rpc('get_school_class_rosters', {
            p_school_id: schoolId,
        });
        if (error) {
            console.error('Error fetching school class rosters:', error);
            return [];
        }
        return (data || []).map((row) => ({
            class_id: row.class_id,
            class_code: row.class_code,
            class_name: row.class_name,
            grade_level: row.grade_level,
            is_active: !!row.is_active,
            student_count: Number(row.student_count || 0),
            teacher_count: Number(row.teacher_count || 0),
        }));
    }
    catch (err) {
        console.error('Exception fetching school class rosters:', err);
        return [];
    }
}
/**
 * Get students who are not enrolled in any class
 */
export async function getUnassignedStudents(schoolId) {
    try {
        const { data, error } = await supabase.rpc('get_unassigned_students', {
            p_school_id: schoolId,
        });
        if (error) {
            console.error('Error fetching unassigned students:', error);
            return [];
        }
        return (data || []).map((row) => ({
            student_id: row.student_id,
            username: row.username,
            email: row.email,
            avatar_url: row.avatar_url,
            grade: row.grade || '',
            batch: row.batch || '',
            level: row.level ?? 1,
            xp: row.xp ?? 0,
            last_seen: null,
            is_banned: false,
            enrolled_at: '',
        }));
    }
    catch (err) {
        console.error('Exception fetching unassigned students:', err);
        return [];
    }
}
/**
 * Add a student to a class
 */
export async function addStudentToClass(classId, studentId) {
    try {
        const { data, error } = await supabase.rpc('add_student_to_class', {
            p_class_id: classId,
            p_student_id: studentId,
        });
        if (error) {
            console.error('Error adding student to class:', error);
            return { success: false, error: error.message };
        }
        return data;
    }
    catch (err) {
        console.error('Exception adding student to class:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Remove a student from a class
 */
export async function removeStudentFromClass(classId, studentId) {
    try {
        const { data, error } = await supabase.rpc('remove_student_from_class', {
            p_class_id: classId,
            p_student_id: studentId,
        });
        if (error) {
            console.error('Error removing student from class:', error);
            return { success: false, error: error.message };
        }
        return data;
    }
    catch (err) {
        console.error('Exception removing student from class:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Move a student from one class to another
 */
export async function moveStudentBetweenClasses(studentId, fromClassId, toClassId) {
    try {
        const { data, error } = await supabase.rpc('move_student_between_classes', {
            p_student_id: studentId,
            p_from_class_id: fromClassId,
            p_to_class_id: toClassId,
        });
        if (error) {
            console.error('Error moving student between classes:', error);
            return { success: false, error: error.message };
        }
        return data;
    }
    catch (err) {
        console.error('Exception moving student between classes:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Bulk add students to a class
 */
export async function bulkAddStudentsToClass(classId, studentIds) {
    try {
        const { data, error } = await supabase.rpc('bulk_add_students_to_class', {
            p_class_id: classId,
            p_student_ids: studentIds,
        });
        if (error) {
            console.error('Error bulk adding students to class:', error);
            return { success: false, error: error.message };
        }
        return data;
    }
    catch (err) {
        console.error('Exception bulk adding students to class:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Bulk remove students from a class
 */
export async function bulkRemoveStudentsFromClass(classId, studentIds) {
    try {
        const { data, error } = await supabase.rpc('bulk_remove_students_from_class', {
            p_class_id: classId,
            p_student_ids: studentIds,
        });
        if (error) {
            console.error('Error bulk removing students from class:', error);
            return { success: false, error: error.message };
        }
        return data;
    }
    catch (err) {
        console.error('Exception bulk removing students from class:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Get detailed statistics for a class
 */
export async function getClassStatistics(classId) {
    try {
        const { data, error } = await supabase.rpc('get_class_statistics', {
            p_class_id: classId,
        });
        if (error) {
            console.error('Error fetching class statistics:', error);
            return null;
        }
        if (!data || !data.success) {
            return null;
        }
        return data;
    }
    catch (err) {
        console.error('Exception fetching class statistics:', err);
        return null;
    }
}
/**
 * Auto-enroll students by grade level
 */
export async function autoEnrollStudentsByGrade(classId) {
    try {
        const { data, error } = await supabase.rpc('auto_enroll_students_by_grade', {
            p_class_id: classId,
        });
        if (error) {
            console.error('Error auto-enrolling students:', error);
            return { success: false, error: error.message };
        }
        return data;
    }
    catch (err) {
        console.error('Exception auto-enrolling students:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Suspend a student for a limited time (1–720 hours).
 */
export async function suspendStudent(studentId, durationHours, reason) {
    try {
        const { data, error } = await supabase.rpc('school_admin_suspend_student', {
            p_student_id: studentId,
            p_duration_hours: durationHours,
            p_reason: reason || 'Violation of school policy',
        });
        if (error) {
            console.error('Error suspending student:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return { success: false, error: data?.error || 'Failed to suspend student' };
        }
        return { success: true, banned_until: data.banned_until };
    }
    catch (err) {
        console.error('Exception suspending student:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Remove a student's time-limited suspension early.
 */
export async function unsuspendStudent(studentId, reason) {
    try {
        const { data, error } = await supabase.rpc('school_admin_unsuspend_student', {
            p_student_id: studentId,
            p_reason: reason || 'Suspension lifted by school admin',
        });
        if (error) {
            console.error('Error unsuspending student:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return { success: false, error: data?.error || 'Failed to unsuspend student' };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception unsuspending student:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Require a student to change their username and/or avatar.
 */
export async function forceProfileChange(studentId, changes, reason) {
    try {
        const { data, error } = await supabase.rpc('school_admin_force_profile_change', {
            p_student_id: studentId,
            p_changes: changes,
            p_reason: reason || 'Profile change required by school administrator',
        });
        if (error) {
            console.error('Error forcing profile change:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return { success: false, error: data?.error || 'Failed to set profile change requirement' };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception forcing profile change:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Clear a student's required profile changes (admin or student can call).
 */
export async function clearProfileChange(studentId) {
    try {
        const { data, error } = await supabase.rpc('school_admin_clear_profile_change', {
            p_student_id: studentId,
        });
        if (error) {
            console.error('Error clearing profile change:', error);
            return { success: false, error: error.message };
        }
        if (!data?.success) {
            return { success: false, error: data?.error || 'Failed to clear profile change' };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Exception clearing profile change:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
}
/**
 * Get the moderation audit log for the school admin's school.
 */
export async function getModerationLog(limit = 50, offset = 0) {
    try {
        const { data, error } = await supabase.rpc('school_admin_get_moderation_log', {
            p_limit: limit,
            p_offset: offset,
        });
        if (error) {
            console.error('Error fetching moderation log:', error);
            return { entries: [], error: error.message };
        }
        if (!data?.success) {
            return { entries: [], error: data?.error || 'Failed to fetch moderation log' };
        }
        return { entries: (data.entries || []) };
    }
    catch (err) {
        console.error('Exception fetching moderation log:', err);
        return { entries: [], error: 'An unexpected error occurred' };
    }
}
/**
 * Get a student's current moderation status.
 */
export async function getStudentModStatus(studentId) {
    try {
        const { data, error } = await supabase.rpc('school_admin_get_student_mod_status', {
            p_student_id: studentId,
        });
        if (error || !data?.success) {
            console.error('Error fetching student mod status:', error || data?.error);
            return null;
        }
        return {
            user_id: data.user_id,
            username: data.username,
            is_banned: !!data.is_banned,
            banned_until: data.banned_until ?? null,
            required_changes: data.required_changes ?? null,
            profile_locked: !!data.profile_locked,
            mod_status: data.mod_status,
        };
    }
    catch (err) {
        console.error('Exception fetching student mod status:', err);
        return null;
    }
}
