import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260813173000_restore_writing_student_runtime_contract.sql',
  'utf8',
);

test('writing runtime repair restores durable attempt upserts', () => {
  assert.match(migration, /alter table public\.bh_writing_attempts[\s\S]*add column if not exists attempt_key text/i);
  assert.match(migration, /create unique index if not exists uq_bh_writing_attempts_attempt_key/i);
});

test('writing runtime repair restores student prompt and integrity RPCs with strict grants', () => {
  assert.match(migration, /create or replace function public\.rpc_bh_writing_student_integrity_mode\(\)/i);
  assert.match(migration, /create or replace function public\.rpc_bh_writing_student_prompt\([\s\S]*p_grade integer/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.rpc_bh_writing_student_integrity_mode\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.rpc_bh_writing_student_prompt\(integer, text, text\) to authenticated/i);
});

test('integrity settings remain protected from direct browser access', () => {
  assert.match(migration, /alter table public\.bh_writing_integrity_settings enable row level security/i);
  assert.match(migration, /revoke all on table public\.bh_writing_integrity_settings from public, anon, authenticated/i);
});
