import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSchoolHeadSnapshot } from '../services/schoolHeadService.js';

const read = (filePath: string) => fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8');
const migration = read('supabase/migrations/20260808170000_school_head_executive_governance.sql');
const app = read('App.tsx');
const portal = read('components/SchoolHeadPortal.tsx');
const service = read('services/schoolHeadService.ts');

test('School Head remains a compatibility-safe protected owner persona', () => {
  assert.match(migration, /account_type[\s\S]*school_head/i);
  assert.match(migration, /role_in_school\s*=\s*'school_admin'/i);
  assert.match(migration, /if p_school_id is null or not public\.is_school_owner\(p_school_id\)/i);
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/i);
});

test('executive data and governance RPCs are fail-closed and not anonymous', () => {
  assert.match(migration, /create or replace function public\.school_head_get_executive_snapshot/i);
  assert.match(migration, /security definer[\s\S]*set search_path = public/i);
  assert.match(migration, /revoke all on function public\.school_head_get_executive_snapshot\(uuid, integer\) from public, anon/i);
  assert.match(migration, /revoke all on function public\.school_head_list_governance_audit\(uuid, integer, timestamptz\) from public, anon/i);
  assert.match(migration, /revoke all on public\.school_governance_audit_log from public, anon, authenticated/i);
  assert.match(migration, /create policy school_heads_read_governance_audit[\s\S]*public\.is_school_owner\(school_id\)/i);
});

test('ownership transfer requires current ownership, eligible admin, confirmation and reason', () => {
  assert.match(migration, /only the current School Head can transfer ownership/i);
  assert.match(migration, /p_new_head_user_id = v_actor/i);
  assert.match(migration, /char_length\(trim\(coalesce\(p_reason, ''\)\)\) < 12/i);
  assert.match(migration, /p_confirmation_text[\s\S]*v_school_name/i);
  assert.match(migration, /v_target\.role_in_school <> 'school_admin'/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /school_head_transferred/i);
});

test('App routes protected owners to the executive portal and keeps gameplay unavailable', () => {
  assert.match(app, /lazyRetry\(\(\) => import\('\.\/components\/SchoolHeadPortal'\)/);
  assert.match(app, /schoolCapabilities\?\.is_owner && schoolCapabilities\.account_type === 'school_head'/);
  assert.match(app, /case 'school_head'/);
  assert.match(app, /allowedSchoolAdminViews\.push\('school_head'\)/);
  assert.match(app, /isSchoolHeadRole \? 'school_head' : 'school_admin'/);
  assert.match(app, /requested === 'teacher' && capabilities\.can_teach && capabilities\.has_active_teaching_assignment \? 'teacher' : 'school_head'/);
});

test('executive portal includes every governance area and protected transfer UI', () => {
  for (const label of [
    'Executive Overview', 'Decision Center', 'Academic Performance', 'People & Structure',
    'Programs', 'Subscription & Value', 'Governance & Audit',
  ]) assert.match(portal, new RegExp(label.replace(/[&]/g, '&amp;|&'), 'i'));
  assert.match(portal, /data-testid="school-head-portal"/);
  assert.match(portal, /Transfer School Head ownership/);
  assert.match(portal, /transferConfirmation\.trim\(\) !== snapshot\.school\.name/);
  assert.match(portal, /Operational Administration/);
});

test('snapshot normalizer rejects non-head and malformed payloads', () => {
  assert.equal(normalizeSchoolHeadSnapshot(null), null);
  assert.equal(normalizeSchoolHeadSnapshot({ success: true, account_type: 'school_admin' }), null);
  assert.equal(normalizeSchoolHeadSnapshot({ success: true, account_type: 'school_head', school: {} }), null);
});

test('snapshot normalizer accepts a valid school-scoped executive response', () => {
  const snapshot = normalizeSchoolHeadSnapshot({
    success: true,
    account_type: 'school_head',
    school: { id: 'school-1', name: 'Northbridge School', logo_url: null, status: 'active' },
    head: { user_id: 'head-1', name: 'Principal One', email: 'head@example.invalid' },
    period: { days: 30, start: '2026-07-09T00:00:00Z', end: '2026-08-08T00:00:00Z' },
    totals: { students: 100, teachers: 10, admins: 2, classes: 5, subjects: 6 },
    engagement: { active_students_7d: 75, active_students_30d: 90, inactive_students_14d: 10, active_teachers_7d: 9 },
    structure: { placed_students: 98, covered_classes: 5, assigned_teachers: 9 },
    academics: { average: 76.5, previous_average: 73, assignment_total: 120, assignment_completed: 96, completion_rate: 80, grade_performance: [] },
    admissions: { total_candidates: 12, pending_candidates: 3, completed_attempts: 9, average: 74 },
    programs: { cambridge_attempts: 45, writing_students: 60, ielts_students: 8, admission_candidates: 12 },
    subscription: { plan: 'pro', status: 'active', seats_used: 100, seat_limit: 150 },
    decisions: [{ id: 'unplaced_students', severity: 'critical', count: 2, title: 'Students need placement', description: 'Two students need a class.', action: 'Open people', destination: 'people' }],
    generated_at: '2026-08-08T00:00:00Z',
  });

  assert.ok(snapshot);
  assert.equal(snapshot.school.id, 'school-1');
  assert.equal(snapshot.account_type, 'school_head');
  assert.equal(snapshot.totals.students, 100);
  assert.equal(snapshot.decisions[0]?.destination, 'people');
  assert.equal(snapshot.subscription.cancel_at_period_end, false);
});

test('service uses RPC-only executive data paths', () => {
  assert.match(service, /rpc\('school_head_get_executive_snapshot'/);
  assert.match(service, /rpc\('school_head_list_governance_audit'/);
  assert.match(service, /rpc\('school_head_transfer_ownership'/);
  assert.doesNotMatch(service, /\.from\('(?:users|school_members|billing_subscriptions|quiz_scores)'\)/);
});
