import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260812200000_enforce_school_programme_access.sql');
const privilegeCleanup = read('supabase/migrations/20260812201000_programme_rpc_privilege_cleanup.sql');

test('a school pilot stays explicit, fixed to 30 days, and unlocks every programme', () => {
  const pilot = read('supabase/migrations/20260812180500_governed_all_programme_pilot.sql');
  assert.match(pilot, /state text not null default 'not_started'/i);
  assert.match(pilot, /v_ends_at := now\(\)\+interval '30 days'/i);
  assert.match(pilot, /foreach v_module in array array\['core','cambridge','ielts','writing','admissions'\]/i);
  assert.match(migration, /'exhausted',false,'usage_only',true/i);
  assert.match(migration, /Records pilot usage without limiting access/i);
});

test('legacy plan mutation and pilot extension shortcuts are not browser callable', () => {
  assert.match(migration, /revoke all on function public\.admin_set_school_plan\(uuid,text\)/i);
  assert.match(migration, /revoke all on function public\.admin_extend_pilot_trial\(uuid,integer\)/i);
  const schoolsTab = read('components/admin/tabs/SchoolsTab.tsx');
  assert.doesNotMatch(schoolsTab, /admin_set_school_plan/);
  assert.doesNotMatch(schoolsTab, /handleExtendTrial|handleResetQuotas|handleSetQuota/);
  assert.match(schoolsTab, /Billing and programme access are managed in Billing/i);
});

test('Cambridge privileged reads and submissions enforce the school entitlement', () => {
  for (const contract of [
    'get_school_cambridge_scores',
    'get_my_cambridge_exam_identity',
    'get_visible_cambridge_tests_for_student',
    'get_teacher_cambridge_test_catalog',
    'submit_cambridge_attempt',
  ]) assert.match(migration, new RegExp(`function public\\.${contract}`, 'i'));
  assert.match(migration, /submit_cambridge_attempt_entitlement_internal/i);
  assert.match(migration, /enforce_cambridge_module_on_scores/i);
  assert.match(migration, /school_has_module_access\(v_school_id,'cambridge'\)/i);
});

test('Writing Hub and IELTS security-definer boundaries fail closed for school accounts', () => {
  assert.match(migration, /bh_writing_authorized_english_classes[\s\S]+actor_has_programme_access\('writing',true\)/i);
  assert.match(migration, /rpc_bh_writing_canonical_assessment_entitlement_internal/i);
  assert.match(migration, /enforce_writing_module_row/i);
  assert.match(migration, /rpc_ielts_exam_whoami_entitlement_internal/i);
  assert.match(migration, /rpc_ielts_start_attempt_entitlement_internal/i);
  assert.match(migration, /rpc_ielts_submit_attempt_entitlement_internal/i);
  assert.match(migration, /enforce_ielts_module_row/i);
});

test('Admission candidate and staff RPCs keep their implementation behind entitlement wrappers', () => {
  for (const internal of [
    'rpc_adm_start_attempt_entitlement_internal',
    'rpc_adm_save_answer_entitlement_internal',
    'rpc_adm_submit_attempt_entitlement_internal_v2',
    'rpc_adm_generate_test_form_entitlement_internal',
    'rpc_adm_get_candidate_report_entitlement_internal',
  ]) assert.match(migration, new RegExp(internal, 'i'));
  assert.match(migration, /Admission Hub is not active for this school/i);
  assert.match(migration, /school_admissions_module_required/i);
});

test('teacher navigation hides unavailable school programmes and pilot usage never locks early', () => {
  const teacher = read('components/TeacherPortal.tsx');
  const actions = read('components/MainActions.tsx');
  const tiers = read('services/tierService.ts');
  assert.match(teacher, /canUseWritingModule/);
  assert.match(teacher, /canUseCambridgeModule/);
  assert.match(teacher, /const pilotExhausted = false/);
  assert.doesNotMatch(actions, /quota\?\.exhausted/);
  assert.match(tiers, /Usage telemetry must never shorten an otherwise active pilot/i);
});

test('programme privilege cleanup removes accidental anonymous management RPC access', () => {
  assert.match(privilegeCleanup, /p\.proname like 'rpc_ielts_%'/i);
  assert.match(privilegeCleanup, /revoke execute on function %s from public, anon/i);
  assert.match(privilegeCleanup, /rpc_public_ielts_task_previews/i);
  assert.doesNotMatch(privilegeCleanup, /rpc_adm_start_attempt|rpc_adm_save_answer|rpc_adm_submit_attempt/i);
});
