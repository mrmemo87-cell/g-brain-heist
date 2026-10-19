import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Pilot finding 2026-10-19: the overloaded access check could not be called through the Data API (PGRST203).
const migration=readFileSync('supabase/migrations/20261019170000_ielts_practice_access_unambiguous.sql','utf8');
test('the client calls the single unambiguous access check with a string id',()=>{
 const src=readFileSync('services/ieltsService.ts','utf8');
 assert.match(src,/supabase\.rpc\('rpc_ielts_practice_access', \{\s*p_skill: skill,\s*p_task_id: String\(taskId\),/);
 assert.doesNotMatch(src,/supabase\.rpc\('rpc_ielts_check_practice_access'/);
});
test('the entry point delegates to the existing text check and keeps its result',async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;
 create function public.rpc_ielts_check_practice_access(p_skill text,p_task_id text) returns table(allowed boolean,reason text,required_tier text) language sql as $$select p_task_id='32','checked:'||p_skill||':'||p_task_id,'free'::text$$;
 create function public.rpc_ielts_check_practice_access(p_skill text,p_task_id integer) returns table(allowed boolean,reason text,required_tier text) language sql as $$select * from public.rpc_ielts_check_practice_access(p_skill,p_task_id::text)$$;`);
 await db.exec(migration);
 const r=(await db.query("select * from public.rpc_ielts_practice_access('listening','32')")).rows[0];
 assert.deepEqual(r,{allowed:true,reason:'checked:listening:32',required_tier:'free'});
 assert.equal((await db.query("select has_function_privilege('anon','public.rpc_ielts_practice_access(text,text)','execute') a")).rows[0].a,false);
 await db.close();
});
