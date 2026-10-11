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
const migration = readFileSync(
  "supabase/migrations/20261011055654_classroom_print_scan.sql",
  "utf8",
);
const sessionId = "40000000-0000-0000-0000-000000000001",
  scan1 = "50000000-0000-0000-0000-000000000001",
  scan2 = "50000000-0000-0000-0000-000000000002";
const options = { [q1]: ["No", "Yes"], [q2]: ["False", "True"] };
const detected = {
  [q1]: { state: "clear", choice: 1, coverage: [0, 1] },
  [q2]: { state: "blank", choice: null, coverage: [0, 0] },
};
async function setup() {
  const f = await fixture();
  await f.db.exec(migration);
  return f;
}
const issue = (f, opts = {}) =>
  f.db.query("select rpc_teacher_issue_scan_sheets($1,$2,$3,$4,$5) result", [
    assignment,
    sessionId,
    opts.students || [student],
    f.date,
    opts.options || options,
  ]);
const scan = (f, sheet, id = scan1, hash = "a".repeat(64)) =>
  f.db.query("select rpc_teacher_save_scan($1,$2,$3,$4) result", [
    id,
    sheet,
    hash,
    detected,
  ]);
const review = (f, id = scan1, answers = { [q1]: "Yes", [q2]: null }) =>
  f.db.query("select rpc_teacher_review_scan($1,$2) result", [id, answers]);
const confirm = (f) =>
  f.db.query("select rpc_teacher_confirm_scan($1,$2,false) result", [
    sessionId,
    student,
  ]);
