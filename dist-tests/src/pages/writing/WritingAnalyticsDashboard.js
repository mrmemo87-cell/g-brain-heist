import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { getWritingAnalyticsDashboard, getWritingMonitoringOverview, getTeacherAnalyticsDashboardScoped, getTeacherMonitoringOverviewScoped, } from '../../lib/brains_heist/writingIntegrationService.js';
import { serializeAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
const toSafeAnalyticsError = (message) => {
    if (!message)
        return 'Writing analytics is temporarily unavailable. Refresh this page or try again shortly.';
    const normalized = message.toLowerCase();
    if (normalized.includes('coalesce')
        || normalized.includes('postgres')
        || normalized.includes('rpc')
        || normalized.includes('function')
        || normalized.includes('operator')
        || normalized.includes('type')) {
        return 'Writing analytics is temporarily unavailable. Refresh this page or ask your school administrator for help.';
    }
    return message;
};
export const WritingAnalyticsDashboard = ({ gradeFilter, genreFilter, isLoading = false, errorMessage, monitoringBasePath = '/writing/monitoring', calibrationBasePath = '/writing/calibration', promptBankBasePath = '/writing/prompts', onNavigate, }) => {
    const shellRef = useRef(null);
    const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
    const seededDashboard = isTestRuntime ? getWritingAnalyticsDashboard({ grade: gradeFilter, genre: genreFilter }) : null;
    const seededMonitoring = isTestRuntime ? getWritingMonitoringOverview() : null;
    const [dashboard, setDashboard] = useState(seededDashboard?.ok ? seededDashboard.data ?? null : null);
    const [monitoring, setMonitoring] = useState(seededMonitoring?.ok ? seededMonitoring.data ?? null : null);
    const [loadError, setLoadError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState('student');
    useEffect(() => {
        if (isTestRuntime)
            return;
        let cancelled = false;
        void Promise.all([
            getTeacherAnalyticsDashboardScoped(undefined, { grade: gradeFilter, genre: genreFilter }),
            getTeacherMonitoringOverviewScoped(undefined, { grade: gradeFilter, genre: genreFilter }),
        ]).then(([dashRes, monitorRes]) => {
            if (cancelled)
                return;
            if (!dashRes.ok || !dashRes.data) {
                setDashboard(null);
                setLoadError(toSafeAnalyticsError(dashRes.error));
                return;
            }
            setDashboard(dashRes.data);
            if (monitorRes.ok && monitorRes.data)
                setMonitoring(monitorRes.data);
            else
                setMonitoring(null);
            setLoadError('');
        });
        return () => {
            cancelled = true;
        };
    }, [gradeFilter, genreFilter, isTestRuntime]);
    useEffect(() => {
        if (!shellRef.current)
            return;
        const cards = Array.from(shellRef.current.querySelectorAll('[data-analytics-card="true"]'));
        if (cards.length === 0)
            return;
        gsap.fromTo(cards, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.06, ease: 'power2.out' });
    }, [dashboard, monitoring]);
    const data = dashboard;
    const isLikelyInternalId = (value) => !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
    const toDisplayLabel = (studentName, studentId) => {
        const name = studentName?.trim();
        if (name && !isLikelyInternalId(name))
            return name;
        const username = studentId?.trim();
        if (username && !isLikelyInternalId(username))
            return username;
        return 'Student';
    };
    const WEAKNESS_LABEL_MAP = {
        grammar_accuracy: 'Grammar accuracy',
        vocabulary_range: 'Vocabulary range',
        paragraph_organisation: 'Paragraph organization',
        sentence_clarity: 'Sentence clarity',
        task_response: 'Task response',
        idea_development: 'Idea development',
        punctuation: 'Punctuation control',
    };
    const toTeacherWeaknessLabel = (tag) => WEAKNESS_LABEL_MAP[tag] ??
        tag
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, (char) => char.toUpperCase());
    const getClassLabel = (row) => row.class_name?.trim() || `Grade ${row.current_grade} · Class not linked`;
    const studentLabelsById = new Map(monitoring
        ? monitoring.student_rows.map((row) => [row.student_id, toDisplayLabel(row.student_name, row.student_id)])
        : []);
    const retryInsights = data?.retry_insights;
    const toPercent = (value) => `${Math.round(value * 100)}%`;
    const buildPath = (basePath, params) => `${basePath}${serializeAdminDrilldownFilters(params)}`;
    const navigateTo = (path, event) => {
        event.preventDefault();
        if (onNavigate) {
            onNavigate(path);
            return;
        }
        if (typeof window !== 'undefined') {
            window.history.pushState({}, '', path);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
    };
    const pilotWarnings = [
        !data ? 'No analytics data available for current filters' : null,
        data && data.pilot_readiness.monthly_comparison_ready_students.length === 0 ? 'No students ready for monthly comparison' : null,
        data && data.pilot_readiness.incomplete_weekly_cycle_students.length > 0
            ? `${data.pilot_readiness.incomplete_weekly_cycle_students.length} students with incomplete cycles`
            : null,
        data && data.pilot_readiness.overused_prompts.length > 0 ? `${data.pilot_readiness.overused_prompts.length} prompts overused recently` : null,
        data && data.pilot_readiness.low_improvement_target_tags.length > 0
            ? `${data.pilot_readiness.low_improvement_target_tags.length} low-improvement tags need intervention`
            : null,
    ].filter(Boolean);
    const summaryRows = useMemo(() => {
        if (!monitoring)
            return [];
        const filtered = monitoring.student_rows.filter((row) => {
            const weak = row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ');
            const searchable = `${toDisplayLabel(row.student_name, row.student_id)} ${row.weekly_target_summary} ${weak}`.toLowerCase();
            return !searchQuery || searchable.includes(searchQuery.toLowerCase());
        });
        const sorted = [...filtered].sort((a, b) => {
            if (sortKey === 'completion')
                return b.completion_rate - a.completion_rate;
            if (sortKey === 'score')
                return (b.latest_score ?? -1) - (a.latest_score ?? -1);
            return toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id));
        });
        return sorted;
    }, [monitoring, searchQuery, sortKey]);
    if (isLoading)
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "Loading analytics\u2026" });
    if (errorMessage)
        return _jsxs("div", { style: { padding: 12, color: '#fca5a5' }, children: ["Unable to load analytics. ", toSafeAnalyticsError(errorMessage)] });
    if (loadError)
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: toSafeAnalyticsError(loadError) });
    if (!data) {
        return (_jsxs("div", { style: { padding: 12, color: '#e5e7eb' }, children: ["No analytics data available for filters (grade: ", gradeFilter ?? 'any', ", genre: ", genreFilter ?? 'any', ")."] }));
    }
    return (_jsxs("div", { className: "writing-analytics writing-teacher-surface", ref: shellRef, style: { padding: 20, color: '#f3f4f6', display: 'grid', gap: 20, background: '#0a0f1a' }, children: [_jsxs("section", { className: "writing-teacher-hero writing-analytics__hero", children: [_jsx("span", { className: "writing-teacher-eyebrow", children: "Class intelligence" }), _jsx("h1", { style: { margin: 0, fontSize: 32, fontWeight: 900, color: '#ffffff', letterSpacing: -0.5 }, children: "Writing Analytics" }), _jsx("p", { style: { margin: '8px 0 0', color: '#94a3b8', fontSize: 14 }, children: "Turn class-wide writing patterns into a clear teaching priority for your next lesson." })] }), _jsx("span", { style: { position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }, children: "Writing Analytics Dashboard" }), _jsxs("section", { className: "writing-analytics__explainer writing-teacher-card", "data-analytics-card": "true", style: { border: '1px solid #1e3a8a', borderRadius: 12, padding: 14, background: 'rgba(30, 58, 138, 0.12)', display: 'grid', gap: 8 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 700, color: '#93c5fd', letterSpacing: 0.5, textTransform: 'uppercase' }, children: "About this view" }), _jsx("p", { style: { margin: 0, color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }, children: "Use this tab to spot shared needs across a class. Use Monitor when you need to review one student\u2019s writing evidence and take action." })] }), _jsxs("div", { className: "writing-analytics__summary writing-teacher-card", "data-analytics-card": "true", style: { position: 'sticky', top: 0, zIndex: 3, background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 12, padding: 14, display: 'grid', gap: 12 }, children: [_jsxs("div", { className: "writing-analytics__metrics", style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }, children: [_jsxs("div", { className: "writing-teacher-metric is-attention", style: { display: 'grid', gap: 4 }, children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }, children: "Needing Support" }), _jsx("div", { style: { fontSize: 28, fontWeight: 900, color: '#f87171' }, children: data?.summary.stalled_count ?? 0 })] }), _jsxs("div", { className: "writing-teacher-metric is-positive", style: { display: 'grid', gap: 4 }, children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }, children: "Improving" }), _jsx("div", { style: { fontSize: 28, fontWeight: 900, color: '#86efac' }, children: data?.summary.improving_count ?? 0 })] }), _jsxs("div", { className: "writing-teacher-metric is-calm", style: { display: 'grid', gap: 4 }, children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }, children: "Total" }), _jsx("div", { style: { fontSize: 28, fontWeight: 900, color: '#93c5fd' }, children: data?.summary.total_students ?? 0 })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }, children: [_jsx("input", { value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: "Search by name or weakness...", type: "text", style: { background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 } }), _jsxs("select", { value: sortKey, onChange: (event) => setSortKey(event.target.value), style: { background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }, children: [_jsx("option", { value: "student", children: "Sort: A-Z" }), _jsx("option", { value: "completion", children: "Sort: Completion" }), _jsx("option", { value: "score", children: "Sort: Latest Score" })] })] })] }), data && (_jsxs("section", { className: "writing-analytics__section writing-teacher-card", "data-analytics-card": "true", style: { border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }, children: [_jsx("div", { className: "writing-teacher-section-heading", children: _jsxs("div", { children: [_jsx("span", { children: "Student evidence" }), _jsx("h2", { style: { margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }, children: "Who needs what?" }), _jsx("p", { children: "Compare practice, scores, focus areas, and current status without losing the class context." })] }) }), _jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: '#111b31', borderBottom: '2px solid #334155' }, children: [_jsx("th", { align: "left", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Student" }), _jsx("th", { align: "center", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Grade" }), _jsx("th", { align: "center", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Practice" }), _jsx("th", { align: "center", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Formative estimate" }), _jsx("th", { align: "left", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Focus Areas" }), _jsx("th", { align: "center", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Status" })] }) }), _jsx("tbody", { children: summaryRows.length > 0 ? (summaryRows.map((row) => (_jsxs("tr", { style: { borderBottom: '1px solid #1e293b', color: '#e2e8f0' }, children: [_jsxs("td", { style: { padding: '11px 12px' }, children: [_jsx("div", { style: { fontWeight: 600 }, children: toDisplayLabel(row.student_name, row.student_id) }), _jsx("div", { className: "writing-analytics__student-context", style: { fontSize: 11, color: '#64748b', marginTop: 2 }, children: getClassLabel(row) })] }), _jsx("td", { style: { padding: '11px 12px', textAlign: 'center', fontWeight: 600 }, children: row.current_grade }), _jsxs("td", { style: { padding: '11px 12px', textAlign: 'center', fontWeight: 600, color: '#93c5fd' }, children: [row.practice_completed_count ?? 0, "/", row.practice_assigned_count ?? 0] }), _jsx("td", { style: { padding: '11px 12px', textAlign: 'center', fontWeight: 600 }, children: row.latest_score == null ? '—' : `${row.latest_score}/20` }), _jsx("td", { style: { padding: '11px 12px', fontSize: 12 }, children: row.repeated_weakness_hotspots.length ? row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') : _jsx("span", { style: { color: '#64748b' }, children: "\u2014" }) }), _jsxs("td", { style: { padding: '11px 12px', textAlign: 'center' }, children: [row.status === 'needs_review' && _jsx("span", { style: { background: '#7c2d12', color: '#fed7aa', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }, children: "Review evidence" }), row.stalled && row.status !== 'needs_review' && _jsx("span", { style: { background: '#7f1d1d', color: '#fecaca', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }, children: "Needs support" }), row.improving && !row.stalled && _jsx("span", { style: { background: '#14532d', color: '#bbf7d0', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }, children: "Improving" }), !row.stalled && !row.improving && row.status !== 'needs_review' && _jsx("span", { style: { background: '#1e293b', color: '#cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }, children: row.status === 'plan_ready' ? 'Plan ready' : 'On track' })] })] }, row.student_id)))) : (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: '20px 12px', textAlign: 'center', color: '#64748b' }, children: "No students found" }) })) })] }) })] })), data && data.most_common_weakness_tags && data.most_common_weakness_tags.length > 0 && (_jsxs("section", { className: "writing-analytics__section writing-teacher-card", "data-analytics-card": "true", style: { border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }, children: [_jsx("span", { className: "sr-only", children: "Most Common Weak Areas" }), _jsx("h2", { style: { margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }, children: "Most common teaching priorities" }), _jsx("div", { style: { display: 'grid', gap: 8 }, children: data.most_common_weakness_tags.map((item) => (_jsxs("div", { className: "writing-analytics__priority-row", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(30, 41, 59, 0.3)', borderRadius: 8, border: '1px solid #1e293b' }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: '#e2e8f0' }, children: toTeacherWeaknessLabel(item.tag) }), _jsxs("div", { style: { fontSize: 12, color: '#64748b', marginTop: 2 }, children: [item.count, " students"] })] }), _jsx("button", { onClick: (event) => navigateTo(buildPath(monitoringBasePath, { weakness_tag: item.tag, grade: gradeFilter, genre: genreFilter }), event), style: { borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#93c5fd', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }, children: "View students" })] }, item.tag))) })] })), data && data.prompt_effectiveness && data.prompt_effectiveness.length > 0 && (_jsxs("section", { className: "writing-analytics__section writing-teacher-card", "data-analytics-card": "true", style: { border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }, children: [_jsx("h2", { style: { margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }, children: "Prompt Effectiveness" }), _jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: '#111b31', borderBottom: '2px solid #334155' }, children: [_jsx("th", { align: "left", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Prompt" }), _jsx("th", { align: "center", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Used" }), _jsx("th", { align: "center", style: { padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }, children: "Avg Score" })] }) }), _jsx("tbody", { children: data.prompt_effectiveness.map((item) => (_jsxs("tr", { style: { borderBottom: '1px solid #1e293b', color: '#e2e8f0' }, children: [_jsx("td", { style: { padding: '11px 12px', fontWeight: 600 }, children: item.title }), _jsx("td", { style: { padding: '11px 12px', textAlign: 'center' }, children: item.usage_count }), _jsx("td", { style: { padding: '11px 12px', textAlign: 'center' }, children: item.average_score ?? '—' })] }, item.prompt_id))) })] }) })] })), data && (_jsxs("section", { className: "writing-analytics__section writing-teacher-card", "data-analytics-card": "true", style: { border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }, children: [_jsx("span", { className: "sr-only", children: "Recommended Actions" }), _jsx("h2", { style: { margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }, children: "Recommended teaching actions" }), _jsxs("div", { style: { display: 'grid', gap: 10 }, children: [data.pilot_readiness.monthly_comparison_ready_students.length > 0 && (_jsxs("div", { className: "writing-analytics__action is-positive", style: { padding: '12px', background: 'rgba(34, 197, 94, 0.08)', borderRadius: 8, border: '1px solid #14532d' }, children: [_jsx("div", { style: { fontWeight: 600, color: '#86efac', marginBottom: 4 }, children: "\u2713 Ready for monthly reviews:" }), _jsx("div", { style: { color: '#e2e8f0', fontSize: 13 }, children: data.pilot_readiness.monthly_comparison_ready_students.map((studentId) => studentLabelsById.get(studentId) ?? 'Student').join(', ') || 'None' })] })), data.pilot_readiness.overused_prompts.length > 0 && (_jsxs("div", { className: "writing-analytics__action is-warning", style: { padding: '12px', background: 'rgba(249, 115, 22, 0.08)', borderRadius: 8, border: '1px solid #92400e' }, children: [_jsx("div", { style: { fontWeight: 600, color: '#fbbf24', marginBottom: 4 }, children: "\u26A0 Overused prompts to refresh:" }), _jsx("div", { style: { color: '#e2e8f0', fontSize: 13 }, children: data.pilot_readiness.overused_prompts.map((id, idx) => (_jsxs("span", { children: ["Prompt ", id.slice(0, 8), idx < data.pilot_readiness.overused_prompts.length - 1 ? ', ' : ''] }, id))) })] })), data.pilot_readiness.low_improvement_target_tags.length > 0 && (_jsxs("div", { className: "writing-analytics__action is-attention", style: { padding: '12px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid #7f1d1d' }, children: [_jsx("div", { style: { fontWeight: 600, color: '#f87171', marginBottom: 4 }, children: "! Weaknesses needing intervention:" }), _jsx("div", { style: { color: '#e2e8f0', fontSize: 13 }, children: data.pilot_readiness.low_improvement_target_tags.map((tag) => toTeacherWeaknessLabel(tag)).join(', ') })] }))] })] }))] }));
};
export default WritingAnalyticsDashboard;
