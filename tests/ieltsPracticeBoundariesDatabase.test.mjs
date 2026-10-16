import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
test.after(()=>db.close());
const actor=x=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[x]);
const sql=async(q,args=[])=>(await db.query(q,args)).rows[0];
const save=async(name,ids)=>(await sql('select rpc_ielts_batch_save($1,$2,$3) id',[school,name,ids])).id;
let batch;
test('practice catalogue holds legacy sources and excludes retitled screener copies',async()=>{
 await actor(teacher);batch=await save('October',[a,b,late]);
 assert.equal((await sql("select private.ielts_practice_material_allowed('targeted','guided') allowed")).allowed,true);
 assert.equal((await sql("select private.ielts_practice_material_allowed('targeted','copy') allowed")).allowed,false);
 assert.equal((await sql("select private.ielts_practice_material_allowed('ielts_reading_set','1') allowed")).allowed,false);
 assert.equal((await db.query('select * from rpc_ielts_practice_content_catalog_with_provenance(null,null,50)')).rows.length,0);
 for(const name of ['rpc_ielts_practice_content_catalog','rpc_ielts_practice_content_catalog_with_codes'])assert.equal((await db.query(`select * from ${name}(null,null,50)`)).rows.length,0);
 await assert.rejects(()=>db.query('select rpc_ielts_learning_allocate($1,$2,$3,$4,$5,null,$6)',[school,a,'copy',id(40),'Practice after the initial assessment.',id(85)]),/assessment_material_not_assignable/);
 const preview=(await sql('select rpc_ielts_batch_practice_preview($1,$2) data',[batch,'guided'])).data;
 assert.deepEqual(preview.tasks.map(t=>t.code),['check','guided']);assert.equal(preview.students.filter(s=>s.source_ready).length,2);
 await assert.rejects(()=>db.query("insert into ielts_practice_assignment_items(assignment_id,skill,content_type,content_id) values($1,'reading','ielts_reading_set','1')",[id(80)]),/practice_material_review_required/);
});
const assign=(ids,request=id(90),task='guided',revision=1,repeat=false,reviewed=true)=>sql('select rpc_ielts_batch_assign_practice($1,$2,$3,$4,$5,null,$6,$7,$8) data',[batch,revision,task,ids,'Practise explaining the evidence behind each answer.',request,repeat,reviewed]);
test('batch practice requires source review and is atomic when one student lacks evidence',async()=>{
 await assert.rejects(()=>assign([a],id(89),'guided',1,false,false),/review_selected_source/);
 await assert.rejects(()=>assign([a,late]),/reviewed_source_required/);
 assert.equal((await sql('select count(*)::int n from private.ielts_learning_allocations')).n,0);
 const result=(await assign([a,b])).data;assert.equal(result.assigned_count,2);
 assert.deepEqual((await assign([a,b])).data.allocation_ids,result.allocation_ids);
 assert.equal((await sql('select count(*)::int n from private.ielts_learning_allocations')).n,2);
 await assert.rejects(()=>assign([a],id(91)),/existing_active_practice/);
 await assert.rejects(()=>assign([outsider],id(92)),/student_not_in_batch/);
 await assert.rejects(()=>assign([a],id(93),'copy'),/released_practice_required/);
});
test('independent checks retain exposure guard; guided repeats require explicit confirmation',async()=>{
 await assign([a],id(94),'check');await db.query("update private.ielts_learning_allocations set status='submitted'");
 await assert.rejects(()=>assign([a],id(95),'check'),/independent_check_already_exposed/);
 await assert.rejects(()=>assign([a],id(96)),/intentional_repeat_required/);
 assert.equal((await assign([a],id(97),'guided',1,true)).data.assigned_count,1);
});
test('archiving blocks new assignments/roster edits and preserves work, restoration is explicit',async()=>{
 await sql("select rpc_ielts_batch_lifecycle($1,1,'archive')",[batch]);
 assert.equal((await sql('select rpc_ielts_batches($1) data',[school])).data[0].archived_at!=null,true);
 await assert.rejects(()=>assign([b],id(98),'check',2),/batch_changed/);
 await assert.rejects(()=>sql('select rpc_ielts_batch_save($1,$2,$3,$4,$5)',[school,'Changed',[a],batch,2]),/batch_archived/);
 await assert.rejects(()=>sql("select rpc_ielts_batch_lifecycle($1,2,'delete')",[batch]),/empty_unused/);
 const before=(await sql('select count(*)::int n from private.ielts_learning_allocations')).n;
 await sql("select rpc_ielts_batch_lifecycle($1,2,'restore')",[batch]);assert.equal((await sql('select count(*)::int n from private.ielts_learning_allocations')).n,before);
 const empty=await save('Unused',[]);await sql("select rpc_ielts_batch_lifecycle($1,1,'delete')",[empty]);
 assert.equal((await sql('select rpc_ielts_batches($1) data',[school])).data.some(b=>b.id===empty),false);await assert.rejects(()=>sql('select rpc_ielts_batch_roster($1)',[empty]));
});
test('new screener publication reserves its content against future practice; anonymous/student reads fail closed',async()=>{
 const prompt='A newly published protected screener prompt about local transport and its changing timetable.';
 await db.query('insert into private.ielts_speaking_packages values($1,$2)',[id(100),prompt]);
 await db.query("insert into private.ielts_learning_tasks(code,title,purpose,skill,content) values('future-copy','New title','guided_practice','speaking',$1)",[JSON.stringify({prompt})]);
 assert.equal((await sql("select private.ielts_practice_material_allowed('targeted','future-copy') allowed")).allowed,false);
 await actor(a);await assert.rejects(()=>sql('select rpc_ielts_batch_practice_preview($1,$2)',[batch,'guided']));
 assert.equal((await sql("select has_function_privilege('anon','public.rpc_ielts_batch_assign_practice(uuid,integer,text,uuid[],text,timestamptz,uuid,boolean,boolean)','execute') allowed")).allowed,false);
 assert.equal((await sql("select has_table_privilege('authenticated','private.ielts_protected_screener_signals','select') allowed")).allowed,false);
});
