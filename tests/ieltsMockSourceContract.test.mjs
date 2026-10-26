import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mockSourcePaths, validateMockSource } from '../scripts/ielts/mock-source-contract.mjs';
import { lessonSourcePaths, validateLessonSource, bibleVersionErrors, currentBibleVersions } from '../scripts/ielts/lesson-source-contract.mjs';

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

test('drafts must use the current Bibles; approved sources keep the earlier version they were approved under', () => {
  const current = currentBibleVersions();
  const old = { diagnostic: '1.10.0', lessons: '1.1.0', visual: '1.1.0' };
  assert.ok(bibleVersionErrors({ status: 'Private teacher-review draft', bibles: old }, current).length > 0);
  assert.deepEqual(bibleVersionErrors({ status: 'Approved', approval_record: { version: '1.0.0' }, bibles: old }, current), []);
  assert.ok(bibleVersionErrors({ approval_record: {}, bibles: { ...current, diagnostic: '99.0.0' } }, current).length > 0);
  assert.ok(bibleVersionErrors({ approval_record: {}, bibles: { ...current, diagnostic: 'latest' } }, current).length > 0);
  assert.deepEqual(bibleVersionErrors({ bibles: current }, current), []);
});


test('revised extensions have substantive independent checks and honest audio status', () => {
  const extensions = lessonSourcePaths().map(load).filter((l) => /^IELTS-X[1-8]$/.test(l.code));
  for (const lesson of extensions) {
    assert.equal(lesson.version, /^IELTS-X[1-4]$/.test(lesson.code) ? '1.1.1' : '1.1.0');
    assert.match(lesson.status, /draft/i);
    assert.equal(lesson.approval_record, undefined);
    assert.deepEqual(lesson.bibles, currentBibleVersions());
    assert.equal(lesson.previous_approval_record?.version, '1.0.0');
    assert.doesNotMatch(lesson.status, /merged/i, lesson.code + ': status must stay true after the PR is merged');
  }
  for (const lesson of extensions.slice(0, 3)) {
    const blocks = lesson.followup.blocks;
    const passage = blocks.find((b) => b.stimulus?.type === 'passage');
    assert.ok(passage, lesson.code + ': missing passage');
    assert.ok(passage.stimulus.paragraphs.join(' ').split(/\s+/).length >= 350, lesson.code + ': short passage');
    assert.ok(blocks.reduce((total, b) => total + (b.items?.length ?? 0), 0) >= 8);
    assert.match(lesson.followup.status, /withheld/i);
  }
  const listening = extensions.find((l) => l.code === 'IELTS-X4');
  const check = listening.followup.blocks.find((b) => b.id === 'IELTS-X4-C1');
  assert.ok(check.stimulus.paragraphs.join(' ').split(/\s+/).length >= 500);
  assert.equal(check.items.length, 8); // two choose-TWO pairs plus six completions, ten marks
  assert.equal(check.items.filter((i) => i.type === 'choice').length, 2);
  const recording = listening.audio.recordings.find((r) => r.block === check.id);
  assert.match(recording.status, /new recording required/i);
  assert.equal(recording.delivered_sha256, undefined);
  assert.ok(listening.release_blockers.some((b) => b.includes('IELTS-X4-C1')));
});


test('revised IELTS X1-X4 keys, answer distributions and difficulty metadata are internally consistent', () => {
  const ext = lessonSourcePaths().map(load).filter((l) => /^IELTS-X[1-4]$/.test(l.code));
  const all = ext.map((l) => l.followup.blocks.flatMap((b) => b.items ?? []));
  const answers = all.map((items) => items.map((item) => item.answer));
  assert.deepEqual(answers[0], ['temperature', 'architectural', 'battery', 'salt', 'library', 'obsolete', 'G', 'E', 'B', 'D']);
  assert.deepEqual(answers[1], ['C', 'B', 'D', 'A', 'C', 'A', 'D', 'B', 'summer', 'pipes']);
  assert.deepEqual(answers[2], ['turbidity', 'screen', 'gravity', 'skimmers', 'membranes', 'resistance', 'ultraviolet', 'reed']);
  assert.deepEqual(answers[3], ['B and D', 'A and E', 'humidity', 'folders', '600', 'transcription', 'flag', 'backup']);
  const x2Keys = answers[1].slice(0, 8);
  assert.notDeepEqual(x2Keys.slice(0, 4), ['A', 'B', 'C', 'D']);
  assert.notDeepEqual(x2Keys.slice(0, 4), x2Keys.slice(4, 8));
  assert.deepEqual([...new Set(x2Keys)].sort(), ['A', 'B', 'C', 'D']);
  const x3Items = all[2];
  assert.match(x3Items[5].prompt, /resistance|movement of water/i);
  assert.doesNotMatch(x3Items[5].prompt, /increase in pressure/i);
  for (const items of all) {
    for (const item of items) {
      assert.match(item.editorial_difficulty, /^(Easy|Moderate|Challenging)$/);
      assert.ok(item.difficulty_basis?.length > 15);
    }
  }
  for (const lesson of ext) {
    assert.match(lesson.followup.difficulty_calibration, /not.*IELTS band/i);
  }
});

