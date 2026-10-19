import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Pilot finding 2026-10-19: practice keys reached the browser and the browser computed the saved score.
const student='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',teacher='00000000-0000-0000-0000-000000000003';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,role text,is_admin boolean default false,is_banned boolean default false);
insert into public.users(id,role) values('${student}','student'),('${other}','student'),('${teacher}','teacher');
create table public.ielts_reading_questions(id bigserial primary key,set_id bigint,question_order int,question_type text,body text,options jsonb,correct_answer jsonb,explanation text);
create table public.ielts_listening_questions(id bigserial primary key,set_id bigint,question_order int,question_type text,body text,options jsonb,correct_answer jsonb,explanation text);
create table public.ielts_reading_attempts(id uuid primary key default gen_random_uuid(),user_id uuid,set_id bigint,answers jsonb,raw_score int,total_questions int,percent numeric,completed_at timestamptz);
create table public.ielts_listening_attempts(id uuid primary key default gen_random_uuid(),user_id uuid,set_id bigint,answers jsonb,raw_score int,total_questions int,percent numeric,completed_at timestamptz);
grant select on public.ielts_reading_questions, public.ielts_listening_questions to authenticated;
insert into public.ielts_listening_questions(id,set_id,question_order,question_type,body,correct_answer,explanation) values
 (1,32,1,'fill_blank','Step 1 _____','["weighed"]','You hear: weighed'),(2,32,2,'fill_blank','Time _____','["7:15","7.15","seven fifteen"]','e'),
 (3,32,3,'multiple_choice','Glass?','["It is crushed and kept separately"]','e'),(4,32,4,'fill_blank','Number','"[\\"10\\",\\"ten\\"]"','legacy string key'),
 (5,32,5,'fill_blank','Scalar','"Mountains"','scalar key');`);
for(const f of ['20261019200000_ielts_practice_keys_server_side.sql','20261019200100_ielts_practice_keys_column_lock.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
let attempt;
test('the database scores the attempt from the real keys and ignores the browser score',async()=>{
 const answers={1:' Weighed ',2:'SEVEN FIFTEEN',3:'It is pressed into bales',4:'ten',5:'mountains'};
 attempt=(await one("insert into public.ielts_listening_attempts(user_id,set_id,answers,raw_score,total_questions,percent,completed_at) values($1,32,$2,5,5,100,now()) returning *",[student,JSON.stringify(answers)]));
 assert.deepEqual({raw:attempt.raw_score,total:attempt.total_questions,percent:Number(attempt.percent)},{raw:4,total:5,percent:80});
 const changed=await one("update public.ielts_listening_attempts set answers=$2 where id=$1 returning raw_score",[attempt.id,JSON.stringify({...answers,3:'It is crushed and kept separately'})]);
 assert.equal(changed.raw_score,5);
});
test('a student reads keys only for her own completed attempt',async()=>{
 await as(student);const r=(await one("select public.rpc_ielts_practice_attempt_review('listening',$1) r",[attempt.id])).r;
 assert.equal(r.raw_score,5);assert.equal(r.items.length,5);assert.deepEqual(r.items[0],{question_id:1,correct_answer:['weighed'],explanation:'You hear: weighed',is_correct:true});
 await as(other);await assert.rejects(db.query("select public.rpc_ielts_practice_attempt_review('listening',$1)",[attempt.id]),/attempt_not_found/);
});
test('keys and evidence are not readable directly; staff read them through the admin function',async()=>{
 await db.exec('set role authenticated');
 try{
  await as(student);
  assert.equal((await db.query('select id,body from public.ielts_listening_questions where set_id=32')).rows.length,5,'questions still load');
  await assert.rejects(db.query('select correct_answer from public.ielts_listening_questions'),/permission denied/);
  await assert.rejects(db.query('select * from public.ielts_reading_questions'),/permission denied/);
  await assert.rejects(db.query("select public.rpc_ielts_admin_set_questions('listening',32)"),/forbidden/);
  await as(teacher);
  const k=(await one("select public.rpc_ielts_admin_set_questions('listening',32) k")).k;assert.equal(k.length,5);assert.deepEqual(k[0].correct_answer,['weighed']);
 }finally{await db.exec('reset role');}
});
