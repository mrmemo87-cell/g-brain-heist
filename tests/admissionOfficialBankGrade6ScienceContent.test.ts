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
  assert.equal(grade6.source_label, 'Brains Heist Official Admission Bank');
  for (const record of [...grade6.pools, ...grade6.questions]) {
    assert.equal(record.content_version, 'adm-bank-v1-g6-science');
    assert.equal(record.source_label, 'Brains Heist Official Admission Bank');
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
    { question_type: 'mcq', difficulty: 'medium', count: 13 },
    { question_type: 'mcq', difficulty: 'hard', count: 2 },
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

type Grade6Question = typeof grade6.questions[number];

type BlueprintDistribution = Record<string, Record<string, number>>;

const grade6ScienceBlueprintDistribution: BlueprintDistribution = {
  mcq: { hard: 2, medium: 13, easy: 10 },
};

const canonical = (value: string) => value.trim().toLowerCase();

function orderedSqlBuckets(distribution: BlueprintDistribution) {
  const difficultyRank = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy': return 1;
      case 'medium': return 2;
      case 'hard': return 3;
      default: return 100;
    }
  };

  return Object.entries(distribution)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([question_type, difficulties]) => Object.entries(difficulties)
      .sort(([left], [right]) => difficultyRank(left) - difficultyRank(right) || left.localeCompare(right))
      .map(([difficulty, count]) => ({ question_type, difficulty, count })));
}

function insertionOrderSqlBuckets(distribution: BlueprintDistribution) {
  return Object.entries(distribution)
    .flatMap(([question_type, difficulties]) => Object.entries(difficulties)
      .map(([difficulty, count]) => ({ question_type, difficulty, count })));
}

