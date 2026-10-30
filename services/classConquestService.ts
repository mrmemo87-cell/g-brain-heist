import { supabase } from './supabaseClient';
import type { ConquestClass, ConquestResult } from '../src/lib/classConquest';

/** Last week's frozen result as the live RPC returns it (with viewer-relative flags). */
export interface ConquestLastWeek extends ConquestResult {
  is_my_class: boolean;
  my_rank: number | null;
}

export interface ClassConquestData {
  grade: string;
  grades: string[];
  week_start: string;
  week_end: string;
  today: string;
  days_until_reset: number;
  map_id: string;
  next_map_id: string;
  viewer: 'student' | 'teacher';
  classes: ConquestClass[];
  last_week: ConquestLastWeek | null;
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
    return {
      available: true,
      data: { ...data, grades: data.grades || [], classes: data.classes || [], last_week: data.last_week ?? null } as ClassConquestData,
    };
  } catch {
    return { available: false, reason: 'unavailable', grades: [] };
  }
}

export interface ConquestBadge {
  week_start: string;
  map_id: string;
  class_label: string | null;
  /** gold = finished in the winning class's top five; silver = member of the winning class. */
  kind: 'gold' | 'silver';
  rank: number | null;
}

export interface ClassConquestHistory {
  grade: string;
  grades: string[];
  viewer: 'student' | 'teacher';
  my_class: string | null;
  results: ConquestResult[];
  badges: ConquestBadge[];
}

/** Finished weeks (Hall of Fame) for the viewer's school and grade, newest first. Never throws. */
export async function fetchClassConquestHistory(grade?: string | null, limit = 26): Promise<ClassConquestHistory | null> {
  try {
    const { data, error } = await supabase.rpc('rpc_get_class_conquest_history', { p_grade: grade ?? null, p_limit: limit });
    if (error || !data || data.available !== true) return null;
    return { ...data, grades: data.grades || [], results: data.results || [], badges: data.badges || [] } as ClassConquestHistory;
  } catch {
    return null;
  }
}
