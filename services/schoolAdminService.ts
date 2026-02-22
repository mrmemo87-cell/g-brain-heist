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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // First check: user.role = 'school_admin' (highest priority - for teachers assigned as admins)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userError && userData?.role === 'school_admin') {
      console.log('[isSchoolAdmin] User has school_admin role in users table');
      return true;
    }

    // Second check: school_members.role_in_school = 'school_admin'
    const { data: membership, error: memberError } = await supabase
      .from('school_members')
      .select('role_in_school')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!memberError && membership?.role_in_school === 'school_admin') {
      console.log('[isSchoolAdmin] User has school_admin role in school_members table');
      return true;
    }

    return false;
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
      p_name: updates.name || null,
      p_code: updates.code || null,
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
  grade?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('school_admin_move_student_to_class', {
      p_student_id: studentId,
      p_class_id: classId,
      p_grade: grade || null,
    });

    if (error) {
      console.error('Error moving student via RPC:', error);
      return { success: false, error: error.message };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      return data as { success: boolean; error?: string };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception moving student via RPC:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
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
