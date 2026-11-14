import test from 'node:test';
import assert from 'node:assert/strict';
import { blazeIsWeak, blazeLook, effectsAllowedOnPath, isLowEndDevice, resolveEffectsLevel, streakReminderText, upcomingReminderTimes, } from '../src/lib/appEffects.js';
test('effects level: reduce motion always wins, auto adapts to weak phones, explicit choice respected', () => {
    const strong = { reducedMotion: false, cores: 8, memoryGb: 8 };
    const weak = { reducedMotion: false, cores: 4, memoryGb: 2 };
    assert.equal(resolveEffectsLevel('auto', strong), 'full');
    assert.equal(resolveEffectsLevel('auto', weak), 'light');
    assert.equal(resolveEffectsLevel('full', weak), 'full');
    assert.equal(resolveEffectsLevel('light', strong), 'light');
    assert.equal(resolveEffectsLevel('off', strong), 'off');
    assert.equal(resolveEffectsLevel('full', { ...strong, reducedMotion: true }), 'off');
    assert.equal(isLowEndDevice({ reducedMotion: false }), false, 'unknown hardware is not assumed weak');
});
test('effects stay off on tests, screeners, practice and results; on for course, league and the game', () => {
    for (const ok of ['/', '/learn', '/ielts', '/ielts/', '/ielts/course', '/ielts/course/12', '/ielts/vocabulary/v-01', '/ielts/league', '/ielts/growth', '/ielts/journey']) {
        assert.equal(effectsAllowedOnPath(ok), true, ok);
    }
    for (const quiet of ['/ielts/listening-screener', '/ielts/reading-screener', '/ielts/trial-test-2', '/ielts/exam/9', '/ielts/exam/9/monitor',
        '/ielts/practice/targeted/4', '/ielts/practice/assigned', '/ielts/listening/3', '/ielts/writing/7', '/ielts/speaking/2',
        '/ielts/screener-result/1', '/ielts/reading/result/5', '/ielts/session/1', '/ielts/reviews', '/ielts/apply-prime', '/auth/callback']) {
        assert.equal(effectsAllowedOnPath(quiet), false, quiet);
    }
});
test('Blaze grows with the streak: spark, flame, blaze at 7, blue at 30, crowned legend at 100', () => {
    assert.equal(blazeLook(0).tier, 'spark');
    assert.equal(blazeLook(1).tier, 'flame');
    assert.equal(blazeLook(7).tier, 'blaze');
    assert.equal(blazeLook(30).tier, 'blue');
    assert.equal(blazeLook(100).tier, 'legend');
    assert.equal(blazeLook(100).crown, true);
    assert.ok(blazeLook(30).scale > blazeLook(7).scale && blazeLook(7).scale > blazeLook(1).scale);
});
test('Blaze weakens only in the evening when a streak is at risk', () => {
    assert.equal(blazeIsWeak({ streak: 5, todayDone: false, hour: 19 }), true);
    assert.equal(blazeIsWeak({ streak: 5, todayDone: false, hour: 12 }), false);
    assert.equal(blazeIsWeak({ streak: 5, todayDone: true, hour: 21 }), false);
    assert.equal(blazeIsWeak({ streak: 0, todayDone: false, hour: 21 }), false);
});
test('reminders: 7 pm on coming days, today only when not done and still before 7 pm', () => {
    const morning = new Date(2026, 10, 5, 9, 0);
    const evening = new Date(2026, 10, 5, 20, 0);
    const notDone = upcomingReminderTimes(morning, false, 3);
    assert.deepEqual(notDone.map((d) => [d.getDate(), d.getHours()]), [[5, 19], [6, 19], [7, 19]]);
    assert.deepEqual(upcomingReminderTimes(morning, true, 3).map((d) => d.getDate()), [6, 7]);
    assert.deepEqual(upcomingReminderTimes(evening, false, 3).map((d) => d.getDate()), [6, 7]);
    assert.match(streakReminderText(4).body, /4-day streak/);
    assert.match(streakReminderText(0).title, /waiting/);
});
test('website low-end rule prefers reported memory over cores', async () => {
    const { isLowEndWebDevice } = await import('../src/native/effects/effectsStore.js');
    assert.equal(isLowEndWebDevice({ cores: 2, memoryGb: 16 }), false);
    assert.equal(isLowEndWebDevice({ cores: 8, memoryGb: 2 }), true);
    assert.equal(isLowEndWebDevice({ cores: 4 }), false);
    assert.equal(isLowEndWebDevice({ cores: 2 }), true);
    assert.equal(isLowEndWebDevice({}), false);
});
