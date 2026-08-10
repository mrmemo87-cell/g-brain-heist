import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type LearningStatus =
  | 'new_focus'
  | 'recurring'
  | 'persistent'
  | 'improving'
  | 'resolved'
  | 'emerging_strength'
  | 'consistent_strength';

export type LearningTrend = 'declining' | 'stable' | 'improving' | 'resolved' | 'strong';
export type LearningPriority = 'high' | 'medium' | 'low';
export type LearningObservationType = 'focus' | 'developing' | 'strength';

export interface StudentAcademicProfile {
  student: { id: string; name: string; username?: string | null; grade?: string | number | null; class_name?: string | null; school_id?: string | null };
  scope: { subject?: string | null; date_from?: string | null; date_to?: string | null; viewer: 'student' | 'teacher' | 'school_admin' | 'school_head'; allowed_subjects: string[] };
  summary: { subjects_tracked: number; completed_assignments: number; assignment_average: number | null; persistent_focus_count: number; recurring_focus_count: number; improving_count: number; resolved_count: number; strength_count: number };
  subjects: Array<{ subject: string; assignment_average: number | null; completed_assignments: number; persistent_focus_count: number; improving_count: number; resolved_count: number; strength_count: number; latest_evidence_at?: string | null }>;
  assignments: Array<{ assignment_id: string; title: string; subject: string; topic?: string | null; class_name?: string | null; assigned_at?: string | null; due_at?: string | null; completed_at: string; score: number; accuracy: number; correct: number; incorrect: number; time_taken_seconds?: number | null }>;
  focus_areas: Array<{ subject: string; topic?: string | null; skill: string; subskill?: string | null; skill_key: string; status: LearningStatus; trend: LearningTrend; priority: LearningPriority; first_observed_at: string; last_observed_at: string; focus_occurrences: number; developing_occurrences: number; strength_occurrences: number; latest_evidence_percentage?: number | null; evidence_items: number; evidence_occurrences: number }>;
  timeline: Array<{ id: string; subject: string; topic?: string | null; skill: string; subskill?: string | null; observation_type: LearningObservationType; source_type: 'assignment_result' | 'writing_attempt' | 'teacher_observation' | 'import'; source_id?: string | null; observed_at: string; evidence_percentage?: number | null; evidence_count: number; evidence_quality?: 'provisional' | 'standard' | 'strong' | null; contributes_to_focus_state?: boolean; evidence?: Record<string, unknown> }>;
}

export interface StudentAcademicProfileQuery { studentId?: string | null; subject?: string | null; dateFrom?: string | null; dateTo?: string | null }

const emptyProfile = (): StudentAcademicProfile => ({
  student: { id: '', name: '' },
  scope: { viewer: 'student', allowed_subjects: [] },
  summary: { subjects_tracked: 0, completed_assignments: 0, assignment_average: null, persistent_focus_count: 0, recurring_focus_count: 0, improving_count: 0, resolved_count: 0, strength_count: 0 },
  subjects: [], assignments: [], focus_areas: [], timeline: [],
});

export const fetchStudentAcademicProfile = async (query: StudentAcademicProfileQuery = {}): Promise<StudentAcademicProfile> => {
  const { data, error } = await supabase.rpc('rpc_student_academic_profile', {
    p_student_id: query.studentId ?? null,
    p_subject: query.subject ?? null,
    p_date_from: query.dateFrom ?? null,
    p_date_to: query.dateTo ?? null,
  });
  if (error) throw userFacingError(error, 'We could not open this student’s progress just now. Please try again.');
  if (!data || typeof data !== 'object') return emptyProfile();
  return data as StudentAcademicProfile;
};

export const formatLearningStatus = (status: LearningStatus): string => {
  switch (status) {
    case 'new_focus': return 'New focus area';
    case 'recurring': return 'Recurring focus area';
    case 'persistent': return 'Persistent focus area';
    case 'improving': return 'Improving';
    case 'resolved': return 'Resolved';
    case 'emerging_strength': return 'Emerging strength';
    case 'consistent_strength': return 'Consistent strength';
  }
};
