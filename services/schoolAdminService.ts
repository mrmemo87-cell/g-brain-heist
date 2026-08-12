import { supabase } from './supabaseClient.js';
import type { SchoolAccountType, SchoolRole } from '../types';
import {
  normalizeCambridgeRetakeResult,
  type CambridgeRetakeResult,
} from '../src/lib/cambridgeRetakeResult.js';
import {
  normalizeCambridgeIdentityLinkResult,
  type CambridgeIdentityLinkResult,
} from '../src/lib/cambridgeIdentityLinkResult.js';

// ============================================
// School Admin Service — Patch J (RPC-backed)
// ============================================
// Types for School Admin Portal
// ============================================

export interface SchoolStats {
  students: number;
  teachers: number;
  admins: number;
  total: number;
}

export interface SchoolMember {
  user_id?: string;
  username: string;
  email: string;
  full_name: string | null;
  full_name_status: 'pending' | 'verified' | 'rejected';
  role: SchoolRole;
  avatar_url: string | null;
  grade: number | null;
  batch: string | null;
  level: number;
  xp: number;
  last_seen: string | null;
  is_banned: boolean;
  banned_until: string | null;
  required_changes: Record<string, any> | null;
  joined_at: string;
  is_owner: boolean;
  can_teach: boolean;
}

export interface SchoolCapabilities {
  user_id?: string;
  school_id: string;
  role: SchoolRole;
  account_type?: SchoolAccountType;
  is_owner: boolean;
  can_administer: boolean;
  can_teach: boolean;
  can_manage_billing?: boolean;
  can_manage_admins?: boolean;
  can_transfer_ownership?: boolean;
  can_view_governance?: boolean;
}

export type SchoolCapabilitiesResolution =
  | { status: 'ready'; capabilities: SchoolCapabilities | null }
  | { status: 'error'; capabilities: null; message: string };

export interface SchoolCapabilitiesRpcClient {
  rpc(
    functionName: string,
    params?: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message?: string | null } | null;
  }>;
}

export interface SchoolInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, any>;
  invite_code?: string | null;
  allow_student_signup: boolean;
  allow_teacher_signup: boolean;
}

export interface SchoolAdminOverview {
  school: SchoolInfo;
  role: SchoolRole;
  stats: SchoolStats;
}

export interface SchoolClass {
  id: string;
  school_id: string;
  class_code: string;
  class_name: string;
  grade_level: number | null;
  is_active: boolean;
}

export interface SchoolTeacher {
  user_id: string;
  username: string;
  email: string;
  subject_specializations: string[];
  verified: boolean;
  role_in_school: SchoolRole;
  is_owner: boolean;
  can_teach: boolean;
}

export interface ClassTeacherAssignment {
  id: string;
  school_id: string;
  class_id: string;
  teacher_user_id: string;
  subject: string;
  active: boolean;
  assigned_at: string | null;
}

export interface ClassStudentAssignment {
  class_id: string;
  student_id: string;
}

export interface TeacherAssignedClass {
  class_id: string;
  class_code: string;
  class_name: string;
  grade_level: number | null;
  subject: string;
  is_active: boolean;
  school_id: string;
  school_name: string;
}

export interface SchoolSubject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface TeacherProfileWithClasses {
  success: boolean;
  profile: {
    user_id: string;
    username: string;
    email: string;
    role: string;
    avatar_url: string | null;
    school_id: string | null;
  };
  assigned_classes: TeacherAssignedClass[];
  school: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
  total_classes: number;
}

function getSettingBool(settings: Record<string, any> | null | undefined, key: string, defaultValue: boolean) {
  const raw = settings?.[key];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return defaultValue;
}

// ============================================
// School Admin Service Functions
// ============================================

/**
 * Check if current user is a school admin for their school
 */
export async function isSchoolAdmin(): Promise<boolean> {
  try {
    return Boolean((await getMySchoolCapabilities())?.can_administer);
  } catch (err) {
    console.error('Exception checking school admin status:', err);
    return false;
  }
}

