import {
  ClanTerritoryGameState,
  GameAction,
  PlayerStats,
  ZoneId,
  CONFIG,
  assignSessionClanColor,
  getUsedSessionColors,
  getZonesForMap,
} from "./clanTerritoryTypes";
import type { MapId } from "./mapCatalog";
import { MAP_CATALOG } from "./mapCatalog";
import { canEnterClanTerritoryOfficialRoom } from "./clanTerritoryEligibility";

const VALID_MAP_IDS = new Set<string>(MAP_CATALOG.map((e) => e.id));

// Helper function to generate zones for a specific map
const generateZonesForMap = (mapId: MapId = "default"): Record<ZoneId, any> => {
  return getZonesForMap(mapId).reduce<Record<ZoneId, any>>((acc, zone) => {
    acc[zone.id] = {
      id: zone.id,
      influence: {},
    };
    return acc;
  }, {});
};

export const INITIAL_STATE: ClanTerritoryGameState = {
  arenaMode: "official",
  phase: "LOBBY",
  timer: 300, // 5 minutes default
  officialSchoolId: undefined,
  officialClassCodes: undefined,
  zones: generateZonesForMap("default"),
  players: {},
  clans: {},
  questions: [],
  mapId: "default",
  allowClanlessPlayers: false,
  allowedClanIds: undefined,
  endReason: undefined,
};

