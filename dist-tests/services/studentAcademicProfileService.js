import { supabase } from './supabaseClient.js';
import { userFacingError } from './userFacingError.js';
import { getAcademicReportingContext } from './academicReportingService.js';
const emptyProfile = () => ({
    student: { id: '', name: '' },
    scope: { viewer: 'student', allowed_subjects: [] },
    summary: { subjects_tracked: 0, completed_assignments: 0, assignment_average: null, persistent_focus_count: 0, recurring_focus_count: 0, improving_count: 0, resolved_count: 0, strength_count: 0 },
    subjects: [], assignments: [], focus_areas: [], timeline: [],
});
const operationalAcademicYearId = (years) => {
    const today = new Date().toISOString().slice(0, 10);
    return years.find((year) => year.status === 'current')?.id
        ?? years.find((year) => year.startsOn <= today && today <= year.endsOn)?.id
        ?? years[0]?.id
        ?? null;
};
export const fetchStudentAcademicProfile = async (query = {}) => {
    const params = {
        p_student_id: query.studentId ?? null,
        p_subject: query.subject ?? null,
        p_date_from: query.dateFrom ?? null,
        p_date_to: query.dateTo ?? null,
    };
    const request = query.academicYearId
        ? supabase.rpc('rpc_student_academic_profile_for_year', {
            ...params,
            p_academic_year_id: query.academicYearId,
        })
        : supabase.rpc('rpc_student_academic_profile', params);
    const { data, error } = await request;
    if (error)
        throw userFacingError(error, 'We could not open this student’s progress just now. Please try again.');
    if (!data || typeof data !== 'object')
        return emptyProfile();
    return data;
};
export const fetchStudentAcademicSubjects = async (studentId, academicYearId) => {
    let resolvedAcademicYearId = academicYearId ?? null;
    if (!resolvedAcademicYearId) {
        try {
            const reportingContext = await getAcademicReportingContext(studentId);
            resolvedAcademicYearId = operationalAcademicYearId(reportingContext.years);
        }
        catch {
            // Keep the legacy RPC as a resilient fallback when reporting context is unavailable.
        }
    }
    const request = resolvedAcademicYearId
        ? supabase.rpc('rpc_student_academic_subjects_for_year', {
            p_student_id: studentId ?? null,
            p_academic_year_id: resolvedAcademicYearId,
        })
        : supabase.rpc('rpc_student_academic_subjects', {
            p_student_id: studentId ?? null,
        });
    const { data, error } = await request;
    if (error)
        throw userFacingError(error, 'We could not load this student’s subjects for the selected academic year.');
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return [];
    const result = data;
    return result.subjects || [];
};
export const fetchStudentAcademicConfidence = async (studentId, academicYearId) => {
    let resolvedAcademicYearId = academicYearId ?? null;
    if (!resolvedAcademicYearId) {
        const reportingContext = await getAcademicReportingContext(studentId);
        resolvedAcademicYearId = operationalAcademicYearId(reportingContext.years);
    }
    const { data, error } = await supabase.rpc('rpc_student_academic_confidence', {
        p_student_id: studentId ?? null,
        p_academic_year_id: resolvedAcademicYearId,
        p_academic_subject_id: null,
    });
    if (error)
        throw userFacingError(error, 'We could not load the evidence confidence record just now. Please try again.');
    if (!data || typeof data !== 'object') {
        return {
            success: true,
            studentId: studentId || '',
            summary: { skillsTracked: 0, assessedSkills: 0, lowDataSkills: 0, staleSkills: 0, contradictorySkills: 0, teacherReviewRequired: 0 },
            confidenceStates: [],
            coverage: [],
        };
    }
    return data;
};
export const formatLearningStatus = (status) => {
    switch (status) {
        case 'insufficient_evidence': return 'More evidence needed';
        case 'contradictory': return 'Teacher review needed';
        case 'new_focus': return 'New focus area';
        case 'recurring': return 'Recurring focus area';
        case 'persistent': return 'Persistent focus area';
        case 'improving': return 'Improving';
        case 'resolved': return 'Resolved';
        case 'emerging_strength': return 'Emerging strength';
        case 'consistent_strength': return 'Established strength';
    }
};
