import { Profile, Task, SessionStatus, Caps, NewsEvent, Subject, Question, AnswerResponse, RaidTarget, RaidAttackResult, ShopItem, PurchaseReceipt, Clan, ClanChatMessage, ClanSummary, ClanMember, ClanBuff, InventoryItem } from '../types';
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addPlayerToSharedList, getSharedPlayers, addActivityEvent, getActivityFeed, getTaskProgress, incrementQuestCompleted, incrementPvPWin, incrementWeeklyTaskCompleted, getPurchaseCount, incrementPurchaseCount } from './storageService';
import { supabase } from './supabaseClient';

const MOCK_DELAY = 500;

// Helper to simulate API calls
const mockApiCall = <T,>(data: T): Promise<T> => {
  return new Promise(resolve => setTimeout(() => resolve(data), MOCK_DELAY));
};

// Initialize default profile data
const DEFAULT_PROFILE: Profile = {
  id: 'usr_1a2b3c',
  username: 'NeonGhost',
  batch: '8B',
  avatar_url: 'https://picsum.photos/seed/neonghost/100/100',
  level: 12,
  xp: 420,
  coins: 8750,
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
    { id: `msg_${Date.now() - 60000}`, user: 'ZeroCool', message: 'I am in! Let\'s hack some noobs.', created_at: '1m ago', is_self: false },
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
        description: 'Blocks one incoming hack attempt before shattering.',
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
    { id: `msg_${Date.now() - 60000}`, user: 'ZeroCool', message: 'I am in! Let\'s hack some noobs.', created_at: '1m ago', is_self: false },
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
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Profile not found');
  }

  // Update last_seen
  await supabase
    .from('users')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', user.id);

  // Register in shared player list for multiplayer features
  addPlayerToSharedList({
    id: profile.id,
    username: profile.username,
    level: profile.level,
    coins: profile.coins,
    batch: profile.batch,
    avatar_url: profile.avatar_url,
    has_shield: false, // TODO: Check inventory for active shield
  });

  return profile;
};

export const tasks_list = (): Promise<Task[]> => {
  const progress = getTaskProgress();
  
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
      reward_preview: '175 XP, 350 Coins',
      expires_at: dailyExpiry,
    },
    {
      id: 'task_d2',
      title: 'Win a PvP Hack',
      kind: 'daily',
      progress: progress.daily_pvp_wins,
      target: 1,
      reward_preview: '100 XP, 50 Coins',
      expires_at: dailyExpiry,
    },
    {
      id: 'task_w1',
      title: 'Complete 15 Daily Tasks this week',
      kind: 'weekly',
      progress: progress.weekly_tasks_completed,
      target: 15,
      reward_preview: '500 XP, 400 Coins + 1 Item Crate',
      expires_at: weeklyExpiry,
    },
  ];
  return mockApiCall(tasks);
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

export const news_feed = (): Promise<NewsEvent[]> => {
  // Get shared activity feed from all students
  const sharedEvents = getActivityFeed();
  
  // Mix with some default mock events if needed
  const defaultEvents: NewsEvent[] = [
    {
      id: 'evt_welcome',
      kind: 'level_up',
      actor: 'System',
      data: { details: 'Level 1 - Welcome to G-Brain Heist' },
      created_at: '1h ago',
      reactions: { '🔥': 12, '😮': 5, '😂': 3, '❤️': 18 },
      my_reaction: null,
    },
  ];
  
  // Combine and return (shared events first, then defaults)
  const combinedEvents = sharedEvents.length > 0 ? sharedEvents : defaultEvents;
  return mockApiCall(combinedEvents.slice(0, 20)); // Return max 20 events
};

