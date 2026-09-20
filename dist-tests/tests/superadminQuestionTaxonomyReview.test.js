import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260825120000_superadmin_question_taxonomy_review_queue.sql', 'utf8');
const service = readFileSync('services/adminQuestionBankService.ts', 'utf8');
const queue = readFileSync('components/admin/tabs/QuestionTaxonomyReviewQueue.tsx', 'utf8');
const inspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');
test('taxonomy proposals, batches and human decisions are immutable and unavailable as raw browser tables', () => {
    for (const table of [
        'question_taxonomy_review_batches',
        'question_taxonomy_review_queue',
        'question_taxonomy_review_decisions',
    ]) {
        assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'));
        assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
        assert.match(migration, new RegExp(`revoke all on table public\\.${table}[\\s\\S]+?from public, anon, authenticated, service_role`, 'i'));
    }
    assert.match(migration, /question_taxonomy_review_records_are_append_only/i);
    assert.match(migration, /before update or delete on public\.question_taxonomy_review_batches/i);
    assert.match(migration, /before update or delete on public\.question_taxonomy_review_queue/i);
    assert.match(migration, /before update or delete on public\.question_taxonomy_review_decisions/i);
    assert.doesNotMatch(service, /\.from\(['"]question_taxonomy_review_(?:batches|queue|decisions)['"]\)/i);
});
test('service import is atomic, checksum-bound, lifecycle-aware and preserves mapping drift for human review', () => {
    assert.match(migration, /create or replace function public\.rpc_import_verified_question_taxonomy_review_batch\(\s*p_batch jsonb/i);
    assert.match(migration, /coalesce\(auth\.jwt\(\) ->> 'role', ''\) <> 'service_role'/i);
    assert.match(migration, /grant execute on function public\.rpc_import_verified_question_taxonomy_review_batch\(jsonb\)\s+to service_role/i);
    assert.match(migration, /expected_in_review integer not null/i);
    assert.match(migration, /v_existing\.imported_count <> v_existing_queue_count/i);
    assert.match(migration, /v_existing\.batch_checksum <> v_batch_checksum/i);
    assert.match(migration, /v_existing\.source_file_sha256 <> v_source_file_sha256/i);
    assert.match(migration, /m\.status in \('approved', 'superseded'\)/i);
    assert.match(migration, /framework_version_code text not null/i);
    assert.match(migration, /f\.code = public\.curriculum_normalize_code\(v_payload ->> 'frameworkCode'\)/i);
    assert.match(migration, /fv\.version_code = public\.curriculum_normalize_code\(v_payload ->> 'frameworkVersionCode'\)/i);
    assert.match(migration, /jsonb_array_elements\(v_payload -> 'governedMappings'\)/i);
    assert.match(migration, /mapping_drift boolean not null default false/i);
    assert.match(migration, /question_taxonomy_review_queue_assessment_item_idx[\s\S]+assessment_item_id/i);
    assert.match(migration, /invalid_taxonomy_secondary_skill_codes/i);
    assert.match(migration, /current_mapping\.status = 'approved'/i);
    assert.match(migration, /'inserted', v_imported/i);
    assert.match(migration, /'existing', v_existing\.imported_count/i);
});
test('taxonomy queue is a fail-closed keyset-paginated superadmin API with full question evidence', () => {
    assert.match(migration, /create or replace function public\.rpc_superadmin_question_taxonomy_review_queue/i);
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /auth\.uid\(\) is null or not public\.is_superadmin\(auth\.uid\(\)\)/i);
    assert.match(migration, /platform_superadmin_access_required/i);
    assert.match(migration, /\(b\.created_at, b\.id\) > \(p_after_created_at, p_after_id\)/i);
    assert.match(migration, /limit v_limit \+ 1/i);
    for (const field of [
        'questionText',
        'correctAnswer',
        'explanation',
        'objectiveStatement',
        'frameworkCode',
        'frameworkVersionCode',
        'primarySkillName',
        'atomicSubskillName',
        'assessmentProcessCode',
        'cognitiveProcess',
        'evidenceStatement',
        'confidenceScore',
        'reviewReason',
        'mappingDrift',
        'hasActiveTaxonomy',
        'proposalPrimaryCurrent',
        'exactApprovalEligible',
        'objectiveOptions',
        'decisionHistory',
    ])
        assert.match(migration, new RegExp(`'${field}'`, 'i'));
});
test('return is nonterminal while approved, retired and superseded decisions remain final', () => {
    assert.match(migration, /previous_decision_id uuid unique/i);
    assert.doesNotMatch(migration, /review_item_id uuid not null unique/i);
    assert.match(migration, /order by d\.created_at desc, d\.id desc\s+limit 1/i);
    assert.match(migration, /if v_previous_decision in \('approve', 'retire', 'supersede'\) then/i);
    assert.match(migration, /if v_previous_decision = 'return' and v_decision = 'return' then/i);
    assert.match(migration, /previousDecisionId/i);
    assert.match(migration, /left join lateral/i);
});
test('human decisions append taxonomy revisions and never mutate the immutable taxonomy table', () => {
    assert.match(migration, /create or replace function public\.rpc_superadmin_decide_question_taxonomy_review/i);
    assert.match(migration, /v_decision not in \('approve', 'return', 'retire', 'supersede'\)/i);
    assert.match(migration, /length\(v_rationale\) not between 20 and 2000/i);
    assert.match(migration, /m\.status = 'approved'[\s\S]+m\.mapping_role = 'primary'[\s\S]+m\.superseded_at is null/i);
    assert.match(migration, /insert into public\.verified_question_diagnostic_taxonomy/i);
    assert.match(migration, /greatest\(v_item\.confidence_score, 0\.900\)/i);
    assert.match(migration, /v_question\.verification_status <> 'verified'/i);
    assert.match(migration, /proposal_primary_current/i);
    assert.match(migration, /not b\.has_active_taxonomy/i);
    assert.match(migration, /row\(v_active\.curriculum_mapping_id, v_active\.primary_skill_code/i);
    assert.match(migration, /proposed_current_version\.version_code = r\.framework_version_code/i);
    assert.match(migration, /fv\.content_hash = m\.curriculum_version_content_hash/i);
    assert.doesNotMatch(migration, /update\s+public\.verified_question_diagnostic_taxonomy/i);
    assert.doesNotMatch(migration, /delete\s+from\s+public\.verified_question_diagnostic_taxonomy/i);
    assert.match(migration, /successor\.review_status in \('approved', 'retired'\)/i);
});
test('Question Bank keeps the source vault separate from the professional taxonomy decision workspace', () => {
    assert.match(inspector, /QuestionTaxonomyReviewQueue/);
    assert.match(inspector, /Open taxonomy review/);
    assert.match(inspector, /Source content locked/);
    assert.match(inspector, /taxonomy decisions are append-only/);
    assert.match(queue, /Taxonomy Review Queue/);
    assert.match(queue, /Source question/);
    assert.match(queue, /Proposed diagnostic taxonomy/);
    assert.match(queue, /Curriculum objective/);
    assert.match(queue, /item\.proposal\.frameworkVersionCode/);
    assert.match(queue, /Primary skill/);
    assert.match(queue, /Atomic subskill/);
    assert.match(queue, /Assessment objective/);
    assert.match(queue, /Cognitive process/);
    assert.match(queue, /Evidence statement/);
    assert.match(queue, /Approve exact/);
    assert.match(queue, /Return for correction/);
    assert.match(queue, /Retire classification/);
    assert.match(queue, /Supersede with corrections/);
    assert.match(queue, /Decision history/);
    assert.match(queue, /item\.exactApprovalEligible/);
    assert.match(queue, /item\.objectiveOptions\[0\]\?\.curriculumMappingId/);
});
test('frontend reads and decides only through dedicated superadmin RPCs', () => {
    assert.match(service, /supabase\.rpc\('rpc_superadmin_question_taxonomy_review_queue'/);
    assert.match(service, /supabase\.rpc\('rpc_superadmin_decide_question_taxonomy_review'/);
    assert.match(service, /p_after_created_at: query\.cursor\?\.createdAt \|\| null/);
    assert.match(service, /p_replacement: input\.decision === 'supersede'/);
    assert.match(service, /Another reviewer has already completed this item/);
    assert.match(service, /Secondary skill codes must be unique governed dotted codes/i);
});
test('optional chunked import transport is private, bounded and finalized transactionally', () => {
    assert.match(migration, /create table if not exists private\.question_taxonomy_review_staging_manifests/i);
    assert.match(migration, /create table if not exists private\.question_taxonomy_review_staging_chunks/i);
    assert.match(migration, /before update or delete on private\.question_taxonomy_review_staging_manifests/i);
    assert.match(migration, /before update or delete on private\.question_taxonomy_review_staging_chunks/i);
    assert.match(migration, /rpc_stage_verified_question_taxonomy_review_manifest/i);
    assert.match(migration, /rpc_stage_verified_question_taxonomy_review_chunk/i);
    assert.match(migration, /rpc_finalize_verified_question_taxonomy_review_batch/i);
    assert.match(migration, /v_proposal_count not between 1 and 100/i);
    assert.match(migration, /octet_length\(p_proposals::text\) > 512000/i);
    assert.match(migration, /v_min_chunk <> 0/i);
    assert.match(migration, /v_max_chunk <> v_manifest\.total_chunks - 1/i);
    assert.match(migration, /v_result := public\.rpc_import_verified_question_taxonomy_review_batch\(v_batch\)/i);
});
