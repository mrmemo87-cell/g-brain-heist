import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = readdirSync('supabase/migrations').find(p => p.endsWith('_ielts_starting_point_summary.sql'));
assert.ok(migration, 'The committed summary migration must exist');
const sql = readFileSync(`supabase/migrations/${migration}`, 'utf8');
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const student=id(1), other=id(2), banned=id(3), teacher=id(4);
await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table users(id uuid primary key,username text,role text,is_banned boolean,school_id uuid,eligible boolean);
insert into users values('${student}','Synthetic student','student',false,'${id(900)}',true),('${other}','Other school student','student',false,'${id(901)}',true),('${banned}','Banned student','student',true,'${id(900)}',true),('${teacher}','Teacher','teacher',false,'${id(900)}',true);
create function private.ielts_speaking_student_eligible(uuid) returns boolean language sql as $$ select exists(select 1 from public.users where id=$1 and role='student' and not is_banned and eligible) $$;
create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid primary key, student_id uuid);
create table private.ielts_diagnostic_scoring_runs(attempt_id uuid,raw_score int,marks_possible int,server_verified boolean,run_version int,created_at timestamptz);
create table private.ielts_writing_screener_submissions(attempt_id uuid primary key,word_count int,submitted_at timestamptz,evidence_kind text,response_sha256 text);
create table private.ielts_writing_screener_reviews(id uuid,attempt_id uuid,reviewed_by uuid,reviewed_at timestamptz,next_step text,delivery_comment text,criterion_observations jsonb,response_sha256 text,run_version int);
create table private.ielts_speaking_sessions(id uuid primary key,student_id uuid,status text,submitted_at timestamptz,created_at timestamptz,evidence_kind text);
create table private.ielts_speaking_reviews(id uuid,session_id uuid,reviewer_id uuid,teacher_confirmed boolean,reviewed_at timestamptz,fields jsonb);
create table private.ielts_speaking_incidents(session_id uuid);
create function private.can_access_ielts_speaking(uuid) returns boolean language sql as $$select exists(select 1 from private.ielts_speaking_sessions where id=$1 and student_id=auth.uid())$$;
create function private.ielts_screener_integrity_incident(uuid) returns boolean language sql as $$select false$$;
create table private.fixture_catalog(student_id uuid, value jsonb);
create function rpc_ielts_screener_catalog() returns jsonb language sql as $$ select coalesce((select value from private.fixture_catalog where student_id=auth.uid()),'[]') $$;
create function rpc_ielts_speaking_workspace(uuid,text) returns jsonb language sql as $$select '{"available":true}'::jsonb$$;
insert into private.ielts_diagnostic_attempt_evidence values('${id(10)}','${student}'),('${id(11)}','${student}'),('${id(12)}','${other}');
insert into private.ielts_diagnostic_scoring_runs values('${id(10)}',8,12,true,1,now()),('${id(10)}',9,12,true,2,now()),('${id(12)}',12,12,true,1,now());
insert into private.ielts_writing_screener_submissions values('${id(11)}',250,now(),'first_sitting','original-hash');
insert into private.ielts_speaking_sessions values('${id(20)}','${student}','submitted',now(),now(),'first_sitting'),('${id(21)}','${other}','submitted',now(),now(),'first_sitting');`);
await db.query('insert into private.fixture_catalog values($1,$2)',[student,JSON.stringify([{code:'bh-listening-screener-a',status:'completed',attempt_id:id(10)},{code:'bh-writing-screener-a',status:'completed',attempt_id:id(11)},{code:'bh-reading-screener-a',status:'completed',attempt_id:id(12)}])]);
await db.exec(sql);
await db.exec(`alter table private.ielts_diagnostic_scoring_runs add outcomes jsonb default '[]', add confidence jsonb default '{"items_answered":12}';
create function public.rpc_ielts_diagnostic_result(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.ielts_diagnostic_scoring_runs%rowtype;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from private.ielts_diagnostic_attempt_evidence where attempt_id=p_attempt_id and student_id=auth.uid()) then raise exception 'not_authorized'; end if;
 select * into r from private.ielts_diagnostic_scoring_runs where attempt_id=p_attempt_id order by run_version desc limit 1;
 return jsonb_build_object('raw_score',r.raw_score,'outcomes',r.outcomes,'next_step','Review the sampled items with your teacher, then gather evidence in the remaining skills.',
 'readiness_available',false);
