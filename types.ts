export type Batch = '8A' | '8B' | '8C';
export type UserRole = 'student' | 'teacher' | 'admin';

export interface Profile {
  id: string;
  username: string;
  batch: Batch | null; // null for teachers
  role?: UserRole; // User role - student by default
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
  tutorial_completed?: boolean; // Whether user has completed onboarding tutorial
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

export interface SubjectData {
  id: string;
  name: string;
  difficulty: number;
}

export type Subject = 'Maths' | 'Science' | 'English' | 'Russian Language' | 'Kyrgyz Language' | 'German Language' | 'Geography' | 'Global Perspective' | 'ICT';

export interface Question {
  id: string;
  body: string;
  options: string[];
  correct_answer?: string; // Added for database questions
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
    retryAction?: () => void; // Optional retry callback for errors
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

// ============================================================
// Teacher Question System Types
// ============================================================

export interface Teacher {
  id: string;
  user_id: string;
  school_name?: string;
  subject_specializations?: string[];
  verified: boolean;
  bio?: string;
  created_at: string;
  updated_at: string;
}

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface TeacherQuestion {
  id: string;
  teacher_id: string;
  
  // Content
  subject: Subject;
  topic?: string;
  difficulty: QuestionDifficulty;
  question_text: string;
  
  // Answer data
  question_type: QuestionType;
  options?: string[]; // For multiple choice - matches database column name
  correct_answer: string;
  
  // Additional info
  explanation?: string;
  hints?: string[];
  time_limit: number; // seconds
  points: number; // XP reward
  
  // Organization
  tags?: string[];
  grade_level?: string;
  is_public: boolean;
  is_active: boolean;
  
  // Stats
  times_answered: number;
  times_correct: number;
  
  created_at: string;
  updated_at: string;
}

export interface QuestionAttempt {
  id: string;
  student_id: string;
  question_id: string;
  quest_session_id?: string;
  answer_given: string;
  is_correct: boolean;
  time_taken?: number;
  points_earned: number;
  attempted_at: string;
}

export interface QuestTemplate {
  id: string;
  teacher_id: string;
  title: string;
  description?: string;
  subject: Subject;
  difficulty?: QuestionDifficulty;
  question_ids: string[];
  question_count: number;
  xp_reward: number;
  coins_reward: number;
  min_level: number;
  max_attempts?: number;
  is_public: boolean;
  is_active: boolean;
  times_completed: number;
  average_score: number;
  created_at: string;
  updated_at: string;
}

export interface Class {
  id: string;
  teacher_id: string;
  class_name: string;
  class_code: string;
  description?: string;
  subject?: string;
  grade_level?: string;
  is_active: boolean;
  created_at: string;
}

export interface ClassStudent {
  class_id: string;
  student_id: string;
  joined_at: string;
}

// Request/Response types for teacher operations
export interface CreateQuestionRequest {
  subject: Subject;
  topic?: string;
  difficulty: QuestionDifficulty;
  question_text: string;
  question_type: QuestionType;
  options?: string[]; // Matches database column name
  correct_answer: string;
  explanation?: string;
  hints?: string[];
  time_limit?: number;
  points?: number;
  tags?: string[];
  grade_level?: string;
  is_public?: boolean;
}

export interface QuestionAttemptResult {
  is_correct: boolean;
  points_earned: number;
  correct_answer: string;
  explanation?: string;
}