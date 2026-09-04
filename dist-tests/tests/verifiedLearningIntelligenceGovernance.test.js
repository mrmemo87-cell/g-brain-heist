import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const canonicalPath = 'content/verified-question-taxonomy/bh-canonical-1.jsonl';
const legacyPath = 'content/verified-question-taxonomy/bh-production-legacy-1.jsonl';
const governanceMigrationPath = 'supabase/migrations/20260824173143_strengthen_verified_learning_intelligence.sql';
const seedMigrationPath = 'supabase/migrations/20260824173144_seed_verified_question_diagnostic_taxonomy.sql';
const profileMigrationPath = 'supabase/migrations/20260824174442_lock_academic_profile_verified_evidence.sql';
const quarantineMigrationPath = 'supabase/migrations/20260824181104_quarantine_defective_legacy_questions_and_mappings.sql';
const governanceMigration = readFileSync(governanceMigrationPath, 'utf8');
const seedMigration = readFileSync(seedMigrationPath, 'utf8');
const profileMigration = readFileSync(profileMigrationPath, 'utf8');
const quarantineMigration = readFileSync(quarantineMigrationPath, 'utf8');
const interventionWorkspace = readFileSync('components/student-progress/InterventionTargetedPracticeWorkspace.tsx', 'utf8');
const interventionService = readFileSync('services/studentInterventionService.ts', 'utf8');
const readJsonLines = (filePath) => readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
const functionBody = (source, signature) => {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `Expected function signature: ${signature}`);
    const end = source.indexOf('\n$$;', start);
    assert.ok(end > start, `Expected function terminator after: ${signature}`);
    return source.slice(start, end + 4);
};
test('reviewed canonical and legacy taxonomy artifacts have complete, disjoint authority states', () => {
    const canonical = readJsonLines(canonicalPath);
    const legacy = readJsonLines(legacyPath);
    assert.equal(canonical.length, 720);
    assert.equal(legacy.length, 958);
    assert.ok(canonical.every((row) => row.taxonomyVersion === 'bh-canonical-1'));
    assert.ok(canonical.every((row) => row.reviewStatus === 'approved'));
    assert.ok(canonical.every((row) => row.humanReview === false));
    assert.ok(canonical.every((row) => row.confidence >= 0.9));
    assert.equal(new Set(canonical.map((row) => row.externalId)).size, 720);
    assert.ok(legacy.every((row) => row.taxonomyVersion === 'bh-production-legacy-1'));
    assert.ok(legacy.every((row) => row.reviewStatus === 'in_review'));
    assert.ok(legacy.every((row) => row.humanReview === true));
    assert.ok(legacy.every((row) => typeof row.reviewReason === 'string' && row.reviewReason.length > 0));
    assert.equal(new Set(legacy.map((row) => row.sourceQuestionId)).size, 958);
    const canonicalExternalIds = new Set(canonical.map((row) => row.externalId));
    const overlappingExternalIds = legacy
        .map((row) => row.externalId)
        .filter((externalId) => externalId && canonicalExternalIds.has(externalId));
    assert.deepEqual(overlappingExternalIds, []);
    const embeddedManifest = seedMigration.match(/\$bh_verified_question_taxonomy\$\s*(\[[\s\S]*?\])\s*\$bh_verified_question_taxonomy\$::jsonb/);
    assert.ok(embeddedManifest, 'Expected an embedded canonical seed manifest');
    assert.deepEqual(JSON.parse(embeddedManifest[1]), canonical);
});
test('diagnostic taxonomy and item evidence ledger are RLS-protected, immutable, and service-readable only', () => {
    for (const table of [
        'verified_question_diagnostic_taxonomy',
        'student_learning_item_evidence',
    ]) {
        assert.match(governanceMigration, new RegExp(`alter table public\\.${table} enable row level security;`));
        assert.match(governanceMigration, new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated, service_role;`));
        assert.match(governanceMigration, new RegExp(`grant select on table public\\.${table} to service_role;`));
        assert.doesNotMatch(governanceMigration, new RegExp(`grant (insert|update|delete|all)[^;]*public\\.${table}[^;]*service_role`, 'i'));
    }
    assert.match(governanceMigration, /create trigger trg_verified_question_diagnostic_taxonomy_immutable\s+before update or delete on public\.verified_question_diagnostic_taxonomy/);
    assert.match(governanceMigration, /message = 'verified_question_diagnostic_taxonomy_is_append_only'/);
    assert.match(governanceMigration, /create trigger trg_student_learning_item_evidence_immutable\s+before update or delete on public\.student_learning_item_evidence/);
    assert.match(governanceMigration, /message = 'student_learning_item_evidence_is_append_only'/);
});
test('assignment question diagnostic snapshots are captured once and guarded before ordinary updates', () => {
    const capture = functionBody(governanceMigration, 'create or replace function private.capture_assignment_question_snapshot()');
    const guard = functionBody(governanceMigration, 'create or replace function private.guard_assignment_question_snapshot_immutability()');
    assert.match(capture, /new\.question_id = old\.question_id/);
    for (const field of [
        'question_snapshot',
        'question_content_hash',
        'content_origin_snapshot',
        'verification_status_snapshot',
        'analytics_eligible_snapshot',
        'diagnostic_taxonomy_id',
        'diagnostic_taxonomy_hash',
        'snapshotted_at',
    ]) {
        assert.match(capture, new RegExp(`new\\.${field} := old\\.${field}`));
        assert.match(guard, new RegExp(`new\\.${field}`));
        assert.match(guard, new RegExp(`old\\.${field}`));
    }
    assert.match(capture, /from private\.active_verified_question_diagnostic_taxonomy t/);
    assert.match(capture, /t\.question_content_hash = v_question\.current_content_hash/);
    assert.match(guard, /message = 'assignment_question_snapshot_is_immutable'/);
    assert.match(governanceMigration, /create trigger trg_aaa_assignment_question_snapshot_immutable\s+before update on public\.assignment_questions/);
});
test('Writing Hub contributes to official learning state only after an immutable final teacher review', () => {
    for (const trigger of [
        'trg_student_learning_capture_writing_attempt',
        'trg_student_learning_capture_writing_focus_evidence',
        'zzz_student_learning_capture_writing_strength_evidence',
    ]) {
        assert.match(governanceMigration, new RegExp(`drop trigger if exists ${trigger}`));
    }
    assert.match(governanceMigration, /create trigger trg_bh_writing_assessments_immutable\s+before update or delete on public\.bh_writing_assessments/);
    assert.match(governanceMigration, /create trigger trg_bh_writing_assessment_reviews_immutable\s+before update or delete on public\.bh_writing_assessment_reviews/);
    assert.match(governanceMigration, /revoke update, delete on table public\.bh_writing_assessments from service_role;/);
    assert.match(governanceMigration, /revoke update, delete on table public\.bh_writing_assessment_reviews from service_role;/);
    const qualifier = functionBody(governanceMigration, 'create or replace function public.student_learning_observation_is_qualified(');
    assert.match(qualifier, /when p_source_type = 'writing_attempt' then false/);
    assert.match(qualifier, /when p_source_type = 'writing_assessment_review' then/);
    assert.match(qualifier, /'teacher_final_review', 'teacher_validated_weakness'/);
    assert.match(governanceMigration, /source_type <> 'writing_attempt' or not contributes_to_focus_state/);
});
test('official assignment summaries fail closed on verified origin, grade, current hash, and practice provenance', () => {
    assert.match(governanceMigration, /drop trigger if exists trg_student_learning_capture_assignment_result\s+on public\.student_assignment_results;/);
    const compatibilityIngest = functionBody(governanceMigration, 'create or replace function public.student_learning_ingest_assignment_result(');
    assert.match(compatibilityIngest, /perform private\.ingest_verified_assignment_diagnostic_evidence\(/);
    const summaryViewStart = profileMigration.indexOf('create or replace view private.student_verified_assignment_summaries');
    const summaryViewEnd = profileMigration.indexOf('revoke all on private.student_verified_assignment_summaries', summaryViewStart);
    assert.ok(summaryViewStart >= 0 && summaryViewEnd > summaryViewStart);
    const summaryView = profileMigration.slice(summaryViewStart, summaryViewEnd);
    for (const contract of [
        /aq\.content_origin_snapshot = 'brain_heist'/,
        /aq\.verification_status_snapshot = 'verified'/,
        /aq\.analytics_eligible_snapshot/,
        /q\.content_origin = 'brain_heist'/,
        /q\.verification_status = 'verified'/,
        /q\.analytics_eligible/,
        /q\.is_public/,
        /q\.is_active/,
        /q\.current_content_hash = q\.verified_content_hash/,
        /aq\.question_content_hash = q\.verified_content_hash/,
        /from unnest\(q\.eligible_grade_levels\) eligible_grade/,
        /not exists \(\s*select 1\s*from public\.student_learning_intervention_practice_assignments practice/,
    ]) {
        assert.match(summaryView, contract);
    }
    const profile = functionBody(profileMigration, 'create or replace function public.rpc_student_academic_profile(');
    assert.match(profile, /from private\.student_verified_assignment_summaries r/);
    assert.match(profile, /public\.student_learning_observation_is_qualified\(/);
    assert.match(profile, /'targeted_practice_contributes_to_attainment', false/);
});
test('targeted practice is atomic and selects authoritative, grade-eligible question IDs', () => {
    const createPractice = functionBody(profileMigration, 'create or replace function public.rpc_create_intervention_practice_assignment(');
    const createIndex = createPractice.indexOf('from public.rpc_create_assignment(');
    const registerIndex = createPractice.indexOf('perform public.rpc_teacher_register_intervention_practice(');
    const returnIndex = createPractice.indexOf('return v_assignment;');
    assert.ok(createIndex >= 0 && registerIndex > createIndex && returnIndex > registerIndex);
    assert.match(createPractice, /'custom'::text/);
    assert.match(createPractice, /array\[p_student_id\]::uuid\[\]/);
    const questionAuthority = functionBody(profileMigration, 'create or replace function private.verified_questions_for_learning_focus(');
    for (const contract of [
        /q\.content_origin = 'brain_heist'/,
        /q\.verification_status = 'verified'/,
        /q\.analytics_eligible/,
        /q\.current_content_hash = q\.verified_content_hash/,
        /from unnest\(q\.eligible_grade_levels\) eligible_grade/,
        /'exact_question_ids'/,
        /'related_question_ids'/,
        /'recommended_question_ids'/,
    ]) {
        assert.match(questionAuthority, contract);
    }
    assert.match(interventionService, /rpc_create_intervention_practice_assignment/);
    assert.match(interventionWorkspace, /exact_question_ids/);
    assert.doesNotMatch(interventionWorkspace, /context\.recommendation\.recommended_question_ids/);
    assert.doesNotMatch(interventionWorkspace, /questionScore/);
});
test('quarantine is exact, hash-bound, and records eight retirements plus fifteen superseded mappings', () => {
    const retiredQuestionIds = [
        '0c929e4c-e42d-4269-b765-b3a3a23985c8',
        '192d0c7f-c45c-4f52-a282-483fdc9f471d',
        '3a5dfe43-f7e9-4408-92b9-72461d74a4eb',
        '3d12f655-9994-4653-a21a-e6b74401adac',
        '673a8165-b022-46d0-8211-f8adc6159ff0',
        'a17a81e3-f94f-4b94-a066-5c91dcdf4ccb',
        'e15cbaba-047a-43cb-ab15-8edf967aacc3',
        'fb24d0f9-71fa-4173-b3f9-cb25c6d84a8c',
    ];
    const supersededMappingQuestionIds = [
        '35ce05e2-275e-4f74-9967-d86564f3fe57',
        '56b12a3b-cbc4-4c74-bdb1-ebdd7d485e14',
        '575a365e-260d-44bf-84bd-4524017de1c6',
        '6f6dafcf-ec60-4398-89e4-65e43bc07c9c',
        '7b183f3c-d9b9-4948-9467-09b993f64f29',
        '7c1e779d-58d8-44ac-a525-b6dcffa04af8',
        '8b980012-c745-42ca-9a8a-9286f4d285f2',
        '9164bbd7-d44e-48a6-ad7a-c32e6645370f',
        '9ffbf10e-4e2e-43cf-943f-4020f737d124',
        'adeb580d-7625-4118-ae6f-e4068ba495ec',
        'c716beb9-7882-409f-b93e-29cbe14a94c0',
        'ccbfb6a9-bc5c-40f3-b28f-8d5846b29eaf',
        'f4ce431f-31e8-4bce-9982-4896b35b9091',
        'f55df678-3a7c-4e0b-a441-ef58c3173967',
        'f60561e3-5d2f-4704-86d2-50b3f47fd5c1',
    ];
    for (const questionId of [...retiredQuestionIds, ...supersededMappingQuestionIds]) {
        assert.equal(quarantineMigration.split(questionId).length - 1, 1, `Expected one exact governed reference for ${questionId}`);
    }
    assert.equal(new Set(retiredQuestionIds).size, 8);
    assert.equal(new Set(supersededMappingQuestionIds).size, 15);
    assert.match(quarantineMigration, /verified_question_quarantine_preflight_failed/);
    assert.match(quarantineMigration, /v_exact_count <> 8/);
    assert.match(quarantineMigration, /set verification_status = 'retired',\s+analytics_eligible = false,\s+is_public = false,\s+is_active = false/);
    assert.match(quarantineMigration, /question_content_hash,\s+event_type,\s+reason_code/);
    assert.match(quarantineMigration, /create trigger trg_verified_question_governance_events_append_only\s+before update or delete/);
    assert.match(quarantineMigration, /v_mapping_count <> 15/);
    assert.match(quarantineMigration, /v\.version_code = '2026-11'/);
    assert.match(quarantineMigration, /s\.code = 'english-grade-4'/);
    assert.match(quarantineMigration, /o\.code = 'eng4-grammar-punctuation'/);
    assert.match(quarantineMigration, /set status = 'superseded',\s+superseded_at = now\(\)/);
    assert.match(quarantineMigration, /insert into public\.curriculum_mapping_decisions/);
    assert.match(quarantineMigration, /v_superseded_count <> 15/);
});
