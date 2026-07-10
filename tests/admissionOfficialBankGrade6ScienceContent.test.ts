import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const grade6 = JSON.parse(readFileSync('supabase/seed/admission-official-bank/science/grade_6.json', 'utf8'));

test('Grade 6 Science official bank v1 has required question count and MCQ shape', () => {
  assert.equal(grade6.questions.length, 70);
  for (const question of grade6.questions) {
    assert.equal(question.question_type, 'mcq');
    assert.equal(question.options.length, 4);
    assert.equal(question.correct_answer, question.options[question.correct_index]);
  }
});

test('Grade 6 Science official bank v1 has intended placement band distribution', () => {
  const byBand = new Map<string, number>();
  for (const question of grade6.questions) byBand.set(question.placement_band, (byBand.get(question.placement_band) ?? 0) + 1);
  assert.equal(byBand.get('foundation'), 26);
  assert.equal(byBand.get('target'), 34);
  assert.equal(byBand.get('stretch'), 10);
});

test('Grade 6 Science official bank v1 has intended strand distribution', () => {
  const byStrand = new Map<string, number>();
  for (const question of grade6.questions) byStrand.set(question.strand, (byStrand.get(question.strand) ?? 0) + 1);
  assert.equal(byStrand.get('biology / living things'), 14);
  assert.equal(byStrand.get('materials / chemistry'), 12);
  assert.equal(byStrand.get('forces / physics'), 12);
  assert.equal(byStrand.get('energy, light, sound, and electricity'), 12);
  assert.equal(byStrand.get('earth and space'), 8);
  assert.equal(byStrand.get('scientific enquiry / working scientifically'), 12);
});

test('Grade 6 Science official bank v1 uses production metadata and no sample labels', () => {
  assert.equal(grade6.content_version, 'adm-bank-v1-g6-science');
  assert.equal(grade6.source_label, 'Brain Heist Official Admission Bank');
  for (const record of [...grade6.pools, ...grade6.questions]) {
    assert.equal(record.content_version, 'adm-bank-v1-g6-science');
    assert.equal(record.source_label, 'Brain Heist Official Admission Bank');
    assert.equal(record.is_official, true);
    assert.equal(record.is_locked, true);
    assert.equal(record.content_owner, 'brain_heist');
  }
});


const broadGrade6ScienceStrands = new Set([
  'biology / living things',
  'materials / chemistry',
  'forces / physics',
  'energy, light, sound, and electricity',
  'earth and space',
  'scientific enquiry / working scientifically',
]);

function byShortId(id: string) {
  const question = grade6.questions.find((item: { external_id: string }) => item.external_id.endsWith(id));
  assert.ok(question, `Missing ${id}`);
  return question as { external_id: string; subskill: string; prompt: string; question_type: string; difficulty: string };
}

function normalizeStem(stem: string) {
  return stem.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('Grade 6 Science official bank uses concept-level subskills instead of broad strand labels', () => {
  const subskills = new Set<string>();
  for (const question of grade6.questions) {
    assert.ok(question.subskill);
    assert.ok(!broadGrade6ScienceStrands.has(question.subskill), `${question.external_id} still uses broad strand as subskill`);
    assert.notEqual(question.subskill, question.strand);
    subskills.add(question.subskill);
  }
  assert.ok(subskills.size >= 20, `Expected at least 20 canonical subskills, found ${subskills.size}`);
});

test('Grade 6 Science known semantic duplicate groups share canonical subskills', () => {
  for (const [expected, ids] of [
    ['Thermal conduction', ['q023', 'q021', 'q015']],
    ['Air resistance and parachutes', ['q034', 'q038', 'q030']],
    ['Plants require light', ['q009', 'q001']],
    ['Friction between surfaces', ['q033', 'q037']],
  ] as const) {
    assert.deepEqual(ids.map((id) => byShortId(id).subskill), ids.map(() => expected));
  }
});

test('Grade 6 Science official bank count and blueprint-relevant distributions are unchanged', () => {
  assert.equal(grade6.questions.length, 70);
  const byDifficulty = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const question of grade6.questions) {
    byDifficulty.set(question.difficulty, (byDifficulty.get(question.difficulty) ?? 0) + 1);
    byType.set(question.question_type, (byType.get(question.question_type) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(byDifficulty), { easy: 26, medium: 34, hard: 10 });
  assert.deepEqual(Object.fromEntries(byType), { mcq: 70 });
});

test('simulated 25-question Grade 6 Science generation prefers unique subskills before shortage fallback', () => {
  const blueprint = [
    { question_type: 'mcq', difficulty: 'easy', count: 10 },
    { question_type: 'mcq', difficulty: 'medium', count: 11 },
    { question_type: 'mcq', difficulty: 'hard', count: 4 },
  ];

  for (let seed = 1; seed <= 30; seed += 1) {
    const random = seededRandom(seed);
    const selected: typeof grade6.questions = [];
    const selectedSubskills = new Set<string>();
    const selectedStems = new Set<string>();
    const selectedIds = new Set<string>();
    const fallbackChecks: boolean[] = [];

    for (const bucket of blueprint) {
      const candidates = grade6.questions
        .filter((question: { question_type: string; difficulty: string }) => question.question_type === bucket.question_type && question.difficulty === bucket.difficulty)
        .map((question: unknown) => ({ question, sort: random() }))
        .sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort)
        .map((entry: { question: typeof grade6.questions[number] }) => entry.question);

      const hasUniqueSubskillCandidate = () => candidates.some((question: { external_id: string; prompt: string; subskill: string }) => {
        const stem = normalizeStem(question.prompt);
        return !selectedIds.has(question.external_id) && !selectedStems.has(stem) && !selectedSubskills.has(question.subskill);
      });

      const pick = (allowRepeatedSubskill: boolean) => {
        for (const question of candidates) {
          const stem = normalizeStem(question.prompt);
          if (selectedIds.has(question.external_id) || selectedStems.has(stem)) continue;
          if (!allowRepeatedSubskill && selectedSubskills.has(question.subskill)) continue;
          selected.push(question);
          selectedIds.add(question.external_id);
          selectedStems.add(stem);
          selectedSubskills.add(question.subskill);
          return true;
        }
        return false;
      };

      for (let i = 0; i < bucket.count; i += 1) {
        if (!pick(false)) {
          fallbackChecks.push(!hasUniqueSubskillCandidate());
          assert.ok(pick(true), `shortage fallback could not fill ${bucket.difficulty}`);
        }
      }
    }

    assert.equal(selected.length, 25);
    assert.equal(selectedIds.size, 25);
    assert.equal(selectedStems.size, 25);
    assert.ok(selectedSubskills.size >= 20, `seed ${seed} selected only ${selectedSubskills.size} distinct subskills`);
    assert.deepEqual(
      blueprint.map((bucket) => selected.filter((question: { question_type: string; difficulty: string }) => question.question_type === bucket.question_type && question.difficulty === bucket.difficulty).length),
      blueprint.map((bucket) => bucket.count),
    );

    assert.ok(fallbackChecks.every(Boolean), `seed ${seed} used fallback while a unique-subskill candidate was still available`);
  }
});
