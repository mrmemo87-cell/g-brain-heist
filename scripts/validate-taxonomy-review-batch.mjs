#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_TAXONOMY_REVIEW_BATCH_PATH = path.resolve(
  __dirname,
  '..',
  'content',
  'verified-question-taxonomy',
  'bh-production-legacy-1.jsonl',
);

export const TAXONOMY_REVIEW_BATCH_ID = 'bh-production-legacy-1';
export const EXPECTED_SOURCE_FILE_SHA256 = '398cc58311160e29b8bc80d5f75e1e41b42a250c61b0dcd791d0c923311c732a';
export const EXPECTED_TAXONOMY_REVIEW_COUNTS = Object.freeze({
  total: 958,
  verified: 950,
  retired: 8,
  inReview: 958,
});

// These identities are copied from the exact, hash-bound quarantine manifest
// in 20260824181104_quarantine_defective_legacy_questions_and_mappings.sql.
// The source JSONL predates that migration, so its sourceMetadata.isActive
// snapshot is intentionally preserved while this derived lifecycle is current.
export const RETIRED_TAXONOMY_SOURCE_HASHES = new Map([
  ['0c929e4c-e42d-4269-b765-b3a3a23985c8', 'b11d2d503bb6353703fc321de54178881736bee292938eddd22e0e67c00a1a03'],
  ['192d0c7f-c45c-4f52-a282-483fdc9f471d', 'be84dac7f0279caee7d95acf07b5cbf6d5b7b3ea34e45fbfcaf63f6c7bb0e800'],
  ['3a5dfe43-f7e9-4408-92b9-72461d74a4eb', '3f08ce62dde4d19455b5765c0e6a0acb9ae0ad9d836d9a93422adcd0778e7e4b'],
  ['3d12f655-9994-4653-a21a-e6b74401adac', 'dc2d3c1ce0ead059c54443f5a18eca5c48f166f3fe0b9e11d44ec7335b12c1e4'],
  ['673a8165-b022-46d0-8211-f8adc6159ff0', 'ec890c44240e7be25e9fcc5e4075915736faf873d7c3fe83bb0c352ea94a930e'],
  ['a17a81e3-f94f-4b94-a066-5c91dcdf4ccb', 'a59baf5f4218a2f0bf6eaece67751b6c22f74cc2401e47beb5dce24b71c7380b'],
  ['e15cbaba-047a-43cb-ab15-8edf967aacc3', '10fdaccd41c9a5293f7b824d480f4b385a8b9bbeb36d64e0e8a2382ecb55f88d'],
  ['fb24d0f9-71fa-4173-b3f9-cb25c6d84a8c', 'd6f89ba67d5c435037be523e72fcce487973b26345aa261bde051aafd22b5e3f'],
]);

// These fifteen questions carried one Grade 4 Future Tense mapping that was
// later superseded by the governed correction migration. The proposal payload
// remains untouched for audit; the review UI must surface the drift and the
// approval path must resolve a current approved mapping instead.
export const SUPERSEDED_GRADE_FOUR_MAPPING_QUESTION_IDS = new Set([
  '35ce05e2-275e-4f74-9967-d86564f3fe57',
  '56b12a3b-cbc4-4c74-bdb1-ebdd7d485e14',
  '575a365e-260d-44bf-84bd-4524017de1c6',
  '6f6dafcf-ec60-4398-89e4-65e43bc07c9c',
  '7b183f3c-d9b9-4948-9467-09b993f64f29',
  '7c1e779d-58d8-44ac-a525-b6dcffa04af8',
  '8b980012-c745-42ca-9a8a-9286f4d285f2',
  '9164bbd7-d44e-48a6-ad7a-c32e6645370f',
  '9ffbf10e-4e2e-43cf-943f-4020f737d124',
  'adeb580d-7625-4118-ae6f-e4068ba495ec',
  'c716beb9-7882-409f-b93e-29cbe14a94c0',
  'ccbfb6a9-bc5c-40f3-b28f-8d5846b29eaf',
  'f4ce431f-31e8-4bce-9982-4896b35b9091',
  'f55df678-3a7c-4e0b-a441-ef58c3173967',
  'f60561e3-5d2f-4704-86d2-50b3f47fd5c1',
]);

