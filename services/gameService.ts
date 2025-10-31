import { Profile, Task, SessionStatus, Caps, NewsEvent, Subject, Question, AnswerResponse, RaidTarget, RaidAttackResult, ShopItem, PurchaseReceipt, Clan, ClanChatMessage, ClanSummary, ClanMember, ClanBuff, InventoryItem } from '../types';
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addPlayerToSharedList, getSharedPlayers, addActivityEvent, getActivityFeed, getTaskProgress, incrementQuestCompleted, incrementPvPWin, incrementWeeklyTaskCompleted, getPurchaseCount, incrementPurchaseCount } from './storageService';
import { supabase } from './supabaseClient';

const MOCK_DELAY = 500;

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

  // ====== AP REGENERATION LOGIC ======
  const now = new Date();
  const lastApUpdate = profile.last_ap_update ? new Date(profile.last_ap_update) : now;
  const msElapsed = now.getTime() - lastApUpdate.getTime();
  const minutesElapsed = Math.floor(msElapsed / (1000 * 60));
  
  // Regenerate 1 AP per 10 minutes (600,000 ms)
  const apToRegen = Math.floor(minutesElapsed / 10);
  
  if (apToRegen > 0 && profile.ap_now < profile.ap_max) {
    const newAP = Math.min(profile.ap_now + apToRegen, profile.ap_max);
    
    // Update AP and last_ap_update timestamp
    await supabase
      .from('users')
      .update({ 
        ap_now: newAP,
        last_ap_update: now.toISOString(),
        last_seen: now.toISOString()
      })
      .eq('id', user.id);
    
    profile.ap_now = newAP;
    profile.last_ap_update = now.toISOString();
  } else {
    // Just update last_seen
    await supabase
      .from('users')
      .update({ last_seen: now.toISOString() })
      .eq('id', user.id);
  }

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
      reward_preview: '175 XP, 350 Coins',
      expires_at: dailyExpiry,
      claimed: claimedTasks.includes('task_d1'),
      reward: { xp: 175, coins: 350 },
    },
    {
      id: 'task_d2',
      title: 'Win a PvP Hack',
      kind: 'daily',
      progress: progress.daily_pvp_wins,
      target: 1,
      reward_preview: '100 XP, 50 Coins',
      expires_at: dailyExpiry,
      claimed: claimedTasks.includes('task_d2'),
      reward: { xp: 100, coins: 50 },
    },
    {
      id: 'task_w1',
      title: 'Complete 15 Daily Tasks this week',
      kind: 'weekly',
      progress: progress.weekly_tasks_completed,
      target: 15,
      reward_preview: '500 XP, 400 Coins + 1 Item Crate',
      expires_at: weeklyExpiry,
      claimed: claimedTasks.includes('task_w1'),
      reward: { xp: 500, coins: 400, items: ['mystery_crate'] },
    },
  ];
  return mockApiCall(tasks);
};

