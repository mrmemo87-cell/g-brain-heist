import { supabase } from './supabaseClient';

/**
 * Computer-delivered full mock tests (Diagnostic Bible 2.5.1 sections 2.1A, 5.1, 9.5, 12A).
 * The server owns timing, keys and marking. Nothing here decides a score: the browser only shows the section that is
 * open, saves answers and displays results after the server has marked them.
 */

export type MockSection = 'listening' | 'reading' | 'writing';
export type MockAnswers = Record<string, string>;

export interface MockFigure { src: string; title: string; note: string; alt: string }

export interface MockItem { n: number; prompt: string; options?: string[] }

export interface MockGroup {
  range: [number, number];
  type: 'completion' | 'short' | 'tfng' | 'ynng' | 'mcq' | 'matching' | 'multi';
  instructions: string;
  word_limit?: number;
  form_title?: string;
  options_title?: string;
  options?: string[];
  stem?: string;
  map?: boolean;
  figure?: MockFigure;
  items?: MockItem[];
}

export interface MockListeningPart { part: number; range: [number, number]; groups: MockGroup[] }
export interface MockPassage { n: number; title: string; labelled: boolean; paragraphs: string[]; range: [number, number]; groups: MockGroup[] }
export interface MockWritingTask { prompt: string; minimum_words: number; suggested_minutes: number; figure?: MockFigure }

export interface MockPayload {
  listening?: { parts: MockListeningPart[] };
  reading?: { passages: MockPassage[] };
  writing?: { task1: MockWritingTask; task2: MockWritingTask };
}

export interface MockAudio { url: string; listen_end: number; sample_end: number; review_seconds: number; elapsed: number | null }

export interface MockState {
  attempt_id: string;
  code: string;
  title: string;
  version: string;
  status: 'in_progress' | 'completed';
  section: MockSection | 'done';
  practice: boolean;
  attempt_no: number;
  started: boolean;
  section_started_at: string | null;
  deadline: string | null;
  server_now: string;
  remaining_seconds: number | null;
  section_seconds: number | null;
  audio: MockAudio | null;
  payload: MockPayload['listening'] | MockPayload['reading'] | MockPayload['writing'] | null;
  answers: MockAnswers | null;
  saved_at: string | null;
}

export interface MockAttemptSummary {
  id: string;
  status: 'in_progress' | 'completed';
  section: MockSection | 'done';
  attempt_no: number;
  practice: boolean;
  started_at: string;
  completed_at: string | null;
  listening: number | null;
  reading: number | null;
  writing_reviewed: boolean;
}

export interface MockHomeEntry { code: string; title: string; version: string; available: boolean; minutes: number; attempts: MockAttemptSummary[] }

export interface MockIndicative { label: string; low: number | null; high: number | null; central: number | null }

export interface MockItemOutcome { n: number; response: string | null; state: 'answered' | 'blank'; correct: boolean; key: string }

export interface MockWritingCriteria {
  t1: { ta: number; cc: number; lr: number; gra: number };
  t2: { tr: number; cc: number; lr: number; gra: number };
}

export interface MockResult {
  attempt_id: string;
  code: string;
  title: string;
  version: string;
  status: 'in_progress' | 'completed';
  section?: string;
  practice: boolean;
  attempt_no: number;
  started_at: string;
  completed_at: string | null;
  skills: {
    listening?: { raw: number; indicative: MockIndicative | null; items: MockItemOutcome[] };
    reading?: { raw: number; indicative: MockIndicative | null; items: MockItemOutcome[] };
    writing: {
      t1: string; t2: string; t1_words: number; t2_words: number;
      review: { criteria: MockWritingCriteria; comment: string | null; reviewed_at: string; indicative: MockIndicative | null } | null;
    };
  };
  payload: MockPayload;
}

export interface MockMarkingRow {
  attempt_id: string; code: string; student: string; completed_at: string; practice: boolean; attempt_no: number;
  t1_words: number; t2_words: number; reviewed_at: string | null;
}

export const IELTS_MOCKS_ROUTE = '/ielts/mocks';
export const ieltsMockAttemptRoute = (attemptId: string) => `/ielts/mocks/${attemptId}`;
export const IELTS_MOCK_MARKING_ROUTE = '/ielts/mocks/marking';

