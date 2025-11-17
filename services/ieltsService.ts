import { supabase } from './supabaseClient';

export type IeltsModuleType = 'general' | 'academic';

export interface IeltsSessionSummary {
  id: string;
  module: IeltsModuleType;
  target_band: number | null;
  created_at: string;
  completed_at: string | null;
  reference_code: string;
  band_overall: number | null;
  status: 'in_progress' | 'completed';
}

export interface IeltsSessionPayload {
  id: string;
  reference_code: string;
  reading_block?: unknown;
  listening_block?: unknown;
  writing_task?: unknown;
  target_band?: number | null;
  module?: IeltsModuleType;
  created_at?: string;
  completed_at?: string | null;
  band_overall?: number | null;
}

export interface IeltsQuestion {
  id: string;
  prompt: string;
  type?: string;
  options?: string[];
}

export interface IeltsReadingBlock {
  title: string;
  passage?: string;
  questions: IeltsQuestion[];
}

export interface IeltsListeningBlock {
  title: string;
  audioScript?: string;
  questions: IeltsQuestion[];
}

export interface IeltsWritingTask {
  title?: string;
  prompt: string;
  bandTarget?: number | null;
  wordLimit?: number | null;
}

export interface IeltsAnalyticsBreakdownRow {
  questionId: string;
  studentAnswer?: string | null;
  correctAnswer?: string | null;
  isCorrect: boolean;
  explanation?: string | null;
}

export interface IeltsSectionAnalytics {
  correct: number;
  total: number;
  breakdown: IeltsAnalyticsBreakdownRow[];
}

export interface IeltsWritingFeedback {
  wordCount?: number | null;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  originalAnswer?: string | null;
  improvedAnswer?: string | null;
}

export interface IeltsAnalytics {
  readingAnalytics?: IeltsSectionAnalytics;
  listeningAnalytics?: IeltsSectionAnalytics;
  writingFeedback?: IeltsWritingFeedback;
  summaryText?: string | null;
}

export interface IeltsSessionRecord extends IeltsSessionSummary {
  reading_block?: IeltsReadingBlock | null;
  listening_block?: IeltsListeningBlock | null;
  writing_task?: IeltsWritingTask | null;
  reading_answers?: Record<string, string> | null;
  listening_answers?: Record<string, string> | null;
  writing_answer?: string | null;
  analytics?: IeltsAnalytics | null;
  band_reading?: number | null;
  band_listening?: number | null;
  band_writing?: number | null;
}
import type {
  IELTSUserProfile,
  IELTSReadingSet,
  IELTSListeningSet,
  IELTSWritingTask,
  IELTSSpeakingTask,
  IELTSMockTest,
  IELTSRecentAttempts,
  IELTSReadingAttempt,
  IELTSListeningAttempt,
  IELTSWritingAttempt,
  IELTSSpeakingAttempt,
  IELTSMockTestAttempt,
} from '../types';

interface EnsureProfileOptions {
  username?: string;
  fullName?: string | null;
}

const sanitizeUsername = (input: string): string => {
  const base = (input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);

  return base.length > 0 ? base : 'ieltsstudent';
};

