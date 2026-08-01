import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const schoolAdminPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const workspaceChooser = readFileSync('components/SchoolWorkspaceChooser.tsx', 'utf8');
const globalStyles = readFileSync('src/index.css', 'utf8');

test('dual-role workspace chooser stacks complete portal choices on phones', () => {
  assert.match(workspaceChooser, /className="school-workspace-option-copy"/);
  assert.match(workspaceChooser, /aria-describedby="workspace-chooser-description"/);

  const baseOptions = globalStyles.indexOf('.school-workspace-options {');
  const mobileOptions = globalStyles.lastIndexOf('@media (max-width:600px)');
  assert.ok(baseOptions >= 0 && mobileOptions > baseOptions, 'mobile chooser rules must follow desktop rules in the cascade');
  assert.match(globalStyles.slice(mobileOptions), /\.school-workspace-options\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(globalStyles.slice(mobileOptions), /\.school-workspace-option\s*\{\s*min-height:0/);
});

test('teacher quick menu exposes one route to the complete school admin portal', () => {
  assert.match(teacherPortal, /School Admin Portal/);
  assert.doesNotMatch(teacherPortal, /onOpenAdmissions/);
  assert.doesNotMatch(teacherPortal, />\s*Admissions\s*</);
});

test('admissions is rendered only inside the school administration shell', () => {
  assert.doesNotMatch(app, /lazyRetry\(\(\) => import\('\.\/components\/AdmissionHub'\)/);
  assert.doesNotMatch(app, /case 'admissions':/);
  assert.doesNotMatch(app, /handleViewChange\('admissions'\)/);
  assert.match(schoolAdminPortal, /tab === 'admissions' && 'Admissions'/);
  assert.match(schoolAdminPortal, /activeTab === 'admissions' && <AdmissionHub/);
});
