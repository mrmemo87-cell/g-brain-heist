import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const teacherTheme = readFileSync('src/styles/teacher-theme.css', 'utf8');
const sharedHeader = readFileSync('components/Header.tsx', 'utf8');
const clanTerritory = readFileSync('src/features/clanTerritory/ClanTerritoryManager.tsx', 'utf8');

test('teacher workspace uses a dedicated small-screen navigation model', () => {
  assert.match(teacherPortal, /className="teacher-mobile-bottom-nav"/);
  assert.match(teacherPortal, /className="teacher-mobile-menu-sheet"/);
  assert.match(teacherPortal, /aria-label="Teacher workspace"/);
  assert.match(teacherTheme, /@media \(max-width: 1023px\)[\s\S]*\.teacher-desktop-sidebar\s*\{\s*display: none;/);
  assert.match(teacherTheme, /\.teacher-mobile-bottom-nav[\s\S]*env\(safe-area-inset-bottom/);
});

test('mobile reports and Cambridge results use cards instead of wide tables', () => {
  assert.match(teacherPortal, /className="teacher-mobile-record-list"/);
  assert.match(teacherPortal, /className="cambridge-mobile-results lg:hidden"/);
  assert.match(teacherPortal, /className="hidden bg-white border border-slate-200 rounded-xl shadow-sm lg:flex/);
  assert.match(teacherTheme, /\.teacher-desktop-only-table\s*\{\s*display: none;/);
  assert.match(teacherTheme, /\.cambridge-reports-body\s*\{\s*height: auto;/);
});

test('phone headers stay compact and respect device safe areas', () => {
  assert.match(teacherPortal, /teacher-mobile-plan-badge/);
  assert.match(teacherPortal, /max\(env\(safe-area-inset-top/);
  assert.match(sharedHeader, />\s*BH\s*</);
  assert.match(sharedHeader, /env\(safe-area-inset-top/);
});

test('teacher onboarding and Clan Wars avoid duplicate high-cost chrome', () => {
  assert.match(teacherPortal, /\{!teacherSetupComplete && \(/);
  assert.match(teacherPortal, /if \(!isSchoolAdmin \|\| !onOpenSchoolAdmin\) return null/);
  const returnActions = clanTerritory.match(/Return to Dashboard/g) ?? [];
  assert.equal(returnActions.length, 0);
});
