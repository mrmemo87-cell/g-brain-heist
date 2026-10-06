import test from 'node:test';
import assert from 'node:assert/strict';
import { makeIeltsAudioCheckpointKey, readIeltsAudioCheckpoint, saveIeltsAudioCheckpoint, restoreIeltsAudioCheckpoint } from '../services/ieltsAudioCheckpoint';

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
test('refresh restores exact playback position without starting playback', () => {
  const storage = memory();
  const key = makeIeltsAudioCheckpointKey('attempt-a', 'reviewed-audio-v2.mp3');
  assert.equal(saveIeltsAudioCheckpoint(key, 173.25, storage), true);
  let playCalls = 0;
  const remountedAudio = { currentTime: 0, duration: 500, play: () => { playCalls++; } };
  assert.equal(restoreIeltsAudioCheckpoint(remountedAudio, key, storage), true);
  assert.equal(remountedAudio.currentTime, 173.25);
  assert.equal(playCalls, 0);
});
test('retakes and different recordings never inherit another audio position', () => {
  const storage = memory();
  saveIeltsAudioCheckpoint(makeIeltsAudioCheckpointKey('first', 'v2.mp3'), 80, storage);
  assert.equal(readIeltsAudioCheckpoint(makeIeltsAudioCheckpointKey('retake', 'v2.mp3'), storage), 0);
  assert.equal(readIeltsAudioCheckpoint(makeIeltsAudioCheckpointKey('first', 'v3.mp3'), storage), 0);
});
test('restore waits for metadata, clamps corrupt offsets, and retries a failed seek', () => {
  const storage = memory();
  storage.setItem('key', '900');
  const audio = { currentTime: 0, duration: NaN };
  assert.equal(restoreIeltsAudioCheckpoint(audio, 'key', storage), false);
  assert.equal(audio.currentTime, 0);
  audio.duration = 400;
  assert.equal(restoreIeltsAudioCheckpoint(audio, 'key', storage), true);
  assert.equal(audio.currentTime, 400);
  let position = 0;
  let seekReady = false;
  const delayed = { duration: 400, get currentTime() { return position; }, set currentTime(value: number) {
    if (!seekReady) throw new Error('metadata not seekable'); position = value;
  } };
  assert.equal(restoreIeltsAudioCheckpoint(delayed, 'key', storage), false);
  seekReady = true;
  assert.equal(restoreIeltsAudioCheckpoint(delayed, 'key', storage), true);
});
test('rewinding to zero and completed audio persist; invalid or unavailable storage cannot break the assessment', () => {
  const storage = memory();
  saveIeltsAudioCheckpoint('key', 50, storage);
  saveIeltsAudioCheckpoint('key', 0, storage);
  assert.equal(readIeltsAudioCheckpoint('key', storage), 0);
  for (const value of ['null', '{}', '"12"', '-1', 'broken']) {
    storage.setItem('key', value);
    assert.equal(readIeltsAudioCheckpoint('key', storage), 0);
  }
  assert.equal(saveIeltsAudioCheckpoint('key', NaN, storage), false);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
  assert.equal(readIeltsAudioCheckpoint('key', blocked), 0);
  assert.equal(saveIeltsAudioCheckpoint('key', 23, blocked), false);
});
