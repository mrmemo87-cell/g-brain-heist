import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommanderCinematicStep, buildCommanderCinematicSteps, } from '../src/features/cursedCommander/commanderCinematicPlayback.js';
const combatants = [
    { id: 'player_commander', side: 'player', role: 'commander', name: 'Cipher Commander', hp: 100, maxHp: 100, shield: 12, attack: 0 },
    { id: 'player_archer', side: 'player', role: 'unit', name: 'Plague Scribe', hp: 0, maxHp: 58, shield: 0, attack: 9, school: 'rot' },
    { id: 'enemy_commander', side: 'enemy', role: 'commander', name: 'Warden Null', hp: 98, maxHp: 98, shield: 10, attack: 0 },
];
test('cinematic playback groups shield absorption into the attack that caused it', () => {
    const events = [
        { id: 's1', turn: 1, side: 'enemy', code: 'shield_absorb', actorName: 'Warden Null', amount: 10 },
        { id: 'a1', turn: 1, side: 'player', code: 'death_bolt', actorName: 'Cipher Commander', targetName: 'Warden Null', amount: 34 },
    ];
    const steps = buildCommanderCinematicSteps(events);
    assert.equal(steps.length, 1);
    assert.equal(steps[0]?.kind, 'attack');
    assert.equal(steps[0]?.shieldDamage, 10);
    assert.equal(steps[0]?.hpDamage, 24);
    const next = applyCommanderCinematicStep(combatants, steps[0]);
    const warden = next.find((combatant) => combatant.id === 'enemy_commander');
    assert.equal(warden?.shield, 0);
    assert.equal(warden?.hp, 74);
});
test('school attack events use normal damage playback while Grave uses a restore beat', () => {
    const attacks = [
        { id: 'storm', turn: 2, side: 'player', code: 'chain_surge', actorName: 'Cipher Commander', targetName: 'Warden Null', amount: 16 },
        { id: 'rot', turn: 2, side: 'player', code: 'rot_miasma', actorName: 'Cipher Commander', targetName: 'Warden Null', amount: 8 },
    ];
    assert.deepEqual(buildCommanderCinematicSteps(attacks).map((step) => step.kind), ['attack', 'attack']);
    const restoreEvent = {
        id: 'grave', turn: 3, side: 'player', code: 'raise_dead', actorName: 'Cipher Commander', targetName: 'Plague Scribe', amount: 20,
    };
    const restore = buildCommanderCinematicSteps([restoreEvent])[0];
    assert.equal(restore.kind, 'restore');
    const next = applyCommanderCinematicStep(combatants, restore);
    assert.equal(next.find((combatant) => combatant.id === 'player_archer')?.hp, 20);
    assert.equal(combatants.find((combatant) => combatant.id === 'player_archer')?.hp, 0, 'playback must not mutate the source snapshot');
});
test('focus acquisition remains a separate cinematic beat before focus damage', () => {
    const events = [
        { id: 'f0', turn: 2, side: 'player', code: 'focus_target', actorName: 'Cipher Commander', targetName: 'Warden Null' },
        { id: 's2', turn: 2, side: 'enemy', code: 'shield_absorb', actorName: 'Warden Null', amount: 7 },
        { id: 'f1', turn: 2, side: 'player', code: 'focus_target', actorName: 'Cipher Commander', targetName: 'Warden Null', amount: 7 },
    ];
    const steps = buildCommanderCinematicSteps(events);
    assert.deepEqual(steps.map((step) => step.kind), ['focus_lock', 'attack']);
    assert.equal(steps[1]?.shieldDamage, 7);
    assert.equal(steps[1]?.hpDamage, 0);
});
test('guard updates only the visual shield while preserving the source snapshot', () => {
    const event = {
        id: 'g1', turn: 3, side: 'player', code: 'guard', actorName: 'Cipher Commander', amount: 18,
    };
    const step = buildCommanderCinematicSteps([event])[0];
    const before = structuredClone(combatants);
    const next = applyCommanderCinematicStep(combatants, step);
    assert.equal(next.find((combatant) => combatant.id === 'player_commander')?.shield, 30);
    assert.deepEqual(combatants, before);
});
