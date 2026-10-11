import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  confirm,
  draft,
  teacher,
  student,
  other,
  assignment,
  q1,
  q2,
  answers,
} from "./helpers/classroomPaperFixture.mjs";
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
    await assert.rejects(
      f.db.query("select rpc_teacher_confirm_paper($1,$2,$3,$4,$5,null)", [
        assignment,
        student,
        f.hash,
        answers,
        f.date,
      ]),
      /ONLINE_PROGRESS_EXISTS/,
    );
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
    const args =
      "p_teacher_id uuid,p_subject_id text,p_subject_name text,p_topic_name text,p_batch text,p_question_ids uuid[],p_assigned_at timestamptz,p_due_at timestamptz,p_title text,p_instructions text,p_difficulty text,p_assignment_mode text,p_student_ids uuid[],p_description text,p_publish_status text,p_close_submissions_after_due boolean,p_notify_students_by_email boolean,p_assignment_category text,p_client_timezone text";
    for (const [name, signature] of [
      ["rpc_create_assignment", args],
      [
        "rpc_update_teacher_assignment",
        args.replace("p_teacher_id uuid", "p_assignment_id uuid"),
      ],
    ]) {
      await f.db.exec(
        `create function public.${name}(${signature}) returns public.assignments language sql as $$select a from public.assignments a where a.id='${assignment}'$$`,
      );
    }
    const created = (
      await f.db.query("select (rpc_create_assignment_classroom($1,$2)).*", [
        {
          p_teacher_id: teacher,
          p_question_ids: [q1, q2],
          p_student_ids: [student],
        },
        "paper",
      ])
    ).rows[0];
    assert.equal(created.delivery_mode, "paper");
    assert.match(created.assignment_code, /^BH-\d+$/);
    const updated = (
      await f.db.query("select (rpc_update_assignment_classroom($1,$2)).*", [
        {
          p_assignment_id: assignment,
          p_question_ids: [q1, q2],
          p_student_ids: [student],
        },
        "mixed",
      ])
    ).rows[0];
    assert.equal(updated.delivery_mode, "mixed");
    await assert.rejects(
      f.db.query("select rpc_update_assignment_classroom($1,$2)", [
        { p_assignment_id: assignment },
        "unknown",
      ]),
      /INVALID_DELIVERY_MODE/,
    );
    assert.equal(
      (await f.db.query("select delivery_mode from assignments")).rows[0]
        .delivery_mode,
      "mixed",
    );
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    await assert.rejects(
      f.db.query("select rpc_update_assignment_classroom($1,$2)", [
        { p_assignment_id: assignment },
        "online",
      ]),
      /NOT_AUTHORIZED/,
    );
    assert.equal(
      (await f.db.query("select delivery_mode from assignments")).rows[0]
        .delivery_mode,
      "mixed",
    );
  } finally {
    await f.db.close();
  }
});
