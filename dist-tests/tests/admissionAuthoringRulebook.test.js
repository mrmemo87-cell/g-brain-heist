import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rulebook = readFileSync('docs/admissions/ADMISSION_BANK_AUTHORING_RULEBOOK.md', 'utf8');
const contract = readFileSync('docs/admissions/AI_QUESTION_GENERATION_CONTRACT.md', 'utf8');
const readme = readFileSync('supabase/seed/admission-official-bank/README.md', 'utf8');
test('admission authoring rulebook defines the fail-closed curriculum-map workflow', () => {
    assert.match(rulebook, /AI may generate only from a locked curriculum map/);
    assert.match(rulebook, /Every generated question must reference one approved `curriculum_objective_id`/);
    assert.match(rulebook, /Grade and Cambridge stage are separate/);
    assert.match(rulebook, /source -> curriculum map -> blueprint -> generation -> item validation ->\s*bank coverage validation -> deterministic form simulation -> staging form -> academic sign-off -> production/);
    assert.match(rulebook, /Generated forms must reach the theoretical maximum distinct concepts possible/);
    assert.match(rulebook, /Content cannot be labelled department-head-ready until academic sign-off/);
});
test('admission authoring rulebook bans broad subskills and unsafe item patterns', () => {
    for (const phrase of ['Number and operations', 'Biology / living things', 'Chemistry / materials', 'Earth and space', 'Grammar', 'Reading']) {
        assert.match(rulebook, new RegExp(phrase.replace(/[\/]/g, '\\$&')));
    }
    assert.match(rulebook, /Distractors must correspond to plausible misconceptions/);
    assert.match(rulebook, /Correct answers must not be exposed through wording, grammar, position, option length/);
    assert.match(rulebook, /No AI residue, placeholder stems, meta distractor language/);
    assert.match(rulebook, /Explanations must independently establish the correct answer/);
});
test('AI generation contract and official-bank README point authors to validated maps', () => {
    assert.match(contract, /allowed question types, allowed difficulties, allowed cognitive levels, prohibited extensions/);
    assert.match(contract, /one primary objective/);
    assert.match(readme, /ADMISSION_BANK_AUTHORING_RULEBOOK.md/);
    assert.match(readme, /No new official bank should be authored without a validated curriculum map/);
});
