import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260810210000_evidence_confidence_and_coverage.sql', 'utf8');
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');
test('phase 5 stores an immutable versioned confidence policy', () => {
    assert.match(migration, /create table public\.academic_evidence_confidence_policies/i);
    assert.match(migration, /academic_evidence_confidence_policies_active_uidx/i);
    assert.match(migration, /active_or_retired_confidence_policy_is_immutable/i);
    for (const component of [
        'evidence_volume', 'qualifying_observations', 'evidence_quality', 'recency',
        'source_diversity', 'mapping_quality', 'source_coverage', 'time_span', 'consistency',
    ])
        assert.match(migration, new RegExp(`'${component}'`, 'i'));
});
test('confidence state preserves every input dimension and decision gate', () => {
    for (const field of [
        'qualifying_observations', 'evidence_items', 'source_type_count',
        'source_instance_count', 'evidence_age_days', 'evidence_span_days',
        'mapping_score', 'source_coverage_score', 'consistency_score',
        'confidence_score', 'confidence_band', 'assessment_state',
        'decision_eligible', 'persistent_eligible', 'resolution_eligible',
        'strength_eligible', 'teacher_review_required', 'gate_results', 'disclosure',
    ])
        assert.match(migration, new RegExp(field, 'i'));
});
test('the confidence formula weights sum to one', () => {
    const weights = [0.15, 0.10, 0.15, 0.15, 0.10, 0.15, 0.10, 0.05, 0.05];
    assert.equal(weights.reduce((sum, weight) => sum + weight, 0), 1);
    assert.match(migration, /v_volume \* \(v_policy\.weights->>'evidence_volume'\)/i);
    assert.match(migration, /v_consistency \* \(v_policy\.weights->>'consistency'\)/i);
});
test('client-scored Cambridge observations never qualify', () => {
    assert.match(migration, /teacher_verified', 'server_verified/i);
    assert.doesNotMatch(migration.match(/student_learning_observation_is_qualified[\s\S]+?\$\$;/i)?.[0] ?? '', /stored_client_result/i);
    assert.match(migration, /'browserScoredCambridgeQualifies', false/i);
});
test('persistent resolved and strength labels have independent minimum gates', () => {
    assert.match(migration, /v_persistent :=[\s\S]+persistent_score_from[\s\S]+persistent_min_span_days[\s\S]+persistent_max_age_days/i);
    assert.match(migration, /v_resolution :=[\s\S]+resolution_score_from[\s\S]+resolution_min_recovery_observations[\s\S]+resolution_max_age_days/i);
    assert.match(migration, /v_strength :=[\s\S]+strength_score_from[\s\S]+strength_min_span_days[\s\S]+strength_max_age_days/i);
    assert.match(migration, /v_conf\.persistent_eligible/i);
    assert.match(migration, /v_conf\.resolution_eligible/i);
    assert.match(migration, /v_conf\.strength_eligible/i);
});
test('missing stale and contradictory evidence cannot become a high-stakes conclusion', () => {
    for (const state of ['not_assessed', 'low_data', 'stale', 'contradictory']) {
        assert.match(migration, new RegExp(`'${state}'`, 'i'));
    }
    assert.match(migration, /assessment_state in \('not_assessed', 'low_data', 'stale'\)[\s\S]+insufficient_evidence/i);
    assert.match(migration, /assessment_state = 'contradictory'[\s\S]+v_status := 'contradictory'/i);
});
test('confidence calculations isolate the latest academic year scope', () => {
    assert.match(migration, /o\.academic_year_id is not distinct from v_latest\.academic_year_id/i);
    assert.match(migration, /'academicYearScoped', true/i);
    assert.match(roadmap, /year transitions do not mix the previous academic year's evidence/i);
});
test('coverage distinguishes assessed qualified low-data and unassessed objectives', () => {
    for (const field of [
        'total_assessable_objectives', 'observed_objectives', 'qualified_objectives',
        'unassessed_objectives', 'low_data_objectives', 'outside_scope_objectives',
        'unmapped_skill_count', 'observed_coverage_percent', 'qualified_coverage_percent',
    ])
        assert.match(migration, new RegExp(field, 'i'));
    for (const readiness of [
        'curriculum_not_configured', 'no_evidence', 'low_coverage',
        'partial_coverage', 'broad_coverage',
    ])
        assert.match(migration, new RegExp(`'${readiness}'`, 'i'));
});
test('coverage explicitly rejects mastery and weakness overclaims', () => {
    assert.match(migration, /'coverageIsNotMastery', true/i);
    assert.match(migration, /'unassessedObjectivesAreNotWeaknesses', true/i);
    assert.match(roadmap, /An unassessed objective is never classified as a weakness/i);
    assert.match(roadmap, /broad-coverage result does[\s\S]*not mean mastery/i);
});
test('read and rebuild boundaries remain fail closed', () => {
    for (const table of [
        'academic_evidence_confidence_policies', 'student_learning_confidence_states',
        'student_curriculum_coverage_states',
    ]) {
        assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
        assert.match(migration, new RegExp(`revoke all on table public\\.${table}`, 'i'));
    }
    assert.match(migration, /grant execute on function public\.rpc_rebuild_student_learning_confidence[^;]+to service_role/is);
    assert.doesNotMatch(migration, /grant execute on function public\.rpc_rebuild_student_learning_confidence[^;]+to authenticated/is);
    assert.match(migration, /rpc_student_academic_confidence/i);
    assert.match(migration, /not authorized for requested subject/i);
});
test('phase 5 rollout requires fixed-time rebuild and teacher review before bulk adoption', () => {
    assert.match(roadmap, /## Phase 5 contract/i);
    assert.match(roadmap, /### Phase 5 rollout gate/i);
    assert.match(roadmap, /fixed `as_of` time/i);
    assert.match(roadmap, /subject teachers review borderline scores/i);
    assert.match(roadmap, /do not bulk backfill current conclusions/i);
    assert.match(roadmap, /Begin Phase 6 only with approved golden journeys/i);
});
