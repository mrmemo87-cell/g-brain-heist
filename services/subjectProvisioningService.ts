import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type SubjectAccessMode = 'all_grade' | 'selected';

export interface SubjectProvisioningOffering {
  mappingId: string;
  schoolSubjectId: string | null;
  academicYearId: string;
  gradeLevel: string;
  academicSubjectId: string;
  canonicalName: string;
  displayName: string;
  scopeId: string;
  accessMode: SubjectAccessMode;
  selectedStudentIds: string[];
  teacherUserIds: string[];
  classIds: string[];
}

export interface SubjectProvisioningState {
  success: boolean;
  offerings: SubjectProvisioningOffering[];
}

export interface ProvisionSchoolSubjectInput {
  schoolId: string;
  academicYearId: string;
  name: string;
  code?: string | null;
  academicSubjectId: string;
  gradeLevel: string;
  scopeId: string;
  accessMode: SubjectAccessMode;
  selectedStudentIds?: string[];
  teacherUserId?: string | null;
  classIds?: string[];
}

export interface ProvisionSchoolSubjectResult {
  success: boolean;
  code?: string;
  detail?: string;
  schoolSubjectId?: string;
  displayName?: string;
  academicSubjectId?: string;
  gradeLevel?: string;
  accessMode?: SubjectAccessMode;
  selectedStudents?: number;
  teacherAllocations?: number;
}

const messageForCode = (code?: string) => {
  switch (code) {
    case 'subject_name_required': return 'Enter a subject name.';
    case 'invalid_grade_level': return 'Choose a valid grade.';
    case 'invalid_subject_access_mode': return 'Choose who should have access to this subject.';
    case 'academic_year_not_found': return 'Choose a current academic year first.';
    case 'offering_scope_does_not_match_grade_subject': return 'That academic mapping is not available for the selected grade.';
    case 'select_at_least_one_student': return 'Select at least one student for this subject.';
    case 'selected_student_not_in_grade': return 'One or more selected students are no longer in this grade. Refresh the roster and try again.';
    case 'teacher_not_available_in_school': return 'Choose an active teacher from this school.';
    case 'class_not_in_selected_grade': return 'One of the selected classes no longer belongs to this grade.';
    case 'teacher_allocation_failed': return 'The subject was prepared, but the teacher allocation could not be saved.';
    default: return code ? code.replaceAll('_', ' ') : 'The subject could not be provisioned.';
  }
};

export async function fetchSubjectProvisioningState(schoolId: string): Promise<SubjectProvisioningState> {
  const { data, error } = await supabase.rpc('rpc_school_admin_subject_provisioning_state', {
    p_school_id: schoolId,
  });
  if (error) throw userFacingError(error, 'We could not load provisioned subjects just now.');
  const payload = data as SubjectProvisioningState | null;
  if (!payload?.success) throw new Error('subject_provisioning_state_unavailable');
  return {
    success: true,
    offerings: Array.isArray(payload.offerings) ? payload.offerings : [],
  };
}

export async function provisionSchoolSubject(input: ProvisionSchoolSubjectInput): Promise<ProvisionSchoolSubjectResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_provision_subject', {
    p_school_id: input.schoolId,
    p_academic_year_id: input.academicYearId,
    p_name: input.name.trim(),
    p_code: input.code?.trim() || null,
    p_academic_subject_id: input.academicSubjectId,
    p_grade_level: input.gradeLevel,
    p_scope_id: input.scopeId,
    p_access_mode: input.accessMode,
    p_selected_student_ids: input.selectedStudentIds || [],
    p_teacher_user_id: input.teacherUserId || null,
    p_class_ids: input.classIds || [],
  });

  if (error) throw userFacingError(error, 'We could not save this subject just now.');
  const payload = data as ProvisionSchoolSubjectResult | null;
  if (!payload?.success) {
    throw new Error(payload?.detail || messageForCode(payload?.code));
  }
  return payload;
}
