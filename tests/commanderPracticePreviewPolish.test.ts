import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');
const copy = readFileSync('src/features/cursedCommander/commanderPracticeCopy.ts', 'utf8');

test('Commander practice copy teaches the game in plain words and hides backend branding', () => {
  // Every language explains how to play instead of describing account access.
  assert.match(copy, /How to play: 1\) Tap an enemy\./);
  assert.match(copy, /طريقة اللعب:/);
  assert.match(copy, /Как играть:/);
  // Practice now pays daily XP, so no language may claim progress never changes.
  assert.doesNotMatch(copy, /your progress stays the same/);
  assert.doesNotMatch(arena, /TACTICAL PREVIEW/);
  assert.doesNotMatch(arena, /COMMANDER · V1 PREVIEW/);
  assert.doesNotMatch(copy, /Server-authorized preview testers only\./);
});

test('student-only backend denial is mapped to localized access copy', () => {
  assert.match(copy, /commander_preview_students_only/);
  assert.match(copy, /Commander Preview is available to student accounts only\./);
});

test('finished battles clear target state and suppress selection and focus badges', () => {
  assert.match(arena, /nextSession\.battle\.status !== 'active'[\s\S]*?setSelectedTargetId\(null\)/);
  assert.match(arena, /selectedTargetId=\{battle\.status === 'active' \? selectedTargetId : null\}/);
  assert.match(arena, /playerFocusTarget=\{battle\.status === 'active' \? visualPlayerFocusTarget : null\}/);
  assert.match(arena, /enemyFocusTarget=\{battle\.status === 'active' \? visualEnemyFocusTarget : null\}/);
});

test('battle log collapses paired focus marker and focus damage events in the UI only', () => {
  assert.match(copy, /export const visibleCommanderEvents/);
  assert.match(copy, /candidate\.code === 'focus_target'/);
  assert.match(arena, /visibleCommanderEvents\(battle\.events\)\.reverse\(\)/);
});
