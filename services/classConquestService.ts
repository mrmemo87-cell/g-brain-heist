import { supabase } from './supabaseClient';
import type { ConquestClass } from '../src/lib/classConquest';

export interface ClassConquestData {
  grade: string;
  grades: string[];
  week_start: string;
  today: string;
  days_until_reset: number;
  viewer: 'student' | 'teacher';
  classes: ConquestClass[];
}

export type ClassConquestResult =
  | { available: true; data: ClassConquestData }
  | { available: false; reason: string; grades: string[] };

/** This week's Class Conquest for the signed-in student (their grade) or teacher (chosen grade). Never throws. */
export async function fetchClassConquest(grade?: string | null): Promise<ClassConquestResult> {
  try {
    const { data, error } = await supabase.rpc('rpc_get_class_conquest', { p_grade: grade ?? null });
    if (error || !data) return { available: false, reason: 'unavailable', grades: [] };
    if (data.available !== true) return { available: false, reason: String(data.reason || 'unavailable'), grades: data.grades || [] };
    return { available: true, data: { ...data, grades: data.grades || [], classes: data.classes || [] } as ClassConquestData };
  } catch {
    return { available: false, reason: 'unavailable', grades: [] };
  }
}
