import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registryMigration = readFileSync('supabase/migrations/20260924024223_create_cambridge_aligned_english_skill_registry_v1.sql', 'utf8');
const guardMigration = readFileSync('supabase/migrations/20260924024638_enforce_canonical_english_taxonomy_for_school_questions.sql', 'utf8');
const firstLanguageExtension = readFileSync('supabase/migrations/20260924032941_extend_english_registry_for_cambridge_first_language.sql', 'utf8');
const phaseGuard = readFileSync('supabase/migrations/20260924033300_complete_english_registry_extension_and_phase_guard.sql', 'utf8');
const bankMigration = readFileSync('supabase/migrations/20260924033707_migrate_existing_english_taxonomy_to_canonical_registry.sql', 'utf8');
const edge = readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
const teacherService = readFileSync('services/teacherQuestionBatchService.ts', 'utf8');
const adminService = readFileSync('services/adminQuestionBankService.ts', 'utf8');
const adminInspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');

test('English registry has a versioned five-strand Cambridge-aligned spine', () => {
  assert.match(registryMigration, /bh-english-core-v1/);
  assert.match(registryMigration, /eng\.reading/);
  assert.match(registryMigration, /eng\.writing/);
  assert.match(registryMigration, /eng\.use-of-english/);
  assert.match(registryMigration, /eng\.listening/);
  assert.match(registryMigration, /eng\.speaking/);
  for (const programme of ["0057", "0876", "0472", "0510", "0511"]) {
    assert.ok(registryMigration.includes(`'${programme}'`));
  }
  for (const programme of ["0058", "0861", "0500"]) {
    assert.ok(firstLanguageExtension.includes(`'${programme}'`));
  }
  assert.match(firstLanguageExtension, /eng\.reading\.language-effect/);
  assert.match(firstLanguageExtension, /eng\.reading\.argument-evaluation/);
  assert.match(firstLanguageExtension, /eng\.writing\.argumentation/);
});

test('registry keeps Cambridge AO references separate from Brain Heist cognitive AOs', () => {
  assert.match(registryMigration, /CIE0510-AO1/);
  assert.match(registryMigration, /CIE0510-AO4/);
  assert.match(registryMigration, /must never be stored in the Brain Heist cognitive-process AO field/i);
});

test('school verified English taxonomy fails closed unless canonical codes match', () => {
  assert.match(guardMigration, /school_english_taxonomy_registry_match_required/);
  assert.match(guardMigration, /school_english_taxonomy_registry_name_code_mismatch/);
  assert.match(guardMigration, /leaf\.parent_id=skill\.id/i);
  assert.match(guardMigration, /v_phase=any\(leaf\.applicable_phases\)/i);
  assert.match(phaseGuard, /eligible_grade_levels/i);
  assert.match(phaseGuard, /select max\(g\)/i);
});

test('batch generation selects taxonomy from the registry instead of inventing labels', () => {
  assert.match(edge, /rpc_academic_skill_registry_for_generation/);
  assert.match(edge, /choose exactly one listed skillCode\/subskillCode pair/i);
  assert.match(edge, /Never invent, paraphrase, pluralize, narrow, or expand a canonical skill/i);
  assert.match(edge, /registry_match/);
  assert.match(edge, /primary_skill_code/);
  assert.match(edge, /atomic_subskill_code/);
  assert.match(edge, /QUESTION_QUALITY_REVISION = 4/);
});

test('teacher review preserves canonical taxonomy codes', () => {
  assert.match(teacherService, /primary_skill_code\?: string/);
  assert.match(teacherService, /atomic_subskill_code\?: string/);
  assert.match(teacherService, /published Academic Skill Registry/i);
});

test('superadmin governance exposes canonical selection instead of free-text English identity', () => {
  assert.match(adminService, /loadAcademicSkillRegistryForGovernance/);
  assert.match(adminService, /primarySkillCode\?: string/);
  assert.match(adminService, /atomicSubskillCode\?: string/);
  assert.match(adminInspector, /Primary skill · canonical/);
  assert.match(adminInspector, /Atomic subskill · canonical/);
  assert.match(adminInspector, /chooseRegistryPrimarySkill/);
  assert.match(adminInspector, /chooseRegistrySubskill/);
});

test('legacy English bank migration preserves history and fails if legacy active taxonomy remains', () => {
  assert.match(bankMigration, /supersedes_taxonomy_id/);
  assert.match(bankMigration, /Full English bank canonical migration from legacy taxonomy/i);
  assert.match(bankMigration, /english_taxonomy_migration_incomplete/i);
  assert.match(bankMigration, /bh-english-core-v1/);
});
