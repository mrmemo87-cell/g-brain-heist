import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const dashboard = readFileSync('components/school-admin/tabs/DashboardTab.tsx', 'utf8');
const members = readFileSync('components/school-admin/tabs/MembersTab.tsx', 'utf8');
const portal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const service = readFileSync('services/schoolAdminService.ts', 'utf8');
test('school admin overview guards every asynchronously loaded collection', () => {
    for (const collection of ['classes', 'students', 'teacherAssignments', 'teachers']) {
        assert.match(dashboard, new RegExp(`Array\\.isArray\\(context\\.${collection}\\)`));
    }
    assert.match(dashboard, /academicSetup\?\.offerings \|\| \[\]/);
});
test('school community remains render-safe while member collections load', () => {
    assert.match(members, /Array\.isArray\(schoolAdmins\)/);
    assert.match(members, /Array\.isArray\(members\)/);
});
test('school admin RPC payloads are normalized before entering render state', () => {
    for (const collection of ['classList', 'teacherList', 'assignmentsList', 'studentList', 'subjectList', 'adminList']) {
        assert.match(portal, new RegExp(`Array\\.isArray\\(${collection}\\)`));
    }
    assert.match(service, /Invalid school subjects response: expected an array/);
});
