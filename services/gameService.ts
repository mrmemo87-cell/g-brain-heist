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
} from '../types';
import * as RaidFeatureService from '../src/features/raids/raidService';
import {
    BossUnlockState,
    RaidAnswerPayload,
    RaidFinalizationResult,
    RaidParticipantState,
    RaidQuestion,
    RaidQuestionRequest,
    RaidStatus,
    RaidWaveState,
} from '../src/features/raids/raidTypes';
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addPlayerToSharedList, addActivityEvent, getActivityFeed, getTaskProgress, incrementPvPWin, incrementWeeklyTaskCompleted, getPurchaseCount, incrementPurchaseCount } from './storageService';
import { supabase } from './supabaseClient';
import { fetchNeonFrameOwners, fetchFlickerThemeOwners, fetchGlitchEffectOwners } from './cosmeticService';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './banMessage';
import { notificationService } from './notificationService';
import { fetchMyXpStatus } from './xpStatus';
import { audioService } from './audioService';
import {
    regenerateUserAp,
    notifyApFull,
    performHackAttempt,
    checkAchievements as rpcCheckAchievements,
    createTeacherProfile as rpcCreateTeacherProfile,
    recordQuestionAttempt,
    createAssignment as rpcCreateAssignment,
    getAssignmentsForTeacher as rpcGetAssignmentsForTeacher,
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
} from './rpcGateway';

const MOCK_DELAY = 500;

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
    English: 'english',
    'Russian Language': 'russian_language',
    'Kyrgyz Language': 'kyrgyz_language',
    'German Language': 'german_language',
    Geography: 'geography',
    'Global Perspective': 'global_perspective',
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
}) => {
  const { data, error } = await supabase.rpc('rpc_apply_reward_delta', {
    p_xp_delta: xpDelta,
    p_coins_delta: coinsDelta,
    p_gemstones_delta: gemstonesDelta,
    p_apply_level_milestone: applyLevelMilestone,
  });

  if (error || !data) {
    const message = error?.message || 'Failed to apply rewards';
    throw new Error(message);
  }

  return {
    profile: {
      xp: data.profile?.xp ?? 0,
      coins: data.profile?.coins ?? 0,
      level: data.profile?.level ?? 1,
      gemstones: data.profile?.gemstones ?? 0,
    } as Pick<Profile, 'xp' | 'coins' | 'level' | 'gemstones'>,
    xpStatus: data.xp_status ?? null,
    previousLevel: data.previous_level ?? null,
  };
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
    
    // ====== STREAK TRACKING LOGIC ======
    const now = new Date();
    const lastSeen = profile.last_seen ? new Date(profile.last_seen) : null;
    let newStreak = profile.streak || 0;
    
    if (lastSeen) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastSeenStart = new Date(lastSeen.getFullYear(), lastSeen.getMonth(), lastSeen.getDate());
      const daysDiff = Math.floor((todayStart.getTime() - lastSeenStart.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 1) {
        // User logged in the next day - increment streak
        newStreak = (profile.streak || 0) + 1;
      } else if (daysDiff > 1) {
        // User missed a day - reset streak
        newStreak = 1;
      }
      // If daysDiff === 0, same day login - don't change streak
    } else {
      // First time user
      newStreak = 1;
    }
    
    const updateData: any = { last_seen: now.toISOString() };
    
    if (newStreak !== profile.streak) {
      updateData.streak = newStreak;
      profile.streak = newStreak;
  
      // ====== NOTIFICATION: STREAK DANGER ======
      // If streak was broken (reset to 1 after having a streak)
      if (profile.streak > 1 && newStreak === 1) {
        try {
          await notificationService.createNotification(
            user.id,
            'streak_danger',
            '🔥 Streak Broken!',
            `You lost your ${profile.streak} day streak! Log in daily to rebuild it.`,
            'medium'
          );
        } catch (notifError) {
          console.error('Failed to send streak notification:', notifError);
        }
      }
    }
    
    // Update database with all changes
    await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.id);
  
    // Check inventory for active shields
    const { data: activeShields } = await supabase
      .from('inventory')
      .select('id')
      .eq('user_id', user.id)
      .eq('kind', 'shield')
      .eq('state', 'unused')
      .limit(1);
    const userHasShield = (activeShields?.length ?? 0) > 0;
  
    // Register in shared player list for multiplayer features
    addPlayerToSharedList({
      id: profile.id,
      username: profile.username,
      level: profile.level,
      coins: profile.coins,
      gemstones: profile.gemstones,
      batch: profile.batch,
      avatar_url: profile.avatar_url,
          active_cosmetic_frame: profile.active_cosmetic_frame,
      has_shield: userHasShield,
    });
  
      const existingClanInfo = {
          id: profile.clan_id ?? null,
          role: profile.clan_role,
          customTitle: profile.clan_custom_title ?? null,
          name: profile.clan_name ?? null,
          score: profile.clan_total_score ?? null,
          buffs: profile.active_clan_buffs ?? [],
      };
  
      // Clear transient buff effects before rehydrating clan data
      applyClanBuffsToProfile(profile, []);
  
      let resolvedClanId: string | null = profile.clan_id ?? null;
      let resolvedClanRole: ClanRole | undefined = profile.clan_role;
      let resolvedCustomTitle: string | null = profile.clan_custom_title ?? null;
      let resolvedClanName: string | null = profile.clan_name ?? null;
  
      const { data: membership, error: membershipError } = await supabase
          .from('clan_members')
          .select('clan_id, role, custom_title, clans(name)')
          .eq('user_id', profile.id)
          .maybeSingle();
  
      if (membershipError && membershipError.code !== 'PGRST116') {
          console.warn('Failed to fetch clan membership:', membershipError.message);
      }
  
      let resolvedMembership = membership;
  
      // Fallback: use clan_member_scores view if the direct table query fails (e.g., RLS
      // restrictions or table issues) OR if it returns no rows. This keeps clan info
      // visible on the dashboard even when the primary table query is blocked.
      if (!resolvedMembership || !resolvedMembership.clan_id) {
          const { data: membershipFromScores, error: membershipScoresError } = await supabase
              .from('clan_member_scores')
              .select('clan_id, role, custom_title')
              .eq('user_id', profile.id)
              .maybeSingle();
  
          if (membershipScoresError && membershipScoresError.code !== 'PGRST116') {
              console.warn('Fallback clan membership lookup failed:', membershipScoresError.message);
          }
  
          if (membershipFromScores?.clan_id) {
              resolvedMembership = membershipFromScores as unknown as typeof membership;
          }
      }
  
      if (resolvedMembership && resolvedMembership.clan_id) {
          resolvedClanId = resolvedMembership.clan_id;
          resolvedClanRole = resolvedMembership.role as ClanRole;
          resolvedCustomTitle = resolvedMembership.custom_title;
          const clanRecord = Array.isArray(resolvedMembership.clans) ? resolvedMembership.clans[0] : resolvedMembership.clans;
          resolvedClanName = clanRecord?.name ?? null;
      }
  
      if (resolvedClanId) {
          if (!resolvedClanName) {
              const { data: clanRow, error: clanError } = await supabase
                  .from('clans')
                  .select('name')
                  .eq('id', resolvedClanId)
                  .maybeSingle();
  
              if (clanError && clanError.code !== 'PGRST116') {
                  console.warn('Failed to load clan name from clans table:', clanError.message);
              }
  
              resolvedClanName = clanRow?.name ?? resolvedClanName;
          }
  
          let clanScore: number | null = null;
          let activeBuffs: ActiveClanBuff[] = [];
          
          try {
              const [score, buffs] = await Promise.all([
                  fetchClanScoreValue(resolvedClanId),
                  fetchClanActiveBuffs(resolvedClanId),
              ]);
              clanScore = score;
              activeBuffs = buffs;
          } catch (e) {
              console.warn('Failed to fetch clan score or buffs for dashboard (using defaults):', e);
              clanScore = null;
              activeBuffs = [];
          }
  
          profile.clan_id = resolvedClanId;
          profile.clan_role = resolvedClanRole;
          profile.clan_custom_title = resolvedCustomTitle;
          profile.clan_name = resolvedClanName;
          profile.clan_total_score = clanScore;
          applyClanBuffsToProfile(profile, activeBuffs);
      } else if (existingClanInfo.id || existingClanInfo.name) {
          // Preserve already-known clan metadata when refresh lookups fail
          profile.clan_id = existingClanInfo.id;
          profile.clan_role = existingClanInfo.role;
          profile.clan_custom_title = existingClanInfo.customTitle;
          profile.clan_name = existingClanInfo.name;
          profile.clan_total_score = existingClanInfo.score;
          applyClanBuffsToProfile(profile, existingClanInfo.buffs);
      } else {
          profile.clan_id = null;
          profile.clan_role = undefined;
          profile.clan_custom_title = null;
          profile.clan_name = null;
          profile.clan_total_score = null;
      }
  
    try {
      profile.active_cosmetic_frame = await getActiveCosmeticFrame(profile.id);
    } catch (cosmeticError) {
      console.warn('Failed to attach cosmetic frame to profile:', cosmeticError);
      profile.active_cosmetic_frame = null;
    }
  
    try {
      profile.active_cosmetic_theme = await getActiveCosmeticTheme(profile.id);
    } catch (cosmeticError) {
      console.warn('Failed to attach cosmetic theme to profile:', cosmeticError);
      profile.active_cosmetic_theme = null;
    }
  
    try {
      profile.active_cosmetic_effect = await getActiveCosmeticEffect(profile.id);
    } catch (cosmeticError) {
      console.warn('Failed to attach cosmetic effect to profile:', cosmeticError);
      profile.active_cosmetic_effect = null;
    }
  
    // Fetch school info for display (name and logo)
    if (profile.school_id) {
      try {
        const { data: schoolData, error: schoolError } = await supabase
          .from('schools')
          .select('name, logo_url')
          .eq('id', profile.school_id)
          .single();
        
        if (!schoolError && schoolData) {
          profile.school_name = schoolData.name;
          profile.school_logo_url = schoolData.logo_url;
        }
      } catch (schoolErr) {
        console.warn('Failed to fetch school info:', schoolErr);
      }
    }
  
      profile.total_score = calculateTotalScore(profile.xp ?? 0, profile.pvp_score ?? 0);
  
      try {
          profile.xp_status = await fetchMyXpStatus(supabase, {
              xp: profile.xp,
              level: profile.level,
          });
      } catch (error) {
          console.warn('[whoami] Failed to fetch XP status:', error);
      }
  
    return profile;
  })();

  try {
    return await whoamiInFlight;
  } finally {
    whoamiInFlight = null;
  }
};

export const getCriticalBootData = async ({
  signal,
  timeoutMs = 12000,
  retryOnTimeout = 1,
}: {
  signal?: AbortSignal;
  timeoutMs?: number;
  retryOnTimeout?: number;
} = {}): Promise<CriticalBootResult> => {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return { session: null, profile: null };
  }

  const attemptWhoami = async () => withTimeout(whoami(), timeoutMs, signal, 'whoami');

  try {
    const profile = await attemptWhoami();
    return { session: data.session, profile };
  } catch (error) {
    if (isTimeoutError(error) && retryOnTimeout > 0) {
      const profile = await attemptWhoami();
      return { session: data.session, profile };
    }
    throw error;
  }
};

export const kickOffNonCriticalBootLoads = ({
  signal,
  targets,
  timeoutsMs,
  onTasks,
  onCaps,
  onNews,
  onAssignment,
  onSessionStatus,
  onError,
}: BootNonCriticalHandlers) => {
  const shouldRun = (key: BootNonCriticalKey) => !targets || targets.includes(key);
  const timeouts: Required<BootNonCriticalTimeouts> = {
    tasks: 12000,
    caps: 8000,
    news: 12000,
    assignment: 8000,
    sessionStatus: 6000,
    ...timeoutsMs,
  };

  const promises: Promise<void>[] = [];

  if (shouldRun('tasks')) {
    promises.push(runNonCritical('tasks', () => tasks_list(), timeouts.tasks, signal, onTasks, onError));
  }

  if (shouldRun('caps')) {
    promises.push(runNonCritical('caps', () => caps_status(), timeouts.caps, signal, onCaps, onError));
  }

  if (shouldRun('news')) {
    promises.push(runNonCritical('news', () => news_feed(), timeouts.news, signal, onNews, onError));
  }

  if (shouldRun('assignment')) {
    promises.push(
      runNonCritical(
        'assignment',
        () => get_student_active_assignment(),
        timeouts.assignment,
        signal,
        onAssignment,
        onError
      )
    );
  }

  if (shouldRun('sessionStatus')) {
    promises.push(
      runNonCritical(
        'sessionStatus',
        () => session_status(),
        timeouts.sessionStatus,
        signal,
        onSessionStatus,
        onError
      )
    );
  }

  return {
    allSettled: Promise.allSettled(promises),
  };
};

/**
 * Fetch a public profile for any user by their user ID.
 * This returns a subset of profile data that is safe to show to other players.
 * Uses an RPC function to bypass RLS restrictions.
 */
