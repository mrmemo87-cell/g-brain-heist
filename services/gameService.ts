Warning: truncated output (original token count: 58773)
Total output lines: 6715

import {
    Profile,
    Task,
    SessionStatus,
    Caps,
    NewsEvent,
    SubjectData,
    Question,
    AnswerResponse,
    RaidTarget,
    RaidAttackResult,
    ShopItem,
    PurchaseReceipt,
    Clan,
    ClanChatMessage,
    ClanSummary,
    ClanMember,
    ClanBuff,
    ClanBuffTemplate,
    ActiveClanBuff,
    ClanBuffEffect,
    ClanRole,
    ClanJoinRequest,
    InventoryItem,
    Teacher,
    TeacherQuestion,
    CreateQuestionRequest,
    QuestionAttemptResult,
    QuestTemplate,
    Batch,
    CreateAssignmentRequest,
    Subject,
    TeacherAssignmentSummary,
    StudentAssignmentTask,
    TeacherAssignmentReportRow,
    AssignmentResultInput,
    StudentForAssignment,
    QuestionOption,
    Grade,
    StudentAssignmentAnswer,
    AssignmentQuestionAnalysis,
    StudentAnswerInput,
    CompletedAssignment,
    AssignmentAchievementEarned,
    MyAssignmentAnswer,
    QuestRunState,
    QuestAnswerResult,
    QuestEventResult,
    QuestChestResult,
    BrainsMasterPurchaseResult,
    TaskClaimReward,
    XpStatus,
    DailyStreakRewardReceipt,
} from '../types.js';
import * as RaidFeatureService from '../src/features/raids/raidService.js';
import {
    BossUnlockState,
    RaidAnswerPayload,
    RaidFinalizationResult,
    RaidParticipantState,
    RaidQuestion,
    RaidQuestionRequest,
    RaidStatus,
    RaidWaveState,
} from '../src/features/raids/raidTypes.js';
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addPlayerToSharedList, addActivityEvent, getActivityFeed, getTaskProgress, incrementPvPWin, incrementWeeklyTaskCompleted, getPurchaseCount, incrementPurchaseCount } from './storageService.js';
import { supabase } from './supabaseClient.js';
import { fetchNeonFrameOwners, fetchFlickerThemeOwners, fetchGlitchEffectOwners } from './cosmeticService.js';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './banMessage.js';
import { notificationService } from './notificationService.js';
import { fetchMyXpStatus } from './xpStatus.js';
import { normalizeTeacherRoster, type TeacherRosterRow } from '../src/lib/teacherRoster.js';
import { audioService } from './audioService.js';
import {
    regenerateUserAp,
    notifyApFull,
    performHackAttempt,
    checkAchievements as rpcCheckAchievements,
    createTeacherProfile as rpcCreateTeacherProfile,
    recordQuestionAttempt,
    createAssignment as rpcCreateAssignment,
    getAssignmentsForTeacher as rpcGetAssignmentsForTeacher,
    deleteTeacherAssignment as rpcDeleteTeacherAssignment,
    updateTeacherAssignment as rpcUpdateTeacherAssignment,
    getTeacherAssignmentSuccessSummary as rpcGetTeacherAssignmentSuccessSummary,
    getStudentsForAssignment as rpcGetStudentsForAssignment,
    getStudentActiveAssignment as rpcGetStudentActiveAssignment,
    getStudentPendingAssignments as rpcGetStudentPendingAssignments,
    submitAssignmentResult as rpcSubmitAssignmentResult,
    teacherAssignmentReport as rpcTeacherAssignmentReport,
    submitAssignmentAnswer as rpcSubmitAssignmentAnswer,
    getAssignmentStudentAnswers as rpcGetAssignmentStudentAnswers,
    getAssignmentQuestionAnalysis as rpcGetAssignmentQuestionAnalysis,
    getStudentCompletedAssignments as rpcGetStudentCompletedAssignments,
    checkAssignmentAchievements as rpcCheckAssignmentAchievements,
    getMyAssignmentAnswers as rpcGetMyAssignmentAnswers
} from './rpcGateway.js';

const MOCK_DELAY = 500;

const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

let pendingDailyStreakReward: DailyStreakRewardReceipt | null = null;

const recordDailyStreakForProfile = async (profile: Profile): Promise<void> => {
  if ((profile.role ?? 'student') !== 'student') return;

  const { data, error } = await supabase.rpc('rpc_record_daily_streak');
  if (error) {
    console.warn('[whoami] Daily streak reward could not be recorded:', error.message);
    return;
  }
  if (!data) return;

  const receipt: DailyStreakRewardReceipt = {
    claimed: data.claimed === true,
    reward_date: String(data.reward_date ?? formatLocalDateKey(new Date())),
    streak: Number(data.streak ?? profile.streak ?? 0),
    coins_awarded: Number(data.coins_awarded ?? 0),
    coins: Number(data.coins ?? profile.coins ?? 0),
  };

  if (receipt.claimed) pendingDailyStreakReward = receipt;
  profile.streak = receipt.streak;
  profile.coins = receipt.coins;
  profile.daily_streak_reward = pendingDailyStreakReward ?? receipt;
};

export const consumeDailyStreakReward = (): DailyStreakRewardReceipt | null => {
  const receipt = pendingDailyStreakReward;
  pendingDailyStreakReward = null;
  return receipt;
};

type BootNonCriticalKey = 'tasks' | 'caps' | 'news' | 'assignment' | 'sessionStatus';
type BootNonCriticalTimeouts = Partial<Record<BootNonCriticalKey, number>>;

type BootNonCriticalHandlers = {
  signal?: AbortSignal;
  targets?: BootNonCriticalKey[];
  timeoutsMs?: BootNonCriticalTimeouts;
  onTasks?: (tasks: Task[]) => void;
  onCaps?: (caps: Caps) => void;
  onNews?: (news: NewsEvent[]) => void;
  onAssignment?: (assignment: StudentAssignmentTask | null) => void;
  onSessionStatus?: (status: SessionStatus) => void;
  onError?: (key: BootNonCriticalKey, error: unknown) => void;
};

type CriticalBootResult = {
  session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null;
  profile: Profile | null;
};

const createAbortError = (message = 'Request aborted') => {
  const error = new Error(message) as Error & { name: string };
  error.name = 'AbortError';
  return error;
};

const createTimeoutError = (message = 'Request timed out') => {
  const error = new Error(message) as Error & { name: string };
  error.name = 'TimeoutError';
  return error;
};

const isTimeoutError = (error: unknown) => (error as Error)?.name === 'TimeoutError';
const isAbortError = (error: unknown) => (error as Error)?.name === 'AbortError';

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
  label?: string
): Promise<T> => {
  let timeoutId: number | undefined;
  let abortHandler: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(createTimeoutError(label ? `${label} timed out` : 'Request timed out'));
    }, timeoutMs);
  });

  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(createAbortError());
          return;
        }
        abortHandler = () => reject(createAbortError());
        signal.addEventListener('abort', abortHandler, { once: true });
      })
    : null;

  let progressReadFromDb = false;
  try {
    return await Promise.race([promise, timeoutPromise, ...(abortPromise ? [abortPromise] : [])]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (signal && abortHandler) {
      signal.removeEventListener('abort', abortHandler);
    }
  }
};

const runNonCritical = async <T,>(
  key: BootNonCriticalKey,
  action: () => Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  onSuccess?: (value: T) => void,
  onError?: (key: BootNonCriticalKey, error: unknown) => void
) => {
  try {
    const result = await withTimeout(action(), timeoutMs, signal, key);
    if (!signal?.aborted) {
      onSuccess?.(result);
    }
  } catch (error) {
    if (!signal?.aborted && !isAbortError(error)) {
      onError?.(key, error);
    }
  }
};


const nowIso = (): string => new Date().toISOString();

const SUBJECT_ID_LOOKUP: Record<Subject, string> = {
    Maths: 'maths',
    Science: 'science',
    Biology: 'biology',
    Chemistry: 'chemistry',
    Physics: 'physics',
    English: 'english',
    'Russian Language': 'russian_language',
    'Kyrgyz Language': 'kyrgyz_language',
    'German Language': 'german_language',
    Geography: 'geography',
    'Global Perspective': 'global_perspective',
    'Travel & Tourism': 'travel_tourism',
    ICT: 'ict',
};

const resolveSubjectIdentifier = (subject: Subject, provided?: string): string | undefined => {
    if (provided) return provided;
    return SUBJECT_ID_LOOKUP[subject] || subject.toLowerCase().replace(/\s+/g, '_');
};

const normalizeTopicName = (topic?: string | null, fallback?: string | null): string => {
    const value = topic || fallback || 'General';
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'General';
};

const coerceQuestionOptions = (
    rawOptions: unknown,
    questionType?: string | null
): (string | QuestionOption)[] => {
    if (Array.isArray(rawOptions)) {
        return rawOptions.map((value) => {
            if (value == null) return '';
            // If it's already a QuestionOption object with text property, preserve it
            if (typeof value === 'object' && value !== null && 'text' in value) {
                return {
                    text: String((value as any).text || ''),
                    image_url: (value as any).image_url || undefined
                } as QuestionOption;
            }
            // Otherwise convert to string
            return String(value);
        });
    }

    if (typeof rawOptions === 'string') {
        try {
            const parsed = JSON.parse(rawOptions);
            if (Array.isArray(parsed)) {
                return parsed.map((value) => {
                    if (value == null) return '';
                    // If it's a QuestionOption object, preserve it
                    if (typeof value === 'object' && value !== null && 'text' in value) {
                        return {
                            text: String((value as any).text || ''),
                            image_url: (value as any).image_url || undefined
                        } as QuestionOption;
                    }
                    return String(value);
                });
            }
        } catch (error) {
            // Ignore JSON parse failures and fall back to defaults
        }
    }

    if (rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)) {
        // Handle object with text/image_url at top level (single option scenario - unlikely but safe)
        if ('text' in rawOptions) {
            return [{
                text: String((rawOptions as any).text || ''),
                image_url: (rawOptions as any).image_url || undefined
            }];
        }
        const values = Object.values(rawOptions as Record<string, unknown>)
            .map((value) => {
                if (value == null) return '';
                if (typeof value === 'object' && value !== null && 'text' in value) {
                    return {
                        text: String((value as any).text || ''),
                        image_url: (value as any).image_url || undefined
                    } as QuestionOption;
                }
                return String(value);
            });
        if (values.length) {
            return values;
        }
    }

    if (questionType === 'true_false') {
        return ['True', 'False'];
    }

    return [];
};

const normalizeTeacherQuestionPayload = (question: TeacherQuestion): TeacherQuestion => {
    const resolvedTimeLimitRaw = (question as any).time_limit ?? (question as any).time_limit_seconds;
    const numericTimeLimit = typeof resolvedTimeLimitRaw === 'number' ? resolvedTimeLimitRaw : Number(resolvedTimeLimitRaw);
    const resolvedTimeLimit = Number.isFinite(numericTimeLimit) && numericTimeLimit > 0 ? numericTimeLimit : 30;

    const resolvedPointsRaw = (question as any).points;
    const numericPoints = typeof resolvedPointsRaw === 'number' ? resolvedPointsRaw : Number(resolvedPointsRaw);
    const resolvedPoints = Number.isFinite(numericPoints) && numericPoints >= 0 ? numericPoints : 10;

    return {
        ...question,
        topic_name: normalizeTopicName(question.topic_name ?? undefined, question.topic ?? undefined),
        options: coerceQuestionOptions((question as any).options, question.question_type),
        time_limit: resolvedTimeLimit,
        points: resolvedPoints,
    };
};

type KyrgyzBotPersona = {
    firstName: string;
    lastName: string;
    batch: '8A' | '8B' | '8C';
    clan?: string;
    style: 'aggressive' | 'defensive' | 'balanced';
    levelRange: [number, number];
    coinsRange: [number, number];
    skillRange: [number, number];
    activityMinutesRange: [number, number];
};

