import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Computer-delivered IELTS-M2 (Diagnostic Bible 5.1: keys never reach the browser before scoring).
const sql = readFileSync('supabase/migrations/20261116101000_ielts_mock_cbt_m2_content.sql', 'utf8');
const literals = [...sql.matchAll(/'((?:[^']|'')*)'::jsonb/g)].map((m) => JSON.parse(m[1].replaceAll("''", "'")));
const [payload, key, audio, timing] = literals;
const source = JSON.parse(readFileSync('docs/ielts/mocks/mock-2/mock.json', 'utf8'));
const groups = (skill) => (skill === 'listening' ? payload.listening.parts : payload.reading.passages).flatMap((p) => p.groups);
const numbers = (skill) => groups(skill).flatMap((g) => {
  const out = [];
  for (let n = g.range[0]; n <= g.range[1]; n += 1) out.push(n);
  return out;
});

test('the student payload carries no answers, evidence, transcripts or models', () => {
  const text = JSON.stringify(payload);
  for (const field of ['"answer"', '"accept"', '"evidence"', '"lines"', '"model"', '"segments"']) assert.ok(!text.includes(field), field);
});

test('payload and key cover questions 1-40 exactly once in each objective skill', () => {
  for (const skill of ['listening', 'reading']) {
    const expected = Array.from({ length: 40 }, (_, i) => i + 1);
    assert.deepEqual(numbers(skill), expected);
    assert.deepEqual(Object.keys(key[skill]).map(Number).sort((a, b) => a - b), expected);
  }
});

test('the server key matches the approved source answers', () => {
  const sourceGroups = (skill) => (skill === 'listening' ? source.listening.parts : source.reading.passages).flatMap((p) => p.groups);
  for (const skill of ['listening', 'reading']) {
    for (const g of sourceGroups(skill)) {
      if (g.type === 'multi') {
        for (let n = g.range[0]; n <= g.range[1]; n += 1) assert.deepEqual(key[skill][n].a, g.answer.map((x) => x.toUpperCase()));
      } else {
        for (const it of g.items) assert.equal(key[skill][it.n].a[0].toUpperCase(), it.answer.toUpperCase(), `${skill} ${it.n}`);
      }
    }
  }
});

test('the content was generated from the current mock source', () => {
  assert.equal(payload.version, source.version);
  assert.match(sql, /sha256 [0-9a-f]{64}/);
});

test('figures exist in public/ and the recording timing is recorded', () => {
  const figures = [...groups('listening'), ...groups('reading')].filter((g) => g.figure).map((g) => g.figure.src);
  figures.push(payload.writing.task1.figure.src);
  for (const src of figures) assert.ok(existsSync(`public${src.split('?')[0]}`), src);
  assert.match(audio.url, /^https:\/\/.+\/governed\/mock-2\/audio-v1\/[0-9a-f]{64}\.mp3$/);
  assert.ok(audio.listen_end > 1200 && audio.listen_end < audio.duration);
  assert.equal(timing.listening_review_seconds, 120);
  assert.equal(timing.reading_seconds, 3600);
  assert.equal(timing.writing_seconds, 3600);
});

test('every mock RPC is closed to anonymous callers', () => {
  const schema = readFileSync('supabase/migrations/20261116100000_ielts_mock_cbt.sql', 'utf8');
  const rpcs = [...schema.matchAll(/create or replace function (public\.rpc_ielts_mock_cbt_[a-z_]+)\(/g)].map((m) => m[1]);
  assert.ok(rpcs.length >= 8);
  for (const fn of rpcs) assert.match(schema, new RegExp(`revoke all on function ${fn.replace('.', '\\.')}\\([^)]*\\) from public, anon;`), fn);
  assert.match(schema, /revoke all on private\.ielts_mock_cbt_forms from public, anon, authenticated;/);
});
