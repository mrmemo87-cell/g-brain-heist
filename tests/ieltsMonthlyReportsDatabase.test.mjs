import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite(),
  u = (n) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
const school = u(1),
  other = u(2),
  teacher = u(3),
  student = u(4),
  second = u(5),
  year = u(6),
  attempt = u(7),
  score = u(8),
  write = u(9),
  speak = u(10),
  allocation = u(11),
  request = u(12);
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema extensions;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function extensions.digest(bytea,text) returns bytea language sql as $$select sha256($1)$$;
create table auth.users(id uuid primary key);create table users(id uuid primary key,username text,full_name text,school_id uuid,role text,is_banned boolean default false);
create table schools(id uuid primary key,name text);create table school_members(user_id uuid,school_id uuid,status text);
create table classes(id uuid primary key);create table academic_subjects(id uuid primary key);
create table school_academic_years(id uuid primary key,school_id uuid,name text,starts_on date,ends_on date);create table school_academic_terms(id uuid primary key);
create function public.school_has_module_access(uuid,text) returns boolean language sql as $$select $1='${school}'::uuid$$;
create function public.can_manage_ielts_practice_school(uuid) returns boolean language sql as $$select $1='${school}'::uuid and auth.uid()='${teacher}'::uuid$$;
create function private.can_review_ielts_speaking_student(uuid) returns boolean language sql as $$select false$$;
create function private.ielts_speaking_student_eligible(uuid) returns boolean language sql as $$select exists(select 1 from public.users where id=$1 and not is_banned and role='student')$$;
create table ielts_exam_attempts(id uuid primary key,status text,submitted_at timestamptz);
create table private.ielts_diagnostic_attempt_evidence(attempt_id uuid,school_id uuid,student_id uuid,started_at timestamptz,form_snapshot jsonb,delivery_metadata jsonb,version_id uuid);
create table private.ielts_diagnostic_scoring_runs(id uuid,attempt_id uuid,server_verified boolean,created_at timestamptz,run_version integer,raw_score integer,marks_possible integer,scoring_policy_version text,integrity_state text,outcomes jsonb default '[]');
create table private.ielts_writing_screener_submissions(attempt_id uuid,submitted_at timestamptz,response_sha256 text,word_count integer,evidence_kind text);
create table private.ielts_writing_screener_reviews(id uuid,attempt_id uuid,response_sha256 text,reviewed_by uuid,reviewed_at timestamptz,run_version integer,next_step text,criterion_observations jsonb);
create table private.ielts_speaking_sessions(id uuid,school_id uuid,student_id uuid,submitted_at timestamptz,status text,evidence_kind text,package_code text);
create table private.ielts_speaking_reviews(id uuid,session_id uuid,teacher_confirmed boolean,reviewer_id uuid,reviewed_at timestamptz,fields jsonb);
create table private.ielts_learning_allocations(id uuid,school_id uuid,student_id uuid,task_code text,status text,created_at timestamptz,submitted_at timestamptz,updated_at timestamptz);
create table private.ielts_learning_tasks(code text,version text,title text,skill text,purpose text,content_sha256 text);
create table private.ielts_learning_reviews(id uuid,allocation_id uuid,reviewer_id uuid,reviewed_at timestamptz,feedback jsonb);
create table ielts_practice_assignments(id uuid,school_id uuid,updated_at timestamptz);
create table ielts_practice_assignment_students(assignment_id uuid,student_id uuid,created_at timestamptz,updated_at timestamptz);
create table ielts_practice_assignment_items(id uuid,assignment_id uuid,skill text,title text,content_type text,content_id text,created_at timestamptz);
create table ielts_practice_assignment_item_students(assignment_id uuid,assignment_item_id uuid,student_id uuid,status text,submitted_at timestamptz,updated_at timestamptz);
insert into schools values('${school}','School'),('${other}','Other school');
insert into users(id,username,school_id,role) values('${teacher}','Teacher','${school}','teacher'),('${student}','Student','${school}','student'),('${second}','Second','${other}','student');
insert into auth.users select id from users;insert into school_members values('${student}','${school}','active'),('${second}','${other}','active');
insert into school_academic_years values('${year}','${school}','This year',current_date-100,current_date+200);
select set_config('request.jwt.claim.sub','${teacher}',false);`);
const old = readFileSync(
  "supabase/migrations/20260811133000_reproducible_academic_reporting.sql",
  "utf8",
);
await db.exec(
  old.slice(
    old.indexOf("create table public.academic_report_snapshots"),
    old.indexOf(
      "create or replace function private.academic_report_scope_students",
    ),
  ),
);
for (const name of [
  "rpc_get_academic_report_snapshot",
  "rpc_finalize_academic_report_snapshot",
])
  await db.exec(
    `create function public.${name}(p_report_id uuid) returns jsonb language plpgsql as $$declare v_report public.academic_report_snapshots;begin select * into v_report from public.academic_report_snapshots where id=p_report_id; if not found then raise exception 'Academic report not found'; end if; return '{}'::jsonb;end;$$;`,
  );
await db.exec(
  readFileSync(
    "supabase/migrations/20261009114256_ielts_monthly_learning_reports.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261009115604_ielts_learning_plan_ai.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261009225616_ielts_report_evidence_and_plan_wording.sql",
    "utf8",
  ),
);
await db.exec(`insert into ielts_exam_attempts values('${attempt}','submitted',now()-interval '3 days'),('${write}','submitted',now()-interval '2 days');
insert into private.ielts_diagnostic_attempt_evidence values('${attempt}','${school}','${student}',now()-interval '4 days','{"items":[{"skill":"listening","accepted_answers":["SECRET KEY"]}],"version":{"mode":"screener","version":1,"test_type":"shared"}}','{}','${u(90)}'),('${write}','${school}','${student}',now()-interval '3 days','{"version":{"version":1,"test_type":"academic"}}','{}','${u(91)}');
insert into private.ielts_diagnostic_scoring_runs(id,attempt_id,server_verified,created_at,run_version,raw_score,marks_possible,scoring_policy_version,integrity_state) values('${score}','${attempt}',true,now()-interval '3 days',1,8,12,'policy-v1','unreviewed');
insert into private.ielts_writing_screener_submissions values('${write}',now()-interval '2 days','hash',234,'first_sitting');
insert into private.ielts_writing_screener_reviews values('${u(20)}','${write}','hash','${teacher}',now()-interval '1 day',1,'Explain each example clearly.','{"task_response":{"status":"developing","comment":"Explain the example."}}');
insert into private.ielts_speaking_sessions values('${speak}','${school}','${student}',now()-interval '2 days','submitted','first_sitting','interview-v1');
insert into private.ielts_speaking_reviews values('${u(21)}','${speak}',true,'${teacher}',now()-interval '1 day','{"next_step":"Extend the answer.","observations":{"fluency":{"status":"observed","comment":"Sustained a turn."}}}');
insert into private.ielts_learning_tasks values('task','1','Practice task','listening','guided_practice','hash');
insert into private.ielts_learning_allocations values('${allocation}','${school}','${student}','task','submitted',now()-interval '2 days',now()-interval '1 day',now());`);
const actor = (id) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const context = async (s = school, id = student) =>
  (await db.query("select rpc_ielts_learning_report_context($1,$2) d", [s, id]))
    .rows[0].d;
const today = (await db.query("select current_date::text d")).rows[0].d;
const fields = {
  study_goal: "Prepare for IELTS with confidence.",
  next_action: "Practise explaining an example clearly.",
  review_on: today,
  skills: Object.fromEntries(
    ["listening", "reading", "writing", "speaking"].map((sk) => [
      sk,
      {
        pathway: "more_evidence",
        rationale: "Gather more suitable evidence for this skill.",
        sources: [],
      },
    ]),
  ),
  goals: [
    {
      skill: "writing",
      action: "Explain a supporting example.",
      success: "The example supports the main idea.",
      check: "A new independently written essay.",
    },
  ],
};
const save = async (f = fields, expected = null, id = request) =>
  (
    await db.query("select rpc_ielts_save_learning_plan($1,$2,$3,$4,$5) d", [
      school,
      student,
      JSON.stringify(f),
      expected,
      id,
    ])
  ).rows[0].d;
let reportId;
test("evidence is deduplicated, scoped and protects keys; historical cutoff withholds late reviews and mutable practice state", async () => {
  const d = await context();
  assert.equal(d.evidence.length, 4);
  assert.equal(
    d.evidence.filter((e) => e.skill === "listening" && e.kind === "screener")
      .length,
    1,
  );
  assert.doesNotMatch(JSON.stringify(d), /SECRET KEY|accepted_answers/);
  const early = (
    await db.query(
      "select private.ielts_report_evidence($1,$2,now()-interval '36 hours') d",
      [school, student],
    )
  ).rows[0].d;
  assert.equal(early.find((e) => e.skill === "writing").review_id, null);
  assert.equal(
    early.find((e) => e.kind === "guided_practice").status,
    "historical_status_unavailable",
  );
  assert.equal(
    early.find((e) => e.kind === "guided_practice").submitted_at,
    null,
  );
  assert.equal(
    d.evidence.find((e) => e.skill === "writing").reviewer,
    "Teacher",
  );
  await db.exec(
    `insert into private.ielts_diagnostic_scoring_runs(id,attempt_id,server_verified,created_at,run_version,raw_score,marks_possible,scoring_policy_version,integrity_state) values('${u(30)}','${attempt}',false,now(),2,12,12,'untrusted','unreviewed')`,
  );
  assert.equal(
    (await context()).evidence.find(
      (e) => e.kind === "screener" && e.skill === "listening",
    ).raw_score,
    8,
  );
});
test("plan sharing is append-only, idempotent, optimistic and validates exact skill references", async () => {
  assert.equal((await save()).version, 1);
  assert.equal((await save()).id, request);
  await assert.rejects(
    save({ ...fields, next_action: "A different action." }),
    /request_conflict/,
  );
  await assert.rejects(save(fields, null, u(40)), /plan_changed_reload/);
  await assert.rejects(
    save(
      {
        ...fields,
        skills: {
          ...fields.skills,
          reading: {
            pathway: "foundation",
            rationale: "Some reason for support.",
            sources: [score],
          },
        },
      },
      request,
      u(40),
    ),
    /invalid_source_reference/,
  );
  await assert.rejects(
    save(
      {
        ...fields,
        skills: {
          ...fields.skills,
          writing: {
            pathway: "exam_preparation",
            rationale: "Plan focused preparation.",
            sources: [],
          },
        },
      },
      request,
      u(40),
    ),
    /pathway_evidence_required/,
  );
  await assert.rejects(
    db.query("update private.ielts_learning_plans set fields=$1", [
      JSON.stringify(fields),
    ]),
    /append_only/,
  );
});
test("report uses canonical snapshots, exact plan and source hashes; student cannot read drafts or finalize", async () => {
  const dates = (
    await db.query(
      "select (current_date-7)::text start,current_date::text ending,now()::text cutoff",
    )
  ).rows[0];
  const args = [
    school,
    student,
    year,
    dates.start,
    dates.ending,
    dates.cutoff,
    request,
  ];
  const d = (
    await db.query(
      "select rpc_ielts_generate_monthly_report($1,$2,$3,$4,$5,$6,$7) d",
      args,
    )
  ).rows[0].d;
  reportId = d.id;
  assert.equal(
    (
      await db.query(
        "select rpc_ielts_generate_monthly_report($1,$2,$3,$4,$5,$6,$7) d",
        args,
      )
    ).rows[0].d.reused,
    true,
  );
  const r = (
    await db.query("select rpc_ielts_monthly_report($1) d", [reportId])
  ).rows[0].d;
  assert.equal(r.status, "draft");
  assert.equal(r.payload.progress, "improvement_not_yet_established");
  assert.equal(r.payload.confidence, "low");
  assert.equal(r.payload.plan.id, request);
  assert.match(r.payload_hash, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from academic_report_source_snapshots where report_id=$1",
        [reportId],
      )
    ).rows[0].n,
    5,
  );
  await actor(student);
  await assert.rejects(
    db.query("select rpc_ielts_monthly_report($1)", [reportId]),
    /not_authorized/,
  );
  await assert.rejects(
    db.query("select rpc_ielts_monthly_report($1,true)", [reportId]),
    /not_authorized/,
  );
  assert.equal((await context()).reports.length, 0);
  await actor(teacher);
  await db.query("select rpc_ielts_monthly_report($1,true)", [reportId]);
  await db.query("select rpc_ielts_monthly_report($1,true)", [reportId]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from academic_report_events where report_id=$1 and event_type='finalized'",
        [reportId],
      )
    ).rows[0].n,
    1,
  );
  await actor(student);
  const shared = (
    await db.query("select rpc_ielts_monthly_report($1) d", [reportId])
  ).rows[0].d;
  assert.equal(shared.status, "final");
  assert.equal((await context()).reports.length, 1);
});
test("earlier final versions do not change with later reviews/plans; generic workflow cannot bypass IELTS guards", async () => {
  await actor(teacher);
  const before = (
    await db.query("select rpc_ielts_monthly_report($1) d", [reportId])
  ).rows[0].d;
  await db.exec(
    `insert into private.ielts_writing_screener_reviews values('${u(31)}','${write}','hash','${teacher}',now(),2,'Changed later.','{}')`,
  );
  await save(
    { ...fields, next_action: "A new next step for later work." },
    request,
    u(41),
  );
  const after = (
    await db.query("select rpc_ielts_monthly_report($1) d", [reportId])
  ).rows[0].d;
  assert.deepEqual(before, after);
  await assert.rejects(
    db.query(
      "update academic_report_snapshots set report_payload=$1 where id=$2",
      [JSON.stringify({}), reportId],
    ),
    /immutable/,
  );
  await assert.rejects(
    db.query("select rpc_finalize_academic_report_snapshot($1)", [reportId]),
    /use_ielts_report_workflow/,
  );
  await assert.rejects(
    db.query("select rpc_get_academic_report_snapshot($1)", [reportId]),
    /use_ielts_report_workflow/,
  );
});
test("AI claims are scoped, cache exact evidence and require review before a provenance-linked plan", async () => {
  await actor(teacher);
  const claim = (
    await db.query("select rpc_ielts_claim_plan_ai($1,$2,$3) d", [
      school,
      student,
      "test-model",
    ])
  ).rows[0].d;
  assert.ok(claim.context);
  assert.doesNotMatch(
    JSON.stringify(claim.context),
    /SECRET KEY|\"reviewer\"|\"student_name\"/,
  );
  await assert.rejects(
    db.query("select rpc_ielts_claim_plan_ai($1,$2,$3)", [
      school,
      student,
      "test-model",
    ]),
    /ai_already_working/,
  );
  await db.query("select rpc_ielts_finish_plan_ai($1,$2,$3)", [
    claim.id,
    JSON.stringify(fields),
    "test-provider",
  ]);
  const cached = (
    await db.query("select rpc_ielts_claim_plan_ai($1,$2,$3) d", [
      school,
      student,
      "test-model",
    ])
  ).rows[0].d;
  assert.equal(cached.id, claim.id);
  assert.equal(cached.fields.study_goal, fields.study_goal);
  const saved = (
    await db.query("select rpc_ielts_save_plan_with_ai($1,$2,$3,$4,$5,$6) d", [
      school,
      student,
      JSON.stringify(fields),
      u(41),
      u(51),
      claim.id,
    ])
  ).rows[0].d;
  assert.equal(saved.version, 3);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from private.ielts_plan_ai_links where plan_id=$1",
        [u(51)],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.rpc_ielts_finish_plan_ai(uuid,jsonb,text)','execute') b",
      )
    ).rows[0].b,
    false,
  );
  await actor(student);
  await assert.rejects(
    db.query("select rpc_ielts_claim_plan_ai($1,$2,$3)", [
      school,
      student,
      "test-model",
    ]),
    /not_authorized/,
  );
});
test("cross-school, banned actors, student writes, null and unauthorized requests fail closed", async () => {
  await actor(teacher);
  await assert.rejects(context(other, second), /not_authorized/);
  await assert.rejects(context(other, student), /not_authorized/);
  await actor(student);
  await assert.rejects(save(), /not_authorized/);
  await assert.rejects(context(school, teacher), /not_authorized/);
  await actor(second);
  await assert.rejects(
    db.query("select rpc_ielts_monthly_report($1)", [reportId]),
    /not_authorized/,
  );
  await actor(teacher);
  await db.exec(`update users set is_banned=true where id='${teacher}'`);
  await assert.rejects(context(), /not_authorized/);
  await actor(null);
  await assert.rejects(context(), /not_authorized/);
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','public.rpc_ielts_monthly_report(uuid,boolean)','execute') a,has_function_privilege('authenticated','private.ielts_report_evidence(uuid,uuid,timestamptz,timestamptz)','execute') b",
      )
    ).rows[0].a,
    false,
  );
});
test("auto-submitted trusted work is retained, voided work excluded, profile names and relevant notes used in new snapshots", async () => {
  await db.exec(
    `update users set is_banned=false,full_name='Teacher Full Name' where id='${teacher}';update users set full_name='Student Full Name' where id='${student}';`,
  );
  await actor(teacher);
  await db.exec(
    `update ielts_exam_attempts set status='auto_submitted' where id='${attempt}';`,
  );
  const d = await context();
  const objective = d.evidence.find((e) => e.source_type === "ielts_score");
  assert.equal(objective.raw_score, 8);
  assert.equal(objective.submission_status, "auto_submitted");
  assert.equal(d.student_name, "Student Full Name");
  assert.equal(
    d.evidence.find((e) => e.skill === "writing").reviewer,
    "Teacher Full Name",
  );
  await db.exec(
    `update ielts_exam_attempts set status='voided' where id='${attempt}';`,
  );
  assert.equal(
    (await context()).evidence.some((e) => e.source_type === "ielts_score"),
    false,
  );
  await db.exec(
    `update ielts_exam_attempts set status='auto_submitted' where id='${attempt}';`,
  );
  const dates = (
    await db.query(
      "select (current_date-7)::text start,current_date::text ending,now()::text cutoff",
    )
  ).rows[0];
  const r = (
    await db.query(
      "select rpc_ielts_generate_monthly_report($1,$2,$3,$4,$5,$6,$7) d",
      [school, student, year, dates.start, dates.ending, dates.cutoff, u(51)],
    )
  ).rows[0].d;
  const snapshot = (
    await db.query("select rpc_ielts_monthly_report($1) d", [r.id])
  ).rows[0].d;
  assert.equal(snapshot.payload.plan.author, "Teacher Full Name");
  assert.equal(snapshot.payload.student.name, "Student Full Name");
  assert.equal(
    snapshot.payload.limitations.some((l) =>
      l.includes("older school practice"),
    ),
    false,
  );
  const old = (
    await db.query("select rpc_ielts_monthly_report($1) d", [reportId])
  ).rows[0].d;
  assert.equal(old.payload.plan.author, "Teacher");
});
await test("close database", async () => db.close());
