import assert from 'node:assert/strict';
import test from 'node:test';
import { getSubjectIconPath } from '../src/lib/subjectIcons';

test('subject icon aliases resolve school-facing subject labels', () => {
  assert.equal(getSubjectIconPath('Mathematics'), '/subject-icons/mathematics_drawn_detailed.svg');
  assert.equal(getSubjectIconPath('Maths'), '/subject-icons/mathematics_drawn_detailed.svg');
  assert.equal(getSubjectIconPath('Global Perspective'), '/subject-icons/global_perspectives_drawn_detailed.svg');
  assert.equal(getSubjectIconPath('Global Perspectives'), '/subject-icons/global_perspectives_drawn_detailed.svg');
  assert.equal(getSubjectIconPath('Travel and Tourism'), '/subject-icons/travel_tourism_drawn_detailed.svg');
  assert.equal(getSubjectIconPath('ESL'), '/subject-icons/esl_drawn_detailed.svg');
});

test('unknown school-defined subjects fall back without breaking the UI', () => {
  assert.equal(getSubjectIconPath('Economics'), null);
  assert.equal(getSubjectIconPath(null), null);
});
