// Storage Service - Handles localStorage persistence for game state

const STORAGE_KEYS = {
  PROFILE: 'gbh_profile',
  INVENTORY: 'gbh_inventory',
  CLAN: 'gbh_clan',
  CHAT: 'gbh_chat',
  SHOP_ITEMS: 'gbh_shop_items',
  LAST_SAVE: 'gbh_last_save',
  ALL_PLAYERS: 'gbh_all_players', // Shared list of all student profiles
  ACTIVITY_FEED: 'gbh_activity_feed', // Shared activity events
  TASK_PROGRESS: 'gbh_task_progress', // Daily/weekly task progress
  PURCHASE_COUNTS: 'gbh_purchase_counts', // Daily purchase tracking
  GEMSTONE_LEDGER: 'gbh_gemstone_ledger', // Tracks rare gemstone earnings limits
  KYRGYZ_BOTS: 'gbh_kyrgyz_bots', // Persistent Kyrgyz bot state for simulated activity
  TOPIC_STATS: 'gbh_topic_stats', // Aggregated per-topic performance
  BRANCH_HISTORY: 'gbh_branch_history', // Branch-level mission history
} as const;

export const saveToStorage = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEYS.LAST_SAVE, new Date().toISOString());
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage:`, error);
  }
};

export const loadFromStorage = <T>(key: string): T | null => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Failed to load ${key} from localStorage:`, error);
    return null;
  }
};

export const clearStorage = (): void => {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
};

export const getLastSaveTime = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.LAST_SAVE);
};

export const exportGameData = (): string => {
  const data: Record<string, string | null> = {};
  Object.entries(STORAGE_KEYS).forEach(([_, key]) => {
    data[key] = localStorage.getItem(key);
  });
  return JSON.stringify(data, null, 2);
};

export const importGameData = (jsonData: string): boolean => {
  try {
    const data = JSON.parse(jsonData);
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null) {
        localStorage.setItem(key, value as string);
      }
    });
    return true;
  } catch (error) {
    console.error('Failed to import game data:', error);
    return false;
  }
};

// Shared multiplayer functions
export const addPlayerToSharedList = (profile: { id: string; username: string; level: number; coins: number; gemstones: number; batch: string; avatar_url: string; active_cosmetic_frame?: 'neon' | null; has_shield?: boolean }): void => {
  try {
    const players = loadFromStorage<any[]>(STORAGE_KEYS.ALL_PLAYERS) || [];
    const existingIndex = players.findIndex(p => p.id === profile.id);
    
    if (existingIndex >= 0) {
      // Update existing player
      players[existingIndex] = { ...profile, last_seen: new Date().toISOString() };
    } else {
      // Add new player
      players.push({ ...profile, last_seen: new Date().toISOString() });
    }
    
    saveToStorage(STORAGE_KEYS.ALL_PLAYERS, players);
  } catch (error) {
    console.error('Failed to add player to shared list:', error);
  }
};

export const getSharedPlayers = (): any[] => {
  return loadFromStorage<any[]>(STORAGE_KEYS.ALL_PLAYERS) || [];
};

export const addActivityEvent = (event: { kind: string; actor: string; target?: string; data: any; created_at: string }): void => {
  try {
    const events = loadFromStorage<any[]>(STORAGE_KEYS.ACTIVITY_FEED) || [];
    const newEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...event,
      reactions: { '🔥': 0, '😮': 0, '😂': 0, '❤️': 0 },
      my_reaction: null,
    };
    
    events.unshift(newEvent); // Add to beginning
    
    // Keep only last 50 events
    if (events.length > 50) {
      events.splice(50);
    }
    
    saveToStorage(STORAGE_KEYS.ACTIVITY_FEED, events);
  } catch (error) {
    console.error('Failed to add activity event:', error);
  }
};

export const getActivityFeed = (): any[] => {
  return loadFromStorage<any[]>(STORAGE_KEYS.ACTIVITY_FEED) || [];
};

// Task tracking functions
interface TaskProgress {
  daily_quests_completed: number;
  daily_pvp_wins: number;
  weekly_tasks_completed: number;
  daily_reset_date: string; // YYYY-MM-DD format
  weekly_reset_date: string; // YYYY-MM-DD format (Sunday)
}

const getToday = (): string => {
  const today = new Date();
  return today.toISOString().split('T')[0]; // YYYY-MM-DD
};

const getThisSunday = (): string => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + daysUntilSunday);
  return sunday.toISOString().split('T')[0];
};