export const getPublicProfile = async (userId: string): Promise<Profile | null> => {
  // Retry logic for fetching profile
  let profile: any = null;
  let fetchError: any = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Use RPC function to bypass RLS and get public profile
      const { data, error } = await supabase.rpc('get_public_profile', {
        target_user_id: userId
      });
      
      if (error) throw error;
      
      // The RPC returns JSON, so data is the profile object directly
      profile = data;
      fetchError = null;
      
      if (profile) break; // Success
    } catch (err) {
      fetchError = err;
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
        console.warn(`getPublicProfile attempt ${attempt} failed, retrying...`, err);
      }
    }
  }

  if (fetchError || !profile) {
    console.error('Failed to fetch public profile:', fetchError?.message);
    return null;
  }

  // Fetch cosmetics for this user
  let active_cosmetic_frame: 'neon' | null = null;
  let active_cosmetic_theme: 'flicker' | null = null;
  let active_cosmetic_effect: 'glitch' | null = null;

  try {
    const [neonOwners, flickerOwners, glitchOwners] = await Promise.all([
      fetchNeonFrameOwners([userId]),
      fetchFlickerThemeOwners([userId]),
      fetchGlitchEffectOwners([userId]),
    ]);
    if (neonOwners.has(userId)) active_cosmetic_frame = 'neon';
    if (flickerOwners.has(userId)) active_cosmetic_theme = 'flicker';
    if (glitchOwners.has(userId)) active_cosmetic_effect = 'glitch';
  } catch (err) {
    console.warn('Failed to fetch cosmetics for public profile:', err);
  }

  // Fetch clan membership
  let clan_name: string | null = null;
  let clan_role: ClanRole | undefined = undefined;
  let clan_custom_title: string | null = null;

  const { data: membership } = await supabase
    .from('clan_members')
    .select('role, custom_title, clans(name)')
    .eq('user_id', userId)
    .maybeSingle();

  if (membership && (membership as any).clans?.name) {
    clan_name = (membership as any).clans.name;
    clan_role = membership.role as ClanRole;
    clan_custom_title = membership.custom_title ?? null;
  }

  const total_score = calculateTotalScore(profile.xp ?? 0, profile.pvp_score ?? 0);

  return {
    ...profile,
    active_cosmetic_frame,
    active_cosmetic_theme,
    active_cosmetic_effect,
    clan_name,
    clan_role,
    clan_custom_title,
    total_score,
  } as Profile;
};

export const tasks_list = async (): Promise<Task[]> => {
  // Try to get progress from database first (works on mobile)
  // Fall back to localStorage if database query fails
  let dailyQuestsCompleted = 0;
  let dailyPvpWins = 0;
  let weeklyTasksCompleted = 0;
  
  try {
    const user = await getCurrentUser();
    
    // Get today's date range (UTC)
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    // Get start of week (Sunday)
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    
    // Query database for today's quest completions
    const { data: questData } = await supabase
      .from('activities')
      .select('id')
      .eq('actor_id', user.id)
      .eq('kind', 'quest_complete')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());
    
    dailyQuestsCompleted = questData?.length || 0;
    
    // Query database for today's PvP wins
    const { data: pvpData } = await supabase
      .from('activities')
      .select('id')
      .eq('actor_id', user.id)
      .eq('kind', 'pvp_win')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());
    
    dailyPvpWins = pvpData?.length || 0;
    
    // Query database for this week's task claims
    const { data: weeklyData } = await supabase
      .from('activities')
      .select('id')
      .eq('actor_id', user.id)
      .eq('kind', 'task_claimed')
      .gte('created_at', weekStart.toISOString());
    
    weeklyTasksCompleted = weeklyData?.length || 0;
    
  } catch (error) {
    // Fall back to localStorage if database query fails
    console.warn('Failed to fetch task progress from database, using localStorage:', error);
    const progress = getTaskProgress();
    dailyQuestsCompleted = progress.daily_quests_completed;
    dailyPvpWins = progress.daily_pvp_wins;
    weeklyTasksCompleted = progress.weekly_tasks_completed;
  }
  
  // Also sync localStorage for consistency
  const progress = getTaskProgress();
  if (dailyQuestsCompleted > progress.daily_quests_completed) {
    // Update localStorage to match database
    progress.daily_quests_completed = dailyQuestsCompleted;
    progress.daily_pvp_wins = dailyPvpWins;
    progress.weekly_tasks_completed = weeklyTasksCompleted;
  }
  
  // Get claimed tasks for today from localStorage (still needed for claim tracking)
  const today = new Date().toISOString().split('T')[0];
  const claimedKey = `task_claims_${today}`;
  const claimedTasks = JSON.parse(localStorage.getItem(claimedKey) || '[]') as string[];
  
  // Calculate time until midnight for daily reset
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  const hoursUntilMidnight = Math.floor(msUntilMidnight / (1000 * 60 * 60));
  const minutesUntilMidnight = Math.floor((msUntilMidnight % (1000 * 60 * 60)) / (1000 * 60));
  const secondsUntilMidnight = Math.floor((msUntilMidnight % (1000 * 60)) / 1000);
  const dailyExpiry = `${hoursUntilMidnight}h ${minutesUntilMidnight}m ${secondsUntilMidnight}s`;
  
  // Calculate days until next Sunday for weekly reset
  const dayOfWeekNow = now.getDay();
  const daysUntilSunday = dayOfWeekNow === 0 ? 7 : 7 - dayOfWeekNow;
  const weeklyExpiry = daysUntilSunday === 1 ? '1d' : `${daysUntilSunday}d`;
  
  // Also check database for claimed status
  let claimedFromDb: string[] = [];
  try {
    const user = await getCurrentUser();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const { data: claimedData } = await supabase
      .from('activities')
      .select('data')
      .eq('actor_id', user.id)
      .eq('kind', 'task_claimed')
      .gte('created_at', todayStart.toISOString());
    
    claimedFromDb = (claimedData || [])
      .map((d: any) => d.data?.task_id)
      .filter(Boolean);
  } catch {
    // Ignore errors, use localStorage
  }
  
  const allClaimedTasks = [...new Set([...claimedTasks, ...claimedFromDb])];
  
  const tasks: Task[] = [
    {
      id: 'task_d1',
      title: 'Complete 3 Knowledge Quests',
      kind: 'daily',
      progress: dailyQuestsCompleted,
      target: 3,
      reward_preview: '175 XP, 350 Coins, +1 Gemstone',
      expires_at: dailyExpiry,
      claimed: allClaimedTasks.includes('task_d1'),
      reward: { xp: 175, coins: 350, gemstones: 1 },
    },
    {
      id: 'task_d2',
      title: 'Win a PvP Hack',
      kind: 'daily',
      progress: dailyPvpWins,
      target: 1,
      reward_preview: '100 XP, 50 Coins, +1 Gemstone',
      expires_at: dailyExpiry,
      claimed: allClaimedTasks.includes('task_d2'),
      reward: { xp: 100, coins: 50, gemstones: 1 },
    },
    {
      id: 'task_w1',
      title: 'Complete 15 Daily Tasks this week',
      kind: 'weekly',
      progress: weeklyTasksCompleted,
      target: 15,
      reward_preview: '500 XP, 400 Coins, +1 Item Crate, +5 Gemstones',
      expires_at: weeklyExpiry,
      claimed: allClaimedTasks.includes('task_w1'),
      reward: { xp: 500, coins: 400, gemstones: 5, items: ['mystery_crate'] },
    },
  ];
  return tasks;
};

export const task_claim = async (task_id: string): Promise<{ xp: number; coins: number; gemstones?: number; items?: string[] }> => {
  const user = await getCurrentUser();
  
  // Get task details
  const tasks = await tasks_list();
  const task = tasks.find(t => t.id === task_id);
  
  if (!task) {
    throw new Error('Task not found');
  }
  
  if (task.claimed) {
    throw new Error('Task already claimed');
  }
  
  if (task.progress < task.target) {
    throw new Error('Task not completed yet');
  }
  
  if (!task.reward) {
    throw new Error('No reward defined for this task');
  }
  
  const gemstonesEarned = task.reward.gemstones || 0;

  await applyRewardDelta({
    xpDelta: task.reward.xp,
    coinsDelta: task.reward.coins,
    gemstonesDelta: gemstonesEarned,
    applyLevelMilestone: false,
  });
  
  // Mark as claimed in localStorage
  const today = new Date().toISOString().split('T')[0];
  const claimedKey = `task_claims_${today}`;
  const claimedTasks = JSON.parse(localStorage.getItem(claimedKey) || '[]') as string[];
  claimedTasks.push(task_id);
  localStorage.setItem(claimedKey, JSON.stringify(claimedTasks));
  
  // Also record in database for cross-device sync (mobile support)
  try {
    await supabase.from('activities').insert({
      actor_id: user.id,
      actor_username: (await whoami()).username,
      kind: 'task_claimed',
      data: { task_id, reward: task.reward },
    });
  } catch (error) {
    console.warn('Failed to record task claim in database:', error);
    // Continue anyway - localStorage will be used as fallback
  }
  
  // Grant items if any (add to inventory)
  if (task.reward.items && task.reward.items.length > 0) {
    const inventoryItems = task.reward.items.map(itemId => {
      // Map item IDs to inventory entries
      const itemInfo = MOCK_SHOP_ITEMS.find(i => i.id === itemId) || {
        id: itemId,
        name: itemId.replace('item_', '').replace(/_/g, ' '),
        kind: 'mystery' as const,
      };
      return {
        user_id: user.id,
        item_id: itemInfo.id,
        name: itemInfo.name,
        kind: itemInfo.kind,
        state: 'unused' as const,
      };
    });
    
    if (inventoryItems.length > 0) {
      await supabase.from('inventory').insert(inventoryItems);
    }
  }
  
  return mockApiCall(task.reward);
};

export const session_status = (): Promise<SessionStatus> => {
  const status: SessionStatus = {
    active: true,
    remaining_seconds: 1125, // 18m 45s
    current_multiplier: 1.85,
    today_used: false,
  };
  return mockApiCall(status);
};

export const caps_status = (): Promise<Caps> => {
  const caps: Caps = {
    xp_daily_remaining: 650,
    coins_daily_remaining: 1200,
    xp_weekly_remaining: 4800,
    coins_weekly_remaining: 7500,
    daily_xp_cap: 1000,
    daily_coins_cap: 2000,
    weekly_xp_cap: 6500,
    weekly_coins_cap: 10000,
  };
  return mockApiCall(caps);
};

export const news_feed = async (): Promise<NewsEvent[]> => {
    const user = await getCurrentUser();

    // Let bots generate background activity before fetching
    simulateKyrgyzBotBackgroundActivity();

    // Use school-scoped RPC to enforce tenant isolation (only see activities from same school)
    const { data: activities, error } = await supabase.rpc('get_school_activity_feed', { p_limit: 30 });

    if (error) {
        console.error('Error fetching activities:', error);
    }

    // RPC already filters out teacher activities
    const studentActivities = (activities || []).slice(0, 20);
    const missingUserIds = new Set<string>();

    studentActivities.forEach((activity: any) => {
        if (!activity.actor_username && activity.actor_id) {
            missingUserIds.add(activity.actor_id);
        }
        if (!activity.target_username && activity.target_id) {
            missingUserIds.add(activity.target_id);
        }
    });

    let userLookup: Record<string, string> = {};
    if (missingUserIds.size > 0) {
        const { data: userRows, error: userError } = await supabase
            .from('users')
            .select('id, username, email')
            .in('id', Array.from(missingUserIds));

        if (userError) {
            console.warn('Failed to resolve activity usernames:', userError);
        } else {
            userLookup = (userRows || []).reduce<Record<string, string>>((acc, row: any) => {
                acc[row.id] = row.username || row.email || 'Unknown';
                return acc;
            }, {});
        }
    }

    const activityIds = studentActivities.map((a: any) => a.id);

    const { data: reactionsData } = activityIds.length
        ? await supabase
            .from('activity_reactions')
            .select('activity_id, emoji, user_id')
            .in('activity_id', activityIds)
        : { data: [] };

    const reactionsByActivity: Record<string, { reactions: Record<string, number>; myReaction: string | null }> = {};

    studentActivities.forEach((activity: any) => {
        reactionsByActivity[activity.id] = {
            reactions: { '🔥': 0, '😮': 0, '😂': 0, '❤️': 0 },
            myReaction: null,
        };
    });

    (reactionsData || []).forEach(reaction => {
        if (reactionsByActivity[reaction.activity_id]) {
            if (!reactionsByActivity[reaction.activity_id].reactions[reaction.emoji]) {
                reactionsByActivity[reaction.activity_id].reactions[reaction.emoji] = 0;
            }
            reactionsByActivity[reaction.activity_id].reactions[reaction.emoji]++;

            if (reaction.user_id === user.id) {
                reactionsByActivity[reaction.activity_id].myReaction = reaction.emoji;
            }
        }
    });

    const dbEvents: TimedNewsEvent[] = studentActivities.map((activity: any) => {
        const createdAt = new Date(activity.created_at);
        const timeAgo = getTimeAgo(createdAt);
        const activityReactions = reactionsByActivity[activity.id];

        return {
            id: activity.id,
            kind: activity.kind,
            actor: activity.actor_username || userLookup[activity.actor_id] || 'Unknown',
            target: activity.target_username || userLookup[activity.target_id] || undefined,
            data: activity.data || {},
            created_at: timeAgo,
            reactions: activityReactions.reactions,
            my_reaction: activityReactions.myReaction,
            timestamp: createdAt.getTime(),
        };
    });

    const localFeed = getActivityFeed();
    const localEvents: TimedNewsEvent[] = (localFeed || []).map(event => {
        const createdAt = event.created_at ? new Date(event.created_at) : new Date();
        const baseReactions = { '🔥': 0, '😮': 0, '😂': 0, '❤️': 0 };
        const mergedReactions = { ...baseReactions, ...(event.reactions || {}) };

        return {
            id: event.id,
            kind: event.kind,
            actor: event.actor,
            target: event.target,
            data: event.data || {},
            created_at: getTimeAgo(createdAt),
            reactions: mergedReactions,
            my_reaction: event.my_reaction || null,
            timestamp: createdAt.getTime(),
        } as TimedNewsEvent;
    });

    const combined = [...localEvents, ...dbEvents]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);

    const withBotReactions = applyKyrgyzBotReactions(combined);

    return mockApiCall(withBotReactions.map(({ timestamp, ...event }): NewsEvent => event));
};

