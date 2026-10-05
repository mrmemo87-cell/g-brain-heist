import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261001123000_economics_diagnostic_launcher.sql',
  'utf8',
);
const service = readFileSync('services/economicsDiagnosticLauncherService.ts', 'utf8');
const launcher = readFileSync('components/teacher/EconomicsDiagnosticLauncher.tsx', 'utf8');
const page = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx', 'utf8');

test('Economics academic subject aliases complete canonical assignment resolution', () => {
  assert.match(migration, /'Economics'/);
  assert.match(migration, /'Economic Studies'/);
  assert.match(migration, /'IGCSE Economics'/);
  assert.match(migration, /public\.academic_subject_aliases/);
  assert.match(migration, /academic_resolve_subject_id\('Economics',null\)/);
  assert.match(migration, /update public\.questions question[\s\S]*academic_subject_id=economics\.id/i);
});

test('verified assignment mapping preserves legacy curriculum mappings and adds registry-native authority', () => {
  const start = migration.indexOf('create or replace function private.verified_question_has_curriculum_mapping');
  const end = migration.indexOf('-- ---------------------------------------------------------------------------\n-- 3.', start);
  const body = migration.slice(start, end);
  assert.match(body, /curriculum_item_objective_mappings/);
  assert.match(body, /school_curriculum_scope_mappings/);
  assert.match(body, /\bor\s+exists\s*\(/i);
  assert.match(body, /verified_question_registry_taxonomy/);
  assert.match(body, /academic_skill_registry_versions/);
  assert.match(body, /academic_skill_evidence_focuses/);
  assert.match(body, /question\.current_content_hash|q\.current_content_hash/);
  assert.match(body, /p_grade_level::smallint=any\(q\.eligible_grade_levels\)/);
});

test('diagnostic preset tables are governed and hidden from client roles', () => {
  assert.match(migration, /create table if not exists public\.registry_diagnostic_presets/);
  assert.match(migration, /create table if not exists public\.registry_diagnostic_preset_items/);
  assert.match(migration, /alter table public\.registry_diagnostic_presets enable row level security/);
  assert.match(migration, /alter table public\.registry_diagnostic_preset_items enable row level security/);
  assert.match(migration, /revoke all on table public\.registry_diagnostic_presets[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /revoke all on table public\.registry_diagnostic_preset_items[\s\S]*from public,anon,authenticated/);
});

test('three Economics Paper 1 presets are seeded with locked depths and balanced invariants', () => {
  assert.match(migration, /economics-0455-p1-quick-10/);
  assert.match(migration, /economics-0455-p1-diagnostic-20/);
  assert.match(migration, /economics-0455-p1-full-40/);
  assert.match(migration, /10,12,false,10/);
  assert.match(migration, /20,25,true,20/);
  assert.match(migration, /40,55,false,30/);
  assert.match(migration, /v_ao1<>v_preset\.question_count\/2/);
  assert.match(migration, /v_ao2<>v_preset\.question_count\/2/);
  assert.match(migration, /v_strands<>6/);
});

test('launcher preview exposes AO, six-area content and difficulty coverage without answer keys', () => {
  const start = migration.indexOf('create or replace function public.rpc_teacher_registry_diagnostic_launcher');
  const end = migration.indexOf('-- ---------------------------------------------------------------------------\n-- 6.', start);
  const body = migration.slice(start, end);
  assert.match(body, /'aoBreakdown'/);
  assert.match(body, /'contentCoverage'/);
  assert.match(body, /'difficultyBreakdown'/);
  assert.match(body, /alignment_level='subject_content'/);
  assert.match(body, /'independentAssessment',true/);
  assert.match(body, /'targetedPractice',false/);
  assert.match(body, /'gradePrediction',false/);
  assert.doesNotMatch(body, /correct_answer|correctAnswer/);
});

test('diagnostic creation reuses assignment authority and forces deferred evidence guards', () => {
  const start = migration.indexOf('create or replace function public.rpc_teacher_create_registry_diagnostic');
  const end = migration.indexOf('revoke all on function public.rpc_teacher_create_registry_diagnostic', start);
  const body = migration.slice(start, end);
  assert.match(body, /private\.teacher_current_teaching_groups/);
  assert.match(body, /private\.teacher_group_authorized_students/);
  assert.match(body, /private\.verified_question_has_curriculum_mapping/);
  assert.match(body, /public\.rpc_create_assignment/);
  assert.match(body, /'quiz'|v_preset\.assignment_category/);
  assert.match(body, /public\.rpc_teacher_attach_assignment_group/);
  assert.match(body, /set constraints all immediate/);
  assert.match(body, /independent_diagnostic_cannot_be_intervention_practice/);
  assert.doesNotMatch(body, /insert into public\.student_learning_intervention_practice_assignments/i);
});

test('launcher RPC permissions are explicit and API clients cannot bypass the UI authority', () => {
  assert.match(
    migration,
    /revoke all on function public\.rpc_teacher_registry_diagnostic_launcher\(uuid,uuid\)[\s\S]*from public,anon,authenticated,service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.rpc_teacher_registry_diagnostic_launcher\(uuid,uuid\)[\s\S]*to authenticated,service_role/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.rpc_teacher_create_registry_diagnostic\([\s\S]*from public,anon,authenticated,service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.rpc_teacher_create_registry_diagnostic\([\s\S]*to authenticated,service_role/i,
  );
});

test('frontend service uses only the governed launcher and creation RPCs', () => {
  assert.match(service, /rpc_teacher_registry_diagnostic_launcher/);
  assert.match(service, /rpc_teacher_create_registry_diagnostic/);
  assert.doesNotMatch(service, /\.from\('questions'\)|get_all_active_questions|rpc_create_assignment/);
});

test('teacher launcher presents professional preset, evidence and publishing controls', () => {
  assert.match(launcher, /Create Economics Diagnostic/);
  assert.match(launcher, /Choose evidence depth/);
  assert.match(launcher, /Cambridge AO balance/);
  assert.match(launcher, /Syllabus content coverage/);
  assert.match(launcher, /Difficulty mix/);
  assert.match(launcher, /Evidence contract/);
  assert.match(launcher, /Publish now/);
  assert.match(launcher, /Schedule/);
  assert.match(launcher, /Save draft/);
  assert.match(launcher, /Notify students by email/);
  assert.match(launcher, /Close after due date/);
  assert.match(launcher, /role="dialog"/);
  assert.match(launcher, /aria-modal="true"/);
});

test('Curriculum Intelligence routes Economics through the shared diagnostic composer', () => {
  assert.match(page, /onCreateDiagnostic\?: \(groupId: string\) => void/);
  assert.match(page, /onCreateDiagnostic\?\.\(selectedGroup\.id\)/);
  assert.match(page, /Create Diagnostic/);
  assert.doesNotMatch(page, /EconomicsDiagnosticLauncher|canLaunchEconomicsDiagnostic/);
});
