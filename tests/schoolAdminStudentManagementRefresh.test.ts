import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const membersTab = readFileSync('components/school-admin/tabs/MembersTab.tsx', 'utf8');

test('student management renders the authoritative post-action member directory', () => {
  assert.match(
    membersTab,
    /const communityMembers = Array\.isArray\(members\) \? members : \[\];/,
  );
  assert.doesNotMatch(
    membersTab,
    /const communityMembers[\s\S]{0,260}Array\.isArray\(students\)/,
  );
});
