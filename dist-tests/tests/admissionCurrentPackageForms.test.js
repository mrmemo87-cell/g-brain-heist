import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentAdmissionPackageForms, isCurrentManagedAdmissionForm } from '../src/lib/admissionCurrentPackageForms.js';
const blueprints = [
    { id: 'bp-g5-eng', school_id: null, pool_id: null, name: 'G5 English', subject: 'english', target_grade: 5, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g5-mat', school_id: null, pool_id: null, name: 'G5 Maths', subject: 'maths', target_grade: 5, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g5-sci', school_id: null, pool_id: null, name: 'G5 Science', subject: 'science', target_grade: 5, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g6-eng', school_id: null, pool_id: null, name: 'G6 English', subject: 'english', target_grade: 6, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g6-mat', school_id: null, pool_id: null, name: 'G6 Maths', subject: 'maths', target_grade: 6, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g6-sci', school_id: null, pool_id: null, name: 'G6 Science', subject: 'science', target_grade: 6, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g7-eng', school_id: null, pool_id: null, name: 'G7 English', subject: 'english', target_grade: 7, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g7-mat', school_id: null, pool_id: null, name: 'G7 Maths', subject: 'maths', target_grade: 7, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
    { id: 'bp-g7-sci', school_id: null, pool_id: null, name: 'G7 Science', subject: 'science', target_grade: 7, target_stage: null, total_marks: 25, duration_minutes: 45, question_distribution: {}, pass_percentage: 60, delivery_mode: 'exam', is_active: true, created_by: null, created_at: '', updated_at: '' },
];
const cleanQuestion = (grade, n = 1) => ({
    id: `q-${grade}-${n}`,
    external_id: `adm-g${grade}-${n}`,
    content_owner: 'brain_heist',
    content_version: `adm-bank-v1-g${grade}-english`,
    pool: { content_owner: 'brain_heist', content_version: `adm-bank-v1-g${grade}-pool` },
});
const form = (id, blueprint_id, form_code, created_at, questions = [cleanQuestion(form_code.includes('6') ? 6 : 5)]) => ({
    id,
    blueprint_id,
    school_id: 'school',
    form_code,
    status: 'published',
    published_at: created_at,
    closed_at: null,
    created_by: null,
    created_at,
    updated_at: created_at,
    adm_test_form_questions: questions.map((question, index) => ({ id: `${id}-fq-${index}`, form_id: id, question_id: question.id, question })),
});
test('new Grade 5 candidate sees only latest clean English, Maths, and Science package forms', () => {
    const forms = [
        form('old-eng', 'bp-g5-eng', 'ENG5-2026-4UO', '2026-01-01T00:00:00Z'),
        form('old-mat', 'bp-g5-mat', 'MAT5-2026-4G3', '2026-01-02T00:00:00Z'),
        form('old-sci', 'bp-g5-sci', 'SCI5-2026-C1ED', '2026-01-03T00:00:00Z'),
        form('eng', 'bp-g5-eng', 'ENG5-2026-0C44', '2026-07-07T00:00:00Z'),
        form('mat', 'bp-g5-mat', 'MAT5-2026-150E', '2026-07-07T00:01:00Z'),
        form('sci', 'bp-g5-sci', 'SCI5-2026-DD82', '2026-07-07T00:02:00Z'),
    ];
    assert.deepEqual(getCurrentAdmissionPackageForms(forms, blueprints, 5).map(f => f.form_code), ['ENG5-2026-0C44', 'MAT5-2026-150E', 'SCI5-2026-DD82']);
});
test('historical old attempts can remain visible outside default send cards', () => {
    const oldForm = form('old-eng', 'bp-g5-eng', 'ENG5-2026-4UO', '2026-01-01T00:00:00Z');
    const currentForm = form('eng', 'bp-g5-eng', 'ENG5-2026-0C44', '2026-07-07T00:00:00Z');
    const attempt = { id: 'attempt-old', candidate_id: 'cand', form_id: oldForm.id, school_id: 'school', started_at: '2026-02-01T00:00:00Z', submitted_at: null, expires_at: '2026-02-02T00:00:00Z', status: 'in_progress', total_score: null, max_score: null, percentage: null, anti_cheat_flags: {}, created_at: '2026-02-01T00:00:00Z' };
    const sendCards = getCurrentAdmissionPackageForms([oldForm, currentForm], blueprints, 5);
    const historyForms = [oldForm, currentForm].filter(f => attempt.form_id === f.id && !sendCards.some(sendForm => sendForm.id === f.id));
    assert.deepEqual(sendCards.map(f => f.form_code), ['ENG5-2026-0C44']);
    assert.deepEqual(historyForms.map(f => f.form_code), ['ENG5-2026-4UO']);
});
test('forms containing legacy or unmanaged questions are excluded from sendable forms', () => {
    const legacy = form('legacy', 'bp-g5-eng', 'ENG5-2026-2029', '2026-07-08T00:00:00Z', [{ ...cleanQuestion(5), content_version: 'legacy-import' }]);
    const unmanaged = form('unmanaged', 'bp-g5-mat', 'MAT5-2026-OLD', '2026-07-08T00:00:00Z', [{ ...cleanQuestion(5), external_id: null }]);
    assert.equal(isCurrentManagedAdmissionForm(legacy), false);
    assert.equal(isCurrentManagedAdmissionForm(unmanaged), false);
    assert.deepEqual(getCurrentAdmissionPackageForms([legacy, unmanaged], blueprints, 5), []);
});
test('if multiple clean forms exist for one grade and subject, only the latest published form is default', () => {
    const previous = form('previous', 'bp-g5-eng', 'ENG5-2026-AAAA', '2026-07-06T00:00:00Z');
    const latest = form('latest', 'bp-g5-eng', 'ENG5-2026-0C44', '2026-07-07T00:00:00Z');
    assert.deepEqual(getCurrentAdmissionPackageForms([latest, previous], blueprints, 5).map(f => f.form_code), ['ENG5-2026-0C44']);
});
test('Grade 6 candidate sees only latest clean English, Maths, and Science package forms', () => {
    const forms = [
        form('eng6', 'bp-g6-eng', 'ENG6-2026-477B', '2026-07-07T00:00:00Z'),
        form('mat6', 'bp-g6-mat', 'MAT6-2026-E770', '2026-07-07T00:01:00Z'),
        form('sci6', 'bp-g6-sci', 'SCI6-2026-17FD', '2026-07-07T00:02:00Z'),
        form('eng5', 'bp-g5-eng', 'ENG5-2026-0C44', '2026-07-07T00:03:00Z'),
    ];
    assert.deepEqual(getCurrentAdmissionPackageForms(forms, blueprints, 6).map(f => f.form_code), ['ENG6-2026-477B', 'MAT6-2026-E770', 'SCI6-2026-17FD']);
});
test('Grade 7 candidate sees latest clean English, Maths, and Science package forms while legacy Grade 7 stays excluded', () => {
    const forms = [
        form('old-eng7', 'bp-g7-eng', 'ENG7-2026-OLD', '2026-07-06T00:00:00Z', [cleanQuestion(7)]),
        form('eng7', 'bp-g7-eng', 'ENG7-2026-A111', '2026-07-07T00:00:00Z', [cleanQuestion(7)]),
        form('mat7', 'bp-g7-mat', 'MAT7-2026-B222', '2026-07-07T00:01:00Z', [cleanQuestion(7)]),
        form('sci7', 'bp-g7-sci', 'SCI7-2026-C333', '2026-07-07T00:02:00Z', [cleanQuestion(7)]),
        form('legacy7', 'bp-g7-eng', 'ENG7-2026-LEG', '2026-07-08T00:00:00Z', [{ ...cleanQuestion(7), content_version: 'legacy-import' }]),
        form('archived7', 'bp-g7-mat', 'MAT7-2026-ARCH', '2026-07-08T00:00:00Z', [{ ...cleanQuestion(7), external_id: null }]),
    ];
    assert.deepEqual(getCurrentAdmissionPackageForms(forms, blueprints, 7).map(f => f.form_code), ['ENG7-2026-A111', 'MAT7-2026-B222', 'SCI7-2026-C333']);
});
