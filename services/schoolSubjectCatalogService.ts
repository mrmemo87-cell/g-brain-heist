import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type SchoolSubjectAccessMode = 'all_grade' | 'selected';
export type SchoolSubjectMappingStatus = 'mapped' | 'unmapped';

export interface SchoolSubjectOffering {
  id: string;
  academicYearId: string;
  gradeLevel: string;
  curriculumScopeId: string | null;
  accessMode: SchoolSubjectAccessMode;
  status: 'active' | 'archived';
  selectedStudentIds: string[];
  teacherUserIds: string[];
  classIds: string[];
}

export interface SchoolSubjectRecord {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  academicSubjectId: string | null;
  academicSubjectName: string | null;
  mappingStatus: SchoolSubjectMappingStatus;
  mappingRequestStatus: 'pending' | 'resolved' | 'dismissed' | null;
  createdAt: string;
  updatedAt: string;
  offerings: SchoolSubjectOffering[];
}

export interface SchoolSubjectCatalog {
  success: boolean;
  schoolId: string;
  academicYearId: string | null;
  academicYearName: string | null;
  subjects: SchoolSubjectRecord[];
}

export interface SaveSchoolSubjectInput {
  schoolId: string;
  name: string;
  schoolSubjectId?: string | null;
  code?: string | null;
  academicSubjectId?: string | null;
  academicYearId?: string | null;
  gradeLevel?: string | null;
  curriculumScopeId?: string | null;
  accessMode?: SchoolSubjectAccessMode;
  selectedStudentIds?: string[];
  teacherUserId?: string | null;
  classIds?: string[];
  replaceTeacherAllocations?: boolean;
}

export interface SaveSchoolSubjectResult {
  success: boolean;
  code?: string;
  schoolSubjectId?: string;
  offeringId?: string | null;
  name?: string;
  academicSubjectId?: string | null;
  mappingStatus?: SchoolSubjectMappingStatus;
  mappingRequestId?: string | null;
}

const messageForCode = (code?: string) => {
  switch (code) {
    case 'subject_name_required': return 'Enter a subject name.';
    case 'subject_name_already_exists': return 'This school already has a subject with that name.';
    case 'school_subject_not_found': return 'This subject is no longer available. Refresh and try again.';
    case 'academic_subject_not_found': return 'The selected academic mapping is no longer available.';
    case 'academic_mapping_required_for_scope': return 'Choose an academic mapping before selecting curriculum resources.';
    case 'invalid_grade_level': return 'Choose a valid grade.';
    case 'academic_year_not_found': return 'Choose a valid academic year.';
    case 'invalid_subject_access_mode': return 'Choose who should have access to this subject.';
    case 'offering_scope_does_not_match_grade_subject': return 'That curriculum is not available for the selected subject and grade.';
    case 'select_at_least_one_student': return 'Select at least one student.';
    case 'selected_student_not_in_grade': return 'One or more selected students are no longer in this grade. Refresh the roster and try again.';
    case 'teacher_not_available_in_school': return 'Choose an active member with teaching access.';
    case 'teacher_class_required': return 'Choose at least one class for the teacher.';
    case 'class_not_in_selected_grade': return 'One of the selected classes is no longer in this grade.';
    case 'teacher_allocation_failed': return 'The subject could not be saved because the teacher allocation failed.';
    default: return code ? code.replaceAll('_', ' ') : 'The subject could not be saved.';
  }
};

export async function fetchSchoolSubjectCatalog(
  schoolId: string,
  includeArchived = false,
): Promise<SchoolSubjectCatalog> {
  const { data, error } = await supabase.rpc('rpc_school_admin_subject_catalog', {
    p_school_id: schoolId,
    p_include_archived: includeArchived,
  });
  if (error) throw userFacingError(error, 'We could not load the school subject catalogue just now.');
  const payload = data as SchoolSubjectCatalog | null;
  if (!payload?.success) throw new Error('school_subject_catalog_unavailable');
  return {
    ...payload,
    subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
  };
}

export async function saveSchoolSubject(input: SaveSchoolSubjectInput): Promise<SaveSchoolSubjectResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_save_school_subject', {
    p_school_id: input.schoolId,
    p_name: input.name.trim(),
    p_school_subject_id: input.schoolSubjectId || null,
    p_code: input.code?.trim() || null,
    p_academic_subject_id: input.academicSubjectId || null,
    p_academic_year_id: input.academicYearId || null,
    p_grade_level: input.gradeLevel || null,
    p_curriculum_scope_id: input.curriculumScopeId || null,
    p_access_mode: input.accessMode || 'all_grade',
    p_selected_student_ids: input.selectedStudentIds || [],
    p_teacher_user_id: input.teacherUserId || null,
    p_class_ids: input.classIds || [],
    p_replace_teacher_allocations: input.replaceTeacherAllocations === true,
  });
  if (error) throw userFacingError(error, 'We could not save this school subject just now.');
  const payload = data as SaveSchoolSubjectResult | null;
  if (!payload?.success) throw new Error(messageForCode(payload?.code));
  return payload;
}

export async function deleteSchoolSubject(
  schoolId: string,
  schoolSubjectId: string,
): Promise<{ success: boolean; historyPreserved?: boolean; name?: string }> {
  const { data, error } = await supabase.rpc('rpc_school_admin_delete_school_subject', {
    p_school_id: schoolId,
    p_school_subject_id: schoolSubjectId,
  });
  if (error) throw userFacingError(error, 'We could not remove this subject just now.');
  const payload = data as { success?: boolean; code?: string; historyPreserved?: boolean; name?: string } | null;
  if (!payload?.success) throw new Error(messageForCode(payload?.code));
  return { success: true, historyPreserved: payload.historyPreserved, name: payload.name };
}

export interface SubjectMappingRequest {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolSubjectId: string;
  subjectName: string;
  subjectCode: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  requestedBy: string | null;
  requestedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export async function fetchSubjectMappingRequests(
  status: 'pending' | 'resolved' | 'dismissed' | 'all' = 'pending',
): Promise<SubjectMappingRequest[]> {
  const { data, error } = await supabase.rpc('rpc_superadmin_subject_mapping_requests', { p_status: status });
  if (error) throw userFacingError(error, 'We could not load academic mapping requests just now.');
  const payload = data as { success?: boolean; requests?: SubjectMappingRequest[] } | null;
  if (!payload?.success) throw new Error('subject_mapping_requests_unavailable');
  return Array.isArray(payload.requests) ? payload.requests : [];
}
