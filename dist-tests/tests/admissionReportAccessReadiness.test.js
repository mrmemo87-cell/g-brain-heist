import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration = fs.readFileSync('supabase/migrations/20260706170000_admission_report_access_readiness_fix.sql', 'utf8');
const service = fs.readFileSync('services/admissionService.ts', 'utf8');
const hub = fs.readFileSync('components/AdmissionHub.tsx', 'utf8');
test('report RPC allows same-school admins and teachers while preserving school isolation', () => {
    assert.match(migration, /sm\.school_id = v_attempt\.school_id[\s\S]*sm\.user_id = auth\.uid\(\)[\s\S]*sm\.role_in_school IN \('school_admin', 'teacher'\)[\s\S]*sm\.status = 'active'/);
    assert.match(migration, /users u[\s\S]*u\.id = auth\.uid\(\)[\s\S]*u\.school_id = v_attempt\.school_id[\s\S]*coalesce\(u\.role, ''\) IN \('school_admin', 'teacher'\)/);
    assert.match(migration, /RETURN jsonb_build_object\('success', false, 'error', 'Access denied'\)/);
});
test('report readiness uses scored submitted attempts and real adm_attempts score columns', () => {
    assert.match(migration, /v_attempt\.status <> 'scored' OR v_attempt\.submitted_at IS NULL/);
    assert.match(migration, /v_attempt\.total_score IS NULL OR v_attempt\.max_score IS NULL OR v_attempt\.percentage IS NULL/);
    assert.match(migration, /'total_score', v_attempt\.total_score/);
    assert.match(migration, /'max_score', v_attempt\.max_score/);
    assert.match(migration, /'percentage', v_attempt\.percentage/);
    assert.doesNotMatch(migration, /v_attempt\.score\b|\.score\b|scored_at/);
});
test('report RPC distinguishes access, readiness, not found, and unavailable errors', () => {
    for (const expected of ['Attempt not found', 'Access denied', 'Result not ready', 'Report data unavailable']) {
        assert.match(migration, new RegExp(expected));
    }
});
test('frontend maps report errors to safe friendly messages', () => {
    assert.match(hub, /Access denied[\s\S]*You do not have permission to view this candidate report\./i);
    assert.match(hub, /Result not ready[\s\S]*Result not ready yet\. Please wait until the candidate submits and scoring is complete\./i);
    assert.match(hub, /attempt not found[\s\S]*We could not find this attempt\./i);
    assert.match(hub, /Report data unavailable[\s\S]*Report is unavailable right now\. Please try again\./i);
    assert.doesNotMatch(hub, /friendlyAdmissionError\('report not ready'/);
});
test('service propagates RPC report errors and maps report scores from total_score/max_score/percentage', () => {
    assert.match(service, /if \(!data\.success\) throw new Error\(data\.error \|\| 'Report data unavailable'\)/);
    assert.match(service, /total_score: raw\.attempt\?\.total_score \?\? 0/);
    assert.match(service, /max_score: raw\.attempt\?\.max_score \?\? 0/);
    assert.match(service, /const attemptPercentage = raw\.attempt\?\.percentage \?\? 0/);
    assert.doesNotMatch(service, /raw\.attempt\?\.score\b|scored_at/);
});
test('candidate tokens remain hidden in normal Admission Hub rows', () => {
    assert.doesNotMatch(hub, /c\.token\.slice/);
    assert.match(hub, /Candidate-specific links are private/);
});
test('final report RPC documents stable metadata contract from attempt form blueprint and candidate joins', () => {
    const finalMigration = fs.readFileSync('supabase/migrations/20260707120000_admission_report_metadata_contract.sql', 'utf8');
    assert.match(finalMigration, /FROM adm_attempts a\s+JOIN adm_test_forms f ON f\.id = a\.form_id\s+JOIN adm_blueprints b ON b\.id = f\.blueprint_id\s+JOIN adm_candidates c ON c\.id = a\.candidate_id/i);
    for (const field of ["'form_code', v_form.form_code", "'form_title', v_form_title", "'form_subject', v_form_subject", "'subject', v_form_subject", "'grade', v_form_grade", "'status', v_attempt.status", "'total_score', v_attempt.total_score", "'max_score', v_attempt.max_score", "'percentage', v_attempt.percentage", "'submitted_at', v_attempt.submitted_at"]) {
        assert.match(finalMigration, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});
test('frontend normalizes top-level nested and context report metadata without treating access denied as metadata loss', () => {
    assert.match(service, /normalizeReportPayload/);
    assert.match(service, /raw\.form_code, raw\.formCode, form\.form_code/);
    assert.match(service, /raw\.form_subject, raw\.formSubject, raw\.subject, form\.subject, blueprint\.subject, context\.form_subject/);
    assert.match(service, /context\.form_code/);
    assert.match(service, /formCode: raw\.form_code/);
    assert.match(service, /formSubject: raw\.form_subject/);
    assert.match(service, /formTitle: raw\.form_title/);
    assert.match(service, /if \(!data\.success\) throw new Error\(data\.error \|\| 'Report data unavailable'\)/);
});
test('Admission Hub supplies candidate-details form context and keeps report header subject aware', () => {
    assert.match(hub, /buildReportContext/);
    assert.match(hub, /form_code: form\?\.form_code/);
    assert.match(hub, /form_subject: subject/);
    assert.match(hub, /AdmService\.getCandidateReport\(attemptId, buildReportContext\(attemptId\)\)/);
    assert.match(hub, /reportData\.form_label \|\| AdmService\.buildAdmissionReportFormLabel/);
    assert.match(hub, /Code \{reportData\.form_code \|\| '—'\}/);
});
const contentVersionMigration = fs.readFileSync('supabase/migrations/20260707150000_admission_report_content_version_variable_fix.sql', 'utf8');
const reportFunctionBody = contentVersionMigration.match(/CREATE OR REPLACE FUNCTION public\.rpc_adm_get_candidate_report[\s\S]*?\$\$;/)?.[0] ?? contentVersionMigration;
test('latest report RPC derives optional content_version without blueprint or undeclared variable references', () => {
    assert.doesNotMatch(reportFunctionBody, /v_blueprint\.content_version|\bb\.content_version\b|adm_blueprints\.content_version/);
    assert.doesNotMatch(reportFunctionBody, /v_content_version/);
    assert.match(reportFunctionBody, /'content_version', \(SELECT COALESCE\(max\(q\.content_version\), max\(qp\.content_version\)\)[\s\S]*FROM adm_answers ans[\s\S]*JOIN adm_questions q ON q\.id = ans\.question_id[\s\S]*LEFT JOIN adm_question_pools qp ON qp\.id = q\.pool_id[\s\S]*WHERE ans\.attempt_id = p_attempt_id\)/);
});
test('latest report RPC keeps content_version nullable and non-blocking for scored reports', () => {
    assert.match(reportFunctionBody, /'content_version', COALESCE\(q\.content_version, qp\.content_version\)/);
    assert.doesNotMatch(reportFunctionBody, /content_version IS NULL|COALESCE\([^)]*content_version[^)]*,\s*'legacy'|Report data unavailable[\s\S]{0,160}content_version/);
    assert.match(reportFunctionBody, /IF v_attempt\.status <> 'scored' OR v_attempt\.submitted_at IS NULL THEN/);
    assert.match(reportFunctionBody, /RETURN jsonb_build_object\('success', true[\s\S]*'content_version', \(SELECT COALESCE\(max\(q\.content_version\), max\(qp\.content_version\)\)/);
});
test('latest report RPC opens scored SCI6 reports from real adm_answers rows with metadata', () => {
    assert.match(reportFunctionBody, /SELECT count\(\*\) INTO v_total_questions FROM adm_answers ans WHERE ans\.attempt_id = p_attempt_id/);
    assert.match(reportFunctionBody, /JOIN adm_answers ans ON ans\.attempt_id = a\.id\s+JOIN adm_questions q ON q\.id = ans\.question_id/);
    assert.doesNotMatch(reportFunctionBody, /adm_attempt_answers/);
    for (const field of ["'form_code', v_form.form_code", "'form_subject', v_form_subject", "'subject', v_form_subject", "'form_title', v_form_title", "'grade', v_form_grade", "'total_score', v_attempt.total_score", "'max_score', v_attempt.max_score", "'percentage', v_attempt.percentage", "'answers', coalesce(v_answers, '[]'::jsonb)"]) {
        assert.match(reportFunctionBody, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(reportFunctionBody, /WHEN v_form\.form_code ILIKE 'SCI%' THEN 'science'/);
});
test('latest report RPC avoids missing score/scored_at columns and preserves access/readiness behavior', () => {
    assert.match(reportFunctionBody, /v_attempt\.status <> 'scored' OR v_attempt\.submitted_at IS NULL/);
    assert.match(reportFunctionBody, /v_attempt\.total_score IS NULL OR v_attempt\.max_score IS NULL OR v_attempt\.percentage IS NULL/);
    assert.doesNotMatch(reportFunctionBody, /v_attempt\.score\b|\.score\b|scored_at/);
    assert.match(reportFunctionBody, /Access denied/);
    assert.match(reportFunctionBody, /Result not ready/);
});
