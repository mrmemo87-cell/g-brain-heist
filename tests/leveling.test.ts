import test from 'node:test';
import assert from 'node:assert/strict';
import { XP_PER_LEVEL, getXpProgress, levelFromXp } from '../src/lib/leveling.js';

test('levelFromXp follows backend formula with 100 XP per level', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(50), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(275), 3);
});

test('getXpProgress reports progress within the current level', () => {
  const progress = getXpProgress(250, 3);

  assert.equal(progress.effectiveLevel, 3);
  assert.equal(progress.calculatedLevel, 3);
  assert.equal(progress.xpIntoLevel, 50);
  assert.equal(progress.xpForNextLevel, XP_PER_LEVEL);
  assert.equal(progress.nextLevelTotalXp, 300);
  assert.equal(progress.progress, 0.5);
});

test('getXpProgress never drops below the XP-derived level', () => {
  const progress = getXpProgress(120, 1);

  assert.equal(progress.calculatedLevel, 2);
  assert.equal(progress.effectiveLevel, 2);
  assert.equal(progress.nextLevelTotalXp, 200);
  assert.equal(progress.xpIntoLevel, 20);
});

