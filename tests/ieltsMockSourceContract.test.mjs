import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mockSourcePaths, validateMockSource } from '../scripts/ielts/mock-source-contract.mjs';
import { lessonSourcePaths, validateLessonSource } from '../scripts/ielts/lesson-source-contract.mjs';

const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const mocks = mockSourcePaths();
const first = () => load(mocks[0]);
const has = (errors, fragment) => errors.some((e) => e.includes(fragment));

test('three full mock tests are present', () => {
  assert.deepEqual(mocks.map((p) => load(p).code), ['IELTS-M1', 'IELTS-M2', 'IELTS-M3']);
});

for (const path of mocks) {
  test(`${path.split('/mocks/')[1]} satisfies the mock source contract and is a draft or carries an approval record`, () => {
    const mock = load(path);
    assert.deepEqual(validateMockSource(mock), []);
    if (!/draft/i.test(mock.status)) assert.equal(mock.approval_record?.version, mock.version);
    assert.match(mock.scoring.bands, /no validated/i);
  });
}

test('a missing Listening question is rejected', () => {
  const mock = first();
  mock.listening.parts[0].groups[0].items.pop();
  assert.ok(validateMockSource(mock).length > 0);
});

test('band conversion language is rejected', () => {
  const mock = first();
  mock.scoring.listening = 'One mark per answer; 30 correct answers = band 7.';
  assert.ok(validateMockSource(mock).length > 0);
});

test('an unapproved mock cannot claim approval in its status', () => {
  const mock = first();
  mock.status = 'Approved for classroom use';
  delete mock.approval_record;
  assert.ok(validateMockSource(mock).length > 0);
});

test('extension lessons IELTS-X1..X8 sit outside the 24-lesson sequence and are drafts or approved', () => {
  const ext = lessonSourcePaths().map(load).filter((l) => /^IELTS-X/.test(l.code));
  assert.deepEqual(ext.map((l) => l.code), ['IELTS-X1', 'IELTS-X2', 'IELTS-X3', 'IELTS-X4', 'IELTS-X5', 'IELTS-X6', 'IELTS-X7', 'IELTS-X8']);
  for (const l of ext) {
    assert.equal(l.extension, true);
    assert.ok(l.placement);
    if (!/draft/i.test(l.status)) assert.equal(l.approval_record?.version, l.version);
  }
});

test('an extension code without extension: true is rejected, and a core code cannot claim it', () => {
  const x = lessonSourcePaths().map(load).find((l) => l.code === 'IELTS-X1');
  delete x.extension;
  assert.ok(has(validateLessonSource(x), 'extension: true'));
  const core = lessonSourcePaths().map(load).find((l) => l.code === 'IELTS-05');
  core.extension = true;
  assert.ok(has(validateLessonSource(core), 'extension: true'));
});

test('pie charts must total 100 and drawn-figure models may not invent numbers', () => {
  const x = lessonSourcePaths().map(load).find((l) => l.code === 'IELTS-X7');
  const w = x.blocks.find((b) => b.id === 'IELTS-X7-W2');
  w.figure.charts[0].values[0] += 5;
  w.model += ' Coal later reached 77%.';
  const errors = validateLessonSource(x);
  assert.ok(has(errors, 'not 100'));
  assert.ok(has(errors, 'model quotes 77'));
});
