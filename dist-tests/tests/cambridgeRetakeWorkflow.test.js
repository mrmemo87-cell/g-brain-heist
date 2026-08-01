import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const migration = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260722121643_secure_cambridge_retakes.sql'), 'utf8');
const teacherPortal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');
const studentHub = fs.readFileSync(path.resolve(process.cwd(), 'components/CambridgeTestsHub.tsx'), 'utf8');
const schoolAdminTab = fs.readFileSync(path.resolve(process.cwd(), 'components/school-admin/tabs/CambridgeTab.tsx'), 'utf8');
test('Cambridge retakes preserve the complete original submission in audit history', () => {
    assert.match(migration, /create table if not exists public\.cambridge_quiz_score_history/);
    assert.match(migration, /attempt_snapshot jsonb not null/);
    assert.match(migration, /to_jsonb\(qs\)/);
    assert.match(migration, /archived_by_role in \('teacher', 'school_admin', 'superadmin'\)/);
    assert.match(migration, /archive_reason is null or char_length\(archive_reason\) <= 500/);
    assert.match(migration, /create policy cambridge_quiz_score_history_deny_direct/);
});
test('retake authorization is transaction-safe and removes every legacy active duplicate', () => {
    assert.match(migration, /from public\.quiz_scores qs[\s\S]*for update;/);
    assert.match(migration, /lower\(trim\(qs\.student_name\)\) = lower\(trim\(v_score\.student_name\)\)/);
    assert.match(migration, /qs\.student_class is not distinct from v_score\.student_class/);
    assert.match(migration, /get diagnostics v_archived_count = row_count/);
    assert.match(migration, /v_deleted_count <> v_archived_count/);
});
test('teachers can only authorize retakes for enrolled students in assigned gradable classes', () => {
    assert.match(migration, /from public\.class_teacher_assignments cta/);
    assert.match(migration, /join public\.class_students cs/);
    assert.match(migration, /cta\.teacher_user_id = v_actor/);
    assert.match(migration, /cta\.school_id = v_score\.school_id/);
    assert.match(migration, /cta\.active = true/);
    assert.match(migration, /cta\.can_grade = true/);
    assert.match(migration, /Only the assigned class teacher can allow this retake/);
});
test('direct quiz score deletion is revoked so every retake uses the audited RPC', () => {
    assert.match(migration, /drop policy if exists "qs_delete_school_staff"/);
    assert.match(migration, /revoke delete, truncate on table public\.quiz_scores from anon, authenticated/);
    assert.match(migration, /revoke all on function public\.allow_cambridge_retake\(uuid, text\) from public, anon/);
    assert.match(migration, /grant execute on function public\.allow_cambridge_retake\(uuid, text\) to authenticated/);
});
test('teacher and school-admin interfaces describe Allow Retake instead of destructive deletion', () => {
    assert.match(teacherPortal, /Preserve attempt and allow retake/);
    assert.match(teacherPortal, /supabase\.rpc\('allow_cambridge_retake'/);
    assert.match(teacherPortal, /Reason <span className="font-normal text-slate-400">\(optional\)<\/span>/);
    assert.match(schoolAdminTab, /↻ Allow Retake/);
    assert.doesNotMatch(schoolAdminTab, />\s*🗑️ Delete\s*</);
});
test('student launches clear stale browser locks only after server progress is verified', () => {
    assert.match(studentHub, /const \[progressVerified, setProgressVerified\] = useState\(false\)/);
    assert.match(studentHub, /setProgressVerified\(true\)/);
    assert.match(studentHub, /if \(!progressVerified\)/);
    assert.match(studentHub, /clearStaleCambridgeAttemptLocks\(\);[\s\S]*setActiveTest\(test\)/);
    assert.match(studentHub, /'quiz_submitted_'/);
    assert.match(studentHub, /localStorage\.setItem\('cambridge_retake', '1'\)/);
});
