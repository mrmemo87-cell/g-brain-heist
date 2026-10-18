import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Diagnostic Bible 2.0.0 sections 9.5 and 12A against the real migrations, with minimal stubs for the surrounding schema.
const db=new PGlite();
const school='00000000-0000-0000-0000-00000000000a',other='00000000-0000-0000-0000-00000000000b',lead='00000000-0000-0000-0000-000000000001',stu='00000000-0000-0000-0000-000000000002',stu2='00000000-0000-0000-0000-000000000003',outsider='00000000-0000-0000-0000-000000000004',admin='00000000-0000-0000-0000-000000000005';
const batch='10000000-0000-0000-0000-000000000001';
await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,role text,is_banned boolean,full_name text,username text,school_id uuid);
create table public.academic_skill_registry_versions(id uuid primary key default gen_random_uuid(),code text unique,subject_key text,title text,description text,authority_model text,status text,effective_from date,created_at timestamptz default now());
create table public.academic_skill_registry_nodes(id uuid primary key default gen_random_uuid(),registry_version_id uuid,parent_id uuid,node_type text,code text unique,name text,description text,applicable_phases text[],status text default 'active',created_at timestamptz default now(),updated_at timestamptz default now());
create table private.ielts_reviewed_practice(material_type text,material_id text,content jsonb,release_ready boolean);
create table private.ielts_learning_tasks(code text primary key,skill text,purpose text,title text,questions jsonb,version text);
create table private.ielts_learning_allocations(id uuid primary key,student_id uuid,task_code text,created_at timestamptz,status text);
create table private.ielts_learning_submissions(allocation_id uuid,outcomes jsonb,submitted_at timestamptz);
create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid,version_id uuid,student_id uuid,started_at timestamptz);
create table private.ielts_diagnostic_scoring_runs(attempt_id uuid,outcomes jsonb,created_at timestamptz,run_version int,server_verified boolean);
create table private.ielts_course_batches(id uuid primary key,school_id uuid,name text,revision int);
create table private.ielts_course_batch_members(batch_id uuid,student_id uuid,left_at timestamptz);
create function private.ielts_material_code(t text,i text) returns text language sql as $$select null::text$$;
create function private.ielts_batch_assert(p uuid) returns private.ielts_course_batches language plpgsql as $$declare b private.ielts_course_batches;begin select * into b from private.ielts_course_batches where id=p;
 if b.id is null or auth.uid() is distinct from '${lead}'::uuid then raise exception using errcode='42501',message='batch_access_required';end if;return b;end$$;
insert into public.users values('${lead}','teacher',false,'Lead','lead','${school}'),('${stu}','student',false,'Aida','aida','${school}'),('${stu2}','student',false,'Bek','bek','${school}'),('${outsider}','student',false,'Out','out','${other}'),('${admin}','admin',false,'Admin','admin',null);
insert into public.academic_skill_registry_versions(code,subject_key,title,description,authority_model,status) values('bh-english-core-v1','english','x','x','x','published'),('bh-ielts-listening-v1','ielts','x','x','x','published');
insert into public.academic_skill_registry_nodes(registry_version_id,node_type,code,name,description,applicable_phases)
 select (select id from public.academic_skill_registry_versions limit 1),'subskill',c,c,c,array['upper_secondary'] from unnest(array[
 'bh-ielts-listening-v1-explicit-detail','bh-ielts-listening-v1-dates-times','bh-ielts-listening-v1-numerical-information','bh-ielts-listening-v1-paraphrase-recognition','bh-ielts-listening-v1-distractor-resistance','bh-ielts-listening-v1-speaker-attitude',
 'eng.reading.explicit-information.locate-detail','eng.reading.explicit-information.identify-fact','eng.reading.argument-evaluation.claims-evidence','eng.reading.strategy-selection.scan','eng.reading.main-ideas.summary','eng.reading.main-ideas.gist','eng.reading.main-ideas.main-supporting','eng.reading.inference.unstated-meaning','eng.reading.inference.purpose-intention','eng.reading.connections.logical-relations','eng.reading.connections.structure','eng.reading.purpose-viewpoint.viewpoint','eng.reading.multimodal.integrate-modes',
 'eng.writing.argumentation.claim-position','eng.writing.content-development.develop-ideas','eng.writing.content-development.support-examples','eng.writing.organization-cohesion.paragraphing','eng.writing.purpose-register.text-conventions','eng.writing.content-development.task-relevance','eng.writing.purpose-register.register-tone',
 'eng.speaking.interaction.respond-develop','eng.speaking.message-development.expand','eng.speaking.fluency-coherence.sustain','eng.speaking.fluency-coherence.link-ideas','eng.speaking.functional-language.opinions','eng.speaking.functional-language.explaining']) c;
