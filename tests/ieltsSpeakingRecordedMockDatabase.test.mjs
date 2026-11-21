import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Diagnostic Bible 2.7.0 section 10.12: recorded-examiner Speaking practice mock.
const db = new PGlite(),
  student = "b30e9c28-96f1-4d34-83e9-9b28b4926f42",
  owner = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003",
  school = "00000000-0000-0000-0000-000000000004",
  admin = "00000000-0000-0000-0000-000000000005";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const sha = (c) => c.repeat(64).slice(0, 64);
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table users(id uuid primary key,username text,role text,school_id uuid,is_banned boolean default false);
create table school_members(user_id uuid,school_id uuid,status text,role_in_school text);
create table classes(id uuid,school_id uuid,subject text);create table class_students(student_id uuid,class_id uuid);
create table class_teacher_assignments(class_id uuid,school_id uuid,teacher_user_id uuid,active boolean,subject text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
create function public.is_superadmin(uuid) returns boolean language sql as $$select $1='${owner}'::uuid$$;
create function public.school_has_module_access(uuid,text) returns boolean language sql as $$select $1='${school}'::uuid$$;
create function private.student_has_programme_seat(uuid,text,uuid) returns boolean language sql as $$select true$$;
create function private.actor_can_access_school_programme(uuid,text,boolean) returns boolean language sql as $$select auth.uid() in ('${owner}'::uuid,'${admin}'::uuid) and $1='${school}'::uuid$$;
create function private.teacher_current_teaching_roster(uuid,uuid) returns table(student_id uuid,academic_subject_code text,school_subject_name text) language sql as $$select null::uuid,null::text,null::text where false$$;
create function private.teacher_current_teaching_groups(uuid,uuid) returns table(id uuid) language sql as $$select null::uuid where false$$;
insert into users values('${student}','Synthetic Gulzada fixture','student','${school}',false),('${owner}','Synthetic owner','admin',null,false),
 ('${other}','Other student','student','${school}',false),('${admin}','School admin','teacher','${school}',false);
insert into school_members values('${student}','${school}','active','student'),('${other}','${school}','active','student'),('${admin}','${school}','active','school_admin');`);
for (const m of [
  "20261007112613_ielts_speaking_interview_pilot",
  "20261007125521_ielts_speaking_eligible_release",
  "20261008065539_ielts_speaking_school_seat_access",
  "20261121154500_ielts_speaking_recorded_mock",
])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
// Readers created by later migrations exist in production; stand-ins carry their exact guarded text
// so the reader-guard migration can run here. Its real targets are checked against the repository below.
await db.exec(`
create function public.rpc_ielts_starting_point_summary() returns jsonb language sql as $f$ select '{}'::jsonb /* where s.student_id=actor and private.can_access_ielts_speaking(s.id) */ $f$;
create function public.rpc_ielts_programme_workspace(uuid,text,integer) returns jsonb language sql as $f$ select '{}'::jsonb /* where s.student_id=u.id and s.school_id=p_school_id and private.can_access_ielts_speaking(s.id) */ $f$;
create function private.ielts_report_evidence(uuid,uuid,timestamptz,timestamptz) returns jsonb language sql as $f$ select '{}'::jsonb /* where s.school_id=p_school and s.student_id=p_student and s.status='submitted' and s.submitted_at<=work_through */ $f$;
create function private.ielts_student_productive_ratings(uuid) returns jsonb language sql as $f$ select '{}'::jsonb /* join private.ielts_speaking_sessions s on s.id = r.session_id and s.student_id = p_student */ $f$;
create function private.ielts_batch_practice_source(uuid,uuid,text) returns uuid language sql as $f$ select null::uuid /* where s.student_id=p_student and s.school_id=p_school and s.status='submitted' */ $f$;
create function public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid) returns jsonb language sql as $f$ select '{}'::jsonb /* where s.id=p_source and s.student_id=p_student and s.school_id=p_school and s.status='submitted' */ $f$;`);
await db.exec(readFileSync("supabase/migrations/20261121154600_ielts_speaking_mock_reader_guards.sql", "utf8"));

const as = (u) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [u ?? ""]);
const one = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const put = (bucket, name, size, mime) =>
  db.query("insert into storage.objects values($1,$2,jsonb_build_object('size',$3::bigint,'mimetype',$4::text))", [bucket, name, size, mime]);
const voice = { provider: "runway", model: "eleven_multilingual_v2", voice: "Miriam", settings: {} };
const cue = { topic: "Describe a place where you like to study.", points: ["where it is", "what it looks like", "why you like it"] };
const L = (key, part, kind, body, extra = {}) => ({ key, part, kind, body, ...extra });
const lines = [
  L("sound", 0, "sound_check", "Hello. If you can hear me clearly, press the green button."),
  L("intro", 0, "say", "Good morning. This is a practice speaking test."),
  L("p1.intro", 1, "say", "In this first part, I'd like to ask you some questions about yourself."),
  L("p1.q1", 1, "question", "Do you work or are you a student?", { answer_seconds: 30, replay_allowed: true }),
  L("p1.q2", 1, "question", "What do you like most about your school?", { answer_seconds: 30, replay_allowed: true }),
  L("p1.q3", 1, "question", "How do you usually get to school?", { answer_seconds: 30, replay_allowed: true }),
  L("p2.intro", 2, "say", "Now I'm going to give you a topic, and I'd like you to talk about it for one to two minutes."),
  L("p2.prepare", 2, "prepare", "You have one minute to prepare. You can make notes if you wish."),
  L("p2.start", 2, "long_turn", "All right. Please start speaking now.", { answer_seconds: 120 }),
  L("p2.f1", 2, "question", "Do you often study there with friends?", { answer_seconds: 20 }),
  L("p3.intro", 3, "say", "We've been talking about places to study. Let's discuss this more generally."),
  L("p3.q1", 3, "question", "Why do some students prefer to study at home?", { answer_seconds: 45 }),
  L("p3.q2", 3, "question", "How have libraries changed in recent years?", { answer_seconds: 45 }),
  L("p3.q3", 3, "question", "Should schools give students more quiet places to work?", { answer_seconds: 45 }),
  L("end", 4, "say", "Thank you. That is the end of the speaking test."),
];
const mockHash = sha("m"),
  script1 = id(100),
  script2 = id(101);
await db.query(
  `insert into private.ielts_speaking_packages(code,content,content_hash,pilot_student) values('bh-speaking-mock-b',$1,$2,$3)`,
  [JSON.stringify({ code: "bh-speaking-mock-b", title: "Speaking practice mock B", delivery_mode: "recorded_examiner" }), mockHash, student],
);
const review = { editorial: true, task_design: true, taxonomy: true, difficulty_timing: true, rights: true, originality: true, notes: "Synthetic test approval only." };

let audio = []; // [audio_id, key, sha]
test("only the owner prepares scripts; scripts are validated and quote only lines that still need audio", async () => {
  await as(admin);
  await assert.rejects(db.query("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-mock-b',$2,$3,$4,$5)", [script1, mockHash, voice, cue, JSON.stringify(lines)]), /not_authorized/);
  await as(owner);
  await assert.rejects(db.query("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-interview-a',$2,$3,$4,$5)", [script1, mockHash, voice, cue, JSON.stringify(lines)]), /mock_package_required/);
  const noPart2 = lines.filter((l) => l.part !== 2);
  await assert.rejects(db.query("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-mock-b',$2,$3,$4,$5)", [script1, mockHash, voice, cue, JSON.stringify(noPart2)]), /part_2_required/);
  const praise = lines.map((l) => (l.key === "p1.q1" ? { ...l, body: "[excited] Great! Do you work or study?" } : l));
  await assert.rejects(db.query("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-mock-b',$2,$3,$4,$5)", [script1, mockHash, voice, cue, JSON.stringify(praise)]), /body:4/, "no delivery tags");
  const p3replay = lines.map((l) => (l.key === "p3.q1" ? { ...l, replay_allowed: true } : l));
  await assert.rejects(db.query("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-mock-b',$2,$3,$4,$5)", [script1, mockHash, voice, cue, JSON.stringify(p3replay)]), /replay:12/);
  const short = lines.map((l) => (l.key === "p2.start" ? { ...l, answer_seconds: 90 } : l));
  await assert.rejects(db.query("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-mock-b',$2,$3,$4,$5)", [script1, mockHash, voice, cue, JSON.stringify(short)]), /long_turn/);
  const s = await one("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-mock-b',$2,$3,$4,$5)", [script1, mockHash, voice, cue, JSON.stringify(lines)]);
  assert.equal(s.version, 1);
  assert.equal(s.lines.length, lines.length);
  assert.deepEqual(s.needs_audio, { lines: lines.length, characters: lines.reduce((n, l) => n + l.body.length, 0) });
  audio = s.lines.map((l, i) => [id(200 + i), l.audio_key, sha(String.fromCharCode(97 + (i % 6)))]);
});

test("examiner audio is stored privately, registered by the server and approved by a named person", async () => {
  await as(owner);
  await assert.rejects(db.query("select rpc_ielts_release_speaking_mock_script($1)", [script1]), /package_not_approved/);
  await db.query("select rpc_ielts_approve_speaking_mock_package('bh-speaking-mock-b',$1,$2)", [mockHash, review]);
  await assert.rejects(db.query("select rpc_ielts_release_speaking_mock_script($1)", [script1]), /audio_not_approved/);
  const reg = (a, size = 30000) =>
    db.query("select rpc_ielts_register_speaking_mock_audio($1,$2,$3,$4,3.2,$5,'runway','task-1','Generated by the owner on a paid Runway plan')", [a[0], a[1], `${a[0]}.mp3`, a[2], size]);
  await assert.rejects(reg(audio[0]), /audio_not_stored/);
  for (const a of audio) {
    await put("ielts-speaking-examiner", `${a[0]}.mp3`, 30000, "audio/mpeg");
    await reg(a);
  }
  await as(admin);
  await assert.rejects(db.query("select rpc_ielts_review_speaking_mock_audio($1,$2,true,null)", [audio[0][0], audio[0][2]]), /not_authorized/);
  await as(owner);
  await assert.rejects(db.query("select rpc_ielts_review_speaking_mock_audio($1,$2,true,null)", [audio[0][0], sha("0")]), /audio_changed/);
  for (const a of audio) await db.query("select rpc_ielts_review_speaking_mock_audio($1,$2,true,null)", [a[0], a[2]]);
  const s = await one("select rpc_ielts_release_speaking_mock_script($1)", [script1]);
  assert.ok(s.released_at);
  assert.deepEqual(s.needs_audio, { lines: 0, characters: 0 });
});

test("editing one line makes a new version that needs audio for that line only", async () => {
  await as(owner);
  const edited = lines.map((l) => (l.key === "p3.q2" ? { ...l, body: "How have public libraries changed recently?" } : l));
  const s = await one("select rpc_ielts_create_speaking_mock_script($1,'bh-speaking-mock-b',$2,$3,$4,$5)", [script2, mockHash, voice, cue, JSON.stringify(edited)]);
  assert.equal(s.version, 2);
  assert.deepEqual(s.needs_audio, { lines: 1, characters: "How have public libraries changed recently?".length });
  await assert.rejects(db.query("select rpc_ielts_release_speaking_mock_script($1)", [script2]), /audio_not_approved/, "the old version stays the live one");
});

let assignment = id(300),
  otherAssignment = id(301),
  session = id(400),
  otherSession = id(401);
test("teachers assign released mocks; unpublished mocks reach only the pilot student; one open attempt each", async () => {
  await as(admin);
  await assert.rejects(db.query("select rpc_ielts_assign_speaking_mock('bh-speaking-mock-b',$1)", [JSON.stringify([{ student_id: other, assignment_id: otherAssignment }])]), /not_published/);
  assert.equal((await one("select rpc_ielts_assign_speaking_mock('bh-speaking-mock-b',$1)", [JSON.stringify([{ student_id: student, assignment_id: assignment }])])).assigned, 1);
  assert.equal((await one("select rpc_ielts_assign_speaking_mock('bh-speaking-mock-b',$1)", [JSON.stringify([{ student_id: student, assignment_id: id(399) }])])).assigned, 0, "one open attempt");
  await as(owner);
  await db.query("select rpc_ielts_publish_speaking_mock('bh-speaking-mock-b',$1,'Synthetic publication for tests')", [mockHash]);
  await as(admin);
  assert.equal((await one("select rpc_ielts_assign_speaking_mock('bh-speaking-mock-b',$1)", [JSON.stringify([{ student_id: other, assignment_id: otherAssignment }])])).assigned, 1);
  await as(other);
  await assert.rejects(db.query("select rpc_ielts_assign_speaking_mock('bh-speaking-mock-b',$1)", [JSON.stringify([{ student_id: other, assignment_id: id(398) }])]), /not_authorized/);
});

test("starting needs recorded consent; the voice question is asked only where the school holds parents' agreement", async () => {
  await as(student);
  const home = await one("select rpc_ielts_speaking_mock_home()");
  assert.equal(home.mocks[0].state, "ready");
  assert.equal(home.voice_wording, null);
  await assert.rejects(db.query("select rpc_ielts_start_speaking_mock($1,$2,false,'mock-recording-v1',null,null)", [assignment, session]), /recording_consent_required/);
  await assert.rejects(db.query("select rpc_ielts_start_speaking_mock($1,$2,true,'made-up',null,null)", [assignment, session]), /recording_consent_required/);
  await as(other);
  await assert.rejects(db.query("select rpc_ielts_start_speaking_mock($1,$2,true,'mock-recording-v1',null,null)", [assignment, session]), /not_authorized/);
  await as(student);
  const sit = await one("select rpc_ielts_start_speaking_mock($1,$2,true,'mock-recording-v1',null,null)", [assignment, session]);
  assert.equal(sit.status, "in_progress");
  assert.equal((await one("select rpc_ielts_start_speaking_mock($1,$2,true,'mock-recording-v1',null,null)", [assignment, session])).session_id, session, "resume is idempotent");
  await assert.rejects(db.query("select rpc_ielts_start_speaking_mock($1,$2,true,'mock-recording-v1',null,null)", [assignment, id(402)]), /already_started/);
  const rows = (await db.query("select kind,asked,answer,wording_version from private.ielts_speaking_consent_records where session_id=$1 order by kind", [session])).rows;
  assert.deepEqual(rows, [
    { kind: "recording", asked: true, answer: true, wording_version: "mock-recording-v1" },
    { kind: "voice_improvement", asked: false, answer: false, wording_version: null },
  ]);
  const s = (await db.query("select evidence_kind,delivery_mode,teacher_id from private.ielts_speaking_sessions where id=$1", [session])).rows[0];
  assert.deepEqual(s, { evidence_kind: "practice_mock", delivery_mode: "recorded_examiner", teacher_id: admin });

  await as(other);
  await assert.rejects(db.query("select rpc_ielts_set_school_voice_agreement($1,true,'Parents signed the school form')", [school]), /not_authorized/);
  await as(admin);
  await db.query("select rpc_ielts_set_school_voice_agreement($1,true,'Parents signed the school consent form in November')", [school]);
  await as(other);
  assert.equal((await one("select rpc_ielts_speaking_mock_home()")).voice_wording.version, "mock-voice-v1");
  await assert.rejects(db.query("select rpc_ielts_start_speaking_mock($1,$2,true,'mock-recording-v1',null,null)", [otherAssignment, otherSession]), /voice_consent_answer_required/);
  await db.query("select rpc_ielts_start_speaking_mock($1,$2,true,'mock-recording-v1',true,'mock-voice-v1')", [otherAssignment, otherSession]);
  assert.equal(await one("select private.ielts_voice_improvement_allowed($1)", [otherSession]), false, "no legal review recorded yet");
  await as(owner);
  await db.query("select rpc_ielts_record_voice_legal_review(array['KG'],'Synthetic legal review record for the test only')");
  assert.equal(await one("select private.ielts_voice_improvement_allowed($1)", [otherSession]), true);
  assert.equal(await one("select private.ielts_voice_improvement_allowed($1)", [session]), false, "never asked means no");
  await as(other);
  await db.query("select rpc_ielts_withdraw_speaking_voice_consent($1)", [otherSession]);
  assert.equal(await one("select private.ielts_voice_improvement_allowed($1)", [otherSession]), false, "withdrawal stops use");
  await assert.rejects(db.query("update private.ielts_speaking_consent_records set answer=false where session_id=$1", [otherSession]), /immutable/);
});

const ans = (n) => id(500 + n);
test("the sitting sends no question text; checks, order, replay and Part 2 timing are kept by the server", async () => {
  await as(student);
  const sit = await one("select rpc_ielts_speaking_mock_sitting($1)", [session]);
  for (const l of lines) if (l.kind !== "sound_check") assert.ok(!JSON.stringify(sit).includes(l.body), `no text for ${l.key}`);
  assert.equal(sit.cue_card.topic, cue.topic);
  assert.ok(sit.lines.every((l) => l.audio_path));
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.q1',$2)", [session, ans(1)]), /checks_required/);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_checks($1,$2)", [session, { sound: true, room: false, microphone: true }]), /checks_required/);
  await db.query("select rpc_ielts_speaking_mock_checks($1,$2)", [session, { sound: true, room: true, microphone: true, noise_db: -48 }]);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.q2',$2)", [session, ans(2)]), /out_of_order/);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.intro',$2)", [session, ans(2)]), /not_answerable/);
  await db.query("select rpc_ielts_speaking_mock_replay($1,'p1.q1')", [session]);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_replay($1,'p1.q1')", [session]), /replay_used/);
  await db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.q1',$2)", [session, ans(1)]);
  await db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.q1',$2)", [session, ans(1)]);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.q1',$2)", [session, ans(9)]), /already_started/);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_prepare($1)", [session]), /previous_part_required/);
  await db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.q2',$2)", [session, ans(2)]);
  await db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p1.q3',$2)", [session, ans(3)]);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p2.start',$2)", [session, ans(4)]), /preparation_required/);
  const prep = (await one("select rpc_ielts_speaking_mock_prepare($1)", [session])).preparation_started_at;
  assert.equal((await one("select rpc_ielts_speaking_mock_prepare($1)", [session])).preparation_started_at, prep, "refresh cannot reset the minute");
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p2.start',$2)", [session, ans(4)]), /preparation_required/);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_replay($1,'p3.q1')", [session]), /replay_not_allowed/);
  await db.exec(`alter table private.ielts_speaking_sessions disable trigger speaking_history;
    update private.ielts_speaking_sessions set preparation_started_at=now()-interval '61 seconds' where id='${session}';
    alter table private.ielts_speaking_sessions enable trigger speaking_history;`);
  await db.query("select rpc_ielts_speaking_mock_begin_answer($1,'p2.start',$2)", [session, ans(4)]);
});

test("teachers cannot record into a student's mock, and interviews ignore an open mock", async () => {
  await as(admin);
  await assert.rejects(db.query("select rpc_ielts_begin_speaking_capture($1,$2,1)", [session, id(600)]), /not_authorized/);
  await assert.rejects(db.query("select rpc_ielts_speaking_prepare($1)", [session]), /not_authorized/);
  await assert.rejects(db.query("select rpc_ielts_submit_speaking_pilot($1)", [session]), /not_authorized/);
  assert.equal(await one("select private.ielts_speaking_storage_access($1,true)", [`${session}/1/${id(600)}.wav`]), false);
  await as(owner);
  const interview = await one("select rpc_ielts_speaking_home()");
  await db.query("select rpc_ielts_approve_speaking_pilot($1,$2)", [interview.content_hash, { editorial: true, task_design: true, taxonomy: true, difficulty_timing: true, rights: true, notes: "Synthetic approval for tests." }]);
  await as(admin);
  assert.equal(await one("select rpc_ielts_start_speaking_interview($1,$2,true)", [student, id(650)]), id(650), "an open mock is never resumed as an interview");
  const kinds = (await db.query("select evidence_kind from private.ielts_speaking_sessions where id=$1", [id(650)])).rows[0];
  assert.equal(kinds.evidence_kind, "first_sitting", "a mock does not turn the interview into a repeat");
  const ws = await one("select rpc_ielts_speaking_workspace($1,'')", [student]);
  assert.ok(ws.sessions.some((s) => s.id === id(650)));
  assert.ok(!ws.sessions.some((s) => s.id === session), "mocks are not listed as interviews");
});

test("answers upload once into private storage; examiner audio plays only for the student's open mock", async () => {
  const path = (n) => `${session}/${ans(n)}.wav`;
  await as(student);
  assert.equal(await one("select private.ielts_speaking_mock_answer_upload($1)", [path(1)]), true);
  assert.equal(await one("select private.ielts_speaking_mock_answer_upload($1)", [`${session}/${id(999)}.wav`]), false);
  assert.equal(await one("select private.ielts_speaking_examiner_audio_access($1)", [`${audio[3][0]}.mp3`]), true);
  await as(admin);
  assert.equal(await one("select private.ielts_speaking_examiner_audio_access($1)", [`${audio[3][0]}.mp3`]), false);
  await as(other);
  assert.equal(await one("select private.ielts_speaking_mock_answer_upload($1)", [path(1)]), false);
  await as(student);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_answer_saved($1,$2,false,false)", [session, ans(1)]), /audio_not_uploaded/);
  for (const n of [1, 2, 4]) await put("ielts-speaking-mock-answers", path(n), 640000, "audio/wav");
  for (const n of [1, 2, 4]) await db.query("select rpc_ielts_speaking_mock_answer_saved($1,$2,false,false)", [session, ans(n)]);
  // The tab closed during p1.q3 and no audio survived on the device.
  await db.query("select rpc_ielts_speaking_mock_answer_saved($1,$2,true,true)", [session, ans(3)]);
  assert.equal(await one("select private.ielts_speaking_mock_answer_upload($1)", [path(1)]), false, "no second upload");
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_finish($1)", [session]), /answers_pending/);
  const rest = [["p2.f1", 5], ["p3.q1", 6], ["p3.q2", 7], ["p3.q3", 8]];
  for (const [key, n] of rest) {
    await db.query("select rpc_ielts_speaking_mock_begin_answer($1,$2,$3)", [session, key, ans(n)]);
    await put("ielts-speaking-mock-answers", path(n), 640000, "audio/wav");
    await db.query("select rpc_ielts_speaking_mock_answer_saved($1,$2,false,false)", [session, ans(n)]);
  }
  assert.equal((await one("select rpc_ielts_speaking_mock_finish($1)", [session])).finished, true);
});

test("the server verifies answers, joins each part into one interview clip and submits", async () => {
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_verify_answer($1,$2,40)", [ans(1), sha("1")]), /answer_invalid/, "longer than 30 s + 3 s");
  for (const n of [1, 2, 4, 5, 6, 7, 8]) await db.query("select rpc_ielts_speaking_mock_verify_answer($1,$2,20)", [ans(n), sha(String(n))]);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_verify_answer($1,$2,20)", [ans(3), sha("3")]), /not_uploaded/);
  const clip = (p) => id(700 + p);
  const attach = (p, segs, dur = 60) => db.query("select rpc_ielts_speaking_mock_attach_part($1,$2,$3,$4,$5,$6)", [session, p, clip(p), sha("c"), dur, JSON.stringify(segs)]);
  await assert.rejects(attach(2, [{ line_key: "p2.start", start: 0, end: 20 }]), /previous_part_required/);
  await assert.rejects(attach(1, [{ line_key: "p1.q1", start: 0, end: 20 }]), /segments_invalid/, "p1.q2 missing");
  await assert.rejects(attach(1, [{ line_key: "p1.q2", start: 0, end: 20 }, { line_key: "p1.q1", start: 21, end: 40 }]), /segments_invalid/, "wrong order");
  await assert.rejects(attach(1, [{ line_key: "p1.q1", start: 0 }, { line_key: "p1.q2", start: 21, end: 40 }]), /segments_invalid/);
  const p1 = [{ line_key: "p1.q1", start: 0, end: 20 }, { line_key: "p1.q2", start: 21, end: 41 }];
  await assert.rejects(attach(1, p1), /audio_not_uploaded/);
  for (const p of [1, 2, 3]) await put("ielts-speaking-pilot", `${session}/${p}/${clip(p)}.wav`, 2000000, "audio/wav");
  await attach(1, p1);
  await attach(1, p1);
  await attach(2, [{ line_key: "p2.start", start: 0, end: 20 }, { line_key: "p2.f1", start: 21, end: 41 }]);
  await assert.rejects(db.query("select rpc_ielts_speaking_mock_submit($1)", [session]), /three_parts_required/);
  await attach(3, [{ line_key: "p3.q1", start: 0, end: 20 }, { line_key: "p3.q2", start: 21, end: 41 }, { line_key: "p3.q3", start: 42, end: 62 }], 63);
  const clips = (await db.query("select part,interrupted from private.ielts_speaking_clips where session_id=$1 order by part", [session])).rows;
  assert.deepEqual(clips, [{ part: 1, interrupted: true }, { part: 2, interrupted: false }, { part: 3, interrupted: false }]);
  assert.equal(await one("select count(*)::int from private.ielts_speaking_audio_receipts where session_id=$1", [session]), 3);
  await db.query("select rpc_ielts_speaking_mock_answer_file_deleted($1)", [ans(1)]);
  await assert.rejects(db.query("delete from private.ielts_speaking_mock_answers where id=$1", [ans(1)]), /immutable/);
  await assert.rejects(db.query("update private.ielts_speaking_mock_answers set sha256=$2 where id=$1", [ans(2), sha("z")]), /immutable/);
  assert.equal((await one("select rpc_ielts_speaking_mock_submit($1)", [session])).submitted, true);
  await as(student);
  assert.equal((await one("select rpc_ielts_speaking_mock_home()")).mocks[0].state, "finished");
  await as(admin);
  const list = await one("select rpc_ielts_speaking_mock_teacher_list($1)", [student]);
  assert.equal(list[0].status, "submitted");
  assert.equal(list[0].interrupted_answers, 1);
  assert.equal((await one("select rpc_ielts_assign_speaking_mock('bh-speaking-mock-b',$1)", [JSON.stringify([{ student_id: student, assignment_id: id(397) }])])).assigned, 1, "a new attempt after finishing");
});

test("server steps are server-only and mock tables are private", async () => {
  const server = [
    "rpc_ielts_register_speaking_mock_audio(uuid,text,text,text,numeric,bigint,text,text,text)",
    "rpc_ielts_speaking_mock_verify_answer(uuid,text,numeric)",
    "rpc_ielts_speaking_mock_attach_part(uuid,integer,uuid,text,numeric,jsonb)",
    "rpc_ielts_speaking_mock_answer_file_deleted(uuid)",
    "rpc_ielts_speaking_mock_submit(uuid)",
  ];
  for (const fn of server) {
    for (const role of ["anon", "authenticated"]) assert.equal(await one("select has_function_privilege($1,$2,'execute')", [role, `public.${fn}`]), false, `${role} ${fn}`);
    assert.equal(await one("select has_function_privilege('service_role',$1,'execute')", [`public.${fn}`]), true);
  }
  for (const fn of ["rpc_ielts_speaking_mock_home()", "rpc_ielts_start_speaking_mock(uuid,uuid,boolean,text,boolean,text)", "rpc_ielts_assign_speaking_mock(text,jsonb)"]) {
    assert.equal(await one("select has_function_privilege('anon',$1,'execute')", [`public.${fn}`]), false);
    assert.equal(await one("select has_function_privilege('authenticated',$1,'execute')", [`public.${fn}`]), true);
  }
  assert.equal(await one("select has_function_privilege('authenticated','private.ielts_voice_improvement_allowed(uuid)','execute')"), false);
  for (const t of ["ielts_speaking_mock_answers", "ielts_speaking_consent_records", "ielts_speaking_mock_audio"])
    assert.equal(await one("select has_table_privilege('authenticated',$1,'select')", [`private.${t}`]), false);
});

test("interview start and workspace filters apply to the live definitions in the repository", async () => {
  const guard = readFileSync("supabase/migrations/20261121154600_ielts_speaking_mock_reader_guards.sql", "utf8");
  const targets = [...guard.matchAll(/\('([a-z_]+)\.([a-z_]+)\([^']*\)', \$o\$(.+?)\$o\$/g)].map((m) => ({ schema: m[1], name: m[2], old: m[3] }));
  assert.equal(targets.length, 9);
  const { readdirSync } = await import("node:fs");
  const files = readdirSync("supabase/migrations").filter((f) => f < "20261121154600").sort();
  for (const t of targets) {
    const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${t.schema}\\.${t.name}\\s*\\(`, "i");
    const latest = files.filter((f) => re.test(readFileSync(`supabase/migrations/${f}`, "utf8"))).pop();
    assert.ok(latest, `${t.name} is defined in a migration`);
    const sql = readFileSync(`supabase/migrations/${latest}`, "utf8");
    const body = sql.slice(sql.search(re));
    const end = body.indexOf("$$;", body.indexOf("$$") + 2);
    const def = body.slice(0, end);
    assert.equal(def.split(t.old).length - 1, 1, `${t.name} (${latest}) contains the guarded text once`);
  }
});
