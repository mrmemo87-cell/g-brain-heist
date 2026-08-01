/**
 * Admission Hub Service
 * Handles all Supabase interactions for the admission testing system.
 * Uses the adm_* tables and rpc_adm_* RPCs created by ADM_SCHEMA_MIGRATION.sql / ADM_RPCS.sql.
 */
import { supabase } from './supabaseClient';
import { calculateDiagnosticBreakdown, calculatePlacementRecommendation, deriveAdmissionSubject } from '../src/lib/admissionPlacementIntelligence';
export const SUBJECT_META = {
    english: { label: 'English', icon: '📖', color: 'cyan', poolFile: 'english_stage9_pool.json', pools: { 7: 'english_stage7_pool.json', 8: 'english_stage8_pool.json', 9: 'english_stage9_pool.json' } },
    math: { label: 'Mathematics', icon: '🔢', color: 'violet', poolFile: 'math_stage9_pool.json' },
    maths: { label: 'Mathematics', icon: '🔢', color: 'violet', poolFile: 'math_stage9_pool.json' },
    science: { label: 'Science', icon: '🔬', color: 'emerald', poolFile: '' },
    chemistry: { label: 'Chemistry', icon: '⚗️', color: 'amber', poolFile: '' },
};
export const admissionSubjectLabel = (subject, formCode, contentVersion) => {
    const normalized = deriveAdmissionSubject(subject, formCode, contentVersion);
    if (normalized === 'math')
        return 'Maths';
    if (normalized === 'english')
        return 'English';
    if (normalized === 'science')
        return 'Science';
    return 'General';
};
export const buildAdmissionReportFormLabel = (formCode, grade, subject) => {
    const label = admissionSubjectLabel(subject, formCode);
    const codeGrade = Number(String(formCode || '').match(/(?:ENG|MAT|SCI|G|GRADE)(\d{1,2})/i)?.[1] || '');
    const inferredGrade = grade ?? (codeGrade || null);
    const gradeText = inferredGrade ? `Grade ${inferredGrade}` : 'Admission';
    return `${gradeText} ${label} Admission Test`;
};
const ACTIVITY_LABELS = {
    page_opened: 'Page opened',
    page_reopened: 'Page reopened',
    page_reload: 'Page refreshed/reloaded',
    tab_hidden: 'Candidate left the test page',
    tab_visible: 'Candidate returned to the test page',
    submit_clicked: 'Submit button clicked',
    submitted: 'Test submitted',
    submit_time_expired: 'Timer expired',
    auto_submit_repeated_page_exits: 'Test auto-submitted after repeated page exits',
};
const pluralTimes = (count) => `${count} time${count === 1 ? '' : 's'}`;
export function buildAdmissionActivityNotes(events = [], submittedAt) {
    const counts = new Map();
    for (const event of events)
        counts.set(event.event_type, (counts.get(event.event_type) || 0) + 1);
    const notes = [];
    const hasAutoSubmit = counts.has('auto_submit_repeated_page_exits');
    for (const type of ['page_opened', 'page_reopened', 'page_reload', 'tab_hidden', 'tab_visible', 'submit_clicked', 'submit_time_expired']) {
        const count = counts.get(type) || 0;
        if (count > 0)
            notes.push(`${ACTIVITY_LABELS[type]} ${pluralTimes(count)}`);
    }
    if (hasAutoSubmit)
        notes.push(ACTIVITY_LABELS['auto_submit_repeated_page_exits'] + '.');
    else if ((counts.get('submitted') || 0) > 0)
        notes.push(ACTIVITY_LABELS['submitted'] + '.');
    if (submittedAt)
        notes.push(`Submitted at ${new Date(submittedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    return [...new Set(notes)];
}
export function dedupeAdmissionFocusAreas(items = [], breakdown = [], weakestFirst = false) {
    const scoreBy = new Map(breakdown.map(r => [`${r.subject} ${r.skill}`.toLowerCase(), r.percentage]));
    const seen = new Set();
    const unique = items.filter(item => { const key = item.trim().toLowerCase(); if (!key || seen.has(key))
        return false; seen.add(key); return true; });
    if (!weakestFirst)
        return unique;
    return unique.sort((a, b) => (scoreBy.get(a.toLowerCase()) ?? 999) - (scoreBy.get(b.toLowerCase()) ?? 999));
}
export function isObjectiveAutoScoredAdmissionReport(report) {
    const manualTypes = new Set(['email_writing', 'essay_writing']);
    const openReviewTypes = new Set(['short_answer', 'structured']);
    return (report.answers ?? []).every(a => !manualTypes.has(a.question_type) && !openReviewTypes.has(a.question_type));
}
// ── Question Pool CRUD ──
export async function fetchQuestionPools(schoolId) {
    const { data, error } = await supabase
        .from('adm_question_pools')
        .select('*')
        .or(`school_id.eq.${schoolId},school_id.is.null,is_official.eq.true`)
        .order('is_official', { ascending: false })
        .order('stage', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
export async function createQuestionPool(pool) {
    const { data, error } = await supabase
        .from('adm_question_pools')
        .insert(pool)
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
// ── Question CRUD ──
export async function fetchQuestions(poolId) {
    const { data, error } = await supabase
        .from('adm_questions')
        .select('*, pool:adm_question_pools(is_official,is_locked,content_owner,content_version,external_id)')
        .eq('pool_id', poolId)
        .order('question_type')
        .order('difficulty');
    if (error)
        throw error;
    return data ?? [];
}
export async function bulkInsertQuestions(questions) {
    const { data, error } = await supabase
        .from('adm_questions')
        .insert(questions)
        .select('id');
    if (error)
        throw error;
    return data?.length ?? 0;
}
export async function updateQuestion(questionId, updates) {
    const { error } = await supabase
        .from('adm_questions')
        .update(updates)
        .eq('id', questionId);
    if (error)
        throw error;
}
export async function deleteQuestion(questionId) {
    const { error } = await supabase
        .from('adm_questions')
        .delete()
        .eq('id', questionId);
    if (error)
        throw error;
}
// ── Blueprint CRUD ──
export async function fetchBlueprints(schoolId) {
    const { data, error } = await supabase
        .from('adm_blueprints')
        .select('*')
        .or(`school_id.eq.${schoolId},school_id.is.null`)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
export async function createBlueprint(bp) {
    const { data, error } = await supabase
        .from('adm_blueprints')
        .insert(bp)
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
export async function updateBlueprint(bpId, updates) {
    const { error } = await supabase
        .from('adm_blueprints')
        .update(updates)
        .eq('id', bpId);
    if (error)
        throw error;
}
export async function deleteBlueprint(bpId) {
    const { error } = await supabase.from('adm_blueprints').delete().eq('id', bpId);
    if (error)
        throw error;
}
export async function deleteTestForm(formId) {
    // Delete form questions first
    await supabase.from('adm_test_form_questions').delete().eq('form_id', formId);
    const { error } = await supabase.from('adm_test_forms').delete().eq('id', formId);
    if (error)
        throw error;
}
export async function deleteCandidate(candidateId) {
    // Delete related answers, attempts first
    const { data: attemptIds } = await supabase.from('adm_attempts').select('id').eq('candidate_id', candidateId);
    if (attemptIds?.length) {
        for (const a of attemptIds) {
            await supabase.from('adm_answers').delete().eq('attempt_id', a.id);
        }
    }
    await supabase.from('adm_placement_results').delete().eq('candidate_id', candidateId);
    await supabase.from('adm_attempts').delete().eq('candidate_id', candidateId);
    const { error } = await supabase.from('adm_candidates').delete().eq('id', candidateId);
    if (error)
        throw error;
}
export async function deleteAttempt(attemptId) {
    await supabase.from('adm_answers').delete().eq('attempt_id', attemptId);
    await supabase.from('adm_placement_results').delete().eq('attempt_id', attemptId);
    const { error } = await supabase.from('adm_attempts').delete().eq('id', attemptId);
    if (error)
        throw error;
}
// ── Test Form CRUD + RPCs ──
export { CURRENT_ADMISSION_SUBJECTS, normalizeAdmissionSubjectKey, getAdmissionFormSubjectFromCode, getAdmissionFormGrade, getAdmissionFormSubject, isCurrentManagedAdmissionForm, getCurrentAdmissionPackageForms } from '../src/lib/admissionCurrentPackageForms';
export async function fetchTestForms(schoolId) {
    const { data, error } = await supabase
        .from('adm_test_forms')
        .select(`
      *,
      adm_test_form_questions(
        id,
        form_id,
        question_id,
        question:adm_questions(
          id,
          external_id,
          content_owner,
          content_version,
          pool:adm_question_pools(content_owner, content_version)
        )
      )
    `)
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
export async function generateTestForm(blueprintId, formCode) {
    const { data, error } = await supabase.rpc('rpc_adm_generate_test_form', {
        p_blueprint_id: blueprintId,
        p_form_code: formCode ?? null,
    });
    if (error)
        return { success: false, error: error.message };
    return data;
}
export async function publishForm(formId) {
    const { data, error } = await supabase.rpc('rpc_adm_publish_form', {
        p_form_id: formId,
    });
    if (error)
        return { success: false, error: error.message };
    return data;
}
export async function closeForm(formId) {
    const { data, error } = await supabase.rpc('rpc_adm_close_form', {
        p_form_id: formId,
    });
    if (error)
        return { success: false, error: error.message };
    return data;
}
// ── Candidate CRUD ──
export async function fetchCandidates(schoolId) {
    const { data, error } = await supabase
        .from('adm_candidates')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
export async function createCandidate(candidate) {
    const { data, error } = await supabase
        .from('adm_candidates')
        .insert(candidate)
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
export async function bulkCreateCandidates(candidates) {
    const { data, error } = await supabase
        .from('adm_candidates')
        .insert(candidates)
        .select();
    if (error)
        throw error;
    return data ?? [];
}
export async function updateCandidate(candidateId, updates) {
    const { error } = await supabase
        .from('adm_candidates')
        .update(updates)
        .eq('id', candidateId);
    if (error)
        throw error;
}
// ── Attempt / Report RPCs ──
export async function fetchAttempts(schoolId) {
    const { data, error } = await supabase
        .from('adm_attempts')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
const firstDefined = (...values) => values.find(v => v !== undefined && v !== null && v !== '');
export const resolveAdmissionReportCounts = (raw, answers) => {
    const answerCount = Array.isArray(answers) ? answers.length : 0;
    const maxScore = Number(firstDefined(raw?.max_score, raw?.maxScore, raw?.attempt?.max_score, raw?.attempt?.maxScore));
    const totalQuestions = Number(firstDefined(raw?.total_questions, raw?.totalQuestions, raw?.form?.total_questions, raw?.form?.totalQuestions, raw?.form?.question_count, raw?.form?.questionCount, Number.isFinite(maxScore) && maxScore > 0 ? maxScore : undefined, answerCount));
    const answeredCount = Number(firstDefined(raw?.answered_count, raw?.answeredCount, answerCount));
    return {
        answeredCount: Number.isFinite(answeredCount) && answeredCount >= 0 ? answeredCount : answerCount,
        totalQuestions: Number.isFinite(totalQuestions) && totalQuestions >= 0 ? totalQuestions : answerCount,
    };
};
const normalizeReportPayload = (raw, context = {}) => {
    const form = raw.form ?? raw.test_form ?? raw.adm_test_forms ?? {};
    const blueprint = raw.blueprint ?? raw.adm_blueprints ?? form.blueprint ?? {};
    const candidate = raw.candidate ?? raw.candidate_profile ?? context.candidate ?? {};
    const attempt = raw.attempt ?? context.attempt ?? {};
    const formCode = firstDefined(raw.form_code, raw.formCode, form.form_code, form.formCode, context.form_code);
    const contentVersion = firstDefined(raw.content_version, raw.contentVersion, blueprint.content_version, form.content_version, context.content_version);
    const formSubject = deriveAdmissionSubject(firstDefined(raw.form_subject, raw.formSubject, raw.subject, form.subject, blueprint.subject, context.form_subject), formCode, contentVersion);
    const grade = Number(firstDefined(raw.grade, raw.form_grade, raw.formGrade, candidate.applied_grade, context.grade, String(formCode || '').match(/(?:ENG|MAT|SCI|G|GRADE)(\d{1,2})/i)?.[1]) || '') || null;
    const formTitle = firstDefined(raw.form_title, raw.formTitle, form.form_title, form.form_label, blueprint.name, context.form_title) || buildAdmissionReportFormLabel(formCode, grade, formSubject);
    const normalizedAttempt = {
        ...attempt,
        status: firstDefined(attempt.status, raw.status),
        total_score: firstDefined(attempt.total_score, attempt.totalScore, raw.total_score, raw.totalScore),
        max_score: firstDefined(attempt.max_score, attempt.maxScore, raw.max_score, raw.maxScore),
        percentage: firstDefined(attempt.percentage, raw.percentage),
        started_at: firstDefined(attempt.started_at, attempt.startedAt, raw.started_at, raw.startedAt),
        submitted_at: firstDefined(attempt.submitted_at, attempt.submittedAt, raw.submitted_at, raw.submittedAt),
    };
    return { ...raw, candidate, attempt: normalizedAttempt, form_code: formCode ?? null, formCode: formCode ?? null, form_subject: formSubject, formSubject, subject: formSubject, grade, form_title: formTitle, formTitle, content_version: contentVersion ?? null };
};
export async function getCandidateReport(attemptId, context = {}) {
    const { data, error } = await supabase.rpc('rpc_adm_get_candidate_report', {
        p_attempt_id: attemptId,
    });
    if (error)
        throw error;
    if (!data)
        throw new Error('Report data unavailable');
    if (!data.success)
        throw new Error(data.error || 'Report data unavailable');
    // Transform RPC shape → CandidateReport shape
    const raw = normalizeReportPayload(data, context);
    if (import.meta.env?.DEV && (!raw.form_code || raw.subject === 'unknown')) {
        console.warn('Admission report metadata missing or ambiguous', {
            attempt_id: attemptId,
            keys: Object.keys(data),
            derived: { formCode: raw.form_code, formSubject: raw.form_subject, subject: raw.subject, title: raw.form_title },
        });
    }
    const answerRows = Array.isArray(raw.answers) ? raw.answers : [];
    const answers = answerRows.map((a) => ({
        id: a.id ?? a.answer_id ?? null,
        answer_id: a.answer_id ?? a.id ?? null,
        question_id: a.question_id,
        question_type: a.question_type ?? 'structured',
        stem: a.stem ?? a.prompt ?? 'Detailed question text unavailable',
        subject: admissionSubjectLabel(a.subject ?? raw.subject ?? raw.form_subject ?? null, raw.form_code ?? null, a.content_version ?? raw.content_version ?? null),
        topic: a.topic ?? a.strand ?? null,
        strand: a.strand ?? null,
        subskill: a.subskill ?? null,
        diagnostic_skill: a.diagnostic_skill ?? a.subskill ?? a.strand ?? null,
        skill_tag: a.skill_tag ?? null,
        difficulty: a.difficulty ?? null,
        grade_level: a.grade_level ?? null,
        stage_level: a.stage_level ?? null,
        form_code: raw.form_code ?? null,
        content_version: a.content_version ?? raw.content_version ?? null,
        response: a.response,
        correct_answer: a.correct_answer,
        is_correct: a.is_correct,
        marks_awarded: a.marks_awarded ?? 0,
        marks_possible: a.marks_possible ?? 0,
        explanation: a.explanation ?? null,
        options: a.options ?? null,
        ai_feedback: a.ai_feedback ?? null,
    }));
    const candidateProfile = raw.candidate ? {
        applied_grade: raw.candidate.applied_grade ?? null,
        current_grade: raw.candidate.current_grade ?? null,
        date_of_birth: raw.candidate.date_of_birth ?? null,
        previous_curriculum: raw.candidate.previous_curriculum ?? null,
        previous_school_language: raw.candidate.previous_school_language ?? null,
        home_language: raw.candidate.home_language ?? null,
        years_english_medium: raw.candidate.years_english_medium ?? null,
        admin_notes: raw.candidate.admin_notes ?? null,
    } : undefined;
    const reportSubject = raw.subject ?? raw.form_subject ?? answers[0]?.subject ?? null;
    const diagnosticAnswers = answers.map((answer) => ({ ...answer, subject: answer.subject ?? reportSubject, form_code: raw.form_code ?? null, content_version: answer.content_version ?? raw.content_version ?? null }));
    const diagnosticBreakdown = calculateDiagnosticBreakdown(diagnosticAnswers);
    const attemptPercentage = raw.attempt?.percentage ?? 0;
    const placementRecommendation = calculatePlacementRecommendation(candidateProfile, diagnosticAnswers, attemptPercentage);
    const { answeredCount, totalQuestions } = resolveAdmissionReportCounts(raw, answers);
    const totalScore = Number(raw.attempt?.total_score ?? 0);
    const answeredQuestionAccuracy = answeredCount > 0 ? Math.round((totalScore / answeredCount) * 100) : null;
    return {
        candidate_name: raw.candidate?.name ?? 'Unknown',
        form_code: raw.form_code ?? '',
        formCode: raw.form_code ?? '',
        formSubject: raw.form_subject ?? null,
        subject: reportSubject,
        formTitle: raw.form_title ?? buildAdmissionReportFormLabel(raw.form_code ?? '', raw.grade ?? raw.candidate?.applied_grade ?? null, reportSubject),
        grade: raw.grade ?? raw.candidate?.applied_grade ?? null,
        form_label: raw.form_title ?? buildAdmissionReportFormLabel(raw.form_code ?? '', raw.grade ?? raw.candidate?.applied_grade ?? null, reportSubject),
        total_score: raw.attempt?.total_score ?? 0,
        max_score: raw.attempt?.max_score ?? 0,
        percentage: attemptPercentage,
        band: raw.band ?? 'E',
        started_at: raw.attempt?.started_at ?? '',
        submitted_at: raw.attempt?.submitted_at ?? '',
        by_topic: (raw.topic_breakdown ?? []).map((t) => ({
            topic: t.topic,
            correct: t.correct,
            total: t.total,
            pct: t.percentage ?? t.pct ?? 0,
        })),
        by_type: (raw.type_breakdown ?? []).map((t) => ({
            question_type: t.type ?? t.question_type,
            correct: t.correct,
            total: t.total,
            pct: t.max_marks ? Math.round((t.marks / t.max_marks) * 100) : 0,
        })),
        strengths: dedupeAdmissionFocusAreas(raw.strengths ?? placementRecommendation.strengths ?? [], diagnosticBreakdown),
        weaknesses: dedupeAdmissionFocusAreas(raw.weaknesses ?? placementRecommendation.weakAreas ?? [], diagnosticBreakdown, true),
        answers,
        ai_summary: raw.ai_summary ?? null,
        candidate_profile: candidateProfile,
        diagnostic_breakdown: diagnosticBreakdown,
        placement_recommendation: placementRecommendation,
        skill_breakdown: raw.skill_breakdown ?? [],
        difficulty_breakdown: raw.difficulty_breakdown ?? [],
        activity_notes: raw.activity_notes ?? [],
        activity_events: Array.isArray(raw.activity_events) ? raw.activity_events : [],
        answer_details_available: raw.answer_details_available ?? raw.answerDetailsAvailable ?? true,
        answer_detail_message: raw.answer_detail_message ?? raw.answerDetailMessage ?? null,
        answered_count: answeredCount,
        total_questions: totalQuestions,
        partial_attempt: answeredCount < totalQuestions,
        answered_question_accuracy: answeredQuestionAccuracy,
    };
}
export async function getAttemptActivity(attemptId) {
    const { data, error } = await supabase.rpc('rpc_adm_get_attempt_activity', { p_attempt_id: attemptId });
    if (error)
        throw error;
    if (!data || !data.success)
        return { notes: [], events: [] };
    const events = data.events ?? [];
    return { notes: buildAdmissionActivityNotes(events, data.submitted_at), events };
}
export async function resetAttemptForRetake(attemptId, reason) {
    const { data, error } = await supabase.rpc('rpc_adm_reset_attempt_for_retake', { p_attempt_id: attemptId, p_reason: reason });
    if (error)
        throw error;
    return data;
}
// ── Placement ──
export async function fetchPlacementResults(schoolId) {
    const { data, error } = await supabase
        .from('adm_placement_results')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
export async function recordPlacement(attemptId, band, stage, grade, notes) {
    const { data, error } = await supabase.rpc('rpc_adm_record_placement', {
        p_attempt_id: attemptId,
        p_band: band,
        p_recommended_stage: stage,
        p_recommended_grade: grade,
        p_notes: notes,
    });
    if (error)
        return { success: false, error: error.message };
    return data;
}
// ── Grade-Stage Mapping ──
export async function fetchGradeStageMap(schoolId) {
    const { data, error } = await supabase
        .from('adm_school_grade_stage_map')
        .select('*')
        .eq('school_id', schoolId)
        .order('grade_level');
    if (error)
        throw error;
    return data ?? [];
}
export async function upsertGradeStageMap(mapping) {
    const { error } = await supabase
        .from('adm_school_grade_stage_map')
        .upsert(mapping, { onConflict: 'school_id,grade_level,subject' });
    if (error)
        throw error;
}
// ── Entitlement check ──
export async function checkAdmissionEntitlement() {
    const { data, error } = await supabase.rpc('rpc_adm_check_entitlement');
    if (error)
        return { allowed: false, reason: error.message };
    return data;
}
export async function consumeAdmissionQuota() {
    const { data, error } = await supabase.rpc('rpc_adm_consume_quota');
    if (error)
        return { success: false, error: error.message };
    return data;
}
// ── Import staging ──
export async function fetchImportStaging(schoolId, batchRef) {
    let query = supabase
        .from('adm_import_staging')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(200);
    if (batchRef)
        query = query.eq('batch_ref', batchRef);
    const { data, error } = await query;
    if (error)
        throw error;
    return data ?? [];
}
// ── Audit log ──
export async function fetchAuditLog(schoolId, limit = 50) {
    const { data, error } = await supabase
        .from('adm_audit_log')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error)
        throw error;
    return data ?? [];
}
// ── Utility: generate a token-based test link ──
export function buildTestLink(baseUrl, token, formCode) {
    return `${baseUrl}/admission-tests/admission-test.html?token=${encodeURIComponent(token)}&form=${encodeURIComponent(formCode)}`;
}
// ── Pool JSON loader (offline mode / demo) ──
export async function loadPoolFromJson(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to load pool: ${res.statusText}`);
    return res.json();
}
