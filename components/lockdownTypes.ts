export type AlarmLevel = 'NORMAL' | 'YELLOW' | 'ORANGE' | 'RED';

export type EntryRoute = 'VENTS' | 'ROOF' | 'MAIN_GATE' | 'SEWERS' | 'SIDE_DOOR' | string;

export type GamePhase = 'LOBBY' | 'RULES' | 'ROUND' | 'RESULTS';

export interface TeacherCommand {
  type: 'START_GAME' | 'TRIGGER_PANIC' | 'DROP_EVENT' | 'ADVANCE_PHASE';
  payload?: any;
}

export interface PlayerState {
  id: string;
  codename: string;
  coins: number;
  heat: number;
  entryRoute?: EntryRoute;
  mostWanted?: boolean;
}

export interface HeistConditionOption {
  id: string;
  title: string;
  description?: string;
  percentage: number;
  votes: number;
}

export interface AlarmState {
  value: number;
  level: AlarmLevel;
  panicMode?: boolean;
}

export interface RoundState {
  panicMode?: boolean;
  topAgents: PlayerState[];
}

export interface AwardResult {
  title: string;
  recipient: string;
  description?: string;
}

export interface GameResults {
  richest: PlayerState[];
  awards?: AwardResult[];
}

export interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  entryRouteDistribution: Record<EntryRoute, number>;
  heistConditions: HeistConditionOption[];
  selectedConditionIds: string[];
  alarm: AlarmState;
  round?: RoundState;
  results?: GameResults;
}
