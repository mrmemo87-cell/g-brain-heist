import { supabase } from './supabaseClient.js';
import { userFacingError } from './userFacingError.js';
export const fetchDiagnosticComposerCapabilities = async (schoolId, groupId) => {
    const { data, error } = await supabase.rpc('rpc_teacher_diagnostic_composer', {
        p_school_id: schoolId,
        p_group_id: groupId,
    });
    if (error) {
        throw userFacingError(error, 'Diagnostic options could not be loaded.');
    }
    const result = data;
    if (!result || result.success !== true || typeof result.ready !== 'boolean'
        || result.group?.id !== groupId || !Array.isArray(result.depths)
        || result.depths.some((depth) => !depth || ![10, 20, 30, 40].includes(depth.questionCount)
            || typeof depth.available !== 'boolean')
        || (result.ready && !result.depths.some((depth) => depth.available))) {
        throw new Error('Diagnostic availability could not be verified. Please retry the check.');
    }
    return result;
};
export const composeDiagnostic = async (schoolId, groupId, questionCount) => {
    const { data, error } = await supabase.rpc('rpc_teacher_compose_diagnostic', {
        p_school_id: schoolId,
        p_group_id: groupId,
        p_question_count: questionCount,
    });
    if (error) {
        throw userFacingError(error, 'The diagnostic could not be prepared.');
    }
    const result = data;
    const ids = result?.questionIds;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!result || result.success !== true || result.groupId !== groupId
        || result.questionCount !== questionCount || ![10, 20, 30, 40].includes(questionCount)
        || !Array.isArray(ids) || ids.length !== questionCount
        || ids.some((id) => typeof id !== 'string' || !uuid.test(id))
        || new Set(ids).size !== questionCount
        || !result.schoolSubjectName?.trim() || !result.academicSubjectId
        || !result.gradeLevel || !result.defaultTitle?.trim()) {
        throw new Error('The complete diagnostic question set could not be verified. Please prepare it again.');
    }
    return result;
};
