import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Diagnostic Bible 2.6.0 sections 10.9 and 10.11: screener draft v4 (criterion ranges, server-checked AI starting band,
// up to 60 highlights) and the teacher-set Writing starting point that the student sees after the review is shared.
const db=new PGlite();
const teacher='00000000-0000-0000-0000-000000000001',stu='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003';
const A='10000000-0000-0000-0000-000000000001',BLANK='10000000-0000-0000-0000-000000000002';
const essay='Nowadays many peoples is using phones. However, a relevant example helps.';
const sha='a'.repeat(64);
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,is_banned boolean);
insert into public.users values('${teacher}',false),('${stu}',false),('${other}',false);
create function private.can_review_ielts_writing_screener(a uuid) returns boolean language sql stable as $$select auth.uid()='${teacher}'::uuid$$;
create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid primary key,student_id uuid,form_snapshot jsonb);
create table private.ielts_writing_screener_submissions(attempt_id uuid primary key,response_text text,response_state text,response_sha256 text,word_count int,evidence_kind text,submitted_at timestamptz default now(),rubric_snapshot jsonb);
create table private.ielts_writing_screener_reviews(id uuid primary key,attempt_id uuid references private.ielts_writing_screener_submissions(attempt_id),run_version int,criterion_observations jsonb,next_step text,delivery_comment text,reviewed_at timestamptz default now());
create table private.ielts_writing_screener_revisions(id uuid primary key,attempt_id uuid,response_text text,created_at timestamptz,source_review_id uuid);
create table public.ielts_exam_incidents(attempt_id uuid);
create table private.ielts_writing_ai_drafts(id uuid primary key,attempt_id uuid,requested_by uuid,response_sha256 text,state text default 'pending',prompt_version text,model text,source_context jsonb,fields jsonb,provider_response_id text,created_at timestamptz default now(),completed_at timestamptz);
insert into private.ielts_diagnostic_attempt_evidence values('${A}','${stu}','{"items":[{"prompt":"Discuss."}]}'),('${BLANK}','${stu}','{"items":[{"prompt":"Discuss."}]}');
insert into private.ielts_writing_screener_submissions values('${A}','${essay}','answered','${sha}',12,'first_sitting',now(),'{}'),('${BLANK}','','unanswered','${sha}',0,'first_sitting',now(),'{}');`);
await db.exec(readFileSync('supabase/migrations/20261121010000_ielts_writing_starting_point_full_check.sql','utf8'));
const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
const at=(q)=>{const s=Array.from(essay.slice(0,essay.indexOf(q))).length;return{start_char:s,end_char:s+Array.from(q).length};};
const quote='a relevant example helps.';
const keys=['task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy'];
const fields=(lows,estimate)=>({observations:Object.fromEntries(keys.map(k=>[k,{status:'developing',comment:'Add a clear example to explain your reason.',evidence:[{quote,...at(quote)}]}])),
 next_step:'Add one example. Check that it supports your reason.',delivery_comment:'',
 highlights:[{criterion:'grammar_range_accuracy',kind:'fix',quote:'peoples is',note:'Use the plural verb. '+'Also: put a space after the comma. '.repeat(8),correction:'people are',...at('peoples is')}],
 criterion_bands:Object.fromEntries(keys.map((k,i)=>[k,{low:lows[i],high:lows[i]+1}])),estimate});
let n=0;
const draft=async(version='bh-ielts-task2-simple-feedback-v4',attempt=A)=>{const id=`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;await db.query("insert into private.ielts_writing_ai_drafts(id,attempt_id,requested_by,response_sha256,prompt_version,model,source_context) values($1,$2,$3,$4,$5,'m',$6::jsonb)",[id,attempt,teacher,sha,version,JSON.stringify({response_text:essay,response_state:'answered',incident_count:0})]);return id;};
const finish=(id,f)=>db.query('select public.rpc_ielts_finish_writing_ai_draft($1,$2::jsonb,$3)',[id,JSON.stringify(f),'p']);
const result=async(id=A)=>(await db.query('select public.rpc_ielts_writing_screener_result($1) j',[id])).rows[0].j;
const setBand=(band,draftId=null,id=A)=>db.query('select public.rpc_ielts_set_writing_starting_point($1,$2,$3) j',[id,band,draftId]).then(r=>r.rows[0].j);
let good;
test('v4 drafts carry criterion ranges and exactly the server starting band; long merged notes fit',async()=>{
 good=await draft();await finish(good,fields([5,5,5.5,4.5],{band:5.5,low:5,high:6}));
 assert.equal((await db.query('select state from private.ielts_writing_ai_drafts where id=$1',[good])).rows[0].state,'ready');
 await assert.rejects(finish(await draft(),fields([5,5,5.5,4.5],{band:6,low:5.5,high:6.5})),/ai_estimate_invalid/,'the AI cannot invent the band');
 await assert.rejects(finish(await draft(),{...fields([5,5,5,5],{band:5.5,low:5,high:6}),criterion_bands:{...fields([5,5,5,5]).criterion_bands,task_response:{low:5,high:7}}}),/ai_band_invalid/);
 const none=fields([5,5,5,5],null);none.criterion_bands.task_response=null;
 await assert.rejects(finish(await draft(),none),/ai_band_invalid/,'a judged criterion needs a range');
 const v3=await draft('bh-ielts-task2-simple-feedback-v3');
 await assert.rejects(finish(v3,fields([5,5,5,5],{band:5.5,low:5,high:6})),/ai_draft_invalid/,'v3 keeps its old shape');
});
test('the starting band needs a shared review, an authorized teacher and a half-band value',async()=>{
 await as(teacher);
 await assert.rejects(setBand(5.5,good),/review_required/);
 await as(stu);assert.equal((await result()).starting_point,null,'nothing before the review');
 await db.query(`insert into private.ielts_writing_screener_reviews values('20000000-0000-0000-0000-000000000001','${A}',1,'{}','Next.','',now())`);
 await assert.rejects(setBand(5.5,good),/not_authorized/,'a student cannot set it');
 await as(other);await assert.rejects(setBand(5.5,good),/not_authorized/);
 await as(teacher);
 await assert.rejects(setBand(5.25,good),/band_invalid/);await assert.rejects(setBand(9.5,good),/band_invalid/);
 await assert.rejects(setBand(5,await draft('bh-ielts-task2-simple-feedback-v3')),/ai_draft_invalid/);
 await assert.rejects(setBand(5,null,BLANK),/starting_point_not_available/,'blank writing gets no band');
});
test('the teacher confirms or changes the AI band; the student sees the latest teacher band with its range',async()=>{
 await as(teacher);
 let r=await setBand(5.5,good);
 assert.deepEqual({band:Number(r.starting_point.band),low:Number(r.starting_point.low),high:Number(r.starting_point.high),source:r.starting_point.source},{band:5.5,low:5,high:6,source:'teacher_confirmed_ai'});
 r=await setBand(6,good);assert.equal(r.starting_point.source,'teacher_changed_ai');assert.equal(Number(r.starting_point.ai_band),5.5);
 await as(stu);r=await result();assert.equal(Number(r.starting_point.band),6);assert.equal(Number(r.starting_point.high),6.5);
 await as(teacher);r=await setBand(6.5);assert.equal(r.starting_point.source,'teacher_set');
 assert.equal((await db.query('select count(*)::int c from private.ielts_writing_starting_points')).rows[0].c,3,'history is kept');
 await as(other);await assert.rejects(result(),/not_authorized/);
});
