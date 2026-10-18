import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261019060000_ielts_practice_construct_mapping.sql','utf8');
test('AI proposals are stored as proposed; the migration never approves a mapping',()=>{
 assert.doesNotMatch(sql.split('-- 4. AI-proposed')[1],/'approved'/);
 assert.match(sql,/status text not null default 'proposed'/);
 assert.match(sql,/proposed_by[\s\S]*Claude \(AI assistant\)/);
});
test('decisions need a content administrator, the exact batch version, a minimum sample and notes',()=>{
 const decide=sql.slice(sql.indexOf('rpc_ielts_construct_mapping_decide('),sql.indexOf('revoke all on function public.rpc_ielts_construct_mapping_queue'));
 assert.match(decide,/perform private\.ielts_mapping_admin\(\)/);
 assert.match(decide,/p_sha256 is distinct from private\.ielts_mapping_batch_sha\(p_batch\)/);
 assert.match(decide,/greatest\(3,ceil\(0\.2\*total\)::int\)/);
 assert.match(decide,/notes_required/);
 assert.match(decide,/reviewer_id=auth\.uid\(\)/);
 assert.match(sql,/role in \('superadmin','admin'\)/);
});
test('RPCs are not executable by anonymous users and private helpers are not exposed',()=>{
 assert.match(sql,/revoke all on function public\.rpc_ielts_construct_mapping_decide\([^)]*\) from public, anon/);
 assert.match(sql,/revoke all on function private\.ielts_material_constructs\(text,text\) from public, anon, authenticated/);
 assert.match(sql,/expected 113 proposed mappings/);
});
