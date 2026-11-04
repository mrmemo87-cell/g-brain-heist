import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync('src/hooks/useSmartCollapsedNavigation.ts', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const teacherStyles = readFileSync('src/styles/teacher-theme.css', 'utf8');
const studentNavigation = readFileSync('components/StudentDashboardNavigation.tsx', 'utf8');
const schoolAdminPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const globalStyles = readFileSync('src/index.css', 'utf8');

test('mobile navigation stays fully visible: no hide-on-scroll', () => {
  // Owner decision 2026-11-04: the bottom menu must always be shown and opaque.
  assert.doesNotMatch(hook, /addEventListener\('scroll'/);
  assert.doesNotMatch(hook, /requestAnimationFrame/);
  assert.match(hook, /'--smart-nav-translate-y', '0px'/);
  assert.match(hook, /'--smart-nav-opacity', '1'/);
  assert.match(hook, /dataset\['hidden'\] = 'false'/);
  assert.doesNotMatch(hook, /useState/);
  assert.match(hook, /return \{ navigationRef, revealNavigation \}/);
});

test('teacher and student bottom navigation share the premium reveal pattern', () => {
  // Teacher bottom navigation starts at 900px so zoomed laptops (e.g. 1280px at 125%) keep the sidebar.
  assert.match(teacherPortal, /TEACHER_MOBILE_NAV_QUERY = '\(max-width: 900px\)'/);
  assert.match(teacherPortal, /useSmartCollapsedNavigation\(view, TEACHER_MOBILE_NAV_QUERY\)/);
  assert.match(teacherPortal, /ref=\{mobileNavigationRef\}/);
  assert.match(teacherPortal, /aria-label="Show teacher navigation"/);
  assert.match(studentNavigation, /STUDENT_MOBILE_NAV_QUERY = '\(max-width: 1024px\)'/);
  assert.match(studentNavigation, /useSmartCollapsedNavigation\(activeDestination, STUDENT_MOBILE_NAV_QUERY\)/);
  assert.match(studentNavigation, /ref=\{navigationRef\}/);
  assert.match(studentNavigation, /aria-label=\{t\("Show student navigation"\)\}/);
  assert.match(studentNavigation, /<CollapsedNavTooltip label=\{navTooltip\.label\} anchor=\{navTooltip\.anchor\}/);
  assert.match(teacherStyles, /\.teacher-mobile-bottom-nav[\s\S]*var\(--smart-nav-translate-y/);
  assert.match(globalStyles, /\.student-dashboard-bottom-nav[\s\S]*var\(--smart-nav-translate-y/);
  assert.match(teacherStyles, /data-reveal-visible='true'/);
  assert.match(globalStyles, /data-reveal-visible='true'/);
});

test('school admin mobile navigation keeps primary sections visible and every section in More', () => {
  assert.match(schoolAdminPortal, /SCHOOL_ADMIN_PRIMARY_TAB_IDS = new Set<MainAdminTab>/);
  assert.match(schoolAdminPortal, /SCHOOL_ADMIN_NAV_ITEMS\.map/);
  assert.match(schoolAdminPortal, /className="school-admin-mobile-bottom-nav"/);
  assert.match(schoolAdminPortal, /className="school-admin-mobile-menu-sheet"/);
  assert.match(schoolAdminPortal, /ref=\{mobileAdminNavigationRef\}/);
  assert.match(schoolAdminPortal, /aria-label="Show school administration navigation"/);
  assert.match(globalStyles, /\.school-admin-mobile-bottom-nav[\s\S]*var\(--smart-nav-translate-y/);
  assert.match(globalStyles, /\.school-admin-sidebar \{ display:none; \}/);
});