test('v1.1.1 summary, process branches and numeric-only audio keys meet the source contract', () => {
  const ext = lessonSourcePaths().map(load).filter((l) => /^IELTS-X[1-4]$/.test(l.code));
  for (const lesson of ext) assert.deepEqual(validateLessonSource(lesson), [], lesson.code);
  const [x1, x2, x3, x4] = ext;
  const summary = x1.followup.blocks[0];
  assert.ok(summary.summary_text.includes('(1) ______'));
  assert.ok(summary.summary_text.includes('(6) ______'));
  assert.equal(summary.items.length, 6);
  assert.deepEqual(x1.followup.blocks[1].items.map((i) => i.answer), ['G', 'E', 'B', 'D']);
  assert.equal(x1.followup.blocks[1].items[0].prompt, 'An old clock tower could be preserved for its appearance');
  assert.equal(x1.followup.blocks[1].stimulus.paragraphs[6], 'G  even after its original use as a public timekeeping device had faded.');
  assert.equal(x1.followup.blocks[1].stimulus.paragraphs[4], 'E  although few residents remembered checking it during the previous week.');
  assert.ok(!x1.followup.blocks[1].stimulus.paragraphs[4].includes('hardly anyone'));
  assert.match(x1.followup.blocks[1].items[1].prompt, /public clock important to local identity/i);
  assert.match(x2.followup.blocks[0].items[0].prompt, /shopper behaviour/i);

  const flow3 = x3.followup.blocks[0].flow_chart;
  assert.ok(flow3.some((e) => e.kind === 'branch' && /emergency holding reservoir/i.test(e.text)));
  assert.ok(flow3.some((e) => e.kind === 'branch' && /returns to the settling basin/i.test(e.text)));
  assert.match(flow3.at(-1).title, /final treatment.*beside the harbour/i);
  assert.match(flow3.at(-1).title, /\(8\) _+/);
  assert.ok(!flow3.some((e) => /turbidity threshold/i.test(e.title ?? '')), 'question 1 answer must not be displayed in a heading');
  assert.ok(!flow3.some((e) => e.kind === 'stage' && /^harbour$/i.test(e.title)));
  assert.match(x3.followup.blocks[0].stimulus.paragraphs[1], /turbidity exceeds the safety threshold/);

  const check4 = x4.followup.blocks[0];
  const qa = check4.items.find((i) => i.id === 'IELTS-X4-C1-Q7');
  assert.equal(qa.answer, '600');
  assert.deepEqual(qa.accept, []);
  assert.equal(qa.word_limit, 1);
  assert.equal(qa.enforce_accept_word_limit, true);
  assert.match(check4.items[1].options[1], /no longer transcribe rainfall readings manually/i);
  assert.ok(check4.flow_chart?.length > 10);
  assert.ok(!check4.flow_chart.some((e) => /second reader|another building/i.test(e.text)), 'diagram must not give away the earlier choose-TWO answers');
  assert.match(check4.stimulus.paragraphs[2], /two additional safeguards/i);
  assert.match(check4.stimulus.paragraphs[3], /protective enclosure/i);
  for (const p of [check4.items[0], check4.items[1]]) {
    assert.ok(p.accept.includes(p.answer.split(' and ').reverse().join(' and ')), 'choose TWO should accept either order');
    assert.equal(new Set(p.answer.split(' and ')).size, 2);
  }

  const mutated = structuredClone(x4);
  mutated.followup.blocks[0].items.find((i) => i.id === 'IELTS-X4-C1-Q7').accept = ['six hundred'];
  assert.ok(has(validateLessonSource(mutated), 'exceeds 1-word limit'));
});
