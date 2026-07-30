import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const wizard = fs.readFileSync(path.resolve(process.cwd(), 'components/teacher/AssignmentWizard.tsx'), 'utf8');
const portal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');

test('assignment creation uses a six-step, single-decision wizard', () => {
  for (const label of ['Audience', 'Subject', 'Questions', 'Details', 'Due date', 'Review']) {
    assert.match(wizard, new RegExp(`short: '${label}'`));
  }
  assert.match(wizard, /aria-label="Assignment creation progress"/);
  assert.match(wizard, /aria-current=\{current \? 'step'/);
  assert.match(wizard, /🚀 Publish Assignment/);
});

test('question bank filters and deduplicates slash variants in the UI', () => {
  assert.match(wizard, /replace\(\/\[⁄∕／\]\/g, '\/'\)/);
  assert.match(wizard, /const ids = new Set<string>\(\)/);
  assert.match(wizard, /const content = new Set<string>\(\)/);
  for (const label of ['Filter by topic', 'Filter by difficulty', 'Filter by question type', 'Filter by XP', 'Sort questions']) {
    assert.match(wizard, new RegExp(`aria-label="${label}"`));
  }
});

test('wizard clearly discards drafts and protects accidental exits', () => {
  assert.match(wizard, /beforeunload/);
  assert.match(wizard, /Your progress will be lost and cannot be recovered/);
  assert.doesNotMatch(wizard, /localStorage\.setItem/);
  assert.doesNotMatch(wizard, /Draft restored/);
});

test('existing assignment publish handler remains the only creation path', () => {
  assert.match(portal, /onSubmit=\{handleCreateAssignment\}/);
  assert.match(portal, /GameService\.create_assignment/);
  assert.doesNotMatch(wizard, /GameService\.create_assignment|supabase\.rpc|supabase\.from/);
});
