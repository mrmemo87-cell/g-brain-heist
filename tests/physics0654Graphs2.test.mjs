import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('content/physics-0654-graphs-2/candidate-package.json', 'utf8'));
const assets = new Map(pkg.assets.map((a) => [a.assetId, a]));
const num = (s) => Number(String(s).replace('−', '-').replace('+', '').split(' ')[0]);
const q = (n) => pkg.questions.find((x) => x.externalId.endsWith(String(n).padStart(3, '0')));
const spec = (id) => pkg.questions.find((x) => x.visualAssetId === id).visualSpec;

test('set 2 visuals are checksum-addressed 640×360 SVGs on disk', () => {
  assert.equal(pkg.schemaVersion, 2);
  for (const a of pkg.assets) {
    assert.ok(existsSync(a.sourceFile), `${a.sourceFile} missing`);
    assert.equal(createHash('sha256').update(readFileSync(a.sourceFile)).digest('hex'), a.sha256);
    assert.ok(a.sourceFile.startsWith(`public/question-assets/${pkg.assetDirectory}/`));
    assert.equal(a.publicUrl, `${pkg.assetBaseUrl}${a.publicPath}`);
    assert.doesNotMatch(a.altText, /correct answer|the answer is/i);
  }
});

test('set 2 follows the Question Bible', () => {
  const positions = [0, 0, 0, 0];
  for (const x of pkg.questions) {
    const a = assets.get(x.visualAssetId);
    assert.equal(x.imageUrl, a.publicUrl);
    assert.equal(x.visualSpec.alt_text, a.altText);
    assert.equal(new Set(x.options.map((o) => o.toLowerCase())).size, 4);
    assert.ok(x.options.includes(x.correctAnswer));
    if (x.options.every((o) => /^[−+]?\d+(\.\d+)?\s\S+$/.test(o))) {
      const v = x.options.map(num);
      assert.deepEqual(v, [...v].sort((m, n) => m - n), `${x.externalId} ascending`);
    }
    positions[x.options.indexOf(x.correctAnswer)] += 1;
    assert.match(x.assessmentProfile.syllabusReference, /^P[1-6]([.][0-9]+){1,4}$/);
    assert.equal(x.assessmentProfile.paperComponent, x.assessmentProfile.syllabusTier === 'core' ? 'paper_1' : 'paper_2');
  }
  assert.deepEqual(positions, [3, 3, 3, 3]);
});

test('set 2 keys agree with the visual data', () => {
  const iv = spec('p4-iv-two-resistors').series;
  const gx = iv[0].points[1][1] / iv[0].points[1][0];
  assert.ok(Math.abs(num(q(1).correctAnswer) - 1 / gx) < 1e-9);
  assert.ok(iv[0].points[1][1] > iv[1].points[1][1]);
  const s = spec('p4-circuit-series').values;
  assert.equal(num(q(3).correctAnswer), s.resistorsOhm[0] + s.resistorsOhm[1]);
  assert.equal(num(q(4).correctAnswer), s.supplyV / (s.resistorsOhm[0] + s.resistorsOhm[1]));
  const p = spec('p4-circuit-parallel').values;
  assert.ok(Math.abs(num(q(5).correctAnswer) - 1 / (1 / p.resistorsOhm[0] + 1 / p.resistorsOhm[1])) < 1e-9);
  assert.equal(num(q(6).correctAnswer), p.supplyV / p.resistorsOhm[0] + p.supplyV / p.resistorsOhm[1]);
  const wave = spec('p3-wave-displacement').series[0].points;
  assert.equal(num(q(7).correctAnswer), Math.max(...wave.map(([, y]) => y)));
  const crests = wave.filter(([, y]) => y === 2).map(([x]) => x);
  assert.equal(num(q(8).correctAnswer), crests[1] - crests[0]);
  assert.ok(Math.abs(num(q(9).correctAnswer) - 5 * (crests[1] - crests[0]) / 100) < 1e-9);
  const t = spec('p1-st-train').series[0].points;
  assert.equal(num(q(10).correctAnswer), ((t[0][1] + t[1][1]) / 2) * (t[1][0] - t[0][0]));
  assert.equal(num(q(11).correctAnswer), (t[1][1] - t[0][1]) / (t[1][0] - t[0][0]));
  assert.equal(num(q(12).correctAnswer), (t[3][1] - t[2][1]) / (t[3][0] - t[2][0]));
});
