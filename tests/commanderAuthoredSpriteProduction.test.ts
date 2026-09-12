import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Commander authored sprite registry covers every combatant and archer projectile', () => {
  const assets = readFileSync('src/features/cursedCommander/commanderSpriteAssets.ts', 'utf8');

  for (const id of ['player_commander', 'player_guard', 'player_archer', 'enemy_commander', 'enemy_guard', 'enemy_archer']) {
    assert.match(assets, new RegExp(`${id}:`));
  }

  for (const pose of ['standing', 'attacking', 'attacked', 'defeated']) {
    assert.match(assets, new RegExp(`${pose}:`));
  }

  assert.match(assets, /Shade Archer just shot\.png/);
  assert.match(assets, /Hollow Ranger just shot\.png/);
  assert.match(assets, /Shade Archer arrow\.png/);
  assert.match(assets, /Hollow Ranger arrow\.png/);
  assert.match(assets, /preloadCommanderSpriteAssets/);
  assert.match(assets, /poseCalibration/);
});

test('Commander battle sprite decodes before pose reveal and keeps a fixed art canvas', () => {
  const sprite = readFileSync('src/features/cursedCommander/CommanderBattleSprite.tsx', 'utf8');

  assert.match(sprite, /new Image\(\)/);
  assert.match(sprite, /image\.decode/);
  assert.match(sprite, /previousFrame/);
  assert.match(sprite, /POSE_FADE_MS/);
  assert.match(sprite, /getCommanderSpriteCalibration/);
  assert.match(sprite, /object-contain object-bottom/);
  assert.match(sprite, /pointer-events-none/);
  assert.doesNotMatch(sprite, /supabase\.from|supabase\.rpc|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
});
