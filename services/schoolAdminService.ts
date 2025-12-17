import { supabase } from './supabaseClient';
import type { SchoolRole } from '../types';

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
  user_id: string;
  username: string;
  email: string;
  role: SchoolRole;
  avatar_url: string | null;
  grade: number | null;
  batch: string | null;
  level: number;
  xp: number;
  last_seen: string | null;
  is_banned: boolean;
  joined_at: string;
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('school_members')
      .select('role_in_school')
      .eq('user_id', user.id)
      .eq('role_in_school', 'school_admin')
      .maybeSingle();

    if (error) {
      console.error('Error checking school admin status:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('Exception checking school admin status:', err);
    return false;
  }
}

/**
 * Get the user's current school membership
 */
export async function getCurrentSchool(): Promise<SchoolAdminOverview | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get membership first (canonical)
    const { data: membership, error: membershipError } = await supabase
      .from('school_members')
      .select('school_id, role_in_school')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError || !membership?.school_id) {
      console.error('Error fetching current membership:', membershipError);
      return null;
    }

    // Prefer admin RPC (returns school + stats). Requires SCHOOL_ADMIN_FUNCTIONS.sql deployed.
    const { data: details, error: detailsError } = await supabase.rpc('get_school_details', {
      p_school_id: membership.school_id,
    });

    if (detailsError || !details?.success) {
      console.error('Error fetching school details (run SCHOOL_ADMIN_FUNCTIONS.sql):', detailsError || details?.error);

      // Fallback: minimal school info via direct select (no stats)
      const { data: schoolRow, error: schoolError } = await supabase
        .from('schools')
        .select('id, name, slug, logo_url, settings, invite_code')
        .eq('id', membership.school_id)
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
        role: membership.role_in_school as SchoolRole,
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
      role: membership.role_in_school as SchoolRole,
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
    limit?: number;
    offset?: number;
  }
): Promise<{ members: SchoolMember[]; total: number }> {
  try {
    const { data, error } = await supabase.rpc('get_school_members', {
      p_school_id: schoolId,
      p_role_filter: options?.role || null,
      p_search: options?.search || null,
      p_limit: options?.limit || 50,
      p_offset: options?.offset || 0,
    });

    if (error || !data?.success) {
      console.error('Error listing school members:', error || data?.error);
      return { members: [], total: 0 };
    }

    const membersRaw = (data.members || []) as any[];
    const mapped: SchoolMember[] = membersRaw.map((row) => ({
      user_id: row.user_id,
      username: row.username,
      email: row.email,
      role: row.role_in_school as SchoolRole,
      avatar_url: row.avatar_url,
      grade: row.grade,
      batch: row.batch,
      level: row.level ?? 1,
      xp: row.xp ?? 0,
      last_seen: row.last_seen,
      is_banned: !!row.is_banned,
      joined_at: row.joined_at,
    }));

    return { members: mapped, total: Number(data.total || 0) };
  } catch (err) {
    console.error('Exception listing school members:', err);
    return { members: [], total: 0 };
  }
}

/**
 * Update a member's role within the school
 */
export async function updateMemberRole(
  schoolId: string,
  targetUserId: string,
  newRole: SchoolRole
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('update_member_role', {
      p_school_id: schoolId,
      p_member_user_id: targetUserId,
      p_new_role: newRole,
    });

    if (error) {
      console.error('Error updating member role:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to update role' };
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
    allow_student_signup?: boolean;
    allow_teacher_signup?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Name is a column, signup toggles live in settings JSON.
    if (typeof settings.name === 'string') {
      const { data, error } = await supabase.rpc('update_school_info', {
        p_school_id: schoolId,
        p_name: settings.name,
        p_logo_url: null,
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
