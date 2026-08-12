import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupWizard = readFileSync('components/onboarding/SetupWizard.tsx', 'utf8');
const upgradeModal = readFileSync('components/UpgradeModal.tsx', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260812210000_fix_teacher_signup_teaching_status.sql',
  'utf8',
);

test('active teacher-role memberships are always recognized as teaching staff', () => {
  assert.match(migration, /role_in_school = 'teacher'[\s\S]*new\.can_teach := true/);
  assert.match(migration, /update public\.school_members[\s\S]*role_in_school = 'teacher'[\s\S]*can_teach is distinct from true/);
  assert.match(migration, /before insert or update of role_in_school, status, can_teach/);
});

test('school onboarding gets grade choices from approved school classes', () => {
  assert.match(setupWizard, /const schoolGradeOptions = Array\.from/);
  assert.match(setupWizard, /path === 'school' \? schoolGradeOptions : \[6, 7, 8, 9, 10, 11, 12\]/);
  assert.match(setupWizard, /const studentGradeRequired = path === 'individual' \|\| schoolHasConfiguredGrades/);
  assert.match(setupWizard, /School will assign your grade/);
  assert.match(setupWizard, /has not configured grades or classes yet/);
});

test('ordinary school members never receive school checkout or pilot controls', () => {
  assert.match(upgradeModal, /getMySchoolCapabilities/);
  assert.match(upgradeModal, /showSchoolManagedAccess/);
  assert.match(upgradeModal, /School Access Not Active/);
  assert.match(upgradeModal, /School Head manages the school plan and the free pilot/);
  assert.doesNotMatch(upgradeModal, /exclusively for Prime users/);
});
