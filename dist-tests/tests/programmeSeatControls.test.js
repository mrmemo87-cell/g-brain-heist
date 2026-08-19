import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260813120000_programme_student_seat_controls.sql', 'utf8');
const manager = readFileSync('components/school-admin/ProgrammeSeatManager.tsx', 'utf8');
test('partial programme coverage uses named seats and fails closed for students', () => {
    assert.match(migration, /school_programme_seat_assignments/);
    assert.match(migration, /private\.student_has_programme_seat/);
    assert.match(migration, /sm\.role_in_school <> 'student'/);
    assert.match(migration, /private\.student_has_programme_seat\(p_school_id,p_module_key,sm\.user_id\)/);
    assert.match(migration, /where released_at is null/);
});
test('seat changes are serialized and cannot exceed purchased capacity', () => {
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /if v_used>=v_limit/);
    assert.match(migration, /No programme seats are available/);
    assert.match(migration, /school_head_or_platform_administrator_required/);
});
test('anti-rotation protocol preserves corrections, transfers, cooldowns and audit events', () => {
    assert.match(migration, /interval '24 hours'/);
    assert.match(migration, /private\.student_has_programme_usage/);
    assert.match(migration, /ceil\(coalesce\(v_limit,0\)\*0\.10\)/);
    assert.match(migration, /interval '7 days'/);
    assert.match(migration, /school_programme_seat_events/);
    assert.match(migration, /billing_period_start/);
    assert.match(migration, /left_school/);
    assert.match(migration, /released_at is null or cooldown_until>now\(\)/);
});
test('school admin UI explains capacity and previews release consequences', () => {
    assert.match(manager, /Named-seat command centre/);
    assert.match(manager, /transfers/);
    assert.match(manager, /Release this seat/);
    assert.match(manager, /Protected transfer/);
    assert.match(manager, /Allocate seat/);
    assert.match(manager, /Confirm release/);
});
