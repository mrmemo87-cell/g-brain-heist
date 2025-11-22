// Types and enums for Lockdown Countdown mode

export enum GamePhase {
  LOBBY = "LOBBY",
  VOTING_RULES = "VOTING_RULES",
  ACTIVE_ROUNDS = "ACTIVE_ROUNDS",
  PAUSED = "PAUSED",
  FINISHED = "FINISHED",
}

export enum EntryRoute {
  SAFE = "SAFE",
  STEALTH = "STEALTH",
  FORCE = "FORCE",
}

export enum QuestionRiskRoute {
  SAFE = "SAFE",
  RISKY = "RISKY",
  ALL_IN = "ALL_IN",
}

export enum AlarmLevel {
  LOW = "LOW",
  GUARDED = "GUARDED",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum FinishReason {
  COIN_GOAL_REACHED = "COIN_GOAL_REACHED",
  ALARM_MAXED = "ALARM_MAXED",
  TIME_EXPIRED = "TIME_EXPIRED",
}

export enum HeistCondition {
  SILENT_MODE = "SILENT_MODE",
  PARANOID_SYSTEMS = "PARANOID_SYSTEMS",
  CHAOS_BUTTON = "CHAOS_BUTTON",
  DOUBLE_PAYOUTS = "DOUBLE_PAYOUTS",
}

export type ChaosEffect = {
  id: string;
  description: string;
  disableSafeRoute?: boolean;
  extraAlarmOnHack?: number;
  bonusCoinsMultiplier?: number;
};

export type RoomSettings = {
  coinGoal: number;
  durationMs: number;
  panicAlarmThreshold: number;
  panicTimeThresholdMs: number;
  alarmMax: number;
  mostWantedHeat: number;
  baseCorrectCoins: number;
  baseWrongPenalty: number;
  baseAlarmOnWrong: number;
  safeAlarmModifier: number;
  riskyAlarmModifier: number;
  allInAlarmModifier: number;
  safeHeatGain: number;
  riskyHeatGain: number;
  allInHeatGain: number;
  hackStealBase: number;
  hackHeatGain: number;
  hackAlarmGain: number;
  scrubHeatReduction: number;
  greedCoinBonus: number;
  greedHeatGain: number;
  entryRouteModifiers: Record<EntryRoute, {
    coinMultiplier: number;
    heatMultiplier: number;
    hackStealMultiplier: number;
    alarmOnHackMultiplier: number;
  }>;
};

export type PlayerAccuracy = {
  correct: number;
  total: number;
};

export type PlayerState = {
  id: string;
  name?: string;
  coins: number;
  heat: number;
  mostWanted: boolean;
  entryRoute?: EntryRoute;
  riskRoute?: QuestionRiskRoute;
  accuracy: PlayerAccuracy;
  disconnected?: boolean;
  clanId?: string;
  clanName?: string;
  clanAvatarUrl?: string;
  currentRegion?: string;
};

export type ClanStats = {
  clanId: string;
  clanName: string;
  color?: string;
  avatarUrl?: string;
  correctAnswers: number;
  totalAnswers: number;
  percentage: number;
};

export type RegionStats = {
  regionId: string;
  clanStats: ClanStats[];
  topClan?: ClanStats;
};

export type RuleSet = {
  votes: Partial<Record<HeistCondition, number>>;
  selectedCondition?: HeistCondition;
  chaosEffects: ChaosEffect[];
  safeRouteDisabled?: boolean;
};

export type GameState = {
  phase: GamePhase;
  players: Record<string, PlayerState>;
  alarm: number;
  alarmLevel: AlarmLevel;
  panicModeActive: boolean;
  ruleSet: RuleSet;
  roomSettings: RoomSettings;
  remainingTimeMs: number;
  round: number;
  finishReason?: FinishReason;
  regionStats?: Record<string, RegionStats>;
};

export type JoinGameAction = {
  type: "JOIN";
  playerId: string;
  name?: string;
  clanId?: string;
  clanName?: string;
  clanAvatarUrl?: string;
};

export type LeaveGameAction = {
  type: "LEAVE";
  playerId: string;
};

export type ChooseEntryRouteAction = {
  type: "CHOOSE_ENTRY_ROUTE";
  playerId: string;
  route: EntryRoute;
};

export type ChooseRiskRouteAction = {
  type: "CHOOSE_RISK_ROUTE";
  playerId: string;
  route: QuestionRiskRoute;
};

export type SubmitAnswerAction = {
  type: "SUBMIT_ANSWER";
  playerId: string;
  correct: boolean;
  route?: QuestionRiskRoute;
};

export type PostRoundAction = {
  type: "ROUND_POST_ACTION";
  playerId: string;
  action: "hack" | "scrub" | "greed";
  targetId?: string;
};

export type VoteConditionAction = {
  type: "VOTE_CONDITION";
  playerId: string;
  condition: HeistCondition;
};

export type FinalizeConditionAction = {
  type: "FINALIZE_CONDITION";
  condition: HeistCondition;
};

export type ChaosTriggerAction = {
  type: "CHAOS_TRIGGER";
  effect: ChaosEffect;
};

export type TickAction = {
  type: "TICK";
  elapsedMs: number;
};

export type AdvancePhaseAction = {
  type: "ADVANCE_PHASE";
};

export type StartGameAction = {
  type: "START_GAME";
};

export type TriggerPanicAction = {
  type: "TRIGGER_PANIC";
};

export type PauseGameAction = {
  type: "PAUSE_GAME";
};

export type ResumeGameAction = {
  type: "RESUME_GAME";
};

export type KickPlayerAction = {
  type: "KICK_PLAYER";
  playerId: string;
};

export type GameAction =
  | JoinGameAction
  | LeaveGameAction
  | ChooseEntryRouteAction
  | ChooseRiskRouteAction
  | SubmitAnswerAction
  | PostRoundAction
  | VoteConditionAction
  | FinalizeConditionAction
  | ChaosTriggerAction
  | TickAction
  | AdvancePhaseAction
  | StartGameAction
  | TriggerPanicAction
  | PauseGameAction
  | ResumeGameAction
  | KickPlayerAction;

