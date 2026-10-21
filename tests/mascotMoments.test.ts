import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const moments = readFileSync('src/features/studentMascot/mascotMoments.ts', 'utf8');
const dock = readFileSync('src/features/studentMascot/StudentMascotDock.tsx', 'utf8');
const card = readFileSync('components/student/DailyMissionCard.tsx', 'utf8');
const board = readFileSync('components/student/WeeklyClassBoard.tsx', 'utf8');

test('the cat never plays the angry or boxing clip as a reaction to a wrong answer', () => {
  assert.match(dock, /detail\.moment === 'wrong'\) play\('greet', 2\.6\)/);
  const reactions = dock.slice(dock.indexOf('const moment = (event: Event)'), dock.indexOf('window.addEventListener(MASCOT_MOMENT_EVENT'));
  assert.doesNotMatch(reactions, /play\('angry'|play\('box'/);
});

test('the big celebration only moves the cat when motion is allowed', () => {
  assert.match(moments, /document\.body\.classList\.contains\('light-mode'\)/);
  assert.match(dock, /if \(mascotMotionReduced\(\)\) \{ play\('flip'\); return; \}/);
  assert.match(dock, /if \(!detail \|\| media\?\.matches \|\| document\.hidden\) return;/);
});

test('the reward waits for the celebration but never more than 7 seconds', () => {
  assert.match(moments, /new Promise<void>\(\(resolve\) => window\.setTimeout\(resolve, 7000\)\)/);
  assert.match(moments, /if \(!finished\) return Promise\.resolve\(\);/);
  assert.match(card, /celebrateWithMascot\(\)\.then/);
});

test('small reactions are wired to the mission and the class board', () => {
  assert.match(card, /mascotMoment\(result\.correct \? 'correct' : 'wrong'\)/);
  assert.match(card, /mascotMoment\('mission-start'\)/);
  assert.match(board, /mascotMoment\('climb'\)/);
});

test('the new model version is not served from an old cache', () => {
  assert.match(dock, /brains-heist-neon-cat\.glb\?v=2/);
  for (const prefix of ['warm_up', 'dance_03', 'dance_05', 'flip']) assert.match(dock, new RegExp(`'${prefix}'`));
});
