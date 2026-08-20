import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
const dynamicImport = new Function('specifier', 'return import(specifier)');
async function importer() { return await dynamicImport(pathToFileURL(path.resolve('scripts/import-admission-official-bank.mjs')).href); }
async function auditor() { return await dynamicImport(pathToFileURL(path.resolve('scripts/audit-admission-bank-ship-readiness.mjs')).href); }
function writeJson(filePath, value) { mkdirSync(path.dirname(filePath), { recursive: true }); writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function baseRoot() { const root = mkdtempSync(path.join(tmpdir(), 'adm-ready-')); for (const d of ['english', 'maths', 'science', 'shared', 'curriculum-maps/english'])
    mkdirSync(path.join(root, d), { recursive: true }); writeJson(path.join(root, 'shared/reading_passages.json'), { passages: [] }); writeJson(path.join(root, 'shared/writing_rubrics.json'), { rubrics: [] }); return root; }
function pool(extra = {}) { return { external_id: 'pool-1', subject: 'english', grade_level: 1, stage_level: 1, placement_band: 'foundation', name: 'Pool', content_version: 'v1', source_label: 'Brains Heist Official Admission Bank', is_official: true, is_locked: true, content_owner: 'brain_heist', ...extra }; }
function question(extra = {}) { return { external_id: 'q1', pool_external_id: 'pool-1', subject: 'english', grade_level: 1, stage_level: 1, placement_band: 'foundation', diagnostic_skill: 'Reading', strand: 'reading', subskill: 'inference from short texts', difficulty: 'easy', cognitive_level: 'apply', question_type: 'mcq', prompt: 'Which detail supports the idea?', options: ['A detail', 'Wrong one', 'Wrong two', 'Wrong three'], correct_answer: 'A detail', correct_index: 0, explanation: 'Because it supports the idea.', marks: 1, estimated_seconds: 30, content_version: 'v1', source_label: 'Brains Heist Official Admission Bank', is_official: true, is_locked: true, content_owner: 'brain_heist', ...extra }; }
function approvedMap(extraObjective = {}) { return { map_id: 'map-1', map_version: '2026.1', locked: true, objectives: [{ objective_id: 'obj-1', source_status: 'approved', review_status: 'approved', source_reference: 'Cambridge ref', ...extraObjective }] }; }
test('additive migration adds nullable curriculum columns and audit indexes', () => {
    const sql = readFileSync('supabase/migrations/20260711200000_admission_curriculum_linkage_persistence.sql', 'utf8');
    for (const col of ['curriculum_linkage_status', 'curriculum_map_id', 'curriculum_map_version', 'curriculum_programme', 'curriculum_subject_code', 'curriculum_source_version', 'curriculum_review_status', 'curriculum_objective_id', 'curriculum_source_reference'])
        assert.match(sql, new RegExp(`add column if not exists ${col}`));
    for (const idx of ['idx_adm_qpool_curriculum_map', 'idx_adm_qpool_curriculum_linkage_status', 'idx_adm_q_curriculum_objective'])
        assert.match(sql, new RegExp(idx));
});
test('importer maps linked curriculum metadata exactly', async () => {
    const { buildPoolRow, buildQuestionRow } = await importer();
    const file = { curriculum_linkage_status: 'linked', curriculum_map_id: 'map-1', curriculum_map_version: '2026.1', curriculum_programme: 'Cambridge Primary', curriculum_subject_code: 'ENG', curriculum_source_version: 'src-v1', curriculum_review_status: 'approved' };
    const p = buildPoolRow({ ...pool(), __gradeFile: file });
    assert.equal(p.curriculum_map_id, 'map-1');
    assert.equal(p.curriculum_programme, 'Cambridge Primary');
    assert.equal(p.curriculum_subject_code, 'ENG');
    const q = buildQuestionRow({ ...question({ cognitive_level: 'understand', curriculum_objective_id: 'obj-1', curriculum_source_reference: 'ref', curriculum_review_status: 'approved' }), __gradeFile: file }, 'pool-db-id', new Map(), new Map());
    assert.equal(q.curriculum_objective_id, 'obj-1');
    assert.equal(q.curriculum_source_reference, 'ref');
    assert.equal(q.curriculum_review_status, 'approved');
    assert.equal(q.cognitive_level, 'knowledge');
});
test('importer keeps legacy linkage explicit and nulls mapped fields', async () => {
    const { buildPoolRow, buildQuestionRow } = await importer();
    const file = { curriculum_linkage_status: 'legacy_review_required', curriculum_map_id: 'ignored' };
    assert.equal(buildPoolRow({ ...pool(), __gradeFile: file }).curriculum_linkage_status, 'legacy_review_required');
    assert.equal(buildPoolRow({ ...pool(), __gradeFile: file }).curriculum_map_id, null);
    assert.equal(buildQuestionRow({ ...question(), __gradeFile: file }, 'pool-db-id', new Map(), new Map()).curriculum_objective_id, null);
});
test('linked dry-run fails before production data can silently lose objective IDs', async () => {
    const root = baseRoot();
    writeJson(path.join(root, 'english/grade_1.json'), { curriculum_linkage_status: 'linked', curriculum_map_id: 'map-1', curriculum_map_version: '2026.1', pools: [pool()], questions: [question()] });
    const { importAdmissionOfficialBank } = await importer();
    await assert.rejects(() => importAdmissionOfficialBank({ seedDir: root, dryRun: true, env: { SUPABASE_URL: 'http://localhost', SUPABASE_SERVICE_ROLE_KEY: 'x', ADMISSION_BANK_IMPORT_TARGET: 'production' }, confirmProduction: true }), /objective|Validation failed/);
});
test('readiness matrix contains all 30 slots and legacy banks never ship', async () => {
    const { auditAdmissionBankShipReadiness } = await auditor();
    const result = auditAdmissionBankShipReadiness({ validatorOverride: { ok: true, errors: [] } });
    assert.equal(result.rows.length, 30);
    assert.ok(result.rows.filter((r) => r.curriculum_linkage_status === 'legacy_review_required').every((r) => r.final_readiness_status !== 'SHIP_READY'));
});
test('readiness blockers and synthetic SHIP_READY path', async () => {
    const { auditAdmissionBankShipReadiness } = await auditor();
    const root = baseRoot();
    writeJson(path.join(root, 'english/grade_1.json'), { curriculum_linkage_status: 'linked', curriculum_map_id: 'map-1', curriculum_map_version: '2026.1', curriculum_review_status: 'approved', release_manifest: { content_review_status: 'approved', department_head_approval_status: 'approved', staging_verification_status: 'verified' }, pools: [pool()], questions: [question({ curriculum_objective_id: 'obj-1' })] });
    let row = auditAdmissionBankShipReadiness({ seedDir: root, grade: 1, subject: 'english', validatorOverride: { ok: true, errors: [] } }).rows[0];
    assert.equal(row.final_readiness_status, 'MAP_REQUIRED');
    writeJson(path.join(root, 'curriculum-maps/english/grade_1.json'), approvedMap({ review_status: 'draft' }));
    row = auditAdmissionBankShipReadiness({ seedDir: root, grade: 1, subject: 'english', validatorOverride: { ok: true, errors: [] } }).rows[0];
    assert.equal(row.final_readiness_status, 'MAP_REQUIRED');
    writeJson(path.join(root, 'curriculum-maps/english/grade_1.json'), approvedMap());
    row = auditAdmissionBankShipReadiness({ seedDir: root, grade: 1, subject: 'english', validatorOverride: { ok: false, errors: ['bad'] } }).rows[0];
    assert.equal(row.final_readiness_status, 'VALIDATION_FAILED');
    row = auditAdmissionBankShipReadiness({ seedDir: root, grade: 1, subject: 'english', validatorOverride: { ok: true, errors: [] } }).rows[0];
    assert.equal(row.final_readiness_status, 'SHIP_READY');
    writeJson(path.join(root, 'english/grade_1.json'), { curriculum_linkage_status: 'linked', curriculum_map_id: 'map-1', curriculum_map_version: '2026.1', release_manifest: { content_review_status: 'approved' }, pools: [pool()], questions: [question({ curriculum_objective_id: 'obj-1' })] });
    row = auditAdmissionBankShipReadiness({ seedDir: root, grade: 1, subject: 'english', validatorOverride: { ok: true, errors: [] } }).rows[0];
    assert.equal(row.final_readiness_status, 'ACADEMIC_REVIEW_REQUIRED');
});
test('readiness auditor reports programme and source basis for Brains Heist International maps', async () => {
    const { auditAdmissionBankShipReadiness } = await auditor();
    const root = baseRoot();
    writeJson(path.join(root, 'english/grade_1.json'), { curriculum_linkage_status: 'linked', curriculum_map_id: 'map-1', curriculum_map_version: '2026.1', curriculum_review_status: 'approved', release_manifest: { content_review_status: 'approved', department_head_approval_status: 'approved', staging_verification_status: 'verified' }, pools: [pool()], questions: [question({ curriculum_objective_id: 'obj-1' })] });
    writeJson(path.join(root, 'curriculum-maps/english/grade_1.json'), {
        map_id: 'map-1', map_version: '2026.1', locked: true, curriculum_authority: 'brain_heist', programme: 'brain_heist_international', assessment_style: 'international_school_admission', official_affiliation: 'none', reference_frameworks: ['CEFR'], source_references: ['Public CEFR descriptors reviewed for admissions readiness.'], source_licences: ['Public framework; original questions only.'], copyright_policy: 'original_questions_only', source_review_status: 'approved', academic_review_status: 'approved', objectives: [{ objective_id: 'obj-1', programme: 'brain_heist_international', source_review_status: 'approved', academic_review_status: 'approved' }]
    });
    const row = auditAdmissionBankShipReadiness({ seedDir: root, grade: 1, subject: 'english', validatorOverride: { ok: true, errors: [] } }).rows[0];
    assert.equal(row.programme, 'brain_heist_international');
    assert.equal(row.source_basis.mode, 'brain_heist_international');
    assert.deepEqual(row.source_basis.reference_frameworks, ['CEFR']);
    assert.equal(row.final_readiness_status, 'SHIP_READY');
});
test('readiness auditor reports Cambridge-linked source basis separately', async () => {
    const { auditAdmissionBankShipReadiness } = await auditor();
    const root = baseRoot();
    writeJson(path.join(root, 'english/grade_1.json'), { curriculum_linkage_status: 'linked', curriculum_map_id: 'map-1', curriculum_map_version: '2026.1', curriculum_review_status: 'approved', release_manifest: { content_review_status: 'approved', department_head_approval_status: 'approved', staging_verification_status: 'verified' }, pools: [pool()], questions: [question({ curriculum_objective_id: 'obj-1' })] });
    writeJson(path.join(root, 'curriculum-maps/english/grade_1.json'), approvedMap({ programme: 'Cambridge Primary', subject_code: 'CAM_PRIMARY_ENGLISH', source_version: 'licensed-source-version' }));
    const row = auditAdmissionBankShipReadiness({ seedDir: root, grade: 1, subject: 'english', validatorOverride: { ok: true, errors: [] } }).rows[0];
    assert.equal(row.source_basis.mode, 'cambridge_linked');
    assert.equal(row.source_basis.subject_code, 'CAM_PRIMARY_ENGLISH');
});
