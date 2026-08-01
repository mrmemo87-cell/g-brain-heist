import {
  createEmptyErrorMemory,
  generateWeeklyImprovementPlan,
  MonthlyComparisonResult,
  MonthlyGrowthReport,
  storeAttemptInErrorMemory,
  SupportedGenre,
  WeaknessTag,
  WeeklyImprovementPlan,
  WritingAssessmentResult,
} from './writingAssessment.js';
import { DailyWritingTask, generateDailyWritingTasksForWeek } from './writingTaskGenerator.js';
import { WritingPracticeEvaluationResult } from './writingPracticeEvaluator.js';
import {
  createInitialStudentWritingState,
  runDailyWritingPracticeFlow,
  runInitialWritingAssessmentFlow,
  runMonthlyWritingReviewFlow,
  runWeeklyWritingReviewFlow,
  StudentWritingState,
} from './writingWorkflowOrchestrator.js';
import { WRITING_PILOT_GUARDRAILS } from './writingAdminConfig.js';
import {
  getWritingRepositoryMode,
  loadWritingStoreSnapshot,
  persistWritingStoreSnapshot,
  persistMonthlyWritingReport,
  SerializedWritingPersistenceStore,
} from './writingRepository.js';
import {
  EMAIL_STARTER_PROMPT_TEXT,
  FALLBACK_PROMPT_BY_GENRE,
  gradeToDifficultyLevel,
  parseFocusAndContextTags,
  PromptDifficultyLevel,
  STRUCTURED_WRITING_PROMPT_BANK,
  toCurriculumTagsForStructuredPrompt,
  WEAKNESS_TAG_TO_MISSION_CATEGORY,
  WEAKNESS_TAG_TO_PROMPT_FOCUS,
  WritingPromptContextTag,
  WritingPromptFocusTag,
} from './writingPromptProgression.js';
import {
  WritingCompositionTelemetry,
  WritingIntegrityMode,
  WritingIntegrityReviewStatus,
} from './writingIntegrity.js';

export interface StudentWritingProfile {
  student_id: string;
  student_name?: string;
  grade: number;
  current_genre: SupportedGenre;
  created_at: string;
  updated_at: string;
}

export interface WritingAttempt {
  id: string;
  student_id: string;
  genre: SupportedGenre;
  attempt_type: 'initial_assessment' | 'daily_practice';
  revision_cycle_id?: string;
  attempt_number?: number;
  retry_kind?: 'same_prompt' | 'new_prompt';
  parent_attempt_id?: string | null;
  prompt_id?: string | null;
  created_at: string;
  prompt_text?: string;
  student_submission?: string;
  assessment: WritingAssessmentResult;
  rich_feedback?: unknown;
  feedback_weakness_tags?: WeaknessTag[];
  feedback_weakness_tag_counts?: Partial<Record<WeaknessTag, number>>;
  rich_feedback_source_submission_type?: 'initial';
  rich_feedback_created_at?: string;
  integrity_signals?: WritingCompositionTelemetry;
}

export interface WeeklyWritingPlan {
  id: string;
  student_id: string;
  genre: SupportedGenre;
  week_key: string;
  created_at: string;
  plan: WeeklyImprovementPlan;
}

export interface PersistedDailyWritingTask {
  id: string;
  student_id: string;
  genre: SupportedGenre;
  week_key: string;
  task: DailyWritingTask;
  created_at: string;
}

export interface DailyWritingSubmission {
  id: string;
  student_id: string;
  genre: SupportedGenre;
  task_day_number: number;
  submission_text: string;
  submitted_at: string;
}

export interface DailyPracticeEvaluation {
  id: string;
  student_id: string;
  genre: SupportedGenre;
  task_day_number: number;
  evaluation: WritingPracticeEvaluationResult;
  created_at: string;
}

export interface MonthlyWritingReport {
  id: string;
  student_id: string;
  genre: SupportedGenre;
  month: string;
  comparison: MonthlyComparisonResult;
  report: MonthlyGrowthReport;
  next_month_target_recommendations: string[];
  created_at: string;
}

export interface RepeatedErrorMemorySnapshot {
  id: string;
  student_id: string;
  genre: SupportedGenre;
  created_at: string;
  snapshot: StudentWritingState['repeated_error_memory'];
}

interface WritingPersistenceStore {
  profiles: Map<string, StudentWritingProfile>;
  usernamesById: Record<string, string>;
  states: Map<string, StudentWritingState>;
  attempts: WritingAttempt[];
  weeklyPlans: WeeklyWritingPlan[];
  dailyTasks: PersistedDailyWritingTask[];
  dailySubmissions: DailyWritingSubmission[];
  dailyEvaluations: DailyPracticeEvaluation[];
  monthlyReports: MonthlyWritingReport[];
  memorySnapshots: RepeatedErrorMemorySnapshot[];
  promptBank: WritingPromptRecord[];
  reviewSignals: AdminReviewSignal[];
  calibrationFollowUpByStudent: Record<string, { flagged: boolean; note?: string; updated_at: string }>;
}

const store: WritingPersistenceStore = {
  profiles: new Map(),
  usernamesById: {},
  states: new Map(),
  attempts: [],
  weeklyPlans: [],
  dailyTasks: [],
  dailySubmissions: [],
  dailyEvaluations: [],
  monthlyReports: [],
  memorySnapshots: [],
  promptBank: [],
  reviewSignals: [],
  calibrationFollowUpByStudent: {},
};

const WRITING_STORE_KEY = 'gbh_writing_integration_v2_fallback';
const HYDRATION_TIMEOUT_MS = 12000;
let hydratedStudentId: string | null = null;
let hydrationGeneration = 0;

const getStorage = (): Storage | null => {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return globalThis.localStorage;
    }
  } catch {
    // noop
  }
  return null;
};

const serializeStore = (): SerializedWritingPersistenceStore => ({
  ownerStudentId: hydratedStudentId ?? undefined,
  profiles: [...store.profiles.entries()],
  usernamesById: store.usernamesById,
  states: [...store.states.entries()],
  attempts: store.attempts,
  weeklyPlans: store.weeklyPlans,
  dailyTasks: store.dailyTasks,
  dailySubmissions: store.dailySubmissions,
  dailyEvaluations: store.dailyEvaluations,
  monthlyReports: store.monthlyReports,
  memorySnapshots: store.memorySnapshots,
  promptBank: store.promptBank,
  reviewSignals: store.reviewSignals,
  calibrationFollowUpByStudent: store.calibrationFollowUpByStudent,
});

const GENRE_KEYS: SupportedGenre[] = ['email', 'article', 'review', 'story', 'essay', 'report', 'paragraph'];
const isKnownGenre = (genre: string): genre is SupportedGenre => GENRE_KEYS.includes(genre as SupportedGenre);
const isLikelyUuid = (value?: string): boolean => {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
};
const isReadableStudentLabel = (value?: string): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !isLikelyUuid(value);
const resolveStudentLabel = (studentId: string, preferredName?: string): string => {
  if (isReadableStudentLabel(preferredName)) return preferredName.trim();
  const profileName = store.profiles.get(studentId)?.student_name;
  if (isReadableStudentLabel(profileName)) return profileName.trim();
  const username = store.usernamesById[studentId];
  if (isReadableStudentLabel(username)) return username.trim();
  return 'Student';
};
const buildStateKey = (studentId: string, genre: SupportedGenre): string => `${studentId}::${genre}`;
const parseStateKey = (key: string): { studentId: string; genre: SupportedGenre | null } => {
  const [studentId, rawGenre] = key.split('::');
  if (studentId && rawGenre && isKnownGenre(rawGenre)) return { studentId, genre: rawGenre };
  return { studentId: key, genre: null };
};
const resolveGenreFromState = (state: StudentWritingState | undefined, fallback?: string): SupportedGenre | null => {
  if (state?.current_genre && isKnownGenre(state.current_genre)) return state.current_genre;
  if (fallback && isKnownGenre(fallback)) return fallback;
  return null;
};
const getProfileGenre = (studentId: string): SupportedGenre => {
  const genre = store.profiles.get(studentId)?.current_genre;
  return genre && isKnownGenre(genre) ? genre : 'essay';
};
const getStateForGenre = (studentId: string, genre?: SupportedGenre): StudentWritingState | null => {
  const resolvedGenre = genre ?? getProfileGenre(studentId);
  return store.states.get(buildStateKey(studentId, resolvedGenre)) ?? null;
};
const setStateForGenre = (studentId: string, genre: SupportedGenre, state: StudentWritingState): void => {
  store.states.set(buildStateKey(studentId, genre), { ...state, current_genre: genre });
};

let hydrationTriggered = false;
let hydrationInFlight: Promise<void> | null = null;
let hydrationState: 'idle' | 'loading' | 'ready' | 'degraded' = 'idle';
let lastPersistenceMode: 'db' | 'fallback-local' | 'runtime-only' = 'runtime-only';
let storeMutationVersion = 0;
const hydrationListeners = new Set<(status: 'idle' | 'loading' | 'ready' | 'degraded') => void>();
type WritingPersistenceStatus = {
  state: 'idle' | 'saving' | 'saved' | 'failed';
  message: string | null;
  updated_at: string | null;
};
let persistenceStatus: WritingPersistenceStatus = {
  state: 'idle',
  message: null,
  updated_at: null,
};
const persistenceListeners = new Set<(status: WritingPersistenceStatus) => void>();
const setPersistenceStatus = (next: WritingPersistenceStatus): void => {
  persistenceStatus = next;
  persistenceListeners.forEach((listener) => {
    try {
      listener(persistenceStatus);
    } catch {
      // noop
    }
  });
};
const notifyHydrationListeners = (): void => {
  hydrationListeners.forEach((listener) => {
    try {
      listener(hydrationState);
    } catch {
      // noop
    }
  });
};
const applyFallbackSnapshot = (storage: Storage | null): boolean => {
  if (!storage) return false;
  try {
    const raw = storage.getItem(WRITING_STORE_KEY);
    if (!raw) return false;
    const fallback = JSON.parse(raw) as SerializedWritingPersistenceStore;
    hydratedStudentId = fallback.ownerStudentId ?? null;
    store.profiles = new Map(fallback.profiles as Array<[string, StudentWritingProfile]>);
    store.usernamesById = fallback.usernamesById ?? {};
    const loadedStates = new Map<string, StudentWritingState>();
    (fallback.states as Array<[string, StudentWritingState]>).forEach(([key, value]) => {
      const { studentId, genre } = parseStateKey(key);
      const resolvedGenre = resolveGenreFromState(value, genre ?? undefined);
      if (!resolvedGenre) {
        loadedStates.set(key, value);
        return;
      }
      loadedStates.set(buildStateKey(studentId, resolvedGenre), { ...value, current_genre: resolvedGenre });
    });
    store.states = loadedStates;
    store.attempts = (fallback.attempts ?? []) as WritingAttempt[];
    store.weeklyPlans = (fallback.weeklyPlans ?? []) as WeeklyWritingPlan[];
    store.dailyTasks = (fallback.dailyTasks ?? []) as PersistedDailyWritingTask[];
    store.dailySubmissions = (fallback.dailySubmissions ?? []) as DailyWritingSubmission[];
    store.dailyEvaluations = (fallback.dailyEvaluations ?? []) as DailyPracticeEvaluation[];
    store.monthlyReports = (fallback.monthlyReports ?? []) as MonthlyWritingReport[];
    store.memorySnapshots = (fallback.memorySnapshots ?? []) as RepeatedErrorMemorySnapshot[];
    store.promptBank = (fallback.promptBank ?? []) as WritingPromptRecord[];
    store.reviewSignals = (fallback.reviewSignals ?? []) as AdminReviewSignal[];
    store.calibrationFollowUpByStudent = fallback.calibrationFollowUpByStudent ?? {};
    lastPersistenceMode = 'fallback-local';
    return true;
  } catch {
    return false;
  }
};
const applyHydratedSnapshot = (
  parsed: SerializedWritingPersistenceStore,
  hydrateStartVersion: number,
  reason: 'initial' | 'late-after-timeout',
  generation: number
): void => {
  if (generation !== hydrationGeneration) return;
  if (storeMutationVersion !== hydrateStartVersion) {
    console.warn('[writingIntegrationService] Skipping DB hydration apply due to newer in-memory mutations.');
    hydrationState = 'ready';
    notifyHydrationListeners();
    return;
  }
  if (reason === 'late-after-timeout') {
    console.info('[writingIntegrationService] DB hydration recovered after timeout; applying fresh snapshot.');
  }
  lastPersistenceMode = 'db';
  hydratedStudentId = parsed.ownerStudentId ?? null;
  store.profiles = new Map(parsed.profiles as Array<[string, StudentWritingProfile]>);
  store.usernamesById = parsed.usernamesById ?? {};
  const loadedStates = new Map<string, StudentWritingState>();
  (parsed.states as Array<[string, StudentWritingState]>).forEach(([key, value]) => {
    const { studentId, genre } = parseStateKey(key);
    const resolvedGenre = resolveGenreFromState(value, genre ?? undefined);
    if (!resolvedGenre) {
      loadedStates.set(key, value);
      return;
    }
    loadedStates.set(buildStateKey(studentId, resolvedGenre), { ...value, current_genre: resolvedGenre });
  });
  store.states = loadedStates;
  store.attempts = (parsed.attempts ?? []) as WritingAttempt[];
  store.weeklyPlans = (parsed.weeklyPlans ?? []) as WeeklyWritingPlan[];
  store.dailyTasks = (parsed.dailyTasks ?? []) as PersistedDailyWritingTask[];
  store.dailySubmissions = (parsed.dailySubmissions ?? []) as DailyWritingSubmission[];
  store.dailyEvaluations = (parsed.dailyEvaluations ?? []) as DailyPracticeEvaluation[];
  store.monthlyReports = (parsed.monthlyReports ?? []) as MonthlyWritingReport[];
  store.memorySnapshots = (parsed.memorySnapshots ?? []) as RepeatedErrorMemorySnapshot[];
  store.promptBank = (parsed.promptBank ?? []) as WritingPromptRecord[];
  store.reviewSignals = (parsed.reviewSignals ?? []) as AdminReviewSignal[];
  store.calibrationFollowUpByStudent = parsed.calibrationFollowUpByStudent ?? {};
  hydrationState = 'ready';
  notifyHydrationListeners();
};

const hydrateStore = (): Promise<void> => {
  if (hydrationTriggered) return hydrationInFlight ?? Promise.resolve();
  hydrationTriggered = true;
  hydrationState = 'loading';
  notifyHydrationListeners();
  const generation = ++hydrationGeneration;
  const hydrateStartVersion = storeMutationVersion;
  const storage = getStorage();
  if (getWritingRepositoryMode() !== 'db') {
    if (!applyFallbackSnapshot(storage)) {
      lastPersistenceMode = 'runtime-only';
    }
    hydrationState = 'ready';
    notifyHydrationListeners();
    hydrationInFlight = Promise.resolve();
    return hydrationInFlight;
  }

  const dbLoadPromise = loadWritingStoreSnapshot({ includeLegacyDailyWorkflow: false });
  const dbLoad = Promise.race([
    dbLoadPromise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), HYDRATION_TIMEOUT_MS);
    }),
  ]);

  hydrationInFlight = dbLoad
    .then((parsed) => {
      if (!parsed) {
        lastPersistenceMode = 'runtime-only';
        hydrationState = 'degraded';
        console.warn('[writingIntegrationService] DB hydration unavailable; fallback snapshot disabled for secure runtime.');
        notifyHydrationListeners();
        void dbLoadPromise
          .then((lateParsed) => {
            if (lateParsed) applyHydratedSnapshot(lateParsed, hydrateStartVersion, 'late-after-timeout', generation);
          })
          .catch((error) => {
            console.warn('Writing integration DB late hydration recovery failed.', error);
          });
        return;
      }
      applyHydratedSnapshot(parsed, hydrateStartVersion, 'initial', generation);
    })
    .catch((error) => {
      hydrationState = 'degraded';
      lastPersistenceMode = 'runtime-only';
      console.warn('Writing integration DB hydration failed; fallback snapshot disabled for secure runtime.', error);
      notifyHydrationListeners();
    });
  return hydrationInFlight;
};

