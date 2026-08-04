import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('disposable Postgres verifies adversarial IELTS exam lifecycle boundaries', (t) => {
  const databaseUrl = process.env['IELTS_RLS_TEST_DATABASE_URL'];
  if (!databaseUrl) {
    t.skip('Set IELTS_RLS_TEST_DATABASE_URL to run the rollback-only IELTS exam lifecycle harness.');
    return;
  }

  const sqlPath = path.join(process.cwd(), 'supabase/tests/ielts_exam_live_launch_safety.sql');
  const result = spawnSync('psql', [
    '--no-psqlrc',
    '--set', 'ON_ERROR_STOP=1',
    '--dbname', databaseUrl,
    '--file', sqlPath,
  ], {
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      PGCONNECT_TIMEOUT: '10',
    },
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join('\n'));
});
