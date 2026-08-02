import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync('src/hooks/useSmartCollapsedNavigation.ts', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const teacherStyles = readFileSync('src/styles/teacher-theme.css', 'utf8');
const studentNavigation = readFileSync('components/StudentDashboardNavigation.tsx', 'utf8');
const schoolAdminPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const globalStyles = readFileSync('src/index.css', 'utf8');

test('smart mobile navigation tracks scroll for two thirds before a velocity-matched settle', () => {
  assert.match(hook, /TOP_EXPANDED_THRESHOLD = 40/);
  assert.match(hook, /DIRECT_SCROLL_PORTION = 2 \/ 3/);
  assert.match(hook, /velocityMatchedDuration/);
  assert.match(hook, /easeOutCubic/);
  assert.match(hook, /--smart-nav-translate-y/);
  assert.match(hook, /--smart-nav-opacity/);
  assert.match(hook, /requestAnimationFrame\(update\)/);
  assert.match(hook, /\{ passive: true \}/);
  assert.doesNotMatch(hook, /useState/);
  assert.match(hook, /return \{ navigationRef, revealNavigation \}/);
});

test('teacher and student bottom navigation share the premium reveal pattern', () => {
  assert.match(teacherPortal, /ref=\{mobileNavigationRef\}/);
  assert.match(teacherPortal, /aria-label="Show teacher navigation"/);
  assert.match(studentNavigation, /ref=\{navigationRef\}/);
  assert.match(studentNavigation, /aria-label="Show student navigation"/);
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