export const getTaskProgress = (): TaskProgress => {
  const stored = loadFromStorage<TaskProgress>(STORAGE_KEYS.TASK_PROGRESS);
  const today = getToday();
  const thisSunday = getThisSunday();
  
  // Initialize if doesn't exist
  if (!stored) {
    const initial: TaskProgress = {
      daily_quests_completed: 0,
      daily_pvp_wins: 0,
      weekly_tasks_completed: 0,
      daily_reset_date: today,
      weekly_reset_date: thisSunday,
    };
    saveToStorage(STORAGE_KEYS.TASK_PROGRESS, initial);
    return initial;
  }
  
  // Check if we need to reset daily progress
  if (stored.daily_reset_date !== today) {
    stored.daily_quests_completed = 0;
    stored.daily_pvp_wins = 0;
    stored.daily_reset_date = today;
    saveToStorage(STORAGE_KEYS.TASK_PROGRESS, stored);
  }
  
  // Check if we need to reset weekly progress
  if (stored.weekly_reset_date !== thisSunday) {
    stored.weekly_tasks_completed = 0;
    stored.weekly_reset_date = thisSunday;
    saveToStorage(STORAGE_KEYS.TASK_PROGRESS, stored);
  }
  
  return stored;
};

export const incrementQuestCompleted = (): void => {
  const progress = getTaskProgress();
  progress.daily_quests_completed += 1;
  saveToStorage(STORAGE_KEYS.TASK_PROGRESS, progress);
};

export const incrementPvPWin = (): void => {
  const progress = getTaskProgress();
  progress.daily_pvp_wins += 1;
  saveToStorage(STORAGE_KEYS.TASK_PROGRESS, progress);
};

export const incrementWeeklyTaskCompleted = (): void => {
  const progress = getTaskProgress();
  progress.weekly_tasks_completed += 1;
  saveToStorage(STORAGE_KEYS.TASK_PROGRESS, progress);
};

// Gemstone earning limits
interface GemstoneLedgerEntry {
  date: string; // YYYY-MM-DD
  earned: number;
}

interface GemstoneLedger {
  quest: GemstoneLedgerEntry;
  pvp: GemstoneLedgerEntry;
}

const createEmptyLedger = (today: string): GemstoneLedger => ({
  quest: { date: today, earned: 0 },
  pvp: { date: today, earned: 0 },
});

const normalizeLedgerEntry = (entry: GemstoneLedgerEntry, today: string) => {
  if (entry.date !== today) {
    entry.date = today;
    entry.earned = 0;
  }
};

const getGemstoneLedger = (): GemstoneLedger => {
  const today = getToday();
  const stored = loadFromStorage<GemstoneLedger>(STORAGE_KEYS.GEMSTONE_LEDGER);

  if (!stored) {
    const initial = createEmptyLedger(today);
    saveToStorage(STORAGE_KEYS.GEMSTONE_LEDGER, initial);
    return initial;
  }

  normalizeLedgerEntry(stored.quest, today);
  normalizeLedgerEntry(stored.pvp, today);
  saveToStorage(STORAGE_KEYS.GEMSTONE_LEDGER, stored);
  return stored;
};

export const canEarnQuestGemstone = (dailyCap: number = 2): boolean => {
  const ledger = getGemstoneLedger();
  return ledger.quest.earned < dailyCap;
};

export const recordQuestGemstoneAward = (amount: number): void => {
  if (amount <= 0) return;
  const ledger = getGemstoneLedger();
  ledger.quest.earned += amount;
  saveToStorage(STORAGE_KEYS.GEMSTONE_LEDGER, ledger);
};

export const canEarnPvpGemstone = (dailyCap: number = 1): boolean => {
  const ledger = getGemstoneLedger();
  return ledger.pvp.earned < dailyCap;
};

export const recordPvpGemstoneAward = (amount: number): void => {
  if (amount <= 0) return;
  const ledger = getGemstoneLedger();
  ledger.pvp.earned += amount;
  saveToStorage(STORAGE_KEYS.GEMSTONE_LEDGER, ledger);
};

// Purchase tracking functions
interface PurchaseCounts {
  reset_date: string; // YYYY-MM-DD format
  [item_id: string]: number | string;
}

export const getPurchaseCounts = (): PurchaseCounts => {
  const stored = loadFromStorage<PurchaseCounts>(STORAGE_KEYS.PURCHASE_COUNTS);
  const today = getToday();
  
  // Initialize if doesn't exist or if it's a new day
  if (!stored || stored.reset_date !== today) {
    const initial: PurchaseCounts = {
      reset_date: today,
    };
    saveToStorage(STORAGE_KEYS.PURCHASE_COUNTS, initial);
    return initial;
  }
  
  return stored;
};

export const incrementPurchaseCount = (item_id: string, quantity: number = 1): void => {
  const counts = getPurchaseCounts();
  const currentCount = typeof counts[item_id] === 'number' ? counts[item_id] : 0;
  counts[item_id] = (currentCount as number) + quantity;
  saveToStorage(STORAGE_KEYS.PURCHASE_COUNTS, counts);
};

export const getPurchaseCount = (item_id: string): number => {
  const counts = getPurchaseCounts();
  const value = counts[item_id];
  return typeof value === 'number' ? value : 0;
};

export { STORAGE_KEYS };
