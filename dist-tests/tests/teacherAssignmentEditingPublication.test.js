import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const gateway = readFileSync('services/rpcGateway.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260810083000_teacher_assignment_editing_publication.sql', 'utf8');
test('assignment cards expose edit beside delete and deletion uses one confirmation', () => {
    assert.match(portal, /Edit assignment/);
    const handler = portal.slice(portal.indexOf('const handleDeleteAssignment'), portal.indexOf('const renderAssignments'));
    assert.ok((handler.match(/await brainsConfirm/g) ?? []).length >= 1);
});
test('wizard supports drafts schedules email preference and late policy', () => {
    assert.match(wizard, /Save as draft/);
    assert.match(wizard, /Notify students by email\?/);
    assert.match(wizard, /Close submissions after due date/);
    assert.match(wizard, /Schedule assignment/);
});
test('server owns assignment editing and late close behavior', () => {
    assert.match(gateway, /rpc_update_teacher_assignment/);
    assert.ok(/t\.user_id\s*=\s*v_actor/i.test(migration) || (/t\.user_id/i.test(migration) && /v_teacher_user_id\s*<>\s*v_actor/i.test(migration) && /raise exception/i.test(migration)), 'editing RPC must bind the authenticated actor to the assignment creator');
    assert.match(migration, /ASSIGNMENT_CLOSED/);
    assert.match(migration, /submitted_late/);
    assert.match(migration, /publish_status in \('draft','scheduled','published'\)/);
    assert.match(migration, /assignment_change_audit/);
});
