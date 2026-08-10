import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260810150542_academic_year_subject_foundation.sql',
  'utf8',
);

test('canonical subjects preserve labels while resolving known aliases', () => {
  assert.match(migration, /create table if not exists public\.academic_subjects/i);
  assert.match(migration, /create table if not exists public\.academic_subject_aliases/i);
  assert.match(migration, /\('mathematics', 'Math'\)/i);
  assert.match(migration, /\('mathematics', 'Maths'\)/i);
  assert.match(migration, /\('mathematics', 'Mathematics'\)/i);
  assert.match(migration, /academic_resolve_subject_id/i);
  assert.match(migration, /does not change historical labels/i);
});

test('academic calendar is school scoped and rejects ambiguous periods', () => {
  assert.match(migration, /create table if not exists public\.school_academic_years/i);
  assert.match(migration, /create table if not exists public\.school_academic_terms/i);
  assert.match(migration, /school_academic_years_one_current_uidx/i);
  assert.match(migration, /academic_years_overlap/i);
  assert.match(migration, /academic_terms_overlap/i);
  assert.match(migration, /academic_term_outside_year/i);
  assert.match(migration, /foreign key \(academic_year_id, school_id\)/i);
});

test('enrolment history snapshots grade and class with explicit quality', () => {
  assert.match(migration, /create table if not exists public\.student_academic_enrolments/i);
  for (const field of [
    'grade_level',
    'class_code',
    'starts_on',
    'ends_on',
    'context_quality',
    'source',
  ]) {
    assert.match(migration, new RegExp(field, 'i'));
  }
  assert.match(migration, /academic_enrolments_overlap/i);
  assert.match(migration, /current_placement_baseline/i);
  assert.match(migration, /'estimated'/i);
});

test('all learning sources receive immutable-time academic context through one trigger', () => {
  for (const field of [
    'academic_subject_id',
    'academic_year_id',
    'academic_term_id',
    'academic_enrolment_id',
    'grade_level_at_time',
    'class_id_at_time',
    'class_code_at_time',
    'academic_context_quality',
    'academic_context_source',
  ]) {
    assert.match(migration, new RegExp(field, 'i'));
  }
  assert.match(migration, /trg_student_learning_enrich_academic_context/i);
  assert.match(migration, /before insert or update[\s\S]*on public\.student_learning_observations/i);
  assert.match(migration, /source_class_snapshot/i);
  assert.match(migration, /academic_enrolment/i);
  assert.match(migration, /calendar_only/i);
});

test('future questions assignments school subjects and focus states resolve canonical subjects', () => {
  assert.match(migration, /trg_academic_enrich_question_subject/i);
  assert.match(migration, /trg_academic_enrich_school_subject/i);
  assert.match(migration, /trg_academic_enrich_assignment/i);
  assert.match(migration, /trg_academic_enrich_focus_state/i);
  assert.match(migration, /questions_academic_subject_grade_idx/i);
  assert.match(migration, /assignments_academic_context_idx/i);
});

test('calendar management stays fail closed and exposes readiness instead of guessed completeness', () => {
  for (const rpc of [
    'rpc_school_admin_upsert_academic_year',
    'rpc_school_admin_upsert_academic_term',
    'rpc_school_admin_seed_academic_enrolments',
    'rpc_school_admin_academic_context_readiness',
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}`, 'i'));
  }
  assert.match(migration, /can_administer_school\(p_school_id\)[\s\S]*is_school_owner\(p_school_id\)/i);
  assert.match(migration, /unknownObservations/i);
  assert.match(migration, /unmappedSubjects/i);
});

test('new academic tables are RLS protected with no direct browser grants', () => {
  for (const table of [
    'academic_subjects',
    'academic_subject_aliases',
    'school_academic_years',
    'school_academic_terms',
    'student_academic_enrolments',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
});
