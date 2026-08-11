import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('student sees extra practice blocks only when enabled', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  const catalogBranch = home.slice(home.indexOf('showPracticeCatalog ? ('), home.indexOf('← Back to Brains Heist Game', home.indexOf('showPracticeCatalog ? (')));
  assert.match(home, /const showPracticeCatalog = extraPracticeEnabled === true/, 'home should require a verified enabled setting before showing the catalog');
  assert.match(catalogBranch, /Free Trial Test Banner · Reading · Listening · Writing · Speaking/, 'the catalog gate should contain every optional practice skill');
  assert.match(home, /My IELTS Journey/, 'home should always keep My IELTS Journey visible');
  assert.match(home, /Assigned Practice/, 'home should always keep Assigned Practice visible');
  assert.match(home, /Back to Brains Heist Game/, 'home should always keep back-to-game visible');
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

test('IELTS Home renders the review queue card only behind the shared access decision', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');

  assert.match(home, /const canOpenReviewQueue = canAccessIeltsReviewQueue\(/, 'home should consume the directly tested shared decision');
  assert.match(home, /\{canOpenReviewQueue && \(/, 'home should only render review queue card for authorized users');
});

test('Extra Practice restriction gates only the catalog and keeps the authenticated dashboard reachable', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  const dashboardBranchIndex = home.indexOf('if (isAuthenticated && dashboardSummary && !isIeltsAdminLandingRole)');
  const catalogRestrictionIndex = home.indexOf('const practiceCatalogRestricted');
  const loadingDecision = home.slice(home.indexOf('const shouldShowDashboardLoading'), home.indexOf('if (isAuthenticated && profileContextLoaded && profileContextError)'));
  const publicLandingStart = home.indexOf('<IeltsAnimatedHero', catalogRestrictionIndex);
  const publicLandingPreamble = home.slice(publicLandingStart, home.indexOf('{shouldShowSchoolTools', publicLandingStart));

  assert.ok(dashboardBranchIndex >= 0 && catalogRestrictionIndex > dashboardBranchIndex, 'the dashboard must resolve before the catalog-only restriction');
  assert.doesNotMatch(loadingDecision, /extraPracticeEnabled/, 'dashboard loading must not wait on optional-practice authority');
  assert.doesNotMatch(home, /restrictedShell|ielts-available-actions-heading/, 'Extra Practice must not replace the full IELTS dashboard');
  assert.match(home, /practiceCatalogRestricted = isAuthenticated[\s\S]*extraPracticeAccessError \|\| extraPracticeEnabled === false/, 'disabled and failed checks must close only the catalog');
  assert.match(home, /practiceCatalogResolving = isAuthenticated && extraPracticeEnabled === null/, 'an unresolved check must keep the catalog closed');
  assert.match(home, /Extra Practice is currently disabled by your school\. Assigned work and your IELTS journey remain available\./, 'the catalog should explain the school restriction without hiding other tools');
  assert.match(home, /setExtraPracticeRetry/, 'verification failures must offer a retry');
  assert.doesNotMatch(publicLandingPreamble, /extraPracticeAccessError/, 'the obsolete page-level access alert must stay removed');
  assert.match(home, /showSchoolLinks=\{hasSchoolMembership\}/, 'Prime dashboard users should keep school assignment and journey links');
  assert.match(home, /hasSchoolMembership && <IeltsSchoolLearnerLinks onNavigate=\{navigate\} \/>/, 'non-Prime and pre-diagnostic dashboard users should keep school assignment and journey links');

  const schoolLinks = read('src/components/ielts/IeltsSchoolLearnerLinks.tsx');
  assert.match(schoolLinks, /onNavigate\('\/ielts\/practice\/assigned'\)/, 'school dashboard links should open assigned work');
  assert.match(schoolLinks, /onNavigate\('\/ielts\/journey'\)/, 'school dashboard links should open the student journey');
});

test('IELTS Home resolves auth failures and emits one landing/dashboard view per user identity', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  const sessionLoad = home.slice(home.indexOf('supabase.auth.getSession()'), home.indexOf('const { data: { subscription } }'));
  const identityReset = home.slice(home.indexOf('if (authUserIdRef.current !== nextUserId)'), home.indexOf('setAuthUserId(nextUserId)'));
  const landingEffect = home.slice(home.indexOf("trackIeltsFunnelEvent('landing_view'") - 180, home.indexOf("trackIeltsFunnelEvent('landing_view'") + 220);
  const dashboardResetBranch = home.slice(home.indexOf('if (!profileContextLoaded || profileContextError || !isAuthenticated || isIeltsAdminLandingRole)'), home.indexOf('const loadDashboard'));

  assert.match(sessionLoad, /\.catch\(\(\) => \{[\s\S]*syncSession\(null\)/, 'a rejected session request must resolve to the safe signed-out state');
  assert.match(identityReset, /dashboardEventTrackedRef\.current = false/, 'dashboard analytics must reset when the authenticated identity changes');
  assert.match(identityReset, /landingEventTrackedRef\.current = false/, 'landing analytics must reset when the authenticated identity changes');
  assert.match(landingEffect, /if \(landingEventTrackedRef\.current\) return;[\s\S]*landingEventTrackedRef\.current = true;[\s\S]*trackIeltsFunnelEvent\('landing_view'/, 'landing_view must be de-duplicated before it is emitted');
  assert.equal([...home.matchAll(/trackIeltsFunnelEvent\('landing_view'/g)].length, 1, 'the component should have one landing_view emission site');
  assert.doesNotMatch(dashboardResetBranch, /dashboardEventTrackedRef\.current = false/, 'profile retries for the same user must not duplicate dashboard analytics');
});

test('assigned IELTS practice bypasses extra-practice lock while non-diagnostic free routes stay guarded', () => {
  const routes = read('index.tsx');

  assert.match(routes, /const IeltsPracticeRouteGuard:[\s\S]*assignmentContext\.isAssignedPractice[\s\S]*return children;/, 'assigned practice should bypass extra-practice lock');
  assert.match(routes, /const IeltsPracticeRouteGuard:[\s\S]*return <IeltsExtraPracticeGuard>\{children\}<\/IeltsExtraPracticeGuard>;/, 'free practice should still be gated by extra-practice lock');
});