const SUPERSEDED_GRADE_FOUR_MAPPING = Object.freeze({
  frameworkVersionCode: '2026-11',
  scopeCode: 'english-grade-4',
  objectiveCode: 'eng4-grammar-punctuation',
});

// Postgres uuid accepts the full hexadecimal UUID shape. Five repaired legacy
// records use deterministic UUID-shaped IDs whose version bits are non-RFC.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GOVERNED_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const SCOPE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-grade-[1-9][0-9]*$/;
const OBJECTIVE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const COGNITION_BY_AO = new Map([
  ['AO1', new Set(['remember', 'understand'])],
  ['AO2', new Set(['apply'])],
  ['AO3', new Set(['analyze'])],
  ['AO4', new Set(['evaluate'])],
]);
const REQUIRED_FIELDS = [
  'schemaVersion',
  'sourceQuestionId',
  'sourceItemKey',
  'questionContentHash',
  'contentFingerprint',
  'scopeCode',
  'objectiveCode',
  'packageVersion',
  'frameworkCode',
  'frameworkVersionCode',
  'subjectCode',
  'eligibleGradeLevels',
  'primarySkillCode',
  'primarySkillName',
  'atomicSubskillCode',
  'atomicSubskillName',
  'assessmentProcessCode',
  'assessmentProcessName',
  'assessmentProcessDefinition',
  'cognitiveProcess',
  'evidenceStatement',
  'secondarySkillCodes',
  'confidence',
  'reviewStatus',
  'humanReview',
  'reviewReason',
  'taxonomyVersion',
  'sourceMetadata',
  'governedMappings',
  'semanticDuplicateQuestionIds',
];

export const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

export function stableJson(value) {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Cannot canonicalize undefined');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function taxonomyProposalKey(row) {
  return `${row.taxonomyVersion}:${row.sourceQuestionId}`;
}

export function taxonomyProposalHash(row, sourceLifecycleStatus) {
  return sha256Hex(stableJson({
    proposal: row,
    sourceLifecycleStatus,
  }));
}

export function taxonomyProposalDigestLine(proposal) {
  return `${proposal.proposalKey}:${proposal.proposalHash}:${proposal.sourceLifecycleStatus}`;
}

export function taxonomyReviewChunkChecksum(proposals) {
  return sha256Hex(proposals.map(taxonomyProposalDigestLine).sort().join('\n'));
}

