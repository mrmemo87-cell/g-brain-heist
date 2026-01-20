import { supabase } from './supabaseClient';
import type {
  IELTSUserProfile,
  IELTSReadingSet,
  IELTSReadingQuestion,
  IELTSListeningSet,
  IELTSWritingTask as IELTSWritingTaskType,
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

export type IeltsModuleType = 'general' | 'academic';

export type IeltsSessionStatus = 'in_progress' | 'completed';

export interface IeltsSessionSummary {
  id: string;
  module: IeltsModuleType;
  module_type?: IeltsModuleType;
  target_band: number | null;
  reference_code: string;
  created_at: string;
  completed_at: string | null;
  band_overall: number | null;
  status: IeltsSessionStatus;
  reading?: unknown;
  listening?: unknown;
  writing?: unknown;
}

export interface IeltsQuestion {
  id: string;
  prompt: string;
  type: string;
  options?: string[];
}

export interface IeltsReadingBlock {
  title: string;
  passage: string;
  questions: IeltsQuestion[];
}

export interface IeltsListeningBlock {
  title: string;
  audioScript?: string;
  questions: IeltsQuestion[];
}

export interface IeltsWritingTask {
  title?: string | null;
  prompt: string;
  bands_target?: string | null;
  task_type?: string | null;
}

export interface IeltsAnalyticsBreakdownRow {
  questionId: string;
  studentAnswer?: string | null;
  correctAnswer?: string | null;
  isCorrect?: boolean;
  explanation?: string | null;
}

export interface IeltsAnalyticsSection {
  correct: number;
  total: number;
  breakdown: IeltsAnalyticsBreakdownRow[];
}

export interface IeltsWritingFeedback {
  wordCount?: number | null;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  overallBand?: number | null;
}

export interface IeltsAnalytics {
  readingAnalytics?: IeltsAnalyticsSection;
  listeningAnalytics?: IeltsAnalyticsSection;
  writingFeedback?: IeltsWritingFeedback;
  summaryText?: string;
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
  const derivedFullName = options.fullName ?? user.user_metadata?.['full_name'] ?? user.user_metadata?.['name'] ?? null;

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
    user.user_metadata?.['ielts_username'] ||
    user.user_metadata?.['username'] ||
    user.user_metadata?.['full_name'] ||
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

const normalizeSessionSummary = (
  session: any,
  fallbackModule: IeltsModuleType | null = null
): IeltsSessionSummary => {
  const moduleValue = (session?.module || session?.module_type || fallbackModule || 'general') as IeltsModuleType;
  const completedAt = session?.completed_at ?? null;

  return {
    id: session?.id,
    module: moduleValue,
    module_type: session?.module_type ?? moduleValue,
    target_band: session?.target_band ?? null,
    created_at: session?.created_at ?? new Date().toISOString(),
    reference_code: session?.reference_code,
    band_overall: session?.band_overall ?? null,
    completed_at: completedAt,
    status: completedAt ? 'completed' : 'in_progress',
    reading: session?.reading_block ?? session?.reading,
    listening: session?.listening_block ?? session?.listening,
    writing: session?.writing_task ?? session?.writing,
  };
};

const normalizeSessionRecord = (
  session: any,
  fallbackModule: IeltsModuleType | null = null
): IeltsSessionRecord => {
  const summary = normalizeSessionSummary(session, fallbackModule);

  return {
    ...summary,
    reading_block: session?.reading_block ?? null,
    listening_block: session?.listening_block ?? null,
    writing_task: session?.writing_task ?? null,
    reading_answers: session?.reading_answers ?? null,
    listening_answers: session?.listening_answers ?? null,
    writing_answer: session?.writing_answer ?? null,
    analytics: (session?.analytics ?? null) as IeltsAnalytics | null,
    band_reading: session?.band_reading ?? null,
    band_listening: session?.band_listening ?? null,
    band_writing: session?.band_writing ?? null,
  };
};

export const fetchActiveReadingSets = async (): Promise<IELTSReadingSet[]> => {
  const { data, error } = await supabase
    .from('ielts_reading_sets')
    .select('id, slug, title, description, level, est_band_min, est_band_max, duration_minutes, passage_text, required_tier, created_by, created_at, is_active')
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

export const fetchActiveWritingTasks = async (): Promise<IELTSWritingTaskType[]> => {
  const { data, error } = await supabase
    .from('ielts_writing_tasks')
    .select('id, slug, task_type, title, prompt, bands_target, sample_answer, created_by, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  handleSelectError(error, 'writing tasks');
  return (data ?? []) as IELTSWritingTaskType[];
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

export const createPack = async (
  moduleType: IeltsModuleType,
  targetBand?: number
): Promise<IeltsSessionSummary> => {
  const { data, error } = await supabase.functions.invoke('ielts_session', {
    body: {
      mode: 'create-pack',
      module: moduleType,
      targetBand: targetBand ?? null,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to create session.');
  }

  if (!data?.sessionId || !data?.referenceCode) {
    throw new Error('Unexpected response while creating session.');
  }

  return normalizeSessionSummary(
    {
      id: data.sessionId,
      reference_code: data.referenceCode,
      reading: data.reading,
      listening: data.listening,
      writing: data.writing,
      module: moduleType,
      created_at: new Date().toISOString(),
      band_overall: null,
      completed_at: null,
    },
    moduleType
  );
};

export const getByReference = async (referenceCode: string): Promise<IeltsSessionSummary> => {
  const trimmed = referenceCode.trim();
  if (!trimmed) {
    throw new Error('Reference code is required.');
  }

  const { data, error } = await supabase.functions.invoke('ielts_session', {
    body: {
      mode: 'get-by-reference',
      referenceCode: trimmed,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to retrieve session.');
  }

  if (!data) {
    throw new Error('Session not found.');
  }

  return normalizeSessionSummary(data as Record<string, unknown>);
};

export const fetchRecentSessions = async (): Promise<IeltsSessionSummary[]> => {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('ielts_sessions')
    .select('id, module, module_type, created_at, completed_at, reference_code, band_overall')
    .order('created_at', { ascending: false })
    .limit(5);

  handleSelectError(error, 'IELTS sessions');
  return (data ?? []).map((session) => normalizeSessionSummary(session));
};

export const fetchSessionById = async (sessionId: string): Promise<IeltsSessionRecord> => {
  if (!sessionId) {
    throw new Error('Session id is required.');
  }

  const { data, error } = await supabase
    .from('ielts_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  handleSelectError(error, 'IELTS session');
  if (!data) {
    throw new Error('Session not found.');
  }

  return normalizeSessionRecord(data);
};

export const finaliseSession = async (
  sessionId: string,
  readingAnswers: Record<string, string>,
  listeningAnswers: Record<string, string>,
  writingAnswer: string
): Promise<IeltsSessionRecord> => {
  const { data, error } = await supabase.functions.invoke('ielts_session', {
    body: {
      mode: 'finalise-session',
      sessionId,
      readingAnswers,
      listeningAnswers,
      writingAnswer,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to finalise session.');
  }

  if (!data) {
    throw new Error('Unexpected response while finalising session.');
  }

  return normalizeSessionRecord(data as Record<string, unknown>);
};

// Fetch questions for a reading set
export const fetchReadingQuestions = async (setId: number) => {
  const { data, error } = await supabase
    .from('ielts_reading_questions')
    .select('*')
    .eq('set_id', setId)
    .order('question_order', { ascending: true });

  if (error) {
    console.error('Error fetching reading questions:', error);
    throw new Error('Failed to load questions');
  }

  return data;
};

// Submit reading practice attempt
export const submitReadingAttempt = async (
  setId: number,
  answers: Record<number, string>,
  timeSpent: number
) => {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error('Not authenticated');
  }

  // Ensure user exists in ielts_users table using the proper function
  try {
    await ensureIeltsProfile();
  } catch (profileError) {
    console.error('Error ensuring IELTS profile:', profileError);
    throw new Error('Failed to create IELTS user profile');
  }

  const userId = session.session.user.id;

  const { data, error } = await supabase
    .from('ielts_reading_attempts')
    .insert({
      user_id: userId,
      set_id: setId,
      answers,
      time_spent_seconds: timeSpent,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error submitting attempt:', error);
    throw new Error('Failed to submit attempt');
  }

  return data;
};

// Get user's tier
export const getUserTier = async () => {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    return 'free';
  }

  const { data, error } = await supabase
    .from('ielts_users')
    .select('tier')
    .eq('id', session.session.user.id)
    .single();

  if (error) {
    console.error('Error fetching user tier:', error);
    return 'free';
  }

  return data?.tier || 'free';
};

export const isIeltsPrime = (user?: { tier?: string | null } | null) =>
  user?.tier === 'prime_prep_user' || user?.tier === 'admin';

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

export interface NotificationPreferences {
  attemptType: 'reading' | 'listening' | 'writing' | 'speaking' | 'mock';
  attemptId: string;  // UUID
  alternateEmail?: string;
  phoneNumber?: string;
  notifyByEmail?: boolean;
  notifyBySms?: boolean;
  showInApp?: boolean;
}

export const saveNotificationPreferences = async (prefs: NotificationPreferences) => {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error('Not authenticated');
  }

  const userId = session.session.user.id;

  const { data, error } = await supabase
    .from('ielts_notification_preferences')
    .upsert({
      user_id: userId,
      attempt_type: prefs.attemptType,
      attempt_id: prefs.attemptId,
      alternate_email: prefs.alternateEmail || null,
      phone_number: prefs.phoneNumber || null,
      notify_by_email: prefs.notifyByEmail ?? true,
      notify_by_sms: prefs.notifyBySms ?? false,
      show_in_app: prefs.showInApp ?? true,
    }, {
      onConflict: 'user_id,attempt_type,attempt_id'
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving notification preferences:', error);
    throw new Error('Failed to save notification preferences');
  }

  return data;
};

// ============================================================
// ADMIN FUNCTIONS
// ============================================================

export const fetchIeltsAdminStats = async () => {
  const { data, error } = await supabase
    .from('ielts_admin_stats')
    .select('*')
    .single();

  if (error) {
    console.error('Error fetching IELTS admin stats:', error);
    throw new Error('Failed to fetch IELTS admin stats');
  }

  return data;
};

export const fetchIeltsRecentAttempts = async (limit = 50) => {
  const { data, error } = await supabase
    .from('ielts_admin_recent_attempts')
    .select('*')
    .limit(limit);

  if (error) {
    console.error('Error fetching recent attempts:', error);
    throw new Error('Failed to fetch recent attempts');
  }

  return data || [];
};

export const fetchAllIeltsUsers = async () => {
  // Try to use the admin view first (has email from auth.users)
  const { data: viewData, error: viewError } = await supabase
    .from('ielts_users_admin')
    .select('*')
    .order('created_at', { ascending: false });

  if (!viewError && viewData) {
    return viewData;
  }

  // Fall back to regular ielts_users table
  const { data, error } = await supabase
    .from('ielts_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching IELTS users:', error);
    throw new Error('Failed to fetch IELTS users');
  }

  return data || [];
};

export const fetchIeltsContent = async () => {
  // Fetch each with error handling - some tables may not exist yet
  const fetchWithFallback = async (query: Promise<any>) => {
    try {
      const result = await query;
      if (result.error) {
        console.warn('Query error:', result.error);
        return [];
      }
      return result.data || [];
    } catch (e) {
      console.warn('Fetch error:', e);
      return [];
    }
  };

  const [
    reading,
    readingQuestions,
    listening,
    listeningQuestions,
    writing,
    speaking,
    mockTests,
    sessions,
  ] = await Promise.all([
    fetchWithFallback(supabase.from('ielts_reading_sets').select('id, title, level, is_active').order('id')),
    fetchWithFallback(
      supabase
        .from('ielts_reading_questions')
        .select('id, set_id, question_order, question_type, body')
        .order('set_id')
        .order('question_order')
        .limit(200)
    ),
    fetchWithFallback(supabase.from('ielts_listening_sets').select('id, title, level, is_active').order('id')),
    fetchWithFallback(
      supabase
        .from('ielts_listening_questions')
        .select('id, set_id, question_order, question_type, body')
        .order('set_id')
        .order('question_order')
        .limit(200)
    ),
    fetchWithFallback(supabase.from('ielts_writing_tasks').select('id, title, task_type, is_active').order('id')),
    fetchWithFallback(supabase.from('ielts_speaking_tasks').select('id, slug, part, prompt, is_active').order('id')),
    fetchWithFallback(
      supabase
        .from('ielts_mock_tests')
        .select('id, title, duration_minutes, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    fetchWithFallback(
      supabase
        .from('ielts_sessions')
        .select('id, reference_code, module, target_band, band_overall, created_at, completed_at')
        .order('created_at', { ascending: false })
        .limit(100)
    ),
  ]);

  return {
    readingSets: reading,
    readingQuestions,
    listeningSets: listening,
    listeningQuestions,
    writingTasks: writing,
    speakingTasks: speaking,
    mockTests,
    sessions,
  };
};

export const markNotificationSent = async (
  attemptType: string, 
  attemptId: number | string, 
  notificationType: 'email' | 'sms' | 'in_app'
) => {
  const columnMap = {
    email: 'email_sent_at',
    sms: 'sms_sent_at',
    in_app: 'in_app_shown_at',
  };

  const { error } = await supabase
    .from('ielts_notification_preferences')
    .update({ [columnMap[notificationType]]: new Date().toISOString() })
    .eq('attempt_type', attemptType)
    .eq('attempt_id', attemptId);

  if (error) {
    console.error('Error marking notification sent:', error);
  }
};

// ============================================================
// USER COMPLETION TRACKING
// ============================================================

export interface UserCompletedTasks {
  reading: number[];   // Array of completed set IDs
  listening: number[]; // Array of completed set IDs
  writing: number[];   // Array of completed task IDs
  speaking: number[];  // Array of completed task IDs
}

export const fetchUserCompletedTasks = async (): Promise<UserCompletedTasks> => {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    return { reading: [], listening: [], writing: [], speaking: [] };
  }

  const userId = session.session.user.id;

  const [reading, listening, writing, speaking] = await Promise.all([
    supabase
      .from('ielts_reading_attempts')
      .select('set_id')
      .eq('user_id', userId),
    supabase
      .from('ielts_listening_attempts')
      .select('set_id')
      .eq('user_id', userId),
    supabase
      .from('ielts_writing_attempts')
      .select('task_id')
      .eq('user_id', userId),
    supabase
      .from('ielts_speaking_attempts')
      .select('task_id')
      .eq('user_id', userId),
  ]);

  return {
    reading: [...new Set((reading.data || []).map(r => r.set_id))],
    listening: [...new Set((listening.data || []).map(l => l.set_id))],
    writing: [...new Set((writing.data || []).map(w => w.task_id))],
    speaking: [...new Set((speaking.data || []).map(s => s.task_id))],
  };
};
