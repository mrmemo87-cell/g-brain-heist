export type Grade = 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type Batch =
  | '6A'
  | '6B'
  | '6C'
  | '7A'
  | '7B'
  | '7C'
  | '8A'
  | '8B'
  | '8C'
  | '9A'
  | '9B'
  | '9C'
  | '10A'
  | '10B'
  | '10C'
  | '11A'
  | '11B'
  | '11C'
  | '12A'
  | '12B'
  | '12C'
  | 'N/A';
export type UserRole = 'student' | 'teacher' | 'admin';
export type ClanRole = 'leader' | 'officer' | 'moderator' | 'member';
export type SoloDifficulty = 'easy' | 'medium' | 'hard';
export type TopicStatus = 'CRUSHED' | 'AVERAGE' | 'STRUGGLED';

export interface Profile {
  id: string;
  username: string;
  grade: Grade | null; // null for teachers or admins without grade assignment
  batch: Batch | null; // null for teachers
  role?: UserRole; // User role - student by default
  avatar_url: string;
  active_cosmetic_frame?: 'neon' | null;
  active_cosmetic_theme?: 'flicker' | null;
  active_cosmetic_effect?: 'glitch' | null;
  bio?: string | null;
  level: number;
  xp: number;
  coins: number;
  gemstones: number;
  streak: number;
  pvp_score: number; // PvP score: +3 per win, +1 per loss
  total_score?: number;
  last_seen: string;
  ap_now: number;
  ap_max: number;
  last_ap_update?: string; // ISO timestamp of last AP regeneration
  attack_power: number; // Base attack power
  defense_power: number; // Base defense power
  attack_power_effective?: number;
  defense_power_effective?: number;
  tutorial_completed?: boolean; // Whether user has completed onboarding tutorial
  admin_visible?: boolean; // Whether admin is visible in leaderboards/PvP (default: false)
  is_admin?: boolean;
  is_banned?: boolean;
  clan_id?: string | null;
  clan_name?: string | null;
  clan_role?: ClanRole;
  clan_custom_title?: string | null;
  clan_total_score?: number | null;
  active_clan_buffs?: ActiveClanBuff[];
  clan_buff_effects?: ClanBuffEffect;
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
    gemstones?: number;
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
export type AssignmentBatch = Batch | 'All';

export interface Question {
  id: string;
  body: string;
  options: string[];
  correct_answer?: string; // Added for database questions
  reward_xp: number;
  reward_coins: number;
  explanation?: string;
  points?: number;
  times_answered?: number;
  times_correct?: number;
  subject?: string;
  difficulty?: SoloDifficulty;
  time_limit?: number; // seconds
}

export interface PhaseQuestion {
  id: number;
  stem: string;
  opt1: string;
  opt2: string;
  opt3: string;
  opt4: string;
  lang: string;
  reward_xp: number;
  reward_coins: number;
}

export interface AttemptSubmissionResult {
  is_correct: boolean;
  correct_option: number;
  xp_awarded: number;
  coins_awarded: number;
  profile_xp: number;
  profile_coins: number;
  profile_streak: number;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  xp: number;
  coins: number;
  streak: number;
  batch: Batch | null;
  grade: Grade;
}

export interface BatchLeaderboardSummary {
  batch: Batch;
  total_xp: number;
  player_count: number;
}

export interface Announcement {
  id: string;
  text: string;
  priority?: string;
  active?: boolean;
  created_at: string;
  created_by: string | null;
  seen_at?: string | null;
}

export interface AdminOverviewStats {
  players_today: number;
  attempts_last_five_minutes: number;
  top_batch: Batch | null;
  top_batch_total_xp: number | null;
  last_error_message: string | null;
  last_error_at: string | null;
  total_gemstones?: number | null;
}

export interface AnswerResponse {
  correct: boolean;
  deltas: {
    xp: number;
    coins: number;
    gemstones?: number;
  };
  explanation?: string;
  score?: number;
  finalProfileValues?: { xp: number; coins: number; level: number; gemstones: number };
  pvpOutcome?: { won: boolean; opponentName: string; scoreChange: number };
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
  active_cosmetic_frame?: 'neon' | null;
  active_cosmetic_theme?: 'flicker' | null;
  active_cosmetic_effect?: 'glitch' | null;
  last_seen?: string;
  clan_name?: string;
  clan_id?: string;
  is_bot?: boolean;
  attack_power?: number;
  defense_power?: number;
  last_attacked_at?: string;
  total_score?: number;
  clan_total_score?: number;
}

export interface RaidAttackResult {
  result: 'win' | 'lose' | 'blocked';
  attacker_deltas: {
    xp: number;
    coins: number;
    gemstones?: number;
  };
  defender_deltas: {
    coins_loss: number;
  };
  shield_state: 'removed' | 'remaining' | 'none';
}

export type ShopItemRarity = 'common' | 'rare' | 'legendary';

export interface ShopItem {
  id: string;
  name: string;
  kind: 'shield' | 'cracker' | 'booster' | 'major_booster' | 'cosmetic' | 'mystery' | 'encryption_key' | 'firewall' | 'exploit_kit';
  price: number;
  gemstone_price?: number;
  rarity: ShopItemRarity;
  daily_limit: number;
  owned_today: number;
  description: string;
  effect_summary: string;
}

export interface PurchaseReceipt {
    receipt_id: string;
    coins_spent: number;
    gemstones_spent: number;
    new_balance: number;
    new_gemstone_balance: number;
    item: ShopItem;
    quantity: number;
}

export interface ToastMessage {
    id: number;
    message: string;
  type: 'success' | 'error' | 'info' | 'warning';
    retryAction?: () => void; // Optional retry callback for errors
}

export interface ClanMember {
    user_id: string;
    username: string;
  role: ClanRole;
  contribution: number;
  avatar_url: string;
  active_cosmetic_frame?: 'neon' | null;
  active_cosmetic_theme?: 'flicker' | null;
  active_cosmetic_effect?: 'glitch' | null;
  custom_title?: string | null;
  bio?: string | null;
  total_score?: number;
  xp?: number;
  pvp_score?: number;
}

// NEW: Competition-based clan member with scores
export interface ClanMemberWithScore {
    player_id: string;
    username: string;
    total_score: number;
    xp: number;
    pvp_score: number;
    level: number;
    avatar_url: string;
  active_cosmetic_frame?: 'neon' | null;
  active_cosmetic_theme?: 'glitch' | null;
  active_cosmetic_effect?: 'glitch' | null;
  role: ClanRole;
    joined_at: string;
}

export interface ClanBuffEffect {
  xp_multiplier?: number;
  attack_multiplier?: number;
  defense_multiplier?: number;
  shield_bonus_percent?: number;
  ap_bonus?: number;
}

export interface ClanBuffTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  cost: number;
  duration_minutes: number;
  effect: ClanBuffEffect;
}

