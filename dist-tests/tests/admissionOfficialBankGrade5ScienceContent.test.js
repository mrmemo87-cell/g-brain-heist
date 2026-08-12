import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const grade5 = JSON.parse(readFileSync('supabase/seed/admission-official-bank/science/grade_5.json', 'utf8'));
test('Grade 5 Science official bank v1 has required question count and MCQ shape', () => {
    assert.equal(grade5.questions.length, 70);
    for (const question of grade5.questions) {
        assert.equal(question.question_type, 'mcq');
        assert.equal(question.options.length, 4);
        assert.equal(question.correct_answer, question.options[question.correct_index]);
    }
});
test('Grade 5 Science official bank v1 has intended placement band distribution', () => {
    const byBand = new Map();
    for (const question of grade5.questions)
        byBand.set(question.placement_band, (byBand.get(question.placement_band) ?? 0) + 1);
    assert.equal(byBand.get('foundation'), 26);
    assert.equal(byBand.get('target'), 34);
    assert.equal(byBand.get('stretch'), 10);
});
test('Grade 5 Science official bank v1 has intended strand distribution', () => {
    const byStrand = new Map();
    for (const question of grade5.questions)
        byStrand.set(question.diagnostic_skill, (byStrand.get(question.diagnostic_skill) ?? 0) + 1);
    assert.equal(byStrand.get('Biology / living things'), 14);
    assert.equal(byStrand.get('Materials / chemistry'), 12);
    assert.equal(byStrand.get('Forces / physics'), 12);
    assert.equal(byStrand.get('Energy, light, sound, and electricity'), 12);
    assert.equal(byStrand.get('Earth and space'), 8);
    assert.equal(byStrand.get('Scientific enquiry / working scientifically'), 12);
});
test('Grade 5 Science official bank v1 uses production metadata and no sample labels', () => {
    assert.equal(grade5.content_version, 'adm-bank-v1-g5-science');
    assert.equal(grade5.source_label, 'Brains Heist Official Admission Bank');
    for (const record of [...grade5.pools, ...grade5.questions]) {
        assert.equal(record.content_version, 'adm-bank-v1-g5-science');
        assert.equal(record.source_label, 'Brains Heist Official Admission Bank');
        assert.equal(record.is_official, true);
        assert.equal(record.is_locked, true);
        assert.equal(record.content_owner, 'brain_heist');
    }
});
