import { responseCoverage, coverageLabel } from './ieltsResponseCoverage.js';
import { supabase } from "./supabaseClient.js";
async function rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error)
        throw new Error("We could not confirm this step. Saved assessments are safe. Check your access and connection, then try again.");
    return data;
}
export const programmeAccess = () => rpc("rpc_ielts_programme_access");
export const programmeWorkspace = (schoolId, search = "", offset = 0) => rpc("rpc_ielts_programme_workspace", {
    p_school_id: schoolId,
    p_search: search,
    p_offset: offset,
});
export const setProgrammeLead = (schoolId, teacherId, expectedId, changeId) => rpc("rpc_ielts_set_programme_lead", {
    p_school_id: schoolId,
    p_teacher_id: teacherId,
    p_expected_lead_id: expectedId,
    p_change_id: changeId,
});
export function programmeEvidenceLabel(skill, e) {
    if (!e)
        return "No submitted evidence";
    if (skill === "reading" || skill === "listening") {
        const coverage = responseCoverage(e.items_answered, e.total);
        const score = Number.isInteger(e.raw_score) && Number.isInteger(e.total)
            ? `${e.raw_score} / ${e.total} · Screener` : 'Recorded result needs review';
        return `${score} · ${coverage === 'complete' ? `${e.items_answered}/${e.total} answered` : coverageLabel(coverage)}`;
    }
    if (e.reviewed)
        return "Teacher feedback ready";
    if (e.status === "in_progress")
        return "Interview in progress";
    return "Awaiting teacher review";
}
export function programmeEvidenceRoute(skill, e) {
    if (!e)
        return null;
    const id = encodeURIComponent(e.attempt_id);
    return skill === "speaking"
        ? `/ielts/speaking-pilot/${id}`
        : skill === "writing"
            ? `/ielts/writing-screener/reviews/${id}`
            : `/ielts/screener-result/${id}`;
}
