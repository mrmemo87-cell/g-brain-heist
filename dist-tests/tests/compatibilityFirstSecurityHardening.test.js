import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const migrationPath = 'supabase/migrations/20260802120000_compatibility_first_security_hardening.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const strictDefaultsSql = fs.readFileSync('supabase/migrations/20260802123000_strict_future_object_privileges.sql', 'utf8');
test('future Supabase objects require explicit Data API grants', () => {
    assert.match(sql, /alter default privileges for role postgres in schema public[\s\S]*revoke select, insert, update, delete on tables/i);
    assert.match(sql, /revoke execute on functions from public, anon, authenticated, service_role/i);
    assert.match(strictDefaultsSql, /revoke all privileges on tables from anon, authenticated, service_role/i);
    assert.match(strictDefaultsSql, /revoke all privileges on sequences from anon, authenticated, service_role/i);
    assert.match(strictDefaultsSql, /revoke all privileges on functions from public, anon, authenticated, service_role/i);
});
test('Cambridge catalogue is available only through scoped RPCs', () => {
    assert.match(sql, /alter table public\.cambridge_tests enable row level security/i);
    assert.match(sql, /revoke all on table public\.cambridge_tests from anon, authenticated/i);
});
test('school roster mutations verify the caller school and are not anonymous RPCs', () => {
    for (const functionName of [
        'auto_enroll_students_by_grade',
        'add_student_to_class',
        'remove_student_from_class',
        'move_student_between_classes',
        'bulk_add_students_to_class',
        'bulk_remove_students_from_class',
    ]) {
        const definition = sql.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`, 'i'))?.[0] ?? '';
        assert.match(definition, /public\._verify_school_staff\(/i, `${functionName} must verify school staff`);
        assert.match(sql, new RegExp(`revoke all on function public\\.${functionName}\\([\\s\\S]*?from public, anon`, 'i'));
        assert.match(sql, new RegExp(`grant execute on function public\\.${functionName}\\([\\s\\S]*?to authenticated`, 'i'));
    }
});
test('cross-school IDs cannot be used to move or bulk-clear student placement', () => {
    const move = sql.match(/create or replace function public\.move_student_between_classes[\s\S]*?\$\$;/i)?.[0] ?? '';
    const bulkRemove = sql.match(/create or replace function public\.bulk_remove_students_from_class[\s\S]*?\$\$;/i)?.[0] ?? '';
    assert.match(move, /u\.school_id = v_to_class\.school_id/i);
    assert.match(move, /v_from_school_id is distinct from v_to_class\.school_id/i);
    assert.match(bulkRemove, /returning student_id/i);
    assert.match(bulkRemove, /id = any\(v_removed_ids\)/i);
    assert.match(bulkRemove, /school_id = v_class_school_id/i);
});
test('AP regeneration is self-scoped and anonymous view reads are removed', () => {
    const regenerate = sql.match(/create or replace function public\.regenerate_user_ap[\s\S]*?\$\$;/i)?.[0] ?? '';
    assert.match(regenerate, /v_actor_id <> user_id_param/i);
    assert.match(regenerate, /not public\.is_superadmin\(v_actor_id\)/i);
    assert.match(sql, /revoke all on function public\.regenerate_user_ap\(uuid\) from public, anon/i);
    assert.match(sql, /'ielts_admin_recent_attempts'/i);
    assert.match(sql, /'student_cambridge_performance'/i);
    assert.match(sql, /revoke all on table public\.%I from anon/i);
});
