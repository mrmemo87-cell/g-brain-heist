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