const ensureUniqueUsername = async (desired: string): Promise<string> => {
  const base = sanitizeUsername(desired);

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}${suffix + 1}`;
    const { data, error } = await supabase
      .from('ielts_users')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();

    if (error) {
      if ((error as any).code === 'PGRST116') {
        return candidate;
      }
      throw new Error(`Unable to verify username uniqueness: ${error.message}`);
    }

    if (!data) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a unique username. Please try a different one.');
};

export const ensureIeltsProfile = async (
  options: EnsureProfileOptions = {}
): Promise<IELTSUserProfile> => {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error('Not authenticated');
  }

  const { user } = userData;

  const { data: existing, error: existingError } = await supabase
    .from('ielts_users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError && (existingError as any).code !== 'PGRST116') {
    throw new Error(`Failed to load IELTS profile: ${existingError.message}`);
  }

  const normalizedEmail = user.email ? user.email.toLowerCase() : null;
  const derivedFullName = options.fullName ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;

  if (existing) {
    const updates: Partial<IELTSUserProfile> = {};
    if (normalizedEmail && normalizedEmail !== existing.email) {
      updates.email = normalizedEmail;
    }
    if (derivedFullName && derivedFullName !== existing.full_name) {
      updates.full_name = derivedFullName;
    }

    if (Object.keys(updates).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from('ielts_users')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update IELTS profile: ${updateError.message}`);
      }

      return updated as IELTSUserProfile;
    }

    return existing as IELTSUserProfile;
  }

  const desiredUsername =
    options.username ||
    user.user_metadata?.ielts_username ||
    user.user_metadata?.username ||
    user.user_metadata?.full_name ||
    (user.email ? user.email.split('@')[0] : '') ||
    'ieltsstudent';

  const uniqueUsername = await ensureUniqueUsername(desiredUsername);

  const insertPayload = {
    id: user.id,
    username: uniqueUsername,
    full_name: derivedFullName,
    email: normalizedEmail,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('ielts_users')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create IELTS profile: ${insertError.message}`);
  }

  return inserted as IELTSUserProfile;
};

const handleSelectError = (error: any, context: string) => {
  if (!error) {
    return;
  }
  throw new Error(`Failed to load ${context}: ${error.message || 'unknown error'}`);
};

export const fetchActiveReadingSets = async (): Promise<IELTSReadingSet[]> => {
  const { data, error } = await supabase
    .from('ielts_reading_sets')
    .select('id, slug, title, description, level, est_band_min, est_band_max, duration_minutes, created_by, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  handleSelectError(error, 'reading sets');
  return (data ?? []) as IELTSReadingSet[];
};

export const fetchActiveListeningSets = async (): Promise<IELTSListeningSet[]> => {
  const { data, error } = await supabase
    .from('ielts_listening_sets')
    .select('id, slug, title, description, level, est_band_min, est_band_max, duration_minutes, audio_url, created_by, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  handleSelectError(error, 'listening sets');
  return (data ?? []) as IELTSListeningSet[];
};

export const fetchActiveWritingTasks = async (): Promise<IELTSWritingTask[]> => {
  const { data, error } = await supabase
    .from('ielts_writing_tasks')
    .select('id, slug, task_type, title, prompt, bands_target, sample_answer, created_by, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  handleSelectError(error, 'writing tasks');
  return (data ?? []) as IELTSWritingTask[];
};

export const fetchActiveSpeakingTasks = async (): Promise<IELTSSpeakingTask[]> => {
  const { data, error } = await supabase
    .from('ielts_speaking_tasks')
    .select('id, slug, part, prompt, follow_ups, created_by, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  handleSelectError(error, 'speaking tasks');
  return (data ?? []) as IELTSSpeakingTask[];
};

export const fetchActiveMockTests = async (): Promise<IELTSMockTest[]> => {
  const { data, error } = await supabase
    .from('ielts_mock_tests')
    .select('id, slug, title, description, duration_minutes, reading_set_id, listening_set_id, writing_task1_id, writing_task2_id, speaking_task_part1_id, speaking_task_part2_id, speaking_task_part3_id, created_by, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  handleSelectError(error, 'mock tests');
  return (data ?? []) as IELTSMockTest[];
};

export const fetchRecentAttempts = async (): Promise<IELTSRecentAttempts> => {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error('Not authenticated');
  }

  const userId = userData.user.id;

  const [reading, listening, writing, speaking, mock] = await Promise.all([
    supabase
      .from('ielts_reading_attempts')
      .select('id, set_id, started_at, completed_at, raw_score, total_questions, percent, est_band')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(5),
    supabase
      .from('ielts_listening_attempts')
      .select('id, set_id, started_at, completed_at, raw_score, total_questions, percent, est_band')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(5),
    supabase
      .from('ielts_writing_attempts')
      .select('id, task_id, submitted_at, band_overall, feedback')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(5),
    supabase
      .from('ielts_speaking_attempts')
      .select('id, task_id, submitted_at, band_overall, band_fluency, band_pronunciation')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(5),
    supabase
      .from('ielts_mock_test_attempts')
      .select('id, test_id, started_at, completed_at, overall_band_est, summary')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(5),
  ]);

  const readingAttempts = (reading.data ?? []) as IELTSReadingAttempt[];
  const listeningAttempts = (listening.data ?? []) as IELTSListeningAttempt[];
  const writingAttempts = (writing.data ?? []) as IELTSWritingAttempt[];
  const speakingAttempts = (speaking.data ?? []) as IELTSSpeakingAttempt[];
  const mockAttempts = (mock.data ?? []) as IELTSMockTestAttempt[];

  handleSelectError(reading.error, 'reading attempts');
  handleSelectError(listening.error, 'listening attempts');
  handleSelectError(writing.error, 'writing attempts');
  handleSelectError(speaking.error, 'speaking attempts');
  handleSelectError(mock.error, 'mock test attempts');

  return {  
    reading: readingAttempts,
    listening: listeningAttempts,
    writing: writingAttempts,
    speaking: speakingAttempts,
    mock: mockAttempts,
  };
};

const buildSessionSummary = (payload: IeltsSessionPayload): IeltsSessionSummary => ({
  id: payload.id,
  module: (payload.module ?? 'general') as IeltsModuleType,
  target_band: payload.target_band ?? null,
  created_at: payload.created_at ?? new Date().toISOString(),
  completed_at: payload.completed_at ?? null,
  reference_code: payload.reference_code,
  band_overall: payload.band_overall ?? null,
  status: payload.completed_at ? 'completed' : 'in_progress',
});

const invokeIeltsSessionFunction = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('ielts_session', { body });

  if (error) {
    throw new Error(error.message || 'Unable to reach IELTS session service.');
  }

  const typed = data as Record<string, unknown> & { error?: string };
  if (typed?.error) {
    throw new Error(typed.error);
  }

  return typed;
};

export const createPack = async (
  module: IeltsModuleType,
  targetBand?: number
): Promise<IeltsSessionPayload> => {
  const response = await invokeIeltsSessionFunction({
    mode: 'create-pack',
    module,
    targetBand: targetBand ?? null,
  });

  return {
    id: response.sessionId as string,
    reference_code: response.referenceCode as string,
    reading_block: response.reading,
    listening_block: response.listening,
    writing_task: response.writing,
    module,
    target_band: targetBand ?? null,
  };
};

export const getByReference = async (referenceCode: string): Promise<IeltsSessionPayload> => {
  const response = await invokeIeltsSessionFunction({
    mode: 'get-by-reference',
    referenceCode,
  });

  return {
    id: response.id as string,
    reference_code: response.reference_code as string,
    reading_block: response.reading_block,
    listening_block: response.listening_block,
    writing_task: response.writing_task,
    target_band: (response.target_band as number | null | undefined) ?? null,
    module: (response.module as IeltsModuleType | undefined) ?? 'general',
    created_at: response.created_at as string | undefined,
    completed_at: (response.completed_at as string | null | undefined) ?? null,
    band_overall: (response.band_overall as number | null | undefined) ?? null,
  };
};

export const fetchRecentSessions = async (): Promise<IeltsSessionSummary[]> => {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('ielts_sessions')
    .select('id, module, target_band, created_at, completed_at, reference_code, band_overall')
    .eq('student_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(`Failed to load recent sessions: ${error.message}`);
  }

  return (data ?? []).map((row) => buildSessionSummary(row as IeltsSessionPayload));
};

export const fetchSessionById = async (sessionId: string): Promise<IeltsSessionRecord> => {
  const { data, error } = await supabase
    .from('ielts_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to load session: ${error?.message || 'not found'}`);
  }

  const summary = buildSessionSummary(data as IeltsSessionPayload);
  return {
    ...(data as Record<string, unknown>),
    ...summary,
  } as IeltsSessionRecord;
};

export const finaliseSession = async (
  sessionId: string,
  readingAnswers: Record<string, string>,
  listeningAnswers: Record<string, string>,
  writingAnswer: string
): Promise<IeltsSessionRecord> => {
  const response = await invokeIeltsSessionFunction({
    mode: 'finalise-session',
    sessionId,
    readingAnswers,
    listeningAnswers,
    writingAnswer,
  });

  const summary = buildSessionSummary(response as IeltsSessionPayload);
  return {
    ...(response as Record<string, unknown>),
    ...summary,
  } as IeltsSessionRecord;
};
