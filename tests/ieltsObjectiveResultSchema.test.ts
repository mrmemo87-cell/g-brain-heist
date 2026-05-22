import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('objective result page selects objective attempts without estimated_band and renders est_band', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsObjectiveResult.tsx'), 'utf8');

  assert.match(page, /from\(table\)\.select\('id, raw_score, total_questions, percent, est_band, completed_at'\)/i, 'objective attempt select should only request est_band for reading/listening attempts');
  assert.doesNotMatch(page, /estimated_band/i, 'objective result page should not reference estimated_band for reading/listening attempts');
  assert.match(page, /Estimated readiness band:[\s\S]*data\.est_band \?\? 'Not enough data'/i, 'objective result page should render est_band as source of truth');
});

test('My IELTS Journey service objective attempt selects avoid estimated_band on reading/listening tables', () => {
  const service = fs.readFileSync(path.join(process.cwd(), 'services/ieltsService.ts'), 'utf8');

  assert.match(service, /from\('ielts_reading_attempts'\)[\s\S]*select\('id, set_id, started_at, completed_at, raw_score, total_questions, percent, est_band'\)/i, 'reading attempts select in journey service should use est_band only');
  assert.match(service, /from\('ielts_listening_attempts'\)[\s\S]*select\('id, set_id, started_at, completed_at, raw_score, total_questions, percent, est_band'\)/i, 'listening attempts select in journey service should use est_band only');
  assert.doesNotMatch(service, /from\('ielts_reading_attempts'\)[\s\S]*estimated_band/i, 'reading attempts selects should not request estimated_band');
  assert.doesNotMatch(service, /from\('ielts_listening_attempts'\)[\s\S]*estimated_band/i, 'listening attempts selects should not request estimated_band');
});
