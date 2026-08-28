import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export interface TeacherAcademicProfileStudent {
  student_id: string;
  student_name: string;
  username?: string | null;
  class_name?: string | null;
  grade?: string | number | null;
  school_id?: string | null;
  subjects: string[];
}

export const fetchTeacherAcademicProfileStudents = async (
  academicYearId?: string | null,
): Promise<TeacherAcademicProfileStudent[]> => {
  const request = academicYearId
    ? supabase.rpc('rpc_teacher_academic_profile_students_for_year', { p_academic_year_id: academicYearId })
    : supabase.rpc('rpc_teacher_academic_profile_students');
  const { data, error } = await request;
  if (error) throw userFacingError(error, 'We could not open the student progress directory just now. Please try again.');
  if (!Array.isArray(data)) return [];
  return data as TeacherAcademicProfileStudent[];
};
