import { Profile, Task, SessionStatus, Caps, NewsEvent, SubjectData, Question, AnswerResponse, RaidTarget, RaidAttackResult, ShopItem, PurchaseReceipt, Clan, ClanChatMessage, ClanSummary, ClanMember, ClanBuff, InventoryItem, Teacher, TeacherQuestion, CreateQuestionRequest, QuestionAttemptResult, QuestTemplate, Batch, Subject, TeacherAssignmentSummary, StudentAssignmentTask, TeacherAssignmentReportRow, CreateAssignmentRequest, AssignmentResultInput } from '../types';
import * as RaidFeatureService from '../src/features/raids/raidService';
import { BossUnlockState, RaidAnswerPayload, RaidFinalizationResult, RaidParticipantState, RaidStatus, RaidWaveState } from '../src/features/raids/raidTypes';
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addPlayerToSharedList, addActivityEvent, getActivityFeed, getTaskProgress, incrementQuestCompleted, incrementPvPWin, incrementWeeklyTaskCompleted, getPurchaseCount, incrementPurchaseCount, canEarnQuestGemstone, recordQuestGemstoneAward, canEarnPvpGemstone, recordPvpGemstoneAward } from './storageService';
import { supabase } from './supabaseClient';
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
};

// Load from storage or use defaults
let MOCK_PROFILE: Profile = loadFromStorage<Profile>(STORAGE_KEYS.PROFILE) || { ...DEFAULT_PROFILE };

let MOCK_CLAN: Clan | null = loadFromStorage<Clan>(STORAGE_KEYS.CLAN) || null;

let MOCK_CHAT: ClanChatMessage[] = loadFromStorage<ClanChatMessage[]>(STORAGE_KEYS.CHAT) || [
    { id: `msg_${Date.now() - 300000}`, user: 'CypherPunk', message: 'Anyone up for a raid later?', created_at: '5m ago', is_self: false },
    { id: `msg_${Date.now() - 180000}`, user: 'NeonGhost', message: 'Yeah, I have enough AP. Let\'s do it.', created_at: '3m ago', is_self: true },
    { id: `msg_${Date.now() - 60000}`, user: 'ZeroCool', message: 'I am in! Let\'s attack some noobs.', created_at: '1m ago', is_self: false },
];

