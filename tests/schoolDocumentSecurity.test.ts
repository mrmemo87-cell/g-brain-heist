import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(`${process.cwd()}/supabase/migrations/20260802133000_private_school_document_center.sql`, 'utf8');

test('school documents are private by default and protected with ownership-aware RLS', () => {
  assert.match(migration, /visibility_scope text not null default 'private'/);
  assert.match(migration, /owner_teacher_id uuid/);
  assert.match(migration, /private\.can_access_school_document/);
  assert.match(migration, /p_owner_teacher_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /role_in_school = 'school_admin'/);
  assert.match(migration, /class_teacher_assignments/);
  assert.match(migration, /school_document_access_grants/);
});

test('document identity fields are immutable to ordinary authenticated updates', () => {
  assert.match(migration, /grant update \(visibility_scope, status, finalized_at, payload, file_path, checksum, updated_at\)/);
  assert.doesNotMatch(migration, /grant select, insert, update, delete on table public\.school_document_records/);
});
