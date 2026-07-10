import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const lockdownSql = readFileSync('supabase/migrations/20260629143000_admission_official_bank_lockdown.sql', 'utf8');
const generateSql = readFileSync('supabase/migrations/20260629143500_admission_generate_from_official_bank.sql', 'utf8');
const seedDoc = readFileSync('docs/admissions/official-bank-seed-format.md', 'utf8');
const legacyArchiveSql = readFileSync('supabase/migrations/20260707180000_admission_archive_unreferenced_legacy_official_bank.sql', 'utf8');
const legacyInspectionSql = readFileSync('supabase/inspection/admission_legacy_official_bank_cleanup_inspection.sql', 'utf8');
const generatedFormOptionQualityInspectionSql = readFileSync('supabase/inspection/admission_generated_form_option_quality_inspection.sql', 'utf8');

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


test('legacy official-bank archive migration only targets unreferenced legacy-import Brain Heist rows', () => {
  assert.match(legacyArchiveSql, /coalesce\(q\.content_version, qp\.content_version\) = 'legacy-import'/);
  assert.match(legacyArchiveSql, /q\.external_id IS NULL/);
  assert.match(legacyArchiveSql, /coalesce\(q\.content_owner, qp\.content_owner\) = 'brain_heist'/);
  assert.match(legacyArchiveSql, /referenced_form_count = 0/);
  assert.match(legacyArchiveSql, /referenced_attempt_count = 0/);
  assert.match(legacyArchiveSql, /status = 'archived'/);
  assert.match(legacyArchiveSql, /is_official = false/);
  assert.match(legacyArchiveSql, /is_locked = true/);
});

test('legacy official-bank archive migration preserves referenced Grade 6 history and deletes nothing', () => {
  assert.match(legacyArchiveSql, /Referenced legacy history \(for example Grade 6 English legacy-import\) remains untouched/);
  assert.match(legacyArchiveSql, /adm_test_form_questions fq ON fq\.question_id = lq\.id/);
  assert.match(legacyArchiveSql, /adm_attempts a ON a\.form_id = fq\.form_id/);
  assert.match(legacyArchiveSql, /Unsafe admission legacy archive candidate set/);
  assert.doesNotMatch(legacyArchiveSql, /DELETE\s+FROM\s+public\.adm_questions/i);
  assert.doesNotMatch(legacyArchiveSql, /DELETE\s+FROM\s+public\.adm_test_forms/i);
  assert.doesNotMatch(legacyArchiveSql, /DELETE\s+FROM\s+public\.adm_test_form_questions/i);
  assert.doesNotMatch(legacyArchiveSql, /DELETE\s+FROM\s+public\.adm_attempts/i);
});

test('legacy official-bank archive migration deactivates only fully safe pools', () => {
  assert.match(legacyArchiveSql, /adm_legacy_safe_pools/);
  assert.match(legacyArchiveSql, /NOT EXISTS \(\s*SELECT 1\s*FROM public\.adm_questions q\s*WHERE q\.pool_id = qp\.id\s*AND NOT EXISTS/s);
  assert.match(legacyArchiveSql, /SET is_active = false,\s*is_official = false/s);
});

test('generation excludes archived and de-officialized legacy questions', () => {
  assert.match(generateSql, /is_official = true\s+AND is_locked = true\s+AND is_active = true/i);
  assert.match(generateSql, /AND status = 'published'/);
  assert.doesNotMatch(generateSql, /status\s+IN\s*\([^)]*archived/i);
});

test('legacy inspection reports archived legacy separately from active unmanaged blockers', () => {
  assert.match(legacyInspectionSql, /archived_legacy_question_count/);
  assert.match(legacyInspectionSql, /active_unmanaged_question_count/);
  assert.match(legacyInspectionSql, /referenced_form_count/);
  assert.match(legacyInspectionSql, /referenced_attempt_count/);
});

test('generated form option-quality inspection uses deployed Admission question schema', () => {
  assert.doesNotMatch(generatedFormOptionQualityInspectionSql, /\bq\.prompt\b/);
  assert.doesNotMatch(generatedFormOptionQualityInspectionSql, /\bq\.subject\b/);
  assert.doesNotMatch(generatedFormOptionQualityInspectionSql, /\badm_questions\.prompt\b/);
  assert.doesNotMatch(generatedFormOptionQualityInspectionSql, /\badm_questions\.subject\b/);
  assert.match(generatedFormOptionQualityInspectionSql, /\bq\.stem\b/);

  if (/\bsubject\b/i.test(generatedFormOptionQualityInspectionSql)) {
    assert.match(generatedFormOptionQualityInspectionSql, /\bqp\.subject\b/);
  }
});

const distinctStemGenerateSql = readFileSync('supabase/migrations/20260708143000_admission_generation_distinct_stem_debug.sql', 'utf8');

test('generation dedupes stems before insert and returns debug reason on invalid availability', () => {
  assert.match(distinctStemGenerateSql, /SELECT DISTINCT ON \(adm_normalize_question_stem\(q\.stem\)\)/);
  assert.match(distinctStemGenerateSql, /Not enough unique questions after dedupe/);
  assert.match(distinctStemGenerateSql, /q\.is_official = true AND q\.is_locked = true/);
  assert.match(distinctStemGenerateSql, /qp\.is_official = true AND qp\.is_locked = true/);
  assert.match(distinctStemGenerateSql, /q\.external_id IS NOT NULL AND qp\.external_id IS NOT NULL/);
  assert.match(distinctStemGenerateSql, /content_version\) <> 'legacy-import'/);
  assert.match(distinctStemGenerateSql, /Duplicate question_order conflict/);
});

const uniqueSubskillGenerateSql = readFileSync('supabase/migrations/20260710120000_admission_generate_unique_subskill_first.sql', 'utf8');

test('admission generation uses unique-subskill first pass with controlled shortage fallback', () => {
  assert.match(uniqueSubskillGenerateSql, /First pass: only select candidates whose canonical subskill has not already/);
  assert.match(uniqueSubskillGenerateSql, /OR s\.subskill = COALESCE\(NULLIF\(q\.subskill, ''\), NULLIF\(q\.diagnostic_skill, ''\), NULLIF\(q\.topic, ''\), adm_normalize_question_stem\(q\.stem\)\)/);
  assert.match(uniqueSubskillGenerateSql, /v_remaining_count := v_diff_count - v_first_pass_count/);
  assert.match(uniqueSubskillGenerateSql, /IF v_remaining_count > 0 THEN/);
  assert.match(uniqueSubskillGenerateSql, /Second pass: fallback only for shortages after the unique-subskill pass/);
});

test('unique-subskill generation preserves existing uniqueness, filters, and interleaved ordering', () => {
  assert.match(uniqueSubskillGenerateSql, /question_id uuid PRIMARY KEY/);
  assert.match(uniqueSubskillGenerateSql, /normalized_stem text UNIQUE/);
  assert.match(uniqueSubskillGenerateSql, /s\.question_id = q\.id\s+OR s\.normalized_stem = adm_normalize_question_stem\(q\.stem\)/);
  assert.match(uniqueSubskillGenerateSql, /q\.is_official = true AND q\.is_locked = true/);
  assert.match(uniqueSubskillGenerateSql, /qp\.is_official = true AND qp\.is_locked = true/);
  assert.match(uniqueSubskillGenerateSql, /content_version\) <> 'legacy-import'/);
  assert.match(uniqueSubskillGenerateSql, /ROW_NUMBER\(\) OVER \(ORDER BY strand_round ASC, random_order ASC\) AS question_order/);
});
