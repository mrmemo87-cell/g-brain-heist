import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync('src/hooks/useSmartCollapsedNavigation.ts', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const teacherStyles = readFileSync('src/styles/teacher-theme.css', 'utf8');
const studentNavigation = readFileSync('components/StudentDashboardNavigation.tsx', 'utf8');
const schoolAdminPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const globalStyles = readFileSync('src/index.css', 'utf8');

test('smart mobile navigation reacts only to intentional scroll direction changes', () => {
  assert.match(hook, /TOP_EXPANDED_THRESHOLD = 40/);
  assert.match(hook, /COLLAPSE_DISTANCE = 60/);
  assert.match(hook, /EXPAND_DISTANCE = 35/);
  assert.match(hook, /MIN_SCROLL_DELTA = 5/);
  assert.match(hook, /requestAnimationFrame\(update\)/);
  assert.match(hook, /\{ passive: true \}/);
  assert.match(hook, /return \{ isCollapsed, revealNavigation \}/);
});

test('teacher and student bottom navigation share the premium reveal pattern', () => {
  assert.match(teacherPortal, /data-hidden=\{isMobileNavigationHidden\}/);
  assert.match(teacherPortal, /aria-label="Show teacher navigation"/);
  assert.match(studentNavigation, /data-hidden=\{isNavigationHidden\}/);
  assert.match(studentNavigation, /aria-label="Show student navigation"/);
  assert.match(teacherStyles, /\.teacher-mobile-bottom-nav\[data-hidden='true'\][^{]*\{[^}]*translate3d/s);
  assert.match(globalStyles, /\.student-dashboard-bottom-nav\[data-hidden='true'\][^{]*\{[^}]*translate3d/s);
});

test('school admin mobile navigation keeps primary sections visible and every section in More', () => {
  assert.match(schoolAdminPortal, /SCHOOL_ADMIN_PRIMARY_TAB_IDS = new Set<MainAdminTab>/);
  assert.match(schoolAdminPortal, /SCHOOL_ADMIN_NAV_ITEMS\.map/);
  assert.match(schoolAdminPortal, /className="school-admin-mobile-bottom-nav"/);
  assert.match(schoolAdminPortal, /className="school-admin-mobile-menu-sheet"/);
  assert.match(schoolAdminPortal, /data-hidden=\{isMobileAdminNavigationHidden\}/);
  assert.match(schoolAdminPortal, /aria-label="Show school administration navigation"/);
  assert.match(globalStyles, /\.school-admin-mobile-bottom-nav\[data-hidden='true'\][^{]*\{[^}]*translate3d/s);
  assert.match(globalStyles, /\.school-admin-sidebar \{ display:none; \}/);
});
