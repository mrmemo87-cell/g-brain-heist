import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const importer = 'scripts/import-admission-official-bank.mjs';

function runImport(args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [importer, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function makeInvalidSeedDir() {
  const root = mkdtempSync(path.join(tmpdir(), 'adm-official-bank-import-invalid-'));
  for (const dir of ['english', 'maths', 'science', 'shared']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, 'shared', 'reading_passages.json'), JSON.stringify({ passages: [] }));
  writeFileSync(path.join(root, 'shared', 'writing_rubrics.json'), JSON.stringify({ rubrics: [] }));
  const empty = { content_version: 'test', source_label: 'Test', pools: [], questions: [] };
  for (const subject of ['english', 'maths', 'science']) {
    for (const grade of [5, 6, 7, 8]) writeFileSync(path.join(root, subject, `grade_${grade}.json`), JSON.stringify(empty));
  }
  writeFileSync(path.join(root, 'maths', 'grade_5.json'), JSON.stringify({
    content_version: 'test',
    source_label: 'Test',
    pools: [
      {
        external_id: 'bad-pool',
        subject: 'maths',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'foundation',
        name: 'Bad pool',
        content_version: 'test',
        source_label: 'Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
    questions: [
      {
        external_id: 'bad-question',
        pool_external_id: 'bad-pool',
        subject: 'maths',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'foundation',
        diagnostic_skill: 'Number',
        strand: 'number',
        subskill: 'fractions',
        difficulty: 'easy',
        question_type: 'mcq',
        prompt: 'Broken question',
        options: ['A', 'B', 'C'],
        explanation: 'Missing correct answer and one option.',
        marks: 1,
        estimated_seconds: 30,
        content_version: 'test',
        source_label: 'Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
  }));
  return root;
}

test('official admission bank import refuses without service-role credentials', () => {
  const result = runImport(['--dry-run'], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: '',
    ADMISSION_BANK_IMPORT_TARGET: 'staging',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /SUPABASE_SERVICE_ROLE_KEY is required/);
});

test('official admission bank import refuses unclear target environments', () => {
  const result = runImport(['--dry-run'], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
    ADMISSION_BANK_IMPORT_TARGET: '',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ADMISSION_BANK_IMPORT_TARGET must be set/);
});

test('official admission bank import runs validation before dry-run/import work', () => {
  const result = runImport(['--dry-run', '--seed-dir', makeInvalidSeedDir()], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
    ADMISSION_BANK_IMPORT_TARGET: 'staging',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /Validation failed before import/);
  assert.match(output, /auto-scored question is missing correct_answer/);
  assert.match(output, /multiple-choice question must include at least 4 options/);
});

test('official admission bank import dry-run summarizes without Supabase mutation', () => {
  const result = runImport(['--dry-run'], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
    ADMISSION_BANK_IMPORT_TARGET: 'staging',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /import dry-run for staging/);
  assert.match(output, /Pools: 18/);
  assert.match(output, /Questions: 512/);
  assert.doesNotMatch(output, /upserted/);
});

test('official admission bank import maps seed subject and primary stage to database-compatible values', () => {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { mapSeedSubjectToDb, mapSeedStageLevelToDb } from './scripts/import-admission-official-bank.mjs'; console.log(mapSeedSubjectToDb('maths')); console.log(mapSeedSubjectToDb('science')); console.log(mapSeedStageLevelToDb('primary', 5));",
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['math', 'science', '5']);
});
