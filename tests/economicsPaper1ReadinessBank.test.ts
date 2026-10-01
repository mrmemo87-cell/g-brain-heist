import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const importer = readFileSync(
  'supabase/migrations/20261001114500_registry_verified_mcq_package_importer.sql',
  'utf8',
);
const bankMigration = readFileSync(
  'supabase/migrations/20261001115000_economics_0455_paper1_readiness_bank_v1.sql',
  'utf8',
);

const packageMatch = bankMigration.match(/\$package\$([\s\S]+?)\$package\$::jsonb/);
assert.ok(packageMatch, 'embedded Economics package JSON must exist');
const bank = JSON.parse(packageMatch[1]) as {
  schemaVersion: number;
  packageId: string;
  packageVersion: string;
  registryVersion: string;
  subjectCode: string;
  questions: Array<{
    externalId: string;
    difficulty: string;
    questionType: string;
    questionText: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    timeLimit: number;
    points: number;
    language: string;
    eligibleGrades: number[];
    tags: string[];
    taxonomies: Array<{
      primarySkillCode: string;
      atomicSubskillCode: string;
      evidenceFocusCode: string;
      assessmentProcessCode: string;
      cognitiveProcess: string;
      evidenceStatement: string;
    }>;
    assessmentProfile: {
      providerName: string;
      programmeCode: string;
      sourceVersion: string;
      paperComponent: string;
      paperSection: string | null;
      evidenceMode: string;
      primaryAssessmentObjective: string;
      assessmentObjectives: string[];
    };
  }>;
};

test('registry MCQ importer is service-role-only and atomic by contract', () => {
  assert.match(importer, /security invoker/i);
  assert.match(
    importer,
    /revoke all on function public\.rpc_import_registry_verified_mcq_package\(jsonb,boolean\)[\s\S]*from public,anon,authenticated/i,
  );
  assert.match(
    importer,
    /grant execute on function public\.rpc_import_registry_verified_mcq_package\(jsonb,boolean\)[\s\S]*to service_role/i,
  );
  assert.match(importer, /Validate the entire package before writing any rows/i);
  assert.match(importer, /if p_dry_run then/);
  assert.match(importer, /registry_verified_package_version_hash_conflict/);
  assert.match(importer, /active_registry_verified_question_duplicate/);
  assert.match(importer, /duplicate_external_id_inside_registry_verified_package/);
  assert.match(importer, /duplicate_content_inside_registry_verified_package/);
});

test('registry MCQ importer validates canonical taxonomy before publication', () => {
  assert.match(importer, /published_registry_version_not_found/);
  assert.match(importer, /registry_primary_skill_not_found/);
  assert.match(importer, /registry_atomic_subskill_not_found/);
  assert.match(importer, /registry_evidence_focus_not_found/);
  assert.match(importer, /registry_taxonomy_process_cognitive_mismatch/);
  assert.match(importer, /verified_question_registry_taxonomy/);
  assert.match(importer, /rpc_govern_verified_question_assessment_profile/);
});

test('registry MCQ release ledger is hidden from client roles', () => {
  assert.match(importer, /enable row level security/);
  assert.match(
    importer,
    /revoke all on table public\.registry_verified_question_import_releases[\s\S]*from public,anon,authenticated/i,
  );
  assert.match(
    importer,
    /grant select,insert on table public\.registry_verified_question_import_releases[\s\S]*to service_role/i,
  );
});

