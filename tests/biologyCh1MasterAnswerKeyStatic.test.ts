import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const htmlPath = resolve(root, 'public/cambridge-tests/Biology/cell_structure.html');
const adapterPath = resolve(root, 'public/cambridge-tests/Biology/biology_master_answer_key.js');
const masterPath = resolve(root, 'components/biologyMasterAnswerKey.ts');

const html = readFileSync(htmlPath, 'utf8');
const adapter = readFileSync(adapterPath, 'utf8');
const master = readFileSync(masterPath, 'utf8');

function getMasterAnswers(): Map<string, string> {
  return new Map([...master.matchAll(/"([^"]+)"\s*:\s*"([ABCD])"/g)].map((match) => [match[1], match[2]]));
}

function getAdapterAnswers(): Map<string, string> {
  return new Map([...adapter.matchAll(/\"([^\"]+)\"\s*:\s*\"([ABCD])\"/g)].map((match) => [match[1], match[2]]));
}

function getCh1QuestionCodes(): string[] {
  return [...html.matchAll(/code:\s*'([^']+)'/g)].map((match) => match[1]);
}

function getBiologyMasterKeyFromQuestionCode(code: string): string | null {
  const match = code.trim().match(/^(9700_[msw]\d{2}_qp_\d{2})\s+Q:\s*(\d{1,2})$/i);
  if (!match) return null;
  const questionNumber = Number.parseInt(match[2], 10);
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 40) return null;
  return `${match[1].toLowerCase()}_${String(questionNumber).padStart(2, '0')}`;
}

test('Biology Ch1 loads the generated browser-safe master answer key adapter', () => {
  assert.match(adapter, /GENERATED FILE - DO NOT EDIT/);
  assert.match(adapter, /Source: components\/biologyMasterAnswerKey\.ts/);
  assert.match(adapter, /window\.BIOLOGY_MASTER_ANSWER_KEY = BIOLOGY_MASTER_ANSWER_KEY/);
  assert.match(adapter, /window\.getBiologyMasterKeyFromQuestionCode = getBiologyMasterKeyFromQuestionCode/);
  assert.match(adapter, /window\.getBiologyAnswerFromQuestionCode = getBiologyAnswerFromQuestionCode/);
  assert.equal(getAdapterAnswers().size, getMasterAnswers().size);
  assert.match(html, /<script src="biology_master_answer_key\.js\?v=1"><\/script>/);
});

test('Biology Ch1 no longer depends on a local answer key for scoring or review', () => {
  assert.doesNotMatch(html, /let\s+ANSWER_KEY\s*=/);
  assert.match(html, /const ANSWER_SOURCE = 'BIOLOGY_MASTER_ANSWER_KEY'/);
  assert.match(html, /function calculateScore\(responses\)/);
  assert.match(html, /getQuestionMasterAnswer\(question\)/);
  assert.match(html, /function applyReviewMode\(responses\)/);
  assert.match(html, /getQuestionMasterAnswer\(q\)/);
});

test('Biology Ch1 stores answer source, question codes, question keys, and missing-key status', () => {
  assert.match(html, /question_codes: result\.question_codes/);
  assert.match(html, /question_keys: result\.question_keys/);
  assert.match(html, /answer_source: ANSWER_SOURCE/);
  assert.match(html, /missing_answer_keys: result\.missing/);
  assert.match(html, /formatMissingAnswerMessage\(result\.missing\)/);
});

test('Biology Ch1 Part 1 generated keys all match the master answer key', () => {
  const masterAnswers = getMasterAnswers();
  const codes = getCh1QuestionCodes();
  const part1Codes = codes.slice(0, 31);
  const part1Keys = part1Codes.map(getBiologyMasterKeyFromQuestionCode);

  assert.equal(codes.length, 151);
  assert.equal(part1Codes.length, 31);
  assert.equal(part1Keys.filter(Boolean).length, 31);
  assert.equal(new Set(part1Keys).size, 31);
  assert.deepEqual(part1Keys.filter((key): key is string => !!key && !masterAnswers.has(key)), []);
});

test('Biology Ch1 all generated keys remain covered by the master answer key', () => {
  const masterAnswers = getMasterAnswers();
  const codes = getCh1QuestionCodes();
  const keys = codes.map(getBiologyMasterKeyFromQuestionCode);
  const missing = keys.filter((key): key is string => !!key && !masterAnswers.has(key));

  assert.equal(masterAnswers.size, 2237);
  assert.equal(codes.length, 151);
  assert.equal(keys.filter(Boolean).length, 151);
  assert.equal(new Set(keys).size, 151);
  assert.deepEqual(missing, []);
});


test('generated Biology browser adapter stays in sync with the TypeScript master key', () => {
  const generated = execFileSync('python3', ['scripts/build_biology_answer_key.py', '--print'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(adapter, generated);
});

test('real static Biology tests do not define a local ANSWER_KEY', () => {
  const biologyDir = resolve(root, 'public/cambridge-tests/Biology');
  const offenders = readdirSync(biologyDir)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => {
      const source = readFileSync(resolve(biologyDir, file), 'utf8');
      const hasRealQuestionPool = [...source.matchAll(/code:\s*'9700_[^']+'/g)].length > 5;
      return hasRealQuestionPool && /let\s+ANSWER_KEY\s*=/.test(source);
    });

  assert.deepEqual(offenders, []);
});
