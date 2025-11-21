export type RaidDifficulty = 'easy' | 'medium' | 'hard';

export type RaidMode = 'strike_squad' | 'mega_crew' | 'clan_war';
export type RaidTeam = 'alpha' | 'beta';
export type RaidRole = 'player' | 'spectator';

export interface RaidWaveConfig {
  waveNumber: number;
  difficulty: RaidDifficulty;
  scoreThreshold: number;
  bossHp: number;
  spikeQuestions: number;
}

export interface RaidWaveState extends RaidWaveConfig {
  spikeQuestionIds: string[];
  damageDealt: number;
  completed: boolean;
}

export interface RaidQuestion {
  id: string;
  prompt: string;
  answers: string[];
  correctIndex: number;
  difficulty: RaidDifficulty;
  baseScore: number;
  isSpike: boolean;
  subject?: string;
}

export interface RaidQuestionRequest {
  wave: RaidWaveState;
  spikeSlots: number[];
  grade?: number | null;
  totalQuestions?: number;
}

export interface RaidParticipantState {
  userId: string;
  username: string;
  damageDealt: number;
  answersSubmitted: number;
  lastActive: string;
  isMvp?: boolean;
  team?: RaidTeam;
  role?: RaidRole;
  avatarColor?: string;
  cheerCount?: number;
}

export interface RaidRewardPool {
  xp: number;
  coins: number;
  badge: string;
}

export interface RaidStatus {
  raidId: string;
  bossId: string;
  status: 'scheduled' | 'active' | 'completed';
  rewardPool: RaidRewardPool;
  waves: RaidWaveState[];
  participants: RaidParticipantState[];
  spectators?: RaidParticipantState[];
  mode?: RaidMode;
  lobbyDurationSeconds?: number;
  panicPhaseSeconds?: number;
  arenaTheme?: string;
  activePhase?: 'briefing' | 'wave' | 'panic' | 'loot';
  createdBy?: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface RaidAnswerPayload {
  raidId: string;
  questionId: string;
  waveNumber: number;
  isCorrect: boolean;
  score: number;
  waveScoreThreshold: number;
  bossHp: number;
  timeTakenSeconds: number;
  participantId: string;
  answerText: string;
}

export interface RaidAnswerResult {
  damage: number;
  penaltySeconds: number;
  waveCleared: boolean;
  updatedWave: RaidWaveState;
  updatedParticipant: RaidParticipantState;
}

export interface RaidRewardBreakdown {
  userId: string;
  username: string;
  damageShare: number;
  baseXp: number;
  baseCoins: number;
  bonusXp: number;
  bonusCoins: number;
  totalXp: number;
  totalCoins: number;
  isMvp: boolean;
}

export interface RaidFinalizationResult {
  mvp: RaidParticipantState | null;
  rewards: RaidRewardBreakdown[];
}

export interface BossUnlockState {
  unlocked: boolean;
  consecutiveMissions: number;
  crushedTopics: string[];
  reason?: string;
}