const KYRGYZ_BOT_PERSONAS: KyrgyzBotPersona[] = [
    {
        firstName: 'Aibek',
        lastName: 'Sharipov',
        batch: '8B',
        clan: 'Osh Cyber Wolves',
        style: 'balanced',
        levelRange: [9, 14],
        coinsRange: [3200, 6700],
        skillRange: [0.42, 0.68],
        activityMinutesRange: [8, 35],
    },
    {
        firstName: 'Meerim',
        lastName: 'Bekbolotova',
        batch: '8A',
        clan: 'Issyk-Ata Sentinels',
        style: 'defensive',
        levelRange: [11, 16],
        coinsRange: [4100, 7800],
        skillRange: [0.36, 0.6],
        activityMinutesRange: [15, 60],
    },
    {
        firstName: 'Azamat',
        lastName: 'Kudaibergen',
        batch: '8C',
        clan: 'Bishkek Ghosts',
        style: 'aggressive',
        levelRange: [12, 18],
        coinsRange: [5200, 9100],
        skillRange: [0.48, 0.75],
        activityMinutesRange: [5, 28],
    },
    {
        firstName: 'Dinara',
        lastName: 'Samatova',
        batch: '8B',
        clan: 'Tian Shan Sparks',
        style: 'balanced',
        levelRange: [8, 13],
        coinsRange: [2800, 5900],
        skillRange: [0.4, 0.62],
        activityMinutesRange: [20, 90],
    },
    {
        firstName: 'Bakyt',
        lastName: 'Uulu',
        batch: '8C',
        clan: 'Naryn Nomads',
        style: 'aggressive',
        levelRange: [10, 15],
        coinsRange: [3600, 6400],
        skillRange: [0.46, 0.7],
        activityMinutesRange: [12, 48],
    },
    {
        firstName: 'Aidana',
        lastName: 'Turgunbaeva',
        batch: '8A',
        clan: 'At-Bashi Shields',
        style: 'defensive',
        levelRange: [7, 12],
        coinsRange: [2400, 5200],
        skillRange: [0.33, 0.55],
        activityMinutesRange: [30, 120],
    },
    {
        firstName: 'Nursultan',
        lastName: 'Ibraliev',
        batch: '8B',
        clan: 'Talas Encryptors',
        style: 'balanced',
        levelRange: [9, 15],
        coinsRange: [3000, 6800],
        skillRange: [0.45, 0.69],
        activityMinutesRange: [10, 55],
    },
    {
        firstName: 'Selbi',
        lastName: 'Alymkulova',
        batch: '8C',
        clan: 'Tokmok Phantoms',
        style: 'defensive',
        levelRange: [6, 11],
        coinsRange: [2100, 4700],
        skillRange: [0.31, 0.54],
        activityMinutesRange: [25, 150],
    },
    {
        firstName: 'Timur',
        lastName: 'Osmonov',
        batch: '8A',
        clan: 'Batken Overclockers',
        style: 'aggressive',
        levelRange: [11, 17],
        coinsRange: [4800, 8600],
        skillRange: [0.5, 0.78],
        activityMinutesRange: [6, 32],
    },
    {
        firstName: 'Aigul',
        lastName: 'Kerimbekova',
        batch: '8B',
        clan: 'Cholpon-Ata Firewalls',
        style: 'balanced',
        levelRange: [8, 14],
        coinsRange: [2700, 6000],
        skillRange: [0.38, 0.63],
        activityMinutesRange: [18, 75],
    },
];

const getPersonaBotId = (persona: KyrgyzBotPersona): string =>
    `bot_${persona.firstName.toLowerCase()}_${persona.lastName.toLowerCase().replace(/[^a-z]/g, '')}`;

const KYRGYZ_PERSONA_LOOKUP = new Map<string, KyrgyzBotPersona>(
    KYRGYZ_BOT_PERSONAS.map(persona => [getPersonaBotId(persona), persona])
);

const KYRGYZ_BOT_USERNAMES = new Set<string>(
    KYRGYZ_BOT_PERSONAS.map(persona => `${persona.firstName} ${persona.lastName}`.toLowerCase())
);

const isKyrgyzBotId = (value?: string | null): boolean => {
    if (!value) return false;
    return value.startsWith('bot_') && KYRGYZ_PERSONA_LOOKUP.has(value);
};

const isKyrgyzBotUsername = (value?: string | null): boolean => {
    if (!value) return false;
    return KYRGYZ_BOT_USERNAMES.has(value.trim().toLowerCase());
};

const isBotActivityEvent = (activity: any): boolean => {
    const data = activity?.data || {};

    return (
        activity?.actor_role === 'bot' ||
        data?.is_bot === true ||
        data?.bot === true ||
        isKyrgyzBotId(activity?.actor_id || activity?.actorId) ||
        isKyrgyzBotId(activity?.target_id || activity?.targetId) ||
        isKyrgyzBotUsername(activity?.actor_username || activity?.actor) ||
        isKyrgyzBotUsername(activity?.target_username || activity?.target || data?.target_username || data?.defender_username)
    );
};

type KyrgyzBotState = {
    id: string;
    personaId: string;
    username: string;
    level: number;
    xp: number;
    coins: number;
    pvp_wins: number;
    last_seen: string;
    lastRaidAt: string | null;
};

type TimedNewsEvent = NewsEvent & { timestamp: number };

const KYRGYZ_BOT_STATE_KEY = STORAGE_KEYS.KYRGYZ_BOTS;
const BOT_REACTION_EMOJIS = ['🔥', '😮', '😂', '❤️'] as const;

const randomIntInRange = ([min, max]: [number, number]): number => {
    const floorMin = Math.ceil(min);
    const floorMax = Math.floor(max);
    return Math.floor(Math.random() * (floorMax - floorMin + 1)) + floorMin;
};

const randomFloatInRange = ([min, max]: [number, number]): number => {
    return Math.random() * (max - min) + min;
};

const clampNumber = (value: number, [min, max]: [number, number]): number => {
    return Math.min(Math.max(value, min), max);
};

const approximateXpForLevel = (level: number): number => {
    if (level <= 1) {
        return 0;
    }

    const normalizedLevel = Math.max(1, level);
    // Quadratic growth that keeps numbers within the same order of magnitude as real profiles.
    return Math.round(((normalizedLevel - 1) * normalizedLevel * 45) + (normalizedLevel - 1) * 120);
};

