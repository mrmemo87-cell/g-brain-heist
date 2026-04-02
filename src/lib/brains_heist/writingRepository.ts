import { supabase } from '../../../services/supabaseClient.js';
import { getEnvVar } from '../../../services/env.js';

export interface SerializedWritingPersistenceStore {
  profiles: Array<[string, unknown]>;
  states: Array<[string, unknown]>;
  attempts: unknown[];
  weeklyPlans: unknown[];
  dailyTasks: unknown[];
  dailySubmissions: unknown[];
  dailyEvaluations: unknown[];
  monthlyReports: unknown[];
  memorySnapshots: unknown[];
  promptBank: unknown[];
  reviewSignals: unknown[];
  calibrationFollowUpByStudent: Record<string, { flagged: boolean; note?: string; updated_at: string }>;
}

const isTestEnv = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
const hasSupabaseRuntimeConfig = (): boolean => {
  const url = getEnvVar('VITE_SUPABASE_URL') ?? '';
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY') ?? '';
  return Boolean(url && key && !url.includes('placeholder'));
};

const canUseSupabase = (): boolean => {
  if (isTestEnv) return false;
  return hasSupabaseRuntimeConfig();
};

const safe = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const ensureNoError = (result: { error: { message: string } | null }, context: string): void => {
  if (result.error) {
    throw new Error(`[writingRepository] ${context}: ${result.error.message}`);
  }
};

export const loadWritingStoreSnapshot = async (): Promise<SerializedWritingPersistenceStore | null> => {
  if (!canUseSupabase()) return null;

  const [
    profilesRes,
    statesRes,
    attemptsRes,
    weeklyRes,
    tasksRes,
    submissionsRes,
    evalsRes,
    reportsRes,
    memoriesRes,
    promptsRes,
    signalsRes,
    followupsRes,
  ] = await Promise.all([
    supabase.from('bh_writing_student_profiles').select('*'),
    supabase.from('bh_writing_student_states').select('*'),
    supabase.from('bh_writing_attempts').select('*'),
    supabase.from('bh_writing_weekly_plans').select('*'),
    supabase.from('bh_writing_daily_tasks').select('*'),
    supabase.from('bh_writing_daily_submissions').select('*'),
    supabase.from('bh_writing_daily_evaluations').select('*'),
    supabase.from('bh_writing_monthly_reports').select('*'),
    supabase.from('bh_writing_memory_snapshots').select('*'),
    supabase.from('bh_writing_prompt_bank').select('*'),
    supabase.from('bh_writing_review_signals').select('*'),
    supabase.from('bh_writing_calibration_followups').select('*'),
  ]);

  const hasError = [profilesRes, statesRes, attemptsRes, weeklyRes, tasksRes, submissionsRes, evalsRes, reportsRes, memoriesRes, promptsRes, signalsRes, followupsRes]
    .some((result) => result.error);

  if (hasError) {
    console.warn('[writingRepository] DB load failed; snapshot unavailable.');
    return null;
  }

  return {
    profiles: (profilesRes.data ?? []).map((row: any) => [row.student_id, row.profile]),
    states: (statesRes.data ?? []).map((row: any) => [row.student_id, row.state]),
    attempts: (attemptsRes.data ?? []).map((row: any) => row.payload),
    weeklyPlans: (weeklyRes.data ?? []).map((row: any) => row.payload),
    dailyTasks: (tasksRes.data ?? []).map((row: any) => row.payload),
    dailySubmissions: (submissionsRes.data ?? []).map((row: any) => row.payload),
    dailyEvaluations: (evalsRes.data ?? []).map((row: any) => row.payload),
    monthlyReports: (reportsRes.data ?? []).map((row: any) => row.payload),
    memorySnapshots: (memoriesRes.data ?? []).map((row: any) => row.payload),
    promptBank: (promptsRes.data ?? []).map((row: any) => row.payload),
    reviewSignals: (signalsRes.data ?? []).map((row: any) => row.payload),
    calibrationFollowUpByStudent: Object.fromEntries(
      (followupsRes.data ?? []).map((row: any) => [row.student_id, row.payload])
    ),
  };
};

export const persistWritingStoreSnapshot = async (snapshot: SerializedWritingPersistenceStore): Promise<void> => {
  if (!canUseSupabase()) return;

  const profiles = snapshot.profiles.map(([student_id, profile]: [string, any]) => ({
    student_id,
    grade: profile.grade,
    genre: profile.current_genre,
    profile: safe(profile),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  }));
  const states = snapshot.states.map(([student_id, state]) => ({ student_id, state: safe(state) }));

  const [profilesRes, statesRes] = await Promise.all([
    supabase.from('bh_writing_student_profiles').upsert(profiles, { onConflict: 'student_id' }),
    supabase.from('bh_writing_student_states').upsert(states, { onConflict: 'student_id' }),
  ]);
  ensureNoError(profilesRes, 'upsert profiles failed');
  ensureNoError(statesRes, 'upsert states failed');

  await Promise.all([
    replaceTableByKey('bh_writing_attempts', snapshot.attempts, 'student_id'),
    replaceTableByKey('bh_writing_weekly_plans', snapshot.weeklyPlans, 'student_id'),
    replaceTableByKey('bh_writing_daily_tasks', snapshot.dailyTasks, 'student_id'),
    replaceTableByKey('bh_writing_daily_submissions', snapshot.dailySubmissions, 'student_id'),
    replaceTableByKey('bh_writing_daily_evaluations', snapshot.dailyEvaluations, 'student_id'),
    replaceTableByKey('bh_writing_monthly_reports', snapshot.monthlyReports, 'student_id'),
    replaceTableByKey('bh_writing_memory_snapshots', snapshot.memorySnapshots, 'student_id'),
    replaceTableByKey('bh_writing_prompt_bank', snapshot.promptBank, 'id'),
    replaceTableByKey('bh_writing_review_signals', snapshot.reviewSignals, 'id'),
    replaceFollowups(snapshot.calibrationFollowUpByStudent),
  ]);
};

export const getWritingRepositoryMode = (): 'db' | 'disabled' => (canUseSupabase() ? 'db' : 'disabled');

const readKey = (row: unknown, key: string): string | null => {
  if (!row || typeof row !== 'object') return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const replaceTableByKey = async (table: string, rows: unknown[], key: string): Promise<void> => {
  const keys = [...new Set(rows.map((row) => readKey(row, key)).filter((value): value is string => Boolean(value)))];
  if (keys.length) {
    const deleteRes = await supabase.from(table).delete().in(`payload->>${key}`, keys);
    ensureNoError(deleteRes, `delete ${table} by ${key} failed`);
  }
  if (!rows.length) return;
  const insertRes = await supabase.from(table).insert(rows.map((payload) => ({ payload: safe(payload) })));
  ensureNoError(insertRes, `insert ${table} failed`);
};

const replaceFollowups = async (
  map: Record<string, { flagged: boolean; note?: string; updated_at: string }>
): Promise<void> => {
  const rows = Object.entries(map).map(([student_id, payload]) => ({ student_id, payload: safe(payload), updated_at: payload.updated_at }));
  if (!rows.length) return;
  const upsertRes = await supabase.from('bh_writing_calibration_followups').upsert(rows, { onConflict: 'student_id' });
  ensureNoError(upsertRes, 'upsert calibration followups failed');
};
