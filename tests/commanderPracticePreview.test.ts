import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyPracticeTurn,
  startPracticeBattle,
} from '../supabase/functions/commander_practice/engine';

test('practice combat is deterministic for identical seed and intent', () => {
  const first = applyPracticeTurn(startPracticeBattle(424242), {
    move: 'focus_target',
    targetId: 'enemy_commander',
  });
  const second = applyPracticeTurn(startPracticeBattle(424242), {
    move: 'focus_target',
    targetId: 'enemy_commander',
  });

  assert.deepEqual(first, second);
  assert.equal(first.turn, 2);
});

test('practice combat rejects forged target ids and preserves source state', () => {
  const original = startPracticeBattle(7);
  const snapshot = structuredClone(original);

  assert.throws(
    () => applyPracticeTurn(original, { move: 'death_bolt', targetId: 'player_commander' }),
    /invalid_target/,
  );
  assert.deepEqual(original, snapshot);
});

test('death bolt has a server-enforced cooldown', () => {
  const afterBolt = applyPracticeTurn(startPracticeBattle(99), {
    move: 'death_bolt',
    targetId: 'enemy_commander',
  });

  assert.equal(afterBolt.playerDeathBoltCooldown, 2);
  assert.throws(
    () => applyPracticeTurn(afterBolt, { move: 'death_bolt', targetId: 'enemy_commander' }),
    /death_bolt_on_cooldown/,
  );
});

test('preview API is authenticated, allowlisted, signed, and persistence-free', () => {
  const api = readFileSync('supabase/functions/commander_practice/index.ts', 'utf8');
  const config = readFileSync('supabase/config.toml', 'utf8');

  assert.match(api, /admin\.auth\.getUser\(token\)/);
  assert.match(api, /COMMANDER_PREVIEW_TESTER_IDS/);
  assert.match(api, /COMMANDER_PREVIEW_TESTER_EMAILS/);
  assert.match(api, /COMMANDER_PREVIEW_SIGNING_SECRET/);
  assert.match(api, /crypto\.subtle\.sign/);
  assert.match(api, /crypto\.subtle\.verify/);
  assert.doesNotMatch(api, /\.from\s*\(/);
  assert.doesNotMatch(api, /\.rpc\s*\(/);
  assert.doesNotMatch(api, /\bfetch\s*\(/);
  assert.match(config, /\[functions\.commander_practice\][\s\S]*?verify_jwt\s*=\s*true/);
});

test('Game tab adds Commander Preview without replacing legacy Attack', () => {
  const mainActions = readFileSync('components/MainActions.tsx', 'utf8');

  assert.match(mainActions, /CommanderPracticeArena/);
  assert.match(mainActions, /setShowCommanderPreview\(true\)/);
  assert.match(mainActions, /handlePilotClick\('Launch Attack', onStartPvp\)/);
  assert.match(mainActions, /mission-console-images\/attack\.webp/);
  assert.match(mainActions, /onOpenLockdown[\s\S]*?Lockdown Mode/);
});