export const task_claim = async (task_id: string): Promise<{ xp: number; coins: number; items?: string[] }> => {
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
    .select('xp, coins')
    .eq('id', user.id)
    .single();
  
  if (!profile) throw new Error('Profile not found');
  
  await updateProfile(user.id, {
    xp: profile.xp + task.reward.xp,
    coins: profile.coins + task.reward.coins,
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
  
  // Fetch activities from database
  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error('Error fetching activities:', error);
    return mockApiCall([]);
  }
  
  if (!activities || activities.length === 0) {
    return mockApiCall([]);
  }
  
  // Get all activity IDs
  const activityIds = activities.map(a => a.id);
  
  // Fetch reactions for these activities
  const { data: reactionsData } = await supabase
    .from('activity_reactions')
    .select('activity_id, emoji, user_id')
    .in('activity_id', activityIds);
  
  // Aggregate reactions by activity and emoji
  const reactionsByActivity: Record<string, { reactions: Record<string, number>, myReaction: string | null }> = {};
  
  activities.forEach(activity => {
    reactionsByActivity[activity.id] = {
      reactions: { '🔥': 0, '😮': 0, '😂': 0, '❤️': 0 },
      myReaction: null,
    };
  });
  
  (reactionsData || []).forEach(reaction => {
    if (reactionsByActivity[reaction.activity_id]) {
      // Increment count
      if (!reactionsByActivity[reaction.activity_id].reactions[reaction.emoji]) {
        reactionsByActivity[reaction.activity_id].reactions[reaction.emoji] = 0;
      }
      reactionsByActivity[reaction.activity_id].reactions[reaction.emoji]++;
      
      // Check if this is the current user's reaction
      if (reaction.user_id === user.id) {
        reactionsByActivity[reaction.activity_id].myReaction = reaction.emoji;
      }
    }
  });
  
  // Convert database activities to NewsEvent format
  const events: NewsEvent[] = activities.map(activity => {
    const timeAgo = getTimeAgo(new Date(activity.created_at));
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
    };
  });
  
  return mockApiCall(events);
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

export const mcq_answer_submit = async (question_id: string, choice: string): Promise<AnswerResponse> => {
    const user = await getCurrentUser();
    const isCorrect = choice === 'Option B (Correct)';
    
    const response: AnswerResponse = {
        correct: isCorrect,
        deltas: {
            xp: isCorrect ? 20 : -5,
            coins: isCorrect ? 30 : 0,
        },
        explanation: isCorrect ? 'Well done, agent!' : 'Incorrect. The correct answer was B because of reasons.'
    };
    
    // Update profile with rewards/penalties in database
    const { data: currentProfile, error: fetchError } = await supabase
        .from('users')
        .select('xp, coins, level')
        .eq('id', user.id)
        .single();
    
    if (fetchError || !currentProfile) throw new Error('Failed to fetch profile');
    
    const newXP = currentProfile.xp + response.deltas.xp;
    const newCoins = Math.max(0, currentProfile.coins + response.deltas.coins);
    
    // Check for level up (simple formula: level = floor(xp / 100))
    const newLevel = Math.floor(newXP / 100) + 1;
    const leveledUp = newLevel > currentProfile.level;
    
    await updateProfile(user.id, {
        xp: newXP,
        coins: newCoins,
        level: newLevel,
    });
    
    // Log activity if level up. Use `data.details` consistently so the feed renderer can display a human string.
    if (leveledUp) {
        const { data: unameResult } = await supabase.from('users').select('username').eq('id', user.id).single();
        await supabase.from('activities').insert({
            kind: 'level_up',
            actor_id: user.id,
            actor_username: unameResult?.username || 'Unknown',
            data: { details: String(newLevel) },
        });
    }
    
    // Track quest progress (use localStorage for now)
    if (isCorrect) {
        currentQuestAnswers++;
        if (currentQuestAnswers >= 5) {
            incrementQuestCompleted();
            currentQuestAnswers = 0;
            
            const progress = getTaskProgress();
            if (progress.daily_quests_completed === 3 || progress.daily_pvp_wins === 1) {
                incrementWeeklyTaskCompleted();
            }
        }
    }
    
    return mockApiCall(response);
};

export const raid_targets = async (): Promise<RaidTarget[]> => {
    const user = await getCurrentUser();
    
    // Fetch all users except current user from database with their clan info
    const { data: players, error } = await supabase
        .from('users')
        .select(`
            id, username, level, coins, batch, avatar_url, last_seen, attack_power, defense_power,
            clan_members!left (
                clans!inner (name)
            )
        `)
        .neq('id', user.id)
        .limit(20);
    
    if (error) throw error;
    
    if (!players || players.length === 0) {
        // No other players yet, return empty array
        return mockApiCall([]);
    }
    
    // TODO: Check inventory for shields
    const realTargets: RaidTarget[] = players.map((p: any) => {
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
    
    return mockApiCall(realTargets);
};

export const raid_attack = async (defender_id: string, use_cracker: boolean, target: RaidTarget): Promise<RaidAttackResult> => {
    const user = await getCurrentUser();
    
    // Call the Postgres RPC function to handle all combat logic server-side
    const { data, error } = await supabase.rpc('rpc_hack_attempt', {
        p_defender_id: defender_id
    });
    
    if (error) {
        console.error('Hack attempt RPC error:', error);
        throw new Error(error.message || 'Hack attempt failed');
    }
    
    if (!data) {
        throw new Error('No response from hack attempt');
    }
    
    // The RPC returns the exact format we need
    const response: RaidAttackResult = {
        result: data.result,
        attacker_deltas: data.attacker_deltas,
        defender_deltas: data.defender_deltas,
        shield_state: data.shield_state,
    };
    
    // Track progress (localStorage for now)
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

export const shop_buy = async (item_id: string, quantity: number, current_coins: number): Promise<PurchaseReceipt> => {
    const user = await getCurrentUser();
    const item = MOCK_SHOP_ITEMS.find(i => i.id === item_id);
    
    if (!item) {
        return Promise.reject({ message: 'Item not found.' });
    }
    
    const totalCost = item.price * quantity;

    if (totalCost > current_coins) {
        return Promise.reject({ message: 'Not enough coins.' });
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

    // Update profile coins
    await updateProfile(user.id, { coins: current_coins - totalCost });
    
    // Add purchase record
    await supabase.from('shop_purchases').insert({
        user_id: user.id,
        item_id: item.id,
        quantity: quantity,
        total_cost: totalCost,
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
        coins_spent: totalCost,
        new_balance: current_coins - totalCost,
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
        .lt('expires_at', now)
        .neq('expires_at', 'Until Cracked');
    
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
    
    // Shields remain active until cracked
    const expiresAt = (item.kind === 'shield') 
        ? 'Until Cracked' 
        : expiry.toISOString();
    
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
            end: expiry.toISOString()
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
    return clan_details();
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
    return await clan_details();
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
    
    // Get user's clan
    const { data: membership } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .single();
    
    if (!membership) {
        return Promise.reject({ message: 'You are not in a clan.' });
    }
    
    // Insert chat message
    const { data: newMessage, error } = await supabase
        .from('clan_chat')
        .insert({
            clan_id: membership.clan_id,
            user_id: user.id,
            message: cleanMessage,
        })
        .select(`
            id,
            message,
            created_at,
            user_id,
            users!inner (username)
        `)
        .single();
    
    if (error || !newMessage) {
        return Promise.reject({ message: 'Failed to post message.' });
    }
    
    const chatMessage: ClanChatMessage = {
        id: newMessage.id,
        user: (newMessage as any).users.username,
        message: newMessage.message,
        created_at: 'Just now',
        is_self: true,
    };
    
    return mockApiCall(chatMessage);
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

// ============================================
// Profile Avatar Management
// ============================================

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
    return data;
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
    const { data: earnedAchievements, error: earnedError } = await supabase
        .from('user_achievements')
        .select('achievement_id, earned_at')
        .eq('user_id', user.id);

    if (earnedError) throw earnedError;

    const earnedMap: Record<string, string> = {};
    (earnedAchievements || []).forEach((ua: any) => {
        earnedMap[ua.achievement_id] = ua.earned_at;
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

    const { data, error } = await supabase.rpc('rpc_check_achievements', {
        p_user_id: user.id,
    });

    if (error) throw error;

    // Return newly earned achievements
    return data[0]?.newly_earned || [];
};