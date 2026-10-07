import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const uid = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
await db.exec(readFileSync('tests/fixtures/classroomSchema.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261007153922_classroom_scoped_reads.sql', 'utf8'));
const student = uid(1), teacher = uid(2), assigned = uid(3), hidden = uid(4), scheduled = uid(5), empty = uid(6);
await db.exec(`
 insert into users(id,username) values('${student}','Student'),('${teacher}','Teacher');
 insert into teachers(id,user_id) values('${teacher}','${teacher}');
 insert into assignments(id,teacher_id,publish_status,assigned_at,title,close_submissions_after_due) values
 ('${assigned}','${teacher}','published',now(),'Assigned',false),
 ('${hidden}','${teacher}','published',now(),'Someone else',false),
 ('${scheduled}','${teacher}','scheduled',now()+interval '1 day','Future',false),
 ('${empty}','${teacher}','published',now(),'Empty',false);
 insert into student_assignments(assignment_id,student_id,status,assigned_at) values
 ('${assigned}','${student}','in_progress',now()),('${scheduled}','${student}','pending',now()),('${empty}','${student}','pending',now());
 insert into assignment_questions(assignment_id,question_id,order_index,question_snapshot) values
 ('${assigned}','${uid(10)}',1,'{"question_text":"A","correct_answer":"A","question_type":"multiple_choice","points":10}'),
 ('${assigned}','${uid(11)}',2,'{"question_text":"B","correct_answer":"hidden","accepted_answers":["hidden"],"grading_config":{},"explanation":"hidden","question_type":"short_answer","points":10}'),
 ('${hidden}','${uid(12)}',1,'{"question_text":"Private"}'),
 ('${scheduled}','${uid(13)}',1,'{"question_text":"Future"}');
 insert into student_assignment_answers(assignment_id,student_id,question_id,is_correct,grading_status,time_taken_ms)
 values('${assigned}','${student}','${uid(10)}',true,'graded',300);
`);
const actor = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const summaries = async () => (await db.query('select rpc_get_student_assignment_summaries() result')).rows[0].result;
const detail = async id => (await db.query('select rpc_get_student_assignment_detail($1) result', [id])).rows[0].result;
test('compact lists omit every snapshot; selected detail resumes only the assigned student', async () => {
 await actor(student);
 const list = await summaries(); assert.equal(list.length,1);
 assert.equal(list[0].assignment_id,assigned); assert.equal(list[0].question_count,2);
 assert.deepEqual(list[0].questions,[]); assert.equal(list[0].answered_question_ids,undefined);
 const selected = (await detail(assigned))[0]; assert.equal(selected.questions.length,2);
 assert.deepEqual(selected.answered_question_ids,[uid(10)]); assert.equal(selected.resume_answered_count,1);
 assert.equal(selected.resume_score,10); assert.equal(selected.resume_time_taken_ms,300);
 for(const key of ['correct_answer','accepted_answers','grading_config','explanation']) assert.equal(selected.questions[1][key],undefined);
 assert.deepEqual(await detail(hidden),[]); assert.deepEqual(await detail(scheduled),[]);
 await actor(uid(999)); assert.deepEqual(await summaries(),[]); assert.deepEqual(await detail(assigned),[]);
 await actor(''); await assert.rejects(summaries(),/NOT_AUTHENTICATED/); await assert.rejects(detail(assigned),/NOT_AUTHENTICATED/);
});
test('late-but-open and completed assignments retain the previous availability contract', async () => {
 await actor(student);
 await db.query('update assignments set due_at=now()-interval \'1 day\' where id=$1',[assigned]);
 assert.equal((await summaries())[0].is_late,true); assert.equal((await detail(assigned))[0].is_closed,false);
 await db.query('update assignments set close_submissions_after_due=true where id=$1',[assigned]);
 assert.equal((await detail(assigned))[0].is_closed,true);
 await db.query("update student_assignments set status='completed' where assignment_id=$1",[assigned]);
 assert.deepEqual(await summaries(),[]); assert.deepEqual(await detail(assigned),[]);
});
test('anonymous callers cannot execute either SECURITY DEFINER read', async () => {
 for(const signature of ['public.rpc_get_student_assignment_summaries()','public.rpc_get_student_assignment_detail(uuid)']) {
  assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') allowed",[signature])).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed",[signature])).rows[0].allowed,true);
 }
});
test.after(async()=>db.close());
