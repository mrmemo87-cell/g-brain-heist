import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(
  'supabase/migrations/20260905053848_canonical_teacher_class_roster_visibility.sql',
  'utf8',
);

const scopeFunction = migration.match(
  /create or replace function private\.current_teacher_class_ids\(\)[\s\S]*?\$\$;/i,
)?.[0] || '';

test('teacher roster scope uses canonical class allocations, never legacy classes.teacher_id', () => {
  assert.ok(scopeFunction, 'canonical teacher class scope function must exist');
  assert.match(scopeFunction, /public\.class_teacher_assignments/i);
  assert.match(scopeFunction, /cta\.teacher_user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(scopeFunction, /cta\.active\s*=\s*true/i);
  assert.match(scopeFunction, /sm\.status\s*=\s*'active'/i);
  assert.doesNotMatch(scopeFunction, /c\.teacher_id/i);
  assert.doesNotMatch(scopeFunction, /join\s+public\.teachers/i);
});

test('class_students gives allocated teachers read-only roster access', () => {
  assert.match(
    migration,
    /create policy "Teachers can view students in allocated classes"[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?private\.current_teacher_class_ids\(\)/i,
  );
  assert.match(
    migration,
    /drop policy if exists "Teachers can manage students in their classes"/i,
  );
});

test('legacy helper name is only a security-invoker compatibility wrapper', () => {
  assert.match(
    migration,
    /create or replace function public\.get_my_teacher_class_ids\(\)[\s\S]*?security invoker[\s\S]*?private\.current_teacher_class_ids\(\)/i,
  );
});
