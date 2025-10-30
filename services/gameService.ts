import { Profile, Task, SessionStatus, Caps, NewsEvent, Subject, Question, AnswerResponse, RaidTarget, RaidAttackResult, ShopItem, PurchaseReceipt, Clan, ClanChatMessage, ClanSummary, ClanMember, ClanBuff, InventoryItem } from '../types';

const MOCK_DELAY = 500;

// Helper to simulate API calls
const mockApiCall = <T,>(data: T): Promise<T> => {
  return new Promise(resolve => setTimeout(() => resolve(data), MOCK_DELAY));
};

let MOCK_PROFILE: Profile = {
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
};

let MOCK_CLAN: Clan | null = null;

let MOCK_CHAT: ClanChatMessage[] = [
    { id: `msg_${Date.now() - 300000}`, user: 'CypherPunk', message: 'Anyone up for a raid later?', created_at: '5m ago', is_self: false },
    { id: `msg_${Date.now() - 180000}`, user: 'NeonGhost', message: 'Yeah, I have enough AP. Let\'s do it.', created_at: '3m ago', is_self: true },
    { id: `msg_${Date.now() - 60000}`, user: 'ZeroCool', message: 'I am in! Let\'s hack some noobs.', created_at: '1m ago', is_self: false },
];

const MOCK_AVAILABLE_BUFFS: ClanBuff[] = [
    { id: 'buff_xp_1', name: 'XP Surge', description: '+10% XP for all members for 24h.', cost: 5000 },
    { id: 'buff_shield_1', name: 'Reinforced Shields', description: 'Clan member shields are 20% stronger for 24h.', cost: 7500 },
    { id: 'buff_attack_1', name: 'Attack Protocol', description: '+5% Attack Power for all members for 24h.', cost: 10000 },
];

let MOCK_INVENTORY: InventoryItem[] = [
    {
        inv_id: 'inv_1',
        item_id: 'item_booster',
        name: 'Booster',
        kind: 'booster',
        state: 'unused',
        description: 'Grants 1.5x XP from all sources for 1 hour.',
        effect_summary: '1.5x XP (1h)'
    },
    {
        inv_id: 'inv_2',
        item_id: 'item_shield',
        name: 'Shield',
        kind: 'shield',
        state: 'active',
        expires_at: 'Until Cracked',
        description: 'Blocks one incoming hack attempt before shattering.',
        effect_summary: 'Blocks 1 attack'
    },
     {
        inv_id: 'inv_3',
        item_id: 'item_cracker',
        name: 'Cracker',
        kind: 'cracker',
        state: 'unused',
        description: 'Bypasses an active enemy shield during a hack.',
        effect_summary: 'Negates 1 shield'
    },
];

export const whoami = (): Promise<Profile> => {
  return mockApiCall(MOCK_PROFILE);
};