const addUnique = (map, value, label, line, errors) => {
  if (map.has(value)) {
    errors.push(`${label} ${JSON.stringify(value)} repeats line ${map.get(value)} at line ${line}`);
  } else {
    map.set(value, line);
  }
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

function validateRow(row, line, errors) {
  const label = `line ${line}`;
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(row, field)) errors.push(`${label} is missing ${field}`);
  }

  if (row.schemaVersion !== 1) errors.push(`${label} schemaVersion must be 1`);
  if (!UUID_PATTERN.test(String(row.sourceQuestionId ?? ''))) errors.push(`${label} sourceQuestionId must be a UUID`);
  if (!SHA256_PATTERN.test(String(row.questionContentHash ?? ''))) errors.push(`${label} questionContentHash must be lowercase SHA-256`);
  const expectedSourceItemKey = row.externalId ?? `sha256:${row.questionContentHash}`;
  if (row.sourceItemKey !== expectedSourceItemKey) errors.push(`${label} sourceItemKey must match externalId or bind questionContentHash`);
  if (!SHA256_PATTERN.test(String(row.contentFingerprint ?? ''))) errors.push(`${label} contentFingerprint must be lowercase SHA-256`);
  if (!SCOPE_CODE_PATTERN.test(String(row.scopeCode ?? ''))) errors.push(`${label} scopeCode is not a governed grade scope`);
  if (!OBJECTIVE_CODE_PATTERN.test(String(row.objectiveCode ?? ''))) errors.push(`${label} objectiveCode is not normalized`);
  if (row.taxonomyVersion !== TAXONOMY_REVIEW_BATCH_ID) errors.push(`${label} taxonomyVersion must be ${TAXONOMY_REVIEW_BATCH_ID}`);
  if (row.reviewStatus !== 'in_review') errors.push(`${label} reviewStatus must remain in_review`);
  if (row.humanReview !== true) errors.push(`${label} humanReview must remain true`);
  if (!isNonEmptyString(row.reviewReason)) errors.push(`${label} reviewReason is required`);
  if (row.externalId !== null && !isNonEmptyString(row.externalId)) errors.push(`${label} externalId must be null or a non-empty string`);
  if (!GOVERNED_CODE_PATTERN.test(String(row.primarySkillCode ?? ''))) errors.push(`${label} primarySkillCode is not a governed dotted code`);
  if (!GOVERNED_CODE_PATTERN.test(String(row.atomicSubskillCode ?? ''))) errors.push(`${label} atomicSubskillCode is not a governed dotted code`);
  if (isNonEmptyString(row.primarySkillCode)
      && isNonEmptyString(row.atomicSubskillCode)
      && !row.atomicSubskillCode.startsWith(`${row.primarySkillCode}.`)) {
    errors.push(`${label} atomicSubskillCode must be a child of primarySkillCode`);
  }
  if (!isNonEmptyString(row.primarySkillName)) errors.push(`${label} primarySkillName is required`);
  if (!isNonEmptyString(row.atomicSubskillName)) errors.push(`${label} atomicSubskillName is required`);
  if (!isNonEmptyString(row.evidenceStatement) || row.evidenceStatement.trim().length < 30) {
    errors.push(`${label} evidenceStatement must contain at least 30 characters`);
  }

  const allowedCognition = COGNITION_BY_AO.get(row.assessmentProcessCode);
  if (!allowedCognition) errors.push(`${label} assessmentProcessCode must be AO1, AO2, AO3, or AO4`);
  else if (!allowedCognition.has(row.cognitiveProcess)) errors.push(`${label} cognitiveProcess does not match ${row.assessmentProcessCode}`);
  if (!Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) {
    errors.push(`${label} confidence must be between 0 and 1`);
  }
  if (row.confidence >= 0.9) errors.push(`${label} legacy proposal confidence must remain below automatic-approval range`);

  if (!Array.isArray(row.secondarySkillCodes)
      || row.secondarySkillCodes.some((code) => !GOVERNED_CODE_PATTERN.test(String(code)))) {
    errors.push(`${label} secondarySkillCodes must contain governed dotted codes`);
  }
  if (!Array.isArray(row.semanticDuplicateQuestionIds)
      || row.semanticDuplicateQuestionIds.some((id) => !UUID_PATTERN.test(String(id)))) {
    errors.push(`${label} semanticDuplicateQuestionIds must contain UUIDs`);
  }
  if (row.semanticDuplicateQuestionIds?.includes(row.sourceQuestionId)) {
    errors.push(`${label} cannot list itself as a semantic duplicate`);
  }

  if (!Array.isArray(row.eligibleGradeLevels)
      || row.eligibleGradeLevels.length === 0
      || row.eligibleGradeLevels.some((grade) => !Number.isInteger(grade) || grade < 1 || grade > 13)
      || new Set(row.eligibleGradeLevels).size !== row.eligibleGradeLevels.length) {
    errors.push(`${label} eligibleGradeLevels must contain unique integer grades from 1 to 13`);
  }
  const scopeGrade = Number(String(row.scopeCode ?? '').match(/-grade-(\d+)$/)?.[1]);
  if (Number.isInteger(scopeGrade) && !row.eligibleGradeLevels?.includes(scopeGrade)) {
    errors.push(`${label} eligibleGradeLevels must include the primary scope grade`);
  }

  const sourceMetadata = row.sourceMetadata;
  if (!sourceMetadata || typeof sourceMetadata !== 'object' || Array.isArray(sourceMetadata)) {
    errors.push(`${label} sourceMetadata must be an object`);
  } else {
    if (sourceMetadata.contentOrigin !== 'brain_heist') errors.push(`${label} sourceMetadata.contentOrigin must be brain_heist`);
    if (sourceMetadata.verificationStatus !== 'verified') errors.push(`${label} source metadata must preserve its verified import snapshot`);
    if (sourceMetadata.analyticsEligible !== true || sourceMetadata.isPublic !== true || sourceMetadata.isActive !== true) {
      errors.push(`${label} source metadata must preserve the pre-quarantine active snapshot`);
    }
  }

  if (!Array.isArray(row.governedMappings) || row.governedMappings.length === 0) {
    errors.push(`${label} governedMappings must not be empty`);
  } else {
    const mappingKeys = new Set();
    let hasPrimaryMapping = false;
    for (const mapping of row.governedMappings) {
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        errors.push(`${label} governedMappings must contain objects`);
        continue;
      }
      if (!isNonEmptyString(mapping.frameworkVersionCode)
          || !SCOPE_CODE_PATTERN.test(String(mapping.scopeCode ?? ''))
          || !OBJECTIVE_CODE_PATTERN.test(String(mapping.objectiveCode ?? ''))) {
        errors.push(`${label} has an invalid governed mapping`);
      }
      const key = `${mapping.frameworkVersionCode}|${mapping.scopeCode}|${mapping.objectiveCode}`;
      if (mappingKeys.has(key)) errors.push(`${label} repeats governed mapping ${key}`);
      mappingKeys.add(key);
      if (mapping.frameworkVersionCode === row.frameworkVersionCode
          && mapping.scopeCode === row.scopeCode
          && mapping.objectiveCode === row.objectiveCode) {
        hasPrimaryMapping = true;
      }
    }
    if (!hasPrimaryMapping) errors.push(`${label} governedMappings does not contain its primary mapping`);

    const staleGradeFourMappings = row.governedMappings.filter((mapping) => (
      mapping?.frameworkVersionCode === SUPERSEDED_GRADE_FOUR_MAPPING.frameworkVersionCode
      && mapping?.scopeCode === SUPERSEDED_GRADE_FOUR_MAPPING.scopeCode
      && mapping?.objectiveCode === SUPERSEDED_GRADE_FOUR_MAPPING.objectiveCode
    ));
    const expectsMappingDrift = SUPERSEDED_GRADE_FOUR_MAPPING_QUESTION_IDS.has(row.sourceQuestionId);
    if (expectsMappingDrift && staleGradeFourMappings.length !== 1) {
      errors.push(`${label} must preserve its one superseded Grade 4 mapping for review provenance`);
    } else if (!expectsMappingDrift && staleGradeFourMappings.length > 0) {
      errors.push(`${label} contains an unexpected superseded Grade 4 mapping`);
    }
  }
}

