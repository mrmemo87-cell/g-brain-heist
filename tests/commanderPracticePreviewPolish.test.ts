import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');

test('Commander preview copy matches student-wide access and hides backend version branding', () => {
  assert.match(arena, /Available to authenticated student accounts\./);
  assert.match(arena, /متاح لحسابات الطلاب المسجلين فقط\./);
  assert.match(arena, /Доступно авторизованным аккаунтам учеников\./);
  assert.match(arena, /COMMANDER · PRACTICE PREVIEW/);
  assert.doesNotMatch(arena, /COMMANDER · V1 PREVIEW/);
  assert.doesNotMatch(arena, /Server-authorized preview testers only\./);
});

test('student-only backend denial is mapped to localized access copy', () => {
  assert.match(arena, /commander_preview_students_only/);
  assert.match(arena, /Commander Preview is available to student accounts only\./);
});

test('finished battles clear target state and suppress selection and focus badges', () => {
  assert.match(arena, /nextSession\.battle\.status !== 'active'[\s\S]*?setSelectedTargetId\(null\)/);
  assert.match(arena, /selected=\{!finished && selectedTargetId === combatant\.id\}/);
  assert.match(arena, /focused=\{!finished && battle\.playerFocusTarget === combatant\.id\}/);
  assert.match(arena, /focused=\{!finished && battle\.enemyFocusTarget === combatant\.id\}/);
});

test('battle log collapses paired focus marker and focus damage events in the UI only', () => {
  assert.match(arena, /const visibleBattleEvents/);
  assert.match(arena, /next\?\.code === 'focus_target'/);
  assert.match(arena, /visibleBattleEvents\(battle\.events\)\.reverse\(\)/);
});
