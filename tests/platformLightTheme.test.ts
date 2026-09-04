import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const context = readFileSync('src/contexts/LightModeContext.tsx', 'utf8');
const entry = readFileSync('index.tsx', 'utf8');
const styles = readFileSync('src/styles/platform-light-theme.css', 'utf8');
const superadminShell = readFileSync('components/admin/SuperadminShell.tsx', 'utf8');

test('professional light palette is scoped to the Superadmin shell only', () => {
  assert.doesNotMatch(context, /classList\.add\('platform-light-theme'\)/);
  assert.match(entry, /platform-light-theme\.css/);
  assert.match(superadminShell, /className="superadmin-shell/);

  // The old authenticated-session body class is intentionally inert here.
  assert.doesNotMatch(styles, /body\.platform-light-theme/);
  assert.doesNotMatch(styles, /^\s*:root\s*\{/m);
  assert.match(styles, /body:has\(\.superadmin-shell\)/);

  // Regression guard: the Superadmin theme must never target other role surfaces.
  assert.doesNotMatch(styles, /\.student-dashboard-/);
  assert.doesNotMatch(styles, /\.student-profile-/);
  assert.doesNotMatch(styles, /\.student-next-mission/);
  assert.doesNotMatch(styles, /\.student-activity-/);
  assert.doesNotMatch(styles, /\.school-admin-portal/);
  assert.doesNotMatch(styles, /\[class\*="teacher-portal"\]/i);

  assert.match(styles, /--platform-page:\s*#f5f7fb/i);
  assert.match(styles, /--platform-surface:\s*#ffffff/i);
  assert.match(styles, /\.superadmin-shell/);
});

test('Superadmin light layer keeps form controls and wide-table scrollbars readable', () => {
  assert.match(styles, /body:has\(\.superadmin-shell\) input:not\(\[type="checkbox"\]\)/);
  assert.match(styles, /background:\s*#ffffff\s*!important/);
  assert.match(styles, /body:has\(\.superadmin-shell\) ::-webkit-scrollbar/);
  assert.match(styles, /height:\s*10px/);
});

test('public LoginView keeps its original branded UX outside the Superadmin palette', () => {
  const login = readFileSync('components/LoginView.tsx', 'utf8');
  assert.match(login, /bg-\[#030a14\]/);
  assert.match(login, /bg-\[#081321\]\/90/);
  assert.match(login, /text-white/);
  assert.match(login, /from-cyan-300 via-cyan-400 to-teal-300/);
});

test('Superadmin legacy accent text is remapped to readable light-theme contrast', () => {
  assert.match(styles, /Superadmin accessibility contrast pass/);
  assert.match(styles, /text-cyan-100/);
  assert.match(styles, /#0e5f7a/i);
  assert.match(styles, /#047857/i);
  assert.match(styles, /#92400e/i);
  assert.match(styles, /#b42318/i);
});
