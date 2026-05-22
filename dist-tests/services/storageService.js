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
};
const memoryStore = new Map();
const hasLocalStorage = () => {
    try {
        return typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage != null;
    }
    catch {
        return false;
    }
};
const getStorageItem = (key) => {
    if (!hasLocalStorage())
        return memoryStore.get(key) ?? null;
    return globalThis.localStorage.getItem(key);
};
const setStorageItem = (key, value) => {
    if (!hasLocalStorage()) {
        memoryStore.set(key, value);
        return;
    }
    globalThis.localStorage.setItem(key, value);
};
const removeStorageItem = (key) => {
    if (!hasLocalStorage()) {
        memoryStore.delete(key);
        return;
    }
    globalThis.localStorage.removeItem(key);
};
export const saveToStorage = (key, data) => {
    try {
        setStorageItem(key, JSON.stringify(data));
        setStorageItem(STORAGE_KEYS.LAST_SAVE, new Date().toISOString());
    }
    catch (error) {
        console.error(`Failed to save ${key} to localStorage:`, error);
    }
};
export const loadFromStorage = (key) => {
    try {
        const item = getStorageItem(key);
        return item ? JSON.parse(item) : null;
    }
    catch (error) {
        console.error(`Failed to load ${key} from localStorage:`, error);
        return null;
    }
};
export const clearStorage = () => {
    try {
        Object.values(STORAGE_KEYS).forEach(key => {
            removeStorageItem(key);
        });
    }
    catch (error) {
        console.error('Failed to clear localStorage:', error);
    }
};
export const getLastSaveTime = () => {
    return getStorageItem(STORAGE_KEYS.LAST_SAVE);
};
export const exportGameData = () => {
    const data = {};
    Object.entries(STORAGE_KEYS).forEach(([_, key]) => {
        data[key] = getStorageItem(key);
    });
    return JSON.stringify(data, null, 2);
};
export const importGameData = (jsonData) => {
    try {
        const data = JSON.parse(jsonData);
        Object.entries(data).forEach(([key, value]) => {
            if (value !== null) {
                setStorageItem(key, value);
            }
        });
        return true;
    }
    catch (error) {
        console.error('Failed to import game data:', error);
        return false;
    }
};
// Shared multiplayer functions
export const addPlayerToSharedList = (profile) => {
    try {
        const players = loadFromStorage(STORAGE_KEYS.ALL_PLAYERS) || [];
        const existingIndex = players.findIndex(p => p.id === profile.id);
        if (existingIndex >= 0) {
            // Update existing player
            players[existingIndex] = { ...profile, last_seen: new Date().toISOString() };
        }
        else {
            // Add new player
            players.push({ ...profile, last_seen: new Date().toISOString() });
        }
        saveToStorage(STORAGE_KEYS.ALL_PLAYERS, players);
    }
    catch (error) {
        console.error('Failed to add player to shared list:', error);
    }
};
export const getSharedPlayers = () => {
    return loadFromStorage(STORAGE_KEYS.ALL_PLAYERS) || [];
};
export const addActivityEvent = (event) => {
    try {
        const events = loadFromStorage(STORAGE_KEYS.ACTIVITY_FEED) || [];
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
    }
    catch (error) {
        console.error('Failed to add activity event:', error);
    }
};
export const getActivityFeed = () => {
    return loadFromStorage(STORAGE_KEYS.ACTIVITY_FEED) || [];
};
const getToday = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
};
const getThisSunday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + daysUntilSunday);
    return sunday.toISOString().split('T')[0];
};
export const getTaskProgress = () => {
    const stored = loadFromStorage(STORAGE_KEYS.TASK_PROGRESS);
    const today = getToday();
    const thisSunday = getThisSunday();
    // Initialize if doesn't exist
    if (!stored) {
        const initial = {
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
export const incrementQuestCompleted = () => {
    const progress = getTaskProgress();
    progress.daily_quests_completed += 1;
    saveToStorage(STORAGE_KEYS.TASK_PROGRESS, progress);
};
export const incrementPvPWin = () => {
    const progress = getTaskProgress();
    progress.daily_pvp_wins += 1;
    saveToStorage(STORAGE_KEYS.TASK_PROGRESS, progress);
};
export const incrementWeeklyTaskCompleted = () => {
    const progress = getTaskProgress();
    progress.weekly_tasks_completed += 1;
    saveToStorage(STORAGE_KEYS.TASK_PROGRESS, progress);
};
const createEmptyLedger = (today) => ({
    quest: { date: today, earned: 0 },
    pvp: { date: today, earned: 0 },
});
const normalizeLedgerEntry = (entry, today) => {
    if (entry.date !== today) {
        entry.date = today;
        entry.earned = 0;
    }
};
const getGemstoneLedger = () => {
    const today = getToday();
    const stored = loadFromStorage(STORAGE_KEYS.GEMSTONE_LEDGER);
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
export const canEarnQuestGemstone = (dailyCap = 2) => {
    const ledger = getGemstoneLedger();
    return ledger.quest.earned < dailyCap;
};
export const recordQuestGemstoneAward = (amount) => {
    if (amount <= 0)
        return;
    const ledger = getGemstoneLedger();
    ledger.quest.earned += amount;
    saveToStorage(STORAGE_KEYS.GEMSTONE_LEDGER, ledger);
};
export const canEarnPvpGemstone = (dailyCap = 1) => {
    const ledger = getGemstoneLedger();
    return ledger.pvp.earned < dailyCap;
};
export const recordPvpGemstoneAward = (amount) => {
    if (amount <= 0)
        return;
    const ledger = getGemstoneLedger();
    ledger.pvp.earned += amount;
    saveToStorage(STORAGE_KEYS.GEMSTONE_LEDGER, ledger);
};
export const getPurchaseCounts = () => {
    const stored = loadFromStorage(STORAGE_KEYS.PURCHASE_COUNTS);
    const today = getToday();
    // Initialize if doesn't exist or if it's a new day
    if (!stored || stored.reset_date !== today) {
        const initial = {
            reset_date: today,
        };
        saveToStorage(STORAGE_KEYS.PURCHASE_COUNTS, initial);
        return initial;
    }
    return stored;
};
export const incrementPurchaseCount = (item_id, quantity = 1) => {
    const counts = getPurchaseCounts();
    const currentCount = typeof counts[item_id] === 'number' ? counts[item_id] : 0;
    counts[item_id] = currentCount + quantity;
    saveToStorage(STORAGE_KEYS.PURCHASE_COUNTS, counts);
};
export const getPurchaseCount = (item_id) => {
    const counts = getPurchaseCounts();
    const value = counts[item_id];
    return typeof value === 'number' ? value : 0;
};
export { STORAGE_KEYS };
