import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseClanTerritoryTransport } from '../src/features/clanTerritory/clanTerritorySupabaseTransport';

test('live arena merges bursts, keeps the latest state and never overlaps snapshot sends', async () => {
  const transport = new SupabaseClanTerritoryTransport() as any;
  const sent: number[] = [];
  let settle!: () => void;
  const channel = { state: 'joined', send: ({ payload }: any) => {
    sent.push(payload.sequence);
    return new Promise<void>(resolve => { settle = resolve; });
  } };
  transport.channel = channel;
  transport.isHost = true;
  transport.state = { sequence: 1 };
  transport.broadcastState(true);
  await Promise.resolve();
  assert.deepEqual(sent, [1]);
  for(let sequence=2;sequence<=50;sequence++){
    transport.state = { sequence };
    transport.broadcastState(true);
  }
  assert.deepEqual(sent, [1], 'a slow network must not create 49 queued sends');
  settle();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.deepEqual(sent, [1,50], 'the final action must reach the next snapshot');
  transport.channel = null; // no real Realtime channel was opened
  settle();
  transport.cleanup();
});

test('cleanup cancels trailing snapshots and an old connection cannot resume them', async () => {
  const transport = new SupabaseClanTerritoryTransport() as any;
  let sends=0;
  transport.isHost=true;
  transport.channel={state:'joined',send:()=>{sends++;return Promise.resolve();}};
  transport.lastBroadcastAtMs=Date.now();
  transport.broadcastState(true);
  transport.channel=null;
  transport.cleanup();
  await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(sends,0);
});
