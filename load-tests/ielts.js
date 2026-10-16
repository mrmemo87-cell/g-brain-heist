/** Staging API harness: 10 measured minutes per distinct student + synchronized submit.
 * Not a browser/media/Auth-burst/AI capacity certification. See docs/ielts/IELTS_OCT9_RELIABILITY.md.
 * k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e IELTS_FIXTURE=/secure/fresh.json -e STUDENTS=30 load-tests/ielts.js
 */
import http from 'k6/http';
import exec from 'k6/execution';
import {sleep,fail} from 'k6';
import {SharedArray} from 'k6/data';
import {Rate} from 'k6/metrics';
import {validateIeltsFixture} from './lib/ielts-fixture.mjs';
const base=(__ENV.SUPABASE_URL||'').replace(/\/$/,''),count=Number(__ENV.STUDENTS||30);
const fixture=new SharedArray('ielts',()=>[validateIeltsFixture(base,count,JSON.parse(open(__ENV.IELTS_FIXTURE)))])[0];
if(!__ENV.SUPABASE_ANON_KEY)throw Error('Staging anon key required');
const correctness=new Rate('ielts_correctness_failures');
export const options={
 scenarios:{students:{executor:'per-vu-iterations',vus:count,iterations:1,maxDuration:'13m',exec:'student'},teacher:{executor:'constant-vus',vus:1,duration:'12m',exec:'teacher'}},
 thresholds:{http_req_failed:[{threshold:'rate<0.001',abortOnFail:true,delayAbortEval:'10s'}],ielts_correctness_failures:[{threshold:'rate==0',abortOnFail:true,delayAbortEval:'10s'}],
 'http_req_duration{operation:save}':[{threshold:'p(95)<500',abortOnFail:true,delayAbortEval:'1m'},'p(99)<1500'],
 'http_req_duration{operation:status}':['p(95)<1500'],'http_req_duration{operation:resume}':['p(95)<1500'],'http_req_duration{operation:teacher}':['p(95)<1500'],
 'http_req_duration{operation:submit}':['p(95)<5000','p(99)<10000']},
};
export function setup(){return {barrier:Date.now()+630000};}
function requireCondition(ok,label){correctness.add(!ok);if(!ok)fail(label);}
const headers=token=>({apikey:__ENV.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'});
function rpc(name,args,token,operation){const r=http.post(`${base}/rest/v1/rpc/${name}`,JSON.stringify(args),{headers:headers(token),timeout:'15s',tags:{operation}});requireCondition(r.status===200,`${operation}: HTTP ${r.status}`);return r.json();}
function identity(f){const r=http.get(`${base}/auth/v1/user`,{headers:headers(f.token),timeout:'15s',tags:{operation:'auth'}});requireCondition(r.status===200&&r.json().id===f.studentId,'Auth identity mismatch');}
const canonical=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const jitter=baseMs=>baseMs*(1+Math.random()*0.25);
export function student(data){
 const f=fixture.students[exec.scenario.iterationInTest];identity(f);
 const initial=rpc('rpc_ielts_exam_whoami',{p_exam_event_id:f.eventId},f.token,'resume');
 requireCondition(initial.allowed&&initial.assignment_id===f.assignmentId&&(!initial.attempt_id||initial.attempt_status==='not_started')&&!(initial.drafts||[]).length,'Fresh governed assignment required');
 const attempt=rpc('rpc_ielts_start_attempt',{p_assignment_id:f.assignmentId},f.token,'start');
 requireCondition(attempt.status==='in_progress'&&attempt.lock_token&&Date.now()<=data.barrier-600000&&Date.parse(attempt.ends_at)>data.barrier+60000,'Attempt must have ten measured minutes plus submission margin');
 let payload={},version=0,index=0,nextSave=Date.now(),nextStatus=Date.now(),nextRefresh=Date.now()+180000;
 while(Date.now()<data.barrier){
  const now=Date.now();
  if(now>=nextSave&&index<f.edits.length){payload={...payload,...f.edits[index++]};version++;
   const args={p_attempt_id:attempt.attempt_id,p_lock_token:attempt.lock_token,p_section:f.section,p_payload:payload,p_draft_version:version,p_client_saved_at:new Date().toISOString()};
   const ack=rpc('rpc_ielts_autosave_attempt',args,f.token,'save');requireCondition(ack.draft_version===version,'Save acknowledgement mismatch');
   if(version===1){const replay=rpc('rpc_ielts_autosave_attempt',args,f.token,'save');requireCondition(replay.draft_version===version,'Uncertain save replay mismatch');}
   nextSave=now+jitter(8000);
  }
  if(now>=nextStatus){const state=rpc('rpc_ielts_exam_status',{p_exam_event_id:f.eventId},f.token,'status');requireCondition(state.allowed&&state.attempt_id===attempt.attempt_id&&state.attempt_status==='in_progress'&&!('drafts' in state)&&!('form_public_payload' in state),'Compact status mismatch');nextStatus=now+jitter(10000);}
  if(now>=nextRefresh){const full=rpc('rpc_ielts_exam_whoami',{p_exam_event_id:f.eventId},f.token,'resume');const draft=full.drafts?.find(d=>d.section===f.section);requireCondition(full.attempt_id===attempt.attempt_id&&draft?.draft_version===version&&canonical(draft.payload)===canonical(payload),'Refresh lost draft');nextRefresh=now+180000;}
  sleep(0.25);
 }
 requireCondition(index===f.edits.length&&canonical(payload)===canonical(f.finalPayload),'Final planned responses mismatch');
 const body={p_attempt_id:attempt.attempt_id,p_lock_token:attempt.lock_token,p_payload:{[f.section]:payload},p_idempotency_key:f.idempotencyKey};
 const first=rpc('rpc_ielts_submit_attempt',body,f.token,'submit'),repeat=rpc('rpc_ielts_submit_attempt',body,f.token,'submit');
 requireCondition(Boolean(first.submission_id)&&first.submission_id===repeat.submission_id&&repeat.idempotent_replay===true,'Submission idempotency mismatch');
 const final=rpc('rpc_ielts_exam_status',{p_exam_event_id:f.eventId},f.token,'status');requireCondition(final.attempt_id===attempt.attempt_id&&['submitted','auto_submitted','force_submitted'].includes(final.attempt_status),'Final status mismatch');
}
export function teacher(){identity(fixture.teacher);const rows=rpc('rpc_ielts_exam_monitoring',{p_exam_event_id:fixture.teacher.eventId},fixture.teacher.token,'teacher');requireCondition(Array.isArray(rows),'Teacher projection mismatch');sleep(jitter(10000)/1000);}
