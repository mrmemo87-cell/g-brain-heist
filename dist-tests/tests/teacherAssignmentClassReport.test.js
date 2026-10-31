import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTeacherAssignmentClassReport } from '../src/lib/teacherAssignmentClassReport.js';
const assignment = {
    id: 'assignment', teacher_id: 'teacher', subject_name: 'English',
    topic_name: 'Passive voice', batch: null, question_count: 10,
    assigned_at: '2026-10-23T06:00:00Z', due_at: null,
    completed_count: 2, student_count: 19,
};
const result = {
    student_id: 'student', student_name: 'Sample student', batch: null,
    score: 40, correct: 8, incorrect: 2, accuracy: 80,
    completed_at: '2026-10-23T06:10:00Z', completion_source: 'paper',
};
test('class averages exclude unfinished students and distinguish XP from accuracy', () => {
    const html = buildTeacherAssignmentClassReport(assignment, [result, { ...result, student_id: 'second', accuracy: 100 }]);
    assert.match(html, /90\.0%/);
    assert.match(html, /2 \/ 19/);
    assert.match(html, /Score \(XP\)/);
    assert.match(html, /Paper · Teacher confirmed/);
    assert.match(html, /Unfinished submissions are excluded/);
    assert.match(html, /No deadline/);
});
test('print markup escapes names, topics and class values; missing provenance is not invented', () => {
    const html = buildTeacherAssignmentClassReport({ ...assignment, topic_name: '<img src=x onerror=alert(1)>' }, [{ ...result, student_name: '<script>alert(1)</script>', completion_source: undefined }]);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<script>|<img/);
    assert.match(html, /Not recorded/);
    assert.doesNotMatch(html, /<td>Online<\/td>/);
});
test('empty results and invalid dates do not print NaN or a fabricated zero average', () => {
    const html = buildTeacherAssignmentClassReport({ ...assignment, assigned_at: 'invalid' }, []);
    assert.match(html, /No completed results/);
    assert.match(html, /Unavailable/);
    assert.doesNotMatch(html, /NaN|Invalid Date|0\.0%/);
});