export async function resolveMySchoolCapabilities(
  schoolId?: string | null,
  client: SchoolCapabilitiesRpcClient = supabase as unknown as SchoolCapabilitiesRpcClient,
): Promise<SchoolCapabilitiesResolution> {
  try {
    const { data, error } = await client.rpc('school_admin_get_my_capabilities', { p_school_id: schoolId || null });
    if (error) {
      return { status: 'error', capabilities: null, message: error.message || 'School access could not be verified.' };
    }

    const payload = data as Record<string, unknown> | null;
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
    if (
      typeof resolvedSchoolId !== 'string'
      || !['student', 'teacher', 'school_admin'].includes(String(role))
    ) {
      return { status: 'error', capabilities: null, message: 'School access could not be verified.' };
    }

    return {
      status: 'ready',
      capabilities: {
        user_id: typeof payload['user_id'] === 'string' ? payload['user_id'] : '',
        school_id: resolvedSchoolId,
        role: role as SchoolRole,
        account_type: accountType === 'school_head' ? 'school_head' : role as SchoolRole,
        is_owner: Boolean(payload['is_owner']),
        can_administer: Boolean(payload['can_administer']),
        can_teach: Boolean(payload['can_teach']),
        can_manage_billing: Boolean(payload['can_manage_billing'] ?? payload['is_owner']),
        can_manage_admins: Boolean(payload['can_manage_admins'] ?? payload['is_owner']),
        can_transfer_ownership: Boolean(payload['can_transfer_ownership'] ?? payload['is_owner']),
        can_view_governance: Boolean(payload['can_view_governance'] ?? payload['is_owner']),
      },
    };
  } catch (error) {
    console.error('Exception loading school capabilities:', error);
    return { status: 'error', capabilities: null, message: 'School access could not be verified.' };
  }
}

export async function getMySchoolCapabilities(schoolId?: string | null): Promise<SchoolCapabilities | null> {
  const resolution = await resolveMySchoolCapabilities(schoolId);
  return resolution.status === 'ready' ? resolution.capabilities : null;
}

/**
 * Get the user's current school membership
 */
export async function getCurrentSchool(): Promise<SchoolAdminOverview | null> {
  try {
    const capabilities = await getMySchoolCapabilities();
    if (!capabilities) return null;
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

      const settings = (schoolRow.settings || {}) as Record<string, any>;
      const allowStudent = getSettingBool(settings, 'allow_student_signup', true);
      const allowTeacher = getSettingBool(settings, 'allow_teacher_signup', true);

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

    const school = details.school as any;
    const settings = (school.settings || {}) as Record<string, any>;
    const allowStudent = getSettingBool(settings, 'allow_student_signup', true);
    const allowTeacher = getSettingBool(settings, 'allow_teacher_signup', true);

    const stats = details.stats as any;
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
  } catch (err) {
    console.error('Exception fetching current school:', err);
    return null;
  }
}

export async function getSchoolDetails(schoolId: string): Promise<{ school: SchoolInfo; stats: SchoolStats } | null> {
  try {
    const { data: details, error } = await supabase.rpc('get_school_details', {
      p_school_id: schoolId,
    });

    if (error || !details?.success) {
      console.error('Error fetching school details:', error || details?.error);
      return null;
    }

    const school = details.school as any;
    const settings = (school.settings || {}) as Record<string, any>;
    const allowStudent = getSettingBool(settings, 'allow_student_signup', true);
    const allowTeacher = getSettingBool(settings, 'allow_teacher_signup', true);

    const stats = details.stats as any;
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
  } catch (err) {
    console.error('Exception fetching school details:', err);
    return null;
  }
}

/**
 * List all members in the school
 */
