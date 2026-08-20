import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const migration = fs.readFileSync('supabase/migrations/20260707170000_admission_unique_question_dedupe.sql', 'utf8');
const inspection = fs.readFileSync('supabase/inspection/admission_duplicate_question_inspection.sql', 'utf8');
const cleanupInspection = fs.readFileSync('supabase/inspection/admission_legacy_official_bank_cleanup_inspection.sql', 'utf8');
test('normalizes admission stems for duplicate checks', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import { normalizeAdmissionQuestionStem } from './scripts/validate-admission-official-bank.mjs'; console.log(normalizeAdmissionQuestionStem('  Investigation 4: “Which change is usually reversible?”  '));`], { encoding: 'utf8' }).trim();
    assert.equal(output, 'which change is usually reversible');
});
test('official bank validator hard-fails duplicate normalized stems under different external ids', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'adm-bank-dupe-'));
    cpSync('supabase/seed/admission-official-bank/shared', path.join(root, 'shared'), { recursive: true });
    mkdirSync(path.join(root, 'english'), { recursive: true });
    mkdirSync(path.join(root, 'maths'), { recursive: true });
    mkdirSync(path.join(root, 'science'), { recursive: true });
    for (const subject of ['maths', 'science'])
        writeFileSync(path.join(root, subject, 'grade_5.json'), JSON.stringify({ pools: [], questions: [] }));
    writeFileSync(path.join(root, 'english', 'grade_5.json'), JSON.stringify({
        pools: [{ external_id: 'pool', subject: 'english', grade_level: 5, stage_level: 'primary', placement_band: 'target', name: 'Pool', content_version: 'test', source_label: 'Brains Heist Official Admission Bank', is_official: true, is_locked: true, content_owner: 'brain_heist' }],
        questions: [1, 2].map((n) => ({ external_id: `q${n}`, pool_external_id: 'pool', subject: 'english', grade_level: 5, stage_level: 'primary', placement_band: 'target', diagnostic_skill: 'Grammar', strand: 'grammar', subskill: 'sentence control', difficulty: 'medium', question_type: 'mcq', prompt: n === 1 ? 'Question 1: Choose the correctly punctuated sentence.' : 'Choose the correctly punctuated sentence!', explanation: 'Because it is correct.', marks: 1, estimated_seconds: 60, content_version: 'test', source_label: 'Brains Heist Official Admission Bank', is_official: true, is_locked: true, content_owner: 'brain_heist', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' })),
    }));
    let output = '';
    assert.throws(() => {
        execFileSync(process.execPath, ['scripts/validate-admission-official-bank.mjs', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    }, (error) => {
        output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
        return true;
    });
    assert.match(output, /duplicates normalized prompt/);
});
test('admission generation migration enforces question id and normalized stem uniqueness', () => {
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS adm_test_form_questions_form_question_uidx/);
    assert.match(migration, /ON adm_test_form_questions\(form_id, question_id\)/);
    assert.match(migration, /adm_normalize_question_stem/);
    assert.match(migration, /normalized_stem text UNIQUE/);
    assert.match(migration, /Not enough unique official questions available for this grade\/subject\/test blueprint\./);
    assert.match(migration, /NOT EXISTS[\s\S]*s\.question_id = q\.id OR s\.normalized_stem = adm_normalize_question_stem\(q\.stem\)/);
    assert.match(migration, /q\.external_id IS NOT NULL/);
    assert.match(migration, /COALESCE\(q\.content_version, qp\.content_version\) <> 'legacy-import'/);
    assert.match(migration, /COALESCE\(q\.content_version, qp\.content_version\) LIKE 'adm-bank-v1-g%'/);
    assert.match(migration, /COALESCE\(q\.content_owner, qp\.content_owner\) = 'brain_heist'/);
});
test('duplicate inspection SQL reports generated forms, current official bank duplicates, and legacy rows separately', () => {
    assert.match(inspection, /duplicate_question_id_per_form/);
    assert.match(inspection, /generated_form_duplicate_normalized_stem/);
    assert.match(inspection, /current_official_bank_duplicate_normalized_stem/);
    assert.match(inspection, /legacy_official_bank_missing_external_id_or_unmanaged/);
    assert.match(inspection, /form_code/);
    assert.match(inspection, /external_ids/);
    assert.match(inspection, /content_versions/);
    assert.match(inspection, /stem_previews/);
});
test('current official bank duplicate branch ignores legacy import and unmanaged Grade 7/8 rows', () => {
    const branch = inspection.slice(inspection.indexOf('current_official_bank_stem_duplicates AS'), inspection.indexOf('legacy_official_bank_missing_external_id_or_unmanaged AS'));
    assert.match(branch, /SELECT form_code, grade, subject, form_id, normalized_stem AS duplicate_key, COUNT\(\*\) AS duplicate_count/);
    assert.match(branch, /GROUP BY form_code, grade, subject, form_id, question_type, strand, subskill, normalized_stem/);
    const scope = inspection.slice(inspection.indexOf('current_official_bank_questions AS'), inspection.indexOf('current_official_bank_stem_duplicates AS'));
    assert.match(scope, /q\.external_id IS NOT NULL/);
    assert.match(scope, /coalesce\(q\.content_version, qp\.content_version\) <> 'legacy-import'/);
    assert.match(scope, /LIKE 'adm-bank-v1-g5-%'/);
    assert.match(scope, /LIKE 'adm-bank-v1-g6-%'/);
    assert.match(scope, /LIKE 'adm-bank-v1-g7-%'/);
    assert.doesNotMatch(scope, /adm-bank-v1-g8-%/);
});
test('legacy cleanup inspection reports references and archive safety without deleting rows', () => {
    assert.match(cleanupInspection, /referenced_form_count/);
    assert.match(cleanupInspection, /referenced_attempt_count/);
    assert.match(cleanupInspection, /can_archive/);
    assert.match(cleanupInspection, /legacy-import/);
    assert.doesNotMatch(cleanupInspection, /DELETE FROM/i);
});
test('duplicate blocker SQL uses the deployed admission schema columns', () => {
    const blockerSql = `${migration}\n${inspection}`;
    for (const badReference of [
        ['q', 'prompt'].join('.'),
        ['q', 'subject'].join('.'),
        ['adm_questions', 'prompt'].join('.'),
        ['adm_questions', 'subject'].join('.'),
    ]) {
        assert.equal(blockerSql.includes(badReference), false, `${badReference} should not appear in duplicate blocker SQL`);
    }
    for (const requiredReference of [
        ['q', 'stem'].join('.'),
        ['qp', 'subject'].join('.'),
        ['b', 'subject'].join('.'),
        ['q', 'grade_level'].join('.'),
        ['qp', 'grade_level'].join('.'),
        ['b', 'target_grade'].join('.'),
    ]) {
        assert.equal(blockerSql.includes(requiredReference), true, `${requiredReference} should appear in duplicate blocker SQL`);
    }
});
