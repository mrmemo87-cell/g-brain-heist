import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite(),
  student = "b30e9c28-96f1-4d34-83e9-9b28b4926f42",
  teacher = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003",
  school = "00000000-0000-0000-0000-000000000004";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table users(id uuid primary key,username text,role text,school_id uuid,is_banned boolean default false);
create table school_members(user_id uuid,school_id uuid,status text,role_in_school text);
create table classes(id uuid,school_id uuid,subject text);create table class_students(student_id uuid,class_id uuid);
create table class_teacher_assignments(class_id uuid,school_id uuid,teacher_user_id uuid,active boolean,subject text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
create function public.is_superadmin(uuid) returns boolean language sql as $$select $1='${teacher}'::uuid$$;
create function public.school_has_module_access(uuid,text) returns boolean language sql as $$select $1='${school}'::uuid$$;
create function private.actor_can_access_school_programme(uuid,text,boolean) returns boolean language sql as $$select auth.uid()='${teacher}'::uuid and $1='${school}'::uuid$$;
create function private.teacher_current_teaching_roster(uuid,uuid) returns table(student_id uuid,academic_subject_code text,school_subject_name text) language sql as $$select null::uuid,null::text,null::text where false$$;
create function private.teacher_current_teaching_groups(uuid,uuid) returns table(id uuid) language sql as $$select null::uuid where false$$;
insert into users values('${student}','Synthetic Gulzada fixture','student','${school}',false),('${teacher}','Synthetic reviewer','admin',null,false),('${other}','Other student','student','${school}',false);
insert into school_members values('${student}','${school}','active','student'),('${other}','${school}','active','student');`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261007112613_ielts_speaking_interview_pilot.sql",
    "utf8",
  ),
);
const actor = (u) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [u]);
let session = id(10),
  hash;
test("exact-version human review gates pilot and preserves named student/entitlement boundaries", async () => {
  await actor(other);
  assert.equal(
    (await db.query("select rpc_ielts_speaking_home() h")).rows[0].h.available,
    false,
  );
  await actor(student);
  assert.equal(
    (await db.query("select rpc_ielts_speaking_home() h")).rows[0].h.approved,
    false,
  );
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_pilot($1,true)", [session]),
    /not_authorized/,
  );
  await actor(teacher);
  hash = (await db.query("select rpc_ielts_speaking_home() h")).rows[0].h
    .content_hash;
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_pilot($1,true)", [session]),
    /review_and_consent/,
  );
  const review = {
    editorial: true,
    task_design: true,
    taxonomy: true,
    difficulty_timing: true,
    rights: true,
    notes: "Synthetic test approval only; never production acceptance.",
  };
  await assert.rejects(
    db.query("select rpc_ielts_approve_speaking_pilot($1,$2)", [
      "bad",
      JSON.stringify(review),
    ]),
    /review_required/,
  );
  await db.query("select rpc_ielts_approve_speaking_pilot($1,$2)", [
    hash,
    JSON.stringify(review),
  ]);
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_pilot($1,false)", [session]),
    /consent/,
  );
  assert.equal(
    (
      await db.query("select rpc_ielts_start_speaking_pilot($1,true) id", [
        session,
      ])
    ).rows[0].id,
    session,
  );
  assert.equal(
    (
      await db.query("select rpc_ielts_start_speaking_pilot($1,true) id", [
        id(11),
      ])
    ).rows[0].id,
    session,
  );
  await assert.rejects(
    db.query("update private.ielts_speaking_packages set content='{}'"),
    /immutable/,
  );
  await actor(other);
  await assert.rejects(
    db.query("select rpc_ielts_speaking_session($1)", [session]),
    /not_authorized/,
  );
});
test("audio receipts, one-minute preparation, immutable clips and idempotent submission are enforced", async () => {
  await actor(teacher);
  await assert.rejects(
    db.query("select rpc_ielts_submit_speaking_pilot($1)", [session]),
    /three_parts/,
  );
  for (let part = 1; part <= 3; part++) {
    const clip = id(20 + part),
      path = `${session}/${part}/${clip}.wav`;
    await db.query(
      'insert into storage.objects values(\'ielts-speaking-pilot\',$1,\'{"size":64044,"mimetype":"audio/wav"}\')',
      [path],
    );
    if (part === 2) {
      await db.query("select rpc_ielts_speaking_prepare($1)", [session]);
      await assert.rejects(
        db.query("select rpc_ielts_begin_speaking_capture($1,$2,$3)", [
          session,
          clip,
          part,
        ]),
        /preparation_required/,
      );
      await assert.rejects(
        db.query("select rpc_ielts_attach_speaking_clip($1,$2,$3,$4,2,false)", [
          session,
          clip,
          part,
          "a".repeat(64),
        ]),
        /preparation_required/,
      );
      await db.query(
        "alter table private.ielts_speaking_sessions disable trigger speaking_history",
      );
      await db.query(
        "update private.ielts_speaking_sessions set preparation_started_at=now()-interval '61 seconds' where id=$1",
        [session],
      );
      await db.query(
        "alter table private.ielts_speaking_sessions enable trigger speaking_history",
      );
    }
    await assert.rejects(
      db.query("select rpc_ielts_attach_speaking_clip($1,$2,$3,$4,2,false)", [
        session,
        clip,
        part,
        "a".repeat(64),
      ]),
      /verified_audio/,
    );
    await db.query("select rpc_ielts_begin_speaking_capture($1,$2,$3)", [
      session,
      clip,
      part,
    ]);
    await db.query("select rpc_ielts_verify_speaking_audio($1,$2,$3,$4,2)", [
      session,
      clip,
      part,
      "a".repeat(64),
    ]);
    await db.query(
      "select rpc_ielts_attach_speaking_clip($1,$2,$3,$4,2,false)",
      [session, clip, part, "a".repeat(64)],
    );
    await db.query(
      "select rpc_ielts_attach_speaking_clip($1,$2,$3,$4,2,false)",
      [session, clip, part, "a".repeat(64)],
    );
  }
  const first = (
    await db.query("select rpc_ielts_submit_speaking_pilot($1) s", [session])
  ).rows[0].s;
  const replay = (
    await db.query("select rpc_ielts_submit_speaking_pilot($1) s", [session])
  ).rows[0].s;
  assert.equal(first.clips.length, 3);
  assert.equal(first.source_hash, replay.source_hash);
  assert.equal(first.readiness_available, false);
  await db.exec(
    "grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;",
  );
  await actor(other);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
    0,
  );
  await db.exec("reset role");
  await actor(student);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
    3,
  );
  assert.equal(
    (
      await db.query(
        "delete from storage.objects where bucket_id='ielts-speaking-pilot' returning name",
      )
    ).rows.length,
    0,
  );
  await db.exec("reset role");
  await actor(teacher);
  await assert.rejects(
    db.query("delete from private.ielts_speaking_clips"),
    /immutable/,
  );
  await assert.rejects(
    db.query("update private.ielts_speaking_sessions set status='in_progress'"),
    /immutable/,
  );
  await actor(student);
  const view = (
    await db.query("select rpc_ielts_speaking_session($1) s", [session])
  ).rows[0].s;
  assert.equal(view.can_review, false);
  assert.equal(view.review, null);
});
test("teacher confirmation, evidence validation, AI provenance, review concurrency and access revocation", async () => {
  await actor(teacher);
  const source = (
    await db.query("select rpc_ielts_speaking_session($1) s", [session])
  ).rows[0].s;
  const fields = {
    observations: Object.fromEntries(
      [
        "fluency_coherence",
        "lexical_resource",
        "grammar_range_accuracy",
        "pronunciation",
      ].map((k) => [
        k,
        {
          status: "observed",
          comment: "Your answer was clear. Add one example next time.",
          evidence: [{ clip_id: id(21), start_seconds: 0, end_seconds: 1 }],
        },
      ]),
    ),
    next_step: "Practise explaining one idea with a reason and an example.",
    delivery_comment: "",
  };
  const claim = (
    await db.query(
      "select rpc_ielts_claim_speaking_ai($1,'synthetic-model') d",
      [session],
    )
  ).rows[0].d;
  await assert.rejects(
    db.query("select rpc_ielts_claim_speaking_ai($1,'synthetic-model')", [
      session,
    ]),
    /working/,
  );
  const bad = structuredClone(fields);
  bad.observations.pronunciation.evidence[0].end_seconds = 3;
  await assert.rejects(
    db.query("select rpc_ielts_finish_speaking_ai($1,$2,null)", [
      claim.id,
      JSON.stringify(bad),
    ]),
    /invalid/,
  );
  const nullStatus = structuredClone(fields);
  nullStatus.observations.pronunciation.status = null;
  await assert.rejects(
    db.query("select rpc_ielts_finish_speaking_ai($1,$2,null)", [
      claim.id,
      JSON.stringify(nullStatus),
    ]),
    /incomplete/,
  );
  await db.query("select rpc_ielts_finish_speaking_ai($1,$2,$3)", [
    claim.id,
    JSON.stringify(fields),
    "synthetic-provider",
  ]);
  const cached = (
    await db.query(
      "select rpc_ielts_claim_speaking_ai($1,'synthetic-model') d",
      [session],
    )
  ).rows[0].d;
  assert.equal(cached.id, claim.id);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from private.ielts_speaking_reviews",
      )
    ).rows[0].n,
    0,
  );
  const share = (confirmed, expected = null, rid = id(50)) =>
    db.query("select rpc_ielts_share_speaking_review($1,$2,$3,$4,$5,$6,$7) s", [
      session,
      rid,
      expected,
      source.source_hash,
      JSON.stringify(fields),
      confirmed,
      claim.id,
    ]);
  await assert.rejects(share(false), /confirmation/);
  await actor(student);
  await assert.rejects(share(true), /not_authorized/);
  await actor(teacher);
  const reviewed = (await share(true)).rows[0].s;
  assert.ok(reviewed.review);
  await share(true);
  await assert.rejects(share(true, null, id(51)), /changed/);
  await actor(student);
  assert.ok(
    (await db.query("select rpc_ielts_speaking_session($1) s", [session]))
      .rows[0].s.review,
  );
  await actor(teacher);
  for (let n = 0; n < 2; n++) {
    const d = (
      await db.query("select rpc_ielts_claim_speaking_ai($1,$2) d", [
        session,
        `synthetic-model-${n}`,
      ])
    ).rows[0].d;
    await db.query("select rpc_ielts_finish_speaking_ai($1,null,null)", [d.id]);
  }
  await assert.rejects(
    db.query("select rpc_ielts_claim_speaking_ai($1,'another-model')", [
      session,
    ]),
    /rate_limit/,
  );
  await db.query("update users set is_banned=true where id=$1", [teacher]);
  await actor(teacher);
  await assert.rejects(
    db.query("select rpc_ielts_speaking_session($1)", [session]),
    /not_authorized/,
  );
  for (const name of [
    "ielts_speaking_sessions",
    "ielts_speaking_clips",
    "ielts_speaking_reviews",
    "ielts_speaking_ai_drafts",
  ])
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated',$1,'select') ok",
          [`private.${name}`],
        )
      ).rows[0].ok,
      false,
    );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.rpc_ielts_finish_speaking_ai(uuid,jsonb,text,text)','execute') ok",
      )
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.rpc_ielts_verify_speaking_audio(uuid,uuid,integer,text,numeric)','execute') ok",
      )
    ).rows[0].ok,
    false,
  );
});

test("publication opens eligible accounts, preserves pilot evidence and enforces student/reviewer scope", async () => {
  await db.query("update users set is_banned=false where id=$1", [teacher]);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261007125521_ielts_speaking_eligible_release.sql",
      "utf8",
    ),
  );
  await actor(other);
  const home = (await db.query("select rpc_ielts_speaking_workspace() h"))
    .rows[0].h;
  assert.equal(home.available, true);
  assert.equal(home.published, true);
  assert.equal(home.student_id, other);
  assert.equal(home.package, null);
  assert.equal(home.sessions.length, 0);
  assert.equal(home.students.length, 0);
  await assert.rejects(
    db.query("select rpc_ielts_speaking_workspace($1)", [student]),
    /not_authorized/,
  );
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_interview($1,$2,true)", [
      other,
      id(80),
    ]),
    /not_authorized/,
  );
  await actor(teacher);
  const teacherHome = (
    await db.query("select rpc_ielts_speaking_workspace($1) h", [other])
  ).rows[0].h;
  assert.equal(teacherHome.student_id, other);
  assert.equal(teacherHome.students.length, 2);
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_interview($1,$2,false)", [
      other,
      id(80),
    ]),
    /consent/,
  );
  const started = (
    await db.query("select rpc_ielts_start_speaking_interview($1,$2,true) id", [
      other,
      id(80),
    ])
  ).rows[0].id;
  assert.equal(started, id(80));
  assert.equal(
    (
      await db.query(
        "select rpc_ielts_start_speaking_interview($1,$2,true) id",
        [other, id(81)],
      )
    ).rows[0].id,
    started,
  );
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_interview($1,$2,true)", [
      student,
      id(80),
    ]),
    /conflict/,
  );
  await actor(other);
  assert.equal(
    (await db.query("select rpc_ielts_speaking_home() h")).rows[0].h.sessions[0]
      .id,
    started,
  );
  await assert.rejects(
    db.query("select rpc_ielts_speaking_session($1)", [session]),
    /not_authorized/,
  );
  await actor(student);
  const original = (await db.query("select rpc_ielts_speaking_home() h"))
    .rows[0].h;
  assert.equal(original.sessions.length, 1);
  assert.equal(original.sessions[0].reviewed, true);
  await db.query("update users set is_banned=true where id=$1", [other]);
  await actor(other);
  assert.equal(
    (await db.query("select rpc_ielts_speaking_home() h")).rows[0].h.available,
    false,
  );
  await assert.rejects(
    db.query("select rpc_ielts_speaking_session($1)", [started]),
    /not_authorized/,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','rpc_ielts_speaking_workspace(uuid,text)','execute') ok",
      )
    ).rows[0].ok,
    false,
  );
  await assert.rejects(
    db.exec(
      "update private.ielts_speaking_releases set acceptance_note='changed'",
    ),
    /immutable/,
  );
  // Real policy exercised with separate school administrator, other-school and independent fixtures.
  await db.exec(`insert into users values('${id(90)}','Local administrator','school_admin','${school}',false),('${id(91)}','Other school learner','student','${id(92)}',false),('${id(93)}','Independent learner','student',null,false),('${id(94)}','Unallocated teacher','teacher','${school}',false);
    insert into school_members values('${id(90)}','${school}','active','school_admin'),('${id(91)}','${id(92)}','active','student');
    create or replace function public.school_has_module_access(uuid,text) returns boolean language sql as $$select $1 in ('${school}'::uuid,'${id(92)}'::uuid)$$;
    create or replace function private.actor_can_access_school_programme(uuid,text,boolean) returns boolean language sql as $$select auth.uid() in ('${teacher}'::uuid,'${id(90)}'::uuid) and $1='${school}'::uuid$$;`);
  await actor(id(90));
  const scoped = (await db.query("select rpc_ielts_speaking_workspace() h"))
    .rows[0].h;
  assert.deepEqual(
    scoped.students.map((s) => s.id),
    [student],
  );
  await assert.rejects(
    db.query("select rpc_ielts_speaking_workspace($1)", [id(91)]),
    /not_authorized/,
  );
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_interview($1,$2,true)", [
      id(91),
      id(95),
    ]),
    /not_authorized/,
  );
  const empty = (
    await db.query(
      "select rpc_ielts_speaking_workspace(null,'no matching name') h",
    )
  ).rows[0].h;
  assert.equal(empty.available, true);
  assert.deepEqual(empty.students, []);
  await actor(id(94));
  assert.equal(
    (await db.query("select rpc_ielts_speaking_workspace(null,'no match') h"))
      .rows[0].h.available,
    false,
  );
  await actor(id(93));
  assert.equal(
    (await db.query("select rpc_ielts_speaking_home() h")).rows[0].h.available,
    true,
  );
  await assert.rejects(
    db.query("select rpc_ielts_start_speaking_interview($1,$2,true)", [
      id(93),
      id(95),
    ]),
    /not_authorized/,
  );
});

test("IELTS programme delegation is school-scoped, audited, idempotent and immediately revocable", async () => {
  await db.exec(`create table schools(id uuid primary key,name text);insert into schools values('${school}','Synthetic school'),('${id(92)}','Other school');
    create table ielts_exam_events(id uuid primary key,school_id uuid);insert into ielts_exam_events values('${id(120)}','${school}'),('${id(121)}','${id(92)}');
    create table ielts_exam_attempts(id uuid primary key,exam_event_id uuid,status text);
    create table ielts_exam_incidents(attempt_id uuid);
    create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid primary key,student_id uuid,school_id uuid,class_id uuid,form_snapshot jsonb,started_at timestamptz default now());
    create table private.ielts_diagnostic_scoring_runs(id uuid,attempt_id uuid,raw_score int,marks_possible int,created_at timestamptz default now(),run_version int,confidence jsonb,warnings jsonb,integrity_state text,outcomes jsonb);
    create table private.ielts_writing_screener_submissions(attempt_id uuid primary key,submitted_at timestamptz default now());
    create table private.ielts_writing_screener_reviews(id uuid,attempt_id uuid);
    alter table classes add column class_name text;alter table classes add column is_active boolean default true;
    insert into classes values('${id(122)}','${school}','English','Test class',true);
    insert into users values('${id(96)}','Second teacher','teacher','${school}',false),('${id(97)}','Other school teacher','teacher','${id(92)}',false);
    insert into school_members values('${id(94)}','${school}','active','teacher'),('${id(96)}','${school}','active','teacher'),('${id(97)}','${id(92)}','active','teacher');
    update users set is_banned=false where id='${other}';
    insert into ielts_exam_attempts values('${id(110)}','${id(120)}','submitted'),('${id(111)}','${id(120)}','submitted'),('${id(113)}','${id(120)}','submitted');
    insert into private.ielts_diagnostic_attempt_evidence(attempt_id,student_id,school_id,form_snapshot) values('${id(110)}','${other}','${school}','{"items":[{"skill":"writing"}]}'),('${id(111)}','${other}','${school}','{"items":[{"skill":"listening"}]}');
    insert into private.ielts_writing_screener_submissions(attempt_id) values('${id(110)}');
    insert into private.ielts_diagnostic_scoring_runs values('${id(112)}','${id(111)}',8,12,now(),1,'{"level":"low"}','[]','unreviewed','[]');`);
  await db.exec(`create or replace function private.actor_can_access_school_programme(uuid,text,boolean) returns boolean language sql as $$select public.is_superadmin(auth.uid()) or exists(select 1 from public.school_members m where m.user_id=auth.uid() and m.school_id=$1 and m.status='active')$$;`);
  await db.exec(`insert into private.ielts_diagnostic_attempt_evidence(attempt_id,student_id,school_id,form_snapshot) values('${id(113)}','${other}','${school}','{"items":[{"skill":"listening"},{"skill":"reading"}]}');insert into private.ielts_diagnostic_scoring_runs values('${id(114)}','${id(113)}',12,12,now()+interval '1 minute',1,'{"level":"low"}','[]','unreviewed','[]');`);
  const writing = readFileSync('supabase/migrations/20261007041943_ielts_writing_screener_foundation.sql','utf8');
  await db.exec('alter table users add column is_admin boolean default false');
  let start=writing.indexOf('create function private.can_review_ielts_writing_screener(');
  await db.exec(writing.slice(start,writing.indexOf('$$;',start)+3));
  const evidence = readFileSync('supabase/migrations/20261005163109_ielts_governed_evidence_foundation.sql','utf8');
  start=evidence.indexOf('create function public.rpc_ielts_diagnostic_result(');
  await db.exec(evidence.slice(start,evidence.indexOf('end; $$;',start)+8));
  await db.exec(readFileSync('supabase/migrations/20261007130709_ielts_programme_workspace.sql','utf8'));
  const allocate=(teacherId,expected,change)=>db.query('select rpc_ielts_set_programme_lead($1,$2,$3,$4)',[school,teacherId,expected,change]);
  await actor(id(90));
  assert.equal((await db.query('select rpc_ielts_programme_workspace($1) w',[school])).rows[0].w.can_allocate,true);
  await assert.rejects(allocate(other,null,id(100)),/active_school_teacher/);
  await assert.rejects(allocate(id(97),null,id(100)),/active_school_teacher/);
  await allocate(id(94),null,id(100));
  await allocate(id(94),null,id(100));
  assert.equal((await db.query('select count(*)::int n from private.ielts_programme_leads')).rows[0].n,1);
  await actor(id(94));
  assert.equal((await db.query('select can_create_ielts_exam($1) ok',[school])).rows[0].ok,true);
  assert.equal((await db.query('select can_manage_ielts_exam($1) ok',[id(121)])).rows[0].ok,false);
  const workspace=(await db.query('select rpc_ielts_programme_workspace($1) w',[school])).rows[0].w;
  assert.equal(workspace.can_manage,true);
  assert.equal(workspace.can_allocate,false);
  assert.equal(workspace.teachers.length,0);
  assert.equal(workspace.classes.length,1);
  assert.equal(workspace.students.find(s=>s.id===other).listening.raw_score,8);
  assert.equal(workspace.queue[0].attempt_id,id(110));
  assert.equal(workspace.readiness_available,false);
  assert.equal((await db.query('select rpc_ielts_diagnostic_result($1) r',[id(111)])).rows[0].r.raw_score,8);
  await assert.rejects(allocate(id(96),id(100),id(101)),/not_authorized/);
  await assert.rejects(db.query('select rpc_ielts_programme_workspace($1)',[id(92)]),/not_authorized/);
  await db.query('update users set is_banned=true where id=$1',[id(94)]);
  assert.equal((await db.query('select can_create_ielts_exam($1) ok',[school])).rows[0].ok,false);
  await db.query('update users set is_banned=false where id=$1',[id(94)]);
  await db.query("update school_members set status='inactive' where user_id=$1",[id(94)]);
  assert.equal((await db.query('select can_create_ielts_exam($1) ok',[school])).rows[0].ok,false);
  await db.query("update school_members set status='active' where user_id=$1",[id(94)]);
  await actor(id(90));
  await assert.rejects(allocate(id(96),null,id(101)),/changed_reload/);
  await allocate(id(96),id(100),id(101));
  await actor(id(94));
  assert.equal((await db.query('select rpc_ielts_programme_access() a')).rows[0].a.schools.length,0);
  await assert.rejects(db.query('select rpc_ielts_diagnostic_result($1)',[id(111)]),/not_authorized/);
  await actor(id(96));
  assert.equal((await db.query('select can_manage_ielts_practice_school($1) ok',[school])).rows[0].ok,true);
  await actor(id(90));
  await allocate(null,id(101),id(102));
  await actor(id(96));
  assert.equal((await db.query('select rpc_ielts_programme_access() a')).rows[0].a.schools.length,0);
  await actor(other);
  await assert.rejects(allocate(id(94),null,id(103)),/not_authorized/);
  for(const table of ['ielts_programme_leads','ielts_programme_lead_changes']) {
    assert.equal((await db.query("select has_table_privilege('authenticated',$1,'select') ok",[`private.${table}`])).rows[0].ok,false);
    await assert.rejects(db.query(`delete from private.${table}`),/immutable/);
  }
  assert.equal((await db.query("select has_function_privilege('anon','rpc_ielts_set_programme_lead(uuid,uuid,uuid,uuid)','execute') ok")).rows[0].ok,false);
  await db.close();
});
