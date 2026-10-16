import { supabase } from './supabaseClient';

export interface TeacherProgrammeEntry { id: string; name: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchTeacherProgrammeEntries(): Promise<TeacherProgrammeEntry[]> {
  const { data, error } = await supabase.rpc('rpc_ielts_teacher_programme_entry');
  if (error || !data || !Array.isArray(data.schools)) throw new Error('IELTS allocation could not be checked.');
  return data.schools.filter((s: unknown): s is TeacherProgrammeEntry => {
    if (!s || typeof s !== 'object') return false;
    const row = s as Record<string, unknown>;
    return typeof row['id'] === 'string' && uuid.test(row['id']) && typeof row['name'] === 'string';
  });
}

export function teacherProgrammeRoute(entry: TeacherProgrammeEntry): string {
  return `/ielts/programme?school=${encodeURIComponent(entry.id)}`;
}
