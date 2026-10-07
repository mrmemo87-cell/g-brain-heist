import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedRead } from '../services/boundedRead';

test('timeout cancels the HTTP read and does not masquerade as an empty catalog', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(boundedRead(s => { signal = s; return new Promise(() => {}); }, 5), /timed out/);
  assert.equal(signal?.aborted, true);
});
test('navigation cancels a pending read even when the transport ignores cancellation', async () => {
  const navigation = new AbortController();
  let signal: AbortSignal | undefined;
  const pending = boundedRead(s => { signal = s; return new Promise(() => {}); }, 1000, navigation.signal);
  navigation.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(signal?.aborted, true);
});
test('successful and failed reads retain their meaning', async () => {
  assert.deepEqual(await boundedRead(async () => [], 100), []);
  await assert.rejects(boundedRead(async () => { throw new Error('Database unavailable'); }, 100), /Database unavailable/);
  const parent = new AbortController(); parent.abort();
  let invoked = false;
  await assert.rejects(boundedRead(async () => { invoked = true; return []; }, 100, parent.signal), /cancelled/);
  assert.equal(invoked, false);
});
