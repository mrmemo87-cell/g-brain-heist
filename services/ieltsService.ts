import { supabase } from './supabaseClient';

export type IeltsModuleType = 'general' | 'academic';
export type IeltsQuestionType = 'mcq' | 'tfng' | 'short_answer';

export interface IeltsQuestion {
  id: string;
  prompt: string;
  type: IeltsQuestionType;
  options?: string[];
  explanation?: string;
  correctAnswer?: string;
}

export interface IeltsReadingBlock {
  title: string;
  passage: string;
  questions: IeltsQuestion[];
}

export interface IeltsListeningBlock {
  title: string;
  audioScript: string;
  questions: IeltsQuestion[];
}

export interface IeltsWritingTask {
  title?: string;
  prompt: string;
  wordGoal?: number;
}

export interface IeltsQuestionAnalysis {
  questionId: string;
  studentAnswer: string | null;
  correctAnswer: string | null;
  explanation?: string;
  isCorrect?: boolean;
}

export interface IeltsReadingAnalytics {
  correct: number;
  total: number;
  breakdown: IeltsQuestionAnalysis[];
}

export interface IeltsListeningAnalytics extends IeltsReadingAnalytics {}

export interface IeltsWritingFeedback {
  wordCount?: number;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  improvedAnswer?: string;
  originalAnswer?: string;
}

export interface IeltsAnalytics {
  readingAnalytics?: IeltsReadingAnalytics;
  listeningAnalytics?: IeltsListeningAnalytics;
  writingFeedback?: IeltsWritingFeedback;
  summaryText?: string;
}

export interface IeltsSessionRecord {
  id: string;
  status: string;
  module?: IeltsModuleType;
  module_type?: IeltsModuleType;
  target_band?: number | null;
  reference_code: string;
  created_at: string;
  completed_at?: string | null;
  reading_block?: IeltsReadingBlock | null;
  listening_block?: IeltsListeningBlock | null;
  writing_task?: IeltsWritingTask | null;
  reading_answers?: Record<string, string> | null;
  listening_answers?: Record<string, string> | null;
  writing_answer?: string | null;
  band_reading?: number | null;
  band_listening?: number | null;
  band_writing?: number | null;
  band_overall?: number | null;
  analytics?: IeltsAnalytics | null;
}

export interface IeltsSessionSummary {
  id: string;
  module?: IeltsModuleType;
  module_type?: IeltsModuleType;
  status: string;
  reference_code: string;
  band_overall?: number | null;
  created_at: string;
}

const invokeFunction = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<T>('ielts_session', { body });
  if (error) {
    throw new Error(error.message || 'Edge function call failed');
  }
  if (!data) {
    throw new Error('No data returned from edge function');
  }
  return data;
};

export const createPack = async (moduleType: IeltsModuleType, targetBand?: number) => {
  return invokeFunction<IeltsSessionRecord>({ mode: 'create-pack', module: moduleType, targetBand });
};

export const finaliseSession = async (
  sessionId: string,
  readingAnswers: Record<string, string>,
  listeningAnswers: Record<string, string>,
  writingAnswer: string,
) => {
  return invokeFunction<IeltsSessionRecord>({
    mode: 'finalise-session',
    sessionId,
    readingAnswers,
    listeningAnswers,
    writingAnswer,
  });
};

export const getByReference = async (referenceCode: string) => {
  return invokeFunction<IeltsSessionRecord>({ mode: 'get-by-reference', referenceCode });
};

export const fetchRecentSessions = async () => {
  const { data, error } = await supabase
    .from('ielts_sessions')
    .select('id, module, module_type, status, reference_code, band_overall, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as IeltsSessionSummary[];
};

export const fetchSessionById = async (sessionId: string) => {
  const { data, error } = await supabase
    .from('ielts_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Session not found');
  }

  return data as IeltsSessionRecord;
};
