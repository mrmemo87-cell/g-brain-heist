import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { describeUnlock, practiceRecommendationForGroup, rollUpRecommendations, skillAreaFromKey } from '../components/student-progress/interventionSkillRollup.js';
// Shape mirrors the live rpc_teacher_student_intervention_workspace_v2 output on 2026-10-30 for a
// grade-7 ESL student with 31 leaf focuses: 28 at one item, 3 recurring at three items.
const leaf = (overrides) => ({
    subject: 'ESL',
    status: 'new_focus', trend: 'flat', priority: 'medium',
    evidence_items: 1, focus_occurrences: 1, last_observed_at: '2026-10-12T05:33:00+00:00', days_since_evidence: 18,
    available_questions: 4, available_exact_questions: 4, available_related_questions: 0,
    recommended_question_ids: [], exact_question_ids: [`q-${overrides.key}-1`, `q-${overrides.key}-2`], related_question_ids: [],
    recommended_type: 'targeted_question_practice', rationale: `${overrides.skill} is a newly detected focus area.`, suggested_goal: 'Strengthen it.',
    has_open_intervention: false, diagnostic_targets: [], evidence_examples: [], evidence_authority: 'automated_history',
    readiness: 'collect_evidence', readiness_blocker: 'More qualifying assessed work is needed.', can_create_plan: false,
    confidence: { score: 20, band: 'low', assessment_state: 'low_data', decision_eligible: false }, professional_review: null,
    ...overrides,
    skill_key: `diagnostic:english-grade-7:eng.${overrides.key.split('/')[0]}:eng.${overrides.key}`,
});
const verbTense = [
    leaf({ topic: 'Verb tense and time reference', skill: 'Past-time verb forms', key: 'use-of-english.verb-tense/past', evidence_items: 3, status: 'recurring', readiness: 'review_evidence', last_observed_at: '2026-10-19T09:08:44+00:00', confidence: { score: 61, band: 'moderate', assessment_state: 'assessed', decision_eligible: true } }),
    leaf({ topic: 'Verb tense and time reference', skill: 'Future reference', key: 'use-of-english.verb-tense/future' }),
    leaf({ topic: 'Verb tense and time reference', skill: 'Perfect forms and time relationships', key: 'use-of-english.verb-tense/perfect' }),
];
const adjectives = [
    leaf({ topic: 'Adjectives, adverbs and comparison', skill: 'Comparative and superlative forms', key: 'use-of-english.adjectives/comparative' }),
    leaf({ topic: 'Adjectives, adverbs and comparison', skill: 'Compound adjective and modifier forms', key: 'use-of-english.adjectives/compound' }),
    leaf({ topic: 'Adjectives, adverbs and comparison', skill: 'Participial adjectives', key: 'use-of-english.adjectives/participial' }),
];
const modality = [
    leaf({ topic: 'Modality', skill: 'Deduction and past modality', key: 'use-of-english.modality/deduction' }),
    leaf({ topic: 'Modality', skill: 'Possibility and probability', key: 'use-of-english.modality/possibility' }),
];
const reading = [
    leaf({ topic: 'Explicit information', skill: 'Locate specific detail', key: 'reading.explicit/detail' }),
];
const confirmed = [
    leaf({ topic: 'Noun phrase control', skill: 'Possession and noun modification', key: 'use-of-english.noun-phrase/possession', evidence_items: 3, status: 'recurring', readiness: 'ready', can_create_plan: true, diagnostic_targets: ['Possessive forms'], professional_review: { id: 'r1', decision: 'confirmed', rationale: 'ok', reviewed_at: '2026-10-20T00:00:00Z', diagnostic_targets: ['Possessive forms'] } }),
    leaf({ topic: 'Noun phrase control', skill: 'Countability and noun number', key: 'use-of-english.noun-phrase/countability' }),
];
test('leaves group by primary skill and pooled evidence makes a group reviewable at the same leaf threshold', () => {
    const groups = rollUpRecommendations([...adjectives, ...modality, ...reading]);
    const byName = Object.fromEntries(groups.map((g) => [g.primarySkill, g]));
    assert.equal(groups.length, 3);
    assert.equal(byName['Adjectives, adverbs and comparison'].readiness, 'review_evidence');
    assert.equal(byName['Adjectives, adverbs and comparison'].promotedByRollup, true);
    assert.equal(byName['Adjectives, adverbs and comparison'].evidenceItems, 3);
    // Two items stay below threshold: still watching, with an unlock hint naming the gap.
    assert.equal(byName['Modality'].readiness, 'collect_evidence');
    assert.match(byName['Modality'].unlockHint || '', /One more qualifying assessed item/);
    assert.match(byName['Modality'].unlockHint || '', /Use of English task/);
    assert.match(byName['Explicit information'].unlockHint || '', /2 more qualifying assessed items/);
    assert.match(byName['Explicit information'].unlockHint || '', /reading task/);
});
test('a group never relaxes a gate: readiness is the best leaf readiness, and ready requires a confirmed leaf', () => {
    const groups = rollUpRecommendations([...verbTense, ...confirmed]);
    const byName = Object.fromEntries(groups.map((g) => [g.primarySkill, g]));
    // Recurring leaf is reviewable; pooled siblings do not turn it into "ready".
    assert.equal(byName['Verb tense and time reference'].readiness, 'review_evidence');
    assert.equal(byName['Verb tense and time reference'].promotedByRollup, false);
    assert.equal(byName['Verb tense and time reference'].anchor.skill, 'Past-time verb forms');
    // A confirmed leaf makes the group ready; practice is anchored on that leaf's governed skill_key.
    const noun = byName['Noun phrase control'];
    assert.equal(noun.readiness, 'ready');
    const practice = practiceRecommendationForGroup(noun);
    assert.equal(practice.skill_key, confirmed[0].skill_key);
    assert.equal(practice.professional_review?.decision, 'confirmed');
    // Anchor's exact questions first, then siblings, capped at 6.
    assert.deepEqual(practice.recommended_question_ids.slice(0, 2), confirmed[0].exact_question_ids);
    assert.ok(practice.recommended_question_ids.length <= 6);
    assert.ok(practice.exact_question_ids.includes(confirmed[1].exact_question_ids[0]));
});
test('groups are ordered by readiness then pooled evidence, and never grant ready from collecting leaves alone', () => {
    const groups = rollUpRecommendations([...reading, ...adjectives, ...confirmed, ...modality]);
    assert.deepEqual(groups.map((g) => g.readiness), ['ready', 'review_evidence', 'collect_evidence', 'collect_evidence']);
    assert.ok(groups.every((g) => g.readiness !== 'ready' || g.leaves.some((l) => l.readiness === 'ready')));
});
test('area is derived from the diagnostic skill key', () => {
    assert.equal(skillAreaFromKey('diagnostic:english-grade-7:eng.use-of-english.noun-phrase:eng.use-of-english.noun-phrase.countability-number'), 'use-of-english');
    assert.equal(skillAreaFromKey('diagnostic:english-grade-7:eng.reading.inference:eng.reading.inference.attitude'), 'reading');
    assert.equal(skillAreaFromKey('objective:abc'), null);
    assert.equal(describeUnlock({ area: 'writing', evidenceItems: 2 }, 3)?.includes('writing task'), true);
    assert.equal(describeUnlock({ area: 'writing', evidenceItems: 3 }, 3), null);
});
test('page keeps the roll-up behind a flag and routes actions through leaf skill keys', () => {
    const page = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
    assert.match(page, /bh\.intervention\.skillRollup/);
    assert.match(page, /params\.get\('rollup'\)/);
    assert.match(page, /const ROLLUP_DEFAULT = true;/);
    assert.match(page, /rollUpRecommendations\(recommendations\)/);
    assert.match(page, /practiceRecommendationForGroup\(group\)/);
    // Non-rollup rendering path is intact.
    assert.match(page, /actionable\.map\(\(r\) => renderRecommendation\(r, 'action'\)\)/);
    assert.match(page, /watching\.map\(\(r\) => renderRecommendation\(r, 'watch'\)\)/);
});
test('the same atomic sub-skill tracked under legacy diagnostic and canonical registry keys is one leaf', async () => {
    const { atomicCodeFromKey, mergeLeavesAcrossSchemes } = await import('../components/student-progress/interventionSkillRollup.js');
    assert.equal(atomicCodeFromKey('diagnostic:english-grade-7:eng.use-of-english.noun-phrase:eng.use-of-english.noun-phrase.possession'), 'eng.use-of-english.noun-phrase.possession');
    assert.equal(atomicCodeFromKey('registry:bh-english-core-v1:eng.use-of-english.noun-phrase.possession'), 'eng.use-of-english.noun-phrase.possession');
    assert.equal(skillAreaFromKey('registry:bh-english-core-v1:eng.reading.inference.attitude'), 'reading');
    // Live shape on 2026-10-30: 3 items under the diagnostic key (recurring), 1 under the registry key.
    const legacy = { ...leaf({ topic: 'Noun phrase control', skill: 'Possession and noun modification', key: 'use-of-english.noun-phrase/possession', evidence_items: 3, status: 'recurring', readiness: 'review_evidence' }), skill_key: 'diagnostic:english-grade-7:eng.use-of-english.noun-phrase:eng.use-of-english.noun-phrase.possession', exact_question_ids: ['q1', 'q2'] };
    const canonical = { ...leaf({ topic: 'Noun phrase control', skill: 'Possession and noun modification', key: 'x/y' }), skill_key: 'registry:bh-english-core-v1:eng.use-of-english.noun-phrase.possession', exact_question_ids: ['q2', 'q3'] };
    const merged = mergeLeavesAcrossSchemes([legacy, canonical]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].skill_key, legacy.skill_key, 'the stronger (reviewable) leaf keeps its governed key');
    assert.equal(merged[0].evidence_items, 4);
    assert.deepEqual(merged[0].exact_question_ids, ['q1', 'q2', 'q3']);
    assert.deepEqual(merged[0].merged_skill_keys, [legacy.skill_key, canonical.skill_key]);
    const groups = rollUpRecommendations([legacy, canonical]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].leaves.length, 1);
    assert.equal(groups[0].evidenceItems, 4);
    assert.equal(groups[0].readiness, 'review_evidence');
});
