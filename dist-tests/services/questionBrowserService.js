import { supabase } from './supabaseClient.js';
// Coalesce simultaneous readers without retaining question content or permissions
// across logins, allocation changes, or edits.
const inFlight = new Map();
export async function fetchQuestionPage(filters = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session)
        throw new Error('Please sign in to load questions.');
    const bounded = { ...filters, limit: Math.max(1, Math.min(filters.limit ?? 60, 100)) };
    const key = `${session.user.id}:${JSON.stringify(bounded)}`;
    const existing = inFlight.get(key);
    if (existing)
        return existing;
    const request = (async () => {
        const { data, error } = await supabase.rpc(filters.audience === 'student' ? 'rpc_student_question_browser' : 'rpc_teacher_question_browser', { p_filters: bounded });
        if (error)
            throw error;
        const metadata = new Map((data.metadata || []).map((item) => [item.questionId, item]));
        const questions = (data.questions || []).map((question) => {
            const item = metadata.get(question.id);
            return item ? { ...question, curriculum_strand: item.strand, curriculum_skill: item.skill,
                curriculum_subskill: item.subskill, curriculum_objective: item.objective,
                registry_mappings: item.registryMappings || [], eligible_grade_levels: item.eligibleGradeLevels || [],
                curriculum_review_status: item.reviewStatus } : question;
        });
        return { questions, hasMore: data.hasMore === true, nextCursor: data.nextCursor || null };
    })();
    inFlight.set(key, request);
    try {
        return await request;
    }
    finally {
        if (inFlight.get(key) === request)
            inFlight.delete(key);
    }
}
export async function fetchStudentQuestionSummary(search = '') {
    const { data, error } = await supabase.rpc('rpc_student_question_summary', { p_search: search || null });
    if (error)
        throw error;
    return data || [];
}
export async function fetchQuestionFacets(search = '', audience = 'teacher', grades) {
    if (audience === 'teacher') {
        const { data, error } = await supabase.rpc('rpc_teacher_question_facets', { p_search: search || null, p_grades: grades?.length ? grades : null });
        if (error)
            throw error;
        return data || [];
    }
    const rows = await fetchStudentQuestionSummary(search);
    const groups = new Map();
    rows.forEach((row) => {
        const key = `${row.pool}:${row.subject}:${row.topic}`;
        const previous = groups.get(key);
        groups.set(key, { ...row, count: (previous?.count || 0) + row.count });
    });
    return [...groups.values()];
}
// Full-set operations are explicit (print/use/rename a topic), never a browse prerequisite.
export async function fetchQuestionSet(filters) {
    const questions = new Map();
    let cursor = null;
    do {
        const page = await fetchQuestionPage({ ...filters, limit: 100, cursor });
        page.questions.forEach((question) => questions.set(question.id, question));
        cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor);
    return [...questions.values()];
}