const buildBotAvatarUrl = (seed: string): string => {
    const encoded = encodeURIComponent(seed);
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encoded}&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50`;
};

const createKyrgyzBotTarget = (persona: KyrgyzBotPersona): RaidTarget => {
    const username = `${persona.firstName} ${persona.lastName}`;
    const userId = getPersonaBotId(persona);
    const level = randomIntInRange(persona.levelRange);
    const coins = randomIntInRange(persona.coinsRange);
    const hasShieldBase = persona.style === 'defensive' ? 0.55 : persona.style === 'balanced' ? 0.35 : 0.25;
    const has_shield = Math.random() < hasShieldBase;
    const est_win_rate = Number(randomFloatInRange(persona.skillRange).toFixed(2));
    const minutesAgo = randomIntInRange(persona.activityMinutesRange);
    const last_seen = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

    return {
        user_id: userId,
        username,
        level,
        coins,
        batch: persona.batch,
        has_shield,
        est_win_rate,
        avatar_url: buildBotAvatarUrl(username),
        last_seen,
        clan_name: persona.clan,
    };
};

const generateKyrgyzBots = (count: number, existingIds: Set<string>): RaidTarget[] => {
    if (count <= 0) {
        return [];
    }

    const personas = KYRGYZ_BOT_PERSONAS.slice().sort(() => Math.random() - 0.5);
    const bots: RaidTarget[] = [];

    for (const persona of personas) {
        if (bots.length >= count) {
            break;
        }

        const bot = createKyrgyzBotTarget(persona);

        if (existingIds.has(bot.user_id)) {
            continue;
        }

        existingIds.add(bot.user_id);
        bots.push(bot);
    }

    return bots;
};

const loadKyrgyzBotStates = (): KyrgyzBotState[] => {
    const stored = loadFromStorage<KyrgyzBotState[]>(KYRGYZ_BOT_STATE_KEY);
    return stored ? stored.map(bot => ({ ...bot })) : [];
};

const createInitialBotState = (persona: KyrgyzBotPersona): KyrgyzBotState => {
    const level = randomIntInRange(persona.levelRange);
    const coins = randomIntInRange(persona.coinsRange);
    const xpFloor = approximateXpForLevel(level);

    return {
        id: getPersonaBotId(persona),
        personaId: getPersonaBotId(persona),
        username: `${persona.firstName} ${persona.lastName}`,
        level,
        xp: xpFloor + randomIntInRange([0, 120]),
        coins,
        pvp_wins: randomIntInRange([6, 28]),
        last_seen: nowIso(),
        lastRaidAt: null,
    };
};

const clampBotStateToPersona = (bot: KyrgyzBotState): KyrgyzBotState => {
    const persona = KYRGYZ_PERSONA_LOOKUP.get(bot.personaId);
    if (!persona) {
        return bot;
    }

    const level = clampNumber(Math.round(bot.level), persona.levelRange);
    const coins = clampNumber(Math.round(bot.coins), persona.coinsRange);
    const xpFloor = approximateXpForLevel(level);

    return {
        ...bot,
        level,
        coins,
        xp: Math.max(bot.xp, xpFloor),
        username: `${persona.firstName} ${persona.lastName}`,
    };
};

const saveKyrgyzBotStates = (bots: KyrgyzBotState[]): void => {
    saveToStorage(KYRGYZ_BOT_STATE_KEY, bots);
};

const refreshKyrgyzBotStates = (): KyrgyzBotState[] => {
    const stored = loadKyrgyzBotStates();
    const byId = new Map(stored.map(bot => [bot.personaId, bot]));
    const refreshed: KyrgyzBotState[] = KYRGYZ_BOT_PERSONAS.map(persona => {
        const personaId = getPersonaBotId(persona);
        const existing = byId.get(personaId);
        const hydrated = existing ? { ...existing, id: personaId, personaId } : createInitialBotState(persona);
        return clampBotStateToPersona(hydrated);
    });

    saveKyrgyzBotStates(refreshed);
    return refreshed;
};

const getBotWinChance = (bot: KyrgyzBotState): number => {
    const persona = KYRGYZ_PERSONA_LOOKUP.get(bot.personaId);
    if (!persona) {
        return 0.5;
    }

    const styleBase = persona.style === 'aggressive' ? 0.65 : persona.style === 'defensive' ? 0.45 : 0.55;
    const levelProgress = (bot.level - persona.levelRange[0]) / Math.max(1, persona.levelRange[1] - persona.levelRange[0]);
    const normalizedProgress = clampNumber(levelProgress, [0, 1]);
    const bonus = normalizedProgress * 0.15;

    return clampNumber(styleBase + bonus, [0.25, 0.9]);
};

const applyKyrgyzBotReactions = (events: TimedNewsEvent[]): TimedNewsEvent[] => {
    const bots = loadKyrgyzBotStates();
    if (!bots.length || !events.length) {
        return events;
    }

    return events.map(event => {
        const reactions = { ...event.reactions };
        const reactionRoll = Math.random();
        const maxChance = Math.min(0.35, bots.length * 0.05);

        if (reactionRoll < maxChance) {
            const emoji = BOT_REACTION_EMOJIS[Math.floor(Math.random() * BOT_REACTION_EMOJIS.length)];
            reactions[emoji] = (reactions[emoji] || 0) + 1;
        }

        return { ...event, reactions };
    });
};

const simulateKyrgyzBotBackgroundActivity = (): void => {
    const bots = refreshKyrgyzBotStates();
    let changed = false;

    bots.forEach(bot => {
        const persona = KYRGYZ_PERSONA_LOOKUP.get(bot.personaId);
        if (!persona) {
            return;
        }

        const lastSeen = bot.last_seen ? new Date(bot.last_seen).getTime() : 0;
        const minutesSinceSeen = lastSeen ? (Date.now() - lastSeen) / 60000 : Number.POSITIVE_INFINITY;

        if (minutesSinceSeen > 5) {
            bot.xp += randomIntInRange([15, 45]);
            bot.coins = clampNumber(bot.coins + randomIntInRange([-120, 180]), persona.coinsRange);
            bot.last_seen = nowIso();
            changed = true;
        }

        const lastRaidAt = bot.lastRaidAt ? new Date(bot.lastRaidAt).getTime() : 0;
        const minutesSinceRaid = lastRaidAt ? (Date.now() - lastRaidAt) / 60000 : Number.POSITIVE_INFINITY;

        if (minutesSinceRaid > 30 && Math.random() < 0.15) {
            const eventKind: NewsEvent['kind'] = Math.random() < 0.6 ? 'pvp_win' : 'quest_cleared';
            addActivityEvent({
                kind: eventKind,
                actor: bot.username,
                target: undefined,
                data: {
                    details:
                        eventKind === 'pvp_win'
                            ? 'Crushed a simulated rival in training.'
                            : 'Completed an elite training quest.',
                },
                created_at: nowIso(),
            });
            bot.lastRaidAt = nowIso();
            changed = true;
        }
    });

    if (changed) {
        saveKyrgyzBotStates(bots.map(clampBotStateToPersona));
    }
};

type KyrgyzBotLeaderboardBaseProfile = {
    id: string;
    username: string;
    avatar_url: string;
    batch: KyrgyzBotPersona['batch'];
    last_seen: string;
    role: 'bot';
};

type KyrgyzBotXpLeaderboardEntry = KyrgyzBotLeaderboardBaseProfile & { value: number };
type KyrgyzBotPvpLeaderboardEntry = KyrgyzBotLeaderboardBaseProfile & { wins: number };

type KyrgyzBotClanLeaderboardEntry = {
    id: string;
    name: string;
    member_count: number;
    total_xp: number;
};

type KyrgyzBotLeaderboardSnapshot = {
    xp: KyrgyzBotXpLeaderboardEntry[];
    pvp: KyrgyzBotPvpLeaderboardEntry[];
    clans: KyrgyzBotClanLeaderboardEntry[];
};

const seededRandomFromString = (seed: string): number => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = Math.imul(31, hash) + seed.charCodeAt(i);
        hash |= 0;
    }

    const result = Math.sin(hash) * 10000;
    return result - Math.floor(result);
};

const seededIntInRange = (seed: string, [min, max]: [number, number]): number => {
    if (max <= min) {
        return Math.round(min);
    }

    const random = seededRandomFromString(seed);
    return Math.floor(min + random * (max - min + 1));
};

const createBotLeaderboardProfile = (persona: KyrgyzBotPersona): KyrgyzBotLeaderboardBaseProfile => {
    const username = `${persona.firstName} ${persona.lastName}`;
    const id = `bot_${persona.firstName.toLowerCase()}_${persona.lastName.toLowerCase().replace(/[^a-z]/g, '')}`;
    const minutesAgo = seededIntInRange(`${id}_seen`, persona.activityMinutesRange);
    const lastSeen = new Date(Date.now() - minutesAgo * 60000).toISOString();

    return {
        id,
        username,
        avatar_url: buildBotAvatarUrl(username),
        batch: persona.batch,
        last_seen: lastSeen,
        role: 'bot',
    };
};

const buildKyrgyzBotLeaderboardSnapshot = (): KyrgyzBotLeaderboardSnapshot => {
    const personaProfiles = KYRGYZ_BOT_PERSONAS.map(persona => ({
        persona,
        profile: createBotLeaderboardProfile(persona),
    }));

    const xpEntries = personaProfiles
        .map(({ persona, profile }) => {
            const xpRange: [number, number] = [
                persona.levelRange[0] * 115,
                persona.levelRange[1] * 165,
            ];

            return {
                ...profile,
                value: Math.max(persona.levelRange[0] * 90, seededIntInRange(`${profile.id}_xp`, xpRange)),
            };
        })
        .sort((a, b) => b.value - a.value);

    const pvpEntries = personaProfiles
        .map(({ persona, profile }) => {
            const winsRange: [number, number] = persona.style === 'aggressive'
                ? [24, 60]
                : persona.style === 'balanced'
                ? [18, 45]
                : [12, 35];

            return {
                ...profile,
                wins: Math.max(5, seededIntInRange(`${profile.id}_wins`, winsRange)),
            };
        })
        .sort((a, b) => b.wins - a.wins);

    const clanNames = Array.from(
        new Set(
            KYRGYZ_BOT_PERSONAS
                .map(persona => persona.clan)
                .filter((clanName): clanName is string => Boolean(clanName))
        )
    );

    const clanEntries = clanNames
        .map((name, index) => {
            const memberCount = Math.max(10, seededIntInRange(`${name}_members`, [14, 28]));
            const xpPerMember = Math.max(320, seededIntInRange(`${name}_xp_per_member`, [480, 920]));

            return {
                id: `bot_clan_${index + 1}`,
                name,
                member_count: memberCount,
                total_xp: memberCount * xpPerMember,
            };
        })
        .sort((a, b) => b.total_xp - a.total_xp);

    return {
        xp: xpEntries,
        pvp: pvpEntries,
        clans: clanEntries,
    };
};

// Helper to get current authenticated user with retry and session caching
const getCurrentUser = async (maxRetries = 3) => {
  // First try to get session from cache (no network request)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return session.user;
  }

  // Fall back to getUser with retry logic
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('Not authenticated');
      return user;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
        console.warn(`getCurrentUser attempt ${attempt} failed, retrying...`, err);
      }
    }
  }
  throw lastError || new Error('Not authenticated');
};

const getCurrentUserRole = async () => {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    console.warn('[getCurrentUserRole] Failed to fetch role, defaulting to student:', error);
  }

  return data?.role ?? 'student';
};

const applyRewardDelta = async ({
  xpDelta = 0,
  coinsDelta = 0,
  gemstonesDelta = 0,
  applyLevelMilestone = false,
}: {
  xpDelta?: number;
  coinsDelta?: number;
  gemstonesDelta?: number;
  applyLevelMilestone?: boolean;
}): Promise<{
  profile: Pick<Profile, 'xp' | 'coins' | 'level' | 'gemstones'>;
  xpStatus: XpStatus | undefined;
  previousLevel: number | null;
}> => {
  void xpDelta;
  void coinsDelta;
  void gemstonesDelta;
  void applyLevelMilestone;
  throw new Error('Reward minting RPC is disabled for clients pending server-verified reward events');
};

// Helper to update profile fields with retry logic and verification
const updateProfile = async (userId: string, updates: Partial<Profile>, maxRetries = 3) => {
  let lastError: Error | null = null;
  
  console.log(`[updateProfile] Starting update for user ${userId}:`, updates);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use .select() to return updated rows - if RLS blocks, this will return empty
      const { xp, level, ...safeUpdates } = updates;

      if (xp !== undefined || level !== undefined) {
        console.warn('[updateProfile] xp/level updates are blocked; stripping from payload');
      }

      const { data, error } = await supabase
        .from('users')
        .update(safeUpdates)
        .eq('id', userId)
        .select('id, xp, coins, level, gemstones')
        .single();
      
      if (error) {
        console.error(`[updateProfile] Attempt ${attempt} error:`, error.message, error.code, error.details);
        throw error;
      }
      
      // Verify the update actually affected a row
      if (!data) {
        console.error(`[updateProfile] Attempt ${attempt}: No row returned - RLS may be blocking the update`);
        throw new Error('Update returned no rows - possible RLS restriction');
      }
      
      // CRITICAL: Verify the returned data matches what we tried to set
      const mismatches: string[] = [];
      if (safeUpdates.coins !== undefined && data.coins !== safeUpdates.coins) {
        mismatches.push(`coins: expected ${safeUpdates.coins}, got ${data.coins}`);
      }
      
      if (mismatches.length > 0) {
        console.error(`[updateProfile] CRITICAL: Data mismatch after update!`, mismatches);
        throw new Error(`Update succeeded but data mismatch: ${mismatches.join(', ')}`);
      }
      
      console.log(`[updateProfile] SUCCESS for user ${userId}. Verified values: xp=${data.xp}, coins=${data.coins}`);
      
      // EXTRA VERIFICATION: Do a separate read to ensure persistence
      // This catches any edge cases where update returns stale data
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      const { data: verifyData, error: verifyError } = await supabase
        .from('users')
        .select('xp, coins, level')
        .eq('id', userId)
        .single();
      
      if (verifyError) {
        console.warn(`[updateProfile] Post-update verification read failed:`, verifyError);
        // Don't throw - the update might have succeeded
      } else if (verifyData) {
        const verifyMismatches: string[] = [];
        if (safeUpdates.coins !== undefined && verifyData.coins !== safeUpdates.coins) {
          verifyMismatches.push(`coins: wrote ${safeUpdates.coins}, read back ${verifyData.coins}`);
        }
        
        if (verifyMismatches.length > 0) {
          console.error(`[updateProfile] CRITICAL: Verification read shows data NOT persisted!`, verifyMismatches);
          throw new Error(`Data not persisted: ${verifyMismatches.join(', ')}`);
        }
        console.log(`[updateProfile] Verification read confirmed: xp=${verifyData.xp}, coins=${verifyData.coins}`);
      }
      
      return; // Success
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
        console.warn(`[updateProfile] Attempt ${attempt} failed, retrying...`, err);
      }
    }
  }
  
  console.error('[updateProfile] CRITICAL: All attempts failed for user', userId, updates, lastError);
  throw lastError || new Error('Failed to update profile after multiple attempts');
};

// Helper to simulate API calls (keep for mock data)
const mockApiCall = <T,>(data: T): Promise<T> => {
  return new Promise(resolve => setTimeout(() => resolve(data), MOCK_DELAY));
};

const getRpcSingleRow = <T,>(data: T | T[] | null): T | null => {
        if (!data) {
                return null;
        }
        return Array.isArray(data) ? data[0] ?? null : data;
};

export const getKyrgyzBotLeaderboardProfiles = async (): Promise<KyrgyzBotLeaderboardSnapshot> => {
    const snapshot = buildKyrgyzBotLeaderboardSnapshot();
    return mockApiCall(snapshot);
};

// Initialize default profile data
const DEFAULT_PROFILE: Profile = {
  id: 'usr_1a2b3c',
  username: 'NeonGhost',
  grade: 8,
  batch: '8B',
  avatar_url: 'https://picsum.photos/seed/neonghost/100/100',
    bio: null,
  level: 12,
  xp: 420,
  coins: 8750,
  gemstones: 24,
  streak: 7,
  last_seen: new Date().toISOString(),
  ap_now: 18,
  ap_max: 20,
  attack_power: 10, // Base attack
  defense_power: 10, // Base defense
  pvp_score: 0, // PvP score for clan competition
    total_score: 420,
    attack_power_effective: 10,
    defense_power_effective: 10,
    clan_id: null,
    clan_name: null,
    clan_role: undefined,
    clan_custom_title: null,
    clan_total_score: null,
    active_clan_buffs: [],
};

// Load from storage or use defaults
let MOCK_PROFILE: Profile = loadFromStorage<Profile>(STORAGE_KEYS.PROFILE) || { ...DEFAULT_PROFILE };

let MOCK_CLAN: Clan | null = loadFromStorage<Clan>(STORAGE_KEYS.CLAN) || null;

let MOCK_CHAT: ClanChatMessage[] = loadFromStorage<ClanChatMessage[]>(STORAGE_KEYS.CHAT) || [
    { id: `msg_${Date.now() - 300000}`, user: 'CypherPunk', message: 'Anyone up for a raid later?', created_at: '5m ago', is_self: false },
    { id: `msg_${Date.now() - 180000}`, user: 'NeonGhost', message: 'Yeah, I have enough AP. Let\'s do it.', created_at: '3m ago', is_self: true },
    { id: `msg_${Date.now() - 60000}`, user: 'ZeroCool', message: 'I am in! Let\'s attack some noobs.', created_at: '1m ago', is_self: false },
];

const MOCK_AVAILABLE_BUFFS: ClanBuffTemplate[] = [
    { id: 'buff_xp_1', code: 'xp_surge', name: 'XP Surge', description: '+10% XP for all members for 24h.', cost: 5000, duration_minutes: 1440, effect: { xp_multiplier: 1.1 } },
    { id: 'buff_shield_1', code: 'shield_wall', name: 'Reinforced Shields', description: 'Clan member shields are 20% stronger for 24h.', cost: 7500, duration_minutes: 1440, effect: { defense_multiplier: 1.1, shield_bonus_percent: 20 } },
    { id: 'buff_attack_1', code: 'attack_protocol', name: 'Attack Protocol', description: '+5% Attack Power for all members for 24h.', cost: 10000, duration_minutes: 1440, effect: { attack_multiplier: 1.05 } },
];

const DEFAULT_INVENTORY: InventoryItem[] = [
    {
        inv_id: 'inv_2',
        item_id: 'item_shield',
        name: 'Shield',
        kind: 'shield',
        state: 'active',
        activated_at: new Date().toISOString(),
        description: 'Blocks one incoming attack attempt before shattering.',
        effect_summary: 'Blocks 1 attack',
        defense_bonus: 20,
    },
];

let MOCK_INVENTORY: InventoryItem[] = loadFromStorage<InventoryItem[]>(STORAGE_KEYS.INVENTORY) || [...DEFAULT_INVENTORY];

// Quest tracking state

// Helper functions to save state
const saveProfile = () => saveToStorage(STORAGE_KEYS.PROFILE, MOCK_PROFILE);
const saveInventory = () => saveToStorage(STORAGE_KEYS.INVENTORY, MOCK_INVENTORY);
const saveClan = () => saveToStorage(STORAGE_KEYS.CLAN, MOCK_CLAN);
const saveChat = () => saveToStorage(STORAGE_KEYS.CHAT, MOCK_CHAT);

const calculateTotalScore = (xp: number = 0, pvpScore: number = 0): number => xp + pvpScore * 10;
let hasClanContributionTable: boolean | null = null;

const mapBuffTemplateRow = (row: any): ClanBuffTemplate => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    cost: row.cost,
    duration_minutes: row.duration_minutes,
    effect: row.effect ?? {},
});

const mapActiveBuffRow = (row: any): ActiveClanBuff => ({
    id: row.id,
    clan_id: row.clan_id,
    template_code: row.code || row.template_code,
    name: row.name,
    description: row.description,
    effect: row.effect ?? {},
    activated_by: row.activated_by,
    activated_by_name: row.activated_by_name,
    activated_at: row.purchased_at,
    expires_at: row.expires_at,
});

const combineClanBuffEffects = (buffs: ActiveClanBuff[]): ClanBuffEffect => {
    return buffs.reduce<ClanBuffEffect>((acc, buff) => {
        const effect = buff.effect || {};
        if (effect.xp_multiplier) {
            acc.xp_multiplier = (acc.xp_multiplier ?? 1) * effect.xp_multiplier;
        }
        if (effect.attack_multiplier) {
            acc.attack_multiplier = (acc.attack_multiplier ?? 1) * effect.attack_multiplier;
        }
        if (effect.defense_multiplier) {
            acc.defense_multiplier = (acc.defense_multiplier ?? 1) * effect.defense_multiplier;
        }
        if (effect.shield_bonus_percent) {
            acc.shield_bonus_percent = (acc.shield_bonus_percent ?? 0) + effect.shield_bonus_percent;
        }
        if (effect.ap_bonus) {
            acc.ap_bonus = (acc.ap_bonus ?? 0) + effect.ap_bonus;
        }
        return acc;
    }, {});
};

const applyClanBuffsToProfile = (profile: Profile, buffs: ActiveClanBuff[]) => {
    profile.active_clan_buffs = buffs;
    if (!buffs.length) {
        profile.clan_buff_effects = undefined;
        profile.attack_power_effective = profile.attack_power;
        profile.defense_power_effective = profile.defense_power;
        return;
    }

    const combined = combineClanBuffEffects(buffs);
    profile.clan_buff_effects = combined;
    profile.attack_power_effective = Math.round(profile.attack_power * (combined.attack_multiplier ?? 1));
    profile.defense_power_effective = Math.round(profile.defense_power * (combined.defense_multiplier ?? 1));
};

const fetchClanDepositTotals = async (clanId: string, userIds: string[]): Promise<Map<string, number>> => {
    if (!userIds.length) return new Map();
    if (hasClanContributionTable === false) {
        return fetchClanDepositTotalsFromActivities(clanId, userIds);
    }

    const { data, error } = await supabase
        .from('clan_member_coin_contributions')
        .select('user_id, total_deposited')
        .eq('clan_id', clanId)
        .in('user_id', userIds);

    if (error || !data) {
        if (error?.code === 'PGRST205' || error?.message?.includes('Could not find the table')) {
            hasClanContributionTable = false;
            return fetchClanDepositTotalsFromActivities(clanId, userIds);
        }

        if (error) {
            console.warn('Failed to load clan deposit totals:', error.message);
        }
        return new Map();
    }

    hasClanContributionTable = true;

    return new Map<string, number>(
        data.map((row: any) => [row.user_id, Number(row.total_deposited ?? 0)])
    );
};

const fetchClanDepositTotalsFromActivities = async (clanId: string, userIds: string[]): Promise<Map<string, number>> => {
    const { data, error } = await supabase
        .from('activities')
        .select('actor_id, data')
        .eq('kind', 'clan_deposit')
        .eq('data->>clan_id', clanId)
        .in('actor_id', userIds);

    if (error || !data) {
        if (error) {
            console.warn('Failed to load fallback clan deposit totals:', error.message);
        }
        return new Map();
    }

    const totals = new Map<string, number>();
    for (const row of data as Array<{ actor_id?: string; data?: any }>) {
        const actorId = row.actor_id;
        if (!actorId) continue;
        const amount = Number(row?.data?.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        totals.set(actorId, (totals.get(actorId) ?? 0) + amount);
    }

    return totals;
};

const fetchClanActiveBuffs = async (clanId: string): Promise<ActiveClanBuff[]> => {
    const { data, error } = await supabase
        .from('clan_active_buffs')
        .select('id, clan_id, code, name, description, effect, activated_by, activated_by_name, purchased_at, expires_at')
        .eq('clan_id', clanId)
        .order('expires_at', { ascending: true });

    if (error) {
        console.warn('Failed to load active clan buffs:', error.message);
        return [];
    }

    return (data || []).map(mapActiveBuffRow);
};

const fetchClanScoreValue = async (clanId: string): Promise<number | null> => {
    const { data, error } = await supabase
        .from('clan_scores')
        .select('clan_total_score')
        .eq('id', clanId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.warn('Failed to fetch clan score:', error.message);
    }

    return data?.clan_total_score ?? null;
};

// Helper functions to calculate total combat stats
const getTotalAttackPower = (profile: Profile, inventory: InventoryItem[]): number => {
  let total = profile.attack_power;
  const now = Date.now();
  
  inventory.forEach(item => {
    if (item.state === 'active' && item.attack_bonus) {
      // Check if item is expired
      if (item.expires_at) {
        const expiryTime = new Date(item.expires_at).getTime();
        if (now < expiryTime) {
          total += item.attack_bonus;
        }
      } else {
        // Permanent item
        total += item.attack_bonus;
      }
    }
  });
  
  return total;
};

const getTotalDefensePower = (profile: Profile, inventory: InventoryItem[]): number => {
  let total = profile.defense_power;
  const now = Date.now();
  
  inventory.forEach(item => {
    if (item.state === 'active' && item.defense_bonus) {
      // Check if item is expired
      if (item.expires_at) {
        const expiryTime = new Date(item.expires_at).getTime();
        if (now < expiryTime) {
          total += item.defense_bonus;
        }
      } else {
        // Permanent item
        total += item.defense_bonus;
      }
    }
  });
  
  return total;
};

const getActiveCosmeticFrame = async (userId: string): Promise<'neon' | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('item_id, kind, state')
    .eq('user_id', userId)
    .eq('state', 'active');

  if (error) {
    console.warn('Failed to load active cosmetics:', error.message);
    return null;
  }

  const activeCosmetics = (data || []).filter(item => item.kind === 'cosmetic');
  const hasNeonFrame = activeCosmetics.some(item => item.item_id === 'item_cosmetic_frame');
  
  const frameValue = hasNeonFrame ? 'neon' : null;

  // Sync to users table for better visibility across queries
  try {
    await supabase
      .from('users')
      .update({ active_cosmetic_frame: frameValue })
      .eq('id', userId);
  } catch (syncError) {
    console.warn('Failed to sync cosmetic frame to users table:', syncError);
  }

  return frameValue;
};

const getActiveCosmeticTheme = async (userId: string): Promise<'flicker' | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('item_id, kind, state')
    .eq('user_id', userId)
    .eq('state', 'active');

  if (error) {
    console.warn('Failed to load active cosmetics:', error.message);
    return null;
  }

  const activeCosmetics = (data || []).filter(item => item.kind === 'cosmetic');
  const hasFlickerTheme = activeCosmetics.some(item => item.item_id === 'item_cosmetic_theme');
  
  const themeValue = hasFlickerTheme ? 'flicker' : null;

  // Sync to users table for better visibility across queries
  try {
    await supabase
      .from('users')
      .update({ active_cosmetic_theme: themeValue })
      .eq('id', userId);
  } catch (syncError) {
    console.warn('Failed to sync cosmetic theme to users table:', syncError);
  }

  return themeValue;
};

const getActiveCosmeticEffect = async (userId: string): Promise<'glitch' | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('item_id, kind, state')
    .eq('user_id', userId)
    .eq('state', 'active');

  if (error) {
    console.warn('Failed to load active cosmetics:', error.message);
    return null;
  }

  const activeCosmetics = (data || []).filter(item => item.kind === 'cosmetic');
  const hasGlitchEffect = activeCosmetics.some(item => item.item_id === 'item_cosmetic_glitch');
  
  const effectValue = hasGlitchEffect ? 'glitch' : null;

  // Sync to users table for better visibility across queries
  try {
    await supabase
      .from('users')
      .update({ active_cosmetic_effect: effectValue })
      .eq('id', userId);
  } catch (syncError) {
    console.warn('Failed to sync cosmetic effect to users table:', syncError);
  }

  return effectValue;
};

// Clean up expired items from inventory
const cleanupExpiredItems = () => {
  const now = Date.now();
  const originalLength = MOCK_INVENTORY.length;
  
  MOCK_INVENTORY = MOCK_INVENTORY.filter(item => {
    if (item.expires_at) {
      const expiryTime = new Date(item.expires_at).getTime();
      return now < expiryTime;
    }
    return true;
  });
  
  if (MOCK_INVENTORY.length !== originalLength) {
    saveInventory();
  }
};

// Reset function for students to start fresh
export const resetGameData = (): void => {
  MOCK_PROFILE = { ...DEFAULT_PROFILE };
  MOCK_INVENTORY = [...DEFAULT_INVENTORY];
  MOCK_CLAN = null;
  MOCK_CHAT = [
    { id: `msg_${Date.now() - 300000}`, user: 'CypherPunk', message: 'Anyone up for a raid later?', created_at: '5m ago', is_self: false },
    { id: `msg_${Date.now() - 180000}`, user: 'NeonGhost', message: 'Yeah, I have enough AP. Let\'s do it.', created_at: '3m ago', is_self: true },
    { id: `msg_${Date.now() - 60000}`, user: 'ZeroCool', message: 'I am in! Let\'s attack some noobs.', created_at: '1m ago', is_self: false },
  ];
  saveProfile();
  saveInventory();
  saveClan();
  saveChat();
};

let whoamiInFlight: Promise<Profile> | null = null;

/**
 * Lightweight whoami for teachers — only fetches profile + school info.
 * Skips: AP regen, streak, inventory, clan, cosmetics, XP status, shared player list.
 * Cuts boot from ~9s to <2s.
 */
export const whoamiTeacher = async (): Promise<Profile> => {
  const user = await getCurrentUser();
  console.log(`[whoami-teacher] Fetching profile for user ${user.id}`);

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(`Failed to load teacher profile: ${profileError?.message || 'null'}`);
  }

  console.log(`[whoami-teacher] Got teacher profile: ${profile.username}`);

  // Minimal fixes
  if (typeof profile.gemstones !== 'number') profile.gemstones = 0;
  profile.is_admin = typeof profile.is_admin === 'boolean' ? profile.is_admin : profile.role === 'admin';
  profile.is_banned = isBannedFlag(profile.is_banned);
  if (profile.is_banned) {
    storeBanMessage(BAN_MESSAGE);
    await supabase.auth.signOut();
    throw new Error(BAN_MESSAGE);
  }

  profile.ap_now = profile.ap_max || 100;
  profile.last_ap_update = new Date().toISOString();
  profile.total_score = 0;

  // School info (needed for display)
  if (profile.school_id) {
    try {
      const { data: schoolData } = await supabase
        .from('schools')
        .select('name, logo_url')
        .eq('id', profile.school_id)
        .single();
      if (schoolData) {
        profile.school_name = schoolData.name;
        profile.school_logo_url = schoolData.logo_url;
      }
    } catch { /* non-critical */ }
  }

  // Update last_seen
  supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', user.id).then(() => {});

  return profile;
};

/**
 * Minimal dashboard bootstrap for existing accounts.
 * Returns only the persisted profile and school display fields; all game
 * hydration (AP regeneration, clan, inventory, cosmetics and XP status)
 * happens after the first interactive render.
 */
export const whoamiFast = async (): Promise<Profile> => {
  const user = await getCurrentUser();
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw profileError || new Error('Profile not found');
  }

  profile.gemstones = typeof profile.gemstones === 'number' ? profile.gemstones : 0;
  profile.is_admin = typeof profile.is_admin === 'boolean' ? profile.is_admin : profile.role === 'admin';
  profile.is_banned = isBannedFlag(profile.is_banned);
  if (profile.is_banned) {
    storeBanMessage(BAN_MESSAGE);
    await supabase.auth.signOut();
    throw new Error(BAN_MESSAGE);
  }

  const streakRewardPromise = recordDailyStreakForProfile(profile as Profile);

  if (profile.school_id) {
    const { data: schoolData } = await supabase
      .from('schools')
      .select('name, logo_url')
      .eq('id', profile.school_id)
      .maybeSingle();
    if (schoolData) {
      profile.school_name = schoolData.name;
      profile.school_logo_url = schoolData.logo_url;
    }
  }

  await streakRewardPromise;

  // Presence must never delay the dashboard.
  void supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
  return profile as Profile;
};

export const whoami = async (): Promise<Profile> => {
  if (whoamiInFlight) {
    return whoamiInFlight;
  }

  whoamiInFlight = (async () => {
      // Get current authenticated user with retry logic
      const user = await getCurrentUser();
  
    console.log(`[whoami] Fetching profile for user ${user.id}`);
  
    // Fetch profile from database with retry logic - use fresh read
    let profile: any = null;
    let profileError: any = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Add timestamp to query to ensure fresh data (bypass any caching)
        const result = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        profile = result.data;
        profileError = result.error;
        
        if (!profileError && profile) {
          console.log(`[whoami] Got profile: xp=${profile.xp}, coins=${profile.coins}, level=${profile.level}`);
          break; // Success
        }
        if (profileError?.code === 'PGRST116') break; // Not found - don't retry
        
        throw profileError || new Error('Profile data is null');
      } catch (err) {
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
          console.warn(`[whoami] Attempt ${attempt} failed, retrying...`, err);
        } else {
          profileError = err;
        }
      }
    }
  
    // If profile doesn't exist (OAuth user), create it
    if (profileError && profileError.code === 'PGRST116') {
      console.log('Profile not found for OAuth user, creating new profile...');
      
      // Extract username from email or use name from OAuth provider
      const emailUsername = user.email?.split('@')[0] || 'user';
      const displayName = user.user_metadata?.['full_name'] || user.user_metadata?.['name'];
      const username = displayName || emailUsername;
  
      // Create user profile with default student role
      const profileData = {
          id: user.id,
          email: user.email,
          username: username,
          role: 'student', // Default to student for OAuth users
          grade: null,
          batch: 'N/A' as Batch,
          needs_setup: true,
          avatar_url: user.user_metadata?.['avatar_url'] || `https://picsum.photos/seed/${username}/100/100`,
      };
  
      const { data: newProfile, error: createError } = await supabase
          .from('users')
          .insert(profileData)
          .select()
          .single();
  
      if (createError) {
          console.error('Failed to create OAuth profile:', createError);
          throw new Error(`Failed to create user profile: ${createError.message}`);
      }
  
      profile = newProfile;
      console.log('OAuth profile created successfully for:', user.email);
    } else if (profileError) {
      console.error('Profile fetch error:', profileError);
      throw new Error(`Failed to load profile: ${profileError.message} (Code: ${profileError.code})`);
    } else if (!profile) {
      console.error('Profile is null despite no error');
      throw new Error('Profile not found');
      }
  
      const banned = isBannedFlag(profile.is_banned);
      if (banned) {
          storeBanMessage(BAN_MESSAGE);
          await supabase.auth.signOut();
          throw new Error(BAN_MESSAGE);
      }
  
    if (typeof profile.gemstones !== 'number') {
      profile.gemstones = 0;
    }
  
    if (profile.grade !== null) {
      const parsedGrade = typeof profile.grade === 'string'
        ? parseInt(profile.grade as unknown as string, 10)
        : profile.grade;
  
      // Accept all valid grade levels (6-12). Older logic incorrectly nulled anything
      // outside grades 8-9, which hid valid grades after OAuth signups.
      profile.grade = (parsedGrade >= 6 && parsedGrade <= 12)
        ? (parsedGrade as Grade)
        : null;
    }
  
      profile.is_admin = typeof profile.is_admin === 'boolean'
          ? profile.is_admin
          : profile.role === 'admin';
  
      profile.is_banned = banned;
      profile.total_score = calculateTotalScore(profile.xp ?? 0, profile.pvp_score ?? 0);
  
    // ====== AP REGENERATION LOGIC ======
    // Only regenerate AP for students (teachers and admins don't use game mechanics)
    if (profile.role === 'student') {
      try {
        const { data: regenData, error: regenError } = await regenerateUserAp(user.id);
    
        if (regenError) {
          console.warn('Database AP regeneration function not available, using fallback:', regenError.message);
          throw regenError; // Trigger fallback
        }
    
        if (regenData && regenData.length > 0) {
          const { new_ap, ap_regenerated, minutes_elapsed } = regenData[0];
          console.log(`AP Regeneration: ${profile.ap_now} → ${new_ap} (+${ap_regenerated} AP, ${minutes_elapsed} min elapsed)`);
          
          profile.ap_now = new_ap;
          profile.last_ap_update = new Date().toISOString();
    
          // ====== NOTIFICATION: AP FULL ======
          // Only send AP notifications to students
          if (ap_regenerated > 0 && new_ap === profile.ap_max) {
            try {
              await notifyApFull(user.id);
            } catch (notifError) {
              console.error('Failed to send AP full notification:', notifError);
            }
          }
        }
      } catch (apError) {
        console.warn('AP regeneration function failed, using client-side fallback:', apError);
        // Fallback to client-side calculation
        const now = new Date();
        const lastApUpdate = profile.last_ap_update ? new Date(profile.last_ap_update) : now;
        const msElapsed = now.getTime() - lastApUpdate.getTime();
        const minutesElapsed = Math.floor(msElapsed / (1000 * 60));
        const apToRegen = Math.floor(minutesElapsed / 10);
        
        console.log(`Fallback AP Regen: Last update: ${lastApUpdate.toISOString()}, Minutes elapsed: ${minutesElapsed}, AP to regen: ${apToRegen}`);
        
        if (apToRegen > 0 && profile.ap_now < profile.ap_max) {
          const newAP = Math.min(profile.ap_now + apToRegen, profile.ap_max);
          
          // Calculate exact timestamp: set timer to when the LAST AP was earned (not now)
          // Example: 35 minutes elapsed = 3 AP earned. Last AP was earned 5 minutes ago.
          const remainderMinutes = minutesElapsed % 10;
          const newLastUpdate = new Date(now.getTime() - (remainderMinutes * 60000));
          
          const updateData: any = { 
            ap_now: newAP,
            last_ap_update: newLastUpdate.toISOString()
          };
          
          console.log(`Updating AP in DB: ${profile.ap_now} → ${newAP}, Timer: ${newLastUpdate.toISOString()}`);
          
          const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id);
            
          if (updateError) {
            console.error('Failed to update AP in database:', updateError);
          } else {
            console.log('✅ AP regenerated successfully');
            profile.ap_now = newAP;
            profile.last_ap_update = newLastUpdate.toISOString();
          }
        } else {
          console.log(`No AP regeneration needed: current=${profile.ap_now}, max=${profile.ap_max}, toRegen=${apToRegen}`);
        }
      }
    } else {
      // Teachers and admins don't need AP regeneration - set to max
      console.log(`[whoami] Skipping AP regeneration for ${profile.role}`);
      profile.ap_now = profile.ap_max || 100;
      profile.last_ap_update = new Date().toISOString();
    }
    
    // The database awards at most once per Bishkek calendar day. The one-time
    // receipt is attached to the hydrated profile for the celebration modal.
    await recordDailyStreakForProfile(profile as Profile);
  
    // Show the same temporary shield defense that combat actually uses. Firewall
    // bonuses are already permanent base-defense updates and must not be doubled.
    const now = new Date();
    const { data: activeShields } = await supabase
      .from('inventory')
      .select('id, defense_bonus')
      .eq('user_id', user.id)
      .eq('kind', 'shi…28773 tokens truncated…s = pvpScore;
                    break;
                case 'pvp_battles':
                case 'pvp_matches':
                case 'pvp_attacks':
                    progress = pvpBattleCount;
                    break;
                // Level
                case 'level':
                    progress = profile?.level || 1;
                    break;
                // Streak
                case 'streak':
                    progress = profile?.streak || 0;
                    break;
                // Coins (current balance)
                case 'coins_balance':
                case 'coins_earned':
                case 'total_coins_earned':
                    progress = coinsEarned;
                    break;
                // XP
                case 'total_xp':
                    progress = profile?.xp || 0;
                    break;
                // Shop purchases
                case 'items_purchased':
                    progress = purchaseCount;
                    break;
                // Clan
                case 'clan_member':
                case 'clan_joined':
                    progress = hasClanMembership ? 1 : 0;
                    break;
                // Assignments
                case 'assignments_completed':
                    progress = assignmentsCompleted;
                    break;
                // Perfect scores
                case 'perfect_scores':
                    progress = perfectScores;
                    break;
                // Correct answers
                case 'correct_answers':
                    progress = Math.max(profile?.correct_answers || 0, correctAnswersCount);
                    break;
                // Login
                case 'login_count':
                    progress = 1;
                    break;
                default:
                    progress = 0;
            }
        }

        const target = ach.condition_value || 0;
        const normalizedProgress = target > 0 ? Math.min(progress, target) : progress;
        const is_earned = hasEarnedTimestamp;

        return {
            ...ach,
            category: ach.category || 'general',
            rarity: ach.rarity || 'common',
            is_earned,
            earned_at: earnedData?.earned_at || null,
            progress: normalizedProgress,
        };
    });
};

