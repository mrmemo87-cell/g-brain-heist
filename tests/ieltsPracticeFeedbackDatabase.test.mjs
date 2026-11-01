import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Diagnostic Bible 2.1.0 sections 10.5-10.6 database contract.
const db=new PGlite();
const school='00000000-0000-0000-0000-00000000000a',stu='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003',teacher='00000000-0000-0000-0000-000000000001';
const essay='Technology helps students learn in many ways. '.repeat(12);
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);create table public.users(id uuid primary key,is_banned boolean,full_name text,username text,school_id uuid);
create table public.ielts_speaking_tasks(id bigint primary key,part int,prompt text,follow_ups jsonb,is_active boolean);
create table public.ielts_speaking_attempts(id uuid primary key,user_id uuid,task_id bigint,duration int,duration_seconds int);
create table public.ielts_writing_tasks(id bigint primary key,task_type text,title text,prompt text,is_active boolean);
create table public.ielts_writing_attempts(id uuid primary key,user_id uuid,task_id bigint,answer_text text,word_count int);
create function private.ielts_practice_material_allowed(t text,i text) returns boolean language sql as $$select true$$;
create function public.can_manage_ielts_practice_school(s uuid) returns boolean language sql as $$select auth.uid()='${teacher}'::uuid and s='${school}'::uuid$$;
insert into auth.users values('${teacher}'),('${stu}'),('${other}'),('00000000-0000-0000-0000-000000000009');
insert into public.users values('${teacher}',false,'Teacher','t','${school}'),('${stu}',false,'Aida','a','${school}'),('${other}',false,'Bek','b','${school}');
insert into public.ielts_writing_tasks values(2,'task2','Tech','Discuss both views.',true),(15,'Task 1 General','Letter','Write a letter.',true),(13,'Task 1 Academic','Chart','Summarise the chart.',true);
insert into public.ielts_writing_attempts values('10000000-0000-0000-0000-000000000001','${stu}',2,'${essay}',96),('10000000-0000-0000-0000-000000000002','${stu}',15,'${essay}',96),
 ('10000000-0000-0000-0000-000000000003','${stu}',2,'Too short.',2),('10000000-0000-0000-0000-000000000004','${stu}',13,'${essay}',96);`);
await db.exec(readFileSync('supabase/migrations/20261019100000_ielts_practice_ai_feedback.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261101150000_ielts_self_paced_practice_feedback.sql','utf8'));
const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
const claim=a=>db.query("select public.rpc_ielts_practice_feedback_claim($1,'model') j",[a]).then(r=>r.rows[0].j);
const A1='10000000-0000-0000-0000-000000000001';
test('only the author can request, for Academic practice of sufficient length',async()=>{
 await as(other);await assert.rejects(claim(A1),/not_available/);
 await as(stu);const gt=await claim('10000000-0000-0000-0000-000000000002');assert.equal(gt.context.module,'general','General Training letters are eligible (10.6)');assert.equal(gt.context.task_number,1);
 await assert.rejects(claim('10000000-0000-0000-0000-000000000003'),/too_short/);
 const c=await claim(A1);assert.equal(c.ready,false);assert.equal(c.context.task_number,2);assert.equal(c.context.essay,essay);
 assert.equal((await claim('10000000-0000-0000-0000-000000000004')).context.task_number,1);
 await assert.rejects(claim(A1),/ai_already_working/,'one request at a time');
});
test('stored feedback is returned, confirmed only by a teacher of the school, never by the student',async()=>{
 const {rows:[{id}]}=await db.query("select id from private.ielts_practice_ai_feedback where attempt_id=$1",[A1]);
 await db.query("select public.rpc_ielts_practice_feedback_finish($1,$2::jsonb,'p')",[id,JSON.stringify({task_number:2,criteria:{},next_step:'x',prompt_version:'bh-ielts-practice-feedback-v1'})]);
 await as(stu);const again=await claim(A1);assert.equal(again.ready,true);assert.equal(again.feedback.status,'ready');assert.equal(again.feedback.confirmed,false);
 await assert.rejects(db.query("select public.rpc_ielts_practice_feedback_confirm($1,'ok')",[id]),/not_authorized/);
 await as(other);await assert.rejects(db.query('select public.rpc_ielts_practice_feedback($1)',[A1]),/not_available/,'other students cannot read it');
 await as(teacher);const v=(await db.query("select public.rpc_ielts_practice_feedback_confirm($1,'Good revision plan.') j",[id])).rows[0].j;
 assert.equal(v.confirmed,true);assert.equal(v.confirmed_by,'Teacher');assert.equal(v.teacher_note,'Good revision plan.');
});
test('a daily limit of eight new requests applies per student',async()=>{
 await as(stu);for(let i=0;i<5;i++){const a=`20000000-0000-0000-0000-00000000000${i}`;await db.query(`insert into public.ielts_writing_attempts values('${a}','${stu}',2,$1,96)`,[essay]);await claim(a);}
 await db.query(`insert into public.ielts_writing_attempts values('30000000-0000-0000-0000-000000000000','${stu}',2,$1,96)`,[essay]);
 await assert.rejects(claim('30000000-0000-0000-0000-000000000000'),/ai_rate_limit/);
});

const indie='00000000-0000-0000-0000-000000000009';
const sclaim=a=>db.query("select public.rpc_ielts_practice_speaking_feedback_claim($1,'audio-model') j",[a]).then(r=>r.rows[0].j);
test('speaking practice feedback: own attempt only, audio path in own folder, length gate, no public.users row needed',async()=>{
 await db.exec(`insert into public.ielts_speaking_tasks values(24,1,'Daily routine','{}',true),(25,1,'Old',null,false);
  insert into public.ielts_speaking_attempts values('40000000-0000-0000-0000-000000000001','${indie}',24,null,95),('40000000-0000-0000-0000-000000000002','${indie}',24,null,5),
  ('40000000-0000-0000-0000-000000000003','${indie}',25,null,95),('40000000-0000-0000-0000-000000000004','${stu}',24,null,95);`);
 await as(indie);
 const c=await sclaim('40000000-0000-0000-0000-000000000001');
 assert.equal(c.ready,false);assert.equal(c.context.part,1);assert.equal(c.context.audio_path,`speaking/${indie}/feedback/40000000-0000-0000-0000-000000000001.wav`);
 await assert.rejects(sclaim('40000000-0000-0000-0000-000000000002'),/too_short/);
 await assert.rejects(sclaim('40000000-0000-0000-0000-000000000003'),/not_available/,'inactive task');
 await assert.rejects(sclaim('40000000-0000-0000-0000-000000000004'),/not_available/,'someone else\'s recording');
 await assert.rejects(sclaim('40000000-0000-0000-0000-000000000001'),/ai_already_working/);
 await db.query("select public.rpc_ielts_practice_speaking_feedback_finish($1,$2::jsonb,'p')",[c.id,JSON.stringify({part:1,criteria:{},next_step:'x',prompt_version:'bh-ielts-speaking-practice-feedback-v1'})]);
 const v=(await db.query('select public.rpc_ielts_practice_speaking_feedback($1) j',['40000000-0000-0000-0000-000000000001'])).rows[0].j;
 assert.equal(v.status,'ready');assert.equal(v.confirmed,false);
 await as(other);await assert.rejects(db.query('select public.rpc_ielts_practice_speaking_feedback($1)',['40000000-0000-0000-0000-000000000001']),/not_available/);
 await as(teacher);await assert.rejects(db.query("select public.rpc_ielts_practice_speaking_feedback_confirm($1,'x')",[c.id]),/not_authorized/,'no school teacher for a self-paced learner');
});
test('IELTS-only learners without a public.users row can request writing feedback',async()=>{
 await db.exec(`insert into public.ielts_writing_attempts values('50000000-0000-0000-0000-000000000001','${indie}',2,'${essay}',96)`);
 await as(indie);const c=await claim('50000000-0000-0000-0000-000000000001');assert.equal(c.ready,false);
});