// Helper function to format time ago
function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

export const activity_reaction_toggle = async (activity_id: string, emoji: string): Promise<{ added: boolean }> => {
  const user = await getCurrentUser();

  if (activity_id.startsWith('evt_')) {
    const events = getActivityFeed();
    const eventIndex = (events || []).findIndex((event: any) => event.id === activity_id);

    if (eventIndex >= 0) {
      const updatedEvents = [...events];
      const event = { ...updatedEvents[eventIndex] };
      const reactions = { '🔥': 0, '😮': 0, '😂': 0, '❤️': 0, ...(event.reactions || {}) };
      const currentReaction: string | null = event.my_reaction || null;
      let added = true;

      if (currentReaction === emoji) {
        reactions[emoji] = Math.max(0, (reactions[emoji] || 0) - 1);
        event.my_reaction = null;
        added = false;
      } else {
        if (currentReaction) {
          reactions[currentReaction] = Math.max(0, (reactions[currentReaction] || 0) - 1);
        }
        reactions[emoji] = (reactions[emoji] || 0) + 1;
        event.my_reaction = emoji;
      }

      event.reactions = reactions;
      updatedEvents[eventIndex] = event;
      saveToStorage(STORAGE_KEYS.ACTIVITY_FEED, updatedEvents);

      return mockApiCall({ added });
    }
  }

  // Check if user already has a reaction on this activity
  const { data: existingReaction } = await supabase
    .from('activity_reactions')
    .select('id, emoji')
    .eq('activity_id', activity_id)
    .eq('user_id', user.id)
    .single();
  
  if (existingReaction) {
    if (existingReaction.emoji === emoji) {
      // Remove the reaction (toggle off)
      await supabase
        .from('activity_reactions')
        .delete()
        .eq('id', existingReaction.id);
      
      return mockApiCall({ added: false });
    } else {
      // Update to new emoji
      await supabase
        .from('activity_reactions')
        .update({ emoji: emoji })
        .eq('id', existingReaction.id);
      
      return mockApiCall({ added: true });
    }
  } else {
    // Add new reaction
    await supabase
      .from('activity_reactions')
      .insert({
        activity_id: activity_id,
        user_id: user.id,
        emoji: emoji,
      });
    
    return mockApiCall({ added: true });
  }
};

const SUBJECT_ID_BY_NAME: Record<string, string> = {
    Maths: 'subj_math',
    Mathematics: 'subj_math',
    Science: 'subj_science',
    English: 'subj_english',
    'Russian Language': 'subj_russian_language',
    'Russian Literature': 'subj_russian_literature',
    'Kyrgyz Language': 'subj_kyrgyz_language',
    'Kyrgyz History': 'subj_kyrgyz_history',
    'German Language': 'subj_german_language',
    Geography: 'subj_geography',
    'Global Perspective': 'subj_global_perspective',
    ICT: 'subj_ict',
};

const SUBJECT_NAME_BY_ID: Record<string, string> = {
    subj_science: 'Science',
    subj_math: 'Maths',
    subj_mathematics: 'Maths',
    subj_english: 'English',
    subj_russian_language: 'Russian Language',
    subj_russian_literature: 'Russian Language',
    subj_kyrgyz_language: 'Kyrgyz Language',
    subj_kyrgyz_history: 'Kyrgyz History',
    subj_german_language: 'German Language',
    subj_geography: 'Geography',
    subj_global_perspective: 'Global Perspective',
    subj_ict: 'ICT',
};

const mapSubjectToId = (subject?: string | null): string | null => {
    if (!subject) return null;
    return SUBJECT_ID_BY_NAME[subject] || null;
};

export const mcq_subjects_list = (): Promise<SubjectData[]> => {
    const subjects: SubjectData[] = [
        // Science
        { id: 'subj_science', name: 'Science', difficulty: 3 },
        
        // Mathematics
        { id: 'subj_math', name: 'Mathematics', difficulty: 4 },
        
        // English
        { id: 'subj_english', name: 'English', difficulty: 2 },
        
        // Global Perspective
        { id: 'subj_global_perspective', name: 'Global Perspective', difficulty: 3 },
        
        // Russian Language
        { id: 'subj_russian_language', name: 'Russian Language', difficulty: 3 },
        
        // Russian Literature
        { id: 'subj_russian_literature', name: 'Russian Literature', difficulty: 4 },
        
        // German Language
        { id: 'subj_german_language', name: 'German Language', difficulty: 3 },
        
        // Geography
        { id: 'subj_geography', name: 'Geography', difficulty: 2 },
        
        // Kyrgyz Language
        { id: 'subj_kyrgyz_language', name: 'Kyrgyz Language', difficulty: 3 },
        
        // Kyrgyz History
        { id: 'subj_kyrgyz_history', name: 'Kyrgyz History', difficulty: 3 },
    ];
    return mockApiCall(subjects);
};

export const mcq_questions_get = async (subject_id: string, limit: number = 5): Promise<Question[]> => {
    const subjectName = SUBJECT_NAME_BY_ID[subject_id] || 'Science';

    // Fetch teacher questions from database
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('subject', subjectName)
        .eq('is_public', true)
        .eq('is_active', true)
        .limit(limit * 2); // Get more to randomize

    if (error) {
        console.error('Error fetching questions:', error);
        // Return empty array instead of mock data
        return [];
    }

    if (!data || data.length === 0) {
        return [];
    }

    // Shuffle and take requested number
    const shuffled = data.sort(() => Math.random() - 0.5).slice(0, limit);

    // Map to Question format (for compatibility with existing UI)
    return shuffled.map(q => ({
        id: q.id,
        body: q.question_text,
        options: q.options || [],
        correct_answer: q.correct_answer, // Include correct answer for validation
        reward_xp: q.points || 20,
        reward_coins: Math.floor((q.points || 20) * 1.5),
        explanation: q.explanation,
        image_url: q.image_url || null, // Include question image
        points: q.points,
        times_answered: q.times_answered,
        times_correct: q.times_correct,
        subject: q.subject,
    }));
};

/**
 * Get student's progress for each subject - how many questions they've answered
 * This is USER-SPECIFIC progress, not global question bank size
 */
export const get_student_subject_progress = async (): Promise<{ id: string; name: string; answeredCount: number; totalAvailable: number }[]> => {
    try {
        const user = await getCurrentUser();
        
        // Get all subjects
        const subjects = await mcq_subjects_list();
        
        // Get DISTINCT question_ids answered by THIS student (not duplicate attempts)
        // This prevents counting the same question multiple times
        let attemptCounts: any[] = [];
        try {
            const { data, error: attemptError } = await supabase
                .from('question_attempts')
                .select('question_id')
                .eq('student_id', user.id);
            
            if (attemptError) {
                console.error('Error fetching student attempts:', attemptError);
            } else {
                attemptCounts = data || [];
            }
        } catch (err) {
            console.warn('Failed to fetch attempt counts:', err);
        }
        
        // Get total available questions per subject
        let questionData: { id: string; subject: string }[] = [];
        try {
            const { data: questionCounts, error: questionsError } = await supabase
                .from('questions')
                .select('id, subject')
                .eq('is_public', true)
                .eq('is_active', true);
            
            if (questionsError) {
                console.error('Error fetching question counts:', questionsError);
            } else {
                questionData = questionCounts || [];
            }
        } catch (err) {
            console.warn('Failed to fetch question counts:', err);
        }
        
        // Build a map of question_id -> subject
        const questionSubjectMap: Record<string, string> = {};
        const totalBySubject: Record<string, number> = {};
        for (const q of questionData) {
            if (q.id && q.subject) {
                questionSubjectMap[q.id] = q.subject;
                totalBySubject[q.subject] = (totalBySubject[q.subject] || 0) + 1;
            }
        }
        
        // Build answer counts by subject using UNIQUE question_ids only
        // Use a Set to track which questions have been answered per subject
        const answeredQuestionsPerSubject: Record<string, Set<string>> = {};
        for (const attempt of attemptCounts) {
            const subject = questionSubjectMap[attempt.question_id];
            if (subject) {
                if (!answeredQuestionsPerSubject[subject]) {
                    answeredQuestionsPerSubject[subject] = new Set();
                }
                answeredQuestionsPerSubject[subject].add(attempt.question_id);
            }
        }
        
        // Convert Sets to counts
        const answeredBySubject: Record<string, number> = {};
        for (const [subject, questionSet] of Object.entries(answeredQuestionsPerSubject)) {
            answeredBySubject[subject] = questionSet.size;
        }
        
        // Map to result with subject names (case-insensitive matching for robustness)
        return subjects.map(s => {
            // Try exact match first, then case-insensitive
            let answered = answeredBySubject[s.name] || 0;
            let total = totalBySubject[s.name] || 0;
            
            // If no match, try case-insensitive
            if (answered === 0 && total === 0) {
                const lowerName = s.name.toLowerCase();
                for (const [subject, count] of Object.entries(answeredBySubject)) {
                    if (subject.toLowerCase() === lowerName) {
                        answered = count;
                        break;
                    }
                }
                for (const [subject, count] of Object.entries(totalBySubject)) {
                    if (subject.toLowerCase() === lowerName) {
                        total = count;
                        break;
                    }
                }
            }
            
            return {
                id: s.id,
                name: s.name,
                answeredCount: answered,
                totalAvailable: total,
            };
        });
    } catch (error) {
        console.error('get_student_subject_progress failed:', error);
        // Return empty progress as fallback
        const subjects = await mcq_subjects_list();
        return subjects.map(s => ({
            id: s.id,
            name: s.name,
            answeredCount: 0,
            totalAvailable: 0,
        }));
    }
};

export interface DifficultyBreakdown {
    easy: { total: number; completed: number };
    medium: { total: number; completed: number };
    hard: { total: number; completed: number };
}

export interface SubjectProgressWithDifficulty {
    id: string;
    name: string;
    answeredCount: number;
    totalAvailable: number;
    difficulties: DifficultyBreakdown;
}

/**
 * Get student subject progress with difficulty breakdown
 * Returns progress per subject, split by easy/medium/hard
 */
