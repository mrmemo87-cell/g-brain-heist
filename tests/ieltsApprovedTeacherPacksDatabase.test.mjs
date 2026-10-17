import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const school='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',teacher='00000000-0000-0000-0000-000000000003',student='00000000-0000-0000-0000-000000000004';
await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,is_banned boolean);create table public.schools(id uuid primary key);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
grant usage on schema storage,public to authenticated;grant select on storage.objects to authenticated;
create function public.can_manage_ielts_practice_school(s uuid) returns boolean language sql stable as $$select auth.uid()='${teacher}'::uuid and s='${school}'::uuid$$;
insert into public.users values('${teacher}',false),('${student}',false);insert into public.schools values('${school}'),('${other}');`);
await db.exec(readFileSync('supabase/migrations/20261017143000_ielts_approved_teacher_packs.sql','utf8'));
await db.exec(`insert into private.ielts_approved_teacher_packs values('${school}','IELTS-03','Approved title','1.0.1','approved.zip','${'a'.repeat(64)}',100,'Owner approved',now());
insert into storage.objects values('ielts-teacher-course-packs','approved.zip'),('ielts-teacher-course-packs','unreleased.zip'),('other-bucket','approved.zip');`);
async function actor(id){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function list(s=school){return (await db.query('select public.rpc_ielts_approved_teacher_packs($1) j',[s])).rows[0].j;}
async function objects(){await db.exec('set role authenticated');try{return (await db.query('select name from storage.objects')).rows;}finally{await db.exec('reset role');}}
test('released metadata and private bytes require the same active school teacher',async()=>{
 await db.exec("create policy unrelated_broad_read on storage.objects for select to authenticated using (bucket_id='ielts-teacher-course-packs')");
 await actor(teacher);assert.equal((await list()).packs[0].title,'Approved title');assert.deepEqual(await objects(),[{name:'approved.zip'}]);
 await assert.rejects(list(other),/not_authorized/);
 for(const id of [student,'']){await actor(id);await assert.rejects(list(),/not_authorized/);assert.deepEqual(await objects(),[]);}
 await actor(teacher);await db.exec(`update public.users set is_banned=true where id='${teacher}'`);await assert.rejects(list(),/not_authorized/);assert.deepEqual(await objects(),[]);
 await db.exec(`update public.users set is_banned=false where id='${teacher}';update private.ielts_approved_teacher_packs set released_at=null`);
 assert.deepEqual((await list()).packs,[]);assert.deepEqual(await objects(),[]);
 assert.equal((await db.query("select has_table_privilege('authenticated','private.ielts_approved_teacher_packs','SELECT') ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.rpc_ielts_approved_teacher_packs(uuid)','EXECUTE') ok")).rows[0].ok,false);
});
test.after(()=>db.close());
