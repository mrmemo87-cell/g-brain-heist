import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsJourneyDashboard.tsx'), 'utf8');
const home = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsHome.tsx'), 'utf8');

test('student dashboard does not expose review queue/admin cards', () => {
  assert.doesNotMatch(page, /IELTS Review Queue|admin operation cards/i);
  assert.match(home, /\{canOpenReviewQueue && \(/, 'review queue card remains role-gated on home');
});

test('current assignments include progress and task rows', () => {
  assert.match(page, /Current assignments/);
  assert.match(page, /tasks completed/);
  assert.match(page, /Reading/);
  assert.match(page, /Listening/);
  assert.match(page, /Writing/);
  assert.match(page, /Speaking/);
  assert.match(page, /Start assignment|Continue assignment/);
});

test('completed assignments show skill-specific CTAs and pending rules', () => {
  assert.match(page, /View result/);
  assert.match(page, /View feedback/);
  assert.match(page, /Review pending — your teacher or school admin has not finalized feedback yet\./);
  assert.doesNotMatch(page, />View feedback<\/button>\s*:\s*null\}\s*\}\s*<\/div>/i, 'no generic mixed View feedback button block should remain');
});

test('empty states and reduced motion handling are present', () => {
  assert.match(page, /No current IELTS assignments\./);
  assert.match(page, /No completed IELTS assignments yet\./);
  assert.match(page, /No results available yet\./);
  assert.match(page, /No reviewed feedback yet\./);
  assert.match(page, /prefers-reduced-motion: reduce/);
});
