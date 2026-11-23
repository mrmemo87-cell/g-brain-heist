import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Visual & UX Bible 1.21.0 section 13.13 and Diagnostic Bible 2.7.3 section 15.1: the teacher's class report.
// Read-only; every kind of IELTS work with its true state; marks (never bands) for Listening and Reading;
// a Speaking band only once the teacher has confirmed the review; school, class and batch scope enforced.
const db = new PGlite();
const owner = "1d4f3b8d-f24f-4651-ad33-85165359cf88", lead = "00000000-0000-0000-0000-00000000aaaa", outsider = "00000000-0000-0000-0000-00000000bbbb";
const school = "00000000-0000-0000-0000-000000000004", other = "00000000-0000-0000-0000-000000000005";
const aida = "00000000-0000-0000-0000-000000000101", bek = "00000000-0000-0000-0000-000000000102", cara = "00000000-0000-0000-0000-000000000103", far = "00000000-0000-0000-0000-000000000199";
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table users(id uuid primary key,username text,role text,school_id uuid,is_banned boolean default false,full_name text,batch text);
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
insert into users(id,username,role,school_id,full_name,batch) values('${owner}','Owner','admin',null,null,null),('${lead}','Lead','teacher','${school}',null,null),('${outsider}','Other teacher','teacher','${school}',null,null),
 ('${aida}','aida','student','${school}','Aida Synthetic','10A'),('${bek}','bek','student','${school}','Bek Synthetic','10A'),('${cara}','cara','student','${school}','Cara Synthetic','11B'),('${far}','far','student','${other}','Far Synthetic','10A'),('b30e9c28-96f1-4d34-83e9-9b28b4926f42','gulzada','student','${other}','Synthetic pilot fixture',null);
insert into school_members select id,school_id,'active','student' from users where role='student';`);
for (const m of ["20261007112613_ielts_speaking_interview_pilot", "20261007125521_ielts_speaking_eligible_release", "20261008065539_ielts_speaking_school_seat_access",
  "20261121154500_ielts_speaking_recorded_mock", "20261121180000_ielts_speaking_mock_teacher_views", "20261121190000_ielts_speaking_mock_b_content"])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
// Stand-ins for the practice, screener and scoring objects the report reads (shapes match production).
await db.exec(`
create function public.can_manage_ielts_practice_school(p uuid) returns boolean language sql as $$select auth.uid() in ('${owner}','${lead}') and p='${school}'$$;
create table private.ielts_course_batches(id uuid primary key,school_id uuid,name text,deleted_at timestamptz,archived_at timestamptz);
create table private.ielts_course_batch_members(batch_id uuid,student_id uuid,left_at timestamptz);
create table private.practice_fixture(row_id text,kind text,assignment_id uuid,student_id uuid,student_name text,class_id uuid,class_name text,material_type text,material_id text,material_version text,title text,assignment_title text,skill text,status text,assignment_status text,feedback_status text,assigned_at timestamptz,submitted_at timestamptz,feedback_at timestamptz,due_at timestamptz,school_id uuid);
create function private.ielts_teacher_practice_rows(p_school uuid,p_student uuid default null,p_class uuid default null,p_items jsonb default null)
 returns table(row_id text,kind text,assignment_id uuid,student_id uuid,student_name text,class_id uuid,class_name text,material_type text,material_id text,material_version text,title text,assignment_title text,skill text,status text,assignment_status text,feedback_status text,assigned_at timestamptz,submitted_at timestamptz,feedback_at timestamptz,due_at timestamptz)
 language sql as $$select row_id,kind,assignment_id,student_id,student_name,class_id,class_name,material_type,material_id,material_version,title,assignment_title,skill,status,assignment_status,feedback_status,assigned_at,submitted_at,feedback_at,due_at from private.practice_fixture where school_id=p_school$$;
create function private.ielts_material_code(t text,i text) returns text language sql as $$select case when t='targeted' then 'R-050' end$$;
create table private.ielts_learning_tasks(code text primary key,questions jsonb);
create table private.ielts_learning_submissions(allocation_id uuid primary key,score integer);
create table public.ielts_exam_events(id uuid primary key,school_id uuid,title text,ends_at timestamptz);
create table public.ielts_exam_assignments(id uuid primary key,exam_event_id uuid,student_id uuid,school_id uuid,status text,created_at timestamptz default now());
create table public.ielts_exam_attempts(id uuid primary key,assignment_id uuid,submitted_at timestamptz,created_at timestamptz default now());
create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid,form_snapshot jsonb);
create table private.ielts_diagnostic_scoring_runs(attempt_id uuid,raw_score integer,marks_possible integer,run_version integer,created_at timestamptz default now());
create table private.ielts_writing_screener_reviews(attempt_id uuid);
create table if not exists private.ielts_speaking_part_bands(session_id uuid,overall numeric,created_at timestamptz default now());

