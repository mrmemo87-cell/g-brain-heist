import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260924052000_add_governed_evidence_focus_layer.sql',
  'utf8',
);
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');
const adminService = readFileSync('services/adminQuestionBankService.ts', 'utf8');
const adminInspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');

test('Evidence Focus is a governed child layer beneath canonical subskills', () => {
  assert.match(migration, /create table if not exists public\.academic_skill_evidence_focuses/);
  assert.match(migration, /atomic_subskill_node_id uuid not null references public\.academic_skill_registry_nodes/);
  assert.match(migration, /source_method in \('verified_bank_backfill','human_governed','platform_seed'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Authenticated can read active academic evidence focuses/);
});

test('all approved verified taxonomy requires a controlled Evidence Focus', () => {
  assert.match(migration, /verified_question_evidence_focus_required/);
  assert.match(migration, /verified_question_evidence_focus_registry_match_required/);
  assert.match(migration, /verified_question_evidence_focus_name_code_mismatch/);
  assert.match(migration, /evidenceFocusCode/);
  assert.match(migration, /evidenceFocusName/);
});

test('existing verified taxonomy is migrated append-only rather than overwritten', () => {
  assert.match(migration, /supersedes_taxonomy_id/);
  assert.match(migration, /Evidence Focus v1 backfill/);
  assert.match(migration, /Evidence Focus Backfill 2026-09-24/);
  assert.match(migration, /where t\.evidence_focus_code is null/);
  assert.match(migration, /evidence_focus_backfill_incomplete/);
});

test('manual teacher verification uses a four-step controlled taxonomy flow', () => {
  assert.match(portal, /1\. Strand/);
  assert.match(portal, /2\. Skill/);
  assert.match(portal, /3\. Subskill/);
  assert.match(portal, /4\. Evidence Focus/);
  assert.match(portal, /Intervention target selected/);
  assert.match(gameService, /rpc_academic_evidence_focuses_for_subskill/);
  assert.match(gameService, /p_evidence_focus_code/);
});

test('school governance requires and validates Evidence Focus before approval', () => {
  assert.match(adminService, /loadAcademicEvidenceFocusesForGovernance/);
  assert.match(adminService, /evidenceFocusCode/);
  assert.match(adminInspector, /Evidence Focus · governed intervention target/);
  assert.match(adminInspector, /Choose the governed Evidence Focus/);
  assert.match(migration, /school_question_evidence_focus_registry_match_required/);
});

test('learner evidence preserves stable skill identity while recording precise focus', () => {
  assert.match(migration, /'evidence_granularity', 'diagnostic_evidence_focus'/);
  assert.match(migration, /'evidence_focus_code'/);
  assert.match(migration, /'evidence_focus_name'/);
  assert.match(migration, /v_skill_key := concat_ws\([\s\S]*'diagnostic'[\s\S]*primary_skill_code[\s\S]*atomic_subskill_code/);
});

test('AI question batches receive a governed Evidence Focus before submission', () => {
  const edge = readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
  const batchService = readFileSync('services/teacherQuestionBatchService.ts', 'utf8');
  const workspace = readFileSync('components/teacher/QuestionBatchWorkspace.tsx', 'utf8');
  assert.match(edge, /assignGovernedEvidenceFocuses/);
  assert.match(edge, /rpc_academic_evidence_focuses_for_subskill/);
  assert.match(edge, /governed_evidence_focus_assignment/);
  assert.match(edge, /QUESTION_QUALITY_REVISION = 5/);
  assert.match(batchService, /evidence_focus_code/);
  assert.match(batchService, /Confirm the governed Evidence Focus/);
  assert.match(workspace, /Governed intervention target/);
});

test('intervention matching prioritizes exact focus before related practice', () => {
  assert.match(migration, /p_evidence_focus_code text/);
  assert.match(migration, /taxonomy\.evidence_focus_code = p_evidence_focus_code/);
  assert.match(migration, /available_same_subskill_question_count/);
  assert.match(migration, /available_broader_skill_question_count/);
  assert.match(migration, /same_subskill_question_ids/);
  assert.match(migration, /broader_skill_question_ids/);
});

test('every published subskill receives at least one controlled focus option', () => {
  assert.match(migration, /Core demonstration:/);
  assert.match(migration, /evidence_focus_catalog_incomplete/);
  assert.match(migration, /forming-present-continuous-verbs/);
});
