import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260813160000_repair_assignment_publication_schema.sql',
  'utf8',
);

test('assignment publication repair restores the missing schema contract', () => {
  assert.match(migration, /add column if not exists publish_status text not null default 'published'/);
  assert.match(migration, /add column if not exists close_submissions_after_due boolean not null default false/);
  assert.match(migration, /add column if not exists notify_students_by_email boolean not null default false/);
  assert.match(migration, /add column if not exists published_at timestamptz/);
  assert.match(migration, /add column if not exists submitted_late boolean not null default false/);
  assert.match(migration, /assignments_publish_status_check/);
});

test('assignment publication repair preserves the newer verified student RPCs', () => {
  assert.doesNotMatch(migration, /create or replace function public\.rpc_get_student_active_assignment/);
  assert.doesNotMatch(migration, /create or replace function public\.rpc_get_student_pending_assignments/);
  assert.doesNotMatch(migration, /create or replace function public\.rpc_submit_assignment_result/);
  assert.match(migration, /create or replace function public\.rpc_update_teacher_assignment/);
  assert.match(migration, /create function public\.rpc_create_assignment/);
});
