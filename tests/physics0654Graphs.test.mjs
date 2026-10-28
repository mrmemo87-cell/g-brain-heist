import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('content/physics-0654-graphs/candidate-package.json', 'utf8'));
const assets = new Map(pkg.assets.map((a) => [a.assetId, a]));
const num = (s) => Number(String(s).replace('−', '-').replace('+', '').split(' ')[0]);

test('every graph is a checksum-addressed 640×360 SVG on disk', () => {
  assert.equal(pkg.schemaVersion, 2);
  assert.equal(pkg.assetBaseUrl, 'https://www.brainsheist.com');
  for (const a of pkg.assets) {
    assert.ok(existsSync(a.sourceFile), `${a.sourceFile} missing`);
    const svg = readFileSync(a.sourceFile);
    assert.equal(createHash('sha256').update(svg).digest('hex'), a.sha256, `${a.assetId} checksum`);
    assert.ok(a.sourceFile.startsWith(`public/question-assets/${pkg.assetDirectory}/`));
    assert.ok(a.publicPath.includes(a.sha256.slice(0, 12)));
    assert.equal(a.publicUrl, `${pkg.assetBaseUrl}${a.publicPath}`);
    assert.match(svg.toString(), /width="640" height="360"/);
    assert.ok(a.altText.length >= 20 && a.altText.length <= 240);
    assert.doesNotMatch(a.altText, /correct answer|the answer is/i);
  }
});

test('questions follow the Question Bible', () => {
  const positions = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const q of pkg.questions) {
    const a = assets.get(q.visualAssetId);
    assert.ok(a, `${q.externalId} asset`);
    assert.equal(q.imageUrl, a.publicUrl);
    assert.equal(q.imageAltText, a.altText);
    assert.equal(q.visualAssetSha256, a.sha256);
    assert.equal(q.visualSpec.alt_text, a.altText);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 4);
    assert.ok(q.options.includes(q.correctAnswer));
    if (q.options.every((o) => /^[−+]?\d+(\.\d+)?\s\S+$/.test(o))) {
      const values = q.options.map(num);
      assert.deepEqual(values, [...values].sort((x, y) => x - y), `${q.externalId} numeric options ascending`);
    }
    positions[q.options.indexOf(q.correctAnswer)] += 1;
    assert.ok(q.explanation.length >= 20);
    assert.match(q.assessmentProfile.syllabusReference, /^P1([.][0-9]+){1,4}$/);
    assert.equal(q.assessmentProfile.paperComponent, q.assessmentProfile.syllabusTier === 'core' ? 'paper_1' : 'paper_2');
    assert.match(q.assessmentProfile.sourceReference, /Not a Cambridge exam item/);
    assert.ok(q.taxonomies[0].evidenceFocusCode.startsWith(`${q.taxonomies[0].atomicSubskillCode}.focus.`));
  }
  assert.deepEqual(Object.values(positions), [3, 3, 3, 3], 'A–D balance');
  assert.ok(pkg.assets.every((a) => pkg.questions.some((q) => q.visualAssetId === a.assetId)), 'no unused asset');
});

test('keys agree with the graph data', () => {
  const pts = (id) => pkg.questions.find((q) => q.visualAssetId === id).visualSpec.series[0].points;
  const car = pts('p1-dt-car-journey');
  const cyc = pts('p1-st-cyclist');
  const spring = pts('p1-le-spring');
  const key = (n) => pkg.questions.find((q) => q.externalId.endsWith(String(n).padStart(3, '0'))).correctAnswer;
  assert.equal(num(key(2)), (car[1][1] - car[0][1]) / (car[1][0] - car[0][0]));
  assert.equal(num(key(3)), car[3][1] / car[3][0]);
  assert.equal(num(key(4)), cyc[1][1] * (cyc[2][0] - cyc[1][0]));
  assert.equal(num(key(5)), 0.5 * cyc[1][0] * cyc[1][1] + cyc[1][1] * (cyc[2][0] - cyc[1][0]) + 0.5 * (cyc[3][0] - cyc[2][0]) * cyc[2][1]);
  assert.equal(num(key(6)), cyc[1][1] / cyc[1][0]);
  assert.equal(num(key(7)), (cyc[3][1] - cyc[2][1]) / (cyc[3][0] - cyc[2][0]));
  assert.ok(Math.abs(num(key(11)) - spring[6][0] / (spring[6][1] / 100)) < 1e-9);
  assert.equal(num(key(12)), spring[6][0]);
  assert.equal(spring[6][1] / spring[6][0], spring[3][1] / spring[3][0]);
  assert.notEqual(spring[7][1] / spring[7][0], spring[3][1] / spring[3][0]);
});

test('registry import migration accepts v2 visuals and hashes the image', () => {
  const sql = readFileSync('supabase/migrations/20261028090000_registry_mcq_visual_assets.sql', 'utf8');
  assert.match(sql, /schema_version in \(1, 2\)/);
  assert.match(sql, /nullif\(trim\(v_question->>'imageUrl'\),''\),\n      'multiple_choice'/);
  assert.match(sql, /registry_visuals_require_schema_v2/);
  assert.match(sql, /registry_visual_asset_link_mismatch/);
});
