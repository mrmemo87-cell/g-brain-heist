import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadValidator() {
  const moduleUrl = pathToFileURL(path.resolve('scripts/validate-admission-curriculum-maps.mjs')).href;
  return import(moduleUrl) as Promise<{ validateAdmissionCurriculumMaps(root?: string, options?: { allowEmpty?: boolean }): { ok: boolean; errors: string[]; filesChecked: number; objectivesChecked: number; subjects: string[]; grades: string[] } }>;
}

function validObjective(overrides: Record<string, unknown> = {}) {
  return {
    school_grade: 6,
    programme: 'Cambridge Primary',
    cambridge_stage: 6,
    typical_age_min: 10,
    typical_age_max: 11,
    subject: 'science',
    subject_code: 'CAM_PRIMARY_SCIENCE',
    source_version: 'licensed-source-version',
    source_status: 'approved',
    objective_id: 'SCI6-OBJ-001',
    strand: 'Working scientifically',
    subskill: 'Choose the variable that must be kept the same in a fair test',
    learner_can: 'Learner can identify the control variable in a fair-test investigation.',
    prerequisites: [],
    prohibited_extensions: ['Do not require Stage 7 terminology.'],
    allowed_question_types: ['mcq'],
    allowed_difficulties: ['easy', 'medium'],
    allowed_cognitive_levels: ['apply'],
    source_reference: 'Licensed Cambridge Primary Science Stage 6 reference, objective section redacted from repo.',
    review_status: 'approved',
    ...overrides,
  };
}

function writeMap(objectives: unknown[], mapOverrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'admission-curriculum-map-'));
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'grade_6_science.json'), JSON.stringify({
    map_id: 'SCI-G6-TEST',
    map_version: 'test',
    locked: true,
    grade_stage_mapping: { explicit: true, school_grade: 6, programme: 'Cambridge Primary', cambridge_stage: 6 },
    objectives,
    ...mapOverrides,
  }, null, 2));
  return root;
}

test('admission curriculum map validator fails zero production maps by default', async () => {
  const { validateAdmissionCurriculumMaps } = await loadValidator();
  const root = mkdtempSync(path.join(os.tmpdir(), 'admission-empty-maps-'));
  const result = validateAdmissionCurriculumMaps(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /no production curriculum-map files discovered/);
});

test('admission curriculum map validator allows zero maps only with allowEmpty', async () => {
  const { validateAdmissionCurriculumMaps } = await loadValidator();
  const root = mkdtempSync(path.join(os.tmpdir(), 'admission-empty-maps-'));
  const result = validateAdmissionCurriculumMaps(root, { allowEmpty: true });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.filesChecked, 0);
  assert.equal(result.objectivesChecked, 0);
});

test('admission curriculum map CLI supports --allow-empty for schema-only checks', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'admission-empty-cli-'));
  const output = execFileSync(process.execPath, ['scripts/validate-admission-curriculum-maps.mjs', '--allow-empty', root], { encoding: 'utf8' });
  assert.match(output, /checked 0 map files and 0 objectives/);
});

test('admission curriculum map validator accepts one locked atomic approved map', async () => {
  const { validateAdmissionCurriculumMaps } = await loadValidator();
  const result = validateAdmissionCurriculumMaps(writeMap([validObjective()]));
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.filesChecked, 1);
  assert.equal(result.objectivesChecked, 1);
  assert.deepEqual(result.subjects, ['science']);
  assert.deepEqual(result.grades, ['6']);
});

test('admission curriculum map validator fails malformed maps', async () => {
  const { validateAdmissionCurriculumMaps } = await loadValidator();
  const root = mkdtempSync(path.join(os.tmpdir(), 'admission-malformed-map-'));
  writeFileSync(path.join(root, 'bad.json'), '{');
  const result = validateAdmissionCurriculumMaps(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /invalid JSON/);
});

test('admission curriculum map validator fails closed on required metadata and broad subskills', async () => {
  const { validateAdmissionCurriculumMaps } = await loadValidator();
  const result = validateAdmissionCurriculumMaps(writeMap([
    validObjective({ objective_id: 'DUP', source_reference: '', source_status: 'draft', subskill: 'Biology / living things', learner_can: '', allowed_question_types: [], prohibited_extensions: undefined }),
    validObjective({ objective_id: 'DUP', learner_can: 'Learner can identify the control variable in a fair-test investigation.', prerequisites: ['LATER'] }),
    validObjective({ objective_id: 'LATER' }),
  ]));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicate objective_id/);
  assert.match(result.errors.join('\n'), /missing source_reference/);
  assert.match(result.errors.join('\n'), /unapproved source_status/);
  assert.match(result.errors.join('\n'), /blank or broad-only subskill/);
  assert.match(result.errors.join('\n'), /learner_can/);
  assert.match(result.errors.join('\n'), /missing allowed_question_types/);
  assert.match(result.errors.join('\n'), /missing prohibited_extensions field/);
  assert.match(result.errors.join('\n'), /duplicate normalized learner_can statement/);
  assert.match(result.errors.join('\n'), /prerequisite LATER after dependent objective DUP/);
});

test('admission curriculum map validator rejects invalid grade-stage and Grade 10 generic maps', async () => {
  const { validateAdmissionCurriculumMaps } = await loadValidator();
  const result = validateAdmissionCurriculumMaps(writeMap([
    validObjective({ cambridge_stage: 5 }),
    validObjective({ objective_id: 'G10', school_grade: 10, programme: 'Cambridge IGCSE', cambridge_stage: 10, subject: 'maths', subject_code: 'CAM_PRIMARY_MATHS', learner_can: 'Learner can solve a syllabus-specific IGCSE item.' }),
  ]));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /grade\/stage mismatch/);
  assert.match(result.errors.join('\n'), /Grade 10 must not use generic Stage 10/);
  assert.match(result.errors.join('\n'), /Grade 10 missing exact IGCSE/);
  assert.match(result.errors.join('\n'), /invalid programme\/subject code combination/);
});
