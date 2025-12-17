import { supabase } from './supabaseClient';
import type { SchoolRole } from '../types';

// ============================================
// Types for School Admin Portal
// ============================================

export interface SchoolStats {
  active_users_7d: number;
  total_students: number;
  total_teachers: number;
  total_admins: number;
  xp_earned_7d: number;
  pending_invites: number;
  used_invites: number;
  banned_members: number;
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

export interface InviteCode {
  id: string;
  code: string;
  role_to_assign: SchoolRole;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  creator_username?: string;
}

export interface SchoolInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, any>;
  allow_student_signup: boolean;
  allow_teacher_signup: boolean;
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
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'school_admin')
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
export async function getCurrentSchool(): Promise<{ school: SchoolInfo; role: SchoolRole } | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('school_members')
      .select(`
        role,
        schools (
          id,
          name,
          slug,
          logo_url,
          settings,
          allow_student_signup,
          allow_teacher_signup
        )
      `)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      console.error('Error fetching current school:', error);
      return null;
    }

    const schoolData = data.schools as any;
    return {
      school: {
        id: schoolData.id,
        name: schoolData.name,
        slug: schoolData.slug,
        logo_url: schoolData.logo_url,
        settings: schoolData.settings || {},
        allow_student_signup: schoolData.allow_student_signup,
        allow_teacher_signup: schoolData.allow_teacher_signup,
      },
      role: data.role as SchoolRole,
    };
  } catch (err) {
    console.error('Exception fetching current school:', err);
    return null;
  }
}

/**
 * Get school admin stats
 */
export async function getSchoolStats(schoolId: string): Promise<SchoolStats | null> {
  try {
    const { data, error } = await supabase.rpc('get_school_admin_stats', {
      p_school_id: schoolId,
    });

    if (error) {
      console.error('Error fetching school stats:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception fetching school stats:', err);
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
    const { data, error } = await supabase.rpc('list_school_members', {
      p_school_id: schoolId,
      p_role_filter: options?.role || null,
      p_search: options?.search || null,
      p_limit: options?.limit || 50,
      p_offset: options?.offset || 0,
    });

    if (error) {
      console.error('Error listing school members:', error);
      return { members: [], total: 0 };
    }

    // The RPC returns an array with total_count embedded
    if (data && data.length > 0) {
      return {
        members: data,
        total: data[0]?.total_count || data.length,
      };
    }

    return { members: [], total: 0 };
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
    const { data, error } = await supabase.rpc('update_school_member_role', {
      p_school_id: schoolId,
      p_target_user_id: targetUserId,
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
      p_target_user_id: targetUserId,
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
    const { data, error } = await supabase.rpc('ban_school_member', {
      p_school_id: schoolId,
      p_target_user_id: targetUserId,
      p_reason: reason || null,
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
    const { data, error } = await supabase.rpc('unban_school_member', {
      p_school_id: schoolId,
      p_target_user_id: targetUserId,
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
 * Generate a new invite code
 */
export async function generateInviteCode(
  schoolId: string,
  roleToAssign: SchoolRole = 'student',
  options?: {
    maxUses?: number;
    expiresInDays?: number;
  }
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('generate_invite_code', {
      p_school_id: schoolId,
      p_role_to_assign: roleToAssign,
      p_max_uses: options?.maxUses || null,
      p_expires_in_days: options?.expiresInDays || 30,
    });

    if (error) {
      console.error('Error generating invite code:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to generate invite code' };
    }

    return { success: true, code: data.code };
  } catch (err) {
    console.error('Exception generating invite code:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * List all invite codes for the school
 */
export async function listInviteCodes(
  schoolId: string,
  includeExpired: boolean = false
): Promise<InviteCode[]> {
  try {
    const { data, error } = await supabase.rpc('list_invite_codes', {
      p_school_id: schoolId,
      p_include_expired: includeExpired,
    });

    if (error) {
      console.error('Error listing invite codes:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception listing invite codes:', err);
    return [];
  }
}

/**
 * Revoke an invite code
 */
export async function revokeInviteCode(
  schoolId: string,
  inviteCodeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('revoke_invite_code', {
      p_school_id: schoolId,
      p_invite_code_id: inviteCodeId,
    });

    if (error) {
      console.error('Error revoking invite code:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to revoke invite code' };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception revoking invite code:', err);
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
    const { error } = await supabase
      .from('schools')
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schoolId);

    if (error) {
      console.error('Error updating school settings:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception updating school settings:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
