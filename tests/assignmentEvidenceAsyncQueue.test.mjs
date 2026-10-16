import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/20261015150000_classroom_async_evidence_and_incident_repairs.sql', 'utf8');
const queueSchema = migration.slice(
  migration.indexOf('create table if not exists private.assignment_evidence_jobs'),
  migration.indexOf('-- pg_cron is installed;')
);
assert.ok(queueSchema.includes('process_one_verified_assignment_evidence'));

const ASSIGNMENT = '10000000-0000-0000-0000-000000000001';
const STUDENT = '10000000-0000-0000-0000-000000000002';
const result = `insert into student_assignment_results values('${ASSIGNMENT}','${STUDENT}')`;
const complete = `update student_assignments set status='completed' where assignment_id='${ASSIGNMENT}'`;
const answers = `insert into answers select assignment_id,student_id,item
  from student_assignments cross join generate_series(1,2) item`;

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.student_assignment_results(
      assignment_id uuid, student_id uuid, primary key(assignment_id,student_id));
    create table public.student_assignments(
      assignment_id uuid, student_id uuid,status text,primary key(assignment_id,student_id));
    create table public.answers(
      assignment_id uuid, student_id uuid,item int, primary key(assignment_id,student_id,item));
    create table public.evidence(
      assignment_id uuid, student_id uuid,item int,lane text,
      primary key(assignment_id,student_id,item,lane));
    create function private.ingest_verified_assignment_registry_evidence(a uuid,s uuid)
      returns void language sql as $fn$
        insert into public.evidence select a,s,item,'registry' from public.answers
        where assignment_id=a and student_id=s
          and (select status from public.student_assignments where assignment_id=a and student_id=s)='completed'
          and (select count(*) from public.answers where assignment_id=a and student_id=s)=2
        on conflict do nothing
      $fn$;
    create function private.ingest_verified_assignment_diagnostic_evidence(a uuid,s uuid)
      returns void language sql as $fn$
        insert into public.evidence select a,s,item,'diagnostic' from public.answers
        where assignment_id=a and student_id=s
          and (select status from public.student_assignments where assignment_id=a and student_id=s)='completed'
          and (select count(*) from public.answers where assignment_id=a and student_id=s)=2
        on conflict do nothing
      $fn$;
  `);
  await db.exec(queueSchema);
  await db.exec(`
    create constraint trigger trg_zzz_capture_verified_assignment_diagnostic_evidence
      after insert or update on student_assignment_results
      deferrable initially deferred for each row
      execute function private.capture_verified_assignment_diagnostic_evidence();
    create trigger trg_capture_completed_assignment_evidence
      after update of status on student_assignments
      for each row when (new.status='completed' and old.status is distinct from new.status)
      execute function private.capture_completed_assignment_evidence();
    insert into student_assignments values('${ASSIGNMENT}','${STUDENT}','pending');
  `);
  return db;
}
async function counts(db) {
  const [{ rows: queued }, { rows: evident }] = await Promise.all([
    db.query('select status,attempts from private.assignment_evidence_jobs'),
    db.query('select lane,item from evidence order by lane,item')
  ]);
  return { queued, evidence: evident };
}
test('normal classroom completion persists queue first; worker later processes both lanes', async() => {
  const db = await setup();
  try {
    await db.exec('begin'); await db.exec(answers);await db.exec(complete);await db.exec(result);await db.exec('commit');
    let state=await counts(db);
    assert.equal(state.queued.length,1);
    assert.equal(state.queued[0].status,'pending');
    assert.equal(state.evidence.length,0,'completion transaction cannot process academic evidence');
    const worker=await db.query('select private.process_one_verified_assignment_evidence() outcome');
    assert.equal(worker.rows[0].outcome,'done');
    state=await counts(db);
    assert.equal(state.queued[0].status,'done');
    assert.equal(state.evidence.length,4);
    await db.exec(`update student_assignment_results set student_id=student_id`);
    state=await counts(db);
    assert.equal(state.queued[0].status,'pending','verified result update enqueues a refresh');
    assert.equal((await db.query('select private.process_one_verified_assignment_evidence() outcome')).rows[0].outcome,'done');
    assert.equal((await counts(db)).evidence.length,4,'worker replay must be idempotent');
  } finally { await db.close(); }
});
test('result-before-status ordering still queues once and worker waits for completed status',async()=>{
  const db=await setup();
  try {
    await db.exec('begin');await db.exec(answers);await db.exec(result);await db.exec(complete);await db.exec('commit');
    assert.equal((await counts(db)).queued.length,1);
    assert.equal((await db.query('select private.process_one_verified_assignment_evidence() outcome')).rows[0].outcome,'done');
    assert.equal((await counts(db)).evidence.length,4);
  } finally { await db.close(); }
});
test('failed result transaction cannot leave orphan queue work',async()=>{
  const db=await setup();
  try {
    await db.exec('begin');await db.exec(answers);await db.exec(complete);await db.exec(result);
    await db.exec('set constraints all immediate');
    await db.exec('rollback');
    assert.equal((await counts(db)).queued.length,0);
    assert.equal((await counts(db)).evidence.length,0);
  } finally { await db.close(); }
});

test('failed academic worker rolls back both lanes then retries safely',async()=>{
  const db=await setup();
  try {
    await db.exec('begin');await db.exec(answers);await db.exec(complete);await db.exec(result);await db.exec('commit');
    await db.exec("alter table public.evidence add constraint reject_diagnostic_test check (lane <> 'diagnostic')");
    const attempt=await db.query('select private.process_one_verified_assignment_evidence() outcome');
    assert.equal(attempt.rows[0].outcome,'retry');
    const pending=(await counts(db));
    assert.equal(pending.evidence.length,0,'registry evidence must roll back when diagnostic fails');
    assert.equal(pending.queued[0].status,'pending');
    assert.equal(pending.queued[0].attempts,1);
    await db.exec('alter table public.evidence drop constraint reject_diagnostic_test');
    await db.exec("update private.assignment_evidence_jobs set available_at=clock_timestamp()-interval '1 second'");
    const retried=await db.query('select private.process_one_verified_assignment_evidence() outcome');
    assert.equal(retried.rows[0].outcome,'done');
    assert.equal((await counts(db)).evidence.length,4);
  } finally { await db.close(); }
});
