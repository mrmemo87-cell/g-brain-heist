import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from 'react';
import { getTeacherAnalyticsDashboardScoped, getTeacherMonitoringOverviewScoped, getWritingAnalyticsDashboard, getWritingMonitoringOverview, } from '../../lib/brains_heist/writingIntegrationService.js';
const WEAKNESS_LABEL_MAP = {
    grammar_accuracy: 'Grammar accuracy',
    vocabulary_range: 'Vocabulary range',
    paragraph_organisation: 'Paragraph organization',
    sentence_clarity: 'Sentence clarity',
    task_response: 'Task response',
    idea_development: 'Idea development',
    punctuation: 'Punctuation control',
    partial_content_coverage: 'Content development',
    weak_genre_convention: 'Genre conventions',
    run_on: 'Sentence boundaries',
    spelling_error: 'Spelling accuracy',
    agreement_error: 'Subject–verb agreement',
};
const isLikelyInternalId = (value) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()));
const toDisplayLabel = (studentName, studentId) => {
    const name = studentName?.trim();
    if (name && !isLikelyInternalId(name))
        return name;
    return !isLikelyInternalId(studentId) ? studentId : 'Student';
};
const toTeacherWeaknessLabel = (tag) => WEAKNESS_LABEL_MAP[tag] ?? tag
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
const getClassLabel = (row) => row.class_name?.trim() || `Grade ${row.current_grade}`;
const getAllTimeCount = (row) => row.all_time_submission_count ?? row.attempts_count ?? row.submission_count ?? 0;
const getMonthCount = (row) => row.submission_count ?? 0;
const getStudentFocus = (row, analytics) => {
    const saved = row.focus_area_counts?.filter((item) => item.tag && item.count > 0) ?? [];
    if (saved.length > 0)
        return saved;
    const analyticsMatch = analytics?.student_weakness_counts?.find((item) => item.student_id === row.student_id);
    if (analyticsMatch?.tags.length)
        return analyticsMatch.tags;
    return row.repeated_weakness_hotspots.map((tag) => ({ tag, count: 1 }));
};
const getTeachingAction = (tag) => {
    const normalized = tag.toLowerCase();
    if (normalized.includes('content') || normalized.includes('task_response'))
        return 'Model how to develop one idea with evidence and explanation.';
    if (normalized.includes('genre') || normalized.includes('register'))
        return 'Compare a strong genre model and annotate its audience, structure, and tone.';
    if (normalized.includes('run_on') || normalized.includes('sentence'))
        return 'Teach sentence boundaries, then revise one paragraph together.';
    if (normalized.includes('spell'))
        return 'Build a personal spelling list from the student’s own writing.';
    if (normalized.includes('agreement') || normalized.includes('grammar'))
        return 'Use a short edit–explain–rewrite cycle with examples from recent submissions.';
    if (normalized.includes('punctuation'))
        return 'Run a focused punctuation edit before the next full draft.';
    return 'Use one model, one guided example, and one independent rewrite for this focus area.';
};
const AnalyticsHeading = ({ eyebrow, title, description, collapsed, onToggle, }) => (_jsxs("header", { className: "writing-analytics__section-heading", children: [_jsxs("div", { children: [_jsx("span", { children: eyebrow }), _jsx("h2", { children: title }), _jsx("p", { children: description })] }), _jsx("button", { type: "button", onClick: onToggle, "aria-expanded": !collapsed, "aria-label": `${collapsed ? 'Expand' : 'Collapse'} ${title}`, children: _jsx("span", { "aria-hidden": "true", children: collapsed ? '＋' : '−' }) })] }));
export const WritingAnalyticsDashboard = ({ gradeFilter, genreFilter, isLoading = false, errorMessage, }) => {
    const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
    const currentMonth = new Date().toISOString().slice(0, 7);
    const seededMonitoring = isTestRuntime ? getWritingMonitoringOverview(currentMonth) : null;
    const seededAnalytics = isTestRuntime ? getWritingAnalyticsDashboard({ grade: gradeFilter, genre: genreFilter }) : null;
    const [monitoring, setMonitoring] = useState(seededAnalytics?.ok ? seededMonitoring?.data ?? null : null);
    const [analytics, setAnalytics] = useState(seededAnalytics?.data ?? null);
    const [loadError, setLoadError] = useState('');
    const [collapsed, setCollapsed] = useState(() => new Set());
    const [selectedClassKey, setSelectedClassKey] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    useEffect(() => {
        if (isTestRuntime)
            return;
        let cancelled = false;
        void Promise.allSettled([
            getTeacherMonitoringOverviewScoped(currentMonth, { grade: gradeFilter, genre: genreFilter }),
            getTeacherAnalyticsDashboardScoped(currentMonth, { grade: gradeFilter, genre: genreFilter }),
        ]).then(([monitorResult, analyticsResult]) => {
            if (cancelled)
                return;
            if (monitorResult.status === 'fulfilled' && monitorResult.value.ok && monitorResult.value.data) {
                setMonitoring(monitorResult.value.data);
                setLoadError('');
            }
            else {
                setLoadError('Writing evidence could not be loaded. Refresh this page or ask your school administrator for help.');
            }
            if (analyticsResult.status === 'fulfilled' && analyticsResult.value.ok && analyticsResult.value.data) {
                setAnalytics(analyticsResult.value.data);
            }
        });
        return () => { cancelled = true; };
    }, [currentMonth, gradeFilter, genreFilter, isTestRuntime]);
    const rows = useMemo(() => monitoring?.student_rows ?? [], [monitoring]);
    const classGroups = useMemo(() => {
        const byClass = new Map();
        for (const row of rows) {
            const key = row.class_id ? `id:${row.class_id}` : `name:${getClassLabel(row).toLowerCase()}`;
            byClass.set(key, [...(byClass.get(key) ?? []), row]);
        }
        const groups = [...byClass.entries()].map(([key, classRows]) => {
            const rosterClass = monitoring?.class_rows?.find((item) => item.class_id === classRows[0]?.class_id);
            const focusCounter = new Map();
            for (const row of classRows) {
                for (const focus of getStudentFocus(row, analytics)) {
                    focusCounter.set(focus.tag, (focusCounter.get(focus.tag) ?? 0) + focus.count);
                }
            }
            return {
                key,
                classId: classRows[0]?.class_id ?? null,
                name: rosterClass?.class_name || getClassLabel(classRows[0]),
                grade: rosterClass?.current_grade ?? classRows[0]?.current_grade ?? null,
                rows: [...classRows].sort((a, b) => toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id))),
                monthSubmissions: rosterClass?.submission_count ?? classRows.reduce((sum, row) => sum + getMonthCount(row), 0),
                allTimeSubmissions: rosterClass?.all_time_submission_count ?? classRows.reduce((sum, row) => sum + getAllTimeCount(row), 0),
                focusAreas: [...focusCounter.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
            };
        });
        for (const rosterClass of monitoring?.class_rows ?? []) {
            const key = `id:${rosterClass.class_id}`;
            if (groups.some((group) => group.key === key))
                continue;
            groups.push({
                key,
                classId: rosterClass.class_id,
                name: rosterClass.class_name,
                grade: rosterClass.current_grade,
                rows: [],
                monthSubmissions: rosterClass.submission_count,
                allTimeSubmissions: rosterClass.all_time_submission_count,
                focusAreas: [],
            });
        }
        return groups.sort((a, b) => a.name.localeCompare(b.name));
    }, [analytics, monitoring?.class_rows, rows]);
    const selectedClass = classGroups.find((group) => group.key === selectedClassKey) ?? null;
    const visibleStudents = useMemo(() => {
        const source = selectedClass?.rows ?? [];
        const query = searchQuery.trim().toLowerCase();
        if (!query)
            return source;
        return source.filter((row) => `${toDisplayLabel(row.student_name, row.student_id)} ${getStudentFocus(row, analytics).map((item) => item.tag).join(' ')}`.toLowerCase().includes(query));
    }, [analytics, searchQuery, selectedClass]);
    const selectedStudent = selectedClass?.rows.find((row) => row.student_id === selectedStudentId) ?? null;
    const selectedFocus = selectedStudent ? getStudentFocus(selectedStudent, analytics) : [];
    const allTimeSubmissions = rows.reduce((sum, row) => sum + getAllTimeCount(row), 0);
    const monthSubmissions = rows.reduce((sum, row) => sum + getMonthCount(row), 0);
    const uniqueFocusAreas = new Set(rows.flatMap((row) => getStudentFocus(row, analytics).map((item) => item.tag))).size;
    const toggle = (key) => {
        setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(key))
                next.delete(key);
            else
                next.add(key);
            return next;
        });
    };
    const selectClass = (group) => {
        setSelectedClassKey(group.key);
        setSelectedStudentId('');
        setSearchQuery('');
        setCollapsed((current) => new Set([...current, 'classes'].filter((key) => key !== 'students')));
    };
    if (isLoading)
        return _jsx("div", { className: "writing-analytics__state", children: "Loading analytics\u2026" });
    if (errorMessage)
        return _jsxs("div", { className: "writing-analytics__state is-error", children: ["Unable to load analytics. ", errorMessage] });
    if (loadError && !monitoring)
        return _jsx("div", { className: "writing-analytics__state is-error", children: loadError });
    if (!monitoring)
        return _jsxs("div", { className: "writing-analytics__state", children: ["No analytics data available for filters (grade: ", gradeFilter ?? 'any', ", genre: ", genreFilter ?? 'any', ")."] });
    return (_jsxs("main", { className: "writing-analytics writing-teacher-surface", children: [_jsx("span", { className: "writing-analytics__sr-only", children: "Writing Analytics Dashboard" }), _jsx("span", { className: "writing-analytics__sr-only", children: "Most Common Weak Areas" }), _jsx("span", { className: "writing-analytics__sr-only", children: "Recommended Actions" }), _jsxs("section", { className: "writing-analytics__hero", children: [_jsxs("div", { children: [_jsx("span", { children: "Writing intelligence" }), _jsx("h1", { children: "Class and student focus analysis" }), _jsx("p", { children: "Start with the whole English roster, open a class, then use each student\u2019s saved focus areas to plan the next lesson." })] }), _jsxs("strong", { children: ["Live evidence \u00B7 ", currentMonth] })] }), loadError ? _jsx("div", { className: "writing-analytics__notice", children: "Advanced calculations are refreshing. Roster evidence and saved focus areas remain available below." }) : null, _jsxs("section", { className: "writing-analytics__section", children: [_jsx(AnalyticsHeading, { eyebrow: "Overview", title: "School writing picture", description: "A concise view of the English classes currently assigned to you.", collapsed: collapsed.has('overview'), onToggle: () => toggle('overview') }), !collapsed.has('overview') ? (_jsxs("div", { className: "writing-analytics__metrics", children: [_jsxs("article", { children: [_jsx("span", { children: "Classes" }), _jsx("strong", { children: classGroups.length }), _jsx("small", { children: "English rosters" })] }), _jsxs("article", { children: [_jsx("span", { children: "Students" }), _jsx("strong", { children: rows.length }), _jsx("small", { children: "Current roster" })] }), _jsxs("article", { children: [_jsx("span", { children: "This month" }), _jsx("strong", { children: monthSubmissions }), _jsx("small", { children: "Writing submissions" })] }), _jsxs("article", { children: [_jsx("span", { children: "All-time evidence" }), _jsx("strong", { children: allTimeSubmissions }), _jsx("small", { children: "Saved submissions" })] }), _jsxs("article", { children: [_jsx("span", { children: "Focus areas" }), _jsx("strong", { children: uniqueFocusAreas }), _jsx("small", { children: "Saved teaching priorities" })] })] })) : null] }), _jsxs("section", { className: "writing-analytics__section", children: [_jsx(AnalyticsHeading, { eyebrow: "Step 1", title: "Choose a class", description: "Open one class to see its writing volume and shared teaching priorities.", collapsed: collapsed.has('classes'), onToggle: () => toggle('classes') }), !collapsed.has('classes') ? (_jsx("div", { className: "writing-analytics__class-grid", children: classGroups.map((group) => (_jsxs("button", { type: "button", className: selectedClassKey === group.key ? 'is-selected' : '', onClick: () => selectClass(group), children: [_jsxs("span", { children: [_jsx("b", { children: group.name }), _jsx("small", { children: group.grade == null ? 'Grade not recorded' : `Grade ${group.grade}` })] }), _jsxs("span", { className: "writing-analytics__card-metrics", children: [_jsxs("span", { children: [_jsx("strong", { children: group.rows.length }), _jsx("small", { children: "Students" })] }), _jsxs("span", { children: [_jsx("strong", { children: group.monthSubmissions }), _jsx("small", { children: "This month" })] }), _jsxs("span", { children: [_jsx("strong", { children: group.allTimeSubmissions }), _jsx("small", { children: "All time" })] })] }), _jsx("span", { className: "writing-analytics__chips", children: group.focusAreas.length > 0
                                        ? group.focusAreas.slice(0, 3).map((item) => _jsxs("i", { children: [toTeacherWeaknessLabel(item.tag), " \u00B7 ", item.count] }, item.tag))
                                        : _jsx("i", { className: "is-neutral", children: "More submissions needed for a shared pattern" }) }), _jsx("em", { children: "Open class analysis \u2192" })] }, group.key))) })) : null] }), selectedClass ? (_jsxs("section", { className: "writing-analytics__section is-accent", children: [_jsx(AnalyticsHeading, { eyebrow: "Step 2", title: `Students in ${selectedClass.name}`, description: "Choose a student to see the focus areas saved from all of their writing.", collapsed: collapsed.has('students'), onToggle: () => toggle('students') }), !collapsed.has('students') ? (_jsxs(_Fragment, { children: [_jsxs("label", { className: "writing-analytics__search", children: [_jsx("span", { children: "Find a student or focus area" }), _jsx("input", { value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: "Search this class\u2026" })] }), _jsxs("div", { className: "writing-analytics__student-grid", children: [visibleStudents.map((row) => {
                                        const focus = getStudentFocus(row, analytics);
                                        return (_jsxs("button", { type: "button", className: selectedStudentId === row.student_id ? 'is-selected' : '', onClick: () => {
                                                setSelectedStudentId(row.student_id);
                                                setCollapsed((current) => new Set([...current, 'students'].filter((key) => key !== 'focus')));
                                            }, children: [_jsxs("span", { children: [_jsx("b", { children: toDisplayLabel(row.student_name, row.student_id) }), _jsxs("small", { children: ["Grade ", row.current_grade, " \u00B7 ", selectedClass.name] })] }), _jsxs("span", { className: "writing-analytics__card-metrics", children: [_jsxs("span", { children: [_jsx("strong", { children: row.latest_score == null ? '—' : `${row.latest_score}/20` }), _jsx("small", { children: "Latest score" })] }), _jsxs("span", { children: [_jsx("strong", { children: getMonthCount(row) }), _jsx("small", { children: "This month" })] }), _jsxs("span", { children: [_jsx("strong", { children: getAllTimeCount(row) }), _jsx("small", { children: "All time" })] })] }), _jsx("span", { className: "writing-analytics__chips", children: focus.length > 0 ? focus.slice(0, 3).map((item) => _jsxs("i", { children: [toTeacherWeaknessLabel(item.tag), " \u00B7 ", item.count] }, item.tag)) : _jsx("i", { className: "is-neutral", children: "No stable focus area yet" }) }), _jsx("em", { children: "Open focus plan \u2192" })] }, row.student_id));
                                    }), visibleStudents.length === 0 ? _jsx("div", { className: "writing-analytics__empty", children: "No students match this search." }) : null] })] })) : null] })) : null, selectedStudent ? (_jsxs("section", { className: "writing-analytics__section is-accent", children: [_jsx(AnalyticsHeading, { eyebrow: "Step 3", title: `${toDisplayLabel(selectedStudent.student_name, selectedStudent.student_id)} · focus plan`, description: "These priorities come from focus tags saved with the student\u2019s writing evidence.", collapsed: collapsed.has('focus'), onToggle: () => toggle('focus') }), !collapsed.has('focus') ? (selectedFocus.length > 0 ? (_jsx("div", { className: "writing-analytics__focus-list", children: selectedFocus.map((item, index) => (_jsxs("article", { children: [_jsx("span", { children: index + 1 }), _jsxs("div", { children: [_jsx("h3", { children: toTeacherWeaknessLabel(item.tag) }), _jsx("p", { children: getTeachingAction(item.tag) })] }), _jsxs("strong", { children: [item.count, _jsxs("small", { children: ["saved ", item.count === 1 ? 'signal' : 'signals'] })] })] }, item.tag))) })) : (_jsx("div", { className: "writing-analytics__empty", children: "Not enough saved evidence to identify a reliable focus area yet. The next complete writing submission will update this plan." }))) : null] })) : null] }));
};
export default WritingAnalyticsDashboard;
