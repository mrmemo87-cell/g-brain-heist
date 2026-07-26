import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const teacherPortalPath = path.resolve(process.cwd(), 'components/TeacherPortal.tsx');
const teacherGuidePath = path.resolve(process.cwd(), 'docs/teacher-guide.md');

test('teacher dashboard omits the retired quick-start checklist', () => {
  const source = fs.readFileSync(teacherPortalPath, 'utf8');

  assert.doesNotMatch(source, /Teacher quick start/i);
  assert.doesNotMatch(source, /Start teaching in three clear steps/);
  assert.doesNotMatch(source, /teacherSetupSteps/);
});

test('teacher quick-start guide is app-first and avoids database setup instructions', () => {
  const guide = fs.readFileSync(teacherGuidePath, 'utf8');

  assert.match(guide, /Your first assignment/);
  assert.match(guide, /School Admin → Teachers/);
  assert.match(guide, /School Admin → Plan & Billing/);
  assert.doesNotMatch(guide, /Insert a row into the/);
  assert.doesNotMatch(guide, /use Supabase Table Editor/i);
});

test('student reports do not call an undeployed AI analysis function', () => {
  const source = fs.readFileSync(teacherPortalPath, 'utf8');

  assert.doesNotMatch(source, /GameService\.generate_assignment_analysis\(/);
  assert.match(source, /Student-level reporting uses stored answers and scoring only/);
});
