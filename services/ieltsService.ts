import { supabase } from './supabaseClient';
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
