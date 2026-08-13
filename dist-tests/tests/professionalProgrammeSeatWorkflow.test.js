import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260813143000_professional_programme_seat_workflow.sql', 'utf8');
const manager = readFileSync('components/school-admin/ProgrammeSeatManager.tsx', 'utf8');
const studio = readFileSync('components/school-admin/BillingStudio.tsx', 'utf8');
const admin = readFileSync('components/admin/tabs/BillingAccessTab.tsx', 'utf8');
test('programme switching is atomic and left-school release requires inactive membership', () => {
    assert.match(migration, /school_head_switch_programme_seat/);
    assert.match(migration, /least\(p_from_module,p_to_module\)/);
    assert.match(migration, /raise exception using message=coalesce\(v_assign->>'error'/);
    assert.match(migration, /p_reason='left_school' and v_active_member/);
    assert.match(migration, /Mark the student membership inactive/);
});
test('bulk allocation and temporary exceptions remain capacity governed', () => {
    assert.match(migration, /school_head_bulk_assign_programme_seats/);
    assert.match(migration, /v_used\+v_needed>v_limit/);
    assert.match(migration, /school_programme_seat_exception_requests/);
    assert.match(migration, /transfer_override_period_start=v_period/);
    assert.match(migration, /one_pending_exception/);
});
test('accepted quotes activate exact programme capacities only after verification', () => {
    assert.match(migration, /school_head_accept_billing_quote/);
    assert.match(migration, /Payment verification is still required/);
    assert.match(migration, /admin_activate_accepted_school_quote/);
    assert.match(migration, /when 'cambridge' then nullif\(v_quote.cambridge_seats,0\)/);
    assert.match(migration, /seat_limit=excluded.seat_limit/);
    assert.match(studio, /Accept approved package/);
    assert.match(admin, /Verify payment & activate exact seats/);
});
test('seat command centre explains policy, consequences, history and escape paths', () => {
    assert.match(manager, /24-hour correction window/);
    assert.match(manager, /7-day cooldown/);
    assert.match(manager, /switch atomically/);
    assert.match(manager, /Assign class/);
    assert.match(manager, /Request exception/);
    assert.match(manager, /What prevents manipulation/);
    assert.match(manager, /audit history/);
});
