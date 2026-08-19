import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration = readFileSync('supabase/migrations/20260818122000_resume_in_progress_student_assignments.sql', 'utf8');
const questView = readFileSync('components/QuestView.tsx', 'utf8');
test('started student assignments remain visible to both active readers', () => {
    assert.match(migration, /create or replace function public\.rpc_get_student_pending_assignments/);
    assert.match(migration, /create or replace function public\.rpc_get_student_active_assignment/);
    assert.equal((migration.match(/sa\.status in \('pending', 'in_progress'\)/g) || []).length, 2);
    assert.match(migration, /case when sa\.status = 'in_progress' then 0 else 1 end/);
});
test('resume payload exposes progress without exposing saved answer keys', () => {
    assert.match(migration, /'answered_question_ids'/);
    assert.match(migration, /'resume_answered_count'/);
    assert.match(migration, /'resume_correct_count'/);
    assert.doesNotMatch(migration, /'correct_answer'/);
    assert.doesNotMatch(migration, /'student_answer'/);
});
test('assignment UI continues at the first unanswered question', () => {
    assert.match(questView, /firstUnansweredIndex/);
    assert.match(questView, /Continue Assignment/);
    assert.match(questView, /Finish Submission/);
    assert.match(questView, /setAssignmentStartTime\(now - resumeTimeMs\)/);
});
