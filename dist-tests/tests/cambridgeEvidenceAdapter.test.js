import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260810193000_cambridge_evidence_adapter.sql', 'utf8');
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');
const listeningPilot = readFileSync('public/cambridge-tests/English stage 9/cambridge_listening_test_1.html', 'utf8');
const evidenceTables = [
    'cambridge_evidence_runs',
    'cambridge_evidence_item_snapshots',
    'cambridge_evidence_observations',
];
test('phase 4 creates immutable run item and observation provenance', () => {
    for (const table of evidenceTables) {
        assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
        assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }
    assert.match(migration, /cambridge_evidence_runs_are_append_only/i);
    assert.match(migration, /completed_cambridge_evidence_run_is_immutable/i);
    assert.match(migration, /cambridge_evidence_snapshots_are_append_only/i);
});
test('adapter never derives item attainment from an overall score', () => {
    assert.match(migration, /jsonb_typeof\(p_item_results\) is distinct from 'array'/i);
    assert.match(migration, /item_results_missing/i);
    assert.match(migration, /item_result_score_mismatch/i);
    assert.match(migration, /v_sum_awarded is distinct from v_score\.score::numeric/i);
    assert.match(migration, /v_sum_possible is distinct from v_score\.total_questions::numeric/i);
    assert.match(roadmap, /does not.*infer question-level attainment from an overall score/is);
});
test('item contract separates unanswered from incorrect and validates marks', () => {
    assert.match(migration, /correct','partial','incorrect','unanswered','unscored/i);
    assert.match(migration, /duplicate_item_keys/i);
    assert.match(migration, /v_state = 'incorrect' and v_awarded <> 0/i);
    assert.match(migration, /v_state in \('unanswered','unscored'\) and v_awarded <> 0/i);
    assert.match(migration, /response_state not in \('unanswered','unscored'\)/i);
    assert.match(roadmap, /unanswered items (?:are )?kept separate from incorrect answers/i);
});
test('only current approved mappings resolve and every used mapping is snapshotted', () => {
    assert.match(migration, /m\.status = 'approved'/i);
    assert.match(migration, /m\.item_content_hash = v_item\.content_hash/i);
    assert.match(migration, /m\.curriculum_version_content_hash = fv\.content_hash/i);
    for (const field of [
        'mappingId', 'assessmentItemId', 'curriculumObjectiveId', 'curriculumScopeId',
        'frameworkVersionId', 'mappingRole', 'mappingConfidence', 'itemContentHash',
        'curriculumVersionContentHash', 'mappingApprovedAt',
    ]) {
        assert.match(migration, new RegExp(`'${field}'`, 'i'));
    }
});
test('unregistered unmapped stale invalid and unanswered evidence is disclosed', () => {
    for (const status of ['resolved', 'unregistered', 'unmapped', 'stale', 'invalid']) {
        assert.match(migration, new RegExp(`'${status}'`, 'i'));
    }
    for (const field of [
        'unregisteredItemCount', 'unmappedItemCount', 'staleItemCount',
        'invalidItemCount', 'unansweredItemCount', 'mappingCoveragePercent',
    ]) {
        assert.match(migration, new RegExp(`'${field}'`, 'i'));
    }
    assert.match(migration, /mapping_coverage_incomplete/i);
});
test('observations aggregate by canonical objective and remain phase 5 gated', () => {
    assert.match(migration, /group by s\.curriculum_objective_id/i);
    assert.match(migration, /'curriculum:' \|\| v_group\.framework_version_id/i);
    assert.match(migration, /'provisional', false/i);
    assert.match(migration, /phase_5_confidence_gate_pending/i);
    assert.match(roadmap, /All Phase 4 Cambridge observations are `provisional`/i);
    assert.match(roadmap, /`contributes_to_focus_state = false`/i);
});
test('browser outcomes and verified service outcomes have separate trust boundaries', () => {
    assert.match(migration, /stored_client_result','teacher_verified','server_verified/i);
    assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
    assert.match(migration, /service_ingest_requires_verified_authority/i);
    assert.match(migration, /grant execute on function public\.rpc_materialize_cambridge_evidence[^;]+to service_role/is);
    assert.doesNotMatch(migration, /grant execute on function public\.rpc_materialize_cambridge_evidence[^;]+to authenticated/is);
});
test('first pilot emits content-free item results through the hardened attempt RPC', () => {
    assert.match(listeningPilot, /const itemResults = \[\]/i);
    assert.match(listeningPilot, /item_key: `q\$\{i\}`/i);
    assert.match(listeningPilot, /response_state: unanswered \? 'unanswered'/i);
    assert.match(listeningPilot, /evidence_adapter_version: 'cambridge-v1'/i);
    assert.match(listeningPilot, /item_results: itemResults/i);
    assert.match(listeningPilot, /rpc\('submit_cambridge_attempt'/i);
});
test('school readiness exposes missing processing and mapping data', () => {
    assert.match(migration, /rpc_school_cambridge_evidence_readiness/i);
    assert.match(migration, /active_school_membership_required/i);
    for (const state of ['no_attempts', 'not_processed', 'partial', 'ready']) {
        assert.match(migration, new RegExp(`'${state}'`, 'i'));
    }
    for (const field of [
        'attempts', 'processedAttempts', 'unprocessedAttempts', 'materializedRuns',
        'partialRuns', 'blockedRuns', 'provisionalObservations', 'nextGate',
    ]) {
        assert.match(migration, new RegExp(`'${field}'`, 'i'));
    }
});
test('direct browser table writes stay closed and the rollout is gated', () => {
    for (const table of evidenceTables) {
        assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, 'i'));
        assert.doesNotMatch(migration, new RegExp(`grant (?:insert|update|delete|all)[^;]*public\\.${table}[^;]*to authenticated`, 'i'));
    }
    assert.match(roadmap, /## Phase 4 contract/i);
    assert.match(roadmap, /### Phase 4 rollout gate/i);
    assert.match(roadmap, /Begin Phase 5 only after/i);
});
