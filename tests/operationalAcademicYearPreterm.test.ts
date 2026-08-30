import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260830070000_operational_academic_year_preterm.sql',
  'utf8',
);

test('operational year prefers the admin-activated current year and preserves calendar fallback', () => {
  assert.match(migration, /academic_resolve_operational_year_id/i);
  assert.match(migration, /y\.status = 'current'/i);
  assert.match(migration, /academic_resolve_year_id\(p_school_id, p_fallback_at\)/i);
  assert.doesNotMatch(
    migration,
    /create or replace function public\.academic_resolve_year_id\(/i,
  );
});

test('verified teacher questions use the operational year without weakening curriculum authorization', () => {
  assert.match(
    migration,
    /v_academic_year_id := public\.academic_resolve_operational_year_id\(v_school_id, now\(\)\)/i,
  );
  assert.match(migration, /get_all_active_questions/i);
  assert.doesNotMatch(migration, /pool_scope\s*=\s*'global'[\s\S]*or true/i);
});

test('new assignments enter the operational year while edits preserve historical year identity', () => {
  assert.match(
    migration,
    /tg_op = 'INSERT'[\s\S]*academic_resolve_operational_year_id\(new\.school_id, v_at\)/i,
  );
  assert.match(
    migration,
    /elsif new\.academic_year_id is null then[\s\S]*new\.academic_year_id := old\.academic_year_id/i,
  );
  assert.match(migration, /assignment_academic_year_school_mismatch/i);
});

test('assignment-derived student evidence inherits the assignment academic year', () => {
  assert.match(
    migration,
    /new\.source_type = 'assignment_result'[\s\S]*select a\.academic_year_id, a\.class_id/i,
  );
  assert.match(
    migration,
    /coalesce\([\s\S]*v_source_assignment_year_id,[\s\S]*academic_resolve_year_id\(new\.school_id, new\.observed_at\)/i,
  );
});

test('repair is limited to post-commit rollover assignments in a closed source year', () => {
  assert.match(migration, /event_type = 'committed'/i);
  assert.match(migration, /source_year\.status = 'closed'/i);
  assert.match(migration, /a\.created_at >= r\.committed_at/i);
  assert.match(migration, /target_year\.status = 'current'/i);
});
