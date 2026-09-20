import assert from 'node:assert/strict';
import test from 'node:test';
import { startPracticeBattle, applyPracticeTurn } from '../supabase/functions/commander_practice/engine.js';
import { readCommanderSession, saveCommanderSession } from '../src/features/cursedCommander/commanderSessionCache.js';
import { getCommanderPresentationPoint, commanderProjectileAngle } from '../src/features/cursedCommander/commanderPresentationLayout.js';
const now = 1789230000000;
const userId = 'test-student';
const storage = () => {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
};
const session = (sub = userId, exp = now + 60000) => {
    const battle = applyPracticeTurn(startPracticeBattle(99), { move: 'death_bolt', targetId: 'enemy_commander' });
    return { battle, transcript: `${Buffer.from(JSON.stringify({ v: 1, sub, exp, state: battle })).toString('base64url')}.fixture-signature`, expiresAt: new Date(exp).toISOString() };
};
test('refresh restores all signed combat values and pending input without healing or consuming a turn', () => {
    const store = storage();
    const confirmed = session();
    assert.equal(saveCommanderSession(store, userId, confirmed), true);
    const restored = readCommanderSession(store, userId, now);
    assert.deepEqual(restored.session, confirmed);
    assert.equal(restored.session.battle.playerDeathBoltCooldown, 2);
    assert.equal(restored.session.battle.turn, 2);
    const pending = { move: 'guard', targetId: null };
    saveCommanderSession(store, userId, confirmed, pending);
    assert.deepEqual(readCommanderSession(store, userId, now)?.pending, pending);
    const recovered = applyPracticeTurn(confirmed.battle, pending);
    assert.deepEqual(recovered, applyPracticeTurn(confirmed.battle, pending));
    saveCommanderSession(store, userId, confirmed);
    assert.equal(readCommanderSession(store, userId, now)?.pending, undefined);
});
test('cache ignores another account, expiry, malformed data, and blocked storage', () => {
    const store = storage();
    saveCommanderSession(store, userId, session('another-user'));
    assert.equal(readCommanderSession(store, userId, now), null);
    saveCommanderSession(store, userId, session(userId, now));
    assert.equal(readCommanderSession(store, userId, now), null);
    store.setItem(`bh:commander:practice:v1:${userId}`, '{broken');
    assert.equal(readCommanderSession(store, userId, now), null);
    const blocked = { ...store, setItem: () => { throw Error('quota'); }, getItem: () => { throw Error('disabled'); } };
    assert.equal(saveCommanderSession(blocked, userId, session()), false);
    assert.equal(readCommanderSession(blocked, userId, now), null);
});
test('compact projection keeps both teams inside the board without mutating canonical combatants', () => {
    const battle = startPracticeBattle(99);
    const before = structuredClone(battle);
    const slots = battle.combatants.map(unit => getCommanderPresentationPoint(unit, true));
    assert.equal(new Set(slots.map(p => `${p.x}:${p.y}`)).size, 6);
    assert.ok(slots.every(p => p.x >= 14 && p.x <= 86 && p.y >= 30 && p.y <= 90));
    for (const side of ['player', 'enemy']) {
        const points = battle.combatants.filter(unit => unit.side === side).map(unit => getCommanderPresentationPoint(unit, true)).sort((a, b) => a.y - b.y);
        assert.equal(new Set(points.map(point => point.x)).size, 3, 'each squad must form a staggered battlefield wedge');
        assert.ok(side === 'player' ? points[0].x < points[1].x && points[1].x < points[2].x : points[0].x > points[1].x && points[1].x > points[2].x);
    }
    assert.deepEqual(battle, before);
});
test('projectile headings point toward targets in rendered pixels across narrow and wide boards', () => {
    for (const width of [320, 375, 390, 430, 768, 1024, 1440])
        for (const dx of [-50, 50])
            for (const dy of [-30, 0, 30]) {
                for (const art of [46, -36.5]) {
                    const rendered = commanderProjectileAngle(dx, dy, width, 850, art) + art;
                    const angle = rendered * Math.PI / 180;
                    const expected = Math.atan2(dy * 850, dx * width);
                    assert.ok(Math.abs(Math.cos(angle) - Math.cos(expected)) < 1e-9);
                    assert.ok(Math.abs(Math.sin(angle) - Math.sin(expected)) < 1e-9);
                }
            }
});
test('owned-army practice uses a separate checkpoint without discarding fixed practice', () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
    const now = Date.now();
    const fixed = startPracticeBattle(5);
    const owned = { ...startPracticeBattle(6), loadoutVersion: 3, loadoutLabel: 'Rift Blade · Aegis Shield' };
    const session = (battle) => ({ battle, expiresAt: new Date(now + 60000).toISOString(), transcript: Buffer.from(JSON.stringify({ v: 1, sub: 'student', exp: now + 60000, state: battle })).toString('base64url') + '.signature' });
    saveCommanderSession(storage, 'student', session(fixed));
    saveCommanderSession(storage, 'student', session(owned), undefined, true);
    assert.equal(readCommanderSession(storage, 'student', now)?.session.battle.seed, 5);
    assert.equal(readCommanderSession(storage, 'student', now, true)?.session.battle.seed, 6);
    assert.equal(readCommanderSession(storage, 'student', now, true)?.session.battle.loadoutVersion, 3);
});
