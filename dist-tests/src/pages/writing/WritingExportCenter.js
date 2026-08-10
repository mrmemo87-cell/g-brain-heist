import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from 'react';
import { exportAdminCalibrationReport, exportStudentMonthlyWritingReport, getTeacherAttemptListScoped, getTeacherExportRowsScoped, getTeacherSavedReportsScoped, getTeacherWritingReport, saveTeacherReportScoped, } from '../../lib/brains_heist/writingIntegrationService.js';
import { humanizeWritingTag, openProfessionalWritingReport, } from '../../lib/brains_heist/writingReportDocument.js';
const EMPTY_DRAFT = {
    status: 'draft',
    strengths: '',
    growth_targets: '',
    next_steps: '',
    teacher_comment: '',
};
const parseList = (value) => value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
const formatScore = (score) => score == null || Number.isNaN(Number(score)) ? 'Not scored' : `${Number(score)}/20`;
const formatPeriod = (month) => {
    const [year, monthNumber] = month.split('-').map(Number);
    if (!year || !monthNumber)
        return month;
    return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
    });
};
const formatDate = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return 'Date unavailable';
    return parsed.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};
const getInitials = (name) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'ST';
const isUuid = (value) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()));
const renderExport = (doc) => (_jsxs("article", { className: "writing-export-document", children: [_jsx("h3", { children: doc.title }), _jsx("div", { dangerouslySetInnerHTML: { __html: doc.html } })] }));
const rubricItems = (report) => [
    { label: 'Content', score: report.rubric_scores?.content ?? null },
    { label: 'Purpose & audience', score: report.rubric_scores?.communicative_achievement ?? null },
    { label: 'Organisation', score: report.rubric_scores?.organisation ?? null },
    { label: 'Language', score: report.rubric_scores?.language ?? null },
];
const WritingEvidenceList = ({ attempts, selectedAttemptId, onSelect, }) => (_jsxs("div", { className: "writing-reports__attempt-list", children: [attempts.map((attempt) => {
            const score = Number(attempt.assessment?.['total_score']);
            const isSelected = selectedAttemptId === attempt.attempt_id;
            return (_jsxs("button", { type: "button", className: `writing-reports__attempt-card${isSelected ? ' is-selected' : ''}`, onClick: () => onSelect(attempt.attempt_id), "aria-pressed": isSelected, children: [_jsx("span", { className: "writing-reports__attempt-icon", children: "\uD83D\uDCDD" }), _jsxs("span", { children: [_jsx("strong", { children: attempt.attempt_type === 'initial_assessment' ? 'Baseline writing' : 'Writing submission' }), _jsxs("small", { children: [formatDate(attempt.created_at), " \u00B7 ", attempt.genre || 'Writing'] })] }), _jsx("b", { children: formatScore(Number.isFinite(score) ? score : null) })] }, attempt.attempt_id));
        }), attempts.length === 0 && (_jsx("div", { className: "writing-reports__empty-inline", children: "No writing evidence has been submitted for this student yet." }))] }));
