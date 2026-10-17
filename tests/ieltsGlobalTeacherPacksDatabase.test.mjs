import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{PGlite}from'@electric-sql/pglite';
const db=new PGlite();const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',t1='00000000-0000-0000-0000-000000000003',t2='00000000-0000-0000-0000-000000000004',student='00000000-0000-0000-0000-000000000005';
await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,is_banned boolean);create table public.schools(id uuid primary key,name text,logo_url text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
grant usage on schema storage,public to authenticated;grant select on storage.objects to authenticated;
create table private.managers(user_id uuid,school_id uuid);
create function public.can_manage_ielts_practice_school(s uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.managers m where m.user_id=auth.uid() and m.school_id=s)$$;
insert into public.users values('${t1}',false),('${t2}',false),('${student}',false);
insert into public.schools values('${a}','School A','https://example.test/a.png'),('${b}','School B',null);
insert into private.managers values('${t1}','${a}'),('${t2}','${b}');`);
for(const f of ['20261017143000_ielts_approved_teacher_packs.sql','20261017143001_ielts_global_branded_teacher_packs.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
await db.exec(`insert into private.ielts_teacher_pack_templates values('IELTS-03','Approved lesson','1.0.1','1.0.0','templates/lesson.zip','${'a'.repeat(64)}',100,'Owner approved global availability',now());
insert into storage.objects values('ielts-teacher-course-packs','templates/lesson.zip'),('ielts-teacher-course-packs','unregistered.zip');
create policy unrelated_broad_read on storage.objects for select to authenticated using(bucket_id='ielts-teacher-course-packs');`);
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const catalogue=async id=>(await db.query('select public.rpc_ielts_teacher_pack_catalogue($1) j',[id])).rows[0].j;
const objects=async()=>{await db.exec('set role authenticated');try{return(await db.query('select name from storage.objects')).rows;}finally{await db.exec('reset role');}};
test('same approved lessons reach each school with only its server-authorized branding',async()=>{
 for(const [teacher,school,name,logo]of[[t1,a,'School A','https://example.test/a.png'],[t2,b,'School B',null]]){
  await actor(teacher);const r=await catalogue(school);assert.equal(r.school.name,name);assert.equal(r.school.logo_url,logo);assert.equal(r.packs.length,1);assert.equal(r.release,'teacher_only');assert.deepEqual(await objects(),[{name:'templates/lesson.zip'}]);
  await assert.rejects(catalogue(school===a?b:a),/not_authorized/);
 }
});
test('future schools inherit availability without per-school content copies',async()=>{
 const c='00000000-0000-0000-0000-000000000006';await db.exec(`insert into public.schools values('${c}','Future School',null);insert into private.managers values('${t2}','${c}')`);await actor(t2);assert.equal((await catalogue(c)).packs.length,1);
});
test('students, banned users, revoked entitlement and unreleased assets remain denied',async()=>{
 for(const id of[student,'']){await actor(id);await assert.rejects(catalogue(a),/not_authorized/);assert.deepEqual(await objects(),[]);}
 await actor(t1);await db.exec(`update public.users set is_banned=true where id='${t1}'`);await assert.rejects(catalogue(a),/not_authorized/);assert.deepEqual(await objects(),[]);
 await db.exec(`update public.users set is_banned=false where id='${t1}';delete from private.managers where user_id='${t1}'`);await assert.rejects(catalogue(a),/not_authorized/);assert.deepEqual(await objects(),[]);
 await actor(t2);await db.exec('update private.ielts_teacher_pack_templates set released_at=null');assert.deepEqual((await catalogue(b)).packs,[]);assert.deepEqual(await objects(),[]);
 assert.equal((await db.query("select has_function_privilege('anon','public.rpc_ielts_teacher_pack_catalogue(uuid)','EXECUTE') ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_table_privilege('authenticated','private.ielts_teacher_pack_templates','SELECT') ok")).rows[0].ok,false);
});
test.after(()=>db.close());
