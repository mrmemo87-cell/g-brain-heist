import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const read = (filePath) => fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8');
const migration = read('supabase/migrations/20260822002000_fix_school_head_grade_performance.sql');
const service = read('services/schoolHeadService.ts');
test('School Head grade performance is owner-only and fail-closed', () => {
    assert.match(migration, /create or replace function public\.school_head_get_grade_performance/i);
    assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
    assert.match(migration, /if p_school_id is null or not public\.is_school_owner\(p_school_id\)/i);
    assert.match(migration, /revoke all on function public\.school_head_get_grade_performance\(uuid, integer\)[\s\S]*from public, anon, authenticated/i);
    assert.match(migration, /grant execute on function public\.school_head_get_grade_performance\(uuid, integer\)[\s\S]*to authenticated/i);
});
test('grade performance combines completed assignment results with recorded quizzes', () => {
    assert.match(migration, /from public\.student_assignment_results sar/i);
    assert.match(migration, /join public\.assignments a[\s\S]*a\.school_id = p_school_id/i);
    assert.match(migration, /join public\.student_assignments sa[\s\S]*sa\.student_id = sar\.student_id/i);
    assert.match(migration, /lower\(coalesce\(sa\.status, ''\)\) in \('completed', 'graded'\)/i);
    assert.match(migration, /sar\.completed_at >= v_period_start/i);
    assert.match(migration, /from public\.quiz_scores qs/i);
    assert.match(migration, /qs\.submitted_at >= v_period_start/i);
    assert.match(migration, /coalesce\(qs\.attempt_status, 'completed'\) <> 'deleted'/i);
    assert.match(migration, /count\(distinct sw\.evidence_key\)::integer as assessments/i);
    assert.match(migration, /round\(avg\(sw\.percentage\)::numeric, 1\) as average/i);
});
test('grade roster stays based on current active school placement', () => {
    assert.match(migration, /from public\.school_members sm/i);
    assert.match(migration, /join public\.class_students cs/i);
    assert.match(migration, /join public\.classes c[\s\S]*c\.is_active is distinct from false/i);
    assert.match(migration, /sm\.status = 'active'/i);
    assert.match(migration, /sm\.role_in_school = 'student'/i);
    assert.match(migration, /count\(distinct cs\.student_id\)::integer as students/i);
});
test('v2 snapshot changes only grade performance and preserves the legacy executive payload', () => {
    assert.match(migration, /create or replace function public\.school_head_get_executive_snapshot_v2/i);
    assert.match(migration, /v_snapshot := public\.school_head_get_executive_snapshot\(p_school_id, p_days\)/i);
    assert.match(migration, /v_grade_performance := public\.school_head_get_grade_performance\(p_school_id, p_days\)/i);
    assert.match(migration, /jsonb_set\([\s\S]*v_snapshot[\s\S]*'\{academics,grade_performance\}'/i);
    assert.match(migration, /revoke all on function public\.school_head_get_executive_snapshot_v2\(uuid, integer\)[\s\S]*from public, anon, authenticated/i);
});
test('frontend prefers v2 but safely falls back during staggered deployment', () => {
    assert.match(service, /rpc\('school_head_get_executive_snapshot_v2'/);
    assert.match(service, /if \(error\)[\s\S]*rpc\('school_head_get_executive_snapshot'/);
    assert.match(service, /rpc\('rpc_school_head_refresh_decision_alerts'/);
    assert.doesNotMatch(service, /\.from\('(?:student_assignment_results|student_assignments|assignments|quiz_scores|class_students|school_members)'\)/);
});
