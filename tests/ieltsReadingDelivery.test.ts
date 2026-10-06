import test from 'node:test';
import assert from 'node:assert/strict';
import { getIeltsReadingPassages, restoreReadingPassage, saveReadingPassage } from '../services/ieltsReadingDelivery';
import { extractIeltsQuestions } from '../services/ieltsExamPayloadParser';

test('Reading delivery preserves independent passage references without copying passages into prompts', () => {
  const payload = { passages: [
    { id: 'a', title: 'First', paragraphs: [{ label: 'A', text: 'The first original text.' }] },
    { id: 'b', title: 'Second', paragraphs: [{ label: 'A', text: 'The second original text.' }] },
  ], questions: [{ id: 'q1', passage_id: 'b', prompt: 'Which claim?', type: 'true_false_not_given', options: ['TRUE', 'FALSE', 'NOT GIVEN'] }] };
  assert.equal(getIeltsReadingPassages(payload).length, 2);
  const [question] = extractIeltsQuestions(payload, 'reading');
  assert.equal(question.passageId, 'b');
  assert.equal(question.prompt, 'Which claim?');
  assert.deepEqual(question.options, ['TRUE', 'FALSE', 'NOT GIVEN']);
});
test('Reading recovery is attempt scoped and unavailable storage does not break answer delivery', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveReadingPassage('first', 'b', storage);
  assert.equal(restoreReadingPassage('first', ['a','b'], storage), 'b');
  assert.equal(restoreReadingPassage('retake', ['a','b'], storage), 'a');
  assert.equal(restoreReadingPassage('first', ['a'], storage), 'a');
  const blocked = { getItem: () => { throw Error('unavailable'); }, setItem: () => { throw Error('quota'); } };
  assert.doesNotThrow(() => saveReadingPassage('first', 'b', blocked));
  assert.equal(restoreReadingPassage('first', ['a','b'], blocked), 'a');
});
test('Malformed or duplicated passage data is rejected instead of partially hidden', () => {
  assert.deepEqual(getIeltsReadingPassages({ passages: [{ id: 'a', title: 'A', paragraphs: [] }] }), []);
  const passage = { id: 'a', title: 'A', paragraphs: [{ label: 'A', text: 'One' }] };
  assert.deepEqual(getIeltsReadingPassages({ passages: [passage, passage] }), []);
});
