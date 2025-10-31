export type Batch = '8A' | '8B' | '8C';

export interface Profile {
  id: string;
  username: string;
  batch: Batch;
  avatar_url: string;
  level: number;
  xp: number;
  coins: number;
  streak: number;
  last_seen: string;
  ap_now: number;
  ap_max: number;
  last_ap_update?: string; // ISO timestamp of last AP regeneration
  attack_power: number; // Base attack power
  defense_power: number; // Base defense power
}

export interface Task {
  id: string;
  title: string;
  kind: 'daily' | 'weekly';
  progress: number;
  target: number;
  reward_preview: string;
  expires_at: string;
  claimed?: boolean; // Whether reward has been claimed
  reward?: {
    xp: number;
    coins: number;
    items?: string[];
  };
}

export interface SessionStatus {
  active: boolean;
  remaining_seconds: number;
  current_multiplier: number;
  today_used: boolean;
}

export interface Caps {
  xp_daily_remaining: number;
  coins_daily_remaining: number;
  xp_weekly_remaining: number;
  coins_weekly_remaining: number;
  daily_xp_cap: number;
  daily_coins_cap: number;
  weekly_xp_cap: number;
  weekly_coins_cap: number;
}

export interface NewsEvent {
  id: string;
  kind: 'level_up' | 'quest_cleared' | 'weekly_claim' | 'purchase' | 'pvp_win' | 'pvp_blocked' | 'pvp_loss' | 'clan_create';
  actor: string;
  target?: string;
  data: {
    details?: string;
    item?: string;
  };
  created_at: string;
  reactions: { [key: string]: number };
  my_reaction: string | null;
}

export interface Subject {
  id: string;
  name: string;
  difficulty: number;
}

export interface Question {
  id: string;
  body: string;
  options: string[];
  reward_xp: number;
  reward_coins: number;
}

export interface AnswerResponse {
  correct: boolean;
  deltas: {
    xp: number;
    coins: number;
  };
  explanation?: string;
}

export interface RaidTarget {
  user_id: string;
  username: string;
  level: number;
  coins: number;
  batch: Batch;
  has_shield: boolean;
  est_win_rate: number;
  avatar_url: string;
  last_seen?: string;
  clan_name?: string;
}

export interface RaidAttackResult {
  result: 'win' | 'lose' | 'blocked';
  attacker_deltas: {
    xp: number;
    coins: number;
  };
  defender_deltas: {
    coins_loss: number;
  };
  shield_state: 'removed' | 'remaining' | 'none';
}

export interface ShopItem {
  id: string;
  name: string;
  kind: 'shield' | 'cracker' | 'booster' | 'major_booster' | 'cosmetic' | 'mystery' | 'encryption_key' | 'firewall' | 'exploit_kit';
  price: number;
  daily_limit: number;
  owned_today: number;
  description: string;
  effect_summary: string;
}

export interface PurchaseReceipt {
    receipt_id: string;
    coins_spent: number;
    new_balance: number;
    item: ShopItem;
    quantity: number;
}

export interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

export interface ClanMember {
    user_id: string;
    username: string;
    role: 'leader' | 'officer' | 'member';
    contribution: number;
    avatar_url: string;
}

export interface ClanBuff {
    id: string;
    name: string;
    description: string;
    cost: number;
    active_until?: string;
}

export interface Clan {
    id: string;
    name: string;
    crest_url?: string;
    notice: string;
    vault_metric: number; // This is total XP
    vault_coins: number;
    members: ClanMember[];
    buffs: ClanBuff[];
}

export interface ClanSummary {
    id: string;
    name: string;
    crest_url?: string;
    member_count: number;
    vault_metric: number;
}

export interface ClanChatMessage {
    id: string;
    user: string;
    message: string;
    created_at: string;
    is_self: boolean;
}

export interface InventoryItem {
    inv_id: string;
    item_id: string;
    name: string;
    kind: ShopItem['kind'];
    state: 'unused' | 'active';
    expires_at?: string; // ISO timestamp for when active items expire
    activated_at?: string; // ISO timestamp for when item was activated
    description: string;
    effect_summary: string;
    attack_bonus?: number; // Permanent or timed attack bonus
    defense_bonus?: number; // Permanent or timed defense bonus
}