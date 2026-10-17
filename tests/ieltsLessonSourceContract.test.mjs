import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lessonSourcePaths, validateLessonSource, currentBibleVersions } from '../scripts/ielts/lesson-source-contract.mjs';

const paths = lessonSourcePaths();
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const lessonFive = () => load(paths.find((p) => p.includes('lesson-05')));
const lessonSix = () => load(paths.find((p) => p.includes('lesson-06')));
const lessonSeven = () => load(paths.find((p) => p.includes('lesson-07')));
const has = (errors, fragment) => errors.some((e) => e.includes(fragment));

test('Lessons 05-08 are present as schema-2 sources', () => {
  const codes = paths.map((p) => load(p).code);
  for (const code of ['IELTS-05', 'IELTS-06', 'IELTS-07', 'IELTS-08']) assert.ok(codes.includes(code), `${code} source missing`);
});

for (const path of paths) {
  test(`${path.split('/lessons/')[1]} satisfies the lesson source contract`, () => {
    assert.deepEqual(validateLessonSource(load(path)), []);
  });
}

test('sources remain unreleased drafts bound to the current Bible versions', () => {
  const bibles = currentBibleVersions();
  for (const path of paths) {
    const lesson = load(path);
    assert.match(lesson.status, /draft/i);
    assert.deepEqual(lesson.bibles, bibles);
    assert.ok(lesson.release_blockers.length > 0, `${lesson.code} must list open release blockers`);
    assert.equal(lesson.test_type, 'Academic');
  }
});

test('a key whose evidence is not in the transcript is rejected', () => {
  const lesson = lessonFive();
  lesson.blocks.find((b) => b.id === 'IELTS-05-L1').items[0].evidence = 'I will come on Saturday';
  assert.ok(has(validateLessonSource(lesson), 'not a verbatim quotation'));
});

test('a multiple-choice answer outside the options is rejected', () => {
  const lesson = lessonFive();
  lesson.blocks.find((b) => b.id === 'IELTS-05-L1').items[4].answer = 'D';
  assert.ok(has(validateLessonSource(lesson), 'not one of the option letters'));
});

test('a completion answer over the word limit is rejected', () => {
  const lesson = lessonSix();
  lesson.blocks.find((b) => b.id === 'IELTS-06-R2').items[2].answer = 'the street level';
  assert.ok(has(validateLessonSource(lesson), 'exceeds 2-word limit'));
});

test('a reading completion answer not copied from the passage is rejected', () => {
  const lesson = lessonSix();
  lesson.blocks.find((b) => b.id === 'IELTS-06-R2').items[3].answer = 'gutters';
  assert.ok(has(validateLessonSource(lesson), 'does not appear verbatim'));
});

test('paragraph matching evidence must be in the keyed paragraph', () => {
  const lesson = lessonSix();
  lesson.blocks.find((b) => b.id === 'IELTS-06-R1').items[1].answer = 'D';
  assert.ok(has(validateLessonSource(lesson), 'evidence is not in paragraph D'));
});

test('gaps in the 60-minute plan are rejected', () => {
  const lesson = lessonSix();
  lesson.stages[3].start += 2;
  assert.ok(has(validateLessonSource(lesson), 'expected'));
});

test('answers revealed before questions are rejected', () => {
  const lesson = lessonFive();
  lesson.stages[0].show.reverse();
  assert.ok(has(validateLessonSource(lesson), 'reveals answers before questions'));
});

test('an unapproved recording missing from release blockers is rejected', () => {
  const lesson = lessonFive();
  lesson.release_blockers = lesson.release_blockers.filter((b) => !b.includes('IELTS-05-L1'));
  assert.ok(has(validateLessonSource(lesson), 'must be listed in release_blockers'));
});

test('a fresh check that reuses lesson content is rejected', () => {
  const lesson = lessonSix();
  lesson.followup.blocks[0].stimulus.paragraphs = lesson.blocks.find((b) => b.id === 'IELTS-06-R1').stimulus.paragraphs;
  assert.ok(has(validateLessonSource(lesson), 'overlaps lesson content'));
});

test('hardcoded schools, band claims and stale Bible versions are rejected', () => {
  const lesson = lessonSeven();
  lesson.blocks[0].instructions += ' Silk Road students only.';
  lesson.blocks.find((b) => b.id === 'IELTS-07-W2').model_label = 'Band 9 essay';
  lesson.bibles.diagnostic = '1.9.0';
  const errors = validateLessonSource(lesson);
  assert.ok(has(errors, 'hardcoded school'));
  assert.ok(has(errors, 'must say the model is illustrative'));
  assert.ok(has(errors, 'does not match current Bible'));
});

test('Task 2 models must meet the 250-word minimum', () => {
  const lesson = lessonSeven();
  const essay = lesson.blocks.find((b) => b.id === 'IELTS-07-W2');
  essay.model = essay.model.split('\n\n').slice(0, 2).join('\n\n');
  assert.ok(has(validateLessonSource(lesson), 'below the 250-word task minimum'));
});

test('a released status without a human approval record is rejected', () => {
  const lesson = lessonSeven();
  lesson.status = 'Released';
  assert.ok(has(validateLessonSource(lesson), 'human approval record'));
});
