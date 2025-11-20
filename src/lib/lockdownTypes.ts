export type GameEventType =
  | 'QUESTION'
  | 'HACK'
  | 'STEAL'
  | 'ALARM'
  | 'ASSIST'
  | 'ROUND_SUMMARY';

export interface QuestionEvent {
  type: 'QUESTION';
  playerId: string;
  correct: boolean;
  round?: number;
}

export interface HackEvent {
  type: 'HACK';
  playerId: string;
  alarmImpact?: number;
  round?: number;
}

export interface StealEvent {
  type: 'STEAL';
  playerId: string;
  targetId: string;
  amount: number;
  successful: boolean;
  round?: number;
}

export interface AlarmEvent {
  type: 'ALARM';
  playerId: string;
  amount: number;
  round?: number;
}

export interface AssistEvent {
  type: 'ASSIST';
  playerId: string;
  round?: number;
}

export type GameEvent =
  | QuestionEvent
  | HackEvent
  | StealEvent
  | AlarmEvent
  | AssistEvent;

export interface RoundSummary {
  round: number;
  events: GameEvent[];
}

export interface PlayerRecord {
  id: string;
  name: string;
  coins: number;
  correctAnswers?: number;
  incorrectAnswers?: number;
  hacksUsed?: number;
  alarmContribution?: number;
  steals?: StealEvent[];
  assists?: number;
  roundsPlayed?: number;
}

export interface GameState {
  players: PlayerRecord[];
  rounds?: RoundSummary[];
  events?: GameEvent[];
  totalRounds?: number;
}
