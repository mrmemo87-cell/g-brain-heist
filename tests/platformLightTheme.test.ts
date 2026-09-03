import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const context = readFileSync('src/contexts/LightModeContext.tsx', 'utf8');
const entry = readFileSync('index.tsx', 'utf8');
const styles = readFileSync('src/styles/platform-light-theme.css', 'utf8');

test('platform light palette is independent from the performance-style preference', () => {
  assert.match(context, /platform-light-theme/);
  assert.match(entry, /platform-light-theme\.css/);
  assert.match(styles, /body\.platform-light-theme/);
  assert.match(styles, /--platform-page:\s*#f5f7fb/i);
  assert.match(styles, /--platform-surface:\s*#ffffff/i);
  assert.match(styles, /\.superadmin-shell/);
  assert.match(styles, /\.school-admin-portal/);
  assert.match(styles, /\.student-dashboard-shell/);
});

test('professional light layer keeps form controls and wide-table scrollbars readable', () => {
  assert.match(styles, /input:not\(\[type="checkbox"\]\)/);
  assert.match(styles, /background:\s*#ffffff\s*!important/);
  assert.match(styles, /::-webkit-scrollbar/);
  assert.match(styles, /height:\s*10px/);
});
