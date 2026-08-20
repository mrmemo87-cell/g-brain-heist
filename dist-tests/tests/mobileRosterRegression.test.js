import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260802160000_fix_teacher_roster_deduplication.sql', 'utf8');
const members = readFileSync('components/school-admin/tabs/MembersTab.tsx', 'utf8');
const mobileStyles = readFileSync('src/styles/school-admin-mobile.css', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const schoolAdminPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const viewport = readFileSync('index.html', 'utf8');
test('teacher roster RPC uses canonical memberships and an exact legacy class match', () => {
    assert.match(migration, /join public\.class_students cs on cs\.class_id = ac\.class_id/);
    assert.match(migration, /existing\.student_id = u\.id/);
    assert.match(migration, /regexp_replace[\s\S]*u\.batch[\s\S]*ac\.class_code/);
    assert.doesNotMatch(migration, /u\.grade\s*=\s*ac\.grade_level/);
    assert.match(migration, /public\.is_school_admin_of\(v_actor_user_id, v_teacher_school_id\)/);
    assert.match(migration, /set search_path = ''/);
    assert.match(migration, /revoke all[\s\S]*from public, anon/);
});
test('school community switches to readable cards instead of clipping a desktop table', () => {
    assert.match(members, /community-table-desktop/);
    assert.match(members, /community-mobile-list/);
    assert.match(members, /community-mobile-manage/);
    assert.match(mobileStyles, /\.community-table-desktop\s*\{\s*display: none/);
    assert.match(mobileStyles, /\.community-mobile-list\s*\{\s*display: grid/);
    assert.match(mobileStyles, /grid-template-columns: minmax\(0, 1fr\) auto/);
});
test('portal transitions reset scroll and empty class completion is neutral', () => {
    assert.match(teacherPortal, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
    assert.match(schoolAdminPortal, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
    assert.match(teacherPortal, /completionRate === null/);
    assert.match(teacherPortal, />No data</);
    assert.match(viewport, /viewport-fit=cover/);
});
