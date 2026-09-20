import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const compatibility = readFileSync('supabase/migrations/20260901033233_20260901092500_verified_importer_global_pool_compatibility.sql', 'utf8');
const supplement = readFileSync('supabase/migrations/20260901093000_add_grade4_future_tense_verified_supplement.sql', 'utf8');
const taxonomy = readFileSync('supabase/migrations/20260901093500_add_grade4_future_tense_diagnostic_taxonomy.sql', 'utf8');
const externalIds = Array.from(supplement.matchAll(/"externalId": "(bh-g4-eng-future-2026\.12-\d{3})"/g), (match) => match[1]);
const atomicSubskills = Array.from(taxonomy.matchAll(/'english\.future-tense\.([a-z0-9-]+)'/g), (match) => match[1]);
test('verified package importer remains compatible with the current authority model', () => {
    assert.match(compatibility, /v_service boolean/);
    assert.match(compatibility, /new\.content_origin = 'brain_heist'/);
    assert.match(compatibility, /new\.verification_status in \('verified', 'retired'\)/);
    assert.match(compatibility, /new\.pool_scope = 'teacher'/);
    assert.match(compatibility, /new\.owner_school_id is null/);
    assert.match(compatibility, /new\.pool_scope := 'global'/);
    assert.match(compatibility, /before insert on public\.questions/i);
    assert.doesNotMatch(compatibility, /drop constraint/i);
});
test('Grade 4 Future Tense supplement is versioned instead of mutating the immutable core release', () => {
    assert.match(supplement, /brain-heist-grade-4-future-tense-2026-12/);
    assert.match(supplement, /"packageVersion": "2026\.12\.0"/);
    assert.match(supplement, /"versionCode": "2026-11"/);
    assert.match(supplement, /rpc_import_verified_question_package\(v_package, false\)/);
    assert.doesNotMatch(supplement, /update\s+public\.questions/i);
    assert.doesNotMatch(supplement, /delete\s+from\s+public\.questions/i);
});
test('supplement contains exactly six focused Grade 4 Future Tense questions', () => {
    assert.deepEqual(externalIds, [
        'bh-g4-eng-future-2026.12-001',
        'bh-g4-eng-future-2026.12-002',
        'bh-g4-eng-future-2026.12-003',
        'bh-g4-eng-future-2026.12-004',
        'bh-g4-eng-future-2026.12-005',
        'bh-g4-eng-future-2026.12-006',
    ]);
    assert.equal((supplement.match(/"grade": 4/g) ?? []).length, 6);
    assert.equal((supplement.match(/"topic": "Future Tense"/g) ?? []).length, 6);
    assert.equal((supplement.match(/"skill": "Future Tense"/g) ?? []).length, 6);
    assert.equal((supplement.match(/"scopeCode": "english-grade-4"/g) ?? []).length, 6);
    assert.equal((supplement.match(/"objectiveCode": "eng4-grammar-punctuation"/g) ?? []).length, 6);
});
test('question set covers distinct future-tense remediation performances', () => {
    for (const phrase of [
        'Recognise future tense',
        'Form affirmative future tense',
        'Use the base verb after will',
        'Form negative future tense',
        'Form future-tense questions',
        'Choose future tense from context',
    ]) {
        assert.ok(supplement.includes(phrase), `Expected Future Tense supplement to cover: ${phrase}`);
    }
    assert.deepEqual(new Set(atomicSubskills), new Set([
        'identify-a-future-action-marked-by-will',
        'form-affirmative-will-plus-base-verb',
        'use-base-verb-after-will',
        'form-negative-will-not-plus-base-verb',
        'form-question-will-subject-base-verb',
        'select-future-form-from-time-context',
    ]));
});
test('supplement is governed as exact Future Tense evidence with canonical taxonomy hashing', () => {
    assert.match(taxonomy, /'english\.future-tense', 'Future Tense'/);
    assert.match(taxonomy, /'bh-canonical-1'/);
    assert.match(taxonomy, /'approved', false/);
    assert.match(taxonomy, /0\.980/);
    assert.match(taxonomy, /private\.active_verified_question_diagnostic_taxonomy/);
    assert.match(taxonomy, /taxonomy\.primary_skill_code = 'english\.future-tense'/);
    assert.match(taxonomy, /taxonomy\.primary_skill_name = 'Future Tense'/);
    assert.doesNotMatch(taxonomy, /taxonomy_hash\s*\)/);
    assert.doesNotMatch(taxonomy, /extensions\.digest/);
});
test('supplement fails closed on importer, verified-pool, mapping, or taxonomy drift', () => {
    assert.match(supplement, /grade4_future_tense_verified_import_failed/);
    assert.match(supplement, /grade4_future_tense_verified_question_integrity_failed/);
    assert.match(taxonomy, /into strict v_item_id, v_mapping_id/);
    assert.match(taxonomy, /grade4_future_tense_taxonomy_identity_conflict/);
    assert.match(taxonomy, /grade4_future_tense_active_taxonomy_integrity_failed/);
    assert.match(supplement, /q\.current_content_hash = q\.verified_content_hash/);
});
