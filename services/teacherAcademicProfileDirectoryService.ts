import { supabase } from './supabaseClient';

export interface TeacherAcademicProfileStudent {
  student_id: string;
  student_name: string;
  username?: string | null;
  class_name?: string | null;
  grade?: string | number | null;
  school_id?: string | null;
  subjects: string[];
}

export const fetchTeacherAcademicProfileStudents = async (): Promise<TeacherAcademicProfileStudent[]> => {
  const { data, error } = await supabase.rpc('rpc_teacher_academic_profile_students');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data as TeacherAcademicProfileStudent[];
};