function simulateSqlBatchGeneration(seed: number, distribution: BlueprintDistribution, bucketOrder = orderedSqlBuckets) {
  const random = seededRandom(seed);
  const selected: Grade6Question[] = [];
  const selectedIds = new Set<string>();
  const selectedStems = new Set<string>();
  const selectedCanonical = new Set<string>();
  const fallbackEvents: Array<{ difficulty: string; unavoidable: boolean; repeatedConcepts: string[] }> = [];
  const buckets = bucketOrder(distribution);

  for (const bucket of buckets) {
    const bucketQuestions = grade6.questions
      .filter((question: { question_type: string; difficulty: string }) => question.question_type === bucket.question_type && question.difficulty === bucket.difficulty);

    // The SQL performs an availability COUNT with `ORDER BY ..., RANDOM()` before
    // the first-pass INSERT. Consume the same deterministic random values so the
    // simulation's later RANDOM() calls model the production function's ordering.
    for (const question of bucketQuestions) {
      if (!selectedIds.has(question.external_id) && !selectedStems.has(normalizeStem(question.prompt))) random();
    }

    const laterDifficultyOverlap = (question: { question_type: string; subskill: string; difficulty: string }) => grade6.questions.some((candidate: { question_type: string; subskill: string; difficulty: string }) => (
      candidate.question_type === question.question_type
      && canonical(candidate.subskill) === canonical(question.subskill)
      && orderedSqlBuckets({ [question.question_type]: { [question.difficulty]: 1, hard: 1 } }).some((orderedBucket, index, orderedBuckets) => {
        const currentIndex = orderedBuckets.findIndex((item) => item.difficulty === question.difficulty);
        return index > currentIndex && orderedBucket.difficulty === candidate.difficulty;
      })
    )) ? 1 : 0;

    const candidates = bucketQuestions
      .map((question: Grade6Question) => ({ question, overlap: laterDifficultyOverlap(question), sort: random() }))
      .sort((a: { overlap: number; sort: number }, b: { overlap: number; sort: number }) => a.overlap - b.overlap || a.sort - b.sort)
      .map((entry: { question: Grade6Question }) => entry.question);

    const availableUniqueConcepts = new Set(candidates
      .filter((question: { external_id: string; prompt: string; subskill: string }) => !selectedIds.has(question.external_id) && !selectedStems.has(normalizeStem(question.prompt)) && !selectedCanonical.has(canonical(question.subskill)))
      .map((question: { subskill: string }) => canonical(question.subskill))).size;

    const selectedBeforeFallback = selected.length;
    const firstPassConcepts = new Set<string>();
    for (const question of candidates) {
      if (selected.filter((item: { difficulty: string }) => item.difficulty === bucket.difficulty).length >= bucket.count) break;
      const stem = normalizeStem(question.prompt);
      const concept = canonical(question.subskill);
      if (selectedIds.has(question.external_id) || selectedStems.has(stem) || selectedCanonical.has(concept) || firstPassConcepts.has(concept)) continue;
      selected.push(question);
      selectedIds.add(question.external_id);
      selectedStems.add(stem);
      selectedCanonical.add(concept);
      firstPassConcepts.add(concept);
    }

    assert.ok(firstPassConcepts.size <= availableUniqueConcepts);
    const remaining = bucket.count - selected.filter((item: { difficulty: string }) => item.difficulty === bucket.difficulty).length;
    if (remaining > 0) {
      const fallbackBase = candidates
        .filter((question: { external_id: string; prompt: string }) => !selectedIds.has(question.external_id) && !selectedStems.has(normalizeStem(question.prompt)))
        .map((question: Grade6Question) => ({
          question,
          concept: canonical(question.subskill),
          existing: selected.filter((item: { subskill: string }) => canonical(item.subskill) === canonical(question.subskill)).length,
          sort: random(),
        }))
        .sort((a: { concept: string; sort: number }, b: { concept: string; sort: number }) => a.concept.localeCompare(b.concept) || a.sort - b.sort);
      const conceptRounds = new Map<string, number>();
      const byExistingConcept = fallbackBase
        .map((entry: { question: Grade6Question; concept: string; existing: number; sort: number }) => {
          const subskillRound = (conceptRounds.get(entry.concept) ?? 0) + 1;
          conceptRounds.set(entry.concept, subskillRound);
          return { ...entry, subskillRound };
        })
        .sort((a: { existing: number; subskillRound: number; sort: number }, b: { existing: number; subskillRound: number; sort: number }) => a.existing - b.existing || a.subskillRound - b.subskillRound || a.sort - b.sort);
      const fallbackQuestions = byExistingConcept.slice(0, remaining).map(({ question }: { question: Grade6Question }) => question);
      fallbackEvents.push({
        difficulty: bucket.difficulty,
        unavoidable: availableUniqueConcepts < bucket.count,
        repeatedConcepts: fallbackQuestions
          .map((question: { subskill: string }) => canonical(question.subskill))
          .filter((concept: string) => selected.slice(0, selectedBeforeFallback).some((item: { subskill: string }) => canonical(item.subskill) === concept)),
      });
      for (const question of fallbackQuestions) {
        selected.push(question);
        selectedIds.add(question.external_id);
        selectedStems.add(normalizeStem(question.prompt));
        selectedCanonical.add(canonical(question.subskill));
      }
    }
  }

  return { selected, selectedIds, selectedStems, fallbackEvents, buckets };
}

function strandInterleavedOrder(selected: Grade6Question[], seed: number) {
  const random = seededRandom(seed + 10_000);
  const strandRounds = new Map<string, number>();
  return selected
    .map((question) => ({ question, strandSort: random(), randomOrder: random() }))
    .sort((a, b) => a.question.strand.localeCompare(b.question.strand) || a.strandSort - b.strandSort)
    .map((entry) => {
      const strandRound = (strandRounds.get(entry.question.strand) ?? 0) + 1;
      strandRounds.set(entry.question.strand, strandRound);
      return { ...entry, strandRound };
    })
    .sort((a, b) => a.strandRound - b.strandRound || a.randomOrder - b.randomOrder)
    .map(({ question }) => question);
}

