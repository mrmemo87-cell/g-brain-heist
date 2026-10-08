import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const student=uid(1), teacher=uid(2), outsider=uid(3), school=uid(4), cls=uid(5), event=uid(6), form=uid(7), def=uid(8), version=uid(9), registry=uid(10), assignment=uid(11), attempt=uid(12);
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.users(id uuid primary key); create table public.schools(id uuid primary key); create table public.classes(id uuid primary key);
create table public.academic_skill_registry_versions(id uuid primary key,status text);
create table public.academic_skill_registry_nodes(id uuid primary key,registry_version_id uuid,node_type text,status text,code text);
create table public.class_teacher_assignments(class_id uuid,school_id uuid,teacher_user_id uuid,active boolean);
create function private.actor_can_access_school_programme(uuid,text,boolean) returns boolean language sql as $$ select auth.uid() in ('${student}'::uuid,'${teacher}'::uuid,'${outsider}'::uuid) $$;
create function public.can_manage_ielts_exam(uuid) returns boolean language sql as $$ select false $$;
`);
const legacy=readFileSync('supabase/migrations/20260515120000_ielts_exam_mode_backend.sql','utf8');
await db.exec(legacy.slice(legacy.indexOf('create table if not exists public.ielts_exam_events'),legacy.indexOf('-- -----------------------------------------------------------------------------\n-- Scale indexes')));
await db.exec(legacy.slice(legacy.indexOf('create or replace function public.rpc_ielts_submit_attempt('),legacy.indexOf('create or replace function public.rpc_ielts_exam_monitoring(')));
await db.exec(readFileSync('supabase/migrations/20261005163109_ielts_governed_evidence_foundation.sql','utf8'));
await db.exec(`insert into users values('${student}'),('${teacher}'),('${outsider}'); insert into schools values('${school}'); insert into classes values('${cls}');
insert into class_teacher_assignments values('${cls}','${school}','${teacher}',true);
insert into academic_skill_registry_versions values('${registry}','published');
insert into ielts_exam_events(id,school_id,title,status,starts_at,ends_at,duration_minutes) values('${event}','${school}','Synthetic test','live',now(),now()+interval '1 hour',60);
insert into ielts_exam_forms(id,exam_event_id,form_code,is_active) values('${form}','${event}','test-only',false);
insert into private.ielts_diagnostic_definitions(id,code,title) values('${def}','test-only','Synthetic test');
insert into private.ielts_diagnostic_versions(id,definition_id,version,exam_form_id,mode,test_type,skills,taxonomy_version_id,scoring_policy_version)
values('${version}','${def}',1,'${form}','screener','academic',array['reading'],'${registry}','ielts-objective-screener-v1');`);
const questions=[];
for(let n=1;n<=8;n++) {
 const node=uid(100+n%3);
 await db.query("insert into academic_skill_registry_nodes values($1,$2,'subskill','active',$3) on conflict do nothing",[node,registry,`construct-${n%3}`]);
 const options=['Alpha','Beta','Gamma','Delta']; const prompt=`Synthetic item ${n}`;
 questions.push({id:`q${n}`,prompt,type:n===8?'short_answer':'multiple_choice',options:n===8?[]:options});
 await db.query(`insert into private.ielts_diagnostic_items(version_id,item_key,task_key,skill,order_index,response_type,prompt,options,accepted_answers,taxonomy_node_id)
 values($1,$2,$3,'reading',$4,'multiple_choice',$5,$6,$7,$8)`,[version,`q${n}`,`task-${n%2}`,n,prompt,JSON.stringify(options),JSON.stringify([options[(n-1)%4]]),node]);
}
await db.query("update private.ielts_diagnostic_items set response_type='short_answer',options='[]',max_words=1 where version_id=$1 and item_key='q8'",[version]);
await db.query('update ielts_exam_forms set reading_payload=$1 where id=$2',[JSON.stringify({title:'Synthetic screener',assessment_mode:'screener',instructions:'Test fixture only',questions}),form]);
const publish=()=>db.query("update private.ielts_diagnostic_versions set state='published' where id=$1",[version]);
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const submit=payload=>db.query("select rpc_ielts_submit_attempt($1,'test-lock',$2,'test-idempotency') result",[attempt,JSON.stringify(payload)]);

test('publication requires review, provenance, taxonomy and safe delivery; immutable snapshots survive taxonomy changes',async()=>{
 await assert.rejects(db.query('update ielts_exam_forms set is_active=true where id=$1',[form]),/diagnostic_not_published/);
 await assert.rejects(publish(),/diagnostic_review_does_not_match_content/);
 await db.query(`update private.ielts_diagnostic_versions set reviewed_by=$1,reviewed_at=now(),
 provenance='{"author":"Synthetic fixture","rights_basis":"Test only","content_version":"1"}',
 review_record='{"human_editorial":true,"answer_key":true,"taxonomy":true,"difficulty":true,"delivery":true,"notes":"Synthetic test approval, never production content."}' where id=$2`,[teacher,version]);
 await db.query("update ielts_exam_forms set reading_payload=reading_payload||'{\"answer_key\":\"leak\"}' where id=$1",[form]);
 await assert.rejects(publish(),/diagnostic_review_does_not_match_content/);
 await db.query("update ielts_exam_forms set reading_payload=reading_payload-'answer_key' where id=$1",[form]);
 await db.query("update private.ielts_diagnostic_versions set review_record=review_record||jsonb_build_object('reviewed_content_hash',encode(sha256(convert_to((private.ielts_diagnostic_snapshot(id)-'version')::text,'UTF8')),'hex')) where id=$1",[version]);
 await publish();
 const v=(await db.query('select * from private.ielts_diagnostic_versions where id=$1',[version])).rows[0];
 assert.match(v.content_hash,/^[a-f0-9]{64}$/); assert.equal(v.published_snapshot.version.state,'published');
 await assert.rejects(db.query("update private.ielts_diagnostic_items set prompt='Changed' where version_id=$1",[version]),/immutable/);
 await assert.rejects(db.query("update ielts_exam_forms set reading_payload='{}' where id=$1",[form]),/immutable/);
 await assert.rejects(db.query("update private.ielts_diagnostic_versions set state='draft' where id=$1",[version]),/immutable/);
 await db.query("update academic_skill_registry_nodes set code='edited-later'");
 await db.query('update ielts_exam_forms set is_active=true where id=$1',[form]);
 await db.query('insert into ielts_exam_assignments(id,exam_event_id,student_id,school_id,class_id,form_id) values($1,$2,$3,$4,$5,$6)',[assignment,event,student,school,cls,form]);
 await db.query("insert into ielts_exam_attempts(id,assignment_id,exam_event_id,student_id,form_id,status,started_at,ends_at,lock_token) values($1,$2,$3,$4,$5,'not_started',null,now()+interval '1 hour','test-lock')",[attempt,assignment,event,student,form]);
 assert.equal((await db.query('select count(*)::int n from private.ielts_diagnostic_attempt_evidence')).rows[0].n,0);
 await db.query("update ielts_exam_attempts set status='in_progress',started_at=now() where id=$1",[attempt]);
 const e=(await db.query('select * from private.ielts_diagnostic_attempt_evidence')).rows[0];
 assert.equal(e.form_snapshot.items[0].taxonomy.code,'construct-1');
 await assert.rejects(db.query('update ielts_exam_attempts set student_id=$1 where id=$2',[outsider,attempt]),/immutable/);
});

test('existing submission path scores on server, ignores browser bands, distinguishes missing and invalid, preserves replay',async()=>{
 await actor(outsider); await assert.rejects(submit({}),/forbidden/);
 await actor(student);
 const payload={reading:{q1:'Alpha',q2:'wrong',q3:'',q4:{forged:true},q5:'Alpha',q6:'Beta',q7:'Gamma',q8:' dELTa '},estimated_band:9,raw_score:999};
 const first=(await submit(payload)).rows[0].result;
 const second=(await submit({reading:{q2:'Beta'}})).rows[0].result;
 assert.equal(first.submission_id,second.submission_id); assert.equal(second.idempotent_replay,true);
 const r=(await db.query('select * from private.ielts_diagnostic_scoring_runs')).rows[0];
 assert.equal(r.raw_score,5); assert.equal(r.marks_possible,8); assert.equal(r.confidence.level,'low');
 assert.equal(r.outcomes[2].response_state,'unanswered'); assert.equal(r.outcomes[3].response_state,'invalid');
 assert.equal((await db.query('select count(*)::int n from private.ielts_diagnostic_responses')).rows[0].n,8);
 await assert.rejects(db.query("update ielts_exam_submissions set payload='{}' where attempt_id=$1",[attempt]),/immutable/);
 await assert.rejects(db.query('update private.ielts_diagnostic_scoring_runs set raw_score=8'),/immutable/);
});

test('result projection is self or exact-class scoped; private keys and scores remain inaccessible',async()=>{
 await actor(outsider); await assert.rejects(db.query('select rpc_ielts_diagnostic_result($1)',[attempt]),/not_authorized/);
 await actor(teacher);
 const result=(await db.query('select rpc_ielts_diagnostic_result($1) result',[attempt])).rows[0].result;
 assert.equal(result.raw_score,5); assert.equal(result.readiness_available,false); assert.equal(result.persistent_weakness_available,false);
 assert.doesNotMatch(JSON.stringify(result),/accepted_answers|answer_key|estimated_band|Alpha/);
 for (const table of ['ielts_diagnostic_items','ielts_diagnostic_versions','ielts_diagnostic_responses','ielts_diagnostic_scoring_runs']) {
  assert.equal((await db.query("select has_table_privilege('authenticated',$1,'select') ok",[`private.${table}`])).rows[0].ok,false);
 }
 assert.equal((await db.query("select has_function_privilege('anon','public.rpc_ielts_diagnostic_result(uuid)','execute') ok")).rows[0].ok,false);
 await db.query('update class_teacher_assignments set active=false');
 await assert.rejects(db.query('select rpc_ielts_diagnostic_result($1)',[attempt]),/not_authorized/);
});

test('Listening audio publication gates and short-answer boundaries are enforced by the real scorer', async () => {
 const form2=uid(201), def2=uid(202), version2=uid(203);
 await db.query("insert into ielts_exam_forms(id,exam_event_id,form_code,is_active) values($1,$2,'listening-fixture',false)",[form2,event]);
 await db.query("insert into private.ielts_diagnostic_definitions(id,code,title) values($1,'listening-fixture','Synthetic Listening fixture')",[def2]);
 await db.query(`insert into private.ielts_diagnostic_versions(id,definition_id,version,exam_form_id,mode,test_type,skills,taxonomy_version_id,scoring_policy_version)
 values($1,$2,1,$3,'screener','shared',array['listening'],$4,'ielts-objective-screener-v1')`,[version2,def2,form2,registry]);
 const qs=[];
 for(let n=1;n<=12;n++) {
  const short=[2,6,11].includes(n), options=short?[]:['First','Second','Third','Fourth'];
  qs.push({id:`s${n}`,prompt:`Synthetic Listening item ${n}${n===6?' — write digits only':''}`,type:short?'short_answer':'multiple_choice',options});
  const keys=n===2?['09:40','9:40','9.40']:n===6?['27']:n===11?['bicycles']:['First'];
  await db.query(`insert into private.ielts_diagnostic_items(version_id,item_key,task_key,skill,order_index,response_type,prompt,options,accepted_answers,max_words,taxonomy_node_id)
  values($1,$2,$3,'listening',$4,$5,$6,$7,$8,$9,$10)`,[version2,`s${n}`,`recording-${Math.ceil(n/4)}`,n,short?'short_answer':'multiple_choice',qs[n-1].prompt,JSON.stringify(options),JSON.stringify(keys),short?1:null,uid(100+n%3)]);
 }
 const url='https://example.com/synthetic-only.mp3';
 await db.query('update ielts_exam_forms set listening_payload=$1 where id=$2',[JSON.stringify({assessment_mode:'screener',title:'Synthetic test',audio_url:url,questions:qs}),form2]);
 await db.query(`update private.ielts_diagnostic_versions set reviewed_by=$1,reviewed_at=now(),provenance='{"author":"Test fixture","rights_basis":"Synthetic test only","content_version":"1"}',review_record='{"human_editorial":true,"answer_key":true,"taxonomy":true,"difficulty":true,"delivery":true,"notes":"Synthetic test fixture, never a production review."}' where id=$2`,[teacher,version2]);
 await db.query("update private.ielts_diagnostic_versions set review_record=review_record||jsonb_build_object('reviewed_content_hash',encode(sha256(convert_to((private.ielts_diagnostic_snapshot(id)-'version')::text,'UTF8')),'hex')) where id=$1",[version2]);
 const publish2=()=>db.query("update private.ielts_diagnostic_versions set state='published' where id=$1",[version2]);
 await assert.rejects(publish2(),/diagnostic_reviewed_audio_required/);
 await db.query('update private.ielts_diagnostic_versions set audio_provenance=$1 where id=$2',[JSON.stringify({human_reviewed:true,rights_basis:'Synthetic fixture only',sha256:'a'.repeat(64),url:'https://example.com/different.mp3'}),version2]);
 await assert.rejects(publish2(),/diagnostic_audio_mismatch/);
 await db.query("update private.ielts_diagnostic_versions set audio_provenance=jsonb_set(audio_provenance,'{url}',to_jsonb($1::text)) where id=$2",[url,version2]);
 await db.query("update academic_skill_registry_versions set status='draft' where id=$1",[registry]);
 await assert.rejects(publish2(),/diagnostic_reviewed_taxonomy_required/);
 await db.query("update academic_skill_registry_versions set status='published' where id=$1",[registry]);
 await publish2();
 await db.query('update ielts_exam_forms set is_active=true where id=$1',[form2]);
 const cases=[
  {responses:{s2:' 9.40 ',s6:'27',s11:' BICYCLES '},score:3,states:['answered','answered','answered']},
  {responses:{s2:'9:30',s6:'twenty seven',s11:'the bicycles'},score:0,states:['answered','answered','answered']},
  {responses:{s2:' ',s6:null,s11:{forged:true}},score:0,states:['unanswered','unanswered','invalid']},
 ];
 for(let i=0;i<cases.length;i++) {
  const user=uid(210+i), ass=uid(220+i), att=uid(230+i);
  await db.query('insert into users values($1)',[user]);
  await db.query('insert into ielts_exam_assignments(id,exam_event_id,student_id,school_id,class_id,form_id) values($1,$2,$3,$4,$5,$6)',[ass,event,user,school,cls,form2]);
  await db.query("insert into ielts_exam_attempts(id,assignment_id,exam_event_id,student_id,form_id,status,started_at,ends_at,lock_token) values($1,$2,$3,$4,$5,'in_progress',now(),now()+interval '1 hour','fixture-lock')",[att,ass,event,user,form2]);
  await actor(user);
  const payload={listening:cases[i].responses,raw_score:999,estimated_band:9};
  const first=(await db.query("select rpc_ielts_submit_attempt($1,'fixture-lock',$2,$3) result",[att,JSON.stringify(payload),`fixture-submit-${i}`])).rows[0].result;
  const replay=(await db.query("select rpc_ielts_submit_attempt($1,'fixture-lock','{}',$2) result",[att,`fixture-submit-${i}`])).rows[0].result;
  assert.equal(first.submission_id,replay.submission_id);
  const run=(await db.query('select * from private.ielts_diagnostic_scoring_runs where attempt_id=$1',[att])).rows[0];
  assert.equal(run.raw_score,cases[i].score); assert.equal(run.marks_possible,12); assert.equal(run.confidence.level,'low');
  for(let j=0;j<3;j++) assert.equal(run.outcomes.find(x=>x.item_key===['s2','s6','s11'][j]).response_state,cases[i].states[j]);
 }
});


test('self-service release reuses real Exam Mode with immutable school context, safe expiry and fail-closed public gates', async () => {
 await db.exec(`alter table users add column school_id uuid; alter table users add column is_banned boolean default false;
 create schema extensions;
 -- Synthetic lock generator only: production retains extensions.gen_random_bytes.
 create function extensions.gen_random_bytes(integer) returns bytea language sql as $$ select decode(repeat('ab',$1),'hex') $$;
 create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
 create function public.school_has_module_access(uuid,text) returns boolean language sql as $$ select false $$;
 create function private.ielts_exam_event_school(uuid) returns uuid language sql as $$ select school_id from public.ielts_exam_events where id=$1 $$;
 create function private.ielts_exam_assignment_school(uuid) returns uuid language sql as $$ select school_id from public.ielts_exam_assignments where id=$1 $$;
 create function private.ielts_exam_attempt_school(uuid) returns uuid language sql as $$ select a.school_id from public.ielts_exam_assignments a join public.ielts_exam_attempts t on t.assignment_id=a.id where t.id=$1 $$;
 alter function public.rpc_ielts_submit_attempt(uuid,text,jsonb,text) rename to rpc_ielts_submit_attempt_entitlement_internal;
 `);
 const launchLegacy=readFileSync('supabase/migrations/20260804152000_ielts_exam_live_launch_safety.sql','utf8');
 const guardStart=launchLegacy.indexOf('create or replace function public.ielts_exam_guard_live_status_transition()');
 const guardEnd=launchLegacy.indexOf('\n$$;',guardStart)+4;
 await db.exec(launchLegacy.slice(guardStart,guardEnd));
 await db.exec(`create trigger test_live_guard before insert or update on public.ielts_exam_events for each row execute function public.ielts_exam_guard_live_status_transition();`);
 const logStart=legacy.indexOf('create or replace function public.rpc_ielts_log_incident(');
 await db.exec(legacy.slice(logStart,legacy.indexOf('\n$$;',logStart)+4).replace('public.rpc_ielts_log_incident(','public.rpc_ielts_log_incident_entitlement_internal('));
 await db.exec(readFileSync('supabase/migrations/20261006093106_ielts_screener_discovery_and_self_start.sql','utf8'));
 await db.exec(`create trigger enforce_ielts_module_row before insert or update or delete on public.ielts_exam_assignments for each row execute function private.enforce_ielts_module_row();`);
 const selfEvent=uid(301),selfForm=uid(302),selfDef=uid(303),selfVersion=uid(304),independent=uid(305),schoolStudent=uid(306),other=uid(307);
 await db.query('insert into users(id,school_id) values($1,null),($2,$3),($4,null)',[independent,schoolStudent,school,other]);
 await db.query("insert into ielts_exam_events(id,title,status,starts_at,ends_at,duration_minutes) values($1,'Synthetic only','draft',now()-interval '1 hour',now()-interval '30 minutes',15)",[selfEvent]);
 await db.query("insert into ielts_exam_forms(id,exam_event_id,form_code,is_active) values($1,$2,'self-test-only',false)",[selfForm,selfEvent]);
 await db.query("insert into private.ielts_diagnostic_definitions(id,code,title) values($1,'self-test-only','Synthetic self-service fixture')",[selfDef]);
 await db.query("insert into private.ielts_diagnostic_versions(id,definition_id,version,exam_form_id,mode,test_type,skills,taxonomy_version_id,scoring_policy_version) values($1,$2,1,$3,'screener','shared',array['listening'],$4,'ielts-objective-screener-v1')",[selfVersion,selfDef,selfForm,registry]);
 const questions=[];
 for(let n=1;n<=12;n++) {
   const options=['Alpha','Beta','Gamma','Delta']; const prompt=`Synthetic self-service item ${n}`;
   questions.push({id:`t${n}`,prompt,type:'multiple_choice',options});
   await db.query("insert into private.ielts_diagnostic_items(version_id,item_key,task_key,skill,order_index,response_type,prompt,options,accepted_answers,taxonomy_node_id) values($1,$2,$3,'listening',$4,'multiple_choice',$5,$6,$7,$8)",[selfVersion,`t${n}`,`recording-${Math.ceil(n/4)}`,n,prompt,JSON.stringify(options),JSON.stringify(['Alpha']),uid(100+n%3)]);
 }
 const sha='a'.repeat(64),url='https://example.com/synthetic-self-test-only.mp3';
 await db.query('update ielts_exam_forms set listening_payload=$1 where id=$2',[JSON.stringify({assessment_mode:'screener',title:'Synthetic self-service',audio_url:url,questions}),selfForm]);
 await db.query(`update private.ielts_diagnostic_versions set reviewed_by=$1,reviewed_at=now(),
   provenance=$2,audio_provenance=$3,review_record=$4 where id=$5`,[teacher,
   JSON.stringify({author:'Synthetic fixture',rights_basis:'Synthetic test only',rights_holder:'Brains Heist LLC',content_version:'1'}),
   JSON.stringify({human_reviewed:true,rights_basis:'Synthetic fixture only',rights_holder:'Brains Heist LLC',sha256:sha,url}),
   JSON.stringify({human_editorial:true,answer_key:true,taxonomy:true,difficulty:true,delivery:true,audio_fidelity:true,reviewed_audio_sha256:sha,notes:'Synthetic fixture, never a production review'}),selfVersion]);
 await db.query("update private.ielts_diagnostic_versions set review_record=review_record||jsonb_build_object('reviewed_content_hash',encode(sha256(convert_to((private.ielts_diagnostic_snapshot(id)-'version')::text,'UTF8')),'hex')) where id=$1",[selfVersion]);
 const hash=(await db.query("select review_record->>'reviewed_content_hash' h from private.ielts_diagnostic_versions where id=$1",[selfVersion])).rows[0].h;
 await assert.rejects(db.query('select private.publish_ielts_screener($1,$2,$3)',[selfVersion,'wrong',sha]),/reviewed_version_mismatch/);
 await actor(independent);
 assert.deepEqual((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result,[]);
 await assert.rejects(db.query("select rpc_ielts_screener_self_assign('self-test-only')"),/screener_unavailable/);
 const published=(await db.query('select private.publish_ielts_screener($1,$2,$3) h',[selfVersion,hash,sha])).rows[0].h;
 // Broad activation cannot use a human content review as device evidence.
 await assert.rejects(db.query("select private.activate_ielts_screener_release($1,'public','{}',$2,'{}')",[selfVersion,teacher]),/screener_controlled_validation_required/);
 await db.query("select private.activate_ielts_screener_release($1,'pilot',$2,$3,'{}')",[selfVersion,[independent,schoolStudent],teacher]);
 assert.equal((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result[0].status,'ready');
 const launch=()=>db.query("select rpc_ielts_screener_self_assign('self-test-only') result");
 const one=(await launch()).rows[0].result,two=(await launch()).rows[0].result;
 assert.equal(one.assignment_id,two.assignment_id);
 const who=(await db.query('select rpc_ielts_exam_whoami($1) result',[selfEvent])).rows[0].result;
 assert.equal(who.allowed,true); assert.equal(who.assignment_id,one.assignment_id);
 assert.doesNotMatch(JSON.stringify(who),/accepted_answers|answer_key|review_record|published_snapshot/);
 const begin=(await db.query('select rpc_ielts_start_attempt($1) result',[one.assignment_id])).rows[0].result;
 const resume=(await db.query('select rpc_ielts_start_attempt($1) result',[one.assignment_id])).rows[0].result;
 assert.equal(begin.attempt_id,resume.attempt_id); assert.equal(begin.ends_at,resume.ends_at);
 assert.equal((await db.query('select school_id from private.ielts_diagnostic_attempt_evidence where attempt_id=$1',[begin.attempt_id])).rows[0].school_id,null);
 const save=(v,payload)=>db.query("select rpc_ielts_autosave_attempt($1,$2,'listening',$3,$4,now()) result",[begin.attempt_id,begin.lock_token,JSON.stringify(payload),v]);
 await save(2,{t1:'Alpha'}); await save(1,{t1:'Beta'}); await save(2,{t1:'Gamma'});
 assert.equal((await db.query('select payload from ielts_exam_drafts where attempt_id=$1',[begin.attempt_id])).rows[0].payload.t1,'Alpha');
 const restored=(await db.query('select rpc_ielts_exam_whoami($1) result',[selfEvent])).rows[0].result;
 assert.equal(restored.drafts[0].payload.t1,'Alpha'); assert.equal(restored.drafts[0].draft_version,2);
 await db.query("update ielts_exam_events set status='paused' where id=$1",[selfEvent]);
 await assert.rejects(save(3,{t1:'Beta'}),/exam_paused/);
 await assert.rejects(db.query('select rpc_ielts_start_attempt($1)',[one.assignment_id]),/exam_not_startable/);
 await db.query("select private.activate_ielts_screener_release($1,'pilot',$2,$3,'{}')",[selfVersion,[independent,schoolStudent],teacher]);
 await actor(other);
 await assert.rejects(db.query('select rpc_ielts_start_attempt($1)',[one.assignment_id]),/school agreement|forbidden/);
 await assert.rejects(db.query('select rpc_ielts_diagnostic_result($1)',[begin.attempt_id]),/not_authorized/);
 assert.deepEqual((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result,[]);
 await actor(schoolStudent);
 const schoolLaunch=(await launch()).rows[0].result;
 const schoolAttempt=(await db.query('select rpc_ielts_start_attempt($1) result',[schoolLaunch.assignment_id])).rows[0].result;
 assert.equal((await db.query('select school_id from private.ielts_diagnostic_attempt_evidence where attempt_id=$1',[schoolAttempt.attempt_id])).rows[0].school_id,school);
 await assert.rejects(db.query('update ielts_exam_assignments set school_id=null where id=$1',[schoolLaunch.assignment_id]),/identity_immutable/);
 await actor(independent);
 const final=await db.query("select rpc_ielts_submit_attempt($1,$2,$3,'synthetic-self-submit') result",[begin.attempt_id,begin.lock_token,JSON.stringify({listening:{t1:'Alpha'},estimated_band:9})]);
 const replay=await db.query("select rpc_ielts_submit_attempt($1,$2,'{}','synthetic-self-submit') result",[begin.attempt_id,begin.lock_token]);
 assert.equal(final.rows[0].result.submission_id,replay.rows[0].result.submission_id);
 const result=(await db.query('select rpc_ielts_diagnostic_result($1) result',[begin.attempt_id])).rows[0].result;
 assert.equal(result.raw_score,1); assert.equal(result.marks_possible,12); assert.equal(result.confidence.level,'low');
 assert.equal(result.readiness_available,false); assert.equal(result.persistent_weakness_available,false);
 assert.doesNotMatch(JSON.stringify(result),/answer_key|accepted_answers|Alpha|transcript|band_estimate/);
 assert.equal((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result[0].status,'completed');
 await actor(schoolStudent);
 await db.query("select rpc_ielts_autosave_attempt($1,$2,'listening',$3,1,now())",[schoolAttempt.attempt_id,schoolAttempt.lock_token,JSON.stringify({t1:'Alpha'})]);
 await db.query("update ielts_exam_attempts set ends_at=now()-interval '1 second' where id=$1",[schoolAttempt.attempt_id]);
 // Late browser answers are ignored and only the saved response is scored.
 await db.query("select rpc_ielts_submit_attempt($1,$2,$3,'expired-self-submit')",[schoolAttempt.attempt_id,schoolAttempt.lock_token,JSON.stringify({listening:{t1:'Beta',t2:'Alpha'}})]);
 assert.equal((await db.query('select rpc_ielts_diagnostic_result($1) result',[schoolAttempt.attempt_id])).rows[0].result.raw_score,1);
 for(const table of ['ielts_screener_releases','ielts_diagnostic_versions','ielts_diagnostic_items','ielts_diagnostic_scoring_runs'])
   assert.equal((await db.query("select has_table_privilege('authenticated',$1,'select') ok",[`private.${table}`])).rows[0].ok,false);
 for(const table of ['ielts_exam_attempts','ielts_exam_assignments','ielts_exam_submissions'])
   assert.equal((await db.query("select has_table_privilege('authenticated',$1,'insert') ok",[`public.${table}`])).rows[0].ok,false);
 for(const rpc of ['public.rpc_ielts_screener_catalog()','public.rpc_ielts_screener_self_assign(text)','private.publish_ielts_screener(uuid,text,text)','private.activate_ielts_screener_release(uuid,text,uuid[],uuid,jsonb)']) {
   assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') ok",[rpc])).rows[0].ok,false);
 }
 assert.equal((await db.query("select has_function_privilege('authenticated','private.activate_ielts_screener_release(uuid,text,uuid[],uuid,jsonb)','execute') ok")).rows[0].ok,false);
 // Only synthetic validated data can pass the public release gate in this test.
 const checks=['authenticated_entitlement','start_resume','audio_loading','reading_intervals','response_intervals','pause_replay','autosave','refresh_resume','network_interruption','background_interruption','submission','idempotency','server_scoring','protected_content','result_safety','completed_persistence','mobile_browser','desktop_browser','automated_checks'];
 const validation={content_hash:published,audio_sha256:sha,tested_at:new Date().toISOString(),evidence_reference:'Synthetic test fixture only',...Object.fromEntries(checks.map(k=>[k,true]))};
 const mismatch={...validation,audio_sha256:'b'.repeat(64)};
 await assert.rejects(db.query("select private.activate_ielts_screener_release($1,'public','{}',$2,$3)",[selfVersion,teacher,JSON.stringify(mismatch)]),/screener_controlled_validation_required/);
 await db.query("select private.activate_ielts_screener_release($1,'public','{}',$2,$3)",[selfVersion,teacher,JSON.stringify(validation)]);
 // Public access uses the canonical programme decision, while own completed results remain readable.
 await db.exec(`create function private.actor_has_programme_access(text,boolean) returns boolean language sql as $$
   select coalesce(current_setting('test.programme_eligible',true),'true')='true' $$;`);
 await db.exec(readFileSync('supabase/migrations/20261006180000_ielts_public_screener_eligibility.sql','utf8'));
 await actor(other);
 await db.query("select set_config('test.programme_eligible','false',false)");
 assert.deepEqual((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result,[]);
 await assert.rejects(launch(),/screener_unavailable/);
 await actor(independent);
 assert.equal((await db.query('select rpc_ielts_diagnostic_result($1) result',[begin.attempt_id])).rows[0].result.raw_score,1);
 await db.query("select set_config('test.programme_eligible','true',false)");
 await actor(other);
 assert.equal((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result[0].status,'ready');
 const expiryLaunch=(await launch()).rows[0].result;
 const expiryAttempt=(await db.query('select rpc_ielts_start_attempt($1) result',[expiryLaunch.assignment_id])).rows[0].result;
 await db.query("update ielts_exam_attempts set ends_at=now()-interval '1 second' where id=$1",[expiryAttempt.attempt_id]);
 assert.equal((await db.query('select rpc_ielts_exam_whoami($1) result',[selfEvent])).rows[0].result.status,'auto_submitted');
 assert.equal((await db.query('select rpc_ielts_diagnostic_result($1) result',[expiryAttempt.attempt_id])).rows[0].result.raw_score,0);
 await db.query('update users set is_banned=true where id=$1',[other]);
 await assert.rejects(launch(),/screener_unavailable/);
});

test.after(()=>db.close());

test('Reading controlled pilot freezes reviewed passages and TFNG keys without claiming public delivery acceptance', async () => {
 await db.exec(readFileSync('supabase/migrations/20261006190000_ielts_reading_controlled_pilot.sql','utf8'));
 const e=uid(501),f=uid(502),d=uid(503),v=uid(504),pilot=uid(305),denied=uid(306);
 await actor(pilot);
 await db.query("insert into ielts_exam_events(id,title,status,starts_at,ends_at,duration_minutes) values($1,'Synthetic Reading','draft',now()-interval '1 hour',now()+interval '1 hour',20)",[e]);
 await db.query("insert into ielts_exam_forms(id,exam_event_id,form_code,is_active) values($1,$2,'reading-only-test',false)",[f,e]);
 await db.query("insert into private.ielts_diagnostic_definitions(id,code,title) values($1,'reading-only-test','Synthetic Reading')",[d]);
 await db.query("insert into private.ielts_diagnostic_versions(id,definition_id,version,exam_form_id,mode,test_type,skills,taxonomy_version_id,scoring_policy_version) values($1,$2,1,$3,'screener','academic',array['reading'],$4,'ielts-objective-screener-v1')",[v,d,f,registry]);
 const questions=[];
 for(let n=1;n<=12;n++) {
  const tfng=n<=3,opts=tfng?['TRUE','FALSE','NOT GIVEN']:['Alpha','Beta','Gamma','Delta'];
  const key=tfng?opts[n-1]:'Alpha',task=n<=6?'one':'two',type=tfng?'true_false_not_given':'multiple_choice';
  questions.push({id:`r${n}`,prompt:`Synthetic reading ${n}`,type,options:opts,passage_id:task});
  await db.query("insert into private.ielts_diagnostic_items(version_id,item_key,task_key,skill,order_index,response_type,prompt,options,accepted_answers,taxonomy_node_id) values($1,$2,$3,'reading',$4,$5,$6,$7,$8,$9)",[v,`r${n}`,task,n,type,`Synthetic reading ${n}`,JSON.stringify(opts),JSON.stringify([key]),uid(100+n%3)]);
 }
 const payload={title:'Synthetic Reading',assessment_mode:'screener',instructions:'Synthetic only',passages:[{id:'one',title:'One',paragraphs:[{label:'A',text:'Original synthetic text one.'}]},{id:'two',title:'Two',paragraphs:[{label:'A',text:'Original synthetic text two.'}]}],questions};
 await db.query('update ielts_exam_forms set reading_payload=$1 where id=$2',[JSON.stringify(payload),f]);
 await db.query("update private.ielts_diagnostic_versions set reviewed_by=$1,reviewed_at=now(),provenance=$2,review_record=$3 where id=$4",[teacher,JSON.stringify({author:'Synthetic only',rights_basis:'Synthetic fixture only',rights_holder:'Brains Heist LLC',content_version:'1'}),JSON.stringify({human_editorial:true,answer_key:true,taxonomy:true,difficulty:true,delivery:false,controlled_pilot:true,notes:'Synthetic academic review; no device acceptance.'}),v]);
 const hash=async()=>{
  const h=(await db.query("select encode(sha256(convert_to((private.ielts_diagnostic_snapshot($1)-'version')::text,'UTF8')),'hex') h",[v])).rows[0].h;
  await db.query("update private.ielts_diagnostic_versions set review_record=review_record||jsonb_build_object('reviewed_content_hash',$1::text) where id=$2",[h,v]);return h;
 };
 await hash();
 await assert.rejects(db.query("update private.ielts_diagnostic_versions set state='published' where id=$1",[v]),/human_review/);
 const invalid=structuredClone(payload);invalid.passages[0].paragraphs[0].accepted_answers=['hidden'];
 await db.query('update ielts_exam_forms set reading_payload=$1 where id=$2',[JSON.stringify(invalid),f]);
 await assert.rejects(db.query('select private.prepare_ielts_reading_pilot($1,$2)',[v,await hash()]),/reading_paragraph_invalid/);
 const missing=structuredClone(payload);missing.questions[0].passage_id='missing';
 await db.query('update ielts_exam_forms set reading_payload=$1 where id=$2',[JSON.stringify(missing),f]);
 await assert.rejects(db.query('select private.prepare_ielts_reading_pilot($1,$2)',[v,await hash()]),/reading_passage_reference_invalid/);
 await db.query('update ielts_exam_forms set reading_payload=$1 where id=$2',[JSON.stringify(payload),f]);
 const h=await hash();
 await db.query('select private.prepare_ielts_reading_pilot($1,$2)',[v,h]);
 const versionRow=(await db.query('select state,published_at,review_record from private.ielts_diagnostic_versions where id=$1',[v])).rows[0];
 assert.equal(versionRow.state,'in_review');assert.equal(versionRow.published_at,null);assert.equal(versionRow.review_record.delivery,false);
 await assert.rejects(db.query("update private.ielts_diagnostic_items set prompt='mutated' where version_id=$1",[v]),/immutable/);
 await assert.rejects(db.query("update ielts_exam_forms set reading_payload='{}' where id=$1",[f]),/immutable/);
 await assert.rejects(db.query("select private.activate_ielts_screener_release($1,'public','{}',$2,'{}')",[v,teacher]),/published_self_service|reading_public/);
 await db.query("select private.activate_ielts_screener_release($1,'pilot',$2,$3,'{}')",[v,[pilot],teacher]);
 await actor(denied);
 await assert.rejects(db.query("select rpc_ielts_screener_self_assign('reading-only-test')"),/screener_unavailable/);
 assert.equal((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result.some(x=>x.code==='reading-only-test'),false);
 await actor(pilot);
 const assigned=(await db.query("select rpc_ielts_screener_self_assign('reading-only-test') result")).rows[0].result;
 const start=(await db.query('select rpc_ielts_start_attempt($1) result',[assigned.assignment_id])).rows[0].result;
 const resume=(await db.query('select rpc_ielts_start_attempt($1) result',[assigned.assignment_id])).rows[0].result;
 assert.equal(start.attempt_id,resume.attempt_id);assert.equal(start.ends_at,resume.ends_at);
 const who=(await db.query('select rpc_ielts_exam_whoami($1) result',[e])).rows[0].result;
 assert.equal(who.form_public_payload.reading_payload.passages.length,2);
 assert.doesNotMatch(JSON.stringify(who),/accepted_answers|review_record/);
 const answers={reading:{r1:'TRUE',r2:'FALSE',r3:'NOT GIVEN',r4:'Alpha',r5:'wrong',r6:''}};
 await db.query("select rpc_ielts_submit_attempt($1,$2,$3,'reading-fixture')",[start.attempt_id,start.lock_token,JSON.stringify(answers)]);
 await db.query("select rpc_ielts_submit_attempt($1,$2,'{}','reading-fixture')",[start.attempt_id,start.lock_token]);
 const result=(await db.query('select rpc_ielts_diagnostic_result($1) result',[start.attempt_id])).rows[0].result;
 assert.equal(result.raw_score,4);assert.equal(result.marks_possible,12);assert.equal(result.confidence.level,'low');
 assert.equal((await db.query('select count(*)::int n from ielts_exam_submissions where attempt_id=$1',[start.attempt_id])).rows[0].n,1);
 assert.equal(result.outcomes.find(x=>x.item_key==='r6').response_state,'unanswered');
 assert.equal(result.readiness_available,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','private.prepare_ielts_reading_pilot(uuid,text)','execute') ok")).rows[0].ok,false);
});

test('Reading publication requires exact delivery evidence and preserves pilot history and canonical eligibility', async () => {
 await db.exec(readFileSync('supabase/migrations/20261007013025_ielts_reading_public_release.sql','utf8'));
 const v=uid(504),e=uid(501),pilot=uid(305),newLearner=uid(306);
 const before=(await db.query('select * from private.ielts_diagnostic_versions where id=$1',[v])).rows[0];
 const evidenceBefore=(await db.query('select * from private.ielts_diagnostic_attempt_evidence where version_id=$1',[v])).rows;
 const checks=['authenticated_entitlement','start_resume','autosave','refresh_resume','network_interruption',
   'background_interruption','submission','idempotency','server_scoring','protected_content','result_safety',
   'completed_persistence','mobile_browser','desktop_browser','automated_checks','delivery_acceptance'];
 // These are synthetic records for exercising gates, never production acceptance.
 const validation={content_hash:before.content_hash,tested_at:new Date().toISOString(),
   evidence_reference:'Synthetic fixture only',...Object.fromEntries(checks.map(k=>[k,true]))};
 const publish=(record=validation,hash=before.content_hash,owner=teacher)=>db.query(
   'select private.publish_ielts_reading_release($1,$2,$3,$4) event',[v,hash,owner,JSON.stringify(record)]);
 await assert.rejects(publish(validation,'wrong'),/reviewed_pilot_required/);
 await assert.rejects(publish(validation,before.content_hash,outsider),/reviewed_pilot_required/);
 await assert.rejects(publish({...validation,content_hash:'wrong'}),/delivery_evidence_required/);
 await assert.rejects(publish({...validation,tested_at:'2999-01-01T00:00:00Z'}),/delivery_evidence_future/);
 for(const key of checks) await assert.rejects(publish({...validation,[key]:false}),new RegExp(`reading_validation_failed:${key}`));
 assert.equal((await db.query('select state from private.ielts_diagnostic_versions where id=$1',[v])).rows[0].state,'in_review');
 await assert.rejects(db.query("update private.ielts_diagnostic_versions set state='published',provenance=provenance||'{\"author\":\"changed\"}' where id=$1",[v]),/immutable/);
 assert.equal((await publish()).rows[0].event,e);
 const after=(await db.query('select * from private.ielts_diagnostic_versions where id=$1',[v])).rows[0];
 assert.equal(after.state,'published');assert.notEqual(after.content_hash,before.content_hash);
 assert.equal(after.review_record.reviewed_content_hash,before.review_record.reviewed_content_hash);
 assert.deepEqual(after.published_snapshot.items,before.published_snapshot.items);
 assert.deepEqual({...after.published_snapshot,version:null},{...before.published_snapshot,version:null});
 assert.deepEqual((await db.query('select * from private.ielts_diagnostic_attempt_evidence where version_id=$1',[v])).rows,evidenceBefore);
 await assert.rejects(db.query("update private.ielts_diagnostic_versions set review_record='{}' where id=$1",[v]),/immutable/);
 await assert.rejects(db.query("update private.ielts_diagnostic_items set prompt='changed' where version_id=$1",[v]),/immutable/);
 await assert.rejects(db.query("update private.ielts_screener_releases set published_content_hash=$1 where version_id=$2",[before.content_hash,v]),/reviewed_version_required|identity_immutable/);
 await actor(pilot);
 const saved=(await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result.find(x=>x.code==='reading-only-test');
 assert.equal(saved.status,'completed');assert.equal(saved.exam_event_id,e);
 assert.equal((await db.query('select rpc_ielts_diagnostic_result($1) result',[evidenceBefore[0].attempt_id])).rows[0].result.raw_score,4);
 await actor(newLearner);
 await db.query("select set_config('test.programme_eligible','false',false)");
 assert.equal((await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result.some(x=>x.code==='reading-only-test'),false);
 await assert.rejects(db.query("select rpc_ielts_screener_self_assign('reading-only-test')"),/screener_unavailable/);
 await db.query("select set_config('test.programme_eligible','true',false)");
 const catalog=(await db.query('select rpc_ielts_screener_catalog() result')).rows[0].result;
 assert.equal(catalog.find(x=>x.code==='reading-only-test').status,'ready');
 assert.equal(catalog.some(x=>x.code==='self-test-only'),true); // Listening remains available.
 const assigned=(await db.query("select rpc_ielts_screener_self_assign('reading-only-test') result")).rows[0].result;
 const start=(await db.query('select rpc_ielts_start_attempt($1) result',[assigned.assignment_id])).rows[0].result;
 const who=(await db.query('select rpc_ielts_exam_whoami($1) result',[e])).rows[0].result;
 assert.equal(who.form_public_payload.reading_payload.passages.length,2);
 assert.doesNotMatch(JSON.stringify(who),/accepted_answers|review_record|published_snapshot/);
 assert.equal((await db.query('select delivery_metadata from private.ielts_diagnostic_attempt_evidence where attempt_id=$1',[start.attempt_id])).rows[0].delivery_metadata.content_hash,after.content_hash);
 for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'private.publish_ielts_reading_release(uuid,text,uuid,jsonb)','execute') ok",[role])).rows[0].ok,false);
});

const writingVersion=uid(701),writingForm=uid(702),writingEvent=uid(703),writingDef=uid(704),writingStudent=uid(705);
let writingStart;
const writingMappings=Object.fromEntries(['task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy'].map((k,i)=>[k,[`writing-fixture-${i}`]]));
test('Writing draft cannot launch; reviewed Task 2 policy freezes exact task and rubric without objective scoring',async()=>{
 await db.exec(`alter table users add column username text; alter table classes add column school_id uuid; alter table classes add column subject text;
 alter table class_teacher_assignments add column subject text;
 create table class_students(class_id uuid,student_id uuid);
 create table school_members(user_id uuid,school_id uuid,status text,role_in_school text);
 create function public.is_superadmin(uuid) returns boolean language sql as $$ select false $$;
 create function private.teacher_current_teaching_groups(uuid,uuid) returns table(id uuid) language sql as $$ select null::uuid where false $$;
 create function private.teacher_current_teaching_roster(uuid,uuid) returns table(student_id uuid,academic_subject_code text,school_subject_name text) language sql as $$ select null::uuid,null::text,null::text where false $$;
 update classes set school_id='${school}',subject='English' where id='${cls}'; update class_teacher_assignments set active=true,subject='English';
 insert into users(id,school_id,username) values('${writingStudent}','${school}','Synthetic Writing learner');
 insert into class_students values('${cls}','${writingStudent}');
 insert into ielts_exam_events(id,title,status,starts_at,ends_at,duration_minutes) values('${writingEvent}','Synthetic Writing','draft',now(),now()+interval '1 year',40);
 insert into ielts_exam_forms(id,exam_event_id,form_code,is_active) values('${writingForm}','${writingEvent}','writing-fixture',false);
 insert into private.ielts_diagnostic_definitions(id,code,title) values('${writingDef}','writing-fixture','Synthetic Writing');`);
 await db.exec(readFileSync('supabase/migrations/20261007041943_ielts_writing_screener_foundation.sql','utf8'));
 for(let i=0;i<4;i++) await db.query("insert into academic_skill_registry_nodes values($1,$2,'subskill','active',$3)",[uid(710+i),registry,`writing-fixture-${i}`]);
 await db.query("insert into private.ielts_diagnostic_versions(id,definition_id,version,exam_form_id,mode,test_type,skills,taxonomy_version_id,scoring_policy_version,provenance) values($1,$2,1,$3,'screener','academic',array['writing'],$4,'ielts-writing-task2-snapshot-v1',$5)",[writingVersion,writingDef,writingForm,registry,JSON.stringify({author:'Synthetic only',rights_holder:'Brains Heist LLC',rights_basis:'Test fixture only',content_version:'1',criterion_mappings:writingMappings})]);
 await db.query("insert into private.ielts_diagnostic_items(version_id,item_key,task_key,skill,order_index,response_type,prompt,taxonomy_node_id) values($1,'essay','task2','writing',1,'writing','Synthetic Task 2 prompt',$2)",[writingVersion,uid(710)]);
 const payload={assessment_mode:'screener',title:'Synthetic Writing',instructions:'Write 250 words; fixture only.',task_type:'academic_task2',minimum_words:250,rubric_version:'bh-ielts-task2-observations-v1',questions:[{id:'essay',prompt:'Synthetic Task 2 prompt',type:'essay'}]};
 await db.query('update ielts_exam_forms set writing_payload=$1 where id=$2',[JSON.stringify(payload),writingForm]);
 const publishWriting=()=>db.query("update private.ielts_diagnostic_versions set state='published' where id=$1",[writingVersion]);
 await assert.rejects(publishWriting(),/writing_human_review_required/);
 await assert.rejects(db.query("select private.activate_ielts_screener_release($1,'pilot',$2,$3,'{}')",[writingVersion,[writingStudent],teacher]),/published_self_service/);
 await db.query("update private.ielts_diagnostic_versions set reviewed_by=$1,reviewed_at=now(),review_record=$2 where id=$3",[teacher,JSON.stringify({human_editorial:true,rubric:true,taxonomy:true,difficulty:true,delivery:true,notes:'Synthetic review only, never real content approval.'}),writingVersion]);
 const hash=async()=>db.query("update private.ielts_diagnostic_versions set review_record=review_record||jsonb_build_object('reviewed_content_hash',private.ielts_writing_review_hash(id)) where id=$1",[writingVersion]);
 await hash();
 const leak={...payload,answer_key:'leak'};await db.query('update ielts_exam_forms set writing_payload=$1 where id=$2',[JSON.stringify(leak),writingForm]);await hash();await assert.rejects(publishWriting(),/writing_delivery_payload_invalid/);
 await db.query('update ielts_exam_forms set writing_payload=$1 where id=$2',[JSON.stringify(payload),writingForm]);await hash();
 await db.query("update private.ielts_diagnostic_versions set provenance=jsonb_set(provenance,'{criterion_mappings,lexical_resource}','[\"unknown\"]') where id=$1",[writingVersion]);
 await assert.rejects(publishWriting(),/does_not_match_content/);await hash();await assert.rejects(publishWriting(),/mapping_invalid/);
 await db.query("update private.ielts_diagnostic_versions set provenance=jsonb_set(provenance,'{criterion_mappings}',$1) where id=$2",[JSON.stringify(writingMappings),writingVersion]);await hash();await publishWriting();
 await assert.rejects(db.query("update private.ielts_diagnostic_versions set provenance='{}' where id=$1",[writingVersion]),/immutable/);
 await assert.rejects(db.query("select private.activate_ielts_screener_release($1,'public','{}',$2,'{}')",[writingVersion,teacher]),/writing_delivery_evidence/);
 await db.query("select private.activate_ielts_screener_release($1,'pilot',$2,$3,'{}')",[writingVersion,[writingStudent],teacher]);await actor(writingStudent);
 const assigned=(await db.query("select rpc_ielts_screener_self_assign('writing-fixture') result")).rows[0].result;
 writingStart=(await db.query('select rpc_ielts_start_attempt($1) result',[assigned.assignment_id])).rows[0].result;
 const resumed=(await db.query('select rpc_ielts_start_attempt($1) result',[assigned.assignment_id])).rows[0].result;
 assert.equal(writingStart.attempt_id,resumed.attempt_id);assert.equal(writingStart.ends_at,resumed.ends_at);
 const essay='Clear opinion 😊. '+Array.from({length:300},(_,i)=>`word${i}`).join(' ')+'\n\nRelevant example.';
 const save=(ver,text)=>db.query("select rpc_ielts_autosave_attempt($1,$2,'writing',$3,$4,now())",[writingStart.attempt_id,writingStart.lock_token,JSON.stringify({essay:text}),ver]);
 await save(2,essay);await save(1,'stale');
 const who=(await db.query('select rpc_ielts_exam_whoami($1) result',[writingEvent])).rows[0].result;
 assert.equal(who.drafts[0].payload.essay,essay);
 const submit=()=>db.query('select rpc_ielts_submit_attempt($1,$2,$3,$4) result',[writingStart.attempt_id,writingStart.lock_token,JSON.stringify({writing:{essay},estimated_band:9,raw_score:99}),'writing-fixture-submit']);
 const first=(await submit()).rows[0].result;const second=(await submit()).rows[0].result;assert.equal(first.submission_id,second.submission_id);
 const result=(await db.query('select rpc_ielts_writing_screener_result($1) result',[writingStart.attempt_id])).rows[0].result;
 assert.equal(result.response_text,essay);assert.equal(result.review_status,'pending');assert.equal(result.word_count,305);assert.equal(result.confidence,'low');assert.equal(result.readiness_available,false);
 assert.equal((await db.query('select count(*)::int n from private.ielts_diagnostic_scoring_runs where attempt_id=$1',[writingStart.attempt_id])).rows[0].n,0);
 assert.doesNotMatch(JSON.stringify(result),/estimated_band|raw_score|marks_possible/);
 await assert.rejects(db.query("update private.ielts_writing_screener_submissions set response_text='changed' where attempt_id=$1",[writingStart.attempt_id]),/immutable/);
 for(const table of ['ielts_writing_screener_submissions','ielts_writing_screener_reviews']) assert.equal((await db.query("select has_table_privilege('authenticated',$1,'select') ok",[`private.${table}`])).rows[0].ok,false);
});

test('Writing teacher observations require exact original evidence, scoped access and append-only idempotent reviews',async()=>{
 await actor(outsider);await assert.rejects(db.query('select rpc_ielts_writing_screener_result($1)',[writingStart.attempt_id]),/not_authorized/);
 await actor(writingStudent);const original=(await db.query('select rpc_ielts_writing_screener_result($1) r',[writingStart.attempt_id])).rows[0].r;
 const obs=Object.fromEntries(Object.keys(writingMappings).map(k=>[k,{status:'developing',comment:'A synthetic task-specific observation with an example.',evidence:[{quote:'Relevant example.',start_char:Array.from(original.response_text.slice(0,original.response_text.indexOf('Relevant example.'))).length,end_char:Array.from(original.response_text).length}]}]));
 const review=(id=uid(720),previous=null,observations=obs,hash=original.response_sha256)=>db.query('select rpc_ielts_submit_writing_screener_review($1,$2,$3,$4,$5,$6,$7) r',[writingStart.attempt_id,id,previous,hash,JSON.stringify(observations),'Practise developing one relevant example.','']);
 await assert.rejects(review(),/not_authorized/);await actor(teacher);
 const bad=structuredClone(obs);bad.task_response.evidence[0].quote='Invented words.';await assert.rejects(review(uid(721),null,bad),/does_not_match_original/);
 await assert.rejects(review(uid(721),null,obs,'a'.repeat(64)),/source_mismatch/);
 const judged=(await review()).rows[0].r;assert.equal(judged.review_status,'teacher_reviewed');assert.equal(judged.confidence,'low');assert.equal(judged.readiness_available,false);
 await review();assert.equal((await db.query('select count(*)::int n from private.ielts_writing_screener_reviews where attempt_id=$1',[writingStart.attempt_id])).rows[0].n,1);
 await assert.rejects(review(uid(722),null),/changed_reload/);await review(uid(722),uid(720));
 assert.equal((await db.query('select count(*)::int n from private.ielts_writing_screener_reviews where attempt_id=$1',[writingStart.attempt_id])).rows[0].n,2);
 await assert.rejects(db.query("update private.ielts_writing_screener_reviews set next_step='changed'"),/immutable/);
 await db.query('update class_teacher_assignments set active=false');await assert.rejects(review(uid(723),uid(722)),/not_authorized/);
 await actor(writingStudent);assert.equal((await db.query('select rpc_ielts_writing_screener_result($1) r',[writingStart.attempt_id])).rows[0].r.review_id,uid(722));
 for(const fn of ['rpc_ielts_writing_screener_result(uuid)','rpc_ielts_writing_screener_review_queue()','rpc_ielts_submit_writing_screener_review(uuid,uuid,uuid,text,jsonb,text,text)']) assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') ok",[`public.${fn}`])).rows[0].ok,false);
});

test('Writing repeat is practice; expiry uses only the latest server draft and keeps blank evidence separate',async()=>{
 await actor(writingStudent);
 const launch=async()=> (await db.query("select rpc_ielts_screener_self_assign('writing-fixture') result")).rows[0].result;
 const begin=async()=> (await db.query('select rpc_ielts_start_attempt($1) result',[(await launch()).assignment_id])).rows[0].result;
 const repeated=await begin();
 await db.query("select rpc_ielts_submit_attempt($1,$2,$3,'repeat-writing')",[repeated.attempt_id,repeated.lock_token,JSON.stringify({writing:{essay:'Practice essay.'}})]);
 assert.equal((await db.query('select rpc_ielts_writing_screener_result($1) r',[repeated.attempt_id])).rows[0].r.evidence_kind,'same_prompt_practice');
 const expired=await begin();
 await db.query("select rpc_ielts_autosave_attempt($1,$2,'writing',$3,1,now())",[expired.attempt_id,expired.lock_token,JSON.stringify({essay:'Last server-saved essay.'})]);
 await db.query("update ielts_exam_attempts set ends_at=now()-interval '1 minute' where id=$1",[expired.attempt_id]);
 await db.query("select rpc_ielts_submit_attempt($1,$2,$3,'expired-writing')",[expired.attempt_id,expired.lock_token,JSON.stringify({writing:{essay:'Forged late changes.'}})]);
 assert.equal((await db.query('select rpc_ielts_writing_screener_result($1) r',[expired.attempt_id])).rows[0].r.response_text,'Last server-saved essay.');
 const blank=await begin();await db.query("select rpc_ielts_submit_attempt($1,$2,'{}','blank-writing')",[blank.attempt_id,blank.lock_token]);
 const result=(await db.query('select rpc_ielts_writing_screener_result($1) r',[blank.attempt_id])).rows[0].r;
 assert.equal(result.response_state,'unanswered');assert.equal(result.word_count,0);assert.equal(result.review_status,'pending');assert.equal(result.readiness_available,false);
});

test('Coached Writing revision is separate, idempotent and cannot rewrite the assessed essay',async()=>{
 await actor(teacher);await assert.rejects(db.query("select rpc_ielts_save_writing_screener_revision($1,$2,$3,'Coached practice essay.')",[writingStart.attempt_id,uid(740),uid(722)]),/not_authorized/);
 await actor(writingStudent);
 const before=(await db.query('select response_sha256 from private.ielts_writing_screener_submissions where attempt_id=$1',[writingStart.attempt_id])).rows[0].response_sha256;
 const revise=()=>db.query("select rpc_ielts_save_writing_screener_revision($1,$2,$3,'Coached practice essay.') r",[writingStart.attempt_id,uid(740),uid(722)]);
 await revise();const result=(await revise()).rows[0].r;
 assert.equal(result.practice_revision.response_text,'Coached practice essay.');assert.equal(result.response_sha256,before);
 assert.equal((await db.query('select count(*)::int n from private.ielts_writing_screener_revisions where attempt_id=$1',[writingStart.attempt_id])).rows[0].n,1);
 await assert.rejects(db.query("select rpc_ielts_save_writing_screener_revision($1,$2,$3,'Changed payload.')",[writingStart.attempt_id,uid(740),uid(722)]),/idempotency_conflict/);
 await assert.rejects(db.query("update private.ielts_writing_screener_revisions set response_text='rewrite'"),/immutable/);
});

test('AI Writing drafts remain private, validate evidence, rate-limit generation and require an authorized teacher confirmation',async()=>{
 await db.exec('update class_teacher_assignments set active=true');
 await db.exec(readFileSync('supabase/migrations/20261007085919_ielts_writing_ai_teacher_drafts.sql','utf8'));
 const claim=(model='fixture-model')=>db.query('select rpc_ielts_claim_writing_ai_draft($1,$2,$3) r',[writingStart.attempt_id,'bh-ielts-task2-simple-feedback-v1',model]);
 await actor(writingStudent);await assert.rejects(claim(),/not_authorized/);
 await actor(outsider);await assert.rejects(claim(),/not_authorized/);
 await actor(teacher);const first=(await claim()).rows[0].r;
 assert.equal(first.claimed,true);assert.equal(first.context.prompt,'Synthetic Task 2 prompt');
 await assert.rejects(claim(),/ai_already_working/);
 const quote='Relevant example.';const start=Array.from(first.context.response_text.slice(0,first.context.response_text.indexOf(quote))).length;
 const fields={observations:Object.fromEntries(Object.keys(writingMappings).map(k=>[k,{status:'developing',comment:'Add a clear example to explain your reason.',evidence:[{quote,start_char:start,end_char:start+quote.length}]}])),next_step:'Add one example. Check that it supports your reason.',delivery_comment:''};
 const bad=structuredClone(fields);bad.observations.task_response.evidence[0].quote='Invented quote.';
 await assert.rejects(db.query('select rpc_ielts_finish_writing_ai_draft($1,$2,$3)',[first.draft_id,JSON.stringify(bad),'fixture-provider']),/ai_quote_invalid/);
 await db.query('select rpc_ielts_finish_writing_ai_draft($1,$2,$3)',[first.draft_id,JSON.stringify(fields),'fixture-provider']);
 const cached=(await claim()).rows[0].r;assert.equal(cached.claimed,false);assert.equal(cached.draft_id,first.draft_id);
 assert.equal(cached.fields.observations.task_response.comment,fields.observations.task_response.comment);
 assert.equal((await db.query('select rpc_ielts_writing_screener_result($1) r',[writingStart.attempt_id])).rows[0].r.review_id,uid(722));
 const confirm=(yes=true,hash=first.response_sha256)=>db.query('select rpc_ielts_submit_ai_assisted_writing_review($1,$2,$3,$4,$5,$6,$7,$8,$9) r',[writingStart.attempt_id,uid(760),uid(722),hash,JSON.stringify(fields.observations),fields.next_step,'',first.draft_id,yes]);
 await assert.rejects(confirm(false),/confirmation_required/);await assert.rejects(confirm(true,'b'.repeat(64)),/confirmation_required/);
 await actor(writingStudent);await assert.rejects(confirm(),/confirmation_required/);
 await actor(teacher);await confirm();await confirm();
 assert.equal((await db.query('select count(*)::int n from private.ielts_writing_ai_review_links where review_id=$1',[uid(760)])).rows[0].n,1);
 await assert.rejects(db.query("update private.ielts_writing_ai_drafts set fields='{}' where id=$1",[first.draft_id]),/immutable/);
 await assert.rejects(db.query('delete from private.ielts_writing_ai_review_links'),/immutable/);
 await db.exec('update class_teacher_assignments set active=false');await assert.rejects(claim(),/not_authorized/);await db.exec('update class_teacher_assignments set active=true');
 for(let n=0;n<5;n++){const pending=(await claim(`fixture-${n}`)).rows[0].r;await db.query('select rpc_ielts_finish_writing_ai_draft($1,null,null)',[pending.draft_id]);}
 await assert.rejects(claim('fixture-limit'),/ai_rate_limit/);
 for(const role of ['anon','authenticated']) {
  assert.equal((await db.query("select has_function_privilege($1,'public.rpc_ielts_finish_writing_ai_draft(uuid,jsonb,text)','execute') ok",[role])).rows[0].ok,false);
  assert.equal((await db.query("select has_table_privilege($1,'private.ielts_writing_ai_drafts','select') ok",[role])).rows[0].ok,false);
 }
 assert.equal((await db.query("select has_function_privilege('service_role','public.rpc_ielts_finish_writing_ai_draft(uuid,jsonb,text)','execute') ok")).rows[0].ok,true);
});
test('Production Writing content seed is draft-only and records no fabricated review or student access',async()=>{
 await db.exec(`alter table academic_skill_registry_versions add column code text; update academic_skill_registry_versions set code='bh-english-core-v1' where id='${registry}';`);
 await db.query("insert into academic_skill_registry_nodes values($1,$2,'subskill','active','eng.writing.content-development.task-relevance')",[uid(750),registry]);
 await db.exec(readFileSync('supabase/migrations/20261007043955_ielts_writing_screener_a_draft.sql','utf8'));
 const v=(await db.query("select v.*,f.is_active,e.status event_status from private.ielts_diagnostic_versions v join private.ielts_diagnostic_definitions d on d.id=v.definition_id join ielts_exam_forms f on f.id=v.exam_form_id join ielts_exam_events e on e.id=f.exam_event_id where d.code='bh-writing-screener-a'")).rows[0];
 assert.equal(v.state,'draft');assert.equal(v.is_active,false);assert.equal(v.event_status,'draft');assert.equal(v.reviewed_by,null);assert.equal(v.published_snapshot,null);
 assert.equal((await db.query('select count(*)::int n from private.ielts_screener_releases where version_id=$1',[v.id])).rows[0].n,0);
 await actor(writingStudent);assert.equal((await db.query('select rpc_ielts_screener_catalog() r')).rows[0].r.some(x=>x.code==='bh-writing-screener-a'),false);
});

test('Writing public release requires every delivery check and retains pilot originals and reviews',async()=>{
 const before=(await db.query('select * from private.ielts_writing_screener_submissions order by attempt_id')).rows;
 const reviews=(await db.query('select * from private.ielts_writing_screener_reviews order by id')).rows;
 const hash=(await db.query('select content_hash from private.ielts_diagnostic_versions where id=$1',[writingVersion])).rows[0].content_hash;
 const checks=['authenticated_entitlement','start_resume','autosave','refresh_resume','network_interruption','background_interruption','submission','idempotency','immutable_original','protected_content','result_safety','teacher_review','review_scope','completed_persistence','mobile_browser','desktop_browser','automated_checks','delivery_acceptance'];
 const validation={content_hash:hash,tested_at:new Date().toISOString(),evidence_reference:'Synthetic release guard fixture only; never production acceptance',...Object.fromEntries(checks.map(k=>[k,true]))};
 const publish=record=>db.query("select private.activate_ielts_screener_release($1,'public','{}',$2,$3)",[writingVersion,teacher,JSON.stringify(record)]);
 for(const k of checks)await assert.rejects(publish({...validation,[k]:false}),new RegExp('writing_validation_failed:'+k));
 await publish(validation);
 assert.deepEqual((await db.query('select * from private.ielts_writing_screener_submissions order by attempt_id')).rows,before);
 assert.deepEqual((await db.query('select * from private.ielts_writing_screener_reviews order by id')).rows,reviews);
 await actor(uid(306));await db.query("select set_config('test.programme_eligible','false',false)");
 assert.equal((await db.query('select rpc_ielts_screener_catalog() r')).rows[0].r.some(x=>x.code==='writing-fixture'),false);
 await assert.rejects(db.query("select rpc_ielts_screener_self_assign('writing-fixture')"),/screener_unavailable/);
 await db.query("select set_config('test.programme_eligible','true',false)");
 assert.equal((await db.query('select rpc_ielts_screener_catalog() r')).rows[0].r.find(x=>x.code==='writing-fixture').status,'ready');
});
