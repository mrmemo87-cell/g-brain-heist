import test from 'node:test';
import assert from 'node:assert/strict';
import { listeningPlayerPresentation, pauseMeansInterruption } from '../src/lib/ieltsListeningPlayer.js';
test('single-play listening: play once, no tapping while playing, finished stays locked', () => {
    const idle = listeningPlayerPresentation({ started: false, ended: false, interrupted: false });
    assert.equal(idle.enabled, true);
    assert.equal(idle.action, 'play');
    assert.match(idle.message, /hear it once/);
    const playing = listeningPlayerPresentation({ started: true, ended: false, interrupted: false });
    assert.equal(playing.enabled, false);
    assert.equal(playing.action, 'none');
    const done = listeningPlayerPresentation({ started: true, ended: true, interrupted: false });
    assert.equal(done.enabled, false);
    assert.equal(done.action, 'none');
    assert.equal(done.icon, '✓');
    // An interruption flag after the recording finished never re-enables playback.
    assert.equal(listeningPlayerPresentation({ started: true, ended: true, interrupted: true }).enabled, false);
});
test('a phone interruption offers resume from the paused position, never a replay', () => {
    const interrupted = listeningPlayerPresentation({ started: true, ended: false, interrupted: true });
    assert.equal(interrupted.enabled, true);
    assert.equal(interrupted.action, 'resume');
    assert.match(interrupted.message, /continue from where it stopped/i);
    assert.match(interrupted.ariaLabel, /Resume/);
});
test('only an un-auto-resumed pause of a started, unfinished recording counts as an interruption', () => {
    const mid = { started: true, ended: false, interrupted: false };
    assert.equal(pauseMeansInterruption(mid, false), true, 'background pause');
    assert.equal(pauseMeansInterruption(mid, true), false, 'learner tried to pause; auto-resume handles it');
    assert.equal(pauseMeansInterruption({ ...mid, started: false }, false), false, 'not started yet');
    assert.equal(pauseMeansInterruption({ ...mid, ended: true }, false), false, 'already finished');
});