const persistStore = (): void => {
  storeMutationVersion += 1;
  const snapshot = serializeStore();
  setPersistenceStatus({ state: 'saving', message: null, updated_at: new Date().toISOString() });
  if (getWritingRepositoryMode() !== 'db') {
    console.warn('[writingIntegrationService] DB persistence is disabled in current runtime; writes will use fallback/local cache only.');
  }
  void persistWritingStoreSnapshot(snapshot)
    .then(() => {
      setPersistenceStatus({ state: 'saved', message: null, updated_at: new Date().toISOString() });
    })
    .catch((error) => {
      console.warn('Writing integration DB persistence failed.', error);
      setPersistenceStatus({
        state: 'failed',
        message: error instanceof Error ? error.message : 'Unable to save writing progress to DB.',
        updated_at: new Date().toISOString(),
      });
    });
  const storage = getStorage();
  // Production writing records belong in Supabase, not in a shared browser profile.
  // Keep the serialized fallback only for test/offline runtimes where DB persistence
  // is intentionally unavailable.
  if (storage && getWritingRepositoryMode() !== 'db') {
    storage.setItem(WRITING_STORE_KEY, JSON.stringify(snapshot));
  }
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const safeText = (value: string | null | undefined): string => escapeHtml(String(value ?? ''));

hydrateStore();

export const getWritingHydrationStatus = (): 'idle' | 'loading' | 'ready' | 'degraded' => {
  hydrateStore();
  return hydrationState;
};

export const retryWritingHydration = (): Promise<void> => {
  hydrationTriggered = false;
  hydrationInFlight = null;
  hydrationState = 'idle';
  notifyHydrationListeners();
  return hydrateStore();
};

const clearStudentScopedWritingStore = (): void => {
  store.profiles.clear();
  store.usernamesById = {};
  store.states.clear();
  store.attempts = [];
  store.weeklyPlans = [];
  store.dailyTasks = [];
  store.dailySubmissions = [];
  store.dailyEvaluations = [];
  store.monthlyReports = [];
  store.memorySnapshots = [];
  store.promptBank = [];
  store.reviewSignals = [];
  store.calibrationFollowUpByStudent = {};
};

export const ensureWritingHydrationForStudent = async (studentId: string): Promise<void> => {
  const expectedStudentId = studentId.trim();
  if (!expectedStudentId) return;
  if (hydrationState === 'ready' && hydratedStudentId === expectedStudentId) return;

  if (hydratedStudentId && hydratedStudentId !== expectedStudentId) {
    clearStudentScopedWritingStore();
    hydratedStudentId = null;
    storeMutationVersion = 0;
  }

  await retryWritingHydration();
  if (hydrationState === 'ready' && hydratedStudentId && hydratedStudentId !== expectedStudentId) {
    clearStudentScopedWritingStore();
    hydrationState = 'degraded';
    lastPersistenceMode = 'runtime-only';
    console.warn('[writingIntegrationService] Writing hydration identity did not match the active student.');
    notifyHydrationListeners();
  }
};

export const subscribeToWritingHydrationStatus = (
  listener: (status: 'idle' | 'loading' | 'ready' | 'degraded') => void
): (() => void) => {
  hydrationListeners.add(listener);
  listener(hydrationState);
  return () => {
    hydrationListeners.delete(listener);
  };
};

export const getWritingPersistenceStatus = (): WritingPersistenceStatus => persistenceStatus;

export const subscribeToWritingPersistenceStatus = (
  listener: (status: WritingPersistenceStatus) => void
): (() => void) => {
  persistenceListeners.add(listener);
  listener(persistenceStatus);
  return () => {
    persistenceListeners.delete(listener);
  };
};

const isValidGenre = (genre: string): genre is SupportedGenre => GENRE_KEYS.includes(genre as SupportedGenre);
const normalizeGrade = (grade: unknown): number | null => {
  const parsed = typeof grade === 'string' ? Number.parseInt(grade, 10) : Number(grade);
  if (!Number.isInteger(parsed) || parsed < 6 || parsed > 12) return null;
  return parsed;
};
const buildId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const weekKey = (isoDate: string): string => isoDate.slice(0, 10);

const WRITING_WEAKNESS_TAGS: WeaknessTag[] = [
  'missed_content_point',
  'partial_content_coverage',
  'irrelevant_detail',
  'under_length',
  'wrong_tone',
  'weak_register_control',
  'weak_genre_convention',
  'weak_audience_awareness',
  'weak_paragraphing',
  'poor_sequencing',
  'weak_linking',
  'repetitive_flow',
  'tense_error',
  'agreement_error',
  'article_error',
  'preposition_error',
  'fragment',
  'run_on',
  'weak_word_choice',
  'spelling_error',
  'punctuation_error',
];
const WRITING_WEAKNESS_TAG_SET = new Set<string>(WRITING_WEAKNESS_TAGS);

const readObjectArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];

const tokenizeWords = (value: string): string[] =>
  value.toLowerCase().match(/[a-z]+/g) ?? [];

const levenshteinDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const replacementCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + replacementCost
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const containsLikelySpellingCorrection = (original: string, better: string): boolean => {
  const originalWords = tokenizeWords(original);
  const betterWords = tokenizeWords(better);
  const removed = originalWords.filter((word) => !betterWords.includes(word));
  const added = betterWords.filter((word) => !originalWords.includes(word));
  return removed.some((before) =>
    before.length >= 4 && added.some((after) => Math.abs(before.length - after.length) <= 2 && levenshteinDistance(before, after) <= 2)
  );
};

const inferFeedbackWeaknessTagCounts = (feedback: Record<string, unknown>): Partial<Record<WeaknessTag, number>> => {
  const counts = new Map<WeaknessTag, number>();
  const increment = (tag: WeaknessTag, amount = 1) => {
    if (amount <= 0) return;
    counts.set(tag, (counts.get(tag) ?? 0) + amount);
  };
  const explicitTags = Array.isArray(feedback['weakness_tags']) ? feedback['weakness_tags'] : [];

  readObjectArray(feedback['grammar_fixes']).forEach((fix) => {
    const issue = typeof fix['issue'] === 'string' ? fix['issue'].toLowerCase() : '';
    const original = typeof fix['original'] === 'string' ? fix['original'] : '';
    const better = typeof fix['better_version'] === 'string' ? fix['better_version'] : '';
    const explicitFixTag = typeof fix['weakness_tag'] === 'string' && WRITING_WEAKNESS_TAG_SET.has(fix['weakness_tag'])
      ? fix['weakness_tag'] as WeaknessTag
      : null;
    if (explicitFixTag) {
      increment(explicitFixTag);
      return;
    }
    const combined = `${issue} ${original} ${better}`;
    if (/agreement|subject.?verb|\bthere is\b.*\bthere are\b|\bthere are\b.*\bthere is\b|\bhas\b.*\bhave\b|\bhave\b.*\bhas\b/i.test(combined)) increment('agreement_error');
    else if (/tense|past tense|present tense|verb time/i.test(combined)) increment('tense_error');
    else if (/\barticle\b|\ba\b.*\ban\b|\ban\b.*\ba\b|\bthe\b/i.test(issue)) increment('article_error');
    else if (/preposition/i.test(issue)) increment('preposition_error');
    else if (/fragment|incomplete sentence/i.test(issue)) increment('fragment');
    else if (/run.?on|sentence boundary/i.test(issue)) increment('run_on');
    else if (/spelling|misspell|typo/i.test(issue) || containsLikelySpellingCorrection(original, better)) increment('spelling_error');
  });
  readObjectArray(feedback['punctuation_fixes']).forEach((fix) => {
    const tag = typeof fix['weakness_tag'] === 'string' && WRITING_WEAKNESS_TAG_SET.has(fix['weakness_tag'])
      ? fix['weakness_tag'] as WeaknessTag
      : 'punctuation_error';
    increment(tag);
  });
  readObjectArray(feedback['natural_phrase_upgrades']).forEach((fix) => {
    const tag = typeof fix['weakness_tag'] === 'string' && WRITING_WEAKNESS_TAG_SET.has(fix['weakness_tag'])
      ? fix['weakness_tag'] as WeaknessTag
      : 'weak_word_choice';
    increment(tag);
  });
  increment('weak_register_control', readObjectArray(feedback['style_tone_feedback']).length);
  explicitTags.forEach((tag) => {
    if (typeof tag === 'string' && WRITING_WEAKNESS_TAG_SET.has(tag) && !counts.has(tag as WeaknessTag)) {
      increment(tag as WeaknessTag);
    }
  });
  return Object.fromEntries([...counts.entries()].filter(([, count]) => count > 0));
};

const inferFeedbackWeaknessTags = (feedback: Record<string, unknown>): WeaknessTag[] =>
  Object.keys(inferFeedbackWeaknessTagCounts(feedback)) as WeaknessTag[];

const rebuildRepeatedErrorMemoryForGenre = (
  studentId: string,
  genre: SupportedGenre
): StudentWritingState['repeated_error_memory'] => {
  let memory = createEmptyErrorMemory();
  store.attempts
    .filter((attempt) => attempt.student_id === studentId && attempt.genre === genre && Boolean(attempt.assessment))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .forEach((attempt) => {
      memory = storeAttemptInErrorMemory(memory, studentId, attempt.assessment, attempt.created_at);
    });
  return memory;
};

const synchronizeSavedFeedbackWeaknessMemory = (
  studentId: string,
  genre: SupportedGenre
): boolean => {
  let changed = false;
  store.attempts
    .filter((attempt) => attempt.student_id === studentId && attempt.genre === genre)
    .forEach((attempt) => {
      if (!attempt.rich_feedback || typeof attempt.rich_feedback !== 'object' || Array.isArray(attempt.rich_feedback)) return;
      const feedback = attempt.rich_feedback as Record<string, unknown>;
      const feedbackTagCounts = inferFeedbackWeaknessTagCounts(feedback);
      const feedbackTags = Object.keys(feedbackTagCounts) as WeaknessTag[];
      const mergedTags = [...new Set([...attempt.assessment.weakness_tags, ...feedbackTags])];
      const storedFeedbackTags = attempt.feedback_weakness_tags ?? [];
      const storedFeedbackTagCounts = attempt.feedback_weakness_tag_counts ?? {};
      if (
        mergedTags.length === attempt.assessment.weakness_tags.length
        && feedbackTags.length === storedFeedbackTags.length
        && feedbackTags.every((tag) => storedFeedbackTags.includes(tag))
        && feedbackTags.every((tag) => storedFeedbackTagCounts[tag] === feedbackTagCounts[tag])
      ) return;
      attempt.feedback_weakness_tags = feedbackTags;
      attempt.feedback_weakness_tag_counts = feedbackTagCounts;
      feedback['weakness_tag_counts'] = feedbackTagCounts;
      attempt.assessment = {
        ...attempt.assessment,
        weakness_tags: mergedTags,
      };
      changed = true;
    });
  if (!changed) return false;

  const state = getStateForGenre(studentId, genre);
  if (!state) return false;
  const memory = rebuildRepeatedErrorMemoryForGenre(studentId, genre);
  const latestAttempt = store.attempts
    .filter((attempt) => attempt.student_id === studentId && attempt.genre === genre)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  if (!latestAttempt) return false;
  const weeklyPlan = generateWeeklyImprovementPlan({
    assessment: latestAttempt.assessment,
    grade: state.grade,
    genre,
    repeatedErrorMemory: memory,
    studentId,
  });
  const dailyTasks = generateDailyWritingTasksForWeek({
    weekly_plan: weeklyPlan,
    latest_assessment: latestAttempt.assessment,
    grade: state.grade,
    target_genre: genre,
    repeated_error_memory: memory,
    student_id: studentId,
  });
  setStateForGenre(studentId, genre, {
    ...state,
    latest_assessment: latestAttempt.assessment,
    repeated_error_memory: memory,
    active_week_plan: weeklyPlan,
    active_daily_tasks: dailyTasks,
  });
  const currentWeek = store.weeklyPlans
    .filter((plan) => plan.student_id === studentId && plan.genre === genre)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  if (currentWeek) currentWeek.plan = weeklyPlan;
  persistStore();
  return true;
};

interface ServiceResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const badRequest = <T>(message: string): ServiceResponse<T> => ({ ok: false, error: message });
const ok = <T>(data: T): ServiceResponse<T> => ({ ok: true, data });

interface SubmitInitialWritingAssessmentInput {
  student_id: string;
  student_name?: string;
  grade: number | string;
  genre: string;
  prompt_text: string;
  target_word_count: number;
  student_response: string;
  revision_cycle_id?: string;
  attempt_number?: number;
  retry_kind?: 'same_prompt' | 'new_prompt';
  parent_attempt_id?: string | null;
  prompt_id?: string | null;
  attempted_at?: string;
  integrity_signals?: WritingCompositionTelemetry;
}

interface SubmitDailyWritingPracticeInput {
  student_id: string;
  genre?: string;
  day_number: number;
  submission_text: string;
  revision_cycle_id?: string;
  attempt_number?: number;
  retry_kind?: 'same_prompt' | 'new_prompt';
  parent_attempt_id?: string | null;
  prompt_id?: string | null;
  submitted_at?: string;
}

export const submitInitialWritingAssessment = (
  input: SubmitInitialWritingAssessmentInput
): ServiceResponse<{
  attempt_id: string;
  assessment_result: WritingAssessmentResult;
  weekly_plan: WeeklyImprovementPlan;
  daily_tasks: DailyWritingTask[];
  writing_state: StudentWritingState;
}> => {
  if (!input.student_id?.trim()) return badRequest('student_id is required.');
  const normalizedGrade = normalizeGrade(input.grade);
  if (normalizedGrade === null) return badRequest('grade must be an integer between 6 and 12.');
  if (!isValidGenre(input.genre)) return badRequest('genre is invalid.');
  const normalizedGenre: SupportedGenre = input.genre;
  if (!input.prompt_text?.trim()) return badRequest('prompt_text is required.');
  if (!Number.isFinite(input.target_word_count) || input.target_word_count < 20) return badRequest('target_word_count must be >= 20.');
  if (!input.student_response?.trim()) return badRequest('student_response is required.');

  const existingState = getStateForGenre(input.student_id, normalizedGenre) ?? createInitialStudentWritingState(input.student_id, normalizedGrade, normalizedGenre);
  const flow = runInitialWritingAssessmentFlow({
    ...input,
    grade: normalizedGrade,
    genre: normalizedGenre,
    current_state: existingState,
    attempted_at: input.attempted_at,
  });

  const now = input.attempted_at ?? new Date().toISOString();
  const profile: StudentWritingProfile = {
    student_id: input.student_id,
    student_name: input.student_name?.trim() || store.profiles.get(input.student_id)?.student_name,
    grade: normalizedGrade,
    current_genre: normalizedGenre,
    created_at: store.profiles.get(input.student_id)?.created_at ?? now,
    updated_at: now,
  };

  store.profiles.set(input.student_id, profile);
  setStateForGenre(input.student_id, normalizedGenre, flow.updated_writing_state);

  const attemptId = buildId('attempt');
  store.attempts.push({
    id: attemptId,
    student_id: input.student_id,
    genre: normalizedGenre,
    attempt_type: 'initial_assessment',
    revision_cycle_id: input.revision_cycle_id,
    attempt_number: input.attempt_number,
    retry_kind: input.retry_kind,
    parent_attempt_id: input.parent_attempt_id ?? null,
    prompt_id: input.prompt_id ?? null,
    created_at: now,
    prompt_text: input.prompt_text,
    student_submission: input.student_response,
    assessment: flow.assessment_result,
    integrity_signals: input.integrity_signals,
  });

  const wk = weekKey(now);
  store.weeklyPlans.push({
    id: buildId('week'),
    student_id: input.student_id,
    genre: normalizedGenre,
    week_key: wk,
    created_at: now,
    plan: flow.weekly_plan,
  });

  flow.daily_tasks.forEach((task) => {
    store.dailyTasks.push({
      id: buildId('task'),
      student_id: input.student_id,
      genre: normalizedGenre,
      week_key: wk,
      task,
      created_at: now,
    });
  });

  store.memorySnapshots.push({
    id: buildId('mem'),
    student_id: input.student_id,
    genre: normalizedGenre,
    created_at: now,
    snapshot: flow.updated_writing_state.repeated_error_memory,
  });
  persistStore();

  return ok({
    attempt_id: attemptId,
    assessment_result: flow.assessment_result,
    weekly_plan: flow.weekly_plan,
    daily_tasks: flow.daily_tasks,
    writing_state: flow.updated_writing_state,
  });
};

export const getStudentWritingState = (studentId: string, genre?: SupportedGenre): ServiceResponse<StudentWritingState> => {
  hydrateStore();
  const resolvedGenre = genre ?? getProfileGenre(studentId);
  synchronizeSavedFeedbackWeaknessMemory(studentId, resolvedGenre);
  const state = getStateForGenre(studentId, resolvedGenre);
  if (!state) {
    const profile = store.profiles.get(studentId);
    if (!profile) return badRequest('student writing state not found.');

    const seededState = createInitialStudentWritingState(studentId, profile.grade, resolvedGenre);
    setStateForGenre(studentId, resolvedGenre, seededState);
    store.profiles.set(studentId, {
      ...profile,
      current_genre: resolvedGenre,
      updated_at: new Date().toISOString(),
    });
    persistStore();
    return ok(seededState);
  }
  return ok(state);
};

export interface StudentWritingHubSnapshot {
  original_prompt_text: string | null;
  first_attempt_assessment: WritingAssessmentResult | null;
  first_attempt_submission: string | null;
  first_attempt_rich_feedback: unknown | null;
  first_attempt_rich_feedback_source_submission_type: 'initial' | null;
  first_attempt_rich_feedback_created_at: string | null;
}

export interface StudentWritingHistoryEntry {
  id: string;
  genre: SupportedGenre;
  attempt_type: WritingAttempt['attempt_type'];
  prompt_id: string | null;
  created_at: string;
  prompt_text: string;
  student_submission: string;
  total_score: number | null;
  assessment: WritingAssessmentResult | null;
  rich_feedback: unknown | null;
  integrity_signals: WritingCompositionTelemetry | null;
  weakness_tags: WeaknessTag[];
  weakness_tag_counts: Partial<Record<WeaknessTag, number>>;
  has_feedback: boolean;
  feedback_summary: string | null;
  feedback_next_move: string | null;
  grammar_issue_count: number;
  punctuation_issue_count: number;
  feedback_quick_fixes: Array<{
    type: string;
    original: string;
    better: string;
    explanation: string;
  }>;
  rubric_scores: {
    content: number | null;
    organisation: number | null;
    language: number | null;
    communicative_achievement: number | null;
  };
}

