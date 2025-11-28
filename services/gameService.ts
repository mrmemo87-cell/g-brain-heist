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
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addPlayerToSharedList, addActivityEvent, getActivityFeed, getTaskProgress, incrementQuestCompleted, incrementPvPWin, incrementWeeklyTaskCompleted, getPurchaseCount, incrementPurchaseCount, canEarnQuestGemstone, recordQuestGemstoneAward, canEarnPvpGemstone, recordPvpGemstoneAward } from './storageService';
import { supabase } from './supabaseClient';
import { fetchNeonFrameOwners, fetchFlickerThemeOwners, fetchGlitchEffectOwners } from './cosmeticService';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './banMessage';
import { notificationService } from './notificationService';
import {
    regenerateUserAp,
    notifyApFull,
    notifyLevelUp,
    performHackAttempt,
    notifyAttackIncoming,
    notifyCoinsLost,
    notifyRevengeAvailable,
    notifyAttackDefended,
    checkAchievements as rpcCheckAchievements,
    createTeacherProfile as rpcCreateTeacherProfile,
    recordQuestionAttempt,
    createAssignment as rpcCreateAssignment,
    getAssignmentsForTeacher as rpcGetAssignmentsForTeacher,
    getStudentsForAssignment as rpcGetStudentsForAssignment,
    getStudentActiveAssignment as rpcGetStudentActiveAssignment,
    submitAssignmentResult as rpcSubmitAssignmentResult,
    teacherAssignmentReport as rpcTeacherAssignmentReport
} from './rpcGateway';

const MOCK_DELAY = 500;