export type ClanBuff = ClanBuffTemplate;

export interface ActiveClanBuff {
  id: string;
  clan_id: string;
  template_code: string;
  name: string;
  description: string;
  effect: ClanBuffEffect;
  activated_by?: string;
  activated_by_name?: string;
  activated_at: string;
  expires_at: string;
}

export interface Clan {
    id: string;
    name: string;
    crest_url?: string;
    notice: string;
    vault_metric: number; // This is total XP
    vault_coins: number;
  members: ClanMember[];
  active_buffs: ActiveClanBuff[];
  clan_total_score?: number;
  leader_id?: string;
}

export interface ClanSummary {
    id: string;
    name: string;
    crest_url?: string;
    member_count: number;
    vault_metric: number;
  clan_total_score?: number;
  notice?: string;
}

export interface ClanJoinRequest {
  id: string;
  clan_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  clan_name?: string;
  username?: string;
  avatar_url?: string;
  approver_id?: string | null;
}

// NEW: Competition-based clan score view
export interface CompetitionClanScore {
    id: string;
    name: string;
    description?: string;
    leader_id: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
    member_count: number;
    clan_total_score: number;
    avg_member_score: number;
    highest_member_score: number;
    highest_pvp_score: number;
}

// NEW: Competition clan leaderboard entry
export interface CompetitionClanLeaderboardEntry {
    rank: number;
    clan_id: string;
    clan_name: string;
    clan_total_score: number;
    member_count: number;
    avg_member_score: number;
    highest_member_score: number;
    leader_name: string;
    created_at: string;
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
  state: 'unused' | 'active' | 'consumed' | 'used' | 'expired';
  expires_at?: string | null; // ISO timestamp for when active items expire; null indicates indefinite duration
  activated_at?: string; // ISO timestamp for when item was activated
  description: string;
  effect_summary: string;
  attack_bonus?: number; // Permanent or timed attack bonus
  defense_bonus?: number; // Permanent or timed defense bonus
}

