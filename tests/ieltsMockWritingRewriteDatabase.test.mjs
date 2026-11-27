import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Diagnostic Bible 2.7.5 section 12B: Mock Test 1 Writing on computer. Released to two course batches, Writing only, 60
// minutes on the server clock, integrity events recorded, each non-blank task routed to the ordinary Writing review on the
// task it rewrites. Students who sat the paper Mock 1 take it as a practice rewrite (never a range); the others take it as
// a first, unseen sitting (indicative range once both tasks are finalized, AI check for the teacher only). Real
// migrations are loaded; only the surrounding platform objects are stand-ins.
const MIGRATION = "supabase/migrations/20261127150000_ielts_mock1_writing_rewrite.sql";
const db = new PGlite();
const owner = "1d4f3b8d-f24f-4651-ad33-85165359cf88", lead = "00000000-0000-0000-0000-00000000aaaa", outsider = "00000000-0000-0000-0000-00000000bbbb";
const school = "8eeecf5d-0496-4e0d-b5cd-538f91c9cfa0";
const octBatch = "b884a28d-f251-45ae-9ca5-8782fa9345e2", mayBatch = "7d0a628c-031a-4ba2-ba93-ae15597b41c3", otherBatch = "00000000-0000-0000-0000-0000000000b9";
// Aida sat the paper Mock 1; Bek and Fay missed it (first sitting); Cara left her batch; Dan is in another batch; Eve has full course access only.
const aida = "00000000-0000-0000-0000-000000000101", bek = "00000000-0000-0000-0000-000000000102", cara = "00000000-0000-0000-0000-000000000103",
  dan = "00000000-0000-0000-0000-000000000104", eve = "00000000-0000-0000-0000-000000000105", fay = "00000000-0000-0000-0000-000000000106";

await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,username text,email text,role text,school_id uuid,is_banned boolean default false,full_name text,batch text);
create table public.superadmins(user_id uuid primary key);
create function public.is_superadmin(uuid) returns boolean language sql as $$select exists(select 1 from public.superadmins where user_id=$1)$$;
create function private.ielts_course_has_full_access() returns boolean language sql as $$select auth.uid()='${eve}'::uuid$$;
create function public.can_manage_ielts_practice_school(p uuid) returns boolean language sql as $$select auth.uid() in ('${owner}','${lead}') and p='${school}'$$;
create function public.can_review_ielts_productive_submission(p_school uuid,p_class uuid,p_student uuid) returns boolean language sql as $$select public.can_manage_ielts_practice_school(p_school)$$;
create function private.can_review_ielts_speaking_student(uuid) returns boolean language sql as $$select auth.uid() in ('${owner}','${lead}')$$;
create table public.classes(id uuid primary key,school_id uuid,class_name text,is_active boolean default true);
create table public.class_students(class_id uuid,student_id uuid);
create table private.ielts_course_batches(id uuid primary key,school_id uuid,academic_year_id uuid,name text,revision int default 1,deleted_at timestamptz,archived_at timestamptz);
create table private.ielts_course_batch_members(batch_id uuid,student_id uuid,joined_at timestamptz default now(),left_at timestamptz,primary key(batch_id,student_id));
create function private.ielts_batch_assert(p_batch uuid) returns private.ielts_course_batches language plpgsql stable as $$
declare b private.ielts_course_batches; begin select * into b from private.ielts_course_batches where id=p_batch;
 if b.id is null or not public.can_manage_ielts_practice_school(b.school_id) then raise exception using errcode='42501',message='batch_access_required'; end if; return b; end $$;
create table private.ielts_material_construct_maps(material_type text,material_id text,item_key text,node_id uuid,role text,status text,batch_id uuid,rationale text);
create table public.ielts_writing_tasks(id bigint primary key,slug text unique,task_type text,title text,prompt text,display_code text,is_active boolean default false);
create table public.ielts_writing_attempts(id uuid primary key default gen_random_uuid(),user_id uuid not null,task_id bigint not null references public.ielts_writing_tasks(id),
 submitted_at timestamptz not null default now(),answer_text text not null,word_count int,band_overall numeric,review_status text not null default 'pending',reviewed_by uuid,reviewed_at timestamptz,
 constraint ielts_writing_attempts_answer_not_blank check (length(btrim(coalesce(answer_text,'')))>0));
create table public.ielts_productive_skill_reviews(id uuid primary key default gen_random_uuid(),school_id uuid,student_id uuid,attempt_type text,attempt_id text,review_status text default 'pending',
 reviewed_by uuid,reviewed_at timestamptz,rubric jsonb,overall_band numeric,strengths text,improvements text,next_steps text,teacher_feedback text,private_notes text,finalized boolean default false,
 created_at timestamptz default now(),unique(attempt_type,attempt_id));
