import { supabase } from './supabaseClient.js';

export interface SchoolHeadLearningSummary {
  students: number;
  students_with_learning_memory: number;
  students_with_persistent_focus: number;
  students_improving: number;
  students_with_resolved_areas: number;
  students_with_consistent_strengths: number;
  persistent_focus_areas: number;
  stale_persistent_areas: number;
  recent_evidence_items: number;
  period_assignment_average: number | null;
  period_completed_assignments: number;
}

export interface SchoolHeadSubjectLearningRow {
  subject: string;
  students_tracked: number;
  assignment_average: number | null;
  completed_assignments: number;
  persistent_areas: number;
  persistent_students: number;
  improving_students: number;
  resolved_students: number;
  strength_areas: number;
  latest_evidence_at: string | null;
}

export interface SchoolHeadClassLearningRow {
  class_id: string;
  class_name: string;
  student_count: number;
  tracked_students: number;
  assignment_average: number | null;
  persistent_students: number;
  improving_students: number;
  resolved_students: number;
  persistent_areas: number;
  high_priority_areas: number;
}

export interface SchoolHeadPrioritySkill {
  subject: string;
  topic: string | null;
  skill: string;
  persistent_students: number;
  recurring_students: number;
  improving_students: number;
  first_observed_at: string | null;
  last_observed_at: string | null;
  average_latest_evidence: number | null;
  stale_persistent_students: number;
}

export interface SchoolHeadSupportStudent {
  student_id: string;
  student_name: string;
  class_name: string;
  grade: string | number | null;
  persistent_count: number;
  recurring_count: number;
  improving_count: number;
  resolved_count: number;
  strength_count: number;
  latest_evidence_at: string | null;
  earliest_persistent_at: string | null;
  focus_subjects: string[];
}

export interface SchoolHeadStrengthSkill {
  subject: string;
  topic: string | null;
  skill: string;
  students: number;
}

export interface SchoolHeadLearningIntelligence {
  success: true;
  school_id: string;
  period: { days: number; start: string; end: string };
  summary: SchoolHeadLearningSummary;
  subjects: SchoolHeadSubjectLearningRow[];
  classes: SchoolHeadClassLearningRow[];
  priority_skills: SchoolHeadPrioritySkill[];
  students_needing_support: SchoolHeadSupportStudent[];
  school_strengths: SchoolHeadStrengthSkill[];
  generated_at: string;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const numberValue = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableNumber = (value: unknown): number | null => value === null || value === undefined || value === '' ? null : numberValue(value);
const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';

export const normalizeSchoolHeadLearningIntelligence = (value: unknown): SchoolHeadLearningIntelligence | null => {
  const root = asRecord(value);
  if (root['success'] !== true || !stringValue(root['school_id'])) return null;
  const period = asRecord(root['period']);
  const summary = asRecord(root['summary']);
  const mapArray = <T>(key: string, mapper: (record: Record<string, unknown>) => T): T[] => Array.isArray(root[key]) ? (root[key] as unknown[]).map((item) => mapper(asRecord(item))) : [];

  return {
    success: true,
    school_id: stringValue(root['school_id']),
    period: { days: numberValue(period['days']), start: stringValue(period['start']), end: stringValue(period['end']) },
    summary: {
      students: numberValue(summary['students']),
      students_with_learning_memory: numberValue(summary['students_with_learning_memory']),
      students_with_persistent_focus: numberValue(summary['students_with_persistent_focus']),
      students_improving: numberValue(summary['students_improving']),
      students_with_resolved_areas: numberValue(summary['students_with_resolved_areas']),
      students_with_consistent_strengths: numberValue(summary['students_with_consistent_strengths']),
      persistent_focus_areas: numberValue(summary['persistent_focus_areas']),
      stale_persistent_areas: numberValue(summary['stale_persistent_areas']),
      recent_evidence_items: numberValue(summary['recent_evidence_items']),
      period_assignment_average: nullableNumber(summary['period_assignment_average']),
      period_completed_assignments: numberValue(summary['period_completed_assignments']),
    },
    subjects: mapArray('subjects', (r) => ({
      subject: stringValue(r['subject']), students_tracked: numberValue(r['students_tracked']), assignment_average: nullableNumber(r['assignment_average']), completed_assignments: numberValue(r['completed_assignments']), persistent_areas: numberValue(r['persistent_areas']), persistent_students: numberValue(r['persistent_students']), improving_students: numberValue(r['improving_students']), resolved_students: numberValue(r['resolved_students']), strength_areas: numberValue(r['strength_areas']), latest_evidence_at: stringValue(r['latest_evidence_at']) || null,
    })),
    classes: mapArray('classes', (r) => ({
      class_id: stringValue(r['class_id']), class_name: stringValue(r['class_name']), student_count: numberValue(r['student_count']), tracked_students: numberValue(r['tracked_students']), assignment_average: nullableNumber(r['assignment_average']), persistent_students: numberValue(r['persistent_students']), improving_students: numberValue(r['improving_students']), resolved_students: numberValue(r['resolved_students']), persistent_areas: numberValue(r['persistent_areas']), high_priority_areas: numberValue(r['high_priority_areas']),
    })),
    priority_skills: mapArray('priority_skills', (r) => ({
      subject: stringValue(r['subject']), topic: stringValue(r['topic']) || null, skill: stringValue(r['skill']), persistent_students: numberValue(r['persistent_students']), recurring_students: numberValue(r['recurring_students']), improving_students: numberValue(r['improving_students']), first_observed_at: stringValue(r['first_observed_at']) || null, last_observed_at: stringValue(r['last_observed_at']) || null, average_latest_evidence: nullableNumber(r['average_latest_evidence']), stale_persistent_students: numberValue(r['stale_persistent_students']),
    })),
    students_needing_support: mapArray('students_needing_support', (r) => ({
      student_id: stringValue(r['student_id']), student_name: stringValue(r['student_name']), class_name: stringValue(r['class_name']), grade: r['grade'] as string | number | null, persistent_count: numberValue(r['persistent_count']), recurring_count: numberValue(r['recurring_count']), improving_count: numberValue(r['improving_count']), resolved_count: numberValue(r['resolved_count']), strength_count: numberValue(r['strength_count']), latest_evidence_at: stringValue(r['latest_evidence_at']) || null, earliest_persistent_at: stringValue(r['earliest_persistent_at']) || null, focus_subjects: Array.isArray(r['focus_subjects']) ? (r['focus_subjects'] as unknown[]).filter((item): item is string => typeof item === 'string') : [],
    })),
    school_strengths: mapArray('school_strengths', (r) => ({ subject: stringValue(r['subject']), topic: stringValue(r['topic']) || null, skill: stringValue(r['skill']), students: numberValue(r['students']) })),
    generated_at: stringValue(root['generated_at']),
  };
};

export async function getSchoolHeadLearningIntelligence(schoolId: string, days = 90): Promise<SchoolHeadLearningIntelligence> {
  const { data, error } = await supabase.rpc('school_head_get_learning_intelligence', { p_school_id: schoolId, p_days: days });
  if (error) throw new Error(error.message || 'Academic learning intelligence could not be loaded.');
  const normalized = normalizeSchoolHeadLearningIntelligence(data);
  if (!normalized) throw new Error('Academic learning intelligence returned an invalid response.');
  return normalized;
}
