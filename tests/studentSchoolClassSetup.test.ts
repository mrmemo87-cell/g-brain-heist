import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const authService = readFileSync('services/authService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260817131000_list_my_school_classes.sql', 'utf8');

test('student academic setup loads the signed-in student school active classes', () => {
  assert.match(authService, /rpc\('rpc_list_my_school_classes'\)/);
  assert.match(app, /listMySchoolClasses\(\)/);
  assert.match(app, /schoolAcademicClasses\.filter/);
  assert.match(app, /String\(schoolClass\.grade_level\) === String\(pendingGrade\)/);
  assert.match(app, /schoolClass\.class_code} — \{schoolClass\.class_name/);
  assert.doesNotMatch(app, /GRADE_TO_BATCH|DEFAULT_BATCH/);
  assert.doesNotMatch(app, /You can pick[\s\S]*N\/A/);
});

test('student placement saves through the protected approved-class workflow', () => {
  assert.match(app, /enrollInApprovedSchoolClass\(selectedAcademicClassId\)/);
  assert.doesNotMatch(app, /from\('users'\)[\s\S]{0,300}grade: pendingGrade/);
  assert.match(authService, /rpc\('rpc_setup_approved_class_enrollment'/);
});

test('the school class listing RPC is self-scoped and fail closed', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /sm\.user_id = v_user_id/);
  assert.match(migration, /sm\.status = 'active'/);
  assert.match(migration, /sm\.role_in_school = 'student'/);
  assert.match(migration, /u\.school_id = sm\.school_id/);
  assert.match(migration, /c\.school_id = v_school_id/);
  assert.match(migration, /c\.is_active is true/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.rpc_list_my_school_classes\(\) from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.rpc_list_my_school_classes\(\) to authenticated/);
});
