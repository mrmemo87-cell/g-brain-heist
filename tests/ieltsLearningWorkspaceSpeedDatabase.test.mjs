import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Teacher Today (2026-11-21): rpc_ielts_learning_workspace timed out (57014) because each task's originality work ran
// up to five times. The new version must return exactly the same JSON and call the expensive label work once per task.
const db=new PGlite();
const T='00000000-0000-0000-0000-0000000000a1',S='00000000-0000-0000-0000-0000000000b1',SCH='00000000-0000-0000-0000-0000000000c1',N='00000000-0000-0000-0000-0000000000d1';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,username text,is_banned boolean default false);
insert into public.users values('${T}','teacher',false),('${S}','student',false);
create table public.school_members(school_id uuid,user_id uuid,status text);insert into public.school_members values('${SCH}','${S}','active');
create table public.academic_skill_registry_nodes(id uuid primary key,name text);insert into public.academic_skill_registry_nodes values('${N}','Main idea');
create table private.calls(n int);insert into private.calls values(0);
create function public.can_manage_ielts_practice_school(s uuid) returns boolean language sql stable as $$select auth.uid()='${T}'::uuid$$;
create function private.ielts_speaking_student_eligible(u uuid) returns boolean language sql stable as $$select true$$;
create function private.ielts_practice_material_allowed(t text,c text) returns boolean language sql stable as $$select c<>'BLOCKED'$$;
create function private.ielts_material_code(t text,c text) returns text language sql stable as $$select 'BH-'||c$$;
create function private.ielts_originality_payload(t text,c text) returns jsonb language sql stable as $$select jsonb_build_object('content_hash','h-'||c)$$;
create function private.ielts_originality_label(t text,c text,p jsonb default null) returns text language plpgsql as $$begin update private.calls set n=n+1; return case when c like 'NOLABEL%' then null else 'Originality reviewed' end; end$$;
create table private.ielts_learning_tasks(code text primary key,version int,title text,skill text,purpose text,success_description text,instructions text,content jsonb,content_sha256 text,requires_review boolean,questions jsonb,pilot_student uuid,audio_sha256 text);
create table private.ielts_learning_releases(task_code text,version int,audio_sha256 text,exact_content_hash text);
create table private.ielts_learning_content_reviews(school_id uuid,task_code text,content_sha256 text);
create table private.ielts_learning_allocations(id uuid primary key,task_code text,student_id uuid,school_id uuid,status text,reason text,due_at timestamptz,created_at timestamptz);
create table private.ielts_learning_reviews(allocation_id uuid);
create function private.can_access_ielts_learning(a uuid) returns boolean language sql stable as $$select true$$;
create function private.ielts_learning_publicly_released(p_task text) returns boolean language sql stable security definer set search_path to '' as $$
 select exists(select 1 from private.ielts_learning_releases r join private.ielts_learning_tasks t on t.code=r.task_code
 where t.code=p_task and t.version=r.version and t.audio_sha256 is not distinct from r.audio_sha256
 and r.exact_content_hash=private.ielts_originality_payload('targeted',t.code)->>'content_hash'
 and private.ielts_originality_label('targeted',t.code) is not null)$$;
insert into private.ielts_learning_tasks values
 ('R1',1,'Released','reading','p','s','i','{"a":1}','c1',true,'[{"id":"q1","taxonomy_node_id":"${N}","supporting_node_id":"${N}"}]',null,null),
 ('P1',1,'Pilot','listening','p','s','i','{}','c2',true,'[]','${S}','au'),
 ('V1',1,'Reviewed here','writing','p','s','i','{}','c3',true,'[]','${S}',null),
 ('NOLABEL1',1,'No label','reading','p','s','i','{}','c4',false,'[]','${S}',null),
 ('BLOCKED',1,'Blocked','reading','p','s','i','{}','c5',false,'[]','${S}',null),
 ('OLD1',2,'Old release','reading','p','s','i','{}','c6',true,'[]',null,null);
