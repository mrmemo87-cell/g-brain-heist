import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('src/lib/brains_heist/writingIntegrationService.ts', 'utf8');
const monitor = readFileSync('src/pages/writing/WritingMonitoringView.tsx', 'utf8');
const monitorCss = readFileSync('src/pages/writing/WritingMonitoringView.css', 'utf8');
const migration = readFileSync('supabase/migrations/20260825120100_complete_teacher_writing_validation.sql', 'utf8');
const backfill = migration.match(
  /-- BEGIN SAFE LEGACY WRITING ASSESSMENT BACKFILL([\s\S]*?)-- END SAFE LEGACY WRITING ASSESSMENT BACKFILL/
)?.[1] ?? '';
const backfillStatements = backfill.replace(/--.*$/gm, '');

test('teacher review context stays scoped and distinguishes reference evidence from final authority', () => {
  assert.match(service, /getWritingAssessmentReviewContext/);
  assert.match(service, /rpc_bh_writing_teacher_review_context/);
  assert.match(service, /p_attempt_key: normalizedAttemptKey/);
  assert.match(service, /automated_scores: WritingAssessmentCriterionScores/);
  assert.match(service, /latest_draft: WritingAssessmentReviewSnapshot \| null/);
  assert.match(service, /final_review: WritingAssessmentReviewSnapshot \| null/);
  assert.match(service, /`final_review` is the[\s\S]*sole teacher-authoritative state/);
  assert.match(service, /returnedAttemptKey !== normalizedAttemptKey/);
  assert.match(service, /Writing assessment review context failed validation/);
});

