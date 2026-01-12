import {
  AlarmLevel,
  ChaosEffect,
  EntryRoute,
  FinishReason,
  GameAction,
  GamePhase,
  GameState,
  HeistCondition,
  JoinGameAction,
  PlayerState,
  QuestionRiskRoute,
  RoomSettings,
} from "./lockdownTypes.js";
import { calculateRegionStats } from "./regionCalculator.js";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const PLAYER_COLOR_PALETTE = [
  "#38bdf8", // sky-400
  "#f97316", // orange-500
  "#22c55e", // green-500
  "#a855f7", // purple-500
  "#f43f5e", // rose-500
  "#eab308", // yellow-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
  "#f59e0b", // amber-500
  "#ec4899", // pink-500
];

const hashToPaletteColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PLAYER_COLOR_PALETTE.length;
  return PLAYER_COLOR_PALETTE[index];
};

const assignParticipantColor = (state: GameState, action: JoinGameAction) => {
  const existingPlayers = Object.values(state.players);
  if (action.clanId) {
    const existingClanColor = existingPlayers.find((player) => player.clanId === action.clanId && player.color)?.color;
    if (existingClanColor) {
      return existingClanColor;
    }
  }

  const usedColors = new Set(existingPlayers.map((player) => player.color).filter(Boolean));
  const availableColor = PLAYER_COLOR_PALETTE.find((color) => !usedColors.has(color));
  if (availableColor) {
    return availableColor;
  }

  return hashToPaletteColor(action.clanId ?? action.playerId);
};

const getEntryRouteModifier = (
  roomSettings: RoomSettings,
  route?: EntryRoute,
) => roomSettings.entryRouteModifiers[route ?? EntryRoute.SAFE];

const updateAlarm = (state: GameState, delta: number) => {
  const nextAlarm = clamp(state.alarm + delta, 0, state.roomSettings.alarmMax);
  const updatedLevel = getAlarmLevel(nextAlarm);
  return { alarm: nextAlarm, alarmLevel: updatedLevel };
};

export const getAlarmLevel = (alarmValue: number): AlarmLevel => {
  if (alarmValue >= 75) {
    return AlarmLevel.CRITICAL;
  }
  if (alarmValue >= 50) {
    return AlarmLevel.HIGH;
  }
  if (alarmValue >= 25) {
    return AlarmLevel.GUARDED;
  }
  return AlarmLevel.LOW;
};

export const createInitialGameState = (roomSettings: RoomSettings): GameState => {
  return {
    phase: GamePhase.LOBBY,
    players: {},
    alarm: 0,
    alarmLevel: getAlarmLevel(0),
    panicModeActive: false,
    ruleSet: { votes: {}, chaosEffects: [] },
    roomSettings,
    remainingTimeMs: roomSettings.durationMs,
    round: 0,
  };
};

const applyJoin = (state: GameState, action: JoinGameAction): GameState => {
  if (state.players[action.playerId]) {
    return state;
  }
  const player: PlayerState = {
    id: action.playerId,
    name: action.name,
    coins: 0,
    heat: 0,
    mostWanted: false,
    accuracy: { correct: 0, total: 0 },
    clanId: action.clanId,
    clanName: action.clanName,
    clanAvatarUrl: action.clanAvatarUrl,
    color: assignParticipantColor(state, action),
  };
  return { ...state, players: { ...state.players, [action.playerId]: player } };
};

const applyLeave = (state: GameState, playerId: string): GameState => {
  if (!state.players[playerId]) {
    return state;
  }
  const updatedPlayers = { ...state.players };
  delete updatedPlayers[playerId];
  return { ...state, players: updatedPlayers };
};

const applyEntryRoute = (state: GameState, playerId: string, route: EntryRoute): GameState => {
  const player = state.players[playerId];
  if (!player) return state;
  const updatedPlayer: PlayerState = { ...player, entryRoute: route };
  return { ...state, players: { ...state.players, [playerId]: updatedPlayer } };
};

const applyRiskRoute = (state: GameState, playerId: string, route: QuestionRiskRoute): GameState => {
  const player = state.players[playerId];
  if (!player) return state;
  if (state.panicModeActive && (route === QuestionRiskRoute.SAFE || state.ruleSet.safeRouteDisabled)) {
    return state;
  }
  const updatedPlayer: PlayerState = { ...player, riskRoute: route };
  return { ...state, players: { ...state.players, [playerId]: updatedPlayer } };
};

const applyVoteCondition = (state: GameState, condition: HeistCondition): GameState => {
  const votes = state.ruleSet.votes[condition] ?? 0;
  const updatedRuleSet = {
    ...state.ruleSet,
    votes: { ...state.ruleSet.votes, [condition]: votes + 1 },
  };
  return { ...state, ruleSet: updatedRuleSet };
};

