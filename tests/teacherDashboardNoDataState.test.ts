import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portalShell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');

test('teacher dashboard does not present missing current evidence as zero-percent performance', () => {
  assert.match(portalShell, /const hasAnswerEvidence = metrics\.answered_question_count > 0/);
  assert.match(portalShell, /accuracy == null \? '—'/);
  assert.match(portalShell, /No current assignment answers yet/);
  assert.match(portalShell, /No current submissions yet/);
});
