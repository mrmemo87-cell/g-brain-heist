import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fixture,
  teacher,
  student,
  other,
  assignment,
  q1,
  q2,
} from "./helpers/classroomPaperFixture.mjs";
const sid = "40000000-0000-0000-0000-000000000009",
  scanid = "50000000-0000-0000-0000-000000000009";
const options = { [q1]: ["No", "Yes"], [q2]: ["False", "True"] };
async function setup() {
  const f = await fixture();
  await f.db.exec(`
alter table users add school_id uuid,add role text default 'student',add batch text default '8A',add is_banned boolean default false,add banned_until timestamptz;
update users set school_id='${assignment}';update users set role='teacher' where id='${teacher}';
insert into school_members values('${assignment}','${student}','active'),('${assignment}','${other}','active');
alter table assignments add subject_name text default 'English',add class_id uuid;
alter table student_assignments add batch text,add assigned_at timestamptz,add due_at timestamptz,add unique(assignment_id,student_id);
create table assignment_students(assignment_id uuid,student_id uuid,primary key(assignment_id,student_id));
create table allowed_roster(student_id uuid primary key);insert into allowed_roster values('${student}'),('${other}');
create function private.teacher_assignment_authorized_students(uuid,uuid,text,uuid,uuid[]) returns table(student_id uuid,class_code text) language sql as $$ select u.id,u.batch from public.users u join public.allowed_roster r on r.student_id=u.id where u.role='student' and u.school_id=$2 $$;
`);
  for (const path of [
    "20261011055654_classroom_print_scan.sql",
    "20261011122528_classroom_unified_print_guests.sql",
  ])
    await f.db.exec(readFileSync("supabase/migrations/" + path, "utf8"));
  return f;
}
const issue = (f, count = 2, opts = options) =>
  f.db
    .query("select rpc_teacher_issue_unnamed_sheets($1,$2,$3,$4,$5) result", [
      assignment,
      sid,
      count,
      f.date,
      opts,
    ])
    .then((r) => r.rows[0].result);
const hold = (f, g) =>
  f.db.query("select rpc_teacher_hold_guest($1,'New Student','8A') result", [
    g,
  ]);
const link = (f, g, id = other, identity = true, replace = false) =>
  f.db
    .query("select rpc_teacher_link_guest($1,$2,$3,$4) result", [
      g,
      id,
      identity,
      replace,
    ])
    .then((r) => r.rows[0].result);
