import { supabase } from "./supabaseClient.js";
import { retryAssignmentOperation } from "./assignmentReliability.js";
import { economicsDisplayOptions } from "./economicsOptionPresentation.js";
const messages = {
    NOT_AUTHORIZED: "Only the assignment teacher can record these answers.",
    ALREADY_COMPLETED: "This student has already submitted. Their result is protected.",
    PAPER_VERSION_CHANGED: "The paper changed. Reopen this assignment to use the current version.",
    PAPER_DRAFT_CHANGED: "This draft changed in another tab. Reopen to load the latest answers.",
    ONLINE_PROGRESS_EXISTS: "Review the existing online answers before replacing them.",
    PAPER_ANSWERS_INCOMPLETE: "Choose an answer or Blank for each question.",
    INVALID_ASSESSMENT_DATE: "Choose a time between publication and now.",
    ASSIGNMENT_NOT_PUBLISHED: "Publish this assignment before confirming paper results.",
    ASSIGNMENT_CLOSED: "This assessment date is after the assignment closed.",
    PAPER_QUESTION_TYPE_UNSUPPORTED: "Paper entry supports multiple choice and true/false.",
};
function paperError(error) {
    const entry = Object.keys(messages).find((key) => error.message?.includes(key));
    return new Error(entry
        ? messages[entry]
        : "Could not save. Your draft stays on this device. Try again.");
}
export async function fetchPaperWorkspace(assignmentId) {
    const { data, error } = await supabase.rpc("rpc_teacher_paper_workspace", {
        p_assignment_id: assignmentId,
    });
    if (error)
        throw paperError(error);
    return data;
}
export function paperOptions(question) {
    return economicsDisplayOptions(question.questionId, question.options, question.optionOrderPolicy);
}
export function supportsPaperEntry(questions) {
    return (questions.length > 0 &&
        questions.every((q) => ["multiple_choice", "true_false"].includes(q.questionType) &&
            q.options.length > 1 &&
            q.options.every((o) => o.text.trim()) &&
            new Set(q.options.map((o) => o.text)).size === q.options.length));
}
export async function savePaperDraft(input) {
    const response = await retryAssignmentOperation(async () => {
        const result = await supabase.rpc("rpc_teacher_save_paper_draft", {
            p_assignment_id: input.assignmentId,
            p_student_id: input.studentId,
            p_form_hash: input.formHash,
            p_answers: input.answers,
            p_assessed_at: input.assessedAt,
            p_revision: input.revision,
        });
        if (result.error)
            throw result.error;
        return result;
    }).catch((error) => {
        throw paperError(error);
    });
    if (!Number.isInteger(response.data?.revision))
        throw new Error("The save was not confirmed. Try again.");
    return response.data.revision;
}
export async function confirmPaper(input) {
    const result = await retryAssignmentOperation(async () => {
        const response = await supabase.rpc("rpc_teacher_confirm_paper", {
            p_assignment_id: input.assignmentId,
            p_student_id: input.studentId,
            p_form_hash: input.formHash,
            p_answers: input.answers,
            p_assessed_at: input.assessedAt,
            p_replace_partial: input.replacePartial,
        });
        if (response.error)
            throw response.error;
        return response;
    }).catch((error) => {
        throw paperError(error);
    });
    if (result.data?.success !== true)
        throw new Error("Submission was not confirmed. Try again.");
    return result.data;
}