insert into private.ielts_course_batches values('00000000-0000-0000-0000-0000000000b1','${school}','May group',null,null),('00000000-0000-0000-0000-0000000000b2','${other}','Elsewhere',null,null);
insert into private.ielts_course_batch_members values('00000000-0000-0000-0000-0000000000b1','${bek}',null),('00000000-0000-0000-0000-0000000000b1','${cara}',now());
insert into private.ielts_learning_tasks values('bh-r28','[{},{},{},{},{},{}]');
insert into private.practice_fixture values
 ('00000000-0000-0000-0000-00000000c001','targeted','00000000-0000-0000-0000-00000000c001','${aida}','aida',null,null,'targeted','bh-r28',null,'Reading step 1','Reading step 1','reading','submitted','submitted','pending',now()-interval '3 days',now()-interval '2 days',null,now()-interval '1 day','${school}'),
 ('00000000-0000-0000-0000-00000000c002','targeted','00000000-0000-0000-0000-00000000c002','${bek}','bek',null,null,'targeted','bh-r28',null,'Reading step 1','Reading step 1','reading','assigned','assigned','not_ready',now()-interval '3 days',null,null,now()-interval '1 day','${school}'),
 ('00000000-0000-0000-0000-00000000d001:${cara}','school','00000000-0000-0000-0000-00000000d0a1','${cara}','cara',null,'11B','listening','L1',null,'Listening set 1','Week 1','listening','in_progress','assigned','not_tracked',now()-interval '1 day',null,null,now()+interval '3 days','${school}'),
 ('00000000-0000-0000-0000-00000000d002:${cara}','school','00000000-0000-0000-0000-00000000d0a2','${cara}','cara',null,'11B','reading','R9',null,'Draft set','Draft','reading','assigned','draft','not_tracked',now(),null,null,null,'${school}'),
 ('00000000-0000-0000-0000-00000000c009','targeted','00000000-0000-0000-0000-00000000c009','${far}','far',null,null,'targeted','bh-r28',null,'Elsewhere','Elsewhere','reading','submitted','submitted','pending',now(),now(),null,null,'${other}');
insert into private.ielts_learning_submissions values('00000000-0000-0000-0000-00000000c001',4);
insert into public.ielts_exam_events values('00000000-0000-0000-0000-00000000e001','${school}','Reading Screener A',now()+interval '1 year'),('00000000-0000-0000-0000-00000000e002','${school}','Academic Writing Screener A',now()+interval '1 year');
insert into public.ielts_exam_assignments(id,exam_event_id,student_id,school_id,status) values('00000000-0000-0000-0000-00000000e101','00000000-0000-0000-0000-00000000e001','${aida}','${school}','submitted'),
 ('00000000-0000-0000-0000-00000000e102','00000000-0000-0000-0000-00000000e002','${aida}','${school}','auto_submitted'),('00000000-0000-0000-0000-00000000e103','00000000-0000-0000-0000-00000000e001','${bek}','${school}','assigned');
