import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Diagnostic Bible 2.4.0 section 10.9: teacher-only highlights on the Writing starting-point AI draft (prompt v2).
const db=new PGlite();
const essay='Nowadays many peoples is using phones. However, a relevant example helps.';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
create table private.ielts_writing_ai_drafts(id uuid primary key,state text,prompt_version text,source_context jsonb,fields jsonb,provider_response_id text,completed_at timestamptz);`);
const sql=readFileSync('supabase/migrations/20261114141000_ielts_writing_screener_draft_highlights.sql','utf8');
// Only the finish function: the claim function needs the full screener schema (covered by the governed-evidence suite).
await db.exec(sql.slice(sql.indexOf('create or replace function public.rpc_ielts_finish_writing_ai_draft'), sql.indexOf('revoke all on function public.rpc_ielts_claim_writing_ai_draft')));
const at=(q)=>{const s=Array.from(essay.slice(0,essay.indexOf(q))).length;return{start_char:s,end_char:s+Array.from(q).length};};
const quote='a relevant example helps.';
const base=()=>({observations:Object.fromEntries(['task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy'].map(k=>[k,{status:'developing',comment:'Add a clear example to explain your reason.',evidence:[{quote,...at(quote)}]}])),next_step:'Add one example. Check that it supports your reason.',delivery_comment:''});
let n=0;
const draft=async(version)=>{const id=`00000000-0000-0000-0000-${String(++n).padStart(12,'0')}`;await db.query("insert into private.ielts_writing_ai_drafts values($1,'pending',$2,$3::jsonb,null,null,null)",[id,version,JSON.stringify({response_text:essay,response_state:'answered',incident_count:0})]);return id;};
const finish=(id,f)=>db.query('select public.rpc_ielts_finish_writing_ai_draft($1,$2::jsonb,$3)',[id,JSON.stringify(f),'p']);
test('v2 drafts may carry exact-offset highlights; v1 drafts and invented highlights are rejected',async()=>{
 const hl={criterion:'grammar_range_accuracy',kind:'fix',quote:'peoples is',note:'Use the plural verb.',correction:'people are',...at('peoples is')};
 const ok=await draft('bh-ielts-task2-simple-feedback-v2');await finish(ok,{...base(),highlights:[hl]});
 assert.equal((await db.query('select state,fields from private.ielts_writing_ai_drafts where id=$1',[ok])).rows[0].fields.highlights.length,1);
 const plain=await draft('bh-ielts-task2-simple-feedback-v2');await finish(plain,base());
 const v1=await draft('bh-ielts-task2-simple-feedback-v1');await assert.rejects(finish(v1,{...base(),highlights:[]}),/ai_draft_invalid/);
 const moved=await draft('bh-ielts-task2-simple-feedback-v2');await assert.rejects(finish(moved,{...base(),highlights:[{...hl,start_char:hl.start_char+1,end_char:hl.end_char+1}]}),/ai_highlight_invalid/);
 const speak=await draft('bh-ielts-task2-simple-feedback-v2');await assert.rejects(finish(speak,{...base(),highlights:[{...hl,criterion:'fluency_coherence'}]}),/ai_highlight_invalid/);
});
