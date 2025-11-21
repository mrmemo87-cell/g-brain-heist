import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAction,
  applyPanicModeTransform,
  createInitialGameState,
  evaluateEndCondition,
  getAlarmLevel,
  shouldEnterPanicMode,
} from "../src/features/lockdown/lockdownEngine";
import {
  AlarmLevel,
  EntryRoute,
  FinishReason,
  QuestionRiskRoute,
} from "../src/features/lockdown/lockdownTypes";
import { buildRoomSettings } from "../src/features/lockdown/defaultRoomSettings";

const buildState = () => createInitialGameState(buildRoomSettings());

test("getAlarmLevel respects thresholds", () => {
  assert.strictEqual(getAlarmLevel(0), AlarmLevel.LOW);
  assert.strictEqual(getAlarmLevel(30), AlarmLevel.GUARDED);
  assert.strictEqual(getAlarmLevel(60), AlarmLevel.HIGH);
  assert.strictEqual(getAlarmLevel(90), AlarmLevel.CRITICAL);
});

test("panic mode triggers on alarm or time pressure", () => {
  const alarmState = { ...buildState(), alarm: 90 };
  assert.ok(shouldEnterPanicMode(alarmState));

  const timeState = { ...buildState(), remainingTimeMs: 10_000 };
  assert.ok(shouldEnterPanicMode(timeState));

  const calmState = buildState();
  assert.ok(!shouldEnterPanicMode(calmState));

  const panicApplied = applyPanicModeTransform(calmState);
  assert.ok(panicApplied.panicModeActive);
  assert.ok(panicApplied.ruleSet.safeRouteDisabled);
});

test("players earn coins on correct answers and raise alarms on misses", () => {
  let state = buildState();
  state = applyAction(state, { type: "JOIN", playerId: "alpha", name: "Alpha" });
  state = applyAction(state, { type: "CHOOSE_RISK_ROUTE", playerId: "alpha", route: QuestionRiskRoute.RISKY });

  const afterCorrect = applyAction(state, { type: "SUBMIT_ANSWER", playerId: "alpha", correct: true });
  assert.ok(afterCorrect.players["alpha"].coins > state.players["alpha"].coins);
  assert.strictEqual(afterCorrect.alarm, state.alarm);

  const afterWrong = applyAction(state, { type: "SUBMIT_ANSWER", playerId: "alpha", correct: false });
  assert.ok(afterWrong.alarm > state.alarm);
});

test("hack action transfers coins and generates heat", () => {
  let state = buildState();
  state = applyAction(state, { type: "JOIN", playerId: "attacker", name: "Nova" });
  state = applyAction(state, { type: "JOIN", playerId: "victim", name: "Cipher" });
  state = applyAction(state, { type: "CHOOSE_ENTRY_ROUTE", playerId: "attacker", route: EntryRoute.FORCE });

  // Give victim some coins
  state = {
    ...state,
    players: {
      ...state.players,
      victim: { ...state.players["victim"], coins: 100 },
    },
  };

  const hacked = applyAction(state, { type: "ROUND_POST_ACTION", playerId: "attacker", action: "hack", targetId: "victim" });
  assert.ok(hacked.players["attacker"].coins > state.players["attacker"].coins);
  assert.ok(hacked.players["victim"].coins < state.players["victim"].coins);
  assert.ok(hacked.players["attacker"].heat >= state.players["attacker"].heat);
});

test("game ends once win or fail conditions hit", () => {
  let state = buildState();
  state = applyAction(state, { type: "JOIN", playerId: "p1", name: "Ace" });
  const coinWin = evaluateEndCondition({
    ...state,
    players: {
      ...state.players,
      p1: { ...state.players["p1"], coins: state.roomSettings.coinGoal },
    },
  });
  assert.strictEqual(coinWin, FinishReason.COIN_GOAL_REACHED);

  const alarmFail = evaluateEndCondition({ ...state, alarm: state.roomSettings.alarmMax });
  assert.strictEqual(alarmFail, FinishReason.ALARM_MAXED);

  const timeFail = evaluateEndCondition({ ...state, remainingTimeMs: 0 });
  assert.strictEqual(timeFail, FinishReason.TIME_EXPIRED);
});
