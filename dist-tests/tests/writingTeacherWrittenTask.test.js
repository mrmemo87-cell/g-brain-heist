import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration = readFileSync('supabase/migrations/20261110130000_writing_teacher_written_tasks.sql', 'utf8');
const bodyOf = (fn) => {
    const start = migration.indexOf(`function public.${fn}(`);
    assert.ok(start > 0, `${fn} is defined`);
    return migration.slice(start, migration.indexOf('$$;', start));
};
test('a teacher-written task is authorized by roster, validated and owned by the school', () => {
    const body = bodyOf('rpc_bh_writing_create_class_task');
    assert.match(body, /security definer/);
    assert.match(body, /bh_writing_authorized_english_roster\(\)/);
    assert.match(body, /Forbidden: this class is not in your English roster/);
    assert.match(body, /'owner_school_id', v_school_id/);
    assert.match(body, /'created_by', v_actor/);
    assert.match(body, /List 2 to 4 points the student must cover/);
    // Marking rules, word limits and timing are copied from a standard task, never supplied by the caller.
    assert.match(body, /v_payload := v_template\s+\|\| jsonb_build_object/);
    assert.doesNotMatch(body, /p_rubric|p_time|p_word/);
    assert.match(migration, /revoke all on function public\.rpc_bh_writing_create_class_task\([^)]*\) from public, anon/);
});
test('school-written tasks are listed and assignable only inside the owning school', () => {
    const guard = /not \(pb\.payload \? 'owner_school_id'\) or pb\.payload->>'owner_school_id' = v_school_id::text/;
    assert.match(bodyOf('rpc_bh_writing_class_task_options'), guard);
    assert.match(bodyOf('rpc_bh_writing_assign_class_task'), guard);
});
test('the general rotation never serves a school-written task', () => {
    const picker = readFileSync('supabase/migrations/20261110120000_writing_server_drafts.sql', 'utf8');
    assert.match(picker, /and not \(pb\.payload \? 'owner_school_id'\)/);
});
test('the monitor offers the write-your-own form', () => {
    const panel = readFileSync('src/pages/writing/WritingClassTaskPanel.tsx', 'utf8');
    assert.match(panel, /data-testid="writing-class-own-task"/);
    assert.match(panel, /createWritingClassTask\(/);
});