export const get_student_subject_progress_with_difficulty = async (): Promise<SubjectProgressWithDifficulty[]> => {
    try {
        const user = await getCurrentUser();
        console.log('[Progress] Fetching progress for user:', user.id);
        
        // Get all subjects
        const subjects = await mcq_subjects_list();
        
        // Get student's answered question IDs - using RLS to filter by student_id
        let attemptCounts: { question_id: string }[] = [];
        try {
            // Note: RLS policy filters by auth.uid() = student_id automatically
            // We don't need to manually filter, but we do for explicit clarity
            const { data, error: attemptError } = await supabase
                .from('question_attempts')
                .select('question_id')
                .eq('student_id', user.id);
            
            if (attemptError) {
                console.error('[Progress] Error fetching student attempts:', attemptError);
            } else {
                attemptCounts = data || [];
                console.log(`[Progress] Found ${attemptCounts.length} question attempts for user`);
            }
        } catch (err) {
            console.warn('[Progress] Failed to fetch attempt counts:', err);
        }
        
        // Build set of answered question IDs
        const answeredQuestionIds = new Set(attemptCounts.map(a => a.question_id));
        
        // Get all questions with their subject and difficulty
        let questionData: { id: string; subject: string; difficulty: string | null }[] = [];
        try {
            const { data: questions, error: questionsError } = await supabase
                .from('questions')
                .select('id, subject, difficulty')
                .eq('is_public', true)
                .eq('is_active', true);
            
            if (questionsError) {
                console.error('Error fetching questions:', questionsError);
            } else {
                questionData = questions || [];
            }
        } catch (err) {
            console.warn('Failed to fetch questions:', err);
        }
        
        // Normalize difficulty values (db uses 'med' but UI uses 'medium')
        const normalizeDifficulty = (d: string | null): 'easy' | 'medium' | 'hard' => {
            if (!d) return 'easy'; // Default to easy if no difficulty set
            const lower = d.toLowerCase();
            if (lower === 'easy') return 'easy';
            if (lower === 'med' || lower === 'medium') return 'medium';
            if (lower === 'hard') return 'hard';
            return 'easy'; // Default fallback
        };
        
        // Build progress per subject with difficulty breakdown
        const subjectProgress: Record<string, {
            total: number;
            answered: number;
            difficulties: {
                easy: { total: number; completed: number };
                medium: { total: number; completed: number };
                hard: { total: number; completed: number };
            };
        }> = {};
        
        for (const q of questionData) {
            if (!q.subject) continue;
            
            const subjectKey = q.subject;
            const difficulty = normalizeDifficulty(q.difficulty);
            const isAnswered = answeredQuestionIds.has(q.id);
            
            if (!subjectProgress[subjectKey]) {
                subjectProgress[subjectKey] = {
                    total: 0,
                    answered: 0,
                    difficulties: {
                        easy: { total: 0, completed: 0 },
                        medium: { total: 0, completed: 0 },
                        hard: { total: 0, completed: 0 }
                    }
                };
            }
            
            subjectProgress[subjectKey].total++;
            subjectProgress[subjectKey].difficulties[difficulty].total++;
            
            if (isAnswered) {
                subjectProgress[subjectKey].answered++;
                subjectProgress[subjectKey].difficulties[difficulty].completed++;
            }
        }
        
        // Map subjects to results with case-insensitive matching
        return subjects.map(s => {
            // Try exact match first
            let progress = subjectProgress[s.name];
            
            // If no match, try case-insensitive
            if (!progress) {
                const lowerName = s.name.toLowerCase();
                for (const [subject, prog] of Object.entries(subjectProgress)) {
                    if (subject.toLowerCase() === lowerName) {
                        progress = prog;
                        break;
                    }
                }
            }
            
            const defaultDifficulties = {
                easy: { total: 0, completed: 0 },
                medium: { total: 0, completed: 0 },
                hard: { total: 0, completed: 0 }
            };
            
            return {
                id: s.id,
                name: s.name,
                answeredCount: progress?.answered || 0,
                totalAvailable: progress?.total || 0,
                difficulties: progress?.difficulties || defaultDifficulties
            };
        });
    } catch (error) {
        console.error('get_student_subject_progress_with_difficulty failed:', error);
        // Return empty progress as fallback
        const subjects = await mcq_subjects_list();
        return subjects.map(s => ({
            id: s.id,
            name: s.name,
            answeredCount: 0,
            totalAvailable: 0,
            difficulties: {
                easy: { total: 0, completed: 0 },
                medium: { total: 0, completed: 0 },
                hard: { total: 0, completed: 0 }
            }
        }));
    }
};


export const raid_targets = async (): Promise<RaidTarget[]> => {
    const user = await getCurrentUser();
    
    // Fetch current user's profile for stats
    const { data: profileData } = await supabase
        .from('users')
        .select('level, batch, attack_power')
        .eq('id', user.id)
        .single();
    
    const userLevel = profileData?.level || 1;
    const userBatch = profileData?.batch || '8B';
    const userAttackPower = profileData?.attack_power || 10;
    
    // Use school-scoped RPC to get targets (enforces tenant isolation server-side)
    const { data: players, error } = await supabase.rpc('get_attack_targets', { p_limit: 100 });
    
    if (error) throw error;
    
    const playerList = players || [];
    const playerIds = playerList.map((p: any) => p.id);
    
    const neonOwners = await fetchNeonFrameOwners(playerIds);
    const flickerOwners = await fetchFlickerThemeOwners(playerList.map((p: any) => p.id));
    const glitchOwners = await fetchGlitchEffectOwners(playerList.map((p: any) => p.id));

    const realTargets: RaidTarget[] = playerList.map((p: any) => {
        // RPC already returns has_shield, clan_id, clan_name
        const targetHasShield = p.has_shield || false;
        
        // Calculate win rate based on attack vs defense
        const defenderPower = (p.defense_power || 10) + (targetHasShield ? 20 : 0);
        const winRate = Math.min(0.95, Math.max(0.05, userAttackPower / (userAttackPower + defenderPower)));

        return {
            user_id: p.id,
            username: p.username,
            level: p.level,
            coins: p.coins,
            batch: p.batch as '8A' | '8B' | '8C',
            has_shield: targetHasShield,
            est_win_rate: winRate,
            avatar_url: p.avatar_url || '',
            active_cosmetic_frame: neonOwners.has(p.id) ? 'neon' : null,
            active_cosmetic_theme: flickerOwners.has(p.id) ? 'flicker' : null,
            active_cosmetic_effect: glitchOwners.has(p.id) ? 'glitch' : null,
            last_seen: p.last_seen,
            clan_name: p.clan_name || undefined,
            clan_id: p.clan_id || undefined,
            is_bot: false,
            attack_power: p.attack_power,
            defense_power: p.defense_power,
            last_attacked_at: p.last_attacked_at,
        };
    });

    // Prioritize targets: same batch > similar level > active players
    const prioritizedTargets = realTargets.sort((a, b) => {
        // Same batch gets priority
        if (a.batch === userBatch && b.batch !== userBatch) return -1;
        if (b.batch === userBatch && a.batch !== userBatch) return 1;
        
        // Similar level gets priority
        const levelDiffA = Math.abs(a.level - userLevel);
        const levelDiffB = Math.abs(b.level - userLevel);
        if (levelDiffA !== levelDiffB) return levelDiffA - levelDiffB;
        
        // Active players (online recently) get priority
        const timeA = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const timeB = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return timeB - timeA;
    });

    const existingIds = new Set(prioritizedTargets.map(target => target.user_id));
    // Add bots to fill gaps (but mark them as real players for display)
    const MIN_TARGETS = 10;
    const botsNeeded = Math.max(MIN_TARGETS - prioritizedTargets.length, 0);
    const bots = generateKyrgyzBots(botsNeeded, existingIds).map(bot => ({ ...bot, is_bot: false })); // Hide bot status

    // Return all targets (no artificial limit)
    const combinedTargets = [...prioritizedTargets, ...bots];

    return mockApiCall(combinedTargets);
};

// Raid system integration -------------------------------------------------

export const getActiveRaidStatus = (): Promise<RaidStatus | null> => {
    return RaidFeatureService.getActiveRaid();
};

export const getRaidStatusById = (raidId: string): Promise<RaidStatus | null> => {
    return RaidFeatureService.getRaidStatus(raidId);
};

export const getBossUnlockState = (userId: string): Promise<BossUnlockState> => {
    return RaidFeatureService.getBossUnlockState(userId);
};

export const startRaidEncounter = (bossId: string): Promise<RaidStatus> => {
    return RaidFeatureService.startRaid(bossId);
};

export const joinRaid = (raidId: string, username: string, userId: string): Promise<RaidParticipantState> => {
    return RaidFeatureService.joinRaid(raidId, username, userId);
};

export const submitRaidWaveAnswer = (
    payload: RaidAnswerPayload,
    wave: RaidWaveState,
    participant: RaidParticipantState,
) => {
    return RaidFeatureService.submitRaidAnswer(payload, wave, participant);
};

export const finalizeRaidEncounter = (
    raidId: string,
    participants: RaidParticipantState[],
): Promise<RaidFinalizationResult> => {
    return RaidFeatureService.finalizeRaid(raidId, participants);
};

export const getRaidWaveQuestions = (request: RaidQuestionRequest): Promise<RaidQuestion[]> => {
    return RaidFeatureService.getRaidWaveQuestions(request);
};

export const raid_attack = async (
    defender_id: string,
    _use_cracker: boolean,
    _target: RaidTarget,
    requestId?: string
): Promise<RaidAttackResult> => {
    const { data, error } = await performHackAttempt(defender_id, requestId);

    if (error) {
        throw new Error(error.message || 'Failed to execute raid attack.');
    }

    if (!data) {
        throw new Error('Hack attempt returned no data.');
    }

    const payload = data as any;

    const legacyAttackerDeltas = {
        xp: payload.xp_delta ?? 0,
        coins: payload.coins_delta ?? 0,
        gemstones: payload.gemstones_delta ?? 0,
    };
    const attackerDeltas = payload.attacker_deltas ?? legacyAttackerDeltas;

    const response: RaidAttackResult = {
        result: (payload.result ?? 'lose') as RaidAttackResult['result'],
        attacker_deltas: {
            xp: attackerDeltas?.xp ?? legacyAttackerDeltas.xp,
            coins: attackerDeltas?.coins ?? legacyAttackerDeltas.coins,
            gemstones: attackerDeltas?.gemstones ?? legacyAttackerDeltas.gemstones,
        },
        defender_deltas: {
            coins_loss: payload.defender_deltas?.coins_loss ?? 0,
        },
        shield_state: (payload.shield_state ?? 'none') as RaidAttackResult['shield_state'],
        final_profile_values: payload.final_profile_values ?? undefined,
    };

    // Surface Supabase combat stats in debug logs to aid balancing
    if (payload.combat_stats) {
        console.debug('PvP combat stats', payload.combat_stats);
    }

    if (response.result === 'win') {
        incrementPvPWin();
        const progress = getTaskProgress();
        if (progress.daily_pvp_wins === 1) {
            incrementWeeklyTaskCompleted();
        }
    }

    return mockApiCall(response);
};

const MOCK_SHOP_ITEMS: ShopItem[] = [
    { id: 'item_shield', name: 'Shield', kind: 'shield', price: 150, rarity: 'common', daily_limit: 3, owned_today: 0, description: 'Blocks one incoming hack attempt before shattering. +20 Defense.', effect_summary: '+20 Defense' },
    { id: 'item_firewall', name: 'Firewall', kind: 'firewall', price: 300, rarity: 'common', daily_limit: 2, owned_today: 0, description: 'Advanced defense system. +30 Defense until cracked.', effect_summary: '+30 Defense' },
    { id: 'item_encryption_key', name: 'Encryption Key', kind: 'encryption_key', price: 200, rarity: 'common', daily_limit: 3, owned_today: 0, description: 'Permanent attack boost. +15 Attack.', effect_summary: '+15 Attack (Permanent)' },
    { id: 'item_exploit_kit', name: 'Exploit Kit', kind: 'exploit_kit', price: 350, rarity: 'rare', gemstone_price: 4, daily_limit: 2, owned_today: 0, description: 'Advanced hacking tools. +25 Attack permanently.', effect_summary: '+25 Attack (Permanent)' },
    { id: 'item_cracker', name: 'Cracker', kind: 'cracker', price: 200, rarity: 'common', daily_limit: 2, owned_today: 0, description: 'Bypasses an active enemy shield during a hack.', effect_summary: 'Negates 1 shield' },
    { id: 'item_booster', name: 'Booster', kind: 'booster', price: 250, rarity: 'common', daily_limit: 1, owned_today: 0, description: 'Grants 1.5x XP from all sources for 1 hour.', effect_summary: '1.5x XP (1h)' },
    { id: 'item_major_booster', name: 'Major Booster', kind: 'major_booster', price: 400, rarity: 'rare', gemstone_price: 6, daily_limit: 1, owned_today: 0, description: 'Grants a massive 2.0x XP from all sources for 1 hour.', effect_summary: '2.0x XP (1h)' },
    { id: 'item_cosmetic_frame', name: 'Neon Frame', kind: 'cosmetic', price: 10000, rarity: 'rare', gemstone_price: 50, daily_limit: 1, owned_today: 0, description: 'A flashy neon frame for your avatar. Show off your style!', effect_summary: 'Purely cosmetic' },
    { id: 'item_cosmetic_theme', name: 'Flicker Theme', kind: 'cosmetic', price: 20000, rarity: 'legendary', gemstone_price: 100, daily_limit: 1, owned_today: 0, description: 'Apply a flickering, datamosh effect to your profile card.', effect_summary: 'Purely cosmetic' },
    { id: 'item_cosmetic_glitch', name: 'Glitch Effect', kind: 'cosmetic', price: 50000, rarity: 'legendary', gemstone_price: 150, daily_limit: 1, owned_today: 0, description: 'A mesmerizing glitch distortion effect that warps your avatar with digital artifacts. The ultimate flex.', effect_summary: 'Glitch distortion effect' },
    { id: 'item_quantum_cloak', name: 'Quantum Cloak', kind: 'shield', price: 500, rarity: 'legendary', gemstone_price: 12, daily_limit: 1, owned_today: 0, description: 'Phase-shifted armor that nullifies three attacks before collapsing.', effect_summary: 'Blocks 3 attacks' },
];


export const shop_list = async (): Promise<ShopItem[]> => {
    const user = await getCurrentUser();
    
    // Get today's purchases from database
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { data: purchases } = await supabase
        .from('shop_purchases')
        .select('item_id, quantity')
        .eq('user_id', user.id)
        .eq('purchase_date', today); // Use purchase_date column (DATE type)
    
    // Count purchases by item_id
    const purchaseCounts: Record<string, number> = {};
    purchases?.forEach(p => {
        purchaseCounts[p.item_id] = (purchaseCounts[p.item_id] || 0) + p.quantity;
    });
    
    // Update owned_today with real purchase counts
    const itemsWithRealCounts = MOCK_SHOP_ITEMS.map(item => ({
        ...item,
        owned_today: purchaseCounts[item.id] || 0
    }));
    
    return mockApiCall(itemsWithRealCounts);
};