export function loadAndValidateTaxonomyReviewBatch(
  batchPath = DEFAULT_TAXONOMY_REVIEW_BATCH_PATH,
  { requireLockedArtifact = true } = {},
) {
  const errors = [];
  if (!existsSync(batchPath)) {
    return { ok: false, errors: [`Taxonomy review batch not found: ${batchPath}`], rows: [], proposals: [] };
  }

  const sourceBuffer = readFileSync(batchPath);
  const sourceFileSha256 = sha256Hex(sourceBuffer);
  const source = sourceBuffer.toString('utf8');
  const rows = [];
  const sourceQuestionIds = new Map();
  const sourceItemKeys = new Map();
  const questionContentHashes = new Map();
  const contentFingerprints = new Map();

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    if (!rawLine.trim()) return;
    let row;
    try {
      row = JSON.parse(rawLine);
    } catch (error) {
      errors.push(`line ${line} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`line ${line} must contain one JSON object`);
      return;
    }

    validateRow(row, line, errors);
    addUnique(sourceQuestionIds, row.sourceQuestionId, 'sourceQuestionId', line, errors);
    addUnique(sourceItemKeys, row.sourceItemKey, 'sourceItemKey', line, errors);
    addUnique(questionContentHashes, row.questionContentHash, 'questionContentHash', line, errors);
    addUnique(contentFingerprints, row.contentFingerprint, 'contentFingerprint', line, errors);
    rows.push(row);
  });

  if (requireLockedArtifact && sourceFileSha256 !== EXPECTED_SOURCE_FILE_SHA256) {
    errors.push(`source file checksum mismatch: expected ${EXPECTED_SOURCE_FILE_SHA256}, found ${sourceFileSha256}`);
  }
  if (rows.length !== EXPECTED_TAXONOMY_REVIEW_COUNTS.total) {
    errors.push(`batch must contain exactly ${EXPECTED_TAXONOMY_REVIEW_COUNTS.total} proposals; found ${rows.length}`);
  }

  const proposals = rows.map((row) => {
    const retiredHash = RETIRED_TAXONOMY_SOURCE_HASHES.get(row.sourceQuestionId);
    if (retiredHash && retiredHash !== row.questionContentHash) {
      errors.push(`retired question ${row.sourceQuestionId} does not match its governed content hash`);
    }
    const sourceLifecycleStatus = retiredHash ? 'retired' : 'verified';
    return {
      proposalKey: taxonomyProposalKey(row),
      proposalHash: taxonomyProposalHash(row, sourceLifecycleStatus),
      sourceQuestionId: row.sourceQuestionId,
      questionContentHash: row.questionContentHash,
      taxonomyVersion: row.taxonomyVersion,
      sourceLifecycleStatus,
      payload: row,
    };
  });

  for (const [questionId, expectedHash] of RETIRED_TAXONOMY_SOURCE_HASHES) {
    const row = rows.find((entry) => entry.sourceQuestionId === questionId);
    if (!row) errors.push(`governed retired question ${questionId} is missing from the batch`);
    else if (row.questionContentHash !== expectedHash) errors.push(`governed retired question ${questionId} has an unexpected content hash`);
  }

  const proposalKeys = new Map();
  const proposalHashes = new Map();
  proposals.forEach((proposal, index) => {
    addUnique(proposalKeys, proposal.proposalKey, 'proposalKey', index + 1, errors);
    addUnique(proposalHashes, proposal.proposalHash, 'proposalHash', index + 1, errors);
  });

  const verified = proposals.filter((proposal) => proposal.sourceLifecycleStatus === 'verified').length;
  const retired = proposals.filter((proposal) => proposal.sourceLifecycleStatus === 'retired').length;
  const inReview = rows.filter((row) => row.reviewStatus === 'in_review').length;
  const proposalsWithMappingDrift = rows.filter((row) => (
    SUPERSEDED_GRADE_FOUR_MAPPING_QUESTION_IDS.has(row.sourceQuestionId)
  )).length;
  const staleGovernedMappings = rows.reduce((count, row) => count + (Array.isArray(row.governedMappings) ? row.governedMappings : []).filter((mapping) => (
    mapping.frameworkVersionCode === SUPERSEDED_GRADE_FOUR_MAPPING.frameworkVersionCode
    && mapping.scopeCode === SUPERSEDED_GRADE_FOUR_MAPPING.scopeCode
    && mapping.objectiveCode === SUPERSEDED_GRADE_FOUR_MAPPING.objectiveCode
  )).length, 0);
  if (verified !== EXPECTED_TAXONOMY_REVIEW_COUNTS.verified) errors.push(`expected 950 verified proposals; found ${verified}`);
  if (retired !== EXPECTED_TAXONOMY_REVIEW_COUNTS.retired) errors.push(`expected 8 retired proposals; found ${retired}`);
  if (inReview !== EXPECTED_TAXONOMY_REVIEW_COUNTS.inReview) errors.push(`expected 958 in_review proposals; found ${inReview}`);
  if (proposalsWithMappingDrift !== 15 || staleGovernedMappings !== 15) {
    errors.push(`expected 15 proposals preserving 15 superseded mappings; found ${proposalsWithMappingDrift} proposals and ${staleGovernedMappings} mappings`);
  }

  const batchChecksum = sha256Hex(proposals
    .map(taxonomyProposalDigestLine)
    .sort()
    .join('\n'));

  return {
    ok: errors.length === 0,
    errors,
    rows,
    proposals,
    summary: {
      batchId: TAXONOMY_REVIEW_BATCH_ID,
      sourcePath: batchPath,
      sourceBytes: sourceBuffer.length,
      sourceFileSha256,
      batchChecksum,
      total: rows.length,
      verified,
      retired,
      inReview,
      proposalsWithMappingDrift,
      staleGovernedMappings,
      uniqueQuestionIds: sourceQuestionIds.size,
      uniqueQuestionContentHashes: questionContentHashes.size,
    },
  };
}

function usage() {
  return `Usage: node scripts/validate-taxonomy-review-batch.mjs [path]\n\nValidates the locked ${TAXONOMY_REVIEW_BATCH_ID} JSONL artifact and prints deterministic counts and checksums. No database connection is used.`;
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  if (process.argv.length > 3) throw new Error('Expected at most one taxonomy JSONL path');
  const batchPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_TAXONOMY_REVIEW_BATCH_PATH;
  const result = loadAndValidateTaxonomyReviewBatch(batchPath);
  if (!result.ok) throw new Error(`Taxonomy review batch validation failed:\n${result.errors.map((error) => `- ${error}`).join('\n')}`);
  console.log('Taxonomy review batch validated');
  console.log(JSON.stringify(result.summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