async function reviewed(f, sheet, id = scanid) {
  const rows = Object.fromEntries(
    sheet.questions.map((q) => [
      q.questionId,
      { state: "clear", choice: 1, coverage: [0, 1] },
    ]),
  );
  await f.db.query("select rpc_teacher_save_scan($1,$2,$3,$4)", [
    id,
    sheet.id,
    "a".repeat(64),
    rows,
  ]);
  await f.db.query("select rpc_teacher_review_scan($1,$2)", [
    id,
    Object.fromEntries(
      sheet.questions.map((q) => [q.questionId, q.options[1]]),
    ),
  ]);
}
test("unnamed printing creates unique stable tokens, frozen order and no answer keys", async () => {
  const f = await setup();
  try {
    const a = await issue(f);
    assert.equal(a.sheets.length, 2);
    assert.equal(new Set(a.sheets.map((s) => s.id)).size, 2);
    assert.ok(a.sheets.every((s) => s.studentId === null && s.guestId));
    assert.deepEqual(a.sheets[0].questions[0].options, options[q1]);
    assert.equal(JSON.stringify(a).includes("correct_answer"), false);
    assert.deepEqual(
      (await issue(f)).sheets.map((s) => s.id),
      a.sheets.map((s) => s.id),
    );
    await assert.rejects(issue(f, 3), /SCAN_SESSION_CONFLICT/);
    await assert.rejects(
      issue(f, 2, { ...options, [q1]: ["Yes", "Yes"] }),
      /INVALID_OPTION_ORDER/,
    );
  } finally {
    await f.db.close();
  }
});
test("holding seals reviewed answers without creating accounts, grades or evidence", async () => {
  const f = await setup();
  try {
    const s = (await issue(f)).sheets[0];
    await assert.rejects(hold(f, s.guestId), /SCAN_PAGES_INCOMPLETE/);
    await reviewed(f, s);
    await hold(f, s.guestId);
    await hold(f, s.guestId);
    for (const table of ["student_assignment_results", "evidence"])
      assert.equal(
        (await f.db.query(`select count(*)::int n from ${table}`)).rows[0].n,
        0,
      );
    assert.equal(
      (await f.db.query("select count(*)::int n from users")).rows[0].n,
      3,
    );
    await assert.rejects(reviewed(f, s), /GUEST_RESULT_LOCKED/);
    assert.equal(
      (
        await f.db.query(
          "select has_table_privilege('authenticated','assignment_scan_guests','SELECT') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await f.db.close();
  }
});
test("later linking requires identity confirmation, preserves date, grades once and refuses another account", async () => {
  const f = await setup();
  try {
    const s = (await issue(f)).sheets[0];
    await reviewed(f, s);
    await hold(f, s.guestId);
    await assert.rejects(
      link(f, s.guestId, other, false),
      /IDENTITY_CONFIRMATION_REQUIRED/,
    );
    assert.equal((await link(f, s.guestId)).correct, 2);
    assert.equal((await link(f, s.guestId)).alreadySubmitted, true);
    await assert.rejects(link(f, s.guestId, student), /GUEST_ALREADY_LINKED/);
    const r = (await f.db.query("select * from student_assignment_results"))
      .rows[0];
    assert.equal(new Date(r.completed_at).toISOString(), f.date);
    assert.equal(r.completion_source, "paper");
    assert.equal(r.timing_available, false);
    assert.equal(
      (await f.db.query("select count(*)::int n from evidence")).rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("partial online work needs explicit replacement and is archived", async () => {
  const f = await setup();
  try {
    const s = (await issue(f)).sheets[0];
    await reviewed(f, s);
    await hold(f, s.guestId);
    await f.db.query(
      "insert into student_assignment_answers(assignment_id,student_id,question_id,student_answer) values($1,$2,$3,'No')",
      [assignment, student, q1],
    );
    await assert.rejects(link(f, s.guestId, student), /ONLINE_PROGRESS_EXISTS/);
    assert.equal(
      (
        await f.db.query(
          "select student_id from assignment_scan_sheets where id=$1",
          [s.id],
        )
      ).rows[0].student_id,
      null,
    );
    await link(f, s.guestId, student, true, true);
    assert.equal(
      (
        await f.db.query(
          "select jsonb_array_length(replaced_partial_answers)::int n from assignment_paper_submissions",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("teacher ownership, school, active membership, roster and completed results constrain linking", async () => {
  const f = await setup();
  try {
    const s = (await issue(f)).sheets[0];
    await reviewed(f, s);
    await hold(f, s.guestId);
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    await assert.rejects(link(f, s.guestId), /NOT_AUTHORIZED/);
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      teacher,
    ]);
    for (const change of [
      "update users set school_id=null",
      "update school_members set status='inactive'",
      "update users set is_banned=true",
      "delete from allowed_roster",
    ]) {
      await f.db.exec("begin");
      await f.db.exec(
        change +
          ` where ${change.includes("school_members") ? "user_id" : change.includes("allowed_roster") ? "student_id" : "id"}='${other}'`,
      );
      await assert.rejects(link(f, s.guestId), /STUDENT_NOT_ELIGIBLE/);
      await f.db.exec("rollback");
    }
    await f.db.query(
      "insert into student_assignment_results(assignment_id,student_id) values($1,$2)",
      [assignment, other],
    );
    await assert.rejects(link(f, s.guestId), /ALREADY_COMPLETED/);
  } finally {
    await f.db.close();
  }
});
test("changed assignments keep held evidence and frozen keys but block relinking", async () => {
  const f = await setup();
  try {
    const s = (await issue(f)).sheets[0];
    await reviewed(f, s);
    await hold(f, s.guestId);
    await f.db.query(
      `update assignment_questions set question_snapshot=jsonb_set(question_snapshot,'{correct_answer}','"No"') where question_id=$1`,
      [q1],
    );
    const queue = (
      await f.db.query("select rpc_teacher_guest_results($1) result", [
        assignment,
      ])
    ).rows[0].result;
    assert.equal(queue[0].versionMatches, false);
    assert.ok(queue[0].heldAt);
    await assert.rejects(link(f, s.guestId), /PAPER_VERSION_CHANGED/);
    assert.ok(
      JSON.stringify(
        (
          await f.db.query(
            "select question_snapshots from assignment_scan_sessions",
          )
        ).rows,
      ).includes("Yes"),
    );
  } finally {
    await f.db.close();
  }
});
test("existing named scan confirmation still works with guest migration installed", async () => {
  const f = await setup();
  try {
    const a = (
      await f.db.query(
        "select rpc_teacher_issue_scan_sheets($1,$2,$3,$4,$5) result",
        [assignment, sid, [student], f.date, options],
      )
    ).rows[0].result;
    await reviewed(f, a.sheets[0]);
    const r = (
      await f.db.query("select rpc_teacher_confirm_scan($1,$2,false) result", [
        sid,
        student,
      ])
    ).rows[0].result;
    assert.equal(r.correct, 2);
  } finally {
    await f.db.close();
  }
});

test("multi-page guest booklets stay separate and require every page before holding", async () => {
  const f = await setup();
  try {
    const opts = { ...options };
    for (let n = 3; n <= 41; n++) {
      const id = `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
      opts[id] = ["No", "Yes"];
      await f.db.query("insert into assignment_questions values($1,$2,$3,$4)", [
        assignment,
        id,
        n,
        {
          question_text: "Question " + n,
          question_type: "multiple_choice",
          options: ["No", "Yes"],
          correct_answer: "Yes",
        },
      ]);
    }
    const a = await issue(f, 2, opts);
    assert.equal(a.sheets.length, 4);
    const first = a.sheets.filter((s) => s.guestId === a.sheets[0].guestId);
    assert.equal(first.length, 2);
    await reviewed(f, first[0]);
    await assert.rejects(hold(f, first[0].guestId), /SCAN_PAGES_INCOMPLETE/);
    await reviewed(f, first[1], "50000000-0000-0000-0000-000000000010");
    await hold(f, first[0].guestId);
    await assert.rejects(
      hold(f, a.sheets.find((s) => s.guestId !== first[0].guestId).guestId),
      /SCAN_PAGES_INCOMPLETE/,
    );
    assert.equal((await link(f, first[0].guestId)).total, 41);
  } finally {
    await f.db.close();
  }
});
