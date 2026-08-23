import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const head = fs.readFileSync('components/SchoolHeadPortal.tsx', 'utf8');
const guardian = fs.readFileSync('components/guardian/GuardianManagementPage.tsx', 'utf8');
const parent = fs.readFileSync('components/guardian/ParentPortal.tsx', 'utf8');
const parentDashboard = fs.readFileSync('components/guardian/ParentDashboardPremium.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260809178000_admin_progress_directory.sql', 'utf8');

test('School Admin exposes academic profiles, interventions and parent access in shared navigation', () => {
  assert.match(admin, /label: 'Academic Profiles'/);
  assert.match(admin, /label: 'Interventions'/);
  assert.match(admin, /label: 'Parents & Guardians'/);
  assert.match(admin, /<TeacherAcademicProfilesPage/);
  assert.match(admin, /<TeacherInterventionIntelligencePage/);
  assert.match(admin, /<GuardianManagementPage/);
  assert.doesNotMatch(admin, /window\.location\.assign/);
});

test('School Head Academic Performance embeds student academic profiles', () => {
  assert.match(head, /TeacherAcademicProfilesPage/);
  assert.match(head, /Open student profiles/);
  assert.match(head, /setAcademicProfilesOpen\(true\)/);
});

test('guardian invitation flow remains email-bound and parent-facing', () => {
  assert.match(guardian, /Parent \/ guardian email/);
  assert.match(guardian, /Review & send secure invitation/);
  assert.match(guardian, /Send this parent invitation\?/);
  assert.match(guardian, /parent-portal\.html/);
  assert.match(parent, /Create secure account/);
  assert.match(parent, /ParentDashboardPremium/);
  assert.match(parentDashboard, /Academic snapshot/);
  assert.match(parentDashboard, /Areas needing support/);
  assert.match(parentDashboard, /Recent assessments/);
  assert.match(parentDashboard, /Progress story/);
});

test('school admins receive school-roster directory while teacher scope remains preserved', () => {
  assert.match(migration, /role_in_school = 'school_admin'/);
  assert.match(migration, /sm\.role_in_school = 'student'/);
  assert.match(migration, /cta\.teacher_user_id = v_caller/);
});