export interface StudentWritingHistoryByGenre {
  genre: SupportedGenre;
  entries: StudentWritingHistoryEntry[];
}

export interface StudentGenrePathStatus {
  genre: SupportedGenre;
  status: 'not_started' | 'week_active' | 'week_complete';
  current_day: number | null;
  completed_tasks_count: number;
  total_tasks_count: number;
  latest_score: number | null;
}

export const getStudentWritingHubSnapshot = (studentId: string, genre?: SupportedGenre): ServiceResponse<StudentWritingHubSnapshot> => {
  hydrateStore();
  const targetGenre = genre ?? getProfileGenre(studentId);
  const studentAttempts = store.attempts
    .filter((attempt) => attempt.student_id === studentId && attempt.genre === targetGenre)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const firstInitialAttempt = studentAttempts.find((attempt) => attempt.attempt_type === 'initial_assessment') ?? null;
  return ok({
    original_prompt_text: firstInitialAttempt?.prompt_text ?? null,
    first_attempt_assessment: firstInitialAttempt?.assessment ?? null,
    first_attempt_submission: firstInitialAttempt?.student_submission ?? null,
    first_attempt_rich_feedback: firstInitialAttempt?.rich_feedback ?? null,
    first_attempt_rich_feedback_source_submission_type: firstInitialAttempt?.rich_feedback_source_submission_type ?? null,
    first_attempt_rich_feedback_created_at: firstInitialAttempt?.rich_feedback_created_at ?? null,
  });
};

