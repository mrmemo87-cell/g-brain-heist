import { supabase } from './supabaseClient.js';
const ensureObject = (data, operation) => {
    if (!data || typeof data !== 'object')
        throw new Error(`${operation} returned an invalid response.`);
    return data;
};
export const getAcademicReportingContext = async (studentId) => {
    const { data, error } = await supabase.rpc('rpc_academic_reporting_context', { p_student_id: studentId ?? null });
    if (error)
        throw error;
    return ensureObject(data, 'Academic reporting context');
};
export const generateAcademicReportSnapshot = async (input) => {
    const { data, error } = await supabase.rpc('rpc_generate_academic_report_snapshot', {
        p_report_type: input.reportType,
        p_academic_year_id: input.academicYearId,
        p_academic_term_id: input.academicTermId ?? null,
        p_student_id: input.studentId ?? null,
        p_class_id: input.classId ?? null,
        p_grade_level: input.gradeLevel ?? null,
        p_academic_subject_id: input.academicSubjectId ?? null,
        p_audience: input.audience,
        p_evidence_cutoff_at: input.evidenceCutoffAt ?? null,
    });
    if (error)
        throw error;
    return ensureObject(data, 'Academic report generation');
};
export const getAcademicReportSnapshot = async (reportId) => {
    const { data, error } = await supabase.rpc('rpc_get_academic_report_snapshot', { p_report_id: reportId });
    if (error)
        throw error;
    return ensureObject(data, 'Academic report retrieval').report;
};
export const finalizeAcademicReportSnapshot = async (reportId) => {
    const { data, error } = await supabase.rpc('rpc_finalize_academic_report_snapshot', { p_report_id: reportId });
    if (error)
        throw error;
    return ensureObject(data, 'Academic report finalization');
};
export const requestAcademicReportCorrection = async (reportId, reasonCode, detail) => {
    const { data, error } = await supabase.rpc('rpc_request_academic_report_correction', {
        p_report_id: reportId,
        p_reason_code: reasonCode,
        p_detail: detail,
    });
    if (error)
        throw error;
    return ensureObject(data, 'Academic report correction request');
};
