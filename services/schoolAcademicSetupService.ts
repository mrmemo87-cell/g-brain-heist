import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export interface AcademicYearSetup {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'planned' | 'current' | 'closed';
}

export interface AcademicScopeSetup {
  scopeId: string;
  scopeCode: string;
  scopeName: string;
  stageCode: string;
  stageName: string;
  gradeLevel: number;
  objectiveCount: number;
  approvedQuestionCount: number;
}

export interface AcademicFrameworkSubjectSetup {
  academicSubjectId: string;
  code: string;
  name: string;
  category: 'core' | 'additional';
  scopes: AcademicScopeSetup[];
}

export interface AcademicFrameworkSetup {
  id: string;
  code: string;
  name: string;
  providerName: string;
  authorityType: string;
  versionId: string;
  versionCode: string;
  versionName: string;
  subjects: AcademicFrameworkSubjectSetup[];
}

export interface AcademicSubjectOffering {
  mappingId: string;
  academicYearId: string;
  gradeLevel: string;
  academicSubjectId: string;
  subjectName: string;
  scopeId: string;
  subjectRequirement: 'required' | 'elective';
  status: 'planned' | 'active';
  mappingQuality: 'confirmed' | 'estimated';
}

export interface SchoolAcademicSetup {
  success: boolean;
  schoolId: string;
  years: AcademicYearSetup[];
  terms: Array<{ id: string; academicYearId: string; name: string; sequence: number; startsOn: string; endsOn: string }>;
  frameworks: AcademicFrameworkSetup[];
  offerings: AcademicSubjectOffering[];
  electiveEnrolments: Array<{ id: string; studentId: string; academicYearId: string; academicSubjectId: string; subjectName: string; status: 'active' }>;
}

const assertSuccess = <T extends { success?: boolean; code?: string }>(value: T | null, fallback: string): T => {
  if (!value?.success) throw new Error(value?.code || fallback);
  return value;
};

export async function fetchSchoolAcademicSetup(schoolId: string): Promise<SchoolAcademicSetup> {
  const { data, error } = await supabase.rpc('rpc_school_admin_academic_setup', { p_school_id: schoolId });
  if (error) throw userFacingError(error, 'We could not load the academic setup just now.');
  return assertSuccess(data as SchoolAcademicSetup | null, 'academic_setup_unavailable');
}

export async function saveAcademicYear(input: {
  schoolId: string;
  yearId?: string | null;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'planned' | 'current';
}): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_school_admin_upsert_academic_year', {
    p_school_id: input.schoolId,
    p_year_id: input.yearId ?? null,
    p_name: input.name,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_status: input.status,
  });
  if (error) throw userFacingError(error, 'We could not save the academic year.');
  const result = assertSuccess(data as { success?: boolean; academicYearId?: string; code?: string } | null, 'academic_year_not_saved');
  if (!result.academicYearId) throw new Error('academic_year_id_missing');
  return result.academicYearId;
}

export async function saveAcademicTerm(input: {
  schoolId: string;
  academicYearId: string;
  termId?: string | null;
  name: string;
  sequence: number;
  startsOn: string;
  endsOn: string;
}): Promise<void> {
  const { data, error } = await supabase.rpc('rpc_school_admin_upsert_academic_term', {
    p_school_id: input.schoolId,
    p_academic_year_id: input.academicYearId,
    p_term_id: input.termId ?? null,
    p_name: input.name,
    p_sequence_number: input.sequence,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
  });
  if (error) throw userFacingError(error, 'We could not save the academic term.');
  assertSuccess(data as { success?: boolean; code?: string } | null, 'academic_term_not_saved');
}

export async function saveSubjectOfferings(input: {
  schoolId: string;
  academicYearId: string;
  offerings: Array<{
    gradeLevel: string;
    academicSubjectId: string;
    scopeId: string;
    subjectRequirement: 'required' | 'elective';
  }>;
}): Promise<number> {
  const { data, error } = await supabase.rpc('rpc_school_admin_apply_subject_offerings', {
    p_school_id: input.schoolId,
    p_academic_year_id: input.academicYearId,
    p_offerings: input.offerings,
  });
  if (error) throw userFacingError(error, 'We could not save the grade subject plan.');
  const result = assertSuccess(data as { success?: boolean; saved?: number; code?: string } | null, 'subject_offerings_not_saved');
  return result.saved ?? 0;
}

export async function seedCurrentStudentEnrolments(schoolId: string, academicYearId: string): Promise<number> {
  const { data, error } = await supabase.rpc('rpc_school_admin_seed_academic_enrolments', {
    p_school_id: schoolId,
    p_academic_year_id: academicYearId,
  });
  if (error) throw userFacingError(error, 'We could not enrol current students into the academic year.');
  const result = assertSuccess(data as { success?: boolean; inserted?: number; code?: string } | null, 'student_enrolments_not_seeded');
  return result.inserted ?? 0;
}

export async function setStudentElective(input: {
  schoolId: string;
  academicYearId: string;
  studentId: string;
  academicSubjectId: string;
  status?: 'active' | 'withdrawn';
}): Promise<void> {
  const { data, error } = await supabase.rpc('rpc_school_admin_set_student_subject_enrolment', {
    p_school_id: input.schoolId,
    p_academic_year_id: input.academicYearId,
    p_student_id: input.studentId,
    p_academic_subject_id: input.academicSubjectId,
    p_status: input.status || 'active',
  });
  if (error) throw userFacingError(error, 'We could not update the student elective.');
  assertSuccess(data as { success?: boolean; code?: string } | null, 'student_elective_not_saved');
}
