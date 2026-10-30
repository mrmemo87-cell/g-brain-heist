import { supabase } from './supabaseClient';
import type { CheerCode, ConquestClass, ConquestPhase, ConquestResult } from '../src/lib/classConquest';

/** The latest frozen result as the live RPC returns it (with viewer-relative flags). */
export interface ConquestLastWeek extends ConquestResult {
  /** False only for teachers looking at a sealed weekend; students never receive an unrevealed result. */
  revealed: boolean;
  is_my_class: boolean;
  my_rank: number | null;
}

export interface ClassConquestData {
  grade: string;
  grades: string[];
  week_start: string;
  /** Friday: the last scoring day. */
  week_end: string;
  today: string;
  phase: ConquestPhase;
  /** Scoring days left including today (0 on the weekend). */
  days_left: number;
  days_until_reset: number;
  /** ISO timestamps: Friday 23:59:59 and Monday 07:00 Bishkek. */
  seals_at: string;
  reveal_at: string;
  map_id: string;
  next_map_id: string;
  viewer: 'student' | 'teacher';
  /** Empty for students during the sealed weekend. */
  classes: ConquestClass[];
  my_class: string | null;
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
  /** gold = finished in the winning class's top five; silver = member of the winning class; oracle = predicted the winner. */
  kind: 'gold' | 'silver' | 'oracle';
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

// ───────────────────────────── the sealed weekend ─────────────────────────────

export interface WeekendClass { class_id: string; label: string; is_mine: boolean }
export interface WeekendCheer { class_id: string; cheer_code: CheerCode; name: string; from_class_id: string | null; at: string; is_me: boolean }
export interface WeekendRaids {
  classes: Array<{ class_id: string; label: string; wins: number; raids: number }>;
  top: Array<{ name: string; class_label: string; wins: number }>;
}
export interface ClassConquestWeekend {
  grade: string;
  viewer: 'student' | 'teacher';
  my_class: string | null;
  phase: ConquestPhase;
  week_start: string;
  map_id: string;
  next_map_id: string;
  reveal_at: string;
  classes: WeekendClass[];
  predictions: Array<{ class_id: string; count: number }>;
  my_prediction: string | null;
  cheers: WeekendCheer[];
  cheer_counts: Array<{ class_id: string; count: number }>;
  next_cheer_at: string | null;
  raids: WeekendRaids | null;
}

/** Predictions, hype wall and border raids for the current (sealed) week. Never throws. */
export async function fetchClassConquestWeekend(grade?: string | null): Promise<ClassConquestWeekend | null> {
  try {
    const { data, error } = await supabase.rpc('rpc_get_class_conquest_weekend', { p_grade: grade ?? null });
    if (error || !data || data.available !== true) return null;
    return {
      ...data,
      classes: data.classes || [], predictions: data.predictions || [], cheers: data.cheers || [], cheer_counts: data.cheer_counts || [],
    } as ClassConquestWeekend;
  } catch {
    return null;
  }
}

export type WeekendActionResult = { ok: true; next_cheer_at?: string | null; predicted_class_id?: string; locked?: boolean } | { ok: false; reason: string; next_cheer_at?: string };

export async function predictConquestWinner(classId: string): Promise<WeekendActionResult> {
  try {
    const { data, error } = await supabase.rpc('rpc_class_conquest_predict', { p_class_id: classId });
    if (error || !data) return { ok: false, reason: 'unavailable' };
    return data as WeekendActionResult;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function postConquestCheer(classId: string, cheer: CheerCode): Promise<WeekendActionResult> {
  try {
    const { data, error } = await supabase.rpc('rpc_class_conquest_cheer', { p_class_id: classId, p_cheer_code: cheer });
    if (error || !data) return { ok: false, reason: 'unavailable' };
    return data as WeekendActionResult;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