export const achievements_reference = async (): Promise<AchievementReference> => {
    const achievements = await achievements_list();
    const earned = achievements.filter((a) => a.is_earned);

    const totals = earned.reduce(
        (acc, ach) => {
            const rarityKey = ach.rarity || 'common';
            const categoryKey = ach.category || 'general';
            acc.xpFromAchievements += ach.reward_xp || 0;
            acc.coinsFromAchievements += ach.reward_coins || 0;
            acc.byRarity[rarityKey] = (acc.byRarity[rarityKey] || 0) + 1;
            acc.byCategory[categoryKey] = (acc.byCategory[categoryKey] || 0) + 1;
            return acc;
        },
        {
            totalDefined: achievements.length,
            totalEarned: earned.length,
            xpFromAchievements: 0,
            coinsFromAchievements: 0,
            byRarity: {} as Record<string, number>,
            byCategory: {} as Record<string, number>,
        }
    );

    const latestEarnedAt = earned
        .map((a) => a.earned_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

    const nextUnlocks = achievements
        .filter((a) => !a.is_earned)
        .map((a) => ({
            ...a,
            _remaining: Math.max((a.condition_value || 0) - (a.progress || 0), 0),
        }))
        .sort((a, b) => a._remaining - b._remaining)
        .slice(0, 3)
        .map(({ _remaining, ...achievement }) => achievement as Achievement);

    return {
        achievements,
        totals,
        latestEarnedAt,
        nextUnlocks,
    };
};

export const check_achievements = async (): Promise<Achievement[]> => {
    const user = await getCurrentUser();

    const { data, error } = await rpcCheckAchievements(user.id);

    if (error) throw error;

    // Return newly earned achievements
    const achievementRows = data as Array<{ newly_earned: Achievement[] }>;
    const newlyEarned = achievementRows[0]?.newly_earned || [];

    // ====== PLAY ACHIEVEMENT SOUND & ADD TO ACTIVITY FEED ======
    if (newlyEarned.length > 0) {
        // Import and play achievement sound
        try {
            audioService.play('achievement');
        } catch (audioErr) {
            console.warn('Failed to play achievement sound:', audioErr);
        }

        // Add to local activity feed for each achievement
        for (const achievement of newlyEarned) {
            addActivityEvent({
                kind: 'achievement_earned',
                actor: user.user_metadata?.['username'] || user.email || 'Player',
                data: {
                    achievement_id: achievement.id,
                    achievement_name: achievement.name,
                    achievement_icon: achievement.icon,
                    reward_xp: achievement.reward_xp,
                    reward_coins: achievement.reward_coins,
                },
                created_at: new Date().toISOString(),
            });
        }

        // Send notifications for each new achievement
        try {
            for (const achievement of newlyEarned) {
                await notificationService.createNotification(
                    user.id,
                    'achievement_earned',
                    '🏆 Achievement Unlocked!',
                    `You earned "${achievement.name}"! ${achievement.description}`,
                    'high',
                    { achievement_id: achievement.id, achievement_name: achievement.name }
                );
            }
        } catch (notifError) {
            console.error('Failed to send achievement notifications:', notifError);
        }
    }

    return newlyEarned;
};

// ============================================================
// Teacher Question System Functions
// ============================================================

/**
 * Create a teacher profile for the current user
 */
export const create_teacher_profile = async (
    schoolName?: string,
    subjectSpecializations?: string[],
    bio?: string
): Promise<Teacher> => {
    const user = await getCurrentUser();

    const { data, error } = await rpcCreateTeacherProfile({
        p_school_name: schoolName,
        p_subject_specializations: subjectSpecializations,
        p_bio: bio
    });

    if (error) throw new Error(error.message);

    // Fetch and return the created teacher profile
    const { data: teacher, error: fetchError } = await supabase
        .from('teachers')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (fetchError) throw fetchError;

    return teacher;
};

/**
 * Get teacher profile for current user
 */
export const get_teacher_profile = async (): Promise<Teacher | null> => {
    const user = await getCurrentUser();

    const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }

    return data;
};

