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
  await db.close();
});
