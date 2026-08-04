import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const portal = read('components/SchoolAdminPortal.tsx');
const examManager = read('src/pages/ielts/IeltsExamManager.tsx');
const practiceTab = read('components/school-admin/tabs/IeltsPracticeTab.tsx');
const resultsTab = read('components/school-admin/tabs/IeltsResultsTab.tsx');
const reviewQueue = read('src/pages/ielts/IeltsReviewQueue.tsx');
const routes = read('index.tsx');
const shellRoute = read('components/ielts/SchoolAdminIeltsRoute.tsx');
const presentation = read('src/lib/schoolAdminPresentation.ts');

test('school administrators keep IELTS exams, reviews, and progress inside the administration shell', () => {
  assert.match(portal, /id: 'ielts-reviews'/);
  assert.match(portal, /<IeltsReviewQueue[\s\S]*?embedded/);
  assert.match(portal, /<IeltsSubmissionReview[\s\S]*?embedded/);
  assert.match(portal, /<IeltsJourneyDashboard embedded \/>/);
  assert.match(portal, /<IeltsExamMonitor[\s\S]*?embedded[\s\S]*?examEventIdOverride=/, 'exam monitoring must render inside School Administration');
  assert.doesNotMatch(practiceTab, /href="\/ielts\/reviews"/);
  assert.match(reviewQueue, /onOpenReview\(\{ skill: row\.skill, attemptId: row\.attempt_id \}\)/);
  for (const tab of ['ielts-exams', 'ielts-reviews', 'ielts-student-progress']) {
    assert.match(routes, new RegExp(`<SchoolAdminIeltsRoute ieltsTab="${tab}"`), `direct ${tab} entry must restore the administration shell for school admins`);
  }
  assert.match(shellRoute, /resolveMySchoolCapabilities\(\)/, 'direct route restoration must verify the active school-admin capability');
  assert.match(shellRoute, /resolution\.status === 'error'[\s\S]*setAdminAccess\('error'\)/, 'capability failures must keep the standalone route closed');
  assert.match(shellRoute, /Try again/, 'capability failures must be retryable');
  assert.match(shellRoute, /schoolAdminIeltsUrl\(ieltsTab, review, monitorExamId\)/, 'direct route restoration must use validated enum state');
  assert.match(shellRoute, /isValidSchoolAdminIeltsReviewAttemptId\(attemptId\)/, 'direct review routes must bound the attempt identifier before redirecting');
  assert.match(shellRoute, /isValidSchoolAdminIeltsRouteExamId\(routeExamId\)/, 'direct monitor routes must require the expected v4 exam identifier');
  assert.match(routes, /path:\s*'\/ielts\/exam\/:examEventId\/monitor'[\s\S]*?<SchoolAdminIeltsRoute ieltsTab="ielts-exams" monitorFromRoute>/, 'direct monitor routes must restore the administration shell');
});

test('school administration remembers the exact IELTS tab and review across refresh and browser back', () => {
  assert.match(portal, /parseSchoolAdminNavigation\(window\.location\.search\)/);
  assert.match(portal, /'pushState'/);
  assert.match(portal, /window\.history\[mode === 'replace' \? 'replaceState' : 'pushState'\]/);
  assert.match(portal, /window\.addEventListener\('popstate', restoreNavigation\)/);
  assert.match(portal, /writeNavigationState\(\{ adminTab: 'ielts', ieltsTab: 'ielts-reviews', review, monitorExamId: null \}, mode\)/);
  assert.match(portal, /onBack=\{\(\) => selectIeltsReview\(null, 'replace'\)\}/, 'review Back must replace the detail entry so browser Back does not reopen it');
});

test('IELTS tablist remains operable with keyboard and narrow screens', () => {
  assert.match(portal, /className="[^"]*overflow-x-auto[^"]*"[\s\S]*role="tablist"/);
  assert.match(portal, /tabIndex=\{isActive \? 0 : -1\}/, 'only the active tab should be in the tab order');
  assert.match(portal, /event\.key === 'ArrowRight'[\s\S]*event\.key === 'ArrowLeft'[\s\S]*event\.key === 'Home'[\s\S]*event\.key === 'End'/);
  assert.match(portal, /role="tabpanel"[\s\S]*aria-labelledby=/);
});

test('unfinished IELTS analytics is hidden from school administrator navigation', () => {
  const nav = portal.match(/const IELTS_TOOL_NAV_ITEMS[\s\S]*?\n\];/)?.[0] ?? '';
  assert.doesNotMatch(nav, /ielts-analytics|Analytics/);
});

test('live exams use a separate confirmed launch after draft or scheduled creation', () => {
  const createPanel = examManager.slice(examManager.indexOf('Step 1 Create Exam'), examManager.indexOf('Step 4 Launch & Monitor'));
  assert.doesNotMatch(createPanel, /value="live"|Live now/, 'exam creation must not offer a live status');
  assert.match(examManager, /rpcIeltsLaunchExam\(\{/);
  assert.match(examManager, /confirmation: 'LAUNCH'/);
  assert.match(examManager, /I have checked the schedule, active form, and assigned students/);
  assert.match(examManager, /Confirm and launch now/);
});

test('school administrator IELTS copy does not expose implementation terminology', () => {
  for (const [name, source] of [['practice', practiceTab], ['results', resultsTab], ['reviews', reviewQueue]] as const) {
    assert.doesNotMatch(source, /\bRPCs?\b|\bbackend\b|\bpilot\b/i, `${name} copy must remain administrator-facing`);
  }
  assert.match(presentation, /TECHNICAL_ERROR_MARKERS/);
  assert.match(presentation, /friendlyIeltsAdminError/);
  for (const source of [practiceTab, resultsTab, reviewQueue, examManager]) {
    assert.match(source, /friendlyIeltsAdminError|setError\('[^']+'\)/, 'administrator errors must be mapped or intentionally written for users');
  }
});

test('existing school-scoped IELTS security contracts remain the data boundary', () => {
  const journeySecurity = read('tests/ieltsJourneyService.test.ts');
  const resultSecurity = read('tests/ieltsResultsService.test.ts');
  const reviewSecurity = read('tests/ieltsTeacherReviewWorkflow.test.ts');
  assert.match(journeySecurity, /students and cross-school users cannot fetch other student snapshots|deny cross-scope callers/i);
  assert.match(resultSecurity, /school results RPC uses readiness helper without legacy admin or protected answer data/i);
  assert.match(reviewSecurity, /school-scoped and admin-only/i);
});
