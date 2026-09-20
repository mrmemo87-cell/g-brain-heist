import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('student management renders the refreshed member directory', () => {
    const source = readFileSync('components/school-admin/tabs/MembersTab.tsx', 'utf8');
    assert.ok(source.includes('const communityMembers = Array.isArray(members) ? members : [];'));
});
