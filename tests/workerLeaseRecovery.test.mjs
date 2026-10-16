import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const foundation=readFileSync('supabase/migrations/20261015150000_classroom_async_evidence_and_incident_repairs.sql','utf8');
const migration=readFileSync('supabase/migrations/20261015223001_durable_worker_leases_and_bounded_drain.sql','utf8');
const A='10000000-0000-0000-0000-000000000001',S='10000000-0000-0000-0000-000000000002';
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
 create table public.student_assignment_results(assignment_id uuid,student_id uuid,primary key(assignment_id,student_id));
 create table public.evidence(lane text primary key);
 create function private.ingest_verified_assignment_registry_evidence(uuid,uuid) returns void language sql as $$ insert into public.evidence values('registry') on conflict do nothing $$;
 create function private.ingest_verified_assignment_diagnostic_evidence(uuid,uuid) returns void language sql as $$ insert into public.evidence values('diagnostic') on conflict do nothing $$;
 create function private.run_school_head_refresh_batch(integer default 3) returns jsonb language plpgsql as $$ begin return '{"refreshed":0,"failed":0}'::jsonb;exception when others then return '{}'::jsonb;end $$;
 insert into public.student_assignment_results values('${A}','${S}');`);
 await db.exec(foundation.slice(foundation.indexOf('create table if not exists private.assignment_evidence_jobs'),foundation.indexOf('-- pg_cron is installed;')));
 await db.exec(migration.slice(0,migration.indexOf('-- Single top-level CALL')));
 await db.exec(`select private.enqueue_verified_assignment_evidence_row('${A}','${S}')`);
 return db;
}
const one=async(db,sql)=>(await db.query(sql)).rows[0];
test('top-level worker CALL commits durable jobs and drains multiple jobs without duplicate evidence',async()=>{
 const db=await setup();try{
 await db.exec(`insert into public.student_assignment_results values('${S}','${A}');select private.enqueue_verified_assignment_evidence_row('${S}','${A}')`);
 await db.exec('call private.run_assignment_evidence_worker()');
 assert.deepEqual((await db.query('select status,attempts from private.assignment_evidence_jobs')).rows,[{status:'done',attempts:1},{status:'done',attempts:1}]);
 assert.equal((await one(db,'select count(*)::int n from public.evidence')).n,2);
 }finally{await db.close();}
});
test('query cancellation rolls back BOTH evidence lanes and records a bounded retry',async()=>{
 const db=await setup();try{
 await db.exec(`create or replace function private.ingest_verified_assignment_diagnostic_evidence(uuid,uuid) returns void language plpgsql as $$ begin raise exception using errcode='57014',message='test cancellation';end $$;`);
 await db.exec('call private.run_assignment_evidence_worker()');
 const job=await one(db,'select status,attempts,last_error from private.assignment_evidence_jobs');
 assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.match(job.last_error,/57014/);
 assert.equal((await one(db,'select count(*)::int n from evidence')).n,0);
 await db.exec("update private.assignment_evidence_jobs set attempts=7,available_at=now()-interval '1 second'");
 await db.exec('call private.run_assignment_evidence_worker()');
 assert.equal((await one(db,'select status from private.assignment_evidence_jobs')).status,'failed');
 }finally{await db.close();}
});
test('a lost worker retains its committed attempt and expired lease recovery cannot retry forever',async()=>{
 const db=await setup();try{
 await db.exec('select private.claim_verified_assignment_evidence()');
 await db.exec('begin;insert into evidence values(\'uncommitted\');rollback;');
 assert.equal((await one(db,'select attempts from private.assignment_evidence_jobs')).attempts,1);
 await db.exec("update private.assignment_evidence_jobs set lease_until=now()-interval '1 minute';select private.recover_assignment_evidence_leases()");
 assert.equal((await one(db,'select status from private.assignment_evidence_jobs')).status,'pending');
 await db.exec("update private.assignment_evidence_jobs set status='processing',attempts=8,lease_until=now()-interval '1 minute';select private.recover_assignment_evidence_leases()");
 assert.equal((await one(db,'select status from private.assignment_evidence_jobs')).status,'failed');
 }finally{await db.close();}
});
test('re-enqueue during processing supersedes the lease and old completion cannot swallow new work',async()=>{
 const db=await setup();try{
 await db.exec('create table public.saved_claim(job private.assignment_evidence_jobs);insert into public.saved_claim select private.claim_verified_assignment_evidence()');
 await db.exec(`select private.enqueue_verified_assignment_evidence_row('${A}','${S}')`);
 assert.equal((await one(db,'select private.process_claimed_assignment_evidence(c.job) outcome from saved_claim c')).outcome,'superseded');
 assert.equal((await one(db,'select status,revision::int from private.assignment_evidence_jobs')).revision,2);
 await db.exec('call private.run_assignment_evidence_worker()');
 assert.equal((await one(db,'select status from private.assignment_evidence_jobs')).status,'done');
 }finally{await db.close();}
});
test('ordinary app roles cannot execute transaction-controlling workers or read queue',async()=>{
 const db=await setup();try{
 for(const role of ['anon','authenticated','service_role']){
 await db.exec(`set role ${role}`);
 await assert.rejects(db.exec('call private.run_assignment_evidence_worker()'),/permission denied/);
 await db.exec('reset role');
 }
 }finally{await db.close();}
});
