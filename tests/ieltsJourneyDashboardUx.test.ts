import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsJourneyDashboard.tsx'), 'utf8');

test('uses valid assigned practice route and never links to nonexistent /ielts/assigned', () => {
  assert.match(page, /navigate\('\/ielts\/practice\/assigned'\)/);
  assert.doesNotMatch(page, /\/ielts\/assigned/);
});

test('next action avoids fake completion phrasing', () => {
  assert.doesNotMatch(page, /Next: All tasks complete/);
  assert.match(page, /No active IELTS assignments right now\.|View your latest results and feedback\./);
});

test('light theme and band readiness section are present', () => {
  assert.match(page, /background:\s*'#f8fafc'/);
  assert.match(page, /Readiness overview/);
  assert.match(page, /Overall/);
  assert.match(page, /Not enough data yet/);
});

test('status labels are humanized and no raw in_progress token appears in UI copy', () => {
  assert.match(page, /In progress/);
  assert.doesNotMatch(page, /Status:\s*\{item\.status\b/);
});

test('assignment cards show only actual assigned skills and no Not assigned rows', () => {
  assert.match(page, /orderedSkills\.filter\(\(skill\) => \(item\.skills \?\? \[\]\)\.includes\(skill\)\)/);
  assert.doesNotMatch(page, /Not assigned/);
});

test('result and feedback CTA gating exists for objective vs productive skills', () => {
  assert.match(page, /View result/);
  assert.match(page, /View feedback/);
  assert.match(page, /Review pending/);
  assert.doesNotMatch(page, /generic mixed View feedback/i);
});