export async function listSchoolMembers(
  schoolId: string,
  options?: {
    role?: SchoolRole;
    search?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }
): Promise<{ members: SchoolMember[]; total: number }> {
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
    const namesById = new Map(
      ((namesData?.success ? namesData.members : []) || []).map((row: any) => [row.user_id, row])
    );
    const capabilitiesById = new Map(((capabilityData || []) as any[]).map((row: any) => [row.user_id, row]));
    const membersRaw = (data.members || []) as any[];
    const mapped: SchoolMember[] = membersRaw.map((row) => {
      const identity = namesById.get(row.user_id) as any;
      const capability = capabilitiesById.get(row.user_id) as any;
      return ({
      user_id: row.user_id,
      username: row.username,
      email: row.email,
      full_name: row.full_name ?? identity?.full_name ?? null,
      full_name_status: row.full_name_status ?? identity?.full_name_status ?? 'pending',
      role: row.role_in_school as SchoolRole,
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
  } catch (err) {
    console.error('Exception listing school members:', err);
    return { members: [], total: 0 };
  }
}

export async function verifyStudentFullName(
  studentId: string,
  approved: boolean,
  correctedFullName?: string
): Promise<{ success: boolean; error?: string; full_name?: string; status?: string }> {
  const { data, error } = await supabase.rpc('school_admin_verify_student_full_name', {
    p_student_id: studentId,
    p_approved: approved,
    p_corrected_full_name: correctedFullName?.trim() || null,
  });
  if (error || !data?.success) return { success: false, error: data?.error || error?.message || 'Could not update name' };
  return data;
}

/**
 * Update a member's role within the school
 */
export async function updateMemberRole(
  schoolId: string,
  targetUserId: string,
  newRole: SchoolRole,
  options?: { keepTeaching?: boolean; reason?: string }
): Promise<{ success: boolean; error?: string; assignmentCount?: number }> {
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
      return { success: false, error: data?.error || 'Failed to update role', assignmentCount: data?.assignment_count };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception updating member role:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Remove a member from the school
 */
export async function removeMember(
  schoolId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception removing member:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Ban a member from the school
 */
export async function banMember(
  schoolId: string,
  targetUserId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception banning member:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Unban a member from the school
 */
export async function unbanMember(
  schoolId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception unbanning member:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Rotate the school's single invite code
 */
export async function rotateInviteCode(
  schoolId: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('rotate_school_invite_code', {
      p_school_id: schoolId,
    });

    if (error || !data?.success) {
      console.error('Error rotating invite code:', error || data?.error);
      return { success: false, error: (error?.message || data?.error || 'Failed to rotate invite code') };
    }

    return { success: true, code: data.new_code };
  } catch (err) {
    console.error('Exception rotating invite code:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Update school settings
 */
export async function updateSchoolSettings(
  schoolId: string,
  settings: {
    name?: string;
    logo_url?: string | null;
    allow_student_signup?: boolean;
    allow_teacher_signup?: boolean;
    ielts_extra_practice_enabled?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
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

    const mergedSettings: Record<string, any> = {};
    if (typeof settings['allow_student_signup'] === 'boolean') mergedSettings['allow_student_signup'] = settings['allow_student_signup'];
    if (typeof settings['allow_teacher_signup'] === 'boolean') mergedSettings['allow_teacher_signup'] = settings['allow_teacher_signup'];
    if (typeof settings['ielts_extra_practice_enabled'] === 'boolean') mergedSettings['ielts_extra_practice_enabled'] = settings['ielts_extra_practice_enabled'];

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
  } catch (err) {
    console.error('Exception updating school settings:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export interface SchoolIdentityStatus {
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

export async function getSchoolIdentityStatus(schoolId: string): Promise<SchoolIdentityStatus> {
  const { data, error } = await supabase.rpc('rpc_school_admin_identity_status', { p_school_id: schoolId });
  if (error || !data?.success) throw new Error(error?.message || data?.error || 'School identity status is unavailable.');
  return {
    confirmed: Boolean(data.confirmed),
    confirmedAt: typeof data.confirmedAt === 'string' ? data.confirmedAt : null,
    confirmedBy: typeof data.confirmedBy === 'string' ? data.confirmedBy : null,
  };
}

export async function confirmSchoolIdentity(
  schoolId: string,
  name: string,
  logoUrl: string | null,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_school_admin_confirm_identity', {
    p_school_id: schoolId,
    p_name: name,
    p_logo_url: logoUrl,
  });
  if (error || !data?.success) return { success: false, error: error?.message || data?.error || 'School identity could not be confirmed.' };
  return { success: true };
}

/** Upload a school-owned logo and return its public URL. */
export async function uploadSchoolLogo(schoolId: string, file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return { success: false, error: 'Please choose a PNG, JPG or WebP image.' };
  if (file.size > 2 * 1024 * 1024) return { success: false, error: 'The logo must be 2 MB or smaller.' };
  const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${schoolId}/logo-${Date.now()}.${extension || 'png'}`;
  const { error } = await supabase.storage.from('school-logos').upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { success: false, error: error.message };
  const { data } = supabase.storage.from('school-logos').getPublicUrl(path);
  return { success: true, url: data.publicUrl };
}

// ============================================
// School Admin Class + Assignment Tools
// ============================================

export async function listSchoolClasses(schoolId: string): Promise<SchoolClass[]> {
  try {
    const { data, error } = await supabase.rpc('school_admin_list_classes', {
      p_school_id: schoolId,
    });

    if (error) {
      console.error('Error fetching classes:', error);
      return [];
    }

    const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
    return rows.map((row: any) => ({
      id: row.id,
      school_id: row.school_id,
      class_code: row.class_code,
      class_name: row.class_name,
      grade_level: row.grade_level ?? null,
      is_active: !!row.is_active,
    }));
  } catch (err) {
    console.error('Exception fetching classes:', err);
    return [];
  }
}

export async function saveSchoolClass(
  schoolId: string,
  payload: {
    id?: string;
    class_code: string;
    class_name: string;
    grade_level: number | null;
    is_active: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception saving class:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function archiveSchoolClass(
  schoolId: string,
  classId: string
): Promise<{ success: boolean; error?: string }> {
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
      return { success: false, error: result.error };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception archiving class:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function listSchoolTeachers(schoolId: string): Promise<SchoolTeacher[]> {
  try {
    const { data, error } = await supabase.rpc('school_admin_list_teachers', {
      p_school_id: schoolId,
    });

    if (error) {
      console.error('Error fetching teachers:', error);
      return [];
    }

    const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
    return rows.map((row: any) => ({
      user_id: row.user_id,
      username: row.username,
      email: row.email,
      subject_specializations: Array.isArray(row.subject_specializations) ? row.subject_specializations : [],
      verified: !!row.verified,
      role_in_school: row.role_in_school as SchoolRole,
      is_owner: Boolean(row.is_owner),
      can_teach: Boolean(row.can_teach),
    }));
  } catch (err) {
    console.error('Exception fetching teachers:', err);
    return [];
  }
}

export async function listTeacherAssignments(schoolId: string): Promise<ClassTeacherAssignment[]> {
  try {
    const { data, error } = await supabase.rpc('school_admin_list_teacher_assignments', {
      p_school_id: schoolId,
    });

    if (error) {
      console.error('Error fetching teacher assignments:', error);
      return [];
    }

    const rows = (typeof data === 'string' ? JSON.parse(data) : data) || [];
    return rows.map((row: any) => ({
      id: row.id,
      school_id: row.school_id,
      class_id: row.class_id,
      teacher_user_id: row.teacher_user_id,
      subject: row.subject,
      active: !!row.active,
      assigned_at: row.assigned_at ?? row.created_at ?? null,
    }));
  } catch (err) {
    console.error('Exception fetching teacher assignments:', err);
    return [];
  }
}

export async function assignTeacherToClassSubject(
  schoolId: string,
  classId: string,
  teacherUserId: string,
  subject: string,
  active: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('admin_assign_teacher_to_class_subject', {
      p_school_id: schoolId,
      p_class_id: classId,
      p_teacher_user_id: teacherUserId,
      p_subject: subject,
      p_active: active,
    });

    if (error) {
      console.error('Error assigning teacher:', error);
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error || 'Failed to assign teacher' };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception assigning teacher:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function deleteTeacherAssignment(assignmentId: string, schoolId?: string): Promise<{ success: boolean; error?: string }> {
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

    const { data, error } = await supabase.rpc('school_admin_delete_teacher_assignment', {
      p_school_id: effectiveSchoolId,
      p_assignment_id: assignmentId,
    });

    if (error) {
      console.error('Error deleting teacher assignment:', error);
      return { success: false, error: error.message };
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (result && result.success === false) {
      return { success: false, error: result.error };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception deleting teacher assignment:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function listClassStudents(classIds: string[], schoolId?: string): Promise<ClassStudentAssignment[]> {
  try {
    if (classIds.length === 0) return [];

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
    return rows.map((row: any) => ({
      class_id: row.class_id,
      student_id: row.student_id,
    }));
  } catch (err) {
    console.error('Exception fetching class students:', err);
    return [];
  }
}

/**
 * Preserve a Cambridge submission in audit history and allow a fresh attempt.
 */
export async function allowQuizRetake(
  scoreId: string,
  reason?: string,
): Promise<CambridgeRetakeResult> {
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
  } catch (err) {
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
export async function linkCambridgeAttemptStudent(
  scoreId: string,
  studentId: string,
  reason: string,
): Promise<CambridgeIdentityLinkResult> {
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
  } catch (err) {
    console.error('Exception linking Cambridge attempt identity:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================
// Teacher Class Access Functions
// ============================================

/**
 * Get teacher's assigned classes
 */
export async function getTeacherAssignedClasses(teacherUserId?: string): Promise<TeacherAssignedClass[]> {
  try {
    const { data, error } = await supabase.rpc('get_teacher_assigned_classes', {
      p_teacher_user_id: teacherUserId || null,
    });

    if (error) {
      console.error('Error fetching teacher assigned classes:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      class_id: row.class_id,
      class_code: row.class_code,
      class_name: row.class_name,
      grade_level: row.grade_level ?? null,
      subject: row.subject,
      is_active: !!row.is_active,
      school_id: row.school_id,
      school_name: row.school_name,
    }));
  } catch (err) {
    console.error('Exception fetching teacher assigned classes:', err);
    return [];
  }
}

/**
 * Get teacher profile with assigned classes
 */
export async function getTeacherProfileWithClasses(teacherUserId?: string): Promise<TeacherProfileWithClasses | null> {
  try {
    const { data, error } = await supabase.rpc('get_teacher_profile_with_classes', {
      p_teacher_user_id: teacherUserId || null,
    });

    if (error) {
      console.error('Error fetching teacher profile with classes:', error);
      return null;
    }

    if (!data || !data.success) {
      return null;
    }

    return data as TeacherProfileWithClasses;
  } catch (err) {
    console.error('Exception fetching teacher profile with classes:', err);
    return null;
  }
}

/**
 * Check if teacher has access to a specific class
 */
export async function teacherHasClassAccess(teacherUserId: string, classId: string): Promise<boolean> {
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
  } catch (err) {
    console.error('Exception checking teacher class access:', err);
    return false;
  }
}

/**
 * Get classes available for teacher (for dropdown filtering)
 */
export async function filterClassesForTeacher(teacherUserId?: string, schoolId?: string): Promise<SchoolClass[]> {
  try {
    const { data, error } = await supabase.rpc('filter_classes_for_teacher', {
      p_teacher_user_id: teacherUserId || null,
      p_school_id: schoolId || null,
    });

    if (error) {
      console.error('Error filtering classes for teacher:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      school_id: schoolId || '',
      class_code: row.class_code,
      class_name: row.class_name,
      grade_level: row.grade_level ?? null,
      is_active: true,
    }));
  } catch (err) {
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
export async function listSchoolSubjects(schoolId: string): Promise<SchoolSubject[]> {
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
  } catch (err) {
    console.error('Exception fetching school subjects:', err);
    return [];
  }
}

/**
 * Create a new subject
 */
export async function createSchoolSubject(
  schoolId: string,
  name: string,
  code?: string
): Promise<{ success: boolean; error?: string; subject?: SchoolSubject }> {
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
  } catch (err) {
    console.error('Exception creating subject:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Update a subject
 */
export async function updateSchoolSubject(
  subjectId: string,
  updates: { name?: string; code?: string; is_active?: boolean },
  schoolId?: string
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception updating subject:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Delete (soft delete) a subject
 */
export async function deleteSchoolSubject(subjectId: string, schoolId?: string): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception deleting subject:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * List members via new RPC (with search)
 */
export async function listMembersViaRPC(search?: string): Promise<Array<{
  user_id: string;
  username: string;
  email: string;
  role_in_school: string;
  status: string;
  batch: string | null;
}>> {
  try {
    const { data, error } = await supabase.rpc('school_admin_list_members', {
      p_search: search || null,
    });

    if (error) {
      console.error('Error listing members via RPC:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception listing members via RPC:', err);
    return [];
  }
}

/**
 * Set member role via RPC (student/teacher)
 */
export async function setMemberRoleViaRPC(
  memberUserId: string,
  newRole: 'student' | 'teacher'
): Promise<{ success: boolean; error?: string }> {
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
      return data as { success: boolean; error?: string };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception setting member role via RPC:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Move student to class via RPC
 */
export async function moveStudentToClassViaRPC(
  studentId: string,
  classId: string,
  fromClassId: string | null = null
): Promise<{ success: boolean; error?: string; message?: string; grade?: string | number | null; batch?: string | null }> {
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
      return data as { success: boolean; error?: string; message?: string; grade?: string | number | null; batch?: string | null };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception moving student via RPC:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export interface ReviewedPlacementResult {
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  historyId?: string;
  classId?: string;
  classCode?: string;
  grade?: string | number | null;
  batch?: string | null;
  changed?: number;
  skipped?: number;
}

export async function transferStudentPlacement(input: {
  schoolId: string;
  studentId: string;
  expectedFromClassId: string | null;
  toClassId: string;
  reason: string;
  effectiveDate: string;
  exceptionId?: string | null;
}): Promise<ReviewedPlacementResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_transfer_student_placement', {
    p_school_id: input.schoolId,
    p_student_id: input.studentId,
    p_expected_from_class_id: input.expectedFromClassId,
    p_to_class_id: input.toClassId,
    p_reason: input.reason,
    p_effective_date: input.effectiveDate,
    p_exception_id: input.exceptionId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return (data as ReviewedPlacementResult) ?? { success: false, error: 'No placement response was returned.' };
}

export async function unassignStudentPlacement(input: {
  schoolId: string;
  studentId: string;
  expectedFromClassId: string;
  reason: string;
  effectiveDate: string;
  exceptionId?: string | null;
}): Promise<ReviewedPlacementResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_unassign_student_placement', {
    p_school_id: input.schoolId,
    p_student_id: input.studentId,
    p_expected_from_class_id: input.expectedFromClassId,
    p_reason: input.reason,
    p_effective_date: input.effectiveDate,
    p_exception_id: input.exceptionId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return (data as ReviewedPlacementResult) ?? { success: false, error: 'No placement response was returned.' };
}

export async function bulkTransferStudentPlacements(input: {
  schoolId: string;
  studentIds: string[];
  toClassId: string;
  reason: string;
  effectiveDate: string;
}): Promise<ReviewedPlacementResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_bulk_transfer_student_placements', {
    p_school_id: input.schoolId,
    p_student_ids: input.studentIds,
    p_to_class_id: input.toClassId,
    p_reason: input.reason,
    p_effective_date: input.effectiveDate,
  });
  if (error) return { success: false, error: error.message };
  return (data as ReviewedPlacementResult) ?? { success: false, error: 'No placement response was returned.' };
}

export interface PlacementException {
  id: string;
  studentUserId: string;
  issueCode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved';
  observedClassId: string | null;
  expectedClassId: string | null;
  evidence: Record<string, unknown>;
  openedAt: string;
}

export interface StudentPlacementReview {
  error?: string;
  studentUserId?: string;
  displayName?: string;
  currentClassId?: string | null;
  currentClassCode?: string | null;
  currentGrade?: string | number | null;
  history?: Array<{
    id: string;
    eventType: string;
    fromClassCode: string | null;
    toClassCode: string | null;
    reason: string;
    effectiveDate: string;
    recordedAt: string;
  }>;
}

export async function refreshPlacementExceptions(schoolId: string): Promise<ReviewedPlacementResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_refresh_placement_exceptions', { p_school_id: schoolId });
  if (error) return { success: false, error: error.message };
  return (data as ReviewedPlacementResult) ?? { success: true };
}

export async function listPlacementExceptions(schoolId: string): Promise<PlacementException[]> {
  const { data, error } = await supabase.rpc('rpc_school_admin_list_placement_exceptions', { p_school_id: schoolId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data as PlacementException[] : [];
}

export async function getStudentPlacementReview(schoolId: string, studentId: string): Promise<StudentPlacementReview> {
  const { data, error } = await supabase.rpc('rpc_school_admin_get_student_placement_review', {
    p_school_id: schoolId,
    p_student_id: studentId,
  });
  if (error) throw new Error(error.message);
  return (data as StudentPlacementReview) ?? { error: 'student_not_found' };
}

// ============================================
// Class Roster Management Functions
// ============================================

export interface ClassRosterStudent {
  student_id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  grade: string;
  batch: string;
  level: number;
  xp: number;
  last_seen: string | null;
  is_banned: boolean;
  enrolled_at: string;
}

export interface ClassWithRosterInfo {
  class_id: string;
  class_code: string;
  class_name: string;
  grade_level: string | null;
  is_active: boolean;
  student_count: number;
  teacher_count: number;
}

export interface ClassStatistics {
  success: boolean;
  class_id: string;
  class_code: string;
  class_name: string;
  grade_level: string | null;
  student_count: number;
  teacher_count: number;
  avg_level: number;
  avg_xp: number;
  total_xp: number;
  teachers: Array<{ user_id: string; username: string; subject: string }>;
  error?: string;
}

/**
 * Get all students enrolled in a specific class
 */
export async function getClassRoster(classId: string): Promise<ClassRosterStudent[]> {
  try {
    const { data, error } = await supabase.rpc('get_class_roster', {
      p_class_id: classId,
    });

    if (error) {
      console.error('Error fetching class roster:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
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
  } catch (err) {
    console.error('Exception fetching class roster:', err);
    return [];
  }
}

/**
 * Get all classes in a school with student and teacher counts
 */
export async function getSchoolClassRosters(schoolId: string): Promise<ClassWithRosterInfo[]> {
  try {
    const { data, error } = await supabase.rpc('get_school_class_rosters', {
      p_school_id: schoolId,
    });

    if (error) {
      console.error('Error fetching school class rosters:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      class_id: row.class_id,
      class_code: row.class_code,
      class_name: row.class_name,
      grade_level: row.grade_level,
      is_active: !!row.is_active,
      student_count: Number(row.student_count || 0),
      teacher_count: Number(row.teacher_count || 0),
    }));
  } catch (err) {
    console.error('Exception fetching school class rosters:', err);
    return [];
  }
}

/**
 * Get students who are not enrolled in any class
 */
export async function getUnassignedStudents(schoolId: string): Promise<ClassRosterStudent[]> {
  try {
    const { data, error } = await supabase.rpc('get_unassigned_students', {
      p_school_id: schoolId,
    });

    if (error) {
      console.error('Error fetching unassigned students:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
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
  } catch (err) {
    console.error('Exception fetching unassigned students:', err);
    return [];
  }
}

/**
 * Add a student to a class
 */
export async function addStudentToClass(
  classId: string,
  studentId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('add_student_to_class', {
      p_class_id: classId,
      p_student_id: studentId,
    });

    if (error) {
      console.error('Error adding student to class:', error);
      return { success: false, error: error.message };
    }

    return data as { success: boolean; error?: string; message?: string };
  } catch (err) {
    console.error('Exception adding student to class:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Remove a student from a class
 */
export async function removeStudentFromClass(
  classId: string,
  studentId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('remove_student_from_class', {
      p_class_id: classId,
      p_student_id: studentId,
    });

    if (error) {
      console.error('Error removing student from class:', error);
      return { success: false, error: error.message };
    }

    return data as { success: boolean; error?: string; message?: string };
  } catch (err) {
    console.error('Exception removing student from class:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Move a student from one class to another
 */
export async function moveStudentBetweenClasses(
  studentId: string,
  fromClassId: string | null,
  toClassId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
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

    return data as { success: boolean; error?: string; message?: string };
  } catch (err) {
    console.error('Exception moving student between classes:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Bulk add students to a class
 */
export async function bulkAddStudentsToClass(
  classId: string,
  studentIds: string[]
): Promise<{ success: boolean; added?: number; skipped?: number; error?: string; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('bulk_add_students_to_class', {
      p_class_id: classId,
      p_student_ids: studentIds,
    });

    if (error) {
      console.error('Error bulk adding students to class:', error);
      return { success: false, error: error.message };
    }

    return data as { success: boolean; added?: number; skipped?: number; error?: string; message?: string };
  } catch (err) {
    console.error('Exception bulk adding students to class:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Bulk remove students from a class
 */
export async function bulkRemoveStudentsFromClass(
  classId: string,
  studentIds: string[]
): Promise<{ success: boolean; removed?: number; error?: string; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('bulk_remove_students_from_class', {
      p_class_id: classId,
      p_student_ids: studentIds,
    });

    if (error) {
      console.error('Error bulk removing students from class:', error);
      return { success: false, error: error.message };
    }

    return data as { success: boolean; removed?: number; error?: string; message?: string };
  } catch (err) {
    console.error('Exception bulk removing students from class:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get detailed statistics for a class
 */
export async function getClassStatistics(classId: string): Promise<ClassStatistics | null> {
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

    return data as ClassStatistics;
  } catch (err) {
    console.error('Exception fetching class statistics:', err);
    return null;
  }
}

/**
 * Auto-enroll students by grade level
 */
export async function autoEnrollStudentsByGrade(
  classId: string
): Promise<{ success: boolean; enrolled?: number; error?: string; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('auto_enroll_students_by_grade', {
      p_class_id: classId,
    });

    if (error) {
      console.error('Error auto-enrolling students:', error);
      return { success: false, error: error.message };
    }

    return data as { success: boolean; enrolled?: number; error?: string; message?: string };
  } catch (err) {
    console.error('Exception auto-enrolling students:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================
// MODERATION — Time-limited suspension,
// force profile change, audit log
// ============================================

export interface ModerationLogEntry {
  id: number;
  actor_id: string;
  actor_username: string;
  action: string;
  target_type: string;
  target_id: string;
  target_username: string;
  details: Record<string, any>;
  created_at: string;
}

export interface StudentModStatus {
  user_id: string;
  username: string;
  is_banned: boolean;
  banned_until: string | null;
  required_changes: Record<string, any> | null;
  profile_locked: boolean;
  mod_status: 'permanently_banned' | 'suspended' | 'profile_change_required' | 'clear';
}

/**
 * Suspend a student for a limited time (1–720 hours).
 */
export async function suspendStudent(
  studentId: string,
  durationHours: number,
  reason?: string
): Promise<{ success: boolean; banned_until?: string; error?: string }> {
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
  } catch (err) {
    console.error('Exception suspending student:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Remove a student's time-limited suspension early.
 */
export async function unsuspendStudent(
  studentId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception unsuspending student:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Require a student to change their username and/or avatar.
 */
export async function forceProfileChange(
  studentId: string,
  changes: { username?: boolean; avatar?: boolean },
  reason?: string
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception forcing profile change:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Clear a student's required profile changes (admin or student can call).
 */
export async function clearProfileChange(
  studentId: string
): Promise<{ success: boolean; error?: string }> {
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
  } catch (err) {
    console.error('Exception clearing profile change:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get the moderation audit log for the school admin's school.
 */
export async function getModerationLog(
  limit = 50,
  offset = 0
): Promise<{ entries: ModerationLogEntry[]; error?: string }> {
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

    return { entries: (data.entries || []) as ModerationLogEntry[] };
  } catch (err) {
    console.error('Exception fetching moderation log:', err);
    return { entries: [], error: 'An unexpected error occurred' };
  }
}

/**
 * Get a student's current moderation status.
 */
export async function getStudentModStatus(
  studentId: string
): Promise<StudentModStatus | null> {
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
    } as StudentModStatus;
  } catch (err) {
    console.error('Exception fetching student mod status:', err);
    return null;
  }
}
