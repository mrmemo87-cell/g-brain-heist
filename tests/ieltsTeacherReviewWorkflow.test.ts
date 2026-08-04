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

test('IELTS review RPCs are school-scoped and admin-only', () => {
  const sql = migration();

  assert.match(sql, /create or replace function public\.rpc_ielts_review_queue\(/i, 'queue RPC must exist');
  assert.match(sql, /create or replace function public\.rpc_ielts_review_detail\(p_skill text, p_attempt_id text\)/i, 'detail RPC must exist');
  assert.match(sql, /create or replace function public\.rpc_ielts_submit_review\(/i, 'submit/finalize RPC must exist');
  assert.match(sql, /public\.can_review_ielts_productive_submission\(v_school_id, c\.id, u\.id\)/i, 'queue must scope every row through review permission helper');
    assert.match(sql, /join public\.users u on u\.id = a\.user_id and u\.school_id = v_school_id/i, 'queue must prevent cross-school access through user school joins');
    assert.match(sql, /if not public\.can_manage_ielts_practice_school\(v_school_id\) then[\s\S]*raise exception 'forbidden'/i, 'queue must deny non-admin school actors');
  assert.match(sql, /if not public\.can_review_ielts_productive_submission\(v_school_id, v_class_id, v_student_id\) then[\s\S]*raise exception 'forbidden'/i, 'submit must reject out-of-scope actors');
  assert.doesNotMatch(sql, /class_teacher_assignments[\s\S]*teacher_user_id = auth\.uid\(\)/i, 'review workflow must not authorize teacher-only class assignment access');
  assert.match(sql, /grant execute on function public\.rpc_ielts_review_queue\(uuid, uuid, uuid, text, text, int\) to authenticated/i, 'queue RPC grant must be explicit');
  assert.match(sql, /grant execute on function public\.rpc_ielts_submit_review\(text, text, jsonb, numeric, text, text, text, text, text, boolean\) to authenticated/i, 'submit RPC grant must be explicit');
  assert.doesNotMatch(sql, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'review workflow must not depend on legacy IELTS admin permissions');
});


test('IELTS review queue is discoverable only from school admin workflows', () => {
  const schoolPracticeTab = read('components/school-admin/tabs/IeltsPracticeTab.tsx');
  const teacherPortal = read('components/TeacherPortal.tsx');

  assert.match(schoolPracticeTab, /Review Writing &amp; Speaking Submissions/i, 'School Admin IELTS Practice tab must show a clear review CTA');
  assert.match(schoolPracticeTab, /onClick=\{onOpenReviews\}/i, 'School Admin IELTS Practice CTA must open the embedded review queue');
  assert.doesNotMatch(schoolPracticeTab, /href="\/ielts\/reviews"/i, 'School Admin IELTS Practice CTA must not leave the portal shell');
  assert.match(schoolPracticeTab, /without leaving School Administration/i, 'School Admin IELTS Practice must keep reviews in the portal shell');
  assert.doesNotMatch(teacherPortal, /IELTS Reviews|\/ielts\/reviews/i, 'Teacher Portal must not expose IELTS review navigation');
});

test('IELTS review queue defaults to pending writing submissions with a clear empty state', () => {
  const queue = read('src/pages/ielts/IeltsReviewQueue.tsx');

  assert.match(queue, /useState<IeltsReviewSkill \| ''>\('writing'\)/, 'queue skill filter must default to writing');
  assert.match(queue, /useState\('pending'\)/, 'queue status filter must default to pending');
  assert.match(queue, /Pending writing submissions are shown first/i, 'queue UI must document the default filters');
  assert.match(queue, /No submissions waiting for review/i, 'queue empty state must be clear');
});

test('IELTS writing submissions are inserted as pending review attempts', () => {
  const scoring = read('src/lib/ieltsPracticeScoring.ts');
  const writingPractice = read('src/pages/ielts/WritingPractice.tsx');

  assert.match(scoring, /review_status: 'pending'/i, 'writing attempt payloads must explicitly mark new submissions pending');
  assert.match(writingPractice, /buildWritingAttemptPayload\([\s\S]*user_id:[\s\S]*task_id:[\s\S]*answer_text:[\s\S]*word_count:/i, 'WritingPractice must submit attempts through the pending-aware payload builder');
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
  assert.match(service, /functions\/v1\/ielts_ai_review_draft/i, 'service must call secure AI review edge function');
  assert.match(service, /task_achievement[\s\S]*coherence_cohesion[\s\S]*lexical_resource[\s\S]*grammar/i, 'writing rubric keys must be modeled');
  assert.match(service, /fluency[\s\S]*lexical_resource[\s\S]*grammar[\s\S]*pronunciation/i, 'speaking rubric keys must be modeled');
  assert.match(queue, /IELTS Review Queue/i, 'queue UI must exist');
  assert.match(review, /Writing Review|Speaking Review/i, 'review screens must support writing and speaking');
  assert.match(review, /Student answer[\s\S]*Word count/i, 'writing review must show answer and word count');
  assert.match(review, /Speaking evidence[\s\S]*Duration[\s\S]*audio/i, 'speaking review must show duration and audio area');
  assert.match(review, /createSignedUrl\(/i, 'speaking review must generate signed URLs for private recording paths');
  assert.match(review, /getPublicUrl\(/i, 'speaking review must fallback to public URL generation when signing fails');
  assert.match(review, /Audio unavailable\./i, 'speaking review must show a clear fallback when audio cannot be loaded');
  assert.match(review, /Strengths[\s\S]*Improvements[\s\S]*Next steps[\s\S]*Private notes/i, 'review feedback fields must be present');
  assert.match(review, /AI check/i, 'review page must expose AI check button');
  assert.match(review, /AI suggestion — review before finalizing\./i, 'AI draft warning copy must be shown');
  assert.match(review, /AI feedback can make mistakes\. Review before finalizing\./i, 'reviewer safety copy must be present');
  assert.match(review, /Transcript may contain errors\. Check audio if unsure\./i, 'speaking transcript caveat must be present');
  assert.match(review, /Finalize review/i, 'finalization flow must still expose explicit finalize action');
  assert.match(result, /Reviewed band[\s\S]*Rubric breakdown[\s\S]*Teacher feedback/i, 'student result must show finalized review fields');
  assert.match(routes, /path:\s*'\/ielts\/reviews',[\s\S]*?<IeltsReviewAdminGuard>[\s\S]*?<IeltsReviewQueue \/>[\s\S]*?<\/IeltsReviewAdminGuard>/i, 'queue route must be school-admin guarded');
  assert.match(routes, /path:\s*'\/ielts\/reviews\/:skill\/:attemptId',[\s\S]*?<IeltsReviewAdminGuard>[\s\S]*?<IeltsSubmissionReview \/>[\s\S]*?<\/IeltsReviewAdminGuard>/i, 'review detail route must be school-admin guarded');
  assert.match(routes, /path:\s*'\/ielts\/review-result\/:skill\/:attemptId'/i, 'student result route must be registered');
  assert.doesNotMatch(`${service}\n${queue}\n${review}\n${result}`, /answer_key|correct_answer|sample_answer/i, 'frontend must not model protected answer fields');
});

test('IELTS AI review edge function enforces reviewer roles and draft-only semantics', () => {
  const edge = read('supabase-functions/ielts_ai_review_draft/index.ts');
  assert.match(edge, /allowedRoles = new Set\(\["school_admin", "admin", "superadmin"\]\)/i, 'AI edge function must restrict to reviewer roles');
  assert.match(edge, /if \(!caller\.is_admin && !allowedRoles\.has\(role\)\)/i, 'non-authorized roles including students must be blocked');
  assert.match(edge, /select\("id, role, is_admin, school_id"\)/i, 'caller school must be loaded for school-scope checks');
  assert.match(edge, /assertSameSchool/i, 'edge function must enforce cross-school denial for non-platform admins');
  assert.match(edge, /finalized: false/i, 'AI response must be explicitly draft-only');
  assert.match(edge, /storage_status: "not_persisted"/i, 'AI draft must not be mixed into finalized feedback storage');
  assert.match(edge, /AI review is not configured/i, 'missing OPENAI_API_KEY should return safe service-config message');
  assert.match(edge, /if \(!transcript\) \{[\s\S]*Transcript unavailable for this draft/i, 'speaking AI flow must handle missing transcript with a confidence caveat');
  assert.match(edge, /band_estimate[\s\S]*task_response[\s\S]*coherence[\s\S]*lexical_resource[\s\S]*grammar/i, 'writing AI schema keys must be requested');
  assert.match(edge, /band_estimate[\s\S]*fluency[\s\S]*lexical_resource[\s\S]*grammar[\s\S]*pronunciation_note/i, 'speaking AI schema keys must be requested');
});


test('IELTS review guard reuses shared access helper and blocks teacher/student roles', () => {
  const guard = read('components/ielts/IeltsReviewAdminGuard.tsx');
  const access = read('services/ieltsReviewAccess.ts');

  assert.match(guard, /canAccessIeltsReviewQueue\(\{[\s\S]*can_administer_school: canAdministerSchool/i, 'review guard must reuse centralized review access helper');
  assert.match(guard, /resolveMySchoolCapabilities\(\)/i, 'review guard must resolve active delegated school-administration capability');
  assert.match(guard, /capabilityResolution\.capabilities\?\.can_administer/i, 'delegated administrators must retain review access inside the school shell');
  assert.match(guard, /capabilityResolution\.status === 'error'[\s\S]*setState\('error'\)/i, 'capability failures must not fall through to review records');
  assert.match(access, /Boolean\(profile\.can_administer_school\)[\s\S]*role === 'admin'[\s\S]*role === 'superadmin'/i, 'review helper must allow canonical delegated capability and platform administrators');
  assert.doesNotMatch(access, /role === 'school_admin'/i, 'legacy school_admin profile roles must not grant review access');
  assert.doesNotMatch(access, /role === 'teacher'/i, 'review helper must not allow teachers');
});
