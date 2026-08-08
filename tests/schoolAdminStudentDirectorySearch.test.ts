import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const members = readFileSync('components/school-admin/tabs/MembersTab.tsx', 'utf8');

test('student directory search stays client-side over the complete student list', () => {
  assert.match(members, /activePeopleTab === 'student'[\s\S]*?Array\.isArray\(students\)/);
  assert.match(members, /normalizedMemberSearch = memberSearch\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(members, /\[member\.full_name, member\.username, member\.email\]/);
  assert.match(members, /searchableIdentity\.includes\(normalizedMemberSearch\)/);
});

test('changing the search resets pagination before slicing visible students', () => {
  assert.match(members, /React\.useEffect\(\(\) => \{ setMemberPage\(1\); \}, \[[^\]]*memberSearch[^\]]*\]\)/);
});
