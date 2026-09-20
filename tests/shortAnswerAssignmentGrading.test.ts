import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const quest = fs.readFileSync('components/QuestView.tsx', 'utf8');
const gateway = fs.readFileSync('services/rpcGateway.ts', 'utf8');
const gameService = fs.readFileSync('services/gameService.ts', 'utf8');
const teacherService = fs.readFileSync('services/teacherQuestionBatchService.ts', 'utf8');
const workspace = fs.readFileSync('components/teacher/QuestionBatchWorkspace.tsx', 'utf8');
const pdfEdge = fs.readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
const reviewEdge = fs.readFileSync('supabase/functions/assignment_short_answer_review/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260920170000_short_answer_background_grading.sql', 'utf8');
const compatibility = fs.readFileSync('supabase/migrations/20260920170100_short_answer_grading_compatibility.sql', 'utf8');

test('student assignment readers use protected v2 payloads', () => {
  assert.match(gateway, /rpc_get_student_pending_assignments_v2/);
  assert.match(gateway, /rpc_get_student_active_assignment_v2/);
  assert.match(compatibility, /- 'accepted_answers'/);
  assert.match(compatibility, /- 'correct_answer'/);
  assert.match(compatibility, /resume_pending_review_count/);
});

test('short answers bypass legacy exact-answer feedback in assignments', () => {
  assert.match(quest, /currentQuestion\.question_type === 'short_answer'/);
  assert.match(quest, /GameService\.submit_assignment_answer/);
  assert.match(quest, /Under review/);
  assert.match(quest, /Your answer has been saved\. You can continue now/);
  assert.match(quest, /placeholder="Type your answer here…"/);
  assert.match(gameService, /AssignmentAnswerSubmissionResult/);
});

test('teacher PDF workflow carries reviewed accepted-answer variants', () => {
  assert.match(pdfEdge, /accepted_answers/);
  assert.match(pdfEdge, /genuinely equivalent wording, abbreviation, symbol, or notation variants/);
  assert.match(teacherService, /rpc_teacher_submit_question_batch_v3/);
  assert.match(teacherService, /semantic_fallback: true/);
  assert.match(workspace, /Accepted answers/);
  assert.match(workspace, /one per line/);
});

test('background grading is durable and non-blocking', () => {
  assert.match(migration, /grading_status = 'under_review'/);
  assert.match(migration, /pending_review_count/);
  assert.match(reviewEdge, /EdgeRuntime\.waitUntil/);
  assert.match(reviewEdge, /for \(let attempt = 1; attempt <= 2/);
  assert.match(reviewEdge, /rpc_release_short_answer_review/);
});
