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
}

export interface ClassTeacherAssignment {
  id: string;
  school_id: string;
  class_id: string;
  teacher_user_id: string;
  subject: string;
  active: boolean;
}

export interface ClassStudentAssignment {
  class_id: string;
  student_id: string;
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
      .eq('status', 'active')
      .eq('role_in_school', 'school_admin')
      .maybeSingle();

    if (error) {
      console.error('Error checking school admin status:', error);
      // Don't return yet - try fallback
    }

    if (data) return true;

    // Fallback: check users.role column directly
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .eq('role', 'school_admin')
      .maybeSingle();

    if (userError) {
      console.error('Error checking user role for school admin:', userError);
      return false;
    }

    return !!userData;
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

    let schoolId: string | null = null;
    let roleInSchool: SchoolRole = 'student';

    // Try school_members table first (canonical)
    const { data: membership, error: membershipError } = await supabase
      .from('school_members')
      .select('school_id, role_in_school')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!membershipError && membership?.school_id) {
      schoolId = membership.school_id;
      roleInSchool = membership.role_in_school as SchoolRole;
    } else {
      // Fallback: check users table directly
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('school_id, role')
        .eq('id', user.id)
        .maybeSingle();

      if (userError || !userData?.school_id) {
        console.error('Error fetching school from users:', userError);
        return null;
      }

      schoolId = userData.school_id;
      // Map users.role to SchoolRole
      if (userData.role === 'school_admin') {
        roleInSchool = 'school_admin';
      } else if (userData.role === 'teacher') {
        roleInSchool = 'teacher';
      } else {
        roleInSchool = 'student';
      }
    }

    if (!schoolId) {
      console.error('No school_id found for user');
      return null;
    }

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

// ============================================
// School Admin Class + Assignment Tools
// ============================================

export async function listSchoolClasses(schoolId: string): Promise<SchoolClass[]> {
  try {
    const { data, error } = await supabase
      .from('classes')
      .select('id, school_id, class_code, class_name, grade_level, is_active')
      .eq('school_id', schoolId)
      .order('grade_level', { ascending: true })
      .order('class_name', { ascending: true });

    if (error) {
      console.error('Error fetching classes:', error);
      return [];
    }

    return (data || []).map((row) => ({
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
    if (payload.id) {
      const { error } = await supabase
        .from('classes')
        .update({
          class_code: payload.class_code,
          class_name: payload.class_name,
          grade_level: payload.grade_level,
          is_active: payload.is_active,
        })
        .eq('id', payload.id)
        .eq('school_id', schoolId);

      if (error) {
        console.error('Error updating class:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    }

    const { error } = await supabase
      .from('classes')
      .insert({
        school_id: schoolId,
        class_code: payload.class_code,
        class_name: payload.class_name,
        grade_level: payload.grade_level,
        is_active: payload.is_active,
      });

    if (error) {
      console.error('Error creating class:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception saving class:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function listSchoolTeachers(schoolId: string): Promise<SchoolTeacher[]> {
  try {
    const { members } = await listSchoolMembers(schoolId, { role: 'teacher', limit: 200 });
    const teacherIds = members.map((member) => member.user_id);

    if (teacherIds.length === 0) return [];

    const { data: teacherRows, error } = await supabase
      .from('teachers')
      .select('user_id, subject_specializations, verified')
      .in('user_id', teacherIds);

    if (error) {
      console.error('Error fetching teachers table:', error);
    }

    const teacherMap = new Map<string, { subject_specializations: string[]; verified: boolean }>();
    (teacherRows || []).forEach((row) => {
      teacherMap.set(row.user_id, {
        subject_specializations: Array.isArray(row.subject_specializations) ? row.subject_specializations : [],
        verified: !!row.verified,
      });
    });

    return members.map((member) => {
      const teacherMeta = teacherMap.get(member.user_id);
      return {
        user_id: member.user_id,
        username: member.username,
        email: member.email,
        subject_specializations: teacherMeta?.subject_specializations ?? [],
        verified: teacherMeta?.verified ?? false,
      };
    });
  } catch (err) {
    console.error('Exception fetching teachers:', err);
    return [];
  }
}

export async function listTeacherAssignments(schoolId: string): Promise<ClassTeacherAssignment[]> {
  try {
    const { data, error } = await supabase
      .from('class_teacher_assignments')
      .select('id, school_id, class_id, teacher_user_id, subject, active')
      .eq('school_id', schoolId)
      .order('class_id', { ascending: true })
      .order('subject', { ascending: true });

    if (error) {
      console.error('Error fetching teacher assignments:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      school_id: row.school_id,
      class_id: row.class_id,
      teacher_user_id: row.teacher_user_id,
      subject: row.subject,
      active: !!row.active,
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

export async function listClassStudents(classIds: string[]): Promise<ClassStudentAssignment[]> {
  try {
    if (classIds.length === 0) return [];

    const { data, error } = await supabase
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', classIds);

    if (error) {
      console.error('Error fetching class students:', error);
      return [];
    }

    return (data || []).map((row) => ({
      class_id: row.class_id,
      student_id: row.student_id,
    }));
  } catch (err) {
    console.error('Exception fetching class students:', err);
    return [];
  }
}

export async function moveStudentToClass(
  classIds: string[],
  studentId: string,
  newClassId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (classIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('class_students')
        .delete()
        .eq('student_id', studentId)
        .in('class_id', classIds);

      if (deleteError) {
        console.error('Error removing old class assignment:', deleteError);
        return { success: false, error: deleteError.message };
      }
    }

    const { error: insertError } = await supabase
      .from('class_students')
      .insert({ class_id: newClassId, student_id: studentId });

    if (insertError) {
      console.error('Error enrolling student:', insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception moving student:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
