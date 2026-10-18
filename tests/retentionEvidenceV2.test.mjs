import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync('supabase/migrations/20261018110000_retention_evidence_dashboard_v2.sql','utf8');
const OWNER='10000000-0000-0000-0000-000000000001';
const TEACHER='10000000-0000-0000-0000-000000000002';
const STUDENT='10000000-0000-0000-0000-000000000003';
const TEST='10000000-0000-0000-0000-000000000004';
const SCHOOL='20000000-0000-0000-0000-000000000001';
const DEMO='20000000-0000-0000-0000-000000000002';
const TEACHER_ROW='30000000-0000-0000-0000-000000000001';
const A1='40000000-0000-0000-0000-000000000001';
const A2='40000000-0000-0000-0000-000000000002';
const A3='40000000-0000-0000-0000-000000000003';

const fixture = `
create schema auth; create schema private; create role anon; create role authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table public.superadmins(user_id uuid primary key);
create function public.rpc_is_superadmin() returns boolean language sql stable as
$$select exists(select 1 from public.superadmins where user_id=auth.uid())$$;
create table public.users(id uuid primary key, role text, username text, school_id uuid, is_banned boolean default false, banned_until timestamptz);
create table public.schools(id uuid primary key, name text);
create table public.teachers(id uuid primary key, user_id uuid);
create table public.assignments(id uuid primary key, teacher_id uuid, school_id uuid, created_at timestamptz);
create table public.student_assignment_results(student_id uuid, assignment_id uuid, completed_at timestamptz, completion_source text);
create table public.legacy_quarantined_assignment_students(student_id uuid,assignment_id uuid);
create table public.quest_runs(user_id uuid,completed_at timestamptz,status text);
create table private.retention_trial_runs(user_id uuid,completed_at timestamptz);
create table private.retention_trial_events(user_id uuid,event_day date,kind text);
create table public.assignment_paper_submissions(recorded_by uuid,assignment_id uuid,confirmed_at timestamptz);
create table public.student_learning_interventions(created_by uuid,created_at timestamptz,school_id uuid);
insert into public.superadmins values ('${OWNER}');
insert into public.users(id,role,username,school_id) values
 ('${OWNER}','admin','owner',null),
 ('${TEACHER}','teacher','teacher','${SCHOOL}'),
 ('${STUDENT}','student','learner','${SCHOOL}'),
 ('${TEST}','student','test_123','${DEMO}');
insert into public.schools values('${SCHOOL}','Real pilot school'),('${DEMO}','Demo sandbox');
insert into public.teachers values ('${TEACHER_ROW}','${TEACHER}');
insert into public.assignments values
 ('${A1}','${TEACHER_ROW}','${SCHOOL}',date_trunc('week',now())-interval '20 days'),
 ('${A2}','${TEACHER_ROW}','${SCHOOL}',date_trunc('week',now())-interval '13 days'),
 ('${A3}','${TEACHER_ROW}','${DEMO}',date_trunc('week',now())-interval '7 days');
insert into public.student_assignment_results values
 ('${STUDENT}','${A1}',date_trunc('week',now())-interval '20 days','online'),
 ('${STUDENT}','${A2}',date_trunc('week',now())-interval '13 days','online'),
 ('${STUDENT}','${A2}',date_trunc('week',now())-interval '10 days','paper'),
 ('${TEST}','${A3}',date_trunc('week',now())-interval '6 days','online');
insert into public.quest_runs values('${STUDENT}',date_trunc('week',now())-interval '10 days','completed');
`;

async function environment(fn) {
 const db=new PGlite();
 try {
  await db.exec(fixture);
  await db.exec(sql);
  await fn(db);
 } finally { await db.close(); }
}
const setUser=(db,id)=>db.query('select set_config($1,$2,false)', ['test.uid',id]);
const read=(db)=>db.query('select public.rpc_retention_trial_evidence_v2() result');

test('retention evidence returns aggregates, deduplicated roles, and mature W1 only',()=>environment(async db=>{
 await setUser(db,OWNER);
 const response=(await read(db)).rows[0].result;
 assert.equal(response.summary.online_completions_28d,2);
 assert.equal(response.summary.student_users_28d,1);
 assert.equal(response.summary.teacher_users_28d,1);
 assert.equal(response.summary.teacher_assignments_28d,2);
 assert.equal(response.summary.online_students_28d,1);
 assert.equal(response.summary.paper_completions_28d,1);
 assert.equal(response.quality.excluded_username_flags,1);
 assert.equal(response.quality.excluded_named_test_schools,1);
 const student=response.cohorts.find(c=>c.actor_role==='student'&&c.users===1);
 assert.ok(student);
 assert.equal(student.week_one_mature,true);
 assert.equal(student.week_one,1);
 assert.equal(student.week_four_mature,false);
 assert.ok(response.weekly.some(w=>w.actor_role==='teacher'&&w.teacher_assignments>0));
 assert.equal(JSON.stringify(response).includes(STUDENT),false);
 assert.equal(JSON.stringify(response).includes('learner'),false);
}));

test('superadmin guard rejects non-owner, anonymous and revoked authenticated access',()=>environment(async db=>{
 await setUser(db,STUDENT);
 await assert.rejects(read(db),/NOT_AUTHORIZED/);
 await setUser(db,'');
 await assert.rejects(read(db),/NOT_AUTHORIZED/);
 await setUser(db,OWNER);
 await db.exec('set role anon');
 await assert.rejects(read(db),/permission denied/);
 await db.exec('reset role');
}));

test('migration avoids user identifiers and private details in reporting response',()=>{
 assert.match(sql,/not public\.rpc_is_superadmin\(\)/);
 assert.match(sql,/set search_path\s*=\s*''/);
 assert.match(sql,/revoke all on function public\.rpc_retention_trial_evidence_v2\(\) from public, anon, authenticated/);
 assert.match(sql,/a\.teacher_id/);
 assert.match(sql,/t\.user_id/);
 assert.match(sql,/completion_source\s*=\s*'online'/);
 assert.match(sql,/week_four_mature/);
});
