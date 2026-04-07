import { supabase } from '../../../services/supabaseClient.js';
import { getEnvVar } from '../../../services/env.js';

export interface SerializedWritingPersistenceStore {
  profiles: Array<[string, unknown]>;
  usernamesById?: Record<string, string>;
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
const withStudentBinding = <T extends Record<string, unknown>>(row: T, studentId: string): T => {
  if (typeof row['student_id'] === 'string') {
    return { ...row, student_id: studentId };
  }
  return row;
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

  const readRows = <T>(result: { data: T[] | null; error: { message: string } | null }, label: string): T[] => {
    if (result.error) {
      console.warn(`[writingRepository] Partial DB load failed for ${label}: ${result.error.message}`);
      return [];
    }
    return result.data ?? [];
  };

  const profileRows = readRows<any>(profilesRes, 'profiles');
  const stateRows = readRows<any>(statesRes, 'states');
  const attemptRows = readRows<any>(attemptsRes, 'attempts');
  const weeklyRows = readRows<any>(weeklyRes, 'weekly_plans');
  const taskRows = readRows<any>(tasksRes, 'daily_tasks');
  const submissionRows = readRows<any>(submissionsRes, 'daily_submissions');
  const evaluationRows = readRows<any>(evalsRes, 'daily_evaluations');
  const reportRows = readRows<any>(reportsRes, 'monthly_reports');
  const memoryRows = readRows<any>(memoriesRes, 'memory_snapshots');
  // Optional for students: admin-only tables can fail RLS and should not collapse hydration.
  const promptRows = readRows<any>(promptsRes, 'prompt_bank');
  const signalRows = readRows<any>(signalsRes, 'review_signals');
  const followupRows = readRows<any>(followupsRes, 'calibration_followups');
  const studentIds = [...new Set(profileRows.map((row: any) => row?.student_id).filter((value: unknown): value is string => typeof value === 'string' && value.length > 0))];
  let usernamesById: Record<string, string> = {};
  if (studentIds.length > 0) {
    const usersRes = await supabase.from('users').select('id, username').in('id', studentIds);
    if (usersRes.error) {
      console.warn(`[writingRepository] Partial DB load failed for users: ${usersRes.error.message}`);
    } else {
      usernamesById = Object.fromEntries(
        (usersRes.data ?? [])
          .filter((row: any) => typeof row?.id === 'string' && typeof row?.username === 'string' && row.username.trim().length > 0)
          .map((row: any) => [row.id, row.username.trim()])
      );
    }
  }

  return {
    profiles: profileRows.map((row: any) => [row.student_id, row.profile]),
    usernamesById,
    states: stateRows.flatMap((row: any): Array<[string, unknown]> => {
      const statePayload = row.state;
      if (statePayload && typeof statePayload === 'object' && !Array.isArray(statePayload) && statePayload['by_genre']) {
        const byGenre = statePayload['by_genre'] as Record<string, unknown>;
        return Object.entries(byGenre)
          .filter(([genre]) => typeof genre === 'string' && genre.length > 0)
          .map(([genre, state]) => [`${row.student_id}::${genre}`, state] as [string, unknown]);
      }
      const inferredGenre = (() => {
        if (statePayload && typeof statePayload === 'object' && !Array.isArray(statePayload)) {
          const rawGenre = (statePayload as Record<string, unknown>)['current_genre'] ?? (statePayload as Record<string, unknown>)['genre'];
          if (typeof rawGenre === 'string' && rawGenre.length > 0) return rawGenre;
        }
        return 'unknown';
      })();
      return [[`${row.student_id}::${inferredGenre}`, statePayload] as [string, unknown]];
    }),
    attempts: attemptRows.map((row: any) => row.payload),
    weeklyPlans: weeklyRows.map((row: any) => row.payload),
    dailyTasks: taskRows.map((row: any) => row.payload),
    dailySubmissions: submissionRows.map((row: any) => row.payload),
    dailyEvaluations: evaluationRows.map((row: any) => row.payload),
    monthlyReports: reportRows.map((row: any) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      return {
        ...payload,
        student_id: typeof row?.student_id === 'string' ? row.student_id : (payload as any).student_id,
        genre: typeof row?.genre === 'string' ? row.genre : (payload as any).genre,
        month: typeof row?.month === 'string' ? row.month : (payload as any).month,
        created_at: typeof row?.created_at === 'string' ? row.created_at : (payload as any).created_at,
      };
    }),
    memorySnapshots: memoryRows.map((row: any) => row.payload),
    promptBank: promptRows.map((row: any) => row.payload),
    reviewSignals: signalRows.map((row: any) => row.payload),
    calibrationFollowUpByStudent: Object.fromEntries(
      followupRows.map((row: any) => [row.student_id, row.payload])
    ),
  };
};

