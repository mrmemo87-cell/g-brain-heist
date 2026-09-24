import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const edgeFunction = fs.readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
const service = fs.readFileSync('services/teacherQuestionBatchService.ts', 'utf8');
const workspace = fs.readFileSync('components/teacher/QuestionBatchWorkspace.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260920213000_require_sufficient_diagnostic_evidence.sql', 'utf8');

test('AI-created PDF questions assume no student access to the teacher source', () => {
  assert.match(edgeFunction, /student has never seen and cannot access the uploaded PDF/);
  assert.match(edgeFunction, /teacher source must be invisible to the student/);
  assert.match(edgeFunction, /standalone assessment question/);
  assert.match(edgeFunction, /hasStudentSourceDependency/);
  assert.match(edgeFunction, /SOURCE_DEPENDENCY_MARKERS/);
  assert.match(edgeFunction, /assumes access to the teacher source/);
  assert.match(service, /hasStudentSourceDependency/);
  assert.match(service, /student can answer without seeing the PDF/);
});

test('generated taxonomy favors reusable curriculum skills instead of one-off micro-labels', () => {
  assert.match(edgeFunction, /stable, reusable curriculum\/reporting skill/);
  assert.match(edgeFunction, /reusable diagnostic leaf that several related questions could share/);
  assert.match(edgeFunction, /normally reuse 1-3 primary skills and about 2-5 atomic subskills/);
  assert.match(edgeFunction, /Never invent Cambridge codes or claim official Cambridge alignment/);
  assert.match(edgeFunction, /taxonomyFragmented/);
  assert.match(edgeFunction, /distinctAtomicSubskills\.size >= Math\.ceil\(generatedQuestions\.length \* 0\.60\)/);
  assert.match(service, /The diagnostic mapping is too fragmented/);
});

test('quality revision invalidates stale browser review snapshots without losing new edits', () => {
  assert.match(edgeFunction, /QUESTION_QUALITY_REVISION = 5/);
  assert.match(edgeFunction, /quality_revision: QUESTION_QUALITY_REVISION/);
  assert.match(service, /qualityRevision: Number\(processingRequest\.quality_revision \|\| 1\)/);
  assert.match(workspace, /SavedQuestionReviewEnvelope/);
  assert.match(workspace, /parsed\.qualityRevision === nextExtraction\.qualityRevision/);
  assert.match(workspace, /nextExtraction\.qualityRevision <= 1/);
});

test('one low-data diagnostic miss cannot become a weakness or intervention target', () => {
  assert.match(migration, /p_skill_key not like ''diagnostic:%''/);
  assert.match(migration, /student_learning_refresh_focus_state/);
  assert.match(migration, /where o\.skill_key like 'diagnostic:%'/);
  assert.match(migration, /single automated miss cannot become a weakness or intervention target/);
});
