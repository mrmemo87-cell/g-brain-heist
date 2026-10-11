import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  "supabase/migrations/20261011051755_classroom_paper_workflow.sql",
  "utf8",
);
const reliability = readFileSync(
  "supabase/migrations/20260928055401_classroom_reliability.sql",
  "utf8",
);
const teacher = "10000000-0000-0000-0000-000000000001",
  student = "10000000-0000-0000-0000-000000000002",
  other = "10000000-0000-0000-0000-000000000003",
  assignment = "20000000-0000-0000-0000-000000000001",
  q1 = "30000000-0000-0000-0000-000000000001",
  q2 = "30000000-0000-0000-0000-000000000002";
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.can_use_feature(text,boolean) returns boolean language sql as $$select true$$;
 create table users(id uuid primary key,full_name text,username text);
 create table teachers(id uuid primary key,user_id uuid);
 create table school_members(school_id uuid,user_id uuid,status text);
 create table assignments(id uuid primary key,teacher_id uuid,school_id uuid,publish_status text,assigned_at timestamptz,due_at timestamptz,close_submissions_after_due boolean);
 create table assignment_questions(assignment_id uuid,question_id uuid,order_index integer,question_snapshot jsonb,primary key(assignment_id,question_id));
 create table student_assignments(id uuid default gen_random_uuid() primary key,assignment_id uuid,student_id uuid,status text,completed_at timestamptz);
 create table student_assignment_answers(id uuid default gen_random_uuid() primary key,assignment_id uuid,student_id uuid,question_id uuid,question_text text,correct_answer text,student_answer text,is_correct boolean,time_taken_ms integer,answered_at timestamptz,grading_status text,grading_source text,grading_confidence numeric,review_started_at timestamptz,reviewed_at timestamptz,ai_review_model text,ai_review_rationale text,review_error text,unique(assignment_id,student_id,question_id));
 create table student_assignment_results(assignment_id uuid,student_id uuid,correct integer,incorrect integer,accuracy integer,score integer,time_taken_seconds integer,completed_at timestamptz,submitted_late boolean,pending_review_count integer,grading_status text,primary key(assignment_id,student_id));
 grant all on student_assignment_answers,student_assignment_results to authenticated,anon;
 create function private.assignment_logical_canonical_id(uuid) returns uuid language sql as $$select $1$$;
 create function private.normalize_assignment_answer(text) returns text language sql as $$select lower(trim(coalesce($1,'')))$$;
 create function public.rpc_teacher_assignment_print_packet(uuid) returns jsonb language sql as $$select jsonb_build_object('assignment',jsonb_build_object('id',$1),'questions','[]'::jsonb)$$;
 create table evidence(assignment_id uuid,student_id uuid,primary key(assignment_id,student_id));
 create function private.capture_test_evidence() returns trigger language plpgsql as $$begin
 if exists(select 1 from student_assignments where assignment_id=new.assignment_id and student_id=new.student_id and status='completed') then insert into evidence values(new.assignment_id,new.student_id) on conflict do nothing;end if;return new;end$$;
 create constraint trigger evidence_capture after insert or update on student_assignment_results deferrable initially deferred for each row execute function private.capture_test_evidence();
 insert into users values('${teacher}','Teacher','teacher'),('${student}','Student','student'),('${other}','Other','other');
 insert into teachers values('${teacher}','${teacher}');insert into school_members values('${assignment}','${teacher}','active');
 insert into assignments values('${assignment}','${teacher}','${assignment}','published',now()-interval '2 days',now()+interval '1 day',false);
 insert into assignment_questions values('${assignment}','${q1}',1,'{"question_text":"One?","correct_answer":"Yes","options":["Yes","No"],"question_type":"multiple_choice","points":20}'),('${assignment}','${q2}',2,'{"question_text":"Two?","correct_answer":"True","options":["True","False"],"question_type":"true_false","points":30}');
 insert into student_assignments(assignment_id,student_id,status) values('${assignment}','${student}','pending');`);
  for (const name of [
    "rpc_submit_assignment_answer_v2",
    "rpc_submit_assignment_result_v2",
  ]) {
    const start = reliability.indexOf(
      "CREATE OR REPLACE FUNCTION public." + name + "(",
    );
    const end = reliability.indexOf("$function$\n;", start);
    await db.exec(reliability.slice(start, end + 13));
  }
  await db.exec(migration);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    teacher,
  ]);
  const hash = (
    await db.query("select private.paper_form_hash($1) hash", [assignment])
  ).rows[0].hash;
  const date = new Date(Date.now() - 3600000).toISOString();
  return { db, hash, date };
}
const answers = { [q1]: "Yes", [q2]: null };
const confirm = (f, opts = {}) =>
  f.db.query("select rpc_teacher_confirm_paper($1,$2,$3,$4,$5,$6) result", [
    assignment,
    opts.student || student,
    opts.hash || f.hash,
    opts.answers || answers,
    f.date,
    opts.replace || false,
  ]);
const draft = (f, opts = {}) =>
  f.db.query("select rpc_teacher_save_paper_draft($1,$2,$3,$4,$5,$6) result", [
    assignment,
    student,
    opts.hash || f.hash,
    opts.answers || answers,
    f.date,
    opts.revision ?? 0,
  ]);
test("paper marks from snapshots, preserves assessment date and creates one evidence event", async () => {
  const f = await fixture();
  try {
    const r = (await confirm(f)).rows[0].result;
    assert.equal(r.accuracy, 50);
    assert.equal(r.correct, 1);
    const row = (await f.db.query("select * from student_assignment_results"))
      .rows[0];
    assert.equal(row.score, 20);
    assert.equal(row.completion_source, "paper");
    assert.equal(row.timing_available, false);
    assert.equal(new Date(row.completed_at).toISOString(), f.date);
    assert.equal(
      (await f.db.query("select count(*)::int n from evidence")).rows[0].n,
      1,
    );
    assert.equal((await confirm(f)).rows[0].result.alreadySubmitted, true);
    await assert.rejects(
      confirm(f, { answers: { [q1]: "No", [q2]: null } }),
      /ALREADY_COMPLETED/,
    );
  } finally {
    await f.db.close();
  }
});
test("invalid versions, incomplete forms, invalid options and wrong students never write results", async () => {
  const f = await fixture();
  try {
    for (const [opts, error] of [
      [{ hash: "wrong" }, /PAPER_VERSION_CHANGED/],
      [{ answers: { [q1]: "Yes" } }, /PAPER_ANSWERS_INCOMPLETE/],
      [{ answers: { [q1]: "Hacked", [q2]: null } }, /INVALID_PAPER_OPTION/],
      [{ student: other }, /STUDENT_NOT_ASSIGNED/],
    ])
      await assert.rejects(confirm(f, opts), error);
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from student_assignment_results",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("draft retries are idempotent and stale tabs cannot overwrite new answers", async () => {
  const f = await fixture();
  try {
    assert.equal((await draft(f)).rows[0].result.revision, 1);
    assert.equal((await draft(f)).rows[0].result.revision, 1);
    await assert.rejects(
      draft(f, { answers: { [q1]: "No", [q2]: null } }),
      /PAPER_DRAFT_CHANGED/,
    );
    assert.equal(
      (await draft(f, { answers: { [q1]: "No", [q2]: null }, revision: 1 }))
        .rows[0].result.revision,
      2,
    );
  } finally {
    await f.db.close();
  }
});
test("unfinished online answers require explicit replacement and are archived", async () => {
  const f = await fixture();
  try {
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      student,
    ]);
    await f.db.query(
      "select rpc_submit_assignment_answer_v2($1,$2,$3,$4,$5,$6,$7)",
      [assignment, q1, "forged question", "forged key", "No", true, 100],
    );
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      teacher,
    ]);
    await assert.rejects(confirm(f), /ONLINE_PROGRESS_EXISTS/);
    await assert.rejects(f.db.query("select rpc_teacher_confirm_paper($1,$2,$3,$4,$5,null)",[assignment,student,f.hash,answers,f.date]), /ONLINE_PROGRESS_EXISTS/);
    await confirm(f, { replace: true });
    const row = (
      await f.db.query(
        "select replaced_partial_answers from assignment_paper_submissions",
      )
    ).rows[0];
    assert.equal(row.replaced_partial_answers[0].student_answer, "No");
  } finally {
    await f.db.close();
  }
});
test("online submissions remain server-authoritative and duplicate safe", async () => {
  const f = await fixture();
  try {
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      student,
    ]);
    for (const [q, answer] of [
      [q1, "Yes"],
      [q2, "False"],
    ])
      await f.db.query(
        "select rpc_submit_assignment_answer_v2($1,$2,$3,$4,$5,$6,$7)",
        [assignment, q, "fake", "fake", answer, true, 100],
      );
    const call = () =>
      f.db.query(
        "select rpc_submit_assignment_result_v2($1,99,0,100,99999,1) result",
        [assignment],
      );
    assert.equal((await call()).rows[0].result.score, 20);
    assert.equal((await call()).rows[0].result.already_submitted, true);
    await assert.rejects(confirm(f), /NOT_AUTHORIZED/);
  } finally {
    await f.db.close();
  }
});
test("clients cannot directly write authoritative marks or access private paper storage", async () => {
  const f = await fixture();
  try {
    for (const role of ["anon", "authenticated"])
      for (const table of [
        "student_assignment_answers",
        "student_assignment_results",
        "assignment_paper_drafts",
        "assignment_paper_submissions",
      ]) {
        for (const privilege of ["INSERT", "UPDATE", "DELETE"])
          assert.equal(
            (
              await f.db.query("select has_table_privilege($1,$2,$3) allowed", [
                role,
                table,
                privilege,
              ])
            ).rows[0].allowed,
            false,
          );
      }
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    await assert.rejects(draft(f), /NOT_AUTHORIZED/);
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      teacher,
    ]);
    await f.db.exec("update school_members set status='inactive'");
    await assert.rejects(confirm(f), /NOT_AUTHORIZED/);
  } finally {
    await f.db.close();
  }
});
test("paper-only delivery blocks online writes, and legacy writes use duplicate protection", async () => {
  const f = await fixture();
  try {
    await f.db.query("update assignments set delivery_mode='paper'");
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      student,
    ]);
    const legacy = (answer) =>
      f.db.query("select rpc_submit_assignment_answer($1,$2,$3,$4,$5,$6,$7)", [
        assignment,
        q1,
        "",
        "",
        answer,
        false,
        100,
      ]);
    await assert.rejects(legacy("Yes"), /PAPER_ASSIGNMENT_COMPLETE_IN_CLASS/);
    await f.db.query("update assignments set delivery_mode='mixed'");
    await legacy("Yes");
    await legacy("Yes");
    await assert.rejects(legacy("No"), /ANSWER_ALREADY_SAVED/);
  } finally {
    await f.db.close();
  }
});

test("delivery wrappers preserve canonical create/update authority and roll back invalid modes", async () => {
  const f = await fixture();
  try {
    const args = "p_teacher_id uuid,p_subject_id text,p_subject_name text,p_topic_name text,p_batch text,p_question_ids uuid[],p_assigned_at timestamptz,p_due_at timestamptz,p_title text,p_instructions text,p_difficulty text,p_assignment_mode text,p_student_ids uuid[],p_description text,p_publish_status text,p_close_submissions_after_due boolean,p_notify_students_by_email boolean,p_assignment_category text,p_client_timezone text";
    for (const [name, signature] of [["rpc_create_assignment", args], ["rpc_update_teacher_assignment", args.replace("p_teacher_id uuid", "p_assignment_id uuid")]]) {
      await f.db.exec(`create function public.${name}(${signature}) returns public.assignments language sql as $$select a from public.assignments a where a.id='${assignment}'$$`);
    }
    const created = (await f.db.query("select (rpc_create_assignment_classroom($1,$2)).*", [{p_teacher_id:teacher,p_question_ids:[q1,q2],p_student_ids:[student]}, "paper"])).rows[0];
    assert.equal(created.delivery_mode, "paper");
    assert.match(created.assignment_code, /^BH-\d+$/);
    const updated = (await f.db.query("select (rpc_update_assignment_classroom($1,$2)).*", [{p_assignment_id:assignment,p_question_ids:[q1,q2],p_student_ids:[student]}, "mixed"])).rows[0];
    assert.equal(updated.delivery_mode, "mixed");
    await assert.rejects(f.db.query("select rpc_update_assignment_classroom($1,$2)", [{p_assignment_id:assignment}, "unknown"]), /INVALID_DELIVERY_MODE/);
    assert.equal((await f.db.query("select delivery_mode from assignments")).rows[0].delivery_mode,"mixed");
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
    await assert.rejects(f.db.query("select rpc_update_assignment_classroom($1,$2)", [{p_assignment_id:assignment}, "online"]), /NOT_AUTHORIZED/);
    assert.equal((await f.db.query("select delivery_mode from assignments")).rows[0].delivery_mode,"mixed");
  } finally { await f.db.close(); }
});
