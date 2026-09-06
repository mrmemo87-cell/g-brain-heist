import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');
const heartbeatCall = "supabase.rpc('rpc_touch_last_seen')";

function assertHeartbeatQueriesAreExecuted(source: string, label: string, expectedCalls: number) {
  let cursor = 0;
  let calls = 0;

  while (true) {
    const index = source.indexOf(heartbeatCall, cursor);
    if (index === -1) break;

    calls += 1;
    const prefix = source.slice(Math.max(0, index - 24), index);
    const suffix = source.slice(index + heartbeatCall.length, index + heartbeatCall.length + 80);
    const isAwaited = /\bawait\s*$/.test(prefix);
    const isThenConsumed = /^\s*\.then\s*\(/.test(suffix);

    assert.ok(
      isAwaited || isThenConsumed,
      `${label} heartbeat #${calls} constructs the Supabase RPC query without executing it`,
    );

    cursor = index + heartbeatCall.length;
  }

  assert.equal(calls, expectedCalls, `${label} heartbeat call count changed unexpectedly`);
}

test('presence heartbeats consume Supabase RPC builders instead of treating them like Promises', () => {
  assert.doesNotMatch(
    app,
    /supabase\.rpc\('rpc_touch_last_seen'\)\.catch\s*\(/,
    'Supabase query builders expose then(), not catch(), at runtime',
  );

  assertHeartbeatQueriesAreExecuted(app, 'App.tsx', 1);
  assertHeartbeatQueriesAreExecuted(gameService, 'services/gameService.ts', 2);
});
