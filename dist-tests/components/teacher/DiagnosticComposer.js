import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { composeDiagnostic, fetchDiagnosticComposerCapabilities, } from '../../services/diagnosticComposerService.js';
const reasonCopy = (reason) => {
    if (reason === 'academic_context_incomplete') {
        return 'This teaching group is missing academic subject, grade, or academic-year context. Ask the school administrator to complete the group setup.';
    }
    if (reason === 'governed_pool_too_narrow') {
        return 'There are enough questions by count, but not enough distinct mapped skills or difficulty levels to call the result a trustworthy diagnostic yet.';
    }
    return 'Brains Heist does not yet have enough current, governed, grade-eligible questions to build a trustworthy diagnostic for this group.';
};
const DiagnosticComposerDialog = ({ open, schoolId, teachingGroups, initialGroupId, onClose, onPrepared, }) => {
    const [groupId, setGroupId] = useState('');
    const [capabilities, setCapabilities] = useState(null);
    const [questionCount, setQuestionCount] = useState(null);
    const [loading, setLoading] = useState(true);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [retryVersion, setRetryVersion] = useState(0);
    const prepareRequest = useRef(0);
    const prepareInFlight = useRef(false);
    useEffect(() => () => { prepareRequest.current += 1; }, []);
    const sortedGroups = useMemo(() => [...teachingGroups].sort((a, b) => (a.schoolSubjectName.localeCompare(b.schoolSubjectName)
        || Number(a.gradeLevel) - Number(b.gradeLevel)
        || a.name.localeCompare(b.name))), [teachingGroups]);
    useEffect(() => {
        if (!open)
            return;
        const preferred = initialGroupId && sortedGroups.some((group) => group.id === initialGroupId)
            ? initialGroupId
            : sortedGroups[0]?.id || '';
        // Roster refreshes must not reset the teacher's current group choice.
        setGroupId((current) => sortedGroups.some((group) => group.id === current) ? current : preferred);
    }, [initialGroupId, open, sortedGroups]);
    useEffect(() => {
        if (!open || !schoolId || !groupId)
            return;
        let active = true;
        setLoading(true);
        setCapabilities(null);
        setQuestionCount(null);
        setError('');
        setLoadError('');
        fetchDiagnosticComposerCapabilities(schoolId, groupId)
            .then((result) => {
            if (!active)
                return;
            setCapabilities(result);
            const recommended = result.depths.find((depth) => depth.recommended) || result.depths[0];
            setQuestionCount(recommended?.questionCount || null);
        })
            .catch((reason) => {
            if (!active)
                return;
            setLoadError(reason instanceof Error ? reason.message : 'Diagnostic options could not be loaded.');
        })
            .finally(() => {
            if (active)
                setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [groupId, open, schoolId, retryVersion]);
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !preparing)
                onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, open, preparing]);
    if (!open)
        return null;
    const selectedGroup = sortedGroups.find((group) => group.id === groupId) || null;
    const currentCapabilities = capabilities?.group.id === groupId ? capabilities : null;
    const selectedDepth = currentCapabilities?.depths.find((depth) => depth.questionCount === questionCount) || null;
    const checkingPool = loading || (!currentCapabilities && !loadError);
    const handlePrepare = async () => {
        if (prepareInFlight.current || checkingPool || !questionCount || !currentCapabilities?.ready || !selectedDepth?.available || !groupId)
            return;
        prepareInFlight.current = true;
        const request = ++prepareRequest.current;
        setPreparing(true);
        setError('');
        try {
            const diagnostic = await composeDiagnostic(schoolId, groupId, questionCount);
            if (request !== prepareRequest.current)
                return;
            onPrepared(diagnostic);
        }
        catch (reason) {
            if (request === prepareRequest.current)
                setError(reason instanceof Error ? reason.message : 'The diagnostic could not be prepared.');
        }
        finally {
            if (request === prepareRequest.current) {
                prepareInFlight.current = false;
                setPreparing(false);
            }
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6", role: "dialog", "aria-modal": "true", "aria-labelledby": "diagnostic-composer-title", children: _jsxs("div", { className: "max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-white/15 bg-slate-50 shadow-2xl", children: [_jsxs("header", { className: "relative overflow-hidden rounded-t-[28px] bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 px-5 py-6 text-white sm:px-7", children: [_jsx("div", { className: "absolute -right-16 -top-20 h-60 w-60 rounded-full bg-cyan-400/15 blur-3xl", "aria-hidden": "true" }), _jsxs("div", { className: "relative flex items-start justify-between gap-5", children: [_jsxs("div", { className: "max-w-3xl", children: [_jsx("span", { className: "inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200", children: "Governed diagnostic composer" }), _jsx("h2", { id: "diagnostic-composer-title", className: "mt-3 text-2xl font-black tracking-tight sm:text-3xl", children: "Prepare a diagnostic" }), _jsx("p", { className: "mt-2 max-w-2xl text-sm leading-6 text-blue-100/80", children: "Choose the teaching group and evidence depth. Brains Heist will prepare a fresh, grade-eligible question set, then open the normal Assignment Wizard with everything already selected for teacher review." })] }), _jsx("button", { type: "button", onClick: onClose, disabled: preparing, "aria-label": "Close diagnostic composer", className: "rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10 disabled:opacity-50", children: "\u2715" })] })] }), _jsxs("div", { className: "grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px]", children: [_jsxs("div", { className: "space-y-5", children: [_jsxs("section", { className: "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm", children: [_jsx("span", { className: "text-xs font-black uppercase tracking-[0.15em] text-cyan-700", children: "1 \u00B7 Teaching group" }), _jsx("h3", { className: "mt-1 text-xl font-black text-slate-950", children: "Who is this diagnostic for?" }), _jsx("select", { value: groupId, disabled: preparing, onChange: (event) => {
                                                setGroupId(event.target.value);
                                                setCapabilities(null);
                                                setQuestionCount(null);
                                                setLoading(true);
                                                setLoadError('');
                                                setError('');
                                            }, className: "mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500", "aria-label": "Choose teaching group", children: sortedGroups.map((group) => (_jsxs("option", { value: group.id, children: [group.schoolSubjectName, " \u00B7 Grade ", group.gradeLevel, " \u00B7 ", group.name, " \u00B7 ", group.studentCount, " students"] }, group.id))) })] }), _jsxs("section", { className: "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm", children: [_jsx("span", { className: "text-xs font-black uppercase tracking-[0.15em] text-violet-700", children: "2 \u00B7 Evidence depth" }), _jsx("h3", { className: "mt-1 text-xl font-black text-slate-950", children: "How much evidence do you need?" }), sortedGroups.length === 0 ? (_jsx("p", { className: "mt-4 text-sm text-slate-600", children: "No teaching groups are available. Ask your school administrator to check your teaching allocation." })) : loadError ? (_jsxs("div", { className: "mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-5", role: "alert", children: [_jsx("strong", { className: "text-sm text-rose-900", children: "Could not check diagnostic availability" }), _jsx("p", { className: "mt-2 text-sm leading-6 text-rose-800", children: loadError }), _jsx("button", { type: "button", onClick: () => { setLoadError(''); setLoading(true); setRetryVersion((value) => value + 1); }, className: "mt-3 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-900", children: "Retry availability check" })] })) : checkingPool ? (_jsxs("div", { className: "py-10 text-center", role: "status", "aria-live": "polite", children: [_jsx("div", { className: "mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600" }), _jsx("p", { className: "mt-3 text-sm font-semibold text-slate-500", children: "Checking the governed question pool\u2026" })] })) : currentCapabilities?.ready ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: currentCapabilities.depths.map((depth) => {
                                                        const selected = depth.questionCount === questionCount;
                                                        return (_jsxs("button", { type: "button", disabled: preparing || !depth.available, onClick: () => setQuestionCount(depth.questionCount), "aria-pressed": selected, className: `relative rounded-2xl border p-4 text-left transition ${selected ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`, children: [depth.recommended ? (_jsx("span", { className: "absolute right-3 top-3 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white", children: "Recommended" })) : null, _jsxs("span", { className: "text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700", children: [depth.questionCount, " questions \u00B7 ~", depth.estimatedMinutes, " min"] }), _jsx("strong", { className: "mt-2 block pr-20 text-base text-slate-950", children: depth.name }), _jsx("p", { className: "mt-2 text-xs leading-5 text-slate-500", children: depth.description })] }, depth.questionCount));
                                                    }) }), _jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl bg-slate-50 p-4", children: [_jsx("span", { className: "text-[10px] font-black uppercase tracking-wider text-slate-500", children: "Eligible pool" }), _jsx("strong", { className: "mt-1 block text-2xl text-slate-950", children: currentCapabilities.pool?.eligibleQuestions || 0 })] }), _jsxs("div", { className: "rounded-2xl bg-slate-50 p-4", children: [_jsx("span", { className: "text-[10px] font-black uppercase tracking-wider text-slate-500", children: "Skills represented" }), _jsx("strong", { className: "mt-1 block text-2xl text-slate-950", children: currentCapabilities.pool?.distinctSkills || 0 })] }), _jsxs("div", { className: "rounded-2xl bg-slate-50 p-4", children: [_jsx("span", { className: "text-[10px] font-black uppercase tracking-wider text-slate-500", children: "Not used recently" }), _jsx("strong", { className: "mt-1 block text-2xl text-slate-950", children: currentCapabilities.pool?.notRecentlyUsed || 0 })] })] })] })) : (_jsxs("div", { className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5", children: [_jsx("strong", { className: "text-sm text-amber-900", children: "Diagnostic not ready for this teaching group" }), _jsx("p", { className: "mt-2 text-sm leading-6 text-amber-800", children: reasonCopy(currentCapabilities?.reason) })] }))] })] }), _jsxs("aside", { className: "space-y-4", children: [_jsxs("section", { className: "rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-5", children: [_jsx("span", { className: "text-xs font-black uppercase tracking-[0.15em] text-emerald-700", children: "Quality contract" }), _jsx("h3", { className: "mt-1 text-lg font-black text-slate-950", children: "Prepared, not auto-published" }), _jsxs("div", { className: "mt-4 space-y-3 text-xs leading-5 text-slate-700", children: [_jsxs("p", { children: [_jsx("strong", { className: "text-slate-950", children: "\u2713 Verified only." }), " Current Brains Heist governed questions for the exact subject and grade."] }), _jsxs("p", { children: [_jsx("strong", { className: "text-slate-950", children: "\u2713 Fresh form." }), " Questions used by this teaching group in the last 90 days are deprioritized where alternatives exist."] }), _jsxs("p", { children: [_jsx("strong", { className: "text-slate-950", children: "\u2713 Broad coverage." }), " Each available depth must pass minimum skill and difficulty diversity before Brains Heist offers it."] }), _jsxs("p", { children: [_jsx("strong", { className: "text-slate-950", children: "\u2713 Balanced answer positions." }), " A/B/C/D ordering is materialized safely in the assignment snapshot without changing canonical content."] }), _jsxs("p", { children: [_jsx("strong", { className: "text-slate-950", children: "\u2713 Teacher remains in control." }), " The next screen is the normal Assignment Wizard, not an automatic publish action."] })] })] }), selectedGroup && selectedDepth ? (_jsxs("section", { className: "rounded-3xl border border-blue-200 bg-blue-950 p-5 text-white", children: [_jsx("span", { className: "text-xs font-black uppercase tracking-[0.15em] text-blue-300", children: "Next" }), _jsxs("strong", { className: "mt-2 block text-base", children: [selectedGroup.schoolSubjectName, " \u00B7 ", selectedGroup.name] }), _jsxs("p", { className: "mt-2 text-xs leading-5 text-blue-100/80", children: ["Prepare ", selectedDepth.questionCount, " questions, then review the exact questions, title, instructions, due date, scheduling, and student notification settings in Assignment Wizard."] })] })) : null, error ? (_jsxs("div", { className: "rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800", role: "alert", children: [_jsx("strong", { className: "block", children: "Could not continue" }), error] })) : null, _jsx("button", { type: "button", onClick: () => void handlePrepare(), disabled: preparing || checkingPool || !!loadError || !currentCapabilities?.ready || !selectedDepth?.available, className: "w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50", children: preparing ? 'Preparing governed form…' : 'Prepare in Assignment Wizard →' })] })] })] }) }));
};
// A new opening starts a fresh request lifecycle; a response from a closed
// dialog can never reopen the wizard or overwrite another prepared form.
const DiagnosticComposer = (props) => props.open
    ? _jsx(DiagnosticComposerDialog, { ...props }, `${props.schoolId}:${props.initialGroupId || ''}`)
    : null;
export default DiagnosticComposer;
