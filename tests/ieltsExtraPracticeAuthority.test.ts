import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveIeltsExtraPracticeAccess,
  updateIeltsExtraPracticeAccess,
  type IeltsExtraPracticeRpcClient,
} from '../services/ieltsExtraPracticeAccessService.js';

const migrationPath = 'supabase/migrations/20260804153000_ielts_extra_practice_authority.sql';
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const readyPayload = {
  resolved: true,
  role: 'school_admin',
  is_admin: true,
  is_staff: true,
  can_manage: true,
  school_id: '11111111-1111-4111-8111-111111111111',
  enabled: false,
  reason: 'school_setting_disabled',
};

const fakeClient = (
  handler: (name: string, params?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string | null } | null;
  }>
): IeltsExtraPracticeRpcClient => ({ rpc: handler });

test('read service consumes only the authoritative RPC and maps a valid state', async () => {
  const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
  const client = fakeClient(async (name, params) => {
    calls.push({ name, params });
    return { data: readyPayload, error: null };
  });

  const result = await resolveIeltsExtraPracticeAccess(client);

  assert.deepEqual(calls, [{ name: 'rpc_ielts_extra_practice_access', params: undefined }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.enabled, false);
  assert.equal(result.isAdmin, true);
  assert.equal(result.canManage, true);
  assert.equal(result.schoolId, readyPayload.school_id);
});

test('update service sends only the typed boolean and trusts the returned server state', async () => {
  const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
  const client = fakeClient(async (name, params) => {
    calls.push({ name, params });
    return {
      data: { ...readyPayload, enabled: true, reason: 'school_setting_enabled' },
      error: null,
    };
  });

  const result = await updateIeltsExtraPracticeAccess(true, client);

  assert.deepEqual(calls, [{
    name: 'rpc_ielts_update_extra_practice_access',
    params: { p_enabled: true },
  }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.enabled, true);
});

test('RPC errors, unresolved contexts and malformed payloads fail closed', async (t) => {
  const scenarios: Array<{ name: string; data: unknown; error: { message: string } | null; reason: string }> = [
    { name: 'rpc error', data: null, error: { message: 'network unavailable' }, reason: 'rpc_error' },
    { name: 'malformed', data: { enabled: true }, error: null, reason: 'invalid_response' },
    {
      name: 'unresolved membership',
      data: {
        ...readyPayload,
        resolved: false,
        enabled: true,
        reason: 'ambiguous_school_membership',
      },
      error: null,
      reason: 'ambiguous_school_membership',
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const client = fakeClient(async () => ({ data: scenario.data, error: scenario.error }));
      const result = await resolveIeltsExtraPracticeAccess(client);
      assert.equal(result.status, 'error');
      assert.equal(result.enabled, false);
      assert.equal(result.isAdmin, false);
      assert.equal(result.isStaff, false);
      assert.equal(result.canManage, false);
      assert.equal(result.schoolId, null);
      assert.equal(result.reason, scenario.reason);
    });
  }
});

test('migration makes the school setting the fail-closed backend authority', () => {
  const sql = read(migrationPath);
  const context = sql.slice(
    sql.indexOf('create or replace function private.ielts_extra_practice_access_context()'),
    sql.indexOf('create or replace function private.ielts_content_is_assigned_to_current_user')
  );
  const updateRpc = sql.slice(
    sql.indexOf('create or replace function public.rpc_ielts_update_extra_practice_access'),
    sql.indexOf('create or replace function public.rpc_ielts_check_practice_access')
  );

  assert.match(context, /security definer[\s\S]*set search_path = ''/i);
  assert.match(context, /v_school_settings @> '\{"ielts_extra_practice_enabled": true\}'::jsonb/i);
  assert.match(context, /'enabled', false[\s\S]*'reason', 'profile_missing'/i);
  assert.match(context, /'reason', 'ambiguous_school_membership'/i);
  assert.match(context, /public\.ielts_users[\s\S]*'reason', case when v_is_platform_admin then 'platform_admin' else 'independent_user'/i);

  assert.doesNotMatch(updateRpc, /p_school_id/i, 'typed update must not trust a client school ID');
  assert.match(updateRpc, /'can_manage'/i);
  assert.match(updateRpc, /update public\.schools[\s\S]*jsonb_build_object\('ielts_extra_practice_enabled', p_enabled\)/i);
  assert.match(updateRpc, /errcode = '42501'/i);
});

test('assigned content, restrictive RLS and new-attempt writes share one predicate', () => {
  const sql = read(migrationPath);

  assert.match(sql, /a\.status = 'assigned'/i);
  assert.match(sql, /ast\.status in \('assigned', 'in_progress', 'completed', 'overdue'\)/i);
  assert.match(sql, /sm\.school_id = a\.school_id[\s\S]*sm\.status = 'active'/i);
  assert.match(sql, /if private\.ielts_content_is_assigned_to_current_user[\s\S]*return true;[\s\S]*v_context->>'enabled'/i,
    'assignment must bypass both school toggle and Prime checks');

  for (const policy of [
    'ielts_reading_sets_extra_practice_gate',
    'ielts_reading_questions_extra_practice_gate',
    'ielts_listening_sets_extra_practice_gate',
    'ielts_listening_questions_extra_practice_gate',
    'ielts_writing_tasks_extra_practice_gate',
    'ielts_speaking_tasks_extra_practice_gate',
  ]) {
    assert.match(sql, new RegExp(`create policy ${policy}[\\s\\S]*?as restrictive[\\s\\S]*?for select to authenticated`, 'i'));
  }

  for (const attempt of ['reading', 'listening', 'writing', 'speaking']) {
    assert.match(sql, new RegExp(`create policy ielts_${attempt}_attempts_extra_practice_insert_gate[\\s\\S]*?as restrictive`, 'i'));
    assert.doesNotMatch(sql, new RegExp(`create policy ielts_${attempt}_attempts_extra_practice_update_gate`, 'i'),
      'an access-toggle transition must not strand an already-created attempt');
    assert.match(sql, new RegExp(`create trigger trg_ielts_${attempt}_attempt_identity[\\s\\S]*?before update`, 'i'));
  }

  assert.match(sql, /create or replace function private\.ielts_enforce_attempt_identity\(\)[\s\S]*to_jsonb\(new\)->'user_id'[\s\S]*to_jsonb\(new\)->v_content_key[\s\S]*attempt_identity_immutable/i,
    'existing attempts must keep immutable user and content identity');

  assert.match(sql, /rpc_ielts_practice_content_catalog\([\s\S]*security invoker/i,
    'assignment catalogue must no longer bypass RLS');
});

test('RPC and school-table privileges are explicit and least-privilege', () => {
  const sql = read(migrationPath);
  const service = read('services/ieltsExtraPracticeAccessService.ts');

  assert.match(sql, /revoke all on function public\.rpc_ielts_extra_practice_access\(\) from public, anon, authenticated, service_role;/i);
  assert.match(sql, /grant execute on function public\.rpc_ielts_extra_practice_access\(\) to authenticated;/i);
  assert.match(sql, /revoke all on table public\.schools from public, anon, authenticated;[\s\S]*grant select on table public\.schools to authenticated;[\s\S]*grant all on table public\.schools to service_role;/i);
  assert.match(sql, /revoke all on table[\s\S]*public\.ielts_reading_sets,[\s\S]*public\.ielts_speaking_tasks[\s\S]*from public, anon, authenticated;[\s\S]*grant select on table[\s\S]*to authenticated;/i,
    'content tables must expose only SELECT to authenticated callers');
  assert.match(sql, /revoke all on table[\s\S]*public\.ielts_reading_attempts,[\s\S]*public\.ielts_speaking_attempts[\s\S]*from public, anon, authenticated;[\s\S]*grant select, insert, update on table[\s\S]*to authenticated;/i,
    'attempt tables must expose only the operations used by owned-attempt flows');
  assert.match(sql, /grant all on table[\s\S]*public\.ielts_reading_sets,[\s\S]*public\.ielts_speaking_tasks[\s\S]*to service_role;/i);
  assert.match(sql, /grant all on table[\s\S]*public\.ielts_reading_attempts,[\s\S]*public\.ielts_speaking_attempts[\s\S]*to service_role;/i,
    'server-only service access must remain explicit for new-project grant defaults');
  assert.match(sql, /drop policy if exists "Anyone can view active schools" on public\.schools;/i);
  assert.match(sql, /create policy schools_select[\s\S]*for select to authenticated[\s\S]*sm\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /create policy schools_authenticated_membership_gate[\s\S]*as restrictive[\s\S]*for select to authenticated/i);
  assert.doesNotMatch(sql, /create policy schools_select[\s\S]{0,250}status = 'active'\s+or/i);
  assert.match(sql, /create or replace function public\.get_available_schools\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i);

  assert.match(service, /rpc_ielts_extra_practice_access/);
  assert.match(service, /rpc_ielts_update_extra_practice_access/);
  assert.doesNotMatch(service, /\.from\(['"](?:users|schools)['"]\)/,
    'client must not recreate the backend authority from directly-readable rows');
});
