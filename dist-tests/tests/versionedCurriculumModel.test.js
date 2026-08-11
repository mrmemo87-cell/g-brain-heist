import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migrationPath = 'supabase/migrations/20260810154210_versioned_curriculum_model.sql';
const migration = readFileSync(migrationPath, 'utf8');
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');
const curriculumTables = [
    'curriculum_frameworks',
    'curriculum_framework_versions',
    'curriculum_framework_subjects',
    'curriculum_stages',
    'curriculum_scopes',
    'curriculum_nodes',
    'curriculum_objectives',
    'curriculum_objective_prerequisites',
    'school_curriculum_scope_mappings',
];
test('phase 2 creates the complete governed curriculum model without importing content', () => {
    for (const table of curriculumTables) {
        assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    }
    assert.doesNotMatch(migration, /insert\s+into\s+public\.curriculum_(frameworks|framework_versions|framework_subjects|stages|scopes|nodes|objectives)\b/i);
    assert.match(migration, /intentionally contains no third-party curriculum content/i);
});
test('framework identity supports global and school-owned curricula without cross-school drift', () => {
    assert.match(migration, /visibility in \('global', 'school'\)/i);
    assert.match(migration, /visibility = 'global' and school_id is null/i);
    assert.match(migration, /visibility = 'school' and school_id is not null/i);
    assert.match(migration, /curriculum_frameworks_global_code_uidx/i);
    assert.match(migration, /curriculum_frameworks_school_code_uidx/i);
    assert.match(migration, /published_curriculum_framework_identity_is_immutable/i);
});
test('version lifecycle requires review provenance and immutable published content', () => {
    assert.match(migration, /'draft', 'in_review', 'approved', 'published', 'retired'/i);
    assert.match(migration, /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
    assert.match(migration, /invalid_curriculum_version_transition/i);
    assert.match(migration, /curriculum_reviewer_required/i);
    assert.match(migration, /curriculum_approver_required/i);
    assert.match(migration, /published_curriculum_version_is_immutable/i);
    assert.match(migration, /curriculum_version_content_locked/i);
    assert.match(migration, /rpc_curriculum_publish_version/i);
    assert.match(migration, /scopesWithoutObjectives/i);
});
test('subjects stages and scopes remain inside one framework version', () => {
    assert.match(migration, /foreign key \(framework_subject_id, framework_version_id\)/i);
    assert.match(migration, /foreign key \(stage_id, framework_version_id\)/i);
    assert.match(migration, /references public\.curriculum_framework_subjects\(id, framework_version_id\)/i);
    assert.match(migration, /references public\.curriculum_stages\(id, framework_version_id\)/i);
    assert.match(migration, /curriculum_scope_subject_mismatch/i);
    assert.match(migration, /curriculum_scopes_subject_stage_idx/i);
});
test('typed hierarchy is ordered flexible and cycle safe', () => {
    assert.match(migration, /node_type in \('strand', 'topic', 'skill', 'subskill'\)/i);
    assert.match(migration, /curriculum_root_node_must_be_strand/i);
    assert.match(migration, /v_child_rank <= v_parent_rank/i);
    assert.match(migration, /curriculum_node_type_order_invalid/i);
    assert.match(migration, /with recursive descendants/i);
    assert.match(migration, /curriculum_node_cycle_detected/i);
    assert.match(migration, /new\.depth := v_parent\.depth \+ 1/i);
});
test('objectives are assessable traceable and prerequisite links cannot cross versions', () => {
    for (const field of [
        'statement',
        'objective_type',
        'cognitive_level',
        'is_assessable',
        'command_terms',
        'tags',
        'source_reference',
        'source_uri',
    ]) {
        assert.match(migration, new RegExp(field, 'i'));
    }
    assert.match(migration, /foreign key \(objective_id, framework_version_id\)/i);
    assert.match(migration, /foreign key \(prerequisite_objective_id, framework_version_id\)/i);
    assert.match(migration, /objective_id <> prerequisite_objective_id/i);
    assert.match(migration, /curriculum_objectives_version_idx/i);
});
test('school mappings bind year grade subject and published curriculum scope', () => {
    assert.match(migration, /foreign key \(academic_year_id, school_id\)/i);
    assert.match(migration, /foreign key \(curriculum_scope_id, academic_subject_id\)/i);
    assert.match(migration, /school_curriculum_scope_mappings_current_uidx/i);
    assert.match(migration, /where status in \('planned', 'active'\)/i);
    assert.match(migration, /school_mapping_requires_published_curriculum/i);
    assert.match(migration, /school_curriculum_framework_access_denied/i);
    assert.match(migration, /mapping_quality in \('confirmed', 'estimated'\)/i);
    assert.match(migration, /school_curriculum_scope_mappings_year_idx/i);
    assert.match(migration, /school_curriculum_scope_mappings_subject_idx/i);
});
test('school APIs separate administration from membership-scoped reading', () => {
    for (const rpc of [
        'rpc_school_admin_set_curriculum_scope_mapping',
        'rpc_school_admin_archive_curriculum_scope_mapping',
        'rpc_school_curriculum_catalog',
        'rpc_school_curriculum_scope_detail',
    ]) {
        assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
        assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}`, 'i'));
    }
    assert.match(migration, /school_administrator_access_required/i);
    assert.match(migration, /active_school_membership_required/i);
    assert.match(migration, /sm\.school_id = p_school_id[\s\S]*sm\.user_id = auth\.uid\(\)[\s\S]*sm\.status = 'active'/i);
});
test('all curriculum tables are RLS protected and browser writes stay closed', () => {
    for (const table of curriculumTables) {
        assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
        assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
        assert.doesNotMatch(migration, new RegExp(`grant (?:insert|update|delete|all)[^;]*public\\.${table}[^;]*to authenticated`, 'i'));
    }
});
test('roadmap documents the lifecycle rollout gate and Phase 3 boundary', () => {
    assert.match(roadmap, /## Phase 2 contract/i);
    assert.match(roadmap, /draft → in_review → approved → published → retired/i);
    assert.match(roadmap, /published curriculum[\s\n]+version is immutable/i);
    assert.match(roadmap, /Repeat the same governed process for Mathematics and Science/i);
    assert.match(roadmap, /before Phase 3 question[\s\n]+mapping begins/i);
});
