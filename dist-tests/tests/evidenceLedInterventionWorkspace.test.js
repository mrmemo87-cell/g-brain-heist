import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260817140000_evidence_led_intervention_workspace.sql', 'utf8');
const service = readFileSync('services/studentInterventionService.ts', 'utf8');
const page = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
// This contract also runs in the Vercel preview build before the workspace is promoted.
test('professional evidence reviews are append-only and fail closed', () => {
    assert.match(migration, /create table if not exists public\.student_learning_professional_reviews/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on table public\.student_learning_professional_reviews from public, anon, authenticated/i);
    assert.match(migration, /professional_evidence_review_is_append_only/i);
    assert.match(migration, /student_learning_can_manage_intervention/i);
});
test('writing evidence enters the academic profile only after final teacher review', () => {
    assert.match(migration, /drop trigger if exists trg_student_learning_capture_writing_attempt/i);
    assert.match(migration, /trg_capture_teacher_validated_writing_focus_evidence/i);
    assert.match(migration, /new\.review_status = 'final'/i);
    assert.match(migration, /'evidence_authority', 'teacher_validated'/i);
});
test('workspace returns diagnostic targets, exact examples, authority and readiness', () => {
    assert.match(migration, /rpc_teacher_student_intervention_workspace_v2/i);
    assert.match(migration, /grammar_fixes/i);
    assert.match(migration, /punctuation_fixes/i);
    assert.match(migration, /diagnostic_targets/i);
    assert.match(migration, /evidence_examples/i);
    assert.match(migration, /evidence_authority/i);
    assert.match(migration, /can_create_plan/i);
});
test('plan creation requires decision-ready evidence and concrete teaching work', () => {
    assert.match(migration, /rpc_teacher_create_learning_intervention_v3/i);
    assert.match(migration, /not v_conf\.decision_eligible/i);
    assert.match(migration, /Teacher-confirmed evidence or a validated shadow comparison is required/i);
    assert.match(migration, /A specific teaching action is required/i);
    assert.match(migration, /A specific follow-up evidence task is required/i);
    assert.match(migration, /planAutomaticallyStarted', false/i);
});
test('teacher UI explains evidence, decisions, plan action and follow-up', () => {
    assert.match(service, /rpc_teacher_student_intervention_workspace_v2/i);
    assert.match(service, /rpc_teacher_review_learning_focus_evidence/i);
    assert.match(service, /rpc_teacher_create_learning_intervention_v3/i);
    assert.match(page, /What specifically needs support/i);
    assert.match(page, /Review evidence/i);
    assert.match(page, /Practice action/i);
    assert.match(page, /Independent check/i);
    assert.match(page, /modal-error/i);
});
