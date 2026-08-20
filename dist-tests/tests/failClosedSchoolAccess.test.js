import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
const migrationName = readdirSync('supabase/migrations')
    .find((file) => file.endsWith('_fail_closed_school_access.sql'));
assert.ok(migrationName, 'fail-closed school access migration must exist');
const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');
const adminPortal = readFileSync('components/AdminPortal.tsx', 'utf8');
const dashboard = readFileSync('components/school-admin/tabs/DashboardTab.tsx', 'utf8');
const roster = readFileSync('components/ClassRoster.tsx', 'utf8');
const schoolHead = readFileSync('components/SchoolHeadPortal.tsx', 'utf8');
const schoolAdminRoleHandler = adminPortal.match(/const handleSetSchoolAdmin[\s\S]+?\n  };\n\n  const handleSchoolRequestAction/)?.[0] || '';
test('school membership writes are RPC-only for browser roles', () => {
    assert.match(migration, /drop policy if exists "Users can insert their own membership"/i);
    assert.match(migration, /revoke insert, update, delete, truncate, references, trigger[\s\S]*on table public\.school_members[\s\S]*from anon, authenticated/i);
    assert.match(schoolAdminRoleHandler, /admin_set_school_admin/);
    assert.doesNotMatch(schoolAdminRoleHandler, /from\('school_members'\)/);
    assert.doesNotMatch(schoolAdminRoleHandler, /from\('users'\)/);
});
test('teacher assignment and student roster RPCs remain school and class scoped', () => {
    assert.match(migration, /get_teacher_assigned_classes[\s\S]*is_school_admin_of\(v_actor, v_teacher_school_id\)/i);
    assert.match(migration, /cta\.school_id = v_teacher_school_id/i);
    assert.match(migration, /c\.school_id = cta\.school_id/i);
    assert.match(migration, /Teacher profile required/i);
    assert.match(migration, /sm\.status = 'active'/i);
    assert.match(migration, /No assignment deliberately returns zero rows/i);
    assert.doesNotMatch(migration, /else\s+return query\s+select\s+u\.id/i);
    assert.match(migration, /u\.school_id = ac\.school_id/i);
});
test('legacy global Cambridge views are unavailable to browser roles', () => {
    assert.match(migration, /revoke all on table public\.teacher_cambridge_analytics\s+from public, anon, authenticated/i);
    assert.match(migration, /revoke all on table public\.student_cambridge_performance\s+from public, anon, authenticated/i);
});
test('programme requirement changes write a governance audit event', () => {
    assert.match(migration, /requested_programmes_updated/i);
    assert.match(migration, /previous_modules/i);
    assert.match(migration, /requested_modules/i);
    assert.match(migration, /school_governance_audit_log/i);
});
test('new-school empty states describe joining and activation accurately', () => {
    assert.match(dashboard, /Ready for enrolment/);
    assert.match(dashboard, /No teaching staff have joined yet/);
    assert.match(roster, /after they register and join this school/);
    assert.doesNotMatch(schoolHead, /First login setup|School launch checklist/);
    assert.match(schoolHead, /No active plan/);
    assert.match(schoolHead, /Renewal status[\s\S]*Not applicable/);
    assert.match(schoolHead, /No registered students have joined yet/);
});
