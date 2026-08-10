import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type AcademicProgressViewerRole = 'student' | 'teacher' | 'school_admin' | 'school_head';

export interface AcademicProgressExperienceContext {
  viewer: { id: string; name: string; role: AcademicProgressViewerRole };
  school: { id: string; name: string; logo_url?: string | null };
}

export async function getAcademicProgressExperienceContext(studentId?: string | null): Promise<AcademicProgressExperienceContext> {
  const { data, error } = await supabase.rpc('rpc_academic_progress_experience_context', { p_student_id: studentId ?? null });
  if (error) throw userFacingError(error, 'We could not prepare this school progress workspace just now. Please try again.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('We could not prepare this school progress workspace just now. Please refresh and try again.');
  }
  return data as AcademicProgressExperienceContext;
}

export function academicProgressBackDestination(role?: AcademicProgressViewerRole | null): { label: string; href: string } {
  switch (role) {
    case 'school_admin': return { label: 'Back to School Administration', href: '/?view=school_admin' };
    case 'school_head': return { label: 'Back to Academic Performance', href: '/?view=school_head&headTab=academic' };
    case 'student': return { label: 'Back to my dashboard', href: '/' };
    case 'teacher':
    default: return { label: 'Back to Teacher Workspace', href: '/?view=teacher' };
  }
}

export function academicProgressViewerLabel(role?: AcademicProgressViewerRole | null): string {
  switch (role) {
    case 'school_admin': return 'School Administration';
    case 'school_head': return 'School Head';
    case 'student': return 'Student Progress';
    case 'teacher':
    default: return 'Teacher Workspace';
  }
}