export const shop_buy = async (item_id: string, quantity: number): Promise<PurchaseReceipt> => {
    const user = await getCurrentUser();
    const item = MOCK_SHOP_ITEMS.find(i => i.id === item_id);

    if (!item) {
        return Promise.reject({ message: 'Item not found.' });
    }

    const { data: balances, error: balanceError } = await supabase
        .from('users')
        .select('coins, gemstones')
        .eq('id', user.id)
        .single();

    if (balanceError || !balances) {
        return Promise.reject({ message: 'Failed to load your balances.' });
    }

    const currentCoins = balances.coins ?? 0;
    const currentGemstones = balances.gemstones ?? 0;

    const totalCoinCost = item.price * quantity;
    const gemstonePrice = item.gemstone_price || 0;
    const totalGemCost = gemstonePrice * quantity;

    if (totalCoinCost > currentCoins) {
        return Promise.reject({ message: 'Not enough coins.' });
    }

    if (totalGemCost > currentGemstones) {
        return Promise.reject({ message: 'Not enough gemstones.' });
    }

    // Check today's purchase count from database
    const today = new Date().toISOString().split('T')[0];
    const { data: todayPurchases } = await supabase
        .from('shop_purchases')
        .select('quantity')
        .eq('user_id', user.id)
        .eq('item_id', item_id)
        .eq('purchase_date', today); // Use purchase_date column (DATE type)
    
    const currentPurchaseCount = todayPurchases?.reduce((sum, p) => sum + p.quantity, 0) || 0;
    
    if ((currentPurchaseCount + quantity) > item.daily_limit) {
        return Promise.reject({ message: 'Daily purchase limit exceeded.' });
    }

    const newCoinBalance = currentCoins - totalCoinCost;
    const newGemstoneBalance = currentGemstones - totalGemCost;

    // Update profile balances using the authoritative values from the database
    await updateProfile(user.id, { coins: newCoinBalance, gemstones: newGemstoneBalance });

    // Add purchase record
    await supabase.from('shop_purchases').insert({
        user_id: user.id,
        item_id: item.id,
        quantity: quantity,
        total_cost: totalCoinCost,
    });

    // Log activity for achievement tracking
    await supabase.from('activities').insert({
        kind: 'shop_purchase',
        actor_id: user.id,
        actor_username: user.email?.split('@')[0] || 'Unknown',
        data: { 
            item_id: item.id, 
            item_name: item.name, 
            quantity: quantity,
            amount: totalCoinCost 
        },
    });

    // Check for shop-related achievements
    try {
        const newlyEarned = await check_achievements();
        if (newlyEarned && newlyEarned.length > 0) {
            console.log('🏆 Achievements earned from shop purchase:', newlyEarned.map(a => a.name));
        }
    } catch (achError) {
        console.warn('Failed to check shop achievements:', achError);
    }

    // Add items to inventory
    const inventoryItems = [];
    for (let i = 0; i < quantity; i++) {
        const newItem = {
            user_id: user.id,
            item_id: item.id,
            name: item.name,
            kind: item.kind,
            state: 'unused' as const,
            description: item.description,
            effect_summary: item.effect_summary,
            attack_bonus: item.kind === 'encryption_key' ? 15 : item.kind === 'exploit_kit' ? 25 : undefined,
            defense_bonus: item.kind === 'shield' ? 20 : item.kind === 'firewall' ? 30 : undefined,
        };
        inventoryItems.push(newItem);
    }
    
    await supabase.from('inventory').insert(inventoryItems);

    const receipt: PurchaseReceipt = {
        receipt_id: `rec_${Date.now()}`,
        coins_spent: totalCoinCost,
        gemstones_spent: totalGemCost,
        new_balance: newCoinBalance,
        new_gemstone_balance: newGemstoneBalance,
        item: item,
        quantity: quantity
    };
    
    return mockApiCall(receipt);
};

export const inventory_list = async (): Promise<InventoryItem[]> => {
    const user = await getCurrentUser();
    
    // Delete expired items from database
    const now = new Date().toISOString();
    await supabase
        .from('inventory')
        .delete()
        .eq('user_id', user.id)
        .eq('state', 'active')
        .not('expires_at', 'is', null)
        .lt('expires_at', now);
    
    // Fetch user's inventory
    const { data: items, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return mockApiCall(items || []);
};

export const inventory_activate = async (inv_id: string): Promise<{ state_after: InventoryItem['state'], effect_window: { start: string, end: string } }> => {
    const user = await getCurrentUser();
    
    // Fetch the item
    const { data: item, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', inv_id)
        .eq('user_id', user.id)
        .single();

    if (error || !item) {
        return Promise.reject({ message: 'Item not found in inventory.' });
    }
    if (item.state !== 'unused') {
        return Promise.reject({ message: 'Item cannot be activated.' });
    }
    
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour for boosters

    if (item.kind === 'cosmetic') {
        await supabase
            .from('inventory')
            .update({
                state: 'active',
                activated_at: now.toISOString(),
                expires_at: null,
            })
            .eq('id', inv_id);

        // Also update the users table to reflect active cosmetic
        if (item.item_id === 'item_cosmetic_frame') {
            await updateProfile(user.id, {
                active_cosmetic_frame: 'neon',
            });
        } else if (item.item_id === 'item_cosmetic_theme') {
            await updateProfile(user.id, {
                active_cosmetic_theme: 'flicker',
            });
        } else if (item.item_id === 'item_cosmetic_glitch') {
            await updateProfile(user.id, {
                active_cosmetic_effect: 'glitch',
            });
        }

        return mockApiCall({
            state_after: 'active' as const,
            effect_window: { start: now.toISOString(), end: 'Permanent' }
        });
    }

    // Handle different item types
    if (item.kind === 'encryption_key' || item.kind === 'exploit_kit') {
        // Permanent attack boost - add to user's attack_power
        const attackBonus = item.attack_bonus || 0;
        
        if (attackBonus > 0) {
            const { data: profile } = await supabase
                .from('users')
                .select('attack_power')
                .eq('id', user.id)
                .single();
            
            await updateProfile(user.id, {
                attack_power: (profile?.attack_power || 10) + attackBonus
            });
        }
        
        // Mark item as consumed (permanent effect applied)
        await supabase
            .from('inventory')
            .update({ state: 'active', activated_at: now.toISOString() })
            .eq('id', inv_id);
        
        return mockApiCall({
            state_after: 'active' as const,
            effect_window: { start: now.toISOString(), end: 'Permanent' }
        });
    }
    
    if (item.kind === 'firewall') {
        // Permanent defense boost - add to user's defense_power
        const defenseBonus = item.defense_bonus || 0;
        
        if (defenseBonus > 0) {
            const { data: profile } = await supabase
                .from('users')
                .select('defense_power')
                .eq('id', user.id)
                .single();
            
            await updateProfile(user.id, {
                defense_power: (profile?.defense_power || 10) + defenseBonus
            });
        }
        
        // Mark as consumed
        await supabase
            .from('inventory')
            .update({ state: 'active', activated_at: now.toISOString() })
            .eq('id', inv_id);
        
        return mockApiCall({
            state_after: 'active' as const,
            effect_window: { start: now.toISOString(), end: 'Permanent' }
        });
    }
    
    const isShield = item.kind === 'shield';
    const expiresAt = isShield ? null : expiry.toISOString();
    
    // Deactivate other boosters if a new one is used
    if (item.kind === 'booster' || item.kind === 'major_booster') {
        await supabase
            .from('inventory')
            .delete()
            .eq('user_id', user.id)
            .neq('id', inv_id)
            .eq('state', 'active')
            .in('kind', ['booster', 'major_booster']);
    }
    
    // Activate this item
    await supabase
        .from('inventory')
        .update({
            state: 'active',
            activated_at: now.toISOString(),
            expires_at: expiresAt,
        })
        .eq('id', inv_id);
    
    const result = {
        state_after: 'active' as const,
        effect_window: {
            start: now.toISOString(),
            end: isShield ? 'Until Cracked' : expiry.toISOString()
        }
    };
    return mockApiCall(result);
};

export const deactivate_neon_frame = async (): Promise<void> => {
    const user = await getCurrentUser();

    const { data: neonFrame, error } = await supabase
        .from('inventory')
        .select('id')
        .eq('user_id', user.id)
        .eq('kind', 'cosmetic')
        .eq('item_id', 'item_cosmetic_frame')
        .eq('state', 'active')
        .order('activated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(error.message || 'Failed to check neon frame status.');
    }

    if (!neonFrame) {
        throw new Error('Neon frame is already inactive.');
    }

    const { error: updateError } = await supabase
        .from('inventory')
        .update({
            state: 'consumed',
            expires_at: new Date().toISOString(),
        })
        .eq('id', neonFrame.id);

    if (updateError) {
        throw new Error(updateError.message || 'Failed to deactivate neon frame.');
    }

    // Also clear from users table
    await updateProfile(user.id, {
        active_cosmetic_frame: null,
    });
};

export const deactivate_flicker_theme = async (): Promise<void> => {
    const user = await getCurrentUser();

    const { data: glitchTheme, error } = await supabase
        .from('inventory')
        .select('id')
        .eq('user_id', user.id)
        .eq('kind', 'cosmetic')
        .eq('item_id', 'item_cosmetic_theme')
        .eq('state', 'active')
        .order('activated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(error.message || 'Failed to check flicker theme status.');
    }

    if (!glitchTheme) {
        throw new Error('Flicker theme is already inactive.');
    }

    const { error: updateError } = await supabase
        .from('inventory')
        .update({
            state: 'consumed',
            expires_at: new Date().toISOString(),
        })
        .eq('id', glitchTheme.id);

    if (updateError) {
        throw new Error(updateError.message || 'Failed to deactivate flicker theme.');
    }

    // Also clear from users table
    await updateProfile(user.id, {
        active_cosmetic_theme: null,
    });
};

export const deactivate_glitch_effect = async (): Promise<void> => {
    const user = await getCurrentUser();

    const { data: glitchEffect, error } = await supabase
        .from('inventory')
        .select('id')
        .eq('user_id', user.id)
        .eq('kind', 'cosmetic')
        .eq('item_id', 'item_cosmetic_glitch')
        .eq('state', 'active')
        .order('activated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(error.message || 'Failed to check glitch effect status.');
    }

    if (!glitchEffect) {
        throw new Error('Glitch effect is already inactive.');
    }

    const { error: updateError } = await supabase
        .from('inventory')
        .update({
            state: 'consumed',
            expires_at: new Date().toISOString(),
        })
        .eq('id', glitchEffect.id);

    if (updateError) {
        throw new Error(updateError.message || 'Failed to deactivate glitch effect.');
    }

    // Also clear from users table
    await updateProfile(user.id, {
        active_cosmetic_effect: null,
    });
};

export const clan_list = async (): Promise<ClanSummary[]> => {
    const { data: clanScores, error } = await supabase.rpc('get_school_clan_leaderboard', { p_limit: 50 });

    if (error) {
        console.error('Error fetching clans:', error);
        return mockApiCall([]);
    }

    const clanIds = (clanScores || []).map((clan: any) => clan.id).filter(Boolean);
    let metaById = new Map<string, { notice?: string; crest_url?: string; member_limit?: number }>();

    if (clanIds.length > 0) {
        const { data: clanMeta, error: metaError } = await supabase
            .from('clans')
            .select('id, notice, crest_url, member_limit')
            .in('id', clanIds);

        if (metaError) {
            console.warn('Failed to load clan metadata:', metaError);
        } else if (clanMeta) {
            metaById = new Map(
                clanMeta.map((clan: any) => [clan.id, { notice: clan.notice, crest_url: clan.crest_url, member_limit: clan.member_limit }])
            );
        }
    }

    const mappedClans = (clanScores || []).map((clan: any) => {
        const meta = metaById.get(clan.id);
        const totalScore = Number(clan.clan_total_score ?? 0);

        return {
            id: clan.id,
            name: clan.name,
            notice: meta?.notice,
            crest_url: meta?.crest_url,
            member_count: Number(clan.member_count ?? 0),
            member_limit: Number(meta?.member_limit ?? 5),
            vault_metric: totalScore,
            clan_total_score: totalScore,
        };
    });

    return mockApiCall(mappedClans);
};

export const clan_get_members_by_id = async (clanId: string): Promise<ClanMember[]> => {
    const { data, error } = await supabase
        .from('clan_member_scores')
        .select('*')
        .eq('clan_id', clanId)
        .order('total_score', { ascending: false });

    if (error) {
        throw error;
    }

    const neonOwners = await fetchNeonFrameOwners((data || []).map((member: any) => member.user_id));
    const flickerOwners = await fetchFlickerThemeOwners((data || []).map((member: any) => member.user_id));
    const glitchOwners = await fetchGlitchEffectOwners((data || []).map((member: any) => member.user_id));

    return (data || []).map((member: any) => ({
        user_id: member.user_id,
        username: member.username ?? 'Unknown agent',
        role: member.role || 'member',
        contribution: member.total_score || 0,
        avatar_url: member.avatar_url || '',
        active_cosmetic_frame: neonOwners.has(member.user_id) ? 'neon' : null,
        active_cosmetic_theme: flickerOwners.has(member.user_id) ? 'flicker' : null,
        active_cosmetic_effect: glitchOwners.has(member.user_id) ? 'glitch' : null,
        custom_title: member.custom_title,
        bio: member.bio,
        total_score: member.total_score,
        xp: member.xp,
        pvp_score: member.pvp_score,
    }));
};

export interface ClanJoinResult {
    status: 'pending' | 'joined';
    clan?: Clan;
    request?: ClanJoinRequest | null;
    message?: string;
}

const mapJoinRequest = (row: any): ClanJoinRequest => ({
    id: row.id,
    clan_id: row.clan_id,
    user_id: row.user_id,
    status: row.status,
    created_at: row.created_at ?? row.requested_at,
    requested_at: row.requested_at ?? row.created_at,
    approver_id: row.approved_by ?? null,
    clan_name: row.clans?.name ?? row.clan_name,
    username: row.username ?? row.users?.username,
    avatar_url: row.avatar_url ?? row.users?.avatar_url,
});

export const clan_join = async (clan_id: string): Promise<ClanJoinResult> => {
    const user = await getCurrentUser();

    const { data: clanData, error: clanError } = await supabase
        .from('clans')
        .select('id, name')
        .eq('id', clan_id)
        .single();

    if (clanError || !clanData) {
        return Promise.reject({ message: 'Clan not found.' });
    }

    const { data: existingMembership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (existingMembership) {
        return Promise.reject({ message: 'You are already in a clan.' });
    }

    const { data: existingRequest } = await supabase
        .from('clan_join_requests')
        .select('id, status, created_at')
        .eq('user_id', user.id)
        .eq('clan_id', clan_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingRequest && existingRequest.status === 'pending') {
        return mockApiCall({
            status: 'pending',
            request: mapJoinRequest({ ...existingRequest, clan_id, user_id: user.id, clan_name: clanData.name }),
            message: 'Join request is awaiting approval.',
        });
    }

    const { data: requestInsert, error: requestError } = await supabase
        .from('clan_join_requests')
        .insert({ clan_id, user_id: user.id, status: 'pending' })
        .select('id, status, created_at')
        .single();

    if (requestError || !requestInsert) {
        console.error('Failed to create join request:', requestError);
        throw new Error('Failed to request to join clan.');
    }

    return mockApiCall({
        status: 'pending',
        request: mapJoinRequest({ ...requestInsert, clan_id, user_id: user.id, clan_name: clanData.name }),
        message: 'Request submitted for approval.',
    });
};

export const clan_get_my_pending_request = async (): Promise<ClanJoinRequest | null> => {
    const user = await getCurrentUser();
    const { data, error } = await supabase
        .from('clan_join_requests')
        .select('id, clan_id, user_id, status, created_at, clans(name)')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.warn('Failed to load join request (non-fatal):', error.message);
        return mockApiCall(null);
    }

    const requestRow = data?.[0];
    if (!requestRow) return mockApiCall(null);

    return mockApiCall(mapJoinRequest(requestRow));
};

export const clan_get_pending_request_count = async (): Promise<number> => {
    const user = await getCurrentUser();
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!membership || !['leader', 'moderator'].includes(membership.role)) {
        return mockApiCall(0);
    }

    const { count, error } = await supabase
        .from('clan_join_requests')
        .select('*', { count: 'exact', head: true })
        .eq('clan_id', membership.clan_id)
        .eq('status', 'pending');

    if (error) {
        console.error('Failed to fetch pending request count:', error);
        throw new Error('Unable to load request count.');
    }

    return mockApiCall(count ?? 0);
};

export const clan_get_pending_join_requests = async (): Promise<ClanJoinRequest[]> => {
    const user = await getCurrentUser();
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!membership || !['leader', 'moderator'].includes(membership.role)) {
        console.log('User is not a leader/moderator of any clan');
        return mockApiCall([]);
    }

    console.log('Fetching pending join requests for clan:', membership.clan_id);

    // Try query without embedding users first to avoid PGRST201 ambiguous relationship error
    // (clan_join_requests has multiple FKs to users: user_id and approved_by)
    const { data, error } = await supabase
        .from('clan_join_requests')
        .select('id, clan_id, user_id, status, created_at, clans(name)')
        .eq('clan_id', membership.clan_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Failed to fetch join requests:', error);
        // If table doesn't exist (404/PGRST116), return empty array instead of throwing
        if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('404') || error.message?.includes('not found')) {
            console.warn('clan_join_requests table may not exist. Please run the migration SQL: FIX_CLAN_JOIN_REQUESTS_RLS.sql');
            return mockApiCall([]);
        }
        // For RLS or other errors, return empty instead of crashing
        console.warn('Returning empty join requests due to error:', error.message);
        return mockApiCall([]);
    }

    if (!data || data.length === 0) {
        return mockApiCall([]);
    }

    // Fetch usernames separately to avoid ambiguous relationship
    const userIds = [...new Set(data.map(r => r.user_id))];
    const { data: usersData } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .in('id', userIds);

    const usersMap = new Map((usersData || []).map(u => [u.id, u]));

    const enrichedData = data.map(r => {
        const user = usersMap.get(r.user_id);
        return {
            ...r,
            users: user || { username: r.user_id.substring(0, 8), avatar_url: null }, // Fallback to ID prefix if user not found
        };
    });

    console.log('Successfully fetched join requests:', enrichedData.length);
    return mockApiCall(enrichedData.map(mapJoinRequest));
};