export const listStudentWritingHistoryByGenre = (studentId: string): ServiceResponse<StudentWritingHistoryByGenre[]> => {
  if (!studentId?.trim()) return badRequest('student_id is required.');

  hydrateStore();
  const byGenre = new Map<SupportedGenre, StudentWritingHistoryEntry[]>();
  GENRE_KEYS.forEach((genre) => byGenre.set(genre, []));

  const studentAttempts = store.attempts
    .filter((attempt) => attempt.student_id === studentId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const dedupedAttempts = new Map<string, WritingAttempt>();
  studentAttempts.forEach((attempt) => {
    const key = `${attempt.genre}|${attempt.attempt_type}|${attempt.created_at}|${(attempt.student_submission ?? '').trim()}`;
    const current = dedupedAttempts.get(key);
    if (!current) {
      dedupedAttempts.set(key, attempt);
      return;
    }
    const currentHasRich = Boolean(current.rich_feedback && typeof current.rich_feedback === 'object');
    const nextHasRich = Boolean(attempt.rich_feedback && typeof attempt.rich_feedback === 'object');
    if (!currentHasRich && nextHasRich) dedupedAttempts.set(key, attempt);
  });

  Array.from(dedupedAttempts.values()).forEach((attempt) => {
    const feedback = (attempt.rich_feedback && typeof attempt.rich_feedback === 'object')
      ? (attempt.rich_feedback as Record<string, unknown>)
      : null;
    const summary = typeof feedback?.['task_understanding'] === 'string' && feedback['task_understanding'].trim()
      ? feedback['task_understanding'].trim()
      : null;
    const nextMove = typeof feedback?.['next_move'] === 'string' && feedback['next_move'].trim()
      ? feedback['next_move'].trim()
      : null;

    const entry: StudentWritingHistoryEntry = {
      id: attempt.id,
      genre: attempt.genre,
      attempt_type: attempt.attempt_type,
      prompt_id: attempt.prompt_id ?? null,
      created_at: attempt.created_at,
      prompt_text: attempt.prompt_text?.trim() ?? '',
      student_submission: attempt.student_submission?.trim() ?? '',
      total_score: attempt.assessment?.total_score ?? null,
      assessment: attempt.assessment ?? null,
      rich_feedback: feedback,
      integrity_signals: attempt.integrity_signals ?? null,
      weakness_tags: attempt.assessment?.weakness_tags ?? [],
      weakness_tag_counts: attempt.feedback_weakness_tag_counts ?? {},
      has_feedback: Boolean(feedback),
      feedback_summary: summary,
      feedback_next_move: nextMove,
      grammar_issue_count: Math.max(
        readObjectArray(feedback?.['grammar_fixes']).length,
        attempt.assessment?.weakness_tags?.filter((tag) => /agreement|tense|article|preposition|fragment|run_on|spelling/i.test(String(tag))).length ?? 0
      ),
      punctuation_issue_count: Math.max(
        readObjectArray(feedback?.['punctuation_fixes']).length,
        attempt.assessment?.weakness_tags?.filter((tag) => /punctuation|capital/i.test(String(tag))).length ?? 0
      ),
      feedback_quick_fixes: Array.isArray(feedback?.['quick_fixes'])
          ? (feedback?.['quick_fixes'] as Array<Record<string, unknown>>).map((item) => ({
            type: typeof item?.['type'] === 'string' ? item['type'] : 'Language',
            original: typeof item?.['original'] === 'string' ? item['original'] : '',
            better: typeof item?.['betterVersion'] === 'string' ? item['betterVersion'] : '',
            explanation: typeof item?.['explanation'] === 'string' ? item['explanation'] : '',
          }))
        : [
            ...(((feedback?.['grammar_fixes'] as Array<Record<string, unknown>> | undefined) ?? []).map((item) => ({
              type: 'Grammar',
              original: typeof item?.['original'] === 'string' ? item['original'] : '',
              better: typeof item?.['better_version'] === 'string' ? item['better_version'] : '',
              explanation: '',
            }))),
            ...(((feedback?.['punctuation_fixes'] as Array<Record<string, unknown>> | undefined) ?? []).map((item) => ({
              type: 'Punctuation',
              original: typeof item?.['original'] === 'string' ? item['original'] : '',
              better: typeof item?.['better_version'] === 'string' ? item['better_version'] : '',
              explanation: '',
            }))),
            ...(((feedback?.['natural_phrase_upgrades'] as Array<Record<string, unknown>> | undefined) ?? []).map((item) => ({
              type: 'Phrasing',
              original: typeof item?.['original'] === 'string' ? item['original'] : '',
              better: typeof item?.['better_version'] === 'string' ? item['better_version'] : '',
              explanation: typeof item?.['why_it_helps'] === 'string' ? item['why_it_helps'] : '',
            }))),
          ],
      rubric_scores: {
        content: attempt.assessment?.subscores?.content ?? null,
        organisation: attempt.assessment?.subscores?.organisation ?? null,
        language: attempt.assessment?.subscores?.language ?? null,
        communicative_achievement: attempt.assessment?.subscores?.communicative_achievement ?? null,
      },
    };
    const currentEntries = byGenre.get(attempt.genre) ?? [];
    currentEntries.push(entry);
    byGenre.set(attempt.genre, currentEntries);
  });

  return ok(GENRE_KEYS.map((genre) => ({ genre, entries: byGenre.get(genre) ?? [] })));
};

export const getStudentPromptAttemptCount = (input: {
  student_id: string;
  genre: SupportedGenre;
  prompt_text: string;
}): ServiceResponse<{ count: number }> => {
  if (!input.student_id?.trim()) return badRequest('student_id is required.');
  if (!input.prompt_text?.trim()) return badRequest('prompt_text is required.');
  hydrateStore();
  const normalizePrompt = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const targetPrompt = normalizePrompt(input.prompt_text);
  const count = store.attempts.filter(
    (attempt) =>
      attempt.student_id === input.student_id &&
      attempt.genre === input.genre &&
      normalizePrompt(attempt.prompt_text ?? '') === targetPrompt
  ).length;
  return ok({ count });
};

export const persistInitialWritingRichFeedback = (input: {
  student_id: string;
  genre: SupportedGenre;
  attempt_id?: string;
  rich_feedback: unknown;
  created_at?: string;
}): ServiceResponse<{ saved: boolean }> => {
  if (!input.student_id?.trim()) return badRequest('student_id is required.');
  if (!input.rich_feedback || typeof input.rich_feedback !== 'object') return badRequest('rich_feedback is required.');

  hydrateStore();
  const attempts = store.attempts
    .filter(
      (attempt) =>
        attempt.student_id === input.student_id &&
        attempt.genre === input.genre &&
        attempt.attempt_type === 'initial_assessment'
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const targetAttempt = input.attempt_id
    ? attempts.find((attempt) => attempt.id === input.attempt_id)
    : attempts[0];
  if (!targetAttempt) return badRequest('initial assessment attempt not found.');

  const richFeedbackClone = JSON.parse(JSON.stringify(input.rich_feedback)) as Record<string, unknown>;
  const fingerprint =
    typeof richFeedbackClone['text_fingerprint'] === 'string' && richFeedbackClone['text_fingerprint'].trim()
      ? richFeedbackClone['text_fingerprint'].trim()
      : null;
  if (fingerprint) {
    richFeedbackClone['text_fingerprint'] = fingerprint;
  } else {
    delete richFeedbackClone['text_fingerprint'];
    // Compatibility mode for older feedback payloads: keep guidance text, but never preserve anchor fields without trust fingerprint.
    delete richFeedbackClone['anchor_version'];
    delete richFeedbackClone['highlights'];
    delete richFeedbackClone['repair_steps'];
  }
  targetAttempt.rich_feedback = richFeedbackClone;
  const feedbackWeaknessTagCounts = inferFeedbackWeaknessTagCounts(richFeedbackClone);
  const feedbackWeaknessTags = inferFeedbackWeaknessTags(richFeedbackClone);
  targetAttempt.feedback_weakness_tags = feedbackWeaknessTags;
  targetAttempt.feedback_weakness_tag_counts = feedbackWeaknessTagCounts;
  richFeedbackClone['weakness_tag_counts'] = feedbackWeaknessTagCounts;
  targetAttempt.assessment = {
    ...targetAttempt.assessment,
    weakness_tags: [...new Set([
      ...targetAttempt.assessment.weakness_tags,
      ...feedbackWeaknessTags,
    ])],
  };
  targetAttempt.rich_feedback_source_submission_type = 'initial';
  targetAttempt.rich_feedback_created_at = input.created_at ?? new Date().toISOString();

  const state = getStateForGenre(input.student_id, input.genre);
  if (state) {
    const memory = rebuildRepeatedErrorMemoryForGenre(input.student_id, input.genre);
    const latestAttempt = attempts
      .slice()
      .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? targetAttempt;
    const latestAssessment = latestAttempt.assessment;
    const weeklyPlan = generateWeeklyImprovementPlan({
      assessment: latestAssessment,
      grade: state.grade,
      genre: input.genre,
      repeatedErrorMemory: memory,
      studentId: input.student_id,
    });
    const dailyTasks = generateDailyWritingTasksForWeek({
      weekly_plan: weeklyPlan,
      latest_assessment: latestAssessment,
      grade: state.grade,
      target_genre: input.genre,
      repeated_error_memory: memory,
      student_id: input.student_id,
    });
    setStateForGenre(input.student_id, input.genre, {
      ...state,
      latest_assessment: latestAssessment,
      repeated_error_memory: memory,
      active_week_plan: weeklyPlan,
      active_daily_tasks: dailyTasks,
    });
    const currentWeek = store.weeklyPlans
      .filter((plan) => plan.student_id === input.student_id && plan.genre === input.genre)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
    if (currentWeek) currentWeek.plan = weeklyPlan;
  }
  persistStore();
  return ok({ saved: true });
};

export const getStudentGenrePathStatuses = (
  studentId: string,
  genres: SupportedGenre[]
): ServiceResponse<StudentGenrePathStatus[]> => {
  hydrateStore();
  const statuses = genres.map((genreItem) => {
    const state = getStateForGenre(studentId, genreItem);
    const totalTasks = state?.active_daily_tasks.length ?? 0;
    const completed = state?.completed_daily_tasks.length ?? 0;
    const hasStarted = Boolean(state?.latest_assessment || completed > 0 || totalTasks > 0);
    const isWeekComplete = hasStarted && totalTasks > 0 && completed >= totalTasks;
    const nextTask = state?.active_daily_tasks.find((task) => !new Set(state.completed_daily_tasks.map((item) => item.task.day_number)).has(task.day_number));
    return {
      genre: genreItem,
      status: !hasStarted ? 'not_started' : isWeekComplete ? 'week_complete' : 'week_active',
      current_day: nextTask?.day_number ?? null,
      completed_tasks_count: completed,
      total_tasks_count: totalTasks,
      latest_score: state?.latest_assessment?.total_score ?? null,
    } satisfies StudentGenrePathStatus;
  });
  return ok(statuses);
};

export const getCurrentWeeklyPlan = (studentId: string, genre?: SupportedGenre): ServiceResponse<WeeklyImprovementPlan> => {
  hydrateStore();
  const state = getStateForGenre(studentId, genre);
  if (!state || !state.active_week_plan) return badRequest('active weekly plan not found.');
  return ok(state.active_week_plan);
};

export const getTodayWritingTask = (studentId: string, genre?: SupportedGenre): ServiceResponse<DailyWritingTask> => {
  hydrateStore();
  const state = getStateForGenre(studentId, genre);
  if (!state) return badRequest('student writing state not found.');

  const completedDays = new Set(state.completed_daily_tasks.map((item) => item.task.day_number));
  const nextTask = state.active_daily_tasks.find((task) => !completedDays.has(task.day_number));
  if (!nextTask) return badRequest('no pending daily task found.');
  return ok(nextTask);
};

export const submitDailyWritingPractice = (
  input: SubmitDailyWritingPracticeInput
): ServiceResponse<{
  attempt_id: string | null;
  evaluation: WritingPracticeEvaluationResult;
  writing_state: StudentWritingState;
}> => {
  if (!input.student_id?.trim()) return badRequest('student_id is required.');
  const normalizedGenre = input.genre && isValidGenre(input.genre) ? input.genre : getProfileGenre(input.student_id);
  if (!Number.isInteger(input.day_number) || input.day_number <= 0) return badRequest('day_number must be a positive integer.');
  if (!input.submission_text?.trim()) return badRequest('submission_text is required.');

  const state = getStateForGenre(input.student_id, normalizedGenre);
  if (!state) return badRequest('student writing state not found.');

  const task = state.active_daily_tasks.find((item) => item.day_number === input.day_number);
  if (!task) return badRequest('daily task not found for provided day_number.');

  const submittedAt = input.submitted_at ?? new Date().toISOString();
  const flow = runDailyWritingPracticeFlow({
    student_id: input.student_id,
    daily_task: task,
    student_submission: input.submission_text,
    writing_state: state,
    completed_at: submittedAt,
  });

  setStateForGenre(input.student_id, normalizedGenre, flow.updated_writing_state);
  store.dailySubmissions.push({
    id: buildId('submission'),
    student_id: input.student_id,
    genre: normalizedGenre,
    task_day_number: input.day_number,
    submission_text: input.submission_text,
    submitted_at: submittedAt,
  });
  store.dailyEvaluations.push({
    id: buildId('evaluation'),
    student_id: input.student_id,
    genre: normalizedGenre,
    task_day_number: input.day_number,
    evaluation: flow.practice_evaluation_result,
    created_at: submittedAt,
  });

  let attemptId: string | null = null;
  if (flow.updated_writing_state.latest_assessment) {
    attemptId = buildId('attempt');
    store.attempts.push({
      id: attemptId,
      student_id: input.student_id,
      genre: normalizedGenre,
      attempt_type: 'daily_practice',
      revision_cycle_id: input.revision_cycle_id,
      attempt_number: input.attempt_number,
      retry_kind: input.retry_kind,
      parent_attempt_id: input.parent_attempt_id ?? null,
      prompt_id: input.prompt_id ?? null,
      created_at: submittedAt,
      student_submission: input.submission_text,
      assessment: flow.updated_writing_state.latest_assessment,
    });
  }

  store.memorySnapshots.push({
    id: buildId('mem'),
    student_id: input.student_id,
    genre: normalizedGenre,
    created_at: submittedAt,
    snapshot: flow.updated_writing_state.repeated_error_memory,
  });
  persistStore();

  return ok({
    attempt_id: attemptId,
    evaluation: flow.practice_evaluation_result,
    writing_state: flow.updated_writing_state,
  });
};

export const getWeeklyWritingReview = (
  studentId: string,
  genre?: SupportedGenre
): ServiceResponse<ReturnType<typeof runWeeklyWritingReviewFlow>> => {
  hydrateStore();
  const state = getStateForGenre(studentId, genre);
  if (!state) return badRequest('student writing state not found.');
  const review = runWeeklyWritingReviewFlow({ student_id: studentId, completed_week_state: state });
  return ok(review);
};

export const getMonthlyWritingReport = (
  studentId: string,
  month: string,
  genre?: SupportedGenre
): ServiceResponse<MonthlyReviewFlowOutputShape> => {
  hydrateStore();
  const resolvedGenre = genre ?? getProfileGenre(studentId);
  const state = getStateForGenre(studentId, resolvedGenre);
  if (!state) return badRequest('student writing state not found.');
  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest('month must be in YYYY-MM format.');
  const hasActivity = Boolean(state.latest_assessment || state.completed_daily_tasks.length > 0);
  if (!hasActivity) return badRequest('monthly report unavailable until writing activity exists.');

  const existing = store.monthlyReports
    .filter((item) => item.student_id === studentId && item.genre === resolvedGenre && item.month === month)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  if (existing) {
    return ok({
      monthly_comparison_summary: existing.comparison,
      student_facing_monthly_report: existing.report,
      next_month_target_recommendations: existing.next_month_target_recommendations,
    });
  }

  const review = runMonthlyWritingReviewFlow({
    student_id: studentId,
    month,
    writing_state: state,
  });

  const createdAt = new Date().toISOString();
  const reportRecord: MonthlyWritingReport = {
    id: buildId('month'),
    student_id: studentId,
    genre: resolvedGenre,
    month,
    comparison: review.monthly_comparison_summary,
    report: review.student_facing_monthly_report,
    next_month_target_recommendations: review.next_month_target_recommendations,
    created_at: createdAt,
  };
  store.monthlyReports.push(reportRecord);
  void persistMonthlyWritingReport(reportRecord).catch((error) => {
    console.warn('Writing monthly report persistence failed.', error);
  });

  return ok({
    monthly_comparison_summary: review.monthly_comparison_summary,
    student_facing_monthly_report: review.student_facing_monthly_report,
    next_month_target_recommendations: review.next_month_target_recommendations,
  });
};

interface MonthlyReviewFlowOutputShape {
  monthly_comparison_summary: MonthlyComparisonResult;
  student_facing_monthly_report: MonthlyGrowthReport;
  next_month_target_recommendations: string[];
}

export interface WritingMonitoringOverview {
  period?: string;
  class_rows?: Array<{
    class_id: string;
    class_name: string;
    current_grade: number | null;
    student_count: number;
    submission_count: number;
    all_time_submission_count: number;
  }>;
  student_rows: Array<{
    student_name: string;
    student_id: string;
    current_grade: number;
    completion_rate: number;
    latest_score: number | null;
    latest_subscale_scores: {
      content: number | null;
      communicative_achievement: number | null;
      organisation: number | null;
      language: number | null;
    };
    subscale_trend: {
      content: number;
      communicative_achievement: number;
      organisation: number;
      language: number;
    };
    repeated_weakness_hotspots: string[];
    weekly_target_summary: string;
    stalled: boolean;
    improving: boolean;
    ready_for_monthly_review: boolean;
    attempts_count: number;
    class_id?: string | null;
    class_name?: string;
    submission_count?: number;
    all_time_submission_count?: number;
    focus_area_counts?: Array<{ tag: string; count: number }>;
    baseline_submission_count?: number;
    practice_assigned_count?: number;
    practice_completed_count?: number;
    practice_completion_rate?: number;
    status?: 'not_started' | 'plan_ready' | 'needs_review' | 'needs_support' | 'improving' | 'on_track';
    status_reason?: string;
    latest_attempt_at?: string | null;
    latest_integrity_signals?: WritingCompositionTelemetry | null;
    integrity_mode?: WritingIntegrityMode;
  }>;
  hotspot_tags: string[];
  stalled_students: string[];
  monthly_review_ready_students: string[];
}

export type PromptSafetyStatus = 'approved' | 'review_required' | 'blocked';
export type PromptDifficultyLabel = 'foundational' | 'core' | 'stretch';
export type AdminReviewStatus = 'approved' | 'questionable' | 'needs_calibration_review';
export type AdminReviewEntityType = 'assessment' | 'task' | 'report';

export interface WritingPromptRecord {
  id: string;
  title: string;
  prompt_text: string;
  genre: SupportedGenre;
  grade_band: string;
  target_word_count: number;
  difficulty_label: PromptDifficultyLabel;
  curriculum_tags: string[];
  safety_status: PromptSafetyStatus;
  is_active: boolean;
  is_archived: boolean;
  usage_count: number;
  rotation_metadata: {
    last_used_at: string | null;
    recent_student_usage: Record<string, string[]>;
  };
  prompt_quality_flag: 'ok' | 'questionable' | 'needs_calibration_review';
  prompt_quality_note?: string;
  focus_tags?: WritingPromptFocusTag[];
  context_tags?: WritingPromptContextTag[];
  source_key?: string;
  created_at: string;
  updated_at: string;
}

export interface AdminReviewSignal {
  id: string;
  entity_type: AdminReviewEntityType;
  entity_id: string;
  student_id?: string;
  status: AdminReviewStatus;
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface WritingCalibrationCase {
  student_name: string;
  student_id: string;
  grade: number;
  prompt_text: string | null;
  student_submission: string | null;
  latest_assessment: WritingAssessmentResult | null;
  weekly_targets: WeeklyImprovementPlan | null;
  generated_daily_tasks: DailyWritingTask[];
  latest_practice_evaluations: DailyPracticeEvaluation[];
  monthly_report_snapshot: MonthlyWritingReport | null;
  calibration_follow_up_flag: boolean;
  calibration_follow_up_note: string | null;
}

interface WritingPromptFilters {
  grade?: number;
  genre?: SupportedGenre;
  difficulty_label?: PromptDifficultyLabel;
  is_active?: boolean;
  prompt_quality_flag?: WritingPromptRecord['prompt_quality_flag'];
}

export interface SmartWritingPromptSelection {
  prompt_text: string;
  base_prompt_text: string;
  genre: SupportedGenre;
  prompt_id: string | null;
  difficulty_level: PromptDifficultyLevel;
  target_word_count: number;
  // Can later drive adaptive genre-guide emphasis.
  focus_tags: WritingPromptFocusTag[];
  // Can later drive contextual task-guide examples.
  context_tags: WritingPromptContextTag[];
  // Foundation for weakness -> quick mission recommendations.
  mission_hint_categories: string[];
  selection_source: 'prompt_bank' | 'fallback_default';
  used_weakness_tags: string[];
  pool_size?: number;
}

export interface WritingExportDocument {
  export_type: 'student_monthly' | 'teacher_weekly_class' | 'admin_calibration';
  generated_at: string;
  title: string;
  html: string;
  pdf_ready: {
    header: string;
    sections: Array<{ title: string; lines: string[] }>;
    footer: string;
  };
}

interface WritingAnalyticsFilters {
  grade?: number;
  genre?: SupportedGenre;
}

export interface WritingAnalyticsDashboard {
  summary: {
    total_students: number;
    stalled_count: number;
    improving_count: number;
  };
  most_common_weakness_tags: Array<{ tag: string; count: number }>;
  student_weakness_counts: Array<{
    student_id: string;
    student_name: string;
    tags: Array<{ tag: string; count: number }>;
  }>;
  average_score_by_grade: Array<{ grade: number; average_score: number }>;
  average_score_by_genre: Array<{ genre: string; average_score: number }>;
  subscale_improvement_over_time: Array<{
    student_id: string;
    content_delta: number;
    communicative_delta: number;
    organisation_delta: number;
    language_delta: number;
  }>;
  prompt_effectiveness: Array<{
    prompt_id: string;
    title: string;
    usage_count: number;
    average_score: number | null;
  }>;
  task_type_effectiveness: Array<{
    task_type: string;
    average_target_skill_score: number;
    repeated_weakness_presence_rate: number;
  }>;
  pilot_readiness: {
    monthly_comparison_ready_students: string[];
    incomplete_weekly_cycle_students: string[];
    overused_prompts: string[];
    low_improvement_target_tags: string[];
  };
  retry_insights?: {
    retry_metadata_attempts: number;
    total_attempts: number;
    retry_metadata_coverage_rate: number;
    retry_cycle_count: number;
    average_attempts_per_cycle: number;
    same_prompt_retry_count: number;
    new_prompt_restart_count: number;
    cycles_improved_count: number;
    cycles_not_improved_count: number;
    average_same_prompt_score_delta: number | null;
    improved_cycle_rate: number;
    retry_depth_distribution: Array<{ attempts: number; cycle_count: number }>;
    most_repeated_cycle_tags: Array<{ tag: string; count: number }>;
    students_needing_intervention: string[];
    students_showing_fast_gains: string[];
    student_retry_profiles: Array<{
      student_id: string;
      retry_cycle_count: number;
      average_attempts_per_cycle: number;
      same_prompt_retry_count: number;
      new_prompt_restart_count: number;
      improved_same_prompt_cycles: number;
      no_improvement_same_prompt_cycles: number;
      average_same_prompt_score_delta: number | null;
      recurring_mistake_tags: string[];
      retry_metadata_attempt_count: number;
      needs_intervention: boolean;
      fast_gains: boolean;
    }>;
  };
}

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

const buildRetryInsights = (
  attempts: WritingAttempt[]
): NonNullable<WritingAnalyticsDashboard['retry_insights']> => {
  const totalAttempts = attempts.length;
  const retryAwareAttempts = attempts.filter((attempt) => typeof attempt.revision_cycle_id === 'string' && attempt.revision_cycle_id.trim().length > 0);
  const coverageRate = totalAttempts > 0 ? Number((retryAwareAttempts.length / totalAttempts).toFixed(2)) : 0;
  const cycleMap = new Map<string, WritingAttempt[]>();
  retryAwareAttempts.forEach((attempt) => {
    const cycleId = attempt.revision_cycle_id?.trim();
    if (!cycleId) return;
    const key = `${attempt.student_id}::${cycleId}`;
    cycleMap.set(key, [...(cycleMap.get(key) ?? []), attempt]);
  });

  const retryDepthCounter = new Map<number, number>();
  const repeatedTagCounter = new Map<string, number>();
  const samePromptDeltas: number[] = [];
  const profiles = new Map<string, NonNullable<WritingAnalyticsDashboard['retry_insights']>['student_retry_profiles'][number]>();

  let samePromptRetryCount = 0;
  let newPromptRestartCount = 0;
  let cyclesImproved = 0;
  let cyclesNotImproved = 0;

  const ensureProfile = (studentId: string) => {
    const existing = profiles.get(studentId);
    if (existing) return existing;
    const initial = {
      student_id: studentId,
      retry_cycle_count: 0,
      average_attempts_per_cycle: 0,
      same_prompt_retry_count: 0,
      new_prompt_restart_count: 0,
      improved_same_prompt_cycles: 0,
      no_improvement_same_prompt_cycles: 0,
      average_same_prompt_score_delta: null as number | null,
      recurring_mistake_tags: [] as string[],
      retry_metadata_attempt_count: 0,
      needs_intervention: false,
      fast_gains: false,
    };
    profiles.set(studentId, initial);
    return initial;
  };

  cycleMap.forEach((items, cycleKey) => {
    const [studentId] = cycleKey.split('::');
    const profile = ensureProfile(studentId);
    const sorted = [...items].sort((a, b) => {
      const attemptA = Number.isFinite(a.attempt_number) ? (a.attempt_number as number) : Number.POSITIVE_INFINITY;
      const attemptB = Number.isFinite(b.attempt_number) ? (b.attempt_number as number) : Number.POSITIVE_INFINITY;
      if (attemptA !== attemptB) return attemptA - attemptB;
      return a.created_at.localeCompare(b.created_at);
    });
    if (sorted.length === 0) return;

    profile.retry_cycle_count += 1;
    profile.retry_metadata_attempt_count += sorted.length;
    retryDepthCounter.set(sorted.length, (retryDepthCounter.get(sorted.length) ?? 0) + 1);

    const first = sorted[0];
    const latest = sorted[sorted.length - 1];
    const delta = Number((latest.assessment.total_score - first.assessment.total_score).toFixed(2));
    const hasSamePromptRetry = sorted.some((attempt) => attempt.retry_kind === 'same_prompt');

    const firstTags = new Set(first.assessment.weakness_tags ?? []);
    const latestTags = new Set(latest.assessment.weakness_tags ?? []);
    [...firstTags].filter((tag) => latestTags.has(tag)).forEach((tag) => {
      repeatedTagCounter.set(tag, (repeatedTagCounter.get(tag) ?? 0) + 1);
    });

    sorted.forEach((attempt) => {
      if (attempt.retry_kind === 'same_prompt') {
        samePromptRetryCount += 1;
        profile.same_prompt_retry_count += 1;
      }
      if (attempt.retry_kind === 'new_prompt' && (attempt.attempt_number ?? 0) <= 1) {
        newPromptRestartCount += 1;
        profile.new_prompt_restart_count += 1;
      }
    });

    if (hasSamePromptRetry) {
      samePromptDeltas.push(delta);
      if (delta > 0) {
        cyclesImproved += 1;
        profile.improved_same_prompt_cycles += 1;
      } else {
        cyclesNotImproved += 1;
        profile.no_improvement_same_prompt_cycles += 1;
      }
    }
  });

  const studentProfiles = [...profiles.values()].map((profile) => {
    const cycleAttempts = profile.retry_cycle_count > 0 ? profile.retry_metadata_attempt_count / profile.retry_cycle_count : 0;
    profile.average_attempts_per_cycle = Number(cycleAttempts.toFixed(2));
    const studentCycles = [...cycleMap.entries()].filter(([key]) => key.startsWith(`${profile.student_id}::`));
    const deltas = studentCycles
      .map(([, items]) => {
        const sorted = [...items].sort((a, b) => (a.attempt_number ?? 999) - (b.attempt_number ?? 999));
        if (!sorted.some((attempt) => attempt.retry_kind === 'same_prompt')) return null;
        return Number((sorted[sorted.length - 1].assessment.total_score - sorted[0].assessment.total_score).toFixed(2));
      })
      .filter((value): value is number => value != null);
    profile.average_same_prompt_score_delta = deltas.length ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2)) : null;

    const recurringTags = new Map<string, number>();
    studentCycles.forEach(([, items]) => {
      const sorted = [...items].sort((a, b) => (a.attempt_number ?? 999) - (b.attempt_number ?? 999));
      if (!sorted.length) return;
      const firstTags = new Set(sorted[0].assessment.weakness_tags ?? []);
      const latestTags = new Set(sorted[sorted.length - 1].assessment.weakness_tags ?? []);
      [...firstTags].filter((tag) => latestTags.has(tag)).forEach((tag) => {
        recurringTags.set(tag, (recurringTags.get(tag) ?? 0) + 1);
      });
    });
    profile.recurring_mistake_tags = [...recurringTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => tag);
    profile.needs_intervention =
      profile.retry_cycle_count >= 2 &&
      profile.average_attempts_per_cycle >= 2 &&
      (profile.average_same_prompt_score_delta ?? 0) <= 0;
    profile.fast_gains =
      profile.improved_same_prompt_cycles > 0 &&
      (profile.average_same_prompt_score_delta ?? 0) >= 0.5 &&
      profile.average_attempts_per_cycle <= 2;
    return profile;
  });

  const retryCycleCount = cycleMap.size;
  const avgAttemptsPerCycle = retryCycleCount > 0 ? Number((retryAwareAttempts.length / retryCycleCount).toFixed(2)) : 0;
  const avgSamePromptDelta = samePromptDeltas.length > 0
    ? Number((samePromptDeltas.reduce((acc, item) => acc + item, 0) / samePromptDeltas.length).toFixed(2))
    : null;
  const improvedRateBase = cyclesImproved + cyclesNotImproved;

  return {
    retry_metadata_attempts: retryAwareAttempts.length,
    total_attempts: totalAttempts,
    retry_metadata_coverage_rate: coverageRate,
    retry_cycle_count: retryCycleCount,
    average_attempts_per_cycle: avgAttemptsPerCycle,
    same_prompt_retry_count: samePromptRetryCount,
    new_prompt_restart_count: newPromptRestartCount,
    cycles_improved_count: cyclesImproved,
    cycles_not_improved_count: cyclesNotImproved,
    average_same_prompt_score_delta: avgSamePromptDelta,
    improved_cycle_rate: improvedRateBase > 0 ? Number((cyclesImproved / improvedRateBase).toFixed(2)) : 0,
    retry_depth_distribution: [...retryDepthCounter.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([attemptsInCycle, cycle_count]) => ({ attempts: attemptsInCycle, cycle_count })),
    most_repeated_cycle_tags: [...repeatedTagCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    students_needing_intervention: studentProfiles.filter((profile) => profile.needs_intervention).map((profile) => profile.student_id),
    students_showing_fast_gains: studentProfiles.filter((profile) => profile.fast_gains).map((profile) => profile.student_id),
    student_retry_profiles: studentProfiles.sort((a, b) => b.retry_cycle_count - a.retry_cycle_count),
  };
};

export const getWritingMonitoringOverview = (
  month = currentMonthKey()
): ServiceResponse<WritingMonitoringOverview> => {
  hydrateStore();
  const hotspotCounter = new Map<string, number>();
  const rows: WritingMonitoringOverview['student_rows'] = [];

  for (const [stateKey, state] of store.states.entries()) {
    const { studentId, genre } = parseStateKey(stateKey);
    const laneGenre = genre ?? state.current_genre;
    const profile = store.profiles.get(studentId);
    const totalTasks = state.active_daily_tasks.length;
    const completed = state.completed_daily_tasks.length;
    const completionRate = totalTasks > 0 ? Number((completed / totalTasks).toFixed(2)) : 0;
    const latestScore = state.latest_assessment?.total_score ?? null;

    const attempts = store.attempts.filter((item) => item.student_id === studentId && item.genre === laneGenre).slice(-3);
    const first = attempts[0]?.assessment;
    const last = attempts[attempts.length - 1]?.assessment;
    const scoreTrend = first && last ? Number((last.total_score - first.total_score).toFixed(2)) : 0;
    const trend = {
      content:
        first && last ? Number((last.subscores.content - first.subscores.content).toFixed(2)) : 0,
      communicative_achievement:
        first && last
          ? Number(
              (
                (last.subscores.communicative_achievement ?? 0) -
                (first.subscores.communicative_achievement ?? 0)
              ).toFixed(2)
            )
          : 0,
      organisation:
        first && last ? Number((last.subscores.organisation - first.subscores.organisation).toFixed(2)) : 0,
      language:
        first && last ? Number((last.subscores.language - first.subscores.language).toFixed(2)) : 0,
    };

    const tagCounts = state.repeated_error_memory.byStudent[studentId]?.tagCounts ?? {};
    const hotspots = Object.entries(tagCounts)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 3)
      .map(([tag]) => tag);
    hotspots.forEach((tag) => hotspotCounter.set(tag, (hotspotCounter.get(tag) ?? 0) + 1));

    const attemptsCount = store.attempts.filter((item) => item.student_id === studentId && item.genre === laneGenre).length;
    const hasSubmissions = attemptsCount > 0 || latestScore != null;

    const trendValues = Object.values(trend);
    const positiveTrendCount = trendValues.filter((value) => value > 0).length;
    const negativeTrendCount = trendValues.filter((value) => value < 0).length;
    const lowCompletionRisk =
      totalTasks > 0 && completed > 0 && completionRate < WRITING_PILOT_GUARDRAILS.stalled_completion_rate_threshold;
    const stalled =
      hasSubmissions && (
        state.adaptation_trend.failure_streak >= WRITING_PILOT_GUARDRAILS.stalled_failure_streak_threshold ||
        lowCompletionRisk ||
        negativeTrendCount >= 2
      );
    const improving =
      !stalled &&
      (state.adaptation_trend.success_streak >= WRITING_PILOT_GUARDRAILS.improving_success_streak_threshold ||
        positiveTrendCount >= WRITING_PILOT_GUARDRAILS.improving_positive_subscale_count_threshold ||
        scoreTrend >= 1);
    const monthlyAttempts = store.attempts.filter((item) => item.student_id === studentId && item.genre === laneGenre && item.created_at.startsWith(month)).length;
    const hasReport = store.monthlyReports.some((item) => item.student_id === studentId && item.genre === laneGenre && item.month === month);
    const readyForMonthlyReview = monthlyAttempts >= WRITING_PILOT_GUARDRAILS.monthly_ready_attempt_threshold && !hasReport;
    const weeklyTargetSummary = state.active_week_plan
      ? `${state.active_week_plan.primary_target} • ${state.active_week_plan.secondary_target}`
      : 'No active weekly target';
    const latestAttempt = attempts[attempts.length - 1];
    const latestIntegritySignals = latestAttempt?.integrity_signals ?? null;
    const status: NonNullable<WritingMonitoringOverview['student_rows'][number]['status']> =
      attemptsCount === 0
        ? 'not_started'
        : latestIntegritySignals?.review_status === 'review_recommended'
          ? 'needs_review'
          : stalled
            ? 'needs_support'
            : improving
              ? 'improving'
              : attemptsCount === 1 && completed === 0
                ? 'plan_ready'
                : 'on_track';
    const statusReason =
      status === 'not_started'
        ? 'No writing has been submitted in this period.'
        : status === 'needs_review'
          ? 'Writing-process evidence needs teacher review before this score is used.'
          : status === 'needs_support'
            ? 'Comparable writing or practice evidence needs support.'
            : status === 'improving'
              ? 'The latest comparable writing evidence improved.'
              : status === 'plan_ready'
                ? 'Baseline complete. The personalized practice plan is ready to begin.'
                : 'Writing and practice evidence are on track.';

    rows.push({
      student_name: resolveStudentLabel(studentId, profile?.student_name),
      student_id: studentId,
      current_grade: profile?.grade ?? state.grade,
      completion_rate: completionRate,
      latest_score: latestScore,
      latest_subscale_scores: {
        content: state.latest_assessment?.subscores.content ?? null,
        communicative_achievement: state.latest_assessment?.subscores.communicative_achievement ?? null,
        organisation: state.latest_assessment?.subscores.organisation ?? null,
        language: state.latest_assessment?.subscores.language ?? null,
      },
      subscale_trend: trend,
      repeated_weakness_hotspots: hotspots,
      weekly_target_summary: weeklyTargetSummary,
      stalled,
      improving,
      ready_for_monthly_review: readyForMonthlyReview,
      attempts_count: attemptsCount,
      submission_count: attemptsCount,
      baseline_submission_count: attempts.filter((attempt) => attempt.attempt_type === 'initial_assessment').length,
      practice_assigned_count: totalTasks,
      practice_completed_count: completed,
      practice_completion_rate: completionRate,
      status,
      status_reason: statusReason,
      latest_attempt_at: latestAttempt?.created_at ?? null,
      latest_integrity_signals: latestIntegritySignals,
      integrity_mode: latestIntegritySignals?.mode ?? 'practice',
    });
  }

  const hotspotTags = [...hotspotCounter.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  return ok({
    student_rows: rows,
    hotspot_tags: hotspotTags,
    stalled_students: rows.filter((row) => row.stalled).map((row) => row.student_id),
    monthly_review_ready_students: rows.filter((row) => row.ready_for_monthly_review).map((row) => row.student_id),
  });
};

export const getWritingCalibrationCase = (
  studentId: string,
  month = currentMonthKey(),
  genre?: SupportedGenre
): ServiceResponse<WritingCalibrationCase> => {
  hydrateStore();
  const targetGenre = genre ?? getProfileGenre(studentId);
  const state = getStateForGenre(studentId, targetGenre);
  const profile = store.profiles.get(studentId);
  if (!state) return badRequest('student writing state not found.');

  const studentAttempts = store.attempts
    .filter((attempt) => attempt.student_id === studentId && attempt.genre === targetGenre)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestAttempt = studentAttempts[studentAttempts.length - 1] ?? null;

  const latestPracticeEvaluations = store.dailyEvaluations
    .filter((evaluation) => evaluation.student_id === studentId && evaluation.genre === targetGenre)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3);

  const monthlyReport =
    store.monthlyReports
      .filter((report) => report.student_id === studentId && report.genre === targetGenre && report.month === month)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  return ok({
    student_name: profile?.student_name || `Student ${studentId}`,
    student_id: studentId,
    grade: profile?.grade ?? state.grade,
    prompt_text: latestAttempt?.prompt_text ?? null,
    student_submission: latestAttempt?.student_submission ?? null,
    latest_assessment: state.latest_assessment,
    weekly_targets: state.active_week_plan,
    generated_daily_tasks: state.active_daily_tasks,
    latest_practice_evaluations: latestPracticeEvaluations,
    monthly_report_snapshot: monthlyReport,
    calibration_follow_up_flag: store.calibrationFollowUpByStudent[studentId]?.flagged ?? false,
    calibration_follow_up_note: store.calibrationFollowUpByStudent[studentId]?.note ?? null,
  });
};

export const exportStudentMonthlyWritingReport = (
  studentId: string,
  month: string,
  genre?: SupportedGenre
): ServiceResponse<WritingExportDocument> => {
  hydrateStore();
  const targetGenre = genre ?? getProfileGenre(studentId);
  const state = getStateForGenre(studentId, targetGenre);
  if (!state) return badRequest('student writing state not found.');
  const monthly = store.monthlyReports.find((item) => item.student_id === studentId && item.genre === targetGenre && item.month === month);
  if (!monthly) return badRequest('monthly report not found for this student/month.');

  const scoreHistory = state.monthly_history.map((entry) => `${entry.month}: ${entry.score}`);
  const lines = {
    subscale_progress: monthly.report.subscale_progress,
    repeated_mistakes_reduced: monthly.report.repeated_mistakes_reduced,
    strongest_gains: monthly.report.strongest_gains,
    blockers: monthly.report.remaining_blockers,
    priorities: monthly.report.next_month_priorities,
  };
  const html = `
    <article>
      <h1>Student Monthly Writing Report</h1>
      <p>Student: ${safeText(studentId)} | Month: ${safeText(month)}</p>
      <h2>Score history</h2><p>${safeText(scoreHistory.join(' · ') || 'No score history.')}</p>
      <h2>Subscale progress</h2><p>${safeText(lines.subscale_progress.join(' · ') || 'None')}</p>
      <h2>Repeated mistakes reduced</h2><p>${safeText(lines.repeated_mistakes_reduced.join(' · ') || 'None')}</p>
      <h2>Strongest gains</h2><p>${safeText(lines.strongest_gains.join(' · ') || 'None')}</p>
      <h2>Blockers</h2><p>${safeText(lines.blockers.join(' · ') || 'None')}</p>
      <h2>Next priorities</h2><p>${safeText(lines.priorities.join(' · ') || 'None')}</p>
    </article>
  `.trim();

  return ok({
    export_type: 'student_monthly',
    generated_at: new Date().toISOString(),
    title: `Writing Monthly Report (${month})`,
    html,
    pdf_ready: {
      header: `Student ${studentId} Monthly Writing Report`,
      sections: [
        { title: 'Score history', lines: scoreHistory },
        { title: 'Subscale progress', lines: lines.subscale_progress },
        { title: 'Repeated mistakes reduced', lines: lines.repeated_mistakes_reduced },
        { title: 'Strongest gains', lines: lines.strongest_gains },
        { title: 'Blockers', lines: lines.blockers },
        { title: 'Next priorities', lines: lines.priorities },
      ],
      footer: 'Generated by Brains Heist Writing Export',
    },
  });
};

export const exportTeacherWeeklyClassSummary = (
  month = currentMonthKey()
): ServiceResponse<WritingExportDocument> => {
  if (!(typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test')) {
    return badRequest('Teacher class export must use secure scoped RPC in production.');
  }
  const overview = getWritingMonitoringOverview(month);
  if (!overview.ok || !overview.data) return badRequest('writing monitoring overview unavailable.');
  if (overview.data.student_rows.length === 0) return badRequest('no class writing data available to export.');

  const rows = overview.data.student_rows.map((row) =>
    `${row.student_name} (${row.student_id}) | completion ${Math.round(row.completion_rate * 100)}% | latest ${row.latest_score ?? '—'} | status ${
      row.stalled ? 'stalled' : row.improving ? 'improving' : 'steady'
    }`
  );
  const html = `
    <article>
      <h1>Teacher Weekly/Class Writing Summary</h1>
      <p>Month key: ${safeText(month)}</p>
      <h2>Students</h2>
      <ul>${rows.map((line) => `<li>${safeText(line)}</li>`).join('')}</ul>
      <h2>Hotspots</h2><p>${safeText(overview.data.hotspot_tags.join(' · ') || 'None')}</p>
      <h2>Stalled students</h2><p>${safeText(overview.data.stalled_students.join(', ') || 'None')}</p>
      <h2>Improving students</h2><p>${
        safeText(overview.data.student_rows.filter((row) => row.improving).map((row) => row.student_id).join(', ') || 'None')
      }</p>
    </article>
  `.trim();

  return ok({
    export_type: 'teacher_weekly_class',
    generated_at: new Date().toISOString(),
    title: `Teacher Writing Class Summary (${month})`,
    html,
    pdf_ready: {
      header: `Teacher Class Summary (${month})`,
      sections: [
        { title: 'Student completion and score snapshot', lines: rows },
        { title: 'Repeated weakness hotspots', lines: overview.data.hotspot_tags },
        { title: 'Stalled students', lines: overview.data.stalled_students },
        {
          title: 'Improving students',
          lines: overview.data.student_rows.filter((row) => row.improving).map((row) => row.student_id),
        },
      ],
      footer: 'Generated by Brains Heist Writing Export',
    },
  });
};

export const getTeacherExportRowsScoped = async (
  month = new Date().toISOString().slice(0, 7)
): Promise<ServiceResponse<Array<{
  student_id: string;
  student_name: string;
  grade: number;
  class_id?: string | null;
  class_name?: string;
  completion_rate: number;
  latest_score: number | null;
  submission_count?: number;
  all_time_submission_count?: number;
}>>> => {
  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test') {
    const overview = getWritingMonitoringOverview(month);
    if (!overview.ok || !overview.data) return badRequest(overview.error ?? 'No export rows available.');
    return ok(
      overview.data.student_rows.map((row) => ({
        student_id: row.student_id,
        student_name: row.student_name,
        grade: row.current_grade,
        class_id: row.class_id,
        class_name: row.class_name,
        completion_rate: row.completion_rate,
        latest_score: row.latest_score,
        submission_count: row.submission_count ?? row.attempts_count,
        all_time_submission_count: row.all_time_submission_count ?? row.attempts_count,
      }))
    );
  }
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_export_rows', {
      p_month: month,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to load scoped teacher export rows.');
    return ok(data as Array<{
      student_id: string;
      student_name: string;
      grade: number;
      class_id?: string | null;
      class_name?: string;
      completion_rate: number;
      latest_score: number | null;
      submission_count?: number;
      all_time_submission_count?: number;
    }>);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load scoped teacher export rows.');
  }
};

