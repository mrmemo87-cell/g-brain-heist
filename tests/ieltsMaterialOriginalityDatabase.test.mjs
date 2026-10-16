import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const admin='00000000-0000-0000-0000-000000000001',student='00000000-0000-0000-0000-000000000002',schoolAdmin='00000000-0000-0000-0000-000000000003';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,role text,is_banned boolean default false);
insert into public.users values('${admin}','superadmin',false),('${student}','student',false),('${schoolAdmin}','school_admin',false);
create table private.ielts_learning_tasks(code text primary key,skill text,title text,content jsonb,questions jsonb,review_record jsonb,audio_sha256 text,purpose text);
create table private.ielts_learning_allocations(task_code text,student_id uuid);
create table private.ielts_learning_content_reviews(task_code text);
create function private.ielts_learning_immutable() returns trigger language plpgsql as $$begin raise exception 'learning_history_is_immutable';end;$$;
create table public.ielts_practice_assignment_items(assignment_id uuid,content_type text,content_id text);
create table public.ielts_practice_assignment_students(assignment_id uuid,student_id uuid);
create table public.ielts_reading_attempts(user_id uuid,set_id bigint);
create table public.ielts_listening_attempts(user_id uuid,set_id bigint);
create table public.ielts_writing_attempts(user_id uuid,task_id bigint);
create table public.ielts_speaking_attempts(user_id uuid,task_id bigint);
create table public.ielts_reading_sets(id bigint primary key,title text,passage_text text,is_active boolean);
create table public.ielts_listening_sets(id bigint primary key,title text,audio_url text,is_active boolean);
create table public.ielts_writing_tasks(id bigint primary key,title text,prompt text,is_active boolean);
create table public.ielts_speaking_tasks(id bigint primary key,slug text,prompt text,follow_ups jsonb,is_active boolean);
create table public.ielts_reading_questions(id bigint primary key,set_id bigint,body text,options jsonb,correct_answer jsonb);
create table public.ielts_listening_questions(id bigint primary key,set_id bigint,body text,options jsonb,correct_answer jsonb);
insert into public.ielts_writing_tasks values(1,'Legacy','Discuss whether cities should protect public parks from development.',true),(2,'Legacy duplicate','Discuss whether cities should protect public parks from development.',true);
insert into public.ielts_reading_sets values(1,'Legacy passage','The city opened a library beside the river in June. Visitors borrowed equipment after a safety briefing.',true);
insert into public.ielts_reading_questions values(1,1,'When did the library open?',null,'["June"]');
insert into public.ielts_listening_sets values(1,'Legacy recording','https://media.example/lesson.mp3?signature=one',true);
insert into public.ielts_listening_questions values(1,1,'Meeting time',null,'["nine"]');
insert into private.ielts_learning_tasks values('protected','writing','Protected prompt','{"prompt":"Explain how volunteering benefits local communities."}','[]','{}',null,'guided_practice');
select set_config('request.jwt.claim.sub','${admin}',false);`);
await db.exec(readFileSync('supabase/migrations/20261009235621_ielts_stable_material_codes.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261010014023_ielts_material_originality_gate.sql','utf8'));
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const check=async(type,id)=>(await db.query('select public.rpc_ielts_material_originality_check($1,$2) d',[type,String(id)])).rows[0].d;
const review=async(type,id,{decision='fresh',rationale='Compared actual content: a different response demand and evidence.',content=true,recording=false,publish=true,parent=null,checked=null}={})=>{
 const c=checked??await check(type,id);
 return db.query('select public.rpc_ielts_material_originality_review($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[type,String(id),c.content_hash,c.match_hash,decision,parent?.material_type??null,parent?.material_id??null,parent?.content_hash??null,rationale,content,recording,publish]);
};
test('inventory preserves existing availability and audits legacy copies without certifying them',async()=>{
 assert.equal((await check('ielts_writing_task',1)).label,'Existing material');
 await db.exec("update public.ielts_writing_tasks set title='Preserved title edit' where id=1");
 assert.equal((await db.query('select count(*) n from public.ielts_writing_tasks where is_active')).rows[0].n,2);
 assert.equal((await db.query('select count(*) n from private.ielts_material_originality_reviews')).rows[0].n,0);
});
test('a renamed, case/punctuation/Unicode/spacing copy is blocked even as a draft',async()=>{
 await assert.rejects(db.query("insert into public.ielts_writing_tasks values(3,'New title',$1,false,null,null)",['Ｄiscuss WHETHER cities should protect public parks from development!!!']),/exact copy of W-/);
});
test('new drafts cannot publish through a raw table update or a forged label',async()=>{
 await db.exec("insert into public.ielts_writing_tasks(id,title,prompt,is_active) values(4,'Fresh','Should universities provide free transport to rural students?',false)");
 await assert.rejects(db.exec("update public.ielts_writing_tasks set is_active=true,originality_label='Originality reviewed' where id=4"),/Originality review required/);
 await assert.rejects(review('ielts_writing_task',4,{content:false}),/Confirm the content/);
 await review('ielts_writing_task',4);
 assert.equal((await check('ielts_writing_task',4)).label,'Originality reviewed');
 await assert.rejects(db.exec("update public.ielts_writing_tasks set prompt=upper(prompt) where id=4"),/Originality review required/);
 await assert.rejects(db.exec("update public.ielts_writing_tasks set prompt='Explain the role of museums in a democratic society.' where id=4"),/Originality review required/);
});
test('near wording is flagged; substantive-difference review is bound to exact content and comparison inventory',async()=>{
 await db.exec("insert into public.ielts_writing_tasks(id,title,prompt,is_active) values(5,'Near','Should universities provide affordable transport to rural students?',false)");
 const c=await check('ielts_writing_task',5);assert.ok(c.matches.some(m=>m.reason==='similar_content'));
 await db.exec("update public.ielts_writing_tasks set prompt='Should universities provide affordable transport to rural students and teachers?' where id=5");
 await assert.rejects(review('ielts_writing_task',5,{checked:c}),/changed/);
 const newer=await check('ielts_writing_task',5);
 await db.exec("insert into public.ielts_writing_tasks(id,title,prompt,is_active) values(6,'Other near','Should universities provide accessible transport to rural students and teachers?',false)");
 await assert.rejects(review('ielts_writing_task',5,{checked:newer}),/changed/);
});
test('reused passage requires a linked variant; exact complete copied questions remain blocked',async()=>{
 await db.exec("insert into public.ielts_reading_sets(id,title,passage_text,is_active) select 2,'Variant',passage_text,false from public.ielts_reading_sets where id=1");
 await db.exec("insert into public.ielts_reading_questions values(2,2,'Where did the library open?',null,'[\"beside the river\"]')");
 const c=await check('ielts_reading_set',2);assert.equal(c.matches[0].reason,'shared_text');
 await assert.rejects(review('ielts_reading_set',2),/declared as a variant/);
 await assert.rejects(review('ielts_reading_set',2,{decision:'variant'}),/Choose a matching parent/);
 await review('ielts_reading_set',2,{decision:'variant',parent:c.matches[0]});
 assert.match((await check('ielts_reading_set',2)).label,/Variant of R-001.*repeat practice/);
 await assert.rejects(db.exec("update public.ielts_reading_questions set body='When did the library open?',correct_answer='[\"June\"]' where id=2"),/exact copy/);
 assert.equal((await db.query('select body from public.ielts_reading_questions where id=2')).rows[0].body,'Where did the library open?');
});
test('deferred question checks allow a complete replacement and invalidate old publication approval',async()=>{
 await db.exec("begin;update public.ielts_reading_sets set is_active=false where id=2;delete from public.ielts_reading_questions where set_id=2;insert into public.ielts_reading_questions values(3,2,'What was needed before borrowing equipment?',null,'[\"a safety briefing\"]');commit;");
 assert.equal((await check('ielts_reading_set',2)).label,null);
 await assert.rejects(db.exec('update public.ielts_reading_sets set is_active=true where id=2'),/Originality review required/);
});
test('listening detects signed URL reuse, requires a private script and human recording review',async()=>{
 await db.exec("insert into public.ielts_listening_sets(id,title,audio_url,is_active) values(2,'Listening variant','https://media.example/lesson.mp3?signature=two',false);insert into public.ielts_listening_questions values(2,2,'Meeting place',null,'[\"station\"]');");
 assert.ok((await check('ielts_listening_set',2)).matches.some(m=>m.reason==='shared_recording'));
 await assert.rejects(review('ielts_listening_set',2,{recording:false}),/actual recording/);
 await assert.rejects(review('ielts_listening_set',2,{recording:true}),/private listening transcript/);
 await db.query('select rpc_ielts_material_set_transcript($1,$2)',['2','Meet at the station at nine. The bus leaves at ten.']);
 const c=await check('ielts_listening_set',2);
 await review('ielts_listening_set',2,{recording:true,decision:'variant',parent:c.matches[0]});
 assert.match((await check('ielts_listening_set',2)).label,/repeat practice/);
 assert.equal((await db.query("select count(*) n from information_schema.columns where table_schema='public' and column_name='originality_transcript'")).rows[0].n,0);
 await assert.rejects(db.query('select rpc_ielts_material_set_transcript($1,$2)',['2','changed script']),/Save this material as a draft/);
});
test('ordinary students, banned admins and school admins cannot inspect protected targeted content',async()=>{
 await actor(student);await assert.rejects(check('ielts_writing_task',4),/forbidden/);
 await actor(schoolAdmin);await assert.rejects(check('targeted','protected'),/forbidden/);
 await actor(admin);await db.exec(`update public.users set is_banned=true where id='${admin}'`);await assert.rejects(check('ielts_writing_task',4),/forbidden/);await db.exec(`update public.users set is_banned=false where id='${admin}'`);
 await db.exec("set role authenticated");await assert.rejects(db.exec('select * from private.ielts_material_transcripts'),/permission denied/);await assert.rejects(db.exec("select private.ielts_originality_payload('targeted','protected')"),/permission denied/);await db.exec('reset role');
});
test('fingerprints retain previous versions and reviews cannot be rewritten',async()=>{
 await db.exec("update public.ielts_writing_tasks set is_active=false where id=4;update public.ielts_writing_tasks set prompt='Explain how museums preserve endangered languages.' where id=4");
 assert.equal((await db.query("select count(*) n from private.ielts_material_fingerprints where material_type='ielts_writing_task' and material_id='4'")).rows[0].n,2);
 await assert.rejects(db.exec("insert into public.ielts_writing_tasks(id,title,prompt,is_active) values(8,'Old copy','Should universities provide free transport to rural students?',false)"),/exact copy/);
 await assert.rejects(db.exec("update private.ielts_material_originality_reviews set rationale='rewritten'"),/immutable/);
});
test('new targeted tasks cannot be approved or allocated before review; variants cannot be independent checks',async()=>{
 await db.exec(`insert into private.ielts_learning_tasks(code,skill,title,content,questions,review_record,purpose) values('new-targeted','writing','New','{"prompt":"Explain how volunteering benefits local communities and schools."}','[]','{}','independent_check')`);
 await assert.rejects(db.exec("insert into private.ielts_learning_content_reviews values('new-targeted')"),/Originality review required/);
 await assert.rejects(db.exec("insert into private.ielts_learning_allocations(task_code) values('new-targeted')"),/Originality review required/);
 const c=await check('targeted','new-targeted');assert.ok(c.matches.length);
 await assert.rejects(review('targeted','new-targeted',{publish:false,decision:'variant',parent:c.matches[0]}),/guided repeat practice/);
 await review('targeted','new-targeted',{publish:false});
 await db.exec("insert into private.ielts_learning_content_reviews values('new-targeted');insert into private.ielts_learning_allocations(task_code) values('new-targeted')");
});
test('incomplete drafts do not prevent a second intentional passage variant from being completed',async()=>{
 await db.exec("insert into public.ielts_reading_sets(id,title,passage_text,is_active) select 3,'Second variant',passage_text,false from public.ielts_reading_sets where id=1;insert into public.ielts_reading_questions values(4,3,'What did visitors borrow?',null,'[\"equipment\"]');");
 const c=await check('ielts_reading_set',3);assert.ok(c.matches.some(m=>m.reason==='shared_text'));assert.equal(c.matches.some(m=>m.reason==='exact_copy'),false);
});
test('school allocation blocks an unreviewed draft and a review invalidated by related inventory',async()=>{
 await assert.rejects(db.exec("insert into public.ielts_practice_assignment_items values(gen_random_uuid(),'ielts_reading_set','3')"),/Originality review required/);
 await assert.rejects(db.exec("insert into public.ielts_practice_assignment_items values(gen_random_uuid(),'ielts_writing_task','5')"),/Originality review required/);
});
test('prior practice with a cross-catalogue variant blocks a supposedly unseen original check',async()=>{
 await db.exec(`insert into public.ielts_writing_tasks(id,title,prompt,is_active) values(9,'Linked practice','Explain how volunteering benefits local communities and schools. Include an example of a practical project.',false)`);
 const c=await check('ielts_writing_task',9),parent=c.matches.find(m=>m.material_type==='targeted'&&m.material_id==='new-targeted');assert.ok(parent);
 await review('ielts_writing_task',9,{decision:'variant',parent});
 await db.exec(`insert into public.ielts_writing_attempts values('${student}',9)`);
 // A declared child does not revoke the original's valid review. Family exposure still protects each student.
 assert.equal((await check('targeted','new-targeted')).label,'Originality reviewed');
 await db.exec("insert into private.ielts_learning_allocations values('new-targeted','00000000-0000-0000-0000-000000000099')");
 await assert.rejects(db.exec(`insert into private.ielts_learning_allocations values('new-targeted','${student}')`),/already been exposed/);
});
test('retired material retains its fingerprint and code without breaking historical label reads',async()=>{
 await db.exec('delete from public.ielts_reading_sets where id=3');
 assert.equal((await db.query("select private.ielts_originality_label('ielts_reading_set','3') label")).rows[0].label,null);
 assert.ok((await db.query("select content_hash from private.ielts_material_fingerprints where material_id='3' and material_type='ielts_reading_set'")).rows.length);
 assert.equal((await db.query("select private.ielts_originality_label('ielts_full_mock_test','1') label")).rows[0].label,null);
});
test('accepted-answer alternative order and case cannot disguise an exact copy',async()=>{
 await db.exec("insert into public.ielts_reading_sets(id,title,passage_text,is_active) select 4,'Copy attempt',passage_text,false from public.ielts_reading_sets where id=1");
 await assert.rejects(db.exec("insert into public.ielts_reading_questions values(8,4,'When did the library open?',null,'[\"june\",\"June\"]')"),/exact copy/);
});
test('a banned content administrator cannot edit through legacy content routes',async()=>{
 await actor(admin);await db.exec(`update public.users set is_banned=true where id='${admin}'`);
 await assert.rejects(db.exec("update public.ielts_reading_sets set title='Banned edit' where id=1"),/forbidden/);
 await assert.rejects(db.exec("delete from public.ielts_reading_questions where set_id=1"),/forbidden/);
 await db.exec(`update public.users set is_banned=false where id='${admin}'`);
});
test.after(()=>db.close());