const MOCK_AVAILABLE_BUFFS: ClanBuff[] = [
    { id: 'buff_xp_1', name: 'XP Surge', description: '+10% XP for all members for 24h.', cost: 5000 },
    { id: 'buff_shield_1', name: 'Reinforced Shields', description: 'Clan member shields are 20% stronger for 24h.', cost: 7500 },
    { id: 'buff_attack_1', name: 'Attack Protocol', description: '+5% Attack Power for all members for 24h.', cost: 10000 },
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
  } else if (profileError || !profile) {
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

  // Register in shared player list for multiplayer features
  addPlayerToSharedList({
    id: profile.id,
    username: profile.username,
    level: profile.level,
    coins: profile.coins,
    gemstones: profile.gemstones,
    batch: profile.batch,
    avatar_url: profile.avatar_url,
    has_shield: false, // TODO: Check inventory for active shield
  });

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
  
  // TODO: Grant items if any (add to inventory)
  if (task.reward.items && task.reward.items.length > 0) {
    // Future: Add items to inventory
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
    // Map subject_id to subject name for teacher questions
    const subjectMap: { [key: string]: string } = {
        'subj_science': 'Science',
        'subj_math': 'Maths',
        'subj_mathematics': 'Maths',
        'subj_english': 'English',
        'subj_russian_language': 'Russian Language',
        'subj_kyrgyz_language': 'Kyrgyz Language',
        'subj_german_language': 'German Language',
        'subj_geography': 'Geography',
        'subj_global_perspective': 'Global Perspective',
        'subj_russian_literature': 'Russian Language',
        'subj_ict': 'ICT'
    };

    const subjectName = subjectMap[subject_id] || 'Science';

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
    
    // Fetch all users except current user, teachers, and admins from database with their clan info
    // Exclude players who were attacked in the last 5 minutes (300 seconds)
    const { data: players, error } = await supabase
        .from('users')
        .select(`
            id, username, level, coins, batch, avatar_url, last_seen, attack_power, defense_power, last_attacked_at,
            clan_members!left (
                clans!inner (name)
            )
        `)
        .neq('id', user.id)
        .neq('role', 'teacher')
        .neq('role', 'admin')
        .or(`last_attacked_at.is.null,last_attacked_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`)
        .limit(20);
    
    if (error) throw error;
    
    // TODO: Check inventory for shields
    const realTargets: RaidTarget[] = (players || []).map((p: any) => {
        // Extract clan name if user is in a clan
        const clanName = p.clan_members?.[0]?.clans?.name || undefined;

        return {
            user_id: p.id,
            username: p.username,
            level: p.level,
            coins: p.coins,
            batch: p.batch as '8A' | '8B' | '8C',
            has_shield: false, // TODO: Check inventory
            est_win_rate: Math.random() * 0.5 + 0.3,
            avatar_url: p.avatar_url || '',
            last_seen: p.last_seen,
            clan_name: clanName,
        };
    });

    const existingIds = new Set(realTargets.map(target => target.user_id));
    const MIN_TARGETS = 6;
    const MAX_TARGETS = 20;
    const botsNeeded = Math.min(
        Math.max(MIN_TARGETS - realTargets.length, 0),
        Math.max(MAX_TARGETS - realTargets.length, 0)
    );
    const bots = generateKyrgyzBots(botsNeeded, existingIds);

    const combinedTargets = [...realTargets, ...bots];

    if (combinedTargets.length > 1) {
        combinedTargets.sort(() => Math.random() - 0.5);
    }

    return mockApiCall(combinedTargets.slice(0, MAX_TARGETS));
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
        const progress = getTaskProgress();
        if (progress.daily_pvp_wins === 1 && canEarnPvpGemstone(PVP_GEMSTONE_DAILY_CAP)) {
            gemstoneReward += PVP_GEMSTONE_REWARD;
            recordPvpGemstoneAward(PVP_GEMSTONE_REWARD);
        }
        if (progress.daily_pvp_wins === 1) {
            incrementWeeklyTaskCompleted();
        }
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
    { id: 'item_cosmetic_frame', name: 'Neon Frame', kind: 'cosmetic', price: 750, rarity: 'rare', gemstone_price: 3, daily_limit: 1, owned_today: 0, description: 'A flashy neon frame for your avatar. Show off your style!', effect_summary: 'Purely cosmetic' },
    { id: 'item_cosmetic_theme', name: 'Glitch Theme', kind: 'cosmetic', price: 1200, rarity: 'legendary', gemstone_price: 8, daily_limit: 1, owned_today: 0, description: 'Apply a glitchy, datamosh effect to your profile card.', effect_summary: 'Purely cosmetic' },
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

export const clan_list = async (): Promise<ClanSummary[]> => {
    // Fetch clans with member XP sum
    const { data: clans, error } = await supabase
        .from('clans')
        .select(`
            id,
            name,
            member_count,
            vault_coins,
            clan_members!inner (
                users!inner (xp)
            )
        `);
    
    if (error) {
        console.error('Error fetching clans:', error);
        return mockApiCall([]);
    }
    
    // Calculate total XP from all members
    const mappedClans = (clans || []).map((clan: any) => {
        const totalXP = clan.clan_members?.reduce((sum: number, member: any) => {
            return sum + (member.users?.xp || 0);
        }, 0) || 0;
        
        // Get actual member count from array length
        const actualMemberCount = clan.clan_members?.length || 0;
        
        return {
            id: clan.id,
            name: clan.name,
            member_count: actualMemberCount,
            vault_metric: totalXP,
            vault_coins: clan.vault_coins,
        };
    });
    
    return mockApiCall(mappedClans);
};

export const clan_get_members_by_id = async (clanId: string): Promise<ClanMember[]> => {
    const { data, error } = await supabase
        .from('clan_members')
        .select(`
            user_id,
            role,
            users!inner (
                username,
                avatar_url
            )
        `)
        .eq('clan_id', clanId)
        .order('role', { ascending: true })
        .order('user_id', { ascending: true });

    if (error) {
        throw error;
    }

    return (data || []).map((member: any) => ({
        user_id: member.user_id,
        username: member.users?.username ?? 'Unknown agent',
        role: member.role || 'member',
        contribution: 0,
        avatar_url: member.users?.avatar_url || '',
    }));
};

export const clan_join = async (clan_id: string): Promise<Clan> => {
    const user = await getCurrentUser();
    
    // Check if clan exists
    const { data: clanData, error: clanError } = await supabase
        .from('clans')
        .select('*')
        .eq('id', clan_id)
        .single();
    
    if (clanError || !clanData) {
        return Promise.reject({ message: 'Clan not found.' });
    }
    
    // Check if user is already in a clan
    const { data: existingMembership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .single();
    
    if (existingMembership) {
        return Promise.reject({ message: 'You are already in a clan.' });
    }
    
    // Add user to clan
    await supabase.from('clan_members').insert({
        clan_id: clan_id,
        user_id: user.id,
        role: 'member',
    });
    
    // Update clan member count
    await supabase
        .from('clans')
        .update({ member_count: clanData.member_count + 1 })
        .eq('id', clan_id);
    
    // Fetch full clan details with members
    const clanDetails = await clan_details();
    if (!clanDetails) {
        throw new Error('Failed to load clan details after joining.');
    }
    return clanDetails;
};

export const clan_details = async (): Promise<Clan | null> => {
    const user = await getCurrentUser();
    
    // Check if user is in a clan
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        return mockApiCall(null);
    }
    
    // Fetch clan details
    const { data: clan, error } = await supabase
        .from('clans')
        .select('*')
        .eq('id', membership.clan_id)
        .single();
    
    if (error || !clan) {
        return mockApiCall(null);
    }
    
    // Fetch clan members with their XP
    const { data: membersData } = await supabase
        .from('clan_members')
        .select(`
            user_id,
            role,
            users!inner (username, avatar_url, xp)
        `)
        .eq('clan_id', clan.id);
    
    const members = (membersData || []).map((m: any) => ({
        user_id: m.user_id,
        username: m.users.username,
        role: m.role,
        contribution: 0, // Default since DB doesn't have this column
        avatar_url: m.users.avatar_url,
    }));
    
    // Calculate total XP from all members
    const totalXP = (membersData || []).reduce((sum: number, m: any) => {
        return sum + (m.users?.xp || 0);
    }, 0);
    
    const fullClan: Clan = {
        id: clan.id,
        name: clan.name,
        notice: clan.notice || 'Welcome to the clan!',
        crest_url: undefined,
        vault_metric: totalXP, // Use calculated total XP from all members
        vault_coins: clan.vault_coins || 0,
        buffs: [],
        members: members,
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

export const clan_get_available_buffs = (): Promise<ClanBuff[]> => {
    return mockApiCall(MOCK_AVAILABLE_BUFFS);
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

export const clan_buy_buff = async (buff_id: string): Promise<Clan> => {
    const user = await getCurrentUser();
    
    // Get user's clan membership
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id, role')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        throw new Error('Not in a clan.');
    }
    
    // Only leaders and officers can buy buffs
    if (membership.role !== 'leader' && membership.role !== 'officer') {
        throw new Error('Only leaders and officers can purchase buffs.');
    }
    
    const buff = MOCK_AVAILABLE_BUFFS.find(b => b.id === buff_id);
    if (!buff) {
        throw new Error('Buff not found.');
    }
    
    // Get clan's vault balance
    const { data: clan } = await supabase
        .from('clans')
        .select('vault_coins')
        .eq('id', membership.clan_id)
        .single();
    
    if (!clan || clan.vault_coins < buff.cost) {
        throw new Error('Not enough coins in clan vault.');
    }
    
    // Deduct from vault
    await supabase
        .from('clans')
        .update({ vault_coins: clan.vault_coins - buff.cost })
        .eq('id', membership.clan_id);
    
    // TODO: Store buff activation in a clan_buffs table
    // For now, just deduct the coins and return updated clan details
    
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
    
    if (membership.role !== 'leader') {
        throw new Error('Only the clan leader can promote members.');
    }
    
    // Promote the target member to officer
    const { error } = await supabase
        .from('clan_members')
        .update({ role: 'officer' })
        .eq('user_id', user_id)
        .eq('clan_id', membership.clan_id);
    
    if (error) {
        console.error('Failed to promote member:', error);
        throw new Error('Failed to promote member.');
    }
    
    return await clan_details() as Clan;
};

export const clan_demote_member = async (user_id: string): Promise<Clan> => {
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
    
    if (membership.role !== 'leader') {
        throw new Error('Only the clan leader can demote members.');
    }
    
    // Demote the target member to regular member
    const { error } = await supabase
        .from('clan_members')
        .update({ role: 'member' })
        .eq('user_id', user_id)
        .eq('clan_id', membership.clan_id);
    
    if (error) {
        console.error('Failed to demote member:', error);
        throw new Error('Failed to demote member.');
    }
    
    return await clan_details() as Clan;
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
    
    if (membership.role !== 'leader' && membership.role !== 'officer') {
        throw new Error('Only leaders and officers can kick members.');
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
    const shouldNormalizeTopic = typeof updates.topic === 'string' || typeof updates.topic_name === 'string';
    const resolvedTopic = shouldNormalizeTopic ? normalizeTopicName(updates.topic, updates.topic_name) : undefined;

    const payload = {
        ...updates,
        subject_id: resolvedSubjectId,
        topic: resolvedTopic ?? updates.topic,
        topic_name: resolvedTopic ?? updates.topic_name,
        updated_at: new Date().toISOString(),
    };

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

    const { data, error } = await rpcCreateAssignment({
        p_teacher_id: teacher.id,
        p_subject_id: payload.subject_id ?? resolveSubjectIdentifier(payload.subject),
        p_subject_name: payload.subject,
        p_topic_name: normalizeTopicName(payload.topic_name),
        p_batch: payload.batch,
        p_question_ids: payload.question_ids,
        p_assigned_at: payload.assigned_at ?? nowIso(),
        p_due_at: payload.due_at ?? null,
        p_title: payload.title ?? null,
        p_instructions: payload.instructions ?? null,
        p_difficulty: payload.difficulty ?? null,
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

export const get_student_active_assignment = async (): Promise<StudentAssignmentTask | null> => {
    const { data, error } = await rpcGetStudentActiveAssignment();
    if (error) throw new Error(error.message || 'Failed to load assignment');

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const parsedRow = row as StudentAssignmentTask;
    const normalizedQuestions = ((parsedRow.questions ?? []) as TeacherQuestion[]).map((question) => ({
        ...question,
        topic_name: question.topic_name ?? question.topic ?? 'General',
    }));

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

    if (isCorrect) {
        const { data: existingCorrect, error: existingCorrectError } = await supabase
            .from('question_attempts')
            .select('id')
            .eq('student_id', userId)
            .eq('question_id', question.id)
            .eq('is_correct', true)
            .order('created_at', { ascending: false })
            .limit(1);

        if (existingCorrectError) {
            console.warn('Failed to verify duplicate MCQ attempts:', existingCorrectError);
        } else if (existingCorrect && existingCorrect.length > 0) {
            duplicateCorrect = true;
        }
    }

    if (duplicateCorrect) {
        xpReward = 0;
        coinDelta = 0;
        baseResponse.deltas.xp = 0;
        baseResponse.deltas.coins = 0;
        baseResponse.explanation = 'Correct, but rewards already claimed for this question.';
    }

    const attemptInsert = (async () => {
        const { error } = await supabase.from('question_attempts').insert({
            student_id: userId,
            question_id: question.id,
            answer_given: choice,
            is_correct: isCorrect,
            points_earned: isCorrect && xpReward > 0 ? xpReward : 0,
        });

        if (error) throw error;
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

    const [dataResults, notificationResults] = await Promise.all([
        Promise.allSettled(dataOperations),
        Promise.allSettled(notificationOperations),
    ]);

    dataResults.forEach(result => {
        if (result.status === 'rejected') {
            console.error('Failed to persist MCQ answer data:', result.reason);
        }
    });

    notificationResults.forEach(result => {
        if (result.status === 'rejected') {
            console.error('Failed to deliver MCQ notification:', result.reason);
        }
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