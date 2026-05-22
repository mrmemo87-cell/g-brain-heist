import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
test('listening content manager UI exposes create/edit controls', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsContentManager.tsx'), 'utf8');
    assert.match(src, /New Listening Task/);
    assert.match(src, /rpc_ielts_content_upsert_listening_set/);
    assert.match(src, /rpc_ielts_content_replace_listening_questions/);
    assert.match(src, /Edit/);
});
test('listening upsert RPC migration enforces role and active validations', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260521133000_ielts_listening_content_upsert_rpcs.sql'), 'utf8');
    assert.match(sql, /rpc_ielts_content_upsert_listening_set/);
    assert.match(sql, /rpc_ielts_content_replace_listening_questions/);
    assert.match(sql, /not in \('superadmin','admin','school_admin'\)/i);
    assert.match(sql, /active_requires_audio/);
    assert.match(sql, /active_requires_question/);
    assert.match(sql, /duplicate_question_order/);
    assert.match(sql, /placeholder_not_allowed/);
    assert.doesNotMatch(sql, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i);
});
test('reading content manager UI exposes create/edit controls', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsContentManager.tsx'), 'utf8');
    assert.match(src, /New Reading Task/);
    assert.match(src, /rpc_ielts_content_upsert_reading_set/);
    assert.match(src, /rpc_ielts_content_replace_reading_questions/);
});
test('reading upsert RPC migration enforces role and active validations', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260521143000_ielts_reading_content_upsert_rpcs.sql'), 'utf8');
    assert.match(sql, /not in \('superadmin','admin','school_admin'\)/i);
    assert.match(sql, /title_required/);
    assert.match(sql, /passage_text_required/);
    assert.match(sql, /active_requires_question/);
    assert.match(sql, /duplicate_question_order/);
    assert.match(sql, /correct_answer_required/);
});
test('writing content manager UI exposes create/edit controls', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsContentManager.tsx'), 'utf8');
    assert.match(src, /New Writing Task/);
    assert.match(src, /rpc_ielts_content_upsert_writing_task/);
});
test('writing upsert RPC migration enforces role and prompt validations', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260521153000_ielts_writing_content_upsert_rpc.sql'), 'utf8');
    assert.match(sql, /not in \('superadmin','admin','school_admin'\)/i);
    assert.match(sql, /title_required/);
    assert.match(sql, /prompt_required/);
    assert.match(sql, /prompt_placeholder_not_allowed/);
    assert.match(sql, /active_requires_prompt/);
});
test('speaking content manager UI exposes create/edit controls', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsContentManager.tsx'), 'utf8');
    assert.match(src, /New Speaking Task/);
    assert.match(src, /rpc_ielts_content_upsert_speaking_task/);
});
test('speaking upsert RPC migration enforces role and prompt validations', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260521163000_ielts_speaking_content_upsert_rpc.sql'), 'utf8');
    assert.match(sql, /not in \('superadmin','admin','school_admin'\)/i);
    assert.match(sql, /prompt_required/);
    assert.match(sql, /prompt_placeholder_not_allowed/);
    assert.match(sql, /active_requires_prompt/);
});