const QUEST_STREAK_TARGET = 5;
const QUEST_GEMSTONE_REWARD = 1;
const QUEST_GEMSTONE_DAILY_CAP = 2;
const LEVEL_MILESTONE_INTERVAL = 5;
const LEVEL_MILESTONE_GEMSTONE_REWARD = 1;
const PVP_GEMSTONE_REWARD = 1;
const PVP_GEMSTONE_DAILY_CAP = 1;

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
): string[] => {
    if (Array.isArray(rawOptions)) {
        return rawOptions.map((value) => (value == null ? '' : String(value)));
    }

    if (typeof rawOptions === 'string') {
        try {
            const parsed = JSON.parse(rawOptions);
            if (Array.isArray(parsed)) {
                return parsed.map((value) => (value == null ? '' : String(value)));
            }
        } catch (error) {
            // Ignore JSON parse failures and fall back to defaults
        }
    }

    if (rawOptions && typeof rawOptions === 'object') {
        const values = Object.values(rawOptions as Record<string, unknown>)
            .map((value) => (value == null ? '' : String(value)));
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

// Helper to get current authenticated user
const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user;
};

// Helper to update profile fields
const updateProfile = async (userId: string, updates: Partial<Profile>) => {
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId);
  
  if (error) throw error;
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
let currentQuestAnswers = 0; // Track answers in current quest session

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

export const whoami = async (): Promise<Profile> => {
  // Get current authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
    if (authError || !user) {
    throw new Error('Not authenticated');
  }

  // Fetch profile from database
  let { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

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
        profile.grade = (parsedGrade === 8 || parsedGrade === 9) ? parsedGrade : null;
  }

    profile.is_admin = typeof profile.is_admin === 'boolean'
        ? profile.is_admin
        : profile.role === 'admin';

    profile.is_banned = banned;
    profile.total_score = calculateTotalScore(profile.xp ?? 0, profile.pvp_score ?? 0);

  // ====== AP REGENERATION LOGIC ======
  // Call database function to regenerate AP
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
    // restrictions or table issues). This keeps clan info visible on the dashboard.
    if ((!resolvedMembership || !resolvedMembership.clan_id) && membershipError) {
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

    profile.total_score = calculateTotalScore(profile.xp ?? 0, profile.pvp_score ?? 0);

    return profile;
};

export const tasks_list = (): Promise<Task[]> => {
  const progress = getTaskProgress();
  
  // Get claimed tasks for today from localStorage
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
  const dayOfWeek = now.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const weeklyExpiry = daysUntilSunday === 1 ? '1d' : `${daysUntilSunday}d`;
  
  const tasks: Task[] = [
    {
      id: 'task_d1',
      title: 'Complete 3 Knowledge Quests',
      kind: 'daily',
      progress: progress.daily_quests_completed,
      target: 3,
      reward_preview: '175 XP, 350 Coins, +1 Gemstone',
      expires_at: dailyExpiry,
      claimed: claimedTasks.includes('task_d1'),
      reward: { xp: 175, coins: 350, gemstones: 1 },
    },
    {
      id: 'task_d2',
      title: 'Win a PvP Hack',
      kind: 'daily',
      progress: progress.daily_pvp_wins,
      target: 1,
      reward_preview: '100 XP, 50 Coins, +1 Gemstone',
      expires_at: dailyExpiry,
      claimed: claimedTasks.includes('task_d2'),
      reward: { xp: 100, coins: 50, gemstones: 1 },
    },
    {
      id: 'task_w1',
      title: 'Complete 15 Daily Tasks this week',
      kind: 'weekly',
      progress: progress.weekly_tasks_completed,
      target: 15,
      reward_preview: '500 XP, 400 Coins, +1 Item Crate, +5 Gemstones',
      expires_at: weeklyExpiry,
      claimed: claimedTasks.includes('task_w1'),
      reward: { xp: 500, coins: 400, gemstones: 5, items: ['mystery_crate'] },
    },
  ];
  return mockApiCall(tasks);
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
  
  // Grant rewards to user
  const { data: profile } = await supabase
    .from('users')
    .select('xp, coins, gemstones')
    .eq('id', user.id)
    .single();

  if (!profile) throw new Error('Profile not found');

  const gemstonesEarned = task.reward.gemstones || 0;

  await updateProfile(user.id, {
    xp: profile.xp + task.reward.xp,
    coins: profile.coins + task.reward.coins,
    gemstones: (profile.gemstones || 0) + gemstonesEarned,
  });
  
  // Mark as claimed in localStorage
  const today = new Date().toISOString().split('T')[0];
  const claimedKey = `task_claims_${today}`;
  const claimedTasks = JSON.parse(localStorage.getItem(claimedKey) || '[]') as string[];
  claimedTasks.push(task_id);
  localStorage.setItem(claimedKey, JSON.stringify(claimedTasks));
  
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

    // Fetch activities from database, excluding teacher activities
    const { data: activities, error } = await supabase
        .from('activities')
        .select(`
      *,
      users!activities_actor_id_fkey (role)
    `)
        .order('created_at', { ascending: false })
        .limit(30); // Fetch more to account for filtered teachers

    if (error) {
        console.error('Error fetching activities:', error);
    }

    const studentActivities = (activities || [])
        .filter((a: any) => !a.users || a.users.role !== 'teacher')
        .slice(0, 20);

    const activityIds = studentActivities.map(a => a.id);

    const { data: reactionsData } = activityIds.length
        ? await supabase
            .from('activity_reactions')
            .select('activity_id, emoji, user_id')
            .in('activity_id', activityIds)
        : { data: [] };

    const reactionsByActivity: Record<string, { reactions: Record<string, number>; myReaction: string | null }> = {};

    studentActivities.forEach(activity => {
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

    const dbEvents: TimedNewsEvent[] = studentActivities.map(activity => {
        const createdAt = new Date(activity.created_at);
        const timeAgo = getTimeAgo(createdAt);
        const activityReactions = reactionsByActivity[activity.id];

        return {
            id: activity.id,
            kind: activity.kind,
            actor: activity.actor_username || 'Unknown',
            target: activity.target_username,
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
        points: q.points,
        times_answered: q.times_answered,
        times_correct: q.times_correct,
        subject: q.subject,
    }));
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
    
    // Fetch all users (no cooldown filter - will disable attack button instead)
    const { data: players, error } = await supabase
        .from('users')
        .select(`
            id, username, level, coins, batch, avatar_url, last_seen, attack_power, defense_power, last_attacked_at, xp,
            clan_members!left (
                clan_id,
                clans!inner (name)
            )
        `)
        .neq('id', user.id)
        .neq('role', 'teacher')
        .neq('role', 'admin')
        .limit(100); // Increased limit to show more targets
    
    if (error) throw error;
    
    const playerList = players || [];
    const playerIds = playerList.map((p: any) => p.id);
    
    // Check inventory for shields for all targets
    const { data: shieldData } = await supabase
      .from('inventory')
      .select('user_id')
      .in('user_id', playerIds)
      .eq('kind', 'shield')
      .eq('state', 'unused');
    const playersWithShields = new Set((shieldData || []).map((s: any) => s.user_id));
    
    const neonOwners = await fetchNeonFrameOwners(playerIds);
    const flickerOwners = await fetchFlickerThemeOwners(playerList.map((p: any) => p.id));
    const glitchOwners = await fetchGlitchEffectOwners(playerList.map((p: any) => p.id));

    const realTargets: RaidTarget[] = playerList.map((p: any) => {
        // Extract clan info if user is in a clan
        const clanName = p.clan_members?.[0]?.clans?.name || undefined;
        const clanId = p.clan_members?.[0]?.clan_id || undefined;
        
        // Check if this player has an active shield
        const targetHasShield = playersWithShields.has(p.id);
        
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
            clan_name: clanName,
            clan_id: clanId,
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

export const raid_attack = async (defender_id: string, use_cracker: boolean, target: RaidTarget): Promise<RaidAttackResult> => {
    const user = await getCurrentUser();
    const AP_COST = 2;

    const { data: attackerProfile, error: attackerError } = await supabase
        .from('users')
        .select('ap_now, ap_max, last_ap_update')
        .eq('id', user.id)
        .single();

    if (attackerError || !attackerProfile) {
        throw new Error(attackerError?.message ?? 'Unable to verify Action Points before attack.');
    }

    const currentAp = attackerProfile.ap_now ?? 0;
    if (currentAp < AP_COST) {
        throw new Error('Not enough Action Points to launch a raid.');
    }

    const updatedAp = Math.max(0, currentAp - AP_COST);
    await updateProfile(user.id, {
        ap_now: updatedAp,
        last_ap_update: new Date().toISOString(),
    });

    const simulateBotRaid = (botId: string) => {
        const bots = refreshKyrgyzBotStates();
        const botIndex = bots.findIndex(bot => bot.id === botId);
        if (botIndex === -1) {
            throw new Error('Raid target is no longer available.');
        }

        const bot = bots[botIndex];
        const persona = KYRGYZ_PERSONA_LOOKUP.get(bot.personaId);
        const hadShield = target?.has_shield ?? false;
        const shieldBlocks = hadShield && !use_cracker && Math.random() < 0.8;
        const baseWinChance = clampNumber(target?.est_win_rate ?? getBotWinChance(bot), [0.2, 0.9]);
        const effectiveWinChance = hadShield && !use_cracker ? baseWinChance * 0.85 : baseWinChance;
        const roll = Math.random();

        let result: RaidAttackResult['result'];
        let attackerCoins = 0;
        let defenderCoinsLoss = 0;
        let attackerXp = 0;
        let summary = '';
        let shield_state: RaidAttackResult['shield_state'] = hadShield ? 'removed' : 'none';

        if (shieldBlocks) {
            result = 'blocked';
            attackerCoins = 0;
            defenderCoinsLoss = 0;
            attackerXp = -10;
            summary = 'Attack blocked by Shield';
            shield_state = 'remaining';
            bot.pvp_wins += 1;
        } else if (roll < effectiveWinChance) {
            result = 'win';
            const coinsStolen = Math.min(bot.coins, randomIntInRange([110, 240]));
            attackerCoins = coinsStolen;
            defenderCoinsLoss = coinsStolen;
            attackerXp = randomIntInRange([60, 140]);
            bot.coins = Math.max(0, bot.coins - coinsStolen);
            bot.xp = Math.max(bot.xp - randomIntInRange([15, 30]), approximateXpForLevel(bot.level));
            summary = `Stole ${coinsStolen} Coins`;
        } else {
            result = 'lose';
            const coinsLost = randomIntInRange([40, 110]);
            attackerCoins = -coinsLost;
            defenderCoinsLoss = -coinsLost;
            attackerXp = -randomIntInRange([20, 35]);
            if (persona) {
                bot.coins = clampNumber(bot.coins + coinsLost, persona.coinsRange);
            } else {
                bot.coins += coinsLost;
            }
            bot.pvp_wins += 1;
            summary = `Defended and gained ${coinsLost} Coins`;
        }

        bot.last_seen = nowIso();
        bot.lastRaidAt = nowIso();
        const normalizedBot = clampBotStateToPersona(bot);
        bots[botIndex] = normalizedBot;
        saveKyrgyzBotStates(bots);

        return {
            response: {
                result,
                attacker_deltas: {
                    xp: attackerXp,
                    coins: attackerCoins,
                },
                defender_deltas: {
                    coins_loss: defenderCoinsLoss,
                },
                shield_state,
            },
            summary,
            botUsername: normalizedBot.username,
        };
    };

    const isBotTarget = target?.user_id?.startsWith('bot_') ?? defender_id.startsWith('bot_');
    let botSimulation: ReturnType<typeof simulateBotRaid> | null = null;
    let response: RaidAttackResult;

    if (isBotTarget) {
        if (!target?.user_id) {
            throw new Error('Raid target is no longer available.');
        }
        botSimulation = simulateBotRaid(target.user_id);
        response = botSimulation.response;
    } else {
        const { data, error } = await performHackAttempt(defender_id);

        if (error) {
            throw new Error(error.message || 'Failed to execute raid attack.');
        }

        if (!data) {
            throw new Error('Hack attempt returned no data.');
        }

        const payload = data as any;

        response = {
            result: (payload.result ?? 'lose') as RaidAttackResult['result'],
            attacker_deltas: {
                xp: payload.attacker_deltas?.xp ?? 0,
                coins: payload.attacker_deltas?.coins ?? 0,
                gemstones: payload.attacker_deltas?.gemstones ?? 0,
            },
            defender_deltas: {
                coins_loss: payload.defender_deltas?.coins_loss ?? 0,
            },
            shield_state: (payload.shield_state ?? 'none') as RaidAttackResult['shield_state'],
        };

        // Surface Supabase combat stats in debug logs to aid balancing
        if (payload.combat_stats) {
            console.debug('PvP combat stats', payload.combat_stats);
        }
    }

    let gemstoneReward = 0;

    // Track progress (localStorage for now)
    if (response.result === 'win') {
        incrementPvPWin();
        
        // Update PvP score in database (affects clan competition)
        await updatePvPScore(user.id, true);
        
        const progress = getTaskProgress();
        if (progress.daily_pvp_wins === 1 && canEarnPvpGemstone(PVP_GEMSTONE_DAILY_CAP)) {
            gemstoneReward += PVP_GEMSTONE_REWARD;
            recordPvpGemstoneAward(PVP_GEMSTONE_REWARD);
        }
        if (progress.daily_pvp_wins === 1) {
            incrementWeeklyTaskCompleted();
        }
    } else {
        // Also track losses for PvP score (less points but still progression)
        await updatePvPScore(user.id, false);
    }

    if (gemstoneReward > 0) {
        const { data: gemProfile } = await supabase
            .from('users')
            .select('gemstones')
            .eq('id', user.id)
            .single();

        const currentGemstones = gemProfile?.gemstones || 0;
        await updateProfile(user.id, { gemstones: currentGemstones + gemstoneReward });

        try {
            const { notificationService } = await import('./notificationService');
            await notificationService.createNotification(
                user.id,
                'gemstone_earned',
                '💎 Gemstone Earned!',
                `You recovered ${gemstoneReward} gemstone${gemstoneReward > 1 ? 's' : ''} from the heist!`,
                'high'
            );
        } catch (notifError) {
            console.error('Failed to send gemstone notification:', notifError);
        }
    }

    response.attacker_deltas = {
        ...response.attacker_deltas,
        gemstones: (response.attacker_deltas?.gemstones ?? 0) + gemstoneReward,
    };

    // ====== NOTIFICATION TRIGGERS ======
    try {
        // Get attacker profile for username
        const { data: attackerProfile } = await supabase
            .from('users')
            .select('username, level')
            .eq('id', user.id)
            .single();

        const attackerUsername = attackerProfile?.username || 'Unknown';
        const attackerLevel = attackerProfile?.level || 1;
        const attackPower = attackerLevel * 10; // Estimate attack power

        if (isBotTarget && botSimulation) {
            const feedKind = response.result === 'win'
                ? 'pvp_win'
                : response.result === 'blocked'
                    ? 'pvp_blocked'
                    : 'pvp_loss';

            addActivityEvent({
                kind: feedKind,
                actor: attackerUsername,
                target: botSimulation.botUsername,
                data: { details: botSimulation.summary },
                created_at: nowIso(),
            });
        } else if (!isBotTarget) {
            if (response.result === 'win') {
                // Notify defender they're under attack
                await notifyAttackIncoming({
                    target_user_id: defender_id,
                    attacker_username: attackerUsername,
                    attacker_power: attackPower
                });

                // If significant coins stolen, notify about coin loss
                const coinsStolen = response.defender_deltas?.coins_loss || 0;
                if (coinsStolen > 50) {
                    await notifyCoinsLost({
                        user_id_param: defender_id,
                        attacker_username: attackerUsername,
                        coins_lost: coinsStolen
                    });
                }

                // Offer revenge to defender
                await notifyRevengeAvailable({
                    user_id_param: defender_id,
                    target_username: attackerUsername,
                    target_user_id: user.id
                });
            } else if (response.result === 'lose' || response.result === 'blocked') {
                // Defender successfully defended
                const coinsLost = response.defender_deltas?.coins_loss || 0;
                await notifyAttackDefended({
                    user_id_param: defender_id,
                    attacker_username: attackerUsername,
                    coins_kept: Math.max(0, -coinsLost) // Negative loss means they kept coins
                });
            }
        }
    } catch (notifError) {
        // Don't fail the attack if notifications fail
        console.error('Failed to handle attack notifications:', notifError);
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
    // Fetch clans with member XP sum
    const { data: clans, error } = await supabase
        .from('clans')
        .select(`
            id,
            name,
            notice,
            member_count,
            vault_coins,
            clan_members!inner (
                users!inner (xp, pvp_score)
            )
        `);
    
    if (error) {
        console.error('Error fetching clans:', error);
        return mockApiCall([]);
    }
    
    // Calculate total XP from all members
    const mappedClans = (clans || []).map((clan: any) => {
        const totalScore = clan.clan_members?.reduce((sum: number, member: any) => {
            const xp = member.users?.xp || 0;
            const pvp = member.users?.pvp_score || 0;
            return sum + calculateTotalScore(xp, pvp);
        }, 0) || 0;
        
        // Get actual member count from array length
        const actualMemberCount = clan.clan_members?.length || 0;
        
        return {
            id: clan.id,
            name: clan.name,
            notice: clan.notice,
            member_count: actualMemberCount,
            vault_metric: totalScore,
            vault_coins: clan.vault_coins,
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
    created_at: row.created_at,
    approver_id: row.approved_by ?? null,
    clan_name: row.clans?.name ?? row.clan_name,
    username: row.users?.username ?? row.username,
    avatar_url: row.users?.avatar_url ?? row.avatar_url,
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

    const { data, error } = await supabase
        .from('clan_join_requests')
        .select('id, clan_id, user_id, status, created_at, users!clan_join_requests_user_id_fkey(username, avatar_url), clans(name)')
        .eq('clan_id', membership.clan_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Failed to fetch join requests:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        // If table doesn't exist (404), return empty array instead of throwing
        if (error.code === 'PGRST116' || error.message?.includes('404') || error.message?.includes('not found')) {
            console.warn('clan_join_requests table may not exist. Please run the migration SQL: FIX_CLAN_JOIN_REQUESTS_RLS.sql');
            return mockApiCall([]);
        }
        throw new Error('Unable to load join requests.');
    }

    console.log('Successfully fetched join requests:', data?.length || 0);
    return mockApiCall((data || []).map(mapJoinRequest));
};

export const clan_approve_join_request = async (requestId: string): Promise<Clan> => {
    const user = await getCurrentUser();
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!membership || !['leader', 'moderator'].includes(membership.role)) {
        throw new Error('Only leaders or moderators can approve requests.');
    }

    const { data: request, error: requestError } = await supabase
        .from('clan_join_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (requestError) {
        console.error('Error fetching request:', requestError);
        if (requestError.message?.includes('404') || requestError.code === 'PGRST116') {
            throw new Error('clan_join_requests table not found. Please run the migration SQL.');
        }
        throw new Error('Join request not found.');
    }

    if (!request) {
        throw new Error('Join request not found.');
    }

    if (request.clan_id !== membership.clan_id) {
        throw new Error('Cannot approve a request for another clan.');
    }

    if (request.status !== 'pending') {
        throw new Error('Request has already been processed.');
    }

    const { data: existingMembership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', request.user_id)
        .maybeSingle();

    if (existingMembership) {
        throw new Error('User is already in a clan.');
    }

    const { error: insertError } = await supabase.from('clan_members').insert({
        clan_id: request.clan_id,
        user_id: request.user_id,
        role: 'member',
    });

    if (insertError) {
        console.error('Failed to add member from request:', insertError);
        throw new Error('Failed to approve request.');
    }

    const { error: updateError } = await supabase
        .from('clan_join_requests')
        .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
        .eq('id', requestId);

    if (updateError) {
        console.error('Failed to finalize request approval:', updateError);
        throw new Error('Failed to finalize approval.');
    }

    try {
        const updatedClan = await clan_details();
        if (!updatedClan) {
            console.warn('clan_details returned null after approval, creating minimal response');
            return { id: request.clan_id } as Clan;
        }
        return updatedClan;
    } catch (error) {
        console.error('Error fetching updated clan after approval:', error);
        // Return a minimal clan object if clan_details fails
        return { id: request.clan_id } as Clan;
    }
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

    const { error } = await supabase
        .from('clan_join_requests')
        .update({ status: 'rejected', approved_by: user.id, approved_at: new Date().toISOString() })
        .eq('id', requestId);

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
    
    // Fetch current user profile
    const { data: profile } = await supabase
        .from('users')
        .select('coins')
        .eq('id', user.id)
        .single();
    
    if (!profile || profile.coins < creationFee) {
        throw new Error('Not enough coins to create a clan.');
    }
    
    // Check if user is already in a clan
    const { data: existingMembership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .single();
    
    if (existingMembership) {
        throw new Error('You are already in a clan.');
    }
    
    // Deduct coins
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
    
    // Add creator as leader
    const { error: memberError } = await supabase.from('clan_members').insert({
        clan_id: newClan.id,
        user_id: user.id,
        role: 'leader',
    });
    
    if (memberError) {
        console.error('Clan member creation error:', memberError);
        throw new Error('Failed to add you as clan leader.');
    }

    // Log a clan creation activity to the feed so other users see it.
    try {
        const { data: creator } = await supabase.from('users').select('username').eq('id', user.id).single();
        await supabase.from('activities').insert({
            kind: 'clan_create',
            actor_id: user.id,
            actor_username: creator?.username || 'Unknown',
            data: { details: newClan.name },
        });
    } catch (e) {
        console.warn('Failed to log clan_create activity:', e);
    }
    
    // Return full clan details
    const clanDetails = await clan_details();
    if (!clanDetails) {
        throw new Error('Clan created but details could not be retrieved.');
    }
    return clanDetails;
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
    const { data, error } = await supabase
        .from('clan_buff_templates')
        .select('*')
        .order('cost', { ascending: true });

    if (error) {
        console.warn('Failed to load clan buff templates, using defaults:', error.message);
        return mockApiCall(MOCK_AVAILABLE_BUFFS);
    }

    if (!data || !data.length) {
        return mockApiCall(MOCK_AVAILABLE_BUFFS);
    }

    return data.map(mapBuffTemplateRow);
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
  is_earned?: boolean;
  earned_at?: string;
  progress?: number; // Current progress towards achievement
}

export const achievements_list = async (): Promise<Achievement[]> => {
    const user = await getCurrentUser();

    // Get all achievements
    const { data: allAchievements, error: achError } = await supabase
        .from('achievements')
        .select('*')
        .order('condition_value', { ascending: true });

    if (achError) throw achError;

    // Get user's earned achievements
    // Select either earned_at or unlocked_at depending on which column exists
    const { data: earnedAchievements, error: earnedError } = await supabase
        .from('user_achievements')
        .select('achievement_id, COALESCE(earned_at, unlocked_at) as earned_at')
        .eq('user_id', user.id);

    if (earnedError) throw earnedError;

    const earnedMap: Record<string, string> = {};
    (earnedAchievements || []).forEach((ua: any) => {
        // some migrations used `unlocked_at` instead of `earned_at`, coalesced above
        earnedMap[ua.achievement_id] = ua.earned_at || ua.unlocked_at || null;
    });

    // Get user stats for progress calculation
    const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

    const { data: pvpWins } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', user.id)
        .eq('kind', 'pvp_win');

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

    const pvpWinCount = (pvpWins as any)?.count || 0;
    const questCount = (questsCompleted as any)?.count || 0;
    const purchaseCount = (itemsPurchased as any)?.count || 0;

    // Calculate coins earned (current + spent)
    const { data: purchases } = await supabase
        .from('activities')
        .select('amount')
        .eq('actor_id', user.id)
        .eq('kind', 'shop_purchase');

    const coinsSpent = (purchases || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const coinsEarned = (profile?.coins || 0) + coinsSpent;

    // Map achievements with earned status and progress
    return (allAchievements || []).map((ach: any) => {
        const is_earned = !!earnedMap[ach.id];
        let progress = 0;

        if (!is_earned) {
            switch (ach.condition_type) {
                case 'pvp_wins_count':
                    progress = pvpWinCount;
                    break;
                case 'total_xp':
                    progress = profile?.xp || 0;
                    break;
                case 'quests_completed':
                    progress = questCount;
                    break;
                case 'coins_earned':
                    progress = coinsEarned;
                    break;
                case 'items_purchased':
                    progress = purchaseCount;
                    break;
                case 'clan_member':
                    progress = profile?.clan_id ? 1 : 0;
                    break;
            }
        }

        return {
            ...ach,
            is_earned,
            earned_at: earnedMap[ach.id],
            progress: Math.min(progress, ach.condition_value),
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

    // ====== NOTIFICATION: ACHIEVEMENT EARNED ======
    if (newlyEarned.length > 0) {
        try {
            // Send notification for each new achievement
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
            question_type: questionData.question_type,
            options: questionData.options,
            correct_answer: questionData.correct_answer,
            explanation: questionData.explanation,
            hints: questionData.hints,
            time_limit: questionData.time_limit || 30,
            points: questionData.points || 10,
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

    const payload: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
    };

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

    if (error) throw error;

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
    const { data, error } = await rpcGetStudentActiveAssignment();
    if (error) throw new Error(error.message || 'Failed to load assignment');

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const parsedRow = row as StudentAssignmentTask;
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

type QuestProgressOutcome = {
    gemstoneDelta: number;
    notifications: Promise<unknown>[];
};

const applyQuestProgress = (userId: string, isCorrect: boolean): QuestProgressOutcome => {
    const notifications: Promise<unknown>[] = [];

    if (!isCorrect) {
        currentQuestAnswers = 0;
        return { gemstoneDelta: 0, notifications };
    }

    currentQuestAnswers += 1;
    if (currentQuestAnswers < QUEST_STREAK_TARGET) {
        return { gemstoneDelta: 0, notifications };
    }

    currentQuestAnswers = 0;
    incrementQuestCompleted();

    const progress = getTaskProgress();
    const questsCompletedToday = progress.daily_quests_completed;

    notifications.push(
        notificationService.createNotification(
            userId,
            'quest_completed',
            '✅ Quest Complete!',
            'You completed a knowledge quest! Keep learning to earn more rewards.',
            'high'
        )
    );

    let gemstoneDelta = 0;

    if ((questsCompletedToday === 1 || questsCompletedToday === 3) && canEarnQuestGemstone(QUEST_GEMSTONE_DAILY_CAP)) {
        gemstoneDelta += QUEST_GEMSTONE_REWARD;
        recordQuestGemstoneAward(QUEST_GEMSTONE_REWARD);
    }

    if (questsCompletedToday === 3 || progress.daily_pvp_wins === 1) {
        incrementWeeklyTaskCompleted();
    }

    return { gemstoneDelta, notifications };
};

type FinalizeAnswerParams = {
    userId: string;
    question: Question;
    choice: string;
    isCorrect: boolean;
    baseResponse: AnswerResponse;
};

const finalizeMcqAnswer = async ({
    userId,
    question,
    choice,
    isCorrect,
    baseResponse,
}: FinalizeAnswerParams): Promise<AnswerResponse> => {
    let xpReward = baseResponse.deltas.xp;
    let coinDelta = baseResponse.deltas.coins;
    let duplicateCorrect = false;

    // NOTE: Duplicate detection now happens at database level via unique constraint
    // If user submits from multiple tabs, the second submission will get a 23505 error
    // which is caught in the attemptInsert handler below

    const attemptInsert = (async () => {
        const { error } = await supabase.from('question_attempts').insert({
            student_id: userId,
            question_id: question.id,
            answer_given: choice,
            is_correct: isCorrect,
            points_earned: isCorrect && xpReward > 0 ? xpReward : 0,
        });

        // Check for unique constraint violation (duplicate correct answer)
        if (error) {
            if (error.code === '23505' && isCorrect) {
                // Unique constraint violation - user already has a correct answer for this question
                // This can happen with multi-tab submissions
                duplicateCorrect = true;
                xpReward = 0;
                coinDelta = 0;
                baseResponse.deltas.xp = 0;
                baseResponse.deltas.coins = 0;
                baseResponse.explanation = 'Correct, but rewards already claimed for this question.';
                console.warn(`Duplicate correct attempt blocked for user ${userId} on question ${question.id}`);
                return; // Don't throw - treat as valid but no reward
            }
            throw error;
        }
    })();

    const questionStatsUpdate = question.id
        ? (async () => {
              const { error } = await supabase
                  .from('questions')
                  .update({
                      times_answered: (question.times_answered || 0) + 1,
                      times_correct: (question.times_correct || 0) + (isCorrect ? 1 : 0),
                  })
                  .eq('id', question.id);

              if (error) throw error;
          })()
        : null;

    const questOutcome = duplicateCorrect ? { gemstoneDelta: 0, notifications: [] } : applyQuestProgress(userId, isCorrect);

    const { data: currentProfile, error: fetchError } = await supabase
        .from('users')
        .select('xp, coins, level, gemstones, username')
        .eq('id', userId)
        .single();

    if (fetchError || !currentProfile) {
        throw new Error('Failed to fetch profile');
    }

    const newXP = currentProfile.xp + xpReward;
    const newCoins = Math.max(0, currentProfile.coins + coinDelta);
    const newLevel = Math.floor(newXP / 100) + 1;
    const leveledUp = newLevel > currentProfile.level;

    let gemstoneDelta = questOutcome.gemstoneDelta;
    if (leveledUp && newLevel % LEVEL_MILESTONE_INTERVAL === 0) {
        gemstoneDelta += LEVEL_MILESTONE_GEMSTONE_REWARD;
    }

    const newGemstones = Math.max(0, (currentProfile.gemstones || 0) + gemstoneDelta);

    const profileUpdate = updateProfile(userId, {
        xp: newXP,
        coins: newCoins,
        level: newLevel,
        gemstones: newGemstones,
    });

    const dataOperations: Promise<unknown>[] = [attemptInsert, profileUpdate];
    if (questionStatsUpdate) {
        dataOperations.push(questionStatsUpdate);
    }

    const notificationOperations: Promise<unknown>[] = [...questOutcome.notifications];

    if (leveledUp) {
        const activityInsert = (async () => {
            const { error } = await supabase.from('activities').insert({
                kind: 'level_up',
                actor_id: userId,
                actor_username: currentProfile.username || 'Unknown',
                data: { details: String(newLevel) },
            });

            if (error) throw error;
        })();
        dataOperations.push(activityInsert);

        notificationOperations.push(
            notifyLevelUp(userId, newLevel, xpReward, coinDelta)
        );
    }

    if (gemstoneDelta > 0) {
        notificationOperations.push(
            notificationService.createNotification(
                userId,
                'gemstone_earned',
                '💎 Gemstone Earned!',
                `You earned ${gemstoneDelta} rare gemstone${gemstoneDelta > 1 ? 's' : ''}!`,
                'high'
            )
        );
    }

    if (isCorrect && coinDelta >= 30) {
        notificationOperations.push(
            notificationService.createNotification(
                userId,
                'coins_earned',
                '💰 Coins Earned!',
                `You earned ${coinDelta} coins for answering correctly!`,
                'low'
            )
        );
    }

    // Execute data operations - profile update must succeed for rewards to count
    const dataResults = await Promise.allSettled(dataOperations);

    // Check if profile update succeeded (it's the second operation after attemptInsert)
    const profileUpdateIndex = 1; // attemptInsert=0, profileUpdate=1
    const profileUpdateResult = dataResults[profileUpdateIndex];

    if (profileUpdateResult.status === 'rejected') {
        console.error('CRITICAL: Failed to persist profile update for MCQ answer:', profileUpdateResult.reason);
        throw new Error(`Failed to save profile rewards: ${profileUpdateResult.reason}`);
    }

    // Log any other data failures
    dataResults.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Failed to persist MCQ answer data (operation ${index}):`, result.reason);
        }
    });

    // Handle notifications separately (don't block if they fail)
    Promise.allSettled(notificationOperations).then(notificationResults => {
        notificationResults.forEach(result => {
            if (result.status === 'rejected') {
                console.error('Failed to deliver MCQ notification:', result.reason);
            }
        });
    });

    baseResponse.deltas.gemstones = gemstoneDelta;
    return baseResponse;
};

export const mcq_answer_submit = async (question: Question, choice: string): Promise<AnswerResponse> => {
    const user = await getCurrentUser();

    if (!question?.id) {
        throw new Error('Question payload missing identifier');
    }

    const rewardXp = question.reward_xp ?? question.points ?? 20;
    const rewardCoins = question.reward_coins ?? Math.floor(rewardXp * 1.5);
    const correctAnswer = question.correct_answer ?? '';
    const isCorrect = choice === correctAnswer;

    const response: AnswerResponse = {
        correct: isCorrect,
        deltas: {
            xp: isCorrect ? rewardXp : -5,
            coins: isCorrect ? rewardCoins : 0,
            gemstones: 0,
        },
        explanation: isCorrect
            ? question.explanation || 'Well done, agent!'
            : `Incorrect. ${question.explanation || 'The correct answer was: ' + correctAnswer}`,
    };

    return finalizeMcqAnswer({
        userId: user.id,
        question,
        choice,
        isCorrect,
        baseResponse: response,
    });
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