export const WritingExportCenter = ({ mode, studentId, month = new Date().toISOString().slice(0, 7), isLoading = false, errorMessage, }) => {
    const [teacherRows, setTeacherRows] = useState(null);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [teacherSummaryReport, setTeacherSummaryReport] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [selectedAttemptId, setSelectedAttemptId] = useState('');
    const [savedReports, setSavedReports] = useState([]);
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [searchQuery, setSearchQuery] = useState('');
    const [teacherLoading, setTeacherLoading] = useState(false);
    const [teacherReportError, setTeacherReportError] = useState('');
    const [editorMessage, setEditorMessage] = useState('');
    const [showSubmission, setShowSubmission] = useState(false);
    const visibleRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query)
            return teacherRows ?? [];
        return (teacherRows ?? []).filter((row) => `${row.student_name} ${row.grade}`.toLowerCase().includes(query));
    }, [teacherRows, searchQuery]);
    const selectedAttempt = useMemo(() => attempts.find((attempt) => attempt.attempt_id === selectedAttemptId) ?? null, [attempts, selectedAttemptId]);
    const editedReport = useMemo(() => {
        if (!teacherSummaryReport)
            return null;
        const strengths = parseList(draft.strengths);
        const growthTargets = parseList(draft.growth_targets);
        const nextSteps = parseList(draft.next_steps);
        return {
            ...teacherSummaryReport,
            strengths: strengths.length ? strengths : teacherSummaryReport.strengths,
            priority_weak_areas: growthTargets.length
                ? growthTargets
                : teacherSummaryReport.priority_weak_areas,
            teacher_actions: nextSteps.length ? nextSteps : teacherSummaryReport.teacher_actions,
            student_friendly_summary: {
                ...teacherSummaryReport.student_friendly_summary,
                next_steps: nextSteps.length
                    ? nextSteps
                    : teacherSummaryReport.student_friendly_summary.next_steps,
            },
        };
    }, [teacherSummaryReport, draft.strengths, draft.growth_targets, draft.next_steps]);
    const exportCsv = () => {
        if (!teacherRows || typeof window === 'undefined')
            return;
        const escapeField = (value) => {
            const escaped = value.replace(/"/g, '""');
            return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
        };
        const header = 'student_name,student_id,grade,practice_completion,latest_formative_score';
        const lines = teacherRows.map((row) => [
            escapeField(row.student_name),
            escapeField(row.student_id),
            escapeField(String(row.grade)),
            escapeField(`${Math.round(row.completion_rate * 100)}%`),
            escapeField(row.latest_score == null ? '' : String(row.latest_score)),
        ].join(','));
        const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `writing-class-summary-${month}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
    const openReport = (audience) => {
        if (!editedReport)
            return;
        const opened = openProfessionalWritingReport(editedReport, {
            audience,
            teacherComment: draft.teacher_comment,
            reportStatus: draft.status,
        });
        if (!opened)
            setEditorMessage('Your browser blocked the report preview. Allow pop-ups and try again.');
    };
    const saveReport = (status) => {
        if (!selectedStudentId || !editedReport)
            return;
        setEditorMessage(status === 'final' ? 'Finalizing report…' : 'Saving draft…');
        void saveTeacherReportScoped({
            report_id: draft.id,
            student_id: selectedStudentId,
            mode: 'student',
            month,
            genre: editedReport.genre,
            status,
            teacher_comment: draft.teacher_comment,
            report_payload: {
                title: 'Writing Progress Report',
                strengths: editedReport.strengths,
                recurring_weaknesses: editedReport.priority_weak_areas,
                teacher_recommendations: editedReport.teacher_actions,
            },
        }).then((result) => {
            if (!result.ok || !result.data) {
                setEditorMessage(result.error ?? 'The report could not be saved. Please try again.');
                return;
            }
            setDraft((current) => ({
                ...current,
                id: result.data?.id,
                status: result.data?.status ?? status,
            }));
            setEditorMessage(status === 'final' ? 'Report finalized and ready to share.' : 'Draft saved.');
            void getTeacherSavedReportsScoped({ student_id: selectedStudentId }).then((savedResult) => {
                if (savedResult.ok && savedResult.data)
                    setSavedReports(savedResult.data);
            });
        });
    };
    const loadSavedReport = (saved) => {
        const payload = saved.report_payload ?? {};
        setDraft({
            id: saved.id,
            status: saved.status,
            strengths: (payload['strengths'] ?? []).join('\n'),
            growth_targets: (payload['recurring_weaknesses'] ?? []).join('\n'),
            next_steps: (payload['teacher_recommendations'] ?? []).join('\n'),
            teacher_comment: saved.teacher_comment ?? '',
        });
        setEditorMessage(`${saved.status === 'final' ? 'Final' : 'Draft'} report from ${formatDate(saved.updated_at)} loaded.`);
    };
    useEffect(() => {
        let cancelled = false;
        if (mode !== 'teacher')
            return;
        setTeacherLoading(true);
        setTeacherReportError('');
        const request = studentId
            ? getTeacherWritingReport({ student_id: studentId, month, include_snippet: false })
            : getTeacherExportRowsScoped(month);
        void request
            .then((result) => {
            if (cancelled)
                return;
            if (!result.ok || !result.data) {
                setTeacherReportError('Writing reports could not be loaded. Please refresh and try again.');
                return;
            }
            if (studentId) {
                setTeacherRows(null);
                setTeacherSummaryReport(result.data);
                setSelectedStudentId(studentId);
            }
            else {
                const rows = result.data;
                setTeacherRows(rows);
                setSelectedStudentId((current) => current || rows[0]?.student_id || '');
            }
        })
            .catch(() => {
            if (!cancelled)
                setTeacherReportError('Writing reports could not be loaded. Please refresh and try again.');
        })
            .finally(() => {
            if (!cancelled)
                setTeacherLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [mode, studentId, month]);
    useEffect(() => {
        if (mode !== 'teacher' || !selectedStudentId)
            return;
        if (!isUuid(selectedStudentId)) {
            setTeacherReportError('This student record needs refreshing. Ask your school administrator to check the student profile.');
            return;
        }
        let cancelled = false;
        setTeacherLoading(true);
        setTeacherReportError('');
        setEditorMessage('');
        setShowSubmission(false);
        setDraft(EMPTY_DRAFT);
        void Promise.all([
            getTeacherWritingReport({ student_id: selectedStudentId, month, include_snippet: true }),
            getTeacherAttemptListScoped({ student_id: selectedStudentId, limit: 30 }),
            getTeacherSavedReportsScoped({ student_id: selectedStudentId }),
        ]).then(([summaryResult, attemptsResult, savedResult]) => {
            if (cancelled)
                return;
            if (!summaryResult.ok || !summaryResult.data) {
                setTeacherSummaryReport(null);
                setTeacherReportError('This student does not have enough writing data for a report yet.');
                return;
            }
            const report = summaryResult.data;
            setTeacherSummaryReport(report);
            setDraft({
                status: 'draft',
                strengths: report.strengths.join('\n'),
                growth_targets: report.priority_weak_areas.map(humanizeWritingTag).join('\n'),
                next_steps: report.teacher_actions.join('\n'),
                teacher_comment: '',
            });
            const attemptRows = attemptsResult.ok && attemptsResult.data ? attemptsResult.data : [];
            setAttempts(attemptRows);
            setSelectedAttemptId(attemptRows[0]?.attempt_id ?? '');
            setSavedReports(savedResult.ok && savedResult.data ? savedResult.data : []);
        }).finally(() => {
            if (!cancelled)
                setTeacherLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [mode, selectedStudentId, month]);
    if (isLoading) {
        return _jsx("div", { className: "writing-reports__state", children: "Loading Writing Reports\u2026" });
    }
    if (errorMessage) {
        return _jsx("div", { className: "writing-reports__state writing-reports__state--error", children: "Writing Reports could not be opened. Please try again." });
    }
    if (mode === 'teacher') {
        const summary = teacherSummaryReport?.overall_summary;
        const reportedSubmissions = summary?.submission_count ?? 0;
        const submissions = Math.max(reportedSubmissions, summary?.latest_score != null ? 1 : 0);
        const practiceCompleted = summary?.practice_completed_count ?? summary?.completed_tasks ?? 0;
        const practiceAssigned = summary?.practice_assigned_count ?? summary?.total_tasks ?? 0;
        const scoreTrend = summary?.score_trend_delta;
        const trendLabel = submissions < 2
            ? 'Baseline only'
            : scoreTrend == null
                ? 'No comparable trend'
                : scoreTrend > 0
                    ? `Improved by ${scoreTrend}`
                    : scoreTrend < 0
                        ? `Down by ${Math.abs(scoreTrend)}`
                        : 'Holding steady';
        const reportStage = submissions === 0
            ? { label: 'No writing yet', tone: 'empty', copy: 'Ask the student to complete their first writing task.' }
            : submissions === 1
                ? { label: 'Baseline ready', tone: 'baseline', copy: 'This is a starting point. A trend appears after another comparable submission.' }
                : { label: 'Progress report ready', tone: 'ready', copy: 'There is enough evidence to discuss progress and agree on next steps.' };
        const integrityLabel = teacherSummaryReport?.integrity?.review_status === 'review_recommended'
            ? 'Review the writing process before sharing this score.'
            : teacherSummaryReport?.integrity?.review_status === 'no_concerns_observed'
                ? 'No writing-process concerns were observed.'
                : 'Practice mode: the score supports learning but does not verify authorship.';
        return (_jsxs("main", { className: "writing-reports", children: [_jsxs("header", { className: "writing-reports__header", children: [_jsxs("div", { children: [_jsx("span", { className: "writing-reports__eyebrow", children: "Writing Hub \u00B7 Reports" }), _jsx("h2", { children: "Turn writing evidence into a clear conversation" }), _jsx("p", { children: "Choose a student, check the learning story, add your professional comment, then print a school-ready report." })] }), _jsxs("div", { className: "writing-reports__period", children: [_jsx("span", { children: "Reporting period" }), _jsx("strong", { children: formatPeriod(month) })] })] }), _jsxs("ol", { className: "writing-reports__steps", "aria-label": "Report workflow", children: [_jsxs("li", { className: selectedStudentId ? 'is-complete' : 'is-current', children: [_jsx("b", { children: "1" }), _jsxs("span", { children: [_jsx("strong", { children: "Choose" }), _jsx("small", { children: "Select a student" })] })] }), _jsxs("li", { className: teacherSummaryReport ? 'is-complete' : selectedStudentId ? 'is-current' : '', children: [_jsx("b", { children: "2" }), _jsxs("span", { children: [_jsx("strong", { children: "Review" }), _jsx("small", { children: "Understand the evidence" })] })] }), _jsxs("li", { className: teacherSummaryReport ? 'is-current' : '', children: [_jsx("b", { children: "3" }), _jsxs("span", { children: [_jsx("strong", { children: "Share" }), _jsx("small", { children: "Comment and print" })] })] })] }), teacherRows && (_jsxs("section", { className: "writing-reports__picker", "aria-labelledby": "writing-student-picker-title", children: [_jsxs("div", { className: "writing-reports__section-heading", children: [_jsxs("div", { children: [_jsx("span", { children: "Step 1" }), _jsx("h3", { id: "writing-student-picker-title", children: "Choose a student" })] }), _jsx("button", { type: "button", className: "writing-reports__button writing-reports__button--quiet", onClick: exportCsv, children: "Export class summary" })] }), _jsxs("label", { className: "writing-reports__search", children: [_jsx("span", { children: "Search by student name or grade" }), _jsx("input", { value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: "Start typing a student name\u2026" })] }), _jsxs("div", { className: "writing-reports__student-list", children: [visibleRows.map((row) => (_jsxs("button", { type: "button", className: `writing-reports__student-card${row.student_id === selectedStudentId ? ' is-selected' : ''}`, onClick: () => setSelectedStudentId(row.student_id), "aria-pressed": row.student_id === selectedStudentId, children: [_jsx("span", { className: "writing-reports__avatar", children: getInitials(row.student_name) }), _jsxs("span", { children: [_jsx("strong", { children: row.student_name }), _jsxs("small", { children: ["Grade ", row.grade, " \u00B7 ", formatScore(row.latest_score)] })] }), _jsx("i", { "aria-hidden": "true", children: "\u2192" })] }, row.student_id))), visibleRows.length === 0 && _jsx("div", { className: "writing-reports__empty-inline", children: "No students match that search." })] })] })), teacherReportError && (_jsx("div", { className: "writing-reports__state writing-reports__state--error", role: "alert", children: teacherReportError })), teacherLoading && selectedStudentId && (_jsx("div", { className: "writing-reports__state", "aria-live": "polite", children: "Building the student\u2019s writing story\u2026" })), teacherSummaryReport && !teacherLoading && (_jsxs(_Fragment, { children: [_jsxs("section", { className: "writing-reports__overview", "aria-labelledby": "writing-report-overview-title", children: [_jsxs("div", { className: "writing-reports__student-hero", children: [_jsx("span", { className: "writing-reports__avatar writing-reports__avatar--large", children: getInitials(teacherSummaryReport.student.student_name) }), _jsxs("div", { children: [_jsx("span", { children: "Student writing story" }), _jsx("h3", { id: "writing-report-overview-title", children: teacherSummaryReport.student.student_name }), _jsxs("p", { children: ["Grade ", teacherSummaryReport.student.grade ?? '—', " \u00B7 ", teacherSummaryReport.student.class_name, ' · ', teacherSummaryReport.genre] })] }), _jsx("span", { className: `writing-reports__readiness writing-reports__readiness--${reportStage.tone}`, children: reportStage.label })] }), _jsxs("div", { className: "writing-reports__guidance", children: [_jsx("strong", { children: "What this report means" }), _jsx("span", { children: reportStage.copy })] }), _jsxs("div", { className: "writing-reports__metrics", children: [_jsxs("article", { children: [_jsx("span", { children: "Formative estimate" }), _jsx("strong", { children: formatScore(summary?.latest_score) }), _jsx("small", { children: "Use with teacher judgement" })] }), _jsxs("article", { children: [_jsx("span", { children: "Writing evidence" }), _jsx("strong", { children: submissions }), _jsx("small", { children: submissions === 1 ? 'submission' : 'submissions' })] }), _jsxs("article", { children: [_jsx("span", { children: "Practice plan" }), _jsx("strong", { children: practiceAssigned ? `${practiceCompleted}/${practiceAssigned}` : 'Not assigned' }), _jsx("small", { children: practiceAssigned ? 'tasks completed' : 'No practice tasks yet' })] }), _jsxs("article", { children: [_jsx("span", { children: "Progress trend" }), _jsx("strong", { children: trendLabel }), _jsx("small", { children: submissions < 2 ? 'Needs another submission' : 'Compared with the baseline' })] })] }), _jsxs("div", { className: "writing-reports__learning-grid", children: [_jsxs("article", { className: "writing-reports__learning-card writing-reports__learning-card--strength", children: [_jsx("span", { children: "\u2713" }), _jsxs("div", { children: [_jsx("h4", { children: "What the student is doing well" }), _jsx("ul", { children: (editedReport?.strengths.length ? editedReport.strengths : ['Strengths will appear after a complete writing submission.'])
                                                                .slice(0, 3)
                                                                .map((item) => _jsx("li", { children: item }, item)) })] })] }), _jsxs("article", { className: "writing-reports__learning-card writing-reports__learning-card--growth", children: [_jsx("span", { children: "\u2191" }), _jsxs("div", { children: [_jsx("h4", { children: "Best focus for the next lesson" }), _jsx("ul", { children: (editedReport?.priority_weak_areas.length
                                                                ? editedReport.priority_weak_areas.map(humanizeWritingTag)
                                                                : ['A focused growth target will appear when enough evidence is available.'])
                                                                .slice(0, 3)
                                                                .map((item) => _jsx("li", { children: item }, item)) })] })] })] }), _jsxs("section", { className: "writing-reports__rubric", "aria-labelledby": "writing-rubric-title", children: [_jsxs("div", { children: [_jsx("span", { children: "Assessment snapshot" }), _jsx("h4", { id: "writing-rubric-title", children: "How the formative estimate was built" })] }), _jsx("div", { className: "writing-reports__rubric-grid", children: rubricItems(teacherSummaryReport).map((item) => {
                                                const score = item.score == null ? 0 : Math.max(0, Math.min(5, item.score));
                                                return (_jsxs("div", { children: [_jsxs("span", { children: [_jsx("b", { children: item.label }), _jsx("strong", { children: item.score == null ? '—' : `${score}/5` })] }), _jsx("i", { children: _jsx("em", { style: { width: `${(score / 5) * 100}%` } }) })] }, item.label));
                                            }) })] }), _jsxs("div", { className: "writing-reports__integrity", children: [_jsx("span", { "aria-hidden": "true", children: "\uD83D\uDEE1\uFE0F" }), _jsxs("div", { children: [_jsx("strong", { children: "Writing-process context" }), _jsx("p", { children: integrityLabel })] })] })] }), _jsxs("section", { className: "writing-reports__personalize", "aria-labelledby": "writing-personalize-title", children: [_jsxs("div", { className: "writing-reports__section-heading", children: [_jsxs("div", { children: [_jsx("span", { children: "Step 3" }), _jsx("h3", { id: "writing-personalize-title", children: "Make the report personal" }), _jsx("p", { children: "We prepared the learning points. Adjust only what you want families to see." })] }), _jsx("span", { className: `writing-reports__status writing-reports__status--${draft.status}`, children: draft.status === 'final' ? 'Final report' : 'Draft' })] }), _jsxs("div", { className: "writing-reports__editor-grid", children: [_jsxs("label", { children: [_jsx("span", { children: "Strengths" }), _jsx("small", { children: "One clear point per line" }), _jsx("textarea", { rows: 4, value: draft.strengths, onChange: (event) => setDraft((current) => ({ ...current, strengths: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "Next growth targets" }), _jsx("small", { children: "Use language a parent will understand" }), _jsx("textarea", { rows: 4, value: draft.growth_targets, onChange: (event) => setDraft((current) => ({ ...current, growth_targets: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "Recommended next steps" }), _jsx("small", { children: "Practical actions for school and home" }), _jsx("textarea", { rows: 4, value: draft.next_steps, onChange: (event) => setDraft((current) => ({ ...current, next_steps: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "Your professional comment" }), _jsx("small", { children: "This appears above your name in the printed report" }), _jsx("textarea", { maxLength: 600, rows: 4, value: draft.teacher_comment, onChange: (event) => setDraft((current) => ({ ...current, teacher_comment: event.target.value })), placeholder: "Add a short, encouraging comment\u2026" })] })] }), _jsxs("div", { className: "writing-reports__actions", children: [_jsx("button", { type: "button", className: "writing-reports__button writing-reports__button--primary", onClick: () => openReport('parent'), children: "Preview family report" }), _jsx("button", { type: "button", className: "writing-reports__button", onClick: () => openReport('teacher'), children: "Preview teacher report" }), _jsx("button", { type: "button", className: "writing-reports__button writing-reports__button--quiet", onClick: () => saveReport('draft'), children: "Save draft" }), _jsx("button", { type: "button", className: "writing-reports__button writing-reports__button--final", onClick: () => saveReport('final'), children: "Finalize report" })] }), _jsx("p", { className: "writing-reports__message", "aria-live": "polite", children: editorMessage })] }), _jsxs("details", { className: "writing-reports__evidence", children: [_jsxs("summary", { children: [_jsxs("span", { children: [_jsx("b", { children: "View writing evidence" }), _jsx("small", { children: "Submissions, prompts and rubric scores" })] }), _jsx("i", { "aria-hidden": "true", children: "\u2304" })] }), _jsxs("div", { className: "writing-reports__evidence-body", children: [_jsx(WritingEvidenceList, { attempts: attempts, selectedAttemptId: selectedAttemptId, onSelect: (attemptId) => {
                                                setSelectedAttemptId(attemptId);
                                                setShowSubmission(false);
                                            } }), selectedAttempt && (_jsxs("article", { className: "writing-reports__attempt-detail", children: [_jsx("span", { children: "Selected evidence" }), _jsx("h4", { children: selectedAttempt.prompt_text || 'Writing prompt unavailable' }), _jsx("div", { className: "writing-reports__attempt-rubric", children: Object.entries(selectedAttempt.assessment?.['subscores'] ?? {}).map(([key, value]) => (_jsxs("span", { children: [_jsx("b", { children: humanizeWritingTag(key) }), String(value), "/5"] }, key))) }), !showSubmission ? (_jsx("button", { type: "button", className: "writing-reports__button writing-reports__button--quiet", onClick: () => setShowSubmission(true), children: "Read student submission" })) : (_jsxs("div", { className: "writing-reports__submission", children: [_jsx("strong", { children: "Student submission" }), _jsx("p", { children: selectedAttempt.student_submission || 'No submission text is available.' })] }))] }))] })] }), savedReports.length > 0 && (_jsxs("details", { className: "writing-reports__evidence", children: [_jsxs("summary", { children: [_jsxs("span", { children: [_jsx("b", { children: "Saved reports" }), _jsxs("small", { children: [savedReports.length, " saved version", savedReports.length === 1 ? '' : 's'] })] }), _jsx("i", { "aria-hidden": "true", children: "\u2304" })] }), _jsx("div", { className: "writing-reports__saved-list", children: savedReports.map((saved) => (_jsxs("button", { type: "button", onClick: () => loadSavedReport(saved), children: [_jsxs("span", { children: [_jsx("strong", { children: saved.status === 'final' ? 'Final report' : 'Draft report' }), _jsx("small", { children: formatDate(saved.updated_at) })] }), _jsx("i", { "aria-hidden": "true", children: "Open" })] }, saved.id))) })] }))] }))] }));
    }
    const result = mode === 'student'
        ? studentId
            ? exportStudentMonthlyWritingReport(studentId, month)
            : { ok: false, error: 'studentId is required for student exports.' }
        : studentId
            ? exportAdminCalibrationReport(studentId, month)
            : { ok: false, error: 'studentId is required for admin exports.' };
    if (!result.ok || !result.data) {
        return _jsx("div", { className: "writing-reports__state", children: "No export data is available yet." });
    }
    return (_jsxs("div", { className: "writing-export-center", children: [_jsx("h2", { children: "Writing Export Center" }), renderExport(result.data)] }));
};
export default WritingExportCenter;
