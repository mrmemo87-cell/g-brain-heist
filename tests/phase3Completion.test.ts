import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const authority = read('supabase/migrations/20260808143000_phase3_user_authority_guard.sql');
const placement = read('supabase/migrations/20260808150000_complete_phase3_student_placement_integrity.sql');
const provenance = read('supabase/migrations/20260808153000_phase3_historical_class_provenance.sql');
const service = read('services/schoolAdminService.ts');
const portal = read('components/SchoolAdminPortal.tsx');
const roster = read('components/ClassRoster.tsx');
const queue = read('components/school-admin/PlacementExceptionQueue.tsx');

test('authority mirrors are derived and hostile signup metadata cannot create administrators', () => {
  assert.match(authority, /create or replace function public\.is_superadmin[\s\S]*from public\.superadmins/i);
  assert.doesNotMatch(authority.match(/create or replace function public\.is_superadmin[\s\S]*?\$\$;/i)?.[0] ?? '', /users[\s\S]*is_admin/i);
  assert.match(authority, /v_role not in \('student', 'teacher'\)/i);
  assert.match(authority, /before update of school_id, role, is_admin, needs_setup/i);
  assert.match(authority, /revoke insert, update, delete, truncate on public\.school_members from public, anon, authenticated/i);
  assert.doesNotMatch(authority, /set_config\s*\(/i);
});

test('placement history is effective-dated, immutable, tenant-scoped, and non-destructive', () => {
  assert.match(placement, /create table if not exists public\.school_student_placement_history/i);
  assert.match(placement, /effective_date date not null/i);
  assert.match(placement, /trg_phase3_history_immutable/i);
  assert.match(placement, /school_student_placement_history_event_check[\s\S]*not valid/i);
  assert.match(placement, /public\.can_administer_school\(school_id\)/i);
  assert.doesNotMatch(placement, /delete from public\.class_students[\s\S]*migration_reconciliation/i);
});

test('legacy reconciliations and live anomalies enter an idempotent review queue', () => {
  assert.match(placement, /legacy_multiple_class_reconciliation/i);
  assert.match(placement, /legacy_profile_reconciliation/i);
  assert.match(placement, /school_student_placement_one_open_exception_idx/i);
  assert.match(placement, /inactive_or_ambiguous_student_membership/i);
  assert.match(placement, /profile_class_mismatch/i);
  assert.match(placement, /rpc_school_admin_refresh_placement_exceptions/i);
});

test('reviewed placement writes require reason, date, optimistic concurrency, and canonical membership', () => {
  const transfer = placement.match(/create or replace function public\.rpc_school_admin_transfer_student_placement[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.match(transfer, /length\(trim\(coalesce\(p_reason/i);
  assert.match(transfer, /p_effective_date is null/i);
  assert.match(transfer, /v_current is distinct from p_expected_from_class_id/i);
  assert.match(transfer, /sm\.status='active' and sm\.role_in_school='student'/i);
  assert.match(transfer, /insert into public\.school_student_placement_history/i);
  assert.match(placement, /reviewed_placement_workflow_required/i);
  assert.match(placement, /revoke all on public\.class_students from public, anon, authenticated/i);
});

test('admin UI exposes the queue and routes placement through reviewed RPCs', () => {
  assert.match(service, /rpc_school_admin_transfer_student_placement/);
  assert.match(service, /rpc_school_admin_bulk_transfer_student_placements/);
  assert.match(service, /rpc_school_admin_list_placement_exceptions/);
  assert.match(portal, /transferStudentPlacement/);
  assert.match(portal, /Effective date \(YYYY-MM-DD\)/);
  assert.match(roster, /<PlacementExceptionQueue/);
  assert.match(queue, /Confirm current class/);
  assert.match(queue, /Confirm unassignment/);
  assert.match(queue, /Recent history/);
});

test('assignment and Cambridge reports keep historical and current classes distinct', () => {
  assert.match(provenance, /historical_batch text/);
  assert.match(provenance, /sa\.batch,[\s\S]*sa\.batch/i);
  assert.match(provenance, /historical_class_snapshot text/);
  assert.match(provenance, /qs\.student_class,[\s\S]*qs\.student_class/i);
  assert.match(provenance, /current_placement_ambiguous boolean/i);
  assert.match(provenance, /sm\.status='active'/i);
});
