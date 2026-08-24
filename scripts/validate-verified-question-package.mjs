#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const PACKAGES_ROOT = path.resolve(__dirname, '..', 'content', 'verified-question-packages');
export const DEFAULT_PACKAGE_DIR = path.join(PACKAGES_ROOT, '2026-8-0');
export const DEFAULT_CANONICAL_TAXONOMY_PATH = path.resolve(
  REPOSITORY_ROOT,
  'content',
  'verified-question-taxonomy',
  'bh-canonical-1.jsonl',
);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const VALID_TYPES = new Set(['multiple_choice', 'true_false', 'short_answer']);
const CANONICAL_TAXONOMY_VERSION = 'bh-canonical-1';
const CANONICAL_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const ASSESSMENT_PROCESS_COGNITION = new Map([
  ['AO1', new Set(['remember', 'understand'])],
  ['AO2', new Set(['apply'])],
  ['AO3', new Set(['analyze'])],
  ['AO4', new Set(['evaluate'])],
]);
const TAXONOMY_REVIEW_STATUSES = new Set(['approved', 'in_review']);
const REQUIRED_TAXONOMY_FIELDS = [
  'taxonomyVersion',
  'externalId',
  'packageVersion',
  'scopeCode',
  'objectiveCode',
  'primarySkillCode',
  'primarySkillName',
  'atomicSubskillCode',
  'atomicSubskillName',
  'assessmentProcessCode',
  'cognitiveProcess',
  'evidenceStatement',
  'secondarySkillCodes',
  'confidence',
  'reviewStatus',
  'humanReview',
  'reviewReason',
];
const PACKAGE_EXPECTATIONS = new Map([
  ['brain-heist-g11-g12-core-2026-2', {
    curriculumVersion: '2026-2',
    scopes: new Map([
      ['chemistry', { subject: 'Chemistry', grade: 11, scope: 'chemistry-grade-11' }],
      ['english', { subject: 'English', grade: 11, scope: 'english-grade-11' }],
      ['biology', { subject: 'Biology', grade: 11, scope: 'biology-grade-11' }],
      ['travel-tourism', { subject: 'Travel & Tourism', grade: 12, scope: 'travel-tourism-grade-12' }],
    ]),
  }],
  ['brain-heist-g12-core-2026-3', {
    curriculumVersion: '2026-3',
    scopes: new Map([
      ['chemistry', { subject: 'Chemistry', grade: 12, scope: 'chemistry-grade-12' }],
      ['biology', { subject: 'Biology', grade: 12, scope: 'biology-grade-12' }],
      ['english', { subject: 'English', grade: 12, scope: 'english-grade-12' }],
      ['physics', { subject: 'Physics', grade: 12, scope: 'physics-grade-12' }],
    ]),
  }],
  ['brain-heist-g11-completion-2026-4', {
    curriculumVersion: '2026-4',
    scopes: new Map([
      ['chemistry', { subject: 'Chemistry', grade: 11, scope: 'chemistry-grade-11' }],
      ['biology', { subject: 'Biology', grade: 11, scope: 'biology-grade-11' }],
      ['physics', { subject: 'Physics', grade: 11, scope: 'physics-grade-11' }],
      ['travel-tourism', { subject: 'Travel & Tourism', grade: 11, scope: 'travel-tourism-grade-11' }],
    ]),
  }],
  ['brain-heist-mathematics-ict-2026-5', {
    curriculumVersion: '2026-5',
    scopes: new Map([
      ['mathematics', { subject: 'Mathematics', grades: [11, 12], scopes: ['mathematics-grade-11', 'mathematics-grade-12'] }],
      ['ict', { subject: 'ICT', grades: [11, 12], scopes: ['ict-grade-11', 'ict-grade-12'] }],
    ]),
  }],
  ['brain-heist-geography-global-perspectives-2026-6', {
    curriculumVersion: '2026-6',
    scopes: new Map([
      ['geography', { subject: 'Geography', grades: [11, 12], scopes: ['geography-grade-11', 'geography-grade-12'] }],
      ['global-perspectives', { subject: 'Global Perspectives', grades: [11, 12], scopes: ['global-perspectives-grade-11', 'global-perspectives-grade-12'] }],
    ]),
  }],
  ['brain-heist-grade-6-core-2026-7', {
    curriculumVersion: '2026-7',
    assetDirectory: '2026-7-0',
    visualAssetRange: [20, 25],
    scopes: new Map([
      ['mathematics', { subject: 'Mathematics', grade: 6, scope: 'mathematics-grade-6' }],
      ['english', { subject: 'English', grade: 6, scope: 'english-grade-6' }],
      ['science', { subject: 'Science', grade: 6, scope: 'science-grade-6' }],
      ['geography', { subject: 'Geography', grade: 6, scope: 'geography-grade-6' }],
    ]),
  }],
  ['brain-heist-grade-7-core-2026-8', {
    curriculumVersion: '2026-8',
    assetDirectory: '2026-8-0',
    visualAssetRange: [20, 25],
    scopes: new Map([
      ['mathematics', { subject: 'Mathematics', grade: 7, scope: 'mathematics-grade-7' }],
      ['english', { subject: 'English', grade: 7, scope: 'english-grade-7' }],
      ['science', { subject: 'Science', grade: 7, scope: 'science-grade-7' }],
      ['geography', { subject: 'Geography', grade: 7, scope: 'geography-grade-7' }],
    ]),
  }],
  ['brain-heist-grade-5-core-2026-10', {
    curriculumVersion: '2026-10',
    assetDirectory: '2026-10-0',
    visualAssetRange: [30, 36],
    scopes: new Map([
      ['mathematics', { subject: 'Mathematics', grade: 5, scope: 'mathematics-grade-5' }],
      ['english', { subject: 'English', grade: 5, scope: 'english-grade-5' }],
      ['science', { subject: 'Science', grade: 5, scope: 'science-grade-5' }],
      ['geography', { subject: 'Geography', grade: 5, scope: 'geography-grade-5' }],
    ]),
  }],
  ['brain-heist-grade-4-core-2026-11', {
    curriculumVersion: '2026-11',
    assetDirectory: '2026-11-0',
    visualAssetRange: [36, 36],
    scopes: new Map([
      ['mathematics', { subject: 'Mathematics', grade: 4, scope: 'mathematics-grade-4' }],
      ['english', { subject: 'English', grade: 4, scope: 'english-grade-4' }],
      ['science', { subject: 'Science', grade: 4, scope: 'science-grade-4' }],
      ['geography', { subject: 'Geography', grade: 4, scope: 'geography-grade-4' }],
    ]),
  }],
]);

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));
const normalize = (value) => String(value ?? '').toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();

