import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Shares the practice-boundaries fixture so the real batch allocator and preview run underneath.
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const school=id(1),other=id(2),teacher=id(3),a=id(4),b=id(5),late=id(6),outsider=id(7),year=id(8),cls=id(9);
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table schools(id uuid primary key);insert into schools values('${school}'),('${other}');
create table users(id uuid primary key,school_id uuid,username text,full_name text,batch text,role text default 'student',is_banned boolean default false,banned_until timestamptz,eligible boolean default true);
insert into users(id,school_id,username,batch,role) values('${teacher}','${school}','Teacher',null,'teacher'),('${a}','${school}','A','11A','student'),('${b}','${school}','B','12A','student'),('${late}','${school}','Late','11C','student'),('${outsider}','${other}','Outside','11A','student');
create table classes(id uuid primary key,school_id uuid,class_name text,is_active boolean default true);insert into classes values('${cls}','${school}','11A',true);
create table class_students(class_id uuid,student_id uuid);insert into class_students values('${cls}','${a}');
create table ielts_practice_assignments(id uuid primary key default gen_random_uuid(),school_id uuid,class_id uuid,academic_year_id uuid,assigned_by uuid,title text,description text,status text,due_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table ielts_practice_assignment_items(id uuid primary key default gen_random_uuid(),assignment_id uuid,skill text,content_type text,content_id text,title text,required boolean,order_index integer,created_at timestamptz default now());
create table ielts_practice_assignment_students(id uuid primary key default gen_random_uuid(),assignment_id uuid,student_id uuid,status text,unique(assignment_id,student_id));
create function public.academic_resolve_operational_year_id(uuid,timestamptz) returns uuid language sql as $$select '${year}'::uuid$$;
create function public.can_manage_ielts_practice_school(uuid) returns boolean language sql as $$select $1='${school}'::uuid and auth.uid()='${teacher}'::uuid$$;
create function public.can_manage_ielts_practice_class(uuid,uuid) returns boolean language sql as $$select can_manage_ielts_practice_school($1)$$;
create function public.can_manage_ielts_practice_assignment(uuid) returns boolean language sql as $$select exists(select 1 from public.ielts_practice_assignments where id=$1 and public.can_manage_ielts_practice_school(school_id))$$;
create function private.ielts_speaking_student_eligible(uuid) returns boolean language sql as $$select exists(select 1 from public.users where id=$1 and eligible and not is_banned and role='student')$$;
create function private.ielts_material_code(text,text) returns text language sql as $$select 'R-001'::text$$;
create function private.ielts_originality_label(text,text) returns text language sql as $$select 'Existing material'::text$$;
create function private.ielts_teacher_practice_rows(uuid,uuid,uuid,jsonb) returns table(row_id text,kind text,assignment_id uuid,student_id uuid,student_name text,class_id uuid,class_name text,material_type text,material_id text,material_version text,title text,assignment_title text,skill text,status text,assignment_status text,feedback_status text,assigned_at timestamptz,submitted_at timestamptz,feedback_at timestamptz,due_at timestamptz) language sql as $$select s.id::text,'school',x.id,s.student_id,'Name',null::uuid,null::text,i.content_type,i.content_id,null::text,i.title,x.title,i.skill,s.status,x.status,'not_tracked',x.created_at,null::timestamptz,null::timestamptz,x.due_at from public.ielts_practice_assignments x join public.ielts_practice_assignment_items i on i.assignment_id=x.id join public.ielts_practice_assignment_students s on s.assignment_id=x.id where x.school_id=$1$$;
`);
// Exercise the deployed legacy allocators, not a reimplementation of their behavior.
const foundation=readFileSync('supabase/migrations/20260516130000_ielts_practice_assignments_foundation.sql','utf8');
for(const name of ['rpc_ielts_practice_create_assignment','rpc_ielts_practice_assign_to_students']){
 const start=foundation.toLowerCase().indexOf('create or replace function public.'+name),end=foundation.indexOf('$$;',start)+3;
 await db.exec(foundation.slice(start,end));
}
await db.exec(readFileSync('supabase/migrations/20261015044759_ielts_course_batches.sql','utf8'));

await db.exec(`
create table public.school_members(school_id uuid,user_id uuid,status text);
insert into public.school_members values('${school}','${a}','active'),('${school}','${b}','active'),('${school}','${late}','active');
create table public.ielts_exam_forms(id uuid primary key,reading_payload jsonb,listening_payload jsonb,writing_payload jsonb,speaking_payload jsonb);
create table private.ielts_diagnostic_versions(id uuid primary key,exam_form_id uuid,mode text,skills text[],published_snapshot jsonb);
create table private.ielts_speaking_packages(id uuid primary key,prompt text);
create table private.ielts_learning_tasks(code text primary key,title text,version text default '1',purpose text,instructions text,success_description text,skill text,content jsonb,questions jsonb default '[]',pilot_student uuid,content_sha256 text default 'hash',requires_review boolean default false,released boolean default true);
create table public.ielts_reading_sets(id bigint primary key,title text,slug text,passage_text text,is_active boolean,description text,level text,est_band_min numeric,est_band_max numeric,created_at timestamptz,display_code text,originality_label text);
create table public.ielts_reading_questions(set_id bigint,body text);
create table public.ielts_listening_sets(like public.ielts_reading_sets including all);alter table public.ielts_listening_sets add column audio_url text;
create table public.ielts_listening_questions(set_id bigint,body text);
create table public.ielts_writing_tasks(id bigint primary key,title text,slug text,prompt text,task_type text,bands_target text,is_active boolean,created_at timestamptz,display_code text,originality_label text);
create table public.ielts_speaking_tasks(id bigint primary key,slug text,prompt text,part int,is_active boolean,created_at timestamptz,display_code text,originality_label text);
create table private.ielts_learning_allocations(id uuid primary key default gen_random_uuid(),school_id uuid,student_id uuid,task_code text,source_attempt_id uuid,source_speaking_session_id uuid,reason text,teacher_id uuid,request_id uuid unique,due_at timestamptz,status text default 'assigned',created_at timestamptz default now());
create table private.ielts_learning_content_reviews(school_id uuid,task_code text,content_sha256 text);
create table private.ielts_learning_reviews(allocation_id uuid);
create table public.academic_skill_registry_nodes(id uuid,name text);
create table private.ielts_speaking_sessions(id uuid primary key,school_id uuid,student_id uuid,status text,created_at timestamptz);
create table private.ielts_speaking_reviews(session_id uuid);
create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid,version_id uuid,school_id uuid,student_id uuid);
create table public.ielts_exam_attempts(id uuid primary key,status text,submitted_at timestamptz);
create table private.ielts_writing_screener_reviews(attempt_id uuid);
create table private.ielts_diagnostic_scoring_runs(attempt_id uuid,server_verified boolean);
create function private.ielts_originality_normalize(text) returns text language sql immutable set search_path='' as $$select trim(regexp_replace(lower(coalesce($1,'')),'[^[:alnum:]]+',' ','g'))$$;
create function private.ielts_learning_publicly_released(text) returns boolean language sql stable set search_path='' as $$select exists(select 1 from private.ielts_learning_tasks where code=$1 and released)$$;
create function private.can_access_ielts_learning(uuid) returns boolean language sql as $$select true$$;
insert into public.ielts_exam_forms(id,reading_payload) values('${id(30)}','{"passages":[{"text":"This is protected screener source material which must never be reused in later practice."}],"assessment_mode":"screener"}');
insert into private.ielts_diagnostic_versions values('${id(31)}','${id(30)}','screener',array['reading'],'{}');
insert into public.ielts_reading_sets(id,title,is_active,passage_text,display_code) values(1,'Legacy reading',true,'Legacy source material which has not passed a current editorial review.','R-003');
insert into private.ielts_learning_tasks(code,title,purpose,skill,content,pilot_student,instructions,success_description) values
('guided','Useful guided reading','guided_practice','reading','{"passage":"Fresh original guided reading about a community garden and its opening hours."}','${a}','Read and explain.','Support your choice.'),
('check','Useful independent reading','independent_check','reading','{"passage":"Another original fresh check about a community library and its membership policy."}','${a}','Read independently.','Support your choice.'),
('copy','Renamed activity','guided_practice','reading','{"passage":"This is protected screener source material which must never be reused in later practice."}','${a}','Read.','Respond.');
insert into public.ielts_exam_attempts values('${id(40)}','submitted',now()),('${id(41)}','submitted',now());
insert into private.ielts_diagnostic_attempt_evidence values('${id(40)}','${id(31)}','${school}','${a}'),('${id(41)}','${id(31)}','${school}','${b}');
insert into private.ielts_diagnostic_scoring_runs values('${id(40)}',true),('${id(41)}',true);
`);
const release=readFileSync('supabase/migrations/20261010022605_ielts_targeted_eligible_release.sql','utf8');
const start=release.indexOf('CREATE OR REPLACE FUNCTION public.rpc_ielts_learning_allocate');
await db.exec(release.slice(start,release.indexOf('$function$;',start)+12));
await db.exec(readFileSync('supabase/migrations/20261015071503_ielts_practice_assignment_boundaries.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261027130656_ielts_batch_practice_after_screeners.sql','utf8'));
test.after(()=>db.close());
const actor=x=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[x]);
const sql=async(q,args=[])=>(await db.query(q,args)).rows[0];
const count=async(q,args=[])=>(await sql(`select count(*)::int n from ${q}`,args)).n;
let batch,att=200;
// One submitted attempt per screener skill; reading/listening also get a verified scoring run unless told otherwise.
const screener=async(student,skill,scored=true)=>{const v=id(att++),a=id(att++);
 await db.query("insert into private.ielts_diagnostic_versions values($1,$2,'screener',array[$3],'{}')",[v,id(30),skill]);
 await db.query("insert into public.ielts_exam_attempts values($1,'submitted',now())",[a]);
 await db.query('insert into private.ielts_diagnostic_attempt_evidence values($1,$2,$3,$4)',[a,v,school,student]);
 if(scored&&skill!=='writing')await db.query('insert into private.ielts_diagnostic_scoring_runs values($1,true)',[a]);return a;};
const assignAll=(ids,request,task='guided',extra={})=>sql('select rpc_ielts_batch_assign_practice_after_screeners($1,$2,$3,$4,$5,$6,$7,$8,true) data',[batch,extra.revision??1,task,ids,'Practise explaining the evidence behind each answer.',extra.due??null,request,extra.repeat??false]).then(r=>r.data);
const claim=async student=>{await actor(student);const r=(await sql('select rpc_ielts_learning_claim_deferred() data')).data;await actor(teacher);return r;};

test('whole batch: students with all three screeners get the task now, the rest wait invisibly',async()=>{
 await actor(teacher);batch=(await sql('select rpc_ielts_batch_save($1,$2,$3) id',[school,'October',[a,b,late]])).id;
 // A already has a scored reading screener (fixture); add listening and writing. B has reading only. Late has nothing.
 await screener(a,'listening');await screener(a,'writing');
 const preview=(await sql('select rpc_ielts_batch_practice_preview($1,$2) data',[batch,'guided'])).data;
 const byId=Object.fromEntries(preview.students.map(s=>[s.id,s]));
 assert.deepEqual(byId[a].screeners,{listening:true,reading:true,writing:true});
 assert.deepEqual(byId[b].screeners,{listening:false,reading:true,writing:false});
 const result=await assignAll([a,b,late],id(300));
 assert.equal(result.assigned_count,1);assert.equal(result.waiting_count,2);
 assert.equal(await count("private.ielts_learning_allocations where task_code='guided'"),1);
 assert.equal(await count("private.ielts_learning_allocations where student_id=$1",[b]),0,'B sees nothing yet: a waiting entry is not a task');
 assert.deepEqual(await assignAll([a,b,late],id(300)),{...result,allocation_ids:result.allocation_ids},'the same request replays without duplicating');
 await assert.rejects(()=>assignAll([b],id(301)),/existing_waiting_practice/);
 const again=(await sql('select rpc_ielts_batch_practice_preview($1,$2) data',[batch,'guided'])).data.students.find(s=>s.id===b);assert.equal(again.waiting,true);
});
test('a waiting task unlocks only after listening, reading and writing are all done; speaking is not needed',async()=>{
 assert.deepEqual(await claim(b),{released:0,waiting:1});
 await screener(b,'listening');assert.deepEqual(await claim(b),{released:0,waiting:1},'writing still missing');
 await screener(b,'writing');assert.deepEqual(await claim(b),{released:1,waiting:0});
 const row=await sql("select * from private.ielts_learning_allocations where student_id=$1 and task_code='guided'",[b]);
 assert.equal(row.teacher_id,teacher);assert.equal(row.reason,'Practise explaining the evidence behind each answer.');assert.equal(row.status,'assigned');
 assert.deepEqual(await claim(b),{released:0,waiting:0},'released once only');
});
test('submitted screeners without a verified reading result keep the task waiting until the evidence is ready',async()=>{
 await screener(late,'listening');await screener(late,'writing');const r=await screener(late,'reading',false);
 assert.deepEqual(await claim(late),{released:0,waiting:1});
 await db.query('insert into private.ielts_diagnostic_scoring_runs values($1,true)',[r]);
 assert.deepEqual(await claim(late),{released:1,waiting:0});
});
test('late unlock keeps the working window; teachers can withdraw; closed batches and exposed checks never release',async()=>{
 // Due date passed before the student unlocked: the student gets the same window from now.
 const s1=id(400);await db.query("insert into users(id,school_id,username,batch,role) values($1,$2,'S1','11A','student')",[s1,school]);await db.query("insert into public.school_members values($1,$2,'active')",[school,s1]);
 const rev=(await sql('select revision from private.ielts_course_batches where id=$1',[batch])).revision;
 await sql('select rpc_ielts_batch_save($1,$2,$3,$4,$5)',[school,'October',[a,b,late,s1],batch,rev]);
 await assignAll([s1],id(302),'check',{revision:rev+1,due:new Date(Date.now()+3*864e5).toISOString()});
 await db.query("update private.ielts_learning_deferred_allocations set due_at=now()-interval '1 day' where student_id=$1",[s1]);
 for(const k of ['listening','reading','writing'])await screener(s1,k);
 assert.deepEqual(await claim(s1),{released:1,waiting:0});
 const due=(await sql("select extract(epoch from due_at-now())/86400 d from private.ielts_learning_allocations where student_id=$1 and task_code='check'",[s1])).d;
 assert.ok(due>2.9&&due<3.1,`window kept (${due} days)`);
 // Withdrawn by the teacher before unlocking.
 const s2=id(401);await db.query("insert into users(id,school_id,username,batch,role) values($1,$2,'S2','11A','student')",[s2,school]);await db.query("insert into public.school_members values($1,$2,'active')",[school,s2]);
 await sql('select rpc_ielts_batch_save($1,$2,$3,$4,$5)',[school,'October',[a,b,late,s1,s2],batch,rev+1]);
 await assignAll([s2],id(303),'guided',{revision:rev+2});
 assert.equal((await sql('select rpc_ielts_batch_cancel_waiting_practice($1,$2,$3) n',[batch,'guided',[s2]])).n,1);
 // An independent check the student meets elsewhere before unlocking is closed, not released.
 await assignAll([s2],id(304),'check',{revision:rev+2});
 await db.query("insert into private.ielts_learning_allocations(school_id,student_id,task_code,reason,teacher_id,request_id,status) values($1,$2,'check','Seen elsewhere earlier.',$3,$4,'submitted')",[school,s2,teacher,id(305)]);
 for(const k of ['listening','reading','writing'])await screener(s2,k);
 assert.deepEqual(await claim(s2),{released:0,waiting:0});
 assert.equal(await count("private.ielts_learning_allocations where student_id=$1 and task_code='guided'",[s2]),0,'withdrawn task never appears');
 assert.equal((await sql("select note from private.ielts_learning_deferred_allocations where request_id=$1",[id(304)])).note,'independent_check_already_exposed');
});
test('students and anonymous users cannot assign or read waiting entries',async()=>{
 await actor(a);await assert.rejects(()=>assignAll([a],id(306)));await assert.rejects(()=>sql('select rpc_ielts_batch_cancel_waiting_practice($1,$2,$3)',[batch,'guided',[b]]));
 for(const fn of ['public.rpc_ielts_batch_assign_practice_after_screeners(uuid,integer,text,uuid[],text,timestamptz,uuid,boolean,boolean)','public.rpc_ielts_learning_claim_deferred()','public.rpc_ielts_batch_cancel_waiting_practice(uuid,text,uuid[])'])
  assert.equal((await sql(`select has_function_privilege('anon','${fn}','execute') ok`)).ok,false);
 assert.equal((await sql("select has_function_privilege('authenticated','private.ielts_learning_release_deferred(uuid)','execute') ok")).ok,false);
 assert.equal((await sql("select has_table_privilege('authenticated','private.ielts_learning_deferred_allocations','select') ok")).ok,false);
});
