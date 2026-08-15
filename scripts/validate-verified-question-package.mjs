#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PACKAGE_DIR = path.resolve(__dirname, '..', 'content', 'verified-question-packages', '2026-2-0');
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const VALID_TYPES = new Set(['multiple_choice', 'true_false', 'short_answer']);
const EXPECTED_SCOPES = new Map([
  ['chemistry', { subject: 'Chemistry', grade: 11, scope: 'chemistry-grade-11' }],
  ['english', { subject: 'English', grade: 11, scope: 'english-grade-11' }],
  ['biology', { subject: 'Biology', grade: 11, scope: 'biology-grade-11' }],
  ['travel-tourism', { subject: 'Travel & Tourism', grade: 12, scope: 'travel-tourism-grade-12' }],
]);

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));
const normalize = (value) => String(value ?? '').toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();

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
    questions,
  };
}

export function validateVerifiedQuestionPackage(packageDir = DEFAULT_PACKAGE_DIR) {
  const errors = [];
  let pkg;
  try {
    pkg = loadVerifiedQuestionPackage(packageDir);
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)], package: null };
  }

  if (pkg.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(pkg.packageId ?? '')) errors.push('packageId is invalid');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/.test(pkg.packageVersion ?? '')) errors.push('packageVersion must be semantic versioning');
  if (!pkg.contentVersion || !pkg.authority) errors.push('contentVersion and authority are required');
  if (pkg.curriculum?.frameworkCode !== 'brain-heist-international' || pkg.curriculum?.versionCode !== '2026-2') {
    errors.push('the first release must target brain-heist-international 2026-2');
  }

  const externalIds = new Set();
  const prompts = new Map();
  const subjectCounts = new Map();
  const difficultyCounts = new Map();
  const answerPositionCounts = new Map();
  const uniquelyLongestCorrectCounts = new Map();
  const objectiveCounts = new Map();

  for (const q of pkg.questions) {
    const label = `${q.__file}:${q.externalId ?? 'missing-id'}`;
    const expected = EXPECTED_SCOPES.get(q.subjectCode);
    if (!expected || expected.subject !== q.subject || expected.grade !== q.grade) errors.push(`${label} has an invalid subject/grade combination`);
    if (!/^[a-z0-9][a-z0-9._-]{5,119}$/.test(q.externalId ?? '')) errors.push(`${label} has an invalid externalId`);
    if (externalIds.has(q.externalId)) errors.push(`${label} repeats externalId`);
    externalIds.add(q.externalId);
    if (!q.topic || !q.questionText || !q.correctAnswer || !q.explanation) errors.push(`${label} is missing required content`);
    if (String(q.explanation ?? '').trim().length < 20) errors.push(`${label} explanation is too short`);
    if (!VALID_DIFFICULTIES.has(q.difficulty)) errors.push(`${label} has invalid difficulty`);
    if (!VALID_TYPES.has(q.questionType)) errors.push(`${label} has invalid questionType`);
    if (!Number.isInteger(q.points) || q.points < 1 || q.points > 100) errors.push(`${label} points must be 1–100`);
    if (!Number.isInteger(q.timeLimit) || q.timeLimit < 10 || q.timeLimit > 600) errors.push(`${label} timeLimit must be 10–600 seconds`);

    const promptKey = normalize(q.questionText);
    if (prompts.has(promptKey)) errors.push(`${label} duplicates the prompt from ${prompts.get(promptKey)}`);
    prompts.set(promptKey, label);

    if (!Array.isArray(q.mappings) || q.mappings.length !== 1) errors.push(`${label} must have exactly one primary mapping`);
    const mapping = q.mappings?.[0];
    if (mapping?.scopeCode !== expected?.scope || !/^[a-z0-9][a-z0-9-]{5,80}$/.test(mapping?.objectiveCode ?? '')) {
      errors.push(`${label} has an invalid curriculum mapping`);
    }
    for (const field of ['strand', 'skill', 'subskill', 'objective']) {
      if (!String(q.curriculum?.[field] ?? '').trim()) errors.push(`${label} curriculum.${field} is required`);
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

  for (const subjectCode of EXPECTED_SCOPES.keys()) {
    if (subjectCounts.get(subjectCode) !== 20) errors.push(`${subjectCode} must contain exactly 20 questions`);
    for (const [difficulty, expected] of [['easy', 5], ['medium', 10], ['hard', 5]]) {
      if (difficultyCounts.get(`${subjectCode}:${difficulty}`) !== expected) errors.push(`${subjectCode} must contain ${expected} ${difficulty} questions`);
    }
    const positions = answerPositionCounts.get(subjectCode) ?? [];
    if (positions.length !== 4 || positions.some((count) => count !== 5)) errors.push(`${subjectCode} must balance correct options 5/5/5/5 across A–D`);
    if ((uniquelyLongestCorrectCounts.get(subjectCode) ?? 0) > 12) errors.push(`${subjectCode} has the correct option as uniquely longest in more than 60% of questions`);
    const coveredObjectives = [...objectiveCounts.entries()].filter(([key]) => key.startsWith(`${subjectCode}:`));
    if (coveredObjectives.length !== 5 || coveredObjectives.some(([, count]) => count !== 4)) errors.push(`${subjectCode} must cover five objectives with four questions each`);
  }
  if (pkg.questions.length !== 80) errors.push(`package must contain exactly 80 questions; found ${pkg.questions.length}`);

  const cleanPackage = { ...pkg, questions: pkg.questions.map(({ __file, ...question }) => question) };
  return { valid: errors.length === 0, errors, package: cleanPackage };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packageDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PACKAGE_DIR;
  const result = validateVerifiedQuestionPackage(packageDir);
  if (!result.valid) {
    console.error('Verified question package validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  const counts = new Map();
  for (const question of result.package.questions) counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1);
  console.log(`Verified question package ${result.package.packageId}@${result.package.packageVersion} passed (${result.package.questions.length} questions: ${[...counts].map(([subject, count]) => `${subject} ${count}`).join(', ')}).`);
}
