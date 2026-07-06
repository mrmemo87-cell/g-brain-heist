import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const hub = readFileSync('components/AdmissionHub.tsx', 'utf8');
const rpcs = readFileSync('ADM_RPCS.sql', 'utf8');
const reportMigration = readFileSync('supabase/migrations/20260629133000_admission_placement_intelligence_v1.sql', 'utf8');
const lockdownSql = readFileSync('supabase/migrations/20260629143000_admission_official_bank_lockdown.sql', 'utf8');
test('school admin flow uses non-technical admission wording', () => {
    assert.match(hub, /Create admission test/);
    assert.match(hub, /Register candidates/);
    assert.match(hub, /Send links/);
    assert.match(hub, /Track status/);
    assert.match(hub, /View results/);
    assert.match(hub, /We’ll prepare and activate the test for candidate-specific links\./);
});
test('candidate token is not shown in normal candidate rows', () => {
    assert.match(hub, /Candidate-specific links are private/);
    assert.doesNotMatch(hub, /c\.token\.slice\(0, 12\)/);
    assert.match(hub, /Search by name or contact/);
});
test('friendly admission error mapping avoids raw RPC and database copy', () => {
    assert.match(hub, /export const friendlyAdmissionError/);
    assert.match(hub, /Not enough official questions are available/);
    assert.match(hub, /Candidate link unavailable/);
    assert.match(hub, /Result not ready yet/);
    assert.match(hub, /Permission denied/);
    assert.match(hub, /closed or no longer available/);
    assert.match(hub, /console\.warn\('Admission data load failed'/);
});
test('Grade 6 package guidance remains a small UX grouping, not a new backend system', () => {
    assert.match(hub, /Grade 6 Admission Package/);
    assert.match(hub, /English required/);
    assert.match(hub, /Maths required/);
    assert.match(hub, /Science optional/);
    assert.match(hub, /send each matching subject link below/);
});
test('candidate token RPCs scope form and attempts to the intended candidate school', () => {
    assert.match(rpcs, /FROM adm_candidates WHERE token = p_token/);
    assert.match(rpcs, /WHERE form_code = p_form_code\s+AND school_id = v_candidate\.school_id/);
    assert.match(rpcs, /WHERE id = p_attempt_id AND candidate_id = v_candidate\.id/);
    assert.match(rpcs, /WHERE fq\.form_id = v_attempt\.form_id AND fq\.question_id = p_question_id/);
});
test('candidate report RPC enforces active school staff membership before returning candidate data', () => {
    assert.match(reportMigration, /where sm\.school_id = v_attempt\.school_id/);
    assert.match(reportMigration, /sm\.user_id = auth\.uid\(\)/);
    assert.match(reportMigration, /sm\.role_in_school in \('school_admin', 'teacher'\)/);
    assert.match(reportMigration, /sm\.status = 'active'/);
});
test('official admission questions are selectable but locked against school-user edits', () => {
    assert.match(lockdownSql, /adm_q_official_select/);
    assert.match(lockdownSql, /adm_q_school_admin_all/);
    assert.match(lockdownSql, /is_official = false/);
    assert.match(lockdownSql, /adm_prevent_locked_content_mutation/);
    assert.match(lockdownSql, /Official Brain Heist admission content is locked/);
});
