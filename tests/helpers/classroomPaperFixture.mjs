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

export {
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
};
