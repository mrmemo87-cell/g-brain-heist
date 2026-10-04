import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isReservedReassessmentQuestion, questionPurposeLabel } from '../services/economicsQuestionPurpose';

const bank = JSON.parse(readFileSync('content/economics/independent-reassessment-v1.json', 'utf8'));
const original = JSON.parse(readFileSync('supabase/migrations/20261001115000_economics_0455_paper1_readiness_bank_v1.sql', 'utf8').match(/\$package\$([\s\S]+?)\$package\$::jsonb/)![1]);
const migration = readFileSync('supabase/migrations/20261004062527_economics_independent_reassessment_bank.sql', 'utf8');
type Item = typeof bank.questions[number];

test('expansion covers each existing content subskill with three practice and two reserve items', () => {
  assert.equal(bank.questions.length, 200);
  assert.equal(new Set(bank.questions.map((q: Item) => q.externalId)).size, 200);
  for (const base of original.questions) {
    const items = bank.questions.filter((q: Item) => q.taxonomies[0].atomicSubskillCode === base.taxonomies[0].atomicSubskillCode);
    assert.equal(items.length, 5);
    assert.equal(items.filter(isReservedReassessmentQuestion).length, 2);
    assert.equal(items.filter((q: Item) => q.tags.includes('purpose:practice')).length, 3);
    assert.ok(items.every((q: Item) => q.taxonomies[0].evidenceFocusCode === base.taxonomies[0].evidenceFocusCode));
  }
  const coverage = new Map<string, number>();
  for (const q of [...original.questions, ...bank.questions]) for (const tx of q.taxonomies) coverage.set(tx.atomicSubskillCode, (coverage.get(tx.atomicSubskillCode) || 0) + 1);
  assert.equal(coverage.size, 45);
  assert.ok([...coverage.values()].every(n => n >= 6));
});

test('stems are distinct and correct answer positions are balanced across the release', () => {
  const stems = [...original.questions, ...bank.questions].map((q: Item) => q.questionText.trim().toLowerCase());
  assert.equal(new Set(stems).size, 240);
  const positions = [0, 0, 0, 0];
  for (const q of bank.questions) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((v: string) => v.toLowerCase().trim())).size, 4);
    const position = q.options.indexOf(q.correctAnswer);
    assert.ok(position >= 0);
    positions[position]++;
    assert.ok(q.explanation.length >= 35);
    assert.deepEqual(q.eligibleGrades, [10, 11]);
    assert.equal(q.questionType, 'multiple_choice');
    assert.equal(q.points, 1);
  }
  assert.deepEqual(positions, [50, 50, 50, 50]);
});

test('independent arithmetic oracle verifies calculations and signed outcomes', () => {
  const answer = (section: number, item: number) => bank.questions.find((q: Item) => q.externalId === `bh-econ-0455-expand-v1-${String(section).padStart(2, '0')}-${item}`).correctAnswer;
  assert.equal(Number(answer(13, 1)), Math.abs(((90 - 100) / 100) / ((12 - 10) / 10)));
  assert.equal(Number(answer(13, 2)), Math.abs(((60 - 50) / 50) / ((18 - 20) / 20)));
  assert.equal(Number(answer(13, 3)), 15 / 5);
  assert.ok(Math.abs(Number(answer(13, 5)) - Math.abs(((260 - 200) / 200) / ((4 - 5) / 5))) < 1e-12);
  assert.equal(answer(15, 1), `It falls from $${4 * 100} to $${5 * 70}`);
  assert.equal(10 * 200, 8 * 250);
  assert.equal(answer(20, 2), `$${1000 * 0.05}`);
  assert.equal(answer(24, 3), `$${50 * 6 - (100 + 3 * 50)}`);
  assert.equal(answer(24, 5), `A loss of $${360 - 40 * 8}`);
  assert.equal(answer(29, 2), `${(210 - 200) / 200 * 100}%`);
  assert.equal(answer(32, 1), `$${120e9 / 20e6}`);
  assert.equal(Number(answer(36, 2)), 12000 - 9000);
  assert.equal(answer(40, 1), `A deficit of $${100 - 80} billion`);
});

test('Paper 1 evidence excludes external AO3 and uses valid internal processes', () => {
  for (const q of bank.questions) {
    assert.equal(q.assessmentProfile.programmeCode, '0455');
    assert.equal(q.assessmentProfile.sourceVersion, '2027-2029');
    assert.equal(q.assessmentProfile.paperComponent, 'paper_1');
    assert.ok(['AO1', 'AO2'].includes(q.assessmentProfile.primaryAssessmentObjective));
    assert.ok(q.assessmentProfile.assessmentObjectives.every((ao: string) => ['AO1', 'AO2'].includes(ao)));
    for (const tx of q.taxonomies) assert.match(tx.assessmentProcessCode, /^BH-AO[1-4]$/);
  }
  assert.deepEqual(JSON.parse(migration.match(/\$package\$([\s\S]+?)\$package\$::jsonb/)![1]), bank);
});

test('roles guide practice selection without pretending to guarantee independence', () => {
  assert.equal(questionPurposeLabel({ tags: ['purpose:reassessment'] }), 'Reassessment candidate');
  assert.equal(questionPurposeLabel({ tags: ['purpose:practice'] }), 'Targeted practice');
  assert.equal(questionPurposeLabel({}), null);
  assert.equal(isReservedReassessmentQuestion({ tags: null }), false);
  assert.match(migration, /prior\.assignment_id<>p_assignment_id/);
  assert.match(migration, /prior\.answered_at<=p_answered_at/);
  assert.match(migration, /'repeated_question_evidence',v_group\.has_repeated_items/);
  assert.match(migration, /'intervention_practice',v_group\.targeted_practice/);
  assert.doesNotMatch(migration, /(?:update|delete from) public\.student_learning_registry_item_evidence/i);
});