const applyFinalizeCondition = (state: GameState, condition: HeistCondition): GameState => {
  const updatedRuleSet = { ...state.ruleSet, selectedCondition: condition };
  return { ...state, ruleSet: updatedRuleSet, phase: GamePhase.ACTIVE_ROUNDS, round: 1 };
};

const coinAdjustmentForAnswer = (
  roomSettings: RoomSettings,
  correct: boolean,
  route: QuestionRiskRoute,
  bonusMultiplier: number,
) => {
  if (correct) {
    const base = roomSettings.baseCorrectCoins;
    const multiplier = route === QuestionRiskRoute.ALL_IN ? 2 : route === QuestionRiskRoute.RISKY ? 1.5 : 1;
    return Math.floor(base * multiplier * bonusMultiplier);
  }
  const penalty = roomSettings.baseWrongPenalty;
  return -Math.floor(penalty * bonusMultiplier);
};

const alarmDeltaForAnswer = (roomSettings: RoomSettings, correct: boolean, route: QuestionRiskRoute) => {
  if (correct) return 0;
  if (route === QuestionRiskRoute.ALL_IN) return roomSettings.baseAlarmOnWrong * roomSettings.allInAlarmModifier;
  if (route === QuestionRiskRoute.RISKY) return roomSettings.baseAlarmOnWrong * roomSettings.riskyAlarmModifier;
  return roomSettings.baseAlarmOnWrong * roomSettings.safeAlarmModifier;
};

const heatGainForRoute = (roomSettings: RoomSettings, route: QuestionRiskRoute) => {
  if (route === QuestionRiskRoute.ALL_IN) return roomSettings.allInHeatGain;
  if (route === QuestionRiskRoute.RISKY) return roomSettings.riskyHeatGain;
  return roomSettings.safeHeatGain;
};

const effectiveBonusMultiplier = (state: GameState) => {
  const chaosMultiplier = state.ruleSet.chaosEffects.reduce((acc, effect) => acc * (effect.bonusCoinsMultiplier ?? 1), 1);
  return state.ruleSet.selectedCondition === HeistCondition.DOUBLE_PAYOUTS ? 2 * chaosMultiplier : chaosMultiplier;
};

const applyAnswer = (state: GameState, playerId: string, correct: boolean, chosenRoute?: QuestionRiskRoute): GameState => {
  const player = state.players[playerId];
  if (!player) return state;
  const route = chosenRoute ?? player.riskRoute ?? QuestionRiskRoute.SAFE;
  if (state.panicModeActive && (route === QuestionRiskRoute.SAFE || state.ruleSet.safeRouteDisabled)) {
    return state;
  }
  const bonusMultiplier = effectiveBonusMultiplier(state);
  const coinDelta = coinAdjustmentForAnswer(state.roomSettings, correct, route, bonusMultiplier);
  const updatedCoins = Math.max(0, player.coins + coinDelta);
  const alarmDelta = alarmDeltaForAnswer(state.roomSettings, correct, route);
  const alarmUpdated = alarmDelta !== 0 ? updateAlarm(state, alarmDelta) : { alarm: state.alarm, alarmLevel: state.alarmLevel };
  const heatGain = heatGainForRoute(state.roomSettings, route);
  const updatedPlayer: PlayerState = {
    ...player,
    coins: updatedCoins,
    heat: player.heat + heatGain,
    accuracy: {
      correct: player.accuracy.correct + (correct ? 1 : 0),
      total: player.accuracy.total + 1,
    },
    riskRoute: route,
  };
  const updatedState: GameState = {
    ...state,
    ...alarmUpdated,
    players: { ...state.players, [playerId]: updatedPlayer },
  };
  return applyMostWantedCheck(updatedState, playerId);
};

const applyMostWantedCheck = (state: GameState, playerId: string): GameState => {
  const player = state.players[playerId];
  if (!player) return state;
  if (player.heat >= state.roomSettings.mostWantedHeat && !player.mostWanted) {
    const updatedPlayer: PlayerState = { ...player, mostWanted: true };
    return { ...state, players: { ...state.players, [playerId]: updatedPlayer } };
  }
  return state;
};

const applyPanicModeIfNeeded = (state: GameState): GameState => {
  if (state.panicModeActive || !shouldEnterPanicMode(state)) {
    return state;
  }
  return applyPanicModeTransform(state);
};