function conceptsForDifficulty(difficulty: string) {
  return new Set(grade6.questions
    .filter((question: { question_type: string; difficulty: string }) => question.question_type === 'mcq' && question.difficulty === difficulty)
    .map((question: { subskill: string }) => canonical(question.subskill)));
}

test('Grade 6 Science candidate graph proves 22 canonical concepts is the achievable maximum', () => {
  const easyConcepts = conceptsForDifficulty('easy');
  const mediumConcepts = conceptsForDifficulty('medium');
  const hardConcepts = conceptsForDifficulty('hard');
  const mediumHardOverlap = [...hardConcepts].filter((concept) => mediumConcepts.has(concept));
  const hardOnlyConcepts = [...hardConcepts].filter((concept) => !mediumConcepts.has(concept));

  assert.equal(easyConcepts.size, 11);
  assert.equal(mediumConcepts.size, 11);
  assert.equal(hardConcepts.size, 3);
  assert.deepEqual(mediumHardOverlap.sort(), ['controlled variables', 'reliability and repeated trials']);
  assert.deepEqual(hardOnlyConcepts, ['recording results in tables']);

  const easyMaximum = Math.min(10, easyConcepts.size);
  const mediumMaximum = Math.min(13, mediumConcepts.size);
  const hardMaximumNewConceptsAfterMedium = Math.min(2, hardOnlyConcepts.length);
  const theoreticalMaximum = easyMaximum + mediumMaximum + hardMaximumNewConceptsAfterMedium;

  assert.equal(mediumMaximum, 11, 'medium has only 11 concepts for 13 required slots');
  assert.equal(theoreticalMaximum, 22, 'actual 10/13/2 constraints cannot produce 23 global concepts');

  for (let seed = 1; seed <= 100; seed += 1) {
    const { selected } = simulateSqlBatchGeneration(seed, grade6ScienceBlueprintDistribution);
    const selectedConcepts = new Set(selected.map((question: { subskill: string }) => canonical(question.subskill)));
    assert.equal(selectedConcepts.size, theoreticalMaximum, `seed ${seed} did not reach the candidate-graph maximum`);
  }
});