export type TournamentSeasonStatus = 'draft' | 'registration' | 'active' | 'completed' | 'archived';

export interface TournamentSeason {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  registration_opens?: string | null;
  registration_closes?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: TournamentSeasonStatus;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TournamentSignupPayload {
  season_id: string;
  school_name: string;
  school_code: string;
  contact_name?: string;
  contact_email?: string;
  notes?: string;
  roster?: Array<{
    player: string;
    grade?: string;
  }>;
}

export interface TournamentSignup extends TournamentSignupPayload {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
}

export type TournamentMatchStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

export interface TournamentMatch {
  id: string;
  season_id: string;
  round_number: number;
  match_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  scheduled_at?: string | null;
  location?: string | null;
  stream_url?: string | null;
  status: TournamentMatchStatus;
  winner_id?: string | null;
  metadata?: Record<string, any> | null;
}

export interface TournamentBracketTeam {
  name: string;
  code?: string;
}

export interface TournamentBracketMatch {
  id: string;
  round: number;
  matchNumber: number;
  teamA: TournamentBracketTeam | null;
  teamB: TournamentBracketTeam | null;
  scheduledAt: string | null;
  location: string | null;
  streamUrl: string | null;
  status: TournamentMatchStatus;
  winnerId: string | null;
}

export interface TournamentBracketRound {
  roundNumber: number;
  matches: TournamentBracketMatch[];
}

export interface TournamentSchedulePayload {
  matchId: string;
  scheduledAt: string | null;
  location: string | null;
  streamUrl: string | null;
  metadata?: Record<string, any>;
}

// ============================================================
// IELTS Test Prep Domain
// ============================================================

export type IELTSSectionKey = 'dashboard' | 'reading' | 'listening' | 'writing' | 'speaking' | 'mock-tests' | 'progress';

export interface IELTSUserProfile {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface IELTSReadingSet {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  est_band_min: number | null;
  est_band_max: number | null;
  duration_minutes: number;
  passage_text: string | null;
  required_tier: string | null;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

export interface IELTSReadingQuestion {
  id: number;
  set_id: number;
  question_order: number;
  question_type: string;
  body: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
}

export interface IELTSListeningSet {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  est_band_min: number | null;
  est_band_max: number | null;
  duration_minutes: number;
  audio_url: string;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

export interface IELTSWritingTask {
  id: number;
  slug: string;
  task_type: string;
  title: string | null;
  prompt: string;
  bands_target: string | null;
  sample_answer: string | null;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

export interface IELTSSpeakingTask {
  id: number;
  slug: string;
  part: number;
  prompt: string;
  follow_ups: Record<string, any> | null;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

export interface IELTSMockTest {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  reading_set_id: number | null;
  listening_set_id: number | null;
  writing_task1_id: number | null;
  writing_task2_id: number | null;
  speaking_task_part1_id: number | null;
  speaking_task_part2_id: number | null;
  speaking_task_part3_id: number | null;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

export interface IELTSReadingAttempt {
  id: string;
  set_id: number;
  started_at: string;
  completed_at: string | null;
  raw_score: number | null;
  total_questions: number | null;
  percent: number | null;
  est_band: number | null;
}

export interface IELTSListeningAttempt {
  id: string;
  set_id: number;
  started_at: string;
  completed_at: string | null;
  raw_score: number | null;
  total_questions: number | null;
  percent: number | null;
  est_band: number | null;
}

export interface IELTSWritingAttempt {
  id: string;
  task_id: number;
  submitted_at: string;
  band_overall: number | null;
  feedback: Record<string, any> | null;
}

export interface IELTSSpeakingAttempt {
  id: string;
  task_id: number;
  submitted_at: string;
  band_overall: number | null;
  band_fluency: number | null;
  band_pronunciation: number | null;
}

export interface IELTSMockTestAttempt {
  id: string;
  test_id: number;
  started_at: string;
  completed_at: string | null;
  overall_band_est: number | null;
  summary: Record<string, any> | null;
}

export interface IELTSRecentAttempts {
  reading: IELTSReadingAttempt[];
  listening: IELTSListeningAttempt[];
  writing: IELTSWritingAttempt[];
  speaking: IELTSSpeakingAttempt[];
  mock: IELTSMockTestAttempt[];
}

// ============================================================
// Brains Heist Progress & Analytics
// ============================================================

export interface SoloQuestionPerformance {
  topicId: string;
  branchId: string;
  difficulty: SoloDifficulty;
  timeLimitSeconds: number;
  answerTimeSeconds: number;
  wasCorrect: boolean;
  timestamp: string;
}

export interface SoloMissionSummary {
  topicId: string;
  branchId: string;
  difficulty: SoloDifficulty;
  questionCount: number;
  correctCount: number;
  missionScore: number;
  accuracy: number; // 0..1
  avgTimeRatio: number;
  recordedAt: string;
  retryAttempts?: number;
}

export interface TopicSummary {
  topicId: string;
  branchId: string;
  missionsCompleted: number;
  accuracy: number;
  avgTimeRatio: number;
  retryCount: number;
  status: TopicStatus;
  canUnlockNextTopic: boolean;
  updatedAt: string;
}

export interface BranchProgressSummary {
  branchId: string;
  topics: TopicSummary[];
  crushedTopics: number;
  canUnlockBossNode: boolean;
  recentMissionCount: number;
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

// Option can be either a simple string or an object with text and optional image
export interface QuestionOption {
  text: string;
  image_url?: string;
}

export interface TeacherQuestion {
  id: string;
  teacher_id: string;

