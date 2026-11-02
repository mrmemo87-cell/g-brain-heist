import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isStudentSchoolSurface, studentLightBodyClass } from '../src/lib/studentAppearance';

test('Light appearance applies to school surfaces only, never to game screens', () => {
  for (const tab of ['home', 'learn', 'tasks', 'clan', 'leaderboard', 'more', 'tournaments']) assert.equal(isStudentSchoolSurface('dashboard', tab), true, tab);
  assert.equal(isStudentSchoolSurface('dashboard', 'game'), false);
  for (const view of ['pvp', 'shop', 'inventory', 'achievements', 'commander', 'lockdown', 'tournament', 'quest', 'cambridge', 'ielts']) assert.equal(isStudentSchoolSurface(view, 'home'), false, view);
  for (const view of ['writing', 'clan', 'leaderboard']) assert.equal(isStudentSchoolSurface(view, 'home'), true, view);
});

test('the body class needs the setting, a student, and a school surface', () => {
  assert.equal(studentLightBodyClass('light', true, 'dashboard', 'home'), true);
  assert.equal(studentLightBodyClass('dark', true, 'dashboard', 'home'), false, 'default stays dark');
  assert.equal(studentLightBodyClass('light', false, 'dashboard', 'home'), false, 'teachers and admins are untouched');
  assert.equal(studentLightBodyClass('light', true, 'dashboard', 'game'), false);
  assert.equal(studentLightBodyClass('light', true, 'commander', 'home'), false);
});

test('the light theme is CSS-only, opt-in, and wired into the app and Settings', () => {
  const app = readFileSync('App.tsx', 'utf8');
  const context = readFileSync('src/contexts/LightModeContext.tsx', 'utf8');
  const settings = readFileSync('components/SettingsModal.tsx', 'utf8');
  const entry = readFileSync('index.tsx', 'utf8');
  const theme = readFileSync('src/styles/student-light-theme.css', 'utf8');
  const generated = readFileSync('src/styles/student-light-theme.generated.css', 'utf8');
  assert.match(app, /classList\.toggle\('student-light', on\)/);
  assert.match(context, /brains-heist-student-appearance-v1/);
  assert.match(context, /=== 'light' \? 'light' : 'dark'/, 'anything but an explicit "light" means dark');
  assert.match(settings, /data-testid="student-appearance"/);
  assert.match(settings, /setStudentAppearance\('light'\)/);
  assert.match(entry, /student-light-theme\.css/);
  const scoped = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((rule) => rule.split('{')[0].trim()).filter(Boolean)
    .every((selectors) => selectors.startsWith('@import') || selectors.split(',').every((sel) => sel.trim().startsWith('html body.student-light')));
  assert.ok(scoped(theme), 'every hand-written rule is scoped to body.student-light');
  assert.ok(scoped(generated), 'every generated rule is scoped to body.student-light');
});
