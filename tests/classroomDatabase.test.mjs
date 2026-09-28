import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const student = uid(1), other = uid(2), teacher = uid(3), assignment = uid(4), question = uid(5), short = uid(6);
const db = new PGlite();
await db.exec(readFileSync('tests/fixtures/classroomSchema.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20260928053301_classroom_reliability.sql', 'utf8'));
await db.exec(`
 insert into users(id,username) values('${student}','Student'),('${other}','Other'),('${teacher}','Teacher');
 insert into teachers(id,user_id) values('${teacher}','${teacher}');
 insert into assignments(id,teacher_id,publish_status,assigned_at,close_submissions_after_due,academic_year_id,school_id,class_id,assignment_mode,subject_name,title)
 values('${assignment}','${teacher}','published',now(),false,'${uid(10)}','${uid(11)}','${uid(12)}','batch','ESL','Diagnostic');
 insert into school_academic_years(id,school_id,status) values('${uid(10)}','${uid(11)}','current');
 insert into classes(id,school_id,is_active) values('${uid(12)}','${uid(11)}',true);
 insert into class_teacher_assignments(class_id,school_id,teacher_user_id,subject,active)
 values('${uid(12)}','${uid(11)}','${teacher}','ESL',true);
 insert into student_assignments(assignment_id,student_id,status,assigned_at) values('${assignment}','${student}','pending',now()),('${assignment}','${other}','pending',now());
 insert into assignment_questions(assignment_id,question_id,order_index,question_snapshot) values
 ('${assignment}','${question}',1,'{"id":"${question}","question_text":"Choose","correct_answer":"A","question_type":"multiple_choice","points":10}'),
 ('${assignment}','${short}',2,'{"id":"${short}","question_text":"Write","correct_answer":"cat","accepted_answers":["cat"],"question_type":"short_answer","points":10}');
`);
const actor = (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const answer = async (qid, value) => (await db.query('select rpc_submit_assignment_answer_v2($1,$2,$3,$4,$5,$6,$7) result', [assignment,qid,'forged text','forged key',value,true,100])).rows[0].result;
const finish = async () => (await db.query('select rpc_submit_assignment_result_v2($1,999,0,100,9999,30) result',[assignment])).rows[0].result;

test('assignment SQL: immutable answers, server grading, replay, pending reviews and authorization', async () => {
 await actor(student);
 await assert.rejects(finish(), /MISMATCHED_QUESTION_TOTAL/);
 const first = await answer(question,'A');
 assert.equal(first.is_correct,true); assert.equal(first.points_earned,10);
 assert.deepEqual(await answer(question,'A'), { success:true,is_correct:true,grading_status:'graded',pending_review:false,points_earned:10 });
 await assert.rejects(answer(question,'B'), /ANSWER_ALREADY_SAVED/);
 const pending = await answer(short,'kitten'); assert.equal(pending.pending_review,true);
 const catalog = (await db.query('select rpc_get_student_pending_assignments_v2() result')).rows[0].result;
 assert.equal(catalog[0].resume_answered_count,2); assert.equal(catalog[0].resume_pending_review_count,1);
 assert.equal(catalog[0].questions[1].correct_answer,undefined);
 assert.equal(catalog[0].questions[1].accepted_answers,undefined);
 const result = await finish(); assert.equal(result.score,10); assert.equal(result.correct,1); assert.equal(result.pending_review_count,1);
 // Retry after completion AND the deadline must return the same committed outcome.
 await db.query('update assignments set due_at=now()-interval \'1 day\',close_submissions_after_due=true where id=$1',[assignment]);
 const replay = await finish(); assert.equal(replay.already_submitted,true); assert.equal(replay.score,10);
 await answer(question,'A');
 assert.equal((await db.query('select count(*)::int n from student_assignment_results')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from student_assignment_answers')).rows[0].n,2);
 await actor(uid(999)); await assert.rejects(answer(question,'A'), /QUESTION_NOT_IN_ASSIGNED_ASSIGNMENT/); await assert.rejects(finish(), /ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED/);
 await actor(''); await assert.rejects(answer(question,'A'), /NOT_AUTHENTICATED/);
 await actor(other); await assert.rejects(answer(question,'A'), /ASSIGNMENT_CLOSED/);
 // Grader state isn't reset by an answer replay after background review.
 await actor(student); await db.query("update student_assignment_answers set grading_status='graded',is_correct=true where question_id=$1",[short]);
 assert.equal((await answer(short,'kitten')).pending_review,false);
});

test('dashboard summary retains current teacher scope and returns actual missing recipients', async () => {
 await actor(teacher);
 const summary=(await db.query('select rpc_teacher_assignment_success_summary() result')).rows[0].result;
 assert.equal(summary.submission_count,1); assert.equal(summary.followup_count,1);
 assert.ok(summary.followups.some(r=>r.student_id===other && r.kind==='missing'));
 await actor(uid(999));
 const outsider=(await db.query('select rpc_teacher_assignment_success_summary() result')).rows[0].result;
 assert.equal(outsider.followup_count,0); assert.equal(outsider.submission_count,0);
});

test('entitlement hook fast path skips auth work but gated paths still fail closed', async () => {
 await actor(student);
 await db.exec("create or replace function public.is_superadmin(uuid) returns boolean language plpgsql as $$ begin raise exception 'AUTH_LOOKUP_CALLED'; end $$;");
 await db.query("select set_config('request.path','/rpc/rpc_get_student_pending_assignments_v2',false)");
 await db.query('select private.enforce_request_entitlement()');
 await db.query("select set_config('request.path','/rpc/rpc_teacher_assignment_success_summary',false)");
 await assert.rejects(db.query('select private.enforce_request_entitlement()'), /AUTH_LOOKUP_CALLED/);
 await db.exec('create or replace function public.is_superadmin(uuid) returns boolean language sql as $$ select false $$;');
 await assert.rejects(db.query('select private.enforce_request_entitlement()'), /FEATURE_NOT_INCLUDED/);
 assert.equal((await db.query("select has_function_privilege('anon','public.rpc_submit_assignment_answer_v2(uuid,uuid,text,text,text,boolean,integer)','execute') allowed")).rows[0].allowed,false);
});

test.after(async()=>db.close());
