import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
async function loadValidator() {
    const moduleUrl = pathToFileURL(path.resolve('scripts/validate-admission-curriculum-maps.mjs')).href;
    return import(moduleUrl);
}
function validObjective(overrides = {}) {
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
function writeMap(objectives, mapOverrides = {}) {
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
function brainHeistInternationalObjective(overrides = {}) {
    return {
        school_grade: 10,
        programme: 'brain_heist_international',
        typical_age_min: 14,
        typical_age_max: 16,
        subject: 'maths',
        objective_id: 'BH-MATHS-G10-001',
        strand: 'Quantitative reasoning',
        subskill: 'Interpret proportional change in an admissions-readiness context',
        learner_can: 'Learner can interpret proportional change in an unfamiliar but age-appropriate context.',
        level_definition: 'General international Grade 10 admission-readiness level, not an IGCSE syllabus.',
        prerequisite_definition: 'Secure proportional reasoning from lower-secondary study.',
        prerequisites: [],
        prohibited_extensions: ['Do not require named IGCSE syllabus content.'],
        allowed_question_types: ['mcq', 'structured'],
        allowed_difficulties: ['medium'],
        allowed_cognitive_levels: ['apply'],
        source_references: ['England National Curriculum public programme of study summary', 'Common Core public ratio/proportional reasoning progression'],
        source_review_status: 'approved',
        academic_review_status: 'approved',
        ...overrides,
    };
}
function writeBrainHeistInternationalMap(objectives, mapOverrides = {}) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'admission-bh-int-map-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'grade_10_maths.json'), JSON.stringify({
        map_id: 'BH-MATHS-G10-TEST',
        map_version: 'test',
        locked: true,
        curriculum_authority: 'brain_heist',
        programme: 'brain_heist_international',
        assessment_style: 'international_school_admission',
        official_affiliation: 'none',
        reference_frameworks: ['England National Curriculum', 'Common Core'],
        source_references: ['Public national curriculum references reviewed by Brains Heist academics.'],
        source_licences: ['Public framework references only; original questions only.'],
        copyright_policy: 'original_questions_only',
        source_review_status: 'approved',
        academic_review_status: 'approved',
        grade_stage_mapping: { explicit: true, school_grade: 10, programme: 'brain_heist_international', level_definition: 'General international Grade 10 admission-readiness.' },
        objectives,
        ...mapOverrides,
    }, null, 2));
    return root;
}
test('admission curriculum map validator accepts Brains Heist International Grade 10 without Cambridge or IGCSE metadata', async () => {
    const { validateAdmissionCurriculumMaps } = await loadValidator();
    const result = validateAdmissionCurriculumMaps(writeBrainHeistInternationalMap([brainHeistInternationalObjective()]));
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.deepEqual(result.subjects, ['maths']);
    assert.deepEqual(result.grades, ['10']);
});
test('admission curriculum map validator fails Brains Heist International maps without public source basis and original-question policy', async () => {
    const { validateAdmissionCurriculumMaps } = await loadValidator();
    const result = validateAdmissionCurriculumMaps(writeBrainHeistInternationalMap([
        brainHeistInternationalObjective({ source_references: [], source_review_status: 'draft', academic_review_status: 'draft', level_definition: '', prerequisite_definition: '' }),
    ], {
        reference_frameworks: ['private exam pack'],
        source_references: [],
        source_licences: [],
        copyright_policy: 'adapted_questions_allowed',
        source_review_status: 'draft',
        academic_review_status: 'draft',
    }));
    assert.equal(result.ok, false);
    const output = result.errors.join('\n');
    assert.match(output, /unreviewed reference_framework/);
    assert.match(output, /missing source_references/);
    assert.match(output, /copyright_policy original_questions_only/);
    assert.match(output, /unapproved source_review_status/);
    assert.match(output, /unapproved academic_review_status/);
    assert.match(output, /missing level_definition/);
    assert.match(output, /missing prerequisite_definition/);
});
