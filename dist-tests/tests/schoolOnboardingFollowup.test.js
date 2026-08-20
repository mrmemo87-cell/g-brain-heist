import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const setupWizard = readFileSync('components/onboarding/SetupWizard.tsx', 'utf8');
const upgradeModal = readFileSync('components/UpgradeModal.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260812164653_fix_teacher_signup_teaching_status.sql', 'utf8');
const configuredGradeMigration = readFileSync('supabase/migrations/20260816155720_allow_configured_school_grade_labels.sql', 'utf8');
test('active teacher-role memberships are always recognized as teaching staff', () => {
    assert.match(migration, /role_in_school = 'teacher'[\s\S]*new\.can_teach := true/);
    assert.match(migration, /update public\.school_members[\s\S]*role_in_school = 'teacher'[\s\S]*can_teach is distinct from true/);
    assert.match(migration, /before insert or update of role_in_school, status, can_teach/);
});
test('school onboarding gets grade choices from approved school classes', () => {
    assert.match(setupWizard, /getConfiguredSchoolGrades\(approvedClasses\)/);
    assert.match(setupWizard, /path === 'school' \? schoolGradeOptions : SOLO_GRADES\.map\(String\)/);
    assert.doesNotMatch(setupWizard, /value >= 6|value <= 12/);
    assert.match(setupWizard, /p_grade: null/);
    assert.match(setupWizard, /p_batch: null/);
    assert.match(setupWizard, /const studentGradeRequired = selectedRole === 'student' && \(path === 'individual' \|\| schoolHasConfiguredGrades\)/);
    assert.match(setupWizard, /School will assign your grade/);
    assert.match(setupWizard, /has not configured grades or classes yet/);
});
test('school-configured grade labels are accepted by the profile constraint', () => {
    assert.match(configuredGradeMigration, /drop constraint if exists users_grade_check/);
    assert.match(configuredGradeMigration, /length\(btrim\(grade\)\) between 1 and 64/);
    assert.doesNotMatch(configuredGradeMigration, />=\s*6|<=\s*12/);
});
test('ordinary school members never receive school checkout or pilot controls', () => {
    assert.match(upgradeModal, /getMySchoolCapabilities/);
    assert.match(upgradeModal, /const isSchoolHead = !loading && viewerIsSchoolMember && canManageSchoolBilling/);
    assert.match(upgradeModal, /const isSchoolMember = !loading && viewerIsSchoolMember && !canManageSchoolBilling/);
    assert.match(upgradeModal, /Your school admin manages programme access/);
    assert.match(upgradeModal, /You do not need to purchase anything from a student or teacher account/);
    assert.doesNotMatch(upgradeModal, /exclusively for Prime users/);
});
