import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const subjectCatalog = readFileSync(
  'supabase/migrations/20260923181759_fix_teaching_group_academic_subject_catalog_counts.sql',
  'utf8',
);
const governance = readFileSync(
  'supabase/migrations/20260923181906_fix_school_question_governance_mapping_method.sql',
  'utf8',
);

test('current teaching-group academic subjects expose the real evidence scope and verified count', () => {
  assert.match(subjectCatalog, /teacher_current_teaching_roster/i);
  assert.match(subjectCatalog, /'scopeId',offering\.curriculum_scope_id/i);
  assert.match(subjectCatalog, /'approvedQuestionCount'/i);
  assert.match(subjectCatalog, /q\.verification_status='verified'/i);
  assert.match(subjectCatalog, /q\.analytics_eligible/i);
  assert.match(subjectCatalog, /q\.current_content_hash=q\.verified_content_hash/i);
  assert.match(subjectCatalog, /q\.pool_scope='school'/i);
  assert.match(subjectCatalog, /q\.owner_school_id=v_school/i);
});

test('human school-question governance no longer impersonates an AI-assisted mapping', () => {
  assert.match(governance, /rpc_superadmin_govern_school_question/i);
  assert.match(governance, /'primary'', ''ai_assisted'', ''approved'/i);
  assert.match(governance, /'primary'', ''manual'', ''approved'/i);
  assert.match(governance, /Expected school governance mapping insert pattern not found/i);
  assert.match(governance, /revoke all on function public\.rpc_superadmin_govern_school_question/i);
});
