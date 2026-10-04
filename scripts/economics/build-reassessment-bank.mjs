import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Packaging only: all stems, answers, distractors and explanations are authored
// in expansion-items.txt. This does not generate parameter-swapped questions.
const originalSql = readFileSync('supabase/migrations/20261001115000_economics_0455_paper1_readiness_bank_v1.sql', 'utf8');
const original = JSON.parse(originalSql.match(/\$package\$([\s\S]+?)\$package\$::jsonb/)[1]);
const sections = new Map();
let section;
for (const raw of readFileSync('content/economics/expansion-items.txt', 'utf8').split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  if (/^\[\d+\]$/.test(line)) {
    section = Number(line.slice(1, -1));
    assert.ok(!sections.has(section));
    sections.set(section, []);
  } else {
    const fields = line.split('|').map(value => value.trim());
    assert.equal(fields.length, 6, line);
    assert.ok(fields.every(Boolean));
    sections.get(section).push(fields);
  }
}
assert.equal(sections.size, 40);
const knowledge = new Set(['1:2','1:4','2:4','6:3','11:2','14:1','14:2','14:4','17:3','18:5','19:1','19:2','19:5','23:2','23:4','25:1','25:4','27:3','29:3','31:3','32:5','33:1','33:5','35:3','35:4','37:1','37:3','38:1','38:2']);
const calculation = new Set(['11:3','13:1','13:2','13:3','13:4','13:5','15:1','15:4','20:2','23:3','24:1','24:2','24:3','24:4','24:5','29:2','29:5','32:1','32:3','32:4','36:2','36:3','40:1']);
const diagrams = new Set(['4:1','4:2','4:3','4:4','4:5','8:1','8:2','8:4','9:5','10:2','10:5']);
const contexts = new Set(['3:1','3:2','3:3','3:4','3:5','20:4','34:1','36:3','40:5']);
const conditions = new Set(['15:5','26:4','27:4','34:4','39:5']);
const chains = new Set(['12:2','12:5','16:4','17:2','21:1','25:2','25:3','26:2','27:2','27:5','28:1','28:2','35:2','39:3','39:4','40:3']);
const reasoningTemplates = new Map(original.questions.flatMap(q => q.taxonomies.slice(1).map(t => [t.atomicSubskillCode, t])));
const secondary = (code, statement) => ({ ...reasoningTemplates.get(code), evidenceStatement: statement });
const questions = [];
for (const [number, items] of sections) {
  assert.equal(items.length, 5, `Subskill ${number} requires five distinct new items`);
  const base = original.questions[number - 1];
  items.forEach(([questionText, correctAnswer, ...rest], index) => {
    const key = `${number}:${index + 1}`;
    const explanation = rest.pop();
    const options = [...rest];
    options.splice(questions.length % 4, 0, correctAnswer);
    const ao = knowledge.has(key) ? 'AO1' : 'AO2';
    const primary = { ...base.taxonomies[0], assessmentProcessCode: ao === 'AO1' ? 'BH-AO1' : 'BH-AO2', cognitiveProcess: ao === 'AO1' ? 'understand' : 'apply', evidenceStatement: explanation };
    const taxonomies = [primary];
    if (calculation.has(key)) taxonomies.push(secondary('econ.reasoning.data.calculation', `Select the correct economic calculation or proportional comparison: ${explanation}`));
    if (diagrams.has(key)) taxonomies.push(secondary('econ.reasoning.data.diagram', `Interpret the described diagram, curve or movement: ${explanation}`));
    if (contexts.has(key)) taxonomies.push(secondary('econ.reasoning.analysis.context-application', `Use the stated context to select the appropriate economic conclusion: ${explanation}`));
    if (conditions.has(key)) taxonomies.push(secondary('econ.reasoning.evaluation.conditions', `Recognise a condition or limitation of the proposed conclusion: ${explanation}`));
    if (chains.has(key)) taxonomies.push(secondary('econ.reasoning.analysis.causal-chain', `Recognise the direction of the stated economic mechanism: ${explanation}`));
    assert.ok(taxonomies.length <= 4);
    questions.push({
      ...base,
      externalId: `bh-econ-0455-expand-v1-${String(number).padStart(2, '0')}-${index + 1}`,
      questionText, options, correctAnswer, explanation, hints: [], taxonomies,
      difficulty: index === 0 ? 'easy' : 'medium',
      tags: ['economics', 'igcse', '0455', 'paper-1', index < 3 ? 'purpose:practice' : 'purpose:reassessment', `subskill:${primary.atomicSubskillCode}`, base.tags.at(-1)],
      assessmentProfile: { ...base.assessmentProfile, primaryAssessmentObjective: ao, assessmentObjectives: [ao], sourceReference: 'Original Brains Heist item aligned to the public 0455 2027–2029 syllabus. MCQ selection evidence; not a Cambridge question or a measure of independently written evaluation.' },
    });
  });
}
const bank = {
  schemaVersion: 1, packageId: 'economics-0455-independent-reassessment-v1', packageVersion: '1.0.0',
  contentVersion: 'bh-economics-reassessment-2026-1', registryVersion: original.registryVersion,
  subjectCode: 'economics', authority: 'Brains Heist Original Content — automated governance and authored answer review',
  releaseNotes: '200 original items: three practice and two reassessment candidates for each of the 40 existing content subskills. Roles guide selection, not automatic evidence eligibility. Freshness and practice provenance determine independence. No Cambridge endorsement, human specialist certification or empirical difficulty calibration is claimed.',
  questions,
};
const path = 'content/economics/independent-reassessment-v1.json';
writeFileSync(path, JSON.stringify(bank, null, 2) + '\n');
const bySubskill = new Map();
for (const q of [...original.questions, ...questions]) for (const tx of q.taxonomies) bySubskill.set(tx.atomicSubskillCode, (bySubskill.get(tx.atomicSubskillCode) || 0) + 1);
assert.equal(questions.length, 200);
assert.ok([...bySubskill.values()].every(n => n >= 6));
console.log(JSON.stringify({ path, newItems: questions.length, totalItems: 240, assessedSubskills: bySubskill.size, minimumItemsPerSubskill: Math.min(...bySubskill.values()), taxonomies: questions.reduce((n, q) => n + q.taxonomies.length, 0) }));