export const exportAdminCalibrationReport = (
  studentId: string,
  month = currentMonthKey()
): ServiceResponse<WritingExportDocument> => {
  const calibration = getWritingCalibrationCase(studentId, month);
  if (!calibration.ok || !calibration.data) return badRequest('calibration data unavailable.');
  const data = calibration.data;
  const html = `
    <article>
      <h1>Admin Calibration Export</h1>
      <p>${safeText(data.student_name)} (${safeText(data.student_id)}) Grade ${safeText(String(data.grade))}</p>
      <h2>Prompt</h2><p>${safeText(data.prompt_text ?? 'None')}</p>
      <h2>Submission</h2><p>${safeText(data.student_submission ?? 'None')}</p>
      <h2>Assessment</h2><p>Total score: ${safeText(String(data.latest_assessment?.total_score ?? '—'))}</p>
      <h2>Weaknesses</h2><p>${safeText(data.latest_assessment?.weakness_tags.join(' · ') || 'None')}</p>
      <h2>Targets</h2><p>${safeText(data.weekly_targets?.primary_target ?? 'None')} | ${safeText(data.weekly_targets?.secondary_target ?? 'None')}</p>
      <h2>Tasks</h2><p>${safeText(data.generated_daily_tasks.map((task) => `Day ${task.day_number}: ${task.title}`).join(' | ') || 'None')}</p>
      <h2>Evaluations</h2><p>${
        safeText(data.latest_practice_evaluations
          .map((item) => `Day ${item.task_day_number}: ${item.evaluation.completion_status}/${item.evaluation.recommended_next_action}`)
          .join(' | ') || 'None')
      }</p>
      <h2>Monthly snapshot</h2><p>${safeText(data.monthly_report_snapshot?.report.score_change ?? 'None')}</p>
    </article>
  `.trim();

  return ok({
    export_type: 'admin_calibration',
    generated_at: new Date().toISOString(),
    title: `Admin Calibration Export (${studentId})`,
    html,
    pdf_ready: {
      header: `Calibration Export for ${data.student_name} (${studentId})`,
      sections: [
        { title: 'Prompt', lines: [data.prompt_text ?? 'None'] },
        { title: 'Submission', lines: [data.student_submission ?? 'None'] },
        { title: 'Assessment total', lines: [String(data.latest_assessment?.total_score ?? '—')] },
        { title: 'Weaknesses', lines: data.latest_assessment?.weakness_tags ?? [] },
        { title: 'Targets', lines: [data.weekly_targets?.primary_target ?? 'None', data.weekly_targets?.secondary_target ?? 'None'] },
        { title: 'Tasks', lines: data.generated_daily_tasks.map((task) => `Day ${task.day_number}: ${task.title}`) },
        {
          title: 'Evaluations',
          lines: data.latest_practice_evaluations.map(
            (item) => `Day ${item.task_day_number}: ${item.evaluation.completion_status}/${item.evaluation.recommended_next_action}`
          ),
        },
        { title: 'Monthly snapshot', lines: [data.monthly_report_snapshot?.report.score_change ?? 'None'] },
      ],
      footer: 'Generated by Brains Heist Writing Export',
    },
  });
};

