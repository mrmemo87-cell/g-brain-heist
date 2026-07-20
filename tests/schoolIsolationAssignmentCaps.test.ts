import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260721220000_school_isolation_assignment_and_caps.sql'), 'utf8');
const teacherPortal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');
const types = fs.readFileSync(path.resolve(process.cwd(), 'types.ts'), 'utf8');

test('leaderboards and attacks are school-isolated and student-only', () => {
  assert.match(migration, /u\.school_id IS NOT DISTINCT FROM v_school_id/);
  assert.match(migration, /COALESCE\(u\.role, 'student'\) = 'student'/);
  assert.match(migration, /cross_school_attack_not_allowed/);
  assert.match(migration, /defender\.role <> 'student'/);
});

test('assignment tenant scope and question order are authoritative', () => {
  assert.match(migration, /trg_set_assignment_tenant_scope/);
  assert.match(migration, /NEW\.school_id := v_school_id/);
  assert.match(migration, /RETURNS TABLE\(question_id uuid,order_index integer/);
  assert.match(migration, /ORDER BY aq\.order_index/);
  assert.match(types, /order_index: number/);
  assert.match(teacherPortal, /Q\{qa\.order_index \?\? idx \+ 1\}/);
});

test('teacher assignment completion snapshot refreshes from report rows', () => {
  assert.match(teacherPortal, /completed_count: rows\.length/);
});

test('quest rewards consume caps atomically', () => {
  assert.match(migration, /consume_student_reward_caps/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /v_xp_delta := COALESCE\(\(v_cap_result->>'granted_xp'\)::int, 0\)/);
  assert.match(migration, /INSERT INTO public\.caps/);
});
