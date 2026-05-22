import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { exportAdminCalibrationReport, exportStudentMonthlyWritingReport, getTeacherAttemptListScoped, getTeacherAttemptReportScoped, getTeacherExportRowsScoped, getTeacherGeneralReportScoped, getTeacherSavedReportsScoped, getTeacherWritingReport, saveTeacherReportScoped, } from '../../lib/brains_heist/writingIntegrationService.js';
const EMPTY_DRAFT = {
    mode: 'student',
    status: 'draft',
    title: '',
    overall_performance: '',
    strengths: '',
    recurring_weaknesses: '',
    trend_progress: '',
    teacher_recommendations: '',
    prompt: '',
    submission_text: '',
    evaluation_breakdown: '',
    precise_issues: '',
    suggested_next_action: '',
    comparison_to_previous: '',
    teacher_comment: '',
};
const renderExport = (doc) => (_jsxs("article", { style: { border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0f172a', display: 'grid', gap: 8 }, children: [_jsx("h3", { style: { margin: 0 }, children: doc.title }), _jsxs("div", { style: { fontSize: 12, opacity: 0.85 }, children: ["Generated: ", doc.generated_at] }), _jsx("div", { dangerouslySetInnerHTML: { __html: doc.html } }), _jsxs("details", { children: [_jsx("summary", { children: "PDF-ready structure" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontSize: 12 }, children: JSON.stringify(doc.pdf_ready, null, 2) })] })] }));
const renderTeacherSummary = (report) => (_jsxs("article", { style: { border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0f172a', display: 'grid', gap: 8 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Teacher Writing Report" }), _jsxs("div", { style: { fontSize: 12, opacity: 0.85 }, children: ["Generated: ", report.generated_at] }), _jsxs("section", { children: [_jsx("strong", { children: report.student.student_name }), " \u00B7 Grade ", report.student.grade ?? '—', " \u00B7 ", report.student.class_name] }), _jsxs("section", { children: [_jsx("strong", { children: "Reporting period:" }), " ", report.period, " \u00B7 ", _jsx("strong", { children: "Genre:" }), " ", report.genre] }), _jsxs("section", { children: [_jsx("strong", { children: "Overall performance" }), _jsxs("div", { children: ["Latest score: ", report.overall_summary.latest_score ?? '—'] }), _jsxs("div", { children: ["Trend delta: ", report.overall_summary.score_trend_delta ?? '—'] }), _jsxs("div", { children: ["Completion: ", report.overall_summary.completed_tasks, "/", report.overall_summary.total_tasks, " (", report.overall_summary.completion_rate_percent, "%)"] })] }), _jsxs("section", { children: [_jsx("strong", { children: "Main strengths" }), _jsx("ul", { children: (report.strengths.length ? report.strengths : ['No strengths captured yet.']).map((item) => _jsx("li", { children: item }, item)) })] }), _jsxs("section", { children: [_jsx("strong", { children: "Priority weak areas" }), _jsx("ul", { children: (report.priority_weak_areas.length ? report.priority_weak_areas : ['No priority weaknesses captured yet.']).map((item) => _jsx("li", { children: item }, item)) })] }), _jsxs("section", { children: [_jsx("strong", { children: "Teacher actions" }), _jsx("ul", { children: (report.teacher_actions.length ? report.teacher_actions : ['No actions generated yet.']).map((item) => _jsx("li", { children: item }, item)) })] })] }));
const parseList = (value) => value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
const isUuid = (value) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()));
const formatScore = (score) => {
    if (score == null || Number.isNaN(score))
        return '—';
    return `${score}/20`;
};
export const WritingExportCenter = ({ mode, studentId, month = new Date().toISOString().slice(0, 7), isLoading = false, errorMessage, }) => {
    const [teacherSummaryReport, setTeacherSummaryReport] = useState(null);
    const [teacherRows, setTeacherRows] = useState(null);
    const [teacherReportError, setTeacherReportError] = useState('');
    const [teacherLoading, setTeacherLoading] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [attempts, setAttempts] = useState([]);
    const [selectedAttemptId, setSelectedAttemptId] = useState('');
    const [attemptReport, setAttemptReport] = useState(null);
    const [generalReport, setGeneralReport] = useState(null);
    const [savedReports, setSavedReports] = useState([]);
    const [editor, setEditor] = useState(EMPTY_DRAFT);
    const [editorMessage, setEditorMessage] = useState('');
    const [showAttemptSubmissionText, setShowAttemptSubmissionText] = useState(false);
    const visibleRows = useMemo(() => (teacherRows ?? []).filter((row) => !searchQuery || row.student_name.toLowerCase().includes(searchQuery.toLowerCase()) || row.student_id.toLowerCase().includes(searchQuery.toLowerCase())), [teacherRows, searchQuery]);
    const selectedAttempt = attempts.find((item) => item.attempt_id === selectedAttemptId) ?? null;
    const escapeCsvField = (value) => {
        const escaped = value.replace(/"/g, '""');
        return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    };
    const exportCsv = () => {
        if (!teacherRows || typeof window === 'undefined')
            return;
        const header = 'student_name,student_id,grade,completion_rate,latest_score';
        const lines = teacherRows.map((row) => {
            const completion = `${Math.round(row.completion_rate * 100)}%`;
            return [
                escapeCsvField(row.student_name),
                escapeCsvField(row.student_id),
                escapeCsvField(String(row.grade)),
                escapeCsvField(completion),
                escapeCsvField(row.latest_score == null ? '' : String(row.latest_score)),
            ].join(',');
        });
        const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `writing-export-${month}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
    const exportEditorAsText = () => {
        if (typeof window === 'undefined')
            return;
        const content = [
            `Mode: ${editor.mode}`,
            `Status: ${editor.status}`,
            `Title: ${editor.title}`,
            `Overall performance: ${editor.overall_performance}`,
            `Strengths: ${editor.strengths}`,
            `Recurring weaknesses: ${editor.recurring_weaknesses}`,
            `Trend/progress: ${editor.trend_progress}`,
            `Teacher recommendations: ${editor.teacher_recommendations}`,
            `Prompt: ${editor.prompt}`,
            `Submission text:\n${editor.submission_text}`,
            `Evaluation breakdown: ${editor.evaluation_breakdown}`,
            `Precise issues: ${editor.precise_issues}`,
            `Suggested next action: ${editor.suggested_next_action}`,
            `Comparison to previous: ${editor.comparison_to_previous}`,
            `Teacher comment: ${editor.teacher_comment}`,
        ].join('\n\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `teacher-writing-report-${selectedStudentId || 'student'}-${selectedAttemptId || 'student'}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
    const loadSavedReports = (targetStudentId, targetAttemptId, targetMode) => {
        void getTeacherSavedReportsScoped({ student_id: targetStudentId, attempt_id: targetAttemptId, mode: targetMode }).then((result) => {
            if (!result.ok || !result.data)
                return;
            setSavedReports(result.data);
        });
    };
    const hydrateEditorFromGeneral = (payload) => {
        const report = payload['report'] ?? {};
        const summary = report['overall_summary'] ?? {};
        setEditor((prev) => ({
            ...prev,
            mode: 'student',
            title: 'Student-level Writing Report',
            overall_performance: `Latest score: ${summary['latest_score'] ?? '—'}, trend delta: ${summary['score_trend_delta'] ?? '—'}, completion: ${summary['completion_rate_percent'] ?? '—'}%`,
            strengths: (report['strengths'] ?? []).join('\n'),
            recurring_weaknesses: (report['repeated_error_patterns'] ?? []).join('\n'),
            trend_progress: String((report['student_friendly_summary']?.['progress_summary'] ?? '')),
            teacher_recommendations: (report['teacher_actions'] ?? []).join('\n'),
        }));
    };
    const hydrateEditorFromAttempt = (payload) => {
        const attempt = payload['attempt'] ?? {};
        const previousAttempt = payload['previous_attempt'] ?? {};
        setEditor((prev) => ({
            ...prev,
            mode: 'attempt',
            title: 'Attempt-level Writing Report',
            prompt: String(attempt['prompt_text'] ?? ''),
            submission_text: String(attempt['student_submission'] ?? ''),
            evaluation_breakdown: JSON.stringify(attempt['assessment'] ?? {}, null, 2),
            precise_issues: (payload['precise_issues'] ?? []).join('\n'),
            suggested_next_action: String(payload['suggested_next_action'] ?? ''),
            comparison_to_previous: previousAttempt && Object.keys(previousAttempt).length > 0
                ? `Previous score: ${String(previousAttempt['assessment']?.['total_score'] ?? '—')}`
                : 'No previous attempt found for comparison.',
        }));
    };
    const saveEditorReport = (status) => {
        if (!selectedStudentId)
            return;
        setEditorMessage('Saving report…');
        void saveTeacherReportScoped({
            report_id: editor.id,
            student_id: selectedStudentId,
            attempt_id: editor.mode === 'attempt' ? selectedAttemptId || undefined : undefined,
            mode: editor.mode,
            month,
            genre: selectedAttempt?.genre ?? undefined,
            status,
            teacher_comment: editor.teacher_comment,
            report_payload: {
                title: editor.title,
                overall_performance: editor.overall_performance,
                strengths: parseList(editor.strengths),
                recurring_weaknesses: parseList(editor.recurring_weaknesses),
                trend_progress: editor.trend_progress,
                teacher_recommendations: parseList(editor.teacher_recommendations),
                prompt: editor.prompt,
                submission_text: editor.submission_text,
                evaluation_breakdown: editor.evaluation_breakdown,
                precise_issues: parseList(editor.precise_issues),
                suggested_next_action: editor.suggested_next_action,
                comparison_to_previous: editor.comparison_to_previous,
            },
        }).then((result) => {
            if (!result.ok || !result.data) {
                setEditorMessage(result.error ?? 'Unable to save report.');
                return;
            }
            const saved = result.data;
            setEditor((prev) => ({ ...prev, id: saved.id, status: saved.status }));
            setEditorMessage(`Saved ${saved.status} report at ${saved.updated_at}.`);
            loadSavedReports(selectedStudentId, editor.mode === 'attempt' ? selectedAttemptId : undefined, editor.mode);
        });
    };
    useEffect(() => {
        let cancelled = false;
        if (mode !== 'teacher') {
            setTeacherSummaryReport(null);
            setTeacherRows(null);
            setTeacherReportError('');
            setTeacherLoading(false);
            setSelectedStudentId('');
            setAttempts([]);
            setSelectedAttemptId('');
            setAttemptReport(null);
            setGeneralReport(null);
            setSavedReports([]);
            setEditor(EMPTY_DRAFT);
            return;
        }
        setTeacherLoading(true);
        setTeacherReportError('');
        const task = studentId
            ? getTeacherWritingReport({ student_id: studentId, month, include_snippet: false })
            : getTeacherExportRowsScoped(month);
        void task
            .then((result) => {
            if (cancelled)
                return;
            if (!result.ok || !result.data) {
                setTeacherSummaryReport(null);
                setTeacherRows(null);
                setTeacherReportError(result.error ?? 'Unable to generate teacher report.');
                return;
            }
            if (studentId) {
                setTeacherSummaryReport(result.data);
                setTeacherRows(null);
                setSelectedStudentId(studentId);
            }
            else {
                const rows = result.data;
                setTeacherRows(rows);
                setTeacherSummaryReport(null);
                setSelectedStudentId(rows[0]?.student_id ?? '');
            }
        })
            .catch((err) => {
            if (!cancelled)
                setTeacherReportError(err instanceof Error ? err.message : 'Unable to generate teacher report.');
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
            setTeacherReportError(`Selected student reference "${selectedStudentId}" is not a valid UUID yet. Please refresh writing data or run migration 20260417183000.`);
            return;
        }
        let cancelled = false;
        setTeacherLoading(true);
        setEditor(EMPTY_DRAFT);
        setEditorMessage('');
        void Promise.all([
            getTeacherWritingReport({ student_id: selectedStudentId, month, include_snippet: true }),
            getTeacherAttemptListScoped({ student_id: selectedStudentId, limit: 80 }),
            getTeacherGeneralReportScoped({ student_id: selectedStudentId, month }),
            getTeacherSavedReportsScoped({ student_id: selectedStudentId }),
        ]).then(([summaryRes, attemptsRes, generalRes, savedRes]) => {
            if (cancelled)
                return;
            if (summaryRes.ok && summaryRes.data)
                setTeacherSummaryReport(summaryRes.data);
            if (attemptsRes.ok && attemptsRes.data) {
                setAttempts(attemptsRes.data);
                setSelectedAttemptId(attemptsRes.data[0]?.attempt_id ?? '');
            }
            else {
                setAttempts([]);
                setSelectedAttemptId('');
            }
            if (generalRes.ok && generalRes.data) {
                setGeneralReport(generalRes.data);
                hydrateEditorFromGeneral(generalRes.data);
            }
            else {
                setGeneralReport(null);
            }
            if (savedRes.ok && savedRes.data)
                setSavedReports(savedRes.data);
        }).finally(() => {
            if (!cancelled)
                setTeacherLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [mode, selectedStudentId, month]);
    useEffect(() => {
        if (mode !== 'teacher' || !selectedStudentId || !selectedAttemptId) {
            setAttemptReport(null);
            setShowAttemptSubmissionText(false);
            return;
        }
        if (!isUuid(selectedStudentId))
            return;
        let cancelled = false;
        setTeacherLoading(true);
        void Promise.all([
            getTeacherAttemptReportScoped({ student_id: selectedStudentId, attempt_id: selectedAttemptId }),
            getTeacherSavedReportsScoped({ student_id: selectedStudentId, attempt_id: selectedAttemptId, mode: 'attempt' }),
        ]).then(([attemptRes, savedRes]) => {
            if (cancelled)
                return;
            if (attemptRes.ok && attemptRes.data) {
                setAttemptReport(attemptRes.data);
            }
            else {
                setAttemptReport(null);
            }
            if (savedRes.ok && savedRes.data?.length) {
                const savedData = savedRes.data;
                setSavedReports((prev) => {
                    const byId = new Map(prev.map((item) => [item.id, item]));
                    savedData.forEach((item) => byId.set(item.id, item));
                    return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
                });
            }
        }).finally(() => {
            if (!cancelled)
                setTeacherLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [mode, selectedStudentId, selectedAttemptId]);
    if (isLoading)
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "Loading exports\u2026" });
    if (errorMessage)
        return _jsxs("div", { style: { padding: 12, color: '#fca5a5' }, children: ["Unable to load exports: ", errorMessage] });
    if (mode === 'teacher') {
        if (teacherLoading && !teacherRows && !teacherSummaryReport)
            return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "Generating teacher report\u2026" });
        if (teacherReportError)
            return _jsxs("div", { style: { padding: 12, color: '#fca5a5' }, children: ["No export data available: ", teacherReportError] });
        if (studentId && !teacherSummaryReport)
            return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "No export data available." });
        if (!studentId && !teacherRows)
            return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "No export data available." });
        return (_jsxs("div", { style: { padding: 12, color: '#e5e7eb', display: 'grid', gap: 12 }, children: [_jsx("h2", { style: { margin: 0 }, children: "Quick Reports" }), _jsx("p", { style: { margin: 0, color: '#94a3b8' }, children: "Generate clean reports without advanced setup." }), _jsx("section", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }, children: [
                        ['Student Progress Summary', 'Fast snapshot of score, completion, and growth areas.', false],
                        ['Parent-Ready Report', 'Plain language strengths, growth targets, and next steps.', false],
                        ['Class Snapshot', 'Class-level completion and performance overview.', true],
                    ].map(([title, desc, isReady]) => (_jsxs("article", { style: { border: '1px solid #334155', borderRadius: 10, padding: 12, background: 'linear-gradient(180deg, #0f172a, #0b1327)' }, children: [_jsx("div", { style: { fontWeight: 700 }, children: title }), _jsx("div", { style: { fontSize: 12, color: '#cbd5e1', margin: '6px 0 10px' }, children: desc }), _jsx("button", { type: "button", onClick: () => {
                                    if (isReady)
                                        exportCsv();
                                }, disabled: !isReady, style: { borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 10px' }, children: isReady ? 'Export CSV' : 'Use Advanced Tools' })] }, title))) }), _jsxs("details", { children: [_jsx("summary", { style: { cursor: 'pointer', color: '#93c5fd', fontWeight: 700 }, children: "Open Advanced Report Tools" }), !studentId && teacherRows ? (_jsxs("div", { style: { position: 'sticky', top: 0, zIndex: 3, background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx("input", { value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: "Search student", style: { flex: '1 1 220px', background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' } }), _jsx("button", { type: "button", onClick: exportCsv, style: { borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '8px 10px' }, children: "Export CSV" })] })) : null, _jsxs("div", { style: { display: 'grid', gridTemplateColumns: studentId ? 'minmax(0, 1fr)' : 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 10 }, children: [!studentId && teacherRows ? (_jsxs("article", { style: { border: '1px solid #334155', borderRadius: 12, padding: 14, background: 'linear-gradient(180deg, #0f172a, #0b1327)', overflowX: 'auto' }, children: [_jsx("h3", { style: { margin: 0 }, children: "Teacher Writing Class Summary" }), _jsxs("div", { style: { fontSize: 12, opacity: 0.85, marginBottom: 8 }, children: ["Month: ", month] }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { align: "left", children: "Student" }), _jsx("th", { align: "left", children: "Grade" }), _jsx("th", { align: "left", children: "Completion" }), _jsx("th", { align: "left", children: "Latest score" }), _jsx("th", { align: "left", children: "Actions" })] }) }), _jsx("tbody", { children: visibleRows.map((row) => (_jsxs("tr", { style: { borderTop: '1px solid #1e293b' }, children: [_jsx("td", { children: row.student_name }), _jsx("td", { children: row.grade }), _jsxs("td", { children: [Math.round(row.completion_rate * 100), "%"] }), _jsx("td", { children: formatScore(row.latest_score) }), _jsx("td", { children: _jsx("button", { type: "button", onClick: () => setSelectedStudentId(row.student_id), style: { borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '4px 8px' }, children: "Open student" }) })] }, row.student_id))) })] })] })) : null, _jsxs("aside", { id: "selected-student-report", style: { border: '1px solid #334155', borderRadius: 12, padding: 14, background: 'linear-gradient(180deg, #0f172a, #0b1327)', display: 'grid', gap: 10 }, children: [_jsx("strong", { children: "Selected student workspace" }), !selectedStudentId ? _jsx("div", { children: "Select a student row to load details." }) : null, selectedStudentId && !isUuid(selectedStudentId) ? (_jsxs("div", { style: { border: '1px solid #7f1d1d', background: '#3a1212', color: '#fecaca', borderRadius: 8, padding: 10 }, children: ["This student id is not UUID-shaped (`", selectedStudentId, "`), so secure teacher RPCs will fail with 400 until data is normalized."] })) : null, teacherSummaryReport ? renderTeacherSummary(teacherSummaryReport) : null, selectedStudentId ? (_jsxs("section", { style: { border: '1px solid #334155', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }, children: [_jsx("strong", { children: "Attempts (full text available)" }), attempts.length === 0 ? _jsx("div", { children: "No attempts available." }) : null, _jsx("div", { style: { display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }, children: attempts.map((item) => (_jsxs("button", { type: "button", onClick: () => setSelectedAttemptId(item.attempt_id), style: {
                                                            textAlign: 'left',
                                                            borderRadius: 8,
                                                            border: selectedAttemptId === item.attempt_id ? '1px solid #60a5fa' : '1px solid #334155',
                                                            background: '#111827',
                                                            color: '#f8fafc',
                                                            padding: '8px 10px',
                                                            cursor: 'pointer',
                                                        }, children: [_jsxs("div", { children: [_jsx("strong", { children: item.attempt_type ?? 'attempt' }), " \u00B7 ", new Date(item.created_at).toLocaleString()] }), _jsxs("div", { style: { fontSize: 12, opacity: 0.85 }, children: ["Score: ", formatScore(Number(item.assessment?.['total_score'] ?? NaN)), " \u00B7 Retry mode: ", item.retry_kind === 'same_prompt' ? 'Retry prompt' : item.retry_kind === 'new_prompt' ? 'New prompt' : item.retry_kind ?? '—'] })] }, item.attempt_id))) })] })) : null, selectedAttempt ? (_jsxs("section", { style: { border: '1px solid #334155', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }, children: [_jsx("strong", { children: "Attempt detail" }), _jsxs("div", { children: [_jsx("strong", { children: "Prompt:" }), " ", selectedAttempt.prompt_text || 'No prompt text available.'] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }, children: [_jsxs("article", { style: { border: '1px solid #1f2937', borderRadius: 8, padding: 8, background: '#020617' }, children: [_jsx("div", { style: { marginBottom: 6 }, children: _jsx("strong", { children: "Full student submission" }) }), !showAttemptSubmissionText ? (_jsxs("div", { style: { display: 'grid', gap: 6 }, children: [_jsx("div", { style: { fontSize: 12, color: '#cbd5e1' }, children: "Detailed writing text is protected by default." }), _jsx("button", { type: "button", onClick: () => setShowAttemptSubmissionText(true), style: { width: 'fit-content', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 9px' }, children: "View Full Submission" }), _jsx("small", { style: { color: '#94a3b8' }, children: "Viewing full submission is a sensitive action and may be logged." })] })) : (_jsx("pre", { style: { margin: 0, whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }, children: selectedAttempt.student_submission || 'No submission text found.' }))] }), _jsxs("article", { style: { border: '1px solid #1f2937', borderRadius: 8, padding: 8, background: '#020617' }, children: [_jsx("div", { style: { marginBottom: 6 }, children: _jsx("strong", { children: "AI evaluation / assessment" }) }), _jsx("pre", { style: { margin: 0, whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }, children: JSON.stringify(selectedAttempt.assessment ?? {}, null, 2) })] })] }), attemptReport ? (_jsxs("details", { children: [_jsx("summary", { children: "Attempt-level comparison and precise issues" }), _jsx("pre", { style: { marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }, children: JSON.stringify(attemptReport, null, 2) })] })) : null] })) : null, selectedStudentId ? (_jsxs("section", { style: { border: '1px solid #334155', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }, children: [_jsx("strong", { children: "Editable report builder (student-level + attempt-level)" }), teacherLoading && _jsx("small", { style: { color: '#94a3b8' }, children: "Loading reports\u2026" }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx("button", { type: "button", disabled: !generalReport || teacherLoading, onClick: () => generalReport && hydrateEditorFromGeneral(generalReport), title: !generalReport && !teacherLoading ? 'No student report available' : '', style: {
                                                                borderRadius: 8,
                                                                border: '1px solid #334155',
                                                                background: generalReport && !teacherLoading ? '#1e293b' : '#0f172a',
                                                                color: generalReport && !teacherLoading ? '#fff' : '#64748b',
                                                                padding: '6px 8px',
                                                                cursor: generalReport && !teacherLoading ? 'pointer' : 'not-allowed',
                                                                opacity: generalReport && !teacherLoading ? 1 : 0.5
                                                            }, children: "Generate student report template" }), _jsx("button", { type: "button", disabled: !attemptReport || teacherLoading, onClick: () => attemptReport && hydrateEditorFromAttempt(attemptReport), title: !attemptReport && !teacherLoading ? 'Select an attempt first' : '', style: {
                                                                borderRadius: 8,
                                                                border: '1px solid #334155',
                                                                background: attemptReport && !teacherLoading ? '#1e293b' : '#0f172a',
                                                                color: attemptReport && !teacherLoading ? '#fff' : '#64748b',
                                                                padding: '6px 8px',
                                                                cursor: attemptReport && !teacherLoading ? 'pointer' : 'not-allowed',
                                                                opacity: attemptReport && !teacherLoading ? 1 : 0.5
                                                            }, children: "Generate attempt report template" }), _jsx("button", { type: "button", onClick: exportEditorAsText, style: { borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '6px 8px' }, children: "Export edited report" })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }, children: [_jsxs("label", { style: { display: 'grid', gap: 4 }, children: ["Mode", _jsxs("select", { value: editor.mode, onChange: (event) => setEditor((prev) => ({ ...prev, mode: event.target.value })), style: { background: '#020617', border: '1px solid #334155', color: '#fff', borderRadius: 8, padding: '8px 10px' }, children: [_jsx("option", { value: "student", children: "Student-level report" }), _jsx("option", { value: "attempt", children: "Attempt-level report" })] })] }), _jsxs("label", { style: { display: 'grid', gap: 4 }, children: ["Status", _jsxs("select", { value: editor.status, onChange: (event) => setEditor((prev) => ({ ...prev, status: event.target.value })), style: { background: '#020617', border: '1px solid #334155', color: '#fff', borderRadius: 8, padding: '8px 10px' }, children: [_jsx("option", { value: "draft", children: "Draft" }), _jsx("option", { value: "final", children: "Final" })] })] })] }), [
                                                    ['title', 'Title'],
                                                    ['overall_performance', 'Overall performance'],
                                                    ['strengths', 'Strengths (newline/comma-separated)'],
                                                    ['recurring_weaknesses', 'Recurring weaknesses (newline/comma-separated)'],
                                                    ['trend_progress', 'Trend/progress'],
                                                    ['teacher_recommendations', 'Teacher recommendations (newline/comma-separated)'],
                                                    ['prompt', 'Prompt'],
                                                    ['submission_text', 'Full submission text'],
                                                    ['evaluation_breakdown', 'Evaluation breakdown (text/JSON)'],
                                                    ['precise_issues', 'Precise issues observed (newline/comma-separated)'],
                                                    ['suggested_next_action', 'Suggested next action'],
                                                    ['comparison_to_previous', 'Comparison to previous attempt'],
                                                    ['teacher_comment', 'Teacher comment'],
                                                ].map(([key, label]) => (_jsxs("label", { style: { display: 'grid', gap: 4 }, children: [label, _jsx("textarea", { value: editor[key] ?? '', onChange: (event) => setEditor((prev) => ({ ...prev, [key]: event.target.value })), rows: key === 'submission_text' || key === 'evaluation_breakdown' ? 8 : 3, style: { background: '#020617', border: '1px solid #334155', color: '#fff', borderRadius: 8, padding: '8px 10px', fontFamily: key === 'evaluation_breakdown' ? 'monospace' : 'inherit' } })] }, key))), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx("button", { type: "button", onClick: () => saveEditorReport('draft'), style: { borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '6px 8px' }, children: "Save draft" }), _jsx("button", { type: "button", onClick: () => saveEditorReport('final'), style: { borderRadius: 8, border: '1px solid #334155', background: '#14532d', color: '#bbf7d0', padding: '6px 8px' }, children: "Save final" })] }), editorMessage ? _jsx("small", { children: editorMessage }) : null, _jsxs("details", { children: [_jsxs("summary", { children: ["Saved teacher reports (", savedReports.length, ")"] }), _jsxs("div", { style: { display: 'grid', gap: 6, marginTop: 8 }, children: [savedReports.map((item) => (_jsxs("button", { type: "button", onClick: () => {
                                                                        const payload = item.report_payload ?? {};
                                                                        setEditor({
                                                                            id: item.id,
                                                                            mode: item.report_mode,
                                                                            status: item.status,
                                                                            title: String(payload['title'] ?? ''),
                                                                            overall_performance: String(payload['overall_performance'] ?? ''),
                                                                            strengths: (payload['strengths'] ?? []).join('\n'),
                                                                            recurring_weaknesses: (payload['recurring_weaknesses'] ?? []).join('\n'),
                                                                            trend_progress: String(payload['trend_progress'] ?? ''),
                                                                            teacher_recommendations: (payload['teacher_recommendations'] ?? []).join('\n'),
                                                                            prompt: String(payload['prompt'] ?? ''),
                                                                            submission_text: String(payload['submission_text'] ?? ''),
                                                                            evaluation_breakdown: String(payload['evaluation_breakdown'] ?? ''),
                                                                            precise_issues: (payload['precise_issues'] ?? []).join('\n'),
                                                                            suggested_next_action: String(payload['suggested_next_action'] ?? ''),
                                                                            comparison_to_previous: String(payload['comparison_to_previous'] ?? ''),
                                                                            teacher_comment: item.teacher_comment ?? '',
                                                                        });
                                                                        if (item.attempt_id)
                                                                            setSelectedAttemptId(item.attempt_id);
                                                                        setEditorMessage(`Loaded saved report ${item.id}.`);
                                                                    }, style: { textAlign: 'left', borderRadius: 8, border: '1px solid #334155', background: '#111827', color: '#f8fafc', padding: '8px 10px' }, children: [_jsxs("div", { children: [_jsx("strong", { children: item.report_mode === 'student' ? 'Student-level' : 'Attempt-level' }), " \u00B7 ", item.status] }), _jsx("div", { style: { fontSize: 12, opacity: 0.85 }, children: item.updated_at })] }, item.id))), savedReports.length === 0 ? _jsx("div", { children: "No saved reports yet." }) : null] })] })] })) : null] })] })] })] }));
    }
    const result = mode === 'student'
        ? studentId
            ? exportStudentMonthlyWritingReport(studentId, month)
            : { ok: false, error: 'studentId is required for student exports.' }
        : studentId
            ? exportAdminCalibrationReport(studentId, month)
            : { ok: false, error: 'studentId is required for admin exports.' };
    if (!result.ok || !result.data) {
        return _jsxs("div", { style: { padding: 12, color: '#e5e7eb' }, children: ["No export data available: ", result.error ?? 'Unknown error'] });
    }
    return (_jsxs("div", { style: { padding: 12, color: '#e5e7eb', display: 'grid', gap: 10 }, children: [_jsx("h2", { style: { margin: 0 }, children: "Writing Export Center" }), renderExport(result.data)] }));
};
export default WritingExportCenter;
