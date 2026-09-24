import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registry = readFileSync('supabase/migrations/20260924043545_create_multisubject_cambridge_skill_registries_v1.sql', 'utf8');
const governance = readFileSync('supabase/migrations/20260924043703_generalize_canonical_registry_governance.sql', 'utf8');
const bankMigration = readFileSync('supabase/migrations/20260924044851_migrate_existing_multisubject_taxonomy_to_canonical_registries.sql', 'utf8');
const crosswalkScope = readFileSync('supabase/migrations/20260924045426_refine_multisubject_cambridge_crosswalk_scope.sql', 'utf8');
const programmeScope = readFileSync('supabase/migrations/20260924045505_scope_registry_programmes_by_subject_alias.sql', 'utf8');
const edge = readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
const teacherService = readFileSync('services/teacherQuestionBatchService.ts', 'utf8');

test('published v1 registries cover the supported Brain Heist subject domains', () => {
  for (const code of [
    'bh-mathematics-core-v1',
    'bh-science-core-v1',
    'bh-global-perspectives-core-v1',
    'bh-digital-technology-core-v1',
    'bh-geography-core-v1',
    'bh-modern-languages-core-v1',
    'bh-travel-tourism-core-v1',
  ]) {
    assert.ok(registry.includes(code), code);
  }
});

test('Cambridge programme crosswalks span primary, lower secondary and suitable upper secondary routes', () => {
  for (const programme of [
    '0096', '0862', '0580',
    '0097', '0893', '0653', '0610', '0620', '0625',
    '0838', '1129', '0457',
    '0059', '0860', '0072', '0082', '0478', '0417',
    '0065', '0839', '0460',
    '0064', '0771', '0525',
    '0471',
  ]) {
    assert.ok(crosswalkScope.includes(programme), programme);
  }
});

test('shared registries restrict subject aliases instead of leaking unrelated strands or qualifications', () => {
  assert.match(registry, /allowed_strand_codes/);
  assert.match(programmeScope, /allowed_programme_codes/);
  assert.match(programmeScope, /russian language/i);
  assert.match(programmeScope, /0064/);
  assert.match(programmeScope, /0771/);
  assert.match(crosswalkScope, /science\.biology/);
  assert.match(crosswalkScope, /science\.chemistry/);
  assert.match(crosswalkScope, /science\.physics/);
  assert.match(crosswalkScope, /digital\.digital-literacy/);
  assert.match(crosswalkScope, /digital\.computational-thinking/);
});

test('school governance is fail-closed for any registry-enabled subject', () => {
  assert.match(governance, /resolve_canonical_skill_pair/);
  assert.match(governance, /enforce_school_canonical_taxonomy_registry/);
  assert.match(governance, /school_question_canonical_registry_match_required/);
  assert.match(governance, /school_question_canonical_registry_name_code_mismatch/);
  assert.doesNotMatch(governance, /where registry\.code='bh-english-core-v1'/i);
});

test('legacy multi-subject taxonomy migration preserves history through supersession', () => {
  assert.match(bankMigration, /supersedes_taxonomy_id/);
  assert.match(bankMigration, /Multi-Subject Registry Migration 2026-09-24/);
  assert.match(bankMigration, /multisubject_taxonomy_migration_incomplete/);
  assert.match(bankMigration, /bh-mathematics-core-v1/);
  assert.match(bankMigration, /bh-science-core-v1/);
  assert.match(bankMigration, /bh-digital-technology-core-v1/);
});

test('AI batch creation uses the canonical registry for every supported generated subject', () => {
  assert.match(edge, /QUESTION_QUALITY_REVISION = 5/);
  assert.match(edge, /rpc_academic_skill_registry_for_generation/);
  assert.match(edge, /For this subject, taxonomy identity is governed/i);
  assert.doesNotMatch(edge, /preferredSubject === "English"/);
  assert.match(teacherService, /TEACHER_QUESTION_QUALITY_REVISION = 5/);
  assert.doesNotMatch(teacherService, /candidate\.subject === 'English'/);
});
