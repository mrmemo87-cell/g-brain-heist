import test from 'node:test';
import assert from 'node:assert/strict';
import { questionAssessmentSearchText } from '../components/teacher/questionAssessment';
import type { TeacherQuestion } from '../types';

test('teacher search includes secondary governed mappings and evidence statements', () => {
  const question = {
    curriculum_skill: 'Demand', curriculum_subskill: 'Demand shifts and movements',
    registry_mappings: [{ registryCode: 'bh-economics-core-v1', strand: 'Economic reasoning',
      skill: 'Economic data', subskill: 'Diagram use', evidenceFocus: 'Use diagrams as analysis',
      evidenceStatement: 'Translate a market change into a shift.', assessmentProcess: 'BH-AO2' }],
  } as TeacherQuestion;
  const text = questionAssessmentSearchText(question);
  for (const phrase of ['Demand shifts and movements', 'Economic reasoning', 'Diagram use', 'Use diagrams as analysis', 'Translate a market change']) assert.ok(text.includes(phrase));
});

test('unmapped questions do not acquire invented assessment labels', () => {
  assert.equal(questionAssessmentSearchText({ tags: ['economics', 'macro'] } as TeacherQuestion), '');
});
