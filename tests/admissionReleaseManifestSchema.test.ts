import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schemaPath = 'supabase/seed/admission-official-bank/release-manifests/schema.json';

function compileSchema() {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  return ajv.compile(schema);
}

function brainHeistInternationalManifest(overrides: Record<string, unknown> = {}) {
  return {
    curriculum_mode: 'brain_heist_international',
    curriculum_authority: 'brain_heist',
    programme: 'brain_heist_international',
    assessment_style: 'international_school_admission',
    official_affiliation: 'none',
    subject: 'maths',
    school_grade: 10,
    expected_age_min: 14,
    expected_age_max: 16,
    cambridge_stage: null,
    cambridge_programme: null,
    cambridge_subject_code: null,
    igcse_syllabus_code: null,
    igcse_subject_name: null,
    igcse_pathway: null,
    syllabus_year: null,
    examination_year: null,
    map_id: 'BH-MATHS-G10-READY',
    map_version: '2026.1',
    reference_frameworks: ['England National Curriculum', 'Common Core'],
    source_references: ['Public national curriculum framework reviewed for admissions readiness.'],
    source_licences: ['Public framework reference; original Brain Heist questions only.'],
    copyright_policy: 'original_questions_only',
    source_review_status: 'approved',
    academic_review_status: 'approved',
    bank_content_version: 'adm-bank-v1-g10-maths',
    question_count: 90,
    objective_count: 30,
    deterministic_simulation_count: 100,
    achieved_concept_diversity: 0.92,
    validator_commit_sha: 'abcdef1',
    academic_reviewer: 'Reviewer Name',
    academic_review_date: '2026-07-01',
    department_head_approval: 'approved',
    staging_verification: 'verified',
    production_import_date: null,
    release_status: 'approved_for_production',
    ...overrides,
  };
}

function cambridgeLinkedManifest(overrides: Record<string, unknown> = {}) {
  return {
    curriculum_mode: 'cambridge_linked',
    official_affiliation: 'cambridge_linked',
    subject: 'science',
    school_grade: 6,
    expected_age_min: 10,
    expected_age_max: 11,
    cambridge_programme: 'Cambridge Primary',
    cambridge_stage: 6,
    subject_code: 'CAM_PRIMARY_SCIENCE',
    source_version: 'licensed-source-version',
    map_id: 'SCI-G6-CAM',
    map_version: '2026.1',
    bank_content_version: 'adm-bank-v1-g6-science',
    question_count: 70,
    objective_count: 24,
    deterministic_simulation_count: 100,
    achieved_concept_diversity: 0.88,
    validator_commit_sha: 'abcdef1',
    academic_reviewer: 'Reviewer Name',
    academic_review_date: '2026-07-01',
    department_head_approval: 'approved',
    staging_verification: 'verified',
    production_import_date: null,
    release_status: 'approved_for_production',
    ...overrides,
  };
}

function errors(validate: ReturnType<typeof compileSchema>) {
  return JSON.stringify(validate.errors ?? []);
}

test('release manifest schema accepts complete Brain Heist International manifests with null Cambridge fields', () => {
  const validate = compileSchema();
  const manifest = brainHeistInternationalManifest();
  assert.equal(validate(manifest), true, errors(validate));
});

test('release manifest schema rejects Brain Heist International manifests missing public source and originality fields', () => {
  const validate = compileSchema();
  const manifest = brainHeistInternationalManifest({
    reference_frameworks: undefined,
    source_references: undefined,
    source_licences: undefined,
    copyright_policy: undefined,
  });
  assert.equal(validate(manifest), false);
  const output = errors(validate);
  assert.match(output, /reference_frameworks/);
  assert.match(output, /source_references/);
  assert.match(output, /source_licences/);
  assert.match(output, /copyright_policy/);
});

test('release manifest schema keeps Cambridge-linked required fields unchanged', () => {
  const validate = compileSchema();
  assert.equal(validate(cambridgeLinkedManifest()), true, errors(validate));
  assert.equal(validate(cambridgeLinkedManifest({ cambridge_stage: undefined, subject_code: undefined, source_version: undefined })), false);
  const output = errors(validate);
  assert.match(output, /cambridge_stage/);
  assert.match(output, /subject_code/);
  assert.match(output, /source_version/);
});

test('release manifest schema requires IGCSE metadata only for Cambridge-linked Grade 10 IGCSE manifests', () => {
  const validate = compileSchema();
  const incomplete = cambridgeLinkedManifest({ school_grade: 10, cambridge_programme: 'Cambridge IGCSE', cambridge_stage: 'IGCSE', subject_code: 'IGCSE_SCIENCE' });
  assert.equal(validate(incomplete), false);
  assert.match(errors(validate), /igcse_syllabus_code/);
  const complete = cambridgeLinkedManifest({
    school_grade: 10,
    cambridge_programme: 'Cambridge IGCSE',
    cambridge_stage: 'IGCSE',
    subject_code: 'IGCSE_SCIENCE',
    igcse_syllabus_code: '0653',
    igcse_subject_name: 'Combined Science',
    igcse_pathway: 'Core',
    syllabus_year: 2026,
    examination_year: 2026,
  });
  assert.equal(validate(complete), true, errors(validate));
});