create function public.ielts_productive_review_seed(p_attempt_type text,p_attempt_id text,p_student_id uuid,p_school_id uuid) returns uuid language plpgsql as $$
declare v uuid; begin insert into public.ielts_productive_skill_reviews(attempt_type,attempt_id,student_id,school_id,review_status) values(p_attempt_type,p_attempt_id,p_student_id,p_school_id,'pending')
 on conflict(attempt_type,attempt_id) do update set school_id=excluded.school_id,student_id=excluded.student_id returning id into v; return v; end $$;
create function public.ielts_review_attempt_payload(p_skill text,p_attempt_id text,p_for_student boolean) returns jsonb language sql as $$
 select jsonb_build_object('student_id',a.user_id,'task_title',t.title,'prompt',t.prompt,'answer_text',a.answer_text,'task_type',t.task_type)
 from public.ielts_writing_attempts a join public.ielts_writing_tasks t on t.id=a.task_id where a.id::text=p_attempt_id$$;
insert into public.users(id,username,role,school_id,full_name) values('${owner}','owner','admin',null,'Owner'),('${lead}','jess','teacher','${school}','Jess'),('${outsider}','other','teacher','${school}',null),
 ('${aida}','aida','student','${school}','Aida Synthetic'),('${bek}','bek','student','${school}','Bek Synthetic'),('${cara}','cara','student','${school}','Cara Synthetic'),
 ('${dan}','dan','student','${school}','Dan Synthetic'),('${eve}','eve','student','${school}','Eve Synthetic'),('${fay}','fay','student','${school}','Fay Synthetic');
insert into public.superadmins values('${owner}');
insert into private.ielts_course_batches(id,school_id,name) values('${octBatch}','${school}','IELTS · October 2026'),('${mayBatch}','${school}','IELTS for May'),('${otherBatch}','${school}','Other');
insert into private.ielts_course_batch_members(batch_id,student_id,left_at) values('${octBatch}','${aida}',null),('${mayBatch}','${bek}',null),('${octBatch}','${cara}',now()),('${otherBatch}','${dan}',null),('${mayBatch}','${fay}',null);
create table private.ielts_practice_ai_feedback(id uuid primary key default gen_random_uuid(),attempt_id uuid unique,student_id uuid,fields jsonb);
create function private.ielts_practice_feedback_json(f private.ielts_practice_ai_feedback) returns jsonb language sql as $$select f.fields$$;
insert into public.ielts_writing_tasks(id,slug,task_type,title,prompt,display_code) values
 (29,'mock-1-paper-task-1','task1','Mock Test 1 · Task 1 (paper)','The diagram below shows how rainwater is collected and treated for use in a home.','W-016'),
 (30,'mock-1-paper-task-2','task2','Mock Test 1 · Task 2 (paper)','Some people believe that every child should learn to play a musical instrument at school.','W-017');`);

// Paper capture (before learning-record wiring) and the computer mock engine (before its learning-record section).
const capture = readFileSync("supabase/migrations/20261019080000_ielts_mock_capture.sql", "utf8");
await db.exec(capture.slice(0, capture.indexOf("create or replace function private.ielts_student_construct_sources")));
const cbt = readFileSync("supabase/migrations/20261116100000_ielts_mock_cbt.sql", "utf8");
await db.exec(cbt.slice(0, cbt.indexOf("-- 7. Computer-delivered item outcomes")));
await db.exec(readFileSync("supabase/migrations/20261116104000_ielts_mock_cbt_repeat_is_practice.sql", "utf8"));

// Class report surroundings (empty unless a test fills them).
await db.exec(`
create table private.practice_rows(student_id uuid);
create function private.ielts_teacher_practice_rows(p_school uuid,p_student uuid default null,p_class uuid default null,p_items jsonb default null)
 returns table(row_id text,kind text,assignment_id uuid,student_id uuid,student_name text,class_id uuid,class_name text,material_type text,material_id text,material_version text,title text,assignment_title text,skill text,status text,assignment_status text,feedback_status text,assigned_at timestamptz,submitted_at timestamptz,feedback_at timestamptz,due_at timestamptz)
 language sql as $$select null::text,null::text,null::uuid,null::uuid,null::text,null::uuid,null::text,null::text,null::text,null::text,null::text,null::text,null::text,null::text,null::text,null::text,null::timestamptz,null::timestamptz,null::timestamptz,null::timestamptz where false$$;
