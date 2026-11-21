import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Diagnostic Bible 2.7.0 section 10.12 and 15F: Speaking practice mocks B to G are original, valid, distinct and not yet approved.
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
  "20261121154500_ielts_speaking_recorded_mock", "20261121180000_ielts_speaking_mock_teacher_views", "20261121190000_ielts_speaking_mock_b_content", "20261121190100_ielts_speaking_mocks_c_to_g_content", "20261122020000_ielts_speaking_mock_voices"])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
const one = async (sql, a = []) => Object.values((await db.query(sql, a)).rows[0])[0];

test("mock B is a recorded-examiner package, stored with its exact hash and not approved", async () => {
  const p = (await db.query("select content,content_hash,approved_at,encode(sha256(convert_to(content::text,'UTF8')),'hex') h from private.ielts_speaking_packages where code='bh-speaking-mock-b'")).rows[0];
  assert.equal(p.content.delivery_mode, "recorded_examiner");
  assert.equal(p.content_hash, p.h);
  assert.equal(p.approved_at, null, "the owner approves it in the studio");
  assert.deepEqual(p.content.parts.map((x) => x.part), [1, 2, 3]);
  assert.equal(p.content.parts[1].cue_card.topic, "Describe a family celebration you enjoyed.");
});

test("the examiner script is valid, neutral, unreleased, and quotes every line for paid generation", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const s = await one("select rpc_ielts_speaking_mock_script('6d0c8c5e-3f1b-4f7e-9a40-2b7a0d1e0b01')");
  assert.equal(s.released_at, null);
  assert.equal(s.lines.length, 20);
  assert.deepEqual(s.needs_audio, { lines: 20, characters: s.lines.reduce((n, l) => n + l.body.length, 0) });
  assert.equal(s.lines[0].kind, "sound_check");
  assert.deepEqual(s.lines.filter((l) => l.kind === "question" && l.part === 1).map((l) => l.replay_allowed), [true, true, true, true, true]);
  for (const l of s.lines) assert.doesNotMatch(l.body, /\b(good|great|well done|excellent|correct|wrong|score|band)\b/i, `neutral: ${l.key}`);
  // Questions and topics are original: no Interview A (screener) question appears, and no shared topic.
  const a = await one("select content from private.ielts_speaking_packages where code='bh-speaking-interview-a'");
  const screener = a.parts.flatMap((x) => [...(x.questions ?? []), ...(x.follow_ups ?? []), x.cue_card?.topic].filter(Boolean)).map((x) => x.toLowerCase());
  for (const l of s.lines) assert.ok(!screener.includes(l.body.toLowerCase()), `not a screener question: ${l.body}`);
  assert.doesNotMatch(s.lines.map((l) => l.body).join(" "), /\b(skill|free time|studies|hometown|journey|technology|routine|music|weather)\b/i);
});

const codes = ["b", "c", "d", "e", "f", "g"].map((x) => `bh-speaking-mock-${x}`);

test("mocks B to G are six unapproved, unreleased, valid scripts with no question shared between them", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const rows = (await db.query("select p.code,p.content,p.approved_at,s.id from private.ielts_speaking_packages p join private.ielts_speaking_mock_scripts s on s.package_code=p.code and s.version=(select max(version) from private.ielts_speaking_mock_scripts x where x.package_code=p.code) where p.code=any($1) order by p.code", [codes])).rows;
  assert.deepEqual(rows.map((r) => r.code), codes);
  const seen = new Map(), cues = new Set(), shared = new Map();
  const a = await one("select content from private.ielts_speaking_packages where code='bh-speaking-interview-a'");
  for (const x of a.parts.flatMap((x) => [...(x.questions ?? []), ...(x.follow_ups ?? [])])) seen.set(x.toLowerCase(), "Interview A (screener)");
  for (const r of rows) {
    assert.equal(r.approved_at, null);
    assert.equal(r.content.delivery_mode, "recorded_examiner");
    const s = await one("select rpc_ielts_speaking_mock_script($1)", [r.id]);
    assert.equal(s.released_at, null);
    assert.equal(s.lines.length, 20);
    for (const l of s.lines) {
      assert.doesNotMatch(l.body, /\b(good|great|well done|excellent|correct|wrong|score|band)\b/i, `${r.code} ${l.key}`);
      if (["sound", "intro", "p2.intro", "p2.prepare", "p2.start", "end"].includes(l.key)) {
        const k = `${s.voice.voice}:${l.key}`;
        if (shared.has(k)) assert.equal(l.audio_key, shared.get(k), `${k} reuses one audio file`); else shared.set(k, l.audio_key);
        continue;
      }
      const k = l.body.toLowerCase();
      assert.ok(!seen.has(k), `${r.code} ${l.key} repeats ${seen.get(k)}`);
      seen.set(k, r.code);
    }
    assert.doesNotMatch(s.lines.map((l) => l.body).join(" "), /\b(skill|free time|studies|hometown|journey|technology|routine|music|weather|volunteer)/i, `${r.code} reuses a practice-task topic`);
    const t = r.content.parts[1].cue_card.topic;
    assert.ok(!cues.has(t)); cues.add(t);
  }
  assert.equal(cues.size, 6);
});

test("three examiner voices, one per mock: 102 different audio files in all", async () => {
  const r = (await db.query(`select s.package_code c,s.version,s.voice->>'voice' v,s.released_at from private.ielts_speaking_mock_scripts s
    where s.version=(select max(version) from private.ielts_speaking_mock_scripts x where x.package_code=s.package_code) and s.package_code=any($1) order by 1`, [codes])).rows;
  assert.deepEqual(r.map((x) => [x.c.slice(-1), x.version, x.v]), [["b", 1, "Miriam"], ["c", 1, "Miriam"], ["d", 2, "Tom"], ["e", 2, "Tom"], ["f", 2, "Leslie"], ["g", 2, "Leslie"]]);
  assert.ok(r.every((x) => x.released_at === null));
  const n = await one(`select count(distinct l.audio_key)::int from private.ielts_speaking_mock_script_lines l join private.ielts_speaking_mock_scripts s on s.id=l.script_id
    where s.version=(select max(version) from private.ielts_speaking_mock_scripts x where x.package_code=s.package_code) and s.package_code=any($1)`, [codes]);
  assert.equal(n, 102);
  const same = await one(`select count(*)::int from private.ielts_speaking_mock_script_lines a join private.ielts_speaking_mock_script_lines b on a.script_id<b.script_id and a.key=b.key
    join private.ielts_speaking_mock_scripts sa on sa.id=a.script_id join private.ielts_speaking_mock_scripts sb on sb.id=b.script_id
    where sa.package_code=sb.package_code and (a.body<>b.body or a.answer_seconds is distinct from b.answer_seconds or a.replay_allowed<>b.replay_allowed or a.position<>b.position)`);
  assert.equal(same, 0, "version 2 keeps every line of version 1");
});
