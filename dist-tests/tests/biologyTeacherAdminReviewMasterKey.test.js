import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildBiologyAnswerKeyFromSavedMetadata } from '../components/biologyReviewAnswerKey.js';
const root = process.cwd();
const teacherPortal = readFileSync(resolve(root, 'components/TeacherPortal.tsx'), 'utf8');
const adminPortal = readFileSync(resolve(root, 'components/AdminPortal.tsx'), 'utf8');
const adminReflectionModal = readFileSync(resolve(root, 'components/admin/modals/AnswerReflectionModal.tsx'), 'utf8');
function collectProductionSources(relativeDir) {
    const dir = resolve(root, relativeDir);
    return readdirSync(dir).flatMap((entry) => {
        const relativePath = `${relativeDir}/${entry}`;
        const fullPath = resolve(root, relativePath);
        if (statSync(fullPath).isDirectory())
            return collectProductionSources(relativePath);
        if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith('.bak'))
            return [];
        return [relativePath];
    });
}
test('production code no longer imports legacy biologyAnswerKeys', () => {
    const offenders = collectProductionSources('components')
        .filter((file) => file !== 'components/biologyMasterAnswerKey.ts')
        .filter((file) => /from ['\"]\.\/?biologyAnswerKeys['\"]|biologyAnswerKeys|biologyQuestionRanges/.test(readFileSync(resolve(root, file), 'utf8')));
    assert.deepEqual(offenders, []);
});
test('Biology teacher/admin review paths use master-key metadata helpers', () => {
    assert.match(teacherPortal, /buildBiologyAnswerKeyFromSavedMetadata/);
    assert.match(adminPortal, /buildBiologyAnswerKeyFromSavedMetadata/);
    assert.match(adminReflectionModal, /buildBiologyAnswerKeyFromSavedMetadata/);
});
test('Biology review answer map derives sequential answers from saved question_keys metadata', () => {
    const result = buildBiologyAnswerKeyFromSavedMetadata({
        responses: { 1: 'A', 2: 'B' },
        answer_source: 'BIOLOGY_MASTER_ANSWER_KEY',
        question_keys: {
            1: '9700_m17_qp_12_01',
            2: '9700_m17_qp_12_02',
        },
        missing_answer_keys: [],
    });
    assert.equal(result.hasMetadata, true);
    assert.deepEqual(result.missingKeys, []);
    assert.deepEqual(result.answerKey, { 1: 'C', 2: 'C' });
});
test('Biology review missing metadata does not fake correctness', () => {
    const result = buildBiologyAnswerKeyFromSavedMetadata({
        responses: { 1: 'A' },
        answer_source: 'BIOLOGY_MASTER_ANSWER_KEY',
    });
    assert.equal(result.hasMetadata, false);
    assert.deepEqual(result.answerKey, {});
    assert.deepEqual(result.missingKeys, []);
    const invalidKeyResult = buildBiologyAnswerKeyFromSavedMetadata({
        question_keys: { 1: '9700_missing_qp_00_01' },
    });
    assert.equal(invalidKeyResult.hasMetadata, true);
    assert.deepEqual(invalidKeyResult.answerKey, {});
    assert.deepEqual(invalidKeyResult.missingKeys, ['9700_missing_qp_00_01']);
    assert.match(teacherPortal, /Answer metadata unavailable/);
    assert.match(adminReflectionModal, /answer metadata is unavailable/i);
});
test('Chemistry review behavior still uses chemistryAnswerKeys', () => {
    assert.match(teacherPortal, /chemistryAnswerKeys/);
    assert.match(teacherPortal, /chemistryQuestionRanges/);
    assert.match(adminPortal, /chemistryAnswerKeys/);
    assert.match(adminPortal, /chemistryQuestionRanges/);
});