  // Content
  subject: Subject;
  subject_id?: string | null;
  topic?: string;
  topic_name?: string | null;
  difficulty: QuestionDifficulty;
  question_text: string;
  image_url?: string | null; // Optional image for the question
  
  // Answer data
  question_type: QuestionType;
  options?: (string | QuestionOption)[]; // For multiple choice - can be strings or objects with images
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
  subject_id?: string;
  topic?: string;
  topic_name?: string;
  difficulty: QuestionDifficulty;
  question_text: string;
  image_url?: string; // Optional image URL for the question
  question_type: QuestionType;
  options?: (string | QuestionOption)[]; // Can be strings or objects with images
  correct_answer: string;
  explanation?: string;
  hints?: string[];
  time_limit?: number;
  points?: number;
  tags?: string[];
  grade_level?: string;
  is_public?: boolean;
}

export interface TeacherAssignmentSummary {
  id: string;
  teacher_id: string;
  subject_id?: string | null;
  subject_name: string;
  topic_name: string;
  batch: AssignmentBatch | null;
  difficulty?: QuestionDifficulty | null;
  question_count: number;
  title?: string | null;
  instructions?: string | null;
  assigned_at: string;
  due_at?: string | null;
  completed_count: number;
  student_count: number;
  assignment_mode?: 'batch' | 'custom';
}

export interface StudentAssignmentTask {
  assignment_id: string;
  subject_id?: string | null;
  subject_name: string;
  topic_name: string;
  batch: AssignmentBatch;
  teacher_username: string;
  assigned_at: string;
  due_at?: string | null;
  title?: string | null;
  instructions?: string | null;
  questions: TeacherQuestion[];
}

export interface TeacherAssignmentReportRow {
  student_id: string;
  student_name: string;
  batch: Batch | null;
  score: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  completed_at: string;
}

export interface CreateAssignmentRequest {
  teacher_id: string;
  subject: Subject;
  subject_id?: string;
  topic_name: string;
  batch?: AssignmentBatch;
  question_ids: string[];
  assigned_at: string;
  due_at?: string;
  title?: string;
  instructions?: string;
  difficulty?: QuestionDifficulty;
  assignment_mode?: 'batch' | 'custom';
  student_ids?: string[];
}

export interface StudentForAssignment {
  id: string;
  username: string;
  display_name: string;
  grade: number;
  batch: Batch | null;
  avatar_url?: string | null;
}

export interface AssignmentResultInput {
  assignmentId: string;
  correct: number;
  incorrect: number;
  accuracy: number;
  score: number;
  timeTakenSeconds: number;
}

export interface QuestionAttemptResult {
  is_correct: boolean;
  points_earned: number;
  correct_answer: string;
  explanation?: string;
}