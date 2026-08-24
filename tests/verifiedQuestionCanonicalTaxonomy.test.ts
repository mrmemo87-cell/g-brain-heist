import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const packageDirectory = 'content/verified-question-packages/2026-7-0';

const codeSegment = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const loadPackageFixture = () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'manifest.json'), 'utf8'));
  const questions = manifest.files.flatMap((file: string) => {
    const source = JSON.parse(readFileSync(path.join(packageDirectory, file), 'utf8'));
    return source.questions.map((question: any) => ({
      ...question,
      subjectCode: source.subjectCode,
      grade: source.grade,
    }));
  });
  return { manifest, questions };
};

const buildReviewedRows = () => {
  const { manifest, questions } = loadPackageFixture();
  return questions.map((question: any, index: number) => {
    const primarySkillCode = `${question.subjectCode}.${codeSegment(question.topic)}`;
    return {
      taxonomyVersion: 'bh-canonical-1',
      packageId: manifest.packageId,
      packageVersion: manifest.packageVersion,
      contentVersion: manifest.contentVersion,
      frameworkCode: manifest.curriculum.frameworkCode,
      frameworkVersionCode: manifest.curriculum.versionCode,
      externalId: question.externalId,
      subjectCode: question.subjectCode,
      grade: question.grade,
      scopeCode: question.mappings[0].scopeCode,
      objectiveCode: question.mappings[0].objectiveCode,
      primarySkillCode,
      primarySkillName: question.topic,
      atomicSubskillCode: `${primarySkillCode}.select-supported-response-${index + 1}`,
      atomicSubskillName: `Select the specifically supported response for task ${index + 1}`,
      assessmentProcessCode: 'AO2',
      cognitiveProcess: 'apply',
      evidenceStatement: 'A correct response shows that the student can select the specifically supported conclusion from the supplied evidence.',
      secondarySkillCodes: [],
      confidence: 0.95,
      reviewStatus: 'approved',
      humanReview: false,
      reviewReason: null,
    };
  });
};

const writeJsonLines = (filePath: string, rows: any[]) => {
  writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
};

const runValidator = (taxonomyPath: string) => spawnSync(
  process.execPath,
  ['scripts/validate-verified-question-package.mjs', packageDirectory],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, BH_VERIFIED_QUESTION_TAXONOMY_PATH: taxonomyPath },
  },
);

test('every current package item requires complete approved canonical taxonomy coverage', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'bh-canonical-taxonomy-'));
  const taxonomyPath = path.join(temporaryDirectory, 'bh-canonical-1.jsonl');
  try {
    const reviewedRows = buildReviewedRows();
    writeJsonLines(taxonomyPath, reviewedRows);
    const covered = runValidator(taxonomyPath);
    assert.equal(covered.status, 0, `${covered.stdout}\n${covered.stderr}`);
    assert.match(covered.stdout, /brain-heist-grade-6-core-2026-7@2026\.7\.0 passed/);

    writeJsonLines(taxonomyPath, reviewedRows.slice(1));
    const uncovered = runValidator(taxonomyPath);
    assert.notEqual(uncovered.status, 0);
    assert.match(`${uncovered.stdout}\n${uncovered.stderr}`, /requires an exact companion row/i);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('canonical taxonomy rejects broad overrides, drift, incoherent assessment metadata and orphan rows', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'bh-invalid-taxonomy-'));
  const taxonomyPath = path.join(temporaryDirectory, 'bh-canonical-1.jsonl');
  try {
    const rows = buildReviewedRows();
    rows[0].atomicSubskillName = loadPackageFixture().questions[0].curriculum.subskill;
    rows[1].primarySkillCode = 'English.Reading';
    rows[2].scopeCode = 'english-grade-99';
    rows[3].objectiveCode = 'wrong-objective';
    rows[4].assessmentProcessCode = ['AO1', 'AO2'];
    rows[5].assessmentProcessCode = 'AO2';
    rows[5].cognitiveProcess = 'analyze';
    rows[6].evidenceStatement = 'Too vague';
    rows[7].confidence = 1.1;
    rows[8].reviewStatus = 'in_review';
    rows[8].humanReview = false;
    rows[8].reviewReason = null;
    rows[9].confidence = 0.8;
    rows[10].packageVersion = '2099.1.0';
    rows.push({ ...rows[11], externalId: 'bh-orphan-canonical-taxonomy-item' });
    writeJsonLines(taxonomyPath, rows);

    const result = runValidator(taxonomyPath);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /non-generic atomic performance/i);
    assert.match(output, /lowercase, dot-separated, grade- and release-neutral code/i);
    assert.match(output, /scopeCode must exactly match/i);
    assert.match(output, /objectiveCode must exactly match/i);
    assert.match(output, /exactly one code from AO1 to AO4/i);
    assert.match(output, /cognitiveProcess analyze is inconsistent with AO2/i);
    assert.match(output, /evidenceStatement must be a specific/i);
    assert.match(output, /confidence must be a number from 0 to 1/i);
    assert.match(output, /approved rows require confidence of at least 0\.9/i);
    assert.match(output, /in_review rows must set humanReview to true/i);
    assert.match(output, /in_review rows require a concise reviewReason/i);
    assert.match(output, /packageVersion must exactly match/i);
    assert.match(output, /is orphaned from the verified question packages/i);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
