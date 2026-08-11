import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveIeltsExtraPracticeAccess, updateIeltsExtraPracticeAccess, } from '../services/ieltsExtraPracticeAccessService.js';
const migrationPath = 'supabase/migrations/20260804153000_ielts_extra_practice_authority.sql';
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
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
const fakeClient = (handler) => ({ rpc: handler });
test('read service consumes only the authoritative RPC and maps a valid state', async () => {
    const calls = [];
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
    const calls = [];
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
    const scenarios = [
        { name: 'rpc error', data: null, error: { message: 'network unavailable' }, reason: 'rpc_error' },
        { name: 'forbidden denial', data: null, error: { message: 'forbidden' }, reason: 'forbidden', expectedError: 'forbidden' },
        { name: 'missing school denial', data: null, error: { message: 'RPC failed: school_not_found' }, reason: 'school_not_found', expectedError: 'RPC failed: school_not_found' },
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
            if (scenario.expectedError)
                assert.equal(result.error, scenario.expectedError);
        });
    }
});
test('thrown Extra Practice denial markers remain available to settings error presentation', async () => {
    const client = fakeClient(async () => {
        throw new Error('enabled_value_required');
    });
    const result = await updateIeltsExtraPracticeAccess(true, client);
    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'enabled_value_required');
    assert.equal(result.error, 'enabled_value_required');
    const settings = read('components/school-admin/tabs/IeltsSettingsTab.tsx');
    assert.match(settings, /result\.error \|\| result\.reason/, 'settings must present the server denial before a generic reason');
    assert.match(settings, /access\.error \|\| access\.reason/, 'initial settings verification must preserve a specific server failure');
});
test('migration makes the school setting the fail-closed backend authority', () => {
    const sql = read(migrationPath);
    const context = sql.slice(sql.indexOf('create or replace function private.ielts_extra_practice_access_context()'), sql.indexOf('create or replace function private.ielts_content_is_assigned_to_current_user'));
    const updateRpc = sql.slice(sql.indexOf('create or replace function public.rpc_ielts_update_extra_practice_access'), sql.indexOf('create or replace function public.rpc_ielts_check_practice_access'));
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
    assert.match(sql, /if private\.ielts_content_is_assigned_to_current_user[\s\S]*return true;[\s\S]*v_context->>'enabled'/i, 'assignment must bypass both school toggle and Prime checks');
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
    assert.match(sql, /create policy ielts_reading_questions_extra_practice_gate[\s\S]*exists\s*\([\s\S]*from public\.ielts_reading_sets/i, 'reading questions must inherit the authoritative parent-set RLS decision');
    assert.match(sql, /create policy ielts_listening_questions_extra_practice_gate[\s\S]*exists\s*\([\s\S]*from public\.ielts_listening_sets/i, 'listening questions must inherit the authoritative parent-set RLS decision');
    for (const attempt of ['reading', 'listening', 'writing', 'speaking']) {
        assert.match(sql, new RegExp(`create policy ielts_${attempt}_attempts_extra_practice_insert_gate[\\s\\S]*?as restrictive`, 'i'));
        assert.doesNotMatch(sql, new RegExp(`create policy ielts_${attempt}_attempts_extra_practice_update_gate`, 'i'), 'an access-toggle transition must not strand an already-created attempt');
        assert.match(sql, new RegExp(`create trigger trg_ielts_${attempt}_attempt_identity[\\s\\S]*?before update`, 'i'));
    }
    for (const [attempt, content] of [
        ['reading', 'reading_sets'],
        ['listening', 'listening_sets'],
        ['writing', 'writing_tasks'],
        ['speaking', 'speaking_tasks'],
    ]) {
        assert.match(sql, new RegExp(`create policy ielts_${attempt}_attempts_extra_practice_insert_gate[\\s\\S]*?exists\\s*\\([\\s\\S]*?from public\\.ielts_${content}`, 'i'), `${attempt} attempts must inherit the content row's complete RLS gate`);
    }
    assert.match(sql, /create or replace function private\.ielts_enforce_attempt_identity\(\)[\s\S]*to_jsonb\(new\)->'user_id'[\s\S]*to_jsonb\(new\)->v_content_key[\s\S]*attempt_identity_immutable/i, 'existing attempts must keep immutable user and content identity');
    assert.match(sql, /rpc_ielts_practice_content_catalog\([\s\S]*security invoker/i, 'assignment catalogue must no longer bypass RLS');
});
test('RLS resolves caller context through a statement InitPlan and catalog publication fails closed', () => {
    const sql = read(migrationPath);
    const accessHelper = sql.slice(sql.indexOf('create or replace function private.ielts_can_access_practice_content'), sql.indexOf('revoke all on schema private'));
    const catalog = sql.slice(sql.indexOf('create or replace function public.rpc_ielts_practice_content_catalog'), sql.indexOf('revoke all on function public.rpc_ielts_practice_content_catalog'));
    assert.match(accessHelper, /p_is_active boolean,[\s\S]*p_required_tier text,[\s\S]*p_access_context jsonb/i);
    assert.match(accessHelper, /v_context\s*:=\s*coalesce\([\s\S]*p_access_context,[\s\S]*private\.ielts_extra_practice_access_context\(\)/i);
    assert.ok((sql.match(/\(select private\.ielts_extra_practice_access_context\(\)\)/gi) ?? []).length >= 4, 'each root content policy should use one uncorrelated context InitPlan');
    assert.doesNotMatch(accessHelper, /from public\.ielts_(reading_sets|listening_sets|writing_tasks|speaking_tasks)/i, 'a caller-supplied context must never be usable as a protected-content existence oracle');
    assert.match(sql, /v_context\s*:=\s*private\.ielts_extra_practice_access_context\(\);[\s\S]*private\.ielts_can_access_practice_content\([\s\S]*v_context[\s\S]*\) then/i, 'the point-access RPC should resolve and reuse the same caller context');
    assert.match(sql, /revoke all on function private\.ielts_can_access_practice_content\(text, text, boolean, text, jsonb\)/i);
    for (const alias of ['r', 'l', 'w', 's']) {
        assert.match(catalog, new RegExp(`where ${alias}\\.is_active is true`, 'i'));
    }
    assert.doesNotMatch(catalog, /coalesce\([^\n]*\.is_active,\s*true\)/i, 'NULL publication state must never be treated as active');
});
test('Extra Practice psql harness is staging-only and finitely bounded', () => {
    const sqlHarness = read('supabase/tests/ielts_extra_practice_authority.sql');
    const nodeHarness = read('tests/ieltsExtraPracticeRlsIntegration.test.ts');
    assert.match(sqlHarness, /only against a disposable\/staging database/i);
    assert.match(sqlHarness, /never point the wrapper at production/i);
    assert.match(nodeHarness, /timeout:\s*120_000/);
    assert.match(nodeHarness, /PGCONNECT_TIMEOUT:\s*'10'/);
});
test('RPC and school-table privileges are explicit and least-privilege', () => {
    const sql = read(migrationPath);
    const service = read('services/ieltsExtraPracticeAccessService.ts');
    assert.match(sql, /revoke all on function public\.rpc_ielts_extra_practice_access\(\) from public, anon, authenticated, service_role;/i);
    assert.match(sql, /grant execute on function public\.rpc_ielts_extra_practice_access\(\) to authenticated;/i);
    assert.match(sql, /revoke all on table public\.schools from public, anon, authenticated;[\s\S]*grant select on table public\.schools to authenticated;[\s\S]*grant all on table public\.schools to service_role;/i);
    assert.match(sql, /revoke all on table[\s\S]*public\.ielts_reading_sets,[\s\S]*public\.ielts_speaking_tasks[\s\S]*from public, anon, authenticated;[\s\S]*grant select on table[\s\S]*to authenticated;/i, 'content tables must expose only SELECT to authenticated callers');
    assert.match(sql, /revoke all on table[\s\S]*public\.ielts_reading_attempts,[\s\S]*public\.ielts_speaking_attempts[\s\S]*from public, anon, authenticated;[\s\S]*grant select, insert, update on table[\s\S]*to authenticated;/i, 'attempt tables must expose only the operations used by owned-attempt flows');
    assert.match(sql, /grant all on table[\s\S]*public\.ielts_reading_sets,[\s\S]*public\.ielts_speaking_tasks[\s\S]*to service_role;/i);
    assert.match(sql, /grant all on table[\s\S]*public\.ielts_reading_attempts,[\s\S]*public\.ielts_speaking_attempts[\s\S]*to service_role;/i, 'server-only service access must remain explicit for new-project grant defaults');
    assert.match(sql, /drop policy if exists "Anyone can view active schools" on public\.schools;/i);
    assert.match(sql, /create policy schools_select[\s\S]*for select to authenticated[\s\S]*sm\.user_id = \(select auth\.uid\(\)\)/i);
    assert.match(sql, /create policy schools_authenticated_membership_gate[\s\S]*as restrictive[\s\S]*for select to authenticated/i);
    assert.doesNotMatch(sql, /create policy schools_select[\s\S]{0,250}status = 'active'\s+or/i);
    assert.match(sql, /create or replace function public\.get_available_schools\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i);
    assert.match(service, /rpc_ielts_extra_practice_access/);
    assert.match(service, /rpc_ielts_update_extra_practice_access/);
    assert.doesNotMatch(service, /\.from\(['"](?:users|schools)['"]\)/, 'client must not recreate the backend authority from directly-readable rows');
});
