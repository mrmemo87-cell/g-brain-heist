import test from 'node:test';
import assert from 'node:assert/strict';
import { isSnoozed, readSnooze, recordSnooze } from '../src/lib/promptSnooze';
import { announcePushMoment, PUSH_MOMENT_EVENT } from '../src/lib/pushMoment';

const DAY = 24 * 60 * 60 * 1000;
const makeStorage = () => {
  const store = new Map<string, string>();
  return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
};

test('"not now" snoozes for the given days, then the prompt comes back', () => {
  const s = makeStorage();
  const t0 = Date.UTC(2026, 9, 29);
  assert.equal(isSnoozed(readSnooze(s, 'k'), t0, 3), false);
  recordSnooze(s, 'k', t0, 3);
  assert.equal(isSnoozed(readSnooze(s, 'k'), t0 + 2 * DAY, 3), true);
  assert.equal(isSnoozed(readSnooze(s, 'k'), t0 + 4 * DAY, 3), false);
});

test('after the maximum number of "not now"s the prompt stops for good', () => {
  const s = makeStorage();
  const t0 = Date.UTC(2026, 9, 29);
  for (let i = 0; i < 3; i += 1) recordSnooze(s, 'k', t0 + i * 10 * DAY, 3);
  assert.equal(readSnooze(s, 'k').count, 3);
  assert.equal(isSnoozed(readSnooze(s, 'k'), t0 + 1000 * DAY, 3), true);
});

test('old permanent dismissals ("1") get one more chance; bad or blocked storage is safe', () => {
  const s = makeStorage();
  s.store.set('k', '1');
  assert.deepEqual(readSnooze(s, 'k'), { count: 1, until: 0 });
  s.store.set('k', '{not json');
  assert.deepEqual(readSnooze(s, 'k'), { count: 0, until: 0 });
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readSnooze(blocked, 'k'), { count: 0, until: 0 });
  assert.doesNotThrow(() => recordSnooze(blocked, 'k', 0, 3));
  assert.deepEqual(readSnooze(undefined, 'k'), { count: 0, until: 0 });
});

test('screens announce fun moments with a reason', () => {
  const fired: Array<{ type: string; reason?: string }> = [];
  announcePushMoment('battle', {
    dispatchEvent: (e: Event) => { fired.push({ type: e.type, reason: (e as CustomEvent).detail?.reason }); return true; },
  });
  assert.deepEqual(fired, [{ type: PUSH_MOMENT_EVENT, reason: 'battle' }]);
  assert.doesNotThrow(() => announcePushMoment('reaction', undefined));
});