export const clan_approve_join_request = async (requestId: string): Promise<boolean> => {
    const user = await getCurrentUser();
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!membership || !['leader', 'moderator'].includes(membership.role)) {
        throw new Error('Only leaders or moderators can approve requests.');
    }

    const { error } = await supabase.rpc('rpc_clan_join_request_decide', {
        p_request_id: requestId,
        p_action: 'approve',
    });

    if (error) {
        console.error('Failed to approve join request:', error);
        if (error.message?.includes('404') || error.code === 'PGRST116') {
            throw new Error('clan_join_requests table not found. Please run the migration SQL.');
        }
        throw new Error('Failed to approve request.');
    }

    return mockApiCall(true);
};

export const clan_reject_join_request = async (requestId: string): Promise<boolean> => {
    const user = await getCurrentUser();
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!membership || !['leader', 'moderator'].includes(membership.role)) {
        throw new Error('Only leaders or moderators can reject requests.');
    }

    const { error } = await supabase.rpc('rpc_clan_join_request_decide', {
        p_request_id: requestId,
        p_action: 'reject',
    });

    if (error) {
        console.error('Failed to reject join request:', error);
        if (error.message?.includes('404') || error.code === 'PGRST116') {
            throw new Error('clan_join_requests table not found. Please run the migration SQL.');
        }
        throw new Error('Failed to reject request.');
    }

    return mockApiCall(true);
};

export const clan_cancel_join_request = async (requestId: string): Promise<boolean> => {
    const user = await getCurrentUser();
    
    const { data: request, error: fetchError } = await supabase
        .from('clan_join_requests')
        .select('user_id, status')
        .eq('id', requestId)
        .single();

    if (fetchError) {
        console.error('Error fetching request to cancel:', fetchError);
        throw new Error('Join request not found.');
    }

    if (!request) {
        throw new Error('Join request not found.');
    }

    if (request.user_id !== user.id) {
        throw new Error('You can only cancel your own join requests.');
    }

    if (request.status !== 'pending') {
        throw new Error('Only pending requests can be canceled.');
    }

    const { error: deleteError } = await supabase
        .from('clan_join_requests')
        .delete()
        .eq('id', requestId);

    if (deleteError) {
        console.error('Failed to cancel join request:', deleteError);
        throw new Error('Failed to cancel request.');
    }

    return mockApiCall(true);
};

export const clan_details = async (): Promise<Clan | null> => {
    const user = await getCurrentUser();

    const { data: membership, error: membershipError } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .maybeSingle();

    let clanId: string | null = membership?.clan_id ?? null;

    if (membershipError && membershipError.code !== 'PGRST116') {
        console.error('Failed to resolve clan membership via clan_members:', membershipError);
    }

    if (!clanId) {
        return mockApiCall(null);
    }

    const { data: clan, error } = await supabase
        .from('clans')
        .select('*')
        .eq('id', clanId)
        .single();

    if (error || !clan) {
        return mockApiCall(null);
    }
    
    let memberRows: any[] = [];
    const { data: membersData, error: membersError } = await supabase
        .from('clan_member_scores')
        .select('*')
        .eq('clan_id', clan.id)
        .order('total_score', { ascending: false });

    if (membersError) {
        console.error('Failed to fetch clan members from scores view, attempting fallback:', membersError);
        const { data: fallbackMembers, error: fallbackError } = await supabase
            .from('clan_members')
            .select('user_id, role, joined_at, users(username, avatar_url, xp, pvp_score)')
            .eq('clan_id', clan.id)
            .order('joined_at', { ascending: true });

        if (fallbackError) {
            console.error('Fallback clan member fetch also failed:', fallbackError);
            throw fallbackError;
        }

        memberRows = (fallbackMembers || []).map((member: any) => ({
            user_id: member.user_id,
            username: member.users?.username ?? 'Unknown Agent',
            role: member.role,
            contribution: 0,
            avatar_url: member.users?.avatar_url,
            custom_title: null,
            bio: null,
            total_score: calculateTotalScore(member.users?.xp ?? 0, member.users?.pvp_score ?? 0),
            xp: member.users?.xp ?? 0,
            pvp_score: member.users?.pvp_score ?? 0,
        }));
    } else {
        memberRows = membersData || [];
    }

    const neonOwners = await fetchNeonFrameOwners(memberRows.map((m: any) => m.user_id));
    const flickerOwners = await fetchFlickerThemeOwners(memberRows.map((m: any) => m.user_id));
    const glitchOwners = await fetchGlitchEffectOwners(memberRows.map((m: any) => m.user_id));

    const members = memberRows.map((m: any) => ({
        user_id: m.user_id,
        username: m.username,
        role: m.role,
        contribution: m.total_score || m.contribution || calculateTotalScore(m.xp ?? 0, m.pvp_score ?? 0),
        avatar_url: m.avatar_url,
        active_cosmetic_frame: neonOwners.has(m.user_id) ? 'neon' : null,
        active_cosmetic_theme: flickerOwners.has(m.user_id) ? 'flicker' : null,
        active_cosmetic_effect: glitchOwners.has(m.user_id) ? 'glitch' : null,
        custom_title: m.custom_title,
        bio: m.bio,
        total_score: m.total_score ?? calculateTotalScore(m.xp ?? 0, m.pvp_score ?? 0),
        xp: m.xp,
        pvp_score: m.pvp_score,
    })) as ClanMember[];

    const calculatedScore = members.reduce((sum, member) => sum + (member.total_score || 0), 0);
    
    let clanScore: number | null = null;
    let activeBuffs: ActiveClanBuff[] = [];
    
    try {
        const [score, buffs] = await Promise.all([
            fetchClanScoreValue(clan.id),
            fetchClanActiveBuffs(clan.id),
        ]);
        clanScore = score;
        activeBuffs = buffs;
    } catch (e) {
        console.warn('Failed to fetch clan score or buffs (using defaults):', e);
        clanScore = null;
        activeBuffs = [];
    }

    const totalScore = clanScore ?? calculatedScore;
    const crestUrl = (clan as any).crest_url;

    const fullClan: Clan = {
        id: clan.id,
        name: clan.name,
        notice: clan.notice || 'Welcome to the clan!',
        crest_url: crestUrl,
        vault_metric: totalScore,
        vault_coins: clan.vault_coins || 0,
        member_limit: clan.member_limit || 5,
        extra_member_slots_purchased: clan.extra_member_slots_purchased || 0,
        members,
        active_buffs: activeBuffs,
        clan_total_score: totalScore,
        leader_id: clan.leader_id,
    };
    
    return mockApiCall(fullClan);
};

