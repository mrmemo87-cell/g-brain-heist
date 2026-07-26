import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const teacherTheme = readFileSync('src/styles/teacher-theme.css', 'utf8');
const sharedHeader = readFileSync('components/Header.tsx', 'utf8');
const clanTerritory = readFileSync('src/features/clanTerritory/ClanTerritoryManager.tsx', 'utf8');
const globalStyles = readFileSync('src/index.css', 'utf8');

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
  assert.match(teacherTheme, /\.teacher-topbar\s*\{[\s\S]*background: #07101f !important;[\s\S]*opacity: 1;/);
  assert.match(teacherTheme, /\.teacher-mobile-plan-badge\s*\{\s*display: none !important;/);
  assert.match(teacherTheme, /\.teacher-desktop-plan-badge[\s\S]*display: none !important;/);
});

test('teacher onboarding and Clan Wars avoid duplicate high-cost chrome', () => {
  assert.match(teacherPortal, /\{!teacherSetupComplete && \(/);
  assert.match(teacherPortal, /if \(!isSchoolAdmin \|\| !onOpenSchoolAdmin\) return null/);
  const returnActions = clanTerritory.match(/Return to Dashboard/g) ?? [];
  assert.equal(returnActions.length, 0);
});

test('Clan Wars stays inside the teacher workspace without an app-level reload', () => {
  assert.match(teacherPortal, /const ClanTerritoryManager = React\.lazy/);
  assert.match(teacherPortal, /case 'clan-wars':\s*setView\('clan-wars'\)/);
  assert.match(teacherPortal, /view === 'clan-wars'[\s\S]*<ClanTerritoryManager/);
  assert.match(teacherPortal, /onExit=\{\(\) => setView\('dashboard'\)\}/);
  assert.doesNotMatch(teacherPortal, /case 'lockdown':[\s\S]{0,100}onLockdown/);
});

test('teacher navigation consolidates writing tools into one Writing Hub', () => {
  assert.match(teacherPortal, /id: 'writing-hub' as const, label: 'Writing Hub'/);
  assert.match(teacherPortal, /aria-label="Writing Hub sections"/);
  assert.match(teacherPortal, /\['monitor', '📝', 'Monitor'\]/);
  assert.match(teacherPortal, /\['analytics', '📈', 'Analytics'\]/);
  assert.match(teacherPortal, /\['reports', '📤', 'Reports'\]/);
  assert.doesNotMatch(teacherPortal, /label: 'Writing Monitor'/);
  assert.doesNotMatch(teacherPortal, /label: 'Writing Analytics'/);
  assert.doesNotMatch(teacherPortal, /label: 'Writing Reports'/);
});

test('teacher Clan Wars uses official school arenas and unlocks every map', () => {
  assert.match(clanTerritory, /const configuredArenaMode: ArenaMode = isTeacher \? "official" : arenaMode/);
  assert.match(clanTerritory, /const isMapLocked = \(_mapId: string\) => false/);
  assert.match(clanTerritory, /Every map is available\./);
  assert.match(clanTerritory, /Official School Arena/);
  assert.doesNotMatch(clanTerritory, /onClick=\{\(\) => setArenaMode\("open"\)\}/);
});

test('Game Settings presents a focused four-step wizard on desktop and mobile', () => {
  assert.match(clanTerritory, /const \[configurationStep, setConfigurationStep\] = useState\(1\)/);
  assert.match(clanTerritory, /className="clan-setup-progress"/);
  assert.match(clanTerritory, /\['Audience', 'Choose classes'\]/);
  assert.match(clanTerritory, /\['Map', 'Choose territory'\]/);
  assert.match(clanTerritory, /\['Rules', 'Set timing'\]/);
  assert.match(clanTerritory, /\['Review', 'Check and launch'\]/);
  assert.match(globalStyles, /\.clan-setup-progress[\s\S]*grid-template-columns: repeat\(4/);
  assert.match(globalStyles, /@media \(max-width: 640px\)[\s\S]*\.clan-setup-progress/);
});
