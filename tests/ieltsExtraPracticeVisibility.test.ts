import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('student sees extra practice blocks only when enabled', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  assert.match(home, /extraPracticeEnabled/, 'home should load extra practice school setting');
  assert.match(home, /\{extraPracticeEnabled && \([\s\S]*Free Trial Test Banner[\s\S]*\)\}/, 'home should gate free trial banner by toggle');
  assert.match(home, /\{extraPracticeEnabled && \([\s\S]*Reading[\s\S]*Listening[\s\S]*Writing[\s\S]*Speaking[\s\S]*\)\}/, 'home should gate skill-based extra practice by toggle');
  assert.match(home, /My IELTS Journey/, 'home should always keep My IELTS Journey visible');
  assert.match(home, /Assigned Practice/, 'home should always keep Assigned Practice visible');
  assert.match(home, /Back to Brain Heist Game/, 'home should always keep back-to-game visible');
});

test('direct student extra practice route access blocked when disabled', () => {
  const guard = read('src/pages/ielts/IeltsExtraPracticeGuard.tsx');
  const routes = read('index.tsx');
  assert.match(guard, /Extra Practice is currently disabled by your school\./, 'guard should show lock message');
  for (const route of ['/ielts/reading/:setId', '/ielts/listening/:setId', '/ielts/writing/:taskId', '/ielts/speaking/:taskId', '/ielts/trial-test', '/ielts/trial-test-2']) {
    assert.match(routes, new RegExp(`path: '${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?<IeltsExtraPracticeGuard>`, 'i'), `${route} should be wrapped by IeltsExtraPracticeGuard`);
  }
});

test('school_admin/admin can still access IELTS operations tools and can control toggle', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');
  assert.match(home, /isIeltsAdminLandingRole = normalizedRole === 'school_admin' \|\| normalizedRole === 'admin' \|\| normalizedRole === 'superadmin'/);
  assert.match(home, /Allow students to use Extra Practice/);
  assert.match(home, /When off, students only see assigned IELTS practice and their journey\./);
});

test('IELTS Home review queue card is role-gated by the same helper as route guard', () => {
  const home = read('src/pages/ielts/IeltsHome.tsx');

  assert.match(home, /const canOpenReviewQueue = canAccessIeltsReviewQueue\(\{ role: userRole, is_admin: isPlatformAdmin \}\);/);
  assert.match(home, /\{canOpenReviewQueue && \(/, 'home should only render review queue card for authorized users');
});
