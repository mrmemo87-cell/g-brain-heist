import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type FollowUpTab = 'late' | 'low' | 'quiet';
export type FollowUpAction = 'reminder' | 'practice';

export interface FlaggedStudent {
  student_id: string;
  display_name: string;
  tab: FollowUpTab;
  reason: string;
  weak_topic: string | null;
  sort_key: number;
}

/** Students the signed-in teacher should follow up with this week, grouped by tab. */
export async function fetchTeacherFollowUps(): Promise<FlaggedStudent[]> {
  const { data, error } = await supabase.rpc('get_teacher_followups');
  if (error) throw userFacingError(error, 'We could not load this week’s follow-ups. Please try again.');
  return ((data || []) as FlaggedStudent[]).map((row) => ({
    ...row,
    sort_key: Number(row.sort_key) || 0,
  }));
}

/** Follow-ups this teacher has logged since the start of the current week (Monday). */
export async function fetchFollowUpsThisWeek(): Promise<number> {
  const now = new Date();
  const monday = new Date(now);
  const daysSinceMonday = (now.getDay() + 6) % 7;
  monday.setDate(now.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('teacher_followups')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monday.toISOString());

  if (error) throw userFacingError(error, 'We could not load your follow-up count.');
  return count || 0;
}

/**
 * Logs a follow-up for the selected students. Reminders also send each student
 * an in-app message. The database only accepts students it currently flags for
 * this teacher under the given reason. Returns how many were logged.
 */
export async function logTeacherFollowUps(
  students: Array<Pick<FlaggedStudent, 'student_id' | 'weak_topic'>>,
  action: FollowUpAction,
  reason: FollowUpTab,
): Promise<number> {
  const topics: Record<string, string> = {};
  students.forEach((student) => {
    if (student.weak_topic) topics[student.student_id] = student.weak_topic;
  });

  const { data, error } = await supabase.rpc('log_teacher_followups', {
    p_student_ids: students.map((student) => student.student_id),
    p_action: action,
    p_reason: reason,
    p_topics: topics,
  });

  if (error) throw userFacingError(error, 'We could not save this follow-up. Please try again.');
  return Number(data) || 0;
}

export interface PracticeResult {
  student_id: string;
  display_name: string;
  topic: string;
  set_at: string;
  days_practised: number;
  answered: number;
  correct: number;
  last_practised: string | null;
}

export type PracticeStatus = 'waiting' | 'on-track' | 'struggling' | 'practising';

/** How a student is doing on practice the teacher set. Needs 3 answers before judging. */
export function practiceStatus(result: Pick<PracticeResult, 'answered' | 'correct'>): PracticeStatus {
  if (result.answered <= 0) return 'waiting';
  if (result.answered < 3) return 'practising';
  const ratio = result.correct / result.answered;
  if (ratio >= 0.8) return 'on-track';
  if (ratio <= 0.5) return 'struggling';
  return 'practising';
}

/**
 * Daily-mission results on the topics this teacher set in the last 14 days
 * (follow-ups with a weak topic, or support plans they created). Practice only:
 * it never changes the student's academic profile. Returns [] when the feature
 * is not available yet so the rest of the page still works.
 */
export async function fetchPracticeResults(): Promise<PracticeResult[]> {
  const { data, error } = await supabase.rpc('rpc_get_teacher_practice_results');
  if (error) return [];
  return ((data || []) as PracticeResult[]).map((row) => ({
    ...row,
    days_practised: Number(row.days_practised) || 0,
    answered: Number(row.answered) || 0,
    correct: Number(row.correct) || 0,
  }));
}
