import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(path, 'utf8');
const app = read('App.tsx');
const schoolAdmin = read('components/SchoolAdminPortal.tsx');
const billing = read('components/school-admin/tabs/BillingTab.tsx');
const seatManager = read('components/school-admin/ProgrammeSeatManager.tsx');
const programmeSeats = read('services/programmeSeatService.ts');
const teacher = read('components/TeacherPortal.tsx');
const migration = read('supabase/migrations/20260817142000_fix_school_dashboard_requests_and_tasks.sql');
test('student assignment reads survive plan changes and entitlement errors stay valid JSON', () => {
    assert.match(migration, /rpc_get_student_pending_assignments[\s\S]*?return;/);
    assert.match(migration, /'hint', 'Ask your school administrator to review the current plan\.'/);
    assert.match(migration, /'details', format\('Required feature: %s', v_feature\)/);
    assert.match(migration, /detail = jsonb_build_object\([\s\S]*?'status', 403/);
});
test('multi-role school administrators can open the parent dashboard from the header', () => {
    assert.match(schoolAdmin, /onOpenParentPortal\?: \(\) => void/);
    assert.match(schoolAdmin, /onOpenParentPortal[\s\S]*?>Parent Dashboard<\/button>/);
    assert.match(app, /onOpenParentPortal=\{hasParentWorkspace \? \(\) => handleViewChange\('parent'\) : undefined\}/);
});
test('programme requests are live, counted, and visible before a programme is purchased', () => {
    assert.match(programmeSeats, /getPendingProgrammeAccessRequestCount/);
    assert.match(programmeSeats, /subscribeToProgrammeAccessRequestChanges/);
    assert.match(migration, /alter publication supabase_realtime add table public\.school_programme_access_requests/);
    assert.match(schoolAdmin, /school-admin-nav-badge/);
    assert.match(schoolAdmin, /pendingProgrammeRequestCount/);
    assert.match(seatManager, /if \(!overview\) return null/);
    assert.doesNotMatch(seatManager, /if \(!overview \|\| overview\.programmes\.length === 0\) return null/);
    assert.match(seatManager, /Review package/);
    assert.ok(billing.indexOf('<ProgrammeSeatManager') < billing.indexOf('<BillingStudio'));
    assert.match(app, /notification\.data\?\.destination === 'programme_seats'/);
});
test('Clan Wars and Lockdown Mode open their distinct workspaces', () => {
    assert.match(teacher, /setView\('clan-wars'\)/);
    assert.match(teacher, /<ClanTerritoryManager/);
    assert.match(teacher, /if \(onLockdown\) \{[\s\S]*?onLockdown\(\);[\s\S]*?<h4 className="teacher-action-title">Lockdown Mode<\/h4>/);
    assert.doesNotMatch(teacher, /Lockdown Mode opens[\s\S]{0,500}setView\('clan-wars'\)/);
    assert.match(app, /const LockdownManager = lazyRetry/);
    assert.match(app, /case 'lockdown':[\s\S]*?<LockdownManager/);
    assert.doesNotMatch(app, /case 'lockdown':[\s\S]{0,500}<ClanTerritoryManager/);
});