export function clanTerritoryReducer(
  state: ClanTerritoryGameState,
  action: GameAction
): ClanTerritoryGameState {
  switch (action.type) {
    case "SET_QUESTIONS": {
      return {
        ...state,
        questions: action.payload.questions,
      };
    }

    case "SET_MAP": {
      const newMapId = action.payload.mapId;
      if (!VALID_MAP_IDS.has(newMapId)) {
        console.warn(`[ClanTerritoryEngine] Ignoring unknown mapId: "${newMapId}"`);
        return state;
      }
      return {
        ...state,
        mapId: newMapId,
        // Regenerate zones for the new map
        zones: generateZonesForMap(newMapId as MapId),
      };
    }

    case "SET_ALLOW_CLANLESS": {
      return { ...state, allowClanlessPlayers: action.payload.allow };
    }

    case "SET_ALLOWED_CLANS": {
      const ids = action.payload.clanIds;
      return { ...state, allowedClanIds: ids.length > 0 ? ids : undefined };
    }

    case "SET_DURATION": {
      if (state.phase === "ACTIVE") return state;
      return {
        ...state,
        timer: action.payload.duration,
        gameStartTime: undefined,
        gameEndTime: undefined,
        endReason: undefined,
      };
    }

    case "JOIN": {
      const { player } = action.payload;
      if (state.players[player.id]) return state; // Already joined

      // Official arenas are school/class restricted by host configuration.
      if (state.arenaMode === "official") {
        if (!player.schoolId || (state.officialSchoolId && player.schoolId !== state.officialSchoolId)) {
          console.log("[clanTerritoryEngine] JOIN rejected: school mismatch for official arena");
          return state;
        }
        if (state.officialClassCodes && state.officialClassCodes.length > 0) {
          if (!canEnterClanTerritoryOfficialRoom(
            state.officialClassCodes,
            player.classCodes,
            player.batch,
          )) {
            console.log("[clanTerritoryEngine] JOIN rejected: class mismatch for official arena");
            return state;
          }
        }
      }

      // Filter by allowed clans if set
      if (state.allowedClanIds && state.allowedClanIds.length > 0) {
        if (!player.clanId || !state.allowedClanIds.includes(player.clanId)) {
          console.log(`[clanTerritoryEngine] JOIN rejected: clan ${player.clanId} not in allowedClanIds`);
          return state;
        }
      }

      const newPlayer: PlayerStats = {
        id: player.id,
        name: player.name,
        clanId: player.clanId,
        clanName: player.clanName,
        selectedZoneId: null,
        battleScore: 0,
        questionsAnswered: 0,
        questionsCorrect: 0,
        totalAnswerTimeMs: 0,
        fastAnswers: 0,
        streak: 0,
        bestStreak: 0,
      };

      const usedColors = getUsedSessionColors(state.clans);
      const clanMeta = state.clans[player.clanId] ?? {
        id: player.clanId,
        name: player.clanName,
        color: assignSessionClanColor(player.clanId, usedColors, player.clanColor),
      };

      return {
        ...state,
        clans: { ...state.clans, [player.clanId]: clanMeta },
        players: { ...state.players, [player.id]: newPlayer },
      };
    }

    case "START_GAME": {
      const now = Date.now();
      const durationMs = action.payload.duration * 1000;
      return {
        ...state,
        phase: "ACTIVE",
        timer: action.payload.duration,
        gameStartTime: now,
        gameEndTime: now + durationMs,
        endReason: undefined,
      };
    }

    case "TICK": {
      if (state.phase !== "ACTIVE") return state;
      
      // Use absolute time if available, otherwise fall back to decrement
      let newTimer: number;
      if (state.gameEndTime) {
        newTimer = Math.max(0, Math.floor((state.gameEndTime - Date.now()) / 1000));
      } else {
        newTimer = Math.max(0, state.timer - 1);
      }
      
      return {
        ...state,
        timer: newTimer,
        phase: newTimer === 0 ? "ENDED" : "ACTIVE",
        endReason: newTimer === 0 ? state.endReason ?? "TIME_UP" : state.endReason,
      };
    }

    case "SELECT_ZONE": {
      const { playerId, zoneId } = action.payload;
      const player = state.players[playerId];
      
      console.log(`[clanTerritoryEngine] SELECT_ZONE: playerId=${playerId}, zoneId=${zoneId}, player exists=${!!player}`);
      
      if (!player) {
        console.warn(`[clanTerritoryEngine] SELECT_ZONE ignored: player ${playerId} not found`);
        return state;
      }

      console.log(`[clanTerritoryEngine] SELECT_ZONE: Updating player ${playerId} selectedZoneId from ${player.selectedZoneId} to ${zoneId}`);
      
      return {
        ...state,
        players: {
          ...state.players,
          [playerId]: { ...player, selectedZoneId: zoneId || null },
        },
      };
    }

    case "SUBMIT_ANSWER": {
      const { playerId, isCorrect, durationMs } = action.payload;
      const player = state.players[playerId];
      
      // Enhanced logging for debugging
      console.log(`[clanTerritoryEngine] SUBMIT_ANSWER: playerId=${playerId}, isCorrect=${isCorrect}, player exists=${!!player}, selectedZoneId=${player?.selectedZoneId}`);
      
      if (!player) {
        console.warn(`[clanTerritoryEngine] SUBMIT_ANSWER ignored: player ${playerId} not found in state`);
        return state;
      }
      
      if (!player.selectedZoneId) {
        console.warn(`[clanTerritoryEngine] SUBMIT_ANSWER ignored: player ${playerId} has no selectedZoneId`);
        return state;
      }

      const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : CONFIG.FAST_ANSWER_THRESHOLD_MS;
      const isFast = safeDuration <= CONFIG.FAST_ANSWER_THRESHOLD_MS;
      const newStreak = isCorrect ? player.streak + 1 : 0;
      const streakBonus = isCorrect && newStreak % CONFIG.STREAK_BONUS_THRESHOLD === 0 ? CONFIG.STREAK_BONUS_POINTS : 0;
      let scoreChange = 0;

      if (isCorrect) {
        scoreChange += CONFIG.BASE_CORRECT_POINTS;
        if (isFast) scoreChange += CONFIG.FAST_ANSWER_BONUS;
        scoreChange += streakBonus;
      } else {
        // Deduct points for wrong answers
        scoreChange -= CONFIG.WRONG_ANSWER_PENALTY;
      }

      // Update Player Stats
      const updatedPlayer: PlayerStats = {
        ...player,
        questionsAnswered: player.questionsAnswered + 1,
        questionsCorrect: player.questionsCorrect + (isCorrect ? 1 : 0),
        streak: newStreak,
        bestStreak: Math.max(player.bestStreak, newStreak),
        battleScore: player.battleScore + scoreChange,
        totalAnswerTimeMs: player.totalAnswerTimeMs + safeDuration,
        fastAnswers: player.fastAnswers + (isFast && isCorrect ? 1 : 0),
      };

      // Update Zone Influence
      const zoneId = player.selectedZoneId;
      const zoneState = state.zones[zoneId];

      if (!zoneState) {
        // Safety check: if zone doesn't exist, just update player stats
        console.warn(`[clanTerritoryEngine] SUBMIT_ANSWER: zone ${zoneId} not found in state.zones, only updating player stats`);
        return {
          ...state,
          players: { ...state.players, [playerId]: updatedPlayer },
        };
      }

      const currentZoneInfluence = zoneState.influence[player.clanId] || 0;

      const influenceChange = isCorrect
        ? scoreChange * CONFIG.INFLUENCE_PER_POINT
        : -Math.max(
            Math.ceil(currentZoneInfluence * CONFIG.WRONG_ANSWER_INFLUENCE_PENALTY_PERCENT),
            CONFIG.INFLUENCE_PER_POINT * CONFIG.WRONG_ANSWER_PENALTY
          );

      console.log(
        `[clanTerritoryEngine] SUBMIT_ANSWER: scoreChange=${scoreChange}, influenceChange=${influenceChange}, clanId=${player.clanId}`
      );

      const newZoneInfluence = Math.max(0, currentZoneInfluence + influenceChange); // Can't go below 0

      console.log(
        `[clanTerritoryEngine] SUBMIT_ANSWER: Updating zone ${zoneId} influence for clan ${player.clanId}: ${currentZoneInfluence} -> ${newZoneInfluence} (change: ${influenceChange})`
      );
      
      const updatedZone = {
        ...zoneState,
        influence: {
          ...zoneState.influence,
          [player.clanId]: newZoneInfluence,
        },
      };

      return {
        ...state,
        players: { ...state.players, [playerId]: updatedPlayer },
        zones: { ...state.zones, [zoneId]: updatedZone },
      };
    }

    case "END_GAME": {
      return {
        ...state,
        phase: "ENDED",
        endReason: state.endReason ?? "TEACHER_ENDED",
      };
    }

    case "DISMISS_ARENA": {
      return {
        ...state,
        phase: "ENDED",
        timer: 0,
        endReason: "TEACHER_DISMISSED",
      };
    }

    case "KICK_PLAYER": {
      const { playerId } = action.payload;
      const { [playerId]: removed, ...remainingPlayers } = state.players;
      return {
        ...state,
        players: remainingPlayers,
      };
    }

    case "REQUEST_STATE": {
      return state;
    }

    default:
      return state;
  }
}
