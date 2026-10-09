import { supabase } from './supabaseClient';
export interface PracticeHistoryRow {
  row_id: string; kind: 'targeted' | 'school'; assignment_id: string; student_id: string;
  student_name: string; class_id: string | null; class_name: string | null;
  material_type: string; material_id: string; material_version: string | null;
  title: string; assignment_title: string; skill: string; status: string;
  assignment_status: string; feedback_status: 'shared' | 'pending' | 'not_ready' | 'not_tracked';
  assigned_at: string; submitted_at: string | null; feedback_at: string | null; due_at: string | null;
}
export interface MaterialUsage {
  type: string; id: string; assigned_count: number; students_count: number;
  active_count: number; submitted_count: number; completed_count: number; shared_count: number;
  last_assigned_at: string | null; latest_assignment_id: string | null;
}
async function read<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error('Practice history could not load. Check your connection and programme access, then retry.');
  return data as T;
}
export const teacherPracticeHistory = (school: string, filters: {search?: string; skill?: string; kind?: string; status?: string; offset?: number} = {}) =>
  read<{rows: PracticeHistoryRow[]; has_more: boolean}>('rpc_ielts_teacher_practice_history', {
    p_school: school, p_search: filters.search ?? '', p_skill: filters.skill ?? '', p_kind: filters.kind ?? '', p_status: filters.status ?? '', p_offset: filters.offset ?? 0,
  });
export async function teacherMaterialUsage(school: string, items: {type: string; id: string}[], recipient: {student?: string; classId?: string}): Promise<MaterialUsage[]> {
  const rows = await read<MaterialUsage[]>('rpc_ielts_teacher_material_usage', {p_school: school, p_items: items, p_student: recipient.student ?? null, p_class: recipient.classId ?? null});
  if (!Array.isArray(rows) || items.some(i => !rows.some(r => r.type===i.type && r.id===i.id && Number.isInteger(r.assigned_count) && r.assigned_count>=0)))
    throw new Error('Previous assignments could not be confirmed. Retry the history check.');
  return rows;
}
export function materialUsageLabel(u: MaterialUsage): string {
  if (!u.assigned_count) return 'No previous assignment recorded';
  if (u.active_count) return `Already active · ${u.active_count} unfinished assignment${u.active_count === 1 ? '' : 's'}`;
  if (u.submitted_count > u.shared_count) return 'Previously submitted · check review status';
  if (u.shared_count) return 'Previously used · feedback shared';
  if (u.completed_count) return 'Previously completed · repeat for practice';
  return 'Previously assigned · check history';
}
export const practiceWorkLabel = (r: PracticeHistoryRow) => {
  const labels: Record<string, string> = {assigned: 'Not started', in_progress: 'In progress', submitted: 'Submitted', completed: 'Completed', closed: 'Closed', skipped: 'Skipped', excused: 'Excused'};
  return labels[r.status] ?? 'Check status';
};