export const tasks_list = (): Promise<Task[]> => {
  const tasks: Task[] = [
    {
      id: 'task_d1',
      title: 'Complete 3 Knowledge Quests',
      kind: 'daily',
      progress: 1,
      target: 3,
      reward_preview: '175 XP, 350 Coins',
      expires_at: '23:59:59',
    },
    {
      id: 'task_d2',
      title: 'Win a PvP Hack',
      kind: 'daily',
      progress: 0,
      target: 1,
      reward_preview: '100 XP, 50 Coins',
      expires_at: '23:59:59',
    },
    {
      id: 'task_w1',
      title: 'Complete 15 Daily Tasks this week',
      kind: 'weekly',
      progress: 9,
      target: 15,
      reward_preview: '500 XP, 400 Coins + 1 Item Crate',
      expires_at: '3d 14h',
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
  const news: NewsEvent[] = [
    {
      id: 'evt_1',
      kind: 'pvp_win',
      actor: 'NeonGhost',
      target: 'DataWraith',
      data: { details: 'Stole 125 Coins' },
      created_at: '5m ago',
      reactions: { '🔥': 5, '😮': 2, '😂': 0, '❤️': 1 },
      my_reaction: '🔥',
    },
    {
      id: 'evt_2',
      kind: 'level_up',
      actor: 'CypherPunk',
      data: { details: 'Reached Level 15!' },
      created_at: '12m ago',
      reactions: { '🔥': 12, '😮': 8, '😂': 1, '❤️': 3 },
      my_reaction: null,
    },
    {
      id: 'evt_3',
      kind: 'quest_cleared',
      actor: 'NeonGhost',
      data: { details: 'Cryptography 101' },
      created_at: '28m ago',
      reactions: { '🔥': 2, '😮': 0, '😂': 0, '❤️': 4 },
      my_reaction: '❤️',
    },
    {
      id: 'evt_4',
      kind: 'purchase',
      actor: 'GlitchMaster',
      data: { item: 'Major Booster' },
      created_at: '1h ago',
      reactions: { '🔥': 1, '😮': 3, '😂': 0, '❤️': 0 },
      my_reaction: null,
    },
    {
      id: 'evt_5',
      kind: 'pvp_blocked',
      actor: 'DataWraith',
      target: 'NeonGhost',
      data: { details: 'Attack blocked by Shield' },
      created_at: '2h ago',
      reactions: { '🔥': 0, '😮': 1, '😂': 6, '❤️': 0 },
      my_reaction: null,
    },
  ];
  return mockApiCall(news);
};

export const mcq_subjects_list = (): Promise<Subject[]> => {
    const subjects: Subject[] = [
        { id: 'subj_crypto', name: 'Cryptography 101', difficulty: 2 },
        { id: 'subj_network', name: 'Network Security', difficulty: 4 },
        { id: 'subj_social', name: 'Social Engineering', difficulty: 3 },
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
    return mockApiCall(response);
};

export const raid_targets = (): Promise<RaidTarget[]> => {
    const targets: RaidTarget[] = [
        { user_id: 'usr_tgt_1', username: 'DataWraith', level: 13, coins: 4500, batch: '8A', has_shield: true, est_win_rate: 0.45, avatar_url: 'https://picsum.photos/seed/datawraith/100/100' },
        { user_id: 'usr_tgt_2', username: 'CypherPunk', level: 15, coins: 12000, batch: '8C', has_shield: false, est_win_rate: 0.30, avatar_url: 'https://picsum.photos/seed/cypherpunk/100/100' },
        { user_id: 'usr_tgt_3', username: 'GlitchMaster', level: 11, coins: 2500, batch: '8B', has_shield: false, est_win_rate: 0.65, avatar_url: 'https://picsum.photos/seed/glitchmaster/100/100' },
        { user_id: 'usr_tgt_4', username: 'ZeroCool', level: 12, coins: 6000, batch: '8A', has_shield: true, est_win_rate: 0.50, avatar_url: 'https://picsum.photos/seed/zerocool/100/100' },
    ];
    return mockApiCall(targets);
};

export const raid_attack = (defender_id: string, use_cracker: boolean, target: RaidTarget): Promise<RaidAttackResult> => {
    let result: 'win' | 'lose' | 'blocked' = 'lose';
    
    if (target.has_shield && !use_cracker) {
        result = 'blocked';
    } else {
        // 50/50 chance to win if shield is bypassed or not present
        result = Math.random() > 0.5 ? 'win' : 'lose';
    }
    
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
    
    return mockApiCall(response);
};

const MOCK_SHOP_ITEMS: ShopItem[] = [
    { id: 'item_shield', name: 'Shield', kind: 'shield', price: 150, daily_limit: 3, owned_today: 1, description: 'Blocks one incoming hack attempt before shattering.', effect_summary: 'Blocks 1 attack' },
    { id: 'item_cracker', name: 'Cracker', kind: 'cracker', price: 200, daily_limit: 2, owned_today: 0, description: 'Bypasses an active enemy shield during a hack.', effect_summary: 'Negates 1 shield' },
    { id: 'item_booster', name: 'Booster', kind: 'booster', price: 250, daily_limit: 1, owned_today: 0, description: 'Grants 1.5x XP from all sources for 1 hour.', effect_summary: '1.5x XP (1h)' },
    { id: 'item_major_booster', name: 'Major Booster', kind: 'major_booster', price: 400, daily_limit: 1, owned_today: 0, description: 'Grants a massive 2.0x XP from all sources for 1 hour.', effect_summary: '2.0x XP (1h)' },
    { id: 'item_cosmetic_frame', name: 'Neon Frame', kind: 'cosmetic', price: 750, daily_limit: 1, owned_today: 0, description: 'A flashy neon frame for your avatar. Show off your style!', effect_summary: 'Purely cosmetic' },
    { id: 'item_cosmetic_theme', name: 'Glitch Theme', kind: 'cosmetic', price: 1200, daily_limit: 1, owned_today: 0, description: 'Apply a glitchy, datamosh effect to your profile card.', effect_summary: 'Purely cosmetic' },
];


export const shop_list = (): Promise<ShopItem[]> => {
    return mockApiCall(MOCK_SHOP_ITEMS);
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

    if ((item.owned_today + quantity) > item.daily_limit) {
        return Promise.reject({ message: 'Daily purchase limit exceeded.' });
    }

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
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour for boosters
    
    if (item.kind === 'shield') {
      item.expires_at = 'Until Cracked';
    } else {
      item.expires_at = expiry.toISOString();
    }
    
    // Deactivate other boosters if a new one is used
    if (item.kind === 'booster' || item.kind === 'major_booster') {
        MOCK_INVENTORY.forEach(i => {
            if ((i.kind === 'booster' || i.kind === 'major_booster') && i.inv_id !== inv_id && i.state === 'active') {
                i.state = 'consumed';
                i.expires_at = 'Replaced';
            }
        });
    }
    
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

    return mockApiCall(MOCK_CLAN);
};

export const clan_leave = (): Promise<boolean> => {
    MOCK_CLAN = null;
    return mockApiCall(true);
};

export const clan_delete = (): Promise<boolean> => {
    // In a real scenario, you'd check if the user is the leader
    MOCK_CLAN = null;
    return mockApiCall(true);
};

export const clan_promote_member = (user_id: string): Promise<Clan> => {
    if (!MOCK_CLAN) return Promise.reject({ message: 'Not in a clan.' });
    const member = MOCK_CLAN.members.find(m => m.user_id === user_id);
    if (member && member.role === 'member') {
        member.role = 'officer';
    }
    return mockApiCall(MOCK_CLAN);
};

export const clan_demote_member = (user_id: string): Promise<Clan> => {
    if (!MOCK_CLAN) return Promise.reject({ message: 'Not in a clan.' });
    const member = MOCK_CLAN.members.find(m => m.user_id === user_id);
    if (member && member.role === 'officer') {
        member.role = 'member';
    }
    return mockApiCall(MOCK_CLAN);
};

export const clan_kick_member = (user_id: string): Promise<Clan> => {
    if (!MOCK_CLAN) return Promise.reject({ message: 'Not in a clan.' });
    MOCK_CLAN.members = MOCK_CLAN.members.filter(m => m.user_id !== user_id);
    return mockApiCall(MOCK_CLAN);
};