/**
 * Create a new question
 */
export const create_question = async (questionData: CreateQuestionRequest): Promise<TeacherQuestion> => {
    const user = await getCurrentUser();

    // Get teacher ID
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const subjectId = resolveSubjectIdentifier(questionData.subject, questionData.subject_id);
    const topicName = normalizeTopicName(questionData.topic, questionData.topic_name);

    // Calculate default points based on difficulty if not provided
    const getDefaultPoints = (difficulty: string | undefined): number => {
        switch (difficulty) {
            case 'easy': return 10;
            case 'medium': return 15;
            case 'hard': return 20;
            default: return 10;
        }
    };

    // Max XP limit for teacher questions
    const MAX_XP = 30;
    const defaultPoints = getDefaultPoints(questionData.difficulty);
    const finalPoints = Math.min(Math.max(questionData.points || defaultPoints, 1), MAX_XP);

    const { data, error } = await supabase
        .from('questions')
        .insert({
            teacher_id: teacher.id,
            subject: questionData.subject,
            subject_id: subjectId,
            topic: topicName,
            topic_name: topicName,
            difficulty: questionData.difficulty,
            question_text: questionData.question_text,
            image_url: questionData.image_url,
            question_type: questionData.question_type,
            options: questionData.options,
            correct_answer: questionData.correct_answer,
            explanation: questionData.explanation,
            hints: questionData.hints,
            time_limit: questionData.time_limit || 30,
            points: finalPoints,
            tags: questionData.tags,
            grade_level: questionData.grade_level,
            eligible_grade_levels: questionData.eligible_grade_levels || [],
            curriculum_review_status: 'draft',
            content_origin: 'teacher',
            verification_status: 'unverified',
            analytics_eligible: false,
            is_public: false
        })
        .select()
        .single();

    if (error) throw error;

    return data as TeacherQuestion;
};

/**
 * Get all questions created by the current teacher
 */
export const get_my_questions = async (): Promise<TeacherQuestion[]> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('teacher_id', teacher.id)
        .eq('content_origin', 'teacher')
        .order('created_at', { ascending: false });

    if (error) throw error;
    const questions = (data || []) as (TeacherQuestion & { creator_name?: string; creator_school_id?: string; is_mine?: boolean })[];
    if (!questions.length) return questions;
    const { data: metadata, error: metadataError } = await supabase.rpc('rpc_question_curriculum_metadata', {
        p_question_ids: questions.map((question) => question.id),
    });
    if (metadataError) {
        console.warn('Question curriculum metadata could not be loaded:', metadataError);
        return questions;
    }
    const byQuestion = new Map((metadata || []).map((item: any) => [item.questionId, item]));
    return questions.map((question) => {
        const item: any = byQuestion.get(question.id);
        if (!item) return question;
        return {
            ...question,
            curriculum_strand: item.strand,
            curriculum_skill: item.skill,
            curriculum_subskill: item.subskill,
            curriculum_objective: item.objective,
            eligible_grade_levels: item.eligibleGradeLevels || [],
            curriculum_review_status: item.reviewStatus,
        };
    });
};

/**
 * Get ALL active questions from the global question bank
 * Teachers can see questions created by any teacher across all schools.
 * This is the global question bank - Content = shared.
 */
