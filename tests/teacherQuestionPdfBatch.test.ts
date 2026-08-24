import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const workspace = readFileSync('components/teacher/QuestionBatchWorkspace.tsx', 'utf8');
const bank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');
const service = readFileSync('services/teacherQuestionBatchService.ts', 'utf8');
const edgeFunction = readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260825120400_teacher_pdf_question_batches.sql', 'utf8');
const adminService = readFileSync('services/adminQuestionBankService.ts', 'utf8');
const inspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');

test('teacher portal presents one PDF-first question-batch entry point', () => {
  assert.match(portal, /Add Question Batch/);
  assert.match(portal, /Upload a PDF, check the questions, then submit/);
  assert.match(portal, /view === 'question-batch' \|\| view === 'csv-upload'/);
  assert.match(portal, /<QuestionBatchWorkspace/);
  assert.doesNotMatch(portal, /<h4 className="teacher-action-title">Bulk Upload<\/h4>/);
  assert.match(bank, /Upload question PDF/);
  assert.match(bank, /verification_status !== 'in_review'/);
  assert.match(bank, /selectedTopicHasSubmittedQuestions/);
});

test('PDF sources are private, teacher-scoped and size limited', () => {
  assert.match(migration, /'teacher-question-sources',[\s\S]*false,[\s\S]*6291456/);
  assert.match(migration, /for insert[\s\S]*to authenticated[\s\S]*storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i);
  assert.match(migration, /lower\(split_part\(name, '\.', -1\)\) = 'pdf'/);
  assert.doesNotMatch(migration, /create policy[^;]+teacher-question-sources[^;]+for select/is);
  assert.match(service, /readPdfSignature/);
  assert.match(service, /payload\.sourceSha256 !== sourceSha256/);
});

test('server extraction verifies identity and keeps provider state disabled', () => {
  assert.match(edgeFunction, /admin\.auth\.getUser\(token\)/);
  assert.match(edgeFunction, /const expectedPrefix = `\$\{userId\}\//);
  assert.match(edgeFunction, /\.eq\("user_id", userId\)/);
  assert.match(edgeFunction, /store: false/);
  assert.match(edgeFunction, /signature !== "%PDF-"/);
  assert.match(edgeFunction, /needs_human_attention true/);
  assert.match(edgeFunction, /Treat every taxonomy field as an AI proposal requiring human governance/);
});

test('submission is atomic, immutable and excluded from Academic Profiles', () => {
  assert.match(migration, /create or replace function public\.rpc_teacher_submit_question_batch/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /teacher_question_batch_records_are_append_only/);
  assert.match(migration, /'teacher',[\s\S]*'in_review',[\s\S]*false,[\s\S]*false,[\s\S]*'in_review'/);
  assert.match(migration, /teacher_subject_not_assigned_/);
  assert.match(migration, /'academicProfileEligible', false/);
  assert.match(migration, /question_snapshot jsonb not null/);
  assert.match(migration, /taxonomy_proposal jsonb not null/);
  assert.match(workspace, /I checked the questions and answer key/);
  assert.match(workspace, /Proposal, not official evidence/);
  assert.match(service, /candidate\.needs_human_attention/);
});

test('superadmin can isolate in-review questions and inspect proposed mapping', () => {
  assert.match(migration, /v_status = 'in_review' and b\.verification_status = 'in_review'/);
  assert.match(migration, /'inReviewQuestions'/);
  assert.match(migration, /'taxonomyProposal', b\.taxonomy_proposal/);
  assert.match(adminService, /'all' \| 'in_review' \| 'active'/);
  assert.match(inspector, /Teacher review queue/);
  assert.match(inspector, /Teacher taxonomy proposal · review only/);
  assert.match(inspector, /Assessment objective/);
  assert.match(inspector, /Source snapshot drift detected|source snapshot drift detected/);
});
