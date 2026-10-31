import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20261028023209_question_bible_copyright_visuals_ai_recheck.sql', 'utf8');
const service = readFileSync('services/adminQuestionBankService.ts', 'utf8');
const queue = readFileSync('components/admin/tabs/AiRecheckQueue.tsx', 'utf8');
const inspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');
test('AI recheck RPCs are superadmin-only and the decision log is append-only', () => {
    for (const fn of ['rpc_superadmin_ai_recheck_queue', 'rpc_superadmin_ai_recheck_decide']) {
        assert.match(migration, new RegExp(`create or replace function public\\.${fn}[\\s\\S]+?security definer set search_path to ''`, 'i'));
    }
    assert.match(migration, /not public\.is_superadmin\(v_actor\)/i);
    assert.match(migration, /platform_superadmin_access_required/);
    assert.match(migration, /retire_requires_reason_of_10_characters/);
    assert.match(migration, /question_recheck_events_are_append_only/);
    assert.match(migration, /revoke all on function public\.rpc_superadmin_ai_recheck_decide\(uuid,text,text\) from public, anon/i);
});
test('pending AI questions stay out of both evidence ledgers', () => {
    assert.match(migration, /materialize_verified_assignment_item_evidence/);
    assert.match(migration, /materialize_verified_assignment_registry_evidence/);
    assert.match(migration, /recheck_status <> ''pending''/);
});
test('the browser goes through the governed RPCs only', () => {
    assert.match(service, /supabase\.rpc\('rpc_superadmin_ai_recheck_queue'/);
    assert.match(service, /supabase\.rpc\('rpc_superadmin_ai_recheck_decide'/);
    assert.doesNotMatch(service, /\.from\(['"]question_recheck_events['"]\)/);
    assert.doesNotMatch(queue, /supabase\.(rpc|from)/);
});
test('the queue shows the key, the visual and requires a reason to retire', () => {
    assert.match(queue, /is-key/);
    assert.match(queue, /image_alt_text/);
    assert.match(queue, /draft\.action === 'retire' && draft\.notes\.trim\(\)\.length < 10/);
    assert.match(inspector, /setWorkspace\('ai-recheck'\)/);
    assert.match(inspector, /<AiRecheckQueue onOpenVault=/);
});
