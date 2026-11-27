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
// Mark book (Diagnostic Bible 2.7.4 section 15.1): the shapes the new migration reads, plus the real bh-indicative-v1
// and mock exposure functions taken from their own migrations.
const fn = (file, name) => {
  const m = readFileSync(`supabase/migrations/${file}.sql`, "utf8").match(new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?\\$\\$;`));
  assert.ok(m, name);
  return m[0];
};
await db.exec(`
create table public.ielts_practice_assignment_item_students(assignment_id uuid,assignment_item_id uuid,student_id uuid,practice_attempt_type text,practice_attempt_id uuid);
create table public.ielts_listening_attempts(id uuid primary key,user_id uuid,raw_score int,total_questions int,est_band numeric,completed_at timestamptz);
create table public.ielts_reading_attempts(id uuid primary key,user_id uuid,raw_score int,total_questions int,est_band numeric,completed_at timestamptz);
create table public.ielts_writing_tasks(id bigint primary key,title text,task_type text,display_code text);
create table public.ielts_writing_attempts(id uuid primary key,user_id uuid,task_id bigint,submitted_at timestamptz,band_overall numeric);
create table public.ielts_productive_skill_reviews(id uuid primary key default gen_random_uuid(),school_id uuid,student_id uuid,attempt_type text,attempt_id text,overall_band numeric,finalized boolean,reviewed_at timestamptz,created_at timestamptz default now());
create table private.ielts_writing_starting_points(id uuid primary key default gen_random_uuid(),attempt_id uuid,band numeric,ai_band numeric,set_at timestamptz default now());
create table private.ielts_mock_forms(code text primary key,title text);
create table private.ielts_mock_sittings(id uuid primary key,school_id uuid,batch_id uuid,mock_code text,sat_on date,delivery text,created_at timestamptz default now());
create table private.ielts_mock_results(sitting_id uuid,student_id uuid,section text,marks text,criteria jsonb,revision int default 1,entered_by uuid,entered_at timestamptz default now());
create table private.ielts_mock_cbt_attempts(id uuid primary key,student_id uuid,mock_code text,attempt_no int,exposed boolean,status text,section text,sections jsonb default '{}',started_at timestamptz default now());
create table private.ielts_mock_cbt_scores(id bigint generated always as identity primary key,attempt_id uuid,section text,raw int,scored_at timestamptz default now());
create table private.ielts_mock_cbt_writing_reviews(id bigint generated always as identity primary key,attempt_id uuid,criteria jsonb,reviewed_at timestamptz default now());
create table public.ielts_course_units(id bigint primary key,is_published boolean);
create table public.ielts_course_progress(user_id uuid,unit_id bigint,completed_at timestamptz);
create table private.ielts_official_results(id uuid primary key default gen_random_uuid(),student_id uuid,school_id uuid,test_date date,test_type text,delivery text,listening numeric,reading numeric,writing numeric,speaking numeric,overall numeric,verified boolean default false,created_at timestamptz default now());
${["ielts_round_half", "ielts_indicative_objective", "ielts_valid_band", "ielts_indicative_productive", "ielts_mock_result_json"].map((n) => fn("20261019080000_ielts_mock_capture", n)).join("\n")}
${fn("20261116100000_ielts_mock_cbt", "ielts_mock_exposed")}
`);
await db.exec(readFileSync("supabase/migrations/20261127090000_ielts_class_report_markbook.sql", "utf8"));
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

// Mark book fixtures: school practice with linked attempts, teacher Writing reviews, mocks, course and official results.
const m40 = (n) => "1".repeat(n) + "0".repeat(40 - n);
const w6 = { t1: { ta: 6, cc: 6, lr: 6, gra: 6 }, t2: { tr: 6, cc: 6, lr: 6, gra: 6 } };
await db.exec(`
insert into private.practice_fixture values
 ('00000000-0000-0000-0000-00000000d003:${aida}','school','00000000-0000-0000-0000-00000000d0a3','${aida}','aida',null,'10A','ielts_listening_set','L7',null,'Listening set 7','Week 2','listening','completed','assigned','not_tracked',now()-interval '2 days',now()-interval '1 day',null,null,'${school}'),
 ('00000000-0000-0000-0000-00000000d004:${bek}','school','00000000-0000-0000-0000-00000000d0a4','${bek}','bek',null,'10A','ielts_writing_task','12',null,'Essay: cities','Week 2','writing','completed','assigned','not_tracked',now()-interval '2 days',now()-interval '1 day',null,null,'${school}'),
 ('00000000-0000-0000-0000-00000000d005:${aida}','school','00000000-0000-0000-0000-00000000d0a5','${aida}','aida',null,'10A','ielts_writing_task','13',null,'Essay: travel','Week 3','writing','completed','assigned','not_tracked',now()-interval '2 days',now()-interval '1 day',null,null,'${school}');
insert into public.ielts_listening_attempts values('00000000-0000-0000-0000-0000000a0001','${aida}',31,40,7.5,now());
insert into public.ielts_writing_tasks values(12,'Essay: cities','Task 2','W-012'),(13,'Essay: travel','task2','W-013'),(29,'Mock Test 1 · Task 1 (paper)','Task 1 Academic','W-029'),(30,'Mock Test 1 · Task 2 (paper)','Task 2','W-030');
insert into public.ielts_writing_attempts values('00000000-0000-0000-0000-0000000b0001','${bek}',12,now(),7.0),('00000000-0000-0000-0000-0000000b0002','${aida}',13,now(),6.5),
 ('00000000-0000-0000-0000-0000000b0003','${aida}',29,now(),5.0),('00000000-0000-0000-0000-0000000b0004','${aida}',30,now(),5.0),('00000000-0000-0000-0000-0000000b0009','${far}',29,now(),5.0);
insert into public.ielts_practice_assignment_item_students values('00000000-0000-0000-0000-00000000d0a3','00000000-0000-0000-0000-00000000d003','${aida}','listening','00000000-0000-0000-0000-0000000a0001'),
 ('00000000-0000-0000-0000-00000000d0a4','00000000-0000-0000-0000-00000000d004','${bek}','writing','00000000-0000-0000-0000-0000000b0001'),
 ('00000000-0000-0000-0000-00000000d0a5','00000000-0000-0000-0000-00000000d005','${aida}','writing','00000000-0000-0000-0000-0000000b0002');
insert into public.ielts_productive_skill_reviews(school_id,student_id,attempt_type,attempt_id,overall_band,finalized) values
 ('${school}','${bek}','writing','00000000-0000-0000-0000-0000000b0001',6.0,true),
 ('${school}','${aida}','writing','00000000-0000-0000-0000-0000000b0002',5.5,false),
 ('${school}','${aida}','writing','00000000-0000-0000-0000-0000000b0003',5.5,true),
 ('${school}','${aida}','writing','00000000-0000-0000-0000-0000000b0004',null,false),
 ('${other}','${far}','writing','00000000-0000-0000-0000-0000000b0009',6.0,true);
insert into private.ielts_writing_starting_points(attempt_id,band,ai_band,set_at) values('00000000-0000-0000-0000-00000000e202',5.0,5.0,now()-interval '1 hour'),('00000000-0000-0000-0000-00000000e202',5.5,5.0,now());
insert into private.ielts_mock_forms values('IELTS-M1','Mock Test 1'),('IELTS-M2','Mock Test 2'),('IELTS-M3','Mock Test 3');
insert into private.ielts_mock_sittings values('00000000-0000-0000-0000-0000000c0001','${school}','00000000-0000-0000-0000-0000000000b1','IELTS-M1','2026-10-24','paper',now()-interval '30 days'),
 ('00000000-0000-0000-0000-0000000c0002','${school}','00000000-0000-0000-0000-0000000000b1','IELTS-M1','2026-11-20','paper',now()-interval '5 days'),
 ('00000000-0000-0000-0000-0000000c0009','${other}','00000000-0000-0000-0000-0000000000b2','IELTS-M1','2026-10-24','paper',now());
insert into private.ielts_mock_results(sitting_id,student_id,section,marks,criteria,entered_by) values
 ('00000000-0000-0000-0000-0000000c0001','${bek}','listening','${m40(29)}',null,'${lead}'),
 ('00000000-0000-0000-0000-0000000c0001','${bek}','writing',null,'${JSON.stringify(w6)}','${lead}'),
 ('00000000-0000-0000-0000-0000000c0001','${cara}','reading','${m40(23)}',null,'${lead}'),
 ('00000000-0000-0000-0000-0000000c0002','${bek}','listening','${m40(33)}',null,'${lead}'),
 ('00000000-0000-0000-0000-0000000c0009','${aida}','listening','${m40(40)}',null,'${lead}');
insert into private.ielts_mock_cbt_attempts(id,student_id,mock_code,attempt_no,exposed,status,section,sections) values
 ('00000000-0000-0000-0000-0000000d0001','${aida}','IELTS-M2',1,false,'completed','done','{"listening":{"closed_at":"2026-11-17T10:00:00Z"},"reading":{"closed_at":"2026-11-17T11:00:00Z"},"writing":{"closed_at":"2026-11-17T12:00:00Z"}}'),
 ('00000000-0000-0000-0000-0000000d0002','${aida}','IELTS-M3',1,false,'in_progress','reading','{"listening":{"closed_at":"2026-11-18T10:00:00Z"}}'),
 ('00000000-0000-0000-0000-0000000d0003','${bek}','IELTS-M2',1,false,'completed','done','{"writing":{"closed_at":"2026-11-17T12:00:00Z"}}'),
 ('00000000-0000-0000-0000-0000000d0004','${bek}','IELTS-M2',2,true,'completed','done','{"writing":{"closed_at":"2026-11-19T12:00:00Z"}}');
insert into private.ielts_mock_cbt_scores(attempt_id,section,raw) values('00000000-0000-0000-0000-0000000d0001','listening',30),('00000000-0000-0000-0000-0000000d0001','reading',22),
 ('00000000-0000-0000-0000-0000000d0002','listening',20),('00000000-0000-0000-0000-0000000d0004','listening',36);
insert into private.ielts_mock_cbt_writing_reviews(attempt_id,criteria) values('00000000-0000-0000-0000-0000000d0004','${JSON.stringify(w6)}');
insert into public.ielts_course_units values(1,true),(2,true),(3,true),(4,true),(5,false);
insert into public.ielts_course_progress values('${aida}',1,now()),('${aida}',2,now()),('${aida}',3,null),('${aida}',5,now());
insert into private.ielts_official_results(student_id,school_id,test_date,test_type,delivery,listening,reading,writing,speaking,overall,verified) values
 ('${aida}','${school}','2026-11-01','academic','computer',7,6.5,6,6.5,6.5,true),('${aida}','${other}','2026-11-02','academic','paper',9,9,9,9,9,false);
`);

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

test("mark book: mocks per section with marks and the labelled indicative range; not-sat sections; repeats are practice", async () => {
  await as(owner);
  const r = await report();
  assert.equal(r.markbook_version, 1);
  const a = byName(r, "Aida Synthetic"), b = byName(r, "Bek Synthetic"), c = byName(r, "Cara Synthetic");
  const keys = (s) => s.markbook.mocks.map((m) => m.key);
  assert.deepEqual(keys(b), ["sitting:00000000-0000-0000-0000-0000000c0001", "sitting:00000000-0000-0000-0000-0000000c0002", "cbt:00000000-0000-0000-0000-0000000d0004"]);
  const [first, repeat, cbt] = b.markbook.mocks;
  assert.equal(first.group, "paper:IELTS-M1:2026-10-24");
  assert.equal(first.title, "Mock Test 1");
  assert.equal(first.practice, false);
  assert.equal(first.sections.listening.state, "result");
  assert.equal(first.sections.listening.raw, 29);
  assert.equal(first.sections.listening.indicative.label, "6.0–7.0");
  assert.equal(first.sections.listening.marks, undefined, "item marks are not sent");
  assert.equal(first.sections.writing.indicative.label, "5.5–6.5");
  assert.deepEqual(first.sections.writing.criteria, w6, "the teacher's criterion ratings");
  assert.deepEqual([first.sections.reading.state, first.sections.speaking.state], ["not_sat", "not_sat"]);
  assert.equal(repeat.practice, true, "a second sitting of the same mock is practice");
  assert.equal(repeat.sections.listening.raw, 33);
  assert.equal(repeat.sections.listening.indicative, null, "no range for a repeat");
  assert.equal(cbt.attempt_no, 2, "the newest computer attempt");
  assert.equal(cbt.practice, true);
  assert.equal(cbt.sections.listening.indicative, null);
  assert.equal(cbt.sections.writing.state, "result");
  assert.equal(cbt.sections.writing.indicative, null);
  assert.equal(cbt.sections.speaking.state, "not_part");

  const [m2, m3] = a.markbook.mocks;
  assert.equal(a.markbook.mocks.length, 2, "another school's sitting is never shown");
  assert.equal(m2.group, "cbt:IELTS-M2");
  assert.equal(m2.delivery, "computer");
  assert.equal(m2.sections.listening.indicative.label, "6.5–7.5");
  assert.equal(m2.sections.reading.raw, 22);
  assert.equal(m2.sections.writing.state, "waiting", "computer Writing finished, not yet marked");
  assert.deepEqual([m3.sections.listening.raw, m3.sections.reading.state, m3.sections.writing.state], [20, "in_progress", "not_sat"]);

  assert.deepEqual(keys(c), ["sitting:00000000-0000-0000-0000-0000000c0001"], "left the batch, but has a result");
  assert.equal(c.markbook.mocks[0].sections.reading.indicative.label, "5.5–6.5");
  const batch = await report("batch", "00000000-0000-0000-0000-0000000000b1");
  assert.deepEqual(batch.students.map((s) => s.markbook.mocks.length), [3]);
});

test("mark book: teacher Writing bands, school practice marks, course progress and official results", async () => {
  await as(owner);
  const r = await report();
  const a = byName(r, "Aida Synthetic"), b = byName(r, "Bek Synthetic");
  const listening = item(a, "school:00000000-0000-0000-0000-00000000d003");
  assert.deepEqual(listening.score, { raw: 31, total: 40 }, "school practice marks");
  assert.equal(listening.band, undefined, "never the attempt's estimated band");
  const essay = item(b, "school:00000000-0000-0000-0000-00000000d004");
  assert.deepEqual(essay.band, { value: 6, label: "Teacher Writing band · Task 2" });
  assert.equal(essay.review, "reviewed");
  const pending = item(a, "school:00000000-0000-0000-0000-00000000d005");
  assert.equal(pending.band, undefined, "no band before the teacher finalizes the review");
  assert.equal(pending.review, "waiting");
  const screener = item(a, "screener:00000000-0000-0000-0000-00000000e002");
  assert.deepEqual(screener.band, { value: 5.5, label: "Writing starting point · Task 2 · teacher-set" }, "the newest teacher-set starting point");
  const paper = item(a, "writing:29");
  assert.equal(paper.kind, "reviewed_writing");
  assert.equal(paper.title, "Mock Test 1 · Task 1 (paper)");
  assert.deepEqual(paper.band, { value: 5.5, label: "Teacher Writing band · Task 1" });
  assert.equal(item(a, "writing:30"), undefined, "an unfinalized review is not shown");
  assert.equal(item(b, "writing:12"), undefined, "assigned work is not listed twice");
  assert.ok(!r.students.some((s) => s.items.some((i) => i.key === "writing:29" && s.name !== "Aida Synthetic")));
  assert.deepEqual(a.markbook.course, { done: 2, total: 4 }, "published units only");
  assert.deepEqual(b.markbook.course, { done: 0, total: 4 });
  assert.equal(a.markbook.official.length, 1, "only this school's official results");
  assert.deepEqual(a.markbook.official[0], { test_date: "2026-11-01", test_type: "academic", delivery: "computer", listening: 7, reading: 6.5, writing: 6, speaking: 6.5, overall: 6.5, verified: true });
  assert.deepEqual(b.markbook.official, []);
  assert.match(readFileSync("supabase/migrations/20261127090000_ielts_class_report_markbook.sql", "utf8"), /stable security definer set search_path=''/);
  const helper = (await db.query(`select grantee from information_schema.routine_privileges where routine_name='ielts_class_report_cbt_section'`)).rows.map((x) => x.grantee);
  assert.ok(!helper.includes("authenticated") && !helper.includes("anon") && !helper.includes("PUBLIC"), "the helper is not callable by users");
});
