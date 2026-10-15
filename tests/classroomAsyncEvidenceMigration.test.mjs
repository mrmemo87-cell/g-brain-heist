import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261015150000_classroom_async_evidence_and_incident_repairs.sql', import.meta.url), 'utf8');
const trigger = (name) => {
  const start = migration.toLowerCase().indexOf('create or replace function private.' + name.toLowerCase());
  assert.ok(start >= 0, name + ' is defined');
  const delimiter = '$body$';
  const opening = migration.indexOf(delimiter, start);
  const closing = migration.indexOf(delimiter, opening + delimiter.length);
  assert.ok(opening > start && closing > opening, name + ' function body markers');
  return migration.slice(start, closing + delimiter.length);
};

test('both completion trigger handlers only enqueue evidence', () => {
  for (const name of ['capture_verified_assignment_diagnostic_evidence', 'capture_completed_assignment_evidence']) {
    const body = trigger(name);
    assert.match(body, /enqueue_verified_assignment_evidence_row/);
    assert.doesNotMatch(body, /perform private\.ingest_verified_assignment_/);
  }
});

test('queue is durable and worker executes academic evidence in correct order', () => {
  assert.match(migration, /references public\.student_assignment_results\(assignment_id, student_id\)/);
  assert.match(migration, /primary key \(assignment_id, student_id\)/);
  assert.match(migration, /for update skip locked limit 1/i);
  const body = trigger('process_one_verified_assignment_evidence');
  const registry = body.indexOf('perform private.ingest_verified_assignment_registry_evidence');
  const diagnostic = body.indexOf('perform private.ingest_verified_assignment_diagnostic_evidence');
  assert.ok(registry >= 0 && diagnostic > registry, 'registry precedes diagnostic');
  assert.match(body, /exception when others then/i);
  assert.match(body, /pg_try_advisory_xact_lock/);
  assert.match(migration, /brains-heist-assignment-evidence-watchdog/);
});

test('plan reads are read-only; scheduled clock transitions remain active', () => {
  const from = migration.indexOf('CREATE OR REPLACE FUNCTION public.get_school_plan_details');
  const to = migration.indexOf('CREATE OR REPLACE FUNCTION private.sync_school_pilot_lifecycle');
  assert.ok(from >= 0 && to > from);
  assert.doesNotMatch(migration.slice(from, to), /perform private\.sync_school_pilot_lifecycle\(/i);
  assert.match(migration, /private\.reconcile_due_school_pilots/);
  assert.match(migration, /brains-heist-school-pilot-expiry/);
});

test('achievement awards are idempotent and private teacher policies stay private', () => {
  assert.match(migration, /ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key/i);
  assert.match(migration, /GET DIAGNOSTICS v_new_award_count = ROW_COUNT/i);
  assert.match(migration, /can_access_assigned_school_subject_group/);
  assert.match(migration, /gt.teacher_user_id=auth.uid\(\)/);
  assert.doesNotMatch(migration, /grant select on public\.school_subject_group_teachers to authenticated/i);
  assert.match(migration, /grant select,update on public\.assignment_email_notifications to service_role/i);
});
