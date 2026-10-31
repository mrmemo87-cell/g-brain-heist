import test from 'node:test';
import assert from 'node:assert/strict';
import { questionAssessmentSearchText } from '../components/teacher/questionAssessment.js';
test('teacher search includes secondary governed mappings and evidence statements', () => {
    const question = {
        curriculum_skill: 'Demand', curriculum_subskill: 'Demand shifts and movements',
        registry_mappings: [{ registryCode: 'bh-economics-core-v1', strand: 'Economic reasoning',
                skill: 'Economic data', subskill: 'Diagram use', evidenceFocus: 'Use diagrams as analysis',
                evidenceStatement: 'Translate a market change into a shift.', assessmentProcess: 'BH-AO2' }],
    };
    const text = questionAssessmentSearchText(question);
    for (const phrase of ['Demand shifts and movements', 'Economic reasoning', 'Diagram use', 'Use diagrams as analysis', 'Translate a market change'])
        assert.ok(text.includes(phrase));
});
test('unmapped questions do not acquire invented assessment labels', () => {
    assert.equal(questionAssessmentSearchText({ tags: ['economics', 'macro'] }), '');
});
test('Physics search includes governed external programme, tier and AO focus', () => {
    const text = questionAssessmentSearchText({ assessment_profiles: [{
                programmeCode: '0654', sourceVersion: '2025-2027', paperComponent: 'paper_2',
                primaryAssessmentObjective: 'AO2', assessmentObjectives: ['AO2'], syllabusTier: 'supplement',
                syllabusReference: 'P5.2.4.1', objectiveComponents: ['BH-CIE0654-AO2-problem-solving'],
            }] });
    for (const phrase of ['0654', '2025-2027', 'supplement', 'AO2', 'P5.2.4.1', 'Solving quantitative problems'])
        assert.ok(text.includes(phrase));
});
