export type ClanId = string;
export type ZoneId = string;

export interface ClanMetadata {
  id: ClanId;
  name: string;
  color: string;
}

// Re-export from shared utility — single source of truth for clan colors
export { getClanColor, assignSessionClanColor, getUsedSessionColors, SESSION_COLOR_PALETTE } from "../../utils/clanColors";

export interface Zone {
  id: ZoneId;
  name: string;
  baseValue: number;
}

// Default zones for the default map
export const ZONES: Zone[] = [
  { id: "zone-1", name: "Server Room", baseValue: 100 },
  { id: "zone-2", name: "Mainframe", baseValue: 150 },
  { id: "zone-3", name: "Security Hub", baseValue: 120 },
  { id: "zone-4", name: "Data Vault", baseValue: 200 },
  { id: "zone-5", name: "Power Grid", baseValue: 100 },
  { id: "zone-6", name: "Network Core", baseValue: 180 },
  { id: "zone-7", name: "Quantum Nexus", baseValue: 220 },
  { id: "zone-8", name: "Signal Chamber", baseValue: 190 },
];

// City map districts
export const CITY_ZONES: Zone[] = [
  { id: "zone-1", name: "1st District", baseValue: 100 },
  { id: "zone-2", name: "2nd District", baseValue: 150 },
  { id: "zone-3", name: "3rd District", baseValue: 120 },
  { id: "zone-4", name: "4th District", baseValue: 200 },
  { id: "zone-5", name: "5th District", baseValue: 100 },
  { id: "zone-6", name: "6th District", baseValue: 180 },
  { id: "zone-7", name: "7th District", baseValue: 220 },
  { id: "zone-8", name: "8th District", baseValue: 190 },
  { id: "zone-9", name: "9th District", baseValue: 160 },
  { id: "zone-10", name: "10th District", baseValue: 140 },
];

// Kyrgyzstan map regions (oblasts)
export const KYRGYZSTAN_ZONES: Zone[] = [
  { id: "zone-1", name: "Batken", baseValue: 120 },
  { id: "zone-2", name: "Chuy", baseValue: 200 },
  { id: "zone-3", name: "Jalal-Abad", baseValue: 180 },
  { id: "zone-4", name: "Naryn", baseValue: 150 },
  { id: "zone-5", name: "Osh", baseValue: 190 },
  { id: "zone-6", name: "Talas", baseValue: 130 },
  { id: "zone-7", name: "Ysyk-Köl", baseValue: 160 },
];

