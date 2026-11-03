import { supabase } from './supabaseClient';
import { createIeltsViewCache } from '../src/lib/ieltsViewCache';

/** Self-paced IELTS course ("course path"): ordered units, each a short lesson + practice tasks. */

export type IeltsCourseSkill = 'reading' | 'listening' | 'writing' | 'speaking' | 'vocabulary';

/** The course has two separate paths, each unlocked in its own order. */
export type IeltsCourseTrack = 'main' | 'vocabulary';

export type IeltsCourseAccessReason =
  | 'superadmin'
  | 'prime'
  | 'school_seat'
  | 'school_seat_missing'
  | 'prime_required'
  | 'not_authenticated';

export type IeltsCourseLockedReason = 'needs_access' | 'previous_unit' | null;

export interface IeltsCourseTask {
  skill: IeltsCourseSkill;
  /** Bank task id for reading/listening/writing/speaking; null for vocabulary steps. */
  task_id: number | null;
  /** Vocabulary step code; only for vocabulary steps. */
  task_code?: string | null;
  position: number;
  completed: boolean;
  route: string;
  title?: string | null;
  display_code?: string | null;
  minutes?: number | null;
}

export interface IeltsCourseUnitSummary {
  id: number;
  track?: IeltsCourseTrack;
  position: number;
  slug: string;
  title: string;
  subtitle: string | null;
  focus_skills: IeltsCourseSkill[];
  estimated_minutes: number;
  is_free_preview: boolean;
  lesson_viewed: boolean;
  completed: boolean;
  unlocked: boolean;
  locked_reason: IeltsCourseLockedReason;
  tasks: IeltsCourseTask[];
}

export interface IeltsCourseState {
  access: { full: boolean; reason: IeltsCourseAccessReason };
  current_unit_id: number | null;
  units_total: number;
  units_completed: number;
  units: IeltsCourseUnitSummary[];
  /** The separate vocabulary path. */
  vocabulary?: IeltsCourseTrackState;
}

export interface IeltsCourseTrackState {
  current_unit_id: number | null;
  units_total: number;
  units_completed: number;
  units: IeltsCourseUnitSummary[];
}

/** Stable key for a task link in lists. */
export const ieltsCourseTaskKey = (task: Pick<IeltsCourseTask, 'skill' | 'task_id' | 'task_code'>) =>
  `${task.skill}-${task.task_code ?? task.task_id}`;

export interface IeltsCourseLesson {
  intro?: string;
  sections?: { title: string; body: string }[];
  example?: { label: string; text: string };
  tips?: string[];
}

export interface IeltsCourseUnitDetail extends IeltsCourseUnitSummary {
  lesson: IeltsCourseLesson;
  next_unit_id: number | null;
  prev_unit_id: number | null;
}

export interface IeltsCourseUnitLocked {
  id: number;
  track?: IeltsCourseTrack;
  position: number;
  title: string;
  subtitle: string | null;
  unlocked: false;
  locked_reason: 'needs_access' | 'previous_unit';
  access_reason: IeltsCourseAccessReason;
}

export const IELTS_COURSE_ROUTE = '/ielts/course';
/** The course map opened on the vocabulary path. */
export const IELTS_COURSE_VOCAB_ROUTE = '/ielts/course?path=vocabulary';
export const ieltsCourseMapRoute = (track: IeltsCourseTrack | undefined) =>
  track === 'vocabulary' ? IELTS_COURSE_VOCAB_ROUTE : IELTS_COURSE_ROUTE;
/** 'Unit 3' on the main path, 'V3' on the vocabulary path. */
export const ieltsCourseUnitLabel = (unit: { track?: IeltsCourseTrack; position: number }) =>
  unit.track === 'vocabulary' ? `V${unit.position}` : `Unit ${unit.position}`;
export const ieltsCourseUnitRoute = (unitId: number) => `${IELTS_COURSE_ROUTE}/${unitId}`;

/** Query param carried into a practice page so it can return to the unit afterwards. */
export const IELTS_COURSE_UNIT_PARAM = 'course_unit';

export const ieltsCourseTaskRoute = (task: Pick<IeltsCourseTask, 'route'>, unitId: number) =>
  `${task.route}?${IELTS_COURSE_UNIT_PARAM}=${unitId}`;

export const readIeltsCourseUnitFromSearch = (search = typeof window === 'undefined' ? '' : window.location.search): number | null => {
  const raw = new URLSearchParams(search).get(IELTS_COURSE_UNIT_PARAM);
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
};

const friendly = (error: { message?: string } | null, fallback: string) => {
  const message = error?.message || '';
  if (message === 'not_authenticated') return 'Please sign in to open the IELTS course.';
  if (message === 'unit_locked') return 'This unit is still locked. Finish the previous unit first.';
  if (message === 'unit_not_found') return 'This unit is not available.';
  return fallback;
};

const courseStateCache = createIeltsViewCache<IeltsCourseState>();

/** The course state from the previous visit in this tab, so pages paint immediately and refresh quietly. */
export function cachedIeltsCourseState(): IeltsCourseState | null {
  return courseStateCache.get();
}

