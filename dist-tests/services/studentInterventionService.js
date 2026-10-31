import { supabase } from './supabaseClient.js';
import { userFacingError } from './userFacingError.js';
export async function getInterventionIntelligence(studentId, subject) {
    const { data, error } = await supabase.rpc('rpc_teacher_student_intervention_workspace_v2', { p_student_id: studentId, p_subject: subject || null });
    if (error)
        throw userFacingError(error, 'We could not open this student’s support recommendations just now. Please try again.');
    return data;
}
export async function createLearningIntervention(input) {
    const { data, error } = await supabase.rpc('rpc_teacher_create_learning_intervention_v3', {
        p_student_id: input.studentId,
        p_skill_key: input.skillKey,
        p_intervention_type: input.interventionType,
        p_goal: input.goal,
        p_teaching_action: input.teachingAction,
        p_evidence_task: input.evidenceTask,
        p_target_date: input.targetDate,
        p_target_status: input.targetStatus ?? 'improving',
        p_min_followup_observations: input.minimumFollowUpObservations ?? 2,
        p_min_successful_observations: input.minimumSuccessfulObservations ?? 2,
    });
    if (error)
        throw userFacingError(error, 'We could not create the support plan just now. Please try again.');
    return String(data?.interventionId || data);
}
export async function registerInterventionPractice(input) {
    const { error } = await supabase.rpc('rpc_teacher_register_intervention_practice', {
        p_assignment_id: input.assignmentId,
        p_student_id: input.studentId,
        p_skill_key: input.skillKey,
        p_diagnostic_targets: input.diagnosticTargets,
        p_intervention_id: input.interventionId || null,
    });
    if (error)
        throw userFacingError(error, 'We could not link this targeted practice to the student support record. Please try again.');
}
const INTERVENTION_SUBJECT_IDS = {
    Mathematics: 'mathematics',
    Biology: 'biology',
    Chemistry: 'chemistry',
    Physics: 'physics',
    English: 'english',
    'Russian Language': 'russian_language',
    'Kyrgyz Language': 'kyrgyz_language',
    'German Language': 'german_language',
    Geography: 'geography',
    'Global Perspective': 'global_perspective',
    Economics: 'economics',
    'Travel & Tourism': 'travel_tourism',
    ICT: 'ict',
};
export async function createInterventionPracticeAssignment(input) {
    const subjectId = INTERVENTION_SUBJECT_IDS[input.subject]
        || input.subject.toLowerCase().replace(/\s+/g, '_');
    const { data, error } = await supabase.rpc('rpc_create_intervention_practice_assignment', {
        p_teacher_id: input.teacherId,
        p_subject_id: subjectId,
        p_subject_name: input.subject,
        p_topic_name: input.topicName,
        p_question_ids: input.questionIds,
        p_assigned_at: input.assignedAt,
        p_due_at: input.dueAt || null,
        p_title: input.title,
        p_instructions: input.instructions || null,
        p_difficulty: input.difficulty || null,
        p_student_id: input.studentId,
        p_skill_key: input.skillKey,
        p_diagnostic_targets: input.diagnosticTargets,
        p_assignment_category: input.assignmentCategory,
        p_client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        p_description: input.description || null,
        p_publish_status: input.publishStatus,
        p_close_submissions_after_due: input.closeSubmissionsAfterDue,
        p_notify_students_by_email: input.notifyStudentsByEmail,
    });
    if (error) {
        throw userFacingError(error, 'We could not create this targeted practice safely. Nothing was published; please try again.');
    }
    const assignment = (Array.isArray(data) ? data[0] : data);
    if (!assignment?.id)
        throw new Error('Targeted practice could not be created.');
    return assignment;
}
export async function reviewLearningFocusEvidence(input) {
    const { error } = await supabase.rpc('rpc_teacher_review_learning_focus_evidence', {
        p_student_id: input.studentId,
        p_skill_key: input.skillKey,
        p_decision: input.decision,
        p_diagnostic_targets: input.diagnosticTargets,
        p_rationale: input.rationale,
    });
    if (error)
        throw userFacingError(error, 'We could not save the evidence review just now. Please try again.');
}
export async function reviewLearningInterventionPlan(input) {
    const { error } = await supabase.rpc('rpc_teacher_review_learning_intervention_plan', {
        p_intervention_id: input.interventionId,
        p_decision: input.decision,
        p_rationale: input.rationale,
    });
    if (error)
        throw userFacingError(error, 'We could not review the support plan just now. Please try again.');
}
export async function evaluateLearningIntervention(interventionId) {
    const { data, error } = await supabase.rpc('rpc_teacher_evaluate_learning_intervention', {
        p_intervention_id: interventionId,
        p_as_of: new Date().toISOString(),
    });
    if (error)
        throw userFacingError(error, 'We could not evaluate the follow-up evidence just now. Please try again.');
    return data;
}
export async function updateLearningIntervention(input) {
    const { error } = await supabase.rpc('rpc_teacher_update_learning_intervention', {
        p_intervention_id: input.interventionId,
        p_action: input.action,
        p_note: input.note || null,
        p_outcome_status: input.outcomeStatus || null,
    });
    if (error)
        throw userFacingError(error, 'We could not update the support plan just now. Please try again.');
}
/** Shared learning needs across a class for one subject. Students the caller may not manage are dropped server-side. */
export async function getClassLearningNeeds(studentIds, subject) {
    const { data, error } = await supabase.rpc('rpc_teacher_class_learning_needs', { p_student_ids: studentIds, p_subject: subject });
    if (error)
        throw userFacingError(error, 'We could not load this class’s learning needs just now. Please try again.');
    return data;
}
