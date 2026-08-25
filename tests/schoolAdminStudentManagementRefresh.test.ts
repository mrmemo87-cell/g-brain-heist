import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const membersTab = read('components/school-admin/tabs/MembersTab.tsx');
const schoolAdmin = read('components/SchoolAdminPortal.tsx');

const between = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
};

test('student management renders the authoritative post-action member directory', () => {
  assert.match(
    membersTab,
    /const communityMembers = Array\.isArray\(members\) \? members : \[\];/,
  );
  assert.doesNotMatch(
    membersTab,
    /activePeopleTab === 'student'[\s\S]{0,220}Array\.isArray\(students\)/,
  );
});

test('student removal and status actions refresh the same directory the UI renders', () => {
  assert.match(
    between(schoolAdmin, 'const handleRemoveMember', 'const handleBanMember'),
    /await loadMembers\(school\.id\)/,
  );
  assert.match(
    between(schoolAdmin, 'const handleBanMember', 'const handleUnbanMember'),
    /await loadMembers\(school\.id\)/,
  );
  assert.match(
    between(schoolAdmin, 'const handleUnbanMember', 'const loadModerationLog'),
    /await loadMembers\(school\.id\)/,
  );
  assert.match(
    between(schoolAdmin, 'const handleSuspendStudent', 'const handleUnsuspendStudent'),
    /loadMembers\(school\.id\)/,
  );
  assert.match(
    between(schoolAdmin, 'const handleUnsuspendStudent', 'const handleForceProfileChange'),
    /loadMembers\(school\.id\)/,
  );
});
