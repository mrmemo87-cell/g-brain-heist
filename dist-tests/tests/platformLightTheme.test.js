import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const context = readFileSync('src/contexts/LightModeContext.tsx', 'utf8');
const entry = readFileSync('index.tsx', 'utf8');
const styles = readFileSync('src/styles/platform-light-theme.css', 'utf8');
test('platform light palette is independent from the performance-style preference', () => {
    assert.doesNotMatch(context, /classList\.add\('platform-light-theme'\)/);
    assert.match(entry, /if \(isAuthenticated\)[\s\S]{0,220}classList\.add\('platform-light-theme'\)/);
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
test('public LoginView keeps its original branded UX outside the authenticated light palette', () => {
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
