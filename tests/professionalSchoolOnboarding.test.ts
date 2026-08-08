import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
const migration = read('supabase/migrations/20260808190000_professional_school_onboarding.sql');

test('approval provisions exactly one protected School Head only after authority declaration', () => {
  assert.match(migration, /applicant_authority_confirmed/);
  assert.match(migration, /'school_admin','active',true/);
  assert.match(migration, /school_head_provisioned/);
  assert.match(migration, /Duplicate requests join as the requested operational role; ownership is never changed/);
});

test('manual payment activation is platform-only and separates pending from verified access', () => {
  assert.match(migration, /admin_record_manual_school_subscription/);
  assert.match(migration, /not public\.is_superadmin\(v_actor\)/);
  assert.match(migration, /'cash','bank_transfer','invoice','complimentary'/);
  assert.match(migration, /if p_status = 'active' then[\s\S]*school_module_entitlements/);
  assert.doesNotMatch(migration, /if p_status = 'pending' then[\s\S]{0,500}school_module_entitlements/);
});

test('module entitlements preserve legacy schools but explicitly gate new schools', () => {
  assert.match(migration, /Legacy schools did not have module rows/);
  assert.match(migration, /school_has_module_access/);
  assert.match(migration, /module_key='core','school_approval'/);
  assert.match(migration, /rpc_adm_check_entitlement[\s\S]*school_has_module_access\(p_school_id,'admissions'\)/);
  assert.match(migration, /can_create_ielts_exam[\s\S]*school_has_module_access\(p_school_id,'ielts'\)/);
  assert.match(migration, /can_manage_cambridge_score[\s\S]*school_has_module_access\(s\.school_id,'cambridge'\)/);
});

test('Paddle checkout and portal access require active ownership', () => {
  const paddle = read('supabase/functions/paddle/index.ts');
  assert.match(paddle, /requireSchoolHead/);
  assert.match(paddle, /\.eq\("role_in_school", "school_admin"\)/);
  assert.match(paddle, /\.eq\("is_owner", true\)/);
  assert.match(paddle, /module_keys: \["core"\]/);
});

test('verified student onboarding selects an approved class and never creates one', () => {
  const approvedRpc = migration.slice(migration.indexOf('create or replace function public.rpc_setup_approved_class_enrollment'), migration.indexOf('create or replace function public.rpc_request_school_class_placement'));
  const legacyRpc = migration.slice(migration.indexOf('create or replace function public.rpc_setup_school_class_enrollment'), migration.indexOf('create table if not exists private.pending_account_cleanup_log'));
  assert.match(approvedRpc, /from public\.classes/);
  assert.match(approvedRpc, /insert into public\.class_students/);
  assert.doesNotMatch(approvedRpc, /insert into public\.classes/);
  assert.doesNotMatch(legacyRpc, /insert into public\.classes/);
  assert.match(legacyRpc, /awaiting_placement/);
});

test('pending account cleanup starts with the new policy and waits seven days', () => {
  assert.match(migration, /pending_account_cleanup_policy/);
  assert.match(migration, /eligible_created_after/);
  assert.match(migration, /au\.created_at < now\(\)-interval '7 days'/);
  assert.match(migration, /not exists\(select 1 from public\.school_members/);
  assert.match(migration, /not exists\(select 1 from public\.school_requests/);
});

test('email confirmation has code verification, resend, and a seven-day lifecycle', () => {
  const auth = read('services/authService.ts');
  const login = read('components/LoginView.tsx');
  assert.match(auth, /auth\.verifyOtp\([\s\S]{0,160}token: normalizedToken[\s\S]{0,80}type: 'signup'/);
  assert.match(auth, /auth\.resend\([\s\S]{0,120}type: 'signup'/);
  assert.match(auth, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(login, /Confirm and continue/);
  assert.match(login, /Resend confirmation/);
});

test('School Head launch checklist and read-only delegated billing are present', () => {
  const head = read('components/SchoolHeadPortal.tsx');
  const billing = read('components/school-admin/BillingTabUI.tsx');
  assert.match(head, /School launch checklist/);
  assert.match(head, /Save programme requirements/);
  assert.match(billing, /Only the School Head can start trials, purchase plans, or manage payment details/);
  assert.match(billing, /canManageBilling/);
});

test('first setup screen presents join, apply, and solo paths in that order', () => {
  const setupWizard = read('components/onboarding/SetupWizard.tsx');
  const pathSelection = setupWizard.slice(
    setupWizard.indexOf('const renderPathSelection'),
    setupWizard.indexOf('const renderInviteCodeStep'),
  );
  const roleSelection = setupWizard.slice(
    setupWizard.indexOf('const renderRoleSelection'),
    setupWizard.indexOf('const renderStudentDetails'),
  );
  const joinSchoolIndex = pathSelection.indexOf('Join a School');
  const applyIndex = pathSelection.indexOf('Apply to add your school');
  const continueSoloIndex = pathSelection.indexOf('Continue Solo');

  assert.ok(joinSchoolIndex >= 0);
  assert.ok(applyIndex > joinSchoolIndex);
  assert.ok(continueSoloIndex > applyIndex);
  assert.match(pathSelection, /onClick={handleSchoolApplicationOpen}/);
  assert.match(pathSelection, /Start school application/);
  assert.doesNotMatch(roleSelection, /Apply to add your school/);
  assert.match(setupWizard, /setRole\('teacher'\)/);
  assert.match(setupWizard, /setShowRequestModal\(true\)/);
});