const hackCoins = (attacker: PlayerState, target: PlayerState, roomSettings: RoomSettings, ruleSet: { selectedCondition?: HeistCondition; chaosEffects: ChaosEffect[] }) => {
  const attackerRoute = attacker.entryRoute ?? EntryRoute.SAFE;
  const modifier = getEntryRouteModifier(roomSettings, attackerRoute);
  const baseSteal = roomSettings.hackStealBase * modifier.hackStealMultiplier;
  const stealAmount = Math.min(target.coins, Math.floor(baseSteal));
  const chaosMultiplier = ruleSet.chaosEffects.reduce((acc, effect) => acc + (effect.bonusCoinsMultiplier ? effect.bonusCoinsMultiplier - 1 : 0), 1);
  const payoutMultiplier = ruleSet.selectedCondition === HeistCondition.DOUBLE_PAYOUTS ? 2 + chaosMultiplier : 1 + chaosMultiplier;
  const coinsStolen = Math.floor(stealAmount * payoutMultiplier);
  const updatedTargetCoins = Math.max(0, target.coins - coinsStolen);
  const updatedAttackerCoins = attacker.coins + coinsStolen;
  return { coinsStolen, updatedTargetCoins, updatedAttackerCoins, alarmMultiplier: modifier.alarmOnHackMultiplier, heatMultiplier: modifier.heatMultiplier };
};

const applyHack = (state: GameState, playerId: string, targetId?: string): GameState => {
  const attacker = state.players[playerId];
  const target = targetId ? state.players[targetId] : undefined;
  if (!attacker || !target || playerId === targetId) {
    return state;
  }
  const { coinsStolen, updatedTargetCoins, updatedAttackerCoins, alarmMultiplier, heatMultiplier } = hackCoins(
    attacker,
    target,
    state.roomSettings,
    state.ruleSet,
  );
  const alarmGainBase = state.roomSettings.hackAlarmGain * alarmMultiplier;
  const chaosAlarm = state.ruleSet.chaosEffects.reduce((acc, effect) => acc + (effect.extraAlarmOnHack ?? 0), 0);
  const conditionAlarm = state.ruleSet.selectedCondition === HeistCondition.PARANOID_SYSTEMS ? alarmGainBase : 0;
  const totalAlarmGain = alarmGainBase + chaosAlarm + conditionAlarm;
  const alarmUpdated = totalAlarmGain ? updateAlarm(state, totalAlarmGain) : { alarm: state.alarm, alarmLevel: state.alarmLevel };

  const attackerHeatGain = Math.floor(state.roomSettings.hackHeatGain * heatMultiplier);
  const updatedAttacker: PlayerState = {
    ...attacker,
    coins: updatedAttackerCoins,
    heat: attacker.heat + attackerHeatGain,
  };
  const updatedTarget: PlayerState = { ...target, coins: updatedTargetCoins };
  let updatedState: GameState = {
    ...state,
    ...alarmUpdated,
    players: { ...state.players, [playerId]: updatedAttacker, [targetId as string]: updatedTarget },
  };
  updatedState = applyMostWantedCheck(updatedState, playerId);
  return updatedState;
};

const applyScrub = (state: GameState, playerId: string): GameState => {
  const player = state.players[playerId];
  if (!player) return state;
  const reducedHeat = Math.max(0, player.heat - state.roomSettings.scrubHeatReduction);
  const updatedPlayer: PlayerState = { ...player, heat: reducedHeat };
  return { ...state, players: { ...state.players, [playerId]: updatedPlayer } };
};

const applyGreed = (state: GameState, playerId: string): GameState => {
  const player = state.players[playerId];
  if (!player) return state;
  const coins = player.coins + state.roomSettings.greedCoinBonus;
  const heat = player.heat + state.roomSettings.greedHeatGain;
  const updatedPlayer: PlayerState = { ...player, coins, heat };
  let updatedState: GameState = { ...state, players: { ...state.players, [playerId]: updatedPlayer } };
  updatedState = applyMostWantedCheck(updatedState, playerId);
  return updatedState;
};

const applyPostRoundAction = (state: GameState, playerId: string, action: "hack" | "scrub" | "greed", targetId?: string): GameState => {
  if (action === "hack") return applyHack(state, playerId, targetId);
  if (action === "scrub") return applyScrub(state, playerId);
  return applyGreed(state, playerId);
};

const applyChaos = (state: GameState, effect: ChaosEffect): GameState => {
  const safeRouteDisabled = state.ruleSet.safeRouteDisabled || effect.disableSafeRoute;
  const updatedRuleSet = {
    ...state.ruleSet,
    chaosEffects: [...state.ruleSet.chaosEffects, effect],
    safeRouteDisabled,
  };
  return { ...state, ruleSet: updatedRuleSet };
};

