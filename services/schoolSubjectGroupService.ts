import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type SubjectDeliveryMode = 'by_class' | 'whole_grade' | 'custom_groups';
export type SubjectGroupType = 'class' | 'whole_grade' | 'custom';

export interface SubjectGroupTeacher {
  userId: string;
  name: string;
  canCreate: boolean;
  canGrade: boolean;
}

export interface SchoolSubjectGroup {
  id: string;
  schoolId: string;
  offeringId: string;
  schoolSubjectId: string;
  schoolSubjectName: string;
  academicSubjectId: string | null;
  academicSubjectName: string | null;
  academicSubjectCode: string | null;
  academicYearId: string;
  gradeLevel: string;
  accessMode: 'all_grade' | 'selected';
  deliveryMode: SubjectDeliveryMode;
  name: string;
  groupType: SubjectGroupType;
  registrationClassId: string | null;
  status: 'active' | 'archived';
  studentCount: number;
  teachers: SubjectGroupTeacher[];
}

export interface SubjectGroupRosterStudent {
  student_id: string;
  student_name: string;
  class_id: string;
  class_code: string;
}

async function call<T>(rpc: string, args: Record<string, unknown>, message: string): Promise<T> {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw userFacingError(error, message);
  return data as T;
}

export const fetchSchoolSubjectGroups = (schoolId: string, offeringId?: string) =>
  call<SchoolSubjectGroup[]>('rpc_school_admin_subject_groups', {
    p_school_id: schoolId, p_offering_id: offeringId ?? null,
  }, 'We could not load teaching groups. Please try again.');

export const fetchTeacherTeachingGroups = (schoolId: string) =>
  call<SchoolSubjectGroup[]>('rpc_teacher_teaching_groups', {
    p_school_id: schoolId,
  }, 'We could not load your teaching groups. Please try again.');

export const fetchTeacherTeachingGroupRoster = (schoolId: string, groupId: string) =>
  call<SubjectGroupRosterStudent[]>('rpc_teacher_teaching_group_roster', {
    p_school_id: schoolId, p_group_id: groupId,
  }, 'We could not load this teaching group’s roster. Please try again.');

export const saveSchoolSubjectGroup = (input: {
  schoolId: string; offeringId: string; name: string; groupType: SubjectGroupType;
  registrationClassId?: string | null; groupId?: string | null;
}) => call<string>('rpc_school_admin_save_subject_group', {
  p_school_id: input.schoolId, p_offering_id: input.offeringId, p_name: input.name.trim(),
  p_group_type: input.groupType, p_registration_class_id: input.registrationClassId ?? null,
  p_group_id: input.groupId ?? null,
}, 'We could not save this teaching group. Check its name and registration class.');

export const archiveSchoolSubjectGroup = (schoolId: string, groupId: string) =>
  call<void>('rpc_school_admin_archive_subject_group', {
    p_school_id: schoolId, p_group_id: groupId,
  }, 'We could not archive this teaching group. Please try again.');

export const setSchoolSubjectGroupStudents = (schoolId: string, groupId: string, studentIds: string[]) =>
  call<void>('rpc_school_admin_set_subject_group_students', {
    p_school_id: schoolId, p_group_id: groupId, p_student_ids: studentIds,
  }, 'We could not save the roster. Check that every student is enrolled in this subject and grade.');

export const setSchoolSubjectGroupTeacher = (input: {
  schoolId: string; groupId: string; teacherUserId: string; active: boolean;
  canCreate: boolean; canGrade: boolean;
}) => call<void>('rpc_school_admin_set_subject_group_teacher', {
  p_school_id: input.schoolId, p_group_id: input.groupId, p_teacher_user_id: input.teacherUserId,
  p_active: input.active, p_can_create: input.canCreate, p_can_grade: input.canGrade,
}, 'We could not save this teacher allocation. Check that the teacher has active teaching access.');

export const setSchoolSubjectDelivery = (input: {
  schoolId: string; offeringId: string; deliveryMode: SubjectDeliveryMode; confirmArchive: boolean;
}) => call<void>('rpc_school_admin_set_subject_delivery', {
  p_school_id: input.schoolId, p_offering_id: input.offeringId,
  p_delivery_mode: input.deliveryMode, p_confirm_archive: input.confirmArchive,
}, 'We could not change teaching delivery. Review the offering and confirm any group archival.');