end; $$;`);
const programmeSql = readFileSync('supabase/migrations/20261007130709_ielts_programme_workspace.sql','utf8');
await db.exec(programmeSql.slice(programmeSql.indexOf('create function public.rpc_ielts_programme_workspace('),programmeSql.indexOf('revoke all on function public.rpc_ielts_programme_workspace(')));
const coverageMigration = readdirSync('supabase/migrations').find(p => p.endsWith('_ielts_screener_response_coverage.sql'));
const coverageSql = readFileSync(`supabase/migrations/${coverageMigration}`, 'utf8');
const originalSummary = (await db.query("select pg_get_functiondef('public.rpc_ielts_starting_point_summary()'::regprocedure) d")).rows[0].d;
await db.exec(coverageSql);
const actor = u => db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
const read = async () => (await db.query('select rpc_ielts_starting_point_summary() as value')).rows[0].value;
test('self-only projection shows latest trusted raw scores, pending work and no cross-school data', async () => {
 await actor(student); const r=await read();
 assert.equal(r.results.listening.raw_score,9); assert.equal(r.results.listening.items_answered,12); assert.equal(r.results.reading,null);
 assert.equal(r.results.writing.review,null); assert.equal(r.results.speaking.attempt_id,id(20));
 assert.equal(r.band_estimate,null); assert.equal(r.readiness_available,false); assert.equal(r.confidence,'low');
 assert.equal(JSON.stringify(r).includes('original-hash'),false);
});
test('only confirmed teacher reviews of the original work are projected, never excerpts or AI drafts', async () => {
 const observations={task_response:{status:'developing',comment:'Explain your example.',evidence:[{quote:'PRIVATE EXCERPT',start_char:0,end_char:10}]}};
 await db.query('insert into private.ielts_writing_screener_reviews values($1,$2,$3,now(),$4,$5,$6,$7,1)',[id(30),id(11),teacher,'Practise explaining an example.','',JSON.stringify(observations),'original-hash']);
 await db.query('insert into private.ielts_writing_screener_reviews values($1,$2,$3,now(),$4,$5,$6,$7,2)',[id(31),id(11),teacher,'Wrong response review.','',JSON.stringify(observations),'different-hash']);
 await db.query('insert into private.ielts_speaking_reviews values($1,$2,$3,false,now(),$4)',[id(32),id(20),teacher,JSON.stringify({next_step:'Unconfirmed draft',observations})]);
 await actor(student); let r=await read();
 assert.equal(r.results.writing.review.id,id(30)); assert.equal(r.results.writing.review.reviewer_name,'Teacher');
 assert.equal(r.results.speaking.review,null); assert.equal(JSON.stringify(r).includes('PRIVATE EXCERPT'),false);
 await db.query('insert into private.ielts_speaking_reviews values($1,$2,$3,true,now(),$4)',[id(33),id(20),teacher,JSON.stringify({next_step:'Explain a reason.',delivery_comment:'',observations})]);
 r=await read(); assert.equal(r.results.speaking.review.id,id(33));
});
test('active interview takes priority without counting previous work as another completed skill',async()=>{
 await db.query('insert into private.ielts_speaking_sessions values($1,$2,$3,null,now(),$4)',[id(22),student,'in_progress','same_form_practice']);
 await actor(student); const r=await read(); assert.equal(r.results.speaking.attempt_id,id(22)); assert.equal(r.results.speaking.review,null);
});
test('anonymous, banned, non-student and revoked membership are denied; another student sees only self',async()=>{
 for(const user of ['',banned,teacher]) {await actor(user); await assert.rejects(read(),/not_authorized/);}
 await db.query('update users set eligible=false where id=$1',[student]); await actor(student); await assert.rejects(read(),/not_authorized/);
 await actor(other); const r=await read(); assert.deepEqual(r.catalog,[]); assert.equal(r.results.writing,undefined); assert.equal(r.results.speaking.attempt_id,id(21));
 const grants=(await db.query("select has_function_privilege('anon','rpc_ielts_starting_point_summary()','execute') as anon,has_function_privilege('authenticated','rpc_ielts_starting_point_summary()','execute') as authenticated")).rows[0];
 assert.equal(grants.anon,false); assert.equal(grants.authenticated,true);
});
test('coverage projection preserves marks, classifies empty and partial, and retains self-only authorization',async()=>{
 await actor(student); await db.query('update users set eligible=true where id=$1',[student]);
 for (const [answered,expected] of [[0,'empty'],[6,'partial'],[12,'complete']]) {
   await db.query("update private.ielts_diagnostic_scoring_runs set confidence=jsonb_build_object('items_answered',$1::int) where attempt_id=$2",[answered,id(10)]);
   const value=(await db.query('select rpc_ielts_diagnostic_result($1) r',[id(10)])).rows[0].r;
   assert.equal(value.response_coverage,expected); assert.equal(value.raw_score,9); assert.equal(value.readiness_available,false);
   if(answered<12) assert.match(value.next_step,/fresh check/);
   assert.equal((await read()).results.listening.items_answered,answered);
 }
 await actor(other); await assert.rejects(db.query('select rpc_ielts_diagnostic_result($1)',[id(10)]),/not_authorized/);
 await actor(''); await assert.rejects(db.query('select rpc_ielts_diagnostic_result($1)',[id(10)]),/not_authenticated/);
 for (const fn of ['rpc_ielts_starting_point_summary()','rpc_ielts_diagnostic_result(uuid)','rpc_ielts_programme_workspace(uuid,text,integer)']) {
   assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') ok",[fn])).rows[0].ok,false);
 }
});
test('migration aborts on unexpected source drift instead of overwriting authorization',async()=>{
 // Reapplication is a drift case, not an invitation to silently patch a different function.
 await assert.rejects(db.exec(coverageSql),/starting_point_coverage_patch_drift/);
 assert.ok(originalSummary.includes('not_authorized'));
});
test.after(async()=>db.close());
