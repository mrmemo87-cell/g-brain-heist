import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const trainingAssets = [
  'training-force.png',
  'training-defense.png',
  'training-dexterity.png',
  'training-stamina.png',
  'training-hall.png',
];

test('Commander training console ships lightweight presentation assets without owning game data', () => {
  const source = read('src/features/cursedCommander/CommanderHeadquarters.tsx');
  const vfx = read('src/features/cursedCommander/commanderVfxAssets.ts');
  const css = read('src/features/cursedCommander/commanderTraining.css');

  assert.match(vfx, /commanderTraining\.css/);
  assert.match(source, /commanderStatRank\(hq, stat\.id\)/);
  assert.match(source, /commanderTrainingCost\(rank, hq\.campaign\.rules\)/);
  assert.match(source, /coins < cost/);
  assert.match(source, /operation:\s*"train"/);

  for (const asset of trainingAssets) {
    assert.equal(
      existsSync(join(root, 'public/commander-training', asset)),
      true,
      `${asset} must ship with the Commander training console`,
    );
    assert.ok(
      css.includes(`/commander-training/${asset}`),
      `${asset} must be referenced by the Training presentation`,
    );
  }

  assert.match(css, /\.cc-hq-content:has\(\.cc-hq-training\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.equal(
    css.includes('420 / 800 XP'),
    false,
    'training presentation must not bake fake progression values',
  );
});
