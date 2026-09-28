/** Staging only. Each VU needs a distinct preassigned student and a fresh assignment.
 * k6 run -e SUPABASE_URL=https://STAGING.supabase.co -e SUPABASE_ANON_KEY=...
 *   -e CLASSROOM_FIXTURE=/secure/students.json -e STUDENTS=30 load-tests/classroom.js
 * Fixture: {students:[{token,assignmentId,questions:[{id,answer}]}],teacher:{token}}
 * Run 30 -> 100 -> 500 -> 1000 separately. Never recycle completed fixtures.
 */
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';
const base = (__ENV.SUPABASE_URL || '').replace(/\/$/,'');
if (!base || base.includes('sozodkxwhubespiedgxm')) throw new Error('A staging Supabase URL is required; production is blocked.');
const count = Number(__ENV.STUDENTS || 30);
const fixtures = new SharedArray('classroom',()=>[JSON.parse(open(__ENV.CLASSROOM_FIXTURE))]);
if (!Number.isInteger(count) || count<1 || fixtures[0].students.length<count) throw new Error('Provide one distinct student per VU.');
if (new Set(fixtures[0].students.map(s=>s.token)).size !== fixtures[0].students.length) throw new Error('Student credentials must be unique.');
const errors = new Rate('classroom_errors');
export const options = {
 scenarios:{students:{executor:'per-vu-iterations',vus:count,iterations:1,maxDuration:'10m',exec:'student'},teacher:{executor:'constant-vus',vus:1,duration:'2m',exec:'teacher'}},
 thresholds:{http_req_failed:['rate<0.001'],classroom_errors:['rate==0'],'http_req_duration{operation:answer}':['p(95)<500','p(99)<1500'],'http_req_duration{operation:catalog}':['p(95)<1500'],'http_req_duration{operation:summary}':['p(95)<1500']},
};
const params=(token,operation)=>({headers:{apikey:__ENV.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},tags:{operation},timeout:'15s'});
const rpc=(name,body,token,operation)=>http.post(`${base}/rest/v1/rpc/${name}`,JSON.stringify(body),params(token,operation));
function requireSuccess(response,name){const ok=check(response,{[name]:r=>r.status===200});errors.add(!ok);if(!ok)fail(`${name} failed (HTTP ${response.status})`);return response.json();}
export function student(){
 const f=fixtures[0].students[__VU-1];
 const pending=requireSuccess(rpc('rpc_get_student_pending_assignments_v2',{},f.token,'catalog'),'catalog');
 if(!pending.some(a=>a.assignment_id===f.assignmentId))fail('Fresh assigned fixture missing');
 for(const q of f.questions){
  const body={p_assignment_id:f.assignmentId,p_question_id:q.id,p_question_text:'',p_correct_answer:'',p_student_answer:q.answer,p_is_correct:false,p_time_taken_ms:1000};
  // Duplicate in-flight writes model retries from an uncertain response / another tab.
  const replies=http.batch(Array.from({length:3},()=>['POST',`${base}/rest/v1/rpc/rpc_submit_assignment_answer_v2`,JSON.stringify(body),params(f.token,'answer')]));
  const saved=replies.map(r=>requireSuccess(r,'answer save'));
  const stable=saved.every(r=>r.is_correct===saved[0].is_correct&&r.grading_status===saved[0].grading_status);errors.add(!stable);
  sleep(0.3+Math.random()*0.7);
 }
 const resume=requireSuccess(rpc('rpc_get_student_pending_assignments_v2',{},f.token,'catalog'),'resume').find(a=>a.assignment_id===f.assignmentId);
 const exact=resume?.resume_answered_count===f.questions.length&&new Set(resume?.answered_question_ids).size===f.questions.length;
 errors.add(!exact);if(!exact)fail('Missing or duplicate answers');
 const payload={p_assignment_id:f.assignmentId,p_correct:0,p_incorrect:0,p_accuracy:0,p_score:0,p_time_taken:20};
 const first=requireSuccess(rpc('rpc_submit_assignment_result_v2',payload,f.token,'finalize'),'finalize');
 const replay=requireSuccess(rpc('rpc_submit_assignment_result_v2',payload,f.token,'finalize'),'finalize replay');
 errors.add(first.score!==replay.score||first.correct!==replay.correct||replay.already_submitted!==true);
}
export function teacher(){requireSuccess(rpc('rpc_teacher_assignment_success_summary',{},fixtures[0].teacher.token,'summary'),'teacher summary');sleep(5);}
