import {
  ClanTerritoryGameState,
  GameAction,
  PlayerStats,
  ZoneId,
  ZONES,
  CONFIG,
  getClanColor,
} from "./clanTerritoryTypes";

// Map zone count configuration
const MAP_ZONE_COUNTS: Record<string, number> = {
  default: 8,
  city: 10,
  kyrgyzstan: 7,
  usa: 51,
  fortress: 6,
  islands: 12,
};

// Helper function to generate zones for a specific map
const generateZonesForMap = (mapId: string = 'default'): Record<ZoneId, any> => {
  const zoneCount = MAP_ZONE_COUNTS[mapId] || 8;
  const zones: Record<ZoneId, any> = {};
  
  for (let i = 1; i <= zoneCount; i++) {
    const zoneId = `zone-${i}` as ZoneId;
    zones[zoneId] = {
      id: zoneId,
      influence: {},
    };
  }
  
  return zones;
};

export const INITIAL_STATE: ClanTerritoryGameState = {
  phase: "LOBBY",
  timer: 300, // 5 minutes default
  zones: generateZonesForMap('default'),
  players: {},
  clans: {},
  questions: [],
  mapId: 'default',
  allowClanlessPlayers: false,
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
      return {
        ...state,
        mapId: newMapId,
        // Regenerate zones for the new map
        zones: generateZonesForMap(newMapId),
      };
    }

    case "SET_ALLOW_CLANLESS": {
      return { ...state, allowClanlessPlayers: action.payload.allow };
    }

    case "JOIN": {
      const { player } = action.payload;
      if (state.players[player.id]) return state; // Already joined

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

      const clanMeta = state.clans[player.clanId] ?? {
        id: player.clanId,
        name: player.clanName,
        color: player.clanColor || getClanColor(player.clanId),
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