export async function fetchIeltsCourseState(): Promise<IeltsCourseState> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_state');
  if (error || !data) throw new Error(friendly(error, 'The course could not load. Please retry.'));
  courseStateCache.set(data as IeltsCourseState);
  return data as IeltsCourseState;
}

const unitHoldsUnlockedTask = (state: IeltsCourseState | null, unitId: number, skill: IeltsCourseSkill, taskId: number) =>
  Boolean(state?.units?.some((unit) => unit.id === unitId && unit.unlocked
    && unit.tasks?.some((task) => task.skill === skill && Number(task.task_id) === taskId)));

/**
 * True when the task is part of an unlocked course unit. Course tasks open even when a school has
 * switched Extra Practice off; the server gate (private.ielts_can_access_practice_content) applies
 * the same rule, so this only keeps the page in step with it.
 */
export async function isUnlockedIeltsCourseTask(unitId: number, skill: IeltsCourseSkill, taskId: number): Promise<boolean> {
  if (unitHoldsUnlockedTask(cachedIeltsCourseState(), unitId, skill, taskId)) return true;
  try {
    return unitHoldsUnlockedTask(await fetchIeltsCourseState(), unitId, skill, taskId);
  } catch {
    return false;
  }
}

export async function fetchIeltsCourseUnit(unitId: number): Promise<IeltsCourseUnitDetail | IeltsCourseUnitLocked> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_unit', { p_unit_id: unitId });
  if (error || !data) throw new Error(friendly(error, 'The unit could not load. Please retry.'));
  return data as IeltsCourseUnitDetail | IeltsCourseUnitLocked;
}

export async function markIeltsCourseLessonViewed(unitId: number): Promise<{ ok: boolean; completed: boolean }> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_mark_lesson_viewed', { p_unit_id: unitId });
  if (error) throw new Error(friendly(error, 'Your progress could not be saved. Please retry.'));
  return (data as { ok: boolean; completed: boolean }) ?? { ok: true, completed: false };
}

export async function syncIeltsCourseProgress(unitId: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_sync_progress', { p_unit_id: unitId });
  if (error) return false;
  return Boolean((data as { completed?: boolean } | null)?.completed);
}

export const ieltsCourseSkillLabel: Record<IeltsCourseSkill, string> = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
  vocabulary: 'Vocabulary',
};

export const ieltsCourseAccessMessage = (reason: IeltsCourseAccessReason): { title: string; body: string; cta: 'prime' | 'school' | null } => {
  switch (reason) {
    case 'prime_required':
      return {
        title: 'Unit 1 is free. The rest of the course is part of IELTS Prime.',
        body: 'Finish the welcome unit, then unlock all 20 units, writing feedback and speaking practice with IELTS Prime.',
        cta: 'prime',
      };
    case 'school_seat_missing':
      return {
        title: 'Your school has not allocated an IELTS seat to you yet.',
        body: 'Unit 1 is open. Ask your school admin to allocate an IELTS programme seat to unlock the full course.',
        cta: 'school',
      };
    default:
      return { title: '', body: '', cta: null };
  }
};

// ---------------------------------------------------------------------------
// Vocabulary path steps (auto-marked practice; never a band or teacher evidence)
// ---------------------------------------------------------------------------

export interface IeltsVocabQuestion {
  id: string;
  prompt: string;
  options?: { value: string; label: string }[] | null;
  answer_format?: 'text' | string | null;
}

export interface IeltsVocabResult {
  attempt_id: string;
  score: number;
  total: number;
  submitted_at: string;
  answers: Record<string, string>;
  outcomes: { id: string; correct: boolean; response_state: 'answered' | 'unanswered'; accepted_answers: string[] }[];
  explanations: Record<string, string>;
  unit_completed?: boolean;
}

export interface IeltsVocabStep {
  code: string;
  unit_id: number;
  unit_title: string;
  step: number;
  steps: number;
  next_code: string | null;
  purpose: 'guided_practice' | 'independent_check' | string;
  title: string;
  display_code: string | null;
  minutes: number | null;
  instructions: string;
  success_description: string | null;
  focus: string | null;
  passage: string | null;
  questions: IeltsVocabQuestion[];
  result: IeltsVocabResult | null;
}

const vocabError = (error: { message?: string } | null, fallback: string) => {
  const message = error?.message || '';
  if (message === 'unit_locked') return 'This step is still locked. Finish the previous vocabulary lesson first.';
  if (message === 'task_not_found' || message === 'task_not_available') return 'This step is not available.';
  if (message === 'too_many_attempts') return 'Take a moment to read the explanations, then try again.';
  return friendly(error, fallback);
};

export const ieltsVocabStepRoute = (code: string) => `/ielts/vocabulary/${encodeURIComponent(code)}`;

export async function fetchIeltsVocabStep(code: string): Promise<IeltsVocabStep> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_vocab_task', { p_code: code });
  if (error || !data) throw new Error(vocabError(error, 'This step could not load. Please retry.'));
  return data as IeltsVocabStep;
}

export async function submitIeltsVocabStep(code: string, answers: Record<string, string>): Promise<IeltsVocabResult> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_vocab_submit', { p_code: code, p_answers: answers });
  if (error || !data) throw new Error(vocabError(error, 'Your answers could not be marked. Please retry.'));
  return data as IeltsVocabResult;
}
