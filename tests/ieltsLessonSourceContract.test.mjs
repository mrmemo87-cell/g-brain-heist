import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lessonSourcePaths, validateLessonSource, currentBibleVersions, bibleVersionErrors } from '../scripts/ielts/lesson-source-contract.mjs';

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

test('sources are drafts bound to the current Bibles, or approved under a recorded earlier-or-current Bible version', () => {
  const bibles = currentBibleVersions();
  for (const path of paths) {
    const lesson = load(path);
    if (!/draft/i.test(lesson.status)) {
      assert.ok(lesson.approval_record?.approved_by && lesson.approval_record?.date && lesson.approval_record?.basis, `${lesson.code} approval record incomplete`);
      assert.equal(lesson.approval_record.version, lesson.version, `${lesson.code} approval must name the approved version`);
    }
    if (/draft/i.test(lesson.status)) assert.deepEqual(lesson.bibles, bibles);
    assert.deepEqual(bibleVersionErrors(lesson, bibles), [], `${lesson.code} Bible versions`);
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
  lesson.audio.recordings.find((r) => r.id === 'IELTS-05-L1').status = 'Script draft; recording not produced (unapproved)';
  lesson.release_blockers = lesson.release_blockers.filter((b) => !b.includes('IELTS-05-L1') && !b.includes('Recordings'));
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
  lesson.bibles.diagnostic = '99.0.0';
  const errors = validateLessonSource(lesson);
  assert.ok(has(errors, 'hardcoded school'));
  assert.ok(has(errors, 'must say the model is illustrative'));
  assert.ok(has(errors, 'does not match current Bible'));
  const draft = lessonSeven();
  draft.status = 'Private teacher-review draft';
  delete draft.approval_record;
  draft.bibles.diagnostic = '1.9.0';
  assert.ok(has(validateLessonSource(draft), 'does not match current Bible'));
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
  delete lesson.approval_record;
  assert.ok(has(validateLessonSource(lesson), 'human approval record'));
});

test('recordings must follow the audio production order with measured pauses', () => {
  const lesson = lessonFive();
  const recording = lesson.audio.recordings.find((r) => r.id === 'IELTS-05-L1');
  recording.segments = recording.segments.filter((x) => !(x.type === 'silence' && x.seconds === 30));
  recording.segments[0].text = 'Welcome.';
  const errors = validateLessonSource(lesson);
  assert.ok(has(errors, '30-second reading silence'));
  assert.ok(has(errors, 'spoken copyright notice'));
});

test('every speaker in a script needs an assigned voice', () => {
  const lesson = lessonFive();
  delete lesson.audio.recordings.find((r) => r.id === 'IELTS-05-L2').voices.MARCO;
  assert.ok(has(validateLessonSource(lesson), 'no voice assigned for MARCO'));
});

const lessonEleven = () => load(paths.find((p) => p.includes('lesson-11')));
const lessonNine = () => load(paths.find((p) => p.includes('lesson-09')));

test('chart facts in answer keys must match the chart data', () => {
  const lesson = lessonEleven();
  lesson.blocks.find((b) => b.id === 'IELTS-11-I1').items[0].facts[0].value = 60;
  assert.ok(has(validateLessonSource(lesson), 'but the figure shows 62'));
});

test('model answers may not invent numbers that are not in the chart', () => {
  const lesson = lessonEleven();
  const block = lesson.blocks.find((b) => b.id === 'IELTS-11-W1');
  block.model = block.model.replace('39%', '37%');
  assert.ok(has(validateLessonSource(lesson), 'model quotes 37'));
});

test('Task 1 needs a chart and charts must be labelled as fictional data', () => {
  const lesson = lessonEleven();
  const task = lesson.blocks.find((b) => b.id === 'IELTS-11-W2');
  task.figure.note = 'Source: city council.';
  const errors = validateLessonSource(lesson);
  assert.ok(has(errors, 'fictional practice data'));
  delete task.figure;
  assert.ok(has(validateLessonSource(lesson), 'needs a visual'));
});

test('heading evidence must come from the paragraph the item names', () => {
  const lesson = lessonNine();
  lesson.blocks.find((b) => b.id === 'IELTS-09-R1').items[1].paragraph = 'C';
  assert.ok(has(validateLessonSource(lesson), 'evidence is not in paragraph C'));
});

const lessonOf = (n) => load(paths.find((p) => p.includes(`lesson-${n}/`)));

test('Lessons 05-24 are all present as schema-2 sources', () => {
  const codes = new Set(paths.map((p) => load(p).code));
  for (let n = 5; n <= 24; n += 1) assert.ok(codes.has(`IELTS-${String(n).padStart(2, '0')}`), `IELTS-${n} source missing`);
});

test('plan labelling answers must be lettered places on the plan', () => {
  const lesson = lessonOf(17);
  lesson.blocks.find((b) => b.id === 'IELTS-17-L1').items[0].answer = 'Z';
  assert.ok(has(validateLessonSource(lesson), 'is not a lettered place on the plan'));
});

test('plan labelling prompts must name the place hidden at the keyed letter', () => {
  const lesson = lessonOf(17);
  lesson.blocks.find((b) => b.id === 'IELTS-17-L1').items[0].prompt = 'changing rooms for visiting teams';
  assert.ok(has(validateLessonSource(lesson), 'prompt does not name the place hidden at'));
});

test('plan letters must be unique', () => {
  const lesson = lessonOf(17);
  const areas = lesson.blocks.find((b) => b.id === 'IELTS-17-L1').figure.areas.filter((a) => a.letter);
  areas[1].letter = areas[0].letter;
  assert.ok(has(validateLessonSource(lesson), 'plan letters must be unique'));
});

test('table models may not invent numbers that are not in the table', () => {
  const lesson = lessonOf(19);
  const block = [...lesson.blocks, ...lesson.followup.blocks].find((b) => b.figure?.type === 'table' && b.model);
  const first = block.figure.series[0].values[0];
  block.model = `${block.model} One town reached ${first + 1001} litres.`;
  assert.ok(has(validateLessonSource(lesson), `model quotes ${first + 1001}`));
});

test('the final review never awards a band or readiness label', () => {
  const lesson = lessonOf(24);
  lesson.blocks[0].examples[0].comment = 'This learner is a guaranteed band 7.';
  assert.ok(validateLessonSource(lesson).length > 0);
});

const lessonNum = (n) => load(paths.find((p) => p.includes(`lesson-0${n}/`)));

test('Lessons 01-24 are all present as schema-2 sources', () => {
  const codes = new Set(paths.map((p) => load(p).code));
  for (let n = 1; n <= 24; n += 1) assert.ok(codes.has(`IELTS-${String(n).padStart(2, '0')}`), `IELTS-${n} missing`);
});

test('Lessons 01-04 carry a conversion record naming the approved source and every addition', () => {
  for (const n of [1, 2, 3, 4]) {
    const lesson = lessonNum(n);
    assert.ok(lesson.conversion?.source_pack && lesson.conversion?.approved_content, `IELTS-0${n} conversion record incomplete`);
    assert.ok(lesson.conversion.additions.length > 0, `IELTS-0${n} must list conversion additions`);
    assert.ok(lesson.release_blockers.some((b) => /conversion additions/i.test(b)), `IELTS-0${n} must flag the additions for the owner's spot-check`);
  }
});

test('a conversion record is refused outside Lessons 1-4', () => {
  const lesson = lessonFive();
  lesson.conversion = lessonNum(3).conversion;
  assert.ok(has(validateLessonSource(lesson), 'conversion records are only for Lessons 1-4'));
});

test('only a converted lesson may omit the fresh check, and it must name its independent evidence', () => {
  const five = lessonFive();
  five.followup = { absent_reason: 'The screener is the independent evidence.' };
  assert.ok(has(validateLessonSource(five), 'a separate withheld fresh check is required'));
  const one = lessonNum(1);
  one.followup.absent_reason = 'No check.';
  assert.ok(has(validateLessonSource(one), 'must name the independent evidence'));
});

test('homework blocks are never revealed in class', () => {
  const lesson = lessonNum(3);
  lesson.stages.at(-1).show.push({ block: 'IELTS-03-H', part: 'answers' });
  assert.ok(has(validateLessonSource(lesson), 'must not be revealed in class'));
});

test('a writing task may lack a model only inside the withheld fresh check', () => {
  const lesson = lessonNum(4);
  const w = lesson.blocks.find((b) => b.id === 'IELTS-04-W');
  delete w.model;
  w.no_model = 'not needed';
  assert.ok(has(validateLessonSource(lesson), 'no_model is only for a fresh-check task'));
});

test('converted listening keys still quote the approved transcript verbatim', () => {
  const lesson = lessonNum(1);
  lesson.blocks[0].items[0].evidence = 'We have moved it to Saturday.';
  assert.ok(has(validateLessonSource(lesson), 'not a verbatim quotation'));
});
