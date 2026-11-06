import { supabase } from './supabaseClient';
import type { ArenaMatchResult, ArenaMatchTicket, ArenaRespawnQuestion, ArenaStatus, FighterId } from '../src/features/arena/arenaModel';

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(10000));
  if (error) throw error;
  return data as T;
}

let statusCache: { expires: number; data: ArenaStatus } | null = null;

export async function fetchArenaStatus(fresh = false): Promise<ArenaStatus> {
  if (!fresh && statusCache && statusCache.expires > Date.now()) return statusCache.data;
  const data = await rpc<ArenaStatus>('rpc_arena_status');
  statusCache = { expires: Date.now() + 30000, data };
  return data;
}

export function clearArenaStatusCache() { statusCache = null; }

export const startArenaMatch = (fighter: FighterId) => { statusCache = null; return rpc<ArenaMatchTicket>('rpc_arena_start_match', { p_fighter: fighter }); };
export const fetchRespawnQuestion = (matchId: string) => rpc<ArenaRespawnQuestion>('rpc_arena_respawn_question', { p_match_id: matchId });
export const answerRespawnQuestion = (matchId: string, promptId: string, answer: string) =>
  rpc<{ correct: boolean; xp: number; repeated?: boolean }>('rpc_arena_answer_respawn', { p_match_id: matchId, p_prompt_id: promptId, p_answer: answer });
export const finishArenaMatch = (matchId: string, scoreMine: number, scoreTheirs: number, mvp: boolean) => {
  statusCache = null;
  return rpc<ArenaMatchResult>('rpc_arena_finish_match', { p_match_id: matchId, p_score_mine: scoreMine, p_score_theirs: scoreTheirs, p_mvp: mvp });
};

// Teacher and school admin
export interface ArenaAdminSettings {
  enabled: boolean; daily_cap: number; window_start: string; window_end: string; weekend_all_day: boolean; matches_this_week: number;
  classes: Array<{ class_id: string; class_name: string; enabled: boolean; require_assignment: boolean }>;
}
export interface ArenaTeacherSummary {
  school_enabled: boolean; class_enabled: boolean; require_assignment: boolean; daily_cap: number; matches_this_week: number;
  respawn_questions_this_week: number; respawn_correct_this_week: number; tickets_earned_this_week: number; students: number;
}
export const fetchArenaAdminSettings = (schoolId: string) => rpc<ArenaAdminSettings>('rpc_arena_admin_settings', { p_school_id: schoolId });
export const updateArenaSchoolSettings = (schoolId: string, s: { enabled: boolean; daily_cap: number; window_start: string; window_end: string; weekend_all_day: boolean }) =>
  rpc<ArenaAdminSettings>('rpc_arena_update_school_settings', { p_school_id: schoolId, p_enabled: s.enabled, p_daily_cap: s.daily_cap, p_window_start: s.window_start, p_window_end: s.window_end, p_weekend_all_day: s.weekend_all_day });
export const fetchArenaTeacherSummary = (classId: string) => rpc<ArenaTeacherSummary>('rpc_arena_teacher_summary', { p_class_id: classId });
export const updateArenaClassSettings = (classId: string, enabled: boolean, requireAssignment: boolean) =>
  rpc<ArenaTeacherSummary>('rpc_arena_update_class_settings', { p_class_id: classId, p_enabled: enabled, p_require_assignment: requireAssignment });
export const grantArenaClassBonus = (classId: string) => rpc<{ granted: number }>('rpc_arena_class_bonus', { p_class_id: classId });