export const get_all_questions = async (filters?: {
    subject?: string;
    difficulty?: string;
    teacherId?: string;
    limit?: number;
    offset?: number;
}): Promise<(TeacherQuestion & { creator_name?: string; creator_school_id?: string; is_mine?: boolean })[]> => {
    const { data, error } = await supabase.rpc('get_all_active_questions', {
        p_subject: filters?.subject || null,
        p_difficulty: filters?.difficulty || null,
        p_teacher_id: filters?.teacherId || null,
        p_limit: filters?.limit || 500,
        p_offset: filters?.offset || 0
    });

    if (error) throw error;
    const questions = (data || []) as (TeacherQuestion & { creator_name?: string; creator_school_id?: string; is_mine?: boolean })[];
    if (!questions.length) return questions;
    const { data: metadata, error: metadataError } = await supabase.rpc('rpc_question_curriculum_metadata', {
        p_question_ids: questions.map((question) => question.id),
    });
    if (metadataError) {
        console.warn('Question curriculum metadata could not be loaded:', metadataError);
        return questions;
    }
    const byQuestion = new Map((metadata || []).map((item: any) => [item.questionId, item]));
    return questions.map((question) => {
        const item: any = byQuestion.get(question.id);
        return item ? {
            ...question,
            curriculum_strand: item.strand,
            curriculum_skill: item.skill,
            curriculum_subskill: item.subskill,
            curriculum_objective: item.objective,
            eligible_grade_levels: item.eligibleGradeLevels || [],
            curriculum_review_status: item.reviewStatus,
        } : question;
    });
};

/**
 * Get a single question by ID
 */
export const get_question = async (questionId: string): Promise<TeacherQuestion> => {
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .single();

    if (error) throw error;

    return data as TeacherQuestion;
};

/**
 * Update a question
 */
export const update_question = async (
    questionId: string,
    updates: Partial<CreateQuestionRequest>
): Promise<TeacherQuestion> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');
    const resolvedSubjectId = updates.subject ? resolveSubjectIdentifier(updates.subject, updates.subject_id) : updates.subject_id;
    const shouldNormalizeTopic =
        Object.prototype.hasOwnProperty.call(updates, 'topic') || Object.prototype.hasOwnProperty.call(updates, 'topic_name');
    const normalizedTopic = shouldNormalizeTopic ? normalizeTopicName(updates.topic, updates.topic_name) : undefined;

    // Max XP limit for teacher questions
    const MAX_XP = 30;

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const editableFields: Array<keyof CreateQuestionRequest> = [
        'subject', 'topic', 'topic_name', 'difficulty', 'question_text', 'image_url',
        'question_type', 'options', 'correct_answer', 'explanation', 'hints',
        'time_limit', 'tags', 'grade_level', 'eligible_grade_levels',
    ];
    editableFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(updates, field)) payload[field] = updates[field];
    });

    // Enforce max XP limit if points is being updated
    if (updates.points !== undefined) {
        payload['points'] = Math.min(Math.max(updates.points, 1), MAX_XP);
    }

    if (resolvedSubjectId !== undefined) {
        payload['subject_id'] = resolvedSubjectId;
    }

    if (shouldNormalizeTopic) {
        payload['topic'] = normalizedTopic;
        payload['topic_name'] = normalizedTopic;
    }
    const { data, error } = await supabase
        .from('questions')
        .update(payload)
        .eq('id', questionId)
        .eq('teacher_id', teacher.id)
        .eq('content_origin', 'teacher')
        .select()
        .single();

    if (error) throw error;

    return data as TeacherQuestion;
};

export interface TeacherQuestionBulkCreateResult {
    submitted: number;
    created: number;
    duplicatesSkipped: number;
}

/**
 * Atomically imports teacher-authored classroom questions into the caller's
 * private pool. Verification and Academic Profile authority are assigned only
 * by the database and cannot be supplied by the client payload.
 */
export const bulk_create_teacher_questions = async (
    questions: CreateQuestionRequest[]
): Promise<TeacherQuestionBulkCreateResult> => {
    const payload = questions.map((question) => ({
        subject: question.subject,
        subject_id: resolveSubjectIdentifier(question.subject, question.subject_id),
        topic: normalizeTopicName(question.topic, question.topic_name),
        difficulty: question.difficulty,
        question_text: question.question_text,
        question_type: question.question_type,
        options: question.options || [],
        correct_answer: question.correct_answer,
        explanation: question.explanation || '',
        hints: question.hints || [],
        time_limit: question.time_limit || 30,
        points: Math.min(Math.max(question.points || 10, 1), 30),
        tags: question.tags || [],
        grade_level: question.grade_level || '',
        eligible_grade_levels: question.eligible_grade_levels || [],
    }));
    const { data, error } = await supabase.rpc('rpc_teacher_bulk_create_questions', {
        p_questions: payload,
    });
    if (error) throw error;
    const result = (data || {}) as Record<string, unknown>;
    return {
        submitted: Number(result['submitted'] || 0),
        created: Number(result['created'] || 0),
        duplicatesSkipped: Number(result['duplicatesSkipped'] || 0),
    };
};

/**
 * Delete a question
 */
export const delete_question = async (questionId: string): Promise<void> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');
    const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', questionId)
        .eq('teacher_id', teacher.id)
        .eq('content_origin', 'teacher');

    if (error) throw error;
};

/**
 * Get public questions (for students to browse)
 */
export const get_public_questions = async (subject?: string, difficulty?: string): Promise<TeacherQuestion[]> => {
    const subjectCatalog = await fetchStudentAcademicSubjectCatalog();
    const requestedSubjects = subject
        ? subjectCatalog.subjects.filter((item) => academicCodeForSubject(item.name) === academicCodeForSubject(subject))
        : subjectCatalog.subjects;
    const catalogs = await Promise.all(
        requestedSubjects.map((item) => fetchStudentLearningCatalog(item.code, 500)),
    );
    return catalogs.flatMap((catalog) => catalog.questions)
        .filter((question) => !difficulty || question.difficulty === difficulty);
};

/**
 * Get student's progress on public questions for a specific subject
 * Returns count of unique questions answered out of total available
 */
export const get_subject_question_progress = async (subject: string): Promise<{ answeredCount: number; totalCount: number }> => {
    try {
        const user = await getCurrentUser();
        const questions = await get_public_questions(subject);
        const questionIds = questions.map(q => q.id);
        const totalCount = questionIds.length;
        
        if (totalCount === 0) {
            return { answeredCount: 0, totalCount: 0 };
        }
        
        // Get student's attempts for these questions
        const { data: attempts, error: attemptsError } = await supabase
            .from('question_attempts')
            .select('question_id')
            .eq('student_id', user.id)
            .in('question_id', questionIds);
        
        if (attemptsError) {
            console.error('Error fetching attempts for progress:', attemptsError);
            return { answeredCount: 0, totalCount };
        }
        
        // Count unique question_ids answered
        const uniqueAnswered = new Set((attempts || []).map(a => a.question_id));
        
        return { 
            answeredCount: uniqueAnswered.size, 
            totalCount 
        };
    } catch (error) {
        console.error('get_subject_question_progress failed:', error);
        return { answeredCount: 0, totalCount: 0 };
    }
};

/**
 * Submit an answer to a teacher question
 */
export const submit_question_answer = async (
    questionId: string,
    answer: string,
    timeTaken?: number,
    questSessionId?: string
): Promise<QuestionAttemptResult> => {
    const user = await getCurrentUser();

    const { data, error } = await recordQuestionAttempt({
        p_question_id: questionId,
        p_answer_given: answer,
        p_time_taken: timeTaken,
        p_quest_session_id: questSessionId
    });

    if (error) {
        // Handle duplicate correct-answer constraint gracefully
        if (error.message?.includes('unique') || ('code' in error && (error as any).code === '23505')) {
            return {
                is_correct: true,
                points_earned: 0,
                correct_answer: answer,
                explanation: 'Already answered correctly!',
            } as QuestionAttemptResult;
        }
        throw error;
    }

    // Rewards are applied server-side by recordQuestionAttempt; do not apply client-side deltas.
    return data as QuestionAttemptResult;
};

/**
 * Create a quest template
 */
export const create_quest_template = async (
    title: string,
    description: string,
    subject: string,
    questionIds: string[],
    difficulty?: string,
    xpReward?: number,
    coinsReward?: number
): Promise<QuestTemplate> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const { data, error } = await supabase
        .from('quest_templates')
        .insert({
            teacher_id: teacher.id,
            title,
            description,
            subject,
            difficulty,
            question_ids: questionIds,
            xp_reward: xpReward || 0,
            coins_reward: coinsReward || 0
        })
        .select()
        .single();

    if (error) throw error;

    return data;
};

/**
 * Get quest templates (public or created by teacher)
 */
export const get_quest_templates = async (subject?: string): Promise<QuestTemplate[]> => {
    const teacher = await get_teacher_profile();

    let query = supabase
        .from('quest_templates')
        .select('*')
        .eq('is_active', true);

    if (subject) query = query.eq('subject', subject);

    // Get public templates or teacher's own templates
    if (teacher) {
        query = query.or(`is_public.eq.true,teacher_id.eq.${teacher.id}`);
    } else {
        query = query.eq('is_public', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
};

export const create_assignment = async (
    payload: Omit<CreateAssignmentRequest, 'teacher_id'>
): Promise<TeacherAssignmentSummary> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');
    if (!payload.question_ids?.length) {
        throw new Error('Select at least one question for the assignment');
    }
    if (!payload.title?.trim()) {
        throw new Error('Assignment title is required');
    }

    // Validate mode-specific requirements
    const mode = payload.assignment_mode || 'batch';
    if (mode === 'batch' && !payload.batch) {
        throw new Error('Batch is required for batch mode assignments');
    }
    if (mode === 'custom' && (!payload.student_ids || payload.student_ids.length === 0)) {
        throw new Error('At least one student is required for custom assignments');
    }

    const { data, error } = await rpcCreateAssignment({
        p_teacher_id: teacher.id,
        p_subject_id: payload.subject_id ?? resolveSubjectIdentifier(payload.subject),
        p_subject_name: payload.subject,
        p_topic_name: normalizeTopicName(payload.topic_name),
        p_batch: payload.batch ?? null,
        p_question_ids: payload.question_ids,
        p_assigned_at: payload.assigned_at ?? nowIso(),
        p_due_at: payload.due_at ?? null,
        p_title: payload.title.trim(),
        p_description: payload.description ?? null,
        p_instructions: payload.instructions ?? null,
        p_difficulty: payload.difficulty ?? null,
        p_assignment_mode: mode,
        p_student_ids: payload.student_ids ?? null,
        p_publish_status: payload.publish_status ?? 'published',
        p_close_submissions_after_due: payload.close_submissions_after_due ?? false,
        p_notify_students_by_email: payload.notify_students_by_email ?? false,
    });

    if (error) throw new Error(error.message || 'Failed to create assignment');

    const assignment = (Array.isArray(data) ? data[0] : data) as TeacherAssignmentSummary | undefined;
    if (!assignment) {
        throw new Error('Assignment could not be created');
    }
    return assignment;
};

export const get_teacher_assignments = async (teacherId?: string): Promise<TeacherAssignmentSummary[]> => {
    let resolvedTeacherId = teacherId;
    if (!resolvedTeacherId) {
        const teacher = await get_teacher_profile();
        if (!teacher) throw new Error('User is not a teacher');
        resolvedTeacherId = teacher.id;
    }

    const { data, error } = await rpcGetAssignmentsForTeacher({ p_teacher_id: resolvedTeacherId });
    if (error) throw new Error(error.message || 'Failed to load assignments');

    return (data as TeacherAssignmentSummary[]) || [];
};

export const delete_teacher_assignment = async (assignmentId: string): Promise<void> => {
    if (!assignmentId) throw new Error('Assignment ID is required');

    const { data, error } = await rpcDeleteTeacherAssignment(assignmentId);
    if (error) throw new Error(error.message || 'Failed to delete assignment');
    if (data !== true) throw new Error('Assignment could not be deleted');
};

export const update_teacher_assignment = async (
    assignmentId: string,
    payload: Omit<CreateAssignmentRequest, 'teacher_id'>
): Promise<TeacherAssignmentSummary> => {
    if (!assignmentId) throw new Error('Assignment ID is required');
    if (!payload.question_ids?.length) throw new Error('Select at least one question for the assignment');
    if (!payload.title?.trim()) throw new Error('Assignment title is required');
    const mode = payload.assignment_mode || 'batch';
    if (mode === 'batch' && !payload.batch) throw new Error('Batch is required for batch mode assignments');
    if (mode === 'custom' && (!payload.student_ids || payload.student_ids.length === 0)) throw new Error('At least one student is required for custom assignments');

    const { data, error } = await rpcUpdateTeacherAssignment(assignmentId, {
        p_subject_id: payload.subject_id ?? resolveSubjectIdentifier(payload.subject),
        p_subject_name: payload.subject,
        p_topic_name: normalizeTopicName(payload.topic_name),
        p_batch: payload.batch ?? null,
        p_question_ids: payload.question_ids,
        p_assigned_at: payload.assigned_at ?? nowIso(),
        p_due_at: payload.due_at ?? null,
        p_title: payload.title.trim(),
        p_description: payload.description ?? null,
        p_instructions: payload.instructions ?? null,
        p_difficulty: payload.difficulty ?? null,
        p_assignment_mode: mode,
        p_student_ids: payload.student_ids ?? null,
        p_publish_status: payload.publish_status ?? 'published',
        p_close_submissions_after_due: payload.close_submissions_after_due ?? false,
        p_notify_students_by_email: payload.notify_students_by_email ?? false,
    });
    if (error) throw new Error(error.message || 'Failed to update assignment');
    const assignment = (Array.isArray(data) ? data[0] : data) as TeacherAssignmentSummary | undefined;
    if (!assignment) throw new Error('Assignment could not be updated');
    return assignment;
};

export type TeacherAssignmentSuccessSummary = {
    submission_count: number;
    answered_question_count: number;
    correct_answer_count: number;
    success_rate: number;
};

export const get_teacher_assignment_success_summary = async (): Promise<TeacherAssignmentSuccessSummary> => {
    const { data, error } = await rpcGetTeacherAssignmentSuccessSummary();
    if (error) throw new Error(error.message || 'Failed to load assignment success');

    const row = (Array.isArray(data) ? data[0] : data) as Partial<TeacherAssignmentSuccessSummary> | null;
    return {
        submission_count: Number(row?.submission_count || 0),
        answered_question_count: Number(row?.answered_question_count || 0),
        correct_answer_count: Number(row?.correct_answer_count || 0),
        success_rate: Number(row?.success_rate || 0),
    };
};

export const get_students_for_assignment = async (teacherId?: string): Promise<StudentForAssignment[]> => {
    let resolvedTeacherId = teacherId;
    if (!resolvedTeacherId) {
        const teacher = await get_teacher_profile();
        if (!teacher) throw new Error('User is not a teacher');
        resolvedTeacherId = teacher.id;
    }

    const { data, error } = await rpcGetStudentsForAssignment({ p_teacher_id: resolvedTeacherId });
    
    if (error) {
        console.error('RPC error getting students:', error);
        throw new Error(error.message || 'Failed to load students');
    }

    const result = normalizeTeacherRoster((data as TeacherRosterRow[]) || []);
    console.log('get_students_for_assignment result:', result);
    return result;
};

export const get_student_active_assignment = async (): Promise<StudentAssignmentTask | null> => {
    console.log('[gameService] Calling rpc_get_student_active_assignment...');
    const { data, error } = await rpcGetStudentActiveAssignment();
    
    if (error) {
        console.error('[gameService] Error from rpc_get_student_active_assignment:', error);
        throw new Error(error.message || 'Failed to load assignment');
    }
    
    console.log('[gameService] Raw assignment data:', data);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
        console.log('[gameService] No active assignment found (data is null/empty)');
        return null;
    }

    const parsedRow = row as StudentAssignmentTask;
    console.log('[gameService] Parsed assignment:', { 
        id: parsedRow.assignment_id, 
        title: parsedRow.title,
        questionsCount: parsedRow.questions?.length || 0 
    });
    
    let normalizedQuestions = ((parsedRow.questions ?? []) as TeacherQuestion[]).map(normalizeTeacherQuestionPayload);

    if (!normalizedQuestions.length) {
        const { data: assignmentQuestionRows, error: assignmentQuestionError } = await supabase
            .from('assignment_question_details')
            .select('*')
            .eq('assignment_id', parsedRow.assignment_id)
            .order('order_index');

        if (assignmentQuestionError) {
            console.warn('Failed to hydrate assignment questions, falling back to empty set:', assignmentQuestionError);
        } else {
            console.info('[gameService] Fallback loaded rows:', assignmentQuestionRows?.length, assignmentQuestionRows);
            normalizedQuestions = (assignmentQuestionRows ?? [])
                .map((row: any) => normalizeTeacherQuestionPayload(row as TeacherQuestion))
                .filter((question): question is TeacherQuestion => Boolean(question));
            console.info('[gameService] After normalization:', normalizedQuestions.length, normalizedQuestions);
        }
    }

    return {
        ...parsedRow,
        questions: normalizedQuestions,
    };
};

