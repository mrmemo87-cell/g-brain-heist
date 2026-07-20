import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const servicePath = path.resolve(process.cwd(), 'services/ieltsService.ts');
const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260721120000_secure_ielts_admin_views.sql',
);

test('IELTS admin service never queries sensitive admin views directly', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  assert.match(source, /rpc\('rpc_admin_ielts_users'\)/);
  assert.match(source, /rpc\('rpc_admin_ielts_stats'\)/);
  assert.doesNotMatch(source, /from\('ielts_users_admin'\)/);
  assert.doesNotMatch(source, /from\('ielts_admin_stats'\)/);
});

test('IELTS admin views are revoked and guarded RPCs require admin authorization', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /revoke all on table public\.ielts_users_admin from anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.ielts_prime_applications_admin from anon, authenticated/i);
  assert.match(sql, /public\.is_superadmin\(\)/);
  assert.match(sql, /raise exception 'NOT_AUTHORIZED'/);
  assert.match(sql, /revoke all on function public\.rpc_admin_ielts_users\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.rpc_admin_ielts_users\(\) to authenticated/i);
});
