import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const grade6 = JSON.parse(readFileSync('supabase/seed/admission-official-bank/maths/grade_6.json', 'utf8'));
const map = JSON.parse(readFileSync('supabase/seed/admission-official-bank/curriculum-maps/maths/grade_6.json', 'utf8'));
test('Grade 6 Maths international bank v2 has required question count and linked MCQ shape', () => {
    assert.equal(grade6.questions.length, 90);
    assert.equal(grade6.curriculum_linkage_status, 'linked');
    assert.equal(grade6.curriculum_map_id, map.map_id);
    assert.equal(grade6.curriculum_map_version, map.map_version);
    const objectiveIds = new Set(map.objectives.map((objective) => objective.objective_id));
    for (const question of grade6.questions) {
        assert.equal(question.question_type, 'mcq');
        assert.equal(question.options.length, 4);
        assert.equal(question.correct_answer, question.options[question.correct_index]);
        assert.ok(objectiveIds.has(question.curriculum_objective_id));
        assert.ok(question.cognitive_level);
        assert.equal(question.curriculum_review_status, 'approved');
    }
});
test('Grade 6 Maths international bank v2 preserves intended placement distribution', () => {
    const byBand = new Map();
    for (const question of grade6.questions)
        byBand.set(question.placement_band, (byBand.get(question.placement_band) ?? 0) + 1);
    assert.equal(byBand.get('foundation'), 34);
    assert.equal(byBand.get('target'), 43);
    assert.equal(byBand.get('stretch'), 13);
});
test('Grade 6 Maths international bank v2 preserves intended strand distribution', () => {
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
test('Grade 6 Maths international bank v2 uses atomic subskills and balanced answer positions', () => {
    const concepts = new Map();
    const positions = [0, 0, 0, 0];
    const prompts = new Set();
    for (const question of grade6.questions) {
        assert.notEqual(question.subskill.toLowerCase(), question.strand.toLowerCase());
        concepts.set(question.subskill, (concepts.get(question.subskill) ?? 0) + 1);
        positions[question.correct_index] += 1;
        assert.equal(prompts.has(question.prompt), false);
        prompts.add(question.prompt);
    }
    assert.equal(concepts.size, 36);
    assert.ok(Math.max(...concepts.values()) <= 3);
    assert.deepEqual(positions, [23, 23, 22, 22]);
});
test('Grade 6 Maths international bank v2 fixes the greatest-number answer regression', () => {
    const question = grade6.questions.find((item) => item.external_id === 'adm-g6-maths-v2-q001');
    assert.ok(question);
    assert.equal(question.correct_answer, '6,908');
    assert.equal(question.options[question.correct_index], '6,908');
});
test('Grade 6 Maths international bank v2 uses production metadata and original-content policy', () => {
    assert.equal(grade6.content_version, 'adm-bank-v2-g6-maths');
    assert.equal(grade6.source_label, 'Brain Heist International Admission Bank');
    assert.equal(grade6.programme, 'brain_heist_international');
    assert.equal(grade6.copyright_policy, 'original_questions_only');
    assert.equal(map.objectives.length, 36);
    for (const record of [...grade6.pools, ...grade6.questions]) {
        assert.equal(record.content_version, 'adm-bank-v2-g6-maths');
        assert.equal(record.source_label, 'Brain Heist International Admission Bank');
        assert.equal(record.is_official, true);
        assert.equal(record.is_locked, true);
        assert.equal(record.content_owner, 'brain_heist');
    }
});
