import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261015150000_classroom_async_evidence_and_incident_repairs.sql', import.meta.url), 'utf8'
);
const trigger = (name) => {
  const start = migration.toLowerCase().indexOf('create or replace function private.' + name.toLowerCase());
  assert.ok(start >= 0, name + ' is defined');
  const delimiter = "$body$";
  const opening = migration.indexOf(delimiter, start);
  assert.ok(opening > start, name + ' function body starts');
  const closing = migration.indexOf(delimiter, opening + delimiter.length);
  assert.ok(closing > opening, name + ' function body ends');
  return migration.slice(start, closing + delimiter.length);
};
test('both completion triggers only queue evidence without performing costly ingestion', () => {
  const resultTrigger = trigger('capture_verified_assignment_diagnostic_evidence');
  const statusTrigger = trigger('capture_completed_assignment_evidence');
  for (const source of [resultTrigger, statusTrigger]) {
    assert.match(source, /enqueue_verified_assignment_evidence_row/);
    assert.doesNotMatch(source, /perform private\.ingest_verified_assignment_/);
  }
});
test('queue enqueues atomically and worker processes ordered pipelines with durable retries', () => {
  assert.match(migration, /references public\.student_assignment_results\(assignment_id, student_id\)/);
  assert.match(migration, /primary key \(assignment_id, student_id\)/);
  assert.match(migration, /for update skip locked limit 1/i);
  assert.match(migration, /pg_try_advisory_xact_lock/);
  const worker = trigger('process_one_verified_assignment_evidence');
  const reg = worker.indexOf('perform private.ingest_verified_assignment_registry_evidence');
  const diag = worker.indexOf('perform private.ingest_verified_assignment_diagnostic_evidence');
  assert.ok(reg >= 0 && diag > reg, 'Registry must run before diagnostic');
  assert.match(worker, /exception when others then/i);
  assert.match(migration, /assignment-evidence-watchdog/);
});
test('school plan reads remain read-only and achievement awards remain idempotent', () => {
  const planStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.get_school_plan_details');
  const planEnd = migration.indexOf('CREATE OR REPLACE FUNCTION private.sync_school_pilot_lifecycle');
  assert.ok(planStart >= 0 && planEnd > planStart);
  assert.doesNotMatch(migration.slice(planStart, planEnd), /perform private\.sync_school_pilot_lifecycle\(/i);
  assert.match(migration, /ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key/i);
  assert.match(migration, /GET DIAGNOSTICS v_new_award_count = ROW_COUNT/i);
});
test('RLS dependency is replaced without exposing internal tables', () => {
  assert.match(migration, /can_access_assigned_school_subject_group/);
  assert.match(migration, /gt.teacher_user_id=auth.uid\(\)/);
  assert.doesNotMatch(migration, /grant select on public\.school_subject_group_teachers to authenticated/i);
  assert.match(migration, /grant select,update on public\.assignment_email_notifications to service_role/i);
});
, start);
  assert.ok(opening > start, name + ' function body starts');
  const closing = migration.indexOf('$body
};
test('both completion triggers only queue evidence without performing costly ingestion', () => {
  const resultTrigger = trigger('capture_verified_assignment_diagnostic_evidence');
  const statusTrigger = trigger('capture_completed_assignment_evidence');
  for (const source of [resultTrigger, statusTrigger]) {
    assert.match(source, /enqueue_verified_assignment_evidence_row/);
    assert.doesNotMatch(source, /perform private\.ingest_verified_assignment_/);
  }
});
test('queue enqueues atomically and worker processes ordered pipelines with durable retries', () => {
  assert.match(migration, /references public\.student_assignment_results\(assignment_id, student_id\)/);
  assert.match(migration, /primary key \(assignment_id, student_id\)/);
  assert.match(migration, /for update skip locked limit 1/i);
  assert.match(migration, /pg_try_advisory_xact_lock/);
  const worker = trigger('process_one_verified_assignment_evidence');
  const reg = worker.indexOf('perform private.ingest_verified_assignment_registry_evidence');
  const diag = worker.indexOf('perform private.ingest_verified_assignment_diagnostic_evidence');
  assert.ok(reg >= 0 && diag > reg, 'Registry must run before diagnostic');
  assert.match(worker, /exception when others then/i);
  assert.match(migration, /assignment-evidence-watchdog/);
});
test('school plan reads remain read-only and achievement awards remain idempotent', () => {
  const planStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.get_school_plan_details');
  const planEnd = migration.indexOf('CREATE OR REPLACE FUNCTION private.sync_school_pilot_lifecycle');
  assert.ok(planStart >= 0 && planEnd > planStart);
  assert.doesNotMatch(migration.slice(planStart, planEnd), /perform private\.sync_school_pilot_lifecycle\(/i);
  assert.match(migration, /ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key/i);
  assert.match(migration, /GET DIAGNOSTICS v_new_award_count = ROW_COUNT/i);
});
test('RLS dependency is replaced without exposing internal tables', () => {
  assert.match(migration, /can_access_assigned_school_subject_group/);
  assert.match(migration, /gt.teacher_user_id=auth.uid\(\)/);
  assert.doesNotMatch(migration, /grant select on public\.school_subject_group_teachers to authenticated/i);
  assert.match(migration, /grant select,update on public\.assignment_email_notifications to service_role/i);
});
, opening + '$body
};
test('both completion triggers only queue evidence without performing costly ingestion', () => {
  const resultTrigger = trigger('capture_verified_assignment_diagnostic_evidence');
  const statusTrigger = trigger('capture_completed_assignment_evidence');
  for (const source of [resultTrigger, statusTrigger]) {
    assert.match(source, /enqueue_verified_assignment_evidence_row/);
    assert.doesNotMatch(source, /perform private\.ingest_verified_assignment_/);
  }
});
test('queue enqueues atomically and worker processes ordered pipelines with durable retries', () => {
  assert.match(migration, /references public\.student_assignment_results\(assignment_id, student_id\)/);
  assert.match(migration, /primary key \(assignment_id, student_id\)/);
  assert.match(migration, /for update skip locked limit 1/i);
  assert.match(migration, /pg_try_advisory_xact_lock/);
  const worker = trigger('process_one_verified_assignment_evidence');
  const reg = worker.indexOf('perform private.ingest_verified_assignment_registry_evidence');
  const diag = worker.indexOf('perform private.ingest_verified_assignment_diagnostic_evidence');
  assert.ok(reg >= 0 && diag > reg, 'Registry must run before diagnostic');
  assert.match(worker, /exception when others then/i);
  assert.match(migration, /assignment-evidence-watchdog/);
});
test('school plan reads remain read-only and achievement awards remain idempotent', () => {
  const planStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.get_school_plan_details');
  const planEnd = migration.indexOf('CREATE OR REPLACE FUNCTION private.sync_school_pilot_lifecycle');
  assert.ok(planStart >= 0 && planEnd > planStart);
  assert.doesNotMatch(migration.slice(planStart, planEnd), /perform private\.sync_school_pilot_lifecycle\(/i);
  assert.match(migration, /ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key/i);
  assert.match(migration, /GET DIAGNOSTICS v_new_award_count = ROW_COUNT/i);
});
test('RLS dependency is replaced without exposing internal tables', () => {
  assert.match(migration, /can_access_assigned_school_subject_group/);
  assert.match(migration, /gt.teacher_user_id=auth.uid\(\)/);
  assert.doesNotMatch(migration, /grant select on public\.school_subject_group_teachers to authenticated/i);
  assert.match(migration, /grant select,update on public\.assignment_email_notifications to service_role/i);
});
.length);
  assert.ok(closing > opening, name + ' function body ends');
  return migration.slice(start, closing + '$body
};
test('both completion triggers only queue evidence without performing costly ingestion', () => {
  const resultTrigger = trigger('capture_verified_assignment_diagnostic_evidence');
  const statusTrigger = trigger('capture_completed_assignment_evidence');
  for (const source of [resultTrigger, statusTrigger]) {
    assert.match(source, /enqueue_verified_assignment_evidence_row/);
    assert.doesNotMatch(source, /perform private\.ingest_verified_assignment_/);
  }
});
test('queue enqueues atomically and worker processes ordered pipelines with durable retries', () => {
  assert.match(migration, /references public\.student_assignment_results\(assignment_id, student_id\)/);
  assert.match(migration, /primary key \(assignment_id, student_id\)/);
  assert.match(migration, /for update skip locked limit 1/i);
  assert.match(migration, /pg_try_advisory_xact_lock/);
  const worker = trigger('process_one_verified_assignment_evidence');
  const reg = worker.indexOf('perform private.ingest_verified_assignment_registry_evidence');
  const diag = worker.indexOf('perform private.ingest_verified_assignment_diagnostic_evidence');
  assert.ok(reg >= 0 && diag > reg, 'Registry must run before diagnostic');
  assert.match(worker, /exception when others then/i);
  assert.match(migration, /assignment-evidence-watchdog/);
});
test('school plan reads remain read-only and achievement awards remain idempotent', () => {
  const planStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.get_school_plan_details');
  const planEnd = migration.indexOf('CREATE OR REPLACE FUNCTION private.sync_school_pilot_lifecycle');
  assert.ok(planStart >= 0 && planEnd > planStart);
  assert.doesNotMatch(migration.slice(planStart, planEnd), /perform private\.sync_school_pilot_lifecycle\(/i);
  assert.match(migration, /ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key/i);
  assert.match(migration, /GET DIAGNOSTICS v_new_award_count = ROW_COUNT/i);
});
test('RLS dependency is replaced without exposing internal tables', () => {
  assert.match(migration, /can_access_assigned_school_subject_group/);
  assert.match(migration, /gt.teacher_user_id=auth.uid\(\)/);
  assert.doesNotMatch(migration, /grant select on public\.school_subject_group_teachers to authenticated/i);
  assert.match(migration, /grant select,update on public\.assignment_email_notifications to service_role/i);
});
.length);
};
test('both completion triggers only queue evidence without performing costly ingestion', () => {
  const resultTrigger = trigger('capture_verified_assignment_diagnostic_evidence');
  const statusTrigger = trigger('capture_completed_assignment_evidence');
  for (const source of [resultTrigger, statusTrigger]) {
    assert.match(source, /enqueue_verified_assignment_evidence_row/);
    assert.doesNotMatch(source, /perform private\.ingest_verified_assignment_/);
  }
});
test('queue enqueues atomically and worker processes ordered pipelines with durable retries', () => {
  assert.match(migration, /references public\.student_assignment_results\(assignment_id, student_id\)/);
  assert.match(migration, /primary key \(assignment_id, student_id\)/);
  assert.match(migration, /for update skip locked limit 1/i);
  assert.match(migration, /pg_try_advisory_xact_lock/);
  const worker = trigger('process_one_verified_assignment_evidence');
  const reg = worker.indexOf('perform private.ingest_verified_assignment_registry_evidence');
  const diag = worker.indexOf('perform private.ingest_verified_assignment_diagnostic_evidence');
  assert.ok(reg >= 0 && diag > reg, 'Registry must run before diagnostic');
  assert.match(worker, /exception when others then/i);
  assert.match(migration, /assignment-evidence-watchdog/);
});
test('school plan reads remain read-only and achievement awards remain idempotent', () => {
  const planStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.get_school_plan_details');
  const planEnd = migration.indexOf('CREATE OR REPLACE FUNCTION private.sync_school_pilot_lifecycle');
  assert.ok(planStart >= 0 && planEnd > planStart);
  assert.doesNotMatch(migration.slice(planStart, planEnd), /perform private\.sync_school_pilot_lifecycle\(/i);
  assert.match(migration, /ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key/i);
  assert.match(migration, /GET DIAGNOSTICS v_new_award_count = ROW_COUNT/i);
});
test('RLS dependency is replaced without exposing internal tables', () => {
  assert.match(migration, /can_access_assigned_school_subject_group/);
  assert.match(migration, /gt.teacher_user_id=auth.uid\(\)/);
  assert.doesNotMatch(migration, /grant select on public\.school_subject_group_teachers to authenticated/i);
  assert.match(migration, /grant select,update on public\.assignment_email_notifications to service_role/i);
});
