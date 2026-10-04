import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const original = JSON.parse(readFileSync('supabase/migrations/20261001115000_economics_0455_paper1_readiness_bank_v1.sql', 'utf8').match(/\$package\$([\s\S]+?)\$package\$::jsonb/)[1]);
const expansion = JSON.parse(readFileSync('content/economics/independent-reassessment-v1.json', 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = options => {
  let value = 0x811c9dc5;
  for (const char of JSON.stringify(options)) { value ^= char.charCodeAt(0); value = Math.imul(value, 0x01000193); }
  return value >>> 0;
};
const shuffled = (values, seed) => [...values].sort((a, b) => hash(`${seed}:${a}`).localeCompare(hash(`${seed}:${b}`)));
const ranked = shuffled(original.questions.map((_, i) => i), 'economics-presentation-v1');
const targets = new Map(ranked.map((index, rank) => [index, rank % 4]));
const plans = {};
const add = (q, target) => {
  const order = shuffled([0, 1, 2, 3].filter(i => q.options[i] !== q.correctAnswer), q.externalId);
  order.splice(target, 0, q.options.indexOf(q.correctAnswer));
  const hex = createHash('md5').update(`registry-verified-question:${q.externalId}`).digest('hex');
  const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  plans[id] = { fingerprint: fingerprint(q.options), order };
};
original.questions.forEach((q, index) => {
  const target = targets.get(index);
  add(q, target);
  const practice = shuffled([1, 2, 3], q.externalId + ':practice');
  const reserve = shuffled([0, 1], q.externalId + ':reserve');
  expansion.questions.slice(index * 5, index * 5 + 5).forEach((item, offset) => add(item, (target + [...practice, ...reserve][offset]) % 4));
});
// No answers or question text are shipped in the presentation manifest.
writeFileSync('services/economicsOptionPresentation.json', JSON.stringify(plans, null, 2) + '\n');
console.log(`Built ${Object.keys(plans).length} stable option permutations.`);
