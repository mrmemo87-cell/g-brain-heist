import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedReadCache } from '../services/scopedReadCache';

test('concurrent dashboard reads share work, failed reads retry, and accounts cannot share cached values', async () => {
  let calls = 0;
  const cache = createScopedReadCache<number>(60_000);
  const load = async () => { calls++; return calls; };
  assert.deepEqual(await Promise.all(Array.from({ length: 30 }, () => cache.read('account-a', load))), Array(30).fill(1));
  assert.equal(await cache.read('account-a', load), 1);
  assert.equal(await cache.read('account-b', load), 2);
  assert.equal(calls, 2);
  cache.clear();
  await assert.rejects(cache.read('account-b', async () => { throw Error('offline'); }));
  assert.equal(await cache.read('account-b', load), 3);
});

test('invalidation prevents an old response from poisoning a fresh cache', async () => {
  const cache = createScopedReadCache<number>(60_000);
  let finish!: (value: number) => void;
  const old = cache.read('a', () => new Promise<number>(resolve => { finish = resolve; }));
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.read('a', async () => 2), 2);
  finish(1);
  assert.equal(await old, 1);
  assert.equal(await cache.read('a', async () => 3), 2);
});

test('unconfirmed entitlement responses are not cached', async () => {
  const cache = createScopedReadCache<{ authoritative: boolean }>(60_000, value => value.authoritative);
  await cache.read('a', async () => ({ authoritative: false }));
  assert.equal((await cache.read('a', async () => ({ authoritative: true }))).authoritative, true);
});