export const clan_create = async (name: string, notice: string): Promise<Clan> => {
    const user = await getCurrentUser();
    const creationFee = 1000;
    
    // Parallelize initial checks for speed
    const [profileResult, membershipResult, usernameResult] = await Promise.all([
        supabase.from('users').select('coins').eq('id', user.id).single(),
        supabase.from('clan_members').select('clan_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('users').select('username').eq('id', user.id).single(),
    ]);
    
    const profile = profileResult.data;
    const existingMembership = membershipResult.data;
    const username = usernameResult.data?.username || 'Unknown';
    
    if (!profile || profile.coins < creationFee) {
        throw new Error('Not enough coins to create a clan.');
    }
    
    if (existingMembership) {
        throw new Error('You are already in a clan.');
    }
    
    // Deduct coins and create clan in parallel-ish flow
    await updateProfile(user.id, { coins: profile.coins - creationFee });
    
    // Create clan
    const { data: newClan, error: clanError } = await supabase
        .from('clans')
        .insert({
            name: name,
            notice: notice || 'Welcome to the clan!',
            vault_coins: 0,
            leader_id: user.id,
            member_count: 1,
        })
        .select()
        .single();
    
    if (clanError) {
        console.error('Clan creation error:', clanError);
        throw new Error(clanError.message || 'Failed to create clan.');
    }
    
    if (!newClan) {
        throw new Error('Failed to create clan - no data returned.');
    }
    
    // Add creator as leader (don't wait for activity log)
    const { error: memberError } = await supabase.from('clan_members').insert({
        clan_id: newClan.id,
        user_id: user.id,
        role: 'leader',
    });
    
    if (memberError) {
        console.error('Clan member creation error:', memberError);
        throw new Error('Failed to add you as clan leader.');
    }

    // Log activity in background (don't wait)
    void (async () => {
        try {
            await supabase.from('activities').insert({
                kind: 'clan_create',
                actor_id: user.id,
                actor_username: username,
                data: { details: newClan.name },
            });
        } catch (e) {
            console.warn('Failed to log clan_create activity:', e);
        }
    })();
    
    // Return immediate clan object without heavy clan_details() call
    // The UI will refresh the full details on next mount
    const immediateClan: Clan = {
        id: newClan.id,
        name: newClan.name,
        notice: newClan.notice || 'Welcome to the clan!',
        crest_url: undefined,
        vault_metric: 0,
        vault_coins: 0,
        member_limit: 5,
        extra_member_slots_purchased: 0,
        members: [{
            user_id: user.id,
            username: username,
            role: 'leader',
            contribution: 0,
            avatar_url: '',
            active_cosmetic_frame: null,
            active_cosmetic_theme: null,
            active_cosmetic_effect: null,
            custom_title: null,
            bio: null,
            total_score: 0,
            xp: 0,
            pvp_score: 0,
        }],
        active_buffs: [],
        clan_total_score: 0,
        leader_id: user.id,
    };
    
    return immediateClan;
};

export const clan_chat_recent = async (): Promise<ClanChatMessage[]> => {
    const user = await getCurrentUser();
    
    // Get user's clan
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        return mockApiCall([]);
    }
    
    // Fetch recent chat messages
    const { data: messages, error } = await supabase
        .from('clan_chat')
        .select(`
            id,
            message,
            created_at,
            user_id,
            users!inner (username)
        `)
        .eq('clan_id', membership.clan_id)
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (error) {
        console.error('Error fetching chat:', error);
        return mockApiCall([]);
    }
    
    const chatMessages: ClanChatMessage[] = (messages || []).map((m: any) => ({
        id: m.id,
        user: m.users.username,
        message: m.message,
        created_at: getTimeAgo(new Date(m.created_at)),
        is_self: m.user_id === user.id,
    })).reverse(); // Reverse to show oldest first
    
    return mockApiCall(chatMessages);
};

const toxicityFilter = (message: string): string => {
    const badWords = ['noob', 'hax', 'cheater'];
    let cleanMessage = message;
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleanMessage = cleanMessage.replace(regex, '▮▮▮▮');
    });
    return cleanMessage;
};

export const clan_chat_post = async (message: string): Promise<ClanChatMessage> => {
    const user = await getCurrentUser();
    const cleanMessage = toxicityFilter(message);
    
    // Get user's profile for username
    const { data: profile } = await supabase
        .from('users')
        .select('username')
        .eq('id', user.id)
        .single();
    
    if (!profile) {
        throw new Error('User profile not found.');
    }
    
    // Get user's clan
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        throw new Error('You are not in a clan.');
    }
    
    // Insert chat message with username directly
    const { data: newMessage, error } = await supabase
        .from('clan_chat')
        .insert({
            clan_id: membership.clan_id,
            user_id: user.id,
            username: profile.username,
            message: cleanMessage,
        })
        .select('*')
        .single();
    
    if (error) {
        console.error('Chat post error:', error);
        throw new Error(error.message || 'Failed to post message.');
    }
    
    if (!newMessage) {
        throw new Error('Failed to post message - no data returned.');
    }
    
    const chatMessage: ClanChatMessage = {
        id: newMessage.id,
        user: newMessage.username,
        message: newMessage.message,
        created_at: 'Just now',
        is_self: true,
    };
    
    return mockApiCall(chatMessage);
};

export const clan_get_available_buffs = async (): Promise<ClanBuffTemplate[]> => {
    try {
        // Add 2-second timeout to prevent long loading delays
        const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 2000)
        );
        
        const queryPromise = supabase
            .from('clan_buff_templates')
            .select('*')
            .order('cost', { ascending: true });

        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

        if (error) {
            // Log but don't crash - return mock data as fallback
            console.warn('Failed to load clan buff templates:', error.code, error.message);
            // If it's a table not found or RLS issue, silently return defaults
            return MOCK_AVAILABLE_BUFFS;
        }

        if (!data || !data.length) {
            // No templates in database - return defaults
            return MOCK_AVAILABLE_BUFFS;
        }

        return data.map(mapBuffTemplateRow);
    } catch (err) {
        console.warn('Exception loading clan buff templates (timeout or error), using defaults');
        return MOCK_AVAILABLE_BUFFS;
    }
};

export const clan_deposit_coins = async (amount: number): Promise<{ new_clan_vault: number; new_user_coins: number }> => {
    const user = await getCurrentUser();
    
    if (amount <= 0) {
        throw new Error('Invalid amount.');
    }
    
    // Get user's current coins and clan membership
    const { data: profile } = await supabase
        .from('users')
        .select('coins')
        .eq('id', user.id)
        .single();
    
    if (!profile || profile.coins < amount) {
        throw new Error('Insufficient funds.');
    }
    
    // Get user's clan
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        throw new Error('Not in a clan.');
    }
    
    // Get clan current vault
    const { data: clan } = await supabase
        .from('clans')
        .select('vault_coins')
        .eq('id', membership.clan_id)
        .single();
    
    if (!clan) {
        throw new Error('Clan not found.');
    }
    
    const newUserCoins = profile.coins - amount;
    const newClanVault = clan.vault_coins + amount;
    
    // Update user coins
    await supabase
        .from('users')
        .update({ coins: newUserCoins })
        .eq('id', user.id);
    
    // Update clan vault
    await supabase
        .from('clans')
        .update({ vault_coins: newClanVault })
        .eq('id', membership.clan_id);
    
    return mockApiCall({ new_clan_vault: newClanVault, new_user_coins: newUserCoins });
};

export const clan_buy_buff = async (buffCode: string): Promise<Clan> => {
    await getCurrentUser();

    const { data, error } = await supabase.rpc('rpc_purchase_clan_buff', {
        p_buff_code: buffCode,
    });

    if (error) {
        console.error('Failed to purchase clan buff:', error);
        throw new Error(error.message || 'Failed to buy buff.');
    }

    const result = getRpcSingleRow(data);
    if (!result?.success) {
        throw new Error(result?.error_message || 'Failed to buy buff.');
    }

    return await clan_details() as Clan;
};


export const clan_buy_member_slot = async (): Promise<Clan> => {
    await getCurrentUser();

    const { data, error } = await supabase.rpc('rpc_purchase_clan_member_slot');

    if (error) {
        console.error('Failed to purchase clan member slot:', error);
        throw new Error(error.message || 'Failed to buy member slot.');
    }

    const result = getRpcSingleRow(data);
    if (!result?.success) {
        throw new Error(result?.error_message || 'Failed to buy member slot.');
    }

    return await clan_details() as Clan;
};


export const clan_transfer_leadership = async (targetUserId: string): Promise<Clan> => {
    await getCurrentUser();

    const { data, error } = await supabase.rpc('rpc_transfer_clan_leadership', {
        p_target_user_id: targetUserId,
    });

    if (error) {
        console.error('Failed to transfer clan leadership:', error);
        throw new Error(error.message || 'Failed to transfer leadership.');
    }

    const result = getRpcSingleRow(data);
    if (!result?.success) {
        throw new Error(result?.error_message || 'Failed to transfer leadership.');
    }

    return await clan_details() as Clan;
};

export const clan_update_member_role = async (
    memberId: string,
    newRole?: ClanRole,
    customTitle?: string | null,
): Promise<Clan> => {
    await getCurrentUser();

    const { data, error } = await supabase.rpc('rpc_update_clan_member_role', {
        p_member_id: memberId,
        p_new_role: newRole ?? null,
        p_custom_title: customTitle ?? null,
    });

    if (error) {
        console.error('Failed to update clan member role/title:', error);
        throw new Error(error.message || 'Failed to update member.');
    }

    const result = getRpcSingleRow(data);
    if (!result?.success) {
        throw new Error(result?.error_message || 'Failed to update member.');
    }

    return await clan_details() as Clan;
};

export const clan_leave = async (): Promise<boolean> => {
    const user = await getCurrentUser();
    
    // Check if user is in a clan
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        throw new Error('You are not in a clan.');
    }
    
    // Leaders cannot leave, they must delete the clan or transfer leadership
    if (membership.role === 'leader') {
        throw new Error('Leaders cannot leave. Delete the clan or transfer leadership first.');
    }
    
    // Remove user from clan
    const { error } = await supabase
        .from('clan_members')
        .delete()
        .eq('user_id', user.id);
    
    if (error) {
        console.error('Failed to leave clan:', error);
        throw new Error('Failed to leave clan.');
    }
    
    return mockApiCall(true);
};

export const clan_delete = async (): Promise<boolean> => {
    const user = await getCurrentUser();
    
    // Get user's clan and verify they're the leader
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        throw new Error('You are not in a clan.');
    }
    
    if (membership.role !== 'leader') {
        throw new Error('Only the clan leader can delete the clan.');
    }
    
    // Delete the clan (cascade will delete members and chat)
    const { error } = await supabase
        .from('clans')
        .delete()
        .eq('id', membership.clan_id);
    
    if (error) {
        console.error('Failed to delete clan:', error);
        throw new Error('Failed to delete clan.');
    }
    
    return mockApiCall(true);
};

export const clan_promote_member = async (user_id: string): Promise<Clan> => {
    return clan_update_member_role(user_id, 'officer');
};

export const clan_demote_member = async (user_id: string): Promise<Clan> => {
    return clan_update_member_role(user_id, 'member');
};

export const clan_kick_member = async (user_id: string): Promise<Clan> => {
    const user = await getCurrentUser();
    
    // Get current user's clan and role
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        throw new Error('Not in a clan.');
    }
    
    if (!['leader', 'officer', 'moderator'].includes(membership.role)) {
        throw new Error('Only leaders, officers, and moderators can kick members.');
    }
    
    // Cannot kick the leader
    const { data: targetMember } = await supabase
        .from('clan_members')
        .select('role')
        .eq('user_id', user_id)
        .eq('clan_id', membership.clan_id)
        .single();
    
    if (targetMember?.role === 'leader') {
        throw new Error('Cannot kick the clan leader.');
    }
    
    // Remove the member
    const { error } = await supabase
        .from('clan_members')
        .delete()
        .eq('user_id', user_id)
        .eq('clan_id', membership.clan_id);
    
    if (error) {
        console.error('Failed to kick member:', error);
        throw new Error('Failed to kick member.');
    }
    
    return await clan_details() as Clan;
};

export const clan_update_notice = async (notice: string): Promise<Clan> => {
    const user = await getCurrentUser();
    const sanitized = (notice ?? '').trim();

    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .single();

    if (!membership) {
        throw new Error('You must be in a clan to edit its bio.');
    }

    if (!['leader', 'officer', 'moderator'].includes(membership.role)) {
        throw new Error('Only clan leadership can edit the clan bio.');
    }

    if (sanitized.length > 280) {
        throw new Error('Clan bio must be 280 characters or fewer.');
    }

    const { error } = await supabase
        .from('clans')
        .update({ notice: sanitized })
        .eq('id', membership.clan_id);

    if (error) {
        console.error('Failed to update clan bio:', error);
        throw new Error(error.message || 'Failed to update clan bio.');
    }

    return await clan_details() as Clan;
};

// ============================================
// Profile Avatar Management
// ============================================

const AVATAR_MAX_DIMENSION = 640;
const AVATAR_TARGET_SIZE_BYTES = 3.5 * 1024 * 1024; // ~3.5MB target after compression
const AVATAR_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const sanitizeAvatarExtension = (filename: string, fallback: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension) {
        return fallback;
    }
    return extension.replace(/[^a-z0-9]/gi, '') || fallback;
};

const stripExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) {
        return filename;
    }
    return filename.slice(0, lastDot);
};

const pickAvatarMime = (type: string): string => {
    if (AVATAR_ALLOWED_TYPES.includes(type)) {
        return type;
    }
    if (type === 'image/gif') {
        return 'image/png';
    }
    return 'image/jpeg';
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = (event) => {
            URL.revokeObjectURL(objectUrl);
            reject(event);
        };
        image.src = objectUrl;
    });
};

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Avatar compression failed.'));
            }
        }, mime, quality);
    });
};

