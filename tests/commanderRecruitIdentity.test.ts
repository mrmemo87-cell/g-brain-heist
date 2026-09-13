import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const identity = readFileSync('src/features/cursedCommander/commanderRecruitIdentity.ts', 'utf8');
const sprites = readFileSync('src/features/cursedCommander/commanderSpriteAssets.ts', 'utf8');
const battleSprite = readFileSync('src/features/cursedCommander/CommanderBattleSprite.tsx', 'utf8');
const portrait = readFileSync('src/features/cursedCommander/CommanderUnitPortrait.tsx', 'utf8');

test('Commander elite recruits have explicit collectible identities', () => {
  for (const catalogId of ['grave_bastion', 'plague_scribe', 'rift_reaver', 'volt_seer']) {
    assert.match(identity, new RegExp(`${catalogId}:`));
  }

  for (const school of ['void', 'storm', 'rot', 'grave']) {
    assert.match(identity, new RegExp(`${school}: \\{`));
  }

  for (const power of ['Death Bolt', 'Chain Surge', 'Rot Miasma', 'Raise Dead']) {
    assert.match(identity, new RegExp(power));
  }

  assert.match(identity, /Sepulchral Fortress/);
  assert.match(identity, /Decay Architect/);
  assert.match(identity, /Rift Marauder/);
  assert.match(identity, /Arc Oracle/);
});

test('Commander sprite resolution is catalog-aware without changing stable battle ids', () => {
  assert.match(sprites, /COMMANDER_CATALOG_SPRITE_KEYS/);
  assert.match(sprites, /resolveCommanderSpriteKey/);
  assert.match(sprites, /grave_bastion: 'player_guard'/);
  assert.match(sprites, /rift_reaver: 'player_guard'/);
  assert.match(sprites, /plague_scribe: 'player_archer'/);
  assert.match(sprites, /volt_seer: 'player_archer'/);
  assert.match(sprites, /catalogId\?: string \| null/);
});

test('Commander battle body and portrait share faction identity presentation', () => {
  for (const source of [battleSprite, portrait]) {
    assert.match(source, /getCommanderRecruitIdentity/);
    assert.match(source, /combatant\.catalogId/);
    assert.match(source, /combatant\.school/);
  }

  assert.match(battleSprite, /data-commander-catalog-id/);
  assert.match(battleSprite, /data-commander-school/);
  assert.match(portrait, /data-commander-portrait-catalog-id/);
  assert.match(portrait, /data-commander-portrait-school/);
});

test('Recruit identity presentation remains client-only and economy-safe', () => {
  for (const source of [identity, sprites, battleSprite, portrait]) {
    assert.doesNotMatch(source, /supabase\.from|supabase\.rpc|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
  }
});