const applyTick = (state: GameState, elapsedMs: number): GameState => {
  const now = Date.now();
  const lastTick = state.lastTickTimestamp || now;
  const actualElapsed = now - lastTick;
  
  // Use actual elapsed time to prevent drift from tab throttling
  const remainingTimeMs = Math.max(0, state.remainingTimeMs - actualElapsed);
  const updatedState: GameState = { 
    ...state, 
    remainingTimeMs,
    lastTickTimestamp: now
  };
  const panicChecked = applyPanicModeIfNeeded(updatedState);
  return panicChecked;
};

const totalCoins = (state: GameState) => Object.values(state.players).reduce((sum, player) => sum + player.coins, 0);

export const shouldEnterPanicMode = (state: GameState): boolean => {
  if (state.panicModeActive) return false;
  if (state.alarm >= state.roomSettings.panicAlarmThreshold) return true;
  return state.remainingTimeMs <= state.roomSettings.panicTimeThresholdMs;
};

export const applyPanicModeTransform = (state: GameState): GameState => {
  const updatedRuleSet = { ...state.ruleSet, safeRouteDisabled: true };
  return { ...state, panicModeActive: true, ruleSet: updatedRuleSet };
};

export const evaluateEndCondition = (state: GameState): FinishReason | null => {
  if (totalCoins(state) >= state.roomSettings.coinGoal) {
    return FinishReason.COIN_GOAL_REACHED;
  }
  if (state.alarm >= state.roomSettings.alarmMax) {
    return FinishReason.ALARM_MAXED;
  }
  if (state.remainingTimeMs <= 0) {
    return FinishReason.TIME_EXPIRED;
  }
  return null;
};

const progressPhase = (state: GameState): GameState => {
  if (state.phase === GamePhase.LOBBY) {
    return { ...state, phase: GamePhase.VOTING_RULES };
  }
  if (state.phase === GamePhase.VOTING_RULES) {
    return { ...state, phase: GamePhase.ACTIVE_ROUNDS, round: 1 };
  }
  return state;
};

const finalizeIfFinished = (state: GameState): GameState => {
  const finishReason = evaluateEndCondition(state);
  if (!finishReason) return state;
  return { ...state, phase: GamePhase.FINISHED, finishReason };
};

export const applyAction = (state: GameState, action: GameAction): GameState => {
  let updatedState: GameState = state;
  switch (action.type) {
    case "JOIN":
      updatedState = applyJoin(state, action);
      break;
    case "LEAVE":
      updatedState = applyLeave(state, action.playerId);
      break;
    case "CHOOSE_ENTRY_ROUTE":
      updatedState = applyEntryRoute(state, action.playerId, action.route);
      break;
    case "CHOOSE_RISK_ROUTE":
      updatedState = applyRiskRoute(state, action.playerId, action.route);
      break;
    case "VOTE_CONDITION":
      updatedState = applyVoteCondition(state, action.condition);
      break;
    case "FINALIZE_CONDITION":
      updatedState = applyFinalizeCondition(state, action.condition);
      break;
    case "SUBMIT_ANSWER":
      updatedState = applyAnswer(state, action.playerId, action.correct, action.route);
      break;
    case "ROUND_POST_ACTION":
      updatedState = applyPostRoundAction(state, action.playerId, action.action, action.targetId);
      break;
    case "CHAOS_TRIGGER":
      updatedState = applyChaos(state, action.effect);
      break;
    case "TICK":
      updatedState = applyTick(state, action.elapsedMs);
      break;
    case "ADVANCE_PHASE":
      updatedState = progressPhase(state);
      break;
    case "START_GAME":
      updatedState = { 
        ...state, 
        phase: GamePhase.ACTIVE_ROUNDS,
        gameStartTimestamp: Date.now(),
        lastTickTimestamp: Date.now()
      };
      break;
    case "TRIGGER_PANIC":
      updatedState = { ...state, panicModeActive: true };
      break;
    case "PAUSE_GAME":
      updatedState = { ...state, phase: GamePhase.PAUSED };
      break;
    case "RESUME_GAME":
      updatedState = { ...state, phase: GamePhase.ACTIVE_ROUNDS };
      break;
    case "KICK_PLAYER":
      updatedState = applyLeave(state, action.playerId);
      break;
    default:
      updatedState = state;
  }

  updatedState = applyPanicModeIfNeeded(updatedState);
  updatedState = finalizeIfFinished(updatedState);
  
  // Update region statistics based on player answers and clan membership
  updatedState = { ...updatedState, regionStats: calculateRegionStats(updatedState) };
  
  return updatedState;
};
