import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { BIOLOGY_IMAGE_CHAPTERS, getBiologyChapterPartRanges } from '../components/biologyCambridgeCatalog.js';

interface BiologyQuestion {
  number?: unknown;
  masterKey?: unknown;
  answer?: unknown;
  image?: unknown;
}

const root = process.cwd();
const masterSource = readFileSync(resolve(root, 'components/biologyMasterAnswerKey.ts'), 'utf8');
const masterAnswers = new Map([...masterSource.matchAll(/"([^"]+)"\s*:\s*"([ABCD])"/g)].map((match) => [match[1], match[2]]));

function loadQuestions(chapter: number, dataDir: string): BiologyQuestion[] {
  const jsonPath = resolve(root, 'components/Biology', dataDir, `biology_ch${chapter}_questions.json`);
  const payload = JSON.parse(readFileSync(jsonPath, 'utf8')) as BiologyQuestion[] | { questions?: BiologyQuestion[] };
  return Array.isArray(payload) ? payload : payload.questions ?? [];
}

test('Biology Ch2–Ch11 JSON question pools validate against the master answer key and image assets', () => {
  assert.deepEqual(BIOLOGY_IMAGE_CHAPTERS.map((chapter) => chapter.chapter), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  for (const chapter of BIOLOGY_IMAGE_CHAPTERS) {
    const chapterDir = resolve(root, 'components/Biology', chapter.dataDir);
    const imageDir = resolve(chapterDir, 'images');
    const jsonPath = resolve(chapterDir, `biology_ch${chapter.chapter}_questions.json`);
    assert.equal(existsSync(imageDir), true, `Ch${chapter.chapter} images folder is missing`);
    assert.equal(existsSync(jsonPath), true, `Ch${chapter.chapter} JSON file is missing`);

    const questions = loadQuestions(chapter.chapter, chapter.dataDir);
    assert.equal(questions.length, chapter.questionCount, `Ch${chapter.chapter} question count mismatch`);

    const seenMasterKeys = new Set<string>();
    for (const [index, question] of questions.entries()) {
      assert.equal(typeof question.number, 'number', `Ch${chapter.chapter} item ${index + 1} missing number`);
      assert.equal(typeof question.masterKey, 'string', `Ch${chapter.chapter} Q${question.number} missing masterKey`);
      assert.match(String(question.answer), /^[ABCD]$/, `Ch${chapter.chapter} Q${question.number} has invalid answer`);
      assert.equal(typeof question.image, 'string', `Ch${chapter.chapter} Q${question.number} missing image`);

      const key = String(question.masterKey);
      assert.equal(seenMasterKeys.has(key), false, `Ch${chapter.chapter} duplicate masterKey ${key}`);
      seenMasterKeys.add(key);
      assert.equal(masterAnswers.has(key), true, `Ch${chapter.chapter} missing master key ${key}`);
      assert.equal(question.answer, masterAnswers.get(key), `Ch${chapter.chapter} ${key} answer does not match master key`);
      assert.equal(existsSync(resolve(chapterDir, String(question.image))), true, `Ch${chapter.chapter} missing image ${question.image}`);
    }
  }
});

test('Biology Ch2–Ch11 catalog part ranges preserve exact question totals with sensible split sizes', () => {
  for (const chapter of BIOLOGY_IMAGE_CHAPTERS) {
    const ranges = getBiologyChapterPartRanges(chapter);
    assert.equal(ranges.reduce((sum, range) => sum + range.size, 0), chapter.questionCount, `Ch${chapter.chapter} split total mismatch`);
    assert.equal(ranges[0]?.start, 1, `Ch${chapter.chapter} first range must start at 1`);
    assert.equal(ranges.at(-1)?.end, chapter.questionCount, `Ch${chapter.chapter} final range must end at the total`);

    for (const [index, range] of ranges.entries()) {
      assert.equal(range.part, index + 1, `Ch${chapter.chapter} invalid part number`);
      assert.equal(range.end - range.start + 1, range.size, `Ch${chapter.chapter} invalid range size for part ${range.part}`);
      assert.ok(range.size >= 30 && range.size <= 35, `Ch${chapter.chapter} part ${range.part} should contain 30–35 questions`);
      if (index > 0) assert.equal(range.start, ranges[index - 1].end + 1, `Ch${chapter.chapter} ranges must be contiguous`);
    }
  }
});

test('Biology image-question wrappers use the reusable renderer and master-key metadata', () => {
  const renderer = readFileSync(resolve(root, 'public/cambridge-tests/Biology/biology_image_question_test.js'), 'utf8');
  assert.match(renderer, /const ANSWER_SOURCE = 'BIOLOGY_MASTER_ANSWER_KEY'/);
  assert.match(renderer, /question_keys: result\.question_keys/);
  assert.match(renderer, /question_codes: result\.question_codes/);
  assert.match(renderer, /missing_answer_keys: result\.missing/);
  assert.match(renderer, /answer_source: ANSWER_SOURCE/);

  for (const chapter of BIOLOGY_IMAGE_CHAPTERS) {
    const wrapper = readFileSync(resolve(root, 'public/cambridge-tests/Biology', `${chapter.slug}.html`), 'utf8');
    assert.match(wrapper, /biology_master_answer_key\.js\?v=1/);
    assert.match(wrapper, /biology_image_question_test\.js\?v=1/);
    assert.match(wrapper, new RegExp(`biology_ch${chapter.chapter}_questions\\.json`));
    assert.doesNotMatch(wrapper, /let\s+ANSWER_KEY\s*=/);
  }
});
