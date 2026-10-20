import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261020070000_ielts_teacher_task_emails.sql','utf8');
const disp=readFileSync('supabase/functions/school_email_dispatcher/index.ts','utf8');
const svc=readFileSync('services/ieltsEmailService.ts','utf8');
const tpl=name=>{const i=disp.indexOf(`case "${name}"`);assert.ok(i>0,name);return disp.slice(i,disp.indexOf('case "',i+10));};

test('notify RPC is teacher-gated, idempotent and covers the four teacher events',()=>{
 for(const e of ['targeted_assigned','course_assigned','targeted_feedback','practice_feedback'])assert.match(sql,new RegExp(`'${e}'`));
 assert.match(sql,/private\.ielts_email_allowed\(r\.school_id/);assert.match(sql,/errcode = '42501', message = 'not_authorized'/);
 for(const k of ["'ielts-task-assigned:targeted:'","'ielts-task-due:targeted:'","'ielts-task-assigned:course:'","'ielts-task-due:course:'","'ielts-task-feedback:targeted:'","'ielts-feedback-'"])assert.ok(sql.includes(k),k);
 assert.match(sql,/revoke all on function public\.rpc_ielts_notify_students\(text, text\[\], boolean\) from public, anon;/);
 assert.match(sql,/revoke all on function private\.ielts_email_allowed\(uuid, uuid\) from public, anon, authenticated;/);
 assert.match(sql,/if not r\.reviewed then raise exception 'feedback_not_shared'/,'feedback email only after feedback is shared');
 assert.match(sql,/where v\.attempt_id = any\(p_refs\) and v\.finalized/);
 assert.ok(!/\bdrop\b/i.test(sql),'no destructive statements');});

test('payloads never carry the teacher reason, scores, bands or answers',()=>{
 const payloads=sql.match(/jsonb_build_object\([^;]*?\)/gs).join('\n');
 for(const bad of ['reason','band','score','answer','feedback','notes','weak'])assert.ok(!new RegExp(`'${bad}`).test(payloads),bad);});

test('reminders go out the day before, only for unfinished work, and are withdrawn on hand-in',()=>{
 assert.match(sql,/r\.due_at - interval '24 hours' > now\(\) \+ interval '30 minutes' and r\.status = 'assigned'/);
 assert.match(sql,/'reminders', 'student', 'ielts_task_due_reminder'/);
 assert.match(sql,/set status = 'cancelled'[\s\S]*'ielts-task-due:targeted:'[\s\S]*'ielts-task-due:course:'/);
 assert.match(sql,/create or replace trigger ielts_cancel_due_reminder after update of status on private\.ielts_learning_allocations/);
 assert.match(sql,/create or replace trigger ielts_cancel_due_reminder after update of status on public\.ielts_practice_assignment_students/);});

test('practice feedback is no longer emailed automatically',()=>{
 const body=sql.slice(sql.indexOf('create or replace function private.trg_email_ielts_review_finalized'));
 assert.ok(!/enqueue_transactional_email/.test(body));assert.match(body,/return new;/);});

test('status RPC reports outcomes without addresses, and "accepted" is never called delivered',()=>{
 const s=sql.slice(sql.indexOf('create or replace function public.rpc_ielts_email_status'));
 assert.ok(!/recipient_email|payload|html/.test(s.slice(0,s.indexOf('$$;'))));
 assert.match(s,/'sent', count\(\*\) filter \(where status = 'accepted'\)/);assert.match(s,/'delivered', count\(\*\) filter \(where status = 'delivered'\)/);
 assert.match(svc,/sent to \$\{s\.sent\}/);});

test('dispatcher templates link only into IELTS and keep feedback out of email',()=>{
 for(const n of ['ielts_task_assigned','ielts_task_due_reminder','ielts_task_feedback_ready']){const t=tpl(n);assert.match(t,/startsWith\("\/ielts"\)/);for(const bad of ['payload.reason','payload.band','payload.score','payload.notes'])assert.ok(!t.includes(bad),n+bad);}
 assert.match(tpl('ielts_task_feedback_ready'),/Feedback is never placed in email/);
 assert.match(tpl('ielts_task_assigned'),/This is a fresh check: work on your own/);});
