import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260720130000_admission_normalize_maths_subject_aliases.sql';
const migration = readFileSync(migrationPath, 'utf8');
const grade6Maths = JSON.parse(readFileSync('supabase/seed/admission-official-bank/maths/grade_6.json', 'utf8'));

function normalizeManagedSubject(subject: string | null): string | undefined {
  switch (subject?.trim().toLowerCase()) {
    case 'math':
    case 'maths':
    case 'mathematics':
      return 'maths';
    case 'english':
      return 'english';
    case 'science':
      return 'science';
    default:
      return undefined;
  }
}

function resolveManagedVersion(grade: number | null, subject: string | null, pools: Array<{ subject: string; contentVersion: string }>) {
  const managedSubject = normalizeManagedSubject(subject);
  if (grade === null || managedSubject === undefined) return undefined;

  return pools
    .filter((pool) => normalizeManagedSubject(pool.subject) === managedSubject)
    .map((pool) => pool.contentVersion)
    .filter((version) => new RegExp(`^adm-bank-v\\d+-g${grade}-${managedSubject}$`).test(version))
    .sort((a, b) => Number(b.match(/^adm-bank-v(\d+)-/)?.[1]) - Number(a.match(/^adm-bank-v(\d+)-/)?.[1]))[0];
}

const grade6MathsPools = [
  { subject: 'math', contentVersion: 'adm-bank-v1-g6-maths' },
  { subject: ' maths ', contentVersion: 'adm-bank-v2-g6-maths' },
  { subject: 'maths', contentVersion: 'adm-bank-v1-g6-maths' },
  { subject: 'maths', contentVersion: 'adm-bank-v2-g6-maths' },
];

test('follow-up migration normalizes managed Maths aliases without changing blueprint subjects', () => {
  assert.match(migration, /v_managed_subject TEXT/);
  assert.match(migration, /v_managed_subject := CASE lower\(btrim\(v_bp\.subject\)\)/);
  for (const alias of ['math', 'maths', 'mathematics']) {
    assert.match(migration, new RegExp(`WHEN '${alias}' THEN 'maths'`));
  }
  assert.match(migration, /WHEN 'english' THEN 'english'/);
  assert.match(migration, /WHEN 'science' THEN 'science'/);
  assert.match(migration, /IF v_blueprint_grade IS NULL OR v_managed_subject IS NULL THEN/);
  assert.match(migration, /v_blueprint_grade::text \|\| '-' \|\| v_managed_subject \|\| '\$'/);
  assert.doesNotMatch(migration, /UPDATE\s+(?:public\.)?adm_blueprints/i);
  assert.doesNotMatch(migration, /UPDATE\s+(?:public\.)?adm_test_forms/i);
});

test('Grade 6 Maths aliases resolve only the latest v2 Maths bank, including math-named pools', () => {
  for (const alias of ['math', 'maths', 'mathematics', '  MaTh  ']) {
    assert.equal(resolveManagedVersion(6, alias, grade6MathsPools), 'adm-bank-v2-g6-maths');
  }

  assert.match(migration, /CASE lower\(btrim\(qp\.subject\)\)[\s\S]*END = v_managed_subject/);
  assert.match(migration, /CASE lower\(btrim\(subject\)\)[\s\S]*END = v_managed_subject/);
});

test('Grade 6 Maths v2 content generates the required safe 25-question distribution', () => {
  const required = { easy: 10, medium: 13, hard: 2 } as const;
  const selected = Object.entries(required).flatMap(([difficulty, count]) =>
    grade6Maths.questions
      .filter((question: { difficulty: string; content_version: string }) =>
        question.difficulty === difficulty && question.content_version === 'adm-bank-v2-g6-maths',
      )
      .slice(0, count),
  );
  const counts = selected.reduce<Record<string, number>>((result, question: { difficulty: string }) => {
    result[question.difficulty] = (result[question.difficulty] ?? 0) + 1;
    return result;
  }, {});

  assert.equal(selected.length, 25);
  assert.deepEqual(counts, required);
  assert.ok(selected.every((question: { content_version: string }) => question.content_version === 'adm-bank-v2-g6-maths'));
  assert.ok(selected.every((question: { content_version: string }) => question.content_version !== 'adm-bank-v1-g6-maths'));
  assert.equal((migration.match(/COALESCE\(q\.content_version, qp\.content_version\) = v_managed_content_version/g) ?? []).length, 3);
});

test('unknown subjects and missing grade or stage fail closed', () => {
  assert.equal(resolveManagedVersion(6, 'history', grade6MathsPools), undefined);
  assert.equal(resolveManagedVersion(null, 'math', grade6MathsPools), undefined);
  assert.equal(resolveManagedVersion(null, 'maths', grade6MathsPools), undefined);
  assert.match(migration, /IF v_blueprint_grade IS NULL OR v_managed_subject IS NULL THEN[\s\S]*Blueprint has no managed bank grade\/subject/);
});