const compressAvatarIfNeeded = async (file: File): Promise<File> => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return file;
    }

    if (!file.type.startsWith('image/')) {
        return file;
    }

    // Quick exit if already within target size and reasonable dimensions
    if (file.size <= AVATAR_TARGET_SIZE_BYTES) {
        return file;
    }

    let image: HTMLImageElement;
    try {
        image = await loadImageFromFile(file);
    } catch (error) {
        console.warn('Avatar compression skipped - unable to read image', error);
        return file;
    }

    const largestSide = Math.max(image.width, image.height) || 1;
    const scale = Math.min(1, AVATAR_MAX_DIMENSION / largestSide);

    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
        return file;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const preferredMime = pickAvatarMime(file.type);
    const qualitySteps = preferredMime === 'image/png'
        ? [1]
        : [0.92, 0.85, 0.75, 0.68, 0.6, 0.5];

    for (const quality of qualitySteps) {
        try {
            const blob = await canvasToBlob(canvas, preferredMime, quality);

            if (blob.size <= AVATAR_TARGET_SIZE_BYTES || quality === qualitySteps[qualitySteps.length - 1]) {
                const extension = sanitizeAvatarExtension(file.name, preferredMime.split('/')[1] ?? 'jpg');
                const optimizedFile = new File([blob], `${stripExtension(file.name)}.${extension}`, {
                    type: preferredMime,
                    lastModified: Date.now(),
                });
                return optimizedFile.size < file.size ? optimizedFile : file;
            }
        } catch (error) {
            console.warn('Avatar compression attempt failed', error);
            break;
        }
    }

    return file;
};

export const upload_avatar_file = async (file: File): Promise<string> => {
    const user = await getCurrentUser();
    const normalizedFile = await compressAvatarIfNeeded(file);

    const mimeType = pickAvatarMime(normalizedFile.type || file.type || 'image/png');
    const extension = sanitizeAvatarExtension(normalizedFile.name, mimeType.split('/')[1] ?? 'png');
    const uniqueSuffix = Math.random().toString(36).slice(2);
    const filePath = `${user.id}/${Date.now()}-${uniqueSuffix}.${extension}`;

    const { data, error } = await supabase.storage
        .from('avatars')
        .upload(filePath, normalizedFile, {
            cacheControl: '3600',
            upsert: true,
            contentType: mimeType,
        });

    if (error) {
        console.error('Avatar upload failed:', error);
        const rawMessage = (error.message || '').toLowerCase();
        let message: string;

        if (rawMessage.includes('payload too large')) {
            message = 'Avatar is still too large after optimization. Please try a smaller image.';
        } else if (rawMessage.includes('bucket') && rawMessage.includes('not') && rawMessage.includes('found')) {
            message = 'Avatar storage bucket is missing. An administrator needs to run CREATE_AVATARS_BUCKET.sql in Supabase.';
        } else {
            message = error.message || 'Failed to upload avatar. Please try again.';
        }

        throw new Error(message);
    }

    const {
        data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(data.path);

    return publicUrl;
};

export const update_avatar = async (avatar_url: string): Promise<Profile> => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('users')
        .update({ avatar_url })
        .eq('id', authData.user.id)
        .select()
        .single();

    if (error) throw error;
    return data as Profile;
};

export const update_username = async (newUsername: string): Promise<Profile> => {
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed.length < 2) throw new Error('Username must be at least 2 characters.');
    if (trimmed.length > 30) throw new Error('Username must be 30 characters or fewer.');
    if (!/^[a-zA-Z0-9_ .\-]+$/.test(trimmed)) throw new Error('Username can only contain letters, numbers, spaces, hyphens, underscores, and dots.');

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('users')
        .update({ username: trimmed })
        .eq('id', authData.user.id)
        .select()
        .single();

    if (error) {
        if (error.message?.includes('unique') || error.code === '23505') {
            throw new Error('That username is already taken. Please choose another.');
        }
        throw error;
    }
    return data as Profile;
};

/**
 * Upload a question image to Supabase storage
 */
export const upload_question_image = async (file: File): Promise<string> => {
    const user = await getCurrentUser();
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
        throw new Error('Invalid file type. Please upload a JPEG, PNG, GIF, SVG, or WebP image.');
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        throw new Error('Image is too large. Maximum size is 5MB.');
    }

    const extension = file.name.split('.').pop() || 'png';
    const uniqueSuffix = Math.random().toString(36).slice(2);
    const filePath = `questions/${user.id}/${Date.now()}-${uniqueSuffix}.${extension}`;

    const { data, error } = await supabase.storage
        .from('question-images')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
        });

    if (error) {
        console.error('Question image upload failed:', error);
        const rawMessage = (error.message || '').toLowerCase();
        let message: string;

        if (rawMessage.includes('payload too large')) {
            message = 'Image is too large. Please try a smaller image (max 5MB).';
        } else if (rawMessage.includes('bucket') && rawMessage.includes('not') && rawMessage.includes('found')) {
            message = 'Question images storage bucket is missing. An administrator needs to create the "question-images" bucket in Supabase Storage.';
        } else {
            message = error.message || 'Failed to upload image. Please try again.';
        }

        throw new Error(message);
    }

    const {
        data: { publicUrl },
    } = supabase.storage.from('question-images').getPublicUrl(data.path);

    return publicUrl;
};

// ============ ACHIEVEMENTS ============

export interface Achievement {
  id: string;
  name: string;
  description: string;
  condition_type: string;
  condition_value: number;
  reward_xp: number;
  reward_coins: number;
  icon: string;
  category?: string;
  rarity?: string;
  is_earned?: boolean;
  earned_at?: string;
  progress?: number; // Current progress towards achievement
}

export const achievements_list = async (): Promise<Achievement[]> => {
    const user = await getCurrentUser();

    // Get all achievements including category and rarity
    const { data: allAchievements, error: achError } = await supabase
        .from('achievements')
        .select('*')
        .order('condition_value', { ascending: true });

    if (achError) throw achError;

    // Get user's EARNED achievements (must have a timestamp to be considered earned)
    const { data: earnedAchievements, error: earnedError } = await supabase
        .from('user_achievements')
        .select('achievement_id, earned_at, unlocked_at, progress')
        .eq('user_id', user.id);

    if (earnedError) throw earnedError;

    // Only consider earned if there's an actual timestamp
    const earnedMap: Record<string, { earned_at: string | null; progress: number }> = {};
    (earnedAchievements || []).forEach((ua: any) => {
        const timestamp = ua.earned_at || ua.unlocked_at;
        // CRITICAL: Only mark as earned if timestamp exists
        if (timestamp) {
            earnedMap[ua.achievement_id] = {
                earned_at: timestamp,
                progress: ua.progress || 0
            };
        }
    });

    // Get user stats for progress calculation
    const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

    // PvP wins now stored directly in users table
    const pvpWinCount = profile?.pvp_wins || 0;

    const { data: questsCompleted } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', user.id)
        .eq('kind', 'quest_complete');

    const { data: itemsPurchased } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', user.id)
        .eq('kind', 'shop_purchase');

    const questCount = (questsCompleted as any)?.count || 0;
    const purchaseCount = (itemsPurchased as any)?.count || 0;

    // Calculate coins earned (current + spent)
    // Note: activities table uses 'data' JSONB column, not 'amount'
    const { data: purchases } = await supabase
        .from('activities')
        .select('data')
        .eq('actor_id', user.id)
        .eq('kind', 'shop_purchase');

    const coinsSpent = (purchases || []).reduce((sum: number, p: any) => sum + (p.data?.amount || p.data?.price || 0), 0);
    const coinsEarned = (profile?.coins || 0) + coinsSpent;

    // Count assignments (with error handling for RLS issues)
    let assignmentsCompleted = 0;
    let perfectScores = 0;
    
    try {
        const { data: assignmentResults, error: assignmentError } = await supabase
            .from('student_assignment_results')
            .select('id, accuracy, completed_at', { count: 'exact', head: false })
            .eq('student_id', user.id);

        if (!assignmentError && assignmentResults) {
            assignmentsCompleted = assignmentResults.length;
            perfectScores = assignmentResults.filter((r: any) => r.accuracy === 100).length;
        }
    } catch (err) {
        console.warn('Could not fetch assignment results for achievements:', err);
        // Continue with 0 assignments - not critical for achievement display
    }

    // Map achievements with earned status and progress
    return (allAchievements || []).map((ach: any) => {
        const earnedData = earnedMap[ach.id];
        const is_earned = !!earnedData;
        let progress = is_earned ? (earnedData?.progress || ach.condition_value) : 0;

        if (!is_earned && ach.condition_type && ach.condition_value) {
            switch (ach.condition_type) {
                // PvP - use actual count
                case 'pvp_wins':
                case 'pvp_wins_count':
                    progress = pvpWinCount;
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
                    progress = profile?.coins || 0;
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
                    progress = profile?.clan_id ? 1 : 0;
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
                    progress = profile?.correct_answers || 0;
                    break;
                // Login
                case 'login_count':
                    progress = 1;
                    break;
                default:
                    progress = 0;
            }
        }

        return {
            ...ach,
            category: ach.category || 'general',
            rarity: ach.rarity || 'common',
            is_earned,
            earned_at: earnedData?.earned_at || null,
            progress: Math.min(progress, ach.condition_value || 0),
        };
    });
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
            is_public: questionData.is_public || false
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
        .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
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

    return data || [];
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
    const resolvedSubjectId = updates.subject ? resolveSubjectIdentifier(updates.subject, updates.subject_id) : updates.subject_id;
    const shouldNormalizeTopic =
        Object.prototype.hasOwnProperty.call(updates, 'topic') || Object.prototype.hasOwnProperty.call(updates, 'topic_name');
    const normalizedTopic = shouldNormalizeTopic ? normalizeTopicName(updates.topic, updates.topic_name) : undefined;

    // Max XP limit for teacher questions
    const MAX_XP = 30;

    const payload: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
    };

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
        .select()
        .single();

    if (error) throw error;

    return data as TeacherQuestion;
};

/**
 * Delete a question
 */
export const delete_question = async (questionId: string): Promise<void> => {
    const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', questionId);

    if (error) throw error;
};

/**
 * Get public questions (for students to browse)
 */
export const get_public_questions = async (subject?: string, difficulty?: string): Promise<TeacherQuestion[]> => {
    let query = supabase
        .from('questions')
        .select('*')
        .eq('is_public', true)
        .eq('is_active', true);

    if (subject) query = query.eq('subject', subject);
    if (difficulty) query = query.eq('difficulty', difficulty);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
};

/**
 * Get student's progress on public questions for a specific subject
 * Returns count of unique questions answered out of total available
 */
export const get_subject_question_progress = async (subject: string): Promise<{ answeredCount: number; totalCount: number }> => {
    try {
        const user = await getCurrentUser();
        
        // Get all public questions for this subject
        const { data: questions, error: questionsError } = await supabase
            .from('questions')
            .select('id')
            .eq('subject', subject)
            .eq('is_public', true)
            .eq('is_active', true);
        
        if (questionsError) {
            console.error('Error fetching questions for progress:', questionsError);
            return { answeredCount: 0, totalCount: 0 };
        }
        
        const questionIds = (questions || []).map(q => q.id);
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

    const result = data as QuestionAttemptResult;
    const xpDelta = Math.max(0, result.points_earned || 0);
    const coinDelta = result.is_correct ? Math.trunc(xpDelta / 2) : 0;

    if (xpDelta > 0 || coinDelta > 0) {
        const rewardResult = await applyRewardDelta({
            xpDelta,
            coinsDelta: coinDelta,
            gemstonesDelta: 0,
            applyLevelMilestone: true,
        });

        result.final_profile_values = {
            xp: rewardResult.profile.xp,
            coins: rewardResult.profile.coins,
            level: rewardResult.profile.level,
            gemstones: rewardResult.profile.gemstones,
            xp_status: rewardResult.xpStatus ?? undefined,
        };
    }

    return result;
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
        p_title: payload.title ?? null,
        p_instructions: payload.instructions ?? null,
        p_difficulty: payload.difficulty ?? null,
        p_assignment_mode: mode,
        p_student_ids: payload.student_ids ?? null,
    });

    if (error) throw new Error(error.message || 'Failed to create assignment');

    const assignment = (Array.isArray(data) ? data[0] : data) as TeacherAssignmentSummary | undefined;
    if (!assignment) {
        throw new Error('Assignment could not be created');
    }
    return assignment;
};

export const get_teacher_assignments = async (): Promise<TeacherAssignmentSummary[]> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const { data, error } = await rpcGetAssignmentsForTeacher({ p_teacher_id: teacher.id });
    if (error) throw new Error(error.message || 'Failed to load assignments');

    return (data as TeacherAssignmentSummary[]) || [];
};

export const get_students_for_assignment = async (): Promise<StudentForAssignment[]> => {
    const teacher = await get_teacher_profile();
    if (!teacher) throw new Error('User is not a teacher');

    const { data, error } = await rpcGetStudentsForAssignment({ p_teacher_id: teacher.id });
    
    if (error) {
        console.error('RPC error getting students:', error);
        throw new Error(error.message || 'Failed to load students');
    }

    const result = (data as StudentForAssignment[]) || [];
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

export const submit_assignment_result = async (payload: AssignmentResultInput): Promise<void> => {
    const { error } = await rpcSubmitAssignmentResult({
        p_assignment_id: payload.assignmentId,
        p_correct: payload.correct,
        p_incorrect: payload.incorrect,
        p_accuracy: payload.accuracy,
        p_score: payload.score,
        p_time_taken: payload.timeTakenSeconds,
    });

    if (error) throw new Error(error.message || 'Failed to submit assignment');
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

        // Call the edge function
        const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze_assignment_answers`,
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