export const getWritingAnalyticsDashboard = (
  filters: WritingAnalyticsFilters = {}
): ServiceResponse<WritingAnalyticsDashboard> => {
  hydrateStore();
  const students = [...store.states.values()].filter((state) => {
    if (filters.grade && state.grade !== filters.grade) return false;
    if (filters.genre && state.current_genre !== filters.genre) return false;
    return true;
  });

  if (students.length === 0) return badRequest('no writing analytics data available for the selected filters.');

  const weaknessCounter = new Map<string, number>();
  const studentWeaknessCounts: WritingAnalyticsDashboard['student_weakness_counts'] = [];
  const gradeScores = new Map<number, number[]>();
  const genreScores = new Map<string, number[]>();
  const subscaleImprovement: WritingAnalyticsDashboard['subscale_improvement_over_time'] = [];
  const promptEffectiveness: WritingAnalyticsDashboard['prompt_effectiveness'] = [];
  const taskTypeStats = new Map<string, { targetScores: number[]; repeatedWeaknessHits: number; total: number }>();

  const monitoring = getWritingMonitoringOverview();
  const stalledCount = monitoring.ok ? monitoring.data!.stalled_students.length : 0;
  const improvingCount = monitoring.ok ? monitoring.data!.student_rows.filter((row) => row.improving).length : 0;

  for (const state of students) {
    const latest = state.latest_assessment;
    if (latest) {
      gradeScores.set(state.grade, [...(gradeScores.get(state.grade) ?? []), latest.total_score]);
      genreScores.set(state.current_genre, [...(genreScores.get(state.current_genre) ?? []), latest.total_score]);
    }

    const attempts = store.attempts.filter((item) => item.student_id === state.student_id);
    const perStudentCounts = new Map<string, number>();
    attempts.forEach((attempt) => {
      const counts = attempt.feedback_weakness_tag_counts ?? Object.fromEntries(
        (attempt.assessment?.weakness_tags ?? []).map((tag) => [tag, 1])
      );
      Object.entries(counts).forEach(([tag, count]) => {
        const safeCount = Math.max(0, Number(count ?? 0));
        if (!safeCount) return;
        perStudentCounts.set(tag, (perStudentCounts.get(tag) ?? 0) + safeCount);
        weaknessCounter.set(tag, (weaknessCounter.get(tag) ?? 0) + safeCount);
      });
    });
    studentWeaknessCounts.push({
      student_id: state.student_id,
      student_name: store.profiles.get(state.student_id)?.student_name?.trim() || 'Student',
      tags: [...perStudentCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
    });
    if (attempts.length >= 2) {
      const first = attempts[0].assessment.subscores;
      const last = attempts[attempts.length - 1].assessment.subscores;
      subscaleImprovement.push({
        student_id: state.student_id,
        content_delta: Number((last.content - first.content).toFixed(2)),
        communicative_delta: Number(((last.communicative_achievement ?? 0) - (first.communicative_achievement ?? 0)).toFixed(2)),
        organisation_delta: Number((last.organisation - first.organisation).toFixed(2)),
        language_delta: Number((last.language - first.language).toFixed(2)),
      });
    }
  }

  for (const prompt of store.promptBank) {
    const matchedAttempts = store.attempts.filter((item) => item.prompt_text?.trim() === prompt.prompt_text.trim());
    const avg =
      matchedAttempts.length > 0
        ? Number(
            (matchedAttempts.reduce((acc, item) => acc + item.assessment.total_score, 0) / matchedAttempts.length).toFixed(2)
          )
        : null;
    promptEffectiveness.push({
      prompt_id: prompt.id,
      title: prompt.title,
      usage_count: prompt.usage_count,
      average_score: avg,
    });
  }

  for (const evaluation of store.dailyEvaluations) {
    const taskType = evaluation.evaluation.task_type;
    const current = taskTypeStats.get(taskType) ?? { targetScores: [], repeatedWeaknessHits: 0, total: 0 };
    current.targetScores.push(evaluation.evaluation.target_skill_score);
    if (evaluation.evaluation.detected_weakness_tags.length > 0) current.repeatedWeaknessHits += 1;
    current.total += 1;
    taskTypeStats.set(taskType, current);
  }

  const monthlyReady = students
    .filter((state) => {
      const months = new Set(state.monthly_history.map((entry) => entry.month));
      return months.size >= WRITING_PILOT_GUARDRAILS.monthly_comparison_ready_month_count;
    })
    .map((state) => state.student_id);
  const incompleteCycles = students
    .filter((state) => state.active_daily_tasks.length > 0 && state.completed_daily_tasks.length < state.active_daily_tasks.length)
    .map((state) => state.student_id);
  const overusedPrompts = store.promptBank
    .filter((prompt) => prompt.usage_count >= WRITING_PILOT_GUARDRAILS.prompt_overuse_threshold)
    .map((prompt) => prompt.id);
  const lowImprovementTags = [...weaknessCounter.entries()]
    .filter(([, count]) => count >= WRITING_PILOT_GUARDRAILS.low_improvement_tag_threshold)
    .map(([tag]) => tag);
  const retryInsights = buildRetryInsights(
    store.attempts.filter((item) => {
      if (filters.genre && item.genre !== filters.genre) return false;
      if (!filters.grade) return true;
      const state = store.states.get(buildStateKey(item.student_id, item.genre));
      return (state?.grade ?? null) === filters.grade;
    })
  );

  return ok({
    summary: {
      total_students: students.length,
      stalled_count: stalledCount,
      improving_count: improvingCount,
    },
    most_common_weakness_tags: [...weaknessCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    student_weakness_counts: studentWeaknessCounts.filter((student) => student.tags.length > 0),
    average_score_by_grade: [...gradeScores.entries()].map(([grade, scores]) => ({
      grade,
      average_score: Number((scores.reduce((acc, item) => acc + item, 0) / scores.length).toFixed(2)),
    })),
    average_score_by_genre: [...genreScores.entries()].map(([genre, scores]) => ({
      genre,
      average_score: Number((scores.reduce((acc, item) => acc + item, 0) / scores.length).toFixed(2)),
    })),
    subscale_improvement_over_time: subscaleImprovement,
    prompt_effectiveness: promptEffectiveness,
    task_type_effectiveness: [...taskTypeStats.entries()].map(([task_type, stats]) => ({
      task_type,
      average_target_skill_score: Number(
        (stats.targetScores.reduce((acc, item) => acc + item, 0) / Math.max(1, stats.targetScores.length)).toFixed(2)
      ),
      repeated_weakness_presence_rate: Number((stats.repeatedWeaknessHits / Math.max(1, stats.total)).toFixed(2)),
    })),
    pilot_readiness: {
      monthly_comparison_ready_students: monthlyReady,
      incomplete_weekly_cycle_students: incompleteCycles,
      overused_prompts: overusedPrompts,
      low_improvement_target_tags: lowImprovementTags,
    },
    retry_insights: retryInsights,
  });
};

interface CreateWritingPromptInput {
  title: string;
  prompt_text: string;
  genre: SupportedGenre;
  grade_band: string;
  target_word_count: number;
  difficulty_label: PromptDifficultyLabel;
  curriculum_tags: string[];
  safety_status: PromptSafetyStatus;
  is_active?: boolean;
}

interface UpdateWritingPromptInput {
  title?: string;
  prompt_text?: string;
  genre?: SupportedGenre;
  grade_band?: string;
  target_word_count?: number;
  difficulty_label?: PromptDifficultyLabel;
  curriculum_tags?: string[];
  safety_status?: PromptSafetyStatus;
  is_active?: boolean;
}

const gradeMatchesBand = (grade: number, band: string): boolean => {
  const match = band.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return false;
  const min = Number(match[1]);
  const max = Number(match[2]);
  return grade >= min && grade <= max;
};

const normalizePromptText = (prompt: string): string => prompt.replace(/\s+/g, ' ').trim().toLowerCase();

const ensureStructuredPromptBankSeeded = (): void => {
  const existingIds = new Set(store.promptBank.map((prompt) => prompt.id));
  const existingPromptTexts = new Set(store.promptBank.map((prompt) => normalizePromptText(prompt.prompt_text)));
  if (STRUCTURED_WRITING_PROMPT_BANK.every((prompt) => existingIds.has(prompt.id) || existingPromptTexts.has(normalizePromptText(prompt.prompt_text)))) {
    return;
  }

  const now = new Date().toISOString();
  STRUCTURED_WRITING_PROMPT_BANK.forEach((prompt) => {
    const normalizedText = normalizePromptText(prompt.prompt_text);
    if (existingIds.has(prompt.id) || existingPromptTexts.has(normalizedText)) return;
    const record: WritingPromptRecord = {
      id: prompt.id,
      title: prompt.title,
      prompt_text: prompt.prompt_text,
      genre: prompt.genre,
      grade_band: prompt.grade_band,
      target_word_count: prompt.target_word_count,
      difficulty_label: prompt.difficulty_level,
      curriculum_tags: toCurriculumTagsForStructuredPrompt(prompt),
      safety_status: 'approved',
      is_active: true,
      is_archived: false,
      usage_count: 0,
      rotation_metadata: {
        last_used_at: null,
        recent_student_usage: {},
      },
      prompt_quality_flag: 'ok',
      prompt_quality_note: 'System-seeded structured prompt bank entry.',
      focus_tags: prompt.focus_tags,
      context_tags: prompt.context_tags,
      source_key: 'system_prompt_bank_v1',
      created_at: now,
      updated_at: now,
    };
    store.promptBank.push(record);
    existingIds.add(prompt.id);
    existingPromptTexts.add(normalizedText);
  });
};

const resolvePromptFocusAndContext = (prompt: WritingPromptRecord): {
  focus_tags: WritingPromptFocusTag[];
  context_tags: WritingPromptContextTag[];
} => {
  const parsed = parseFocusAndContextTags(prompt.curriculum_tags ?? []);
  return {
    focus_tags: prompt.focus_tags?.length ? prompt.focus_tags : parsed.focus_tags,
    context_tags: prompt.context_tags?.length ? prompt.context_tags : parsed.context_tags,
  };
};

const normalizeDifficultyForState = (
  grade: number,
  stateDifficulty: StudentWritingState['current_difficulty_state'] | undefined
): PromptDifficultyLevel => {
  const gradeDefault = gradeToDifficultyLevel(grade);
  if (stateDifficulty === 'reduced') return 'foundational';
  if (stateDifficulty === 'increased') return gradeDefault === 'foundational' ? 'core' : 'stretch';
  return gradeDefault;
};

export const createWritingPrompt = (input: CreateWritingPromptInput): ServiceResponse<WritingPromptRecord> => {
  hydrateStore();
  if (!input.title.trim()) return badRequest('title is required.');
  if (!input.prompt_text.trim()) return badRequest('prompt_text is required.');
  if (!isValidGenre(input.genre)) return badRequest('genre is invalid.');
  if (!input.grade_band.trim()) return badRequest('grade_band is required.');
  if (!Number.isFinite(input.target_word_count) || input.target_word_count < 20) return badRequest('target_word_count must be >= 20.');
  const now = new Date().toISOString();
  const prompt: WritingPromptRecord = {
    id: buildId('prompt'),
    title: input.title.trim(),
    prompt_text: input.prompt_text.trim(),
    genre: input.genre,
    grade_band: input.grade_band.trim(),
    target_word_count: Math.round(input.target_word_count),
    difficulty_label: input.difficulty_label,
    curriculum_tags: input.curriculum_tags,
    safety_status: input.safety_status,
    is_active: input.is_active ?? true,
    is_archived: false,
    usage_count: 0,
    rotation_metadata: {
      last_used_at: null,
      recent_student_usage: {},
    },
    prompt_quality_flag: 'ok',
    created_at: now,
    updated_at: now,
  };
  store.promptBank.push(prompt);
  persistStore();
  return ok(prompt);
};

export const editWritingPrompt = (promptId: string, input: UpdateWritingPromptInput): ServiceResponse<WritingPromptRecord> => {
  hydrateStore();
  const prompt = store.promptBank.find((item) => item.id === promptId);
  if (!prompt) return badRequest('prompt not found.');
  if (prompt.is_archived) return badRequest('archived prompts cannot be edited.');
  Object.assign(prompt, {
    title: input.title?.trim() ?? prompt.title,
    prompt_text: input.prompt_text?.trim() ?? prompt.prompt_text,
    genre: input.genre ?? prompt.genre,
    grade_band: input.grade_band?.trim() ?? prompt.grade_band,
    target_word_count: input.target_word_count ?? prompt.target_word_count,
    difficulty_label: input.difficulty_label ?? prompt.difficulty_label,
    curriculum_tags: input.curriculum_tags ?? prompt.curriculum_tags,
    safety_status: input.safety_status ?? prompt.safety_status,
    is_active: input.is_active ?? prompt.is_active,
    updated_at: new Date().toISOString(),
  });
  persistStore();
  return ok(prompt);
};

export const archiveWritingPrompt = (promptId: string): ServiceResponse<WritingPromptRecord> => {
  hydrateStore();
  const prompt = store.promptBank.find((item) => item.id === promptId);
  if (!prompt) return badRequest('prompt not found.');
  prompt.is_archived = true;
  prompt.is_active = false;
  prompt.updated_at = new Date().toISOString();
  persistStore();
  return ok(prompt);
};

export const setWritingPromptActiveStatus = (promptId: string, isActive: boolean): ServiceResponse<WritingPromptRecord> => {
  hydrateStore();
  const prompt = store.promptBank.find((item) => item.id === promptId);
  if (!prompt) return badRequest('prompt not found.');
  if (prompt.is_archived) return badRequest('archived prompts cannot be activated.');
  prompt.is_active = isActive;
  prompt.updated_at = new Date().toISOString();
  persistStore();
  return ok(prompt);
};

export const listWritingPrompts = (filters: WritingPromptFilters = {}): ServiceResponse<WritingPromptRecord[]> => {
  hydrateStore();
  const results = store.promptBank.filter((prompt) => {
    if (filters.genre && prompt.genre !== filters.genre) return false;
    if (typeof filters.is_active === 'boolean' && prompt.is_active !== filters.is_active) return false;
    if (filters.difficulty_label && prompt.difficulty_label !== filters.difficulty_label) return false;
    if (filters.grade && !gradeMatchesBand(filters.grade, prompt.grade_band)) return false;
    if (filters.prompt_quality_flag && prompt.prompt_quality_flag !== filters.prompt_quality_flag) return false;
    return true;
  });
  return ok(results);
};

export const getSmartWritingPromptForStudent = async (input: {
  student_id: string;
  grade: number;
  genre: SupportedGenre;
  current_prompt_id?: string;
  current_prompt_text?: string;
  weakness_tags?: string[];
  use_ai_polish?: boolean;
}): Promise<ServiceResponse<SmartWritingPromptSelection>> => {
  hydrateStore();
  ensureStructuredPromptBankSeeded();

  const normalizedGrade = normalizeGrade(input.grade);
  if (normalizedGrade === null) return badRequest('grade must be an integer between 6 and 12.');
  const state = getStateForGenre(input.student_id, input.genre);
  const targetDifficulty = normalizeDifficultyForState(normalizedGrade, state?.current_difficulty_state);
  const historicalTagCounts = state?.repeated_error_memory.byStudent[input.student_id]?.tagCounts ?? {};
  const historicalWeaknessTags = Object.entries(historicalTagCounts)
    .filter((entry): entry is [WeaknessTag, number] => WRITING_WEAKNESS_TAG_SET.has(entry[0]) && Number(entry[1] ?? 0) > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([tag]) => tag);
  const weaknessTags = [...new Set([
    ...(input.weakness_tags ?? []),
    ...(state?.latest_assessment?.weakness_tags ?? []),
    ...historicalWeaknessTags,
  ])].slice(0, 6);
  const weaknessFocusTargets = weaknessTags.flatMap((tag) => WEAKNESS_TAG_TO_PROMPT_FOCUS[tag as keyof typeof WEAKNESS_TAG_TO_PROMPT_FOCUS] ?? []);
  const uniqueFocusTargets = [...new Set(weaknessFocusTargets)];

  // In production, use the school-managed, safety-approved prompt bank through a
  // student-safe RPC. The in-memory structured bank remains the deterministic
  // fallback for tests and temporary network failures.
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  if (!isTestRuntime) {
    try {
      const { supabase } = await import('../../../services/supabaseClient.js');
      const { data, error } = await supabase.rpc('rpc_bh_writing_student_prompt', {
        p_grade: normalizedGrade,
        p_genre: input.genre,
        p_current_prompt_id: input.current_prompt_id ?? null,
      });
      const remote = data && typeof data === 'object' ? data as Record<string, unknown> : null;
      const remotePrompt = typeof remote?.['prompt_text'] === 'string' ? remote['prompt_text'].trim() : '';
      if (!error && remotePrompt) {
        const difficulty = remote?.['difficulty_label'];
        const focusTags = Array.isArray(remote?.['focus_tags']) ? remote['focus_tags'] as WritingPromptFocusTag[] : uniqueFocusTargets;
        const contextTags = Array.isArray(remote?.['context_tags']) ? remote['context_tags'] as WritingPromptContextTag[] : [];
        return ok({
          prompt_text: remotePrompt,
          base_prompt_text: remotePrompt,
          genre: input.genre,
          prompt_id: typeof remote?.['prompt_id'] === 'string' ? remote['prompt_id'] : null,
          difficulty_level: difficulty === 'foundational' || difficulty === 'stretch' ? difficulty : 'core',
          target_word_count: Number(remote?.['target_word_count']) || (normalizedGrade <= 7 ? 80 : normalizedGrade <= 9 ? 120 : 160),
          focus_tags: focusTags,
          context_tags: contextTags,
          mission_hint_categories: [...new Set(weaknessTags.map((tag) => WEAKNESS_TAG_TO_MISSION_CATEGORY[tag as keyof typeof WEAKNESS_TAG_TO_MISSION_CATEGORY]).filter(Boolean))],
          selection_source: 'prompt_bank',
          used_weakness_tags: weaknessTags,
          pool_size: Math.max(1, Number(remote?.['pool_size']) || 1),
        });
      }
      if (error) console.warn('[writingIntegrationService] Student prompt RPC unavailable; using safe fallback.', error.message);
    } catch (error) {
      console.warn('[writingIntegrationService] Student prompt RPC failed; using safe fallback.', error);
    }
  }

  const recentAttempts = store.attempts
    .filter((attempt) => attempt.student_id === input.student_id && attempt.genre === input.genre)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const recentPromptTexts = recentAttempts.map((attempt) => normalizePromptText(attempt.prompt_text ?? '')).filter(Boolean);
  const recentPromptIds = recentAttempts.map((attempt) => attempt.prompt_id).filter((value): value is string => Boolean(value));
  const currentPromptNormalized = input.current_prompt_text ? normalizePromptText(input.current_prompt_text) : null;
  const normalizedStarterEmailPrompt = normalizePromptText(EMAIL_STARTER_PROMPT_TEXT);
  const hasCompletedStarterEmailPrompt = store.attempts.some(
    (attempt) =>
      attempt.student_id === input.student_id &&
      attempt.genre === 'email' &&
      normalizePromptText(attempt.prompt_text ?? '') === normalizedStarterEmailPrompt
  );

  const allCandidates = store.promptBank
    .filter((prompt) => !prompt.is_archived && prompt.is_active)
    .filter((prompt) => prompt.genre === input.genre)
    .filter((prompt) => gradeMatchesBand(normalizedGrade, prompt.grade_band));

  const uniqueCandidates = [...new Map(
    allCandidates.map((prompt) => [`${prompt.id}|${normalizePromptText(prompt.prompt_text)}`, prompt])
  ).values()];
  const unseenCandidates = uniqueCandidates.filter((prompt) => {
    const normalizedPrompt = normalizePromptText(prompt.prompt_text);
    return prompt.id !== input.current_prompt_id
      && !recentPromptIds.slice(0, 2).includes(prompt.id)
      && normalizedPrompt !== currentPromptNormalized
      && !recentPromptTexts.slice(0, 2).includes(normalizedPrompt);
  });
  const candidates = unseenCandidates.length > 0 ? unseenCandidates : uniqueCandidates;

  if (input.genre === 'email' && !hasCompletedStarterEmailPrompt) {
    const starterPromptRecord = allCandidates.find((prompt) => normalizePromptText(prompt.prompt_text) === normalizedStarterEmailPrompt) ?? null;
    return ok({
      prompt_text: EMAIL_STARTER_PROMPT_TEXT,
      base_prompt_text: EMAIL_STARTER_PROMPT_TEXT,
      genre: input.genre,
      prompt_id: starterPromptRecord?.id ?? null,
      difficulty_level: starterPromptRecord?.difficulty_label ?? targetDifficulty,
      target_word_count: starterPromptRecord?.target_word_count ?? (normalizedGrade <= 7 ? 80 : normalizedGrade <= 9 ? 120 : 160),
      focus_tags: starterPromptRecord?.focus_tags ?? uniqueFocusTargets,
      context_tags: starterPromptRecord?.context_tags ?? ['community'],
      mission_hint_categories: [...new Set(weaknessTags.map((tag) => WEAKNESS_TAG_TO_MISSION_CATEGORY[tag as keyof typeof WEAKNESS_TAG_TO_MISSION_CATEGORY]).filter(Boolean))],
      selection_source: 'fallback_default',
      used_weakness_tags: weaknessTags,
      pool_size: uniqueCandidates.length,
    });
  }

  if (candidates.length === 0) {
    const fallback = FALLBACK_PROMPT_BY_GENRE[input.genre];
    const fallbackText = fallback ?? 'Write a clear response that answers every part of the prompt with strong detail.';
    return ok({
      prompt_text: fallbackText,
      base_prompt_text: fallbackText,
      genre: input.genre,
      prompt_id: null,
      difficulty_level: targetDifficulty,
      target_word_count: normalizedGrade <= 7 ? 80 : normalizedGrade <= 9 ? 120 : 160,
      focus_tags: uniqueFocusTargets,
      context_tags: [],
      mission_hint_categories: [...new Set(weaknessTags.map((tag) => WEAKNESS_TAG_TO_MISSION_CATEGORY[tag as keyof typeof WEAKNESS_TAG_TO_MISSION_CATEGORY]).filter(Boolean))],
      selection_source: 'fallback_default',
      used_weakness_tags: weaknessTags,
      pool_size: uniqueCandidates.length,
    });
  }

  const ranked = candidates
    .map((prompt) => {
      const normalizedPrompt = normalizePromptText(prompt.prompt_text);
      const { focus_tags, context_tags } = resolvePromptFocusAndContext(prompt);
      const matchedWeaknessFocus = focus_tags.filter((tag) => uniqueFocusTargets.includes(tag)).length;
      const recentIndex = recentPromptTexts.findIndex((item) => item === normalizedPrompt);
      const recentIdIndex = recentPromptIds.findIndex((item) => item === prompt.id);
      const recencyPenalty = Math.max(
        recentIndex === -1 ? 0 : recentIndex < 2 ? 120 : 50,
        recentIdIndex === -1 ? 0 : recentIdIndex < 2 ? 120 : 50
      );
      const sameAsCurrentPenalty =
        (currentPromptNormalized && currentPromptNormalized === normalizedPrompt) || prompt.id === input.current_prompt_id
          ? 500
          : 0;
      const difficultyBonus = prompt.difficulty_label === targetDifficulty ? 18 : 0;
      const lastUsedTimestamp = prompt.rotation_metadata.last_used_at ? Date.parse(prompt.rotation_metadata.last_used_at) : 0;
      const freshnessBonus = lastUsedTimestamp > 0 ? Math.min(8, Math.floor((Date.now() - lastUsedTimestamp) / (1000 * 60 * 60 * 24 * 3))) : 8;
      const score = matchedWeaknessFocus * 14 + difficultyBonus + freshnessBonus - recencyPenalty - sameAsCurrentPenalty - Math.min(8, prompt.usage_count);
      return { prompt, score, focus_tags, context_tags };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.prompt.usage_count !== b.prompt.usage_count) return a.prompt.usage_count - b.prompt.usage_count;
      return a.prompt.id.localeCompare(b.prompt.id);
    });

  const selected = ranked[0];
  const usedAt = new Date().toISOString();
  const existing = selected.prompt.rotation_metadata.recent_student_usage[input.student_id] ?? [];
  selected.prompt.rotation_metadata.recent_student_usage[input.student_id] = [...existing, selected.prompt.id].slice(-5);
  selected.prompt.rotation_metadata.last_used_at = usedAt;
  selected.prompt.usage_count += 1;
  selected.prompt.updated_at = usedAt;

  const basePromptText = selected.prompt.prompt_text.trim();
  let finalPromptText = basePromptText;
  if (input.use_ai_polish) {
    const rewrite = await requestWritingAiAssist({
      mode: 'prompt_rewrite',
      prompt_text: `${basePromptText}\n\nLightly personalize wording for this student while preserving the same task goals, genre, and difficulty.`,
      weaknesses: weaknessTags.map((tag) => tag.replaceAll('_', ' ')),
      grade: normalizedGrade,
      genre: input.genre,
    });
    if (rewrite.ok && rewrite.data) {
      const ai = (rewrite.data.result ?? {}) as { rewritten_prompt?: string };
      const polished = ai.rewritten_prompt?.trim();
      if (polished) finalPromptText = polished;
    }
  }

  persistStore();
  return ok({
    prompt_text: finalPromptText,
    base_prompt_text: basePromptText,
    genre: input.genre,
    prompt_id: selected.prompt.id,
    difficulty_level: selected.prompt.difficulty_label,
    target_word_count: selected.prompt.target_word_count,
    focus_tags: selected.focus_tags,
    context_tags: selected.context_tags,
    mission_hint_categories: [...new Set(weaknessTags.map((tag) => WEAKNESS_TAG_TO_MISSION_CATEGORY[tag as keyof typeof WEAKNESS_TAG_TO_MISSION_CATEGORY]).filter(Boolean))],
    selection_source: 'prompt_bank',
    used_weakness_tags: weaknessTags,
    pool_size: uniqueCandidates.length,
  });
};

export const getNextRotatedPromptForStudent = (input: {
  student_id: string;
  grade: number;
  genre: SupportedGenre;
  difficulty_label?: PromptDifficultyLabel;
  used_at?: string;
}): ServiceResponse<WritingPromptRecord> => {
  hydrateStore();
  const candidates = store.promptBank
    .filter((prompt) => !prompt.is_archived && prompt.is_active)
    .filter((prompt) => prompt.genre === input.genre)
    .filter((prompt) => gradeMatchesBand(input.grade, prompt.grade_band))
    .filter((prompt) => (input.difficulty_label ? prompt.difficulty_label === input.difficulty_label : true));

  if (candidates.length === 0) return badRequest('no active prompt available for the requested student profile.');

  const withSortMeta = candidates
    .map((prompt) => {
      const recent = prompt.rotation_metadata.recent_student_usage[input.student_id] ?? [];
      const seenRecently = recent.slice(-3).includes(prompt.id);
      const lastUsed = prompt.rotation_metadata.last_used_at ? Date.parse(prompt.rotation_metadata.last_used_at) : 0;
      return { prompt, seenRecently, lastUsed };
    })
    .sort((a, b) => {
      if (a.seenRecently !== b.seenRecently) return Number(a.seenRecently) - Number(b.seenRecently);
      if (a.lastUsed !== b.lastUsed) return a.lastUsed - b.lastUsed;
      return a.prompt.usage_count - b.prompt.usage_count;
    });

  const selected = withSortMeta[0].prompt;
  const usedAt = input.used_at ?? new Date().toISOString();
  const existing = selected.rotation_metadata.recent_student_usage[input.student_id] ?? [];
  selected.rotation_metadata.recent_student_usage[input.student_id] = [...existing, selected.id].slice(-5);
  selected.rotation_metadata.last_used_at = usedAt;
  selected.usage_count += 1;
  selected.updated_at = usedAt;
  persistStore();
  return ok(selected);
};

export const saveAdminReviewSignal = (input: {
  entity_type: AdminReviewEntityType;
  entity_id: string;
  student_id?: string;
  status: AdminReviewStatus;
  note?: string;
}): ServiceResponse<AdminReviewSignal> => {
  hydrateStore();
  if (!input.entity_id.trim()) return badRequest('entity_id is required.');
  const now = new Date().toISOString();
  const existing = store.reviewSignals.find(
    (item) => item.entity_type === input.entity_type && item.entity_id === input.entity_id && item.student_id === input.student_id
  );
  if (existing) {
    existing.status = input.status;
    existing.note = input.note;
    existing.updated_at = now;
    persistStore();
    return ok(existing);
  }
  const signal: AdminReviewSignal = {
    id: buildId('review'),
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    student_id: input.student_id,
    status: input.status,
    note: input.note,
    created_at: now,
    updated_at: now,
  };
  store.reviewSignals.push(signal);
  persistStore();
  return ok(signal);
};

export const listAdminReviewSignals = (filters: {
  status?: AdminReviewStatus;
  entity_type?: AdminReviewEntityType;
  student_id?: string;
} = {}): ServiceResponse<AdminReviewSignal[]> => {
  hydrateStore();
  return ok(
    store.reviewSignals.filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (filters.entity_type && item.entity_type !== filters.entity_type) return false;
      if (filters.student_id && item.student_id !== filters.student_id) return false;
      return true;
    })
  );
};

