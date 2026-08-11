import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260811160000_governed_academic_intelligence_rollout.sql', 'utf8');
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');
const runbook = readFileSync('docs/academic-intelligence-governed-rollout-runbook.md', 'utf8');
const service = readFileSync('services/academicIntelligenceGovernanceService.ts', 'utf8');
const reportService = readFileSync('services/academicReportingService.ts', 'utf8');
const governanceUi = readFileSync('components/school-head/AcademicIntelligenceGovernance.tsx', 'utf8');
const schoolHead = readFileSync('components/school-head/SchoolHeadLearningIntelligence.tsx', 'utf8');
const reportBuilder = readFileSync('components/student-progress/AcademicReportBuilder.tsx', 'utf8');
const tables = [
    'academic_intelligence_governance_policies',
    'academic_intelligence_readiness_snapshots',
    'academic_intelligence_release_decisions',
    'academic_report_correction_requests',
    'academic_report_correction_events',
    'academic_intelligence_retention_requests',
    'academic_intelligence_retention_decisions',
];
test('phase 9 governance records are fail closed and service managed', () => {
    for (const table of tables) {
        assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
        assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
        assert.match(migration, new RegExp(`revoke all on table public\\.${table}`, 'i'));
        assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, 'i'));
    }
});
test('all governance correction and retention records are append only', () => {
    assert.match(migration, /academic_intelligence_governance_record_is_append_only/i);
    for (const marker of ['policies_append_only', 'readiness_append_only', 'release_append_only', 'corrections_append_only', 'correction_events_append_only', 'retention_requests_append_only', 'retention_decisions_append_only']) {
        assert.match(migration, new RegExp(marker, 'i'));
    }
});
test('policy is versioned hashed and School Head approved', () => {
    assert.match(migration, /policy_version integer not null/i);
    assert.match(migration, /supersedes_policy_id/i);
    assert.match(migration, /policy_hash text not null/i);
    assert.match(migration, /extensions\.digest[\s\S]+sha256/i);
    assert.match(migration, /Only the School Head can approve academic-intelligence governance/i);
});
test('school chooses evidence review reproduction retention and correction thresholds', () => {
    for (const field of ['min_evidence_coverage_percent', 'min_curriculum_coverage_percent', 'min_shadow_review_percent', 'min_intervention_review_percent', 'min_reproducible_report_samples', 'retention_months', 'correction_response_days']) {
        assert.match(migration, new RegExp(field, 'i'));
    }
    assert.match(migration, /governance_attestation/i);
    assert.match(governanceUi, /School Head attestation/i);
});
test('readiness reconciles the full parts 1 through 8 evidence chain', () => {
    for (const source of ['student_academic_enrolments', 'student_learning_observations', 'student_curriculum_coverage_states', 'academic_progress_golden_validation_runs', 'student_learning_shadow_runs', 'student_learning_validation_reviews', 'student_learning_intervention_outcome_reviews', 'academic_report_snapshots', 'academic_report_events']) {
        assert.match(migration, new RegExp(source, 'i'));
    }
});
test('readiness produces explicit blockers and exact hashes', () => {
    for (const blocker of ['no_enrolled_students', 'evidence_coverage_below_policy', 'curriculum_coverage_below_policy', 'golden_validation_not_passed', 'shadow_validation_not_completed', 'high_risk_shadow_reviews_open', 'intervention_review_below_policy', 'reproducible_report_samples_below_policy', 'no_final_reports']) {
        assert.match(migration, new RegExp(blocker, 'i'));
    }
    assert.match(migration, /source_snapshot_hash/i);
    assert.match(migration, /readiness_hash/i);
});
test('release capabilities are independently controlled', () => {
    for (const capability of ['student_reports', 'family_reports', 'schoolwide_reporting', 'intervention_effectiveness']) {
        assert.match(migration, new RegExp(`'${capability}'`, 'i'));
        assert.match(governanceUi, new RegExp(capability, 'i'));
    }
    for (const decision of ['enabled', 'paused', 'disabled'])
        assert.match(migration, new RegExp(`'${decision}'`, 'i'));
});
test('only School Head can release and ready latest-policy evidence is mandatory', () => {
    assert.match(migration, /Only the School Head can decide an academic-intelligence release/i);
    assert.match(migration, /readiness_status <> 'ready'/i);
    assert.match(migration, /Readiness must be re-evaluated against the latest governance policy/i);
});
test('student and family finalization fails closed', () => {
    assert.match(migration, /when 'student' then 'student_reports'/i);
    assert.match(migration, /when 'family' then 'family_reports'/i);
    assert.match(migration, /Academic-intelligence release is not enabled for this report audience/i);
    assert.match(migration, /Staff-only[\s\S]+shadow and pilot/i);
});
test('pausing student reports blocks later student reads but preserves staff access', () => {
    assert.match(migration, /academic_intelligence_capability_is_enabled\([\s\S]+student_reports/i);
    assert.match(migration, /v_staff := public\.academic_reporting_can_generate/i);
    assert.match(migration, /studentAccessRequiresCurrentRelease/i);
});
test('corrections preserve original report and require later final same-scope replacement', () => {
    assert.match(migration, /originalReportRemainsImmutable/i);
    assert.match(migration, /v_replacement\.status <> 'final'/i);
    assert.match(migration, /v_replacement\.scope_key <> v_original\.scope_key/i);
    assert.match(migration, /v_replacement\.report_version <= v_original\.report_version/i);
    assert.match(reportBuilder, /Request governed correction/i);
    assert.match(migration, /already has a terminal decision/i);
});
test('students can request correction only for their own final student report', () => {
    assert.match(migration, /v_report\.report_type = 'student'/i);
    assert.match(migration, /v_report\.student_id = v_caller/i);
    assert.match(migration, /v_report\.status = 'final'/i);
    assert.match(reportService, /rpc_request_academic_report_correction/i);
});
test('retention actions are reviewed but never execute browser deletion', () => {
    assert.match(migration, /request_type text not null check \(request_type in \('export','restrict','delete'\)\)/i);
    assert.match(migration, /legalReviewRequiredBeforeDestructiveAction/i);
    assert.match(migration, /recordsDeletedByThisRpc', false/i);
    assert.match(governanceUi, /Never auto-deletes/i);
});
test('audit manifest is year scoped hashed and excludes raw evidence payloads', () => {
    assert.match(migration, /rpc_academic_intelligence_audit_manifest/i);
    assert.match(migration, /policyHashes/i);
    assert.match(migration, /readinessHashes/i);
    assert.match(migration, /sourceReferenceCount/i);
    const manifestFunction = migration.match(/create or replace function public\.rpc_academic_intelligence_audit_manifest[\s\S]+?grant execute/)?.[0] ?? '';
    assert.doesNotMatch(manifestFunction, /report_payload|evidence jsonb|professional.*notes/i);
});
test('the UI exposes policy readiness release correction retention and audit', () => {
    for (const label of ['Governance policy', 'Readiness snapshot', 'Release capabilities', 'Correction queue', 'Retention requests', 'Export audit manifest']) {
        assert.match(governanceUi, new RegExp(label, 'i'));
    }
    assert.match(schoolHead, /Govern rollout/i);
    assert.match(schoolHead, /lazy\(\(\) => import\('\.\/AcademicIntelligenceGovernance'\)\)/i);
});
test('one typed service contract drives every governance RPC', () => {
    for (const rpc of ['rpc_academic_intelligence_governance_context', 'rpc_approve_academic_intelligence_governance_policy', 'rpc_evaluate_academic_intelligence_readiness', 'rpc_decide_academic_intelligence_release', 'rpc_resolve_academic_report_correction', 'rpc_request_academic_intelligence_retention_action', 'rpc_decide_academic_intelligence_retention_action', 'rpc_academic_intelligence_audit_manifest']) {
        assert.match(service, new RegExp(rpc, 'i'));
    }
});
test('phase 9 documentation defines launch cadence correction and incident response', () => {
    assert.match(roadmap, /## Phase 9 contract/i);
    assert.match(roadmap, /### Phase 9 launch and operating gate/i);
    assert.match(roadmap, /Phase 9 is complete when the school/i);
    assert.match(runbook, /## Release sequence/i);
    assert.match(runbook, /## Re-evaluation triggers/i);
    assert.match(runbook, /## Correction rule/i);
    assert.match(runbook, /## Retention rule/i);
    assert.match(runbook, /## Incident response/i);
});
test('phase 9 keeps the product academic rather than operational', () => {
    assert.match(runbook, /not a timetable, attendance, or general[\s\S]+operations replacement/i);
    assert.match(roadmap, /does not add operational school management/i);
    assert.match(roadmap, /missingEvidenceNeverCountsAsWeakness|incomplete data[\s\S]+academic conclusions/i);
});
