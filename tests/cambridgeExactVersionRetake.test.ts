import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260804130000_cambridge_exact_version_retakes.sql'),
  'utf8',
);
const portal = fs.readFileSync(path.resolve(process.cwd(), 'components/SchoolAdminPortal.tsx'), 'utf8');
const tab = fs.readFileSync(
  path.resolve(process.cwd(), 'components/school-admin/tabs/CambridgeTab.tsx'),
  'utf8',
);
const service = fs.readFileSync(path.resolve(process.cwd(), 'services/schoolAdminService.ts'), 'utf8');

test('Cambridge retakes lock and archive only the selected canonical attempt version', () => {
  assert.match(migration, /where qs\.id = p_score_id\s+for update;/);
  assert.match(migration, /student_id,\s+student_name,[\s\S]*test_id,\s+quiz_version,\s+attempt_number/);
  assert.match(migration, /delete from public\.quiz_scores\s+where id = v_score\.id\s+and student_id = v_score\.student_id\s+and test_id = v_score\.test_id\s+and quiz_version = v_score\.quiz_version/);
  assert.match(migration, /'archived_attempt_count', 1/);
  assert.doesNotMatch(migration, /lower\(trim\(qs\.student_name\)\)/);
});

test('ambiguous legacy attempts fail closed instead of guessing student identity', () => {
  assert.match(migration, /v_score\.student_id is null/);
  assert.match(migration, /CAMBRIDGE_IDENTITY_REVIEW_REQUIRED/);
  assert.match(tab, /disabled=\{!hasCanonicalAttemptIdentity\}/);
  assert.match(tab, /Identity review required/);
});

test('retake authorization retains database and RPC security boundaries', () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /public\.can_manage_cambridge_score\(v_score\.id, true\)/);
  assert.match(migration, /revoke all on function public\.allow_cambridge_retake\(uuid, text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.allow_cambridge_retake\(uuid, text\) to authenticated/);
});

test('school-admin reporting distinguishes test versions and exports attempt identity', () => {
  assert.match(portal, /getCambridgeReportKey/);
  assert.match(portal, /score\.test_id \|\| score\.quiz_name/);
  assert.match(portal, /score\.quiz_version \|\| 'legacy-v1'/);
  assert.match(portal, /'Test ID', 'Version', 'Attempt', 'Status'/);
  assert.match(tab, /score\.quiz_version \|\| 'legacy-v1'/);
  assert.match(tab, /Attempt \{score\.attempt_number \|\| 1\}/);
});

test('school-admin retakes require a reason and preserve structured RPC outcomes', () => {
  assert.match(portal, /requiresReason: true/);
  assert.match(portal, /SchoolAdminService\.allowQuizRetake\(\s*score\.id,\s*reason/);
  assert.match(service, /p_score_id: scoreId/);
  assert.match(service, /p_reason: reason\?\.trim\(\) \|\| null/);
  assert.match(service, /code: result\.code/);
  assert.match(service, /return result && typeof result === 'object'/);
});
