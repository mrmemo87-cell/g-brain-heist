import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const navigation = readFileSync('components/StudentDashboardNavigation.tsx', 'utf8');
const profile = readFileSync('components/PlayerProfileCard.tsx', 'utf8');
const settings = readFileSync('components/SettingsModal.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');
const performanceStyles = readFileSync('src/styles/light-mode.css', 'utf8');

test('mobile liquid navigation moves one spring pill between five destinations', () => {
  assert.match(navigation, /--student-nav-active-index/);
  assert.match(navigation, /mobileDestinations\.findIndex/);
  assert.match(styles, /width:\s*calc\(\(100% - 0\.7rem\) \/ 5\)/);
  assert.match(styles, /var\(--student-nav-active-index, 0\)/);
  assert.match(styles, /cubic-bezier\(0\.34, 1\.2, 0\.64, 1\)/);
});

test('full liquid glass is limited to the full visual experience', () => {
  assert.match(styles, /body\.performance-mode-disabled \.student-dashboard-bottom-nav[^}]*backdrop-filter:\s*blur\(28px\) saturate\(185%\)/s);
  assert.match(styles, /body\.performance-mode-disabled \.student-dashboard-rail[^}]*backdrop-filter:\s*blur\(22px\) saturate\(150%\)/s);
  assert.match(styles, /body\.performance-mode-disabled \.student-next-mission[^}]*backdrop-filter:\s*blur\(24px\) saturate\(175%\)/s);
  assert.match(styles, /body\.performance-mode-disabled \.student-profile-panel[^}]*backdrop-filter:\s*blur\(20px\) saturate\(145%\)/s);
  assert.match(styles, /body\.performance-mode-disabled \.student-activity-feed[^}]*backdrop-filter:\s*blur\(14px\) saturate\(130%\)/s);
});

test('profile glass keeps its summary and stat panels solid', () => {
  assert.match(profile, /student-profile-panel/);
  assert.match(profile, /student-profile-summary/);
  assert.match(profile, /student-profile-stat/);
  assert.match(styles, /\.student-profile-summary,[\s\S]*?\.student-profile-stat[^}]*background-color:\s*rgba\(8, 15, 30, 0\.88\) !important/s);
  assert.match(styles, /\.student-profile-stat[^}]*backdrop-filter:\s*none/s);
});

test('Ultra Performance Mode replaces refraction with static battery-saving surfaces', () => {
  assert.match(settings, /Replaces liquid glass with static battery-saving surfaces/);
  assert.match(settings, /Liquid blur and refraction, spring motion/);
  assert.match(performanceStyles, /body\.light-mode \.student-dashboard-bottom-nav,[\s\S]*?backdrop-filter:\s*none !important/s);
  assert.match(performanceStyles, /body\.light-mode \.student-next-mission,[\s\S]*?background:\s*#0f172a !important/s);
  assert.match(performanceStyles, /body\.light-mode \.student-dashboard-bottom-nav::before,[\s\S]*?display:\s*none !important/s);
});
