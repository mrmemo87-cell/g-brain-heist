export type PlayerId = string & { readonly __brand: "PlayerId" };
export type RoomId = string & { readonly __brand: "RoomId" };

export enum EntryRoute {
  VentCrawlers = "VENT_CRAWLERS",
  FrontGateFakes = "FRONT_GATE_FAKES",
  BackdoorGhosts = "BACKDOOR_GHOSTS",
}

export enum QuestionRiskRoute {
  Safe = "SAFE",
  Risky = "RISKY",
  Insane = "INSANE",
}

export enum AlarmLevel {
  Normal = "NORMAL",
  Yellow = "YELLOW",
  Orange = "ORANGE",
  Red = "RED",
}

export enum HeistCondition {
  DoublePayouts = "DOUBLE_PAYOUTS",
  SilentMode = "SILENT_MODE",
  ParanoidSystems = "PARANOID_SYSTEMS",
  ShortTimers = "SHORT_TIMERS",
}

export enum PlayerRoleStatus {
  Normal = "NORMAL",
  MostWanted = "MOST_WANTED",
  Frozen = "FROZEN",
  LockedOut = "LOCKED_OUT",
  Shielded = "SHIELDED",
}

export enum GamePhase {
  Lobby = "LOBBY",
  VotingRules = "VOTING_RULES",
  ActiveRounds = "ACTIVE_ROUNDS",
  PanicMode = "PANIC_MODE",
  Finished = "FINISHED",
}

export enum FinishReason {
  SuccessGoalReached = "SUCCESS_GOAL_REACHED",
  FailureAlarmMaxed = "FAILURE_ALARM_MAXED",
  FailureTimeExpired = "FAILURE_TIME_EXPIRED",
}

export type AlarmChangeReason =
  | "WRONG_ANSWER"
  | "HACK_FAILURE"
  | "HACK_SUCCESS"
  | "ROUTE_RISK"
  | "CHAOS_BUTTON"
  | "TIMER_TICK"
  | "MANUAL_ADJUST"
  | "PANIC_MODE";

export interface AccuracyStats {
  totalAnswers: number;
  correctAnswers: number;
  currentStreak: number;
  longestStreak: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  coins: number;
  heat: number;
  chosenEntryRoute?: EntryRoute;
  currentRiskRoute?: QuestionRiskRoute;
  roleStatus: PlayerRoleStatus;
  isMostWanted: boolean;
  accuracy: AccuracyStats;
  hacksAttempted: number;
  hacksSucceeded: number;
  actionCards: string[];
}

export interface RoomSettings {
  roomId: RoomId;
  coinGoal: number;
  timeLimitSeconds: number;
  maxPlayers: number;
  teacherId?: string;
  allowChaosButton: boolean;
  startingCoins: number;
}

export interface HeistRuleSet {
  selectedConditions: HeistCondition[];
  chaosButtonUsed: boolean;
  panicModeAlarmThreshold: number;
  panicModeTimeBufferSeconds: number;
}

export interface AlarmState {
  currentAlarm: number;
  alarmLevel: AlarmLevel;
  lastChangeReason?: AlarmChangeReason;
}

export interface ActiveQuestionState {
  questionId: string;
  riskRoute: QuestionRiskRoute;
  startTimestamp: number;
  timeLimitSeconds: number;
  answeredPlayers: PlayerId[];
}

export interface PanicModeState {
  active: boolean;
  triggeredBy: AlarmChangeReason | "TIME_PRESSURE" | "GOAL_NEAR";
  triggeredAtRound?: number;
}

export interface GameState {
  roomId: RoomId;
  phase: GamePhase;
  roundNumber: number;
  ruleSet: HeistRuleSet;
  settings: RoomSettings;
  players: Record<PlayerId, PlayerState>;
  alarm: AlarmState;
  panicMode: PanicModeState;
  activeQuestion?: ActiveQuestionState;
  finishReason?: FinishReason;
  createdAt: number;
  updatedAt: number;
}

export type JoinRoomAction = {
  type: "JOIN_ROOM";
  roomId: RoomId;
  player: PlayerState;
};

export type LeaveRoomAction = {
  type: "LEAVE_ROOM";
  roomId: RoomId;
  playerId: PlayerId;
};

export type ChooseEntryRouteAction = {
  type: "CHOOSE_ENTRY_ROUTE";
  roomId: RoomId;
  playerId: PlayerId;
  entryRoute: EntryRoute;
};

