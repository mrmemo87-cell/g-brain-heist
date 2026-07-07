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

test('school_admin/admin can still access IELTS operations tools and can control toggle', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  assert.match(home, /isIeltsAdminLandingRole = isPlatformAdmin \|\| normalizedRole === 'school_admin' \|\| normalizedRole === 'admin' \|\| normalizedRole === 'superadmin'/);
  assert.match(home, /Allow students to use Extra Practice/);
  assert.match(home, /When off, students only see assigned IELTS practice and their journey\./);
});


test('IELTS admin control center exposes Student Progress only through admin landing cards', () => {
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

  assert.match(home, /const canOpenReviewQueue = canAccessIeltsReviewQueue\(\{ role: userRole, is_admin: isPlatformAdmin \}\);/);
  assert.match(home, /\{canOpenReviewQueue && \(/, 'home should only render review queue card for authorized users');
});

test('assigned IELTS practice bypasses extra-practice lock while non-diagnostic free routes stay guarded', () => {
  const routes = read('index.tsx');

  assert.match(routes, /const IeltsPracticeRouteGuard:[\s\S]*assignmentContext\.isAssignedPractice[\s\S]*return children;/, 'assigned practice should bypass extra-practice lock');
  assert.match(routes, /const IeltsPracticeRouteGuard:[\s\S]*return <IeltsExtraPracticeGuard>\{children\}<\/IeltsExtraPracticeGuard>;/, 'free practice should still be gated by extra-practice lock');
});
