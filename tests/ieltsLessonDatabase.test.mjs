import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const teacher = "00000000-0000-0000-0000-000000000001",
  student = "00000000-0000-0000-0000-000000000002",
  school = "00000000-0000-0000-0000-000000000003",
  other = "00000000-0000-0000-0000-000000000004";
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table users(id uuid primary key,is_banned boolean);create table schools(id uuid primary key,name text,logo_url text);
create function public.can_manage_ielts_practice_school(uuid) returns boolean language sql as $$select auth.uid()='${teacher}'::uuid and $1='${school}'::uuid$$;
create table private.ielts_learning_tasks(code text,title text,version text,skill text,purpose text,content_sha256 text,content jsonb,instructions text,questions jsonb,audio_path text,audio_sha256 text,released boolean);
create table private.ielts_learning_allocations(id uuid,task_code text,status text);
create function private.can_access_ielts_learning(uuid) returns boolean language sql as $$select auth.uid()='${student}'::uuid$$;
create function private.ielts_learning_publicly_released(text) returns boolean language sql as $$select released from private.ielts_learning_tasks where code=$1$$;
create function private.ielts_material_code(text,text) returns text language sql as $$select 'L-003'$$;
insert into users values('${teacher}',false),('${student}',false);insert into schools values('${school}','School A','https://example.org/a.png'),('${other}','School B',null);
insert into private.ielts_learning_tasks values('bh-ielts-targeted-listening-l3-v1','Guided 3','1','listening','guided_practice','hash','{"teacher_notes":"private script"}','Read','[{"id":"q1","prompt":"Day","accepted_answers":["Monday"]}]','three.mp3','sha',true),('bh-ielts-targeted-listening-l4-v1','Guided 4','1','listening','guided_practice','hash','{}','Read','[]','four.mp3','sha',false),('unseen-independent','Unseen','1','listening','independent_check','hash','{}','Read','[]','unseen.mp3','sha',true);`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261012161649_ielts_teacher_lesson_one.sql",
    "utf8",
  ),
);
await db.exec(
  `insert into private.ielts_learning_tasks values ('bh-ielts-targeted-reading-r1-v1','Reading guided','1','reading','guided_practice','readinghash','{"passage":"Approved passage","teacher_notes":"PRIVATE READING NOTES"}','Choose TRUE FALSE NOT GIVEN','[{"id":"q1","prompt":"One","accepted_answers":["TRUE"]},{"id":"q2","prompt":"Two","accepted_answers":["FALSE"]},{"id":"q3","prompt":"Three","accepted_answers":["NOT GIVEN"]},{"id":"q4","prompt":"Four","accepted_answers":["TRUE"]},{"id":"q5","prompt":"Five","accepted_answers":["FALSE"]},{"id":"q6","prompt":"Six","accepted_answers":["NOT GIVEN"]}]',null,null,true);`,
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261014085646_ielts_lesson_one_printable_reading_backup.sql",
    "utf8",
  ),
);
const actor = (id) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
test("teacher pack is school-scoped, branded and released guided material only", async () => {
  await actor(teacher);
  let p = (
    await db.query("select rpc_ielts_teacher_lesson_one($1) pack", [school])
  ).rows[0].pack;
  assert.equal(p.school.name, "School A");
  assert.equal(p.materials.length, 1);
  assert.equal(p.materials[0].teacher_notes, "private script");
  assert.equal(p.materials[0].questions[0].accepted_answers[0], "Monday");
  await assert.rejects(
    db.query("select rpc_ielts_teacher_lesson_one($1)", [other]),
    /not_authorized/,
  );
  await actor(student);
  await assert.rejects(
    db.query("select rpc_ielts_teacher_lesson_one($1)", [school]),
    /not_authorized/,
  );
  await actor("");
  await assert.rejects(
    db.query("select rpc_ielts_teacher_lesson_one($1)", [school]),
    /not_authorized/,
  );
});
test("audio preparation is limited and retains assignment-bound student access", async () => {
  await actor(teacher);
  assert.equal(
    (
      await db.query(
        "select private.can_read_ielts_learning_audio('three.mp3') ok",
      )
    ).rows[0].ok,
    true,
  );
  for (const path of ["four.mp3", "unseen.mp3"])
    assert.equal(
      (
        await db.query("select private.can_read_ielts_learning_audio($1) ok", [
          path,
        ])
      ).rows[0].ok,
      false,
    );
  await actor(student);
  assert.equal(
    (
      await db.query(
        "select private.can_read_ielts_learning_audio('three.mp3') ok",
      )
    ).rows[0].ok,
    false,
  );
  await db.exec(
    "insert into private.ielts_learning_allocations values('00000000-0000-0000-0000-000000000005','bh-ielts-targeted-listening-l3-v1','assigned')",
  );
  assert.equal(
    (
      await db.query(
        "select private.can_read_ielts_learning_audio('three.mp3') ok",
      )
    ).rows[0].ok,
    true,
  );
  await actor(teacher);
  await db.exec("update users set is_banned=true where id='" + teacher + "'");
  await assert.rejects(
    db.query("select rpc_ielts_teacher_lesson_one($1)", [school]),
    /not_authorized/,
  );
  assert.equal(
    (
      await db.query(
        "select private.can_read_ielts_learning_audio('three.mp3') ok",
      )
    ).rows[0].ok,
    false,
  );
});

test("released guided Reading backup is teacher-only and unavailable content is omitted", async () => {
  await db.exec("update users set is_banned=false where id='" + teacher + "'");
  await actor(teacher);
  const p = (
    await db.query("select rpc_ielts_teacher_lesson_one($1) pack", [school])
  ).rows[0].pack;
  assert.equal(p.reading_backup.code, "bh-ielts-targeted-reading-r1-v1");
  assert.equal(p.reading_backup.passage, "Approved passage");
  assert.equal(p.reading_backup.questions.length, 6);
  assert.equal(p.version, "1.1.0");
  for (const id of [student, ""]) {
    await actor(id);
    await assert.rejects(
      db.query("select rpc_ielts_teacher_lesson_one($1)", [school]),
      /not_authorized/,
    );
  }
  await actor(teacher);
  await assert.rejects(
    db.query("select rpc_ielts_teacher_lesson_one($1)", [other]),
    /not_authorized/,
  );
  await db.exec(
    "update private.ielts_learning_tasks set released=false where code='bh-ielts-targeted-reading-r1-v1'",
  );
  assert.equal(
    (await db.query("select rpc_ielts_teacher_lesson_one($1) pack", [school]))
      .rows[0].pack.reading_backup,
    null,
  );
  await db.exec(
    "update private.ielts_learning_tasks set released=true,purpose='independent_check' where code='bh-ielts-targeted-reading-r1-v1'",
  );
  assert.equal(
    (await db.query("select rpc_ielts_teacher_lesson_one($1) pack", [school]))
      .rows[0].pack.reading_backup,
    null,
  );
  await db.exec("update users set is_banned=true where id='" + teacher + "'");
  await assert.rejects(
    db.query("select rpc_ielts_teacher_lesson_one($1)", [school]),
    /not_authorized/,
  );
  await db.exec("update users set is_banned=false where id='" + teacher + "'");
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','public.rpc_ielts_teacher_lesson_one(uuid)','EXECUTE') permitted",
      )
    ).rows[0].permitted,
    false,
  );
});

test.after(async () => {
  await db.close();
});
