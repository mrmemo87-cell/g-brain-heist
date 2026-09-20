import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260901031554_refine_intervention_targeted_practice_relevance.sql', 'utf8');
const workspace = readFileSync('components/student-progress/InterventionTargetedPracticeWorkspace.tsx', 'utf8');
test('broad objective questions must also align to the intervention skill to be exact', () => {
    assert.match(migration, /p_skill_key like 'objective:%'/);
    assert.match(migration, /q\.curriculum_skill/);
    assert.match(migration, /q\.curriculum_subskill/);
    assert.match(migration, /q\.curriculum_objective/);
    assert.match(migration, /q\.topic_name/);
    assert.match(migration, /taxonomy\.primary_skill_name/);
    assert.match(migration, /taxonomy\.atomic_subskill_name/);
});
test('broader objective matches remain related rather than exact', () => {
    const objectiveBranches = migration.match(/when p_skill_key like 'objective:%'/g) || [];
    assert.equal(objectiveBranches.length, 2);
    assert.match(migration, /\) then 2\n\s*when p_skill_key not like 'diagnostic:%'/);
    assert.match(migration, /'related_question_ids'/);
    assert.match(migration, /match_tier = 2/);
});
test('automatic recommendations fail closed to exact matches only', () => {
    assert.match(migration, /recommended as \([\s\S]*?from matched[\s\S]*?where match_tier = 1[\s\S]*?limit 6/);
    assert.match(migration, /'recommended_question_ids'/);
    assert.match(workspace, /context\.recommendation\.exact_question_ids/);
    assert.doesNotMatch(workspace, /context\.recommendation\.recommended_question_ids/);
});
