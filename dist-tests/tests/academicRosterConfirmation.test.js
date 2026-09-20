import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260821024304_academic_roster_confirmation.sql', 'utf8');
const service = readFileSync('services/schoolAcademicSetupService.ts', 'utf8');
test('academic roster confirmation is school-admin scoped and security hardened', () => {
    assert.match(migration, /rpc_school_admin_academic_roster_readiness/);
    assert.match(migration, /rpc_school_admin_confirm_academic_roster/);
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /school_administrator_access_required/);
    assert.match(migration, /revoke all on function public\.rpc_school_admin_academic_roster_readiness\(uuid, uuid\) from public/i);
    assert.match(migration, /revoke all on function public\.rpc_school_admin_academic_roster_readiness\(uuid, uuid\) from anon/i);
    assert.match(migration, /revoke all on function public\.rpc_school_admin_confirm_academic_roster\(uuid, uuid\) from public/i);
    assert.match(migration, /revoke all on function public\.rpc_school_admin_confirm_academic_roster\(uuid, uuid\) from anon/i);
});
test('confirmation refuses unsafe rosters and only confirms current academic enrolments', () => {
    assert.match(migration, /academic_roster_not_ready/);
    assert.match(migration, /unplacedStudentIds/);
    assert.match(migration, /roleMismatchStudentIds/);
    assert.match(migration, /multipleEnrolmentStudentIds/);
    assert.match(migration, /confirmedPlacementMismatchStudentIds/);
    assert.match(migration, /e\.context_quality = 'estimated'/);
    assert.match(migration, /context_quality = 'confirmed'/);
    assert.match(migration, /source = 'school_admin'/);
    assert.doesNotMatch(migration, /delete\s+from\s+public\.assignments/i);
    assert.doesNotMatch(migration, /delete\s+from\s+public\.student_assignment_results/i);
});
test('academic setup service exposes preview and confirmation separately', () => {
    assert.match(service, /fetchAcademicRosterReadiness/);
    assert.match(service, /rpc_school_admin_academic_roster_readiness/);
    assert.match(service, /confirmAcademicRoster/);
    assert.match(service, /rpc_school_admin_confirm_academic_roster/);
});
