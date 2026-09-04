import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const usersTab = readFileSync('components/admin/tabs/UsersTab.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260904002000_real_user_presence_tracking.sql', 'utf8');

test('authenticated app sessions heartbeat real user presence', () => {
  assert.match(app, /rpc_touch_last_seen/);
  assert.match(app, /setInterval\(touchPresence,\s*60_000\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /addEventListener\('focus',\s*touchPresence\)/);
});

test('Superadmin Last active never falls back to generic updated_at metadata', () => {
  assert.match(
    usersTab,
    /user\?\.last_seen\s*\?\?\s*user\?\.last_active\s*\?\?\s*user\?\.last_active_at\s*\?\?\s*null/
  );
  const lastActiveBlock = usersTab.match(/const lastActiveDate[\s\S]*?const lastActiveLabel/)?.[0] || '';
  assert.doesNotMatch(lastActiveBlock, /updated_at/);
});

test('presence migration backfills from auth truth and exposes effective activity', () => {
  assert.match(migration, /au\.last_sign_in_at > u\.last_seen/);
  assert.match(migration, /create or replace function public\.rpc_touch_last_seen\(\)/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /greatest\(u\.last_seen, au\.last_sign_in_at\)/);
  assert.match(migration, /grant execute on function public\.rpc_touch_last_seen\(\) to authenticated/);
});
