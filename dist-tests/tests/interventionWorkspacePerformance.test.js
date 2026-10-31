import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const fence = readFileSync('supabase/migrations/20261030030000_fence_intervention_intelligence_question_lookup.sql', 'utf8');
const cache = readFileSync('supabase/migrations/20261030040000_cache_learning_focus_question_availability.sql', 'utf8');
// Regression contract for the 2026-10-30 "could not connect" incident: the support-cycle RPC
// exceeded the API statement timeout for students with many focus areas.
test('verified-question lookup is fenced so Postgres evaluates it once per focus', () => {
    assert.match(fence, /\) as payload\n\s+offset 0\n\s+\) question_set/);
});
test('verified-question availability is cached with explicit freshness guards', () => {
    assert.match(cache, /create table if not exists private\.learning_focus_question_cache/i);
    assert.match(cache, /primary key \(student_id, skill_key, evidence_focus_code, subject\)/i);
    assert.match(cache, /enable row level security/i);
    assert.match(cache, /revoke all on table private\.learning_focus_question_cache from public, anon, authenticated/i);
    // Invalidates on any question-bank change, student context change, or after 6 hours.
    assert.match(cache, /function private\.verified_question_bank_version\(\)/i);
    assert.match(cache, /c\.bank_version = v_version/);
    assert.match(cache, /c\.context_key = coalesce\(v_context, ''\)/);
    assert.match(cache, /c\.computed_at > now\(\) - interval '6 hours'/);
    // Cache writes never break the read path.
    assert.match(cache, /exception when others then/i);
    // The intelligence function reads through the cache, and the RPC runs READ WRITE under PostgREST.
    assert.match(cache, /select private\.verified_questions_for_learning_focus_cached\(/);
    assert.match(cache, /VOLATILE SECURITY DEFINER/);
    assert.match(cache, /rpc_teacher_student_intervention_workspace_v2/);
});
test('cached wrapper is not callable directly by API roles', () => {
    assert.match(cache, /revoke all on function private\.verified_questions_for_learning_focus_cached\([^)]*\)\s+from public, anon, authenticated/i);
    assert.match(cache, /revoke all on function private\.verified_question_bank_version\(\) from public, anon, authenticated/i);
});
