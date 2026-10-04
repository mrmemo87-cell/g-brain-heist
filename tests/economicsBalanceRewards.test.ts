import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { economicsDisplayOptions, questionGameXp } from '../services/economicsOptionPresentation';

const original = JSON.parse(readFileSync('supabase/migrations/20261001115000_economics_0455_paper1_readiness_bank_v1.sql', 'utf8').match(/\$package\$([\s\S]+?)\$package\$::jsonb/)![1]).questions;
const expansion = JSON.parse(readFileSync('content/economics/independent-reassessment-v1.json', 'utf8')).questions;
const id = (externalId: string) => {
  const hex = createHash('md5').update(`registry-verified-question:${externalId}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const counts = (items: any[]) => items.reduce((totals: number[], q: any) => {
  const options = economicsDisplayOptions(id(q.externalId), q.options as string[]);
  totals[options.indexOf(q.correctAnswer)]++;
  return totals;
}, [0,0,0,0]);

test('Economics presentation balances original diagnostic, practice, reserve and all 240 items', () => {
  assert.deepEqual(counts(original), [10,10,10,10]);
  assert.deepEqual(counts(expansion), [50,50,50,50]);
  assert.deepEqual(counts(expansion.filter((q: any) => q.tags.includes('purpose:practice'))), [30,30,30,30]);
  assert.deepEqual(counts(expansion.filter((q: any) => q.tags.includes('purpose:reassessment'))), [20,20,20,20]);
  assert.deepEqual(counts([...original,...expansion]), [60,60,60,60]);
  original.forEach((q: any, index: number) => assert.deepEqual(counts([q,...expansion.slice(index*5,index*5+5)]).sort(), [1,1,2,2]));
});

test('presentation preserves answers and immutable source, survives repeated calls, and keeps print labels consistent', () => {
  for (const q of [...original,...expansion]) {
    const before = JSON.stringify(q.options);
    const options = economicsDisplayOptions(id(q.externalId), q.options as string[]);
    assert.deepEqual([...options].sort(), [...q.options].sort());
    assert.ok(options.includes(q.correctAnswer));
    assert.equal(JSON.stringify(q.options), before);
    assert.deepEqual(economicsDisplayOptions(id(q.externalId), options), options);
    const printed = economicsDisplayOptions<{text: string}>(id(q.externalId), q.options.map((text: string) => ({text})));
    assert.deepEqual(printed.map((o: {text: string}) => o.text), options);
  }
  const changed = ['Changed option','B','C','D'];
  assert.equal(economicsDisplayOptions(id(original[0].externalId), changed), changed);
  assert.equal(economicsDisplayOptions('unrelated', changed), changed);
});

test('one assessment mark previews standard gameplay rewards without changing marks', () => {
  for (const [difficulty, xp, coins] of [['easy',15,22],['medium',20,30],['hard',30,45]] as const) {
    const q = { points: 1, difficulty, verification_status: 'verified', analytics_eligible: true };
    assert.equal(questionGameXp(q), xp);
    assert.equal(Math.floor(questionGameXp(q)*1.5), coins);
    assert.equal(q.points, 1);
  }
  assert.equal(questionGameXp({points:1,difficulty:'hard'}), 1);
  assert.equal(questionGameXp({points:25}), 25);
});
