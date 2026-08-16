import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260816170000_strict_student_programme_seat_access.sql');
const entitlements = read('services/entitlementService.ts');
const app = read('App.tsx');
const routeGuard = read('components/SchoolProgrammeRouteGuard.tsx');
const router = read('index.tsx');

test('school students require an explicit active named programme-seat allocation', () => {
  const seatAuthority = migration.slice(
    migration.indexOf('create or replace function private.student_has_programme_seat'),
    migration.indexOf('revoke all on function private.student_has_programme_seat'),
  );
  assert.match(seatAuthority, /school_programme_seat_assignments/);
  assert.match(seatAuthority, /released_at is null/);
  assert.doesNotMatch(seatAuthority, /then true|seat_limit is not null/);
});

test('student catalogue distinguishes purchase from named-seat allocation', () => {
  assert.match(migration, /programme_catalogue/);
  assert.match(migration, /not_purchased/);
  assert.match(migration, /seat_not_allocated/);
  assert.match(entitlements, /programmeAccess/);
  assert.match(app, /Programme locked/);
  assert.match(app, /must allocate a .* seat to you first/);
});

test('direct IELTS routes fail closed for school accounts without programme access', () => {
  assert.match(routeGuard, /authoritative/);
  assert.match(routeGuard, /programmeAccess\[programme\]\.available/);
  assert.match(routeGuard, /access remains locked for your protection/);
  assert.match(router, /withSchoolIeltsAccess\(<IeltsHome/);
  assert.match(router, /withSchoolIeltsAccess\(<ProtectedRoute element={<IeltsPracticeRouteGuard>/);
});

test('pilot programmes receive real named-seat capacity', () => {
  assert.match(migration, /set seat_limit = 50[\s\S]*source = 'pilot'/);
  assert.match(migration, /Allocate named programme seats before students can enter a programme/);
});
