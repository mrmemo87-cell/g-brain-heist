import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { groupTargetedPracticeByStudent, isTargetedPractice, markTargetedPractice, targetedPracticeSkill, targetedPracticeStatus, } from '../src/lib/teacherTargetedPractice.js';
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const toolbar = readFileSync('components/teacher/AssignmentToolbar.tsx', 'utf8');
const list = readFileSync('components/teacher/TargetedPracticeList.tsx', 'utf8');
const service = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261118130000_teacher_targeted_practice_assignments.sql', 'utf8');
const now = new Date('2026-11-18T12:00:00Z');
const row = (id, title, extra = {}) => ({
    id, title, student_count: 1, completed_count: 0, student_ids: [`student-${id}`], ...extra,
});
test('the database link decides what is targeted practice', () => {
    const marked = markTargetedPractice([row('a', 'Verb aspect · Targeted Practice'), row('b', 'One-student quiz'), row('c', 'Looks similar · Targeted Practice')], [{ assignment_id: 'a', student_id: 's1', student_name: 'Malika', diagnostic_targets: ['Verb aspect'] }]);
    assert.deepEqual(marked.map(isTargetedPractice), [true, false, false]);
    assert.deepEqual(marked[0].targeted_practice, { student_id: 's1', student_name: 'Malika', diagnostic_targets: ['Verb aspect'] });
});
test('the title convention is only a fallback when the link cannot be loaded', () => {
    const marked = markTargetedPractice([row('a', 'Verb aspect · Targeted Practice'), row('b', 'Class homework', { student_count: 16 }), row('c', 'Group · Targeted Practice', { student_count: 5 })], null);
    assert.deepEqual(marked.map(isTargetedPractice), [true, false, false]);
    assert.equal(marked[0].targeted_practice?.student_id, 'student-a');
});
test('skill name and status read cleanly', () => {
    assert.equal(targetedPracticeSkill({ id: 'a', title: 'Connectives and logical relations · Targeted Practice' }), 'Connectives and logical relations');
    assert.equal(targetedPracticeStatus({ id: 'a', student_count: 1, completed_count: 1, due_at: '2026-11-10T00:00:00Z' }, now), 'completed');
    assert.equal(targetedPracticeStatus({ id: 'a', student_count: 1, completed_count: 0, due_at: '2026-11-16T17:59:00Z' }, now), 'overdue');
    assert.equal(targetedPracticeStatus({ id: 'a', student_count: 1, completed_count: 0, due_at: '2026-11-20T17:59:00Z' }, now), 'not-started');
});
test('tasks are grouped by student with open work first', () => {
    const marked = markTargetedPractice([
        row('a', 'Tense · Targeted Practice', { completed_count: 1, assigned_at: '2026-10-31T00:00:00Z', subject_group_name: 'Grade 7 ESL' }),
        row('b', 'Tense · Targeted Practice', { completed_count: 1, assigned_at: '2026-11-03T00:00:00Z', subject_group_name: 'Grade 7 ESL' }),
        row('c', 'Verb aspect · Targeted Practice', { assigned_at: '2026-11-13T00:00:00Z', subject_group_name: 'Grade 8 ESL' }),
    ], [
        { assignment_id: 'a', student_id: 's1', student_name: 'Temirlan' },
        { assignment_id: 'b', student_id: 's1', student_name: 'Temirlan' },
        { assignment_id: 'c', student_id: 's2', student_name: 'malika0120616' },
    ]);
    const groups = groupTargetedPracticeByStudent(marked, (id) => (id === 's2' ? 'Бактыбекова Малика' : null), now);
    assert.deepEqual(groups.map((g) => [g.studentName, g.openCount, g.groupName, g.tasks.map((t) => t.id)]), [
        ['Бактыбекова Малика', 1, 'Grade 8 ESL', ['c']],
        ['Temirlan', 0, 'Grade 7 ESL', ['b', 'a']],
    ]);
});
test('assignments page lists class work and targeted practice apart', () => {
    assert.match(toolbar, /Class assignments/);
    assert.match(toolbar, /Targeted practice/);
    assert.match(toolbar, /props\.targetedTotal > 0 &&/);
    assert.match(portal, /const classAssignments = useMemo\(\(\) => assignments\.filter\(\(a\) => !isTargetedPractice\(a\)\)/);
    assert.match(portal, /assignmentKind === 'targeted' \? \(\s*<TargetedPracticeList/);
    assert.match(list, /groupTargetedPracticeByStudent\(assignments, resolveStudentName\)/);
});
test('dashboard counts and class health describe class assignments only', () => {
    assert.match(portal, /const assignments = classAssignments;/);
    assert.match(portal, /filter\(\(row\) => !targetedAssignmentIds\.has\(row\.assignment_id\)\)/);
    assert.match(portal, /assignment_count: classResults\.length/);
});
test('targeted-practice link is teacher-scoped and optional for the list', () => {
    assert.match(migration, /where t\.user_id=auth\.uid\(\)/i);
    assert.match(migration, /on a\.teacher_id=t\.id/i);
    assert.match(migration, /p\.school_id=a\.school_id/i);
    assert.match(migration, /security definer set search_path=''/i);
    assert.match(migration, /revoke all on function public\.rpc_teacher_targeted_practice_assignments\(\)\s+from public,anon/i);
    assert.match(migration, /grant execute on function public\.rpc_teacher_targeted_practice_assignments\(\)\s+to authenticated,service_role/i);
    assert.match(service, /rpc_teacher_targeted_practice_assignments/);
    assert.match(service, /!targetedError && Array\.isArray\(targetedData\)/);
});
