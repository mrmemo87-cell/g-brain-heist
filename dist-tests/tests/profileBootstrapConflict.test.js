import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration = readFileSync('supabase/migrations/20260623120000_fix_profile_bootstrap_email_idempotency.sql', 'utf8');
const authService = readFileSync('services/authService.ts', 'utf8');
const inspectionSql = readFileSync('supabase/inspection/profile_bootstrap_conflict_queries.sql', 'utf8');
test('existing current auth.uid user is updated in place before same-email repair', () => {
    assert.match(migration, /SELECT \* INTO v_profile FROM public\.users WHERE id = v_uid FOR UPDATE/);
    assert.match(migration, /UPDATE public\.users[\s\S]*WHERE id = v_uid[\s\S]*school_id = coalesce\(p_school_id, public\.users\.school_id\)/);
    assert.match(migration, /RETURN jsonb_build_object\('success', true, 'user_id', v_profile\.id/);
});
test('orphan same-email profile with dependencies returns handled conflict instead of updating users.id', () => {
    assert.match(migration, /pg_constraint[\s\S]*confrelid = 'public\.users'::regclass[\s\S]*contype = 'f'/);
    assert.match(migration, /EXECUTE format\([\s\S]*SELECT EXISTS[\s\S]*USING v_email_profile\.id/);
    assert.match(migration, /IF v_has_fk_dependencies THEN[\s\S]*attempts and results are safe[\s\S]*account_profile_conflict/);
    assert.match(migration, /IF v_has_fk_dependencies THEN[\s\S]*RETURN jsonb_build_object[\s\S]*END IF;[\s\S]*UPDATE public\.users[\s\S]*SET id = v_uid/);
});
test('UI-facing auth service maps object RPC payloads to readable strings', () => {
    assert.match(authService, /const getReadableRpcError = \(value: unknown/);
    assert.match(authService, /typeof value === 'object'[\s\S]*for \(const key of \['error', 'message', 'details', 'hint'\]/);
    assert.doesNotMatch(authService, /setError\([^)]*\|\|[^)]*\) as any/);
});
test('inspection SQL includes orphan rows, FK dependencies, and same-email conflicts', () => {
    assert.match(inspectionSql, /LEFT JOIN auth\.users au ON au\.id = u\.id[\s\S]*WHERE au\.id IS NULL/);
    assert.match(inspectionSql, /NULL::uuid AS user_id/);
    assert.match(inspectionSql, /pg_constraint[\s\S]*confrelid = 'public\.users'::regclass/);
    assert.doesNotMatch(inspectionSql, /:user_id|:email/);
    assert.match(inspectionSql, /WHERE params\.email IS NOT NULL[\s\S]*lower\(u\.email\) = lower\(params\.email\)/);
});