const packageDirectories = () => readdirSync(PACKAGES_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(PACKAGES_ROOT, entry.name))
  .filter((directory) => existsSync(path.join(directory, 'manifest.json')))
  .sort();

const isCanonicalCode = (value) => {
  const code = String(value ?? '');
  return CANONICAL_CODE_PATTERN.test(code)
    && !/(?:^|[.-])(?:g(?:rade)?-?\d+|20\d{2})(?:[.-]|$)/.test(code);
};

export function loadCanonicalQuestionTaxonomy(
  taxonomyPath = process.env.BH_VERIFIED_QUESTION_TAXONOMY_PATH || DEFAULT_CANONICAL_TAXONOMY_PATH,
) {
  if (!existsSync(taxonomyPath)) return { present: false, path: taxonomyPath, rows: [], errors: [] };

  const rows = [];
  const errors = [];
  const externalIds = new Map();
  const lines = readFileSync(taxonomyPath, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index].trim();
    if (!source) continue;
    let row;
    try {
      row = JSON.parse(source);
    } catch (error) {
      errors.push(`canonical taxonomy line ${index + 1} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`canonical taxonomy line ${index + 1} must contain one JSON object`);
      continue;
    }
    const externalId = String(row.externalId ?? '');
    if (externalIds.has(externalId)) {
      errors.push(`canonical taxonomy line ${index + 1} repeats externalId ${externalId || 'missing'} from line ${externalIds.get(externalId)}`);
    } else {
      externalIds.set(externalId, index + 1);
    }
    rows.push({ ...row, __line: index + 1 });
  }
  return { present: true, path: taxonomyPath, rows, errors };
}

const validateCanonicalTaxonomyRow = (row, question, pkg) => {
  const label = `canonical taxonomy line ${row.__line ?? '?'}:${row.externalId ?? 'missing-id'}`;
  const errors = [];
  for (const field of REQUIRED_TAXONOMY_FIELDS) {
    if (!Object.hasOwn(row, field)) errors.push(`${label} is missing ${field}`);
  }

  const mapping = question.mappings?.[0];
  const exactFields = [
    ['externalId', question.externalId],
    ['packageVersion', pkg.packageVersion],
    ['scopeCode', mapping?.scopeCode],
    ['objectiveCode', mapping?.objectiveCode],
  ];
  const optionalExactFields = [
    ['packageId', pkg.packageId],
    ['contentVersion', pkg.contentVersion],
    ['frameworkCode', pkg.curriculum?.frameworkCode],
    ['frameworkVersionCode', pkg.curriculum?.versionCode],
    ['subjectCode', question.subjectCode],
    ['grade', question.grade],
  ];
  for (const [field, expected] of exactFields) {
    if (row[field] !== expected) errors.push(`${label} ${field} must exactly match ${String(expected)}`);
  }
  for (const [field, expected] of optionalExactFields) {
    if (Object.hasOwn(row, field) && row[field] !== expected) errors.push(`${label} ${field} must exactly match ${String(expected)}`);
  }

  if (row.taxonomyVersion !== CANONICAL_TAXONOMY_VERSION) {
    errors.push(`${label} taxonomyVersion must be ${CANONICAL_TAXONOMY_VERSION}`);
  }
  for (const field of ['primarySkillCode', 'atomicSubskillCode']) {
    if (!isCanonicalCode(row[field])) errors.push(`${label} ${field} must be a lowercase, dot-separated, grade- and release-neutral code`);
  }
  const subjectNamespace = `${String(question.subjectCode ?? '').toLowerCase()}.`;
  if (isCanonicalCode(row.primarySkillCode) && !row.primarySkillCode.startsWith(subjectNamespace)) {
    errors.push(`${label} primarySkillCode must use the ${question.subjectCode} subject namespace`);
  }
  if (isCanonicalCode(row.atomicSubskillCode)
      && isCanonicalCode(row.primarySkillCode)
      && !row.atomicSubskillCode.startsWith(`${row.primarySkillCode}.`)) {
    errors.push(`${label} atomicSubskillCode must be a child of primarySkillCode`);
  }

  const primarySkillName = normalize(row.primarySkillName);
  const atomicSubskillName = normalize(row.atomicSubskillName);
  const broadNames = new Set([
    primarySkillName,
    normalize(question.topic),
    normalize(question.curriculum?.strand),
    normalize(question.curriculum?.skill),
    normalize(question.curriculum?.objective),
  ].filter(Boolean));
  if (typeof row.primarySkillName !== 'string' || primarySkillName.length < 3) {
    errors.push(`${label} primarySkillName must name the governed skill`);
  }
  if (typeof row.atomicSubskillName !== 'string'
      || atomicSubskillName.length < 3
      || broadNames.has(atomicSubskillName)
      || /^(?:general|mixed|other|various|topic|skill)$/.test(atomicSubskillName)) {
    errors.push(`${label} atomicSubskillName must name a non-generic atomic performance, not a broad package label`);
  }

  if (typeof row.assessmentProcessCode !== 'string' || !ASSESSMENT_PROCESS_COGNITION.has(row.assessmentProcessCode)) {
    errors.push(`${label} assessmentProcessCode must contain exactly one code from AO1 to AO4`);
  } else if (!ASSESSMENT_PROCESS_COGNITION.get(row.assessmentProcessCode).has(row.cognitiveProcess)) {
    errors.push(`${label} cognitiveProcess ${String(row.cognitiveProcess)} is inconsistent with ${row.assessmentProcessCode}`);
  }
  const evidenceStatement = String(row.evidenceStatement ?? '').trim();
  if (typeof row.evidenceStatement !== 'string'
      || evidenceStatement.length < 20
      || evidenceStatement.length > 500
      || broadNames.has(normalize(evidenceStatement))) {
    errors.push(`${label} evidenceStatement must be a specific 20–500 character observable claim`);
  }

  if (!Array.isArray(row.secondarySkillCodes)) {
    errors.push(`${label} secondarySkillCodes must be an array`);
  } else {
    const uniqueCodes = new Set();
    for (const code of row.secondarySkillCodes) {
      if (!isCanonicalCode(code)) errors.push(`${label} secondarySkillCodes contains an invalid canonical code`);
      if (uniqueCodes.has(code)) errors.push(`${label} secondarySkillCodes must not contain duplicates`);
      if (code === row.primarySkillCode || code === row.atomicSubskillCode) errors.push(`${label} secondarySkillCodes must not repeat the primary skill or atomic subskill`);
      uniqueCodes.add(code);
    }
  }

  if (typeof row.confidence !== 'number' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) {
    errors.push(`${label} confidence must be a number from 0 to 1`);
  }
  if (!TAXONOMY_REVIEW_STATUSES.has(row.reviewStatus)) {
    errors.push(`${label} reviewStatus must be approved or in_review`);
  } else if (row.reviewStatus === 'approved') {
    if (row.confidence < 0.9) errors.push(`${label} approved rows require confidence of at least 0.9`);
    if (row.humanReview !== false) errors.push(`${label} approved rows must set humanReview to false`);
    if (row.reviewReason !== null
        && (typeof row.reviewReason !== 'string' || row.reviewReason.trim().length < 10)) {
      errors.push(`${label} approved reviewReason must be null or a concise explanation`);
    }
  } else {
    if (row.humanReview !== true) errors.push(`${label} in_review rows must set humanReview to true`);
    if (typeof row.reviewReason !== 'string' || row.reviewReason.trim().length < 10) {
      errors.push(`${label} in_review rows require a concise reviewReason`);
    }
  }
  return errors;
};

export function validateCanonicalTaxonomyOrphans(taxonomyArtifact) {
  if (!taxonomyArtifact?.present) return [];
  const knownQuestions = new Set();
  for (const packageDir of packageDirectories()) {
    const pkg = loadVerifiedQuestionPackage(packageDir);
    for (const question of pkg.questions) knownQuestions.add(question.externalId);
  }
  return taxonomyArtifact.rows
    .filter((row) => !knownQuestions.has(row.externalId))
    .map((row) => `canonical taxonomy line ${row.__line ?? '?'}:${row.externalId ?? 'missing-id'} is orphaned from the verified question packages`);
}

export function loadVerifiedQuestionPackage(packageDir = DEFAULT_PACKAGE_DIR) {
  const manifest = readJson(path.join(packageDir, 'manifest.json'));
  const questions = [];
  for (const relativeFile of manifest.files ?? []) {
    const filePath = path.join(packageDir, relativeFile);
    const source = readJson(filePath);
    for (const question of source.questions ?? []) {
      questions.push({
        ...question,
        subject: source.subject,
        subjectCode: source.subjectCode,
        grade: source.grade,
        language: source.language ?? 'en',
        __file: relativeFile,
      });
    }
  }
  return {
    schemaVersion: manifest.schemaVersion,
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    contentVersion: manifest.contentVersion,
    authority: manifest.authority,
    releaseNotes: manifest.releaseNotes,
    curriculum: manifest.curriculum,
    assetBaseUrl: manifest.assetBaseUrl,
    assets: manifest.assets ?? [],
    questions,
  };
}

export function validateVerifiedQuestionPackage(packageDir = DEFAULT_PACKAGE_DIR, options = {}) {
  const errors = [];
  let pkg;
  try {
    pkg = loadVerifiedQuestionPackage(packageDir);
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)], package: null };
  }

  const taxonomyArtifact = options.taxonomyArtifact ?? loadCanonicalQuestionTaxonomy(options.taxonomyPath);
  if (options.includeTaxonomyDocumentErrors !== false) errors.push(...taxonomyArtifact.errors);
  const taxonomyRowsByExternalId = new Map();
  for (const row of taxonomyArtifact.rows) {
    const rows = taxonomyRowsByExternalId.get(row.externalId) ?? [];
    rows.push(row);
    taxonomyRowsByExternalId.set(row.externalId, rows);
  }

  if (![1, 2].includes(pkg.schemaVersion)) errors.push('schemaVersion must be 1 or 2');
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(pkg.packageId ?? '')) errors.push('packageId is invalid');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/.test(pkg.packageVersion ?? '')) errors.push('packageVersion must be semantic versioning');
  if (!pkg.contentVersion || !pkg.authority) errors.push('contentVersion and authority are required');
  const packageExpectation = PACKAGE_EXPECTATIONS.get(pkg.packageId);
  const expectedScopes = packageExpectation?.scopes ?? new Map();
  if (!packageExpectation) errors.push(`packageId ${pkg.packageId ?? 'missing'} has no reviewed validation profile`);
  if (pkg.curriculum?.frameworkCode !== 'brain-heist-international'
      || pkg.curriculum?.versionCode !== packageExpectation?.curriculumVersion) {
    errors.push(`package must target brain-heist-international ${packageExpectation?.curriculumVersion ?? 'reviewed version'}`);
  }

  const assetsById = new Map();
  if (pkg.schemaVersion === 1 && pkg.assets.length) errors.push('schemaVersion 1 packages cannot declare visual assets');
  if (pkg.schemaVersion === 2) {
    if (pkg.assetBaseUrl !== 'https://www.brainsheist.com') errors.push('schemaVersion 2 assetBaseUrl must be https://www.brainsheist.com');
    const [minimumAssets, maximumAssets] = packageExpectation?.visualAssetRange ?? [1, 100];
    if (pkg.assets.length < minimumAssets || pkg.assets.length > maximumAssets) {
      errors.push(`package must contain ${minimumAssets}–${maximumAssets} visual assets; found ${pkg.assets.length}`);
    }
    const assetDirectory = packageExpectation?.assetDirectory;
    const expectedSourcePrefix = assetDirectory ? `public/question-assets/${assetDirectory}/` : '';
    for (const asset of pkg.assets) {
      const label = `asset:${asset?.assetId ?? 'missing-id'}`;
      if (!/^[a-z0-9][a-z0-9-]{5,100}$/.test(asset?.assetId ?? '')) errors.push(`${label} has an invalid assetId`);
      if (assetsById.has(asset?.assetId)) errors.push(`${label} repeats assetId`);
      assetsById.set(asset?.assetId, asset);
      if (asset?.mimeType !== 'image/svg+xml') errors.push(`${label} must use image/svg+xml for this pilot`);
      if (!/^[0-9a-f]{64}$/.test(asset?.sha256 ?? '')) errors.push(`${label} has an invalid SHA-256`);
      if (asset?.width !== 640 || asset?.height !== 360) errors.push(`${label} must be 640×360`);
      if (String(asset?.altText ?? '').trim().length < 20 || String(asset?.altText ?? '').trim().length > 240) errors.push(`${label} altText must be 20–240 characters`);
      if (/correct answer|the answer is/i.test(asset?.altText ?? '')) errors.push(`${label} altText must not reveal the answer`);
      if (asset?.license !== 'Brains Heist original educational artwork' || asset?.source !== 'Brains Heist Visual System') {
        errors.push(`${label} must carry the reviewed Brains Heist source and license`);
      }
      const immutableFilename = String(asset?.sourceFile ?? '').slice(expectedSourcePrefix.length);
      if (!assetDirectory || !String(asset?.sourceFile ?? '').startsWith(expectedSourcePrefix)
          || !/^[a-z0-9-]+\.[0-9a-f]{12}\.svg$/.test(immutableFilename)) {
        errors.push(`${label} has an invalid immutable sourceFile`);
        continue;
      }
      const expectedPublicPath = `/${asset.sourceFile.slice('public/'.length)}`;
      if (asset.publicPath !== expectedPublicPath) errors.push(`${label} publicPath must match sourceFile`);
      if (!asset.sourceFile.includes(`.${String(asset.sha256).slice(0, 12)}.svg`)) errors.push(`${label} filename must include its checksum prefix`);
      try {
        const filePath = path.resolve(REPOSITORY_ROOT, asset.sourceFile);
        const allowedRoot = path.join(REPOSITORY_ROOT, 'public', 'question-assets', assetDirectory) + path.sep;
        if (!filePath.startsWith(allowedRoot)) throw new Error('asset escapes the reviewed public asset directory');
        const fileBytes = readFileSync(filePath);
        if (statSync(filePath).size > 100_000) errors.push(`${label} exceeds the 100 KB SVG limit`);
        const actualHash = createHash('sha256').update(fileBytes).digest('hex');
        if (actualHash !== asset.sha256) errors.push(`${label} checksum does not match sourceFile`);
        const svg = fileBytes.toString('utf8');
        if (!/^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/i.test(svg)) errors.push(`${label} is not a standalone SVG`);
        if (!/viewBox="0 0 640 360"/i.test(svg) || !/<title>[^<]+<\/title>/i.test(svg)) errors.push(`${label} needs the reviewed viewBox and a title`);
        if (/<(?:script|foreignObject|iframe|object|embed)\b/i.test(svg)
            || /\son[a-z]+\s*=/i.test(svg)
            || /(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|data:)/i.test(svg)
            || /<image\b/i.test(svg)) {
          errors.push(`${label} contains unsafe or externally embedded SVG content`);
        }
      } catch (error) {
        errors.push(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const externalIds = new Set();
  const prompts = new Map();
  const subjectCounts = new Map();
  const difficultyCounts = new Map();
  const answerPositionCounts = new Map();
  const uniquelyLongestCorrectCounts = new Map();
  const objectiveCounts = new Map();
  const referencedAssetIds = new Set();

  for (const q of pkg.questions) {
    const label = `${q.__file}:${q.externalId ?? 'missing-id'}`;
    const expected = expectedScopes.get(q.subjectCode);
    const validGrade = expected?.grades ? expected.grades.includes(q.grade) : expected?.grade === q.grade;
    const validScope = expected?.scopes ? expected.scopes.includes(q.mappings?.[0]?.scopeCode) : expected?.scope === q.mappings?.[0]?.scopeCode;
    if (!expected || expected.subject !== q.subject || !validGrade) errors.push(`${label} has an invalid subject/grade combination`);
    if (!/^[a-z0-9][a-z0-9._-]{5,119}$/.test(q.externalId ?? '')) errors.push(`${label} has an invalid externalId`);
    if (externalIds.has(q.externalId)) errors.push(`${label} repeats externalId`);
    externalIds.add(q.externalId);
    if (!q.topic || !q.questionText || !q.correctAnswer || !q.explanation) errors.push(`${label} is missing required content`);
    if (String(q.explanation ?? '').trim().length < 20) errors.push(`${label} explanation is too short`);
    if (!VALID_DIFFICULTIES.has(q.difficulty)) errors.push(`${label} has invalid difficulty`);
    if (!VALID_TYPES.has(q.questionType)) errors.push(`${label} has invalid questionType`);
    if (!Number.isInteger(q.points) || q.points < 1 || q.points > 100) errors.push(`${label} points must be 1–100`);
    if (!Number.isInteger(q.timeLimit) || q.timeLimit < 10 || q.timeLimit > 600) errors.push(`${label} timeLimit must be 10–600 seconds`);
    if (q.visualAssetId !== undefined) {
      if (pkg.schemaVersion !== 2) errors.push(`${label} cannot reference a visual asset in schemaVersion 1`);
      if (!assetsById.has(q.visualAssetId)) errors.push(`${label} references an unknown visualAssetId`);
      referencedAssetIds.add(q.visualAssetId);
    }

    const promptKey = normalize(q.questionText);
    if (prompts.has(promptKey)) errors.push(`${label} duplicates the prompt from ${prompts.get(promptKey)}`);
    prompts.set(promptKey, label);

    if (!Array.isArray(q.mappings) || q.mappings.length !== 1) errors.push(`${label} must have exactly one primary mapping`);
    const mapping = q.mappings?.[0];
    if (!validScope || !/^[a-z0-9][a-z0-9-]{5,80}$/.test(mapping?.objectiveCode ?? '')) {
      errors.push(`${label} has an invalid curriculum mapping`);
    }
    for (const field of ['strand', 'skill', 'subskill', 'objective']) {
      if (!String(q.curriculum?.[field] ?? '').trim()) errors.push(`${label} curriculum.${field} is required`);
    }

    if (taxonomyArtifact.present) {
      const taxonomyRows = taxonomyRowsByExternalId.get(q.externalId) ?? [];
      if (taxonomyRows.length === 0) {
        errors.push(`${label} requires an exact companion row in ${path.basename(taxonomyArtifact.path)}`);
      }
      for (const row of taxonomyRows) errors.push(...validateCanonicalTaxonomyRow(row, q, pkg));
    }

    if (q.questionType === 'multiple_choice') {
      if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${label} must have exactly four options`);
      // Punctuation, mathematical signs and chemical subscripts can change an
      // option's meaning, so option uniqueness intentionally uses exact visible
      // text after case/outer-whitespace normalization only.
      const normalizedOptions = (q.options ?? []).map((option) => String(option ?? '').trim().toLowerCase());
      if (normalizedOptions.some((option) => !option) || new Set(normalizedOptions).size !== normalizedOptions.length) errors.push(`${label} has blank or duplicate options`);
      const answerIndex = (q.options ?? []).findIndex((option) => option === q.correctAnswer);
      if (answerIndex < 0) errors.push(`${label} correctAnswer must exactly match an option`);
      const subjectPositions = answerPositionCounts.get(q.subjectCode) ?? [0, 0, 0, 0];
      if (answerIndex >= 0) subjectPositions[answerIndex] += 1;
      answerPositionCounts.set(q.subjectCode, subjectPositions);
      const optionLengths = (q.options ?? []).map((option) => String(option).trim().length);
      if (answerIndex >= 0 && optionLengths[answerIndex] === Math.max(...optionLengths)
          && optionLengths.filter((length) => length === optionLengths[answerIndex]).length === 1) {
        uniquelyLongestCorrectCounts.set(q.subjectCode, (uniquelyLongestCorrectCounts.get(q.subjectCode) ?? 0) + 1);
      }
    }

    subjectCounts.set(q.subjectCode, (subjectCounts.get(q.subjectCode) ?? 0) + 1);
    const diffKey = `${q.subjectCode}:${q.difficulty}`;
    difficultyCounts.set(diffKey, (difficultyCounts.get(diffKey) ?? 0) + 1);
    const objectiveKey = `${q.subjectCode}:${mapping?.objectiveCode}`;
    objectiveCounts.set(objectiveKey, (objectiveCounts.get(objectiveKey) ?? 0) + 1);
  }

  const expectedGroups = new Map();
  for (const q of pkg.questions) expectedGroups.set(`${q.subjectCode}:g${q.grade}`, q.subjectCode);
  for (const [groupKey, subjectCode] of expectedGroups) {
    const groupQuestions = pkg.questions.filter((q) => `${q.subjectCode}:g${q.grade}` === groupKey);
    if (groupQuestions.length !== 20) errors.push(`${groupKey} must contain exactly 20 questions`);
    for (const [difficulty, expected] of [['easy', 5], ['medium', 10], ['hard', 5]]) {
      const count = groupQuestions.filter((q) => q.difficulty === difficulty).length;
      if (count !== expected) errors.push(`${groupKey} must contain ${expected} ${difficulty} questions`);
    }
    const positions = [0, 1, 2, 3].map((index) => groupQuestions.filter((q) => q.options?.indexOf(q.correctAnswer) === index).length);
    if (positions.some((count) => count !== 5)) errors.push(`${groupKey} must balance correct options 5/5/5/5 across A–D`);
    const longestCorrect = groupQuestions.filter((q) => {
      const lengths = q.options.map((option) => String(option).trim().length);
      const answerIndex = q.options.indexOf(q.correctAnswer);
      return lengths[answerIndex] === Math.max(...lengths) && lengths.filter((length) => length === lengths[answerIndex]).length === 1;
    }).length;
    if (longestCorrect > 12) errors.push(`${groupKey} has the correct option as uniquely longest in more than 60% of questions`);
    const coveredObjectives = new Map();
    for (const q of groupQuestions) coveredObjectives.set(q.mappings?.[0]?.objectiveCode, (coveredObjectives.get(q.mappings?.[0]?.objectiveCode) ?? 0) + 1);
    if (coveredObjectives.size !== 5 || [...coveredObjectives.values()].some((count) => count !== 4)) errors.push(`${groupKey} must cover five objectives with four questions each`);
  }
  if (pkg.questions.length !== 80) errors.push(`package must contain exactly 80 questions; found ${pkg.questions.length}`);
  if (pkg.schemaVersion === 2) {
    if (referencedAssetIds.size !== pkg.assets.length) errors.push('every declared visual asset must be referenced by at least one question');
    const visualQuestionCount = pkg.questions.filter((question) => question.visualAssetId).length;
    const [minimumAssets, maximumAssets] = packageExpectation?.visualAssetRange ?? [1, 100];
    if (visualQuestionCount < minimumAssets || visualQuestionCount > maximumAssets) {
      errors.push(`package must contain ${minimumAssets}–${maximumAssets} visual questions; found ${visualQuestionCount}`);
    }
  }

  const cleanAssets = pkg.assets.map((asset) => ({
    ...asset,
    publicUrl: `${pkg.assetBaseUrl}${asset.publicPath}`,
  }));
  const cleanAssetsById = new Map(cleanAssets.map((asset) => [asset.assetId, asset]));
  const cleanPackage = {
    ...pkg,
    assets: cleanAssets,
    questions: pkg.questions.map(({ __file, ...question }) => {
      const asset = cleanAssetsById.get(question.visualAssetId);
      return asset ? {
        ...question,
        imageUrl: asset.publicUrl,
        imageAltText: asset.altText,
        visualAssetSha256: asset.sha256,
      } : question;
    }),
  };
  return { valid: errors.length === 0, errors, package: cleanPackage };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packageDirs = process.argv[2]
    ? [path.resolve(process.argv[2])]
    : packageDirectories();
  const taxonomyArtifact = loadCanonicalQuestionTaxonomy();
  let failed = false;
  const taxonomyDocumentErrors = [
    ...taxonomyArtifact.errors,
    ...validateCanonicalTaxonomyOrphans(taxonomyArtifact),
  ];
  if (taxonomyDocumentErrors.length) {
    failed = true;
    console.error(`Canonical verified-question taxonomy validation failed for ${path.basename(taxonomyArtifact.path)}:`);
    for (const error of taxonomyDocumentErrors) console.error(`- ${error}`);
  }
  for (const packageDir of packageDirs) {
    const result = validateVerifiedQuestionPackage(packageDir, {
      taxonomyArtifact,
      includeTaxonomyDocumentErrors: false,
    });
    if (!result.valid) {
      failed = true;
      console.error(`Verified question package validation failed for ${path.basename(packageDir)}:`);
      for (const error of result.errors) console.error(`- ${error}`);
      continue;
    }
    const counts = new Map();
    for (const question of result.package.questions) counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1);
    console.log(`Verified question package ${result.package.packageId}@${result.package.packageVersion} passed (${result.package.questions.length} questions: ${[...counts].map(([subject, count]) => `${subject} ${count}`).join(', ')}).`);
  }
  if (failed) process.exit(1);
}
