import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const phase1 = read('supabase/migrations/20260812090000_school_academic_setup_and_scoped_learning.sql');
const phase2 = read('supabase/migrations/20260812093000_existing_question_bank_academic_classification.sql');
const evidence = read('supabase/migrations/20260812094500_objective_linked_assignment_evidence.sql');
const authority = read('supabase/migrations/20260812110000_verified_question_authority.sql');

test('phase 1 makes school year grade subjects and electives explicit', () => {
  assert.match(phase1, /subject_requirement in \('required', 'elective'\)/i);
  assert.match(phase1, /create table if not exists public\.student_subject_enrolments/i);
  assert.match(phase1, /rpc_school_admin_academic_setup/i);
  assert.match(phase1, /rpc_school_admin_apply_subject_offerings/i);
  assert.match(phase1, /rpc_school_admin_set_student_subject_enrolment/i);
});

test('student learning catalogue fails closed to current year grade and offered subject', () => {
  assert.match(phase1, /rpc_student_academic_subjects/i);
  assert.match(phase1, /rpc_student_learning_catalog/i);
  assert.match(phase1, /y\.status = 'current'/i);
  assert.match(phase1, /m\.grade_level = v_grade/i);
  assert.match(phase1, /m\.subject_requirement = 'required'[\s\S]+student_subject_enrolments/i);
  assert.match(phase1, /drop policy if exists "questions_read_all"/i);
  assert.match(phase1, /drop policy if exists "Public questions are viewable by everyone"/i);
});

test('existing questions receive a complete reviewed academic declaration', () => {
  for (const field of ['curriculum_strand', 'curriculum_skill', 'curriculum_subskill', 'curriculum_objective', 'eligible_grade_levels', 'curriculum_review_status']) {
    assert.match(phase2, new RegExp(field, 'i'));
  }
  assert.match(phase2, /questions_public_curriculum_metadata_check/i);
  assert.match(phase2, /published_question_requires_approved_curriculum_metadata/i);
});

test('one source question can have approved primary mappings in several grade scopes', () => {
  assert.match(phase2, /on public\.curriculum_item_objective_mappings\(assessment_item_id, curriculum_scope_id\)/i);
  assert.match(phase2, /when 'easy' then array\[6, 7\]/i);
  assert.match(phase2, /when 'hard' then array\[8, 9\]/i);
  assert.match(phase2, /cross join lateral jsonb_array_elements_text\(c\.classification->'grades'\)/i);
  assert.match(phase2, /source_record_id = t\.question_id::text/i);
});

test('the published bank is explicitly original and makes no external authority claim', () => {
  assert.match(phase2, /'brain-heist-international'/i);
  assert.match(phase2, /'brain_heist_original'/i);
  assert.match(phase2, /externalAuthorityClaimed', false/i);
  assert.match(phase2, /No external curriculum endorsement is claimed/i);
});

test('assignment evidence resolves the exact approved objective in the student grade scope', () => {
  assert.match(evidence, /school_curriculum_scope_mappings scm/i);
  assert.match(evidence, /im\.curriculum_scope_id = scm\.curriculum_scope_id/i);
  assert.match(evidence, /im\.status = 'approved' and im\.mapping_role = 'primary'/i);
  assert.match(evidence, /'curriculum_objective_id'/i);
  assert.match(evidence, /'evidence_provenance', 'approved_question_objective_mapping'/i);
  assert.doesNotMatch(evidence, /student_learning_extract_tag/i);
});

test('student and teacher interfaces use the governed contracts', () => {
  const game = read('services/gameService.ts');
  const profile = read('components/student-progress/StudentAcademicProfileV2.tsx');
  const teacher = read('components/TeacherPortal.tsx');
  const setup = read('components/school-admin/AcademicSetupPanel.tsx');
  assert.match(game, /rpc_student_academic_subjects/);
  assert.match(game, /rpc_student_learning_catalog/);
  assert.match(profile, /fetchStudentAcademicSubjects/);
  assert.match(profile, /Showing authorised school learning evidence/);
  assert.match(teacher, /Classroom question/);
  assert.match(teacher, /never changes the official Academic Profile/);
  assert.match(teacher, /eligible_grade_levels/);
  assert.match(setup, /Grade levels and subjects/);
  assert.match(setup, /Elective enrolment/);
});

test('verified authority is fail closed across catalogue and assignment evidence', () => {
  assert.match(authority, /content_origin = 'brain_heist'/);
  assert.match(authority, /verification_status = 'verified'/);
  assert.match(authority, /current_content_hash = q\.verified_content_hash/);
  assert.match(authority, /analytics_eligible_snapshot/);
  assert.match(authority, /'evidence_provenance', 'brains_heist_verified_question'/);
  assert.match(authority, /question_authority_fields_are_protected/);
  assert.match(authority, /never trust[\s\S]+browser-supplied question text, answer key, or correctness/i);
  assert.match(authority, /v_server_correct/);
  assert.match(authority, /question_snapshot->>'explanation'/);
});