create function private.ielts_batch_manager(s uuid) returns boolean language sql as $$select auth.uid()='${lead}'::uuid and s='${school}'::uuid$$;
insert into private.ielts_course_batches values('${batch}','${school}','October',1);
insert into private.ielts_course_batch_members values('${batch}','${stu}',null),('${batch}','${stu2}',null),('${batch}','${outsider}',null);`);
for(const f of ['20261019060000_ielts_practice_construct_mapping.sql','20261019061000_ielts_construct_mapping_queue_order.sql','20261019070000_ielts_learning_policy_v1.sql','20261019080000_ielts_mock_capture.sql','20261019090000_ielts_official_results.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
const as=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
const marks=n=>'1'.repeat(n)+'0'.repeat(40-n);

test('bh-indicative-v1 follows the published average marks, as a range',async()=>{
 const ind=async(s,r)=>(await one('select private.ielts_indicative_objective($1,$2) j',[s,r])).j;
 assert.equal((await ind('listening',29)).label,'6.0–7.0');assert.equal((await ind('listening',27)).central,6.5);assert.equal((await ind('listening',26)).central,6);
 assert.equal((await ind('listening',33)).label,'7.0–8.0');assert.equal((await ind('reading',15)).central,5);assert.equal((await ind('reading',14)).label,'Below 5.0');
 assert.equal((await ind('listening',38)).label,'8.0 or above');assert.equal((await ind('listening',36)).label,'7.5–8.5');assert.equal(await ind('general_training',30),null);
});
test('Writing needs both tasks with Task 2 weighted double; Speaking needs audio for Pronunciation',async()=>{
 const p=async(s,c)=>(await one('select private.ielts_indicative_productive($1,$2::jsonb) j',[s,JSON.stringify(c)])).j;
 assert.equal((await p('writing',{t1:{ta:5,cc:5,lr:5,gra:5},t2:{tr:7,cc:6.5,lr:6.5,gra:6}})).central,6);
 assert.equal(await p('writing',{t2:{tr:7,cc:6.5,lr:6.5,gra:6}}),null);
 assert.equal(await p('writing',{t1:{ta:5,cc:5,lr:5,gra:5.3},t2:{tr:7,cc:6.5,lr:6.5,gra:6}}),null,'only whole or half bands');
 assert.equal(await p('speaking',{fc:6,lr:6,gra:6,p:6}),null,'no audio, no pronunciation-based range');
 assert.equal((await p('speaking',{fc:6,lr:6,gra:5.5,p:6,audio:true})).label,'5.5–6.5');
});
test('all 240 mock items carry proposed (not approved) constructs',async()=>{
 const r=await one("select count(distinct material_id||item_key)::int items,count(*) filter (where status='proposed')::int proposed,count(*) filter (where status='approved')::int approved from private.ielts_material_construct_maps where material_type='mock'");
 assert.deepEqual(r,{items:240,proposed:437,approved:0});
});
test('capture is limited to the batch manager and to students in the batch school',async()=>{
 await as(stu);await assert.rejects(one("select public.rpc_ielts_mock_sitting_open($1,'IELTS-M1','2026-10-18','paper')",[batch]),/batch_access_required/);
 await as(lead);const {rpc_ielts_mock_sitting_open:sid}=await one("select public.rpc_ielts_mock_sitting_open($1,'IELTS-M1','2026-10-18','paper')",[batch]);
 const again=await one("select public.rpc_ielts_mock_sitting_open($1,'IELTS-M1','2026-10-18','paper') id",[batch]);assert.equal(again.id,sid,'idempotent');
 await assert.rejects(one("select public.rpc_ielts_mock_save($1,$2,'listening',$3,null,null)",[sid,outsider,marks(30)]),/student_not_in_batch/);
 await assert.rejects(one("select public.rpc_ielts_mock_save($1,$2,'listening','111',null,null)",[sid,stu]),/marks_need_40_items/);
 const saved=(await one("select public.rpc_ielts_mock_save($1,$2,'listening',$3,null,null) j",[sid,stu,'1'.repeat(29)+'0'.repeat(9)+'--'])).j;
 assert.equal(saved.raw,29);assert.equal(saved.answered,38);assert.equal(saved.indicative.label,'6.0–7.0');assert.equal(saved.exposed,false);
 await assert.rejects(one("select public.rpc_ielts_mock_save($1,$2,'listening',$3,null,null)",[sid,stu,marks(30)]),/result_changed/,'stale revision is refused');
 const edit=(await one("select public.rpc_ielts_mock_save($1,$2,'listening',$3,null,1) j",[sid,stu,marks(31)])).j;assert.equal(edit.revision,2);
 assert.equal((await one('select count(*)::int n from private.ielts_mock_result_events')).n,2,'every save is kept in the history');
 const view=(await one('select public.rpc_ielts_mock_sitting($1) j',[sid])).j;assert.deepEqual(view.students.map(s=>s.name),['Aida','Bek']);
});
test('a second sitting of the same mock is practice: no range and not independent evidence',async()=>{
 await as(lead);const {id}=await one("select public.rpc_ielts_mock_sitting_open($1,'IELTS-M1','2026-10-19','computer') id",[batch]);
 const r=(await one("select public.rpc_ielts_mock_save($1,$2,'listening',$3,null,null) j",[id,stu,marks(35)])).j;assert.equal(r.exposed,true);assert.equal(r.indicative,null);
});
test('mock item evidence enters the learning record only after the mappings are approved',async()=>{
 const count=async()=>(await one("select count(*)::int n from private.ielts_student_construct_sources($1) where kind='mock'",[stu])).n;
 assert.equal(await count(),0);
 await as(admin);const q=(await one('select public.rpc_ielts_construct_mapping_queue() j')).j.find(b=>b.title.startsWith('Construct mappings: mock'));
 assert.match(q.items[0].item_text,/Question type/);
 await one("select public.rpc_ielts_construct_mapping_decide($1,$2,'approved',$3,'{}','Checked a sample against the keys.')",[q.id,q.sha256,q.items.slice(0,q.minimum_sample).map(i=>i.id)]);
 assert.ok(await count()>0);
 const ind=await one("select bool_and(independent) filter (where source_key like '%:listening') first_only,count(distinct source_key)::int sources from private.ielts_student_construct_sources($1) where kind='mock'",[stu]);
 assert.equal(ind.sources,2);
 const indep=await one("select count(distinct source_key) filter (where independent)::int n from private.ielts_student_construct_sources($1) where kind='mock'",[stu]);assert.equal(indep.n,1);
});

test('official results need consent and a consistent overall; staff verify; outcomes sit beside mock ranges',async()=>{
 const rec=(who,overall=6.5,consent=true)=>(as(who),db.query("select public.rpc_ielts_official_result_record($1,'2026-10-10','academic','computer',7,6.5,6,6.5,$2,'KG',null,$3) id",[stu,overall,consent]));
 await as(stu);await assert.rejects(db.query("select public.rpc_ielts_official_result_record($1,'2026-10-10','academic','computer',7,6.5,6,6.5,6.5,'KG',null,false)",[stu]),/consent_required/);
 await assert.rejects(db.query("select public.rpc_ielts_official_result_record($1,'2026-10-10','academic','computer',7,6.5,6,6.5,7,'KG',null,true)",[stu]),/overall_mismatch/);
 await as(stu2);await assert.rejects(db.query("select public.rpc_ielts_official_result_record($1,'2026-10-10','academic','computer',7,6.5,6,6.5,6.5,'KG',null,true)",[stu]),/not_authorized/,'another student cannot record');
 await as(stu);const {id}=(await db.query("select public.rpc_ielts_official_result_record($1,'2026-10-10','academic','computer',7,6.5,6,6.5,6.5,'KG',null,true) id",[stu])).rows[0];
 await assert.rejects(db.query('select public.rpc_ielts_official_result_verify($1)',[id]),/not_authorized/,'students cannot verify');
 await as(lead);await db.query('select public.rpc_ielts_official_result_verify($1)',[id]);
 const out=(await one('select public.rpc_ielts_batch_outcomes($1) j',[batch])).j.students.find(s=>s.name==='Aida');
 assert.equal(out.official[0].verified,true);assert.equal(out.official[0].overall,6.5);
 assert.ok(out.mock_ranges.some(r=>r.mock==='IELTS-M1'&&r.indicative.label),'the first eligible mock range is shown');
 assert.ok(!out.mock_ranges.some(r=>r.sat_on==='2026-10-19'),'a repeat sitting has no range');
});