// ── Brains Master Premium ─────────────────────────────────────────────

export const brains_master_purchase = async (): Promise<BrainsMasterPurchaseResult> => {
    const { data, error } = await supabase.rpc('rpc_purchase_brains_master');
    if (error) {
        return {
            success: false,
            error: error.message || 'Purchase failed',
            gemstones_spent: 0,
            gemstones_granted: 0,
            coins_granted: 0,
            daily_coin_cap_at_purchase: 0,
            was_already_active: false,
            new_expiry: '',
            new_gemstone_balance: 0,
            new_coin_balance: 0,
        };
    }
    return data as BrainsMasterPurchaseResult;
};

export const brains_master_toggle_badge = async (show: boolean): Promise<void> => {
    const user = await getCurrentUser();
    await updateProfile(user.id, { brains_master_show_badge: show });
};

export const get_student_pending_assignments = async (): Promise<StudentAssignmentTask[]> => {
    console.log('[gameService] Calling rpc_get_student_pending_assignments...');
    const { data, error } = await rpcGetStudentPendingAssignments();

    if (error) {
        console.error('[gameService] Error from rpc_get_student_pending_assignments:', error);
        throw new Error(error.message || 'Failed to load assignments');
    }

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (!rows.length) {
        console.log('[gameService] No pending assignments found (data is null/empty)');
        return [];
    }

    return rows.map((row) => {
        const parsedRow = row as StudentAssignmentTask;
        const normalizedQuestions = ((parsedRow.questions ?? []) as TeacherQuestion[]).map(normalizeTeacherQuestionPayload);
        return {
            ...parsedRow,
            questions: normalizedQuestions,
        };
    });
};

export type AssignmentSubmissionResult = {
    status: 'submitted' | 'already_submitted';
};

export const submit_assignment_result = async (payload: AssignmentResultInput): Promise<AssignmentSubmissionResult> => {
    const { error } = await rpcSubmitAssignmentResult({
        p_assignment_id: payload.assignmentId,
        p_correct: payload.correct,
        p_incorrect: payload.incorrect,
        p_accuracy: payload.accuracy,
        p_score: payload.score,
        p_time_taken: payload.timeTakenSeconds,
    });

    if (error) {
        const message = error.message || 'Failed to submit assignment';
        if (message.includes('ASSIGNMENT_ALREADY_SUBMITTED')) {
            return { status: 'already_submitted' };
        }
        if (message.includes('ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED')) {
            throw new Error('Assignment is not available for this student.');
        }
        if (message.includes('ASSIGNMENT_NOT_SUBMITTABLE')) {
            throw new Error('Assignment is no longer in a submittable state.');
        }
        if (message.includes('ASSIGNMENT_CLOSED')) {
            throw new Error('This assignment is closed because its due date has passed.');
        }
        throw new Error(message);
    }

    return { status: 'submitted' };
};

export const get_teacher_assignment_report = async (
    assignmentId: string
): Promise<TeacherAssignmentReportRow[]> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const { data, error } = await rpcTeacherAssignmentReport({
        p_assignment_id: assignmentId,
        p_teacher_id: teacher.id,
    });

    if (error) throw new Error(error.message || 'Failed to load report');

    return (data as TeacherAssignmentReportRow[]) || [];
};

/**
 * Get reports for ALL assignments belonging to the current teacher.
 * Returns a map of assignmentId → report rows, used by the Collective Report view.
 */
export const get_all_assignment_reports = async (
    assignmentIds: string[]
): Promise<Record<string, TeacherAssignmentReportRow[]>> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const results: Record<string, TeacherAssignmentReportRow[]> = {};

    // Fetch reports in parallel batches (max 6 concurrent)
    const BATCH_SIZE = 6;
    for (let i = 0; i < assignmentIds.length; i += BATCH_SIZE) {
        const batch = assignmentIds.slice(i, i + BATCH_SIZE);
        const fetches = batch.map(async (id) => {
            try {
                const { data, error } = await rpcTeacherAssignmentReport({
                    p_assignment_id: id,
                    p_teacher_id: teacher.id,
                });
                if (error) {
                    console.warn(`Report fetch failed for assignment ${id}:`, error.message);
                    return { id, rows: [] as TeacherAssignmentReportRow[] };
                }
                return { id, rows: (data as TeacherAssignmentReportRow[]) || [] };
            } catch {
                return { id, rows: [] as TeacherAssignmentReportRow[] };
            }
        });
        const batchResults = await Promise.all(fetches);
        for (const { id, rows } of batchResults) {
            results[id] = rows;
        }
    }

    return results;
};

// ============================================================================
// ASSIGNMENT ANSWER ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Submit an individual student answer for an assignment question.
 * This enables detailed analysis for teachers.
 */
export const submit_assignment_answer = async (payload: StudentAnswerInput): Promise<void> => {
    const { error } = await rpcSubmitAssignmentAnswer({
        p_assignment_id: payload.assignmentId,
        p_question_id: payload.questionId,
        p_question_text: payload.questionText,
        p_correct_answer: payload.correctAnswer,
        p_student_answer: payload.studentAnswer,
        p_is_correct: payload.isCorrect,
        p_time_taken_ms: payload.timeTakenMs || 0,
    });

    if (error) {
        console.error('Failed to submit assignment answer:', error);
        // Don't throw - this is a non-critical tracking feature
    }
};

/**
 * Get detailed student answers for an assignment (teacher only).
 * Optionally filter by student_id for individual analysis.
 */
export const get_assignment_student_answers = async (
    assignmentId: string,
    studentId?: string
): Promise<StudentAssignmentAnswer[]> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const { data, error } = await rpcGetAssignmentStudentAnswers({
        p_assignment_id: assignmentId,
        p_teacher_id: teacher.id,
        p_student_id: studentId || null,
    });

    if (error) throw new Error(error.message || 'Failed to load student answers');

    return (data as StudentAssignmentAnswer[]) || [];
};

/**
 * Get question-level analysis for an assignment (teacher only).
 * Shows which questions students struggle with most.
 */
export const get_assignment_question_analysis = async (
    assignmentId: string
): Promise<AssignmentQuestionAnalysis[]> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const { data, error } = await rpcGetAssignmentQuestionAnalysis({
        p_assignment_id: assignmentId,
        p_teacher_id: teacher.id,
    });

    if (error) throw new Error(error.message || 'Failed to load question analysis');

    return (data as AssignmentQuestionAnalysis[]) || [];
};

/**
 * Get student's completed assignments for achievement display
 */
export const get_student_completed_assignments = async (): Promise<CompletedAssignment[]> => {
    const { data, error } = await rpcGetStudentCompletedAssignments();

    if (error) {
        console.error('Failed to load completed assignments:', error);
        return [];
    }

    // Map SQL response to include computed fields
    return ((data as any[]) || []).map((a) => ({
        ...a,
        id: a.assignment_id, // Alias for React key
        total_questions: (a.correct || 0) + (a.incorrect || 0)
    })) as CompletedAssignment[];
};

/**
 * Check and award assignment-related achievements after completing an assignment
 */
export const check_assignment_achievements = async (
    userId: string
): Promise<AssignmentAchievementEarned[]> => {
    const { data, error } = await rpcCheckAssignmentAchievements(userId);

    if (error) {
        console.warn('Failed to check assignment achievements:', error);
        return [];
    }

    return (data as AssignmentAchievementEarned[]) || [];
};

/**
 * Get student's own answers for a completed assignment (for review/analysis)
 */
export const get_my_assignment_answers = async (
    assignmentId: string
): Promise<MyAssignmentAnswer[]> => {
    const { data, error } = await rpcGetMyAssignmentAnswers(assignmentId);

    if (error) {
        console.error('Failed to load assignment answers:', error);
        throw new Error(error.message || 'Failed to load assignment answers');
    }

    return (data as MyAssignmentAnswer[]) || [];
};

export const mcq_answer_submit = async (question: Question, choice: string): Promise<AnswerResponse> => {
    if (!question?.id) {
        throw new Error('Question payload missing identifier');
    }

    const correctAnswer = question.correct_answer ?? '';
    const { data, error } = await supabase.rpc('rpc_submit_mcq_answer', {
        p_question_id: question.id,
        p_answer: choice,
    });

    if (error) {
        throw new Error(error.message || 'Failed to submit MCQ answer');
    }

    const payload = data as any;
    const isCorrect = Boolean(payload?.correct);
    const isDuplicate = Boolean(payload?.duplicate_reward);

    console.log(`[mcq_answer_submit] 🎯 Question ${question.id}: isCorrect=${isCorrect}, duplicate=${isDuplicate}`);

    const response: AnswerResponse = {
        correct: isCorrect,
        deltas: {
            xp: payload?.deltas?.xp ?? 0,
            coins: payload?.deltas?.coins ?? 0,
            gemstones: payload?.deltas?.gemstones ?? 0,
        },
        finalProfileValues: payload?.final_profile_values ?? undefined,
        explanation: isCorrect
            ? question.explanation || 'Well done, agent!'
            : `Incorrect. ${question.explanation || 'The correct answer was: ' + correctAnswer}`,
    };

    if (isDuplicate) {
        response.explanation = '✓ Correct! But you already earned rewards for this question. Try new questions to earn more!';
    }

    return response;
};

// ============================================================
// CLAN SYSTEM - Competition Based on Total Score
// ============================================================

export const createClan = async (
    clanName: string,
    description?: string,
    avatarUrl?: string
): Promise<{ clanId: string; success: boolean; error?: string }> => {
    try {
        const { data, error } = await supabase.rpc('rpc_create_clan', {
            p_clan_name: clanName,
            p_description: description || null,
            p_avatar_url: avatarUrl || null,
        });

        if (error || !data || data.length === 0) {
            throw new Error(error?.message || 'Failed to create clan');
        }

        const result = data[0];
        if (!result.success) {
            return { clanId: '', success: false, error: result.error_message };
        }

        return { clanId: result.clan_id, success: true };
    } catch (err) {
        console.error('Create clan error:', err);
        return { clanId: '', success: false, error: (err as Error).message };
    }
};

export const joinClan = async (clanId: string): Promise<{ success: boolean; error?: string; memberCount?: number }> => {
    try {
        const { data, error } = await supabase.rpc('rpc_join_clan', {
            p_clan_id: clanId,
        });

        if (error || !data || data.length === 0) {
            throw new Error(error?.message || 'Failed to join clan');
        }

        const result = data[0];
        return {
            success: result.success,
            error: result.error_message || undefined,
            memberCount: result.member_count,
        };
    } catch (err) {
        console.error('Join clan error:', err);
        return { success: false, error: (err as Error).message };
    }
};