export const persistWritingStoreSnapshot = async (snapshot: SerializedWritingPersistenceStore): Promise<void> => {
  if (!canUseSupabase()) return;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    throw new Error(`[writingRepository] resolve auth user failed: ${authError.message}`);
  }
  const activeStudentId = user?.id;
  if (!activeStudentId) {
    throw new Error('[writingRepository] persist called without authenticated user.');
  }

  const profiles = snapshot.profiles
    .filter(([student_id]) => student_id === activeStudentId)
    .map(([, profile]: [string, any]) => ({
    student_id: activeStudentId,
    grade: profile.grade,
    genre: profile.current_genre,
    profile: safe(profile),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  }));
  const statesByStudent = snapshot.states.reduce<Record<string, Record<string, unknown>>>((acc, [key, state]) => {
    const [studentId, genre] = key.split('::');
    if (!studentId || !genre) {
      console.warn(`[writingRepository] Skipping malformed state key during persistence: ${key}`);
      return acc;
    }
    if (studentId !== activeStudentId) return acc;
    if (!acc[studentId]) acc[studentId] = {};
    acc[studentId][genre] = safe(state);
    return acc;
  }, {});
  const states = Object.entries(statesByStudent).map(([student_id, by_genre]) => ({
    student_id,
    state: { by_genre },
  }));

  const [profilesRes, statesRes] = await Promise.all([
    supabase.from('bh_writing_student_profiles').upsert(profiles, { onConflict: 'student_id' }),
    supabase.from('bh_writing_student_states').upsert(states, { onConflict: 'student_id' }),
  ]);
  ensureNoError(profilesRes, 'upsert profiles failed');
  ensureNoError(statesRes, 'upsert states failed');

  const bindStudentRows = (rows: unknown[]): unknown[] =>
    rows
      .filter((row) => readKey(row, 'student_id') === activeStudentId)
      .map((row) => (row && typeof row === 'object' ? withStudentBinding(row as Record<string, unknown>, activeStudentId) : row));

  const followups = Object.fromEntries(
    Object.entries(snapshot.calibrationFollowUpByStudent)
      .filter(([student_id]) => student_id === activeStudentId)
      .map(([, payload]) => [activeStudentId, payload])
  );

  await Promise.all([
    replaceTableByKey('bh_writing_attempts', bindStudentRows(snapshot.attempts), 'student_id'),
    replaceTableByKey('bh_writing_weekly_plans', bindStudentRows(snapshot.weeklyPlans), 'student_id'),
    replaceTableByKey('bh_writing_daily_tasks', bindStudentRows(snapshot.dailyTasks), 'student_id'),
    replaceTableByKey('bh_writing_daily_submissions', bindStudentRows(snapshot.dailySubmissions), 'student_id'),
    replaceTableByKey('bh_writing_daily_evaluations', bindStudentRows(snapshot.dailyEvaluations), 'student_id'),
    replaceTableByKey('bh_writing_memory_snapshots', bindStudentRows(snapshot.memorySnapshots), 'student_id'),
    replaceFollowups(followups),
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


export const persistMonthlyWritingReport = async (report: unknown): Promise<void> => {
  if (!canUseSupabase()) return;
  const safeReport = safe(report);
  const reportRow = safeReport as { student_id?: string; genre?: string; month?: string };
  if (!reportRow.student_id || !reportRow.genre || !reportRow.month) {
    throw new Error('[writingRepository] monthly report is missing required typed keys (student_id, genre, month).');
  }
  const upsertRes = await supabase
    .from('bh_writing_monthly_reports')
    .upsert(
      {
        student_id: reportRow.student_id,
        genre: reportRow.genre,
        month: reportRow.month,
        payload: safeReport,
      },
      { onConflict: 'student_id,genre,month' }
    );
  ensureNoError(upsertRes, 'upsert bh_writing_monthly_reports failed');
};
