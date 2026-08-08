import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260808111806_gameplay_integrity_inventory_streak_targets.sql');
const service = read('services/gameService.ts');
const missionBoard = read('components/quest/MissionBoard.tsx');

test('inventory activation is atomic and authenticated', () => {
  assert.match(migration, /function public\.inventory_activate\(p_inventory_id uuid\)/i);
  assert.match(migration, /where id = p_inventory_id and user_id = v_user_id for update/i);
  assert.match(service, /supabase\.rpc\('inventory_activate', \{ p_inventory_id: inv_id \}\)/);
});

test('daily streak rewards are idempotent and server-authoritative', () => {
  assert.match(migration, /primary key \(user_id, reward_date\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(service, /supabase\.rpc\('rpc_record_daily_streak'\)/);
});

test('attack targets expose active shields and mission duplicate submissions resync cleanly', () => {
  assert.match(migration, /i\.state='active'/i);
  assert.match(migration, /i\.expires_at is null or i\.expires_at > now\(\)/i);
  assert.match(missionBoard, /Your answer was already saved\. Mission state re-synced from server\./);
});