export const mcq_subjects_list = (): Promise<Subject[]> => {
    const subjects: Subject[] = [
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

export const mcq_questions_get = (subject_id: string, limit: number = 5): Promise<Question[]> => {
    const questions: Question[] = Array.from({ length: limit }, (_, i) => ({
        id: `q_${subject_id}_${i+1}`,
        body: `This is question ${i+1} for the ${subject_id.replace('subj_', '')} subject. What is the correct answer?`,
        options: ['Option A', 'Option B (Correct)', 'Option C', 'Option D'],
        reward_xp: 20,
        reward_coins: 30,
    }));
    return mockApiCall(questions);
};

export const mcq_answer_submit = (question_id: string, choice: string): Promise<AnswerResponse> => {
    const isCorrect = choice === 'Option B (Correct)';
    const response: AnswerResponse = {
        correct: isCorrect,
        deltas: {
            xp: isCorrect ? 20 : -5,
            coins: isCorrect ? 30 : 0,
        },
        explanation: isCorrect ? 'Well done, agent!' : 'Incorrect. The correct answer was B because of reasons.'
    };
    
    // Update profile with rewards/penalties
    MOCK_PROFILE.xp += response.deltas.xp;
    MOCK_PROFILE.coins += response.deltas.coins;
    saveProfile();
    
    // Track quest progress (5 questions = 1 quest)
    if (isCorrect) {
        currentQuestAnswers++;
        if (currentQuestAnswers >= 5) {
            incrementQuestCompleted();
            currentQuestAnswers = 0; // Reset for next quest
            
            // Check if a daily task was just completed
            const progress = getTaskProgress();
            if (progress.daily_quests_completed === 3 || progress.daily_pvp_wins === 1) {
                incrementWeeklyTaskCompleted();
            }
        }
    }
    
    return mockApiCall(response);
};

export const raid_targets = (): Promise<RaidTarget[]> => {
    // Get real students from shared storage
    const sharedPlayers = getSharedPlayers();
    const currentUserId = MOCK_PROFILE.id;
    
    // Filter out current user and map to RaidTarget format
    const realTargets: RaidTarget[] = sharedPlayers
        .filter(p => p.id !== currentUserId)
        .map(p => ({
            user_id: p.id,
            username: p.username,
            level: p.level,
            coins: p.coins,
            batch: p.batch,
            has_shield: p.has_shield || false,
            est_win_rate: Math.random() * 0.5 + 0.3, // Random between 0.3 and 0.8
            avatar_url: p.avatar_url,
            last_seen: p.last_seen,
        }));
    
    // If no other students yet, add mock targets with recent timestamps
    if (realTargets.length === 0) {
        const now = new Date();
        const mockTargets: RaidTarget[] = [
            { user_id: 'usr_tgt_1', username: 'DataWraith', level: 13, coins: 4500, batch: '8A', has_shield: true, est_win_rate: 0.45, avatar_url: 'https://picsum.photos/seed/datawraith/100/100', last_seen: new Date(now.getTime() - 2 * 60 * 1000).toISOString() },
            { user_id: 'usr_tgt_2', username: 'CypherPunk', level: 15, coins: 12000, batch: '8C', has_shield: false, est_win_rate: 0.30, avatar_url: 'https://picsum.photos/seed/cypherpunk/100/100', last_seen: new Date(now.getTime() - 15 * 60 * 1000).toISOString() },
            { user_id: 'usr_tgt_3', username: 'GlitchMaster', level: 11, coins: 2500, batch: '8B', has_shield: false, est_win_rate: 0.65, avatar_url: 'https://picsum.photos/seed/glitchmaster/100/100', last_seen: new Date(now.getTime() - 60 * 60 * 1000).toISOString() },
        ];
        return mockApiCall(mockTargets);
    }
    
    return mockApiCall(realTargets);
};

export const raid_attack = (defender_id: string, use_cracker: boolean, target: RaidTarget): Promise<RaidAttackResult> => {
    // Deduct AP cost for hacking
    MOCK_PROFILE.ap_now = Math.max(0, MOCK_PROFILE.ap_now - 2);
    
    let result: 'win' | 'lose' | 'blocked' = 'lose';
    
    if (target.has_shield && !use_cracker) {
        result = 'blocked';
    } else {
        // Calculate real combat stats
        const attackerTotalAttack = getTotalAttackPower(MOCK_PROFILE, MOCK_INVENTORY);
        
        // Estimate defender stats (base 10 defense + shield bonus if active)
        let defenderTotalDefense = 10; // Base defense
        if (target.has_shield && !use_cracker) {
            defenderTotalDefense += 20; // Shield bonus
        }
        
        // Calculate win probability based on attack vs defense ratio
        // Formula: winChance = attackerAttack / (attackerAttack + defenderDefense)
        // This gives ~50% at equal stats, higher with more attack, lower with more defense
        const winChance = attackerTotalAttack / (attackerTotalAttack + defenderTotalDefense);
        
        result = Math.random() < winChance ? 'win' : 'lose';
    }
    
    // Apply XP and coin rewards
    MOCK_PROFILE.xp += result === 'win' ? 30 : (result === 'blocked' ? -10 : 0);
    MOCK_PROFILE.coins += result === 'win' ? 50 : 0;
    
    // Save updated profile
    saveProfile();
    
    const response: RaidAttackResult = {
        result: result,
        attacker_deltas: {
            xp: result === 'win' ? 30 : (result === 'blocked' ? -10 : 0),
            coins: result === 'win' ? 50 : 0,
        },
        defender_deltas: {
            coins_loss: result === 'win' ? 25 : 0,
        },
        shield_state: target.has_shield ? (use_cracker && result === 'win' ? 'removed' : 'remaining') : 'none',
    };
    
    // Log event to shared activity feed
    const now = new Date();
    const timeAgo = 'Just now';
    
    if (result === 'win') {
        // Track PvP win for tasks
        incrementPvPWin();
        
        // Check if this completed the daily PvP task (increment weekly)
        const progress = getTaskProgress();
        if (progress.daily_pvp_wins === 1) {
            incrementWeeklyTaskCompleted();
        }
        
        addActivityEvent({
            kind: 'pvp_win',
            actor: MOCK_PROFILE.username,
            target: target.username,
            data: { details: `Stole ${response.attacker_deltas.coins} Coins` },
            created_at: timeAgo,
        });
    } else if (result === 'blocked') {
        addActivityEvent({
            kind: 'pvp_blocked',
            actor: MOCK_PROFILE.username,
            target: target.username,
            data: { details: 'Attack blocked by Shield' },
            created_at: timeAgo,
        });
    } else {
        addActivityEvent({
            kind: 'pvp_lose',
            actor: MOCK_PROFILE.username,
            target: target.username,
            data: { details: 'Hack attempt failed' },
            created_at: timeAgo,
        });
    }
    
    return mockApiCall(response);
};

const MOCK_SHOP_ITEMS: ShopItem[] = [
    { id: 'item_shield', name: 'Shield', kind: 'shield', price: 150, daily_limit: 3, owned_today: 0, description: 'Blocks one incoming hack attempt before shattering. +20 Defense.', effect_summary: '+20 Defense' },
    { id: 'item_firewall', name: 'Firewall', kind: 'firewall', price: 300, daily_limit: 2, owned_today: 0, description: 'Advanced defense system. +30 Defense until cracked.', effect_summary: '+30 Defense' },
    { id: 'item_encryption_key', name: 'Encryption Key', kind: 'encryption_key', price: 200, daily_limit: 3, owned_today: 0, description: 'Permanent attack boost. +15 Attack.', effect_summary: '+15 Attack (Permanent)' },
    { id: 'item_exploit_kit', name: 'Exploit Kit', kind: 'exploit_kit', price: 350, daily_limit: 2, owned_today: 0, description: 'Advanced hacking tools. +25 Attack permanently.', effect_summary: '+25 Attack (Permanent)' },
    { id: 'item_cracker', name: 'Cracker', kind: 'cracker', price: 200, daily_limit: 2, owned_today: 0, description: 'Bypasses an active enemy shield during a hack.', effect_summary: 'Negates 1 shield' },
    { id: 'item_booster', name: 'Booster', kind: 'booster', price: 250, daily_limit: 1, owned_today: 0, description: 'Grants 1.5x XP from all sources for 1 hour.', effect_summary: '1.5x XP (1h)' },
    { id: 'item_major_booster', name: 'Major Booster', kind: 'major_booster', price: 400, daily_limit: 1, owned_today: 0, description: 'Grants a massive 2.0x XP from all sources for 1 hour.', effect_summary: '2.0x XP (1h)' },
    { id: 'item_cosmetic_frame', name: 'Neon Frame', kind: 'cosmetic', price: 750, daily_limit: 1, owned_today: 0, description: 'A flashy neon frame for your avatar. Show off your style!', effect_summary: 'Purely cosmetic' },
    { id: 'item_cosmetic_theme', name: 'Glitch Theme', kind: 'cosmetic', price: 1200, daily_limit: 1, owned_today: 0, description: 'Apply a glitchy, datamosh effect to your profile card.', effect_summary: 'Purely cosmetic' },
];


export const shop_list = (): Promise<ShopItem[]> => {
    // Update owned_today with real purchase counts from storage
    const itemsWithRealCounts = MOCK_SHOP_ITEMS.map(item => ({
        ...item,
        owned_today: getPurchaseCount(item.id)
    }));
    return mockApiCall(itemsWithRealCounts);
};

export const shop_buy = (item_id: string, quantity: number, current_coins: number): Promise<PurchaseReceipt> => {
    const item = MOCK_SHOP_ITEMS.find(i => i.id === item_id);
    
    if (!item) {
        return Promise.reject({ message: 'Item not found.' });
    }
    
    const totalCost = item.price * quantity;

    if (totalCost > current_coins) {
        return Promise.reject({ message: 'Not enough coins.' });
    }

    // Check real purchase count from storage
    const currentPurchaseCount = getPurchaseCount(item_id);
    if ((currentPurchaseCount + quantity) > item.daily_limit) {
        return Promise.reject({ message: 'Daily purchase limit exceeded.' });
    }

    // Update profile coins
    MOCK_PROFILE.coins -= totalCost;
    saveProfile();
    
    // Track purchase count
    incrementPurchaseCount(item_id, quantity);
    
    // Add items to inventory with bonuses based on kind
    for (let i = 0; i < quantity; i++) {
        const newItem: InventoryItem = {
            inv_id: `inv_${Date.now()}_${i}`,
            item_id: item.id,
            name: item.name,
            kind: item.kind,
            state: 'unused',
            description: item.description,
            effect_summary: item.effect_summary
        };
        
        // Add combat bonuses for equipment (permanent items don't have expires_at)
        if (item.kind === 'shield') {
            newItem.defense_bonus = 20;
        } else if (item.kind === 'encryption_key') {
            newItem.attack_bonus = 15;
            // Encryption keys are permanent (no expires_at)
        } else if (item.kind === 'firewall') {
            newItem.defense_bonus = 30;
        } else if (item.kind === 'exploit_kit') {
            newItem.attack_bonus = 25;
            // Exploit kits are permanent (no expires_at)
        }
        
        MOCK_INVENTORY.push(newItem);
    }
    saveInventory();

    const receipt: PurchaseReceipt = {
        receipt_id: `rec_${Date.now()}`,
        coins_spent: totalCost,
        new_balance: current_coins - totalCost,
        item: item,
        quantity: quantity
    };
    
    return mockApiCall(receipt);
};

export const inventory_list = (): Promise<InventoryItem[]> => {
    // Clean up expired items before returning list
    cleanupExpiredItems();
    return mockApiCall(MOCK_INVENTORY);
};

export const inventory_activate = (inv_id: string): Promise<{ state_after: InventoryItem['state'], effect_window: { start: string, end: string } }> => {
    const item = MOCK_INVENTORY.find(i => i.inv_id === inv_id);

    if (!item) {
        return Promise.reject({ message: 'Item not found in inventory.' });
    }
    if (item.state !== 'unused') {
        return Promise.reject({ message: 'Item cannot be activated.' });
    }
    // Simple activation logic for mock
    item.state = 'active';
    item.activated_at = new Date().toISOString();
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour for boosters
    
    if (item.kind === 'shield' || item.kind === 'firewall') {
      item.expires_at = 'Until Cracked';
    } else {
      item.expires_at = expiry.toISOString();
    }
    
    // Deactivate other boosters if a new one is used - delete them instead of marking consumed
    if (item.kind === 'booster' || item.kind === 'major_booster') {
        const boosterIds: string[] = [];
        MOCK_INVENTORY.forEach(i => {
            if ((i.kind === 'booster' || i.kind === 'major_booster') && i.inv_id !== inv_id && i.state === 'active') {
                boosterIds.push(i.inv_id);
            }
        });
        // Remove the replaced boosters
        boosterIds.forEach(id => {
            const index = MOCK_INVENTORY.findIndex(i => i.inv_id === id);
            if (index !== -1) {
                MOCK_INVENTORY.splice(index, 1);
            }
        });
    }
    
    saveInventory();
    
    const result = {
        state_after: item.state,
        effect_window: {
            start: now.toISOString(),
            end: expiry.toISOString()
        }
    };
    return mockApiCall(result);
};

// --- CLAN MOCKS ---
const MOCK_CLANS_LIST: ClanSummary[] = [
    { id: 'clan_data_miners', name: 'Data Miners', crest_url: 'https://picsum.photos/seed/dataminers/100/100', member_count: 15, vault_metric: 250000 },
    { id: 'clan_net_runners', name: 'Net Runners', crest_url: 'https://picsum.photos/seed/netrunners/100/100', member_count: 8, vault_metric: 150000 },
    { id: 'clan_glitch_squad', name: 'Glitch Squad', crest_url: 'https://picsum.photos/seed/glitchsquad/100/100', member_count: 22, vault_metric: 450000 },
];

export const clan_list = (): Promise<ClanSummary[]> => {
    return mockApiCall(MOCK_CLANS_LIST);
};

export const clan_join = (clan_id: string): Promise<Clan> => {
    const clanSummary = MOCK_CLANS_LIST.find(c => c.id === clan_id);
    if (!clanSummary) {
        return Promise.reject({ message: 'Clan not found.' });
    }

    const newClan: Clan = {
        ...clanSummary,
        notice: `Welcome to ${clanSummary.name}. Be active!`,
        vault_coins: 12500,
        buffs: [],
        members: [
            { user_id: `leader_${clan_id}`, username: 'ClanLeader', role: 'leader', contribution: 10000, avatar_url: 'https://picsum.photos/seed/leader/100/100' },
            { user_id: 'officer_1', username: 'SubZero', role: 'officer', contribution: 7500, avatar_url: 'https://picsum.photos/seed/officer/100/100' },
            {
                user_id: MOCK_PROFILE.id,
                username: MOCK_PROFILE.username,
                role: 'member',
                contribution: 0,
                avatar_url: MOCK_PROFILE.avatar_url
            }
        ]
    };

    MOCK_CLAN = newClan;
    saveClan();
    return mockApiCall(newClan);
};

export const clan_details = (): Promise<Clan | null> => {
    return mockApiCall(MOCK_CLAN);
};

export const clan_create = (name: string, notice: string): Promise<Clan> => {
    const creationFee = 1000;
    if (MOCK_PROFILE.coins < creationFee) {
        return Promise.reject({ message: 'Not enough coins to create a clan.' });
    }

    MOCK_PROFILE.coins -= creationFee;
    saveProfile();
    
    const newClan: Clan = {
        id: `clan_${name.toLowerCase().replace(/\s/g, '_')}`,
        name,
        notice,
        crest_url: `https://picsum.photos/seed/${name}/100/100`,
        vault_metric: 0,
        vault_coins: 0,
        buffs: [],
        members: [{
            user_id: MOCK_PROFILE.id,
            username: MOCK_PROFILE.username,
            role: 'leader',
            contribution: 0,
            avatar_url: MOCK_PROFILE.avatar_url
        }]
    };
    MOCK_CLAN = newClan;
    saveClan();
    return mockApiCall(newClan);
};

export const clan_chat_recent = (): Promise<ClanChatMessage[]> => {
    return mockApiCall(MOCK_CHAT);
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

export const clan_chat_post = (message: string): Promise<ClanChatMessage> => {
    const cleanMessage = toxicityFilter(message);
    const newMessage: ClanChatMessage = {
        id: `msg_${Date.now()}`,
        user: MOCK_PROFILE.username,
        message: cleanMessage,
        created_at: 'Just now',
        is_self: true,
    };
    MOCK_CHAT.push(newMessage);
    if (MOCK_CHAT.length > 20) MOCK_CHAT.shift(); // Keep chat history from growing too big
    
    saveChat();
    return mockApiCall(newMessage);
};

export const clan_get_available_buffs = (): Promise<ClanBuff[]> => {
    return mockApiCall(MOCK_AVAILABLE_BUFFS);
};

export const clan_deposit_coins = (amount: number): Promise<{ new_clan_vault: number; new_user_coins: number }> => {
    if (amount <= 0 || MOCK_PROFILE.coins < amount) {
        return Promise.reject({ message: 'Invalid amount or insufficient funds.' });
    }
    if (!MOCK_CLAN) {
        return Promise.reject({ message: 'Not in a clan.' });
    }
    MOCK_PROFILE.coins -= amount;
    MOCK_CLAN.vault_coins += amount;
    saveProfile();
    saveClan();
    return mockApiCall({ new_clan_vault: MOCK_CLAN.vault_coins, new_user_coins: MOCK_PROFILE.coins });
};

export const clan_buy_buff = (buff_id: string): Promise<Clan> => {
    if (!MOCK_CLAN) return Promise.reject({ message: 'Not in a clan.' });

    const buff = MOCK_AVAILABLE_BUFFS.find(b => b.id === buff_id);
    if (!buff) return Promise.reject({ message: 'Buff not found.' });

    if (MOCK_CLAN.vault_coins < buff.cost) {
        return Promise.reject({ message: 'Not enough coins in clan vault.' });
    }
    MOCK_CLAN.vault_coins -= buff.cost;
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    MOCK_CLAN.buffs.push({ ...buff, active_until: expiry });

    saveClan();
    return mockApiCall(MOCK_CLAN);
};

export const clan_leave = (): Promise<boolean> => {
    MOCK_CLAN = null;
    saveClan();
    return mockApiCall(true);
};

export const clan_delete = (): Promise<boolean> => {
    // In a real scenario, you'd check if the user is the leader
    MOCK_CLAN = null;
    saveClan();
    return mockApiCall(true);
};

export const clan_promote_member = (user_id: string): Promise<Clan> => {
    if (!MOCK_CLAN) return Promise.reject({ message: 'Not in a clan.' });
    const member = MOCK_CLAN.members.find(m => m.user_id === user_id);
    if (member && member.role === 'member') {
        member.role = 'officer';
    }
    saveClan();
    return mockApiCall(MOCK_CLAN);
};

export const clan_demote_member = (user_id: string): Promise<Clan> => {
    if (!MOCK_CLAN) return Promise.reject({ message: 'Not in a clan.' });
    const member = MOCK_CLAN.members.find(m => m.user_id === user_id);
    if (member && member.role === 'officer') {
        member.role = 'member';
    }
    saveClan();
    return mockApiCall(MOCK_CLAN);
};

export const clan_kick_member = (user_id: string): Promise<Clan> => {
    if (!MOCK_CLAN) return Promise.reject({ message: 'Not in a clan.' });
    MOCK_CLAN.members = MOCK_CLAN.members.filter(m => m.user_id !== user_id);
    saveClan();
    return mockApiCall(MOCK_CLAN);
};