import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const service = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260726024030_teacher_assignment_success_summary.sql', 'utf8');
test('teacher dashboard uses submitted assignments for success metrics', () => {
    assert.match(portal, /get_teacher_assignment_success_summary\(\)/);
    assert.match(portal, /assignmentSuccess\?\.submission_count/);
    assert.match(portal, /Assignment Success/);
    assert.match(portal, /answered_question_count/);
    assert.doesNotMatch(portal, /myQuestions\.reduce\(\(sum, q\) => sum \+ \(q\.times_correct/);
    assert.match(service, /rpcGetTeacherAssignmentSuccessSummary\(\)/);
});
test('assignment success RPC is scoped to the authenticated teacher', () => {
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /where t\.user_id = \(select auth\.uid\(\)\)/i);
    assert.match(migration, /join current_teacher t on t\.id = a\.teacher_id/i);
    assert.match(migration, /sum\(correct \+ incorrect\)/i);
    assert.match(migration, /correct_answer_count::numeric \* 100 \/ answered_question_count/i);
    assert.match(migration, /legacy_quarantined_assignment_students/i);
    assert.match(migration, /revoke all on function public\.rpc_teacher_assignment_success_summary\(\) from public/i);
    assert.match(migration, /grant execute on function public\.rpc_teacher_assignment_success_summary\(\) to authenticated/i);
});