const friendly = (message: string): string => {
  if (message.includes('mock_not_available')) return 'This mock test is not open for your account yet.';
  if (message.includes('mock_attempt_not_found')) return 'This test attempt was not found on your account.';
  if (message.includes('not_authenticated')) return 'Please sign in again to continue your test.';
  if (message.includes('invalid_writing_criteria')) return 'Choose a band from 0 to 9 for all eight criteria.';
  if (message.includes('not_authorized')) return 'Only the Brains Heist marking team can open this page.';
  return message || 'Something went wrong. Check your connection and try again.';
};

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
  return data as T;
}

export const fetchMockHome = () => call<MockHomeEntry[]>('rpc_ielts_mock_cbt_home');
export const startMock = (code: string) => call<{ attempt_id: string; resumed: boolean }>('rpc_ielts_mock_cbt_start', { p_code: code });
export const fetchMockState = (attemptId: string) => call<MockState>('rpc_ielts_mock_cbt_state', { p_attempt: attemptId });
export const beginMockSection = (attemptId: string, section: MockSection) =>
  call<MockState>('rpc_ielts_mock_cbt_begin_section', { p_attempt: attemptId, p_section: section });
export const saveMockAnswers = (attemptId: string, section: MockSection, answers: MockAnswers) =>
  call<{ saved: boolean; saved_at?: string; remaining_seconds?: number; reason?: string }>('rpc_ielts_mock_cbt_save', { p_attempt: attemptId, p_section: section, p_answers: answers });
export const finishMockSection = (attemptId: string, section: MockSection, answers: MockAnswers | null) =>
  call<MockState>('rpc_ielts_mock_cbt_finish_section', { p_attempt: attemptId, p_section: section, p_answers: answers });
export const fetchMockResult = (attemptId: string) => call<MockResult>('rpc_ielts_mock_cbt_result', { p_attempt: attemptId });
export const fetchMockMarkingQueue = () => call<MockMarkingRow[]>('rpc_ielts_mock_cbt_marking_queue');
export const markMockWriting = (attemptId: string, criteria: MockWritingCriteria, comment: string) =>
  call<MockResult>('rpc_ielts_mock_cbt_mark_writing', { p_attempt: attemptId, p_criteria: criteria, p_comment: comment });

/** Same rule as the server: words are runs of non-space characters. */
export const countWords = (text: string): number => {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
};

/** Local copy of unsaved answers, only to recover from a lost connection (never trusted by the server). */
const localKey = (attemptId: string, section: MockSection) => `bh_ielts_mock_${attemptId}_${section}`;
export const readLocalAnswers = (attemptId: string, section: MockSection): MockAnswers | null => {
  try {
    const raw = window.localStorage.getItem(localKey(attemptId, section));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as MockAnswers) : null;
  } catch { return null; }
};
export const writeLocalAnswers = (attemptId: string, section: MockSection, answers: MockAnswers) => {
  try { window.localStorage.setItem(localKey(attemptId, section), JSON.stringify(answers)); } catch { /* storage full or blocked */ }
};
export const clearLocalAnswers = (attemptId: string, section: MockSection) => {
  try { window.localStorage.removeItem(localKey(attemptId, section)); } catch { /* ignore */ }
};

/** Letter of an option such as "A  near the lake." */
export const optionLetter = (option: string): string => option.trim().charAt(0).toUpperCase();
export const optionText = (option: string): string => option.trim().replace(/^[A-Z]\s+/, '');

/** Every question number of a group. */
export const groupNumbers = (g: MockGroup): number[] => {
  const out: number[] = [];
  for (let n = g.range[0]; n <= g.range[1]; n += 1) out.push(n);
  return out;
};

/** Question text by number, for result review. */
export const questionTexts = (groups: MockGroup[]): Record<number, string> => {
  const map: Record<number, string> = {};
  for (const g of groups) {
    if (g.type === 'multi') groupNumbers(g).forEach((n) => { map[n] = g.stem ?? ''; });
    else (g.items ?? []).forEach((it) => { map[it.n] = it.prompt; });
  }
  return map;
};

export const sectionLabel: Record<MockSection, string> = { listening: 'Listening', reading: 'Reading', writing: 'Writing' };