insert into private.ielts_learning_releases values('R1',1,null,'h-R1'),('OLD1',1,null,'h-OLD1'),('NOLABEL1',1,null,'h-NOLABEL1');
insert into private.ielts_learning_content_reviews values('${SCH}','V1','c3');
insert into private.ielts_learning_allocations values('00000000-0000-0000-0000-000000000e01','R1','${S}','${SCH}','submitted',null,null,'2026-11-01'),('00000000-0000-0000-0000-000000000e02','P1','${S}','${SCH}','assigned','x',null,'2026-11-02');
insert into private.ielts_learning_reviews values('00000000-0000-0000-0000-000000000e01');`);
// Previous production definition (2026-10-15), kept verbatim for the equality check.
await db.exec(`create function public.old_workspace(p_school uuid default null) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare manager boolean; tasks jsonb; allocations jsonb;
begin
 manager:=p_school is not null and public.can_manage_ielts_practice_school(p_school);
 if auth.uid() is null or coalesce((select is_banned from public.users where id=auth.uid()),true) or (p_school is not null and not manager) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not manager and not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'released',private.ielts_learning_publicly_released(t.code),'pilot_student',t.pilot_student,'pilot_student_name',(select username from public.users where id=t.pilot_student),'version',t.version,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'originality_label',private.ielts_originality_label('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'success_description',t.success_description,'instructions',t.instructions,'content',t.content,'content_sha256',t.content_sha256,'requires_review',t.requires_review,
 'approved',(not t.requires_review or private.ielts_learning_publicly_released(t.code) or exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=t.code and r.content_sha256=t.content_sha256)) and private.ielts_originality_label('targeted',t.code) is not null,
 'questions',(select jsonb_agg(q||jsonb_build_object('primary_name',n.name,'supporting_name',s.name) order by q->>'id') from jsonb_array_elements(t.questions) q join public.academic_skill_registry_nodes n on n.id=(q->>'taxonomy_node_id')::uuid join public.academic_skill_registry_nodes s on s.id=(q->>'supporting_node_id')::uuid)) order by t.skill,t.code),'[]') into tasks
 from private.ielts_learning_tasks t where manager and private.ielts_practice_material_allowed('targeted',t.code) and (private.ielts_learning_publicly_released(t.code) or exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active'));
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'task_code',a.task_code,'student_id',a.student_id,'assigned_at',a.created_at,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'originality_label',private.ielts_originality_label('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'status',a.status,'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',not exists(select 1 from private.ielts_learning_tasks t where private.ielts_learning_publicly_released(t.code)));
end; $function$;`);
await db.exec(readFileSync('supabase/migrations/20261121050000_ielts_learning_workspace_speed.sql','utf8'));
const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const calls=async()=>(await db.query('select n from private.calls')).rows[0].n;
const run=async(fn,school)=>{await db.query('update private.calls set n=0');const j=(await db.query(`select public.${fn}($1) j`,[school])).rows[0].j;return {j,calls:await calls()};};
test('teacher workspace: identical JSON, label work once per task',async()=>{
 await as(T);
 const old=await run('old_workspace',SCH),now=await run('rpc_ielts_learning_workspace',SCH);
 assert.deepEqual(now.j,old.j);
 assert.deepEqual(now.j.tasks.map(t=>[t.code,t.released,t.approved]),[['P1',false,false],['NOLABEL1',false,false],['R1',true,true],['V1',false,true]]);
 assert.equal(now.j.pilot_only,false);
 assert.ok(now.calls<=6,`label calls ${now.calls} (old: ${old.calls})`);
 assert.ok(old.calls>=3*now.calls);
});
test('student workspace and access are unchanged',async()=>{
 await as(S);
 const old=await run('old_workspace',null),now=await run('rpc_ielts_learning_workspace',null);
 assert.deepEqual(now.j,old.j);
 await assert.rejects(db.query('select public.rpc_ielts_learning_workspace($1)',[SCH]),/not_authorized/);
});
