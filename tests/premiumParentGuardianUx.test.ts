import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('guardian invitation preview is token-scoped and minimises pre-auth data', () => {
  const migration = read('supabase/migrations/20260810110000_guardian_invitation_brand_preview.sql');
  assert.match(migration, /rpc_guardian_invitation_preview/);
  assert.match(migration, /token_hash = extensions\.digest/);
  assert.match(migration, /invited_email_hint/);
  assert.doesNotMatch(migration, /'id', v_student\.id/);
  assert.doesNotMatch(migration, /'id', v_school\.id/);
  assert.doesNotMatch(migration, /'invited_email', v_inv\.invited_email/);
  assert.match(migration, /grant execute on function public\.rpc_guardian_invitation_preview\(text\) to anon, authenticated, service_role/);
});

test('parent invitation experience is school and Brains Heist co-branded', () => {
  const parent = read('components/guardian/ParentPortal.tsx');
  const admin = read('components/guardian/GuardianManagementPage.tsx');
  assert.match(parent, /SchoolBrand/);
  assert.match(parent, /PRODUCT_LOGO_URL/);
  assert.match(parent, /PRODUCT_NAME/);
  assert.match(parent, /You’ve been invited to follow/);
  assert.match(parent, /Secure parent access/);
  assert.match(admin, /Send the official parent invitation/);
  assert.match(admin, /Copy invitation message/);
  assert.match(admin, /school-approved marks/);
});

test('new academic and parent surfaces consistently spell Brains Heist', () => {
  const files = [
    'parent-portal.html',
    'guardian-management.html',
    'teacher-academic-profiles.html',
    'academic-profile.html',
    'teacher-interventions.html',
    'school-head-learning-intelligence.html',
    'components/guardian/ParentPortal.tsx',
    'components/guardian/GuardianManagementPage.tsx',
    'components/student-progress/IndividualStudentAcademicReport.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, new RegExp('\\bBrain ' + 'Heist\\b'), `${file} must not use the singular product name`);
  }
  assert.match(read('parent-portal.html'), /Brains Heist/);
  assert.match(read('components/student-progress/IndividualStudentAcademicReport.tsx'), /Generated securely through Brains Heist/);
});

test('academic progress services do not expose raw network and authorization errors', () => {
  const mapper = read('services/userFacingError.ts');
  const guardian = read('services/guardianService.ts');
  const profile = read('services/studentAcademicProfileService.ts');
  const support = read('services/studentInterventionService.ts');
  const directory = read('services/teacherAcademicProfileDirectoryService.ts');
  assert.match(mapper, /load failed/);
  assert.match(mapper, /We could not connect just now/);
  assert.match(mapper, /You do not currently have access/);
  assert.doesNotMatch(profile, /if \(error\) throw error/);
  assert.doesNotMatch(directory, /if \(error\) throw error/);
  assert.match(support, /userFacingError/);
  assert.match(guardian, /friendlyError/);
});
