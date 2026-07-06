import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const grade6 = JSON.parse(readFileSync('supabase/seed/admission-official-bank/maths/grade_6.json', 'utf8'));
test('Grade 6 Maths official bank v1 has required question count and type', () => {
    assert.equal(grade6.questions.length, 90);
    for (const question of grade6.questions) {
        assert.equal(question.question_type, 'mcq');
        assert.equal(question.options.length, 4);
        assert.equal(question.correct_answer, question.options[question.correct_index]);
    }
});
test('Grade 6 Maths official bank v1 has intended placement band distribution', () => {
    const byBand = new Map();
    for (const question of grade6.questions)
        byBand.set(question.placement_band, (byBand.get(question.placement_band) ?? 0) + 1);
    assert.equal(byBand.get('foundation'), 34);
    assert.equal(byBand.get('target'), 43);
    assert.equal(byBand.get('stretch'), 13);
});
test('Grade 6 Maths official bank v1 has intended strand distribution', () => {
    const byStrand = new Map();
    for (const question of grade6.questions)
        byStrand.set(question.diagnostic_skill, (byStrand.get(question.diagnostic_skill) ?? 0) + 1);
    assert.equal(byStrand.get('Number and operations'), 18);
    assert.equal(byStrand.get('Fractions, decimals, and percentages'), 18);
    assert.equal(byStrand.get('Algebraic thinking'), 12);
    assert.equal(byStrand.get('Geometry and measurement'), 18);
    assert.equal(byStrand.get('Data and statistics'), 10);
    assert.equal(byStrand.get('Problem solving'), 14);
});
test('Grade 6 Maths official bank v1 uses production metadata and no sample labels', () => {
    assert.equal(grade6.content_version, 'adm-bank-v1-g6-maths');
    assert.equal(grade6.source_label, 'Brain Heist Official Admission Bank');
    for (const record of [...grade6.pools, ...grade6.questions]) {
        assert.equal(record.content_version, 'adm-bank-v1-g6-maths');
        assert.equal(record.source_label, 'Brain Heist Official Admission Bank');
        assert.equal(record.is_official, true);
        assert.equal(record.is_locked, true);
        assert.equal(record.content_owner, 'brain_heist');
    }
});
