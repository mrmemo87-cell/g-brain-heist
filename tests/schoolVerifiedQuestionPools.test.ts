import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authority = readFileSync(
  'supabase/migrations/20260825120700_school_verified_question_authority.sql',
  'utf8',
);
const evidence = readFileSync(
  'supabase/migrations/20260825120800_school_verified_academic_profile_evidence.sql',
  'utf8',
);
const governance = readFileSync(
  'supabase/migrations/20260825120900_superadmin_school_question_governance.sql',
  'utf8',
);
const inspector = readFileSync(
  'supabase/migrations/20260825121000_superadmin_question_bank_pool_inspector_v3.sql',
  'utf8',
);
const studentCatalog = readFileSync(
  'supabase/migrations/20260825121100_school_verified_student_learning_catalog.sql',
  'utf8',
);
const teacherBank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');
const adminInspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');
const adminService = readFileSync('services/adminQuestionBankService.ts', 'utf8');

test('question authority separates authorship from global, school, and teacher publication scope', () => {
  assert.match(authority, /pool_scope text not null default 'teacher'/);
  assert.match(authority, /pool_scope = 'global'[\s\S]*content_origin = 'brain_heist'/);
  assert.match(authority, /pool_scope = 'school'[\s\S]*owner_school_id is not null[\s\S]*analytics_eligible/);
  assert.match(authority, /pool_scope = 'teacher'[\s\S]*owner_school_id is null[\s\S]*not analytics_eligible/);
  assert.match(authority, /old\.pool_scope in \('global', 'school'\)[\s\S]*verified_question_content_is_immutable/);
});

test('teacher catalogue admits only exact-curriculum global and same-school verified questions', () => {
  assert.match(authority, /authorized_official as materialized/);
  assert.match(authority, /q0\.pool_scope = 'school'[\s\S]*q0\.owner_school_id = v_school_id/);
  assert.match(authority, /q0\.pool_scope = 'teacher'[\s\S]*q0\.teacher_id = v_teacher/);
  assert.match(authority, /verified_question_has_curriculum_mapping/);
  assert.match(authority, /school_curriculum_scope_mappings/);
});

test('Academic Profile evidence accepts only hash-bound global or same-school verified authority', () => {
  assert.match(evidence, /'brains_heist_verified_question',[\s\S]*'school_verified_question'/);
  assert.match(evidence, /q\.pool_scope = 'school'[\s\S]*q\.owner_school_id = v_school_id/);
  assert.match(evidence, /aq\.pool_scope_snapshot in \('global', 'school'\)/);
  assert.match(evidence, /private\.verified_question_has_curriculum_mapping/);
  assert.doesNotMatch(evidence, /pool_scope_snapshot = 'teacher'[\s\S]*analytics_eligible_snapshot/);
});

test('student learning catalogue exposes global and same-school authority without cross-school leakage', () => {
  assert.match(studentCatalog, /question\.pool_scope = 'global'[\s\S]*assessment_item\.school_id is null/);
  assert.match(studentCatalog, /question\.pool_scope = 'school'[\s\S]*question\.owner_school_id = v_school/);
  assert.match(studentCatalog, /assessment_item\.school_id = v_school/);
  assert.match(studentCatalog, /'pool_scope', question\.pool_scope/);
  assert.match(studentCatalog, /'owner_school_id', question\.owner_school_id/);
  assert.doesNotMatch(studentCatalog, /question\.pool_scope = 'teacher'/);
});

test('school approval is source-bound, exact-curriculum, human-reviewed, and append-only', () => {
  assert.match(governance, /question_pool_governance_decisions/);
  assert.match(governance, /question_pool_governance_decisions_are_append_only/);
  assert.match(governance, /school_mapping\.mapping_quality = 'confirmed'/);
  assert.match(governance, /v_question\.current_content_hash is distinct from v_submission\.submitted_content_hash/);
  assert.match(governance, /v_confidence < 0\.900/);
  assert.match(governance, /insert into public\.verified_question_diagnostic_taxonomy/);
  assert.match(governance, /academicProfileEligible', true/);
  assert.doesNotMatch(governance, /source_type, school_id, source_scope_key/);
});

test('superadmin inventory exposes four pools and clear curriculum names', () => {
  assert.match(inspector, /'verified', 'school', 'teacher', 'archive'/);
  assert.match(inspector, /'frameworkName', row_data\.framework_name/);
  assert.match(inspector, /'frameworkVersionName', row_data\.framework_version_name/);
  assert.match(inspector, /'academicYearName', row_data\.curriculum_academic_year_name/);
  assert.match(inspector, /'objectiveStatement', row_data\.objective_statement/);
  assert.match(adminService, /rpc_superadmin_question_bank_inspector_v3/);
});

test('teacher and superadmin interfaces make pool authority visible and actionable', () => {
  assert.match(teacherBank, /Brains Heist Verified/);
  assert.match(teacherBank, /schoolName\} Verified/);
  assert.match(teacherBank, /My Pool/);
  assert.match(adminInspector, /School Verified Pools/);
  assert.match(adminInspector, /School Verification Gate/);
  assert.match(adminInspector, /Exact school curriculum authority/);
  assert.match(adminInspector, /Return to teacher/);
  assert.match(adminInspector, /Retire school question/);
});
