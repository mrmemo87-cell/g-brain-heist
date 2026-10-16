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
test.after(()=>db.close());
const actor=x=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[x]);
const sql=async(q,args=[])=>(await db.query(q,args)).rows[0];
const save=async(name,ids,batch=null,revision=null)=>(await sql('select rpc_ielts_batch_save($1,$2,$3,$4,$5) id',[school,name,ids,batch,revision])).id;
let batch,assignment;
test('cross-class batch retains registration and rejects outside, missing, banned or ineligible members',async()=>{
 await actor(teacher);batch=await save('October',[a,b]);
 assert.equal((await sql('select rpc_ielts_batches($1) data',[school])).data[0].student_count,2);
 assert.equal((await sql('select count(*)::integer n from class_students')).n,1);
 assert.equal((await sql('select batch from public.users where id=$1',[b])).batch,'12A');
 for(const ids of [[outsider],[id(99)],[null]])await assert.rejects(()=>save('Invalid',ids));
 await db.query('update users set eligible=false where id=$1',[late]);await assert.rejects(()=>save('Invalid',[late]));await db.query('update users set eligible=true where id=$1',[late]);
 await db.query('update users set is_banned=true where id=$1',[teacher]);await assert.rejects(()=>save('Invalid',[a]));await db.query('update users set is_banned=false where id=$1',[teacher]);
});
test('roster is versioned; stale update fails and retains audited membership history',async()=>{
 await save('October',[a,b,late],batch,1);await assert.rejects(()=>save('Stale',[a],batch,1),/batch_changed/);
 await save('October',[a,b],batch,2);
 assert.equal((await sql('select left_at is not null departed from private.ielts_course_batch_members where batch_id=$1 and student_id=$2',[batch,late])).departed,true);
 const r=(await sql('select rpc_ielts_batch_roster($1) data',[batch])).data;assert.equal(r.revision,3);assert.equal(r.members.length,2);
});
test('batch assignment creation is idempotent, snapshots recipients and exposes batch metadata',async()=>{
 const request=id(20),params=[batch,3,request,'Practice',null,null,JSON.stringify([{skill:'reading',content_type:'ielts_reading_set',content_id:'1',required:true}])];
 const q='select rpc_ielts_batch_create_assignment($1,$2,$3,$4,$5,$6,$7) data';
 assignment=(await sql(q,params)).data;assert.equal(assignment.batch_id,batch);assert.equal(assignment.batch_name,'October');assert.equal(assignment.class_id,null);
 assert.equal((await sql(q,params)).data.id,assignment.id);assert.equal((await sql('select count(*)::integer n from ielts_practice_assignments')).n,1);
 await assert.rejects(()=>sql(q,[batch,2,id(21),'Stale',null,null,'[]']),/batch_changed/);
});
test('allocation retry preserves completed students; late joining does not allocate until explicit catch-up',async()=>{
 const allocated=(await sql('select rpc_ielts_batch_allocate($1) data',[assignment.id])).data;assert.equal(allocated.total_students,2);
 await db.query("update ielts_practice_assignment_students set status='completed' where assignment_id=$1 and student_id=$2",[assignment.id,a]);
 await sql('select rpc_ielts_batch_allocate($1) data',[assignment.id]);assert.equal((await sql('select count(*)::integer n from ielts_practice_assignment_students')).n,2);
 await save('October',[a,b,late],batch,3);assert.equal((await sql('select count(*)::integer n from ielts_practice_assignment_students')).n,2);
 await sql('select rpc_ielts_batch_allocate($1,$2) data',[assignment.id,[late]]);assert.equal((await sql('select count(*)::integer n from ielts_practice_assignment_students')).n,3);
 assert.equal((await sql('select status from ielts_practice_assignment_students where student_id=$1',[a])).status,'completed');
 await assert.rejects(()=>sql('select rpc_ielts_batch_allocate($1,$2)',[assignment.id,[outsider]]));
 await db.query("update ielts_practice_assignments set status='closed' where id=$1",[assignment.id]);await assert.rejects(()=>sql('select rpc_ielts_batch_allocate($1,$2)',[assignment.id,[late]]),/open_batch/);
});
test('batch material usage scopes history to current members and role boundaries fail closed',async()=>{
 const usage=(await sql('select rpc_ielts_batch_material_usage($1,$2) data',[batch,JSON.stringify([{type:'ielts_reading_set',id:'1'}])])).data;
 assert.equal(usage[0].students_count,3);assert.equal(usage[0].completed_count,1);
 await actor(a);for(const q of ['select rpc_ielts_batches($1)','select rpc_ielts_batch_roster($1)','select rpc_ielts_batch_material_usage($1,\'[]\')'])await assert.rejects(()=>db.query(q,[q.includes('batches(')?school:batch]));
 await actor(teacher);await assert.rejects(()=>db.query('select rpc_ielts_batches($1)',[other]));
 assert.equal((await sql("select has_function_privilege('anon','public.rpc_ielts_batch_save(uuid,text,uuid[],uuid,integer)','execute') allowed")).allowed,false);
 assert.equal((await sql("select has_table_privilege('authenticated','private.ielts_course_batch_members','select') allowed")).allowed,false);
});