test('Economics Paper 1 readiness bank has exactly 40 original governed MCQs', () => {
  assert.equal(bank.schemaVersion, 1);
  assert.equal(bank.packageId, 'economics-0455-paper1-readiness-v1');
  assert.equal(bank.packageVersion, '1.0.0');
  assert.equal(bank.registryVersion, 'bh-economics-core-v1');
  assert.equal(bank.subjectCode, 'economics');
  assert.equal(bank.questions.length, 40);
  assert.equal(new Set(bank.questions.map((question) => question.externalId)).size, 40);

  bank.questions.forEach((question, index) => {
    assert.equal(question.externalId, `bh-econ-0455-p1-v1-${String(index + 1).padStart(3, '0')}`);
    assert.equal(question.questionType, 'multiple_choice');
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map((option) => option.trim().toLowerCase())).size, 4);
    assert.ok(question.options.includes(question.correctAnswer));
    assert.ok(question.questionText.length >= 25);
    assert.ok(question.explanation.length >= 35);
    assert.equal(question.points, 1);
    assert.equal(question.timeLimit, 90);
    assert.equal(question.language, 'en');
    assert.deepEqual(question.eligibleGrades, [10, 11]);
  });
});

test('Paper 1 bank is exactly balanced across external AO1 and AO2', () => {
  const counts = bank.questions.reduce<Record<string, number>>((acc, question) => {
    const ao = question.assessmentProfile.primaryAssessmentObjective;
    acc[ao] = (acc[ao] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, { AO1: 20, AO2: 20 });

  bank.questions.forEach((question) => {
    const profile = question.assessmentProfile;
    assert.equal(profile.providerName, 'Cambridge International Education');
    assert.equal(profile.programmeCode, '0455');
    assert.equal(profile.sourceVersion, '2027-2029');
    assert.equal(profile.paperComponent, 'paper_1');
    assert.equal(profile.paperSection, null);
    assert.equal(profile.evidenceMode, 'mcq');
    assert.ok(['AO1', 'AO2'].includes(profile.primaryAssessmentObjective));
    assert.ok(!profile.assessmentObjectives.includes('AO3'));
  });
});

test('Paper 1 bank covers all six Economics content areas', () => {
  const strands = new Set(bank.questions.map((question) => question.tags.at(-1)));
  assert.deepEqual(
    [...strands].sort(),
    ['development', 'foundations', 'international', 'macro', 'markets', 'micro'],
  );
});

test('content identity remains primary and secondary taxonomy is reasoning-only', () => {
  let taxonomyCount = 0;
  bank.questions.forEach((question) => {
    assert.ok(question.taxonomies.length >= 1);
    const [primary, ...secondary] = question.taxonomies;
    assert.ok(primary.primarySkillCode.startsWith('econ.'));
    assert.ok(!primary.primarySkillCode.startsWith('econ.reasoning.'));
    assert.ok(!primary.atomicSubskillCode.startsWith('econ.reasoning.'));
    secondary.forEach((taxonomy) => {
      assert.ok(taxonomy.primarySkillCode.startsWith('econ.reasoning.'));
      assert.ok(taxonomy.atomicSubskillCode.startsWith('econ.reasoning.'));
    });
    taxonomyCount += question.taxonomies.length;
  });
  assert.equal(taxonomyCount, 59);
});

test('internal BH-AO taxonomy stays separate from external Cambridge AO metadata', () => {
  bank.questions.forEach((question) => {
    question.taxonomies.forEach((taxonomy) => {
      assert.match(taxonomy.assessmentProcessCode, /^BH-AO[1-4]$/);
      assert.doesNotMatch(taxonomy.assessmentProcessCode, /^AO[1-3]$/);
    });
    assert.match(question.assessmentProfile.primaryAssessmentObjective, /^AO[12]$/);
  });
});

test('bank migration enforces release, AO and content-strand invariants', () => {
  assert.match(bankMigration, /v_question_count<>40/);
  assert.match(bankMigration, /v_taxonomy_count<>59/);
  assert.match(bankMigration, /v_profile_count<>40/);
  assert.match(bankMigration, /v_ao1<>20 or v_ao2<>20/);
  assert.match(bankMigration, /v_content_strands<>6/);
  assert.match(bankMigration, /economics_paper1_v1_question_authority_invariant_failed/);
  assert.match(bankMigration, /economics_paper1_v1_missing_registry_taxonomy/);
});
