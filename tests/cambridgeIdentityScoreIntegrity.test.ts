import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { normalizeCambridgeIdentityLinkResult } from '../src/lib/cambridgeIdentityLinkResult.js';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260804150000_cambridge_identity_score_integrity.sql'),
  'utf8',
);
const portal = fs.readFileSync(path.resolve(process.cwd(), 'components/SchoolAdminPortal.tsx'), 'utf8');
const tab = fs.readFileSync(
  path.resolve(process.cwd(), 'components/school-admin/tabs/CambridgeTab.tsx'),
  'utf8',
);
const service = fs.readFileSync(path.resolve(process.cwd(), 'services/schoolAdminService.ts'), 'utf8');

test('legacy Cambridge identity links require exact rows, verified same-school students, and reasons', () => {
  assert.match(migration, /where qs\.id = p_score_id\s+for update;/);
  assert.match(migration, /student_membership\.school_id = v_score\.school_id/);
  assert.match(migration, /student_membership\.status = 'active'/);
  assert.match(migration, /student_membership\.role_in_school = 'student'/);
  assert.match(migration, /u\.full_name_status = 'verified'/);
  assert.match(migration, /CAMBRIDGE_IDENTITY_REASON_REQUIRED/);
  assert.match(migration, /char_length\(v_reason\) > 500/);
});

test('identity audit is append-only to clients and school scoped', () => {
  assert.match(migration, /alter table public\.cambridge_quiz_identity_audit enable row level security/);
  assert.match(migration, /role_in_school = 'school_admin'/);
  assert.match(migration, /revoke all on table public\.cambridge_quiz_identity_audit from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.cambridge_quiz_identity_audit to authenticated/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.school_admin_link_cambridge_attempt_student\(uuid, uuid, text\)\s+from public, anon/);
});

test('future Cambridge writes normalize score, release alias, and release metadata', () => {
  assert.match(migration, /new\.percentage := round\(\(new\.score::numeric \/ new\.total_questions::numeric\) \* 100\)::integer/);
  assert.match(migration, /if tg_op = 'INSERT' then\s+new\.scores_released := false;\s+new\.score_released := false;/);
  assert.match(migration, /new\.score_released := coalesce\(new\.scores_released, false\)/);
  assert.match(migration, /new\.released_at := coalesce\(new\.released_at, now\(\)\)/);
  assert.match(migration, /before insert or update of score, total_questions, percentage, scores_released, score_released/);
  assert.doesNotMatch(migration, /update public\.quiz_scores\s+set score_released/i);
});

test('school-admin UI never guesses and requires a confirmed student and reason', () => {
  assert.match(tab, /Select verified student…/);
  assert.match(tab, /disabled=\{!identitySelections\[score\.id\]\}/);
  assert.match(tab, /linkCambridgeAttemptStudent\(score, identitySelections\[score\.id\]\)/);
  assert.match(portal, /title: 'Confirm Cambridge student identity'/);
  assert.match(portal, /requiresReason: true/);
  assert.match(portal, /reasonRequired: true/);
  assert.match(service, /school_admin_link_cambridge_attempt_student/);
});

test('identity response normalization rejects malformed payloads and keeps audit metadata', () => {
  assert.deepEqual(normalizeCambridgeIdentityLinkResult(null), {
    success: false,
    error: 'The identity service returned an invalid response',
  });
  assert.deepEqual(normalizeCambridgeIdentityLinkResult({ success: false, error: 'Conflict', code: 'CONFLICT' }), {
    success: false,
    error: 'Conflict',
    code: 'CONFLICT',
  });
  assert.deepEqual(normalizeCambridgeIdentityLinkResult({
    success: true,
    audit_id: 'audit-1',
    score_id: 'score-1',
    student_id: 'student-1',
    student_name: 'Verified Student',
  }), {
    success: true,
    code: undefined,
    audit_id: 'audit-1',
    score_id: 'score-1',
    student_id: 'student-1',
    student_name: 'Verified Student',
  });
});