create function private.ielts_material_code(t text,i text) returns text language sql as $$select null::text$$;
create table private.ielts_learning_tasks(code text primary key,questions jsonb);
create table private.ielts_learning_submissions(allocation_id uuid primary key,score integer);
create table public.ielts_practice_assignment_item_students(assignment_id uuid,assignment_item_id uuid,student_id uuid,practice_attempt_type text,practice_attempt_id uuid);
create table public.ielts_listening_attempts(id uuid primary key,user_id uuid,raw_score int,total_questions int,completed_at timestamptz);
create table public.ielts_reading_attempts(id uuid primary key,user_id uuid,raw_score int,total_questions int,completed_at timestamptz);
create table public.ielts_exam_events(id uuid primary key,title text);
create table public.ielts_exam_assignments(id uuid primary key,exam_event_id uuid,student_id uuid,school_id uuid,status text,created_at timestamptz default now());
create table public.ielts_exam_attempts(id uuid primary key,assignment_id uuid,submitted_at timestamptz,created_at timestamptz default now());
create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid,form_snapshot jsonb);
create table private.ielts_diagnostic_scoring_runs(attempt_id uuid,raw_score int,marks_possible int,run_version int,created_at timestamptz default now());
create table private.ielts_writing_screener_reviews(attempt_id uuid);
create table private.ielts_writing_starting_points(id uuid primary key default gen_random_uuid(),attempt_id uuid,band numeric,set_at timestamptz default now());
create table private.ielts_speaking_packages(code text primary key,content jsonb);
create table private.ielts_speaking_mock_assignments(id uuid primary key,student_id uuid,package_code text,created_at timestamptz default now(),cancelled_at timestamptz);
create table private.ielts_speaking_sessions(id uuid primary key,student_id uuid,school_id uuid,status text,submitted_at timestamptz,created_at timestamptz default now(),evidence_kind text);
create table private.ielts_speaking_mock_sittings(assignment_id uuid,session_id uuid,student_finished_at timestamptz);
create table private.ielts_speaking_reviews(session_id uuid,teacher_confirmed boolean);
create table private.ielts_speaking_part_bands(session_id uuid,overall numeric,created_at timestamptz default now());
create table public.ielts_course_units(id bigint primary key,is_published boolean);
create table public.ielts_course_progress(user_id uuid,unit_id bigint,completed_at timestamptz);
create table private.ielts_official_results(id uuid primary key default gen_random_uuid(),student_id uuid,school_id uuid,test_date date,test_type text,delivery text,listening numeric,reading numeric,writing numeric,speaking numeric,overall numeric,verified boolean default false,created_at timestamptz default now());
`);
await db.exec(readFileSync("supabase/migrations/20261123090000_ielts_class_report.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261127090000_ielts_class_report_markbook.sql", "utf8"));

// The paper Mock 1 sitting (Aida sat it; her paper scripts are reviewed as tasks 29/30), and a computer IELTS-M2 for Eve.
const key40 = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), { t: "mcq", a: ["A"] }]));
await db.exec(`
insert into private.ielts_mock_sittings(id,school_id,batch_id,mock_code,sat_on,delivery,created_by) values('00000000-0000-0000-0000-0000000c0001','${school}','${octBatch}','IELTS-M1','2026-10-24','paper','${lead}');
insert into private.ielts_mock_results(sitting_id,student_id,section,criteria,entered_by) values('00000000-0000-0000-0000-0000000c0001','${aida}','writing','{"t1":{"ta":5,"cc":5,"lr":5,"gra":5},"t2":{"tr":5,"cc":5,"lr":5,"gra":5}}','${lead}');
insert into public.ielts_writing_attempts(id,user_id,task_id,submitted_at,answer_text,word_count) values('00000000-0000-0000-0000-0000000b0029','${aida}',29,'2026-11-27','Paper script one.',3);
insert into public.ielts_productive_skill_reviews(school_id,student_id,attempt_type,attempt_id,rubric,overall_band,finalized,review_status) values('${school}','${aida}','writing','00000000-0000-0000-0000-0000000b0029','{"task_achievement":5,"coherence_cohesion":5,"lexical_resource":5,"grammar":5}',5.0,true,'finalized');
insert into private.ielts_mock_cbt_forms(code,version,content_sha256,source_sha256,payload,answer_key,audio,timing,release_scope)
 values('IELTS-M2','1.1.0',repeat('a',64),repeat('b',64),'{"title":"Mock Test 2","listening":{"parts":[]},"reading":{"passages":[]},"writing":{}}','${JSON.stringify({ listening: key40, reading: key40 })}',
 '{"url":"https://example.invalid/a.mp3","listen_end":1200,"sample_end":4}','{"grace_seconds":20,"reading_seconds":3600,"writing_seconds":3600,"listening_review_seconds":120}','full_access');
