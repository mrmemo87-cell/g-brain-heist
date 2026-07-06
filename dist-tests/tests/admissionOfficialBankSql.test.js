import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const lockdownSql = readFileSync('supabase/migrations/20260629143000_admission_official_bank_lockdown.sql', 'utf8');
const generateSql = readFileSync('supabase/migrations/20260629143500_admission_generate_from_official_bank.sql', 'utf8');
const seedDoc = readFileSync('docs/admissions/official-bank-seed-format.md', 'utf8');
test('admission official bank migration adds locked ownership metadata', () => {
    for (const token of [
        'is_official',
        'is_locked',
        'content_owner',
        'content_version',
        'source_label',
        'placement_band',
        'estimated_seconds',
        'writing_rubric',
        'reading_passage_id',
    ]) {
        assert.match(lockdownSql, new RegExp(`\\b${token}\\b`));
    }
});
test('school admins cannot mutate official admission bank content', () => {
    assert.match(lockdownSql, /adm_q_official_select/);
    assert.match(lockdownSql, /adm_q_platform_admin_all/);
    assert.match(lockdownSql, /adm_prevent_locked_content_mutation/);
    assert.match(lockdownSql, /Official Brain Heist admission content is locked for assessment fairness/);
    assert.match(lockdownSql, /is_official = false and is_locked = false and exists/);
});
test('wizard generation SQL prefers official locked pools and falls back to legacy content', () => {
    assert.match(generateSql, /Product default: use official locked platform content first/);
    assert.match(generateSql, /is_official = true\s+AND is_locked = true/i);
    assert.match(generateSql, /Compatibility fallback for legacy\/custom pools/);
    assert.match(generateSql, /school_id = v_bp\.school_id OR school_id IS NULL/);
});
test('official bank seed format documents required diagnostic and scoring metadata', () => {
    for (const token of [
        'subject',
        'grade_level',
        'stage_level',
        'placement_band',
        'diagnostic_skill',
        'strand',
        'subskill',
        'difficulty',
        'question_type',
        'reading_passage_id',
        'options',
        'correct_answer',
        'explanation',
        'marks',
        'estimated_seconds',
        'writing_rubric',
        'content_version',
        'source_label',
    ]) {
        assert.match(seedDoc, new RegExp(`\\b${token}\\b`));
    }
});
