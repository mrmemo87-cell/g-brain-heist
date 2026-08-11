import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTeacherAttemptListScoped, getTeacherMonitoringOverviewScoped, getTeacherWritingReport, getWritingMonitoringOverview, saveTeacherReportScoped, } from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { openProfessionalWritingReport } from '../../lib/brains_heist/writingReportDocument.js';
const SUPPORTED_GENRES = [
    'email',
    'article',
    'review',
    'story',
    'essay',
    'report',
    'paragraph',
];
const GENRE_META = {
    email: { icon: '✉️', description: 'Purpose, audience, tone, opening and closing' },
    article: { icon: '📰', description: 'Engaging ideas, structure and reader awareness' },
    review: { icon: '⭐', description: 'Evaluation, evidence and recommendation' },
    story: { icon: '📖', description: 'Narrative control, detail and sequencing' },
    essay: { icon: '📝', description: 'Argument, development and organization' },
    report: { icon: '📊', description: 'Formal findings, headings and recommendations' },
    paragraph: { icon: '¶', description: 'Focus, support and sentence connection' },
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
const isLikelyInternalId = (value) => {
    if (!value)
        return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
};
const toDisplayLabel = (studentName, studentId) => {
    const name = studentName?.trim();
    if (name && !isLikelyInternalId(name))
        return name;
    const username = studentId?.trim();
    if (username && !isLikelyInternalId(username))
        return username;
    return 'Student';
};
const toTeacherWeaknessLabel = (tag) => WEAKNESS_LABEL_MAP[tag] ??
    tag
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
const toGenreLabel = (genre) => genre
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
const formatScoreLabel = (score) => {
    if (score == null || Number.isNaN(score))
        return '—';
    return `${score}/20`;
};
const formatDate = (value) => {
    if (!value)
        return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatMonitoringPeriod = (month) => {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match)
        return month;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const getSubmissionCount = (row) => row.submission_count ?? row.attempts_count ?? 0;
const getAllTimeSubmissionCount = (row) => row.all_time_submission_count ?? row.attempts_count ?? getSubmissionCount(row);
const getClassKey = (row) => {
    if (row.class_id?.trim())
        return `id:${row.class_id.trim()}`;
    if (row.class_name?.trim())
        return `name:${row.class_name.trim().toLowerCase()}`;
    return `roster-review:${row.current_grade}`;
};
const getClassName = (row) => row.class_name?.trim() || `Grade ${row.current_grade}`;
const getStatus = (row) => {
    if (row.status === 'needs_review' || row.status === 'needs_support' || row.stalled) {
        return { label: 'Needs support', tone: 'attention' };
    }
    if (row.improving)
        return { label: 'Improving', tone: 'positive' };
    if (row.status === 'plan_ready')
        return { label: 'Plan ready', tone: 'neutral' };
    if (row.status === 'not_started')
        return { label: 'Not started', tone: 'neutral' };
    return { label: 'On track', tone: 'positive' };
};
const extractAttemptScore = (attempt) => {
    const assessment = attempt.assessment ?? {};
    const score = assessment['total_score'];
    return typeof score === 'number' && Number.isFinite(score) ? score : null;
};
const extractAttemptWeaknesses = (attempt) => {
    const tags = attempt.assessment?.['weakness_tags'];
    return Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0) : [];
};
const extractAttemptFeedbackText = (attempt) => {
    const richFeedback = attempt.rich_feedback ?? {};
    const directFeedback = [
        richFeedback['teacher_feedback'],
        richFeedback['summary'],
        richFeedback['task_understanding'],
        richFeedback['next_move'],
    ].find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof directFeedback === 'string')
        return directFeedback.trim();
    const subscaleSummary = attempt.assessment?.['subscale_summary'];
    if (Array.isArray(subscaleSummary)) {
        const lines = subscaleSummary.filter((item) => typeof item === 'string' && item.trim().length > 0);
        if (lines.length > 0)
            return lines.join('\n');
    }
    return 'Feedback will appear here when the evaluation is complete.';
};
const extractCorrections = (attempt) => {
    const richFeedback = attempt.rich_feedback ?? {};
    const mapFixes = (key, type, explanationKey) => {
        const fixes = richFeedback[key];
        if (!Array.isArray(fixes))
            return [];
        return fixes.flatMap((item) => {
            if (!item || typeof item !== 'object')
                return [];
            const record = item;
            const wrong = typeof record['original'] === 'string' ? record['original'].trim() : '';
            const correct = typeof record['better_version'] === 'string' ? record['better_version'].trim() : '';
            if (!wrong || !correct)
                return [];
            return [{
                    type,
                    wrong,
                    correct,
                    explanation: explanationKey && typeof record[explanationKey] === 'string'
                        ? record[explanationKey].trim()
                        : '',
                }];
        });
    };
    return [
        ...mapFixes('grammar_fixes', 'Grammar'),
        ...mapFixes('punctuation_fixes', 'Punctuation'),
        ...mapFixes('natural_phrase_upgrades', 'Phrasing', 'why_it_helps'),
    ];
};
const getRubricRows = (attempt) => {
    const subscores = (attempt.assessment?.['subscores'] ?? {});
    const notes = (attempt.assessment?.['band_justification'] ?? {});
    const keys = [
        ['Content', 'content'],
        ['Communicative Achievement', 'communicative_achievement'],
        ['Organization', 'organisation'],
        ['Language', 'language'],
    ];
    return keys.map(([label, key]) => ({
        label,
        score: typeof subscores[key] === 'number' ? subscores[key] : null,
        note: typeof notes[key] === 'string' ? notes[key] : '',
    }));
};
const CollapsibleHeading = ({ eyebrow, title, description, collapsed, onToggle, actions }) => (_jsxs("header", { className: "writing-monitor__section-heading", children: [_jsx("button", { type: "button", className: "writing-monitor__collapse", onClick: onToggle, "aria-expanded": !collapsed, "aria-label": `${collapsed ? 'Expand' : 'Collapse'} ${title}`, children: _jsx("span", { "aria-hidden": "true", children: collapsed ? '＋' : '−' }) }), _jsxs("div", { children: [_jsx("span", { className: "writing-monitor__eyebrow", children: eyebrow }), _jsx("h2", { children: title }), _jsx("p", { children: description })] }), actions ? _jsx("div", { className: "writing-monitor__heading-actions", children: actions }) : null] }));
export const WritingMonitoringView = ({ month = new Date().toISOString().slice(0, 7), isLoading = false, errorMessage, filterQuery = '', }) => {
    const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
    const seededOverview = isTestRuntime ? getWritingMonitoringOverview(month) : null;
    const [overview, setOverview] = useState(seededOverview?.ok ? seededOverview.data ?? null : null);
    const [loadError, setLoadError] = useState('');
    const [lastSyncedAt, setLastSyncedAt] = useState(null);
    const [selectedClassKey, setSelectedClassKey] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const [attemptRows, setAttemptRows] = useState([]);
    const [attemptsLoading, setAttemptsLoading] = useState(false);
    const [attemptError, setAttemptError] = useState('');
    const [studentReport, setStudentReport] = useState(null);
    const [attemptIndex, setAttemptIndex] = useState(0);
    const [flipDirection, setFlipDirection] = useState('forward');
    const [flipSequence, setFlipSequence] = useState(0);
    const [collapsed, setCollapsed] = useState(() => new Set());
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [feedbackDraft, setFeedbackDraft] = useState('');
    const [feedbackStatus, setFeedbackStatus] = useState('');
    const studentRequestRef = useRef(0);
    const filters = parseAdminDrilldownFilters(filterQuery);
    const allRows = useMemo(() => (overview?.student_rows ?? []).map((row) => ({ ...row })), [overview]);
    const filteredRows = useMemo(() => allRows.filter((row) => {
        if (filters.grade && row.current_grade !== filters.grade)
            return false;
        if (filters.status === 'stalled' && !row.stalled)
            return false;
        if (filters.status === 'improving' && !row.improving)
            return false;
        if (filters.weakness_tag && !row.repeated_weakness_hotspots.includes(filters.weakness_tag))
            return false;
        return true;
    }), [allRows, filters.grade, filters.status, filters.weakness_tag]);
    const classGroups = useMemo(() => {
        const groups = new Map();
        for (const row of filteredRows) {
            const key = getClassKey(row);
            const current = groups.get(key);
            if (current)
                current.push(row);
            else
                groups.set(key, [row]);
        }
        const rowGroups = [...groups.entries()]
            .map(([key, rows]) => {
            const grades = [...new Set(rows.map((row) => row.current_grade))].sort((a, b) => a - b);
            const rosterClass = overview?.class_rows?.find((item) => (rows[0]?.class_id && item.class_id === rows[0].class_id)
                || item.class_name === rows[0]?.class_name);
            return {
                key,
                name: rosterClass?.class_name || getClassName(rows[0]),
                gradeLabel: grades.length > 0
                    ? grades.map((grade) => `Grade ${grade}`).join(' · ')
                    : rosterClass?.current_grade != null ? `Grade ${rosterClass.current_grade}` : 'Grade not recorded',
                rows: [...rows].sort((a, b) => toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id))),
                submissions: rosterClass?.submission_count ?? rows.reduce((sum, row) => sum + getSubmissionCount(row), 0),
                allTimeSubmissions: rosterClass?.all_time_submission_count
                    ?? rows.reduce((sum, row) => sum + getAllTimeSubmissionCount(row), 0),
                attentionCount: rows.filter((row) => getStatus(row).tone === 'attention').length,
            };
        });
        if (!filters.status && !filters.weakness_tag) {
            for (const rosterClass of overview?.class_rows ?? []) {
                if (filters.grade && rosterClass.current_grade !== filters.grade)
                    continue;
                if (rowGroups.some((group) => group.key === `id:${rosterClass.class_id}`))
                    continue;
                rowGroups.push({
                    key: `id:${rosterClass.class_id}`,
                    name: rosterClass.class_name,
                    gradeLabel: rosterClass.current_grade == null ? 'Grade not recorded' : `Grade ${rosterClass.current_grade}`,
                    rows: [],
                    submissions: rosterClass.submission_count,
                    allTimeSubmissions: rosterClass.all_time_submission_count,
                    attentionCount: 0,
                });
            }
        }
        return rowGroups.sort((a, b) => a.name.localeCompare(b.name));
    }, [filteredRows, filters.grade, filters.status, filters.weakness_tag, overview?.class_rows]);
    const selectedClass = classGroups.find((group) => group.key === selectedClassKey) ?? null;
    const visibleStudents = useMemo(() => {
        if (!selectedClass)
            return [];
        const query = studentSearch.trim().toLowerCase();
        if (!query)
            return selectedClass.rows;
        return selectedClass.rows.filter((row) => `${toDisplayLabel(row.student_name, row.student_id)} ${getStatus(row).label}`.toLowerCase().includes(query));
    }, [selectedClass, studentSearch]);
    const selectedRow = selectedClass?.rows.find((row) => row.student_id === selectedStudentId) ?? null;
    const availableGenres = useMemo(() => {
        const extras = attemptRows
            .map((attempt) => attempt.genre?.trim().toLowerCase())
            .filter((genre) => Boolean(genre) && !SUPPORTED_GENRES.includes(genre));
        return [...SUPPORTED_GENRES, ...[...new Set(extras)].sort()];
    }, [attemptRows]);
    const genreCounts = useMemo(() => {
        const counts = new Map();
        for (const genre of availableGenres)
            counts.set(genre, 0);
        for (const attempt of attemptRows) {
            const genre = attempt.genre?.trim().toLowerCase() || 'other';
            counts.set(genre, (counts.get(genre) ?? 0) + 1);
        }
        return counts;
    }, [attemptRows, availableGenres]);
    const genreAttempts = useMemo(() => attemptRows.filter((attempt) => (attempt.genre?.trim().toLowerCase() || 'other') === selectedGenre), [attemptRows, selectedGenre]);
    const activeAttempt = genreAttempts[attemptIndex] ?? null;
    const totalSubmissions = filteredRows.reduce((sum, row) => sum + getSubmissionCount(row), 0);
    const allTimeSubmissions = filteredRows.reduce((sum, row) => sum + getAllTimeSubmissionCount(row), 0);
    const attentionCount = filteredRows.filter((row) => getStatus(row).tone === 'attention').length;
    const improvingCount = filteredRows.filter((row) => row.improving).length;
    const toggleCollapsed = (key) => {
        setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(key))
                next.delete(key);
            else
                next.add(key);
            return next;
        });
    };
    const expandSection = (key) => {
        setCollapsed((current) => {
            if (!current.has(key))
                return current;
            const next = new Set(current);
            next.delete(key);
            return next;
        });
    };
    const refreshOverview = useCallback(async () => {
        if (isTestRuntime)
            return;
        const result = await getTeacherMonitoringOverviewScoped(month);
        if (!result.ok || !result.data) {
            setLoadError(result.error ?? 'Writing data could not be refreshed. Please try again.');
            return;
        }
        setOverview(result.data);
        setLastSyncedAt(new Date());
        setLoadError('');
    }, [isTestRuntime, month]);
    useEffect(() => {
        if (isTestRuntime)
            return;
        void refreshOverview();
        const refreshTimer = window.setInterval(() => void refreshOverview(), 30_000);
        const refreshOnFocus = () => void refreshOverview();
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible')
                void refreshOverview();
        };
        window.addEventListener('focus', refreshOnFocus);
        document.addEventListener('visibilitychange', refreshWhenVisible);
        return () => {
            window.clearInterval(refreshTimer);
            window.removeEventListener('focus', refreshOnFocus);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, [isTestRuntime, refreshOverview]);
    useEffect(() => {
        if (selectedClassKey && !classGroups.some((group) => group.key === selectedClassKey)) {
            setSelectedClassKey('');
            setSelectedStudentId('');
            setSelectedGenre('');
        }
    }, [classGroups, selectedClassKey]);
    useEffect(() => {
        if (attemptIndex < genreAttempts.length)
            return;
        setAttemptIndex(Math.max(0, genreAttempts.length - 1));
    }, [attemptIndex, genreAttempts.length]);
    useEffect(() => {
        if (!selectedGenre || genreAttempts.length < 2 || collapsed.has('reader'))
            return;
        const onKeyDown = (event) => {
            if (event.key === 'ArrowRight' && attemptIndex < genreAttempts.length - 1) {
                setFlipDirection('forward');
                setAttemptIndex((index) => index + 1);
                setFlipSequence((sequence) => sequence + 1);
            }
            if (event.key === 'ArrowLeft' && attemptIndex > 0) {
                setFlipDirection('backward');
                setAttemptIndex((index) => index - 1);
                setFlipSequence((sequence) => sequence + 1);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [attemptIndex, collapsed, genreAttempts.length, selectedGenre]);
    const selectClass = (group) => {
        studentRequestRef.current = (studentRequestRef.current ?? 0) + 1;
        setSelectedClassKey(group.key);
        setSelectedStudentId('');
        setSelectedGenre('');
        setStudentSearch('');
        setAttemptRows([]);
        setStudentReport(null);
        setAttemptError('');
        setCollapsed((current) => {
            const next = new Set(current);
            next.add('classes');
            next.delete('students');
            return next;
        });
    };
    const selectStudent = async (row) => {
        const requestId = (studentRequestRef.current ?? 0) + 1;
        studentRequestRef.current = requestId;
        setSelectedStudentId(row.student_id);
        setSelectedGenre('');
        setAttemptRows([]);
        setStudentReport(null);
        setAttemptError('');
        setAttemptsLoading(true);
        setFeedbackStatus('');
        setCollapsed((current) => {
            const next = new Set(current);
            next.add('students');
            next.delete('genres');
            return next;
        });
        const [attemptsResult, reportResult] = await Promise.all([
            getTeacherAttemptListScoped({ student_id: row.student_id, limit: 100 }),
            getTeacherWritingReport({ student_id: row.student_id, month, include_snippet: true }),
        ]);
        if (studentRequestRef.current !== requestId)
            return;
        if (attemptsResult.ok && attemptsResult.data) {
            setAttemptRows([...attemptsResult.data].sort((a, b) => {
                const aTime = new Date(a.created_at).getTime();
                const bTime = new Date(b.created_at).getTime();
                if (!Number.isFinite(aTime) || !Number.isFinite(bTime))
                    return 0;
                return aTime - bTime;
            }));
        }
        else
            setAttemptError(attemptsResult.error ?? 'Unable to load this student’s writing submissions.');
        if (reportResult.ok && reportResult.data) {
            setStudentReport(reportResult.data);
            setFeedbackDraft([
                `Praise: ${reportResult.data.strengths[0] ?? 'Thank you for completing this writing task.'}`,
                `Growth target: ${reportResult.data.priority_weak_areas[0]
                    ? toTeacherWeaknessLabel(reportResult.data.priority_weak_areas[0])
                    : 'Develop one idea more fully in the next draft.'}`,
                `Next step: ${reportResult.data.teacher_actions[0] ?? 'Revise one paragraph and explain what changed.'}`,
            ].join('\n\n'));
        }
        setAttemptsLoading(false);
    };
    const selectGenre = (genre) => {
        setSelectedGenre(genre);
        setAttemptIndex(0);
        setFlipDirection('forward');
        setFlipSequence((sequence) => sequence + 1);
        setCollapsed((current) => {
            const next = new Set(current);
            next.add('genres');
            next.delete('reader');
            return next;
        });
    };
    const turnPage = (direction) => {
        if (direction === 'forward' && attemptIndex >= genreAttempts.length - 1)
            return;
        if (direction === 'backward' && attemptIndex <= 0)
            return;
        setFlipDirection(direction);
        setAttemptIndex((index) => index + (direction === 'forward' ? 1 : -1));
        setFlipSequence((sequence) => sequence + 1);
    };
    const printStudentReport = () => {
        if (!studentReport)
            return;
        openProfessionalWritingReport(studentReport, {
            audience: 'teacher',
            teacherComment: feedbackDraft,
            reportStatus: feedbackStatus.includes('final') ? 'final' : 'draft',
        });
    };
    const saveFeedback = async (status) => {
        if (!selectedRow || !feedbackDraft.trim())
            return;
        setFeedbackStatus(status === 'final' ? 'Publishing feedback…' : 'Saving securely…');
        const result = await saveTeacherReportScoped({
            student_id: selectedRow.student_id,
            mode: 'student',
            month,
            genre: SUPPORTED_GENRES.includes(selectedGenre)
                ? selectedGenre
                : undefined,
            status,
            teacher_comment: feedbackDraft.trim(),
            report_payload: {
                title: `Writing feedback for ${toDisplayLabel(selectedRow.student_name, selectedRow.student_id)}`,
                praise_growth_next_step: feedbackDraft.trim(),
                latest_score: selectedRow.latest_score,
                attempts_count: selectedRow.attempts_count,
                focus_areas: selectedRow.repeated_weakness_hotspots,
            },
        });
        setFeedbackStatus(result.ok
            ? status === 'final' ? 'Feedback finalized and saved.' : 'Draft saved securely.'
            : result.error ?? 'Unable to save feedback.');
    };
    const copyFeedback = async () => {
        if (typeof navigator === 'undefined' || !feedbackDraft.trim())
            return;
        try {
            await navigator.clipboard.writeText(feedbackDraft);
            setFeedbackStatus('Copied to clipboard.');
        }
        catch {
            setFeedbackStatus('Copy failed. Select the text and copy manually.');
        }
    };
    if (isLoading) {
        return (_jsxs("div", { className: "writing-monitor writing-monitor--loading", "aria-label": "Loading writing monitor", children: [_jsx("div", { className: "writing-monitor__skeleton writing-monitor__skeleton--hero" }), _jsx("div", { className: "writing-monitor__skeleton-grid", children: [1, 2, 3, 4].map((item) => _jsx("div", { className: "writing-monitor__skeleton" }, item)) }), _jsx("div", { className: "writing-monitor__skeleton writing-monitor__skeleton--panel" })] }));
    }
    if (errorMessage) {
        return _jsxs("div", { className: "writing-monitor__state is-error", children: ["Unable to load writing monitor: ", errorMessage] });
    }
    if (loadError && !overview)
        return _jsx("div", { className: "writing-monitor__state is-error", children: loadError });
    if (!overview)
        return _jsx("div", { className: "writing-monitor__state", children: "No writing monitoring data available yet." });
    if (overview.student_rows.length === 0 && (overview.class_rows?.length ?? 0) === 0) {
        return _jsx("div", { className: "writing-monitor__state", children: "No English classes are assigned to this teacher yet." });
    }
    const readerWeaknesses = activeAttempt ? extractAttemptWeaknesses(activeAttempt) : [];
    const readerCorrections = activeAttempt ? extractCorrections(activeAttempt) : [];
    const readerRubric = activeAttempt ? getRubricRows(activeAttempt) : [];
    const monitoringPeriod = formatMonitoringPeriod(month);
    return (_jsxs("main", { className: "writing-monitor writing-teacher-surface", children: [_jsx("span", { className: "writing-monitor__sr-only", children: "Teacher/Admin Writing Monitor" }), _jsx("span", { className: "writing-monitor__sr-only", children: "Weekly target" }), loadError ? (_jsx("div", { className: "writing-monitor__sync-warning", role: "status", children: "Live refresh paused. Showing the most recently synchronized data." })) : null, _jsxs("section", { className: "writing-monitor__hero", children: [_jsxs("div", { children: [_jsx("span", { className: "writing-monitor__eyebrow", children: "Writing Command Center" }), _jsx("h1", { children: "Writing Monitor" }), _jsx("p", { children: "Move from the school overview to one class, one student, one genre, and finally the exact writing evidence." })] }), _jsxs("div", { className: "writing-monitor__sync", children: [_jsx("span", { "aria-hidden": "true" }), lastSyncedAt
                                ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : 'Live school data'] })] }), _jsx("nav", { className: "writing-monitor__path", "aria-label": "Writing monitor drill-down", children: [
                    ['1', 'Overview', true],
                    ['2', selectedClass?.name ?? 'Choose class', Boolean(selectedClass)],
                    ['3', selectedRow ? toDisplayLabel(selectedRow.student_name, selectedRow.student_id) : 'Choose student', Boolean(selectedRow)],
                    ['4', selectedGenre ? toGenreLabel(selectedGenre) : 'Choose genre', Boolean(selectedGenre)],
                ].map(([number, label, active]) => (_jsxs("div", { className: active ? 'is-complete' : '', children: [_jsx("span", { children: number }), _jsx("strong", { children: label })] }, String(number)))) }), _jsxs("section", { className: "writing-monitor__section", children: [_jsx(CollapsibleHeading, { eyebrow: "School overview", title: "Students and general writing data", description: "A clean starting point before you open a class.", collapsed: collapsed.has('overview'), onToggle: () => toggleCollapsed('overview') }), !collapsed.has('overview') ? (_jsxs("div", { className: "writing-monitor__metrics", children: [_jsxs("article", { children: [_jsx("span", { children: "Total students" }), _jsx("strong", { children: filteredRows.length }), _jsx("small", { children: "From your English rosters" })] }), _jsxs("article", { children: [_jsx("span", { children: "Classes" }), _jsx("strong", { children: classGroups.length }), _jsx("small", { children: "From your live roster" })] }), _jsxs("article", { children: [_jsx("span", { children: "Submissions" }), _jsx("strong", { children: totalSubmissions }), _jsxs("small", { children: ["Across all genres \u00B7 ", monitoringPeriod] })] }), _jsxs("article", { children: [_jsx("span", { children: "All-time submissions" }), _jsx("strong", { children: allTimeSubmissions }), _jsx("small", { children: "All students \u00B7 all saved writing" })] }), _jsxs("article", { className: "is-attention", children: [_jsx("span", { children: "Need support" }), _jsx("strong", { children: attentionCount }), _jsx("small", { children: "Review these students first" })] }), _jsxs("article", { className: "is-positive", children: [_jsx("span", { children: "Improving" }), _jsx("strong", { children: improvingCount }), _jsx("small", { children: "Recent progress detected" })] })] })) : null] }), _jsxs("section", { className: "writing-monitor__section", children: [_jsx(CollapsibleHeading, { eyebrow: "Step 1", title: "Choose a class", description: "Class and grade come from the live school roster. Each card summarizes the students and writing evidence in that class.", collapsed: collapsed.has('classes'), onToggle: () => toggleCollapsed('classes'), actions: selectedClass ? (_jsx("button", { type: "button", className: "writing-monitor__text-button", onClick: () => expandSection('classes'), children: "Change class" })) : undefined }), !collapsed.has('classes') ? (classGroups.length > 0 ? (_jsx("div", { className: "writing-monitor__class-grid", children: classGroups.map((group) => (_jsxs("button", { type: "button", className: `writing-monitor__class-card${selectedClassKey === group.key ? ' is-selected' : ''}`, onClick: () => selectClass(group), "aria-pressed": selectedClassKey === group.key, children: [_jsx("span", { className: "writing-monitor__class-icon", "aria-hidden": "true", children: "\uD83C\uDFEB" }), _jsxs("span", { className: "writing-monitor__card-copy", children: [_jsx("strong", { children: group.name }), _jsx("small", { children: group.gradeLabel })] }), _jsxs("span", { className: "writing-monitor__mini-metrics", children: [_jsxs("span", { children: [_jsx("strong", { children: group.rows.length }), _jsx("small", { children: "Students" })] }), _jsxs("span", { children: [_jsx("strong", { children: group.submissions }), _jsxs("small", { children: ["Submissions \u00B7 ", monitoringPeriod] })] }), _jsxs("span", { children: [_jsx("strong", { children: group.allTimeSubmissions }), _jsx("small", { children: "All-time submissions" })] })] }), _jsx("span", { className: group.attentionCount > 0 ? 'writing-monitor__attention' : 'writing-monitor__on-track', children: group.attentionCount > 0 ? `${group.attentionCount} need support` : 'No priority alerts' }), _jsxs("span", { className: "writing-monitor__open-label", children: ["Open class ", _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] }, group.key))) })) : (_jsx("div", { className: "writing-monitor__empty", children: "No monitoring matches the current link filters." }))) : null] }), selectedClass ? (_jsxs("section", { className: "writing-monitor__section writing-monitor__section--accent", children: [_jsx(CollapsibleHeading, { eyebrow: "Step 2", title: `Students in ${selectedClass.name}`, description: "Choose a student to see their complete genre portfolio.", collapsed: collapsed.has('students'), onToggle: () => toggleCollapsed('students'), actions: (_jsxs("label", { className: "writing-monitor__search", children: [_jsx("span", { className: "writing-monitor__sr-only", children: "Search students" }), _jsx("input", { type: "search", value: studentSearch, onChange: (event) => setStudentSearch(event.target.value), placeholder: "Search students" })] })) }), !collapsed.has('students') ? (visibleStudents.length > 0 ? (_jsx("div", { className: "writing-monitor__student-grid", children: visibleStudents.map((row) => {
                            const status = getStatus(row);
                            return (_jsxs("button", { type: "button", className: `writing-monitor__student-card${selectedStudentId === row.student_id ? ' is-selected' : ''}`, onClick: () => void selectStudent(row), "aria-pressed": selectedStudentId === row.student_id, children: [_jsxs("span", { className: "writing-monitor__student-topline", children: [_jsxs("span", { children: [_jsx("strong", { children: toDisplayLabel(row.student_name, row.student_id) }), _jsxs("small", { children: ["Grade ", row.current_grade, " \u00B7 ", selectedClass.name] })] }), _jsx("span", { className: `writing-monitor__status is-${status.tone}`, children: status.label })] }), _jsxs("span", { className: "writing-monitor__student-metrics", children: [_jsxs("span", { children: [_jsx("small", { children: "Latest score" }), _jsx("strong", { children: formatScoreLabel(row.latest_score) })] }), _jsxs("span", { children: [_jsxs("small", { children: ["Submissions \u00B7 ", monitoringPeriod] }), _jsx("strong", { children: getSubmissionCount(row) })] }), _jsxs("span", { children: [_jsx("small", { children: "All-time submissions" }), _jsx("strong", { children: getAllTimeSubmissionCount(row) })] })] }), _jsxs("span", { className: "writing-monitor__student-focus", children: [_jsx("strong", { children: "Current focus" }), row.repeated_weakness_hotspots.length > 0
                                                ? row.repeated_weakness_hotspots.slice(0, 2).map(toTeacherWeaknessLabel).join(' · ')
                                                : row.weekly_target_summary || 'Build more writing evidence'] }), _jsxs("span", { className: "writing-monitor__open-label", children: ["Open writing portfolio ", _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] }, row.student_id));
                        }) })) : (_jsx("div", { className: "writing-monitor__empty", children: "No students match this search." }))) : null] })) : null, selectedRow ? (_jsxs("section", { className: "writing-monitor__section writing-monitor__section--accent", children: [_jsx(CollapsibleHeading, { eyebrow: "Step 3", title: `${toDisplayLabel(selectedRow.student_name, selectedRow.student_id)} · Writing genres`, description: "Every genre stays visible, including genres with no submissions yet.", collapsed: collapsed.has('genres'), onToggle: () => toggleCollapsed('genres'), actions: studentReport ? (_jsxs("div", { className: "writing-monitor__student-actions", children: [_jsx("button", { type: "button", className: "writing-monitor__secondary-button", onClick: () => setIsFeedbackOpen(true), children: "Give feedback" }), _jsx("button", { type: "button", className: "writing-monitor__primary-button", onClick: printStudentReport, children: "Preview & print report" })] })) : undefined }), !collapsed.has('genres') ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "writing-monitor__student-summary", children: [_jsxs("div", { children: [_jsx("span", { children: "Student overview" }), _jsx("strong", { children: formatScoreLabel(selectedRow.latest_score) }), _jsx("small", { children: "Latest formative estimate" })] }), _jsxs("div", { children: [_jsx("span", { children: "Total submissions" }), _jsx("strong", { children: attemptsLoading ? '…' : attemptRows.length }), _jsx("small", { children: "All-time saved writing evidence" })] }), _jsxs("div", { children: [_jsx("span", { children: "Reporting period" }), _jsx("strong", { children: getSubmissionCount(selectedRow) }), _jsxs("small", { children: ["Submissions in ", monitoringPeriod] })] })] }), attemptsLoading ? (_jsxs("div", { className: "writing-monitor__inline-loading", role: "status", children: [_jsx("span", {}), " Loading genres and submissions\u2026"] })) : attemptError ? (_jsx("div", { className: "writing-monitor__inline-error", role: "alert", children: attemptError })) : (_jsx("div", { className: "writing-monitor__genre-grid", children: availableGenres.map((genre) => {
                                    const count = genreCounts.get(genre) ?? 0;
                                    const genreMeta = GENRE_META[genre];
                                    const scores = attemptRows
                                        .filter((attempt) => attempt.genre?.toLowerCase() === genre)
                                        .map(extractAttemptScore)
                                        .filter((score) => score != null);
                                    const average = scores.length > 0
                                        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
                                        : null;
                                    return (_jsxs("button", { type: "button", className: `writing-monitor__genre-card${selectedGenre === genre ? ' is-selected' : ''}${count === 0 ? ' is-empty' : ''}`, onClick: () => selectGenre(genre), "aria-pressed": selectedGenre === genre, children: [_jsx("span", { className: "writing-monitor__genre-icon", "aria-hidden": "true", children: genreMeta?.icon ?? '📄' }), _jsxs("span", { children: [_jsx("strong", { children: toGenreLabel(genre) }), _jsx("small", { children: genreMeta?.description ?? 'Writing evidence and teacher feedback' })] }), _jsxs("span", { className: "writing-monitor__genre-count", children: [_jsx("strong", { children: count }), _jsx("small", { children: count === 1 ? 'submission' : 'submissions' })] }), _jsx("span", { className: "writing-monitor__genre-score", children: average == null ? 'No score yet' : `Average ${formatScoreLabel(average)}` })] }, genre));
                                }) }))] })) : null] })) : null, selectedRow && selectedGenre ? (_jsxs("section", { className: "writing-monitor__section writing-monitor__section--reader", children: [_jsx(CollapsibleHeading, { eyebrow: "Step 4", title: `${toGenreLabel(selectedGenre)} submission book`, description: "Flip through the student\u2019s saved submissions in chronological evidence pages.", collapsed: collapsed.has('reader'), onToggle: () => toggleCollapsed('reader'), actions: genreAttempts.length > 0 ? (_jsxs("span", { className: "writing-monitor__page-count", children: ["Submission ", attemptIndex + 1, " of ", genreAttempts.length] })) : undefined }), !collapsed.has('reader') ? (genreAttempts.length === 0 ? (_jsxs("div", { className: "writing-monitor__empty writing-monitor__empty--genre", children: [_jsx("span", { "aria-hidden": "true", children: "\uD83D\uDCED" }), _jsxs("strong", { children: ["No ", toGenreLabel(selectedGenre), " submissions yet"] }), _jsx("p", { children: "This genre remains visible so the teacher can see the student\u2019s complete writing coverage." })] })) : activeAttempt ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "writing-monitor__book-controls writing-monitor__book-controls--top", children: [_jsxs("button", { type: "button", onClick: () => turnPage('backward'), disabled: attemptIndex === 0, children: [_jsx("span", { "aria-hidden": "true", children: "\u2190" }), " Previous submission"] }), _jsx("div", { className: "writing-monitor__book-dots", "aria-label": `Submission ${attemptIndex + 1} of ${genreAttempts.length}`, children: genreAttempts.map((attempt, index) => (_jsx("button", { type: "button", className: index === attemptIndex ? 'is-active' : '', onClick: () => {
                                                setFlipDirection(index > attemptIndex ? 'forward' : 'backward');
                                                setAttemptIndex(index);
                                                setFlipSequence((sequence) => sequence + 1);
                                            }, "aria-label": `Open submission ${index + 1}`, "aria-current": index === attemptIndex ? 'page' : undefined }, attempt.attempt_id || attempt.row_id))) }), _jsxs("button", { type: "button", onClick: () => turnPage('forward'), disabled: attemptIndex === genreAttempts.length - 1, children: ["Next submission ", _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] }), _jsx("article", { className: `writing-monitor__book is-turning-${flipDirection}`, children: _jsxs("div", { className: "writing-monitor__book-spread", children: [_jsxs("section", { className: "writing-monitor__book-page writing-monitor__book-page--submission", children: [_jsxs("header", { children: [_jsx("span", { children: toGenreLabel(activeAttempt.genre || selectedGenre) }), _jsx("strong", { children: formatDate(activeAttempt.created_at) })] }), _jsx("div", { className: "writing-monitor__book-page-number", children: "Writing evidence" }), _jsx("h3", { children: "The task" }), _jsx("p", { className: "writing-monitor__prompt", children: activeAttempt.prompt_text || 'Prompt text is not available for this submission.' }), _jsx("h3", { children: "Student submission" }), _jsx("div", { className: "writing-monitor__submission-text", children: activeAttempt.student_submission || 'No submission text was saved.' }), _jsx("footer", { children: "Brains Heist Writing Hub \u00B7 Evidence page" })] }), _jsxs("section", { className: "writing-monitor__book-page writing-monitor__book-page--feedback", children: [_jsxs("header", { children: [_jsx("span", { children: "Teacher review" }), _jsx("strong", { children: formatScoreLabel(extractAttemptScore(activeAttempt)) })] }), _jsx("div", { className: "writing-monitor__book-page-number", children: "Feedback & next steps" }), _jsx("h3", { children: "Feedback summary" }), _jsx("p", { className: "writing-monitor__feedback-copy", children: extractAttemptFeedbackText(activeAttempt) }), _jsx("h3", { children: "Rubric snapshot" }), _jsx("div", { className: "writing-monitor__rubric", children: readerRubric.map((row) => (_jsxs("div", { children: [_jsxs("span", { children: [_jsx("strong", { children: row.label }), _jsx("b", { children: row.score == null ? '—' : `${row.score}/5` })] }), _jsx("div", { children: _jsx("i", { style: { width: `${Math.max(0, Math.min(100, ((row.score ?? 0) / 5) * 100))}%` } }) }), row.note ? _jsx("small", { children: row.note }) : null] }, row.label))) }), _jsx("h3", { children: "Focus tags" }), _jsx("div", { className: "writing-monitor__tags", children: readerWeaknesses.length > 0
                                                        ? readerWeaknesses.map((tag) => _jsx("span", { children: toTeacherWeaknessLabel(tag) }, tag))
                                                        : _jsx("span", { className: "is-neutral", children: "No weakness tags saved for this submission" }) }), readerCorrections.length > 0 ? (_jsxs("details", { className: "writing-monitor__corrections", children: [_jsxs("summary", { children: ["Sentence-level corrections (", readerCorrections.length, ")"] }), _jsx("div", { children: readerCorrections.map((correction, index) => (_jsxs("p", { children: [_jsx("strong", { children: correction.type }), _jsx("del", { children: correction.wrong }), _jsx("span", { "aria-hidden": "true", children: "\u2192" }), _jsx("ins", { children: correction.correct }), correction.explanation ? _jsx("small", { children: correction.explanation }) : null] }, `${correction.type}-${index}`))) })] })) : null, _jsx("footer", { children: "Brains Heist Writing Hub \u00B7 Feedback page" })] })] }) }, `${activeAttempt.attempt_id || activeAttempt.row_id}-${flipSequence}`), _jsxs("div", { className: "writing-monitor__book-controls writing-monitor__book-controls--bottom", children: [_jsxs("button", { type: "button", onClick: () => turnPage('backward'), disabled: attemptIndex === 0, children: [_jsx("span", { "aria-hidden": "true", children: "\u2190" }), " Previous"] }), _jsx("span", { children: "Use the arrows or keyboard \u2190 \u2192 to flip through submissions." }), _jsxs("button", { type: "button", onClick: () => turnPage('forward'), disabled: attemptIndex === genreAttempts.length - 1, children: ["Next ", _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] })] })) : null) : null] })) : null, isFeedbackOpen && selectedRow ? (_jsx("div", { className: "writing-monitor__modal-backdrop", role: "presentation", onMouseDown: () => setIsFeedbackOpen(false), children: _jsxs("section", { className: "writing-monitor__feedback-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "writing-feedback-title", onMouseDown: (event) => event.stopPropagation(), children: [_jsxs("header", { children: [_jsxs("div", { children: [_jsx("span", { className: "writing-monitor__eyebrow", children: "Teacher feedback" }), _jsx("h2", { id: "writing-feedback-title", children: toDisplayLabel(selectedRow.student_name, selectedRow.student_id) }), _jsx("p", { children: "Edit the suggested praise, growth target, and next step in your own voice." })] }), _jsx("button", { type: "button", onClick: () => setIsFeedbackOpen(false), "aria-label": "Close feedback", children: "\u00D7" })] }), _jsx("label", { htmlFor: "writing-feedback-editor", children: "Feedback to student" }), _jsx("textarea", { id: "writing-feedback-editor", value: feedbackDraft, onChange: (event) => {
                                setFeedbackDraft(event.target.value);
                                setFeedbackStatus('');
                            } }), feedbackStatus ? _jsx("div", { className: "writing-monitor__feedback-status", "aria-live": "polite", children: feedbackStatus }) : null, _jsxs("footer", { children: [_jsx("button", { type: "button", className: "writing-monitor__secondary-button", onClick: () => void copyFeedback(), children: "Copy feedback" }), _jsx("button", { type: "button", className: "writing-monitor__secondary-button", onClick: () => void saveFeedback('draft'), children: "Save draft" }), _jsx("button", { type: "button", className: "writing-monitor__primary-button", onClick: () => void saveFeedback('final'), children: "Finalize feedback" })] })] }) })) : null] }));
};
export default WritingMonitoringView;