export const leaveClan = async (): Promise<{ success: boolean; error?: string }> => {
    try {
        const { data, error } = await supabase.rpc('rpc_leave_clan');

        if (error || !data || data.length === 0) {
            throw new Error(error?.message || 'Failed to leave clan');
        }

        const result = data[0];
        return {
            success: result.success,
            error: result.error_message || undefined,
        };
    } catch (err) {
        console.error('Leave clan error:', err);
        return { success: false, error: (err as Error).message };
    }
};

export const getClanLeaderboard = async (limit: number = 20): Promise<any[]> => {
    try {
        const { data, error } = await supabase.rpc('rpc_get_clan_leaderboard', {
            p_limit: limit,
        });

        if (error) {
            throw new Error(error.message);
        }

        return data || [];
    } catch (err) {
        console.error('Get clan leaderboard error:', err);
        return [];
    }
};

export const getClanMembers = async (clanId: string): Promise<any[]> => {
    try {
        const { data, error } = await supabase.rpc('rpc_get_clan_members', {
            p_clan_id: clanId,
        });

        if (error) {
            throw new Error(error.message);
        }

        return data || [];
    } catch (err) {
        console.error('Get clan members error:', err);
        return [];
    }
};

export const getUserClan = async (userId: string): Promise<any | null> => {
    try {
        const { data, error } = await supabase
            .from('clan_members')
            .select('clan_id')
            .eq('player_id', userId)
            .single();

        if (error || !data) {
            return null;
        }

        // Get full clan details
        const { data: clanData, error: clanError } = await supabase
            .from('clans')
            .select('*')
            .eq('id', data.clan_id)
            .single();

        if (clanError || !clanData) {
            return null;
        }

        return clanData;
    } catch (err) {
        console.error('Get user clan error:', err);
        return null;
    }
};

export const updatePvPScore = async (
    userId: string,
    isWin: boolean
): Promise<{ newPvpScore: number; newTotalScore: number; success: boolean; error?: string }> => {
    try {
        const { data, error } = await supabase.rpc('rpc_update_pvp_score', {
            p_user_id: userId,
            p_is_win: isWin,
        });

        if (error || !data || data.length === 0) {
            throw new Error(error?.message || 'Failed to update PvP score');
        }

        const result = data[0];
        return {
            newPvpScore: result.new_pvp_score,
            newTotalScore: result.new_total_score,
            success: result.success,
            error: result.error_message || undefined,
        };
    } catch (err) {
        console.error('Update PvP score error:', err);
        return { newPvpScore: 0, newTotalScore: 0, success: false, error: (err as Error).message };
    }
};
// ============================================================================
// ASSIGNMENT AI ANALYSIS
// ============================================================================

/**
 * Generate AI-powered analysis of student assignment performance
 * Uses OpenAI to analyze answers and provide personalized feedback
 */
export const generate_assignment_analysis = async (
    assignmentId: string,
    studentId?: string
): Promise<any> => {
    try {
        const user = await getCurrentUser();
        const targetStudentId = studentId || user.id;

        // Get the session to extract auth token
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
            throw new Error('No authentication token available');
        }

        const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'];
        if (!supabaseUrl) {
            throw new Error('Missing VITE_SUPABASE_URL');
        }

        // Call the edge function
        const response = await fetch(
            `${supabaseUrl}/functions/v1/analyze_assignment_answers`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    assignmentId,
                    studentId: targetStudentId,
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Analysis failed with status ${response.status}`);
        }

        const result = await response.json();
        return result.analysis || result;
    } catch (err) {
        console.error('Failed to generate assignment analysis:', err);
        throw err;
    }
};


// ============================================================
// QUEST MODE 2.0 — Route-Based Missions
// ============================================================

export interface QuestMissionRow {
    id: string;
    subject: string;
    code: string;
    title: string;
    description?: string;
    mission_type: 'standard' | 'risk' | 'daily';
    difficulty: 'easy' | 'medium' | 'hard';
    route_template: any[];
    energy_cost: number;
    sort_order: number;
    is_active?: boolean;
    created_by?: string | null;
    best_run?: { chest_tier: string; perfect_run: boolean; rewards_xp: number; completed_at: string } | null;
    active_run_id?: string | null;
    play_count?: number;
    questions_answered_count?: number;
    route_question_count?: number;
}

export interface QuestRunStateRaw {
    run_id: string;
    mission_id: string;
    mission_title: string;
    mission_type: string;
    status: string;
    current_node: number;
    streak: number;
    rewards_xp: number;
    rewards_coins: number;
    route: any[];
    started_at: string;
}

const normalizeRpcPayload = <T>(payload: unknown): T => {
    if (Array.isArray(payload)) {
        return (payload[0] ?? null) as T;
    }
    return payload as T;
};

const normalizeQuestRunState = (payload: unknown): QuestRunStateRaw => {
    const state = normalizeRpcPayload<QuestRunStateRaw | null>(payload);
    if (!state) {
        throw new Error('Quest run did not return any data');
    }

    const rawRoute = (state as any).route;
    let normalizedRoute: any[] = [];
    if (Array.isArray(rawRoute)) {
        normalizedRoute = rawRoute;
    } else if (typeof rawRoute === 'string') {
        try {
            const parsed = JSON.parse(rawRoute);
            normalizedRoute = Array.isArray(parsed) ? parsed : [];
        } catch {
            normalizedRoute = [];
        }
    }

    return {
        ...state,
        route: normalizedRoute,
    };
};

export interface QuestEventClaimResult {
    event_title: string;
    event_payload: {
        xp?: number;
        coins?: number;
        gemstones?: number;
        effect?: string;
        item_id?: string;
        shop_item_id?: string;
        item_name?: string;
        item_kind?: string;
        quantity?: number;
    };
    items_awarded?: Array<{
        item_id: string;
        name?: string;
        kind?: string;
        quantity?: number;
        attack_bonus?: number;
        defense_bonus?: number;
    }>;
    deltas: { xp: number; coins: number };
    next_node_index: number;
    run_status: string;
    final_profile_values?: { xp: number; coins: number; level: number; gemstones: number };
}

export interface QuestChestOpenResult {
    chest_tier: 'bronze' | 'silver' | 'gold';
    chest_rewards: { xp: number; coins: number };
    total_run_xp: number;
    total_run_coins: number;
    streak_peak: number;
    perfect_run: boolean;
    nodes_cleared: number;
    final_profile_values?: { xp: number; coins: number; level: number; gemstones: number };
}

export interface TeacherQuestBackfillResult {
    actor_id: string;
    actor_role: string;
    teachers_scanned: number;
    groups_scanned: number;
    created_missions: number;
    skipped_missions: number;
    published_missions: number;
}


export interface FtueTrainingRewardResult {
    deltas: { xp: number; coins: number; gemstones: number };
    final_profile_values: { xp: number; coins: number; level: number; gemstones: number; xp_status?: XpStatus };
}

export const claim_ftue_training_reward = async (): Promise<FtueTrainingRewardResult> => {
    const { data, error } = await supabase.rpc('rpc_claim_ftue_training_reward');

    if (error) {
        throw new Error(error.message || 'Failed to claim starter assignment reward');
    }

    const result = data as FtueTrainingRewardResult | null;
    if (!result?.final_profile_values) {
        throw new Error('Starter assignment reward was not confirmed by the server.');
    }

    result.final_profile_values.xp_status = await fetchMyXpStatus(supabase, {
        xp: result.final_profile_values.xp,
        level: result.final_profile_values.level,
    });

    return result;
};

/** Fetch available missions for a subject (or all if null). Includes best run & active run info. */
export const quest_get_missions = async (subject?: string): Promise<QuestMissionRow[]> => {
    const { data, error } = await supabase.rpc('rpc_quest_get_missions', {
        p_subject: subject ?? null,
    });

    if (error) {
        console.error('[quest_get_missions] Error:', error);
        return [];
    }

    return (data as QuestMissionRow[]) || [];
};

/** Start a new quest run. Returns the full run state with hydrated route. */
export const quest_start_run = async (missionId: string): Promise<QuestRunStateRaw> => {
    const { data, error } = await supabase.rpc('rpc_quest_start_run', {
        p_mission_id: missionId,
    });

    if (error) {
        throw new Error(error.message || 'Failed to start quest run');
    }

    return normalizeQuestRunState(data);
};

/** Resume an existing active quest run (for page reload / reconnection). */
export const quest_resume_run = async (runId: string): Promise<QuestRunStateRaw> => {
    const { data, error } = await supabase.rpc('rpc_quest_resume_run', {
        p_run_id: runId,
    });

    if (error) {
        throw new Error(error.message || 'Failed to resume quest run');
    }

    const state = normalizeQuestRunState(data);

    if ((state as any)?.error) {
        throw new Error((state as any).error);
    }

    return state;
};

/** Submit an answer for a question node. */
export const quest_answer_node = async (
    runId: string, nodeIndex: number, answer: string
): Promise<any> => {
    const { data, error } = await supabase.rpc('rpc_quest_answer_node', {
        p_run_id: runId,
        p_node_index: nodeIndex,
        p_answer: answer,
    });

    if (error) {
        throw new Error(error.message || 'Failed to submit answer');
    }

    return data;
};

/** Claim a reward/surprise event node. */
export const quest_claim_event = async (
    runId: string, nodeIndex: number
): Promise<QuestEventClaimResult> => {
    const { data, error } = await supabase.rpc('rpc_quest_claim_event', {
        p_run_id: runId,
        p_node_index: nodeIndex,
    });

    if (error) {
        throw new Error(error.message || 'Failed to claim event');
    }

    return data as QuestEventClaimResult;
};

/** Retreat from an active quest run. Keeps accumulated rewards but no chest. */
export const quest_retreat = async (runId: string): Promise<{ status: string; rewards_xp: number; rewards_coins: number; nodes_cleared: number }> => {
    const { data, error } = await supabase.rpc('rpc_quest_retreat', {
        p_run_id: runId,
    });

    if (error) {
        throw new Error(error.message || 'Failed to retreat');
    }

    return data as { status: string; rewards_xp: number; rewards_coins: number; nodes_cleared: number };
};

/** Open the final chest. Returns tier + rewards. */
export const quest_open_chest = async (runId: string): Promise<QuestChestOpenResult> => {
    const { data, error } = await supabase.rpc('rpc_quest_open_chest', {
        p_run_id: runId,
    });

    if (error) {
        throw new Error(error.message || 'Failed to open chest');
    }

    const result = data as QuestChestOpenResult;
    if (!result?.final_profile_values) {
        throw new Error('Quest rewards were computed but persistence could not be confirmed. Please try again.');
    }

    return result;
};

/** Abandon an active quest run (forfeit all rewards). */
export const quest_abandon = async (runId: string): Promise<void> => {
    const { error } = await supabase.rpc('rpc_quest_abandon', {
        p_run_id: runId,
    });

    if (error) {
        throw new Error(error.message || 'Failed to abandon quest run');
    }
};

// ─── Teacher Quest Creator ────────────────────────────────────────────────

/**
 * Create a new quest mission from a teacher's question bank.
 * Calls rpc_teacher_create_quest_mission which builds the route automatically.
 * Returns the new mission's UUID.
 */
export const teacher_create_quest_mission = async (params: {
    title: string;
    subject: string;
    questionIds: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    description?: string;
}): Promise<string> => {
    const { data, error } = await supabase.rpc('rpc_teacher_create_quest_mission', {
        p_title: params.title,
        p_subject: params.subject,
        p_question_ids: params.questionIds,
        p_difficulty: params.difficulty,
        p_description: params.description ?? null,
    });

    if (error) {
        throw new Error(error.message || 'Failed to create quest mission');
    }

    return data as string;
};

/**
 * One-time/maintenance backfill:
 * generates quest missions from already-existing teacher questions grouped by
 * teacher + subject + topic/topic_name with deterministic mission titles.
 */
export const teacher_backfill_quest_missions_from_questions = async (teacherId?: string | null): Promise<TeacherQuestBackfillResult> => {
    const { data, error } = await supabase.rpc('rpc_teacher_backfill_quest_missions_from_questions', {
        p_teacher_id: teacherId ?? null,
        p_publish: true,
    });

    if (error) {
        throw new Error(error.message || 'Failed to backfill quest missions');
    }

    return (data || {}) as TeacherQuestBackfillResult;
};

/** Fetch all quest missions created by the calling teacher (includes drafts). */
export const teacher_get_my_quests = async (): Promise<QuestMissionRow[]> => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('quest_missions')
        .select('*')
        .eq('created_by', uid)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(error.message || 'Failed to fetch teacher quests');
    }

    return (data || []) as QuestMissionRow[];
};

/** Toggle a teacher-created mission's published state (is_active). */
export const teacher_toggle_quest_active = async (missionId: string, isActive: boolean): Promise<void> => {
    const { error } = await supabase
        .from('quest_missions')
        .update({ is_active: isActive })
        .eq('id', missionId);

    if (error) {
        throw new Error(error.message || 'Failed to update quest mission');
    }
};

/** Delete a teacher-created quest mission. */
export const teacher_delete_quest = async (missionId: string): Promise<void> => {
    const { error } = await supabase
        .from('quest_missions')
        .delete()
        .eq('id', missionId);

    if (error) {
        throw new Error(error.message || 'Failed to delete quest mission');
    }
};
