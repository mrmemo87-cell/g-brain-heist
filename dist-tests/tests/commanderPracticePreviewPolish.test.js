import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');
const copy = readFileSync('src/features/cursedCommander/commanderPracticeCopy.ts', 'utf8');
test('Commander preview copy matches student-wide access and hides backend version branding', () => {
    assert.match(copy, /Open to authenticated student accounts\./);
    assert.match(copy, /متاح لحسابات الطلاب المسجلين\./);
    assert.match(copy, /Доступно авторизованным аккаунтам учеников\./);
    assert.match(arena, /COMMANDER · TACTICAL PREVIEW/);
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