// USA map states + DC
export const USA_ZONES: Zone[] = [
  { id: "zone-1", name: "Alabama", baseValue: 150 },
  { id: "zone-2", name: "Alaska", baseValue: 150 },
  { id: "zone-3", name: "Arizona", baseValue: 150 },
  { id: "zone-4", name: "Arkansas", baseValue: 150 },
  { id: "zone-5", name: "California", baseValue: 150 },
  { id: "zone-6", name: "Colorado", baseValue: 150 },
  { id: "zone-7", name: "Connecticut", baseValue: 150 },
  { id: "zone-8", name: "District of Columbia", baseValue: 150 },
  { id: "zone-9", name: "Delaware", baseValue: 150 },
  { id: "zone-10", name: "Florida", baseValue: 150 },
  { id: "zone-11", name: "Georgia", baseValue: 150 },
  { id: "zone-12", name: "Hawaii", baseValue: 150 },
  { id: "zone-13", name: "Idaho", baseValue: 150 },
  { id: "zone-14", name: "Illinois", baseValue: 150 },
  { id: "zone-15", name: "Indiana", baseValue: 150 },
  { id: "zone-16", name: "Iowa", baseValue: 150 },
  { id: "zone-17", name: "Kansas", baseValue: 150 },
  { id: "zone-18", name: "Kentucky", baseValue: 150 },
  { id: "zone-19", name: "Louisiana", baseValue: 150 },
  { id: "zone-20", name: "Maine", baseValue: 150 },
  { id: "zone-21", name: "Maryland", baseValue: 150 },
  { id: "zone-22", name: "Massachusetts", baseValue: 150 },
  { id: "zone-23", name: "Michigan", baseValue: 150 },
  { id: "zone-24", name: "Minnesota", baseValue: 150 },
  { id: "zone-25", name: "Mississippi", baseValue: 150 },
  { id: "zone-26", name: "Missouri", baseValue: 150 },
  { id: "zone-27", name: "Montana", baseValue: 150 },
  { id: "zone-28", name: "Nebraska", baseValue: 150 },
  { id: "zone-29", name: "Nevada", baseValue: 150 },
  { id: "zone-30", name: "New Hampshire", baseValue: 150 },
  { id: "zone-31", name: "New Jersey", baseValue: 150 },
  { id: "zone-32", name: "New Mexico", baseValue: 150 },
  { id: "zone-33", name: "New York", baseValue: 150 },
  { id: "zone-34", name: "North Carolina", baseValue: 150 },
  { id: "zone-35", name: "North Dakota", baseValue: 150 },
  { id: "zone-36", name: "Ohio", baseValue: 150 },
  { id: "zone-37", name: "Oklahoma", baseValue: 150 },
  { id: "zone-38", name: "Oregon", baseValue: 150 },
  { id: "zone-39", name: "Pennsylvania", baseValue: 150 },
  { id: "zone-40", name: "Rhode Island", baseValue: 150 },
  { id: "zone-41", name: "South Carolina", baseValue: 150 },
  { id: "zone-42", name: "South Dakota", baseValue: 150 },
  { id: "zone-43", name: "Tennessee", baseValue: 150 },
  { id: "zone-44", name: "Texas", baseValue: 150 },
  { id: "zone-45", name: "Utah", baseValue: 150 },
  { id: "zone-46", name: "Vermont", baseValue: 150 },
  { id: "zone-47", name: "Virginia", baseValue: 150 },
  { id: "zone-48", name: "Washington", baseValue: 150 },
  { id: "zone-49", name: "West Virginia", baseValue: 150 },
  { id: "zone-50", name: "Wisconsin", baseValue: 150 },
  { id: "zone-51", name: "Wyoming", baseValue: 150 },
];

// United Kingdom map regions
export const UNITED_KINGDOM_ZONES: Zone[] = [
  { id: "zone-1", name: "Ireland", baseValue: 150 },
  { id: "zone-2", name: "Isle of Man", baseValue: 150 },
  { id: "zone-3", name: "Jersey", baseValue: 150 },
  { id: "zone-4", name: "Guernsey", baseValue: 150 },
  { id: "zone-5", name: "Northern Ireland", baseValue: 150 },
  { id: "zone-6", name: "Scotland", baseValue: 150 },
  { id: "zone-7", name: "Wales", baseValue: 150 },
  { id: "zone-8", name: "South West", baseValue: 150 },
  { id: "zone-9", name: "South East", baseValue: 150 },
  { id: "zone-10", name: "Greater London", baseValue: 150 },
  { id: "zone-11", name: "East of England", baseValue: 150 },
  { id: "zone-12", name: "West Midlands", baseValue: 150 },
  { id: "zone-13", name: "East Midlands", baseValue: 150 },
  { id: "zone-14", name: "Yorkshire and the Humber", baseValue: 150 },
  { id: "zone-15", name: "North West", baseValue: 150 },
  { id: "zone-16", name: "North East", baseValue: 150 },
];

// Map-specific zone configurations
export const MAP_ZONES: Record<string, Zone[]> = {
  default: ZONES,
  city: CITY_ZONES,
  kyrgyzstan: KYRGYZSTAN_ZONES,
  usa: USA_ZONES,
  unitedkingdom: UNITED_KINGDOM_ZONES,
};

// Helper to get zones for a specific map
export const getZonesForMap = (mapId: string = 'default'): Zone[] => {
  return MAP_ZONES[mapId] || ZONES;
};