insert into public.ielts_exam_attempts(id,assignment_id,submitted_at) values('00000000-0000-0000-0000-00000000e201','00000000-0000-0000-0000-00000000e101',now()),('00000000-0000-0000-0000-00000000e202','00000000-0000-0000-0000-00000000e102',now());
insert into private.ielts_diagnostic_attempt_evidence values('00000000-0000-0000-0000-00000000e201','{"items":[{"skill":"reading"}]}'),('00000000-0000-0000-0000-00000000e202','{"items":[{"skill":"writing"}]}');
insert into private.ielts_diagnostic_scoring_runs(attempt_id,raw_score,marks_possible,run_version,created_at) values('00000000-0000-0000-0000-00000000e201',3,12,1,now()-interval '1 hour'),('00000000-0000-0000-0000-00000000e201',7,12,2,now());
`);
await db.exec(readFileSync("supabase/migrations/20261123090000_ielts_class_report.sql", "utf8"));
// One finished Speaking practice mock for Aida (teacher review confirmed, band 6.5) and one finished, unreviewed for Bek.
const pkg = (await db.query("select code,content_hash,content from private.ielts_speaking_packages where code='bh-speaking-mock-b'")).rows[0];
const script = (await db.query("select id from private.ielts_speaking_mock_scripts where package_code='bh-speaking-mock-b' limit 1")).rows[0]?.id;
for (const [i, s] of [[1, aida], [2, bek]]) {
  const id = `00000000-0000-0000-0000-00000000f00${i}`;
  await db.query(`insert into private.ielts_speaking_mock_assignments(id,school_id,student_id,teacher_id,package_code,script_id) values($1,$2,$3,$4,$5,$6)`, [id, school, s, lead, pkg.code, script]);
  await db.query(`insert into private.ielts_speaking_sessions(id,student_id,teacher_id,school_id,package_code,content_hash,package_snapshot,evidence_kind,recording_consent,delivery_mode,status,submitted_at)
    values($1,$2,$3,$4,$5,$6,$7,'practice_mock',true,'recorded_examiner','submitted',now())`, [id, s, lead, school, pkg.code, pkg.content_hash, pkg.content]);
  await db.query(`insert into private.ielts_speaking_mock_sittings(session_id,assignment_id,script_id,student_finished_at) values($1,$1,$2,now())`, [id, script]);
}
await db.exec(`insert into private.ielts_speaking_part_bands(session_id,overall) values('00000000-0000-0000-0000-00000000f001',6.5),('00000000-0000-0000-0000-00000000f002',5.0);
insert into private.ielts_speaking_reviews(id,session_id,source_hash,reviewer_id,fields,teacher_confirmed) values('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-00000000f001','x','${lead}','{}',true);`);

const as = (who) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
const report = async (scope = "all", value = null) => (await db.query("select public.rpc_ielts_class_report($1,$2,$3) r", [school, scope, value])).rows[0].r;
const byName = (r, n) => r.students.find((s) => s.name === n);
const item = (s, key) => s.items.find((i) => i.key === key);

test("only the programme lead or a school administrator may open it, and only signed in", async () => {
  await as(outsider);
  await assert.rejects(report(), /not_authorized/);
  await as("");
  await assert.rejects(report(), /not_authorized/);
  await as(lead);
  await assert.rejects(db.query("select public.rpc_ielts_class_report($1)", [other]), /not_authorized/, "another school is refused");
  const grants = (await db.query(`select grantee from information_schema.routine_privileges where routine_name='rpc_ielts_class_report' order by 1`)).rows.map((r) => r.grantee);
  assert.ok(grants.includes("authenticated") && !grants.includes("anon") && !grants.includes("PUBLIC"));
});

test("every kind of work, with its true state and only governed results", async () => {
  await as(owner); // a school administrator who may review every student
  const r = await report();
  assert.deepEqual(r.students.map((s) => s.name), ["Aida Synthetic", "Bek Synthetic", "Cara Synthetic"], "this school's students only");
  assert.deepEqual(r.classes, ["10A", "11B"]);
  assert.deepEqual(r.batches.map((b) => b.name), ["May group"]);
  const a = byName(r, "Aida Synthetic"), b = byName(r, "Bek Synthetic"), c = byName(r, "Cara Synthetic");

  const practice = item(a, "targeted:bh-r28");
  assert.equal(practice.status, "done");
  assert.deepEqual(practice.score, { raw: 4, total: 6 }, "Reading practice shows marks");
  assert.equal(practice.review, "waiting");
  assert.equal(practice.code, "R-050");
  assert.equal(item(b, "targeted:bh-r28").status, "not_started");
  assert.equal(item(b, "targeted:bh-r28").score, null);

  const screener = item(a, "screener:00000000-0000-0000-0000-00000000e001");
  assert.deepEqual(screener.score, { raw: 7, total: 12 }, "the newest scoring run");
  assert.equal(screener.band, undefined, "never a band for an objective screener");
  assert.equal(screener.due_at, null, "a screener window is not a due date");
  const writing = item(a, "screener:00000000-0000-0000-0000-00000000e002");
  assert.equal(writing.skill, "writing");
  assert.equal(writing.score, null);
  assert.equal(writing.review, "waiting");
  assert.equal(item(b, "screener:00000000-0000-0000-0000-00000000e001").status, "not_started");

  const mockA = item(a, "mock:bh-speaking-mock-b"), mockB = item(b, "mock:bh-speaking-mock-b");
  assert.deepEqual(mockA.band, { value: 6.5, label: "Teacher Speaking band · practice mock" });
  assert.equal(mockA.review, "reviewed");
  assert.equal(mockB.band, null, "no band before the teacher confirms the review");
  assert.equal(mockB.review, "waiting");

  assert.equal(c.items.length, 1, "a draft assignment is left out");
  assert.equal(item(c, "school:00000000-0000-0000-0000-00000000d001").status, "in_progress");
});

test("class and course batch scope, and bad scopes refused", async () => {
  await as(owner); // a school administrator who may review every student
  assert.deepEqual((await report("class", "11B")).students.map((s) => s.name), ["Cara Synthetic"]);
  const batch = await report("batch", "00000000-0000-0000-0000-0000000000b1");
  assert.equal(batch.scope.name, "May group");
  assert.deepEqual(batch.students.map((s) => s.name), ["Bek Synthetic"], "a student who left the batch is not listed");
  await assert.rejects(report("batch", "00000000-0000-0000-0000-0000000000b2"), /invalid_scope/, "another school's batch");
  await assert.rejects(report("batch", "not-a-uuid"), /invalid_scope/);
  await assert.rejects(report("class", ""), /invalid_scope/);
  await assert.rejects(report("everyone"), /invalid_scope/);
});

test("the report changes nothing", async () => {
  await as(owner); // a school administrator who may review every student
  const before = (await db.query("select (select count(*) from private.ielts_speaking_reviews)+(select count(*) from private.practice_fixture)+(select count(*) from private.ielts_speaking_mock_assignments) n")).rows[0].n;
  await report();
  const after = (await db.query("select (select count(*) from private.ielts_speaking_reviews)+(select count(*) from private.practice_fixture)+(select count(*) from private.ielts_speaking_mock_assignments) n")).rows[0].n;
  assert.equal(after, before);
  assert.match(readFileSync("supabase/migrations/20261123090000_ielts_class_report.sql", "utf8"), /stable security definer set search_path=''/);
});
