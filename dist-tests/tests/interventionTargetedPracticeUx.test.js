import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const intervention = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
const workspace = readFileSync('components/student-progress/InterventionTargetedPracticeWorkspace.tsx', 'utf8');
const shell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');
const service = readFileSync('services/studentInterventionService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260822222316_intervention_targeted_practice_provenance.sql', 'utf8');
const authorityMigration = readFileSync('supabase/migrations/20260824174442_lock_academic_profile_verified_evidence.sql', 'utf8');
const categoryMigration = readFileSync('supabase/migrations/20260901084500_intervention_practice_assignment_category.sql', 'utf8');
const relevancePatch = readFileSync('scripts/patch_intervention_targeted_practice_relevance.py', 'utf8');
const occurrences = (source, value) => source.split(value).length - 1;
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
    assert.match(workspace, /studentId: context\.student\.id/);
    assert.match(authorityMigration, /'custom'::text/);
    assert.match(authorityMigration, /array\[p_student_id\]::uuid\[\]/);
    assert.match(workspace, /lockedSubject=\{subject\}/);
    assert.match(workspace, /selectedStudentIds\.length !== 1/);
    assert.match(workspace, /Intervention practice is locked to the selected student\./);
});
test('targeted practice uses atomic assignment provenance and follow-up semantics', () => {
    assert.match(workspace, /createInterventionPracticeAssignment/);
    assert.match(workspace, /tryConsumePilotQuota\('assignments_created'\)/);
    assert.match(workspace, /createLearningIntervention/);
    assert.match(workspace, /registerInterventionPractice/);
    assert.match(workspace, /Targeted-practice accuracy alone does not mark the weakness as resolved\./);
    assert.equal(occurrences(workspace, 'await createInterventionPracticeAssignment'), 1);
    assert.match(service, /rpc_create_intervention_practice_assignment/);
    assert.match(authorityMigration, /perform public\.rpc_teacher_register_intervention_practice/);
});
test('practice provenance is committed atomically before the intervention plan is created', () => {
    const assignmentIndex = workspace.indexOf('await createInterventionPracticeAssignment');
    const registrationIndex = workspace.indexOf('await registerInterventionPractice');
    const planIndex = workspace.indexOf('await createLearningIntervention');
    assert.ok(assignmentIndex >= 0);
    assert.ok(planIndex > assignmentIndex);
    assert.ok(registrationIndex > planIndex);
    assert.match(service, /rpc_teacher_register_intervention_practice/);
    assert.match(authorityMigration, /If any authorization, audience, question, or\n-- provenance check fails, the assignment creation rolls back with it/);
});
test('automatic question selection is exact to the governed weak area', () => {
    assert.match(workspace, /context\.recommendation\.exact_question_ids/);
    assert.doesNotMatch(workspace, /context\.recommendation\.recommended_question_ids/);
    assert.match(workspace, /Only\n\s*\/\/ exact governed atomic-subskill matches are preselected/);
    assert.match(workspace, /Broader related questions stay unselected for teacher review/);
    assert.doesNotMatch(workspace, /questionScore/);
    assert.match(workspace, /Number\.isInteger\(grade\)/);
    assert.match(workspace, /question\.eligible_grade_levels!\.includes\(grade\)/);
    assert.match(authorityMigration, /exact_question_ids/);
    assert.match(authorityMigration, /related_question_ids/);
});
test('same-labelled but distinct governed weaknesses cannot merge question sets', () => {
    assert.match(intervention, /item\.skill_key/);
    assert.doesNotMatch(intervention, /\[item\.subject, item\.topic \|\| '', item\.skill\]/);
    assert.match(intervention, /recommended_question_ids: \[\.\.\.new Set\(item\.exact_question_ids \|\| \[\]\)\]\.slice\(0, 6\)/);
    assert.match(intervention, /key=\{`\$\{r\.subject\}-\$\{r\.topic \|\| ''\}-\$\{r\.skill_key\}`\}/);
    assert.match(relevancePatch, /governed weaknesses/);
    assert.match(relevancePatch, /Broader primary-skill/);
});
test('targeted practice assignment type is controlled and persisted end to end', () => {
    assert.match(workspace, /assignmentCategory, setAssignmentCategory/);
    assert.match(workspace, /assignmentCategory=\{assignmentCategory\}/);
    assert.match(workspace, /setAssignmentCategory=\{setAssignmentCategory\}/);
    assert.match(workspace, /schoolId=\{context\.student\.school_id\}/);
    assert.match(workspace, /assignmentCategory,/);
    assert.match(service, /assignmentCategory: 'classwork' \| 'homework' \| 'quiz' \| 'term_exam' \| null/);
    assert.match(service, /p_assignment_category: input\.assignmentCategory/);
    assert.match(categoryMigration, /p_assignment_category text/);
    assert.match(categoryMigration, /p_assignment_category,\n\s*coalesce\(nullif\(trim\(p_client_timezone\)/);
    assert.match(categoryMigration, /'custom'::text/);
    assert.doesNotMatch(categoryMigration, /'classwork'::text/);
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
