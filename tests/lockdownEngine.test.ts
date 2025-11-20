import { describe, it, expect } from 'vitest';
import { AlarmLevel, RouteDifficulty, PlayerStatus } from './lockdownTypes';
import {
  getAlarmLevel,
  shouldEnterPanicMode,
  applyPanicModeTransform,
  submitAnswer,
  applyHackAction
} from './lockdownEngine';
import { calculateAwards } from './lockdownAnalytics';

describe('Lockdown Countdown engine', () => {
  it('returns correct alarm level thresholds', () => {
    const levels = Object.values(AlarmLevel);
    expect(levels.length).toBeGreaterThanOrEqual(5);

    expect(getAlarmLevel(0)).toBe(levels[0]);
    expect(getAlarmLevel(30)).toBe(levels[1]);
    expect(getAlarmLevel(60)).toBe(levels[2]);
    expect(getAlarmLevel(90)).toBe(levels[3]);
    expect(getAlarmLevel(100)).toBe(levels[4]);
  });

  it('triggers panic mode and disables SAFE route', () => {
    const state: any = {
      alarm: 95,
      remainingSeconds: 5,
      routes: [
        { id: 'safe', difficulty: RouteDifficulty.SAFE, enabled: true },
        { id: 'risky', difficulty: RouteDifficulty.RISKY, enabled: true }
      ]
    };

    expect(shouldEnterPanicMode(state)).toBe(true);

    const panicState = applyPanicModeTransform(state);
    const safeRoute = panicState.routes.find((route: any) => route.difficulty === RouteDifficulty.SAFE);
    expect(safeRoute?.enabled).toBe(false);
  });

  it('handles answers across route difficulties', () => {
    const state: any = {
      alarm: 10,
      routes: [
        { id: 'safe', difficulty: RouteDifficulty.SAFE, reward: 5, alarmPenalty: 0 },
        { id: 'risky', difficulty: RouteDifficulty.RISKY, reward: 10, alarmPenalty: 10 },
        { id: 'insane', difficulty: RouteDifficulty.INSANE, reward: 20, alarmPenalty: 20 }
      ],
      players: {
        alpha: { id: 'alpha', coins: 0, heat: 0, status: PlayerStatus.ACTIVE },
        beta: { id: 'beta', coins: 0, heat: 0, status: PlayerStatus.ACTIVE }
      }
    };

    const correctInsane = submitAnswer(state, {
      playerId: 'alpha',
      routeId: 'insane',
      difficulty: RouteDifficulty.INSANE,
      correct: true
    });

    expect(correctInsane.players.alpha.coins).toBeGreaterThan(state.players.alpha.coins);
    expect(correctInsane.players.alpha.heat).toBeGreaterThan(state.players.alpha.heat);
    expect(correctInsane.alarm).toBe(state.alarm);

    const wrongRisky = submitAnswer(state, {
      playerId: 'beta',
      routeId: 'risky',
      difficulty: RouteDifficulty.RISKY,
      correct: false
    });

    expect(wrongRisky.alarm).toBeGreaterThan(state.alarm);
    expect(wrongRisky.players.beta.coins).toBe(state.players.beta.coins);
  });

  it('transfers coins on hack and marks most wanted on high heat', () => {
    const state: any = {
      config: { hackStealPercent: 0.5, mostWantedHeat: 80 },
      players: {
        attacker: { id: 'attacker', coins: 10, heat: 70, status: PlayerStatus.ACTIVE },
        victim: { id: 'victim', coins: 100, heat: 10, status: PlayerStatus.ACTIVE }
      }
    };

    const hacked = applyHackAction(state, { attackerId: 'attacker', victimId: 'victim' });
    expect(hacked.players.attacker.coins).toBeGreaterThan(state.players.attacker.coins);
    expect(hacked.players.victim.coins).toBeLessThan(state.players.victim.coins);

    const overheated = applyHackAction({
      ...state,
      players: {
        attacker: { id: 'attacker', coins: 10, heat: 95, status: PlayerStatus.ACTIVE },
        victim: { id: 'victim', coins: 100, heat: 10, status: PlayerStatus.ACTIVE }
      }
    }, { attackerId: 'attacker', victimId: 'victim' });

    expect(overheated.players.attacker.status).toBe(PlayerStatus.MOST_WANTED);
  });
});

describe('Lockdown analytics awards', () => {
  it('identifies TopAgent, AccuracySniper, and ChaosGremlin', () => {
    const gameState: any = {
      players: {
        alpha: { id: 'alpha', coins: 120, correct: 9, total: 10, alarmRaised: 15 },
        beta: { id: 'beta', coins: 80, correct: 10, total: 12, alarmRaised: 40 },
        gamma: { id: 'gamma', coins: 50, correct: 4, total: 5, alarmRaised: 10 }
      }
    };

    const awards = calculateAwards(gameState);

    expect(awards.topAgent?.id ?? awards.topAgent).toBe('alpha');
    expect(awards.accuracySniper?.id ?? awards.accuracySniper).toBe('gamma');
    expect(awards.chaosGremlin?.id ?? awards.chaosGremlin).toBe('beta');
  });
});
