import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const header = readFileSync('components/Header.tsx', 'utf8');
const navigation = readFileSync('components/StudentDashboardNavigation.tsx', 'utf8');
const capTracker = readFileSync('components/CapTracker.tsx', 'utf8');
const newsFeed = readFileSync('components/NewsFeed.tsx', 'utf8');
const mainActions = readFileSync('components/MainActions.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

test('student mobile header protects long school names and fixed-size actions', () => {
  assert.match(header, /student-mobile-header__brand/);
  assert.match(header, /student-mobile-header__name/);
  assert.match(header, /student-mobile-header__avatar/);
  assert.match(styles, /\.student-mobile-header__name[^}]*text-overflow:\s*ellipsis/s);
  assert.match(styles, /\.student-mobile-header__avatar[^}]*flex:\s*none/s);
});

test('student bottom navigation stays labelled and content clears the safe area', () => {
  assert.doesNotMatch(navigation, /useSmartCollapsedNavigation/);
  assert.match(navigation, /student-dashboard-bottom-label/);
  assert.match(styles, /padding-bottom:\s*calc\(7rem \+ env\(safe-area-inset-bottom/);
});

test('student desktop navigation stays visible and follows the teacher collapse pattern', () => {
  assert.match(navigation, /STUDENT_SIDEBAR_STORAGE_KEY/);
  assert.match(navigation, /student-dashboard-sidebar-toggle/);
  assert.match(navigation, /sidebarCollapsed \? 'is-collapsed' : ''/);
  assert.match(navigation, /label: 'Leaderboard'/);
  assert.doesNotMatch(navigation, /label: 'Rankings'/);
  assert.match(styles, /\.student-dashboard-shell[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
  assert.match(styles, /\.student-dashboard-rail\.is-collapsed[^}]*width:\s*5rem/s);
});

test('clan and leaderboard render directly inside the persistent dashboard shell', () => {
  assert.match(app, /studentDashboardTab === 'clan'[\s\S]*?<ClanView[\s\S]*?embedded/);
  assert.match(app, /studentDashboardTab === 'leaderboard'[\s\S]*?<LeaderboardView[\s\S]*?embedded/);
  assert.match(app, /onGoToClan=\{\(\) => dashboardNavigate\('clan'\)\}/);
  assert.match(app, /onViewLeaderboard=\{\(\) => dashboardNavigate\('leaderboard'\)\}/);
  assert.match(app, /label: 'Leaderboard'/);
  assert.doesNotMatch(app, />View Leaderboard<\/button>/);
});

test('student learning tools share one visible primary action system', () => {
  assert.match(app, /student-learning-grid/);
  assert.match(app, /student-learning-card/g);
  assert.match(app, /student-primary-button/g);
  assert.match(styles, /\.student-primary-button[^}]*background:\s*linear-gradient/s);
  assert.match(styles, /\.student-primary-button[^}]*color:\s*#020617 !important/s);
});

test('secondary dashboard information is compact and understandable', () => {
  assert.match(capTracker, /<details className="student-cap-card">/);
  assert.match(capTracker, /used<\/span>/);
  assert.match(capTracker, /remaining/);
  assert.match(app, /student-invite-card/);
  assert.match(app, /Daily skill practice/);
  assert.match(app, /student-more-card__copy/);
});

test('activity feed uses accessible compact reactions', () => {
  assert.match(newsFeed, /aria-label="React to this update"/);
  assert.match(newsFeed, /aria-pressed=\{isActive\}/);
  assert.match(newsFeed, /student-activity-item__reactions/);
});

test('game mission cards stay compact and keep lockdown last', () => {
  assert.match(mainActions, /const missionCardClass = 'min-h-\[10rem\] sm:min-h-\[11rem\]'/);
  assert.doesNotMatch(mainActions, /min-h-\[18rem\]/);

  const inventoryPosition = mainActions.indexOf('label="Inventory"');
  const achievementsPosition = mainActions.indexOf('label="Achievements"');
  const lockdownPosition = mainActions.indexOf('label="Lockdown Mode"');

  assert.ok(inventoryPosition >= 0);
  assert.ok(achievementsPosition > inventoryPosition);
  assert.ok(lockdownPosition > achievementsPosition);
  assert.match(mainActions, /relative flex flex-col gap-0/);
  assert.match(mainActions, /grid grid-cols-2 gap-0 sm:grid-cols-3/g);
  assert.match(mainActions, /Lockdown Mode[\s\S]*col-span-2 w-1\/2 justify-self-center/);
});
