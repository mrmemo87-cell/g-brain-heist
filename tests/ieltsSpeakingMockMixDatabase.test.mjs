import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Diagnostic Bible 2.7.1 section 10.12: the automatic mix gives classmates different mocks and never repeats one.
const db = new PGlite(), student = "b30e9c28-96f1-4d34-83e9-9b28b4926f42", owner = "1d4f3b8d-f24f-4651-ad33-85165359cf88", school = "00000000-0000-0000-0000-000000000004";
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table users(id uuid primary key,username text,role text,school_id uuid,is_banned boolean default false);
create table school_members(user_id uuid,school_id uuid,status text,role_in_school text);
create table classes(id uuid,school_id uuid,subject text);create table class_students(student_id uuid,class_id uuid);
create table class_teacher_assignments(class_id uuid,school_id uuid,teacher_user_id uuid,active boolean,subject text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text,metadata jsonb);
create function public.is_superadmin(uuid) returns boolean language sql as $$select $1='${owner}'::uuid$$;
create function public.school_has_module_access(uuid,text) returns boolean language sql as $$select true$$;
create function private.student_has_programme_seat(uuid,text,uuid) returns boolean language sql as $$select true$$;
create function private.actor_can_access_school_programme(uuid,text,boolean) returns boolean language sql as $$select true$$;
create function private.teacher_current_teaching_roster(uuid,uuid) returns table(student_id uuid,academic_subject_code text,school_subject_name text) language sql as $$select null::uuid,null::text,null::text where false$$;
create function private.teacher_current_teaching_groups(uuid,uuid) returns table(id uuid) language sql as $$select null::uuid where false$$;
insert into users values('${student}','Synthetic Gulzada fixture','student','${school}',false),('${owner}','Owner','admin',null,false);`);
for (const m of ["20261007112613_ielts_speaking_interview_pilot", "20261007125521_ielts_speaking_eligible_release", "20261008065539_ielts_speaking_school_seat_access",
  "20261121154500_ielts_speaking_recorded_mock", "20261121180000_ielts_speaking_mock_teacher_views", "20261121190000_ielts_speaking_mock_b_content", "20261121190100_ielts_speaking_mocks_c_to_g_content", "20261122010000_ielts_speaking_mock_mix", "20261122100000_ielts_speaking_mock_overview"])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
const one = async (sql, a = []) => Object.values((await db.query(sql, a)).rows[0])[0];

const kids = Array.from({ length: 10 }, (_, i) => `00000000-0000-0000-0000-0000000001${String(i).padStart(2, "0")}`);
const all = [student, ...kids];
await db.exec(`insert into users select k::uuid,'Synthetic student '||k,'student','${school}',false from unnest(array['${kids.join("','")}']) k;
insert into school_members select id,'${school}','active','student' from users where role='student';
-- B, C, E, F approved and published; D approved for the named pilot only; G not approved.
update private.ielts_speaking_packages set approved_at=now() where code in ('bh-speaking-mock-b','bh-speaking-mock-c','bh-speaking-mock-d','bh-speaking-mock-e','bh-speaking-mock-f');
update private.ielts_speaking_mock_scripts set released_at=now(),released_by='${owner}';
insert into private.ielts_speaking_releases(package_code,content_hash,authorized_by,acceptance_note)
 select code,content_hash,'${owner}','synthetic test release' from private.ielts_speaking_packages where code in ('bh-speaking-mock-b','bh-speaking-mock-c','bh-speaking-mock-e','bh-speaking-mock-f');`);
const uuid = (n) => `00000000-0000-0000-0000-00000000${String(n).padStart(4, "0")}`;
let n = 0;
const mix = (ids) => one("select rpc_ielts_assign_speaking_mock_mix($1)", [JSON.stringify(ids.map((s) => ({ student_id: s, assignment_id: uuid(++n) })))]);
const mine = async (s) => (await db.query("select package_code c from private.ielts_speaking_mock_assignments where student_id=$1 and cancelled_at is null order by created_at,id", [s])).rows.map((r) => r.c);
const finishAll = () => db.exec(`
 insert into private.ielts_speaking_sessions(id,student_id,teacher_id,school_id,package_code,content_hash,package_snapshot,evidence_kind,recording_consent,delivery_mode)
  select a.id,a.student_id,a.teacher_id,a.school_id,p.code,p.content_hash,p.content,'practice_mock',true,'recorded_examiner'
  from private.ielts_speaking_mock_assignments a join private.ielts_speaking_packages p on p.code=a.package_code
  where not exists(select 1 from private.ielts_speaking_mock_sittings m where m.assignment_id=a.id);
 insert into private.ielts_speaking_mock_sittings(session_id,assignment_id,script_id,student_finished_at)
  select a.id,a.id,a.script_id,now() from private.ielts_speaking_mock_assignments a
  where not exists(select 1 from private.ielts_speaking_mock_sittings m where m.assignment_id=a.id);`);

test("a list of students gets the mocks in turn; unapproved and pilot-only mocks are respected", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const r = await mix(all);
  assert.equal(r.assigned, 11);
  assert.deepEqual(r.skipped, []);
  const got = [];
  for (const s of all) got.push((await mine(s))[0]);
  assert.equal(got[0], "bh-speaking-mock-b", "the pilot student may get every approved mock");
  assert.ok(!got.includes("bh-speaking-mock-g"), "an unapproved mock is never given");
  assert.ok(!got.slice(1).includes("bh-speaking-mock-d"), "a pilot-only mock reaches only the pilot student");
  for (let i = 1; i < got.length; i++) assert.notEqual(got[i], got[i - 1], "neighbours in the list get different mocks");
  const counts = Object.values(r.by_mock);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(r.by_mock));
});

test("a student with an open mock is skipped, and retrying the same request changes nothing", async () => {
  const again = await mix(kids.slice(0, 3));
  assert.equal(again.assigned, 0);
  assert.deepEqual(again.skipped.map((x) => x.reason), ["open_mock", "open_mock", "open_mock"]);
  const id = uuid(1);
  const replay = await one("select rpc_ielts_assign_speaking_mock_mix($1)", [JSON.stringify([{ student_id: student, assignment_id: id }])]);
  assert.equal(replay.assigned, 0);
  assert.equal((await mine(student)).length, 1);
});

test("each new sitting gets a mock the student has not had, until none are left", async () => {
  for (let round = 0; round < 3; round++) { await finishAll(); await mix(kids); }
  for (const s of kids) {
    const had = await mine(s);
    assert.equal(had.length, 4, "the four published mocks, once each");
    assert.equal(new Set(had).size, 4);
  }
  await finishAll();
  const done = await mix([kids[0]]);
  assert.equal(done.assigned, 0);
  assert.deepEqual(done.skipped, [{ student_id: kids[0], reason: "no_new_mock" }]);
});

test("a cancelled, never-started assignment does not count as having had that mock", async () => {
  const fresh = "00000000-0000-0000-0000-000000000199";
  await db.exec(`insert into users values('${fresh}','Synthetic new student','student','${school}',false); insert into school_members values('${fresh}','${school}','active','student');`);
  await mix([fresh]);
  const [first] = (await db.query("select id,package_code from private.ielts_speaking_mock_assignments where student_id=$1", [fresh])).rows;
  await one("select rpc_ielts_cancel_speaking_mock_assignment($1)", [first.id]);
  await mix([fresh]);
  assert.deepEqual(await mine(fresh), [first.package_code]);
});

test("only signed-in reviewers can mix, and the function is not open to the public", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [kids[1]]);
  await assert.rejects(mix([kids[2]]), /not_authorized/);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(mix([kids[2]]), /not_authorized/);
  const acl = await one("select proacl::text from pg_proc where proname='rpc_ielts_assign_speaking_mock_mix'");
  assert.match(acl, /authenticated=X/);
  assert.doesNotMatch(acl, /(^|[{,])=X|anon=X/);
});

test("the Speaking desk overview shows each reviewable student's current mock and its true state", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const o = await one("select rpc_ielts_speaking_mock_overview($1)", [school]);
  assert.equal(o.published_mocks, 4, "B, C, E and F are published; D is pilot-only; G is unapproved");
  const by = Object.fromEntries(o.students.map((x) => [x.id, x]));
  assert.equal(by["00000000-0000-0000-0000-000000000199"].current.state, "ready", "assigned, not started");
  assert.equal(by[student].current.state, "to_review");
  assert.equal(by[kids[0]].mocks_had, 4);
  assert.equal(by[kids[0]].current.state, "to_review", "finished and not yet reviewed");
  assert.ok(by[kids[0]].current.finished_at);
  assert.deepEqual(o.students.map((x) => x.name), [...o.students.map((x) => x.name)].sort());
  // A student may not see anyone else's mocks, and an unsigned call is refused.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [kids[1]]);
  assert.deepEqual((await one("select rpc_ielts_speaking_mock_overview($1)", [school])).students, []);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(one("select rpc_ielts_speaking_mock_overview($1)", [school]), /not_authorized/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
});
