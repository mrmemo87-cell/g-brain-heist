import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

const requiredAssets = [
  'src/assets/Grave Bastion/Grave Bastion standing.png',
  'src/assets/Grave Bastion/Grave Bastion attacking.png',
  'src/assets/Grave Bastion/Grave Bastion attacked.png',
  'src/assets/Grave Bastion/Grave Bastion defeated.png',
  'src/assets/Rift Reaver/Rift Reaver standing.png',
  'src/assets/Rift Reaver/Rift Reaver attacking.png',
  'src/assets/Rift Reaver/Rift Reaver attacked.png',
  'src/assets/Rift Reaver/Rift Reaver defeated.png',
  'src/assets/Plague Scribe/Plague Scribe standing.png',
  'src/assets/Plague Scribe/Plague Scribe attacking.png',
  'src/assets/Plague Scribe/Plague Scribe just shot.png',
  'src/assets/Plague Scribe/Plague Scribe attacked.png',
  'src/assets/Plague Scribe/Plague Scribe defeated.png',
  'src/assets/Plague Scribe/Plague Scribe projectile.png',
  'src/assets/Volt Seer/Volt Seer standing.png',
  'src/assets/Volt Seer/Volt Seer attacking.png',
  'src/assets/Volt Seer/Volt Seer just shot.png',
  'src/assets/Volt Seer/Volt Seer attacked.png',
  'src/assets/Volt Seer/Volt Seer defeated.png',
  'src/assets/Volt Seer/Volt Seer projectile.png',
  'src/assets/commander-factions/grave-sigil.png',
  'src/assets/commander-factions/rot-sigil.png',
  'src/assets/commander-factions/void-sigil.png',
  'src/assets/commander-factions/storm-sigil.png',
  'src/assets/commander-vfx/commander-summon-portal.png',
  'src/assets/commander-vfx/commander-legendary-burst.png',
] as const;

const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('Commander premium PNG release materializes all 26 required assets', () => {
  assert.equal(requiredAssets.length, 26);
  for (const asset of requiredAssets) {
    assert.equal(existsSync(join(root, asset)), true, `missing required Commander asset: ${asset}`);
  }

  const exactManagedDirs: Array<[string, string[]]> = [
    ['src/assets/Grave Bastion', ['Grave Bastion standing.png', 'Grave Bastion attacking.png', 'Grave Bastion attacked.png', 'Grave Bastion defeated.png']],
    ['src/assets/Rift Reaver', ['Rift Reaver standing.png', 'Rift Reaver attacking.png', 'Rift Reaver attacked.png', 'Rift Reaver defeated.png']],
    ['src/assets/Plague Scribe', ['Plague Scribe standing.png', 'Plague Scribe attacking.png', 'Plague Scribe just shot.png', 'Plague Scribe attacked.png', 'Plague Scribe defeated.png', 'Plague Scribe projectile.png']],
    ['src/assets/Volt Seer', ['Volt Seer standing.png', 'Volt Seer attacking.png', 'Volt Seer just shot.png', 'Volt Seer attacked.png', 'Volt Seer defeated.png', 'Volt Seer projectile.png']],
    ['src/assets/commander-factions', ['grave-sigil.png', 'rot-sigil.png', 'void-sigil.png', 'storm-sigil.png']],
  ];

  for (const [dir, expected] of exactManagedDirs) {
    const actual = readdirSync(join(root, dir)).filter((name) => name.endsWith('.png')).sort();
    assert.deepEqual(actual, [...expected].sort(), `unexpected PNG set in ${dir}`);
  }

  assert.equal(existsSync(join(root, 'scripts/.cc-premium-assets')), false, 'temporary Commander .b64 staging must not ship');
});

test('Commander premium PNGs have direct build-time imports and runtime consumers', () => {
  const premiumSource = read('src/features/cursedCommander/commanderPremiumAssets.ts');
  const spriteSource = read('src/features/cursedCommander/commanderSpriteAssets.ts');
  const battleSource = read('src/features/cursedCommander/CommanderBattleSprite.tsx');
  const vfxSource = read('src/features/cursedCommander/commanderVfxAssets.ts');

  assert.equal(premiumSource.includes('import.meta.glob'), false, 'premium release contract must use direct imports');
  for (const asset of requiredAssets) {
    const fromFeature = asset.replace('src/assets/', '../../assets/');
    assert.match(premiumSource, new RegExp(fromFeature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const asset of requiredAssets.slice(0, 20)) {
    assert.equal(spriteSource.includes(asset.replace('src/assets/', '../../assets/')), true, `sprite runtime must reference ${asset}`);
  }

  assert.match(spriteSource, /grave_bastion:\s*'player_grave_bastion'/);
  assert.match(spriteSource, /rift_reaver:\s*'player_rift_reaver'/);
  assert.match(spriteSource, /plague_scribe:\s*'player_plague_scribe'/);
  assert.match(spriteSource, /volt_seer:\s*'player_volt_seer'/);
  assert.match(spriteSource, /player_plague_scribe:[\s\S]*?justShot:[\s\S]*?projectile:/);
  assert.match(spriteSource, /player_volt_seer:[\s\S]*?justShot:[\s\S]*?projectile:/);

  assert.equal(battleSource.includes('identity.sigilUrl'), true);
  assert.equal(battleSource.includes('COMMANDER_VFX.summonPortal'), true);
  assert.equal(battleSource.includes('COMMANDER_VFX.legendaryBurst'), true);
  assert.equal(battleSource.includes('definition.projectile'), true);
  assert.equal(battleSource.includes('cc-elite-authored-projectile'), true);
  assert.equal(vfxSource.includes('?? lance'), false);
  assert.equal(vfxSource.includes('?? slash'), false);
});
