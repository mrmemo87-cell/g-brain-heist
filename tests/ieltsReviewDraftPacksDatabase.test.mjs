import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{PGlite}from'@electric-sql/pglite';
const db=new PGlite();const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',owner='00000000-0000-0000-0000-000000000003',lead='00000000-0000-0000-0000-000000000004',student='00000000-0000-0000-0000-000000000005',otherLead='00000000-0000-0000-0000-000000000006';
const sha='d'.repeat(64),path=`review-drafts/${a}/IELTS-17/0.1.0/${sha}.zip`;
await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,is_banned boolean);create table public.schools(id uuid primary key,name text,logo_url text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
grant usage on schema storage,public to authenticated;grant select on storage.objects to authenticated;
create table private.managers(user_id uuid,school_id uuid);create table private.owners(user_id uuid);
create function public.can_manage_ielts_practice_school(s uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.managers m where m.user_id=auth.uid() and m.school_id=s)$$;
create function public.is_superadmin(p uuid default null) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.owners o where o.user_id=coalesce(p,auth.uid()))$$;
insert into public.users values('${owner}',false),('${lead}',false),('${student}',false),('${otherLead}',false);
insert into public.schools values('${a}','Silk Road',null),('${b}','Other School',null);
insert into private.managers values('${owner}','${a}'),('${lead}','${a}'),('${otherLead}','${b}');insert into private.owners values('${owner}');`);
for(const f of ['20261017143000_ielts_approved_teacher_packs.sql','20261017143001_ielts_global_branded_teacher_packs.sql','20261017190000_ielts_review_draft_packs.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
await db.exec(`insert into private.ielts_review_draft_packs(school_id,lesson_code,title,version,source_sha256,object_path,sha256,size_bytes,recordings,authorization_basis,published_at)
 values('${a}','IELTS-17','Timed Listening','0.1.0','${'e'.repeat(64)}','${path}','${sha}',100,'[{"id":"IELTS-17-L1","status":"pending"}]','Owner request: review drafts for Silk Road',now());
insert into storage.objects values('ielts-teacher-course-packs','${path}'),('ielts-teacher-course-packs','review-drafts/unregistered.zip');
create policy unrelated_broad_read on storage.objects for select to authenticated using(bucket_id='ielts-teacher-course-packs');`);
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const drafts=async s=>(await db.query('select public.rpc_ielts_review_draft_packs($1) j',[s])).rows[0].j;
const decide=async(s,d,n,h=sha,v='0.1.0')=>(await db.query('select public.rpc_ielts_record_review_decision($1,$2,$3,$4,$5,$6) j',[s,'IELTS-17',v,h,d,n])).rows[0].j;
const objects=async()=>{await db.exec('set role authenticated');try{return(await db.query('select name from storage.objects')).rows;}finally{await db.exec('reset role');}};
test('school managers see drafts for their school only; only the owner may decide',async()=>{
 await actor(lead);let r=await drafts(a);assert.equal(r.release,'review_draft');assert.equal(r.can_decide,false);assert.equal(r.packs.length,1);assert.equal(r.packs[0].decision,null);assert.deepEqual(await objects(),[{name:path}]);
 await assert.rejects(decide(a,'approved',null),/not_authorized/);
 await actor(otherLead);await assert.rejects(drafts(a),/not_authorized/);assert.deepEqual((await drafts(b)).packs,[]);assert.deepEqual(await objects(),[]);
 await actor(owner);r=await drafts(a);assert.equal(r.can_decide,true);
});
test('decisions bind to exact bytes, need notes for changes and stay as history',async()=>{
 await actor(owner);
 await assert.rejects(decide(a,'approved',null,'f'.repeat(64)),/pack_mismatch/);
 await assert.rejects(decide(a,'changes_requested','  '),/notes_required/);
 await assert.rejects(decide(a,'released',null),/invalid_decision/);
 await assert.rejects(decide(b,'approved',null),/not_authorized/);
 assert.equal((await decide(a,'changes_requested','Fix Q4 key')).decision,'changes_requested');
 const ok=await decide(a,'approved',null);assert.equal(ok.decision,'approved');
 const latest=(await drafts(a)).packs[0].decision;assert.equal(latest.decision,'approved');assert.equal(latest.pack_sha256,sha);
 assert.equal((await db.query('select count(*)::int n from private.ielts_review_decisions')).rows[0].n,2);
});
test('students, anonymous, banned and unpublished cases fail closed; no direct grants',async()=>{
 for(const id of[student,'']){await actor(id);await assert.rejects(drafts(a),/not_authorized/);assert.deepEqual(await objects(),[]);}
 await db.exec(`update public.users set is_banned=true where id='${owner}'`);await actor(owner);await assert.rejects(decide(a,'approved',null),/not_authorized/);await db.exec(`update public.users set is_banned=false where id='${owner}'`);
 await db.exec('update private.ielts_review_draft_packs set published_at=null');await actor(lead);assert.deepEqual((await drafts(a)).packs,[]);assert.deepEqual(await objects(),[]);
 await actor(owner);await assert.rejects(decide(a,'approved',null),/pack_mismatch/);
 for(const fn of['public.rpc_ielts_review_draft_packs(uuid)','public.rpc_ielts_record_review_decision(uuid,text,text,text,text,text)'])
  assert.equal((await db.query(`select has_function_privilege('anon','${fn}','EXECUTE') ok`)).rows[0].ok,false);
 for(const t of['private.ielts_review_draft_packs','private.ielts_review_decisions'])
  assert.equal((await db.query(`select has_table_privilege('authenticated','${t}','SELECT') ok`)).rows[0].ok,false);
 await assert.rejects(db.exec(`insert into private.ielts_review_draft_packs(school_id,lesson_code,title,version,source_sha256,object_path,sha256,size_bytes,authorization_basis) values('${a}','IELTS-03','x','0.1.0','${'e'.repeat(64)}','review-drafts/${a}/IELTS-03/0.1.0/${sha}.zip','${sha}',1,'x')`),/check/);
});
test.after(()=>db.close());