test('Writing Monitor presents evidence-led four-criterion validation with draft and final actions', () => {
  for (const label of ['Content', 'Communicative Achievement', 'Organisation', 'Language']) {
    assert.match(monitor, new RegExp(`label: '${label}'`));
  }
  assert.match(monitor, /Human assessment authority/);
  assert.match(monitor, /AI rubric evidence/);
  assert.match(monitor, /reference only/);
  assert.match(monitor, /Teacher-confirmed judgement/);
  assert.match(monitor, /Professional rationale/);
  assert.match(monitor, /maxLength=\{500\}/);
  assert.match(monitor, /reviewRationale\.trim\(\)\.slice\(0, 500\)/);
  assert.match(monitor, /normalizedRationale\.length < 12/);
  assert.match(monitor, /Save draft/);
  assert.match(monitor, /Finalize validation/);
  assert.match(monitor, /Confirm & finalize/);
  assert.match(monitor, /Final means permanent/);
  assert.match(monitor, /only authoritative writing evidence used by the Academic Profile/);
  assert.match(monitor, /submitWritingAssessmentReview\(\{/);
  assert.match(monitor, /is_final: isFinal/);
});

test('only a loaded final review locks the teacher authority UI', () => {
  assert.match(monitor, /const finalReview = context\?\.final_review \?\? null/);
  assert.match(monitor, /const isFinal = Boolean\(finalReview\)/);
  assert.match(monitor, /disabled=\{isFinal \|\| isSaving\}/);
  assert.match(monitor, /AI scores and saved drafts never do/);
  assert.match(monitor, /Checking this box confirms human review; it does not finalize the record by itself/);
  assert.match(monitor, /role="alert"/);
  assert.match(monitor, /closest\('input, textarea, select, button, \[contenteditable="true"\]'\)/);
  assert.match(monitor, /const saveRequestId = \(reviewSaveRequestRef\.current \?\? 0\) \+ 1/);
  assert.match(monitor, /activeAttemptKeyRef\.current !== savedAttemptKey/);
  assert.match(monitor, /reviewAssessmentIdRef\.current !== savedAssessmentId/);
});

test('teacher validation is visually distinct, responsive and backed by one-final database enforcement', () => {
  assert.match(monitorCss, /\.writing-monitor__validation \{/);
  assert.match(monitorCss, /\.writing-monitor__validation-grid \{/);
  assert.match(monitorCss, /\.writing-monitor__ai-evidence/);
  assert.match(monitorCss, /\.writing-monitor__teacher-validation/);
  assert.match(monitorCss, /\.writing-monitor__final-lock/);
  assert.match(monitorCss, /@media \(max-width: 980px\)[\s\S]*\.writing-monitor__validation-grid[\s\S]*grid-template-columns: 1fr/);

  assert.match(migration, /create unique index if not exists bh_writing_assessment_reviews_one_final_idx/);
  assert.match(migration, /where review_status = 'final'/);
  assert.match(migration, /private\.actor_can_review_bh_writing_assessment/);
  assert.match(migration, /writing_assessment_already_finalized/);
  assert.match(migration, /writing_final_review_rationale_must_be_12_to_2000_characters/);
});

test('teacher final authority is submission-wide across automated assessment versions', () => {
  assert.match(migration, /from public\.bh_writing_assessment_reviews r[\s\S]*join public\.bh_writing_assessments reviewed_assessment[\s\S]*reviewed_assessment\.attempt_key = v_assessment\.attempt_key[\s\S]*r\.review_status = 'draft'/);
  assert.match(migration, /from public\.bh_writing_assessment_reviews r[\s\S]*join public\.bh_writing_assessments reviewed_assessment[\s\S]*reviewed_assessment\.attempt_key = v_assessment\.attempt_key[\s\S]*r\.review_status = 'final'/);
  assert.match(migration, /reviewed_assessment\.student_id = v_assessment\.student_id/);
  assert.match(migration, /reviewed_assessment\.school_id = v_assessment\.school_id/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*pg_catalog\.hashtextextended\(v_assessment\.attempt_key, 924713::bigint\)/);
  assert.match(migration, /if exists \([\s\S]*join public\.bh_writing_assessments reviewed_assessment[\s\S]*reviewed_assessment\.attempt_key = v_assessment\.attempt_key[\s\S]*r\.review_status = 'final'[\s\S]*writing_assessment_already_finalized/);
});

test('historical writing backfill admits only complete, attributable four-criterion evidence', () => {
  assert.ok(backfill.length > 0, 'safe legacy backfill section is present');
  assert.match(backfill, /row_number\(\) over \([\s\S]*partition by unlinked\.logical_attempt_key[\s\S]*source_created_at desc[\s\S]*source_attempt_row_id desc/);
  assert.match(backfill, /logical_attempt_rank = 1/);
  assert.match(backfill, /content_score_text ~ '\^\[0-5\]\$'/);
  assert.match(backfill, /communicative_achievement_score_text ~ '\^\[0-5\]\$'/);
  assert.match(backfill, /organisation_score_text ~ '\^\[0-5\]\$'/);
  assert.match(backfill, /language_score_text ~ '\^\[0-5\]\$'/);
  assert.match(backfill, /typed\.total_score =[\s\S]*typed\.content_score[\s\S]*typed\.communicative_achievement_score[\s\S]*typed\.organisation_score[\s\S]*typed\.language_score/);
  assert.match(backfill, /join public\.users student[\s\S]*student\.role = 'student'/);
  assert.match(backfill, /join public\.schools school[\s\S]*school\.id = student\.school_id/);
  assert.match(backfill, /jsonb_typeof\(ranked\.payload->'student_submission'\) = 'string'/);
  assert.match(backfill, /jsonb_typeof\(ranked\.payload->'prompt_text'\) = 'string'/);
});

test('historical writing backfill is deterministic, append-only and never creates academic authority', () => {
  assert.match(migration, /create extension if not exists "uuid-ossp" with schema extensions/);
  assert.match(backfill, /extensions\.uuid_generate_v5/);
  assert.match(backfill, /extensions\.digest\([\s\S]*'sha256'/);
  assert.match(backfill, /legacy-writing-rubric-persisted-v1/);
  assert.match(backfill, /legacy-four-criterion-backfill-v1/);
  assert.match(backfill, /'needs_review'/);
  assert.match(backfill, /'academic_profile_ready', false/);
  assert.match(backfill, /'academic_profile_authority', false/);
  assert.match(backfill, /eligible\.source_created_at[\s\S]*from eligible_candidates eligible/);
  assert.match(backfill, /not exists \([\s\S]*public\.bh_writing_assessments/);
  assert.match(backfill, /on conflict \(attempt_key, rubric_version, evaluator_version\) do nothing/);
  assert.doesNotMatch(backfillStatements, /\b(?:update|delete)\b/i);
  assert.doesNotMatch(backfillStatements, /insert into public\.(?:bh_writing_assessment_reviews|student_learning_observations)/);
  assert.doesNotMatch(backfill, /communicative_achievement[^\n]*coalesce\([^\n]*0/i);
});
