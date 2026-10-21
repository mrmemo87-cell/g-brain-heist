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
