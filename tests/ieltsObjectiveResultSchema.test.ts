import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('objective result page selects practice evidence without a readiness band', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsObjectiveResult.tsx'), 'utf8');

  assert.match(page, /from\(table\)\.select\('id, raw_score, total_questions, percent, completed_at'\)/i, 'objective result should request raw practice evidence only');
  assert.doesNotMatch(page, /est_band|estimated_band/i, 'objective result page must not read a legacy practice band field');
  assert.match(page, /Practice result:[\s\S]*not a verified IELTS readiness band/i, 'objective result must label the score as practice-only evidence');
});

test('recent Reading and Listening attempts avoid legacy practice band fields', () => {
  const service = fs.readFileSync(path.join(process.cwd(), 'services/ieltsService.ts'), 'utf8');

  assert.match(service, /from\('ielts_reading_attempts'\)[\s\S]*select\('id, set_id, started_at, completed_at, raw_score, total_questions, percent'\)/i, 'reading recent attempts should fetch practice evidence only');
  assert.match(service, /from\('ielts_listening_attempts'\)[\s\S]*select\('id, set_id, started_at, completed_at, raw_score, total_questions, percent'\)/i, 'listening recent attempts should fetch practice evidence only');
  assert.doesNotMatch(service, /from\('ielts_reading_attempts'\)[\s\S]{0,180}est_band/i, 'reading recent-attempt select must not request est_band');
  assert.doesNotMatch(service, /from\('ielts_listening_attempts'\)[\s\S]{0,180}est_band/i, 'listening recent-attempt select must not request est_band');
});


test('objective result page handles missing reading/listening attempts without PGRST116 crash', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsObjectiveResult.tsx'), 'utf8');

  assert.match(source, /\.maybeSingle\(\)/, 'objective result fetch must use maybeSingle for missing/inaccessible attempt rows');
  assert.doesNotMatch(source, /\.single\(\)/, 'objective result fetch must not use single, which throws PGRST116 on zero rows');
  assert.match(source, /Result not available yet\./, 'missing objective results should render a friendly not-available state');
  assert.match(source, /This result may not have been completed, or you may not have permission to view it\./, 'friendly state should explain completion/permission causes');
  assert.match(source, /Back to My IELTS Journey/, 'friendly state must retain the journey CTA');
  assert.match(source, /ielts_reading_attempts/, 'reading result table must still be supported');
  assert.match(source, /ielts_listening_attempts/, 'listening result table must still be supported');
});