test("issued sheets freeze printed option order, contain no keys, and printing retries reuse tokens", async () => {
  const f = await setup();
  try {
    const packet = (await issue(f)).rows[0].result;
    assert.equal(packet.sheets.length, 1);
    assert.deepEqual(packet.sheets[0].questions[0].options, ["No", "Yes"]);
    assert.equal(packet.sheets[0].pageCount, 1);
    assert.equal(JSON.stringify(packet).includes("correct_answer"), false);
    assert.equal(
      (await issue(f)).rows[0].result.sheets[0].id,
      packet.sheets[0].id,
    );
    await assert.rejects(
      issue(f, { options: { ...options, [q1]: ["Yes", "Yes"] } }),
      /INVALID_OPTION_ORDER/,
    );
    await assert.rejects(
      issue(f, { options: { ...options, [q1]: ["No", "Forged"] } }),
      /INVALID_OPTION_ORDER/,
    );
    await assert.rejects(
      issue(f, { students: [other] }),
      /STUDENT_NOT_ASSIGNED/,
    );
    await assert.rejects(
      issue(f, { options: { ...options, [q1]: ["Yes", "No"] } }),
      /SCAN_SESSION_CONFLICT/,
    );
  } finally {
    await f.db.close();
  }
});
test("scan review is required before authoritative grading and identical confirmation is safe", async () => {
  const f = await setup();
  try {
    const sheet = (await issue(f)).rows[0].result.sheets[0];
    await scan(f, sheet.id);
    await assert.rejects(confirm(f), /SCAN_PAGES_INCOMPLETE/);
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from student_assignment_results",
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      review(f, scan1, { [q1]: "Yes" }),
      /PAPER_ANSWERS_INCOMPLETE/,
    );
    await assert.rejects(
      review(f, scan1, { [q1]: "Forged", [q2]: null }),
      /INVALID_PAPER_OPTION/,
    );
    await review(f);
    const r = (await confirm(f)).rows[0].result;
    assert.equal(r.correct, 1);
    assert.equal(r.accuracy, 50);
    assert.equal((await confirm(f)).rows[0].result.alreadySubmitted, true);
    assert.equal(
      (await f.db.query("select count(*)::int n from evidence")).rows[0].n,
      1,
    );
    assert.ok(
      (await f.db.query("select confirmed_at from assignment_scan_attempts"))
        .rows[0].confirmed_at,
    );
    await assert.rejects(scan(f, sheet.id, scan2), /ALREADY_COMPLETED/);
  } finally {
    await f.db.close();
  }
});
test("new scan invalidates older review; delayed replay cannot overwrite the latest scan", async () => {
  const f = await setup();
  try {
    const sheet = (await issue(f)).rows[0].result.sheets[0];
    await scan(f, sheet.id);
    await review(f);
    await scan(f, sheet.id, scan2, "b".repeat(64));
    await assert.rejects(confirm(f), /SCAN_PAGES_INCOMPLETE/);
    await assert.rejects(review(f), /SCAN_CHANGED/);
    await scan(f, sheet.id);
    assert.equal(
      (await f.db.query("select latest_scan_id from assignment_scan_sheets"))
        .rows[0].latest_scan_id,
      scan2,
    );
    await review(f, scan2);
    await assert.rejects(
      review(f, scan2, { [q1]: "No", [q2]: null }),
      /SCAN_REVIEW_LOCKED/,
    );
    await confirm(f);
  } finally {
    await f.db.close();
  }
});
test("QR lookup never grants authority and changed snapshots cannot be scanned", async () => {
  const f = await setup();
  try {
    const sheet = (await issue(f)).rows[0].result.sheets[0];
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    await assert.rejects(
      f.db.query("select rpc_teacher_resolve_scan_sheet($1,$2)", [
        sheet.id,
        assignment,
      ]),
      /NOT_AUTHORIZED/,
    );
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      teacher,
    ]);
    await f.db.query(
      "update assignment_questions set question_snapshot=jsonb_set(question_snapshot,'{question_text}','\"Changed\"') where question_id=$1",
      [q1],
    );
    await assert.rejects(scan(f, sheet.id), /PAPER_VERSION_CHANGED/);
    for (const table of [
      "assignment_scan_sessions",
      "assignment_scan_sheets",
      "assignment_scan_attempts",
    ]) {
      assert.equal(
        (
          await f.db.query(
            "select has_table_privilege('authenticated',$1,'INSERT') allowed",
            [table],
          )
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (
          await f.db.query(
            "select relrowsecurity enabled from pg_class where relname=$1",
            [table],
          )
        ).rows[0].enabled,
        true,
      );
    }
    assert.equal(
      (
        await f.db.query(
          "select has_function_privilege('anon','rpc_teacher_scan_session(uuid)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await f.db.close();
  }
});
test("long assignments require every page to be reviewed before one result can be confirmed", async () => {
  const f = await setup();
  try {
    for (let i = 3; i <= 41; i++) {
      const id = `30000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
      options[id] = ["Yes", "No"];
      await f.db.query("insert into assignment_questions values($1,$2,$3,$4)", [
        assignment,
        id,
        i,
        {
          question_text: "Question " + i,
          question_type: "multiple_choice",
          options: ["Yes", "No"],
          correct_answer: "Yes",
          points: 1,
        },
      ]);
    }
    const session = (await issue(f)).rows[0].result;
    assert.equal(session.sheets.length, 2);
    assert.equal(session.sheets[0].questions.length, 40);
    assert.equal(session.sheets[1].questions.length, 1);
    for (let index = 0; index < 2; index++) {
      const sheet = session.sheets[index],
        id = index === 0 ? scan1 : scan2;
      const rows = Object.fromEntries(
        sheet.questions.map((q) => [
          q.questionId,
          { state: "clear", choice: 0, coverage: [1, 0] },
        ]),
      );
      await f.db.query("select rpc_teacher_save_scan($1,$2,$3,$4)", [
        id,
        sheet.id,
        "c".repeat(64),
        rows,
      ]);
      await review(
        f,
        id,
        Object.fromEntries(
          sheet.questions.map((q) => [
            q.questionId,
            q.questionId === q2 ? "True" : "Yes",
          ]),
        ),
      );
      if (index === 0)
        await assert.rejects(confirm(f), /SCAN_PAGES_INCOMPLETE/);
    }
    assert.equal((await confirm(f)).rows[0].result.total, 41);
  } finally {
    for (const key of Object.keys(options))
      if (![q1, q2].includes(key)) delete options[key];
    await f.db.close();
  }
});