export type ChooseRiskRouteAction = {
  type: "CHOOSE_RISK_ROUTE";
  roomId: RoomId;
  playerId: PlayerId;
  riskRoute: QuestionRiskRoute;
};

export type SubmitAnswerAction = {
  type: "SUBMIT_ANSWER";
  roomId: RoomId;
  playerId: PlayerId;
  correct: boolean;
  riskRoute: QuestionRiskRoute;
};

export type PickActionCardAction = {
  type: "PICK_ACTION_CARD";
  roomId: RoomId;
  playerId: PlayerId;
  cardId: string;
};

export type TriggerChaosButtonAction = {
  type: "TRIGGER_CHAOS_BUTTON";
  roomId: RoomId;
  triggeredBy: PlayerId | "SYSTEM";
};

export type TickTimerAction = {
  type: "TICK_TIMER";
  roomId: RoomId;
  elapsedSeconds: number;
};

export type StartQuestionAction = {
  type: "START_QUESTION";
  roomId: RoomId;
  question: ActiveQuestionState;
};

export type EndGameAction = {
  type: "END_GAME";
  roomId: RoomId;
  reason: FinishReason;
};

export type LockdownCountdownAction =
  | JoinRoomAction
  | LeaveRoomAction
  | ChooseEntryRouteAction
  | ChooseRiskRouteAction
  | SubmitAnswerAction
  | PickActionCardAction
  | TriggerChaosButtonAction
  | TickTimerAction
  | StartQuestionAction
  | EndGameAction;

export const ALARM_THRESHOLDS = {
  yellow: 30,
  orange: 60,
  red: 90,
  failure: 100,
} as const;

export const QUESTION_RISK_CONFIG: Record<
  QuestionRiskRoute,
  {
    baseRewardCoins: number;
    alarmImpactOnWrong: number;
    heatGainOnCorrect: number;
    description: string;
  }
> = {
  [QuestionRiskRoute.Safe]: {
    baseRewardCoins: 5,
    alarmImpactOnWrong: 0,
    heatGainOnCorrect: 0,
    description: "Easy path with minimal reward and no alarm risk.",
  },
  [QuestionRiskRoute.Risky]: {
    baseRewardCoins: 10,
    alarmImpactOnWrong: 8,
    heatGainOnCorrect: 2,
    description: "Balanced challenge with better coins and moderate alarm risk.",
  },
  [QuestionRiskRoute.Insane]: {
    baseRewardCoins: 18,
    alarmImpactOnWrong: 15,
    heatGainOnCorrect: 5,
    description: "High stakes, highest rewards, and significant alarm and heat impact.",
  },
} as const;

export const ENTRY_ROUTE_MODIFIERS: Record<
  EntryRoute,
  {
    hackDefenseModifier: number;
    coinGainModifier: number;
    heatGainModifier: number;
    alarmPressureModifier: number;
    description: string;
  }
> = {
  [EntryRoute.VentCrawlers]: {
    hackDefenseModifier: 1.25,
    coinGainModifier: 0.95,
    heatGainModifier: 0.85,
    alarmPressureModifier: 1.15,
    description: "Expert at dodging hacks; struggle when global alarm surges.",
  },
  [EntryRoute.FrontGateFakes]: {
    hackDefenseModifier: 0.9,
    coinGainModifier: 1.15,
    heatGainModifier: 1,
    alarmPressureModifier: 1,
    description: "Flashy entrance yields early coins but invites more hack attempts.",
  },
  [EntryRoute.BackdoorGhosts]: {
    hackDefenseModifier: 1,
    coinGainModifier: 1,
    heatGainModifier: 1.25,
    alarmPressureModifier: 0.9,
    description: "Stealth specialists with better hack success yet higher personal heat.",
  },
} as const;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  roomId: "" as RoomId,
  coinGoal: 200,
  timeLimitSeconds: 1200,
  maxPlayers: 24,
  teacherId: undefined,
  allowChaosButton: true,
  startingCoins: 0,
};

export const DEFAULT_HEIST_RULE_SET: HeistRuleSet = {
  selectedConditions: [],
  chaosButtonUsed: false,
  panicModeAlarmThreshold: ALARM_THRESHOLDS.red,
  panicModeTimeBufferSeconds: 120,
};
