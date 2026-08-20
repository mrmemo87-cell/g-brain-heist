import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migrationPath = 'supabase/migrations/20260810170000_question_curriculum_mapping.sql';
const migration = readFileSync(migrationPath, 'utf8');
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');
const mappingTables = [
    'curriculum_assessment_items',
    'curriculum_mapping_batches',
    'curriculum_item_objective_mappings',
    'curriculum_mapping_decisions',
];
test('phase 3 creates a content-free source registry and reviewed mapping model', () => {
    for (const table of mappingTables) {
        assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
    }
    assert.match(migration, /question_bank.*admission_bank.*cambridge_test.*writing_prompt/s);
    assert.match(migration, /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
});
test('source registry rejects raw assessment content and preserves source identity', () => {
    for (const forbidden of ['question_text', 'stem', 'prompt', 'passage', 'options', 'correct_answer', 'explanation']) {
        assert.match(migration, new RegExp(`'${forbidden}'`, 'i'));
    }
    assert.match(migration, /raw_question_content_not_allowed_in_curriculum_registry/i);
    assert.match(migration, /curriculum_item_source_identity_is_immutable/i);
    assert.match(migration, /on conflict \(source_type, source_scope_key, source_record_id, source_item_key\)/i);
});
test('mapping identity cannot cross item subject scope objective or framework version', () => {
    assert.match(migration, /foreign key \(assessment_item_id, academic_subject_id\)/i);
    assert.match(migration, /foreign key \(curriculum_scope_id, framework_version_id, academic_subject_id\)/i);
    assert.match(migration, /foreign key \(curriculum_objective_id, framework_version_id, curriculum_scope_id\)/i);
    assert.match(migration, /curriculum_objectives_mapping_identity_unique/i);
});
test('many-to-many mappings retain one approved primary plus optional supporting roles', () => {
    assert.match(migration, /mapping_role in \('primary', 'secondary', 'prerequisite', 'extension'\)/i);
    assert.match(migration, /curriculum_item_objective_mappings_approved_uidx/i);
    assert.match(migration, /curriculum_item_objective_mappings_primary_uidx/i);
    assert.match(migration, /where status = 'approved' and mapping_role = 'primary'/i);
});
test('mapping confidence provenance and AI batch metadata are explicit', () => {
    assert.match(migration, /confidence_score numeric\(5,4\).*between 0 and 1/i);
    assert.match(migration, /mapping_method in \('manual', 'imported', 'rule_based', 'ai_assisted'\)/i);
    assert.match(migration, /model_provider.*model_name.*model_version.*prompt_version/s);
    assert.match(migration, /ai_curriculum_mapping_batch_required/i);
    assert.match(migration, /rpc_curriculum_set_mapping_batch_status/i);
    assert.match(migration, /mapping_batch_has_open_reviews/i);
    assert.match(migration, /length\(trim\(rationale\)\) between 10 and 2000/i);
});
test('approval is human reviewed four-eyes and confidence gated', () => {
    assert.match(migration, /status in \('suggested', 'in_review', 'approved', 'rejected', 'superseded'\)/i);
    assert.match(migration, /confidence_score >= 0\.7000/i);
    assert.match(migration, /approved_by <> proposed_by/i);
    assert.match(migration, /mapping_proposer_cannot_approve/i);
    assert.match(migration, /curriculum_mapping_reviewer_access_required/i);
});
test('approved mappings are immutable and corrections preserve supersession history', () => {
    assert.match(migration, /approved_curriculum_mapping_is_immutable/i);
    assert.match(migration, /curriculum_mapping_history_is_append_only/i);
    assert.match(migration, /supersedes_mapping_id/i);
    assert.match(migration, /decision in \('submitted', 'review_started', 'approved', 'rejected', 'superseded'\)/i);
    assert.match(migration, /curriculum_mapping_decisions_are_append_only/i);
});
test('stale item or curriculum hashes are excluded from evidence resolution', () => {
    assert.match(migration, /curriculum_mapping_item_hash_is_stale/i);
    assert.match(migration, /curriculum_mapping_version_hash_is_stale/i);
    assert.match(migration, /rpc_curriculum_resolve_item_objectives/i);
    assert.match(migration, /m\.item_content_hash = i\.content_hash/i);
    assert.match(migration, /m\.curriculum_version_content_hash = v\.content_hash/i);
    assert.match(migration, /m\.status = 'approved'/i);
});
test('school coverage discloses mapping readiness and missing data', () => {
    assert.match(migration, /rpc_school_curriculum_mapping_coverage/i);
    for (const field of [
        'totalItems', 'mappedItems', 'unmappedItems', 'staleItems', 'itemsMissingGrade',
        'mappedPercent', 'assessableObjectives', 'coveredObjectives', 'objectiveCoveragePercent',
        'suggestedMappings', 'mappingsInReview',
    ]) {
        assert.match(migration, new RegExp(`'${field}'`, 'i'));
    }
    assert.match(migration, /'no_registered_items'/i);
    assert.match(migration, /active_school_membership_required/i);
});
test('tables are RLS protected direct browser writes stay closed and roadmap defines rollout', () => {
    for (const table of mappingTables) {
        assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
        assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, 'i'));
        assert.doesNotMatch(migration, new RegExp(`grant (?:insert|update|delete|all)[^;]*public\\.${table}[^;]*to authenticated`, 'i'));
    }
    assert.match(roadmap, /## Phase 3 contract/i);
    assert.match(roadmap, /Suggestions must never auto-approve/i);
    assert.match(roadmap, /Begin Phase 4 Cambridge evidence adaptation only when/i);
});
