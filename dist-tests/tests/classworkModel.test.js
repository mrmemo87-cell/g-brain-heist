import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignmentsForGroup, buildClassworkGrid, classworkAttention, scoreBand, studentTimeline } from '../src/lib/classworkModel.js';
const now = new Date('2026-11-18T12:00:00Z');
const group = { id: 'g8', name: 'Grade 8 ESL', studentIds: ['a', 'b', 'c'], classCodes: ['8A'] };
const nameOf = (id) => ({ a: 'Aisha', b: 'Bek', c: 'Chyngyz' }[id] ?? id);
const work = (id, extra = {}) => ({
    id, title: `Task ${id}`, assigned_at: '2026-11-01T08:00:00Z', subject_group_id: 'g8', publish_status: 'published', ...extra,
});
test('group assignments exclude targeted practice and other groups, newest first', () => {
    const list = assignmentsForGroup([
        work('old', { assigned_at: '2026-10-01T08:00:00Z' }),
        work('new', { assigned_at: '2026-11-10T08:00:00Z' }),
        work('other', { subject_group_id: 'g7' }),
        work('tp', { targeted_practice: { student_id: 'a' } }),
        work('legacy', { subject_group_id: null, batch: '8a', assignment_mode: 'batch' }),
    ], group);
    assert.deepEqual(list.map((a) => a.id), ['new', 'legacy', 'old']);
});
test('grid separates a score, missing work and work never set for the student', () => {
    const grid = buildClassworkGrid({
        group, now, nameOf,
        assignments: [
            work('w1', { due_at: '2026-11-05T08:00:00Z' }),
            work('w2', { student_ids: ['a'] }),
            work('tp', { targeted_practice: { student_id: 'b' }, student_ids: ['b'] }),
        ],
        results: { w1: [{ student_id: 'a', accuracy: 90 }, { student_id: 'b', accuracy: 50 }], w2: [] },
    });
    assert.deepEqual(grid.rows.map((r) => r.name), ['Aisha', 'Bek', 'Chyngyz']);
    const col = (id) => grid.columns.findIndex((c) => c.assignment.id === id);
    const [aisha, bek, chyngyz] = grid.rows;
    assert.deepEqual(aisha.cells[col('w1')], { kind: 'score', accuracy: 90 });
    assert.equal(aisha.cells[col('w2')].kind, 'missing');
    assert.equal(bek.cells[col('w2')].kind, 'not-set');
    assert.equal(chyngyz.cells[col('w1')].kind, 'missing');
    assert.equal(bek.openTargeted, 1);
    assert.equal(aisha.openTargeted, 0);
    assert.equal(grid.columns.length, 2, 'targeted practice never becomes a class column');
    const w1 = grid.columns[col('w1')];
    assert.equal(w1.setCount, 3);
    assert.equal(w1.doneCount, 2);
    assert.equal(w1.average, 70);
    assert.equal(w1.pastDue, true);
    assert.equal(grid.columns[col('w2')].setCount, 1);
    const attention = classworkAttention(grid);
    assert.equal(attention.pastDue, 1);
    assert.ok(attention.mostMissing);
});
test('student timeline holds class work and that student\'s targeted practice only', () => {
    const items = studentTimeline({
        studentId: 'b', now,
        assignments: [
            work('w1'),
            work('w2', { student_ids: ['a'] }),
            work('tp-b', { targeted_practice: { student_id: 'b' }, student_ids: ['b'] }),
            work('tp-a', { targeted_practice: { student_id: 'a' }, student_ids: ['a'] }),
        ],
        results: { w1: [{ student_id: 'b', accuracy: 50, completed_at: '2026-11-02T08:00:00Z' }] },
    });
    assert.deepEqual(items.map((i) => i.assignment.id).sort(), ['tp-b', 'w1']);
    assert.equal(items.find((i) => i.assignment.id === 'w1')?.status, 'done');
    assert.equal(items.find((i) => i.assignment.id === 'tp-b')?.kind, 'targeted');
});
test('score bands match the key shown to teachers', () => {
    assert.equal(scoreBand(80), 'strong');
    assert.equal(scoreBand(79), 'developing');
    assert.equal(scoreBand(60), 'developing');
    assert.equal(scoreBand(59), 'support');
});
test('Classwork replaces the Assignments tab and keeps the manager and export', () => {
    const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
    assert.match(portal, /id: 'assignments', label: 'Classwork'/);
    assert.match(portal, /<Classwork[\s\S]*onPrintExport=\{\(\) => setView\('collective-report'\)\}[\s\S]*renderAssignmentManager\(\)/);
    const view = readFileSync('components/teacher/Classwork.tsx', 'utf8');
    assert.match(view, /get_all_assignment_reports/);
    assert.match(view, /By class[\s\S]*By student[\s\S]*Manage/);
});
