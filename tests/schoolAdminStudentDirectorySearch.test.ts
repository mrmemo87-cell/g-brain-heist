import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const members = readFileSync('components/school-admin/tabs/MembersTab.tsx', 'utf8');

test('student directory search covers the complete role result before client-side filters and pagination', () => {
  assert.match(portal, /listSchoolMembers\(schoolId, \{[\s\S]*?role: memberRoleFilter \|\| undefined,[\s\S]*?search: memberSearch \|\| undefined,[\s\S]*?limit: 10000,[\s\S]*?offset: 0/);
  assert.match(members, /const communityMembers = Array\.isArray\(members\) \? members : \[\]/);
  assert.match(members, /normalizedMemberSearch = memberSearch\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(members, /\[member\.full_name, member\.username, member\.email\]/);
  assert.match(members, /searchableIdentity\.includes\(normalizedMemberSearch\)/);
  assert.match(members, /const visiblePeople = filteredPeople\.slice/);
});

test('changing the search resets pagination before slicing visible students', () => {
  assert.match(members, /React\.useEffect\(\(\) => \{ setMemberPage\(1\); \}, \[[^\]]*memberSearch[^\]]*\]\)/);
});