export const setPromptQualityFlag = (
  promptId: string,
  flag: WritingPromptRecord['prompt_quality_flag'],
  note?: string
): ServiceResponse<WritingPromptRecord> => {
  hydrateStore();
  const prompt = store.promptBank.find((item) => item.id === promptId);
  if (!prompt) return badRequest('prompt not found.');
  prompt.prompt_quality_flag = flag;
  prompt.prompt_quality_note = note;
  prompt.updated_at = new Date().toISOString();
  persistStore();
  return ok(prompt);
};

export const setCalibrationFollowUpFlag = (
  studentId: string,
  flagged: boolean,
  note?: string
): ServiceResponse<{ flagged: boolean; note?: string; updated_at: string }> => {
  hydrateStore();
  const hasAnyGenreState = [...store.states.keys()].some((key) => parseStateKey(key).studentId === studentId);
  if (!hasAnyGenreState) return badRequest('student writing state not found.');
  const record = {
    flagged,
    note,
    updated_at: new Date().toISOString(),
  };
  store.calibrationFollowUpByStudent[studentId] = record;
  persistStore();
  return ok(record);
};

export const seedWritingPilotReadinessDemoData = (): ServiceResponse<{ seeded_students: string[] }> => {
  __resetWritingIntegrationStoreForTests();
  const basePrompt = 'Write about a school event and include one improvement suggestion.';
  const seededStudents = [
    { id: 'seed-lower-struggling', grade: 6, genre: 'paragraph' as SupportedGenre, response: 'I is go event short', strong: false },
    {
      id: 'seed-middle-average',
      grade: 8,
      genre: 'article' as SupportedGenre,
      response: 'The event was useful and I suggest one practical change for next time.',
      strong: true,
    },
    {
      id: 'seed-upper-strong',
      grade: 11,
      genre: 'essay' as SupportedGenre,
      response: 'This essay explains the event impact, evaluates outcomes, and proposes a precise recommendation.',
      strong: true,
    },
    { id: 'seed-stalled', grade: 7, genre: 'email' as SupportedGenre, response: 'Bad short text', strong: false },
    {
      id: 'seed-improving',
      grade: 9,
      genre: 'essay' as SupportedGenre,
      response: 'Improving response with clear structure and prompt coverage.',
      strong: true,
    },
    { id: 'seed-low-improvement-tag', grade: 8, genre: 'article' as SupportedGenre, response: 'Tiny weak line', strong: false },
  ];

  createWritingPrompt({
    title: 'Seed Overused Prompt',
    prompt_text: basePrompt,
    genre: 'essay',
    grade_band: '8-11',
    target_word_count: 120,
    difficulty_label: 'core',
    curriculum_tags: ['seed', 'overused'],
    safety_status: 'approved',
  });

  seededStudents.forEach((student, idx) => {
    submitInitialWritingAssessment({
      student_id: student.id,
      student_name: `Seed ${student.id}`,
      grade: student.grade,
      genre: student.genre,
      prompt_text: basePrompt,
      target_word_count: 110,
      student_response: student.response,
      attempted_at: `2026-02-0${(idx % 8) + 1}T10:00:00.000Z`,
    });
    submitInitialWritingAssessment({
      student_id: student.id,
      student_name: `Seed ${student.id}`,
      grade: student.grade,
      genre: student.genre,
      prompt_text: basePrompt,
      target_word_count: 110,
      student_response: student.strong ? `${student.response} Added detail and stronger organization.` : student.response,
      attempted_at: `2026-03-0${(idx % 8) + 1}T10:00:00.000Z`,
    });
  });

  for (let idx = 0; idx < WRITING_PILOT_GUARDRAILS.prompt_overuse_threshold; idx += 1) {
    getNextRotatedPromptForStudent({
      student_id: `seed-usage-${idx}`,
      grade: 9,
      genre: 'essay',
      used_at: `2026-03-${String((idx % 9) + 1).padStart(2, '0')}T09:00:00.000Z`,
    });
  }

  return ok({ seeded_students: seededStudents.map((student) => student.id) });
};

export const runWritingPilotVerificationChecklist = (): ServiceResponse<{
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}> => {
  const seeded = seedWritingPilotReadinessDemoData();
  if (!seeded.ok || !seeded.data) return badRequest('failed to seed pilot readiness demo data.');

  const analytics = getWritingAnalyticsDashboard();
  const monitoring = getWritingMonitoringOverview('2026-03');
  const promptList = listWritingPrompts({ is_active: true });
  const calibration = getWritingCalibrationCase(seeded.data.seeded_students[0], '2026-03');

  const checks = [
    {
      name: 'seeded demo data',
      pass: seeded.data.seeded_students.length >= 6,
      detail: `${seeded.data.seeded_students.length} seeded students`,
    },
    {
      name: 'analytics warnings',
      pass: analytics.ok && (analytics.data?.pilot_readiness.overused_prompts.length ?? 0) > 0,
      detail: analytics.ok ? `overused prompts: ${analytics.data!.pilot_readiness.overused_prompts.length}` : analytics.error ?? 'analytics unavailable',
    },
    {
      name: 'drill-down links prerequisites',
      pass: analytics.ok && (analytics.data?.most_common_weakness_tags.length ?? 0) > 0,
      detail: analytics.ok ? `hotspots: ${analytics.data!.most_common_weakness_tags.length}` : analytics.error ?? 'analytics unavailable',
    },
    {
      name: 'monitoring filters data',
      pass: monitoring.ok && (monitoring.data?.student_rows.length ?? 0) > 0,
      detail: monitoring.ok ? `rows: ${monitoring.data!.student_rows.length}` : monitoring.error ?? 'monitoring unavailable',
    },
    {
      name: 'calibration review data',
      pass: calibration.ok && !!calibration.data?.latest_assessment,
      detail: calibration.ok ? `student: ${calibration.data!.student_id}` : calibration.error ?? 'calibration unavailable',
    },
    {
      name: 'prompt-bank overuse case',
      pass:
        promptList.ok &&
        promptList.data!.some((prompt) => prompt.usage_count >= WRITING_PILOT_GUARDRAILS.prompt_overuse_threshold),
      detail: promptList.ok ? `prompts: ${promptList.data!.length}` : promptList.error ?? 'prompt list unavailable',
    },
    {
      name: 'monthly-ready reporting',
      pass: monitoring.ok && (monitoring.data?.monthly_review_ready_students.length ?? 0) >= 0,
      detail: monitoring.ok
        ? `monthly-ready students: ${monitoring.data!.monthly_review_ready_students.length}`
        : monitoring.error ?? 'monitoring unavailable',
    },
  ];

  return ok({ checks });
};

