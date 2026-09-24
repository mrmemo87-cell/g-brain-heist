import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manualMigration = readFileSync('supabase/migrations/20260924040538_manual_question_registry_governance.sql', 'utf8');
const genericGovernance = readFileSync('supabase/migrations/20260924043703_generalize_canonical_registry_governance.sql', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const service = readFileSync('services/gameService.ts', 'utf8');
const adminInspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');

test('manual teacher questions stay non-authoritative until governance approval', () => {
  assert.match(manualMigration, /teacher_question_manual_submissions/);
  assert.match(manualMigration, /verification_status='in_review'/);
  assert.match(manualMigration, /analytics_eligible=false/);
  assert.match(manualMigration, /rpc_teacher_submit_manual_question_for_governance/);
});

test('manual submissions join the same superadmin governance source as PDF batches', () => {
  assert.match(manualMigration, /teacher_question_governance_submissions/);
  assert.match(manualMigration, /'manual_teacher'::text as candidate_origin/i);
  assert.match(manualMigration, /rpc_superadmin_govern_school_question/);
  assert.match(manualMigration, /rpc_superadmin_school_question_curriculum_options/);
});

test('ordinary teacher question creator exposes canonical skill and subskill dropdowns for any published registry', () => {
  assert.match(portal, /1\. Strand/);
  assert.match(portal, /2\. Skill/);
  assert.match(portal, /3\. Subskill/);
  assert.match(portal, /Academic Skill Registry/);
  assert.match(portal, /Academic identity selected/);
  assert.match(portal, /Submit for Academic Verification/);
  assert.match(portal, /Auto-selected from your teaching allocation/);
  assert.match(portal, /getAssignedGradesForQuestionSubject/);
  assert.match(service, /rpc_academic_skill_registry_for_generation/);
  assert.match(service, /rpc_teacher_submit_manual_question_for_governance/);
});

test('generic governance resolves canonical pairs through subject aliases', () => {
  assert.match(genericGovernance, /resolve_canonical_skill_pair/);
  assert.match(genericGovernance, /academic_skill_registry_subject_aliases/);
  assert.match(genericGovernance, /school_question_canonical_registry_match_required/);
});

test('manual governance provenance does not pretend a PDF exists', () => {
  assert.match(adminInspector, /Manual teacher question · human review required/);
  assert.match(adminInspector, /candidateOrigin === 'manual_teacher'/);
  assert.match(adminInspector, /Manual teacher submission · frozen question snapshot/);
});
