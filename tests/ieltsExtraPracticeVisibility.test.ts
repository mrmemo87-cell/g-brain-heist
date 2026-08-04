import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('student sees extra practice blocks only when enabled', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  assert.match(home, /extraPracticeEnabled/, 'home should load extra practice school setting');
  assert.match(home, /\{extraPracticeEnabled && \([\s\S]*Free Trial Test Banner[\s\S]*\)\}/, 'home should gate free trial banner by toggle');
  assert.match(home, /\{extraPracticeEnabled && \([\s\S]*Reading[\s\S]*Listening[\s\S]*Writing[\s\S]*Speaking[\s\S]*\)\}/, 'home should gate skill-based extra practice by toggle');
  assert.match(home, /My IELTS Journey/, 'home should always keep My IELTS Journey visible');
  assert.match(home, /Assigned Practice/, 'home should always keep Assigned Practice visible');
  assert.match(home, /Back to Brain Heist Game/, 'home should always keep back-to-game visible');
});

test('direct student extra practice route access blocked when disabled', () => {
  const guard = read('src/pages/ielts/IeltsExtraPracticeGuard.tsx');
  const routes = read('index.tsx');
  const freeDiagnosticRoute = routes.slice(
    routes.indexOf("path: '/ielts/trial-test-2'"),
    routes.indexOf("path: '/ielts/apply-prime'")
  );
  assert.match(guard, /Extra Practice is currently disabled by your school\./, 'guard should show lock message');

  assert.match(routes, /path: '\/ielts\/trial-test'[\s\S]*?<IeltsExtraPracticeGuard>/i, '/ielts/trial-test should be wrapped by IeltsExtraPracticeGuard');
  assert.match(freeDiagnosticRoute, /<TrialListeningTask2 \/>/i, '/ielts/trial-test-2 should render the free diagnostic directly');
  assert.doesNotMatch(freeDiagnosticRoute, /<ProtectedRoute|<IeltsExtraPracticeGuard/i, '/ielts/trial-test-2 should not require login or extra-practice route guards');

  for (const route of ['/ielts/reading/:setId', '/ielts/listening/:setId', '/ielts/writing/:taskId', '/ielts/speaking/:taskId']) {
    assert.match(routes, new RegExp(`path: '${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?<IeltsPracticeRouteGuard>`, 'i'), `${route} should use assignment-aware route guard`);
  }
});

test('school administrators use the persistent IELTS shell and its single settings control', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  const settingsTab = read('components/school-admin/tabs/IeltsSettingsTab.tsx');
  const accessService = read('services/ieltsExtraPracticeAccessService.ts');
  assert.match(home, /isIeltsAdminLandingRole = isPlatformAdmin \|\| canAdministerSchool/);
  assert.match(home, /resolveMySchoolCapabilities\(\)/, 'school administration decisions must use active membership capabilities');
  assert.doesNotMatch(home, /normalizedRole === 'school_admin'/, 'legacy profile role must not grant school administration access');
  assert.match(home, /navigate\(schoolAdminIeltsUrl\('ielts-exams'\), \{ replace: true \}\)/, 'school administrators should enter IELTS through the persistent school shell');
  assert.match(settingsTab, /Extra Practice Access/);
  assert.match(settingsTab, /updateIeltsExtraPracticeAccess\(checked\)/, 'the school setting must be written through the typed authoritative RPC');
  assert.match(settingsTab, /type="checkbox"[\s\S]*role="switch"[\s\S]*aria-label="Allow students to use Extra Practice"[\s\S]*checked=\{extraPracticeEnabled === true\}/);
  assert.doesNotMatch(home, /toggleSchoolExtraPractice|updateSchoolSettings/, 'IELTS Home must not host a competing school setting control');
  assert.doesNotMatch(accessService, /if \(isAdmin\) return \{ role, isAdmin: true, enabled: true \}/, 'school admins must read the same stored setting students use');
  assert.match(accessService, /rpc_ielts_extra_practice_access/, 'all roles must read one server-authoritative access result');
  assert.doesNotMatch(accessService, /\.from\(['"](?:users|schools)['"]\)/, 'client must not reconstruct school authority from direct table reads');
});


test('IELTS admin control center labels Student Progress clearly', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  const adminBranch = home.slice(home.indexOf('if (isIeltsAdminLandingRole) {'), home.indexOf('// GSAP entrance animation for student view'));
  const studentBranch = home.slice(home.indexOf('// GSAP entrance animation for student view'));

  assert.match(adminBranch, /label: 'Student Progress'/, 'admin control center should include Student Progress card');
  assert.match(adminBranch, /desc: 'View each student’s IELTS readiness, assignments, results, and pending reviews\.'/,
    'Student Progress card should describe readiness, assignments, results, and pending reviews');
  assert.match(adminBranch, /route: '\/ielts\/journey'/, 'Student Progress card should route to IELTS journey dashboard');
  assert.doesNotMatch(adminBranch, /label: 'Results'[^\n]*route: '\/ielts\/journey'/, 'ambiguous Results journey card should be replaced');
  assert.doesNotMatch(adminBranch, /label: 'Student Journey'[^\n]*route: '\/ielts\/journey'/, 'duplicate Student Journey admin card should be replaced');
  assert.doesNotMatch(studentBranch, /Student Progress/, 'student IELTS home should not show the admin Student Progress link');
});

test('IELTS Home review queue card is role-gated by the same helper as route guard', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');

  assert.match(home, /const canOpenReviewQueue = canAccessIeltsReviewQueue\(\{[\s\S]*can_administer_school: canAdministerSchool,[\s\S]*\}\);/);
  assert.match(home, /\{canOpenReviewQueue && \(/, 'home should only render review queue card for authorized users');
});

test('authenticated IELTS dashboard fails closed when Extra Practice is disabled or unresolved', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');

  assert.match(home, /extraPracticeAccessError \|\| extraPracticeEnabled === false/, 'dashboard must render an explicit restricted state');
  assert.match(home, /We have kept unverified practice content closed/, 'unverified practice must stay closed');
  assert.match(home, /Assigned school work remains available while you retry/, 'assigned work should remain available');
  assert.match(home, /setExtraPracticeRetry/, 'verification failures must offer a retry');
});

test('assigned IELTS practice bypasses extra-practice lock while non-diagnostic free routes stay guarded', () => {
  const routes = read('index.tsx');

  assert.match(routes, /const IeltsPracticeRouteGuard:[\s\S]*assignmentContext\.isAssignedPractice[\s\S]*return children;/, 'assigned practice should bypass extra-practice lock');
  assert.match(routes, /const IeltsPracticeRouteGuard:[\s\S]*return <IeltsExtraPracticeGuard>\{children\}<\/IeltsExtraPracticeGuard>;/, 'free practice should still be gated by extra-practice lock');
});