export const CONFIG = {
  TOTAL_COIN_LOOT: 100000,
  TOTAL_XP_LOOT: 5000,
  TOTAL_GEM_LOOT: 5,
  MAX_COINS_PER_PLAYER: 20000,
  MAX_XP_PER_PLAYER: 1000,
  MAX_GEMS_PER_PLAYER: 1,
  GEM_ELIGIBILITY_MIN_QUESTIONS: 5,
  GEM_ELIGIBILITY_MIN_ACCURACY: 0.5,
  STREAK_BONUS_THRESHOLD: 3,
  STREAK_BONUS_POINTS: 1,
  FAST_ANSWER_THRESHOLD_MS: 5000,
  FAST_ANSWER_BONUS: 1,
  BASE_CORRECT_POINTS: 1,
  WRONG_ANSWER_PENALTY: 1, // Points deducted from battle score for wrong answers
  WRONG_ANSWER_INFLUENCE_PENALTY_PERCENT: 0.1, // Percentage of current zone capture removed on wrong answers
  MIN_CONTRIBUTION_SCORE: 1,
  INFLUENCE_PER_POINT: 10,
};

export type GamePhase = "LOBBY" | "ACTIVE" | "ENDED";

export interface PlayerStats {
  id: string;
  name: string;
  clanId: ClanId;
  clanName: string;
  questionsAnswered: number;
  questionsCorrect: number;
  totalAnswerTimeMs: number;
  fastAnswers: number;
  streak: number;
  bestStreak: number;
  battleScore: number;
  selectedZoneId: ZoneId | null;
}

export interface ZoneState {
  id: ZoneId;
  influence: Record<ClanId, number>; // ClanId -> Influence points
}

export interface BattleQuestionOption {
  text: string;
  image_url?: string;
}

export interface BattleQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  options?: (string | BattleQuestionOption)[]; // For multiple choice questions - can be strings or objects with images
  wrong_answers?: string[]; // Fallback for legacy format
  subject?: string;
  topic?: string;
  difficulty?: string;
  question_type?: string;
  image_url?: string; // Optional question image
}

export interface ClanTerritoryGameState {
  phase: GamePhase;
  timer: number; // Remaining seconds (computed from gameEndTime - now)
  gameStartTime?: number; // Unix timestamp when game started
  gameEndTime?: number; // Unix timestamp when game should end
  endReason?: "TIME_UP" | "TEACHER_ENDED" | "TEACHER_DISMISSED";
  players: Record<string, PlayerStats>;
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  questions: BattleQuestion[];
  mapId?: string;
  allowClanlessPlayers: boolean;
}

// Actions
export type GameAction =
  | {
      type: "JOIN";
      payload: {
        player: { id: string; name: string; clanId: ClanId; clanName: string; clanColor?: string };
      };
    }
  | { type: "SET_QUESTIONS"; payload: { questions: BattleQuestion[] } }
  | { type: "SET_MAP"; payload: { mapId: string } }
  | { type: "SET_ALLOW_CLANLESS"; payload: { allow: boolean } }
  | { type: "SET_DURATION"; payload: { duration: number } }
  | { type: "START_GAME"; payload: { duration: number } }
  | { type: "TICK" }
  | { type: "SELECT_ZONE"; payload: { playerId: string; zoneId: ZoneId | null } }
  | {
      type: "SUBMIT_ANSWER";
      payload: { playerId: string; isCorrect: boolean; durationMs: number };
    }
  | { type: "END_GAME" }
  | { type: "DISMISS_ARENA" }
  | { type: "KICK_PLAYER"; payload: { playerId: string } }
  | { type: "REQUEST_STATE" };

export interface ClanTerritoryResults {
  winningClanId: ClanId | null;
  zoneControl: Record<ZoneId, ClanId | null>;
  clanScores: Record<ClanId, number>;
  playerRewards: PlayerReward[];
}

export interface PlayerReward {
  playerId: string;
  clanId: ClanId;
  clanName: string;
  coins: number;
  xp: number;
  gems: number;
  battleScore: number;
  questionsAnswered: number;
  questionsCorrect: number;
  accuracy: number;
}
