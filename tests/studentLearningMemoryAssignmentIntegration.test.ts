import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const phase2 = readFileSync('supabase/migrations/20260809172000_assignment_learning_evidence_quality.sql', 'utf8');
const submission = readFileSync('supabase/migrations/20260324040000_assignment_submission_invariants.sql', 'utf8');

test('assignment learning memory starts from the authoritative completed result', () => {
  assert.match(submission, /UPDATE student_assignments[\s\S]*status = 'completed'/i);
  assert.match(submission, /MISMATCHED_QUESTION_TOTAL/i);
  assert.match(submission, /ASSIGNMENT_ALREADY_SUBMITTED/i);
  assert.match(phase2, /v_student_status <> 'completed'/i);
  assert.match(phase2, /v_answered_count <> v_expected_count/i);
  assert.match(phase2, /\(v_result_correct \+ v_result_incorrect\) <> v_expected_count/i);
});

test('assignment evidence is topic and future skill/subskill aware', () => {
  assert.match(phase2, /assignment_question_details/i);
  assert.match(phase2, /student_learning_extract_tag\(qd\.tags, 'skill:'\)/i);
  assert.match(phase2, /student_learning_extract_tag\(qd\.tags, 'subskill:'\)/i);
  assert.match(phase2, /student_learning_build_skill_key/i);
});

test('tiny assignment samples are retained but cannot create persistent labels', () => {
  assert.match(phase2, /question_count < 3 then 'provisional'/i);
  assert.match(phase2, /v_contributes := v_group\.question_count >= 3/i);
  assert.match(phase2, /contributes_to_focus_state = true/i);
  assert.match(phase2, /where o\.student_id = p_student_id[\s\S]*contributes_to_focus_state = true/i);
});

test('assignment observations preserve useful academic evidence', () => {
  for (const field of [
    'assignment_title',
    'class_id',
    'teacher_id',
    'difficulty',
    'correct',
    'incorrect',
    'question_count',
    'expected_question_count',
    'overall_accuracy',
    'overall_score',
  ]) {
    assert.match(phase2, new RegExp(`'${field}'`, 'i'));
  }
  assert.match(phase2, /v_percentage, v_group\.question_count, v_quality, v_contributes/i);
});

test('historical assignment backfill is deterministic and rebuilds the projection', () => {
  assert.match(phase2, /delete from public\.student_learning_observations[\s\S]*source_type = 'assignment_result'/i);
  assert.match(phase2, /backfill_meaningful_assignment_evidence/i);
  assert.match(phase2, /on conflict \(student_id, source_key\) do update/i);
  assert.match(phase2, /delete from public\.student_learning_focus_states/i);
  assert.match(phase2, /rebuild_learning_focus_projection/i);
});