`);

const migration = readFileSync(MIGRATION, "utf8");
await db.exec(migration);

const as = (who) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
const rpc = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.r;
const home = () => rpc("select public.rpc_ielts_mock_cbt_home() r");
const start = (code = "IELTS-M1W") => rpc("select public.rpc_ielts_mock_cbt_start($1) r", [code]);
const state = (id) => rpc("select public.rpc_ielts_mock_cbt_state($1) r", [id]);

test("the migration is safe to re-run and installs a Writing-only form from the approved Mock 1 source", async () => {
  await db.exec(migration); // idempotent: nothing duplicated, nothing overwritten
  const f = (await db.query("select * from private.ielts_mock_cbt_forms where code='IELTS-M1W'")).rows[0];
  assert.equal(f.version, "1.0.0");
  assert.deepEqual(f.timing, { sections: ["writing"], writing_seconds: 3600, grace_seconds: 20, rewrite_of: "IELTS-M1", max_attempts: 1 });
  assert.equal(f.payload.fresh_title, "Mock Test 1 · Writing");
  assert.deepEqual(Object.keys(f.payload).filter((k) => ["listening", "reading", "writing"].includes(k)), ["writing"]);
  assert.equal(f.payload.title, "Mock Test 1 · Writing rewrite");
  assert.equal(f.payload.kind, "writing_rewrite");
  const source = JSON.parse(readFileSync("docs/ielts/mocks/mock-1/mock.json", "utf8"));
  assert.equal(f.payload.writing.task1.prompt, source.writing.task1.prompt, "the printed paper's wording");
  assert.equal(f.payload.writing.task2.prompt, source.writing.task2.prompt);
  assert.equal(f.payload.writing.task1.figure.alt, source.writing.task1.figure.alt);
  assert.equal(f.source_sha256, createHash("sha256").update(readFileSync("docs/ielts/mocks/mock-1/mock.json")).digest("hex"));
  const text = JSON.stringify(f.payload);
  for (const leak of ['"model"', '"checklist"', '"model_label"']) assert.ok(!text.includes(leak), leak);
  const png = f.payload.writing.task1.figure.src.split("?")[0];
  assert.ok(existsSync(`public${png}`) && existsSync(`public${png.replace(".png", ".svg")}`));
  assert.equal(f.payload.writing.task1.figure.src.split("v=")[1], createHash("sha256").update(readFileSync(`public${png}`)).digest("hex").slice(0, 12), "cache key matches the file");
  assert.deepEqual(f.release_batches, [octBatch, mayBatch]);
  assert.equal(f.release_scope, "pilot");
  assert.equal(f.authorized_by, owner);
  const tasks = (await db.query("select task_key,writing_task_id,label,fresh_label from private.ielts_mock_cbt_review_tasks order by task_key")).rows;
  assert.deepEqual(tasks.map((t) => [t.task_key, Number(t.writing_task_id), t.label, t.fresh_label]), [
    ["t1", 29, "Mock Test 1 · Task 1 (computer rewrite)", "Mock Test 1 · Task 1 (computer)"],
    ["t2", 30, "Mock Test 1 · Task 2 (computer rewrite)", "Mock Test 1 · Task 2 (computer)"]]);
  assert.equal((await db.query("select count(*)::int n from public.ielts_writing_tasks")).rows[0].n, 2, "no copy of the paper tasks is created");
});

test("released to the two batches only (and superadmins); never captured on paper", async () => {
  for (const [who, sees] of [[aida, true], [bek, true], [fay, true], [cara, false], [dan, false], [eve, false], [owner, true]]) {
    await as(who);
    const m1w = (await home()).find((e) => e.code === "IELTS-M1W");
    assert.equal(Boolean(m1w?.available), sees, who);
  }
  await as(dan);
  await assert.rejects(start(), /mock_not_available/);
  await as(eve);
  const m2 = (await home()).find((e) => e.code === "IELTS-M2");
  assert.equal(m2.available, true, "full mocks keep their own release");
  assert.deepEqual(m2.sections, ["listening", "reading", "writing"]);
  await as(aida);
  const m1w = (await home()).find((e) => e.code === "IELTS-M1W");
  assert.equal(m1w.minutes, 60);
  assert.deepEqual([m1w.title, m1w.kind, m1w.practice], ["Mock Test 1 · Writing rewrite", "writing_rewrite", true], "she sat the paper: a rewrite");
  assert.deepEqual(m1w.sections, ["writing"]);
  await as(bek);
  const fresh = (await home()).find((e) => e.code === "IELTS-M1W");
  assert.deepEqual([fresh.title, fresh.kind, fresh.practice], ["Mock Test 1 · Writing", "writing_mock", false], "he missed it: a first sitting");
  await as(lead);
  const forms = (await rpc("select public.rpc_ielts_mock_sittings($1) r", [octBatch])).forms.map((x) => x.code);
  assert.deepEqual(forms, ["IELTS-M1", "IELTS-M2", "IELTS-M3"]);
  await assert.rejects(rpc("select public.rpc_ielts_mock_sitting_open($1,'IELTS-M1W','2026-11-27','paper') r", [octBatch]), /unknown_mock/);
});

let aidaAttempt, bekAttempt;
test("starts at Writing, practice only for those who sat the paper, one attempt, server-timed 60 minutes", async () => {
  await as(aida);
  aidaAttempt = (await start()).attempt_id;
  assert.equal((await start()).resumed, true, "a second start resumes");
  let s = await state(aidaAttempt);
  assert.equal(s.section, "writing");
  assert.equal(s.practice, true, "she saw feedback on these prompts");
  assert.equal(s.kind, "writing_rewrite");
  assert.equal(s.payload, null, "no tasks before the section starts");
  s = await rpc("select public.rpc_ielts_mock_cbt_begin_section($1,'writing') r", [aidaAttempt]);
  assert.equal(s.section_seconds, 3600);
  assert.ok(s.remaining_seconds > 3590 && s.remaining_seconds <= 3600);
  assert.ok(s.payload.task1.figure.src.startsWith("/ielts/mocks/IELTS-M1W/"));
  await as(bek);
  bekAttempt = (await start()).attempt_id;
  const b = await state(bekAttempt);
  assert.deepEqual([b.practice, b.kind, b.title], [false, "writing_mock", "Mock Test 1 · Writing"], "a first, unseen sitting");
});

test("integrity events: recorded for the learner's own open section, bounded, never someone else's", async () => {
  await as(aida);
  for (const kind of ["tab_hidden", "tab_visible", "tab_hidden", "tab_visible", "paste_blocked", "window_blur"]) {
    assert.deepEqual(await rpc("select public.rpc_ielts_mock_cbt_log_event($1,$2) r", [aidaAttempt, kind]), { recorded: true });
  }
  await assert.rejects(rpc("select public.rpc_ielts_mock_cbt_log_event($1,'screenshot') r", [aidaAttempt]), /invalid_event/);
  await as(bek);
  await assert.rejects(rpc("select public.rpc_ielts_mock_cbt_log_event($1,'tab_hidden') r", [aidaAttempt]), /mock_attempt_not_found/);
  assert.deepEqual(await rpc("select public.rpc_ielts_mock_cbt_log_event($1,'tab_hidden') r", [bekAttempt]), { recorded: false }, "section not started yet");
  const grants = (await db.query(`select grantee from information_schema.routine_privileges where routine_name='rpc_ielts_mock_cbt_log_event'`)).rows.map((r) => r.grantee);
  assert.ok(grants.includes("authenticated") && !grants.includes("anon") && !grants.includes("PUBLIC"));
});

test("submitting routes each non-blank task to the Writing review on the task it rewrites, once", async () => {
  await as(aida);
  const t1 = "The diagram illustrates how rainwater is collected from a roof and treated before it reaches the taps.";
  const t2 = "Music lessons are valuable, but making an instrument compulsory for every child is not the best use of time.";
  assert.equal((await rpc("select public.rpc_ielts_mock_cbt_save($1,'writing',$2) r", [aidaAttempt, { t1, t2: "draft" }])).saved, true);
  const done = await rpc("select public.rpc_ielts_mock_cbt_finish_section($1,'writing',$2) r", [aidaAttempt, { t1, t2 }]);
  assert.equal(done.status, "completed");
  await db.exec(`select private.ielts_mock_cbt_close_section('${aidaAttempt}','learner'); select private.ielts_mock_cbt_route_writing('${aidaAttempt}');`);
  const scripts = (await db.query(`select w.task_id,w.answer_text,w.word_count,l.task_key,l.label from private.ielts_mock_cbt_writing_links l
    join public.ielts_writing_attempts w on w.id=l.writing_attempt_id where l.mock_attempt_id=$1 order by l.task_key`, [aidaAttempt])).rows;
  assert.deepEqual(scripts.map((x) => [Number(x.task_id), x.answer_text, x.word_count, x.label]), [
    [29, t1, 17, "Mock Test 1 · Task 1 (computer rewrite)"], [30, t2, 19, "Mock Test 1 · Task 2 (computer rewrite)"]]);
  assert.equal((await db.query(`select count(*)::int n from public.ielts_writing_attempts where user_id=$1`, [aida])).rows[0].n, 3, "paper script kept, two new scripts, no duplicates");
  await assert.rejects(start(), /mock_attempts_used/, "one attempt only");
  const m1w = (await home()).find((e) => e.code === "IELTS-M1W");
  assert.equal(m1w.available, false);
  assert.equal(m1w.attempts[0].writing_reviewed, false);
  assert.deepEqual(m1w.attempts[0].writing_tasks.map((x) => [x.task, x.reviewed, x.band]), [["t1", false, null], ["t2", false, null]]);
});

test("time-out closes the section on the server and routes what was saved; a blank task is not sent for review", async () => {
  await as(bek);
  await rpc("select public.rpc_ielts_mock_cbt_begin_section($1,'writing') r", [bekAttempt]);
  await rpc("select public.rpc_ielts_mock_cbt_save($1,'writing',$2) r", [bekAttempt, { t1: "Only Task 1 was written before time ran out.", t2: "   " }]);
  await db.exec(`update private.ielts_mock_cbt_attempts set section_deadline=now()-interval '1 minute' where id='${bekAttempt}'`);
  const s = await state(bekAttempt);
  assert.equal(s.status, "completed");
  const closed = (await db.query("select sections->'writing'->>'closed_by' c from private.ielts_mock_cbt_attempts where id=$1", [bekAttempt])).rows[0].c;
  assert.equal(closed, "time");
  const links = (await db.query("select task_key,label,fresh from private.ielts_mock_cbt_writing_links where mock_attempt_id=$1", [bekAttempt])).rows;
  assert.deepEqual(links.map((r) => [r.task_key, r.label, r.fresh]), [["t1", "Mock Test 1 · Task 1 (computer)", true]]);
});

test("the Writing review shows the rewrite title and, to the teacher only, what happened during the timed section", async () => {
  const [t1id] = (await db.query("select writing_attempt_id from private.ielts_mock_cbt_writing_links where mock_attempt_id=$1 and task_key='t1'", [aidaAttempt])).rows.map((r) => r.writing_attempt_id);
  await as(lead);
  const queue = await rpc("select public.rpc_ielts_review_queue($1,null,null,'writing') r", [school]);
  const titles = queue.filter((q) => q.student_id === aida).map((q) => q.task_title).sort();
  assert.deepEqual(titles, ["Mock Test 1 · Task 1 (computer rewrite)", "Mock Test 1 · Task 1 (paper)", "Mock Test 1 · Task 2 (computer rewrite)"]);
  const detail = await rpc("select public.rpc_ielts_review_detail('writing',$1) r", [t1id]);
  assert.equal(detail.task_title, "Mock Test 1 · Task 1 (computer rewrite)");
  assert.equal(detail.mock_rewrite.code, "IELTS-M1W");
  assert.equal(detail.mock_rewrite.practice, true);
  assert.deepEqual([detail.mock_rewrite.integrity.tab_switches, detail.mock_rewrite.integrity.paste_blocked, detail.mock_rewrite.integrity.focus_lost], [2, 1, 1]);
  assert.equal(detail.mock_rewrite.integrity.closed_by, "learner");
  assert.ok(detail.review_id, "the ordinary review is seeded");
  await as(outsider);
  await assert.rejects(rpc("select public.rpc_ielts_review_detail('writing',$1) r", [t1id]), /forbidden/);
  await as(aida);
  const own = await rpc("select public.rpc_ielts_review_detail('writing',$1) r", [t1id]);
  assert.equal(own.mock_rewrite.integrity, null, "students never see the integrity summary");
  const labels = await rpc("select public.rpc_ielts_writing_attempt_labels($1::uuid[]) r", [[t1id, "00000000-0000-0000-0000-0000000b0029"]]);
  assert.deepEqual(labels, { [t1id]: "Mock Test 1 · Task 1 (computer rewrite)" });
  await as(bek);
  assert.deepEqual(await rpc("select public.rpc_ielts_writing_attempt_labels($1::uuid[]) r", [[t1id]]), {}, "another student's script has no label for you");
});

let fayAttempt;
test("a first sitting: the AI check is for the teacher only, and both finalized tasks give the indicative range", async () => {
  await as(fay);
  fayAttempt = (await start()).attempt_id;
  await rpc("select public.rpc_ielts_mock_cbt_begin_section($1,'writing') r", [fayAttempt]);
  await rpc("select public.rpc_ielts_mock_cbt_finish_section($1,'writing',$2) r", [fayAttempt, { t1: "Fay's Task 1 answer.", t2: "Fay's Task 2 answer." }]);
  const links = (await db.query("select task_key,writing_attempt_id,label from private.ielts_mock_cbt_writing_links where mock_attempt_id=$1 order by task_key", [fayAttempt])).rows;
  assert.deepEqual(links.map((l) => l.label), ["Mock Test 1 · Task 1 (computer)", "Mock Test 1 · Task 2 (computer)"]);
  const aidaT1 = (await db.query("select writing_attempt_id from private.ielts_mock_cbt_writing_links where mock_attempt_id=$1 and task_key='t1'", [aidaAttempt])).rows[0].writing_attempt_id;
  await db.query("insert into private.ielts_practice_ai_feedback(attempt_id,student_id,fields) values($1,$2,'{\"estimate\":{\"band\":6}}'),($3,$4,'{\"estimate\":{\"band\":5.5}}')", [links[0].writing_attempt_id, fay, aidaT1, aida]);
  assert.equal(await rpc("select public.rpc_ielts_practice_feedback($1) r", [links[0].writing_attempt_id]), null, "the student never sees AI on a first sitting");
  await as(aida);
  assert.deepEqual(await rpc("select public.rpc_ielts_practice_feedback($1) r", [aidaT1]), { estimate: { band: 5.5 } }, "a rewrite is practice: AI practice feedback as usual");
  await as(lead);
  assert.deepEqual(await rpc("select public.rpc_ielts_practice_feedback($1) r", [links[0].writing_attempt_id]), { estimate: { band: 6 } }, "the teacher sees it");
  const detail = await rpc("select public.rpc_ielts_review_detail('writing',$1) r", [links[0].writing_attempt_id]);
  assert.equal(detail.task_title, "Mock Test 1 · Task 1 (computer)");
  assert.deepEqual([detail.mock_rewrite.practice, detail.mock_rewrite.ai_teacher_only, detail.mock_rewrite.kind, detail.mock_rewrite.title], [false, true, "writing_mock", "Mock Test 1 · Writing"]);
  await rpc("select public.rpc_ielts_review_detail('writing',$1) r", [links[1].writing_attempt_id]);
  for (const [l, b] of [[links[0], 6], [links[1], 6.5]]) {
    await db.query(`update public.ielts_productive_skill_reviews set finalized=true,review_status='finalized',overall_band=$2,reviewed_at=now(),
      rubric=jsonb_build_object('task_achievement',$2::numeric,'coherence_cohesion',$2::numeric,'lexical_resource',$2::numeric,'grammar',$2::numeric) where attempt_id=$1`, [l.writing_attempt_id, b]);
  }
  const r = (await rpc("select public.rpc_ielts_class_report($1,'batch',$2) r", [school, mayBatch])).students.find((x) => x.id === fay);
  assert.equal(r.markbook.mocks.length, 1);
  const m = r.markbook.mocks[0];
  assert.deepEqual([m.title, m.group, m.practice], ["Mock Test 1 · Writing", "cbt:IELTS-M1W:first", false]);
  assert.equal(m.sections.writing.indicative.label, "6.0–7.0", "(6 + 2 × 6.5) / 3 → 6.5, shown as a range");
  assert.equal(m.sections.writing.practice_reason, undefined);
  assert.equal(r.items.find((i) => i.key === "writing:29:IELTS-M1W:first").title, "Mock Test 1 · Task 1 (computer)");
  await as(fay);
  const res = await rpc("select public.rpc_ielts_mock_cbt_result($1) r", [fayAttempt]);
  assert.deepEqual([res.kind, res.title, res.practice, res.skills.writing.indicative.label], ["writing_mock", "Mock Test 1 · Writing", false, "6.0–7.0"]);
  const labels = await rpc("select public.rpc_ielts_writing_attempt_labels($1::uuid[]) r", [[links[1].writing_attempt_id]]);
  assert.deepEqual(labels, { [links[1].writing_attempt_id]: "Mock Test 1 · Task 2 (computer)" });
  await as(lead);
  const bek_ = (await rpc("select public.rpc_ielts_class_report($1,'batch',$2) r", [school, mayBatch])).students.find((x) => x.id === bek);
  assert.equal(bek_.markbook.mocks[0].sections.writing.state, "waiting");
});

test("the old superadmin marking page leaves the rewrite to the Writing review", async () => {
  await as(owner);
  const queue = await rpc("select public.rpc_ielts_mock_cbt_marking_queue() r");
  assert.ok(!queue.some((q) => q.code === "IELTS-M1W"));
  await assert.rejects(rpc("select public.rpc_ielts_mock_cbt_mark_writing($1,$2) r", [aidaAttempt, { t1: { ta: 6, cc: 6, lr: 6, gra: 6 }, t2: { tr: 6, cc: 6, lr: 6, gra: 6 } }]), /mock_marked_in_writing_review/);
});

test("class report: the rewrite sits beside the paper Mock 1, Writing waits for both reviews, never an indicative range", async () => {
  await as(lead);
  const report = async () => (await rpc("select public.rpc_ielts_class_report($1,'batch',$2) r", [school, octBatch])).students.find((s) => s.id === aida);
  let a = await report();
  const forms = a.markbook.mocks.map((m) => [m.form, m.title, m.delivery]);
  assert.deepEqual(forms, [["IELTS-M1", "Mock Test 1", "paper"], ["IELTS-M1W", "Mock Test 1 · Writing rewrite", "computer"]]);
  let rewrite = a.markbook.mocks[1];
  assert.equal(rewrite.practice, true);
  assert.deepEqual(["listening", "reading", "speaking"].map((k) => rewrite.sections[k].state), ["not_part", "not_part", "not_part"]);
  assert.equal(rewrite.sections.writing.state, "waiting");

  const links = (await db.query("select task_key,writing_attempt_id from private.ielts_mock_cbt_writing_links where mock_attempt_id=$1 order by task_key", [aidaAttempt])).rows;
  const finalize = (id, b) => db.query(`update public.ielts_productive_skill_reviews set finalized=true,review_status='finalized',overall_band=$2,reviewed_at=now(),
    rubric=jsonb_build_object('task_achievement',$2::numeric,'coherence_cohesion',$2::numeric,'lexical_resource',$2::numeric,'grammar',$2::numeric) where attempt_id=$1`, [id, b]);
  await as(aida); // seed both reviews the way opening them does
  for (const l of links) await rpc("select public.rpc_ielts_review_detail('writing',$1) r", [l.writing_attempt_id]);
  await finalize(links[0].writing_attempt_id, 6);
  await as(lead);
  assert.equal((await report()).markbook.mocks[1].sections.writing.state, "waiting", "one task still to review");
  await finalize(links[1].writing_attempt_id, 6.5);
  a = await report();
  rewrite = a.markbook.mocks[1];
  assert.equal(rewrite.sections.writing.state, "result");
  assert.deepEqual(rewrite.sections.writing.criteria, { t1: { ta: 6, cc: 6, lr: 6, gra: 6 }, t2: { tr: 6.5, cc: 6.5, lr: 6.5, gra: 6.5 } });
  assert.equal(rewrite.sections.writing.indicative, null, "a rewrite is practice: no indicative range");
  assert.equal(rewrite.sections.writing.practice_reason, "rewrite");
  const item = (k) => a.items.find((i) => i.key === k);
  assert.equal(item("writing:29").title, "Mock Test 1 · Task 1 (paper)");
  assert.equal(item("writing:29:IELTS-M1W").title, "Mock Test 1 · Task 1 (computer rewrite)");
  assert.deepEqual(item("writing:29:IELTS-M1W").band, { value: 6, label: "Teacher Writing band · Task 1" });
  assert.deepEqual(item("writing:30:IELTS-M1W").band, { value: 6.5, label: "Teacher Writing band · Task 2" });

  await as(aida);
  const result = await rpc("select public.rpc_ielts_mock_cbt_result($1) r", [aidaAttempt]);
  assert.equal(result.kind, "writing_rewrite");
  assert.equal(result.skills.writing.indicative, null, "a rewrite never has a range");
  assert.equal(result.skills.writing.reviewed_in_writing_review, true);
  assert.equal(result.skills.listening, undefined);
  assert.deepEqual(result.skills.writing.tasks.map((t) => [t.task, t.reviewed, Number(t.band)]), [["t1", true, 6], ["t2", true, 6.5]]);
  assert.equal((await home()).find((e) => e.code === "IELTS-M1W").attempts[0].writing_reviewed, true);
});

test("full computer mocks keep Listening → Reading → Writing", async () => {
  await as(eve);
  const id = (await start("IELTS-M2")).attempt_id;
  assert.equal((await state(id)).section, "listening");
  assert.equal((await state(id)).practice, false);
  await rpc("select public.rpc_ielts_mock_cbt_begin_section($1,'listening') r", [id]);
  const next = await rpc("select public.rpc_ielts_mock_cbt_finish_section($1,'listening',$2) r", [id, { 1: "A" }]);
  assert.equal(next.section, "reading");
  assert.equal((await db.query("select raw from private.ielts_mock_cbt_scores where attempt_id=$1", [id])).rows[0].raw, 1);
  assert.equal((await db.query("select count(*)::int n from private.ielts_mock_cbt_writing_links where mock_attempt_id=$1", [id])).rows[0].n, 0);
});
