// Simple local demo harness for Lockdown Countdown engine simulation.
// This file intentionally uses console.log for demonstration output.

// Game domain types
export type EntryRoute = "STEALTH" | "FORCE" | "SOCIAL";
export type RiskRoute = "SAFE" | "RISKY" | "INSANE";

export interface RoomSettings {
  readonly maxAlarm: number;
  readonly panicThreshold: number;
  readonly baseTimerSeconds: number;
  readonly rounds: number;
  readonly safeReward: number;
  readonly riskyReward: number;
  readonly insaneReward: number;
  readonly wrongPenalty: number;
  readonly timePenaltyPerTick: number;
  readonly hackStealAmount: number;
  readonly hackAlarmPenalty: number;
}

export interface PlayerState {
  readonly id: string;
  readonly name: string;
  readonly entryRoute: EntryRoute;
  readonly riskRoute: RiskRoute;
  readonly score: number;
  readonly hacksUsed: number;
  readonly lockedOut: boolean;
  readonly lastAnswerCorrect: boolean | null;
}

export interface GameState {
  readonly settings: RoomSettings;
  readonly players: PlayerState[];
  readonly round: number;
  readonly timer: number;
  readonly alarmLevel: number;
  readonly panicModeActive: boolean;
  readonly history: string[];
}

export type Action =
  | { type: "AddPlayer"; id: string; name: string; entryRoute?: EntryRoute }
  | { type: "ChooseEntryRoute"; playerId: string; route: EntryRoute }
  | { type: "ChooseRiskRoute"; playerId: string; route: RiskRoute }
  | { type: "SubmitAnswer"; playerId: string; correct: boolean }
  | { type: "Hack"; playerId: string; targetId: string }
  | { type: "TimerTick"; seconds: number };

function defaultRoomSettings(): RoomSettings {
  return {
    maxAlarm: 100,
    panicThreshold: 70,
    baseTimerSeconds: 20,
    rounds: 4,
    safeReward: 10,
    riskyReward: 18,
    insaneReward: 28,
    wrongPenalty: 8,
    timePenaltyPerTick: 1,
    hackStealAmount: 7,
    hackAlarmPenalty: 6,
  };
}

function createInitialGameState(settings: RoomSettings): GameState {
  return {
    settings,
    players: [],
    round: 1,
    timer: settings.baseTimerSeconds,
    alarmLevel: 0,
    panicModeActive: false,
    history: ["Simulation booted"],
  };
}

function ensurePlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} does not exist`);
  }
  return player;
}

function withPlayers(state: GameState, players: PlayerState[]): GameState {
  return { ...state, players };
}

function clampAlarm(settings: RoomSettings, alarm: number): number {
  if (alarm < 0) return 0;
  return Math.min(alarm, settings.maxAlarm);
}

function recalcPanic(state: GameState, alarmLevel: number): GameState {
  const panicModeActive = alarmLevel >= state.settings.panicThreshold;
  return { ...state, alarmLevel, panicModeActive };
}

function logHistory(state: GameState, entry: string): GameState {
  return { ...state, history: [...state.history, entry] };
}

function updatePlayer(
  state: GameState,
  playerId: string,
  updater: (player: PlayerState) => PlayerState,
): GameState {
  ensurePlayer(state, playerId);
  const players = state.players.map((p) => (p.id === playerId ? updater(p) : p));
  return withPlayers(state, players);
}

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "AddPlayer": {
      if (state.players.some((p) => p.id === action.id)) {
        return logHistory(state, `Player ${action.name} already present`);
      }
      const newPlayer: PlayerState = {
        id: action.id,
        name: action.name,
        entryRoute: action.entryRoute ?? "STEALTH",
        riskRoute: "SAFE",
        score: 0,
        hacksUsed: 0,
        lockedOut: false,
        lastAnswerCorrect: null,
      };
      return logHistory(withPlayers(state, [...state.players, newPlayer]), `Added ${action.name}`);
    }

    case "ChooseEntryRoute": {
      return logHistory(
        updatePlayer(state, action.playerId, (player) => ({ ...player, entryRoute: action.route })),
        `${action.playerId} selected entry route ${action.route}`,
      );
    }

    case "ChooseRiskRoute": {
      return logHistory(
        updatePlayer(state, action.playerId, (player) => ({ ...player, riskRoute: action.route })),
        `${action.playerId} set risk route ${action.route}`,
      );
    }

    case "SubmitAnswer": {
      const player = ensurePlayer(state, action.playerId);
      if (player.lockedOut) {
        return logHistory(state, `${player.name} is locked out and cannot answer.`);
      }

      const rewardMap: Record<RiskRoute, number> = {
        SAFE: state.settings.safeReward,
        RISKY: state.settings.riskyReward,
        INSANE: state.settings.insaneReward,
      };

      const penaltyMultiplier: Record<RiskRoute, number> = {
        SAFE: 1,
        RISKY: 1.5,
        INSANE: 2,
      };

      const nextAlarm = action.correct
        ? clampAlarm(state.settings, state.alarmLevel - 1)
        : clampAlarm(
            state.settings,
            state.alarmLevel + Math.round(state.settings.wrongPenalty * penaltyMultiplier[player.riskRoute]),
          );

      const nextScore = action.correct ? player.score + rewardMap[player.riskRoute] : player.score;

      let updated: GameState = updatePlayer(state, action.playerId, (p) => ({
        ...p,
        score: nextScore,
        lastAnswerCorrect: action.correct,
      }));

      updated = recalcPanic(updated, nextAlarm);

      const actionLabel = action.correct ? "landed" : "missed";
      return logHistory(
        updated,
        `${player.name} ${actionLabel} an answer on ${player.riskRoute} (score ${nextScore}, alarm ${nextAlarm})`,
      );
    }

    case "Hack": {
      const hacker = ensurePlayer(state, action.playerId);
      const target = ensurePlayer(state, action.targetId);
      if (hacker.lockedOut) {
        return logHistory(state, `${hacker.name} is locked out and cannot hack.`);
      }

      const success = hacker.hacksUsed % 2 === 0; // First hack always succeeds, second fails, etc.
      const available = Math.max(0, target.score - state.settings.hackStealAmount);
      const stealAmount = Math.min(state.settings.hackStealAmount, available);

      let updated: GameState = updatePlayer(state, action.playerId, (p) => ({
        ...p,
        score: p.score + (success ? stealAmount : 0),
        hacksUsed: p.hacksUsed + 1,
      }));

      updated = updatePlayer(updated, action.targetId, (p) => ({
        ...p,
        score: success ? p.score - stealAmount : p.score,
      }));

      const nextAlarm = clampAlarm(
        updated.settings,
        updated.alarmLevel + updated.settings.hackAlarmPenalty + (success ? 0 : updated.settings.hackAlarmPenalty),
      );

      updated = recalcPanic(updated, nextAlarm);

      const verb = success ? "breached" : "failed hacking";
      const descriptor = success ? `stole ${stealAmount} points` : "raised extra alarm";
      return logHistory(updated, `${hacker.name} ${verb} ${target.name} and ${descriptor}`);
    }

    case "TimerTick": {
      const seconds = Math.max(0, action.seconds);
      let newTimer = state.timer - seconds;
      let alarm = clampAlarm(state.settings, state.alarmLevel + seconds * state.settings.timePenaltyPerTick);
      let newRound = state.round;
      let result = state;

      if (newTimer <= 0) {
        newRound = Math.min(state.settings.rounds, state.round + 1);
        alarm = clampAlarm(state.settings, alarm + 5);
        newTimer = state.settings.baseTimerSeconds;
        result = logHistory(result, `Round advanced to ${newRound}`);
      }

      result = recalcPanic(result, alarm);
      result = { ...result, round: newRound, timer: newTimer };

      return logHistory(result, `Timer ticked by ${seconds}s (timer ${newTimer}, alarm ${alarm})`);
    }

    default:
      return state;
  }
}

export function runDemo(): void {
  const settings = defaultRoomSettings();
  let state = createInitialGameState(settings);

  // Add players with distinct entry routes.
  state = applyAction(state, { type: "AddPlayer", id: "nova", name: "Nova" });
  state = applyAction(state, { type: "AddPlayer", id: "cipher", name: "Cipher" });
  state = applyAction(state, { type: "AddPlayer", id: "glitch", name: "Glitch" });

  state = applyAction(state, { type: "ChooseEntryRoute", playerId: "nova", route: "STEALTH" });
  state = applyAction(state, { type: "ChooseEntryRoute", playerId: "cipher", route: "FORCE" });
  state = applyAction(state, { type: "ChooseEntryRoute", playerId: "glitch", route: "SOCIAL" });

  console.log("--- Lockdown Countdown Demo ---");
  console.log("Initial state", { alarm: state.alarmLevel, round: state.round });

  // Round 1 actions
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "nova", route: "SAFE" });
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "cipher", route: "RISKY" });
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "glitch", route: "INSANE" });

  state = applyAction(state, { type: "SubmitAnswer", playerId: "nova", correct: true });
  state = applyAction(state, { type: "SubmitAnswer", playerId: "cipher", correct: false });
  state = applyAction(state, { type: "SubmitAnswer", playerId: "glitch", correct: true });

  state = applyAction(state, { type: "Hack", playerId: "cipher", targetId: "nova" });
  state = applyAction(state, { type: "TimerTick", seconds: 18 });

  // Round 2 actions
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "nova", route: "RISKY" });
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "cipher", route: "SAFE" });
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "glitch", route: "SAFE" });

  state = applyAction(state, { type: "SubmitAnswer", playerId: "nova", correct: true });
  state = applyAction(state, { type: "SubmitAnswer", playerId: "cipher", correct: true });
  state = applyAction(state, { type: "SubmitAnswer", playerId: "glitch", correct: false });

  state = applyAction(state, { type: "TimerTick", seconds: 20 });

  // Round 3 actions
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "nova", route: "INSANE" });
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "cipher", route: "RISKY" });
  state = applyAction(state, { type: "ChooseRiskRoute", playerId: "glitch", route: "RISKY" });

  state = applyAction(state, { type: "SubmitAnswer", playerId: "nova", correct: false });
  state = applyAction(state, { type: "SubmitAnswer", playerId: "cipher", correct: true });
  state = applyAction(state, { type: "SubmitAnswer", playerId: "glitch", correct: true });

  state = applyAction(state, { type: "Hack", playerId: "glitch", targetId: "cipher" });
  state = applyAction(state, { type: "TimerTick", seconds: 22 });

  // Final summary
  const leaderboard = [...state.players].sort((a, b) => b.score - a.score);
  const topPlayers = leaderboard.slice(0, 3).map((p) => `${p.name} (${p.score})`).join(", ");

  console.log("\n--- Final Summary ---");
  console.log(`Alarm level: ${state.alarmLevel}/${state.settings.maxAlarm}`);
  console.log(`Panic mode active: ${state.panicModeActive}`);
  console.log(`Round reached: ${state.round}`);
  console.log(`Top players: ${topPlayers}`);

  console.log("\nHistory:");
  state.history.forEach((entry) => console.log(`- ${entry}`));
}

runDemo();
