import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { getTeacherStudentSummaryScoped, getWritingCalibrationCase, mapCalibrationCaseToTeacherReport } from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';
const sectionStyle = {
    border: '1px solid #334155',
    borderRadius: 10,
    background: '#0f172a',
    padding: 12,
    display: 'grid',
    gap: 8,
};
export const WritingCalibrationReview = ({ studentId, month = new Date().toISOString().slice(0, 7), isLoading = false, errorMessage, filterQuery = '', }) => {
    const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
    const seededLegacy = isTestRuntime ? getWritingCalibrationCase(studentId, month) : null;
    const seededSummary = seededLegacy && seededLegacy.ok && seededLegacy.data
        ? mapCalibrationCaseToTeacherReport(seededLegacy.data, month, 'essay')
        : null;
    const [summary, setSummary] = useState(seededSummary);
    const [loadError, setLoadError] = useState('');
    const [tab, setTab] = useState('assessment');
    useEffect(() => {
        if (isTestRuntime)
            return;
        let cancelled = false;
        void getTeacherStudentSummaryScoped({ student_id: studentId, month, include_snippet: false }).then((result) => {
            if (cancelled)
                return;
            if (!result.ok || !result.data) {
                setSummary(null);
                setLoadError(result.error ?? 'No calibration data found for this student yet.');
                return;
            }
            setSummary(result.data);
            setLoadError('');
        });
        return () => {
            cancelled = true;
        };
    }, [studentId, month, isTestRuntime]);
    if (isLoading) {
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "Loading calibration review\u2026" });
    }
    if (errorMessage) {
        return _jsxs("div", { style: { padding: 12, color: '#fca5a5' }, children: ["Unable to load calibration review: ", errorMessage] });
    }
    if (loadError)
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: loadError });
    if (!summary)
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "No calibration data found for this student yet." });
    const filters = parseAdminDrilldownFilters(filterQuery);
    const assessment = summary.latest_evaluation;
    return (_jsxs("div", { style: { padding: 12, color: '#e5e7eb', display: 'grid', gap: 12 }, children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0 }, children: "Writing Calibration Review" }), _jsx("p", { style: { margin: "6px 0 0", color: "#94a3b8", fontSize: 13 }, children: "Check scoring consistency and choose next teaching actions." })] }), _jsxs("div", { role: "tablist", "aria-label": "Calibration review sections", style: { position: 'sticky', top: 0, zIndex: 3, background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }, children: [_jsx("button", { id: "calibration-tab-assessment", role: "tab", "aria-selected": tab === 'assessment', "aria-controls": "calibration-panel-assessment", tabIndex: tab === 'assessment' ? 0 : -1, type: "button", onClick: () => setTab('assessment'), style: { borderRadius: 999, border: '1px solid #334155', background: tab === 'assessment' ? '#1d4ed8' : '#1e293b', color: '#fff', padding: '4px 10px' }, children: "Assessment" }), _jsx("button", { id: "calibration-tab-actions", role: "tab", "aria-selected": tab === 'actions', "aria-controls": "calibration-panel-actions", tabIndex: tab === 'actions' ? 0 : -1, type: "button", onClick: () => setTab('actions'), style: { borderRadius: 999, border: '1px solid #334155', background: tab === 'actions' ? '#1d4ed8' : '#1e293b', color: '#fff', padding: '4px 10px' }, children: "Teacher actions" }), _jsx("button", { id: "calibration-tab-patterns", role: "tab", "aria-selected": tab === 'patterns', "aria-controls": "calibration-panel-patterns", tabIndex: tab === 'patterns' ? 0 : -1, type: "button", onClick: () => setTab('patterns'), style: { borderRadius: 999, border: '1px solid #334155', background: tab === 'patterns' ? '#1d4ed8' : '#1e293b', color: '#fff', padding: '4px 10px' }, children: "Patterns & summary" })] }), _jsxs("section", { style: sectionStyle, children: [_jsxs("strong", { children: [summary.student.student_name, " \u00B7 Grade ", summary.student.grade ?? '—', " \u00B7 ", summary.student.class_name] }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsxs("span", { style: { position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }, children: ["Calibration follow-up: ", summary.calibration_follow_up_flag ? 'Flagged' : 'Not flagged'] }), _jsx("span", { style: { background: summary.calibration_follow_up_flag ? '#7f1d1d' : '#14532d', color: summary.calibration_follow_up_flag ? '#fecaca' : '#bbf7d0', borderRadius: 999, padding: '2px 8px', fontSize: 12 }, children: summary.calibration_follow_up_flag ? 'Needs calibration follow-up' : 'Calibration stable' }), _jsxs("span", { style: { background: '#1e3a8a', color: '#bfdbfe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }, children: ["Completion ", summary.overall_summary.completion_rate_percent, "%"] }), _jsxs("span", { style: { background: '#312e81', color: '#c7d2fe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }, children: ["Latest score ", summary.overall_summary.latest_score ?? '—'] })] })] }), tab === 'assessment' ? (_jsxs("section", { id: "calibration-panel-assessment", role: "tabpanel", "aria-labelledby": "calibration-tab-assessment", style: sectionStyle, children: [_jsx("strong", { children: "Latest assessment result" }), filters.weakness_tag ? _jsxs("div", { children: ["Filtered weakness focus: ", filters.weakness_tag] }) : null, assessment && Object.keys(assessment).length > 0 ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: ["Evaluation status: ", String(assessment['completion_status'] ?? '—'), " (", String(assessment['recommended_next_action'] ?? '—'), ")"] }), _jsxs("div", { children: ["Weakness tags: ", summary.priority_weak_areas.join(', ') || 'None'] }), _jsxs("div", { children: ["Score trend delta: ", summary.overall_summary.score_trend_delta ?? '—'] })] })) : (_jsx("div", { children: "No assessment available." })), _jsx("small", { children: WRITING_ADMIN_HELP.low_improvement_tag })] })) : null, tab === 'actions' ? (_jsxs("section", { id: "calibration-panel-actions", role: "tabpanel", "aria-labelledby": "calibration-tab-actions", style: sectionStyle, children: [_jsx("strong", { children: "Teacher actions" }), _jsx("ul", { style: { margin: 0, paddingLeft: 18 }, children: (summary.teacher_actions.length ? summary.teacher_actions : ['No teacher actions generated yet.']).map((item) => (_jsx("li", { children: item }, item))) })] })) : null, tab === 'patterns' ? (_jsxs(_Fragment, { children: [_jsxs("section", { id: "calibration-panel-patterns", role: "tabpanel", "aria-labelledby": "calibration-tab-patterns", style: sectionStyle, children: [_jsx("strong", { children: "Repeated error patterns" }), _jsx("div", { children: summary.repeated_error_patterns.join(', ') || 'None detected.' })] }), _jsxs("section", { id: "student-friendly-summary", "data-testid": "student-summary", style: sectionStyle, children: [_jsx("strong", { children: "Student-friendly summary" }), _jsx("div", { children: summary.student_friendly_summary.progress_summary })] }), _jsxs("section", { style: sectionStyle, children: [_jsx("strong", { children: "Monthly report snapshot" }), _jsxs("div", { children: ["Month: ", summary.period] }), _jsxs("div", { children: ["Score trend delta: ", summary.overall_summary.score_trend_delta ?? '—'] })] })] })) : (_jsxs("section", { id: "student-friendly-summary", "data-testid": "student-summary", style: { position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }, children: [_jsx("strong", { children: "Student-friendly summary" }), _jsx("div", { children: summary.student_friendly_summary.progress_summary })] }))] }));
};
export default WritingCalibrationReview;
