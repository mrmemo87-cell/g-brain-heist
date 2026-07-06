import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { bandGapLabel, humanizeIeltsSnapshotStatus, rpcIeltsSchoolStudentSnapshot } from '../services/ieltsSchoolStudentSnapshotService.js';
const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260530120000_ielts_school_student_snapshot.sql');
const dashboardPath = path.join(process.cwd(), 'src/pages/ielts/IeltsJourneyDashboard.tsx');
const modalPath = path.join(process.cwd(), 'src/pages/ielts/components/IeltsSchoolStudentProgressModal.tsx');
const migration = fs.readFileSync(migrationPath, 'utf8');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');
const modal = fs.readFileSync(modalPath, 'utf8');
test('snapshot service calls the dedicated secure RPC', async () => {
    const calls = [];
    const result = await rpcIeltsSchoolStudentSnapshot('student-1', {
        rpc: ((name, args) => {
            calls.push({ name, args });
            return Promise.resolve({ data: { student: { id: 'student-1' }, readiness: {}, assignments: { active: [], completed: [] }, recent_activity: {}, needs_attention: [] }, error: null });
        }),
    });
    assert.equal(calls[0].name, 'rpc_ielts_school_student_snapshot');
    assert.deepEqual(calls[0].args, { p_student_id: 'student-1' });
    assert.equal(result.student.id, 'student-1');
});
test('snapshot RPC enforces school-admin/admin access without teacher IELTS admin grants', () => {
    assert.match(migration, /coalesce\(u\.role, ''\) = 'school_admin' and u\.school_id = v_student\.school_id/);
    assert.match(migration, /coalesce\(u\.role, ''\) in \('admin', 'superadmin'\)/);
    assert.match(migration, /coalesce\(u\.is_admin, false\) = true/);
    assert.match(migration, /sm\.school_id = v_student\.school_id/);
    assert.match(migration, /sm\.role_in_school in \('school_admin', 'admin', 'superadmin'\)/);
    assert.doesNotMatch(migration, /role_in_school in \([^)]*'teacher'/);
    assert.doesNotMatch(migration, /coalesce\(u\.role, ''\) in \([^)]*'teacher'/);
    assert.match(migration, /if not v_actor_can_view then\s+raise exception 'forbidden';/s);
    assert.match(migration, /revoke execute on function public\.rpc_ielts_school_student_snapshot\(uuid\) from public;/);
});
test('students and cross-school users cannot fetch other student snapshots through the RPC', () => {
    assert.match(migration, /p_student_id is null then raise exception 'student_required'/);
    assert.match(migration, /if coalesce\(v_student\.role, 'student'\) <> 'student'/);
    assert.match(migration, /or \(coalesce\(u\.role, ''\) = 'school_admin' and u\.school_id = v_student\.school_id\)/);
    assert.doesNotMatch(migration, /p_student_id = v_actor_id/);
    assert.match(migration, /a\.school_id = v_student\.school_id/, 'assignment and pending-review reads should be constrained to the target student school');
    assert.match(migration, /school_id = v_student\.school_id[\s\S]*finalized = true/, 'reviewed feedback should be constrained to the target student school');
});
test('school admin results table opens the progress modal from student names only for admin mode', () => {
    assert.match(dashboard, /mode === 'admin'/);
    assert.match(dashboard, /rpcIeltsSchoolResults\(\{ limit: 100 \}\)/);
    assert.match(dashboard, /rpcIeltsSchoolStudentSnapshot\(student\.student_id\)/);
    assert.match(dashboard, /data-testid="ielts-open-student-progress"/);
    assert.match(dashboard, /IeltsSchoolStudentProgressModal/);
    assert.match(dashboard, /Boolean\(typedProfile\?\.is_admin\) \|\| role === 'school_admin' \|\| role === 'admin' \|\| role === 'superadmin'/);
});
test('snapshot RPC uses existing assignment student timestamps instead of non-existent assigned_at column', () => {
    const assignmentStudentSchema = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260516130000_ielts_practice_assignments_foundation.sql'), 'utf8');
    const assignmentStudentTable = assignmentStudentSchema.slice(assignmentStudentSchema.indexOf('create table if not exists public.ielts_practice_assignment_students'), assignmentStudentSchema.indexOf('create index if not exists idx_ielts_practice_assignments_school'));
    assert.match(assignmentStudentTable, /created_at timestamptz not null default now\(\)/, 'assignment student rows have created_at');
    assert.doesNotMatch(assignmentStudentTable, /assigned_at timestamptz/, 'assignment student rows do not define assigned_at');
    assert.doesNotMatch(migration, /s\.assigned_at/, 'snapshot RPC must not reference missing s.assigned_at');
    assert.match(migration, /s\.created_at as assigned_at/, 'snapshot RPC should use the existing created_at timestamp for assignment ordering');
    assert.match(migration, /group by a\.id, a\.title, a\.due_at, s\.status, s\.created_at/, 'active assignment grouping should use the existing timestamp column');
});
test('modal supports outside click, Escape, close button, loading, and error states', () => {
    assert.match(modal, /data-testid="ielts-progress-modal-backdrop"/);
    assert.match(modal, /onClick=\{onClose\}/);
    assert.match(modal, /event\.key === 'Escape'/);
    assert.match(modal, /aria-label="Close student progress"/);
    assert.match(modal, /Loading IELTS progress/);
    assert.match(modal, /Unable to load this student snapshot/);
    assert.match(modal, /href=\{item\.cta\.route\}/, 'known assignment CTA routes should render as links without displaying raw ids');
});
test('modal renders readiness gauges and assignment progress rows', () => {
    assert.match(modal, /Readiness Gauges/);
    assert.match(modal, /data-testid=\{`ielts-progress-gauge-/);
    assert.match(modal, /Assignment Progress/);
    assert.match(modal, /data-testid="ielts-progress-assignment-row"/);
    assert.match(modal, /completed_count/);
    assert.match(modal, /total_count/);
});
test('review pending is separated from feedback ready and raw enum statuses are humanized', () => {
    assert.equal(humanizeIeltsSnapshotStatus('awaiting_feedback'), 'Review pending');
    assert.equal(humanizeIeltsSnapshotStatus('feedback_ready'), 'Feedback ready');
    assert.equal(humanizeIeltsSnapshotStatus('in_progress'), 'In progress');
    assert.equal(humanizeIeltsSnapshotStatus('force_submitted'), 'Submitted');
    assert.equal(bandGapLabel(6.5, 7.5), '1.0 below target');
    assert.match(modal, /item\.feedback_status === 'feedback_ready' \? 'Feedback ready'/);
    assert.match(modal, /item\.feedback_status === 'awaiting_feedback' \? 'Review pending'/);
});
