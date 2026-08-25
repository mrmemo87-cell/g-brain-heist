import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationFiles = [
  'supabase/migrations/20260825101726_year_bridge_rollover_command_center.sql',
  'supabase/migrations/20260825101727_year_bridge_rollover_preview.sql',
  'supabase/migrations/20260825101728_year_bridge_rollover_prepare.sql',
  'supabase/migrations/20260825101729_year_bridge_rollover_reviews.sql',
  'supabase/migrations/20260825101730_year_bridge_rollover_commit.sql',
];
const migration = migrationFiles.map((path) => readFileSync(path, 'utf8')).join('\n');
const service = readFileSync('services/yearRolloverService.ts', 'utf8');
const wizard = readFileSync('components/school-admin/AcademicYearRolloverWizard.tsx', 'utf8');
const styles = readFileSync('components/school-admin/AcademicYearRolloverWizard.css', 'utf8');
const subjectsTab = readFileSync('components/school-admin/tabs/SubjectsTab.tsx', 'utf8');

const indexOfOrFail = (content: string, token: string) => {
  const index = content.indexOf(token);
  assert.notEqual(index, -1, `Expected migration to contain ${token}`);
  return index;
};

test('Year Bridge stores reviewed plans, class routes, student decisions and append-only events', () => {
  for (const table of [
    'school_year_rollover_plans',
    'school_year_rollover_class_routes',
    'school_year_rollover_student_decisions',
    'school_year_rollover_events',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated`, 'i'));
  }
  assert.match(migration, /school_year_rollover_events_are_append_only/i);
  assert.match(migration, /trg_year_rollover_events_immutable/i);
});

test('the source roster prefers durable historical evidence before live fallbacks', () => {
  const enrolment = indexOfOrFail(migration, "when ye.class_id is not null then 'academic_enrolment'");
  const assignment = indexOfOrFail(migration, "when ah.class_id is not null then 'historical_assignment'");
  const current = indexOfOrFail(migration, "when cp.class_id is not null then 'current_placement'");
  const profile = indexOfOrFail(migration, "when pp.class_id is not null then 'profile_fallback'");
  assert.ok(enrolment < assignment && assignment < current && current < profile);
  assert.match(migration, /Current profile placement is the only source and must be reviewed before promotion/i);
  assert.match(migration, /The live class differs from the historical source and needs review/i);
});

test('class routes promote one grade, prefer the same section and flag uncertain merges', () => {
  assert.match(migration, /year_rollover_section_key/i);
  assert.match(migration, /year_rollover_grade_number\(c\.grade_level\) = v_source_grade \+ 1/i);
  assert.match(migration, /Matched the next grade using the same class section/i);
  assert.match(migration, /Only one active class exists in the next grade; review the proposed merge/i);
  assert.match(migration, /promotion_target_grade_mismatch/i);
  assert.match(migration, /repeat_target_grade_mismatch/i);
});

test('the rehearsal blocks unresolved decisions, roster drift and unsafe exits', () => {
  for (const code of [
    'student_review_required',
    'target_class_required',
    'placement_changed_after_rehearsal',
    'multiple_target_enrolments',
    'exit_has_target_year_evidence',
  ]) {
    assert.match(migration, new RegExp(code, 'i'));
  }
  for (const warning of [
    'target_grade_has_no_subject_plan',
    'target_class_needs_staffing',
    'large_projected_class',
    'target_enrolment_will_be_reconciled',
  ]) {
    assert.match(migration, new RegExp(warning, 'i'));
  }
});

test('launch is hash locked, atomic and reuses reviewed placement authority', () => {
  assert.match(migration, /year_rollover_plan_hash/i);
  assert.match(migration, /p_preview_hash <> v_hash/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /rpc_school_admin_transfer_student_placement/i);
  assert.match(migration, /rpc_school_admin_unassign_student_placement/i);
  assert.match(migration, /year_rollover_set_target_enrolment/i);
  assert.match(migration, /'historicalAssignmentsRewritten', false/i);
  assert.match(migration, /'historicalWritingRewritten', false/i);
  assert.match(migration, /'commitIsAtomic', true/i);
  assert.match(migration, /'driftProtectionEnabled', true/i);
  assert.doesNotMatch(migration, /delete from public\.assignments/i);
  assert.doesNotMatch(migration, /delete from public\.student_learning_observations/i);
});

test('the service exposes the full school-admin Year Bridge contract', () => {
  for (const rpc of [
    'rpc_school_admin_latest_year_rollover',
    'rpc_school_admin_prepare_year_rollover',
    'rpc_school_admin_year_rollover_preview',
    'rpc_school_admin_set_year_rollover_class_route',
    'rpc_school_admin_set_year_rollover_student_decision',
    'rpc_school_admin_cancel_year_rollover',
    'rpc_school_admin_commit_year_rollover',
  ]) {
    assert.match(service, new RegExp(rpc, 'i'));
  }
  assert.match(service, /rollover_rehearsal_changed/i);
  assert.match(service, /rollover_confirmation_mismatch/i);
});

test('the school-admin UI delivers the four-stage Promotion Command Center', () => {
  assert.match(wizard, /Year Bridge · Promotion Command Center/i);
  assert.match(wizard, /Move every learner forward without losing a single chapter\./i);
  assert.match(wizard, /Choose the years/i);
  assert.match(wizard, /Map every class/i);
  assert.match(wizard, /Review special cases/i);
  assert.match(wizard, /Preview and launch/i);
  assert.match(wizard, /Approve route \+/i);
  assert.match(wizard, /Type <strong>\{preview\.plan\?\.targetYear\.name\}<\/strong> to launch/i);
  assert.match(wizard, /The live class roster updates immediately/i);
  assert.match(wizard, /Previous assignments, writing, scores, reports and closed-year enrolment records remain untouched/i);
  assert.match(subjectsTab, /AcademicYearRolloverWizard/i);
  assert.match(subjectsTab, /<AcademicYearRolloverWizard\s*\/>/i);
});

test('the Year Bridge experience is responsive and respects reduced motion', () => {
  assert.match(styles, /\.year-bridge-card/i);
  assert.match(styles, /\.year-bridge-stepper/i);
  assert.match(styles, /\.year-bridge-route-list/i);
  assert.match(styles, /\.year-bridge-student-list/i);
  assert.match(styles, /\.year-bridge-launch-seal/i);
  assert.match(styles, /@media \(max-width: 900px\)/i);
  assert.match(styles, /@media \(max-width: 460px\)/i);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/i);
});
