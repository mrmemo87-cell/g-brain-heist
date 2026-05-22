import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildNextAssignmentItemRoute, getAssignmentItemVisualStatus, getAssignmentProgressSummary, resolveNextIncompleteAssignmentItem, } from '../services/ieltsAssignmentUx.js';
test('assigned practice completed items resolve completed state', () => {
    assert.equal(getAssignmentItemVisualStatus({ status: 'completed' }), 'completed');
    assert.equal(getAssignmentItemVisualStatus({ status: 'in_progress' }), 'in_progress');
    assert.equal(getAssignmentItemVisualStatus({}, { student_status: 'completed' }), 'completed');
    const assignedPracticeSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsAssignedPractice.tsx'), 'utf8');
    assert.match(assignedPracticeSource, /✓ Completed/, 'completed assigned practice items should render completed copy instead of Open');
});
test('assignment progress bar math clamps and rounds percentage', () => {
    assert.deepEqual(getAssignmentProgressSummary({ completedCount: 1, totalCount: 4 }), {
        completedCount: 1,
        totalCount: 4,
        percentage: 25,
        allItemsComplete: false,
    });
    assert.deepEqual(getAssignmentProgressSummary({ completedCount: 5, totalCount: 4 }), {
        completedCount: 4,
        totalCount: 4,
        percentage: 100,
        allItemsComplete: true,
    });
    assert.deepEqual(getAssignmentProgressSummary({ completedCount: 0, totalCount: 0 }), {
        completedCount: 0,
        totalCount: 0,
        percentage: 0,
        allItemsComplete: false,
    });
});
test('next incomplete assignment item selection prefers same skill then order index', () => {
    const progress = {
        assignment_id: 'assignment-1',
        student_status: 'in_progress',
        required_count: 4,
        completed_required_count: 1,
        item_count: 4,
        completed_item_count: 1,
        items: [
            { assignment_item_id: 'reading-1', skill: 'reading', content_type: 'ielts_reading_set', content_id: '11', title: 'Reading 1', required: true, order_index: 0, status: 'completed', practice_attempt_type: null, practice_attempt_id: null, started_at: null, completed_at: null, updated_at: null },
            { assignment_item_id: 'listening-1', skill: 'listening', content_type: 'ielts_listening_set', content_id: '22', title: 'Listening 1', required: true, order_index: 1, status: 'assigned', practice_attempt_type: null, practice_attempt_id: null, started_at: null, completed_at: null, updated_at: null },
            { assignment_item_id: 'reading-2', skill: 'reading', content_type: 'ielts_reading_set', content_id: '33', title: 'Reading 2', required: true, order_index: 2, status: 'assigned', practice_attempt_type: null, practice_attempt_id: null, started_at: null, completed_at: null, updated_at: null },
            { assignment_item_id: 'writing-1', skill: 'writing', content_type: 'ielts_writing_task', content_id: '44', title: 'Writing 1', required: true, order_index: 3, status: 'assigned', practice_attempt_type: null, practice_attempt_id: null, started_at: null, completed_at: null, updated_at: null },
        ],
    };
    assert.equal(resolveNextIncompleteAssignmentItem(progress, 'reading-1')?.assignment_item_id, 'reading-2');
    assert.equal(resolveNextIncompleteAssignmentItem(progress, 'listening-1')?.assignment_item_id, 'reading-2');
    assert.equal(buildNextAssignmentItemRoute(progress, 'reading-1', { assignmentTitle: 'Week 1', assignmentDueAt: '2026-05-20T10:00:00.000Z' }), '/ielts/reading/33?assignment_id=assignment-1&assignment_item_id=reading-2&assignment_item_count=4&assignment_title=Week+1&assignment_due_at=2026-05-20T10%3A00%3A00.000Z');
});
test('assignment result screen wording is present only in assignment completion UI', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/assignmentPracticeUi.tsx'), 'utf8');
    assert.match(source, /School Assignment Progress/);
    assert.match(source, /assignmentTitle/);
    assert.match(source, /Due:/);
    assert.match(source, /Continue to next assignment item/);
    assert.match(source, /if \(!context\.isAssignedPractice\)/, 'free-practice launches should not render assignment wording');
});
test('classroom assignment UX does not expose answer_key', () => {
    const changedFiles = [
        'services/ieltsAssignmentUx.ts',
        'src/pages/ielts/assignmentPracticeUi.tsx',
        'src/pages/ielts/IeltsAssignedPractice.tsx',
    ];
    for (const file of changedFiles) {
        const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
        assert.doesNotMatch(source, /answer_key/i, `${file} must not expose answer_key`);
    }
});
test('assigned IELTS practice student helper text covers auto-complete, read-only closed state, and no items', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsAssignedPractice.tsx'), 'utf8');
    assert.match(source, /Assignments complete automatically after all required items are finished/i, 'student view should explain automatic completion');
    assert.match(source, /Closed assignments are read-only/i, 'student view should explain closed assignment read-only behavior');
    assert.match(source, /This assignment has no items yet/i, 'student view should explain assignments with no items');
});
