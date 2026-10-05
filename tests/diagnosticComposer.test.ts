import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261004214000_english_dynamic_diagnostics_and_option_balance.sql',
  'utf8',
);
const service = readFileSync('services/diagnosticComposerService.ts', 'utf8');
const composer = readFileSync('components/teacher/DiagnosticComposer.tsx', 'utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const curriculum = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx', 'utf8');

test('new assignment snapshots balance MCQ positions without rewriting canonical questions', () => {
  assert.match(migration, /create or replace function private\.balance_assignment_question_options\(\)/);
  assert.match(
    migration,
    /create trigger trg_zzz_assignment_question_option_balance\s+before insert on public\.assignment_questions/,
  );
  assert.match(migration, /new\.question_snapshot := jsonb_set\(v_snapshot,'\{options\}'/);
  assert.match(migration, /v_block := \(greatest\(coalesce\(new\.order_index,1\),1\) - 1\) \/ v_option_count/);
  assert.match(migration, /offset v_slot\s+limit 1/);
  assert.match(migration, /coalesce\(v_snapshot->>'explanation',''\) ~\* '\\m\(option\|answer\)\\s\+\[A-D\]\\M'/);
  assert.doesNotMatch(migration, /update public\.questions\s+set/i);
  assert.doesNotMatch(migration, /update public\.assignment_questions\s+set/i);
});

test('composer is subject-agnostic and capability-based', () => {
  assert.match(migration, /private\.teacher_diagnostic_candidate_pool/);
  assert.match(migration, /q\.academic_subject_id=gc\.academic_subject_id/);
  assert.match(migration, /gc\.grade_level::smallint=any\(q\.eligible_grade_levels\)/);
  assert.match(migration, /private\.verified_question_has_curriculum_mapping/);
  assert.doesNotMatch(migration, /academic_subject_code.*english/i);
  assert.doesNotMatch(migration, /academic_subject_code.*economics/i);
  assert.match(migration, /v_pool_size>=10/);
  assert.match(migration, /v_skill_count>=2/);
  assert.match(migration, /v_skill_count>=4/);
  assert.match(migration, /jsonb_array_length\(v_difficulty\)>=3/);
  assert.match(migration, /governed_pool_too_narrow/);
  assert.match(migration, /diagnostic_pool_not_diverse_enough/);
  assert.match(migration, /diagnostic_form_not_diverse_enough/);
  assert.match(migration, /\(10,'Quick Check','Quick Diagnostic'/);
  assert.match(migration, /\(20,'Focused','Focused Diagnostic'/);
  assert.match(migration, /\(30,'Recommended','Diagnostic'/);
  assert.match(migration, /\(40,'Deep','Deep Diagnostic'/);
});

test('composer uses only current governed four-option mapped MCQs', () => {
  for (const pattern of [
    /q\.question_type='multiple_choice'/,
    /jsonb_array_length\(q\.options\)=4/,
    /q\.pool_scope='global'/,
    /q\.content_origin='brain_heist'/,
    /q\.verification_status='verified'/,
    /q\.analytics_eligible/,
    /q\.current_content_hash=q\.verified_content_hash/,
  ]) {
    assert.match(migration, pattern);
  }
  assert.match(migration, /previous_assignment\.subject_group_id=gc\.group_id/);
  assert.match(migration, /interval '90 days'/);
  assert.match(migration, /skill_round/);
  assert.match(migration, /difficulty_weight/);
});

test('composer RPCs are exact-group authorized and expose no answer keys', () => {
  for (const name of ['rpc_teacher_diagnostic_composer', 'rpc_teacher_compose_diagnostic']) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*from public,anon,authenticated,service_role`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*to authenticated,service_role`),
    );
  }
  assert.match(migration, /private\.teacher_current_teaching_groups\(v_actor,p_school_id\)/);
  const previewStart = migration.indexOf('create or replace function public.rpc_teacher_diagnostic_composer');
  const previewEnd = migration.indexOf('-- ---------------------------------------------------------------------------\n-- 4.', previewStart);
  const preview = migration.slice(previewStart, previewEnd);
  assert.doesNotMatch(preview, /correct_answer|correctAnswer/);
});

test('composer prepares a form but never creates or publishes the assignment itself', () => {
  assert.match(service, /rpc_teacher_diagnostic_composer/);
  assert.match(service, /rpc_teacher_compose_diagnostic/);
  assert.doesNotMatch(service, /rpc_create_assignment|\.from\('assignments'\)/);
  assert.match(composer, /Prepare in Assignment Wizard/);
  assert.match(composer, /Prepared, not auto-published/);
  assert.doesNotMatch(composer, /Publish diagnostic|Save diagnostic draft|Schedule diagnostic/);
});

test('teacher portal hands prepared diagnostics into the normal Assignment Wizard', () => {
  assert.match(portal, /const \[preparedDiagnostic, setPreparedDiagnostic\]/);
  assert.match(portal, /handlePreparedDiagnostic/);
  assert.match(portal, /setAssignmentQuestionIds\(diagnostic\.questionIds\)/);
  assert.match(portal, /setAssignmentGroupId\(diagnostic\.groupId\)/);
  assert.match(portal, /setAssignmentSubject\(diagnostic\.schoolSubjectName\)/);
  assert.match(portal, /setAssignmentCategory\('quiz'\)/);
  assert.match(portal, /setAssignmentTopicName\(diagnostic\.topicName\)/);
  assert.match(portal, /const selectedExactTeachingGroup = preparedDiagnostic \? selectedTeachingGroup : selectedCustomTeachingGroup/);
  assert.match(portal, /selectedTeachingGroup\.id !== preparedDiagnostic\.groupId/);
  assert.match(portal, /subject_group_id: selectedExactTeachingGroup\.id/);
  assert.match(portal, /initialStep=\{preparedDiagnostic \? 3/);
  assert.match(portal, /preparedDiagnostic=\{preparedDiagnostic\}/);
  assert.match(portal, /onSubmit=\{handleCreateAssignment\}/);
  assert.match(portal, /GameService\.create_assignment/);
});

test('prepared diagnostics lock academic context while leaving teacher review and publishing controls in the wizard', () => {
  assert.match(wizard, /preparedDiagnostic\?: PreparedDiagnostic \| null/);
  assert.match(wizard, /const diagnosticMode = Boolean\(preparedDiagnostic\)/);
  assert.match(wizard, /setQuestionPool\('brains-heist'\)/);
  assert.match(wizard, /setTypeFilter\('multiple_choice'\)/);
  assert.match(wizard, /disabled=\{diagnosticMode\}/);
  assert.match(wizard, /Prepared diagnostic/);
  assert.match(wizard, /Teacher-edited from prepared form/);
  assert.match(wizard, /title, instructions, due date, scheduling and publishing/);
  assert.match(wizard, /Publish assignment/);
  assert.match(wizard, /Save as draft/);
});

test('the same composer is available from Assignments and Curriculum Intelligence', () => {
  assert.match(portal, /Create Diagnostic/);
  assert.match(portal, /DiagnosticComposer/);
  assert.match(curriculum, /onCreateDiagnostic\?: \(groupId: string\) => void/);
  assert.match(curriculum, /onCreateDiagnostic\?\.\(selectedGroup\.id\)/);
  assert.match(curriculum, /Create Diagnostic/);
  assert.doesNotMatch(curriculum, /EconomicsDiagnosticLauncher|EnglishDiagnosticLauncher/);
});
