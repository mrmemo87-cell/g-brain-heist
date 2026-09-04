import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');
const usersTab = readFileSync('components/admin/tabs/UsersTab.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260904002000_real_user_presence_tracking.sql', 'utf8');

test('authenticated app sessions heartbeat real user presence', () => {
  assert.match(app, /rpc_touch_last_seen/);
  assert.match(app, /setInterval\(touchPresence,\s*60_000\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /addEventListener\('focus',\s*touchPresence\)/);
});

test('legacy whoami refreshes use the isolated presence ledger', () => {
  assert.match(gameService, /supabase\.rpc\('rpc_touch_last_seen'\)/);
  assert.doesNotMatch(gameService, /update\(\{\s*last_seen:/);
});

test('Superadmin Last active never falls back to generic updated_at metadata', () => {
  assert.match(
    usersTab,
    /user\?\.last_seen\s*\?\?\s*user\?\.last_active\s*\?\?\s*user\?\.last_active_at\s*\?\?\s*null/
  );
  const lastActiveBlock = usersTab.match(/const lastActiveDate[\s\S]*?const lastActiveLabel/)?.[0] || '';
  assert.doesNotMatch(lastActiveBlock, /updated_at/);
});

test('presence migration isolates heartbeats from profile updates and uses auth truth', () => {
  assert.match(migration, /create table if not exists public\.user_presence/);
  assert.match(migration, /revoke all on table public\.user_presence from public, anon, authenticated/);
  assert.match(migration, /create or replace function public\.rpc_touch_last_seen\(\)/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /insert into public\.user_presence\(user_id, last_active_at\)/);
  assert.doesNotMatch(migration, /update public\.users\s+set last_seen/);
  assert.match(migration, /greatest\(up\.last_active_at, u\.last_seen, au\.last_sign_in_at\)/);
  assert.match(migration, /grant execute on function public\.rpc_touch_last_seen\(\) to authenticated/);
});
