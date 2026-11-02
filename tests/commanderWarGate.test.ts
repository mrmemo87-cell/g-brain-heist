import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('Headquarters opens with the war gate: summon for new students, one-tap fight for enrolled ones', () => {
  const hq = read('src/features/cursedCommander/CommanderHeadquarters.tsx');
  const gate = read('src/features/cursedCommander/CommanderWarGate.tsx');
  assert.match(hq, /<CommanderWarGate/);
  assert.match(hq, /onSummon=\{claimStarterSquad\}/);
  assert.match(gate, /data-testid="commander-summon"/);
  assert.match(gate, /data-testid="commander-fight"/);
  assert.match(gate, /prefers-reduced-motion|cc-gate/);
  assert.match(read('src/features/cursedCommander/commanderWarGate.css'), /prefers-reduced-motion:\s*reduce/);
});

test('claiming the starter army goes straight into the first battle after the celebration', () => {
  const hq = read('src/features/cursedCommander/CommanderHeadquarters.tsx');
  const arena = read('src/features/cursedCommander/CommanderPracticeArena.tsx');
  assert.match(hq, /firstBattleAfterCelebration\.current = true/);
  assert.match(hq, /firstBattleAfterCelebration\.current\)[\s\S]*setPractice\("owned"\)/);
  assert.match(hq, /autoStart=\{practiceAuto\}/);
  assert.match(arena, /autoStart = false/);
  assert.match(arena, /if \(!autoStart \|\| checkpoint \|\| autoStarted\.current\) return;/, 'a saved battle is resumed, never replaced');
});

test('phones get a slim ability dock and a battlefield that fits the screen', () => {
  const dock = read('src/features/cursedCommander/CommanderCommandDock.tsx');
  const css = read('src/features/cursedCommander/commanderDock.css');
  const battlefield = read('src/features/cursedCommander/CommanderCinematicBattlefield.tsx');
  assert.match(dock, /cc-dock-ability__hint/);
  assert.match(css, /\.cc-dock-ability__hint\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(min-width: 640px\)[\s\S]*\.cc-dock-ability__hint\s*\{\s*display:\s*block/);
  assert.match(battlefield, /cc-stage-tappable/);
  assert.match(battlefield, /Math\.max\(540, Math\.min\(660/);
});
