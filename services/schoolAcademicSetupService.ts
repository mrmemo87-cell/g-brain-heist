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

export interface AcademicRosterReadiness {
  success: boolean;
  ready: boolean;
  code?: string;
  academicYearId: string;
  academicYearName: string;
  academicYearStatus: 'planned' | 'current' | 'closed';
  activeStudentMembers: number;
  placedStudents: number;
  estimatedEnrolments: number;
  confirmedEnrolments: number;
  unplacedStudentIds: string[];
  roleMismatchStudentIds: string[];
  multipleEnrolmentStudentIds: string[];
  confirmedPlacementMismatchStudentIds: string[];
}

export interface AcademicRosterConfirmationResult {
  success: boolean;
  ready?: boolean;
  code?: string;
  academicYearId?: string;
  updatedEstimated?: number;
  insertedMissing?: number;
  confirmedEnrolments?: number;
}

export type SchoolAcademicSystem = 'cambridge' | 'american';

const assertSuccess = <T extends { success?: boolean; code?: string }>(value: T | null, fallback: string): T => {
  if (!value?.success) throw new Error(value?.code || fallback);
  return value;
};

export async function fetchSchoolAcademicSetup(schoolId: string): Promise<SchoolAcademicSetup> {
  const { data, error } = await supabase.rpc('rpc_school_admin_academic_setup', { p_school_id: schoolId });
  if (error) throw userFacingError(error, 'We could not load the academic setup just now.');
  return assertSuccess(data as SchoolAcademicSetup | null, 'academic_setup_unavailable');
}

export async function fetchSchoolAcademicSystem(schoolId: string): Promise<SchoolAcademicSystem | null> {
  const { data, error } = await supabase.rpc('rpc_school_admin_academic_system', {
    p_school_id: schoolId,
    p_system_code: null,
  });
  if (error) throw userFacingError(error, 'We could not load the school system.');
  const result = assertSuccess(data as { success?: boolean; systemCode?: SchoolAcademicSystem; code?: string } | null, 'academic_system_unavailable');
  return result.systemCode === 'american' || result.systemCode === 'cambridge' ? result.systemCode : null;
}

export async function saveSchoolAcademicSystem(schoolId: string, systemCode: SchoolAcademicSystem): Promise<void> {
  const { data, error } = await supabase.rpc('rpc_school_admin_academic_system', {
    p_school_id: schoolId,
    p_system_code: systemCode,
  });
  if (error) throw userFacingError(error, 'We could not save the school system.');
  assertSuccess(data as { success?: boolean; code?: string } | null, 'academic_system_not_saved');
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

export async function ensureGradeClass(input: {
  schoolId: string;
  gradeLevel: number;
  existingClasses: Array<{ id: string; class_code?: string; grade_level?: number | string | null; is_active?: boolean }>;
}): Promise<{ created: boolean; classId?: string }> {
  const existing = input.existingClasses.find((schoolClass) => (
    schoolClass.is_active !== false && Number(schoolClass.grade_level) === input.gradeLevel
  ));
  if (existing) return { created: false, classId: existing.id };

  const usedCodes = new Set(input.existingClasses.map((schoolClass) => String(schoolClass.class_code || '').toUpperCase()));
  const baseCode = `G${input.gradeLevel}`;
  let classCode = baseCode;
  let suffixIndex = 0;
  while (usedCodes.has(classCode.toUpperCase())) {
    suffixIndex += 1;
    classCode = suffixIndex <= 26
      ? `${baseCode}-${String.fromCharCode(64 + suffixIndex)}`
      : `${baseCode}-${suffixIndex}`;
  }

  const { data, error } = await supabase.rpc('school_admin_save_class', {
    p_school_id: input.schoolId,
    p_class_id: null,
    p_class_code: classCode,
    p_class_name: `Grade ${input.gradeLevel}`,
    p_grade_level: input.gradeLevel,
    p_is_active: true,
  });
  if (error) throw userFacingError(error, 'The grade plan was saved, but its default class could not be created.');
  const result = data as { success?: boolean; id?: string; error?: string } | null;
  if (!result?.success) throw new Error(result?.error || 'default_grade_class_not_created');
  return { created: true, classId: result.id };
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

export async function fetchAcademicRosterReadiness(schoolId: string, academicYearId: string): Promise<AcademicRosterReadiness> {
  const { data, error } = await supabase.rpc('rpc_school_admin_academic_roster_readiness', {
    p_school_id: schoolId,
    p_academic_year_id: academicYearId,
  });
  if (error) throw userFacingError(error, 'We could not check the academic roster just now.');
  return assertSuccess(data as AcademicRosterReadiness | null, 'academic_roster_readiness_unavailable');
}

export async function confirmAcademicRoster(schoolId: string, academicYearId: string): Promise<AcademicRosterConfirmationResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_confirm_academic_roster', {
    p_school_id: schoolId,
    p_academic_year_id: academicYearId,
  });
  if (error) throw userFacingError(error, 'We could not confirm the academic roster.');
  return assertSuccess(data as AcademicRosterConfirmationResult | null, 'academic_roster_not_confirmed');
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
