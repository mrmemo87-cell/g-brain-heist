import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const migration = () => read('supabase/migrations/20260518170000_ielts_teacher_review_foundation.sql');

test('IELTS teacher review migration adds audit-safe productive skill review foundation', () => {
  const sql = migration();

  assert.match(sql, /create table if not exists public\.ielts_productive_skill_reviews/i, 'review table must be created');
  assert.match(sql, /create table if not exists public\.ielts_productive_skill_review_events/i, 'review event audit table must be created');
  assert.match(sql, /attempt_type text not null check \(attempt_type in \('writing', 'speaking'\)\)/i, 'writing and speaking attempts must be reviewed separately');
  assert.match(sql, /review_status text not null default 'pending' check \(review_status in \('pending', 'in_review', 'finalized'\)\)/i, 'review statuses must be explicit');
  assert.match(sql, /reviewed_by uuid references public\.users/i, 'reviewer must be persisted');
  assert.match(sql, /reviewed_at timestamptz/i, 'review timestamp must be persisted');
  assert.match(sql, /rubric jsonb not null default '\{\}'::jsonb/i, 'rubric bands must be persisted');
  assert.match(sql, /overall_band numeric/i, 'overall band must be persisted');
  assert.match(sql, /strengths text[\s\S]*improvements text[\s\S]*next_steps text[\s\S]*teacher_feedback text[\s\S]*private_notes text/i, 'teacher feedback fields must be persisted');
  assert.match(sql, /finalized boolean not null default false/i, 'finalization lock flag must exist');
  assert.match(sql, /unique \(attempt_type, attempt_id\)/i, 'review records must preserve attempt history without overwriting attempts');
});

test('IELTS review RPCs are school-scoped and assigned-teacher-safe', () => {
  const sql = migration();

  assert.match(sql, /create or replace function public\.rpc_ielts_review_queue\(/i, 'queue RPC must exist');
  assert.match(sql, /create or replace function public\.rpc_ielts_review_detail\(p_skill text, p_attempt_id text\)/i, 'detail RPC must exist');
  assert.match(sql, /create or replace function public\.rpc_ielts_submit_review\(/i, 'submit/finalize RPC must exist');
  assert.match(sql, /public\.can_review_ielts_productive_submission\(v_school_id, c\.id, u\.id\)/i, 'queue must scope every row through review permission helper');
  assert.match(sql, /join public\.users u on u\.id = a\.user_id and u\.school_id = v_school_id/i, 'queue must prevent cross-school access through user school joins');
  assert.match(sql, /class_teacher_assignments[\s\S]*teacher_user_id = auth\.uid\(\)[\s\S]*coalesce\(cta\.active, true\) = true/i, 'assigned teachers must be authorized through active class assignments');
  assert.match(sql, /if not public\.can_review_ielts_productive_submission\(v_school_id, v_class_id, v_student_id\) then[\s\S]*raise exception 'forbidden'/i, 'submit must reject out-of-scope teachers');
  assert.match(sql, /grant execute on function public\.rpc_ielts_review_queue\(uuid, uuid, uuid, text, text, int\) to authenticated/i, 'queue RPC grant must be explicit');
  assert.match(sql, /grant execute on function public\.rpc_ielts_submit_review\(text, text, jsonb, numeric, text, text, text, text, text, boolean\) to authenticated/i, 'submit RPC grant must be explicit');
  assert.doesNotMatch(sql, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'review workflow must not depend on legacy IELTS admin permissions');
});

test('IELTS finalized reviews update readiness-compatible productive skill bands', () => {
  const sql = migration();

  assert.match(sql, /alter table if exists public\.ielts_writing_attempts add column if not exists band_overall numeric/i, 'writing attempts must have readiness-compatible overall band column');
  assert.match(sql, /alter table if exists public\.ielts_speaking_attempts add column if not exists band_overall numeric/i, 'speaking attempts must have readiness-compatible overall band column');
  assert.match(sql, /if p_skill = 'writing' and p_finalize[\s\S]*update public\.ielts_writing_attempts[\s\S]*band_overall = v_review\.overall_band/i, 'finalized writing reviews must update readiness source band');
  assert.match(sql, /elsif p_skill = 'speaking' and p_finalize[\s\S]*update public\.ielts_speaking_attempts[\s\S]*band_overall = v_review\.overall_band/i, 'finalized speaking reviews must update readiness source band');
  assert.match(sql, /grant execute on function public\.ielts_latest_skill_readiness\(uuid\) to authenticated/i, 'readiness helper remains callable after review finalization');
});

test('IELTS review RPCs do not expose protected answer keys and hide private notes from students', () => {
  const sql = migration();

  assert.doesNotMatch(sql, /answer_key|correct_answer|sample_answer/i, 'review RPCs must not expose protected answer data');
  assert.match(sql, /'private_notes', case when v_for_student then null else v_review\.private_notes end/i, 'student review detail must hide private notes');
  assert.match(sql, /'student_answer', case when p_for_student then null else a\.answer_text end/i, 'student detail should not echo submitted answer text from review RPC');
  assert.match(sql, /'audio_url', case when p_for_student then null else a\.audio_url end/i, 'student detail should not expose storage paths through review RPC');
});

test('IELTS review frontend maps queue/detail/submit RPCs and exposes student result route', () => {
  const service = read('services/ieltsTeacherReviewService.ts');
  const queue = read('src/pages/ielts/IeltsReviewQueue.tsx');
  const review = read('src/pages/ielts/IeltsSubmissionReview.tsx');
  const result = read('src/pages/ielts/IeltsReviewResult.tsx');
  const routes = read('index.tsx');

  assert.match(service, /rpc_ielts_review_queue/i, 'service must call queue RPC');
  assert.match(service, /rpc_ielts_review_detail/i, 'service must call detail RPC');
  assert.match(service, /rpc_ielts_submit_review/i, 'service must call submit RPC');
  assert.match(service, /task_achievement[\s\S]*coherence_cohesion[\s\S]*lexical_resource[\s\S]*grammar/i, 'writing rubric keys must be modeled');
  assert.match(service, /fluency[\s\S]*lexical_resource[\s\S]*grammar[\s\S]*pronunciation/i, 'speaking rubric keys must be modeled');
  assert.match(queue, /IELTS Review Queue/i, 'queue UI must exist');
  assert.match(review, /Writing Review|Speaking Review/i, 'review screens must support writing and speaking');
  assert.match(review, /Student answer[\s\S]*Word count/i, 'writing review must show answer and word count');
  assert.match(review, /Speaking evidence[\s\S]*Duration[\s\S]*audio/i, 'speaking review must show duration and audio area');
  assert.match(review, /Strengths[\s\S]*Improvements[\s\S]*Next steps[\s\S]*Private notes/i, 'review feedback fields must be present');
  assert.match(result, /Reviewed band[\s\S]*Rubric breakdown[\s\S]*Teacher feedback/i, 'student result must show finalized review fields');
  assert.match(routes, /path:\s*'\/ielts\/reviews'/i, 'queue route must be registered');
  assert.match(routes, /path:\s*'\/ielts\/review-result\/:skill\/:attemptId'/i, 'student result route must be registered');
  assert.doesNotMatch(`${service}\n${queue}\n${review}\n${result}`, /answer_key|correct_answer|sample_answer/i, 'frontend must not model protected answer fields');
});
