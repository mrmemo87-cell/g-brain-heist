import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const intervention = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
const workspace = readFileSync('components/student-progress/InterventionTargetedPracticeWorkspace.tsx', 'utf8');
const shell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');
const service = readFileSync('services/studentInterventionService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260823003000_intervention_targeted_practice_provenance.sql', 'utf8');

const occurrences = (source: string, value: string) => source.split(value).length - 1;

test('interventions separate actionable needs from evidence still being gathered', () => {
  assert.match(intervention, /What can I act on now\?/);
  assert.match(intervention, /What is Brains Heist watching\?/);
  assert.doesNotMatch(intervention, /Lower priority/);
  assert.match(intervention, /aggregateRecommendations/);
});

test('evidence review is clear before targeted practice', () => {
  for (const label of ['Review evidence', 'What specifically needs support?', 'Keep monitoring', 'Confirm need', 'Create targeted practice']) {
    assert.ok(intervention.includes(label), `Expected intervention UX to contain: ${label}`);
  }
});

test('intervention practice is locked to the selected student and subject', () => {
  assert.match(workspace, /assignment_mode: 'custom'/);
  assert.match(workspace, /student_ids: \[context\.student\.id\]/);
  assert.match(workspace, /lockedSubject=\{subject\}/);
  assert.match(workspace, /selectedStudentIds\.length !== 1/);
  assert.match(workspace, /Intervention practice is locked to the selected student\./);
});

test('targeted practice reuses canonical assignment creation and follow-up semantics', () => {
  assert.match(workspace, /GameService\.create_assignment/);
  assert.match(workspace, /tryConsumePilotQuota\('assignments_created'\)/);
  assert.match(workspace, /createLearningIntervention/);
  assert.match(workspace, /registerInterventionPractice/);
  assert.match(workspace, /Targeted-practice accuracy alone does not mark the weakness as resolved\./);
  assert.equal(occurrences(workspace, 'GameService.create_assignment'), 1);
});

test('practice provenance is registered before the intervention plan is created', () => {
  const assignmentIndex = workspace.indexOf('GameService.create_assignment');
  const registrationIndex = workspace.indexOf('await registerInterventionPractice');
  const planIndex = workspace.indexOf('await createLearningIntervention');
  assert.ok(assignmentIndex >= 0);
  assert.ok(registrationIndex > assignmentIndex);
  assert.ok(planIndex > registrationIndex);
  assert.match(service, /rpc_teacher_register_intervention_practice/);
});

test('coached practice cannot count as independent mastery evidence', () => {
  assert.match(migration, /student_learning_intervention_practice_assignments/);
  assert.match(migration, /new\.contributes_to_focus_state := false/);
  assert.match(migration, /'evidence_purpose', 'intervention_practice'/);
  assert.match(migration, /'independent_mastery_evidence', false/);
  assert.match(migration, /Intervention practice must target one student only/);
  assert.match(migration, /student_learning_can_manage_intervention/);
});

test('targeted practice stays inside the branded teacher portal shell', () => {
  assert.match(shell, /InterventionTargetedPracticeWorkspace/);
  assert.match(shell, /onCreateTargetedPractice=\{openTargetedPractice\}/);
  assert.match(shell, /activeLabel = targetedPractice \? 'Assignments'/);
});
