import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/20261008103220_assignment_evidence_completion_order.sql', 'utf8');
const original = readFileSync('supabase/migrations/20261001111500_registry_native_verified_question_evidence.sql', 'utf8');
const capture = original.slice(original.indexOf('create or replace function private.capture_verified_assignment_diagnostic_evidence()'))
  .split('$function$;')[0] + '$function$;';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table student_assignments(assignment_id uuid,student_id uuid,status text,primary key(assignment_id,student_id));
    create table student_assignment_results(assignment_id uuid,student_id uuid,primary key(assignment_id,student_id));
    create table answers(assignment_id uuid,student_id uuid,item integer,primary key(assignment_id,student_id,item));
    create table evidence(assignment_id uuid,student_id uuid,item integer,lane text,primary key(assignment_id,student_id,item,lane));
    -- Test doubles model only materialization prerequisites and uniqueness.
    -- Production hash, grade, mapping and scoring gates are not replaced by the migration.
    create function private.ingest_verified_assignment_registry_evidence(a uuid,s uuid) returns void language sql as $$
      insert into public.evidence select a,s,item,'registry' from public.answers
      where assignment_id=a and student_id=s
        and exists(select 1 from public.student_assignments where assignment_id=a and student_id=s and status='completed')
        and (select count(*) from public.answers where assignment_id=a and student_id=s)=2
      on conflict do nothing;
    $$;
    create function private.ingest_verified_assignment_diagnostic_evidence(a uuid,s uuid) returns void language sql as $$
      insert into public.evidence select a,s,item,'diagnostic' from public.answers
      where assignment_id=a and student_id=s
        and exists(select 1 from public.student_assignments where assignment_id=a and student_id=s and status='completed')
        and (select count(*) from public.answers where assignment_id=a and student_id=s)=2
      on conflict do nothing;
    $$;
  `);
  await db.exec(capture);
  await db.exec(migration);
  await db.exec("insert into student_assignments values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','pending')");
  return db;
}
const result = "insert into student_assignment_results values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')";
const answers = "insert into answers select assignment_id,student_id,item from student_assignments cross join generate_series(1,2) item";
const complete = "update student_assignments set status='completed'";
const count = async db => (await db.query('select count(*)::int n from evidence')).rows[0].n;

for (const [label,steps] of [
  ['normal student completion',[answers,complete,result]],
  ['import writes result before completion',[answers,result,complete]],
  ['import writes result and completion before answers',[result,complete,answers]],
]) test(label,async()=>{
  const db=await fixture();
  try {
    await db.exec('begin');
    for(const step of steps) await db.exec(step);
    await db.exec('commit');
    assert.equal(await count(db),4);
    await db.exec('update student_assignment_results set student_id=student_id');
    assert.equal(await count(db),4,'retry must not duplicate either evidence lane');
  } finally { await db.close(); }
});

test('completion after a separately committed result reconciles evidence',async()=>{
  const db=await fixture();
  try {
    await db.exec(answers); await db.exec(result);
    assert.equal(await count(db),0);
    await db.exec(complete);
    assert.equal(await count(db),4);
  } finally { await db.close(); }
});
test('incomplete and rolled-back submissions never create evidence',async()=>{
  const db=await fixture();
  try {
    await db.exec('begin'); await db.exec(answers); await db.exec(complete); await db.exec(result);
    await db.exec('set constraints all immediate');
    assert.equal(await count(db),4);
    await db.exec('rollback');
    assert.equal(await count(db),0);
    await db.exec(result); await db.exec(complete);
    assert.equal(await count(db),0);
    assert.equal((await db.query("select has_function_privilege('authenticated','private.capture_completed_assignment_evidence()','execute') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('anon','private.capture_completed_assignment_evidence()','execute') allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
