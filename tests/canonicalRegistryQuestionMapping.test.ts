import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const preview = readFileSync('components/teacher/QuestionPreviewModal.tsx', 'utf8');
const bank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');
const registryDoc = readFileSync('docs/academic-skill-registry.md', 'utf8');
const reference = readFileSync('bh_reference.md', 'utf8');
const backfill = readFileSync(
  'supabase/migrations/20261007071002_canonical_registry_backfill_and_aliases.sql',
  'utf8',
);
const invariant = readFileSync(
  'supabase/migrations/20261007071032_canonical_registry_fail_closed_invariant.sql',
  'utf8',
);

test('verified question preview prefers registry-native mappings and fails closed visually', () => {
  assert.match(preview, /question\.registry_mappings\?\.length/);
  assert.match(
    preview,
    /question\.analytics_eligible && question\.verification_status === 'verified'/,
  );
  assert.match(preview, /Canonical assessment mapping is unavailable in this view/);

  const canonicalBranch = preview.indexOf('question.registry_mappings?.length');
  const verifiedUnavailableBranch = preview.indexOf(
    "question.analytics_eligible && question.verification_status === 'verified'",
    canonicalBranch,
  );
  const legacyBranch = preview.indexOf(
    'question.curriculum_skill || question.curriculum_subskill',
    verifiedUnavailableBranch,
  );

  assert.ok(canonicalBranch >= 0);
  assert.ok(verifiedUnavailableBranch > canonicalBranch);
  assert.ok(legacyBranch > verifiedUnavailableBranch);
});


test('verified question preview hides machine taxonomy tags from teacher-facing metadata', () => {
  for (const prefix of [
    'strand:',
    'skill:',
    'subskill:',
    'evidence-focus:',
    'assessment-process:',
    'cognitive-process:',
    'registry:',
  ]) {
    assert.match(preview, new RegExp(`'${prefix.replace('-', '\\-')}`));
  }
  assert.match(preview, /question\.tags\?\.some\(isDisplayTag\)/);
  assert.match(preview, /question\.tags\.filter\(isDisplayTag\)/);
});

test('verified question list displays canonical registry mapping rather than legacy skill labels', () => {
  assert.match(bank, /question\.registry_mappings\?\.length/);
  assert.match(bank, /question\.registry_mappings\[0\]\.skill/);
  assert.match(bank, /question\.registry_mappings\[0\]\.subskill/);
  assert.match(bank, /Evidence focus:/);
  assert.match(bank, /Canonical mapping unavailable/);

  const officialBlockStart = bank.indexOf('{isOfficialPool ?');
  assert.ok(officialBlockStart >= 0);
  const officialBlockEnd = bank.indexOf(': <><p><strong>{question.verification_status', officialBlockStart);
  assert.ok(officialBlockEnd > officialBlockStart);
  const officialBlock = bank.slice(officialBlockStart, officialBlockEnd);

  assert.doesNotMatch(officialBlock, /question\.curriculum_skill/);
  assert.doesNotMatch(officialBlock, /question\.curriculum_subskill/);
});

test('registry backfill is code-bound, alias-aware and release-gated', () => {
  assert.match(backfill, /private\.academic_registry_subject_matches/);
  assert.match(backfill, /academic_skill_registry_subject_aliases/);
  assert.match(backfill, /allowed_strand_codes/);
  assert.match(backfill, /primary_skill_code/);
  assert.match(backfill, /atomic_subskill_code/);
  assert.match(backfill, /evidence_focus_code/);
  assert.match(backfill, /governed_legacy_taxonomy_backfill/);
  assert.match(backfill, /registry_native_backfill_incomplete/);
  assert.match(backfill, /registry_backfill_missing/);
});

test('verified analytics questions fail closed without a current registry mapping', () => {
  assert.match(invariant, /mirror_verified_diagnostic_taxonomy_to_registry/);
  assert.match(invariant, /diagnostic_taxonomy_bridge/);
  assert.match(invariant, /create constraint trigger trg_verified_question_registry_invariant/);
  assert.match(invariant, /deferrable initially deferred/);
  assert.match(invariant, /verified_question_requires_current_registry_mapping/);
  assert.match(invariant, /registry_coverage_assertion_failed/);
});

test('academic registry bible forbids legacy taxonomy fallback for verified evidence', () => {
  for (const source of [registryDoc, reference]) {
    assert.match(source, /verified_question_registry_taxonomy/);
    assert.match(source, /fail[s -]?closed/i);
    assert.match(source, /legacy/i);
    assert.match(source, /fallback/i);
  }

  assert.match(registryDoc, /Never repair a missing mapping by copying the topic into Skill\/Subskill fields/);
  assert.match(reference, /Never use topic names or legacy .*curriculum_/);
});