test('simulated fixed SQL batch generation follows ordered difficulty buckets and limits repeats to unavoidable fallback only', () => {
  // Production Grade 6 Science uses 10 easy, 13 medium, and 2 hard MCQs.
  // Medium has only 11 eligible canonical concepts, so two medium repeats are
  // unavoidable; hard contributes one hard-only concept plus one concept that
  // necessarily overlaps medium. The optimum is therefore 22 distinct concepts
  // and 3 repeated slots, not the older 23-concept / 2-repeat expectation.
  assert.deepEqual(orderedSqlBuckets(grade6ScienceBlueprintDistribution), [
    { question_type: 'mcq', difficulty: 'easy', count: 10 },
    { question_type: 'mcq', difficulty: 'medium', count: 13 },
    { question_type: 'mcq', difficulty: 'hard', count: 2 },
  ]);

  for (let seed = 1; seed <= 100; seed += 1) {
    const { selected, selectedIds, selectedStems, fallbackEvents } = simulateSqlBatchGeneration(seed, grade6ScienceBlueprintDistribution);

    assert.equal(selected.length, 25);
    assert.equal(selectedIds.size, 25, `seed ${seed} selected duplicate question IDs`);
    assert.equal(selectedStems.size, 25, `seed ${seed} selected duplicate normalized stems`);

    const byDifficulty = (difficulty: string) => selected.filter((question: { difficulty: string }) => question.difficulty === difficulty);
    assert.equal(byDifficulty('easy').length, 10);
    assert.equal(byDifficulty('medium').length, 13);
    assert.equal(byDifficulty('hard').length, 2);

    const conceptCounts = new Map<string, number>();
    for (const question of selected) conceptCounts.set(canonical(question.subskill), (conceptCounts.get(canonical(question.subskill)) ?? 0) + 1);
    const repeatedSlots = selected.length - conceptCounts.size;
    assert.equal(conceptCounts.size, 22, `seed ${seed} selected ${conceptCounts.size} distinct canonical concepts`);
    assert.equal(repeatedSlots, 3, `seed ${seed} had ${repeatedSlots} repeated slots`);
    assert.ok(Math.max(...conceptCounts.values()) <= 2, `seed ${seed} selected a concept too often`);

    assert.ok(fallbackEvents.every((event) => event.unavoidable), `seed ${seed} used avoidable fallback`);
    assert.deepEqual(fallbackEvents.map((event) => event.difficulty), ['medium', 'hard'], `seed ${seed} fallback difficulties changed`);

    const conceptsByDifficulty = (difficulty: string) => new Map<string, number>();
    const easyConceptCounts = conceptsByDifficulty('easy');
    for (const question of byDifficulty('easy')) easyConceptCounts.set(canonical(question.subskill), (easyConceptCounts.get(canonical(question.subskill)) ?? 0) + 1);
    const mediumConceptCounts = conceptsByDifficulty('medium');
    for (const question of byDifficulty('medium')) mediumConceptCounts.set(canonical(question.subskill), (mediumConceptCounts.get(canonical(question.subskill)) ?? 0) + 1);
    const hardConceptCounts = conceptsByDifficulty('hard');
    for (const question of byDifficulty('hard')) hardConceptCounts.set(canonical(question.subskill), (hardConceptCounts.get(canonical(question.subskill)) ?? 0) + 1);

    assert.equal(easyConceptCounts.size, 10, `seed ${seed} easy distinct concepts changed`);
    assert.equal(mediumConceptCounts.size, 11, `seed ${seed} medium distinct concepts changed`);
    assert.equal(hardConceptCounts.size, 2, `seed ${seed} hard distinct concepts changed`);
    assert.equal(byDifficulty('easy').length - easyConceptCounts.size, 0, `seed ${seed} repeated an easy concept`);
    assert.equal(byDifficulty('medium').length - mediumConceptCounts.size, 2, `seed ${seed} medium repeated slots changed`);
    assert.equal(byDifficulty('hard').length - hardConceptCounts.size, 0, `seed ${seed} repeated a hard concept`);

    const mediumConcepts = new Set(mediumConceptCounts.keys());
    const hardConcepts = new Set(hardConceptCounts.keys());
    const hardOverlapsMedium = [...hardConcepts].filter((concept) => mediumConcepts.has(concept));
    assert.equal(hardOverlapsMedium.length, 1, `seed ${seed} hard/medium overlap count changed`);

    const finalOrder = strandInterleavedOrder(selected, seed);
    const strandOrder = finalOrder.map((question: { strand: string }) => question.strand);
    assert.ok(new Set(strandOrder.slice(0, 6)).size > 1, `seed ${seed} lost strand interleaving`);
  }
});

test('Grade 6 Science simulation exposes why SQL difficulty buckets must be explicitly ordered', () => {
  const unorderedResult = simulateSqlBatchGeneration(1, grade6ScienceBlueprintDistribution, insertionOrderSqlBuckets);
  assert.deepEqual(unorderedResult.buckets.map((bucket) => bucket.difficulty), ['hard', 'medium', 'easy']);
  assert.ok(
    unorderedResult.fallbackEvents.some((event) => event.difficulty === 'medium'),
    'expected the hard-first simulation to require medium fallback without explicit SQL difficulty ordering',
  );
});

test('canonical subskill normalization collapses casing and whitespace differences', () => {
  const canonical = (value: string) => value.trim().toLowerCase();
  assert.equal(canonical(' Thermal conduction '), canonical('thermal conduction'));
  assert.equal(canonical('Plants require light'), canonical(' plants require light '));
});
