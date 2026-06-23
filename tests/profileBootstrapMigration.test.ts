import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260623120000_fix_profile_bootstrap_email_idempotency.sql', 'utf8');
const authService = readFileSync('services/authService.ts', 'utf8');

test('profile_bootstrap serializes by email and handles existing auth.uid rows idempotently', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.profile_bootstrap/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(v_email, 0\)\)/);
  assert.match(migration, /FROM public\.users WHERE id = v_uid FOR UPDATE/);
  assert.match(migration, /UPDATE public\.users[\s\S]*WHERE id = v_uid[\s\S]*RETURNING \* INTO v_profile/);
});

test('profile_bootstrap repairs orphaned same-email profiles without merging active auth users', () => {
  assert.match(migration, /WHERE lower\(email\) = v_email[\s\S]*FOR UPDATE/);
  assert.match(migration, /NOT EXISTS \(SELECT 1 FROM auth\.users au WHERE au\.id = v_email_profile\.id\)/);
  assert.match(migration, /SET id = v_uid/);
  assert.match(migration, /email_profile_conflict/);
  assert.match(migration, /A Brain Heist profile already exists for this email/);
});

test('normal individual setup uses profile_bootstrap instead of id-only users upsert', () => {
  assert.match(authService, /completeIndividualSetup[\s\S]*supabase\.rpc\('profile_bootstrap'/);
  assert.match(authService, /completeProfileSetup[\s\S]*supabase\.rpc\('profile_bootstrap'/);
  assert.doesNotMatch(authService, /completeIndividualSetup[\s\S]{0,900}\.upsert\(upsertPayload, \{ onConflict: 'id' \}\)/);
});