export const requestWritingAiAssist = async (input: {
  mode: 'feedback' | 'plan_assist' | 'prompt_rewrite';
  prompt_text: string;
  student_response?: string;
  weaknesses?: string[];
  grade?: number;
  genre?: SupportedGenre;
}): Promise<ServiceResponse<{ mode: 'feedback' | 'plan_assist' | 'prompt_rewrite'; result: unknown }>> => {
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return badRequest('Authentication required for writing AI assist. Please sign in and try again.');
    }

    const { data, error } = await supabase.functions.invoke('bh_writing_ai', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        mode: input.mode,
        promptText: input.prompt_text,
        studentResponse: input.student_response,
        weaknesses: input.weaknesses ?? [],
        grade: normalizeGrade(input.grade) ?? null,
        genre: input.genre ?? null,
      },
    });

    if (error || !data) {
      return badRequest(error?.message ?? 'Unable to fetch writing AI assist.');
    }

    return ok(data as { mode: 'feedback' | 'plan_assist' | 'prompt_rewrite'; result: unknown });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to fetch writing AI assist.');
  }
};

export interface StudentWritingIntegrityContext {
  mode: WritingIntegrityMode;
  class_id: string | null;
  class_name: string;
}

export const getStudentWritingIntegrityMode = async (): Promise<ServiceResponse<StudentWritingIntegrityContext>> => {
  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test') {
    return ok({ mode: 'practice', class_id: null, class_name: 'Practice workspace' });
  }

  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_student_integrity_mode');
    if (error || !data || typeof data !== 'object') {
      return ok({ mode: 'practice', class_id: null, class_name: 'Practice workspace' });
    }

    const remote = data as Record<string, unknown>;
    const mode = remote['mode'];
    return ok({
      mode: mode === 'independent' || mode === 'supervised' ? mode : 'practice',
      class_id: typeof remote['class_id'] === 'string' ? remote['class_id'] : null,
      class_name: typeof remote['class_name'] === 'string' ? remote['class_name'] : 'Practice workspace',
    });
  } catch {
    return ok({ mode: 'practice', class_id: null, class_name: 'Practice workspace' });
  }
};

export const setTeacherWritingIntegrityMode = async (input: {
  class_id: string;
  mode: WritingIntegrityMode;
}): Promise<ServiceResponse<StudentWritingIntegrityContext>> => {
  if (!input.class_id) return badRequest('Select a class before changing its writing mode.');
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_set_integrity_mode', {
      p_class_id: input.class_id,
      p_mode: input.mode,
    });
    if (error || !data) return badRequest('Unable to update the class writing mode. Please try again.');
    return ok(data as StudentWritingIntegrityContext);
  } catch {
    return badRequest('Unable to update the class writing mode. Please try again.');
  }
};

export interface TeacherWritingReport {
  report_type: 'teacher_writing_report';
  generated_at: string;
  period: string;
  student: {
    student_id: string;
    student_name: string;
    grade: number | null;
    class_id: string | null;
    class_name: string;
  };
  genre: string;
  institution?: {
    school_name: string;
    school_logo_url?: string | null;
    teacher_name: string;
  };
  overall_summary: {
    latest_score: number | null;
    score_trend_delta: number | null;
    completion_rate_percent: number;
    completed_tasks: number;
    total_tasks: number;
    submission_count?: number;
    all_time_submission_count?: number;
    baseline_submission_count?: number;
    practice_assigned_count?: number;
    practice_completed_count?: number;
  };
  rubric_scores?: {
    content: number | null;
    communicative_achievement: number | null;
    organisation: number | null;
    language: number | null;
  };
  integrity?: {
    mode: WritingIntegrityMode;
    review_status: WritingIntegrityReviewStatus;
    reasons: string[];
    paste_ratio_percent: number;
  };
  strengths: string[];
  priority_weak_areas: string[];
  repeated_error_patterns: string[];
  latest_evaluation: Record<string, unknown>;
  monthly_summary: Record<string, unknown>;
  teacher_actions: string[];
  calibration_follow_up_flag: boolean;
  evidence_snippet: string | null;
  student_friendly_summary: {
    strengths: string[];
    top_improvement_targets: string[];
    progress_summary: string;
    next_steps: string[];
  };
}

export interface TeacherWritingAttemptRecord {
  row_id: string;
  attempt_id: string;
  student_id: string;
  genre: string;
  attempt_type: string | null;
  attempt_number: number | null;
  retry_kind: string | null;
  revision_cycle_id: string | null;
  parent_attempt_id: string | null;
  prompt_id: string | null;
  prompt_text: string;
  student_submission: string;
  assessment: Record<string, unknown>;
  rich_feedback: Record<string, unknown>;
  created_at: string;
}

export interface TeacherSavedWritingReport {
  id: string;
  student_id: string;
  attempt_id: string | null;
  report_mode: 'student' | 'attempt';
  month: string | null;
  genre: string | null;
  status: 'draft' | 'final';
  report_payload: Record<string, unknown>;
  teacher_comment: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export const mapCalibrationCaseToTeacherReport = (
  c: WritingCalibrationCase,
  month: string,
  genre: SupportedGenre = 'essay'
): TeacherWritingReport => {
  const topTargets = c.latest_assessment?.weakness_tags?.slice(0, 3) ?? [];
  const strengths = c.latest_assessment
    ? [`Recent score: ${c.latest_assessment.total_score}.`, 'Keep building consistency on successful task responses.']
    : ['Shows persistence with writing practice tasks.'];
  const teacherActions = topTargets.length
    ? [`Focus mini-lesson on: ${topTargets.slice(0, 2).join(', ')}.`, 'Assign one short targeted rewrite task this week.']
    : ['Continue current weekly plan and monitor progress trend.'];
  const nextSteps = topTargets.length
    ? topTargets.map((tag) => `Practice target: ${tag}`)
    : ['Complete the next two daily writing tasks to unlock clearer trend data.'];

  const completedTasks = c.latest_practice_evaluations.length;
  const totalTasks = c.generated_daily_tasks.length;
  const completionRatePercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    report_type: 'teacher_writing_report',
    generated_at: new Date().toISOString(),
    period: month,
    student: {
      student_id: c.student_id,
      student_name: c.student_name,
      grade: c.grade,
      class_id: null,
      class_name: 'Unassigned',
    },
    genre,
    overall_summary: {
      latest_score: c.latest_assessment?.total_score ?? null,
      score_trend_delta: null,
      completion_rate_percent: completionRatePercent,
      completed_tasks: completedTasks,
      total_tasks: totalTasks,
      submission_count: c.latest_assessment ? 1 : 0,
      baseline_submission_count: c.latest_assessment ? 1 : 0,
      practice_completed_count: completedTasks,
      practice_assigned_count: totalTasks,
    },
    rubric_scores: {
      content: c.latest_assessment?.subscores.content ?? null,
      communicative_achievement: c.latest_assessment?.subscores.communicative_achievement ?? null,
      organisation: c.latest_assessment?.subscores.organisation ?? null,
      language: c.latest_assessment?.subscores.language ?? null,
    },
    integrity: {
      mode: 'practice',
      review_status: 'practice_mode',
      reasons: [],
      paste_ratio_percent: 0,
    },
    strengths,
    priority_weak_areas: c.latest_assessment?.weakness_tags ?? [],
    repeated_error_patterns: c.latest_assessment?.weakness_tags ?? [],
    latest_evaluation: (c.latest_practice_evaluations[0]?.evaluation as unknown as Record<string, unknown>) ?? {},
    monthly_summary: (c.monthly_report_snapshot?.report as unknown as Record<string, unknown>) ?? {},
    teacher_actions: teacherActions,
    calibration_follow_up_flag: c.calibration_follow_up_flag,
    evidence_snippet: null,
    student_friendly_summary: {
      strengths: strengths.slice(0, 2),
      top_improvement_targets: topTargets,
      progress_summary: c.monthly_report_snapshot?.report.score_change ?? 'Keep going.',
      next_steps: nextSteps,
    },
  };
};

export const getTeacherWritingReport = async (input: {
  student_id: string;
  month?: string;
  genre?: SupportedGenre;
  include_snippet?: boolean;
}): Promise<ServiceResponse<TeacherWritingReport>> => {
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      return badRequest('Authentication required for teacher reports. Please sign in and try again.');
    }

    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_report', {
      p_student_id: input.student_id,
      p_month: input.month ?? null,
      p_genre: input.genre ?? null,
      p_include_snippet: input.include_snippet ?? false,
    });

    if (error || !data) {
      return badRequest(error?.message ?? 'Unable to generate teacher writing report.');
    }

    return ok(data as TeacherWritingReport);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to generate teacher writing report.');
  }
};

export const getTeacherAttemptListScoped = async (input: {
  student_id: string;
  genre?: SupportedGenre;
  limit?: number;
}): Promise<ServiceResponse<TeacherWritingAttemptRecord[]>> => {
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_attempts', {
      p_student_id: input.student_id,
      p_genre: input.genre ?? null,
      p_limit: input.limit ?? 80,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to load teacher attempt list.');
    const seenAttemptIds = new Set<string>();
    const deduplicated = (data as TeacherWritingAttemptRecord[]).filter((attempt) => {
      const attemptKey = attempt.attempt_id || attempt.row_id;
      if (seenAttemptIds.has(attemptKey)) return false;
      seenAttemptIds.add(attemptKey);
      return true;
    });
    return ok(deduplicated);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load teacher attempt list.');
  }
};

export const getTeacherGeneralReportScoped = async (input: {
  student_id: string;
  month?: string;
  genre?: SupportedGenre;
}): Promise<ServiceResponse<Record<string, unknown>>> => {
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_general_report', {
      p_student_id: input.student_id,
      p_month: input.month ?? null,
      p_genre: input.genre ?? null,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to load teacher general report.');
    return ok(data as Record<string, unknown>);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load teacher general report.');
  }
};

export const getTeacherAttemptReportScoped = async (input: {
  student_id: string;
  attempt_id: string;
  genre?: SupportedGenre;
}): Promise<ServiceResponse<Record<string, unknown>>> => {
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_attempt_report', {
      p_student_id: input.student_id,
      p_attempt_id: input.attempt_id,
      p_genre: input.genre ?? null,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to load teacher attempt report.');
    return ok(data as Record<string, unknown>);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load teacher attempt report.');
  }
};

export const getTeacherSavedReportsScoped = async (input: {
  student_id: string;
  attempt_id?: string;
  mode?: 'student' | 'attempt';
}): Promise<ServiceResponse<TeacherSavedWritingReport[]>> => {
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_reports', {
      p_student_id: input.student_id,
      p_attempt_id: input.attempt_id ?? null,
      p_mode: input.mode ?? null,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to load saved teacher reports.');
    return ok(data as TeacherSavedWritingReport[]);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load saved teacher reports.');
  }
};

export const saveTeacherReportScoped = async (input: {
  report_id?: string;
  student_id: string;
  attempt_id?: string;
  mode: 'student' | 'attempt';
  month?: string;
  genre?: SupportedGenre;
  status: 'draft' | 'final';
  report_payload: Record<string, unknown>;
  teacher_comment?: string;
}): Promise<ServiceResponse<TeacherSavedWritingReport>> => {
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_save_teacher_report', {
      p_report_id: input.report_id ?? null,
      p_student_id: input.student_id,
      p_attempt_id: input.attempt_id ?? null,
      p_mode: input.mode,
      p_month: input.month ?? null,
      p_genre: input.genre ?? null,
      p_status: input.status,
      p_report_payload: input.report_payload ?? {},
      p_teacher_comment: input.teacher_comment ?? null,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to save teacher report.');
    return ok(data as TeacherSavedWritingReport);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to save teacher report.');
  }
};

const isNodeTestRuntime = (): boolean => {
  try {
    return typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  } catch {
    return false;
  }
};

export const getTeacherMonitoringOverviewScoped = async (
  month = new Date().toISOString().slice(0, 7),
  filters?: { grade?: number; genre?: SupportedGenre }
): Promise<ServiceResponse<WritingMonitoringOverview>> => {
  if (isNodeTestRuntime()) return getWritingMonitoringOverview(month);
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_monitoring', {
      p_month: month,
      p_grade: filters?.grade ?? null,
      p_genre: filters?.genre ?? null,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to load scoped teacher monitoring.');
    return ok(data as WritingMonitoringOverview);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load scoped teacher monitoring.');
  }
};

export const getTeacherAnalyticsDashboardScoped = async (
  month = new Date().toISOString().slice(0, 7),
  filters?: { grade?: number; genre?: SupportedGenre }
): Promise<ServiceResponse<WritingAnalyticsDashboard>> => {
  if (isNodeTestRuntime()) return getWritingAnalyticsDashboard({ grade: filters?.grade, genre: filters?.genre });
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const params = { p_month: month, p_grade: filters?.grade ?? null, p_genre: filters?.genre ?? null };
    const [{ data, error }, weaknessResult] = await Promise.all([
      supabase.rpc('rpc_bh_writing_teacher_analytics', params),
      supabase.rpc('rpc_bh_writing_teacher_weakness_counts', params),
    ]);
    if (error || !data) return badRequest(error?.message ?? 'Unable to load scoped teacher analytics.');
    const analytics = data as WritingAnalyticsDashboard;
    if (!weaknessResult.error && weaknessResult.data) {
      const weaknessData = weaknessResult.data as {
        most_common_weakness_tags?: WritingAnalyticsDashboard['most_common_weakness_tags'];
        student_weakness_counts?: WritingAnalyticsDashboard['student_weakness_counts'];
      };
      analytics.most_common_weakness_tags = weaknessData.most_common_weakness_tags ?? analytics.most_common_weakness_tags;
      analytics.student_weakness_counts = weaknessData.student_weakness_counts ?? [];
    } else {
      analytics.student_weakness_counts = analytics.student_weakness_counts ?? [];
    }
    return ok(analytics);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load scoped teacher analytics.');
  }
};

export const getTeacherCalibrationQueueScoped = async (
  month = new Date().toISOString().slice(0, 7),
  limit = 50
): Promise<ServiceResponse<Array<{ student_id: string; student_name: string; grade: number; latest_score: number | null; priority_weak_areas: string[]; completion_rate: number }>>> => {
  if (isNodeTestRuntime()) {
    const monitoring = getWritingMonitoringOverview(month);
    if (!monitoring.ok || !monitoring.data) return badRequest(monitoring.error ?? 'No calibration data available.');
    return ok(
      monitoring.data.student_rows.map((row) => ({
        student_id: row.student_id,
        student_name: row.student_name,
        grade: row.current_grade,
        latest_score: row.latest_score,
        priority_weak_areas: row.repeated_weakness_hotspots,
        completion_rate: row.completion_rate,
      }))
    );
  }
  try {
    const { supabase } = await import('../../../services/supabaseClient.js');
    const { data, error } = await supabase.rpc('rpc_bh_writing_teacher_calibration_queue', {
      p_month: month,
      p_limit: limit,
    });
    if (error || !data) return badRequest(error?.message ?? 'Unable to load scoped calibration queue.');
    return ok(data as Array<{ student_id: string; student_name: string; grade: number; latest_score: number | null; priority_weak_areas: string[]; completion_rate: number }>);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Unable to load scoped calibration queue.');
  }
};

export const getTeacherStudentSummaryScoped = async (input: {
  student_id: string;
  month?: string;
  genre?: SupportedGenre;
  include_snippet?: boolean;
}): Promise<ServiceResponse<TeacherWritingReport>> => {
  if (isNodeTestRuntime()) {
    const calibration = getWritingCalibrationCase(input.student_id, input.month, input.genre);
    if (!calibration.ok || !calibration.data) return badRequest(calibration.error ?? 'No student summary available.');
    return ok(
      mapCalibrationCaseToTeacherReport(
        calibration.data,
        input.month ?? new Date().toISOString().slice(0, 7),
        input.genre ?? 'essay'
      )
    );
  }
  return getTeacherWritingReport(input);
};

export const getWritingPersistenceDiagnostics = (): ServiceResponse<{
  mode: 'db' | 'fallback-local' | 'runtime-only';
  repository_mode: 'db' | 'disabled';
}> => {
  return ok({
    mode: lastPersistenceMode,
    repository_mode: getWritingRepositoryMode(),
  });
};

export const __resetWritingIntegrationStoreForTests = (): void => {
  store.profiles.clear();
  store.usernamesById = {};
  store.states.clear();
  store.attempts = [];
  store.weeklyPlans = [];
  store.dailyTasks = [];
  store.dailySubmissions = [];
  store.dailyEvaluations = [];
  store.monthlyReports = [];
  store.memorySnapshots = [];
  store.promptBank = [];
  store.reviewSignals = [];
  store.calibrationFollowUpByStudent = {};
  storeMutationVersion = 0;
  hydratedStudentId = null;
  hydrationGeneration += 1;
  hydrationTriggered = false;
  hydrationInFlight = null;
  hydrationState = 'idle';
  hydrationListeners.clear();
  persistenceListeners.clear();
  persistenceStatus = { state: 'idle', message: null, updated_at: null };
  lastPersistenceMode = 'runtime-only';
  const storage = getStorage();
  if (storage) storage.removeItem(WRITING_STORE_KEY);
};

export const __getWritingIntegrationStoreForTests = (): WritingPersistenceStore => store;
