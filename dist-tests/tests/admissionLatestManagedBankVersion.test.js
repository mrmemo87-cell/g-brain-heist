import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const migrationPath = 'supabase/migrations/20260720120000_admission_generate_latest_managed_bank_version.sql';
const migration = readFileSync(migrationPath, 'utf8');
const grade6Maths = JSON.parse(readFileSync('supabase/seed/admission-official-bank/maths/grade_6.json', 'utf8'));
const managedVersion = /^adm-bank-v(\d+)-g(\d+)-(english|maths|science)$/;
function latestManagedVersion(versions, grade, subject) {
    return versions
        .map((version) => ({ version, match: version.match(managedVersion) }))
        .filter((item) => item.match !== null && Number(item.match[2]) === grade && item.match[3] === subject)
        .sort((a, b) => Number(b.match[1]) - Number(a.match[1]))[0]?.version;
}
test('latest managed-bank migration resolves one numeric version for the exact blueprint grade and subject', () => {
    assert.match(migration, /v_blueprint_grade := COALESCE\(v_bp\.target_grade, v_bp\.target_stage\)/);
    assert.match(migration, /\^adm-bank-v\[0-9\]\+-g\[0-9\]\+-\(english\|maths\|science\)\$/);
    assert.match(migration, /\^adm-bank-v\[0-9\]\+-g' \|\| v_blueprint_grade::text \|\| '-' \|\| lower\(v_bp\.subject\) \|\| '\$'/);
    assert.match(migration, /ORDER BY \(substring\(qp\.content_version FROM '\^adm-bank-v\(\[0-9\]\+\)-'\)\)::int DESC/);
    assert.equal(latestManagedVersion(['adm-bank-v1-g6-maths', 'adm-bank-v2-g6-maths'], 6, 'maths'), 'adm-bank-v2-g6-maths');
    assert.equal(latestManagedVersion(['adm-bank-v1-g6-english'], 6, 'english'), 'adm-bank-v1-g6-english');
});
test('Grade 6 Maths generation is pinned to v2 without weakening managed-content safety', () => {
    assert.match(migration, /IF v_bp\.pool_id IS NOT NULL THEN[\s\S]*content_version = v_managed_content_version;/);
    assert.equal((migration.match(/COALESCE\(q\.content_version, qp\.content_version\) = v_managed_content_version/g) ?? []).length, 3);
    assert.doesNotMatch(migration, /LIKE 'adm-bank-v1-g%'/);
    const required = { easy: 10, medium: 13, hard: 2 };
    const selected = Object.entries(required).flatMap(([difficulty, count]) => grade6Maths.questions.filter((question) => question.difficulty === difficulty).slice(0, count));
    const ids = new Set(selected.map((question) => question.external_id));
    const stems = new Set(selected.map((question) => question.prompt.trim().toLowerCase()));
    const byDifficulty = selected.reduce((counts, question) => {
        counts[question.difficulty] = (counts[question.difficulty] ?? 0) + 1;
        return counts;
    }, {});
    assert.equal(selected.length, 25);
    assert.ok(selected.every((question) => question.content_version === 'adm-bank-v2-g6-maths'));
    assert.ok(selected.every((question) => question.content_version !== 'adm-bank-v1-g6-maths'));
    assert.deepEqual(byDifficulty, required);
    assert.equal(ids.size, 25);
    assert.equal(stems.size, 25);
});
