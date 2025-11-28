export type ClanId = string;
export type ZoneId = string;

export interface ClanMetadata {
  id: ClanId;
  name: string;
  color: string;
}

const CLAN_COLOR_PALETTE = [
  "#f97316",
  "#0ea5e9",
  "#10b981",
  "#a855f7",
  "#f43f5e",
  "#14b8a6",
  "#6366f1",
  "#eab308",
];

export const getClanColor = (clanId: string): string => {
  let hash = 0;
  for (let i = 0; i < clanId.length; i += 1) {
    hash = (hash << 5) - hash + clanId.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % CLAN_COLOR_PALETTE.length;
  return CLAN_COLOR_PALETTE[index];
};

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

// Map-specific zone configurations
export const MAP_ZONES: Record<string, Zone[]> = {
  default: ZONES,
  city: CITY_ZONES,
  fortress: ZONES, // Use default for now
  islands: ZONES, // Use default for now
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

export interface BattleQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  options?: string[]; // For multiple choice questions
  wrong_answers?: string[]; // Fallback for legacy format
  subject?: string;
  topic?: string;
  difficulty?: string;
  question_type?: string;
}

export interface ClanTerritoryGameState {
  phase: GamePhase;
  timer: number;
  players: Record<string, PlayerStats>;
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  questions: BattleQuestion[];
  mapId?: string;
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
  | { type: "START_GAME"; payload: { duration: number } }
  | { type: "TICK" }
  | { type: "SELECT_ZONE"; payload: { playerId: string; zoneId: ZoneId } }
  | {
      type: "SUBMIT_ANSWER";
      payload: { playerId: string; isCorrect: boolean; durationMs: number };
    }
  | { type: "END_GAME" }
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
