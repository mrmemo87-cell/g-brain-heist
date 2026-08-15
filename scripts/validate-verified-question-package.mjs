#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_ROOT = path.resolve(__dirname, '..', 'content', 'verified-question-packages');
export const DEFAULT_PACKAGE_DIR = path.join(PACKAGES_ROOT, '2026-6-0');
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const VALID_TYPES = new Set(['multiple_choice', 'true_false', 'short_answer']);
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
  const packageExpectation = PACKAGE_EXPECTATIONS.get(pkg.packageId);
  const expectedScopes = packageExpectation?.scopes ?? new Map();
  if (!packageExpectation) errors.push(`packageId ${pkg.packageId ?? 'missing'} has no reviewed validation profile`);
  if (pkg.curriculum?.frameworkCode !== 'brain-heist-international'
      || pkg.curriculum?.versionCode !== packageExpectation?.curriculumVersion) {
    errors.push(`package must target brain-heist-international ${packageExpectation?.curriculumVersion ?? 'reviewed version'}`);
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

  const cleanPackage = { ...pkg, questions: pkg.questions.map(({ __file, ...question }) => question) };
  return { valid: errors.length === 0, errors, package: cleanPackage };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packageDirs = process.argv[2]
    ? [path.resolve(process.argv[2])]
    : readdirSync(PACKAGES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(PACKAGES_ROOT, entry.name))
      .filter((directory) => {
        try { readFileSync(path.join(directory, 'manifest.json')); return true; } catch { return false; }
      })
      .sort();
  let failed = false;
  for (const packageDir of packageDirs) {
    const result = validateVerifiedQuestionPackage(packageDir);
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
