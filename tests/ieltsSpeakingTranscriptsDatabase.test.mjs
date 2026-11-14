import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Diagnostic Bible 2.2.0 section 10.7: interview transcripts, highlights, pronunciation words and Part bands.
const db = new PGlite(),
  student = "b30e9c28-96f1-4d34-83e9-9b28b4926f42",
  teacher = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003",
  school = "00000000-0000-0000-0000-000000000004",
  session = "00000000-0000-0000-0000-000000000010",
  clip1 = "00000000-0000-0000-0000-000000000021",
  clip2 = "00000000-0000-0000-0000-000000000022",
  clip3 = "00000000-0000-0000-0000-000000000023";
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table users(id uuid primary key,username text,full_name text,role text,school_id uuid,is_banned boolean default false);
create table school_members(user_id uuid,school_id uuid,status text,role_in_school text);
create table classes(id uuid,school_id uuid,subject text);create table class_students(student_id uuid,class_id uuid);
create table class_teacher_assignments(class_id uuid,school_id uuid,teacher_user_id uuid,active boolean,subject text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
create function public.is_superadmin(uuid) returns boolean language sql as $$select $1='${teacher}'::uuid$$;
create function public.school_has_module_access(uuid,text) returns boolean language sql as $$select $1='${school}'::uuid$$;
create function private.actor_can_access_school_programme(uuid,text,boolean) returns boolean language sql as $$select false$$;
create function private.teacher_current_teaching_roster(uuid,uuid) returns table(student_id uuid,academic_subject_code text,school_subject_name text) language sql as $$select null::uuid,null::text,null::text where false$$;
create function private.teacher_current_teaching_groups(uuid,uuid) returns table(id uuid) language sql as $$select null::uuid where false$$;
insert into users values('${student}','gulzada','Gulzada','student','${school}',false),('${teacher}','mr_t','Mr Teacher','admin',null,false),('${other}','other','Other','student','${school}',false);
insert into school_members values('${student}','${school}','active','student'),('${other}','${school}','active','student');`);
await db.exec(readFileSync("supabase/migrations/20261007112613_ielts_speaking_interview_pilot.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261113181000_ielts_speaking_interview_transcripts_part_bands.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261114090000_ielts_speaking_analysis_versions.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261114110000_ielts_speaking_analysis_v3.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261114130000_ielts_speaking_teacher_band.sql", "utf8"));
const CURRENT = "bh-ielts-speaking-interview-analysis-v3";
const sha = "a".repeat(64);
await db.exec(`insert into private.ielts_speaking_sessions(id,student_id,teacher_id,package_code,content_hash,package_snapshot,status,evidence_kind,recording_consent)
 select '${session}','${student}','${teacher}',code,content_hash,content,'submitted','first_sitting',true from private.ielts_speaking_packages;
 insert into private.ielts_speaking_clips(id,session_id,part,path,sha256,duration_seconds,mime_type,interrupted) values
 ('${clip1}','${session}',1,'p1.wav','${sha}',200,'audio/wav',false),('${clip2}','${session}',2,'p2.wav','${sha}',150,'audio/wav',false),('${clip3}','${session}',3,'p3.wav','${sha}',200,'audio/wav',false);`);
const actor = (u) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [u ?? ""]);
const extras = () => db.query("select public.rpc_ielts_speaking_session_extras($1) j", [session]).then((r) => r.rows[0].j);
const save = (clip, sessionId = session, version = CURRENT) => db.query(
  "select public.rpc_ielts_save_speaking_clip_analysis($1,$2,$3,$4::jsonb,$5::jsonb,$6,'test',$7::jsonb)",
  [sessionId, clip, "I have live here since two years.", JSON.stringify([{ criterion: "grammar_range_accuracy", kind: "fix", quote: "have live here", note: "Say: I have lived here." }]),
   JSON.stringify({ assessed: true, words: [{ word: "years", tip: "Say the s.", ipa: "jɪrz" }] }), version,
   JSON.stringify({ teacher: version === CURRENT ? ["How long have you lived here?"] : [] })]);

test("teacher sees missing clips; analysis is saved once per clip and only for the session's own clips", async () => {
  await actor(teacher);
  let e = await extras();
  assert.equal(e.missing_clips, 3);
  assert.equal(e.can_set_bands, true, "Bible 2.3.0 10.8: teachers grade before sharing; bands go out with the feedback");
  await save(clip2, session, "bh-old-analysis-v1");
  assert.equal((await extras()).missing_clips, 3, "an older analysis version still counts as missing");
  await save(clip1);
  await save(clip1); // insert-once per version: a repeat is ignored
  await assert.rejects(save(clip2, "00000000-0000-0000-0000-000000000099"), /speaking_clip_mismatch/);
  e = await extras();
  assert.equal(e.analysis.length, 2, "latest analysis per clip");
  assert.equal(e.analysis[0].part, 1);
  assert.equal(e.analysis[0].prompt_version, CURRENT);
  assert.deepEqual(e.analysis[0].speaker_turns.teacher, ["How long have you lived here?"]);
  assert.equal(e.analysis[0].highlights[0].criterion, "grammar_range_accuracy");
  assert.equal(e.analysis[0].pronunciation.words[0].ipa, "jɪrz");
  assert.equal(e.missing_clips, 2, "clip 2 has only an old version, clip 3 none");
  await save(clip2);
  e = await extras();
  assert.equal(e.analysis.find((a) => a.clip_id === clip2).prompt_version, CURRENT, "the newer version replaces the old one on screen");
  assert.equal((await db.query("select count(*)::int n from private.ielts_speaking_clip_analysis where clip_id=$1", [clip2])).rows[0].n, 2, "old version kept as history");
  await assert.rejects(db.query("delete from private.ielts_speaking_clip_analysis"), /speaking_history_immutable/);
});

test("students see nothing until a review is shared; other students never", async () => {
  await actor(student);
  const e = await extras();
  assert.deepEqual(e.analysis, []);
  assert.equal(e.part_bands, null);
  await actor(other);
  await assert.rejects(extras(), /not_authorized/);
});

test("Part 1-3 bands: reviewer only, after sharing, half bands 0-9, append-only history, then visible to the student", async () => {
  await actor(teacher);
  await assert.rejects(db.query("select public.rpc_ielts_set_speaking_part_bands($1,6,6.5,6)", [session]), /speaking_review_required/);
  await db.exec(`insert into private.ielts_speaking_reviews(id,session_id,source_hash,reviewer_id,fields,teacher_confirmed) values('00000000-0000-0000-0000-000000000031','${session}','h','${teacher}','{}',true)`);
  await assert.rejects(db.query("select public.rpc_ielts_set_speaking_part_bands($1,6,null,6)", [session]), /speaking_part_bands_required/);
  await assert.rejects(db.query("select public.rpc_ielts_set_speaking_part_bands($1,6.3,6,6)", [session]), /check/);
  await assert.rejects(db.query("select public.rpc_ielts_set_speaking_part_bands($1,9.5,6,6)", [session]), /check/);
  await db.query("select public.rpc_ielts_set_speaking_part_bands($1,6,6.5,6)", [session]);
  const e = (await db.query("select public.rpc_ielts_set_speaking_part_bands($1,6,7,6.5) j", [session])).rows[0].j;
  assert.deepEqual([Number(e.part_bands.part_1), Number(e.part_bands.part_2), Number(e.part_bands.part_3)], [6, 7, 6.5], "latest bands are current");
  assert.equal(e.part_bands.teacher_name, "Mr Teacher");
  assert.equal((await db.query("select count(*)::int n from private.ielts_speaking_part_bands")).rows[0].n, 2, "history kept");
  await actor(student);
  await assert.rejects(db.query("select public.rpc_ielts_set_speaking_part_bands($1,9,9,9)", [session]), /not_authorized/);
  const s = await extras();
  assert.equal(Number(s.part_bands.part_2), 7);
  assert.equal(s.analysis.length, 2);
  assert.equal(s.missing_clips, 0, "students are not told about unprocessed clips");
  assert.equal(s.can_set_bands, false);
});

test("Bible 2.3.0 10.8: feedback, criterion bands, Part bands and the Teacher Speaking band are shared in one action", async () => {
  await actor(teacher);
  const source = (await db.query("select public.rpc_ielts_speaking_session($1) s", [session])).rows[0].s;
  const fields = {
    observations: Object.fromEntries(["fluency_coherence", "lexical_resource", "grammar_range_accuracy", "pronunciation"].map((k) => [k,
      { status: "observed", comment: "Your answer was clear. Add one example next time.", evidence: [{ clip_id: clip1, start_seconds: 0, end_seconds: 1 }] }])),
    next_step: "Practise explaining one idea with a reason and an example.",
    delivery_comment: "",
  };
  const bands = { fluency_coherence: 6, lexical_resource: 6, grammar_range_accuracy: 5.5, pronunciation: 6, part_1: 6, part_2: 6, part_3: 5.5, overall: 6 };
  const prior = (await db.query("select id from private.ielts_speaking_reviews where session_id=$1 order by reviewed_at desc, id desc limit 1", [session])).rows[0]?.id ?? null;
  const rid = "00000000-0000-0000-0000-000000000060";
  const share = (b, review = rid, confirmed = true) => db.query("select public.rpc_ielts_share_speaking_result($1,$2,$3,$4,$5,$6,null,$7) s",
    [session, review, prior, source.source_hash, JSON.stringify(fields), confirmed, JSON.stringify(b)]);
  const before = (await db.query("select count(*)::int n from private.ielts_speaking_reviews")).rows[0].n;
  const { overall, ...noOverall } = bands;
  await assert.rejects(share(noOverall), /speaking_bands_required/);
  await assert.rejects(share({ ...bands, overall: 6.25 }), /speaking_bands_required/);
  await assert.rejects(share({ ...bands, pronunciation: "6" }), /speaking_bands_required/);
  await assert.rejects(share(bands, rid, false), /confirmation/);
  await actor(student);
  await assert.rejects(share(bands), /not_authorized/);
  await actor(teacher);
  assert.equal((await db.query("select count(*)::int n from private.ielts_speaking_reviews")).rows[0].n, before, "nothing is half-shared");
  const s = (await share(bands)).rows[0].s;
  assert.equal(s.review.id, rid);
  await share(bands); // safe retry
  await assert.rejects(share({ ...bands, overall: 7 }), /speaking_review_conflict/);
  const e = await extras();
  assert.equal(Number(e.part_bands.overall), 6);
  assert.equal(Number(e.part_bands.grammar_range_accuracy), 5.5);
  assert.equal(Number(e.part_bands.part_3), 5.5);
  await actor(student);
  const st = await extras();
  assert.equal(Number(st.part_bands.overall), 6, "the student sees the Teacher Speaking band");
  assert.equal(st.can_set_bands, false);
});

test("Bible 2.3.0 10.8: a Teacher Speaking band needs all three parts recorded", async () => {
  await actor(teacher);
  const short = "00000000-0000-0000-0000-000000000011";
  await db.exec(`insert into private.ielts_speaking_sessions(id,student_id,teacher_id,package_code,content_hash,package_snapshot,status,evidence_kind,recording_consent)
   select '${short}','${student}','${teacher}',code,content_hash,content,'submitted','same_form_practice',true from private.ielts_speaking_packages;
   insert into private.ielts_speaking_clips(id,session_id,part,path,sha256,duration_seconds,mime_type,interrupted) values
   ('00000000-0000-0000-0000-000000000024','${short}',1,'q1.wav','${sha}',100,'audio/wav',false)`);
  const src = (await db.query("select public.rpc_ielts_speaking_session($1) s", [short])).rows[0].s;
  const fields = { observations: Object.fromEntries(["fluency_coherence", "lexical_resource", "grammar_range_accuracy", "pronunciation"].map((k) => [k,
    { status: "observed", comment: "Your answer was clear. Add one example next time.", evidence: [{ clip_id: "00000000-0000-0000-0000-000000000024", start_seconds: 0, end_seconds: 1 }] }])),
    next_step: "Practise explaining one idea with a reason and an example.", delivery_comment: "" };
  const bands = { fluency_coherence: 6, lexical_resource: 6, grammar_range_accuracy: 6, pronunciation: 6, part_1: 6, part_2: 6, part_3: 6, overall: 6 };
  await assert.rejects(db.query("select public.rpc_ielts_share_speaking_result($1,$2,null,$3,$4,true,null,$5)",
    [short, "00000000-0000-0000-0000-000000000061", src.source_hash, JSON.stringify(fields), JSON.stringify(bands)]), /speaking_all_parts_required/);
  assert.equal((await db.query("select count(*)::int n from private.ielts_speaking_reviews where session_id=$1", [short])).rows[0].n, 0, "rolled back");
});
